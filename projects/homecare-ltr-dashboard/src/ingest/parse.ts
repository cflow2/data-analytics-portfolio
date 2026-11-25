/**
 * Pure parsing pipeline (runs inside the Web Worker; also called directly by tests).
 * workbook bytes → sheets → detected kind/header row → canonical records (redacted) + validation report.
 */
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { fiscalMonth, fiscalQuarter, fiscalWeek, fiscalWeekInYear, weekEnd, weekStart } from '@/lib/fiscal';
import { expectedScore100 } from '@/lib/ltr';
import { normalizeRegion, normalizeStoreNo } from '@/domain/geo';
import { ATTRIBUTES } from '@/domain/attributes';
import type {
  AppointmentRecord, AttributeKey, AttributeWeekly, FollowUpRecord, SubscriptionSnapshot, SubscriptionWeek, OriginalText, StoreRecord, SurveyRecord, SurveySource,
} from '@/domain/types';
import { addDays, diffDays, monthDay, todayISO, weekday, type ISODate } from '@/lib/dates';
import {
  cellText, cleanComment, hashString, normalizeApptId, isBlank, normalizeHeader, parseDateCell, parseNumber, parseScore, textKey,
} from './normalize';
import { ATTR_FIELDS, ATTR_FIELD_KEYS, SPEC_BY_KIND, detectCandidates, matchFields, type Candidate } from './specs';
import { redact, knownNamesRule, type RedactionRule } from './redact';
import { classifyInsight } from './followup';
import type { BuildResult, MedalliaRange, ParsedFile, ParseRequest, ValidationReport } from './types';

export interface Sheet { name: string; rows: unknown[][] }

/** A workbook read once; rows are converted lazily (head rows for detection, full rows only for sheets we use). */
export interface Book { names: string[]; head: (name: string, n: number) => unknown[][]; rows: (name: string) => unknown[][] }

export function openBook(name: string, buffer: ArrayBuffer): Book {
  if (/\.(csv|txt)$/i.test(name)) {
    const text = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');
    const rows = Papa.parse<unknown[]>(text, { skipEmptyLines: false }).data as unknown[][];
    return { names: ['CSV'], head: (_n, k) => rows.slice(0, k), rows: () => rows };
  }
  // cellText/cellNF off: the app reads raw values only; formatting every cell as text took ~80% of the read on big exports.
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', dense: true, cellDates: false, cellHTML: false, cellFormula: false, cellStyles: false, cellText: false, cellNF: false });
  const cache = new Map<string, unknown[][]>();
  const conv = (sn: string, range?: number) => {
    const ws = wb.Sheets[sn];
    if (!ws || !ws['!ref']) return [];
    const opts: XLSX.Sheet2JSONOpts = { header: 1, raw: true, defval: null, blankrows: true };
    if (range !== undefined) {
      const r = XLSX.utils.decode_range(ws['!ref']);
      r.e.r = Math.min(r.e.r, r.s.r + range - 1);
      r.e.c = Math.min(r.e.c, r.s.c + 400); // header detection never needs more than 400 columns
      opts.range = r;
    }
    return XLSX.utils.sheet_to_json<unknown[]>(ws, opts);
  };
  return {
    names: wb.SheetNames.filter((sn) => wb.Sheets[sn]),
    head: (sn, n) => cache.get(sn)?.slice(0, n) ?? conv(sn, n),
    rows: (sn) => { if (!cache.has(sn)) cache.set(sn, conv(sn)); return cache.get(sn)!; },
  };
}

/** All sheets, fully converted (used by tests and small files). */
export function readSheets(name: string, buffer: ArrayBuffer): Sheet[] {
  const book = openBook(name, buffer);
  return book.names.map((n) => ({ name: n, rows: book.rows(n) }));
}

// ───────────────────────── helpers ─────────────────────────
function newReport(kind: ValidationReport['kind']): ValidationReport {
  return { kind, rowsRead: 0, rowsKept: 0, dropped: {}, weeks: {}, redactions: {}, redactionUncertain: 0, warnings: [], info: [] };
}

/** Compare the Tracker's own "Fiscal Calendar" sheet (WE-Date | FY | FQ | FM | FW) with the app's calendar. */
export function checkFiscalCalendar(rows: unknown[][], fyStart: ISODate): { checked: number; mismatches: string[] } | null {
  const hi = rows.findIndex((r) => r && r.some((c) => normalizeHeader(c) === 'fw') && r.some((c) => normalizeHeader(c) === 'fq'));
  if (hi < 0) return null;
  const h = rows[hi].map(normalizeHeader);
  const col = (n: string) => h.indexOf(n);
  const iD = h.findIndex((x) => /date/.test(x)), iY = col('fy'), iQ = col('fq'), iM = col('fm'), iW = col('fw');
  if (iD < 0 || iW < 0) return null;
  const body = rows.slice(hi + 1).filter((r) => r && !isBlank(r[iW]));
  const fw1 = body.find((r) => parseNumber(r[iW]) === 1 && parseDateCell(r[iD]) === fyStart);
  const fy = fw1 && iY >= 0 ? cellText(fw1[iY]) : null;
  const target = body.filter((r) => (fy !== null ? cellText(r[iY]) === fy : true));
  const mismatches: string[] = [];
  for (const r of target) {
    const fw = parseNumber(r[iW]);
    if (!fw || fw < 1 || fw > 52) continue;
    const d = parseDateCell(r[iD]);
    if (d && d !== weekStart(fw, fyStart) && d !== weekEnd(fw, fyStart)) mismatches.push(`FW${fw}: sheet date ${d}, app ${weekStart(fw, fyStart)}`);
    if (iQ >= 0 && parseNumber(r[iQ]) !== fiscalQuarter(fw)) mismatches.push(`FW${fw}: sheet FQ ${cellText(r[iQ])}, app Q${fiscalQuarter(fw)}`);
    if (iM >= 0 && parseNumber(r[iM]) !== fiscalMonth(fw)) mismatches.push(`FW${fw}: sheet FM ${cellText(r[iM])}, app M${fiscalMonth(fw)}`);
  }
  return fy === null && !target.length ? null : { checked: target.length, mismatches };
}
const drop = (r: ValidationReport, reason: string) => { r.dropped[reason] = (r.dropped[reason] ?? 0) + 1; };
function trackDate(r: ValidationReport, d: ISODate, fw: number) {
  r.weeks[fw] = (r.weeks[fw] ?? 0) + 1;
  if (!r.dateRange) r.dateRange = [d, d];
  else { if (d < r.dateRange[0]) r.dateRange[0] = d; if (d > r.dateRange[1]) r.dateRange[1] = d; }
}

interface StoreInfo { name: string; city: string; state: string; region: string }

interface Ctx {
  /** Store name/city/state seen in the Tracker's "Store" column. */
  storeInfo?: Map<string, StoreInfo>;
  fileName: string;
  fyStart: ISODate;
  rules: RedactionRule[];
  salt: string;
  originals: OriginalText[];
  report: ValidationReport;
}

function doRedact(ctx: Ctx, recordId: string, field: OriginalText['field'], raw: string): { text: string; uncertain: boolean } {
  if (!raw) return { text: '', uncertain: false };
  const res = redact(raw, ctx.rules);
  for (const [k, v] of Object.entries(res.hits)) ctx.report.redactions[k] = (ctx.report.redactions[k] ?? 0) + v;
  if (res.uncertain) ctx.report.redactionUncertain++;
  if (res.text !== raw || res.uncertain) ctx.originals.push({ recordId, field, text: raw });
  return res;
}

const rowIsBlank = (row: unknown[] | undefined) => !row || row.every(isBlank);
/** Rows where only formula/helper columns are filled (e.g. FW/FQ/FP dragged down) are not data. */
const noContent = (row: unknown[], map: Record<string, number>, keys: string[]) => keys.every((k) => !(k in map) || isBlank(row[map[k]]));

/** "2968 - LOWE'S OF CARROLLTON, GA" → Carrollton, GA */
export function parseStoreName(raw: string): { name: string; city: string; state: string } {
  const name = raw.replace(/^\s*\d+\s*-\s*/, '').trim();
  const rest = name.replace(/^LOWE['’]?S\s+(OF\s+)?/i, '').trim();
  const m = /^(.*?),\s*([A-Za-z]{2})\.?\s*$/.exec(rest);
  const title = (x: string) => x.toLowerCase().replace(/(^|[\s.\-/])([a-z])/g, (_, a, b) => a + b.toUpperCase()).trim();
  return m ? { name, city: title(m[1]), state: m[2].toUpperCase() } : { name, city: title(rest.replace(/,$/, '')), state: '' };
}
const get = (row: unknown[], map: Record<string, number>, key: string): unknown => (key in map ? row[map[key]] : undefined);

/** Shared date → fiscal-week step; returns null (and records why) when the row must be dropped. */
function dateAndWeek(ctx: Ctx, raw: unknown): { date: ISODate; fw: number } | null {
  const date = parseDateCell(raw);
  if (!date) { drop(ctx.report, isBlank(raw) ? 'Missing date' : 'Unreadable date'); return null; }
  const fw = fiscalWeekInYear(date, ctx.fyStart);
  if (fw === null) { drop(ctx.report, 'Date outside the fiscal year'); return null; }
  return { date, fw };
}

// ───────────────────────── builders ─────────────────────────
function buildSurveys(ctx: Ctx, rows: unknown[][], map: Record<string, number>, source: SurveySource): SurveyRecord[] {
  const out: SurveyRecord[] = [];
  const seen = new Set<string>();
  const occurrence = new Map<string, number>();
  const r = ctx.report;
  r.scoreMismatches = [];
  r.fwMismatches = 0;
  r.noScore = 0;
  for (const row of rows) {
    if (rowIsBlank(row) || noContent(row, map, ['surveyId', 'ltr', 'comment'])) continue;
    r.rowsRead++;
    const dw = dateAndWeek(ctx, get(row, map, 'date'));
    if (!dw) continue;
    const ltr = parseScore(get(row, map, 'ltr'));
    const rawComment = cleanComment(get(row, map, 'comment'));
    if (ltr === null && !rawComment) { drop(r, 'No valid score and no comment'); continue; }
    if (ltr === null) r.noScore++;
    const storeNo = normalizeStoreNo(get(row, map, 'storeNo'));
    const givenId = cellText(get(row, map, 'surveyId'));
    // Without a survey ID, identical rows are different surveys: number them by occurrence (stable on re-upload).
    let id = givenId;
    if (!id) {
      const base = `${source}-${hashString(`${dw.date}|${storeNo}|${ltr}|${textKey(rawComment)}`)}`;
      const n = (occurrence.get(base) ?? 0) + 1;
      occurrence.set(base, n);
      id = n === 1 ? base : `${base}-${n}`;
    }
    if (seen.has(id)) { drop(r, 'Duplicate survey ID in file'); continue; }
    seen.add(id);
    const { text, uncertain } = doRedact(ctx, id, 'comment', rawComment);
    const rec: SurveyRecord = {
      id, source, fw: dw.fw, date: dw.date, storeNo, region: normalizeRegion(get(row, map, 'region')),
      ltr, comment: text, sourceFile: ctx.fileName,
    };
    if (ctx.storeInfo && 'storeName' in map && !ctx.storeInfo.has(storeNo)) {
      const sn = cellText(get(row, map, 'storeName'));
      if (sn) ctx.storeInfo.set(storeNo, { ...parseStoreName(sn), region: rec.region });
    }
    const division = cellText(get(row, map, 'division')).toUpperCase();
    if (division) rec.division = division;
    const topics = cellText(get(row, map, 'topics'));
    if (topics) rec.topics = topics.split(/,\s*(?=[A-Z][^,]* - )/).map((x) => x.trim()).filter(Boolean);
    const market = cellText(get(row, map, 'market'));
    if (market) rec.market = market;
    const appt = cellText(get(row, map, 'appointmentId'));
    if (appt) rec.appointmentId = appt;
    if (uncertain) rec.redactionUncertain = true;
    if ('score100' in map) {
      const sc = parseNumber(get(row, map, 'score100'));
      rec.score100 = sc;
      if (sc !== null && ltr !== null && sc !== expectedScore100(ltr)) r.scoreMismatches.push({ id, ltr, score100: sc });
    }
    if ('fw' in map) {
      const given = parseNumber(get(row, map, 'fw'));
      if (given !== null && given !== dw.fw) r.fwMismatches++;
    }
    const attrs: Partial<Record<AttributeKey, number>> = {};
    for (const k of ATTR_FIELD_KEYS) {
      if (!(k in map)) continue;
      const v = parseScore(get(row, map, k));
      if (v !== null) attrs[k] = v;
    }
    if (Object.keys(attrs).length) rec.attrs = attrs;
    trackDate(r, dw.date, dw.fw);
    r.rowsKept++;
    out.push(rec);
  }
  return out;
}

function buildFollowups(baseCtx: Ctx, rows: unknown[][], map: Record<string, number>): FollowUpRecord[] {
  const out: FollowUpRecord[] = [];
  // Names this file lists (SM column) are redacted wherever they appear in comments and insights.
  const known = knownNamesRule(rows.filter((x) => !rowIsBlank(x)).map((x) => cellText(get(x, map, 'sm'))));
  const ctx: Ctx = known ? { ...baseCtx, rules: [...baseCtx.rules, known] } : baseCtx;
  const r = ctx.report;
  const seen = new Set<string>();
  let fqMismatch = 0, fpMismatch = 0;
  const fqExample: string[] = [];
  for (const row of rows) {
    if (rowIsBlank(row) || noContent(row, map, ['score', 'storeNo', 'insights', 'comment'])) continue;
    r.rowsRead++;
    const dw = dateAndWeek(ctx, get(row, map, 'date'));
    if (!dw) continue;
    const storeNo = normalizeStoreNo(get(row, map, 'storeNo'));
    const score = parseScore(get(row, map, 'score'));
    const rawComment = cleanComment(get(row, map, 'comment'));
    const rawInsights = cellText(get(row, map, 'insights'));
    const fq = parseNumber(get(row, map, 'fq')), fp = parseNumber(get(row, map, 'fp'));
    if (fq !== null && fq !== fiscalQuarter(dw.fw)) { fqMismatch++; if (fqExample.length < 1) fqExample.push(`FW${dw.fw}: file FQ ${fq}, calendar Q${fiscalQuarter(dw.fw)}`); }
    if (fp !== null && fp !== fiscalMonth(dw.fw)) fpMismatch++;
    const id = `fu-${hashString(`${dw.date}|${storeNo}|${score}|${textKey(rawComment)}`)}`;
    if (seen.has(id)) { drop(r, 'Duplicate row'); continue; }
    seen.add(id);
    const c = doRedact(ctx, id, 'comment', rawComment);
    const i = doRedact(ctx, id, 'insights', rawInsights);
    const givenFw = parseNumber(get(row, map, 'fw'));
    if (givenFw !== null && givenFw !== dw.fw) r.fwMismatches = (r.fwMismatches ?? 0) + 1;
    const rec: FollowUpRecord = {
      id, date: dw.date, fw: dw.fw, score, comment: c.text, storeNo, sm: cellText(get(row, map, 'sm')),
      insights: i.text, region: normalizeRegion(get(row, map, 'region')), status: classifyInsight(rawInsights),
      sourceFile: ctx.fileName,
    };
    if (c.uncertain || i.uncertain) rec.redactionUncertain = true;
    trackDate(r, dw.date, dw.fw);
    r.rowsKept++;
    out.push(rec);
  }
  if (fqMismatch) r.warnings.push(`FQ column differs from the fiscal calendar on ${fqMismatch} row(s) (${fqExample[0]}). The calendar (quarter = ceil(FW ÷ 13)) was used.`);
  if (fpMismatch) r.warnings.push(`FP column differs from the fiscal calendar's month on ${fpMismatch} row(s). The calendar was used.`);
  return out;
}

/** Export timestamp in the file name ("data - 2026-11-25T102510.873.xlsx") → ISO date-time, if present. */
export function exportStamp(name: string): { date: ISODate; iso: string } | null {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/.exec(name);
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, iso: `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}` };
}

function buildSubscriptions(ctx: Ctx, rows: unknown[][], map: Record<string, number>, today: ISODate): { weeks: SubscriptionWeek[]; snapshot: SubscriptionSnapshot | null } {
  const r = ctx.report;
  const num = (row: unknown[], k: string) => parseNumber(get(row, map, k)) ?? 0;
  const stamp = exportStamp(ctx.fileName);
  const exportDate = stamp?.date ?? today;
  const defaultFy = Number(exportDate.slice(0, 4));
  const out = new Map<string, SubscriptionWeek>();
  for (const row of rows) {
    if (rowIsBlank(row)) continue;
    const wk = /(\d{1,2})/.exec(cellText(get(row, map, 'week')));
    const store = normalizeStoreNo(get(row, map, 'storeNo'));
    if (!wk && /applied filters/i.test(row.map((c) => cellText(c)).join(' '))) continue; // Looker filter note
    r.rowsRead++;
    if (!wk) { drop(r, 'No fiscal week'); continue; }
    if (!store) { drop(r, 'No store'); continue; }
    const fw = Number(wk[1]);
    if (fw < 1 || fw > 53) { drop(r, 'Fiscal week out of range'); continue; }
    const fy = parseNumber(get(row, map, 'fy')) ?? defaultFy;
    const id = `${fy}:${fw}:${store}`;
    const rec: SubscriptionWeek = {
      id, fy, fw, storeNo: store, storeName: cellText(get(row, map, 'storeName')), storeSet: cellText(get(row, map, 'storeSet')),
      division: cellText(get(row, map, 'division')).toUpperCase(), region: normalizeRegion(cellText(get(row, map, 'region'))) || '',
      district: cellText(get(row, map, 'district')).replace(/\.0+$/, ''),
      subs: num(row, 'subs'), online: num(row, 'online'), instore: num(row, 'instore'), revenue: num(row, 'revenue'),
      appts: num(row, 'appts'), regular: num(row, 'regular'), assessments: num(row, 'assessments'), followUps: num(row, 'followUps'),
      exceptions: num(row, 'exceptions'), followUpRequired: num(row, 'followUpRequired'), sourceFile: ctx.fileName,
    };
    if (out.has(id)) { drop(r, 'Duplicate store-week row'); continue; }
    out.set(id, rec);
    r.weeks[fw] = (r.weeks[fw] ?? 0) + 1;
    r.rowsKept++;
  }
  const weeks = [...out.values()];
  if (!weeks.length) return { weeks, snapshot: null };
  const fy = Math.max(...weeks.map((w) => w.fy));
  const fw = Math.max(...weeks.filter((w) => w.fy === fy).map((w) => w.fw));
  const pick = (f: number) => Object.fromEntries(weeks.filter((w) => w.fy === fy && w.fw === f && (w.subs || w.instore)).map((w) => [w.storeNo, [w.subs, w.instore] as [number, number]]));
  const through = addDays(exportDate, -1);
  const snapshot: SubscriptionSnapshot = { id: stamp?.iso ?? `${today}T00:00:00`, through, fy, fw, cur: pick(fw), prior: pick(fw - 1), sourceFile: ctx.fileName };
  const sum = (m: Record<string, [number, number]>, i: 0 | 1) => Object.values(m).reduce((a, v) => a + v[i], 0);
  (r.info ??= []).push(`FY${fy} FW1–FW${fw}: ${weeks.length.toLocaleString('en-US')} store-weeks, ${new Set(weeks.map((w) => w.storeNo)).size.toLocaleString('en-US')} stores. FW${fw} to date: ${sum(snapshot.cur, 0).toLocaleString('en-US')} net subscriptions (${sum(snapshot.cur, 1)} in store), treated as data through ${through}${stamp ? ' (the day before the export time in the file name)' : ' (yesterday; the file name has no export time)'}.`);
  const neg = weeks.filter((w) => w.subs < 0).length;
  if (neg) r.info!.push(`${neg} store-week(s) have negative net subscriptions (cancellations/refunds exceeded sales).`);
  return { weeks, snapshot };
}

function buildAppointments(ctx: Ctx, rows: unknown[][], map: Record<string, number>): AppointmentRecord[] {
  const out = new Map<string, AppointmentRecord>();
  const r = ctx.report;
  let conflicts = 0;
  for (const row of rows) {
    if (rowIsBlank(row)) continue;
    r.rowsRead++;
    const id = normalizeApptId(get(row, map, 'appointmentId'));
    const associate = cellText(get(row, map, 'associate')).replace(/\s+/g, ' ').trim();
    if (!id) { drop(r, 'No Appointment ID'); continue; }
    if (!associate) { drop(r, 'No associate'); continue; }
    const rec: AppointmentRecord = { id, associate, sourceFile: ctx.fileName };
    const job = cellText(get(row, map, 'jobId')).trim();
    if (job) rec.jobId = job;
    const store = normalizeStoreNo(get(row, map, 'storeNo'));
    if (store) rec.storeNo = store;
    const rawDate = get(row, map, 'date');
    const date = isBlank(rawDate) ? null : parseDateCell(rawDate);
    if (date) { rec.date = date; const fw = fiscalWeekInYear(date, ctx.fyStart); if (fw !== null) { rec.fw = fw; trackDate(r, date, fw); } }
    const prev = out.get(id);
    if (prev && prev.associate !== associate) { conflicts++; continue; } // first row wins; reported below
    if (!prev) r.rowsKept++;
    out.set(id, rec);
  }
  const names = new Set([...out.values()].map((a) => a.associate));
  (r.info ??= []).push(`${out.size.toLocaleString('en-US')} appointment(s), ${names.size} associate(s). Surveys are linked by Appointment ID.`);
  if (conflicts) r.warnings.push(`${conflicts} appointment ID(s) list more than one associate; the first one listed was kept.`);
  return [...out.values()];
}

function buildStores(ctx: Ctx, rows: unknown[][], map: Record<string, number>, countRows = true): StoreRecord[] {
  const out = new Map<string, StoreRecord>();
  for (const row of rows) {
    if (rowIsBlank(row)) continue;
    if (countRows) ctx.report.rowsRead++;
    const storeNo = normalizeStoreNo(get(row, map, 'storeNo'));
    if (!/^\d{4}$/.test(storeNo)) { if (countRows) drop(ctx.report, 'Not a store number'); continue; }
    const district = cellText(get(row, map, 'district'));
    out.set(storeNo, {
      storeNo, name: cellText(get(row, map, 'storeName')), city: cellText(get(row, map, 'city')),
      state: cellText(get(row, map, 'state')).toUpperCase(), district: district || null,
      region: normalizeRegion(get(row, map, 'region')),
    });
    if (countRows) ctx.report.rowsKept++;
  }
  return [...out.values()];
}

function attributeKeyFor(label: string): AttributeKey | null {
  const n = normalizeHeader(label);
  for (const f of ATTR_FIELDS) {
    if (f.aliases.includes(n) || f.contains?.some((g) => g.every((t) => n.includes(t)))) return f.key as AttributeKey;
  }
  const exact = ATTRIBUTES.find((a) => normalizeHeader(a.label) === n);
  return exact?.key ?? null;
}

function pct(v: unknown): number | null {
  const n = parseNumber(v);
  if (n === null) return null;
  return n <= 1 && !String(v).includes('%') ? n * 100 : n;
}

function buildAnalyticsLong(ctx: Ctx, rows: unknown[][], map: Record<string, number>): AttributeWeekly[] {
  const out = new Map<string, AttributeWeekly>();
  for (const row of rows) {
    if (rowIsBlank(row)) continue;
    ctx.report.rowsRead++;
    const fwRaw = cellText(get(row, map, 'fw'));
    const fw = parseNumber(fwRaw.replace(/^fw\s*#?/i, ''));
    const attr = attributeKeyFor(cellText(get(row, map, 'attribute')));
    const p = pct(get(row, map, 'pct'));
    if (!fw || fw < 1 || fw > 52) { drop(ctx.report, 'Missing fiscal week'); continue; }
    if (!attr) { drop(ctx.report, 'Not one of the nine attributes'); continue; }
    if (p === null) { drop(ctx.report, 'Missing top-2-box %'); continue; }
    const n = parseNumber(get(row, map, 'n')) ?? 0;
    out.set(`${fw}:${attr}`, { id: `${fw}:${attr}`, fw, attr, pct: p, n, top2: Math.round((p / 100) * n), sourceFile: ctx.fileName });
    ctx.report.weeks[fw] = (ctx.report.weeks[fw] ?? 0) + 1;
    ctx.report.rowsKept++;
  }
  return [...out.values()];
}

// ───────── Medallia Analytics (wide): one row per measure, one column per day or week ─────────
const DAY_HEADER = /^\s*(\d{1,2})\s+(sat|sun|mon|tue|wed|thu|fri)[a-z]*\.?\s*$/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_HEADER = /^\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s,'-]+(\d{4}|\d{2})\s*$/i;
/** “Week of 07/26”, “Week of\n07/26/2026”, “Week ending 08/01” */
const WEEK_OF_HEADER = /^\s*week\s+(of|ending|beginning|starting)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*$/i;
const DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

interface PeriodCol {
  col: number; fw: number; date?: ISODate;
  /** month columns span several weeks: used for the range total only */ end?: ISODate; month?: boolean;
  /** a whole 7-day week column ("Week of 07/26"); `offset` = days it starts after the fiscal week (Medallia Sun–Sat = 1) */
  week?: boolean; offset?: number;
}
interface WideLayout {
  sheet: Sheet;
  headerIndex: number;
  periods: PeriodCol[];
  totalCol: number | null;
  anchorNote?: string;
}

/** Export timestamp in the file name, e.g. "Analytics - 2026-11-23T114201.994.xlsx". */
function dateFromFileName(name: string): ISODate | null {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(name);
  return m ? parseDateCell(`${m[1]}-${m[2]}-${m[3]}`) : null;
}

/**
 * Resolve period columns. Day headers ("14 Sat") carry no month/year: date them as the most recent matching
 * day on or before the export date (file name timestamp, else today), then step forward one day per column.
 */
export function resolvePeriodColumns(header: unknown[], refDate: ISODate, fyStart: ISODate): { periods: PeriodCol[]; totalCol: number | null; anchorNote?: string } {
  let prevWeek: ISODate | null = null;
  const periods: PeriodCol[] = [];
  let totalCol: number | null = null;
  let prev: ISODate | null = null;
  let anchorNote: string | undefined;
  header.forEach((cell, col) => {
    const t = cellText(cell);
    if (!t) return;
    if (/^total$/i.test(t)) { totalCol = col; return; }
    const fwm = /^\s*fw\s*#?\s*(\d{1,2})\s*$/i.exec(t);
    if (fwm) { periods.push({ col, fw: Number(fwm[1]) }); return; }
    const dm = DAY_HEADER.exec(t);
    if (dm) {
      const day = Number(dm[1]);
      const dow = DOW[dm[2].slice(0, 3).toLowerCase()];
      let d: ISODate | null = null;
      if (prev) {
        for (let k = 1; k <= 31 && !d; k++) { const c = addDays(prev, k); if (Number(c.slice(8)) === day && weekday(c) === dow) d = c; }
      } else {
        for (let k = 0; k <= 400 && !d; k++) { const c = addDays(refDate, -k); if (Number(c.slice(8)) === day && weekday(c) === dow) d = c; }
        if (d) anchorNote = `Day columns have no month or year; dated from ${monthDay(refDate)}, ${refDate.slice(0, 4)}, so “${t}” = ${monthDay(d)}, ${d.slice(0, 4)}.`;
      }
      if (d) { periods.push({ col, fw: fiscalWeek(d, fyStart), date: d }); prev = d; }
      return;
    }
    const wo = WEEK_OF_HEADER.exec(t);
    if (wo) {
      // No year: the first column is the latest such date on or before the export date; later columns move forward.
      const md = `${wo[2].padStart(2, '0')}-${wo[3].padStart(2, '0')}`;
      const inYear = (y: number) => `${y}-${md}`;
      const d: ISODate | null = wo[4] ? parseDateCell(inYear(wo[4].length === 2 ? 2000 + Number(wo[4]) : Number(wo[4])))
        : prevWeek ? (inYear(Number(prevWeek.slice(0, 4))) >= prevWeek ? inYear(Number(prevWeek.slice(0, 4))) : inYear(Number(prevWeek.slice(0, 4)) + 1))
          : inYear(Number(refDate.slice(0, 4))) <= refDate ? inYear(Number(refDate.slice(0, 4))) : inYear(Number(refDate.slice(0, 4)) - 1);
      if (!d) return;
      const start = /ending/i.test(wo[1]) ? addDays(d, -6) : d;
      // Assign to the fiscal week holding most of its days (its middle day); Medallia's Sun–Sat weeks overlap 6 of 7.
      const fw = fiscalWeek(addDays(start, 3), fyStart);
      const offset = diffDays(start, weekStart(fw, fyStart));
      periods.push({ col, fw, date: start, end: addDays(start, 6), week: true, offset });
      prevWeek = d;
      return;
    }
    const mm = MONTH_HEADER.exec(t);
    if (mm) {
      const mi = MONTHS.indexOf(mm[1].slice(0, 3).toLowerCase());
      const yr = mm[2].length === 2 ? 2000 + Number(mm[2]) : Number(mm[2]);
      const first = `${yr}-${String(mi + 1).padStart(2, '0')}-01`;
      const next = mi === 11 ? `${yr + 1}-01-01` : `${yr}-${String(mi + 2).padStart(2, '0')}-01`;
      periods.push({ col, fw: fiscalWeek(first, fyStart), date: first, end: addDays(next, -1), month: true });
      return;
    }
    const asDate = typeof cell === 'number' ? parseDateCell(cell) : parseDateCell(t.replace(/^week (of|ending)\s*/i, ''));
    if (asDate) periods.push({ col, fw: fiscalWeek(asDate, fyStart), date: asDate });
  });
  return { periods, totalCol, anchorNote };
}

function rowLabel(row: unknown[]): string {
  const c = row.find((x) => typeof x === 'string' && x.trim() !== '');
  return c ? String(c) : '';
}

function detectWideAnalytics(sheets: Sheet[], name: string, today: ISODate, fyStart: ISODate): WideLayout | null {
  const ref = dateFromFileName(name) ?? today;
  for (const sheet of sheets) {
    for (let r = 0; r < Math.min(15, sheet.rows.length); r++) {
      const { periods, totalCol, anchorNote } = resolvePeriodColumns(sheet.rows[r] ?? [], ref, fyStart);
      if (!periods.length) continue;
      const attrRows = sheet.rows.slice(r + 1, r + 40).filter((rw) => rw && attributeKeyFor(rowLabel(rw)));
      if (attrRows.length >= 3) return { sheet, headerIndex: r, periods, totalCol, anchorNote };
    }
  }
  return null;
}

function buildAnalyticsWide(ctx: Ctx, w: WideLayout): { aw: AttributeWeekly[]; range: MedalliaRange | null } {
  const body = w.sheet.rows.slice(w.headerIndex + 1);
  const sizeRow = body.find((r) => r && /sample size|^n$|responses/i.test(rowLabel(r)));
  const size = (col: number) => (sizeRow ? parseNumber(sizeRow[col]) : null);
  const measures: { attr: AttributeKey | 'ltr'; row: unknown[] }[] = [];
  for (const row of body) {
    if (!row || row === sizeRow) continue;
    const label = rowLabel(row);
    const hasNumbers = w.periods.some((p) => parseNumber(row[p.col]) !== null);
    if (!label || !hasNumbers) continue; // section headers like "Drivers of LTR"
    ctx.report.rowsRead++;
    const attr: AttributeKey | 'ltr' | null = /likelihood to recommend|^ltr\b/i.test(label) ? 'ltr' : attributeKeyFor(label);
    if (!attr) { drop(ctx.report, `Not one of the nine attributes (“${label}”)`); continue; }
    measures.push({ attr, row });
    ctx.report.rowsKept++;
  }
  // Values are 0–100 unless every value in the row is a fraction (0–1).
  const scaleOf = (row: unknown[]) => {
    const vals = w.periods.map((p) => parseNumber(row[p.col])).filter((v): v is number => v !== null);
    return vals.length && vals.every((v) => v <= 1) && !w.periods.some((p) => String(row[p.col] ?? '').includes('%')) ? 100 : 1;
  };
  const weeks = [...new Set(w.periods.filter((p) => !p.month).map((p) => p.fw))].filter((fw) => fw >= 1 && fw <= 52);
  const out: AttributeWeekly[] = [];
  const totalMismatch: string[] = [];
  for (const fw of weeks) {
    const cols = w.periods.filter((p) => p.fw === fw && !p.month);
    const n = sizeRow ? cols.reduce((a, p) => a + (size(p.col) ?? 0), 0) : 0;
    for (const m of measures) {
      const scale = scaleOf(m.row);
      // Weighted by each day's Sample Size (this reproduces Medallia's own Total column).
      let num = 0, den = 0;
      for (const p of cols) {
        const v = parseNumber(m.row[p.col]);
        if (v === null) continue;
        const wgt = sizeRow ? size(p.col) ?? 0 : 1;
        if (wgt <= 0) continue;
        num += v * scale * wgt; den += wgt;
      }
      if (!den) continue;
      const pctV = num / den;
      out.push({ id: `${fw}:${m.attr}`, fw, attr: m.attr, pct: pctV, n, top2: Math.round((pctV / 100) * n), nApprox: true, sourceFile: ctx.fileName });
      ctx.report.weeks[fw] = (ctx.report.weeks[fw] ?? 0) + 1;
      if (weeks.length === 1 && w.totalCol !== null && cols.length === w.periods.length) {
        const total = parseNumber(m.row[w.totalCol]);
        if (total !== null && Math.abs(total * scale - pctV) > 0.15) totalMismatch.push(`${m.attr} (file Total ${total}, computed ${pctV.toFixed(1)})`);
      }
    }
  }
  const dates = w.periods.flatMap((p) => [p.date, p.end]).filter((d): d is ISODate => !!d).sort();
  if (dates.length) ctx.report.dateRange = [dates[0], dates[dates.length - 1]];
  // Whole-range LTR: Medallia's Total column when present, else Sample-Size-weighted across every column.
  let range: MedalliaRange | null = null;
  const ltrRow = measures.find((m) => m.attr === 'ltr')?.row;
  const fwsAll = w.periods.flatMap((p) => [p.fw, ...(p.end && p.month ? [fiscalWeek(p.end, ctx.fyStart)] : [])]).filter((fw) => fw >= 1 && fw <= 52);
  if (ltrRow && fwsAll.length && (w.periods.length > 7 || w.periods.some((p) => p.month) || new Set(fwsAll).size > 1)) {
    const scale = scaleOf(ltrRow);
    const total = w.totalCol !== null ? parseNumber(ltrRow[w.totalCol]) : null;
    const nTotal = sizeRow ? (w.totalCol !== null ? size(w.totalCol) : null) ?? w.periods.reduce((a, p) => a + (size(p.col) ?? 0), 0) : null;
    let num = 0, den = 0;
    for (const p of w.periods) { const v = parseNumber(ltrRow[p.col]); const wgt = sizeRow ? size(p.col) ?? 0 : 1; if (v !== null && wgt > 0) { num += v * scale * wgt; den += wgt; } }
    const ltr = total !== null ? total * scale : den ? num / den : null;
    if (ltr !== null) {
      const fwFrom = Math.min(...fwsAll), fwTo = Math.max(...fwsAll);
      const last = [...w.periods].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).at(-1);
      range = { id: `${fwFrom}-${fwTo}`, fwFrom, fwTo, from: dates[0], to: dates[dates.length - 1], ltr, n: nTotal, basis: total !== null ? 'total' : 'computed', sourceFile: ctx.fileName,
        ...(last?.month ? { openEnd: { lastStartFw: last.fw } } : {}) };
      (ctx.report.info ??= []).push(`Whole-range LTR FW${fwFrom}–FW${fwTo}: ${ltr.toFixed(2)}%${nTotal !== null ? ` on ${nTotal.toLocaleString('en-US')} surveys` : ''} (${range.basis === 'total' ? 'from the Total column' : 'weighted by Sample Size'}). The LTR Slide uses it as YTD when it starts at the beginning of the fiscal year.`);
    }
  }
  const outside = w.periods.filter((p) => p.fw < 1 || p.fw > 52).length;
  if (outside) drop(ctx.report, 'Column outside the fiscal year');
  if (w.anchorNote) ctx.report.warnings.push(w.anchorNote);
  const weekCols = w.periods.filter((p) => p.week);
  if (weekCols.length) {
    const fmt = (p: PeriodCol) => `${monthDay(p.date!)} → FW${p.fw}`;
    (ctx.report.info ??= []).push(`“Week of” columns mapped to fiscal weeks: ${weekCols.length > 6 ? `${fmt(weekCols[0])}, ${fmt(weekCols[1])} … ${fmt(weekCols[weekCols.length - 1])}` : weekCols.map(fmt).join(', ')}.`);
    const off = weekCols.find((p) => p.offset);
    if (off) ctx.report.warnings.push(`Medallia's weeks start ${off.offset! > 0 ? `${off.offset} day${off.offset === 1 ? '' : 's'} after` : `${-off.offset!} day${off.offset === -1 ? '' : 's'} before`} the fiscal week (fiscal weeks run Sat–Fri). Each “Week of” column was assigned to the fiscal week sharing most of its days (${7 - Math.abs(off.offset!)} of 7), so weekly values can differ slightly from fiscal-week totals. For exact fiscal weeks, export the Analytics report split by day.`);
    const lastCol = weekCols[weekCols.length - 1];
    const ref = dateFromFileName(ctx.fileName);
    if (ref && lastCol.end! >= ref) ctx.report.warnings.push(`The last column (week of ${monthDay(lastCol.date!)}, FW${lastCol.fw}) was still in progress when exported, so it covers only part of the week.`);
  }
  if (weeks.length > 1 || w.periods.some((p) => p.date)) {
    const isDay = (p: PeriodCol) => !!p.date && !p.week && !p.month;
    const partial = weeks.filter((fw) => w.periods.some((p) => p.fw === fw && isDay(p)) && w.periods.filter((p) => p.fw === fw && isDay(p)).length < 7);
    if (partial.length) ctx.report.warnings.push(`Partial week(s) in this export: ${partial.map((x) => `FW${x}`).join(', ')}. Values cover only the days present.`);
  }
  if (!sizeRow) ctx.report.warnings.push('No Sample Size row: days are weighted equally and n is unknown.');
  else ctx.report.warnings.push('n per attribute is Medallia’s survey Sample Size (the export has no per-question count).');
  if (totalMismatch.length) ctx.report.warnings.push(`Computed weekly values differ from the file’s Total column: ${totalMismatch.join('; ')}.`);
  return { aw: out, range };
}

// ───────────────────────── entry point ─────────────────────────
export function parseFile(req: ParseRequest): ParsedFile {
  const t0 = performance.now();
  const base: ParsedFile = { fileId: req.fileId, name: req.name, size: req.buffer.byteLength, sheets: [], candidate: null, headers: [], ms: 0 };
  try {
    // Read once; detect from the top rows of each sheet; fully convert only the sheets we use.
    const book = openBook(req.name, req.buffer);
    const sheets: Sheet[] = book.names.map((n) => ({ name: n, rows: book.head(n, 60) }));
    base.sheets = book.names;
    let cand: Candidate | null = null;
    if (req.force) {
      const sheet = sheets.find((s) => s.name === req.force!.sheet) ?? sheets[0];
      const { map, missing } = matchFields(sheet.rows[req.force.headerIndex] ?? [], SPEC_BY_KIND[req.force.kind], req.force.mapping);
      cand = { kind: req.force.kind, sheet: sheet.name, headerIndex: req.force.headerIndex, map, missing, score: 0 };
    } else {
      cand = detectCandidates(req.name, sheets, req.remembered)[0] ?? null;
      const wide = detectWideAnalytics(sheets, req.name, req.today ?? todayISO(), req.fyStart);
      if (wide && (!cand || cand.missing.length > 0)) {
        const report = newReport('medallia-analytics');
        const ctx: Ctx = { fileName: req.name, fyStart: req.fyStart, rules: req.rules, salt: req.salt, originals: [], report };
        const { aw, range } = buildAnalyticsWide(ctx, wide);
        return {
          ...base,
          candidate: { kind: 'medallia-analytics', sheet: wide.sheet.name, headerIndex: wide.headerIndex, map: {}, missing: [], score: 99 },
          headers: (wide.sheet.rows[wide.headerIndex] ?? []).map(cellText),
          build: { kind: 'medallia-analytics', surveys: [], followups: [], stores: [], attributeWeekly: aw, originals: [], report, medalliaRange: range },
          ms: performance.now() - t0,
        };
      }
    }
    if (!cand) return { ...base, error: 'Could not recognise this file. None of the sheets has the expected columns.', ms: performance.now() - t0 };
    base.candidate = cand;
    base.headers = (sheets.find((s) => s.name === cand!.sheet)!.rows[cand.headerIndex] ?? []).map(cellText);
    if (cand.missing.length) return { ...base, ms: performance.now() - t0 };

    // A Tracker carries large irrelevant hidden sheets: convert only the ones we use.
    const TRACKER_EXTRA = /servicing selling stores|region divi|^detractors$|fiscal calendar/i;
    const wanted = [cand.sheet, ...(cand.kind === 'tracker' ? base.sheets.filter((n) => n !== cand!.sheet && TRACKER_EXTRA.test(n.trim())) : [])];
    const full: Sheet[] = wanted.map((n) => ({ name: n, rows: book.rows(n) }));
    const sheet = full.find((s) => s.name === cand!.sheet)!;

    const report = newReport(cand.kind);
    const ctx: Ctx = { fileName: req.name, fyStart: req.fyStart, rules: req.rules, salt: req.salt, originals: [], report };
    const body = sheet.rows.slice(cand.headerIndex + 1);
    const result: BuildResult = { kind: cand.kind, surveys: [], followups: [], stores: [], attributeWeekly: [], originals: ctx.originals, report };
    switch (cand.kind) {
      case 'tracker': {
        ctx.storeInfo = new Map();
        result.surveys = buildSurveys(ctx, body, cand.map, 'tracker');
        // Store→district from the Tracker's own sheets, when they carry it.
        for (const s of full) {
          if (!/servicing selling stores|region divi/i.test(s.name)) continue;
          const c = detectCandidates('', [s], req.remembered).find((x) => x.kind === 'store-map' && x.missing.length === 0);
          if (c) result.stores.push(...buildStores(ctx, s.rows.slice(c.headerIndex + 1), c.map, false));
        }
        report.storesFromSheets = result.stores.length;
        // Add name/city/state from the Export Data "Store" column; stores missing from the mapping stay unmapped.
        const byNo = new Map(result.stores.map((x) => [x.storeNo, x]));
        for (const [no, info] of ctx.storeInfo) {
          const st = byNo.get(no);
          if (st) Object.assign(st, { name: info.name, city: info.city, state: info.state, region: st.region || info.region });
          else result.stores.push({ storeNo: no, name: info.name, city: info.city, state: info.state, district: null, region: info.region });
        }
        const cal = full.find((x) => /^fiscal calendar$/i.test(x.name.trim()));
        const calCheck = cal ? checkFiscalCalendar(cal.rows, req.fyStart) : null;
        if (calCheck) {
          if (calCheck.mismatches.length) report.warnings.push(`“Fiscal Calendar” sheet disagrees with the app on ${calCheck.mismatches.length} item(s): ${calCheck.mismatches.slice(0, 4).join('; ')}.`);
          else report.info!.push(`“Fiscal Calendar” sheet matches the app’s calendar for all ${calCheck.checked} weeks of this fiscal year (dates, FQ, FM).`);
        }
        if (!report.storesFromSheets) report.warnings.push('No store→district mapping found in the Tracker’s “Servicing Selling Stores” / “Region Divison” sheets. Upload a mapping CSV.');
        // SM follow-up notes on the Tracker's "Detractors" sheet
        const det = full.find((s) => /^detractors$/i.test(s.name.trim()));
        if (det) {
          const c = detectCandidates('', [det], req.remembered).find((x) => x.kind === 'followup' && x.missing.length === 0);
          if (c) {
            const sub: Ctx = { ...ctx, report: newReport('followup') };
            result.followups = buildFollowups(sub, det.rows.slice(c.headerIndex + 1), c.map);
            for (const [k, n] of Object.entries(sub.report.redactions)) report.redactions[k] = (report.redactions[k] ?? 0) + n;
            report.redactionUncertain += sub.report.redactionUncertain;
            report.info!.push(`“Detractors” sheet: ${sub.report.rowsKept} SM follow-up row(s) read.`);
            const subDrops = Object.entries(sub.report.dropped);
            if (subDrops.length) report.warnings.push(`“Detractors” sheet: dropped ${subDrops.map(([k, n]) => `${n} (${k.toLowerCase()})`).join(', ')}.`);
            report.warnings.push(...sub.report.warnings.map((w) => `“Detractors” sheet: ${w}`));
          }
        }
        break;
      }
      case 'medallia-responses': result.surveys = buildSurveys(ctx, body, cand.map, 'medallia'); break;
      case 'commentary': result.surveys = buildSurveys(ctx, body, cand.map, 'commentary'); break;
      case 'followup': result.followups = buildFollowups(ctx, body, cand.map); break;
      case 'store-map': result.stores = buildStores(ctx, body, cand.map); break;
      case 'appointments': result.appointments = buildAppointments(ctx, body, cand.map); break;
      case 'subscriptions': { const s = buildSubscriptions(ctx, body, cand.map, req.today ?? todayISO()); result.subscriptionWeeks = s.weeks; result.subscriptionSnapshot = s.snapshot; break; }
      case 'medallia-analytics': result.attributeWeekly = buildAnalyticsLong(ctx, body, cand.map); break;
    }
    if (report.rowsKept === 0) report.warnings.push('No usable rows were found under the header row.');
    return { ...base, build: result, ms: performance.now() - t0 };
  } catch (e) {
    return { ...base, error: `Could not read this file: ${(e as Error).message}`, ms: performance.now() - t0 };
  }
}


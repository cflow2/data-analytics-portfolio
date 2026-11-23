/**
 * Pure parsing pipeline (runs inside the Web Worker; also called directly by tests).
 * workbook bytes → sheets → detected kind/header row → canonical records (redacted) + validation report.
 */
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { fiscalWeekInYear } from '@/lib/fiscal';
import { expectedScore100 } from '@/lib/ltr';
import { normalizeRegion, normalizeStoreNo } from '@/domain/geo';
import { ATTRIBUTES } from '@/domain/attributes';
import type {
  AttributeKey, AttributeWeekly, CallRecord, FollowUpRecord, OriginalText, StoreRecord, SurveyRecord, SurveySource,
} from '@/domain/types';
import type { ISODate } from '@/lib/dates';
import {
  cellText, cleanCaseNo, hashString, isBlank, normalizeHeader, parseDateCell, parseNumber, parseScore, textKey,
} from './normalize';
import { ATTR_FIELD_KEYS, SPEC_BY_KIND, detectCandidates, matchFields, type Candidate } from './specs';
import { redact, extractPhones, type RedactionRule } from './redact';
import { driverMapping, isAssociateDriver, normalizeDriver, storeFromNotes } from './drivers';
import { classifyInsight } from './followup';
import type { BuildResult, ParsedFile, ParseRequest, ValidationReport } from './types';

export interface Sheet { name: string; rows: unknown[][] }

export function readSheets(name: string, buffer: ArrayBuffer): Sheet[] {
  if (/\.(csv|txt)$/i.test(name)) {
    const text = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');
    const res = Papa.parse<unknown[]>(text, { skipEmptyLines: false });
    return [{ name: 'CSV', rows: res.data as unknown[][] }];
  }
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', dense: true, cellDates: false, cellHTML: false, cellFormula: false, cellStyles: false });
  return wb.SheetNames.map((sn) => ({
    name: sn,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: true }),
  }));
}

// ───────────────────────── helpers ─────────────────────────
function newReport(kind: ValidationReport['kind']): ValidationReport {
  return { kind, rowsRead: 0, rowsKept: 0, dropped: {}, weeks: {}, redactions: {}, redactionUncertain: 0, warnings: [] };
}
const drop = (r: ValidationReport, reason: string) => { r.dropped[reason] = (r.dropped[reason] ?? 0) + 1; };
function trackDate(r: ValidationReport, d: ISODate, fw: number) {
  r.weeks[fw] = (r.weeks[fw] ?? 0) + 1;
  if (!r.dateRange) r.dateRange = [d, d];
  else { if (d < r.dateRange[0]) r.dateRange[0] = d; if (d > r.dateRange[1]) r.dateRange[1] = d; }
}

interface Ctx {
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
    if (rowIsBlank(row)) continue;
    r.rowsRead++;
    const dw = dateAndWeek(ctx, get(row, map, 'date'));
    if (!dw) continue;
    const ltr = parseScore(get(row, map, 'ltr'));
    const rawComment = cellText(get(row, map, 'comment'));
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

function buildCalls(ctx: Ctx, rows: unknown[][], map: Record<string, number>): CallRecord[] {
  const out: CallRecord[] = [];
  const seen = new Set<string>();
  const r = ctx.report;
  const drivers: string[] = [];
  let duplicateRows = 0;
  for (const row of rows) {
    if (rowIsBlank(row)) continue;
    r.rowsRead++;
    const dw = dateAndWeek(ctx, get(row, map, 'date'));
    if (!dw) continue;
    const caseNo = cleanCaseNo(get(row, map, 'caseNo'));
    const driver = cellText(get(row, map, 'driver')).replace(/\s+/g, ' ');
    const rawNotes = cellText(get(row, map, 'notes'));
    if (!caseNo && !rawNotes) { drop(r, 'No Case # and no notes'); continue; }
    const id = `call-${hashString(`${caseNo}|${dw.date}|${driver}|${rawNotes}`)}`;
    if (seen.has(id)) { duplicateRows++; drop(r, 'Exact duplicate row'); continue; }
    seen.add(id);
    const driverNorm = normalizeDriver(driver);
    drivers.push(driver);
    const phones = extractPhones(rawNotes);
    const { text, uncertain } = doRedact(ctx, id, 'notes', rawNotes);
    const rec: CallRecord = {
      id, fw: dw.fw, date: dw.date, driver, driverNorm, caseNo, notes: text,
      isAssociate: isAssociateDriver(driverNorm), sourceFile: ctx.fileName,
    };
    const store = storeFromNotes(rawNotes);
    if (store) rec.storeNo = store;
    if (phones.length) rec.phoneHash = hashString(`${ctx.salt}|${phones[0]}`);
    if (uncertain) rec.redactionUncertain = true;
    trackDate(r, dw.date, dw.fw);
    r.rowsKept++;
    out.push(rec);
  }
  const customer = out.filter((c) => !c.isAssociate);
  const distinct = new Set(customer.map((c) => c.caseNo)).size;
  r.duplicates = { duplicateRows, repeatCaseRows: customer.length - distinct, distinctCases: distinct };
  r.associateCalls = out.length - customer.length;
  r.driverMapping = driverMapping(drivers);
  return out;
}

function buildFollowups(ctx: Ctx, rows: unknown[][], map: Record<string, number>): FollowUpRecord[] {
  const out: FollowUpRecord[] = [];
  const r = ctx.report;
  const seen = new Set<string>();
  for (const row of rows) {
    if (rowIsBlank(row)) continue;
    r.rowsRead++;
    const dw = dateAndWeek(ctx, get(row, map, 'date'));
    if (!dw) continue;
    const storeNo = normalizeStoreNo(get(row, map, 'storeNo'));
    const score = parseScore(get(row, map, 'score'));
    const rawComment = cellText(get(row, map, 'comment'));
    const rawInsights = cellText(get(row, map, 'insights'));
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
  return out;
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
  for (const f of SPEC_BY_KIND.tracker.fields) {
    if (!(ATTR_FIELD_KEYS as string[]).includes(f.key)) continue;
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

/** Wide analytics layout: one row per attribute, one column per week ("FW40"). */
function detectWideAnalytics(sheets: Sheet[]): { sheet: Sheet; headerIndex: number; weekCols: [number, number][] } | null {
  for (const sheet of sheets) {
    for (let r = 0; r < Math.min(15, sheet.rows.length); r++) {
      const row = sheet.rows[r] ?? [];
      const weekCols = row.map((c, i) => [i, /^\s*fw\s*#?\s*(\d{1,2})\s*$/i.exec(String(c ?? ''))?.[1]] as const)
        .filter(([, m]) => m).map(([i, m]) => [i, Number(m)] as [number, number]);
      if (!weekCols.length) continue;
      const attrRows = sheet.rows.slice(r + 1, r + 30).filter((rw) => rw && rw.some((c) => typeof c === 'string' && attributeKeyFor(c)));
      if (attrRows.length >= 3) return { sheet, headerIndex: r, weekCols };
    }
  }
  return null;
}

function buildAnalyticsWide(ctx: Ctx, wide: NonNullable<ReturnType<typeof detectWideAnalytics>>): AttributeWeekly[] {
  const out: AttributeWeekly[] = [];
  for (const row of wide.sheet.rows.slice(wide.headerIndex + 1)) {
    if (rowIsBlank(row)) continue;
    ctx.report.rowsRead++;
    const labelCell = row.find((c) => typeof c === 'string' && attributeKeyFor(c));
    const attr = labelCell ? attributeKeyFor(String(labelCell)) : null;
    if (!attr) { drop(ctx.report, 'Not one of the nine attributes'); continue; }
    for (const [col, fw] of wide.weekCols) {
      const p = pct(row[col]);
      if (p === null) continue;
      out.push({ id: `${fw}:${attr}`, fw, attr, pct: p, n: 0, top2: 0, sourceFile: ctx.fileName });
      ctx.report.weeks[fw] = (ctx.report.weeks[fw] ?? 0) + 1;
    }
    ctx.report.rowsKept++;
  }
  ctx.report.warnings.push('This analytics layout has no n column; attribute n will show as unknown.');
  return out;
}

// ───────────────────────── entry point ─────────────────────────
export function parseFile(req: ParseRequest): ParsedFile {
  const t0 = performance.now();
  const base: ParsedFile = { fileId: req.fileId, name: req.name, size: req.buffer.byteLength, sheets: [], candidate: null, headers: [], ms: 0 };
  try {
    const sheets = readSheets(req.name, req.buffer);
    base.sheets = sheets.map((s) => s.name);
    let cand: Candidate | null = null;
    if (req.force) {
      const sheet = sheets.find((s) => s.name === req.force!.sheet) ?? sheets[0];
      const { map, missing } = matchFields(sheet.rows[req.force.headerIndex] ?? [], SPEC_BY_KIND[req.force.kind], req.force.mapping);
      cand = { kind: req.force.kind, sheet: sheet.name, headerIndex: req.force.headerIndex, map, missing, score: 0 };
    } else {
      cand = detectCandidates(req.name, sheets, req.remembered)[0] ?? null;
      const wide = detectWideAnalytics(sheets);
      if (wide && (!cand || cand.missing.length > 0)) {
        const report = newReport('medallia-analytics');
        const ctx: Ctx = { fileName: req.name, fyStart: req.fyStart, rules: req.rules, salt: req.salt, originals: [], report };
        const aw = buildAnalyticsWide(ctx, wide);
        return {
          ...base,
          candidate: { kind: 'medallia-analytics', sheet: wide.sheet.name, headerIndex: wide.headerIndex, map: {}, missing: [], score: 99 },
          headers: (wide.sheet.rows[wide.headerIndex] ?? []).map(cellText),
          build: { kind: 'medallia-analytics', surveys: [], calls: [], followups: [], stores: [], attributeWeekly: aw, originals: [], report },
          ms: performance.now() - t0,
        };
      }
    }
    if (!cand) return { ...base, error: 'Could not recognise this file. None of the sheets has the expected columns.', ms: performance.now() - t0 };
    const sheet = sheets.find((s) => s.name === cand!.sheet)!;
    base.candidate = cand;
    base.headers = (sheet.rows[cand.headerIndex] ?? []).map(cellText);
    if (cand.missing.length) return { ...base, ms: performance.now() - t0 };

    const report = newReport(cand.kind);
    const ctx: Ctx = { fileName: req.name, fyStart: req.fyStart, rules: req.rules, salt: req.salt, originals: [], report };
    const body = sheet.rows.slice(cand.headerIndex + 1);
    const result: BuildResult = { kind: cand.kind, surveys: [], calls: [], followups: [], stores: [], attributeWeekly: [], originals: ctx.originals, report };
    switch (cand.kind) {
      case 'tracker': {
        result.surveys = buildSurveys(ctx, body, cand.map, 'tracker');
        // Store→district from the Tracker's own sheets, when they carry it.
        for (const s of sheets) {
          if (!/servicing selling stores|region divi/i.test(s.name)) continue;
          const c = detectCandidates('', [s], req.remembered).find((x) => x.kind === 'store-map' && x.missing.length === 0);
          if (c) result.stores.push(...buildStores(ctx, s.rows.slice(c.headerIndex + 1), c.map, false));
        }
        report.storesFromSheets = result.stores.length;
        if (!result.stores.length) report.warnings.push('No store→district mapping found in the Tracker’s “Servicing Selling Stores” / “Region Divison” sheets. Upload a mapping CSV.');
        // SM follow-up notes on the Tracker's "Detractors" sheet
        const det = sheets.find((s) => /^detractors$/i.test(s.name.trim()));
        if (det) {
          const c = detectCandidates('', [det], req.remembered).find((x) => x.kind === 'followup' && x.missing.length === 0);
          if (c) {
            const sub: Ctx = { ...ctx, report: newReport('followup') };
            result.followups = buildFollowups(sub, det.rows.slice(c.headerIndex + 1), c.map);
          }
        }
        break;
      }
      case 'medallia-responses': result.surveys = buildSurveys(ctx, body, cand.map, 'medallia'); break;
      case 'commentary': result.surveys = buildSurveys(ctx, body, cand.map, 'commentary'); break;
      case 'loyalty-cases': result.calls = buildCalls(ctx, body, cand.map); break;
      case 'followup': result.followups = buildFollowups(ctx, body, cand.map); break;
      case 'store-map': result.stores = buildStores(ctx, body, cand.map); break;
      case 'medallia-analytics': result.attributeWeekly = buildAnalyticsLong(ctx, body, cand.map); break;
    }
    if (report.rowsKept === 0) report.warnings.push('No usable rows were found under the header row.');
    return { ...base, build: result, ms: performance.now() - t0 };
  } catch (e) {
    return { ...base, error: `Could not read this file: ${(e as Error).message}`, ms: performance.now() - t0 };
  }
}

/** Calls are imported one fiscal week at a time. Default: the selected week if present, else the busiest week. */
export function defaultTargetWeek(weeks: Record<number, number>, selected?: number): number | undefined {
  const entries = Object.entries(weeks).map(([w, n]) => [Number(w), n] as const);
  if (!entries.length) return undefined;
  if (selected && weeks[selected]) return selected;
  return entries.sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}


/**
 * DEMO source files, shaped like the real exports (and as messy): Tracker header on row 3 with ~300 columns,
 * Medallia exports, Customer Commentary and the detractor follow-up file.
 * Used by the parser tests and offered on the Data Manager so the uploader can be tried end to end.
 */
import * as XLSX from 'xlsx';
import { dayNumber, addDays, type ISODate } from '@/lib/dates';
import { weekStart, fiscalMonth, fiscalQuarter, weekEnd } from '@/lib/fiscal';
import { ATTRIBUTES } from '@/domain/attributes';
import type { SurveyRecord } from '@/domain/types';
import { generateDemoData, type DemoData } from './generate';

export interface DemoFile { name: string; data: ArrayBuffer }

const serial = (d: ISODate) => dayNumber(d) + 25569;
const dateCell = (d: ISODate): XLSX.CellObject => ({ t: 'n', v: serial(d), z: 'm/d/yyyy' });
const usDate = (d: ISODate) => { const [y, m, dd] = d.split('-'); return `${+m}/${+dd}/${y}`; };

function book(sheets: [string, unknown[][]][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;
  return out;
}

const COMMENT_HC = 'Please provide any additional feedback about the MyLowe’s Rewards HomeCare+ subscription';

/** Tracker "Export Data": two title rows, header on row 3, ~300 columns (most irrelevant). */
export function trackerAoa(surveys: SurveyRecord[], opts: { columns?: number; mismatchIds?: string[] } = {}): unknown[][] {
  const real = ['Surveyid for internal use (e.g. RI link)', 'Lowe’s Region', 'Lowe’s Market', 'Store #', 'Date Only', 'Appointment ID', 'Likelihood to Recommend', 'Score', 'FW #', COMMENT_HC];
  const total = opts.columns ?? 300;
  const headers: string[] = [];
  const pos: Record<string, number> = {};
  let r = 0;
  for (let i = 0; i < total; i++) {
    // Scatter the real columns among filler columns.
    if (r < real.length && i === 3 + r * 29) { pos[real[r]] = i; headers.push(real[r++]); }
    else headers.push(`Q${i} DEMO filler question ${i}`);
  }
  const mismatch = new Set(opts.mismatchIds ?? []);
  const rows: unknown[][] = [['HomeCare+ LTR Tracker — DEMO (synthetic)'], ['Exported for DEMO use only'], headers];
  for (const s of surveys) {
    const row: unknown[] = new Array(total).fill(null);
    row[pos[real[0]]] = s.id;
    row[pos[real[1]]] = `Region ${s.region.slice(1)}`;
    row[pos[real[2]]] = s.market ?? null;
    row[pos[real[3]]] = Number(s.storeNo);
    row[pos[real[4]]] = dateCell(s.date);
    row[pos[real[5]]] = s.appointmentId ?? null;
    row[pos[real[6]]] = s.ltr;
    row[pos[real[7]]] = mismatch.has(s.id) ? (s.ltr! >= 9 ? 0 : 100) : s.ltr! >= 9 ? 100 : 0;
    row[pos[real[8]]] = s.fw;
    row[pos[real[9]]] = s.comment || null;
    rows.push(row);
  }
  return rows;
}

export function demoFiles(d: DemoData = generateDemoData()): DemoFile[] {
  const files: DemoFile[] = [];
  const tracked = d.surveys.filter((s) => s.fw <= 41);

  // 1. LTR Tracker
  const stores = d.stores;
  files.push({
    name: 'LTR_Tracker_FW40_DEMO.xlsx',
    data: book([
      ['Export Data', trackerAoa(tracked, { mismatchIds: [tracked.find((s) => s.fw === 40 && s.ltr === 10)!.id] })],
      ['Fiscal Calendar', [['FW', 'Start', 'End', 'FM', 'FQ'], ...Array.from({ length: 52 }, (_, i) => [i + 1, dateCell(weekStart(i + 1)), dateCell(weekEnd(i + 1)), fiscalMonth(i + 1), fiscalQuarter(i + 1)])]],
      ['Servicing Selling Stores', [['Store #', 'Store Name', 'City', 'State', 'District', 'Region'], ...stores.map((s) => [Number(s.storeNo), s.name, s.city, s.state, s.district ?? '', s.region])]],
      ['Region Divison', [['Region', 'Division'], ...[...new Set(stores.map((s) => s.region))].map((r, i) => [r, `DEMO Division ${(i % 3) + 1}`])]],
      ['Detractors', [['LL', 'Score', 'Comment', 'Store', 'SM', 'Insights', 'Region', 'FW', 'FQ', 'FP'],
        ...d.followups.filter((f) => f.fw < 40).map((f) => [dateCell(f.date), f.score, f.comment, Number(f.storeNo), f.sm, f.insights, f.region, f.fw, fiscalQuarter(f.fw), fiscalMonth(f.fw)])]],
    ]),
  });

  // 2. Medallia Responses export (header on row 2, attributes, no survey id)
  const med = d.surveys.filter((s) => s.fw >= 38 && s.fw <= 40);
  files.push({
    name: 'HomeCare_Responses_Export_DEMO.xlsx',
    data: book([['Responses', [
      ['Medallia Responses Export — DEMO'],
      ['Response Date', 'Store #', 'Region', 'Likelihood to Recommend', 'Comments', ...ATTRIBUTES.map((a) => a.label)],
      ...med.map((s) => [usDate(s.date), s.storeNo, s.region, s.ltr, s.comment || null, ...ATTRIBUTES.map((a) => s.attrs?.[a.key] ?? null)]),
    ]]]),
  });

  // 3. Medallia Analytics driver report — real layout: FW40 split by days, labels as Medallia shows them.
  const MEDALLIA_LABEL: Record<string, string> = {
    value: 'Project Value', scheduling: 'Ease of Scheduling Your Project', quality: 'Project Quality',
    timeToAppt: 'Amount of Time It Took to Complete Your Project', processPrior: 'Ease of Process',
    overall: 'The Overall HomeCare+ Subscription', craftsmanship: 'Craftsmanship', professionalism: 'Professionalism', knowledge: 'Knowledge',
  };
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(40), i));
  const dayHdr = (d: ISODate) => `${+d.slice(8)} ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(d + 'T12:00:00Z').getUTCDay()]}`;
  const onDay = (d: ISODate) => d40.filter((x) => x.date === d);
  const d40 = d.surveys.filter((x) => x.fw === 40);
  const t2b = (vals: (number | undefined | null)[]) => { const v = vals.filter((x): x is number => typeof x === 'number'); return v.length ? Number(((100 * v.filter((x) => x >= 9).length) / v.length).toFixed(5)) : null; };
  const measureRow = (label: string, pick: (x: SurveyRecord) => number | null | undefined) =>
    [label, ...days.map((day) => t2b(onDay(day).map(pick))), t2b(d40.map(pick)), 100];
  files.push({
    name: 'Analytics - 2026-11-09T101500.000.xlsx',
    data: book([['Sheet0', [
      [null, ...days.map(dayHdr), 'Total', 'Benchmark'],
      ['Sample Size', ...days.map((day) => onDay(day).length), d40.length, 1],
      measureRow('Likelihood to Recommend (LTR)', (x) => x.ltr),
      [],
      ['Drivers of LTR'],
      ...ATTRIBUTES.filter((a) => !['craftsmanship', 'professionalism', 'knowledge'].includes(a.key)).map((a) => measureRow(MEDALLIA_LABEL[a.key], (x) => x.attrs?.[a.key])),
      [],
      ['HomeCare+ Associate'],
      ...['craftsmanship', 'professionalism', 'knowledge'].map((k) => measureRow(MEDALLIA_LABEL[k], (x) => x.attrs?.[k as keyof NonNullable<SurveyRecord['attrs']>])),
    ]]]),
  });

  // 4. Customer Commentary (header on row 2)
  files.push({
    name: 'Customer_Commentary_DEMO.xlsx',
    data: book([['Commentary', [['Customer Commentary — DEMO'], ['date', 'score', 'comment'],
      ...d.surveys.filter((s) => s.fw === 40 && s.comment).map((s) => [usDate(s.date), s.ltr, s.comment])]]]),
  });

  // 5. Detractor follow-up file for FW40
  files.push({
    name: 'FW40_DEMO.xlsx',
    data: book([['FW40', [['LL', 'Score', 'Comment', 'Store', 'SM', 'Insights', 'Region', 'FW', 'FQ', 'FP'],
      ...d.followups.filter((f) => f.fw === 40).map((f) => [dateCell(f.date), f.score, f.comment, Number(f.storeNo), f.sm, f.insights, f.region, 40, 4, 10])]]]),
  });

  // 7. Store → District mapping CSV
  const csv = ['Store #,Store Name,City,State,District,Region', ...stores.map((s) => [s.storeNo, s.name, s.city, s.state, s.district ?? '', s.region].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
  files.push({ name: 'Store_District_Map_DEMO.csv', data: new TextEncoder().encode(csv).buffer as ArrayBuffer });

  return files;
}

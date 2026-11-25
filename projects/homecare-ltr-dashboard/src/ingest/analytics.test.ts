import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { DEFAULT_FY_START } from '@/lib/fiscal';
import { parseFile, resolvePeriodColumns } from './parse';
import { DEFAULT_REDACTION_RULES } from './redact';
import type { ParseRequest } from './types';

/** The real Medallia Analytics export (FW42, 11/14–11/20/26, split by days), transcribed from a screenshot. */
const REAL: unknown[][] = [
  [null, '14 Sat', '15 Sun', '16 Mon', '17 Tue', '18 Wed', '19 Thu', '20 Fri', 'Total', 'Benchmark'],
  ['Sample Size', 43, 12, 2, 42, 32, 50, 43, 224, 1],
  ['Likelihood to Recommend (LTR)', 93.0233, 75, 100, 95.238, 90.625, 92, 93.02326, 92, 100],
  [],
  ['Drivers of LTR'],
  ['Project Value', 95.3488, 83.3333, 100, 85.714, 87.5, 86, 100, 90.6, 100],
  ['Ease of Scheduling Your Project', 90.6977, 66.6667, 50, 85.714, 90.625, 84, 93.02326, 87.1, 100],
  ['Project Quality', 95.3488, 75, 100, 90.476, 90.625, 94, 93.02326, 92, 100],
  ['Amount of Time It Took to Complete Your Project', 93.0233, 83.3333, 50, 90.476, 84.375, 96, 93.02326, 91.1, 100],
  ['Ease of Process', 88.3721, 75, 100, 83.333, 93.75, 86, 93.02326, 87.9, 100],
  ['The Overall HomeCare+ Subscription', 86.0465, 75, 50, 88.095, 84.375, 86, 90.69767, 86.2, 100],
  [],
  ['HomeCare+ Associate'],
  ['Craftsmanship', 95.3488, 66.6667, 100, 97.619, 93.75, 100, 88.37209, 93.8, 100],
  ['Professionalism', 97.6744, 75, 100, 100, 96.875, 100, 97.67442, 97.3, 100],
  ['Knowledge', 95.3488, 75, 100, 97.619, 93.75, 100, 88.37209, 94.2, 100],
];

function file(aoa: unknown[][], sheet = 'Sheet0'): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
const req = (name: string, buffer: ArrayBuffer, today = '2026-11-23'): ParseRequest => ({
  fileId: 'x', name, buffer, fyStart: DEFAULT_FY_START, rules: DEFAULT_REDACTION_RULES, salt: 's', remembered: {}, today,
});

describe('Medallia Analytics export (real layout)', () => {
  const p = parseFile(req('Analytics - 2026-11-23T114201.994.xlsx', file(REAL)));
  const aw = p.build!.attributeWeekly;
  const get = (attr: string) => aw.find((a) => a.attr === attr)!;

  it('is detected and dated to FW42 from the export timestamp', () => {
    expect(p.error).toBeUndefined();
    expect(p.candidate?.kind).toBe('medallia-analytics');
    expect(p.build!.report.dateRange).toEqual(['2026-11-14', '2026-11-20']);
    expect(Object.keys(p.build!.report.weeks)).toEqual(['42']);
    expect(p.build!.report.warnings.join(' ')).toMatch(/dated from Nov 23, 2026/);
  });

  it('maps all nine Medallia labels plus LTR', () => {
    expect(aw.map((a) => a.attr).sort()).toEqual(['craftsmanship', 'knowledge', 'ltr', 'overall', 'processPrior', 'professionalism', 'quality', 'scheduling', 'timeToAppt', 'value']);
    expect(p.build!.report.dropped).toEqual({});
  });

  it('weights days by Sample Size and reproduces Medallia’s Total column', () => {
    const totals: Record<string, number> = { value: 90.6, scheduling: 87.1, quality: 92, timeToAppt: 91.1, processPrior: 87.9, overall: 86.2, craftsmanship: 93.8, professionalism: 97.3, knowledge: 94.2, ltr: 92 };
    for (const [attr, total] of Object.entries(totals)) expect(Math.abs(get(attr).pct - total)).toBeLessThanOrEqual(0.1);
    expect(get('value').pct).toBeCloseTo(90.625, 2);
    expect(get('scheduling').n).toBe(224);
    expect(get('scheduling').nApprox).toBe(true);
    expect(p.build!.report.warnings.join(' ')).not.toMatch(/differ from the file’s Total/);
  });

  it('falls back to today when the file name has no timestamp', () => {
    const q = parseFile(req('Analytics.xlsx', file(REAL), '2026-11-21'));
    expect(Object.keys(q.build!.report.weeks)).toEqual(['42']);
  });

  it('day columns that span two weeks split into two fiscal weeks', () => {
    const { periods } = resolvePeriodColumns([null, '12 Thu', '13 Fri', '14 Sat', '15 Sun'], '2026-11-23', DEFAULT_FY_START);
    expect(periods.map((x) => [x.date, x.fw])).toEqual([['2026-11-12', 41], ['2026-11-13', 41], ['2026-11-14', 42], ['2026-11-15', 42]]);
    const { periods: wrap } = resolvePeriodColumns([null, '31 Sat', '1 Sun'], '2026-11-03', DEFAULT_FY_START);
    expect(wrap.map((x) => x.date)).toEqual(['2026-10-31', '2026-11-01']);
  });
});

describe('Medallia expanded view (YTD)', () => {
  const MONTHS: unknown[][] = [
    [null, 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026', 'Nov 2026', 'Total'],
    ['Sample Size', 300, 350, 380, 400, 420, 410, 390, 370, 400, 209, 3629],
    ['Likelihood to Recommend (LTR)', 93, 94, 93, 92.5, 93.2, 93.8, 92.9, 93.1, 93.4, 91.4, 93.1],
    ['Project Value', 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    ['Professionalism', 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97],
    ['Ease of Process', 88, 88, 88, 88, 88, 88, 88, 88, 88, 88, 88],
  ];
  it('reads the whole-range LTR and Sample Size from the Total column', () => {
    const p = parseFile(req('Analytics - 2026-11-24T090000.000.xlsx', file(MONTHS)));
    const r = p.build!.medalliaRange!;
    expect(r).toMatchObject({ fwFrom: 1, ltr: 93.1, n: 3629, basis: 'total', from: '2026-02-01' });
    expect(r.openEnd).toBeTruthy();
    expect(r.openEnd!.lastStartFw).toBeLessThanOrEqual(41);
    expect(r.fwTo).toBeGreaterThanOrEqual(41);
    // Month columns never become weekly attribute records.
    expect(p.build!.attributeWeekly).toHaveLength(0);
  });
  it('a one-week export has no whole-range value', () => {
    expect(parseFile(req('Analytics - 2026-11-23T114201.994.xlsx', file(REAL))).build!.medalliaRange ?? null).toBeNull();
  });
});

describe('Medallia Analytics split by week (“Week of 07/26” columns)', () => {
  // Transcribed from a screenshot of the real export (first 12 weeks, values rounded as shown).
  const WEEKS = ['07/26', '08/02', '08/09', '08/16', '08/23', '08/30', '09/06', '09/13', '09/20', '09/27', '10/04', '10/11'];
  const aoa: unknown[][] = [
    [null, ...WEEKS.map((w) => `Week of\n${w}`)],
    ['Sample Size', 25, 89, 121, 115, 95, 125, 126, 125, 128, 173, 166, 171],
    ['Likelihood to Recommend (LTR)', 88, 95.50561798, 95.8677686, 92.17391304, 95.78947368, 93.6, 90.47619048, 90.4, 93.75, 90.1734104, 93.37349398, 92.39766082],
    [],
    ['Drivers of LTR'],
    ['Project Value', 88, 94.38202247, 91.73553719, 93.04347826, 93.68421053, 92.8, 87.3015873, 88.8, 89.84375, 89.59537572, 93.37349398, 89.47368421],
    ['Ease of Scheduling Your Project', 88, 88.76404494, 93.38842975, 94.7826087, 92.63157895, 93.6, 86.50793651, 87.2, 86.71875, 85.54913295, 90.36144578, 88.30409357],
    ['Project Quality', 88, 95.50561798, 97.52066116, 96.52173913, 98.94736842, 96, 92.06349206, 92.8, 93.75, 93.06358382, 93.97590361, 95.32163743],
    ['Amount of Time It Took to Complete Your Project', 84, 96.62921348, 94.21487603, 94.7826087, 89.47368421, 94.4, 88.88888889, 90.4, 89.0625, 89.01734104, 91.56626506, 88.88888889],
    ['Ease of Process', 88, 85.39325843, 86.7768595, 82.60869565, 88.42105263, 89.6, 81.74603175, 83.2, 82.03125, 85.54913295, 84.93975904, 90.64327485],
    ['The Overall HomeCare+ Subscription', 88, 89.88764045, 90.90909091, 90.43478261, 90.52631579, 91.2, 83.33333333, 85.6, 87.5, 84.39306358, 91.56626506, 89.47368421],
    [],
    ['HomeCare+ Associate'],
    ['Craftsmanship', 88, 97.75280899, 99.17355372, 97.39130435, 100, 96.8, 93.65079365, 96, 94.53125, 93.6416185, 96.38554217, 95.90643275],
    ['Professionalism', 96, 97.75280899, 99.17355372, 100, 100, 98.4, 97.61904762, 96, 94.53125, 97.10982659, 97.59036145, 97.66081871],
    ['Knowledge', 88, 96.62921348, 99.17355372, 97.39130435, 98.94736842, 96.8, 93.65079365, 96.8, 95.3125, 94.79768786, 96.98795181, 96.49122807],
  ];
  const p = parseFile(req('Analytics - 2026-11-25T181708.000.xlsx', file(aoa)));
  const aw = p.build!.attributeWeekly;
  const get = (fw: number, attr: string) => aw.find((a) => a.fw === fw && a.attr === attr)!;
  it('maps each “Week of” column to the fiscal week sharing 6 of its 7 days', () => {
    expect(p.candidate?.kind).toBe('medallia-analytics');
    expect(Object.keys(p.build!.report.weeks).map(Number)).toEqual([26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37]);
    expect(p.build!.report.dateRange).toEqual(['2026-07-26', '2026-10-17']);
    expect(p.build!.report.warnings.join(' ')).toMatch(/start 1 day after the fiscal week .* \(6 of 7\)/);
    expect(p.build!.report.warnings.join(' ')).not.toMatch(/Partial week/);
    expect(p.build!.report.info!.join(' ')).toMatch(/Jul 26 → FW26/);
  });
  it('keeps every value and sample size', () => {
    expect(get(37, 'scheduling')).toMatchObject({ n: 171 });
    expect(get(37, 'scheduling').pct).toBeCloseTo(88.30409357, 6);
    expect(get(26, 'timeToAppt').pct).toBe(84);
    expect(get(35, 'professionalism').pct).toBeCloseTo(97.10982659, 6);
    expect(get(33, 'ltr')).toMatchObject({ pct: 90.4, n: 125 });
    expect(aw.filter((a) => a.fw === 30)).toHaveLength(10); // LTR + nine attributes
  });
  it('works out the year across New Year and for “Week ending”', () => {
    const r = resolvePeriodColumns([null, 'Week of 12/20', 'Week of 12/27', 'Week of 01/03'], '2027-01-12', DEFAULT_FY_START);
    expect(r.periods.map((x) => x.date)).toEqual(['2026-12-20', '2026-12-27', '2027-01-03']);
    const e = resolvePeriodColumns([null, 'Week ending 11/20'], '2026-11-25', DEFAULT_FY_START);
    expect(e.periods[0]).toMatchObject({ date: '2026-11-14', fw: 42, offset: 0 });
  });
});

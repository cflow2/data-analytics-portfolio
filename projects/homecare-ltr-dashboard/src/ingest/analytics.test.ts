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

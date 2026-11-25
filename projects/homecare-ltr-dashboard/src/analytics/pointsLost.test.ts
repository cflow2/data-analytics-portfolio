import { describe, expect, it } from 'vitest';
import { demoDataset } from '@/test/demoDataset';
import { countsForLtr } from '@/domain/survey';
import { pointsLost, NO_COMMENT } from './pointsLost';

describe('LTR points lost by theme (demo FW40)', () => {
  const ds = demoDataset();
  const wk = (fw: number) => ds.surveys.filter((s) => s.fw === fw && countsForLtr(s));
  const p = pointsLost(wk(40), ds.tags, 93, wk(39));
  it('rows sum to 100 − LTR', () => {
    expect(p.n).toBe(131);
    expect(p.ltr! + p.lost).toBeCloseTo(100, 9);
    expect(p.rows.reduce((a, r) => a + r.count, 0)).toBe(7);
  });
  it('one 0–8 survey on n=131 costs 0.76 pts; exclusions lead', () => {
    expect(p.rows[0]).toMatchObject({ theme: 'exclusions', count: 3 });
    expect(p.rows[0].pts).toBeCloseTo(300 / 131, 9);
    expect(p.rows.find((r) => r.theme === 'appointment')!.count).toBe(2);
    expect(p.rows.every((r) => r.priorPts !== null)).toBe(true);
    expect(p.belowBenchmark).toBe(0);
  });
  it('surveys without a comment get their own row', () => {
    const s = wk(40).find((x) => x.ltr! <= 8)!;
    const q = pointsLost(wk(40).map((x) => (x.id === s.id ? { ...x, comment: '' } : x)), ds.tags, 93);
    expect(q.rows.find((r) => r.theme === NO_COMMENT)!.count).toBe(1);
    expect(q.lost).toBeCloseTo(p.lost, 9);
  });
});

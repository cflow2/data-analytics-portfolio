import { describe, expect, it } from 'vitest';
import { atOrAbove, calloutHeadline, displayWhole, keyDrivers, scoresPhrase, slideMetrics, suggestCallouts, weekStats, DEFAULT_DRIVERS } from './ltrMetrics';
import { fw41Fixture } from './fw41Fixture';

const m = slideMetrics(fw41Fixture(), 41);
const reg = (r: string) => m.regions.find((x) => x.region === r)!;
const div = (d: string) => m.divisions.find((x) => x.division === d)!;

describe('display rounding', () => {
  it('rounds to one decimal then whole, half-up', () => {
    expect(displayWhole(94.49)).toBe(95);
    expect(displayWhole(90.83)).toBe(91);
    expect(displayWhole(92.55)).toBe(93);
    expect(displayWhole(94.44)).toBe(94);
    expect(displayWhole(86.79)).toBe(87);
  });
  it('allowed at 93 is floor(n × 0.07)', () => {
    expect(weekStats(1, Array(218).fill(10)).allowed).toBe(15);
    expect(weekStats(1, Array(100).fill(10)).allowed).toBe(7);
  });
});

describe('FW41 slide values (spec Section 9)', () => {
  it('KPIs', () => {
    expect(m.cur.n).toBe(218);
    expect(m.cur.ltr).toBeCloseTo(90.83, 2);
    expect(m.cur.display).toBe(91);
    expect(m.prior.display).toBe(95);
    expect(m.delta).toBe(-4);
    expect(m.benchDelta).toBe(-2);
    expect(m.regionsAtOrAbove).toBe(6);
    expect(m.regionsWithSurveys).toBe(14);
    expect(m.cur.low08).toBe(20);
    expect(m.cur.allowed).toBe(15);
    expect(m.overAllowance).toBe(5);
  });
  it('promoter / passive / detractor cards', () => {
    expect([m.cur.promoters, m.cur.passives, m.cur.detractors06]).toEqual([198, 11, 9]);
  });
  it('trend: counts and bar colours by unrounded LTR', () => {
    expect(m.trend.map((w) => w.fw)).toEqual([38, 39, 40, 41]);
    expect(m.trend.map((w) => w.n)).toEqual([188, 173, 127, 218]);
    expect(m.trend.map((w) => w.low08)).toEqual([14, 10, 7, 20]);
    expect(m.trend.map((w) => w.display)).toEqual([93, 94, 95, 91]);
    expect(m.trend.map((w) => (atOrAbove(w, 93) ? 'blue' : 'red'))).toEqual(['red', 'blue', 'blue', 'red']);
  });
  it('divisions in SOUTH, WEST, NORTH order', () => {
    expect(m.divisions.map((d) => d.division)).toEqual(['SOUTH', 'WEST', 'NORTH']);
    expect([div('SOUTH').cur.display, div('SOUTH').delta]).toEqual([94, 0]);
    expect([div('WEST').cur.display, div('WEST').delta]).toEqual([89, -3]);
    expect([div('NORTH').cur.display, div('NORTH').delta]).toEqual([87, -10]);
  });
  it('low survey count regions', () => {
    expect(m.regions.filter((r) => r.lowCount).map((r) => r.region)).toEqual(['R7', 'R14', 'R15', 'R18', 'R21']);
  });
  it('region rows', () => {
    expect([reg('R5').cur.display, reg('R5').delta]).toEqual([84, -6]);
    expect(calloutHeadline(reg('R5'))).toBe('R5 · 84 ▼6');
    expect(calloutHeadline(reg('R18'))).toBe('R18 · 63* ▼37');
    expect(reg('R27').cur.display).toBe(95);
  });
});

describe('callouts', () => {
  const c = suggestCallouts(m, fw41Fixture(), new Map());
  it('picks six distinct regions', () => {
    expect(c).toHaveLength(6);
    expect(new Set(c.map((x) => x.region)).size).toBe(6);
  });
  it('leads with the biggest contributor', () => {
    expect(c[0]).toMatchObject({ region: 'R5', slot: 'contributor', why: '5 of 31 surveys were detractors; most of any region' });
    expect(c[1]).toMatchObject({ region: 'R3', slot: 'contributor' });
  });
  it('includes a low-count drop and a bright spot', () => {
    expect(c.find((x) => x.region === 'R18')).toMatchObject({ slot: 'low-count', categories: ['LOW SURVEY COUNT'] });
    expect(c.some((x) => x.slot === 'bright' && x.categories[0] === 'ABOVE BENCHMARK')).toBe(true);
  });
  it('phrases scores', () => {
    expect(scoresPhrase([7, 7])).toBe('two 7s');
    expect(scoresPhrase([3, 7, 7])).toBe('a 3 and two 7s');
    expect(scoresPhrase([8])).toBe('an 8');
  });
});

describe('key drivers', () => {
  it('uses Medallia analytics and sorts high to low', () => {
    const a = [['professionalism', 95.2], ['timeToAppt', 90.8], ['processPrior', 84.1], ['scheduling', 83.6]].map(([attr, pct]) => ({ id: `41:${attr}`, fw: 41, attr, top2: 0, n: 100, pct }));
    const d = keyDrivers(41, DEFAULT_DRIVERS, a as never, []);
    expect(d.map((x) => [x.short, x.display])).toEqual([['Professionalism', 95], ['Complete Time', 91], ['Process', 84], ['Scheduling', 84]]);
  });
});

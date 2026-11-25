import { describe, expect, it } from 'vitest';
import { generateDemoData } from '@/demo/generate';
import { ltrSurveys, byWeek, baseline, periodSeries, poolWeeks, pool, groupByWeek, impact, deltaPts } from './ltr';
import { attributeScores, lowest, groupRange, rangeLabel } from './attributes';
import { themeMentions } from './voc';
import { detractorRows, rootCauseMix, closedLoopText } from './detractors';
import { ltrSummary } from '@/lib/ltr';

const d = generateDemoData();
d.surveys.forEach((s) => (s.source = 'demo'));
const stores = new Map(d.stores.map((s) => [s.storeNo, s]));
const all = ltrSurveys(d.surveys, { region: null, district: null, store: null }, stores);
const m = byWeek(all);
const tagMap = new Map(d.tags.map((t) => [t.recordId, t]));

describe('LTR aggregations', () => {
  it('pools counts, not percentages', () => {
    const p = pool([ltrSummary([10, 10, 10, 10]), ltrSummary([0])]);
    expect(p.pct).toBe(80); // averaging percentages would give 50
  });
  it('FW40, FYTD, compare baselines', () => {
    expect(m.get(40)!.pct!.toFixed(1)).toBe('94.7');
    expect(poolWeeks(m, 1, 40)).toMatchObject({ n: 3736 });
    expect(baseline(m, 40, 'prior').summary.pct!.toFixed(1)).toBe('93.9');
    expect(baseline(m, 40, 'fytd').summary.pct!.toFixed(1)).toBe('93.1');
    const avg4 = baseline(m, 40, 'avg4');
    expect(avg4.label).toBe('4-wk avg (FW36–FW39)');
    expect(avg4.summary.n).toBe([36, 37, 38, 39].reduce((a, w) => a + m.get(w)!.n, 0));
    expect(deltaPts(m.get(40)!, m.get(39)!)!.toFixed(1)).toBe('0.8');
  });
  it('period grains', () => {
    expect(periodSeries(m, 40, 'week')).toHaveLength(40);
    const months = periodSeries(m, 40, 'month');
    expect(months).toHaveLength(10);
    expect(months[9].weeks).toEqual([40]); // FM10 so far
    expect(periodSeries(m, 40, 'quarter').map((q) => q.label)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    const r4 = periodSeries(m, 40, 'rolling4');
    expect(r4[39].weeks).toEqual([37, 38, 39, 40]);
    expect(r4[0].weeks).toEqual([1]);
  });
  it('geo filters and region groups', () => {
    const r5 = ltrSurveys(d.surveys, { region: 'R5', district: null, store: null }, stores);
    expect(byWeek(r5).get(40)!.n).toBe(19);
    const g = groupByWeek(all.filter((s) => s.fw === 40), (s) => s.region);
    expect(g.get('R27')!.get(40)!.n).toBe(18);
    expect(impact(g.get('R5')!.get(40)!, 131)).toBeCloseTo(2 * 19 / 131);
  });
});

describe('attributes', () => {
  const w40 = all.filter((s) => s.fw === 40);
  const scores = attributeScores(w40, [], false);
  it('lowest = Ease of scheduling 87.4%; in-home 95–96%', () => {
    expect(lowest(scores)!.key).toBe('scheduling');
    expect(lowest(scores)!.pct!.toFixed(1)).toBe('87.4');
    expect(rangeLabel(groupRange(scores, 'In-home'))).toBe('95–96%');
  });
  it('falls back to Medallia Analytics company-wide only', () => {
    const aw = [{ id: '40:scheduling', fw: 40, attr: 'scheduling' as const, pct: 87.1, n: 224, top2: 195, nApprox: true, sourceFile: 'x' }];
    const s = attributeScores([], aw, false).find((x) => x.key === 'scheduling')!;
    expect(s).toMatchObject({ pct: 87.1, n: 224, source: 'analytics', nApprox: true });
    expect(attributeScores([], aw, true).find((x) => x.key === 'scheduling')!.source).toBe('none');
  });
});

describe('VOC', () => {
  it('survey mentions per theme with sentiment; “other” excluded', () => {
    const t = themeMentions(d.tags, 40);
    expect(t.find((x) => x.theme === 'appointment')!.surveys).toBe(6);
    expect(t.find((x) => x.theme === 'value')).toMatchObject({ surveys: 9, surveysPos: 7, surveysNeg: 2 });
    expect(t.find((x) => x.theme === 'other')).toBeUndefined();
  });
});

describe('detractors', () => {
  const rows = detractorRows(all.filter((s) => s.fw === 40), d.followups, tagMap, stores, '2026-11-23');
  it('7 rows, worst first, root causes, follow-up and 48h flag', () => {
    expect(rows).toHaveLength(7);
    expect(rows[0].score).toBe(0);
    expect(rows.filter((r) => r.band === '0-6')).toHaveLength(2);
    expect(rootCauseMix(rows)[0]).toEqual({ theme: 'exclusions', count: 3 });
    expect(rows.filter((r) => r.followUp === 'Documented')).toHaveLength(3);
    expect(rows.filter((r) => r.overdue)).toHaveLength(4);
  });
  it('48h rule is relative to the survey date', () => {
    const r = detractorRows([{ ...all.find((s) => s.fw === 40 && s.ltr! < 9)!, date: '2026-11-22' }], [], tagMap, stores, '2026-11-23');
    expect(r[0].overdue).toBe(false);
  });
  it('closed-loop list has no comments or names', () => {
    const text = closedLoopText(rows, (s) => s);
    expect(text).toMatch(/score 0/);
    expect(text).not.toMatch(/reschedule|tankless/i);
  });
});

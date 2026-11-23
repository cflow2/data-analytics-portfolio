import { describe, expect, it } from 'vitest';
import type { ThemeTag } from '@/domain/types';
import { themeHistory, maturity, whatChanged, weeksSeen } from './themes';
import { dailyVolume, repeatCallers } from './calls';

const tag = (id: string, fw: number, channel: 'survey' | 'call', primary: string, secondary: string[] = [], sentiment: ThemeTag['sentiment'] = 'Negative'): ThemeTag =>
  ({ recordId: id, fw, channel, primary, secondary, sentiment, confidence: 1, source: 'Rule' });

describe('themes', () => {
  const tags = [
    tag('s1', 40, 'survey', 'value', [], 'Positive'), tag('s2', 39, 'survey', 'value'),
    tag('c1', 40, 'call', 'exclusions'), tag('c2', 40, 'call', 'exclusions'), tag('a1', 40, 'call', 'exclusions'),
    tag('s3', 40, 'survey', 'exclusions'),
    tag('s4', 40, 'survey', 'aging'),
    tag('s5', 37, 'survey', 'completion'), tag('s6', 36, 'survey', 'completion'),
  ];
  const h = themeHistory(tags, new Set(['c1', 'c2']));
  it('counts channels separately and drops associate calls', () => {
    expect(h.get('exclusions')!.get(40)).toEqual({ surveys: 1, calls: 2, pos: 0, neg: 1 });
  });
  it('maturity', () => {
    expect(maturity(h, 'aging', 40)).toBe('Emerging');
    expect(maturity(h, 'value', 40)).toBe('Repeated');
    expect(maturity(h, 'exclusions', 40)).toBe('Corroborated');
    expect(maturity(h, 'exclusions', 40, true)).toBe('Validated');
    expect(maturity(h, 'completion', 40)).toBe('Emerging'); // FW37 in window, FW36 outside
    expect(maturity(h, 'completion', 41)).toBeNull();
    expect(weeksSeen(h, 'value', 1, 40)).toBe(2);
  });
  it('what changed', () => {
    const w = new Map(whatChanged(h, 40).map((x) => [x.theme, x]));
    expect(w.get('aging')!.isNew).toBe(true);
    expect(w.get('exclusions')).toMatchObject({ dCallsPrior: 2, isNew: true, maturityNow: 'Corroborated', maturityPrev: null });
    expect(w.get('value')!.dSurveysPrior).toBe(0);
  });
});

describe('calls', () => {
  const c = (id: string, date: string, caseNo: string, phoneHash?: string) => ({ id, fw: 40, date, driver: 'x', driverNorm: 'x', caseNo, notes: '', isAssociate: false, sourceFile: 'f', phoneHash });
  it('daily volume Sat–Fri and repeat callers', () => {
    const calls = [c('1', '2026-10-31', 'A', 'p1'), c('2', '2026-11-02', 'A', 'p1'), c('3', '2026-11-06', 'B', 'p1'), c('4', '2026-11-06', 'C')];
    expect(dailyVolume(calls, '2026-10-31').map((x) => x.calls)).toEqual([1, 0, 1, 0, 0, 0, 2]);
    const r = repeatCallers(calls);
    expect(r.find((x) => x.kind === 'case')!.key).toBe('A');
    expect(r.find((x) => x.kind === 'phone')!.key).toBe('Caller A');
    expect(JSON.stringify(r)).not.toMatch(/"key":"p1"/);
  });
});

import { describe, expect, it } from 'vitest';
import type { ThemeTag } from '@/domain/types';
import { themeHistory, maturity, whatChanged, weeksSeen } from './themes';

const tag = (id: string, fw: number, primary: string, secondary: string[] = [], sentiment: ThemeTag['sentiment'] = 'Negative'): ThemeTag =>
  ({ recordId: id, fw, channel: 'survey', primary, secondary, sentiment, confidence: 1, source: 'Rule' });

describe('themes (survey comments)', () => {
  const tags = [
    tag('s1', 40, 'value', [], 'Positive'), tag('s2', 39, 'value'),
    tag('s3', 40, 'exclusions'), tag('s3b', 40, 'damage', ['exclusions']),
    tag('s4', 40, 'aging'),
    tag('s5', 37, 'completion'), tag('s6', 36, 'completion'),
    ...[37, 38, 39, 40].map((w) => tag(`a${w}`, w, 'associate', [], 'Positive')),
  ];
  const h = themeHistory(tags);
  it('counts primary and secondary mentions with sentiment', () => {
    expect(h.get('exclusions')!.get(40)).toEqual({ surveys: 2, pos: 0, neg: 2 });
    expect(h.get('value')!.get(40)).toEqual({ surveys: 1, pos: 1, neg: 0 });
  });
  it('maturity: Emerging 1 week, Repeated 2–3, Persistent all 4', () => {
    expect(maturity(h, 'aging', 40)).toBe('Emerging');
    expect(maturity(h, 'value', 40)).toBe('Repeated');
    expect(maturity(h, 'associate', 40)).toBe('Persistent');
    expect(maturity(h, 'completion', 40)).toBe('Emerging'); // FW37 in window, FW36 outside
    expect(maturity(h, 'completion', 41)).toBeNull();
    expect(weeksSeen(h, 'value', 1, 40)).toBe(2);
  });
  it('what changed', () => {
    const w = new Map(whatChanged(h, 40).map((x) => [x.theme, x]));
    expect(w.get('aging')!.isNew).toBe(true);
    expect(w.get('exclusions')).toMatchObject({ dPrior: 2, isNew: true, maturityNow: 'Emerging', maturityPrev: null });
    expect(w.get('value')!.dPrior).toBe(0);
  });
});

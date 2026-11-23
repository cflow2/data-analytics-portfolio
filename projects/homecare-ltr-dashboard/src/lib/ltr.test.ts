import { describe, expect, it } from 'vitest';
import { isPromoter, isDetractor, ltrSummary, sampleFlag, canColor, detractorBand, expectedScore100, top2Box } from './ltr';

describe('LTR rules (guard tests — these fail if anyone changes the rules)', () => {
  it('promoter = 9–10 exactly', () => {
    const promoters = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(isPromoter);
    expect(promoters).toEqual([9, 10]);
  });

  it('detractor = 0–8 exactly (Lowe’s rule, no passives)', () => {
    const detractors = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(isDetractor);
    expect(detractors).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (let s = 0; s <= 10; s++) expect(isPromoter(s) !== isDetractor(s)).toBe(true);
  });

  it('LTR % = 9–10 ÷ all valid scores — NOT NPS', () => {
    const s = ltrSummary([10, 9, 9, 8, 7, 0]);
    expect(s.n).toBe(6);
    expect(s.promoters).toBe(3);
    expect(s.pct).toBeCloseTo(50, 10); // NPS would be 50 - 50 = 0 with passives, or 0 under 0–8 rule
    expect(s.pct).not.toBe(0);
  });

  it('ignores invalid scores', () => {
    const s = ltrSummary([10, null, undefined, '9', 11, -1, 8.5, NaN, 9]);
    expect(s.n).toBe(2);
    expect(s.pct).toBe(100);
    expect(ltrSummary([]).pct).toBeNull();
  });

  it('FW40 baseline: 124 of 131 = 94.7%, 7 detractors, 2 scored 0–6', () => {
    const scores = [...Array(124).fill(10), 8, 8, 8, 7, 7, 5, 0];
    const s = ltrSummary(scores);
    expect(s.n).toBe(131);
    expect(s.detractors).toBe(7);
    expect(s.detractors0to6).toBe(2);
    expect(s.detractors7to8).toBe(5);
    expect(s.pct!.toFixed(1)).toBe('94.7');
  });

  it('detractor bands and Score(100/0)', () => {
    expect(detractorBand(6)).toBe('0-6');
    expect(detractorBand(7)).toBe('7-8');
    expect(detractorBand(9)).toBeNull();
    expect(expectedScore100(9)).toBe(100);
    expect(expectedScore100(8)).toBe(0);
  });

  it('top-2-box uses 9–10', () => {
    expect(top2Box([9, 10, 8, 7]).pct).toBe(50);
  });

  it('sample-size flags', () => {
    expect(sampleFlag(0)).toBe('no-trend');
    expect(sampleFlag(4)).toBe('no-trend');
    expect(sampleFlag(5)).toBe('directional');
    expect(sampleFlag(9)).toBe('directional');
    expect(sampleFlag(10)).toBe('plain');
    expect(sampleFlag(29)).toBe('plain');
    expect(sampleFlag(30)).toBe('strong');
    expect(canColor(4)).toBe(false);
    expect(canColor(5)).toBe(true);
  });
});

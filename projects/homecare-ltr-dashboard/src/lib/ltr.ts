/**
 * LTR business rules. DO NOT CHANGE without sign-off — see README "Changing business rules".
 *
 *   LTR % = 100 × (count of scores 9–10) ÷ (count of valid scores 0–10)   — not NPS
 *   Promoter = 9–10. Detractor = 0–8 (Lowe's rule). Secondary split: 0–6 vs 7–8.
 */

export const PROMOTER_MIN = 9;

export function isValidScore(s: unknown): s is number {
  return typeof s === 'number' && Number.isInteger(s) && s >= 0 && s <= 10;
}

export function isPromoter(s: number): boolean {
  return isValidScore(s) && s >= PROMOTER_MIN;
}

/** Lowe's rule: any valid score 0–8 is a detractor. */
export function isDetractor(s: number): boolean {
  return isValidScore(s) && s < PROMOTER_MIN;
}

export type DetractorBand = '0-6' | '7-8';
export function detractorBand(s: number): DetractorBand | null {
  if (!isDetractor(s)) return null;
  return s <= 6 ? '0-6' : '7-8';
}

/** The Tracker's Score column: 100 = promoter, 0 = not. */
export function expectedScore100(ltr: number): 0 | 100 {
  return isPromoter(ltr) ? 100 : 0;
}

export interface LtrSummary {
  n: number;
  promoters: number;
  detractors: number;
  detractors0to6: number;
  detractors7to8: number;
  /** null when n = 0 */
  pct: number | null;
}

export function ltrSummary(scores: Iterable<unknown>): LtrSummary {
  let n = 0, promoters = 0, d06 = 0, d78 = 0;
  for (const s of scores) {
    if (!isValidScore(s)) continue;
    n++;
    if (s >= PROMOTER_MIN) promoters++;
    else if (s <= 6) d06++;
    else d78++;
  }
  return {
    n,
    promoters,
    detractors: d06 + d78,
    detractors0to6: d06,
    detractors7to8: d78,
    pct: n === 0 ? null : (100 * promoters) / n,
  };
}

/** Top-2-box % for a 0–10 attribute question (same 9–10 rule). */
export function top2Box(scores: Iterable<unknown>): { n: number; top2: number; pct: number | null } {
  const s = ltrSummary(scores);
  return { n: s.n, top2: s.promoters, pct: s.pct };
}

export interface SampleThresholds {
  /** below this: "No trend" (default 5) */
  noTrendBelow: number;
  /** below this: "Directional" (default 10) */
  directionalBelow: number;
  /** at or above this: "Strong" (default 30) */
  strongAtLeast: number;
}

export const DEFAULT_THRESHOLDS: SampleThresholds = { noTrendBelow: 5, directionalBelow: 10, strongAtLeast: 30 };

export type SampleFlag = 'no-trend' | 'directional' | 'plain' | 'strong';

export function sampleFlag(n: number, t: SampleThresholds = DEFAULT_THRESHOLDS): SampleFlag {
  if (n < t.noTrendBelow) return 'no-trend';
  if (n < t.directionalBelow) return 'directional';
  if (n >= t.strongAtLeast) return 'strong';
  return 'plain';
}

export const SAMPLE_FLAG_LABEL: Record<SampleFlag, string | null> = {
  'no-trend': 'No trend',
  directional: 'Directional',
  plain: null,
  strong: 'Strong',
};

/** Never color a cell red/green (or blue/orange) when n is below the no-trend threshold. */
export function canColor(n: number, t: SampleThresholds = DEFAULT_THRESHOLDS): boolean {
  return n >= t.noTrendBelow;
}

export const DEFAULT_BENCHMARK = 93;

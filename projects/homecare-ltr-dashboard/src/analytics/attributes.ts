import { ATTRIBUTES, type AttributeDef } from '@/domain/attributes';
import { top2Box } from '@/lib/ltr';
import type { AttributeKey, AttributeWeekly, SurveyRecord } from '@/domain/types';

export interface AttributeScore extends AttributeDef {
  pct: number | null;
  n: number;
  source: 'surveys' | 'analytics' | 'none';
  /** n is Medallia's Sample Size, not a per-question count */
  nApprox?: boolean;
}

/**
 * Top-2-box per attribute for one week. Per-survey answers (which respect region/store filters) win;
 * otherwise the Medallia Analytics weekly values (company-wide only).
 */
export function attributeScores(weekSurveys: SurveyRecord[], analytics: AttributeWeekly[], geoFiltered: boolean): AttributeScore[] {
  const hasSurveyAttrs = weekSurveys.some((s) => s.attrs && Object.keys(s.attrs).length);
  return ATTRIBUTES.map((a) => {
    if (hasSurveyAttrs) {
      const t = top2Box(weekSurveys.map((s) => s.attrs?.[a.key]));
      return { ...a, pct: t.pct, n: t.n, source: 'surveys' as const };
    }
    const row = !geoFiltered ? analytics.find((x) => x.attr === a.key) : undefined;
    return row
      ? { ...a, pct: row.pct, n: row.n, source: 'analytics' as const, nApprox: row.nApprox }
      : { ...a, pct: null, n: 0, source: 'none' as const };
  });
}

export function lowest(scores: AttributeScore[]): AttributeScore | null {
  const valid = scores.filter((s) => s.pct !== null && s.n > 0);
  return valid.length ? valid.reduce((a, b) => (b.pct! < a.pct! ? b : a)) : null;
}

export const GROUPS: AttributeDef['group'][] = ['Pre-visit', 'In-home', 'Program'];

/** "In-home 95–96%" */
export function groupRange(scores: AttributeScore[], group: AttributeDef['group']): { min: number; max: number } | null {
  const v = scores.filter((s) => s.group === group && s.pct !== null).map((s) => s.pct!);
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
}

export function rangeLabel(r: { min: number; max: number } | null): string {
  if (!r) return '—';
  const lo = Math.floor(r.min), hi = Math.floor(r.max);
  return lo === hi ? `${lo}%` : `${lo}–${hi}%`;
}

export type AttrKey = AttributeKey;

/**
 * Where LTR points went: every survey that scored 0–8 costs 100 ÷ n points of LTR. Grouping those surveys by the
 * primary theme of their comment splits the gap to 100 exactly (rows sum to 100 − LTR). Surveys with no comment
 * get their own row, so nothing is hidden.
 */
import type { SurveyRecord, ThemeTag } from '@/domain/types';

export const NO_COMMENT = 'no-comment';
export const UNTAGGED = 'untagged';

export interface PointsRow { theme: string; count: number; pts: number; priorPts: number | null }
export interface PointsLost { n: number; ltr: number | null; lost: number; belowBenchmark: number | null; rows: PointsRow[] }

function bucket(s: SurveyRecord, tags: Map<string, ThemeTag>): string {
  if (!s.comment.trim()) return NO_COMMENT;
  return tags.get(s.id)?.primary ?? UNTAGGED;
}

export function pointsLost(week: SurveyRecord[], tags: Map<string, ThemeTag>, benchmark: number, prior: SurveyRecord[] = []): PointsLost {
  const scored = (xs: SurveyRecord[]) => xs.filter((s) => s.ltr !== null && s.ltr >= 0 && s.ltr <= 10);
  const cur = scored(week), prev = scored(prior);
  const n = cur.length;
  const counts = (xs: SurveyRecord[]) => {
    const m = new Map<string, number>();
    for (const s of xs) if (s.ltr! <= 8) m.set(bucket(s, tags), (m.get(bucket(s, tags)) ?? 0) + 1);
    return m;
  };
  const c = counts(cur), p = counts(prev);
  const rows: PointsRow[] = [...c].map(([theme, count]) => ({
    theme, count, pts: (100 * count) / n,
    priorPts: prev.length ? (100 * (p.get(theme) ?? 0)) / prev.length : null,
  })).sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));
  const ltr = n ? (100 * cur.filter((s) => s.ltr! >= 9).length) / n : null;
  const lost = rows.reduce((a, r) => a + r.pts, 0);
  return { n, ltr, lost, belowBenchmark: ltr === null ? null : Math.max(0, benchmark - ltr), rows };
}

export function pointsLabel(theme: string, name: (id: string) => string): string {
  if (theme === NO_COMMENT) return 'No comment';
  if (theme === UNTAGGED) return 'Comment not tagged yet';
  if (theme === 'other') return 'Other / general';
  return name(theme);
}

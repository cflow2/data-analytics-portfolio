/** Theme history, evidence maturity and week-over-week change. Survey and call counts are always kept apart. */
import type { Maturity, ThemeTag } from '@/domain/types';

export interface ThemeWeek { surveys: number; calls: number; pos: number; neg: number }
export type ThemeHistory = Map<string, Map<number, ThemeWeek>>;

const blank = (): ThemeWeek => ({ surveys: 0, calls: 0, pos: 0, neg: 0 });

/** Mentions per theme per week (primary or secondary). Associate/store calls must be excluded via `customerCallIds`. */
export function themeHistory(tags: ThemeTag[], customerCallIds: Set<string>, exclude = ['other']): ThemeHistory {
  const h: ThemeHistory = new Map();
  for (const t of tags) {
    if (t.channel === 'call' && !customerCallIds.has(t.recordId)) continue;
    for (const theme of new Set([t.primary, ...t.secondary])) {
      if (exclude.includes(theme)) continue;
      const byWeek = h.get(theme) ?? new Map<number, ThemeWeek>();
      const w = byWeek.get(t.fw) ?? blank();
      if (t.channel === 'survey') { w.surveys++; if (t.sentiment === 'Positive') w.pos++; if (t.sentiment === 'Negative') w.neg++; } else w.calls++;
      byWeek.set(t.fw, w);
      h.set(theme, byWeek);
    }
  }
  return h;
}

export const weekOfTheme = (h: ThemeHistory, theme: string, fw: number): ThemeWeek => h.get(theme)?.get(fw) ?? blank();

export const MATURITY_WINDOW = 4;
const RANK: Record<Maturity, number> = { Emerging: 1, Repeated: 2, Corroborated: 3, Validated: 4 };

/**
 * Evidence maturity at week `fw`, over the last 4 weeks:
 * Emerging = seen in 1 week · Repeated = 2+ weeks · Corroborated = seen in both surveys and calls · Validated = set manually.
 * Returns null if the theme isn't seen in the window.
 */
export function maturity(h: ThemeHistory, theme: string, fw: number, validated = false): Maturity | null {
  const weeks = Array.from({ length: MATURITY_WINDOW }, (_, i) => fw - i).filter((w) => w >= 1);
  const seen = weeks.map((w) => weekOfTheme(h, theme, w)).filter((x) => x.surveys + x.calls > 0);
  if (!seen.length) return null;
  if (validated) return 'Validated';
  if (seen.some((x) => x.surveys > 0) && seen.some((x) => x.calls > 0)) return 'Corroborated';
  return seen.length >= 2 ? 'Repeated' : 'Emerging';
}

export function maturityRank(m: Maturity | null): number { return m ? RANK[m] : 0; }

export function weeksSeen(h: ThemeHistory, theme: string, from: number, to: number): number {
  let n = 0;
  for (let w = Math.max(1, from); w <= to; w++) { const x = weekOfTheme(h, theme, w); if (x.surveys + x.calls > 0) n++; }
  return n;
}

export function firstSeen(h: ThemeHistory, theme: string): number | null {
  const ws = [...(h.get(theme)?.keys() ?? [])];
  return ws.length ? Math.min(...ws) : null;
}

export interface ThemeChange {
  theme: string;
  cur: ThemeWeek;
  prior: ThemeWeek;
  avg4: { surveys: number; calls: number };
  dSurveysPrior: number;
  dCallsPrior: number;
  dSurveysAvg: number;
  dCallsAvg: number;
  isNew: boolean;
  maturityNow: Maturity | null;
  maturityPrev: Maturity | null;
}

/** What changed at `fw`: vs the prior week and the average of the 4 weeks before. */
export function whatChanged(h: ThemeHistory, fw: number, validated: (theme: string) => boolean = () => false): ThemeChange[] {
  const out: ThemeChange[] = [];
  for (const theme of h.keys()) {
    const cur = weekOfTheme(h, theme, fw);
    const prior = weekOfTheme(h, theme, fw - 1);
    const prev4 = [1, 2, 3, 4].map((i) => fw - i).filter((w) => w >= 1).map((w) => weekOfTheme(h, theme, w));
    const avg = (k: 'surveys' | 'calls') => (prev4.length ? prev4.reduce((a, x) => a + x[k], 0) / prev4.length : 0);
    const avg4 = { surveys: avg('surveys'), calls: avg('calls') };
    if (cur.surveys + cur.calls + prior.surveys + prior.calls === 0) continue;
    out.push({
      theme, cur, prior, avg4,
      dSurveysPrior: cur.surveys - prior.surveys, dCallsPrior: cur.calls - prior.calls,
      dSurveysAvg: cur.surveys - avg4.surveys, dCallsAvg: cur.calls - avg4.calls,
      isNew: cur.surveys + cur.calls > 0 && prev4.every((x) => x.surveys + x.calls === 0),
      maturityNow: maturity(h, theme, fw, validated(theme)),
      maturityPrev: maturity(h, theme, fw - 1, validated(theme)),
    });
  }
  return out;
}

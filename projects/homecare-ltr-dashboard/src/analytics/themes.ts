/** Theme history, how established a theme is, and week-over-week change, from survey comments. */
import type { Maturity, ThemeTag } from '@/domain/types';

export interface ThemeWeek { surveys: number; pos: number; neg: number }
export type ThemeHistory = Map<string, Map<number, ThemeWeek>>;

const blank = (): ThemeWeek => ({ surveys: 0, pos: 0, neg: 0 });

/** Survey mentions per theme per week (primary or secondary). */
export function themeHistory(tags: ThemeTag[], exclude = ['other']): ThemeHistory {
  const h: ThemeHistory = new Map();
  for (const t of tags) {
    if (t.channel !== 'survey') continue;
    for (const theme of new Set([t.primary, ...t.secondary])) {
      if (exclude.includes(theme)) continue;
      const byWeek = h.get(theme) ?? new Map<number, ThemeWeek>();
      const w = byWeek.get(t.fw) ?? blank();
      w.surveys++;
      if (t.sentiment === 'Positive') w.pos++;
      if (t.sentiment === 'Negative') w.neg++;
      byWeek.set(t.fw, w);
      h.set(theme, byWeek);
    }
  }
  return h;
}

export const weekOfTheme = (h: ThemeHistory, theme: string, fw: number): ThemeWeek => h.get(theme)?.get(fw) ?? blank();

export const MATURITY_WINDOW = 4;
const RANK: Record<Maturity, number> = { Emerging: 1, Repeated: 2, Persistent: 3 };

/**
 * How established a theme is at week `fw`, over the last 4 weeks:
 * Emerging = seen in 1 week · Repeated = 2–3 weeks · Persistent = all 4 weeks.
 * Returns null if the theme isn't seen in the window.
 */
export function maturity(h: ThemeHistory, theme: string, fw: number): Maturity | null {
  const weeks = Array.from({ length: MATURITY_WINDOW }, (_, i) => fw - i).filter((w) => w >= 1);
  const seen = weeks.filter((w) => weekOfTheme(h, theme, w).surveys > 0).length;
  if (!seen) return null;
  if (seen >= MATURITY_WINDOW) return 'Persistent';
  return seen >= 2 ? 'Repeated' : 'Emerging';
}

export function maturityRank(m: Maturity | null): number { return m ? RANK[m] : 0; }

export function weeksSeen(h: ThemeHistory, theme: string, from: number, to: number): number {
  let n = 0;
  for (let w = Math.max(1, from); w <= to; w++) if (weekOfTheme(h, theme, w).surveys > 0) n++;
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
  avg4: number;
  dPrior: number;
  dAvg: number;
  isNew: boolean;
  maturityNow: Maturity | null;
  maturityPrev: Maturity | null;
}

/** What changed at `fw`: survey mentions vs the prior week and the average of the 4 weeks before. */
export function whatChanged(h: ThemeHistory, fw: number): ThemeChange[] {
  const out: ThemeChange[] = [];
  for (const theme of h.keys()) {
    const cur = weekOfTheme(h, theme, fw);
    const prior = weekOfTheme(h, theme, fw - 1);
    const prev4 = [1, 2, 3, 4].map((i) => fw - i).filter((w) => w >= 1).map((w) => weekOfTheme(h, theme, w));
    const avg4 = prev4.length ? prev4.reduce((a, x) => a + x.surveys, 0) / prev4.length : 0;
    if (cur.surveys + prior.surveys === 0) continue;
    out.push({
      theme, cur, prior, avg4,
      dPrior: cur.surveys - prior.surveys,
      dAvg: cur.surveys - avg4,
      isNew: cur.surveys > 0 && prev4.every((x) => x.surveys === 0),
      maturityNow: maturity(h, theme, fw),
      maturityPrev: maturity(h, theme, fw - 1),
    });
  }
  return out;
}

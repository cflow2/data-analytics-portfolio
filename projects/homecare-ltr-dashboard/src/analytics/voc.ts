/** Theme mentions in survey comments. A comment counts toward a theme if it is the primary or a secondary theme. */
import type { ThemeTag } from '@/domain/types';

export interface ThemeCount { theme: string; surveys: number; surveysPos: number; surveysNeg: number }

export function themeMentions(tags: ThemeTag[], fw: number, exclude: string[] = ['other']): ThemeCount[] {
  const m = new Map<string, ThemeCount>();
  for (const t of tags) {
    if (t.fw !== fw || t.channel !== 'survey') continue;
    for (const theme of new Set([t.primary, ...t.secondary])) {
      if (exclude.includes(theme)) continue;
      const c = m.get(theme) ?? { theme, surveys: 0, surveysPos: 0, surveysNeg: 0 };
      c.surveys++;
      if (t.sentiment === 'Positive') c.surveysPos++;
      if (t.sentiment === 'Negative') c.surveysNeg++;
      m.set(theme, c);
    }
  }
  return [...m.values()];
}

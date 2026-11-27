/**
 * Medallia Text Analytics topics next to the app's own themes, for one fiscal week.
 * Medallia tags the HomeCare+ comment with its Lowe's topic pool ("Associate - Professionalism", "Plumbing - Water Heaters");
 * the app tags the same comments with its keyword rules. Showing both side by side catches what either one misses.
 * Comparison only: LTR always comes from the Tracker.
 */
import type { MedalliaTopic, SurveyRecord, ThemeTag } from '@/domain/types';
import { countsForLtr } from '@/domain/survey';
import { surveyDivision } from './ltr';
import { DIVISION_ORDER as DIVS } from '@/config/regions';

/** Medallia topic → the closest app theme. First match wins; edit here to change the mapping. */
export const TOPIC_TO_THEME: { re: RegExp; theme: string }[] = [
  { re: /^associate\b|employee|professionalism|knowledge/i, theme: 'associate' },
  { re: /appointment|schedul|cancel|no[- ]?show|arrival|wait/i, theme: 'appointment' },
  { re: /damage|safety hazard|injur/i, theme: 'damage' },
  { re: /pric|discount|value|cost|fee|subscription/i, theme: 'value' },
  { re: /^(plumbing|electrical|hvac|appliance|tools?|outdoor|lawn|garage|roof|water)\b|water heater|dryer|filter|batter|smoke|detector/i, theme: 'completion' },
  { re: /accessib|aging|mobility/i, theme: 'aging' },
];

export function appThemeFor(topic: string): string | null {
  return TOPIC_TO_THEME.find((m) => m.re.test(topic))?.theme ?? null;
}

/** Same order as the rest of the app (South, West, North), then a company-wide export. */
export const DIVISION_ORDER: string[] = [...DIVS, 'ALL'];
export const divisionName = (d: string) => (d === 'ALL' ? 'All divisions' : d.charAt(0) + d.slice(1).toLowerCase());

export interface TopicRow extends MedalliaTopic {
  appTheme: string | null;
  /** app surveys this week in the same division tagged with that theme (primary or secondary) */
  appCount: number | null;
  /** fewer than 3 comments: too few to act on */
  small: boolean;
  /** bottom topic with 3+ negative comments that the app's themes miss (no matching theme, or none tagged this week) */
  gap: boolean;
}

export interface DivisionCheck { division: string; medallia: number | null; app: number; topics: number }

export interface TopicComparison {
  fw: number;
  divisions: string[];
  rows: TopicRow[];
  checks: DivisionCheck[];
}

export function compareTopics(topics: MedalliaTopic[], surveys: SurveyRecord[], tags: Map<string, ThemeTag>, fw: number): TopicComparison {
  const week = topics.filter((t) => t.fw === fw);
  const divisions = [...new Set(week.map((t) => t.division))].sort((a, b) => DIVISION_ORDER.indexOf(a) - DIVISION_ORDER.indexOf(b));
  const commented = surveys.filter((s) => s.fw === fw && countsForLtr(s) && s.comment.trim());
  const inDiv = (d: string) => commented.filter((s) => d === 'ALL' || surveyDivision(s) === d);
  const themeCount = new Map<string, number>();
  const countFor = (d: string, theme: string) => {
    const k = `${d}:${theme}`;
    if (!themeCount.has(k)) themeCount.set(k, inDiv(d).filter((s) => { const t = tags.get(s.id); return !!t && (t.primary === theme || t.secondary.includes(theme)); }).length);
    return themeCount.get(k)!;
  };
  const rows = week.map((t): TopicRow => {
    const appTheme = appThemeFor(t.topic);
    const appCount = appTheme ? countFor(t.division, appTheme) : null;
    return {
      ...t, appTheme, appCount,
      small: t.responses < 3,
      // Medallia sees 3+ negative comments on it, and the app has no matching theme, or none tagged with it this week.
      gap: t.section !== 'top' && t.negative >= 3 && (!appTheme || appCount === 0),
    };
  }).sort((a, b) => DIVISION_ORDER.indexOf(a.division) - DIVISION_ORDER.indexOf(b.division)
    || ['top', 'list', 'bottom'].indexOf(a.section) - ['top', 'list', 'bottom'].indexOf(b.section)
    || (a.section === 'bottom' ? (a.impact ?? 0) - (b.impact ?? 0) : (b.impact ?? b.responses) - (a.impact ?? a.responses)));
  const checks = divisions.map((d) => ({ division: d, medallia: week.find((t) => t.division === d)?.base ?? null, app: inDiv(d).length, topics: week.filter((t) => t.division === d).length }));
  return { fw, divisions, rows, checks };
}

/** Topics that are negative in more than one division this week (a company-wide issue, not a local one). */
export function sharedNegatives(rows: TopicRow[]): { topic: string; divisions: string[]; negative: number }[] {
  const m = new Map<string, { divisions: string[]; negative: number }>();
  for (const r of rows) {
    if (r.negative < 2) continue;
    const v = m.get(r.topic) ?? { divisions: [], negative: 0 };
    if (!v.divisions.includes(r.division)) v.divisions.push(r.division);
    v.negative += r.negative;
    m.set(r.topic, v);
  }
  return [...m].filter(([, v]) => v.divisions.length >= 2).map(([topic, v]) => ({ topic, ...v })).sort((a, b) => b.negative - a.negative);
}

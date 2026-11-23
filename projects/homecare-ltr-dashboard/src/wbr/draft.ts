/** WBR slide draft: generated from WeekFacts, saved per week once edited. */
import type { WeekFacts } from '@/analytics/facts';
import type { ThemeDef } from '@/domain/taxonomy';
import { monthDay } from '@/lib/dates';
import { weekInfo } from '@/lib/fiscal';
import { ltrCallout, themeHeader, themeLine } from '@/writing/write';

export interface DraftTheme { id: string; header: string; line: string; include: boolean }
export interface PreflightOverride { check: string; reason: string; at: string }

export interface WbrDraft {
  fw: number;
  title: string;
  subtitle: string;
  themes: DraftTheme[];
  callout: string;
  chartTitle: string;
  footnote: string;
  /** null = generated */
  notes: string | null;
  overrides: PreflightOverride[];
  exportedAt?: string;
  edited?: boolean;
}

export const MAX_THEMES = 6;

/** Nice y-axis maximum strictly above the top value (82 → 90, 76 → 80, 140 → 160). */
export function niceMax(top: number): number {
  const step = top < 20 ? 5 : top < 100 ? 10 : top < 200 ? 20 : top < 500 ? 50 : 100;
  return Math.ceil((top + 1) / step) * step;
}

/** Short chart labels so category names don't collide. */
export const SHORT_LABEL: Record<string, string> = {
  appointment: 'Appointments', associate: 'Associate', exclusions: 'Exclusions', value: 'Value', completion: 'Completion gaps',
  damage: 'Damage', 'service-add': 'Service adds', aging: 'Aging in place', other: 'Other',
};

export function chartRows(f: WeekFacts, d: WbrDraft): { id: string; name: string; surveys: number; calls: number; total: number }[] {
  return d.themes.filter((t) => t.include).map((t) => {
    const m = f.mentions.find((x) => x.theme === t.id);
    const name = SHORT_LABEL[t.id] ?? t.header.split(':')[0];
    return { id: t.id, name, surveys: m?.surveys ?? 0, calls: m?.calls ?? 0, total: (m?.surveys ?? 0) + (m?.calls ?? 0) };
  }).sort((a, b) => b.total - a.total);
}

export function defaultDraft(f: WeekFacts, tax: ThemeDef[], fyStart: string): WbrDraft {
  const ranked = [...f.mentions].filter((m) => m.theme !== 'other').sort((a, b) => b.surveys + b.calls - (a.surveys + a.calls));
  const themes: DraftTheme[] = ranked.map((m, i) => ({ id: m.theme, header: themeHeader(m.theme, f, tax), line: themeLine(m.theme, f), include: i < MAX_THEMES - 1 || (i === MAX_THEMES - 1 && m.surveys + m.calls > 0) }));
  // Damage is always on the slide when there is any.
  const dmg = themes.find((t) => t.id === 'damage');
  if (dmg && !dmg.include && themes.filter((t) => t.include).length >= MAX_THEMES) themes.filter((t) => t.include).pop()!.include = false;
  if (dmg) dmg.include = true;
  const { cur } = f.ltr;
  const wi = weekInfo(f.fw, fyStart);
  const sources: string[] = [];
  if (f.hasSurveys) sources.push(`LTR Tracker/Medallia surveys (n=${cur.n})`);
  if (f.hasCalls) sources.push(`Loyalty Cases (${f.calls.calls} customer calls, ${f.calls.cases} cases)`);
  return {
    fw: f.fw,
    title: `Customer Insights FW${f.fw}`,
    subtitle: cur.pct === null ? `FW${f.fw} · ${monthDay(wi.start)}–${monthDay(wi.end)}` : `LTR ${cur.pct.toFixed(1)}% (n=${cur.n}) · ${cur.pct >= f.benchmark ? 'above' : 'below'} the ${f.benchmark}% benchmark · FW${f.fw} ${monthDay(wi.start)}–${monthDay(wi.end)}`,
    themes,
    callout: ltrCallout(f),
    chartTitle: `FW${f.fw} – Top VOC “Mentions”`,
    footnote: `Sources: ${sources.join('; ') || 'none loaded'}. Mentions = survey comments + calls tagged with the theme (primary or secondary); calls are not unique members; call tags are directional.`,
    notes: null,
    overrides: [],
  };
}

/** Plain-text version of the slide (Copy slide text). */
export function slideText(d: WbrDraft): string {
  return [
    d.title, d.subtitle, '', 'Key Themes & Insights Seen in VOC',
    ...d.themes.filter((t) => t.include).flatMap((t) => [t.header, `• ${t.line}`]),
    '', d.callout, '', d.chartTitle, '', d.footnote,
  ].join('\n');
}

import { addDays, diffDays, type ISODate } from '@/lib/dates';
import { detractorBand, type DetractorBand } from '@/lib/ltr';
import type { FollowUpRecord, FollowUpStatus, StoreRecord, SurveyRecord, ThemeTag } from '@/domain/types';
import { districtFor } from './ltr';

export interface DetractorRow {
  id: string;
  date: ISODate;
  fw: number;
  storeNo: string;
  region: string;
  district: string;
  score: number;
  band: DetractorBand;
  comment: string;
  rootCause: string | null;
  rootCauseSource?: ThemeTag['source'];
  followUp: FollowUpStatus;
  followUpId?: string;
  smInsight: string;
  daysSince: number;
  /** no documented SM contact 48+ hours after the survey */
  overdue: boolean;
}

export function detractorRows(
  surveys: SurveyRecord[], followups: FollowUpRecord[], tags: Map<string, ThemeTag>,
  stores: Map<string, StoreRecord>, today: ISODate,
): DetractorRow[] {
  const fuBySurvey = new Map(followups.filter((f) => f.surveyId).map((f) => [f.surveyId!, f]));
  return surveys
    .filter((s) => s.ltr !== null && s.ltr < 9)
    .map((s) => {
      const fu = fuBySurvey.get(s.id);
      const tag = tags.get(s.id);
      const followUp: FollowUpStatus = fu?.status ?? 'Missing';
      const daysSince = Math.max(0, diffDays(today, s.date));
      return {
        id: s.id, date: s.date, fw: s.fw, storeNo: s.storeNo, region: s.region, district: districtFor(s.storeNo, stores),
        score: s.ltr!, band: detractorBand(s.ltr!)!, comment: s.comment, rootCause: tag?.primary ?? null, rootCauseSource: tag?.source,
        followUp, followUpId: fu?.id, smInsight: fu?.insights ?? '', daysSince,
        overdue: followUp !== 'Documented' && diffDays(today, addDays(s.date, 2)) >= 0,
      };
    })
    .sort((a, b) => a.score - b.score || a.date.localeCompare(b.date));
}

export function rootCauseMix(rows: DetractorRow[]): { theme: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.rootCause ?? 'untagged', (m.get(r.rootCause ?? 'untagged') ?? 0) + 1);
  return [...m].map(([theme, count]) => ({ theme, count })).sort((a, b) => b.count - a.count);
}

/** Copy-paste list for stores: detractors without documented SM contact after 48h. */
export function closedLoopText(rows: DetractorRow[], label: (storeNo: string) => string): string {
  const overdue = rows.filter((r) => r.overdue);
  if (!overdue.length) return 'All detractors have documented SM follow-up.';
  const byStore = new Map<string, DetractorRow[]>();
  for (const r of overdue) byStore.set(r.storeNo, [...(byStore.get(r.storeNo) ?? []), r]);
  const lines = ['HomeCare+ detractor follow-up needed (no documented SM contact after 48 hours):', ''];
  for (const [store, rs] of [...byStore].sort()) {
    lines.push(`${label(store)}`);
    for (const r of rs) lines.push(`  • Survey ${r.id} · ${r.date} · score ${r.score} · follow-up: ${r.followUp} · ${r.daysSince} days ago`);
  }
  return lines.join('\n');
}

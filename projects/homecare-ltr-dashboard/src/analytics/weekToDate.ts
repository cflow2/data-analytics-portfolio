/**
 * The fiscal week in progress (the week of the latest survey): LTR so far, the same days of last week, and how many
 * 0–8 scores the week can still absorb at a typical week's volume and finish at the benchmark.
 */
import type { SurveyRecord } from '@/domain/types';
import { addDays, diffDays, type ISODate } from '@/lib/dates';
import { fiscalWeek, weekEnd, weekStart, DEFAULT_FY_START } from '@/lib/fiscal';
import { ltrSummary, type LtrSummary } from '@/lib/ltr';

export interface WeekToDate {
  fw: number;
  from: ISODate;
  /** latest survey date */
  through: ISODate;
  days: number;
  /** the week's last day hasn't been reached in the data */
  inProgress: boolean;
  s: LtrSummary;
  /** same days of the prior week */
  samePoint: LtrSummary;
  /** average n of the 4 weeks before */
  typicalN: number | null;
  /** 0–8 scores a typical week can take and still be ≥ benchmark; how many are left */
  allowed: number | null;
  left: number | null;
}

/** `surveys` are LTR surveys (already filtered by geography). */
export function weekToDate(surveys: SurveyRecord[], benchmark = 93, fyStart: ISODate = DEFAULT_FY_START): WeekToDate | null {
  const scored = surveys.filter((s) => s.ltr !== null);
  if (!scored.length) return null;
  const through = scored.reduce((m, s) => (s.date > m ? s.date : m), '');
  const fw = fiscalWeek(through, fyStart);
  const from = weekStart(fw, fyStart);
  const days = diffDays(through, from) + 1;
  const s = ltrSummary(scored.filter((x) => x.fw === fw).map((x) => x.ltr));
  const pFrom = weekStart(fw - 1, fyStart);
  const samePoint = ltrSummary(scored.filter((x) => x.fw === fw - 1 && x.date <= addDays(pFrom, days - 1)).map((x) => x.ltr));
  const prev = [1, 2, 3, 4].map((k) => scored.filter((x) => x.fw === fw - k).length).filter((n) => n > 0);
  const typicalN = prev.length ? Math.round(prev.reduce((a, n) => a + n, 0) / prev.length) : null;
  const n = typicalN === null ? null : Math.max(typicalN, s.n);
  const allowed = n === null ? null : Math.floor((n * (100 - benchmark)) / 100 + 1e-9);
  return { fw, from, through, days, inProgress: through < weekEnd(fw, fyStart), s, samePoint, typicalN, allowed, left: allowed === null ? null : allowed - s.detractors };
}

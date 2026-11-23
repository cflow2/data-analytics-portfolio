import { db } from '@/db/db';
import { weekCounts } from '@/db/queries';
import { lastCompletedWeek, weekInfo, type FiscalWeekInfo } from '@/lib/fiscal';
import { todayISO } from '@/lib/dates';
import { useFilters } from '@/state/filters';
import { useSettings } from '@/state/settings';
import { useLive } from './useLive';

export const REPORTING_WEEK_KEY = 'reportingWeek';

/**
 * Default reporting week: the saved reporting week (set by demo load and call imports) → the latest completed week
 * whose data looks complete (has calls, or at least half the median weekly survey n) → last completed week.
 */
export function pickDefaultWeek(
  weeks: number[], saved: number | undefined, lastCompleted: number,
  counts: Record<number, { surveys: number; calls: number }> = {},
): number {
  if (saved && weeks.includes(saved)) return saved;
  const ns = Object.values(counts).map((c) => c.surveys).filter((n) => n > 0).sort((a, b) => a - b);
  const median = ns.length ? ns[Math.floor(ns.length / 2)] : 0;
  const complete = (w: number) => !counts[w] || counts[w].calls > 0 || counts[w].surveys >= median / 2;
  const eligible = weeks.filter((w) => w <= lastCompleted && complete(w));
  return eligible.length ? eligible[eligible.length - 1] : lastCompleted;
}

export function useAvailableWeeks() {
  return useLive(async () => {
    const [counts, saved] = await Promise.all([weekCounts(), db.kv.get(REPORTING_WEEK_KEY)]);
    const weeks = Object.keys(counts).map(Number).sort((a, b) => a - b);
    return { weeks, counts, saved: saved?.value as number | undefined };
  }, []);
}

/** The selected fiscal week (from the URL, else the default). */
export function useSelectedWeek(): FiscalWeekInfo & { hasData: boolean; weeks: number[] } {
  const [filters] = useFilters();
  const fyStart = useSettings((s) => s.fyStart);
  const { data } = useAvailableWeeks();
  const weeks = data?.weeks ?? [];
  const fw = filters.fw ?? pickDefaultWeek(weeks, data?.saved, lastCompletedWeek(todayISO(), fyStart), data?.counts);
  return { ...weekInfo(Math.min(Math.max(fw, 1), 52), fyStart), hasData: weeks.includes(fw), weeks };
}

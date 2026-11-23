import { db } from '@/db/db';
import { weeksWithData } from '@/db/queries';
import { lastCompletedWeek, weekInfo, type FiscalWeekInfo } from '@/lib/fiscal';
import { todayISO } from '@/lib/dates';
import { useFilters } from '@/state/filters';
import { useSettings } from '@/state/settings';
import { useLive } from './useLive';

export const REPORTING_WEEK_KEY = 'reportingWeek';

/** Default reporting week: saved reporting week → latest week with data ≤ last completed week → last completed week. */
export function pickDefaultWeek(weeks: number[], saved: number | undefined, lastCompleted: number): number {
  if (saved && weeks.includes(saved)) return saved;
  const eligible = weeks.filter((w) => w <= lastCompleted);
  return eligible.length ? eligible[eligible.length - 1] : lastCompleted;
}

export function useAvailableWeeks() {
  return useLive(async () => {
    const [weeks, saved] = await Promise.all([weeksWithData(), db.kv.get(REPORTING_WEEK_KEY)]);
    return { weeks, saved: saved?.value as number | undefined };
  }, []);
}

/** The selected fiscal week (from the URL, else the default). */
export function useSelectedWeek(): FiscalWeekInfo & { hasData: boolean; weeks: number[] } {
  const [filters] = useFilters();
  const fyStart = useSettings((s) => s.fyStart);
  const { data } = useAvailableWeeks();
  const weeks = data?.weeks ?? [];
  const fw = filters.fw ?? pickDefaultWeek(weeks, data?.saved, lastCompletedWeek(todayISO(), fyStart));
  return { ...weekInfo(Math.min(Math.max(fw, 1), 52), fyStart), hasData: weeks.includes(fw), weeks };
}

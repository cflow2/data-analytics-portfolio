import { useMemo } from 'react';
import { useDataset, type Dataset } from './dataset';
import { useSelectedWeek } from '@/hooks/useWeek';
import { useFilters, type Filters } from '@/state/filters';
import { useSettings } from '@/state/settings';
import { byWeek, isGeoFiltered, ltrSurveys, weekOf, type GeoFilter } from '@/analytics/ltr';
import { attributeScores, type AttributeScore } from '@/analytics/attributes';
import type { LtrSummary } from '@/lib/ltr';
import type { FiscalWeekInfo } from '@/lib/fiscal';
import type { SurveyRecord } from '@/domain/types';

export interface WeekData {
  ds: Dataset;
  week: FiscalWeekInfo & { hasData: boolean; weeks: number[] };
  filters: Filters;
  geo: GeoFilter;
  geoFiltered: boolean;
  benchmark: number;
  /** LTR-source surveys matching the geography filter (all weeks) */
  ltr: SurveyRecord[];
  weekly: Map<number, LtrSummary>;
  cur: LtrSummary;
  weekSurveys: SurveyRecord[];
  attrs: AttributeScore[];
  attrsFor: (fw: number) => AttributeScore[];
}

export function useWeekData(): { data: WeekData | undefined; loading: boolean; error: Error | null } {
  const { data: ds, loading, error } = useDataset();
  const week = useSelectedWeek();
  const [filters] = useFilters();
  const benchmark = useSettings((s) => s.benchmark);
  const data = useMemo<WeekData | undefined>(() => {
    if (!ds) return undefined;
    const geo: GeoFilter = { division: filters.division, region: filters.region, district: filters.district, store: filters.store, associate: filters.associate };
    const geoFiltered = isGeoFiltered(geo);
    const ltr = ltrSurveys(ds.surveys, geo, ds.stores);
    const weekly = byWeek(ltr);
    const attrsFor = (fw: number) => attributeScores(ltr.filter((s) => s.fw === fw), ds.attributeWeekly.filter((a) => a.fw === fw), geoFiltered);
    return {
      ds, week, filters, geo, geoFiltered, benchmark, ltr, weekly,
      cur: weekOf(weekly, week.fw), weekSurveys: ltr.filter((s) => s.fw === week.fw),
      attrs: attrsFor(week.fw), attrsFor,
    };
  }, [ds, week, filters, benchmark]);
  return { data, loading, error };
}

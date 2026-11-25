/** LTR aggregations over survey records. All percentages come with their n. */
import { ltrSummary, type LtrSummary } from '@/lib/ltr';
import { fiscalMonth, fiscalQuarter, weeksInMonth } from '@/lib/fiscal';
import { countsForLtr } from '@/domain/survey';
import { UNMAPPED } from '@/domain/geo';
import type { StoreRecord, SurveyRecord } from '@/domain/types';
import { divisionOf } from '@/config/regions';
import type { CompareTo } from '@/state/filters';

export interface GeoFilter { division?: string | null; region: string | null; district: string | null; store: string | null; associate?: string | null }

/** Division of a survey: the Tracker's Lowe's Division, else the region config's division for its region. */
export const surveyDivision = (s: Pick<SurveyRecord, 'division' | 'region'>): string | null => s.division || divisionOf(s.region) || null;

export const isGeoFiltered = (g: GeoFilter) => !!(g.division || g.region || g.district || g.store || g.associate);
export const geoParts = (g: GeoFilter, storeName: (no: string) => string = (no) => no) =>
  [g.division ? `${g.division[0]}${g.division.slice(1).toLowerCase()}` : null, g.region, g.district, g.store ? storeName(g.store) : null, g.associate ? `Associate: ${g.associate}` : null].filter(Boolean) as string[];

/** Does a survey match the geography (and optional associate) filter? */
export function geoMatch(s: SurveyRecord, geo: GeoFilter, stores: Map<string, StoreRecord>): boolean {
  return (!geo.division || surveyDivision(s) === geo.division)
    && (!geo.region || s.region === geo.region)
    && (!geo.district || districtFor(s.storeNo, stores) === geo.district)
    && (!geo.store || s.storeNo === geo.store)
    && (!geo.associate || s.associate === geo.associate);
}

export function districtFor(storeNo: string, stores: Map<string, StoreRecord>): string {
  return stores.get(storeNo)?.district || UNMAPPED;
}

/** Tracker (LTR-source) surveys matching the geography filter. */
export function ltrSurveys(surveys: SurveyRecord[], geo: GeoFilter, stores: Map<string, StoreRecord>): SurveyRecord[] {
  return surveys.filter((s) => countsForLtr(s) && geoMatch(s, geo, stores));
}

export const EMPTY: LtrSummary = { n: 0, promoters: 0, detractors: 0, detractors0to6: 0, detractors7to8: 0, pct: null };

/** Combine summaries by adding counts (never by averaging percentages). */
export function pool(parts: LtrSummary[]): LtrSummary {
  const t = parts.reduce((a, p) => ({
    n: a.n + p.n, promoters: a.promoters + p.promoters, detractors: a.detractors + p.detractors,
    detractors0to6: a.detractors0to6 + p.detractors0to6, detractors7to8: a.detractors7to8 + p.detractors7to8, pct: null,
  }), { ...EMPTY });
  return { ...t, pct: t.n ? (100 * t.promoters) / t.n : null };
}

export function byWeek(surveys: SurveyRecord[]): Map<number, LtrSummary> {
  const groups = new Map<number, (number | null)[]>();
  for (const s of surveys) groups.set(s.fw, [...(groups.get(s.fw) ?? []), s.ltr]);
  return new Map([...groups].map(([fw, scores]) => [fw, ltrSummary(scores)]));
}

export const weekOf = (m: Map<number, LtrSummary>, fw: number): LtrSummary => m.get(fw) ?? EMPTY;

export function poolWeeks(m: Map<number, LtrSummary>, from: number, to: number): LtrSummary {
  const parts: LtrSummary[] = [];
  for (let w = Math.max(1, from); w <= to; w++) parts.push(weekOf(m, w));
  return pool(parts);
}

export interface Baseline { label: string; summary: LtrSummary }

/** Compare-to baseline: prior week, pooled prior 4 weeks, or FYTD through the selected week. */
export function baseline(m: Map<number, LtrSummary>, fw: number, compare: CompareTo): Baseline {
  if (compare === 'prior') return { label: `FW${fw - 1}`, summary: weekOf(m, fw - 1) };
  if (compare === 'avg4') return { label: `4-wk avg (FW${Math.max(1, fw - 4)}–FW${fw - 1})`, summary: poolWeeks(m, fw - 4, fw - 1) };
  return { label: `FYTD (FW1–FW${fw})`, summary: poolWeeks(m, 1, fw) };
}

export function deltaPts(a: LtrSummary, b: LtrSummary): number | null {
  return a.pct === null || b.pct === null ? null : a.pct - b.pct;
}

export type Grain = 'week' | 'month' | 'quarter' | 'rolling4';
export interface PeriodPoint extends LtrSummary { key: string; label: string; lastFw: number; weeks: number[] }

/** LTR series at a grain, FW1 through `toFw`. Months/quarters are pooled; rolling4 pools the 4 weeks ending at each week. */
export function periodSeries(m: Map<number, LtrSummary>, toFw: number, grain: Grain): PeriodPoint[] {
  const out: PeriodPoint[] = [];
  if (grain === 'week' || grain === 'rolling4') {
    for (let w = 1; w <= toFw; w++) {
      const weeks = grain === 'week' ? [w] : [w - 3, w - 2, w - 1, w].filter((x) => x >= 1);
      out.push({ ...pool(weeks.map((x) => weekOf(m, x))), key: `w${w}`, label: `FW${w}`, lastFw: w, weeks });
    }
  } else if (grain === 'month') {
    for (let mo = 1; mo <= fiscalMonth(toFw); mo++) {
      const weeks = weeksInMonth(mo).filter((w) => w <= toFw);
      out.push({ ...pool(weeks.map((x) => weekOf(m, x))), key: `m${mo}`, label: `FM${mo}`, lastFw: weeks[weeks.length - 1], weeks });
    }
  } else {
    for (let q = 1; q <= fiscalQuarter(toFw); q++) {
      const weeks = Array.from({ length: 13 }, (_, i) => (q - 1) * 13 + i + 1).filter((w) => w <= toFw);
      out.push({ ...pool(weeks.map((x) => weekOf(m, x))), key: `q${q}`, label: `Q${q}`, lastFw: weeks[weeks.length - 1], weeks });
    }
  }
  return out;
}

/** Group surveys by a key, then summarize each group per week. */
export function groupByWeek<K extends string>(surveys: SurveyRecord[], key: (s: SurveyRecord) => K): Map<K, Map<number, LtrSummary>> {
  const g = new Map<K, SurveyRecord[]>();
  for (const s of surveys) { const k = key(s); g.set(k, [...(g.get(k) ?? []), s]); }
  return new Map([...g].map(([k, xs]) => [k, byWeek(xs)]));
}

/** "Impact" for sorting: detractors × share of n. */
export function impact(s: LtrSummary, totalN: number): number {
  return totalN ? s.detractors * (s.n / totalN) : 0;
}

/** Everything computed for one fiscal week, in one object. Generated text may only use numbers from here. */
import type { Dataset } from '@/data/dataset';
import type { LtrSummary, SampleThresholds } from '@/lib/ltr';
import { canColor } from '@/lib/ltr';
import { todayISO } from '@/lib/dates';
import { REGIONS, regionSortKey } from '@/domain/geo';
import { baseline, byWeek, groupByWeek, isGeoFiltered, ltrSurveys, poolWeeks, weekOf, type GeoFilter } from './ltr';
import { attributeScores, groupRange, lowest, rangeLabel, type AttributeScore } from './attributes';
import { detractorRows, rootCauseMix, type DetractorRow } from './detractors';
import { themeMentions, type ThemeCount } from './voc';
import { themeHistory, whatChanged, type ThemeChange } from './themes';

export interface WeekFacts {
  fw: number;
  benchmark: number;
  ltr: { cur: LtrSummary; prior: LtrSummary; avg4: LtrSummary; fytd: LtrSummary };
  regions: { region: string; s: LtrSummary; prior: LtrSummary }[];
  belowBenchmark: { region: string; s: LtrSummary }[];
  detractors: DetractorRow[];
  rootCauses: { theme: string; count: number }[];
  followUpDocumented: number;
  attrs: AttributeScore[];
  attrsPrior: AttributeScore[];
  lowestAttr: AttributeScore | null;
  ranges: { preVisit: string; inHome: string; program: string };
  mentions: ThemeCount[];
  mentionsPrior: ThemeCount[];
  changes: ThemeChange[];
  /** tagged survey comments this week */
  tagged: number;
  appointmentSubs: { key: string; count: number }[];
  /** damage/safety comments this week */
  damage: number;
  hasSurveys: boolean;
  /** every number in this object, for verification */
  numbers: number[];
}

function collect(o: unknown, out: number[]) {
  if (typeof o === 'number' && Number.isFinite(o)) out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => collect(x, out));
  else if (o && typeof o === 'object') Object.values(o).forEach((x) => collect(x, out));
}

function countBy<T>(xs: T[], key: (x: T) => string): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function weekFacts(ds: Dataset, fw: number, benchmark: number, thresholds: SampleThresholds, geo: GeoFilter = { region: null, district: null, store: null }): WeekFacts {
  const ltr = ltrSurveys(ds.surveys, geo, ds.stores);
  const weekly = byWeek(ltr);
  const geoFiltered = isGeoFiltered(geo);
  const cur = weekOf(weekly, fw);
  const ws = ltr.filter((s) => s.fw === fw);
  const rg = groupByWeek(ltr.filter((s) => s.fw === fw || s.fw === fw - 1), (s) => s.region);
  const regions = REGIONS.map((r) => ({ region: r, s: weekOf(rg.get(r) ?? new Map(), fw), prior: weekOf(rg.get(r) ?? new Map(), fw - 1) }));
  const attrsFor = (w: number) => attributeScores(ltr.filter((s) => s.fw === w), ds.attributeWeekly.filter((a) => a.fw === w), geoFiltered);
  const attrs = attrsFor(fw);
  const dets = detractorRows(ws, ds.followups, ds.tags, ds.stores, todayISO());
  const weekTags = ws.map((s) => ds.tags.get(s.id)).filter((t): t is NonNullable<typeof t> => !!t);
  const h = themeHistory(ds.tagList);
  const f: Omit<WeekFacts, 'numbers'> = {
    fw, benchmark,
    ltr: { cur, prior: weekOf(weekly, fw - 1), avg4: baseline(weekly, fw, 'avg4').summary, fytd: poolWeeks(weekly, 1, fw) },
    regions,
    belowBenchmark: regions.filter((r) => r.s.n >= 10 && r.s.pct !== null && r.s.pct < benchmark && canColor(r.s.n, thresholds)).sort((a, b) => regionSortKey(a.region) - regionSortKey(b.region)),
    detractors: dets,
    rootCauses: rootCauseMix(dets),
    followUpDocumented: dets.filter((d) => d.followUp === 'Documented').length,
    attrs, attrsPrior: attrsFor(fw - 1), lowestAttr: lowest(attrs),
    ranges: { preVisit: rangeLabel(groupRange(attrs, 'Pre-visit')), inHome: rangeLabel(groupRange(attrs, 'In-home')), program: rangeLabel(groupRange(attrs, 'Program')) },
    mentions: themeMentions(ds.tagList, fw),
    mentionsPrior: themeMentions(ds.tagList, fw - 1),
    changes: whatChanged(h, fw),
    tagged: weekTags.length,
    appointmentSubs: countBy(weekTags.filter((t) => t.primary === 'appointment'), (t) => t.subTag ?? '—'),
    damage: weekTags.filter((t) => t.primary === 'damage' || t.secondary.includes('damage')).length,
    hasSurveys: ws.length > 0,
  };
  const numbers: number[] = [];
  collect(f, numbers);
  // derived shares that text commonly quotes
  if (cur.n) numbers.push((100 * cur.detractors) / cur.n);
  for (const r of [f.ltr.prior, f.ltr.avg4, f.ltr.fytd]) if (r.pct !== null && cur.pct !== null) numbers.push(cur.pct - r.pct, Math.abs(cur.pct - r.pct));
  if (cur.pct !== null) numbers.push(cur.pct - benchmark, Math.abs(cur.pct - benchmark));
  for (const c of f.changes) numbers.push(Math.abs(c.dPrior));
  return { ...f, numbers };
}

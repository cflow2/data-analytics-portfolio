/** Everything computed for one fiscal week, in one object. Generated text may only use numbers from here. */
import type { Dataset } from '@/data/dataset';
import type { LtrSummary, SampleThresholds } from '@/lib/ltr';
import { canColor } from '@/lib/ltr';
import { todayISO } from '@/lib/dates';
import { REGIONS, regionSortKey } from '@/domain/geo';
import { baseline, byWeek, groupByWeek, ltrSurveys, poolWeeks, weekOf, type GeoFilter } from './ltr';
import { attributeScores, groupRange, lowest, rangeLabel, type AttributeScore } from './attributes';
import { detractorRows, rootCauseMix, type DetractorRow } from './detractors';
import { callKpis, themeMentions, type CallKpis, type ThemeCount } from './voc';
import { themeHistory, whatChanged, type ThemeChange } from './themes';
import { countBy } from './calls';

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
  calls: CallKpis;
  callsPrior: CallKpis;
  avoidable: number;
  tagged: number;
  appointmentSubs: { key: string; count: number }[];
  cancelDrivers: { key: string; count: number }[];
  refundDisputes: number;
  damageUnescalated: number;
  topDrivers: { key: string; count: number }[];
  hasSurveys: boolean;
  hasCalls: boolean;
  /** every number in this object, for verification */
  numbers: number[];
}

function collect(o: unknown, out: number[]) {
  if (typeof o === 'number' && Number.isFinite(o)) out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => collect(x, out));
  else if (o && typeof o === 'object') Object.values(o).forEach((x) => collect(x, out));
}

export function weekFacts(ds: Dataset, fw: number, benchmark: number, thresholds: SampleThresholds, geo: GeoFilter = { region: null, district: null, store: null }): WeekFacts {
  const ltr = ltrSurveys(ds.surveys, geo, ds.stores);
  const weekly = byWeek(ltr);
  const geoFiltered = !!(geo.region || geo.district || geo.store);
  const cur = weekOf(weekly, fw);
  const ws = ltr.filter((s) => s.fw === fw);
  const rg = groupByWeek(ltr.filter((s) => s.fw === fw || s.fw === fw - 1), (s) => s.region);
  const regions = REGIONS.map((r) => ({ region: r, s: weekOf(rg.get(r) ?? new Map(), fw), prior: weekOf(rg.get(r) ?? new Map(), fw - 1) }));
  const attrsFor = (w: number) => attributeScores(ltr.filter((s) => s.fw === w), ds.attributeWeekly.filter((a) => a.fw === w), geoFiltered);
  const attrs = attrsFor(fw);
  const dets = detractorRows(ws, ds.followups, ds.tags, ds.stores, todayISO());
  const custIds = new Set(ds.calls.filter((c) => !c.isAssociate).map((c) => c.id));
  const calls = ds.calls.filter((c) => c.fw === fw);
  const customerTags = calls.filter((c) => !c.isAssociate).map((c) => ds.tags.get(c.id)).filter((t): t is NonNullable<typeof t> => !!t);
  const h = themeHistory(ds.tagList, custIds);
  const validated = new Set(ds.signals.filter((x) => x.validated).map((x) => x.theme));
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
    mentions: themeMentions(ds.tagList, fw, custIds),
    mentionsPrior: themeMentions(ds.tagList, fw - 1, custIds),
    changes: whatChanged(h, fw, (th) => validated.has(th)),
    calls: callKpis(calls, ds.tags),
    callsPrior: callKpis(ds.calls.filter((c) => c.fw === fw - 1), ds.tags),
    avoidable: customerTags.filter((t) => t.contactType === 'Avoidable').length,
    tagged: customerTags.length,
    appointmentSubs: countBy(customerTags.filter((t) => t.primary === 'appointment'), (t) => t.subTag ?? '—'),
    cancelDrivers: countBy(customerTags.filter((t) => t.cancellation), (t) => t.primary),
    refundDisputes: customerTags.filter((t) => t.subTag === 'Refund dispute').length,
    damageUnescalated: calls.filter((c) => { const t = ds.tags.get(c.id); const e = ds.escalations.get(c.id); return t && (t.primary === 'damage' || t.escalate) && (!e || e.status === 'New'); }).length,
    topDrivers: countBy(calls.filter((c) => !c.isAssociate), (c) => c.driverNorm || c.driver).slice(0, 5),
    hasSurveys: ws.length > 0,
    hasCalls: calls.length > 0,
  };
  const numbers: number[] = [];
  collect(f, numbers);
  // derived shares that text commonly quotes
  if (f.calls.cancellations) numbers.push((100 * f.calls.exclusionCancels) / f.calls.cancellations);
  if (f.tagged) numbers.push((100 * f.avoidable) / f.tagged);
  if (cur.n) numbers.push((100 * cur.detractors) / cur.n);
  for (const r of [f.ltr.prior, f.ltr.avg4, f.ltr.fytd]) if (r.pct !== null && cur.pct !== null) numbers.push(cur.pct - r.pct, Math.abs(cur.pct - r.pct));
  if (cur.pct !== null) numbers.push(cur.pct - benchmark, Math.abs(cur.pct - benchmark));
  for (const m of f.mentions) numbers.push(m.surveys + m.calls);
  for (const c of f.changes) numbers.push(Math.abs(c.dCallsPrior), Math.abs(c.dSurveysPrior));
  return { ...f, numbers };
}

/** Daily pulse: what the surveys said since the last business day, in ~60 seconds. */
import type { Dataset } from '@/data/dataset';
import { addDays, dayName, monthDay, weekday, type ISODate } from '@/lib/dates';
import { fiscalWeek } from '@/lib/fiscal';
import { countsForLtr } from '@/domain/survey';
import { storeLabel } from '@/domain/geo';
import { ltrSummary, type LtrSummary } from '@/lib/ltr';
import type { SurveyRecord } from '@/domain/types';
import { subsPulse, type SubsPulse, type SubsGeo } from '@/analytics/subscriptions';

export interface PulseFacts {
  date: ISODate;
  from: ISODate;
  to: ISODate;
  periodLabel: string;
  /** LTR surveys dated in the period */
  surveys: SurveyRecord[];
  period: LtrSummary;
  comments: number;
  topThemes: { key: string; count: number }[];
  /** 0–8 scores in the period, lowest first */
  detractors: { s: SurveyRecord; store: string; cause: string | null }[];
  /** comments tagged damage/safety in the period */
  damage: { s: SurveyRecord; store: string }[];
  /** the fiscal week the period ends in, to date */
  wtd: { fw: number; s: LtrSummary; allowed: number };
  benchmark: number;
  watch: string;
  /** subscriptions from the latest subscription export covering the period; null when none is loaded */
  subs: SubsPulse | null;
  hasData: boolean;
  numbers: number[];
}

/** Monday covers Saturday–Sunday; any other day covers the day before. */
export function pulsePeriod(date: ISODate): { from: ISODate; to: ISODate; label: string } {
  if (weekday(date) === 1) { const from = addDays(date, -2), to = addDays(date, -1); return { from, to, label: `the weekend (Sat ${monthDay(from)}–Sun ${monthDay(to)})` }; }
  const d = addDays(date, -1);
  return { from: d, to: d, label: `yesterday (${dayName(d)} ${monthDay(d)})` };
}

function countBy<T>(xs: T[], key: (x: T) => string): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function pulseFacts(ds: Dataset, date: ISODate, benchmark = 93, fyStart?: ISODate, geo: SubsGeo = {}): PulseFacts {
  const p = pulsePeriod(date);
  const inP = (d: ISODate) => d >= p.from && d <= p.to;
  const tname = (id: string) => ds.taxonomy.find((t) => t.id === id)?.name ?? id;
  const ltr = ds.surveys.filter(countsForLtr);
  const surveys = ltr.filter((s) => inP(s.date) && s.ltr !== null);
  const tags = surveys.map((s) => ds.tags.get(s.id)).filter((t): t is NonNullable<typeof t> => !!t);
  const dets = surveys.filter((s) => s.ltr! <= 8).sort((a, b) => a.ltr! - b.ltr!);
  const damage = surveys.filter((s) => { const t = ds.tags.get(s.id); return t && (t.primary === 'damage' || t.escalate); })
    .map((s) => ({ s, store: storeLabel(s.storeNo, ds.stores) }));
  const topThemes = countBy(tags.filter((t) => t.primary !== 'other'), (t) => t.primary).slice(0, 3).map((x) => ({ key: tname(x.key), count: x.count }));
  const fw = fiscalWeek(p.to, fyStart);
  const wtdS = ltrSummary(ltr.filter((s) => s.fw === fw && s.date <= p.to).map((s) => s.ltr));
  const wtd = { fw, s: wtdS, allowed: Math.floor(wtdS.n * 0.07 + 1e-9) };
  // One thing to watch: damage → a 0–6 that needs a 48-hour follow-up → a region with 2+ low scores → week to date below benchmark.
  const zeroSix = dets.find((s) => s.ltr! <= 6);
  const byRegion = countBy(dets, (s) => s.region).find((x) => x.count >= 2);
  let watch = 'Nothing unusual in yesterday’s surveys.';
  if (damage.length) watch = `${damage.length} comment${damage.length === 1 ? '' : 's'} mention${damage.length === 1 ? 's' : ''} damage or safety; make sure Field Support has ${damage.length === 1 ? 'it' : 'them'}.`;
  else if (zeroSix) watch = `The ${zeroSix.ltr} at ${storeLabel(zeroSix.storeNo, ds.stores)}: make sure the store follows up within 48 hours.`;
  else if (byRegion) watch = `${byRegion.key} had ${byRegion.count} scores of 0–8.`;
  else if (wtdS.pct !== null && wtdS.pct < benchmark) watch = `FW${fw} is at ${wtdS.pct.toFixed(1)}% so far, below ${benchmark}.`;
  const subs = subsPulse(ds.subscriptionSnapshots ?? [], ds.subscriptionWeeks ?? [], p.from, p.to, geo, fyStart);
  const f: Omit<PulseFacts, 'numbers'> = {
    date, from: p.from, to: p.to, periodLabel: p.label, surveys, period: ltrSummary(surveys.map((s) => s.ltr)),
    comments: surveys.filter((s) => s.comment.trim()).length, topThemes,
    detractors: dets.map((s) => ({ s, store: storeLabel(s.storeNo, ds.stores), cause: ds.tags.get(s.id)?.primary && ds.tags.get(s.id)!.primary !== 'other' ? tname(ds.tags.get(s.id)!.primary) : null })),
    damage, wtd, benchmark, watch, subs, hasData: surveys.length > 0 || !!subs,
  };
  const numbers = [surveys.length, f.period.promoters, f.period.detractors, f.period.detractors0to6, f.comments, ...topThemes.map((x) => x.count), dets.length, ...dets.map((s) => s.ltr!),
    damage.length, fw, wtdS.n, wtdS.detractors, wtd.allowed, Math.max(0, wtd.allowed - wtdS.detractors), ...(wtdS.pct !== null ? [wtdS.pct] : []), ...(f.period.pct !== null ? [f.period.pct] : []),
    ...(byRegion ? [byRegion.count] : []), ...dets.map((s) => Number(s.storeNo)), benchmark, 48];
  if (subs) {
    const sp = subs.samePointLastWeek;
    numbers.push(subs.fw, subs.fw - 1, subs.days, subs.wtd.subs, subs.wtd.instore, subs.wtd.online, subs.priorWeekFull.subs, subs.priorWeekFull.instore,
      ...(subs.period ? [subs.period.subs, subs.period.instore, subs.period.online] : []), ...(sp ? [sp.subs, sp.instore, Math.abs(subs.wtd.subs - sp.subs)] : []),
      ...(sp && sp.subs ? [Math.round((100 * (subs.wtd.subs - sp.subs)) / sp.subs), Math.abs(Math.round((100 * (subs.wtd.subs - sp.subs)) / sp.subs))] : []),
      ...subs.topInstore.flatMap((t) => [t.instore, Number(t.storeNo)]));
  }
  return { ...f, numbers };
}

/** ~60 seconds spoken (≈ 130–160 words). Store numbers only, never names. */
export function pulseScript(f: PulseFacts): string {
  if (!f.hasData) return `No surveys or subscriptions are loaded for ${f.periodLabel}.`;
  const lines: string[] = [`Good morning. Here’s the HomeCare+ pulse for ${f.periodLabel}.`];
  const n = f.surveys.length;
  if (n === 0) lines.push('No surveys came in.');
  else lines.push(`${n} survey${n === 1 ? '' : 's'} came in${f.period.pct !== null ? `, ${f.period.promoters} of them 9s and 10s (${f.period.pct.toFixed(1)}%)` : ''}${f.topThemes.length ? `; comments were mostly about ${f.topThemes.map((t) => `${t.key.toLowerCase()} (${t.count})`).join(', ')}` : ''}.`);
  if (n === 0) { /* nothing to say about scores */ } else if (f.detractors.length) {
    const art = (x: number) => (x === 8 || x === 11 || x === 18 ? 'an' : 'a');
    const d = f.detractors.slice(0, 3).map((x) => `${art(x.s.ltr!)} ${x.s.ltr} at store ${x.s.storeNo}${x.cause ? ` about ${x.cause.toLowerCase()}` : ''}`);
    lines.push(`${f.detractors.length} scored 0 to 8: ${d.join('; ')}${f.detractors.length > 3 ? '; the rest are on the Detractors screen' : ''}.`);
  } else lines.push('No scores of 0 to 8.');
  if (f.damage.length) lines.push(`${f.damage.length} comment${f.damage.length === 1 ? '' : 's'} mention${f.damage.length === 1 ? 's' : ''} damage or safety.`);
  const w = f.wtd;
  if (w.s.pct !== null) {
    const left = w.allowed - w.s.detractors;
    lines.push(`FW${w.fw} so far: ${w.s.pct.toFixed(1)}% on ${w.s.n} surveys, ${w.s.pct >= f.benchmark ? 'at or above' : 'below'} ${f.benchmark}. ${w.s.detractors} scored 0 to 8 against ${w.allowed} allowed at ${f.benchmark}${left > 0 ? `, so ${left} to spare` : left === 0 ? ', with none to spare' : `, ${-left} over`}.`);
  }
  const sub = subsSentence(f.subs, f.periodLabel);
  if (sub) lines.push(sub);
  lines.push(`One thing to watch: ${f.watch}`);
  return lines.join(' ');
}

/** “We added 214 net subscriptions yesterday, 21 in store. FW43 to date: 662 (59 in store) after 4 days, vs 540 at the same point last week.” */
export function subsSentence(s: SubsPulse | null, periodLabel: string): string | null {
  if (!s) return null;
  const parts: string[] = [];
  const when = periodLabel.startsWith('the weekend') ? 'over the weekend' : 'yesterday';
  if (s.period) parts.push(`Subscriptions: we added ${s.period.subs} net ${when}, ${s.period.instore} in store.`);
  else parts.push('Subscriptions:');
  const sp = s.samePointLastWeek;
  const cmp = sp
    ? `, ${s.wtd.subs >= sp.subs ? 'up' : 'down'} ${Math.abs(s.wtd.subs - sp.subs)}${sp.subs ? ` (${Math.abs(Math.round((100 * (s.wtd.subs - sp.subs)) / sp.subs))}%)` : ''} from ${sp.subs} at the same point last week`
    : `; FW${s.fw - 1} finished with ${s.priorWeekFull.subs}`;
  parts.push(`FW${s.fw} to date: ${s.wtd.subs} (${s.wtd.instore} in store) after ${s.days} day${s.days === 1 ? '' : 's'}${cmp}.`);
  if (s.topInstore.length) parts.push(`Most in-store sales: ${s.topInstore.slice(0, 2).map((t) => `store ${Number(t.storeNo)} with ${t.instore}`).join(' and ')}.`);
  return parts.join(' ').replace('Subscriptions: FW', 'Subscriptions: FW');
}

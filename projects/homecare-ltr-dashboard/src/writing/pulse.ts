/** Daily pulse: what happened since the last business day, in ~60 seconds. */
import type { Dataset } from '@/data/dataset';
import { addDays, dayName, monthDay, weekday, type ISODate } from '@/lib/dates';
import { countBy } from '@/analytics/calls';
import { countsForLtr } from '@/domain/survey';
import { storeLabel } from '@/domain/geo';
import type { CallRecord, SurveyRecord } from '@/domain/types';

export interface PulseFacts {
  date: ISODate;
  from: ISODate;
  to: ISODate;
  periodLabel: string;
  calls: CallRecord[];
  associateCalls: number;
  topDrivers: { key: string; count: number }[];
  topThemes: { key: string; count: number }[];
  detractors: { s: SurveyRecord; store: string; cause: string | null }[];
  damage: { c: CallRecord; store: string; escalated: boolean }[];
  cancellations: number;
  exclusionCancels: number;
  watch: string;
  hasData: boolean;
  numbers: number[];
}

/** Monday covers Saturday–Sunday; any other day covers the day before. */
export function pulsePeriod(date: ISODate): { from: ISODate; to: ISODate; label: string } {
  if (weekday(date) === 1) { const from = addDays(date, -2), to = addDays(date, -1); return { from, to, label: `the weekend (Sat ${monthDay(from)}–Sun ${monthDay(to)})` }; }
  const d = addDays(date, -1);
  return { from: d, to: d, label: `yesterday (${dayName(d)} ${monthDay(d)})` };
}

export function pulseFacts(ds: Dataset, date: ISODate): PulseFacts {
  const p = pulsePeriod(date);
  const inP = (d: ISODate) => d >= p.from && d <= p.to;
  const tname = (id: string) => ds.taxonomy.find((t) => t.id === id)?.name ?? id;
  const all = ds.calls.filter((c) => inP(c.date));
  const calls = all.filter((c) => !c.isAssociate);
  const tags = calls.map((c) => ds.tags.get(c.id)).filter((t): t is NonNullable<typeof t> => !!t);
  const dets = ds.surveys.filter((s) => inP(s.date) && countsForLtr(s) && s.ltr !== null && s.ltr < 9).sort((a, b) => a.ltr! - b.ltr!);
  const damage = calls.filter((c) => { const t = ds.tags.get(c.id); return t && (t.primary === 'damage' || t.escalate); })
    .map((c) => ({ c, store: c.storeNo ? storeLabel(c.storeNo, ds.stores) : 'store not stated', escalated: (ds.escalations.get(c.id)?.status ?? 'New') !== 'New' }));
  const cancels = tags.filter((t) => t.cancellation);
  const topThemes = countBy(tags.filter((t) => t.primary !== 'other'), (t) => t.primary).slice(0, 3).map((x) => ({ key: tname(x.key), count: x.count }));
  // One thing to watch
  const days = p.from === p.to ? 1 : 2;
  const prior = ds.calls.filter((c) => !c.isAssociate && c.date < p.from && c.date >= addDays(p.from, -7));
  const priorDays = new Set(prior.map((c) => c.date)).size || 1;
  const spike = countBy(tags.filter((t) => t.primary !== 'other'), (t) => t.primary).map((x) => {
    const avg = prior.filter((c) => ds.tags.get(c.id)?.primary === x.key).length / priorDays * days;
    return { ...x, avg, ratio: avg ? x.count / avg : x.count };
  }).filter((x) => x.count >= 3 && x.ratio >= 1.5).sort((a, b) => b.ratio - a.ratio)[0];
  const unesc = damage.filter((d) => !d.escalated).length;
  const zeroSix = dets.find((s) => s.ltr! <= 6);
  let watch = 'Nothing unusual: volumes and themes are in their normal range.';
  if (unesc) watch = `${unesc} damage call${unesc === 1 ? '' : 's'} still need${unesc === 1 ? 's' : ''} escalation to Field Support.`;
  else if (spike) watch = `${tname(spike.key)} calls: ${spike.count} vs about ${Math.round(spike.avg)} on a typical ${days === 1 ? 'day' : 'weekend'}.`;
  else if (zeroSix) watch = `The ${zeroSix.ltr} score at ${storeLabel(zeroSix.storeNo, ds.stores)}: make sure the store follows up within 48 hours.`;
  const f: Omit<PulseFacts, 'numbers'> = {
    date, from: p.from, to: p.to, periodLabel: p.label, calls, associateCalls: all.length - calls.length,
    topDrivers: countBy(calls, (c) => c.driverNorm || c.driver).slice(0, 3), topThemes,
    detractors: dets.map((s) => ({ s, store: storeLabel(s.storeNo, ds.stores), cause: ds.tags.get(s.id)?.primary ? tname(ds.tags.get(s.id)!.primary) : null })),
    damage, cancellations: cancels.length, exclusionCancels: cancels.filter((t) => t.primary === 'exclusions').length,
    watch, hasData: all.length > 0 || dets.length > 0,
  };
  const numbers = [calls.length, f.associateCalls, ...f.topDrivers.map((x) => x.count), ...topThemes.map((x) => x.count), dets.length, ...dets.map((s) => s.ltr!), damage.length, unesc,
    f.cancellations, f.exclusionCancels, ...(spike ? [spike.count, Math.round(spike.avg)] : []), ...dets.map((s) => Number(s.storeNo)), 48];
  return { ...f, numbers };
}

/** ~60 seconds spoken (≈ 130–160 words). Store numbers only, never names. */
export function pulseScript(f: PulseFacts): string {
  if (!f.hasData) return `No calls or surveys are loaded for ${f.periodLabel}.`;
  const lines: string[] = [`Good morning. Here’s the HomeCare+ pulse for ${f.periodLabel}.`];
  if (f.calls.length) lines.push(`We took ${f.calls.length} customer call${f.calls.length === 1 ? '' : 's'}${f.topThemes.length ? `, led by ${f.topThemes.map((t) => `${t.key.toLowerCase()} (${t.count})`).join(', ')}` : ''}.`);
  else lines.push('No customer calls are loaded for that period.');
  if (f.detractors.length) {
    const art = (n: number) => (n === 8 || n === 11 || n === 18 ? 'an' : 'a');
    const d = f.detractors.slice(0, 3).map((x) => `${art(x.s.ltr!)} ${x.s.ltr} at store ${x.s.storeNo}${x.cause ? ` about ${x.cause.toLowerCase()}` : ''}`);
    lines.push(`${f.detractors.length} new detractor${f.detractors.length === 1 ? '' : 's'}: ${d.join('; ')}${f.detractors.length > 3 ? '; and more on the Detractors screen' : ''}.`);
  } else lines.push('No new detractors.');
  if (f.damage.length) lines.push(`${f.damage.length} damage or safety call${f.damage.length === 1 ? '' : 's'}${f.damage.some((x) => !x.escalated) ? `, ${f.damage.filter((x) => !x.escalated).length} not yet escalated` : ', all escalated'}.`);
  if (f.cancellations) lines.push(`${f.cancellations} cancellation call${f.cancellations === 1 ? '' : 's'}, ${f.exclusionCancels} driven by service exclusions.`);
  lines.push(`One thing to watch: ${f.watch}`);
  return lines.join(' ');
}

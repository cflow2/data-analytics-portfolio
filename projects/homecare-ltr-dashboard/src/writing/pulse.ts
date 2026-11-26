/**
 * HomeCare+ Daily Pulse: a spoken morning update of at most two minutes (≈300 words at 150 words a minute).
 * Spec: docs/DAILY_PULSE_PROMPT.md. Every number comes from the loaded data and is registered for verification;
 * when something isn't loaded the script says so instead of guessing. On Fridays a week recap is added.
 * Comments are quoted from the redacted text only; customer names never appear.
 */
import type { Dataset } from '@/data/dataset';
import { addDays, diffDays, weekday, type ISODate } from '@/lib/dates';
import { fiscalWeek, weekStart } from '@/lib/fiscal';
import { storeCity, storeLabel } from '@/domain/geo';
import { ltrSummary, type LtrSummary } from '@/lib/ltr';
import type { SurveyRecord } from '@/domain/types';
import { ltrSurveys } from '@/analytics/ltr';
import { detractorRows } from '@/analytics/detractors';
import { subsPulse, type SubsPulse, type SubsGeo } from '@/analytics/subscriptions';
import { extractNumbers } from './verify';

/** Two minutes at 150 words a minute. */
export const PULSE_MAX_WORDS = 300;
export const WORDS_PER_MINUTE = 150;

const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (d: ISODate) => `${DAY_LONG[weekday(d)]}, ${MONTH_LONG[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;

export interface ThemeCount { id: string; name: string; count: number }
export interface Highlight { s: SurveyRecord; store: string; quote: string }
export interface AssociateStar { name: string; storeNo: string; promoters: number; surveys: number }

export interface PulseFacts {
  /** meeting date */
  date: ISODate;
  /** fiscal week and day (1 = Saturday) of the meeting date */
  meeting: { fw: number; day: number };
  isFriday: boolean;
  from: ISODate;
  to: ISODate;
  periodLabel: string;
  /** LTR surveys dated in the period */
  surveys: SurveyRecord[];
  period: LtrSummary;
  /** the day before the period (Friday, when the period is the weekend) */
  prevDay: { date: ISODate; s: LtrSummary };
  comments: number;
  topThemes: { key: string; count: number }[];
  /** 0–8 scores in the period, lowest first: root cause (with sub-tag) and a short summary of the redacted comment */
  detractors: { s: SurveyRecord; store: string; cause: string | null; summary: string | null }[];
  /** store number → “City, ST” from every loaded file */
  storeNames: Map<string, string>;
  /** comments tagged damage/safety in the period */
  damage: { s: SurveyRecord; store: string }[];
  /** the fiscal week the period ends in, to date, and the same days of the week before */
  wtd: {
    fw: number; from: ISODate; days: number; s: LtrSummary; samePoint: LtrSummary;
    /** 0–8 allowed at 93 on the surveys so far */
    allowed: number;
    /** average surveys in the 4 weeks before; 0–8 a week that size can take at the benchmark, and how many are left */
    typicalN: number | null; typicalAllowed: number | null; left: number | null;
  };
  fytd: LtrSummary;
  /** the four completed weeks before this one, oldest first */
  last4: { fw: number; s: LtrSummary }[];
  trend: 'upward' | 'downward' | 'stable' | null;
  promoterHighlights: Highlight[];
  /** week to date: associates with 2+ promoters and no 0–8 */
  associateStars: AssociateStar[];
  associatesLoaded: boolean;
  /** root causes of the period's 0–8 (tagged only) and how many weren't tagged */
  periodCauses: ThemeCount[];
  periodUntagged: number;
  /** root causes of the week's 0–8 so far */
  wtdCauses: ThemeCount[];
  /** themes running well above the same point of a typical week (potential concern) */
  emerging: (ThemeCount & { typical: number })[];
  /** week to date: comments tagged as a missed appointment / no-show */
  missed: number;
  /** detractors from the last 14 days with no documented store contact 48+ hours after the survey */
  overdue: { count: number; oldest: { storeNo: string; days: number } | null };
  /** appointments dated on the meeting day in the appointment file; null when no schedule for today or later is loaded */
  appointmentsToday: { n: number; byRegion: { key: string; count: number }[] } | null;
  /** regions with 10+ surveys this week to date that are below the benchmark */
  regionsBelow: { region: string; s: LtrSummary }[];
  benchmark: number;
  watch: string;
  /** subscriptions from the latest subscription export covering the period; null when none is loaded */
  subs: SubsPulse | null;
  hasData: boolean;
}

/** Monday covers Saturday–Sunday; any other day covers the day before. */
export function pulsePeriod(date: ISODate): { from: ISODate; to: ISODate; label: string } {
  if (weekday(date) === 1) { const from = addDays(date, -2), to = addDays(date, -1); return { from, to, label: `the weekend (Sat ${short(from)}–Sun ${short(to)})` }; }
  const d = addDays(date, -1);
  return { from: d, to: d, label: `yesterday (${DAY_LONG[weekday(d)].slice(0, 3)} ${short(d)})` };
}
const short = (d: ISODate) => `${MONTH_LONG[+d.slice(5, 7) - 1].slice(0, 3)} ${+d.slice(8, 10)}`;

function countBy<T>(xs: T[], key: (x: T) => string): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** First sentence or two of a comment, at most ~25 words. */
export function shortQuote(text: string, maxWords = 25): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const sentences = t.match(/[^.!?]+[.!?]*/g) ?? [t];
  let out = '';
  for (const s of sentences) {
    const next = (out + ' ' + s.trim()).trim();
    if (next.split(' ').length > maxWords) break;
    out = next;
  }
  if (!out) out = t.split(' ').slice(0, maxWords).join(' ') + '…';
  return out;
}

/**
 * What a detractor said, in a few words: the first sentence of the redacted comment (≤ 14 words), with redaction
 * tokens like [name] removed so it reads aloud cleanly. Null when there's no comment.
 */
export function detractorSummary(comment: string): string | null {
  const t = comment.replace(/\[(name|phone|email|address|order#)\]/gi, '').replace(/\s+([,.;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  if (!t || /^(n\/?a|none|no comments?)\.?$/i.test(t)) return null;
  return shortQuote(t, 14).replace(/[,;:]$/, '');
}

/** Four completed weeks: a least-squares change of 1 point or more across them counts as a trend. */
export function trendOf(weeks: { s: LtrSummary }[]): 'upward' | 'downward' | 'stable' | null {
  const pts = weeks.map((w, i) => [i, w.s.pct] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 3) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  const change = slope * (pts[pts.length - 1][0] - pts[0][0]);
  return change >= 1 ? 'upward' : change <= -1 ? 'downward' : 'stable';
}

export function pulseFacts(ds: Dataset, date: ISODate, benchmark = 93, fyStart?: ISODate, geo: SubsGeo = {}): PulseFacts {
  const p = pulsePeriod(date);
  const inP = (d: ISODate) => d >= p.from && d <= p.to;
  const tname = (id: string) => ds.taxonomy.find((t) => t.id === id)?.name ?? id;
  const ltr = ltrSurveys(ds.surveys, { division: geo.division ?? null, region: geo.region ?? null, district: geo.district ?? null, store: geo.store ?? null }, ds.stores).filter((s) => s.ltr !== null);
  const sum = (xs: SurveyRecord[]) => ltrSummary(xs.map((s) => s.ltr));
  const surveys = ltr.filter((s) => inP(s.date));
  const tagOf = (s: SurveyRecord) => ds.tags.get(s.id);
  const cause = (s: SurveyRecord) => { const t = tagOf(s); return t && t.primary !== 'other' ? t.primary : null; };
  const dets = surveys.filter((s) => s.ltr! <= 8).sort((a, b) => a.ltr! - b.ltr!);
  const damage = surveys.filter((s) => { const t = tagOf(s); return t && (t.primary === 'damage' || t.escalate); }).map((s) => ({ s, store: storeLabel(s.storeNo, ds.stores) }));
  const topThemes = countBy(surveys.map(tagOf).filter((t): t is NonNullable<typeof t> => !!t && t.primary !== 'other'), (t) => t.primary).slice(0, 3).map((x) => ({ key: tname(x.key), count: x.count }));

  // Previous day, week to date vs the same days last week, fiscal year to date, last four completed weeks.
  const prevDate = addDays(p.from, -1);
  const prevDay = { date: prevDate, s: sum(ltr.filter((s) => s.date === prevDate)) };
  const fw = fiscalWeek(p.to, fyStart);
  const wFrom = weekStart(fw, fyStart);
  const days = diffDays(p.to, wFrom) + 1;
  const weekSoFar = ltr.filter((s) => s.fw === fw && s.date <= p.to);
  const wtdS = sum(weekSoFar);
  const samePointOf = (k: number) => ltr.filter((s) => s.fw === fw - k && s.date <= addDays(weekStart(fw - k, fyStart), days - 1));
  const samePoint = sum(samePointOf(1));
  const prevNs = [1, 2, 3, 4].map((k) => ltr.filter((s) => s.fw === fw - k).length).filter((n) => n > 0);
  const typicalN = prevNs.length ? Math.round(prevNs.reduce((a, n) => a + n, 0) / prevNs.length) : null;
  const typicalAllowed = typicalN === null ? null : Math.floor((Math.max(typicalN, wtdS.n) * (100 - benchmark)) / 100 + 1e-9);
  const wtd = {
    fw, from: wFrom, days, s: wtdS, samePoint, allowed: Math.floor((wtdS.n * (100 - benchmark)) / 100 + 1e-9),
    typicalN, typicalAllowed, left: typicalAllowed === null ? null : typicalAllowed - wtdS.detractors,
  };
  const fyFrom = fyStart ?? weekStart(1);
  const fytd = sum(ltr.filter((s) => s.date >= fyFrom && s.date <= p.to));
  const last4 = [4, 3, 2, 1].map((k) => ({ fw: fw - k, s: sum(ltr.filter((s) => s.fw === fw - k)) })).filter((w) => w.fw >= 1);

  // Promoter highlights: specific, readable comments from the period (redacted text; nothing with a redaction token).
  const promoterHighlights = surveys
    .filter((s) => s.ltr! >= 9 && s.comment.trim() && !/\[/.test(s.comment))
    .map((s) => ({ s, words: s.comment.trim().split(/\s+/).length, assoc: tagOf(s)?.primary === 'associate' }))
    .filter((x) => x.words >= 6)
    .sort((a, b) => Number(b.assoc) - Number(a.assoc) || Math.abs(a.words - 20) - Math.abs(b.words - 20) || a.s.id.localeCompare(b.s.id))
    .reduce<Highlight[]>((acc, x) => (acc.length < 2 && !acc.some((h) => h.s.storeNo === x.s.storeNo) ? [...acc, { s: x.s, store: storeLabel(x.s.storeNo, ds.stores), quote: shortQuote(x.s.comment) }] : acc), []);

  // Associates this week with 2+ promoters and no 0–8.
  const byAssoc = new Map<string, { storeNo: string; promoters: number; surveys: number; dets: number }>();
  for (const s of weekSoFar) {
    if (!s.associate) continue;
    const v = byAssoc.get(s.associate) ?? { storeNo: s.storeNo, promoters: 0, surveys: 0, dets: 0 };
    v.surveys++; if (s.ltr! >= 9) v.promoters++; else v.dets++;
    byAssoc.set(s.associate, v);
  }
  const associateStars = [...byAssoc].filter(([, v]) => v.promoters >= 2 && v.dets === 0)
    .map(([name, v]) => ({ name, storeNo: v.storeNo, promoters: v.promoters, surveys: v.surveys }))
    .sort((a, b) => b.promoters - a.promoters || a.name.localeCompare(b.name)).slice(0, 3);

  const themeCounts = (xs: SurveyRecord[]): ThemeCount[] => countBy(xs.map(cause).filter((c): c is string => !!c), (c) => c).map((x) => ({ id: x.key, name: tname(x.key), count: x.count }));
  const periodCauses = themeCounts(dets);
  const wtdDets = weekSoFar.filter((s) => s.ltr! <= 8);
  const wtdCauses = themeCounts(wtdDets);
  // Emerging: 3+ so far and at least double the average at the same point of the 4 weeks before.
  const priorSame = [1, 2, 3, 4].map((k) => samePointOf(k).filter((s) => s.ltr! <= 8)).filter((_, i) => fw - (i + 1) >= 1);
  const emerging = wtdCauses.map((t) => ({ ...t, typical: priorSame.length ? priorSame.reduce((a, xs) => a + xs.filter((s) => cause(s) === t.id).length, 0) / priorSame.length : 0 }))
    .filter((t) => priorSame.length >= 2 && t.count >= 3 && t.count >= 2 * Math.max(t.typical, 0.5));
  const missed = wtdDets.filter((s) => tagOf(s)?.subTag === 'No-show/missed').length;

  const recent = ltr.filter((s) => s.date >= addDays(date, -14) && s.date <= p.to);
  const overdueRows = detractorRows(recent, ds.followups, ds.tags, ds.stores, date).filter((r) => r.overdue);
  const oldest = overdueRows.sort((a, b) => b.daysSince - a.daysSince)[0];
  const overdue = { count: overdueRows.length, oldest: oldest ? { storeNo: oldest.storeNo, days: oldest.daysSince } : null };

  const appts = [...(ds.appointments?.values() ?? [])];
  const scheduleLoaded = appts.some((a) => a.date && a.date >= date);
  const todays = appts.filter((a) => a.date === date && (!geo.store || a.storeNo === geo.store));
  const appointmentsToday = scheduleLoaded
    ? { n: todays.length, byRegion: countBy(todays, (a) => (a.storeNo && ds.stores.get(a.storeNo)?.region) || 'Unmapped').slice(0, 2) }
    : null;

  const regionsBelow = countBy(weekSoFar, (s) => s.region).map((r) => ({ region: r.key, s: sum(weekSoFar.filter((s) => s.region === r.key)) }))
    .filter((r) => r.s.n >= 10 && r.s.pct !== null && r.s.pct < benchmark).sort((a, b) => a.s.pct! - b.s.pct!).slice(0, 3);

  // One thing to watch (screen card): damage → a 0–6 that needs a 48-hour follow-up → a region with 2+ low scores → week to date below benchmark.
  const zeroSix = dets.find((s) => s.ltr! <= 6);
  const byRegion = countBy(dets, (s) => s.region).find((x) => x.count >= 2);
  let watch = 'Nothing unusual in yesterday’s surveys.';
  if (damage.length) watch = `${damage.length} comment${damage.length === 1 ? '' : 's'} mention${damage.length === 1 ? 's' : ''} damage or safety; make sure Field Support has ${damage.length === 1 ? 'it' : 'them'}.`;
  else if (zeroSix) watch = `The ${zeroSix.ltr} at ${storeLabel(zeroSix.storeNo, ds.stores)}: make sure the store follows up within 48 hours.`;
  else if (byRegion) watch = `${byRegion.key} had ${byRegion.count} scores of 0–8.`;
  else if (wtdS.pct !== null && wtdS.pct < benchmark) watch = `FW${fw} is at ${wtdS.pct.toFixed(1)}% so far, below ${benchmark}.`;

  const subs = subsPulse(ds.subscriptionSnapshots ?? [], ds.subscriptionWeeks ?? [], p.from, p.to, geo, fyStart);
  return {
    date, meeting: { fw: fiscalWeek(date, fyStart), day: diffDays(date, weekStart(fiscalWeek(date, fyStart), fyStart)) + 1 }, isFriday: weekday(date) === 5,
    from: p.from, to: p.to, periodLabel: p.label, surveys, period: sum(surveys), prevDay,
    comments: surveys.filter((s) => s.comment.trim()).length, topThemes,
    detractors: dets.map((s) => {
      const t = tagOf(s);
      const c = cause(s);
      return { s, store: storeLabel(s.storeNo, ds.stores), cause: c ? `${tname(c)}${t?.subTag ? ` (${t.subTag})` : ''}` : null, summary: detractorSummary(s.comment) };
    }),
    storeNames: new Map([...ds.stores.values()].map((st) => [st.storeNo, storeCity(st.storeNo, ds.stores)] as const).filter(([, v]) => !!v)),
    damage, wtd, fytd, last4, trend: trendOf(last4), promoterHighlights, associateStars, associatesLoaded: (ds.appointments?.size ?? 0) > 0,
    periodCauses, periodUntagged: dets.length - periodCauses.reduce((a, t) => a + t.count, 0), wtdCauses, emerging, missed, overdue, appointmentsToday,
    regionsBelow, benchmark, watch, subs, hasData: surveys.length > 0 || !!subs,
  };
}

// ───────────────────────────── the script ─────────────────────────────

/** 1 = always kept; 2 and then 3 are dropped (lowest first, last line first) until the script fits two minutes. */
type Priority = 1 | 2 | 3;
interface Line { text: string; pri: Priority; bullet?: boolean }
interface Section { title: string | null; lines: Line[] }

export interface PulseDoc {
  /** text with **bold** markers; one paragraph per line, blank line between sections, “• ” for bullets */
  text: string;
  words: number;
  seconds: number;
  /** every number the generated text uses (for checking hand edits) */
  numbers: number[];
  /** lines left out to stay within two minutes */
  dropped: number;
}

/** Count words the way they're spoken (markers and bullets don't count). */
export const wordCount = (text: string) => plainText(text).split(/\s+/).filter((w) => /\w/.test(w)).length;
export const plainText = (text: string) => text.replace(/\*\*/g, '');

export function pulseDoc(f: PulseFacts): PulseDoc {
  const numbers: number[] = [f.benchmark, 48, 10];
  const n = (v: number, txt = v.toLocaleString('en-US')) => { numbers.push(v); return txt; };
  const pct = (s: LtrSummary) => n(s.pct!, `${s.pct!.toFixed(1)}%`);
  const plural = (k: number, one: string, many = `${one}s`) => `${n(k)} ${k === 1 ? one : many}`;
  /** “up 1.2 points” / “down 0.4 points” / “unchanged” */
  const move = (a: number, b: number) => {
    const d = Math.round((a - b) * 10) / 10;
    if (d === 0) return 'unchanged';
    numbers.push(Math.abs(a - b));
    return `${d > 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(1)} points`;
  };
  const vsBench = (v: number) => (v >= f.benchmark ? `above the ${f.benchmark} benchmark` : `below the ${f.benchmark} benchmark`);
  /** “store 2646 (Greenville, TX)”: store number and name, from every loaded file */
  const store = (no: string) => { const name = f.storeNames.get(no); return `store ${/^\d+$/.test(no) ? n(Number(no), no) : no}${name ? ` (${name})` : ''}`; };
  const storeLeader = (t: { storeNo: string; label: string; instore: number }) => {
    const name = f.storeNames.get(t.storeNo) ?? t.label.replace(/^\d+\s*/, '');
    return `store ${n(Number(t.storeNo), t.storeNo)}${name ? ` (${name})` : ''} with **${n(t.instore)}**`;
  };
  const quoteNums = (q: string) => q.replace(/\d+(?:\.\d+)?/g, (m) => n(Number(m), m));
  const an = (k: number) => (k === 8 || k === 11 || k === 18 ? 'an' : 'a');
  const weekend = f.periodLabel.startsWith('the weekend');
  const when = weekend ? 'Over the weekend' : 'Yesterday';
  const whenLower = weekend ? 'over the weekend' : 'yesterday';
  const prevName = DAY_LONG[weekday(f.prevDay.date)];
  const sections: Section[] = [];
  const sec = (title: string | null) => { const s: Section = { title, lines: [] }; sections.push(s); return s; };
  // A sentence that ends on a quote already has its punctuation: “…done.”. → “…done.”
  const add = (s: Section, pri: Priority, text: string | null | false, bullet = false) => { if (text) s.lines.push({ text: text.replace(/([.!?…])”\.$/, '$1”'), pri, bullet }); };

  if (!f.hasData) {
    return finish([{ title: null, lines: [{ text: `Good morning! There are no surveys or subscriptions loaded for ${f.periodLabel}, so there’s no Pulse to read yet.`, pri: 1 }] }], numbers);
  }

  // Opening
  const open = sec(null);
  add(open, 1, `Good morning! Here’s your HomeCare+ Pulse for ${longDate(f.date).replace(/\d+$/, (d) => n(Number(d)))} (FW${f.meeting.fw}, day ${n(f.meeting.day)} of the fiscal week).`);

  // Customer experience
  const cx = sec('Customer experience');
  const P = f.period;
  if (P.n === 0) add(cx, 1, `No surveys came in ${whenLower}.`);
  else {
    add(cx, 1, `${when} we finished with **${plural(P.n, 'survey')}**: **${n(P.promoters)} promoter${P.promoters === 1 ? '' : 's'}** (9–10) and **${n(P.detractors)} detractor${P.detractors === 1 ? '' : 's'}** (0–8).`);
    const prev = f.prevDay.s;
    const cmp = prev.pct === null ? `there were no surveys on ${prevName} to compare` : `**${move(P.pct!, prev.pct)}** from ${prevName} (${pct(prev)}${prev.n < 10 || P.n < 10 ? `, small samples` : ''})`;
    add(cx, 1, `${weekend ? 'The weekend’s' : 'Yesterday’s'} LTR was **${pct(P)}**, ${cmp}.`);
  }
  const W = f.wtd;
  if (!f.isFriday) {
    if (W.s.pct === null) add(cx, 1, `FW${W.fw} has no surveys yet.`);
    else if (weekend && W.s.n === P.n) add(cx, 1, `That’s all of FW${W.fw} so far: ${W.samePoint.pct === null ? 'there’s nothing from the same days last week to compare' : `**${move(W.s.pct, W.samePoint.pct)}** from the same ${plural(W.days, 'day')} of FW${W.fw - 1} (${pct(W.samePoint)})`}, and **${vsBench(W.s.pct)}**.`);
    else add(cx, 1, `So far in FW${W.fw} we’re at **${pct(W.s)}** on ${plural(W.s.n, 'survey')}, ${W.samePoint.pct === null ? 'with no surveys at the same point last week to compare' : `**${move(W.s.pct, W.samePoint.pct)}** from the same ${plural(W.days, 'day')} of FW${W.fw - 1} (${pct(W.samePoint)})`}, and **${vsBench(W.s.pct)}**.`);
  }
  if (f.fytd.pct !== null) {
    const t = f.trend;
    const series = f.last4.filter((w) => w.s.pct !== null);
    const trendTxt = t === null ? 'there aren’t enough completed weeks yet to call a trend'
      : `the last four weeks are **${t === 'stable' ? 'holding steady' : `trending ${t}`}** (FW${series[0].fw} ${pct(series[0].s)} to FW${series[series.length - 1].fw} ${pct(series[series.length - 1].s)})`;
    add(cx, 2, `Fiscal year to date we’re at **${pct(f.fytd)}**, and ${trendTxt}.`);
  }
  // Promoter highlights and recognition
  const [h1, h2] = f.promoterHighlights;
  const hl = (h: Highlight) => `${an(h.s.ltr!)} ${n(h.s.ltr!)} at ${store(h.s.storeNo)}${h.s.associate ? ` for **${h.s.associate}**` : ''}: “${h.quote.replace(/\d+(?:\.\d+)?/g, (m) => n(Number(m), m))}”`;
  if (h1) add(cx, 2, `Promoter highlight: ${hl(h1)}`);
  if (h2) add(cx, 3, `Another: ${hl(h2)}`);
  if (!f.isFriday) {
    if (f.associateStars.length) add(cx, 2, `Recognition: ${f.associateStars.slice(0, 2).map((a) => `**${a.name}** (${store(a.storeNo)}) has ${plural(a.promoters, 'promoter')} this week and no detractors`).join('; ')}.`);
    else if (!f.associatesLoaded) add(cx, 3, 'Associate recognition needs the appointment file, which isn’t loaded.');
  }
  // Detractor insights: confirmed root causes, recurring and emerging themes.
  if (f.detractors.length) {
    // Each detractor, lowest first: score, store number and name, root cause, and a short summary of what the member said.
    const describe = (d: PulseFacts['detractors'][number]) => `${an(d.s.ltr!)} **${n(d.s.ltr!)}** at ${store(d.s.storeNo)}`
      + (d.cause ? `, **${d.cause.toLowerCase()}**` : '')
      + (d.summary ? `: “${quoteNums(d.summary)}”` : d.cause ? '' : ', with no comment');
    const shown = f.detractors.slice(0, 3);
    add(cx, 1, `Detractors ${whenLower}: ${shown.map(describe).join('; ')}${f.detractors.length > shown.length ? `; plus ${n(f.detractors.length - shown.length)} more on the Detractors screen` : ''}.`);
  }
  const recurring = f.wtdCauses[0];
  if (recurring && recurring.count >= 2 && !f.isFriday) add(cx, 2, `The recurring theme this week is **${recurring.name.toLowerCase()}**, behind ${n(recurring.count)} of the week’s ${n(W.s.detractors)} detractors.`);
  for (const e of f.emerging.slice(0, 1)) add(cx, 3, `Potential concern: **${e.name.toLowerCase()}** has ${n(e.count)} detractors so far, against about ${n(Math.round(e.typical * 10) / 10, (Math.round(e.typical * 10) / 10).toString())} at this point in a typical week.`);

  // Subscriptions
  const S = f.subs;
  const subs = sec('Subscriptions');
  if (!S) add(subs, 1, 'No subscription export is loaded for this period, so subscriptions aren’t included.');
  else {
    add(subs, 1, `${S.period ? `${when} we finished with **${n(S.period.subs)} net new subscriptions** (${n(S.period.instore)} in store), bringing` : `The ${whenLower} figure needs the previous day’s export. That brings`} FW${S.fw} to **${n(S.wtd.subs)}** and the fiscal year to **${n(S.fyTotal)}**.`);
    const pc = S.pace;
    if (pc.beaten) add(subs, 1, `We’ve **already passed** FW${pc.priorWeek}’s ${n(pc.priorTotal)}.`);
    else {
      const verb = pc.status === 'ahead' ? 'exceed' : pc.status === 'even' ? 'meet' : 'fall short of';
      add(subs, 1, `At this pace we’re **on track to ${verb}** FW${pc.priorWeek}’s ${n(pc.priorTotal)} (projected ${n(pc.projected)}).`);
      if (!f.isFriday) add(subs, 1, pc.perDay !== null
        ? `To beat it we need **${n(pc.needed)} more**, about **${n(pc.perDay)} a day** over the remaining ${plural(pc.daysLeft, 'day')}.`
        : `To beat it we need **${n(pc.needed)} more** today.`);
    }
    if (S.periodTopInstore.length) add(subs, 2, `${weekend ? 'This weekend’s' : 'Yesterday’s'} in-store leaders: ${S.periodTopInstore.slice(0, 2).map(storeLeader).join(' and ')}.`);
    if (!f.isFriday && S.topInstore.length && !(S.period && S.period.subs === S.wtd.subs)) add(subs, 3, `Week-to-date leaders: ${S.topInstore.slice(0, 3).map(storeLeader).join(', ')}.`);
    if (S.wtd.subs > 0 && S.priorWeekFull.subs > 0) {
      const a = (100 * S.wtd.instore) / S.wtd.subs, b = (100 * S.priorWeekFull.instore) / S.priorWeekFull.subs;
      if (Math.abs(a - b) >= 3) add(subs, 3, `In-store share is ${n(a, `${Math.round(a)}%`)} this week, ${a > b ? 'up' : 'down'} from ${n(b, `${Math.round(b)}%`)} in FW${S.fw - 1}.`);
    }
  }

  // Friday: the week so far (Saturday through Thursday) and what today needs.
  if (f.isFriday) {
    const r = sec(`Week recap, FW${W.fw}`);
    if (W.s.pct === null) add(r, 1, `FW${W.fw} has no surveys loaded yet.`);
    else {
      add(r, 1, `Saturday through ${DAY_LONG[weekday(f.to)]}, FW${W.fw} is at **${pct(W.s)}** on ${plural(W.s.n, 'survey')}, ${W.samePoint.pct === null ? 'with nothing to compare from last week' : `**${move(W.s.pct, W.samePoint.pct)}** from the same days of FW${W.fw - 1}`}, and **${vsBench(W.s.pct)}**.`);
      if (W.left !== null) add(r, 1, W.left >= 0
        ? `We have **${plural(W.s.detractors, 'detractor')}**; at a typical week’s volume today can take **${n(W.left)} more** and still finish at ${f.benchmark}.`
        : `We have **${plural(W.s.detractors, 'detractor')}**, **${n(-W.left)} more** than a typical week can take and still finish at ${f.benchmark}.`);
      if (f.wtdCauses.length) add(r, 2, `This week’s detractors were mostly about ${f.wtdCauses.slice(0, 2).map((c) => `**${c.name.toLowerCase()}** (${n(c.count)})`).join(' and ')}.`);
      if (f.associateStars.length) add(r, 2, `Recognition for the week: ${f.associateStars.slice(0, 3).map((a) => `**${a.name}** (${store(a.storeNo)}, ${plural(a.promoters, 'promoter')})`).join(', ')}, all with no detractors.`);
      add(r, 3, f.regionsBelow.length ? `Regions below ${f.benchmark} with 10 or more surveys: ${f.regionsBelow.map((x) => `${x.region} (${pct(x.s)})`).join(', ')}.` : `Every region with 10 or more surveys is at or above ${f.benchmark}.`);
    }
    if (S) {
      add(r, 1, S.pace.beaten
        ? `Subscriptions: **${n(S.wtd.subs)}** this week, already past FW${S.pace.priorWeek}’s ${n(S.pace.priorTotal)}.`
        : `Subscriptions: **${n(S.wtd.subs)}** this week against ${n(S.pace.priorTotal)} for all of FW${S.pace.priorWeek}.`);
      if (S.topInstore.length) add(r, 3, `Top in-store stores this week: ${S.topInstore.slice(0, 3).map(storeLeader).join(', ')}.`);
    }
  }

  // Things to watch today
  const w = sec('Things to watch today');
  const ltrWatch = W.s.pct === null ? null
    : f.isFriday ? (recurring && recurring.count >= 2 ? `the week closes today; **${recurring.name.toLowerCase()}** drove ${n(recurring.count)} of its ${n(W.s.detractors)} detractors, so that’s the one to watch.` : `the week closes today ${vsBench(W.s.pct)}; a strong Friday protects the finish.`)
    : W.left !== null && W.left < 0 ? `FW${W.fw} is ${n(-W.left)} detractor${W.left === -1 ? '' : 's'} past what a typical week can take at ${f.benchmark}; ${W.s.pct >= f.benchmark ? 'every new 0–8 puts the benchmark at risk' : 'we’ll need a run of 9s and 10s to recover'}.`
      : W.left !== null ? `FW${W.fw} is ${W.s.pct >= f.benchmark ? 'above' : 'below'} ${f.benchmark} so far; at a typical week’s volume it can take about **${plural(W.left, 'more detractor')}** and still finish at ${f.benchmark}${recurring && recurring.count >= 2 ? `. Watch ${recurring.name.toLowerCase()}` : ''}.`
        : `FW${W.fw} is ${vsBench(W.s.pct)}.`;
  if (ltrWatch) add(w, 1, `**LTR:** ${ltrWatch.charAt(0).toUpperCase()}${ltrWatch.slice(1)}`, true);
  if (S && !S.pace.beaten) {
    const perDay = S.period ? S.period.subs / Math.max(1, diffDays(f.to, f.from) + 1) : null;
    const avg = S.wtd.subs / Math.max(1, S.days);
    const momentum = perDay === null ? '' : perDay > avg * 1.1 ? `; momentum is building (${n(Math.round(perDay))} a day ${whenLower} vs ${n(Math.round(avg))} a day this week)` : perDay < avg * 0.9 ? `; ${whenLower} was slower than this week’s average of ${n(Math.round(avg))} a day` : '';
    const lastDay = S.pace.daysLeft <= 1;
    const need = lastDay
      ? `we need **${n(S.pace.needed)} today** to beat FW${S.pace.priorWeek}${S.period ? `, ${S.period.subs >= S.pace.needed ? `about what we sold ${whenLower}` : `more than ${whenLower}’s ${n(S.period.subs)}`}` : ''}`
      : `we need about **${n(S.pace.perDay!)} a day** to beat FW${S.pace.priorWeek}${momentum}`;
    add(w, 1, `**Subscriptions:** ${need}.`, true);
  } else if (S) add(w, 2, `**Subscriptions:** FW${S.fw} has already beaten last week; keep in-store sales moving.`, true);
  add(w, f.appointmentsToday && f.appointmentsToday.n ? 1 : 3, f.appointmentsToday === null
    ? `**Today’s appointments:** the schedule isn’t loaded, so volume and capacity can’t be checked.`
    : f.appointmentsToday.n === 0 ? `**Today’s appointments:** none are in the loaded appointment file.`
      : `**Today’s appointments:** ${plural(f.appointmentsToday.n, 'appointment')} scheduled${f.appointmentsToday.byRegion.length ? `, most in ${f.appointmentsToday.byRegion.map((r) => `${r.key} (${n(r.count)})`).join(' and ')}` : ''}.`, true);
  const ops: string[] = [];
  if (f.damage.length) ops.push(`${plural(f.damage.length, 'comment')} ${whenLower} mention${f.damage.length === 1 ? 's' : ''} damage or safety; confirm Field Support has ${f.damage.length === 1 ? 'it' : 'them'}`);
  if (f.overdue.count) ops.push(`**${plural(f.overdue.count, 'detractor')}** still ${f.overdue.count === 1 ? 'has' : 'have'} no documented store follow-up after 48 hours${f.overdue.oldest ? `; the oldest is ${store(f.overdue.oldest.storeNo)} at ${plural(f.overdue.oldest.days, 'day')}` : ''}`);
  if (f.missed) ops.push(`${plural(f.missed, 'member')} said nobody showed up this week`);
  add(w, ops.length ? 1 : 3, `**Operational:** ${ops.length ? ops.join('; ') : 'no damage reports, missed appointments or overdue follow-ups in the loaded data'}.`, true);

  return finish(sections, numbers);
}

function finish(sections: Section[], numbers: number[]): PulseDoc {
  const render = () => sections.filter((s) => s.lines.length)
    .map((s) => [...(s.title ? [`**${s.title}**`] : []), ...s.lines.map((l) => (l.bullet ? `• ${l.text}` : l.text))].join('\n')).join('\n\n');
  let text = render();
  let dropped = 0;
  // Trim to two minutes: lowest priority first, from the end of the script.
  for (const pri of [3, 2] as const) {
    for (let si = sections.length - 1; si >= 0 && wordCount(text) > PULSE_MAX_WORDS; si--) {
      const lines = sections[si].lines;
      for (let li = lines.length - 1; li >= 0 && wordCount(text) > PULSE_MAX_WORDS; li--) {
        if (lines[li].pri !== pri) continue;
        lines.splice(li, 1); dropped++; text = render();
      }
    }
  }
  // Numbers inside quoted comments are the customer's own; allow them too.
  numbers.push(...extractNumbers(text).filter((h) => /“[^”]*$/.test(text.slice(0, h.start))).map((h) => h.value));
  const words = wordCount(text);
  return { text, words, seconds: Math.round((words / WORDS_PER_MINUTE) * 60), numbers, dropped };
}

/** The spoken script (with **bold** markers). */
export function pulseScript(f: PulseFacts): string {
  return pulseDoc(f).text;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** HTML for the on-screen view and for pasting into Teams/Outlook (bold kept, bullets as a list). Everything is escaped. */
export function pulseHtml(text: string): string {
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<ul style="margin:0 0 10px 0;padding-left:22px;list-style:disc">${list.map((l) => `<li style="margin:0 0 4px 0">${l}</li>`).join('')}</ul>`); list = []; } };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith('• ')) { list.push(inline(line.slice(2))); continue; }
    flush();
    // A line that is only bold is a section heading.
    const heading = /^\*\*[^*]+\*\*$/.test(line) && out.length > 0;
    out.push(`<p style="margin:${heading ? '14px 0 6px 0' : '0 0 8px 0'}">${inline(line)}</p>`);
  }
  flush();
  return `<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt">${out.join('')}</div>`;
}

/**
 * HomeCare+ subscriptions (net of cancellations) and completed appointments, by store and fiscal week.
 * The export is year-to-date and refreshed daily, so "yesterday" = this export's week-to-date minus the previous
 * export's; "same point last week" = the export taken 7 days earlier. Without those exports we say so.
 */
import type { SubscriptionSnapshot, SubscriptionWeek, SurveyRecord } from '@/domain/types';
import { addDays, diffDays, type ISODate } from '@/lib/dates';
import { weekStart, DEFAULT_FY_START } from '@/lib/fiscal';
import { countsForLtr } from '@/domain/survey';

export interface SubsGeo { division?: string | null; region?: string | null; district?: string | null; store?: string | null }
export interface StoreInfo { storeNo: string; storeName: string; storeSet: string; division: string; region: string; district: string }

export function storeIndex(weeks: SubscriptionWeek[]): Map<string, StoreInfo> {
  const m = new Map<string, StoreInfo>();
  for (const w of weeks) if (!m.has(w.storeNo)) m.set(w.storeNo, { storeNo: w.storeNo, storeName: w.storeName, storeSet: w.storeSet, division: w.division, region: w.region, district: w.district });
  return m;
}
export const inGeo = (s: StoreInfo | undefined, g: SubsGeo, districtOf?: (storeNo: string) => string | undefined) =>
  !!s && (!g.division || s.division === g.division) && (!g.region || s.region === g.region)
  && (!g.district || (districtOf?.(s.storeNo) ?? s.district) === g.district) && (!g.store || s.storeNo === g.store);

/** Short store label: "3351 Wildwood, FL" from "LOWE'S OF WILDWOOD, FL". */
export function storeShort(s: StoreInfo | undefined, no: string): string {
  const n = (s?.storeName ?? '').replace(/^LOWE'?S OF\s+/i, '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/, (\w\w)$/i, (_, st: string) => `, ${st.toUpperCase()}`);
  return n ? `${no} ${n}` : no;
}

const sumSnap = (m: Record<string, [number, number]>, keep: (no: string) => boolean) => {
  let subs = 0, instore = 0;
  for (const [no, [s, i]] of Object.entries(m)) if (keep(no)) { subs += s; instore += i; }
  return { subs, instore, online: subs - instore };
};

export interface SubsPulse {
  /** latest export that covers the day before the meeting (or earlier) */
  snap: SubscriptionSnapshot;
  fw: number;
  /** days of the fiscal week covered so far */
  days: number;
  wtd: { subs: number; instore: number; online: number };
  /** sold during the pulse period (yesterday, or the weekend); null when the export before it isn't loaded */
  period: { subs: number; instore: number; online: number; from: ISODate; to: ISODate } | null;
  periodNote?: string;
  /** same days of last week (export 7 days earlier); null when not loaded */
  samePointLastWeek: { subs: number; instore: number; through: ISODate } | null;
  priorWeekFull: { subs: number; instore: number };
  topInstore: { storeNo: string; label: string; instore: number; subs: number }[];
  /** most in-store sales during the pulse period (yesterday / the weekend); empty when the period can't be worked out */
  periodTopInstore: { storeNo: string; label: string; instore: number; subs: number }[];
  /** fiscal year to date: completed weeks from the export plus this week to date */
  fyTotal: number;
  /** the export is older than the day before the meeting */
  stale: boolean;
  /** on pace to beat the prior week's total? */
  pace: SubsPace;
}

export interface SubsPace {
  priorWeek: number;
  priorTotal: number;
  /** projected week total */
  projected: number;
  /** 'last-week' = scaled by where last week stood at this point; 'straight-line' = week-to-date ÷ days × 7 */
  method: 'last-week' | 'straight-line';
  status: 'ahead' | 'behind' | 'even';
  /** week-to-date already beats last week's total */
  beaten: boolean;
  /** subscriptions still needed to beat last week, and per remaining day (null on the last day) */
  needed: number;
  perDay: number | null;
  daysLeft: number;
}

/**
 * Pace vs last week. With the export from 7 days earlier, the projection follows last week's own shape
 * (last week's total × this week-to-date ÷ last week at the same point); otherwise it is straight-line.
 */
export function subsPace(fw: number, days: number, wtd: number, priorTotal: number, samePoint: number | null): SubsPace {
  const d = Math.max(1, Math.min(7, days));
  const useLast = samePoint !== null && samePoint > 0;
  const projected = Math.round(useLast ? (priorTotal * wtd) / samePoint! : (wtd / d) * 7);
  const needed = Math.max(0, priorTotal - wtd + 1);
  const daysLeft = 7 - d;
  return {
    priorWeek: fw - 1, priorTotal, projected, method: useLast ? 'last-week' : 'straight-line',
    status: wtd > priorTotal || projected > priorTotal ? 'ahead' : projected < priorTotal ? 'behind' : 'even',
    beaten: wtd > priorTotal, needed, perDay: daysLeft > 0 ? Math.ceil(needed / daysLeft) : null, daysLeft,
  };
}

export function paceText(p: SubsPace, fw: number): string {
  if (p.beaten) return `FW${fw} has already passed FW${p.priorWeek}'s ${p.priorTotal.toLocaleString('en-US')}.`;
  const verb = p.status === 'ahead' ? 'On pace to beat' : p.status === 'even' ? 'On pace to match' : 'Behind pace for';
  const need = p.perDay !== null ? ` Needs ${p.needed.toLocaleString('en-US')} more to beat it, about ${p.perDay.toLocaleString('en-US')} a day.` : '';
  return `${verb} FW${p.priorWeek}'s ${p.priorTotal.toLocaleString('en-US')}: projected ${p.projected.toLocaleString('en-US')}${p.method === 'straight-line' ? ' (straight-line)' : ''}.${need}`;
}

/** Subscriptions for the Daily Pulse. `from`–`to` is the pulse period (yesterday, or Sat–Sun on a Monday). */
export function subsPulse(snaps: SubscriptionSnapshot[], weeks: SubscriptionWeek[], from: ISODate, to: ISODate, geo: SubsGeo = {}, fyStart: ISODate = DEFAULT_FY_START): SubsPulse | null {
  const usable = snaps.filter((s) => s.through <= to).sort((a, b) => b.through.localeCompare(a.through) || b.id.localeCompare(a.id));
  const snap = usable[0];
  if (!snap) return null;
  const info = storeIndex(weeks);
  const keep = (no: string) => !(geo.division || geo.region || geo.district || geo.store) || inGeo(info.get(no), geo);
  const wtd = sumSnap(snap.cur, keep);
  const days = diffDays(snap.through, weekStart(snap.fw, fyStart)) + 1;
  const byThrough = (d: ISODate) => snaps.filter((s) => s.through === d).sort((a, b) => b.id.localeCompare(a.id))[0];
  // Period: this export minus the one that ended the day before the period started.
  let period: SubsPulse['period'] = null;
  let periodNote: string | undefined;
  let periodByStore: Record<string, [number, number]> | null = null;
  if (snap.through === to) {
    const before = byThrough(addDays(from, -1));
    const weekStarted = weekStart(snap.fw, fyStart) >= from; // the period began the week, so week-to-date is all of it
    if (weekStarted) { period = { ...wtd, from, to }; periodByStore = snap.cur; }
    else if (before && before.fy === snap.fy && before.fw === snap.fw) {
      const b = sumSnap(before.cur, keep);
      period = { subs: wtd.subs - b.subs, instore: wtd.instore - b.instore, online: wtd.online - b.online, from, to };
      periodByStore = Object.fromEntries(Object.entries(snap.cur).map(([no, [sv, iv]]) => [no, [sv - (before.cur[no]?.[0] ?? 0), iv - (before.cur[no]?.[1] ?? 0)] as [number, number]]));
    } else periodNote = `Load the export taken on ${from} (data through ${addDays(from, -1)}) to see what sold ${from === to ? 'that day' : 'in that period'}.`;
  } else periodNote = `The latest export covers through ${snap.through}; load the export with data through ${to}.`;
  const lw = byThrough(addDays(snap.through, -7));
  const samePointLastWeek = lw && lw.fw === snap.fw - 1 ? { ...sumSnap(lw.cur, keep), through: lw.through } : null;
  const priorWeekFull = sumSnap(snap.prior, keep);
  const leaders = (m: Record<string, [number, number]>) => Object.entries(m).filter(([no, v]) => keep(no) && v[1] > 0)
    .map(([no, [s, i]]) => ({ storeNo: no, label: storeShort(info.get(no), no), instore: i, subs: s }))
    .sort((a, b) => b.instore - a.instore || b.subs - a.subs || a.storeNo.localeCompare(b.storeNo)).slice(0, 5);
  const topInstore = leaders(snap.cur);
  const periodTopInstore = periodByStore ? leaders(periodByStore) : [];
  const fyTotal = weeks.filter((w) => w.fy === snap.fy && w.fw < snap.fw && keep(w.storeNo)).reduce((a, w) => a + w.subs, 0) + wtd.subs;
  const pace = subsPace(snap.fw, days, wtd.subs, priorWeekFull.subs, samePointLastWeek ? samePointLastWeek.subs : null);
  return { snap, fw: snap.fw, days, wtd, period, periodNote, samePointLastWeek, priorWeekFull, topInstore, periodTopInstore, fyTotal, stale: snap.through < to, pace };
}

// ───────── weekly series and rankings ─────────
export interface SubsWeekRow { fw: number; subs: number; online: number; instore: number; revenue: number; appts: number; followUpRequired: number; exceptions: number; surveys: number; promoters: number }

export function weeklySubs(weeks: SubscriptionWeek[], surveys: SurveyRecord[], fy: number, keepStore: (no: string) => boolean = () => true): SubsWeekRow[] {
  const m = new Map<number, SubsWeekRow>();
  const row = (fw: number) => m.get(fw) ?? (m.set(fw, { fw, subs: 0, online: 0, instore: 0, revenue: 0, appts: 0, followUpRequired: 0, exceptions: 0, surveys: 0, promoters: 0 }), m.get(fw)!);
  for (const w of weeks) {
    if (w.fy !== fy || !keepStore(w.storeNo)) continue;
    const r = row(w.fw);
    r.subs += w.subs; r.online += w.online; r.instore += w.instore; r.revenue += w.revenue; r.appts += w.appts; r.followUpRequired += w.followUpRequired; r.exceptions += w.exceptions;
  }
  for (const s of surveys) {
    if (!countsForLtr(s) || s.ltr === null || !m.has(s.fw)) continue;
    const r = m.get(s.fw)!;
    r.surveys++; if (s.ltr >= 9) r.promoters++;
  }
  return [...m.values()].sort((a, b) => a.fw - b.fw);
}

export function topInstoreStores(weeks: SubscriptionWeek[], fy: number, fromFw: number, toFw: number, keepStore: (no: string) => boolean = () => true, k = 10) {
  const info = storeIndex(weeks);
  const m = new Map<string, { instore: number; subs: number }>();
  for (const w of weeks) {
    if (w.fy !== fy || w.fw < fromFw || w.fw > toFw || !keepStore(w.storeNo)) continue;
    const v = m.get(w.storeNo) ?? { instore: 0, subs: 0 };
    v.instore += w.instore; v.subs += w.subs; m.set(w.storeNo, v);
  }
  return [...m].filter(([, v]) => v.instore > 0).sort((a, b) => b[1].instore - a[1].instore || b[1].subs - a[1].subs)
    .slice(0, k).map(([no, v]) => ({ storeNo: no, label: storeShort(info.get(no), no), storeSet: info.get(no)?.storeSet ?? '', region: info.get(no)?.region ?? '', ...v }));
}

// ───────── LTR relationships ─────────
export interface Comparison { label: string; aLabel: string; bLabel: string; a: { n: number; ltr: number | null }; b: { n: number; ltr: number | null }; diff: number | null; /** |diff| > 2 standard errors */ likelyReal: boolean }

function compare(label: string, aLabel: string, bLabel: string, a: { n: number; p: number }, b: { n: number; p: number }): Comparison {
  const la = a.n ? a.p / a.n : null, lb = b.n ? b.p / b.n : null;
  const diff = la !== null && lb !== null ? 100 * (la - lb) : null;
  const se = la !== null && lb !== null ? 100 * Math.sqrt((la * (1 - la)) / a.n + (lb * (1 - lb)) / b.n) : null;
  return { label, aLabel, bLabel, a: { n: a.n, ltr: la === null ? null : 100 * la }, b: { n: b.n, ltr: lb === null ? null : 100 * lb }, diff, likelyReal: diff !== null && se !== null && se > 0 && Math.abs(diff) > 2 * se };
}

export interface SubsLtrInsights {
  instoreQuartiles: { q: string; stores: number; surveys: number; ltr: number | null; lo: number; hi: number }[];
  /** surveys at stores above vs at/below their region's median in-store share */
  instoreWithinRegion: Comparison & { regionsHigher: number; regions: number };
  followUpRequired: Comparison;
  exceptions: Comparison;
  regions: { region: string; subs: number; instore: number; appts: number; subsPerAppt: number | null; instoreShare: number | null; surveys: number; ltr: number | null }[];
  /** rank correlation across regions: new subscriptions per completed appointment vs LTR */
  capacityCorr: number | null;
  minSurveys: number;
}

const rankCorr = (x: number[], y: number[]) => {
  if (x.length < 4) return null;
  const rank = (v: number[]) => { const o = v.map((x2, i) => [x2, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); o.forEach(([, i], k) => (r[i] = k)); return r as number[]; };
  const rx = rank(x), ry = rank(y), n = x.length, mx = (n - 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - mx); dx += (rx[i] - mx) ** 2; dy += (ry[i] - mx) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
};

export function subsLtrInsights(weeks: SubscriptionWeek[], surveys: SurveyRecord[], fy: number, minSurveys = 10): SubsLtrInsights {
  const ltr = surveys.filter((s) => countsForLtr(s) && s.ltr !== null);
  const fyWeeks = weeks.filter((w) => w.fy === fy);
  const byStore = new Map<string, { subs: number; instore: number; appts: number; region: string }>();
  for (const w of fyWeeks) { const v = byStore.get(w.storeNo) ?? { subs: 0, instore: 0, appts: 0, region: w.region }; v.subs += w.subs; v.instore += w.instore; v.appts += w.appts; byStore.set(w.storeNo, v); }
  const sv = new Map<string, { n: number; p: number }>();
  for (const s of ltr) { const v = sv.get(s.storeNo) ?? { n: 0, p: 0 }; v.n++; if (s.ltr! >= 9) v.p++; sv.set(s.storeNo, v); }
  const stores = [...sv].filter(([no, v]) => v.n >= minSurveys && byStore.has(no)).map(([no, v]) => ({ no, ...v, ...byStore.get(no)!, share: byStore.get(no)!.instore / Math.max(1, byStore.get(no)!.subs) }));
  // in-store share quartiles
  const sorted = [...stores].sort((a, b) => a.share - b.share);
  const instoreQuartiles = [0, 1, 2, 3].map((q) => {
    const part = sorted.slice(Math.floor((q * sorted.length) / 4), Math.floor(((q + 1) * sorted.length) / 4));
    const n = part.reduce((a, x) => a + x.n, 0), p = part.reduce((a, x) => a + x.p, 0);
    return { q: ['Lowest quarter', 'Second', 'Third', 'Highest quarter'][q], stores: part.length, surveys: n, ltr: n ? (100 * p) / n : null, lo: part[0]?.share ?? 0, hi: part[part.length - 1]?.share ?? 0 };
  });
  // within region: above vs at/below the region's median share (all surveyed stores)
  const regionShares = new Map<string, number[]>();
  for (const [no, v] of byStore) if (sv.has(no)) regionShares.set(v.region, [...(regionShares.get(v.region) ?? []), v.instore / Math.max(1, v.subs)]);
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  const med = new Map([...regionShares].map(([r, xs]) => [r, median(xs)]));
  const hi = { n: 0, p: 0 }, lo = { n: 0, p: 0 };
  const perRegion = new Map<string, { hi: { n: number; p: number }; lo: { n: number; p: number } }>();
  for (const s of ltr) {
    const st = byStore.get(s.storeNo); if (!st) continue;
    const isHi = st.instore / Math.max(1, st.subs) > (med.get(st.region) ?? 0);
    const t = isHi ? hi : lo; t.n++; if (s.ltr! >= 9) t.p++;
    const r = perRegion.get(st.region) ?? { hi: { n: 0, p: 0 }, lo: { n: 0, p: 0 } };
    const rt = isHi ? r.hi : r.lo; rt.n++; if (s.ltr! >= 9) rt.p++; perRegion.set(st.region, r);
  }
  const regionsHigher = [...perRegion.values()].filter((r) => r.hi.n && r.lo.n && r.hi.p / r.hi.n > r.lo.p / r.lo.n).length;
  const regionsBoth = [...perRegion.values()].filter((r) => r.hi.n && r.lo.n).length;
  // store-weeks with follow-up required / exceptions
  const sw = new Map(fyWeeks.map((w) => [`${w.storeNo}:${w.fw}`, w]));
  const fur = { y: { n: 0, p: 0 }, n: { n: 0, p: 0 } }, exc = { y: { n: 0, p: 0 }, n: { n: 0, p: 0 } };
  for (const s of ltr) {
    const w = sw.get(`${s.storeNo}:${s.fw}`); if (!w) continue;
    const prom = s.ltr! >= 9 ? 1 : 0;
    const f = w.followUpRequired > 0 ? fur.y : fur.n; f.n++; f.p += prom;
    const e = w.exceptions > 0 ? exc.y : exc.n; e.n++; e.p += prom;
  }
  // regions
  const reg = new Map<string, { subs: number; instore: number; appts: number; n: number; p: number }>();
  for (const w of fyWeeks) { const v = reg.get(w.region) ?? { subs: 0, instore: 0, appts: 0, n: 0, p: 0 }; v.subs += w.subs; v.instore += w.instore; v.appts += w.appts; reg.set(w.region, v); }
  for (const s of ltr) { const v = reg.get(s.region); if (v) { v.n++; if (s.ltr! >= 9) v.p++; } }
  const regions = [...reg].filter(([r]) => r).map(([region, v]) => ({ region, subs: v.subs, instore: v.instore, appts: v.appts, subsPerAppt: v.appts ? v.subs / v.appts : null, instoreShare: v.subs ? (100 * v.instore) / v.subs : null, surveys: v.n, ltr: v.n ? (100 * v.p) / v.n : null }))
    .sort((a, b) => (a.ltr ?? 999) - (b.ltr ?? 999));
  const withBoth = regions.filter((r) => r.subsPerAppt !== null && r.ltr !== null && r.surveys >= minSurveys);
  return {
    instoreQuartiles,
    instoreWithinRegion: { ...compare('In-store share', 'Above region median', 'At or below', hi, lo), regionsHigher, regions: regionsBoth },
    followUpRequired: compare('Follow-up required that week', 'Store-weeks with a follow-up required', 'Without', fur.y, fur.n),
    exceptions: compare('Exceptions that week', 'Store-weeks with an exception', 'Without', exc.y, exc.n),
    regions,
    capacityCorr: rankCorr(withBoth.map((r) => r.subsPerAppt!), withBoth.map((r) => r.ltr!)),
    minSurveys,
  };
}

/**
 * Average line for the weekly chart. 'fytd' = mean of completed weeks up to and including each week; 'rolling' = the
 * last 4 completed weeks. A week is below average when its total (projected, for the week in progress) is under the line.
 * The week in progress never moves the average.
 */
export function averageLine(rows: { fw: number; subs: number }[], inProgressFw: number | null, mode: 'fytd' | 'rolling', projected: number | null = null) {
  const done: number[] = [];
  return rows.map((r) => {
    const partial = r.fw === inProgressFw;
    if (!partial) done.push(r.subs);
    const pool = mode === 'rolling' ? done.slice(-4) : done;
    const avg = pool.length ? pool.reduce((a, x) => a + x, 0) / pool.length : null;
    const value = partial && projected !== null ? projected : r.subs;
    return { fw: r.fw, avg, partial, below: avg !== null && value < avg };
  });
}

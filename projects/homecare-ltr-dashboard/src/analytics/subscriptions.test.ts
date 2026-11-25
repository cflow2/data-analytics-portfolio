import { describe, expect, it } from 'vitest';
import type { SubscriptionSnapshot, SubscriptionWeek, SurveyRecord } from '@/domain/types';
import { averageLine, paceText, storeShort, subsLtrInsights, subsPace, subsPulse, topInstoreStores, weeklySubs } from './subscriptions';

const wk = (storeNo: string, fw: number, subs: number, instore: number, extra: Partial<SubscriptionWeek> = {}): SubscriptionWeek => ({
  id: `2026:${fw}:${storeNo}`, fy: 2026, fw, storeNo, storeName: `LOWE'S OF TOWN ${storeNo}, TX`, storeSet: 'National Stores', division: storeNo < '0200' ? 'WEST' : 'SOUTH',
  region: storeNo < '0200' ? 'R5' : 'R2', district: '850', subs, online: subs - instore, instore, revenue: subs * 99, appts: 10, regular: 10, assessments: 0, followUps: 0,
  exceptions: 0, followUpRequired: 0, sourceFile: 'f', ...extra,
});
// FW43 = Nov 21–27, 2026. Exports taken each morning cover through the day before.
const snap = (through: string, fw: number, cur: Record<string, [number, number]>, prior: Record<string, [number, number]> = {}): SubscriptionSnapshot =>
  ({ id: `${through}T10:00:00`, through, fy: 2026, fw, cur, prior, sourceFile: 'f' });
const weeks = [wk('0100', 42, 30, 3), wk('0300', 42, 20, 5), wk('0100', 43, 12, 2), wk('0300', 43, 8, 4)];
const snaps = [
  snap('2026-11-17', 42, { '0100': [9, 1], '0300': [6, 2] }),                 // FW42, 4 days in (Sat–Tue)
  snap('2026-11-23', 43, { '0100': [9, 1], '0300': [5, 3] }, { '0100': [30, 3], '0300': [20, 5] }), // Mon
  snap('2026-11-24', 43, { '0100': [12, 2], '0300': [8, 4] }, { '0100': [30, 3], '0300': [20, 5] }), // Tue
];

describe('subscriptions in the Daily Pulse', () => {
  it('yesterday = this export minus the previous one; week-to-date; same point last week', () => {
    const p = subsPulse(snaps, weeks, '2026-11-24', '2026-11-24')!;
    expect(p.fw).toBe(43);
    expect(p.days).toBe(4);
    expect(p.wtd).toEqual({ subs: 20, instore: 6, online: 14 });
    expect(p.period).toMatchObject({ subs: 6, instore: 2, online: 4 });
    expect(p.samePointLastWeek).toMatchObject({ subs: 15, instore: 3, through: '2026-11-17' });
    expect(p.priorWeekFull).toEqual({ subs: 50, instore: 8, online: 42 });
    expect(p.topInstore.map((s) => [s.storeNo, s.instore])).toEqual([['0300', 4], ['0100', 2]]);
    expect(p.stale).toBe(false);
  });
  it('a period that starts the week is the whole week-to-date', () => {
    const p = subsPulse([snap('2026-11-22', 43, { '0100': [7, 1] })], weeks, '2026-11-21', '2026-11-22')!;
    expect(p.period).toMatchObject({ subs: 7, instore: 1 });
  });
  it('says which export is missing instead of guessing', () => {
    const p = subsPulse([snaps[2]], weeks, '2026-11-24', '2026-11-24')!;
    expect(p.period).toBeNull();
    expect(p.periodNote).toMatch(/export taken on 2026-11-24 \(data through 2026-11-23\)/);
    expect(p.samePointLastWeek).toBeNull();
    const stale = subsPulse(snaps, weeks, '2026-11-25', '2026-11-25')!;
    expect(stale.stale).toBe(true);
    expect(subsPulse(snaps, weeks, '2026-11-10', '2026-11-10')).toBeNull();
  });
  it('follows the geography filter', () => {
    const p = subsPulse(snaps, weeks, '2026-11-24', '2026-11-24', { division: 'SOUTH' })!;
    expect(p.wtd.subs).toBe(8);
    expect(p.period!.subs).toBe(3);
  });
});

describe('subscription tables', () => {
  it('weekly totals, top in-store stores and store labels', () => {
    const rows = weeklySubs(weeks, [], 2026);
    expect(rows.map((r) => [r.fw, r.subs, r.instore])).toEqual([[42, 50, 8], [43, 20, 6]]);
    expect(topInstoreStores(weeks, 2026, 42, 43).map((s) => [s.storeNo, s.instore])).toEqual([['0300', 9], ['0100', 5]]);
    expect(storeShort({ storeNo: '3351', storeName: "LOWE'S OF WILDWOOD, FL", storeSet: '', division: '', region: '', district: '' }, '3351')).toBe('3351 Wildwood, FL');
  });
});

describe('subscriptions vs LTR', () => {
  const sv = (id: string, storeNo: string, fw: number, ltr: number, region: string): SurveyRecord => ({ id, fw, date: '2026-11-02', storeNo, region, ltr, comment: '', sourceFile: 'f', source: 'tracker' });
  it('compares in-store share, follow-up-required weeks and regions', () => {
    const ws = [wk('0100', 40, 40, 2, { followUpRequired: 1 }), wk('0101', 40, 40, 20), wk('0300', 40, 40, 2), wk('0301', 40, 40, 20)];
    const surveys: SurveyRecord[] = [];
    let i = 0;
    for (const [store, region, scores] of [['0100', 'R5', [10, 10, 10, 10, 10, 10, 7, 7, 6, 5]], ['0101', 'R5', [10, 10, 10, 10, 10, 10, 10, 10, 10, 8]], ['0300', 'R2', [10, 10, 10, 10, 10, 10, 10, 10, 8, 8]], ['0301', 'R2', [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]]] as const)
      for (const s of scores) surveys.push(sv(`s${i++}`, store, 40, s, region));
    const r = subsLtrInsights(ws, surveys, 2026);
    expect(r.instoreQuartiles.map((q) => q.surveys)).toEqual([10, 10, 10, 10]);
    expect(r.instoreWithinRegion).toMatchObject({ regionsHigher: 2, regions: 2 });
    expect(r.instoreWithinRegion.a.ltr).toBe(95);
    expect(r.instoreWithinRegion.b.ltr).toBe(70);
    expect(r.followUpRequired.a).toEqual({ n: 10, ltr: 60 });
    expect(r.followUpRequired.b).toEqual({ n: 30, ltr: 90 });
    expect(r.followUpRequired.diff).toBeCloseTo(-30, 9);
    expect(r.regions.map((x) => x.region)).toEqual(['R5', 'R2']);
  });
});

describe('pace vs last week', () => {
  it('follows last week\'s shape when the export from 7 days earlier is loaded', () => {
    const p = subsPulse(snaps, weeks, '2026-11-24', '2026-11-24')!.pace;
    expect(p).toMatchObject({ priorWeek: 42, priorTotal: 50, projected: 67, method: 'last-week', status: 'ahead', beaten: false, needed: 31, perDay: 11, daysLeft: 3 });
    expect(paceText(p, 43)).toBe("On pace to beat FW42's 50: projected 67. Needs 31 more to beat it, about 11 a day.");
  });
  it('falls back to straight-line, and says when last week is already beaten', () => {
    const p = subsPace(43, 4, 20, 50, null);
    expect(p).toMatchObject({ projected: 35, method: 'straight-line', status: 'behind' });
    expect(paceText(p, 43)).toMatch(/^Behind pace for FW42's 50: projected 35 \(straight-line\)\./);
    const done = subsPace(43, 5, 60, 50, 40);
    expect(done).toMatchObject({ beaten: true, status: 'ahead', needed: 0 });
    expect(paceText(done, 43)).toBe("FW43 has already passed FW42's 50.");
    expect(subsPace(43, 7, 20, 50, null).perDay).toBeNull();
  });
});

describe('average line', () => {
  const rows = [{ fw: 1, subs: 10 }, { fw: 2, subs: 20 }, { fw: 3, subs: 30 }, { fw: 4, subs: 12 }, { fw: 5, subs: 5 }];
  it('FYTD mean of completed weeks; the week in progress is judged by its projection', () => {
    const a = averageLine(rows, 5, 'fytd', 18);
    expect(a.map((x) => x.avg)).toEqual([10, 15, 20, 18, 18]);
    expect(a.map((x) => x.below)).toEqual([false, false, false, true, false]);
    expect(a[4].partial).toBe(true);
  });
  it('4-week rolling mean', () => {
    const a = averageLine([...rows.slice(0, 4), { fw: 5, subs: 40 }], null, 'rolling');
    expect(a[4].avg).toBe((20 + 30 + 12 + 40) / 4);
    expect(a.map((x) => x.below)).toEqual([false, false, false, true, false]);
  });
});

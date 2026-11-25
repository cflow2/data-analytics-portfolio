import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { useWeekData } from '@/data/useWeekData';
import { SCREENS } from '@/screens';
import { inGeo, storeIndex, subsLtrInsights, topInstoreStores, weeklySubs, type Comparison } from '@/analytics/subscriptions';
import { districtFor } from '@/analytics/ltr';
import { Chart, useBaseOption } from '@/components/charts/Chart';
import { useChartTokens } from '@/components/charts/tokens';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageGate } from '@/components/ui/PageGate';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { Card, PageHeader, Segmented } from '@/components/ui/primitives';

type Win = 'week' | '4' | 'fytd';
const pct = (x: number | null, d = 1) => (x === null ? '—' : `${x.toFixed(d)}%`);

function ComparisonLine({ c, what }: { c: Comparison; what: string }) {
  if (c.diff === null) return <p className="text-sm text-muted">Not enough surveys to compare {what}.</p>;
  return (
    <p className="text-sm">
      <b>{c.aLabel}:</b> {pct(c.a.ltr)} (n={c.a.n.toLocaleString('en-US')}) vs <b>{c.bLabel.toLowerCase()}:</b> {pct(c.b.ltr)} (n={c.b.n.toLocaleString('en-US')}),{' '}
      <b className={c.diff < 0 ? 'text-surveys' : 'text-grow'}>{c.diff >= 0 ? '+' : '−'}{Math.abs(c.diff).toFixed(1)} pts</b>.{' '}
      <span className="text-muted">{c.likelyReal ? 'Bigger than chance alone would explain (over 2 standard errors).' : 'Within the range chance could produce; treat as a hint.'}</span>
    </p>
  );
}

export function Subscriptions() {
  const sc = SCREENS.find((x) => x.path === '/subscriptions')!;
  const { data, loading, error } = useWeekData();
  const t = useChartTokens();
  const base = useBaseOption();
  const [win, setWin] = useState<Win>('4');

  const v = useMemo(() => {
    if (!data || !data.ds.subscriptionWeeks.length) return null;
    const { ds, geo } = data;
    const fy = Math.max(...ds.subscriptionWeeks.map((w) => w.fy));
    const info = storeIndex(ds.subscriptionWeeks);
    const keep = (no: string) => inGeo(info.get(no), geo, (n) => (ds.stores.get(n)?.district ?? undefined));
    const filtered = !!(geo.division || geo.region || geo.district || geo.store);
    const rows = weeklySubs(ds.subscriptionWeeks, data.ltr, fy, filtered ? keep : undefined);
    const lastFw = rows.length ? rows[rows.length - 1].fw : 0;
    const snap = [...ds.subscriptionSnapshots].sort((a, b) => b.through.localeCompare(a.through))[0];
    const sum = (k: keyof (typeof rows)[number], f = 1, l = lastFw) => rows.filter((r) => r.fw >= f && r.fw <= l).reduce((a, r) => a + (r[k] as number), 0);
    const ytd = { subs: sum('subs'), instore: sum('instore'), appts: sum('appts'), surveys: sum('surveys') };
    const sets = new Map<string, { stores: Set<string>; subs: number; instore: number; appts: number }>();
    for (const w of ds.subscriptionWeeks) {
      if (w.fy !== fy || (filtered && !keep(w.storeNo))) continue;
      const s = sets.get(w.storeSet || '—') ?? { stores: new Set(), subs: 0, instore: 0, appts: 0 };
      s.stores.add(w.storeNo); s.subs += w.subs; s.instore += w.instore; s.appts += w.appts; sets.set(w.storeSet || '—', s);
    }
    const insights = subsLtrInsights(filtered ? ds.subscriptionWeeks.filter((w) => keep(w.storeNo)) : ds.subscriptionWeeks, data.ltr, fy);
    return { fy, rows, lastFw, snap, ytd, sets: [...sets].sort((a, b) => b[1].subs - a[1].subs), insights, keep, filtered, districtOf: (n: string) => districtFor(n, ds.stores) };
  }, [data]);

  const top = useMemo(() => {
    if (!data || !v) return [];
    const from = win === 'week' ? v.lastFw : win === '4' ? v.lastFw - 3 : 1;
    return topInstoreStores(data.ds.subscriptionWeeks, v.fy, from, v.lastFw, v.filtered ? v.keep : undefined, 25);
  }, [data, v, win]);

  if (!data || !v) {
    return <><PageHeader title={sc.title} subtitle={sc.subtitle} /><PageGate screen={sc} loading={loading} error={error} empty={!loading && !!data} emptyTitle="No subscription export loaded">{null}</PageGate></>;
  }
  const r = v.rows;
  const last = r[r.length - 1], prev = r[r.length - 2];
  const option: EChartsOption = base({
    grid: { left: 48, right: 16, top: 24, bottom: 36 },
    tooltip: { trigger: 'axis', formatter: (ps) => { const i = (Array.isArray(ps) ? ps[0] : ps).dataIndex as number; const x = r[i]; return `<b>FW${x.fw}</b><br/>${x.subs.toLocaleString('en-US')} net subscriptions<br/>Online ${x.online.toLocaleString('en-US')} · In store ${x.instore}<br/>Completed appointments ${x.appts}${x.fw === v.lastFw && v.snap ? `<br/><i>to date (through ${v.snap.through})</i>` : ''}`; } },
    legend: { bottom: 0, data: ['Online', 'In store'], textStyle: { color: t.muted } },
    xAxis: { type: 'category', data: r.map((x) => `FW${x.fw}`), axisTick: { show: false }, axisLabel: { color: t.muted } },
    yAxis: { type: 'value', name: 'Net subscriptions', nameTextStyle: { color: t.muted }, axisLabel: { color: t.muted }, splitLine: { lineStyle: { color: t.grid } } },
    series: [
      { name: 'Online', type: 'bar', stack: 's', data: r.map((x) => x.online), itemStyle: { color: t.calls } },
      { name: 'In store', type: 'bar', stack: 's', data: r.map((x) => x.instore), itemStyle: { color: t.surveys } },
    ],
  });
  const respOption: EChartsOption = base({
    grid: { left: 48, right: 16, top: 24, bottom: 28 },
    tooltip: { trigger: 'axis', formatter: (ps) => { const i = (Array.isArray(ps) ? ps[0] : ps).dataIndex as number; const x = r[i]; return `<b>FW${x.fw}</b><br/>${x.surveys} surveys ÷ ${x.appts} completed appointments`; } },
    xAxis: { type: 'category', data: r.map((x) => `FW${x.fw}`), axisTick: { show: false }, axisLabel: { color: t.muted } },
    yAxis: { type: 'value', name: 'Surveys per 100 appointments', nameTextStyle: { color: t.muted }, axisLabel: { color: t.muted }, splitLine: { lineStyle: { color: t.grid } } },
    series: [{ type: 'line', data: r.map((x) => (x.appts ? Math.round((100 * x.surveys) / x.appts) : null)), lineStyle: { color: t.calls, width: 2 }, itemStyle: { color: t.calls }, symbolSize: 5, connectNulls: true }],
  });
  const ins = v.insights;
  type TopRow = (typeof top)[number];
  const cols: Col<TopRow>[] = [
    { id: 'label', header: 'Store', value: (x) => x.label, width: 240 },
    { id: 'set', header: 'Store set', value: (x) => x.storeSet, width: 130 },
    { id: 'region', header: 'Region', value: (x) => x.region, width: 70 },
    { id: 'instore', header: 'In-store subs', value: (x) => x.instore, align: 'right', width: 110 },
    { id: 'subs', header: 'All net subs', value: (x) => x.subs, align: 'right', width: 110 },
    { id: 'share', header: 'In-store share', value: (x) => (x.subs > 0 ? Math.round((100 * x.instore) / x.subs) : null), align: 'right', width: 110, cell: (x) => <span className="tnum">{x.subs > 0 ? `${Math.round((100 * x.instore) / x.subs)}%` : '—'}</span> },
  ];
  const winLabel = win === 'week' ? `FW${v.lastFw} to date` : win === '4' ? `FW${v.lastFw - 3}–FW${v.lastFw}` : `FYTD (FW1–FW${v.lastFw})`;

  return (
    <>
      <PageHeader title={sc.title} subtitle={sc.subtitle} />
      <div className="space-y-3">
        <p className="text-xs text-muted">FY{v.fy} subscription export{v.snap ? `, data through ${v.snap.through}` : ''}. Net = after cancellations and refunds. {v.filtered ? 'Filtered by the geography above.' : ''}</p>
        <div className="grid grid-cols-4 gap-3">
          <KpiCard label={`FW${v.lastFw} to date`} value={last ? last.subs.toLocaleString('en-US') : '—'} sub={last && prev ? `${last.instore} in store · FW${prev.fw}: ${prev.subs.toLocaleString('en-US')} (full week)` : undefined} />
          <KpiCard label={`FYTD net subscriptions`} value={v.ytd.subs.toLocaleString('en-US')} sub={`${v.ytd.instore.toLocaleString('en-US')} in store (${v.ytd.subs ? Math.round((100 * v.ytd.instore) / v.ytd.subs) : 0}%)`} />
          <KpiCard label="Completed appointments FYTD" value={v.ytd.appts.toLocaleString('en-US')} sub={`${(v.ytd.subs / Math.max(1, v.ytd.appts)).toFixed(2)} new subscriptions per completed appointment`} />
          <KpiCard label="Surveys per 100 appointments" value={v.ytd.appts ? `${Math.round((100 * v.ytd.surveys) / v.ytd.appts)}` : '—'} sub={`${v.ytd.surveys.toLocaleString('en-US')} surveys ÷ ${v.ytd.appts.toLocaleString('en-US')} appointments, FYTD`} />
        </div>

        <Chart title={`Net subscriptions by week, FY${v.fy}`} option={option} height={300} ariaLabel={`Net HomeCare+ subscriptions by fiscal week, online and in store, FW1 to FW${v.lastFw}`}
          table={{ columns: ['Week', 'Net subscriptions', 'Online', 'In store', 'Revenue', 'Completed appointments', 'Surveys', 'LTR %'], rows: r.map((x) => [`FW${x.fw}`, x.subs, x.online, x.instore, Math.round(x.revenue), x.appts, x.surveys, x.surveys ? Number(((100 * x.promoters) / x.surveys).toFixed(1)) : null]) }} />

        <Card title={`Most in-store subscriptions · ${winLabel}`} actions={<Segmented label="Window" value={win} onChange={setWin} options={[{ value: 'week', label: `FW${v.lastFw}` }, { value: '4', label: '4 weeks' }, { value: 'fytd', label: 'FYTD' }]} />}>
          <DataTable rows={top} columns={cols} getRowId={(x) => x.storeNo} exportName={`In-store_subscriptions_${winLabel.replace(/[^\w-]+/g, '_')}`} maxHeight={420} initialSort={[{ id: 'instore', desc: true }]} empty="No in-store subscriptions in this window." />
        </Card>

        <Card title="Subscriptions and LTR">
          <div className="space-y-4">
            <section>
              <h3 className="text-sm font-semibold">Where more members buy in the store, LTR runs higher</h3>
              <table className="mt-1 w-full text-sm tnum">
                <caption className="sr-only">LTR by quarter of stores ranked by in-store share of subscriptions</caption>
                <thead className="text-left text-xs text-muted"><tr><th className="py-1 font-medium">Stores ranked by in-store share (≥ {ins.minSurveys} surveys)</th><th className="font-medium">Share range</th><th className="text-right font-medium">Stores</th><th className="text-right font-medium">Surveys</th><th className="text-right font-medium">LTR</th></tr></thead>
                <tbody>{ins.instoreQuartiles.map((q) => <tr key={q.q} className="border-t border-border"><td className="py-1">{q.q}</td><td>{Math.round(100 * q.lo)}–{Math.round(100 * q.hi)}%</td><td className="text-right">{q.stores}</td><td className="text-right">{q.surveys.toLocaleString('en-US')}</td><td className="text-right font-semibold">{pct(q.ltr)}</td></tr>)}</tbody>
              </table>
              <div className="mt-2"><ComparisonLine c={ins.instoreWithinRegion} what="in-store share" /></div>
              <p className="text-xs text-muted">Within each region, stores above the region's median in-store share score higher in {ins.instoreWithinRegion.regionsHigher} of {ins.instoreWithinRegion.regions} regions, so region mix doesn't explain it. One possible reason: members who buy in the store hear what HomeCare+ covers before they join. This is a store-level pattern, not proof about individual members.</p>
            </section>
            <section>
              <h3 className="text-sm font-semibold">Weeks with a follow-up required score lower</h3>
              <ComparisonLine c={ins.followUpRequired} what="follow-up weeks" />
              <ComparisonLine c={ins.exceptions} what="exception weeks" />
              <p className="text-xs text-muted">Store-weeks from the subscription export's completed-appointment columns, matched to that store's surveys in the same fiscal week.</p>
            </section>
            <section>
              <h3 className="text-sm font-semibold">Regions selling far more than they service</h3>
              <p className="text-sm">Rank correlation across regions between new subscriptions per completed appointment and LTR: <b>{ins.capacityCorr === null ? '—' : ins.capacityCorr.toFixed(2)}</b> {ins.capacityCorr !== null && ins.capacityCorr < -0.3 ? '(regions adding members fastest relative to visits tend to score lower: worth watching as new members book their first visits)' : ''}.</p>
              <div className="mt-1 overflow-x-auto" tabIndex={0}>
                <table className="w-full text-sm tnum">
                  <caption className="sr-only">Regions: subscriptions, completed appointments and LTR, FYTD</caption>
                  <thead className="text-left text-xs text-muted"><tr><th className="py-1 font-medium">Region</th><th className="text-right font-medium">Net subs</th><th className="text-right font-medium">In-store share</th><th className="text-right font-medium">Completed appts</th><th className="text-right font-medium">Subs per appt</th><th className="text-right font-medium">Surveys</th><th className="text-right font-medium">LTR</th></tr></thead>
                  <tbody>{ins.regions.map((x) => <tr key={x.region} className="border-t border-border"><td className="py-1">{x.region}</td><td className="text-right">{x.subs.toLocaleString('en-US')}</td><td className="text-right">{pct(x.instoreShare, 0)}</td><td className="text-right">{x.appts.toLocaleString('en-US')}</td><td className="text-right">{x.subsPerAppt?.toFixed(2) ?? '—'}</td><td className="text-right">{x.surveys}</td><td className="text-right font-semibold">{pct(x.ltr)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Chart title="Surveys per 100 completed appointments" option={respOption} height={220} ariaLabel="Survey response rate by fiscal week: surveys per 100 completed appointments"
            table={{ columns: ['Week', 'Surveys', 'Completed appointments', 'Surveys per 100'], rows: r.map((x) => [`FW${x.fw}`, x.surveys, x.appts, x.appts ? Math.round((100 * x.surveys) / x.appts) : null]) }} />
          <Card title="By store set">
            <table className="w-full text-sm tnum">
              <caption className="sr-only">Subscriptions and appointments by store set, FYTD</caption>
              <thead className="text-left text-xs text-muted"><tr><th className="py-1 font-medium">Store set</th><th className="text-right font-medium">Stores</th><th className="text-right font-medium">Net subs</th><th className="text-right font-medium">In store</th><th className="text-right font-medium">Completed appts</th></tr></thead>
              <tbody>{v.sets.map(([k, s]) => <tr key={k} className="border-t border-border"><td className="py-1">{k}</td><td className="text-right">{s.stores.size}</td><td className="text-right">{s.subs.toLocaleString('en-US')}</td><td className="text-right">{s.instore.toLocaleString('en-US')}</td><td className="text-right">{s.appts.toLocaleString('en-US')}</td></tr>)}</tbody>
            </table>
            <p className="mt-2 text-xs text-muted">Stores with no completed appointments sell HomeCare+ but don't service it; their members are served by a servicing store, so their sales don't line up with any store's surveys.</p>
          </Card>
        </div>
      </div>
    </>
  );
}

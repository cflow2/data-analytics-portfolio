import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { db } from '@/db/db';
import { useWeekData } from '@/data/useWeekData';
import { SCREENS } from '@/screens';
import { geoParts, groupByWeek, periodSeries, weekOf, type Grain, type PeriodPoint } from '@/analytics/ltr';
import { lowest } from '@/analytics/attributes';
import { canColor, type LtrSummary } from '@/lib/ltr';
import { weekInfo } from '@/lib/fiscal';
import { monthDay } from '@/lib/dates';
import { REGIONS } from '@/domain/geo';
import { useSettings } from '@/state/settings';
import { useUi } from '@/state/ui';
import { useIsLocked } from '@/hooks/useLocked';
import { Chart, useBaseOption } from '@/components/charts/Chart';
import { useChartTokens } from '@/components/charts/tokens';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { PageGate } from '@/components/ui/PageGate';
import { Card, Delta, PageHeader, PctN, SampleBadge, Segmented } from '@/components/ui/primitives';

function NoteCell({ fw, note }: { fw: number; note?: string }) {
  const presentation = useUi((s) => s.presentation);
  const locked = useIsLocked(fw);
  const [v, setV] = useState(note ?? '');
  if (presentation || locked) return <span title={locked ? 'Week locked' : undefined}>{note}</span>;
  return (
    <input
      value={v} onChange={(e) => setV(e.target.value)} placeholder="Add a note…" aria-label={`Note for FW${fw}`}
      onClick={(e) => e.stopPropagation()}
      onBlur={async () => { if (v === (note ?? '')) return; const w = await db.weeks.get(fw); await db.weeks.put({ ...(w ?? { fw, locked: false }), fw, note: v }); }}
      className="h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-sm hover:border-border focus:border-border"
    />
  );
}

interface Row { fw: number; pct: number | null; n: number; delta: number | null; detractors: number; d06: number; lowest: string; lowestPct: number | null; note?: string }

export function LtrTrends() {
  const s = SCREENS.find((x) => x.path === '/trends')!;
  const { data, loading, error } = useWeekData();
  const [grain, setGrain] = useState<Grain>('week');
  const t = useChartTokens();
  const base = useBaseOption();
  const fyStart = useSettings((x) => x.fyStart);
  const thresholds = useSettings((x) => x.thresholds);

  const view = useMemo(() => {
    if (!data) return null;
    const fw = data.week.fw;
    const series = periodSeries(data.weekly, fw, grain);
    const regions = groupByWeek(data.ltr.filter((x) => x.fw <= fw), (x) => x.region);
    const smWeeks = Array.from({ length: 13 }, (_, i) => fw - 12 + i).filter((w) => w >= 1);
    const allPts = [...regions.values()].flatMap((m) => smWeeks.map((w) => weekOf(m, w))).filter((x) => x.pct !== null && canColor(x.n, thresholds));
    const yMin = allPts.length ? Math.max(0, Math.floor(Math.min(...allPts.map((x) => x.pct!)) / 5) * 5) : 70;
    const rows: Row[] = Array.from({ length: fw }, (_, i) => fw - i).map((w) => {
      const c = weekOf(data.weekly, w), p = weekOf(data.weekly, w - 1);
      const low = lowest(data.attrsFor(w));
      return {
        fw: w, pct: c.pct, n: c.n, delta: c.pct !== null && p.pct !== null ? c.pct - p.pct : null, detractors: c.detractors, d06: c.detractors0to6,
        lowest: low ? low.label : '', lowestPct: low?.pct ?? null, note: data.ds.weeks.get(w)?.note,
      };
    }).filter((r) => r.n > 0 || r.note);
    return { fw, series, regions, smWeeks, yMin, rows };
  }, [data, grain, thresholds]);

  const mainOption = useMemo<EChartsOption | null>(() => {
    if (!view || !data) return null;
    const pts = view.series;
    const valid = pts.filter((p) => p.pct !== null);
    const lo = valid.length ? Math.min(data.benchmark, ...valid.filter((p) => canColor(p.n, thresholds)).map((p) => p.pct!)) : data.benchmark - 5;
    const hi = valid.length ? Math.max(data.benchmark, ...valid.filter((p) => canColor(p.n, thresholds)).map((p) => p.pct!)) : data.benchmark + 5;
    const tip = (p: PeriodPoint) => {
      const head = grain === 'week' ? weekInfo(p.lastFw, fyStart).label : `${p.label} (FW${p.weeks[0]}–FW${p.weeks[p.weeks.length - 1]})${grain === 'rolling4' ? ` · rolling 4 weeks ending FW${p.lastFw}` : ''}`;
      return `<b>${head}</b><br/>LTR: <b>${p.pct === null ? '—' : p.pct.toFixed(1) + '%'}</b> · n=${p.n}${canColor(p.n, thresholds) ? '' : ' <i>(no trend)</i>'}<br/>Promoters: ${p.promoters} · Detractors: ${p.detractors} (${p.detractors0to6} at 0–6)${grain === 'week' ? `<br/>WBR ${monthDay(weekInfo(p.lastFw, fyStart).wbr)}` : ''}`;
    };
    return base({
      tooltip: { trigger: 'axis', formatter: (ps) => tip(pts[(Array.isArray(ps) ? ps[0] : ps).dataIndex as number]) },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [{ left: 48, right: 96, top: 16, height: 220 }, { left: 48, right: 96, top: 262, height: 62 }],
      xAxis: [
        { type: 'category', gridIndex: 0, data: pts.map((p) => p.label), axisLabel: { show: false }, axisTick: { show: false }, axisLine: { lineStyle: { color: t.border } } },
        { type: 'category', gridIndex: 1, data: pts.map((p) => p.label), axisTick: { show: false }, axisLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.muted, interval: grain === 'week' || grain === 'rolling4' ? 3 : 0 } },
      ],
      yAxis: [
        { type: 'value', gridIndex: 0, min: Math.floor((lo - 1) / 2) * 2, max: Math.min(100, Math.ceil((hi + 1) / 2) * 2), interval: 2, axisLabel: { formatter: '{value}%', color: t.muted }, splitLine: { lineStyle: { color: t.grid } } },
        { type: 'value', gridIndex: 1, name: 'n', nameLocation: 'middle', nameGap: 34, nameTextStyle: { color: t.muted }, splitNumber: 2, axisLabel: { color: t.muted }, splitLine: { lineStyle: { color: t.grid } } },
      ],
      series: [
        {
          name: 'LTR %', type: 'line', xAxisIndex: 0, yAxisIndex: 0, lineStyle: { width: 2, color: t.calls }, symbolSize: 7, connectNulls: false,
          data: pts.map((p) => ({
            value: p.pct === null ? null : Number(p.pct.toFixed(2)),
            itemStyle: canColor(p.n, thresholds) ? { color: t.calls, borderColor: t.surface, borderWidth: 2 } : { color: t.surface, borderColor: t.muted, borderWidth: 1.5 },
            symbolSize: grain === 'week' && p.lastFw === view.fw ? 10 : 7,
          })),
          markArea: { silent: true, itemStyle: { color: t.dark ? 'rgba(127,176,240,0.10)' : 'rgba(13,78,158,0.07)' }, label: { color: t.muted, position: 'insideTopRight', fontSize: 11 }, data: [[{ yAxis: data.benchmark - 0.5, name: `${data.benchmark}% benchmark` }, { yAxis: data.benchmark + 0.5 }]] },
          endLabel: { show: true, color: t.ink, formatter: () => { const l = pts[pts.length - 1]; return l.pct === null ? '' : `${l.pct.toFixed(1)}%  n=${l.n}`; } },
        },
        { name: 'n', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, barWidth: '60%', itemStyle: { color: t.callsSoft, borderRadius: [3, 3, 0, 0] }, data: pts.map((p) => p.n) },
      ],
    });
  }, [view, data, grain, t, base, fyStart, thresholds]);

  const cols: Col<Row>[] = [
    { id: 'fw', header: 'FW', value: (r) => r.fw, cell: (r) => <span className="font-medium">FW{r.fw}</span>, width: 70 },
    { id: 'ltr', header: 'LTR', value: (r) => (r.pct === null ? null : Number(r.pct.toFixed(1))), cell: (r) => <PctN pct={r.pct} n={r.n} />, exportExtra: [{ header: 'n', value: (r) => r.n }] },
    { id: 'n', header: 'n', value: (r) => r.n, align: 'right', width: 70 },
    { id: 'delta', header: 'Δ vs prior', value: (r) => (r.delta === null ? null : Number(r.delta.toFixed(1))), cell: (r) => <Delta value={r.delta} />, width: 110 },
    { id: 'det', header: 'Detractors (0–8)', value: (r) => r.detractors, cell: (r) => <>{r.detractors} <span className="text-xs text-muted">({r.d06} at 0–6)</span></>, exportExtra: [{ header: 'Detractors 0–6', value: (r) => r.d06 }] },
    { id: 'low', header: 'Lowest attribute', value: (r) => r.lowest, cell: (r) => (r.lowest ? <>{r.lowest} <span className="text-xs text-muted">{r.lowestPct?.toFixed(1)}%</span></> : '—'), exportExtra: [{ header: 'Lowest attribute %', value: (r) => (r.lowestPct === null ? null : Number(r.lowestPct.toFixed(1))) }] },
    { id: 'note', header: 'Notes', value: (r) => r.note ?? '', cell: (r) => <NoteCell fw={r.fw} note={r.note} />, sortable: false, width: '30%' },
  ];

  return (
    <>
      <PageHeader title={s.title} subtitle={s.subtitle} />
      <PageGate screen={s} loading={loading} error={error} empty={!!data && data.ltr.length === 0}>
        {data && view && mainOption && (
          <div className="space-y-3">
            <Chart
              title={`Weekly LTR, FY to date${data.geoFiltered ? ` · ${geoParts(data.geo).join(' › ')}` : ''}`}
              height={350} option={mainOption}
              ariaLabel={`LTR by ${grain} through FW${view.fw} with the ${data.benchmark}% benchmark band and n per period`}
              table={{ columns: ['Period', 'LTR %', 'n', 'Promoters', 'Detractors (0–8)', 'Detractors 0–6'], rows: view.series.map((p) => [p.label, p.pct === null ? null : Number(p.pct.toFixed(1)), p.n, p.promoters, p.detractors, p.detractors0to6]) }}
              actions={<Segmented<Grain> label="Grain" value={grain} onChange={setGrain} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }, { value: 'rolling4', label: 'Rolling 4-wk' }]} />}
            />
            <p className="-mt-1 text-xs text-muted">The lower panel shows n for each period on its own scale. Hollow grey points have n below {thresholds.noTrendBelow} (no trend).</p>

            <Card title={`Regions · last ${view.smWeeks.length} weeks (shared scale ${view.yMin}–100%)`}>
              <div className="grid grid-cols-7 gap-2">
                {REGIONS.map((r) => <RegionMini key={r} region={r} m={view.regions.get(r)} weeks={view.smWeeks} yMin={view.yMin} benchmark={data.benchmark} />)}
              </div>
            </Card>

            <Card title="FW-over-FW">
              <DataTable rows={view.rows} columns={cols} getRowId={(r) => String(r.fw)} exportName={`LTR_FW_over_FW_FW${view.fw}`} maxHeight={480} />
            </Card>
          </div>
        )}
      </PageGate>
    </>
  );
}

function RegionMini({ region, m, weeks, yMin, benchmark }: { region: string; m?: Map<number, LtrSummary>; weeks: number[]; yMin: number; benchmark: number }) {
  const t = useChartTokens();
  const base = useBaseOption();
  const thresholds = useSettings((x) => x.thresholds);
  const pts = weeks.map((w) => ({ w, s: m ? weekOf(m, w) : weekOf(new Map(), w) }));
  const last = pts[pts.length - 1].s;
  const option: EChartsOption = base({
    grid: { left: 4, right: 4, top: 6, bottom: 4 },
    tooltip: { trigger: 'axis', formatter: (ps) => { const p = pts[(Array.isArray(ps) ? ps[0] : ps).dataIndex as number]; return `<b>${region} · FW${p.w}</b><br/>${p.s.pct === null ? '—' : p.s.pct.toFixed(1) + '%'} · n=${p.s.n}${canColor(p.s.n, thresholds) ? '' : ' (no trend)'}`; } },
    xAxis: { type: 'category', data: pts.map((p) => `FW${p.w}`), show: false },
    yAxis: { type: 'value', min: yMin, max: 100, show: false },
    series: [{
      type: 'line', lineStyle: { width: 1.5, color: t.calls }, symbolSize: 5, connectNulls: true,
      data: pts.map((p) => ({ value: p.s.pct === null ? null : Number(p.s.pct.toFixed(1)), itemStyle: canColor(p.s.n, thresholds) ? { color: t.calls } : { color: t.surface, borderColor: t.neutral, borderWidth: 1.5 } })),
      markLine: { silent: true, symbol: 'none', lineStyle: { color: t.border, type: 'solid', width: 1 }, label: { show: false }, data: [{ yAxis: benchmark }] },
    }],
  });
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-display text-sm font-semibold">{region}</span>
        <span className="text-xs tnum">{last.pct === null ? '—' : `${last.pct.toFixed(1)}%`} <span className="text-muted">n={last.n}</span></span>
      </div>
      <div className="h-4"><SampleBadge n={last.n} /></div>
      <MiniChart option={option} label={`${region} LTR, last ${weeks.length} weeks; latest ${last.pct === null ? 'no data' : last.pct.toFixed(1) + '%'} n=${last.n}`} />
    </div>
  );
}

function MiniChart({ option, label }: { option: EChartsOption; label: string }) {
  return <div role="img" aria-label={label}><ReactEChartsCore echarts={echarts} option={option} notMerge style={{ height: 64, width: '100%' }} /></div>;
}

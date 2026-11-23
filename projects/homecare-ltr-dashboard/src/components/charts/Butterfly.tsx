import type { EChartsOption } from 'echarts';
import { themeName } from '@/domain/taxonomy';
import type { ThemeCount } from '@/analytics/voc';
import type { ChannelFilter } from '@/domain/types';
import { Chart, useBaseOption } from './Chart';
import { useChartTokens } from './tokens';

export type ButterflySort = 'mentions' | 'calls' | 'surveys';

/** Surveys extend left (orange), calls right (blue); counts labelled on the bars. Channels are never blended. */
export function Butterfly({ counts, sort = 'mentions', channel = 'both', height, title, actions, compact }: {
  counts: ThemeCount[]; sort?: ButterflySort; channel?: ChannelFilter; height?: number; title?: string; actions?: React.ReactNode; compact?: boolean;
}) {
  const t = useChartTokens();
  const base = useBaseOption();
  const rows = [...counts].sort((a, b) => {
    const k = (x: ThemeCount) => (sort === 'calls' ? x.calls : sort === 'surveys' ? x.surveys : x.calls + x.surveys);
    return k(a) - k(b); // ECharts draws categories bottom-up
  });
  const showS = channel !== 'calls', showC = channel !== 'surveys';
  const top = Math.max(1, ...rows.map((r) => Math.max(showS ? r.surveys : 0, showC ? r.calls : 0)));
  const max = Math.ceil(top * 1.18); // room for the end labels
  const names = rows.map((r) => themeName(r.theme));
  const option: EChartsOption = base({
    grid: { left: compact ? 176 : 200, right: 30, top: 8, bottom: 22, containLabel: false },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (ps) => {
        const p = (Array.isArray(ps) ? ps : [ps])[0];
        const r = rows[p.dataIndex as number];
        return `<b>${themeName(r.theme)}</b><br/>Surveys: ${r.surveys} (${r.surveysPos} positive · ${r.surveysNeg} negative)<br/>Calls: ${r.calls}<br/><span style="color:${t.muted}">Counts are records, not a blended rate.</span>`;
      },
    },
    xAxis: { type: 'value', min: showS ? -max : 0, max: showC ? max : 0, axisLabel: { formatter: (v: number) => String(Math.abs(v)), color: t.muted }, splitLine: { lineStyle: { color: t.grid } } },
    yAxis: { type: 'category', data: names, axisTick: { show: false }, axisLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.ink, width: compact ? 166 : 190, overflow: 'truncate', margin: 10 }, position: 'left', offset: 0 },
    series: [
      ...(showS ? [{
        name: 'Surveys', type: 'bar' as const, stack: 'x', barWidth: '58%', data: rows.map((r) => -r.surveys),
        itemStyle: { color: t.surveys, borderRadius: [4, 0, 0, 4] },
        label: { show: true, position: 'left' as const, color: t.ink, formatter: (p: { value: unknown }) => (Number(p.value) ? String(Math.abs(Number(p.value))) : '') },
      }] : []),
      ...(showC ? [{
        name: 'Calls', type: 'bar' as const, stack: 'x', barWidth: '58%', data: rows.map((r) => r.calls),
        itemStyle: { color: t.calls, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right' as const, color: t.ink, formatter: (p: { value: unknown }) => (Number(p.value) ? String(p.value) : '') },
      }] : []),
    ],
  });
  return (
    <Chart
      title={title} height={height ?? Math.max(160, rows.length * (compact ? 26 : 34) + 40)}
      ariaLabel={`Theme mentions by channel: ${rows.slice().reverse().map((r) => `${themeName(r.theme)} ${r.surveys} surveys, ${r.calls} calls`).join('; ')}`}
      option={option}
      table={{ columns: ['Theme', 'Survey mentions', 'Call mentions', 'Survey positive', 'Survey negative'], rows: rows.slice().reverse().map((r) => [themeName(r.theme), r.surveys, r.calls, r.surveysPos, r.surveysNeg]) }}
      actions={
        <>
          {actions}
          <span className="mr-1 hidden items-center gap-2 text-xs text-muted sm:flex" aria-hidden>
            {showS && <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: t.surveys }} />Surveys ←</span>}
            {showC && <span className="inline-flex items-center gap-1">→ Calls<i className="inline-block h-2 w-2 rounded-sm" style={{ background: t.calls }} /></span>}
          </span>
        </>
      }
    />
  );
}

import type { EChartsOption } from 'echarts';
import { themeName } from '@/domain/taxonomy';
import type { ThemeCount } from '@/analytics/voc';
import { Chart, useBaseOption } from './Chart';
import { useChartTokens } from './tokens';

/**
 * Survey comment mentions per theme: negative comments extend left, positive right (neutral in the tooltip and table).
 * Sorted by total mentions.
 */
export function ThemeBars({ counts, height, title, actions, compact }: {
  counts: ThemeCount[]; height?: number; title?: string; actions?: React.ReactNode; compact?: boolean;
}) {
  const t = useChartTokens();
  const base = useBaseOption();
  const rows = [...counts].sort((a, b) => a.surveys - b.surveys || b.theme.localeCompare(a.theme)); // ECharts draws bottom-up
  const top = Math.max(1, ...rows.map((r) => Math.max(r.surveysNeg, r.surveysPos)));
  const max = Math.ceil(top * 1.18);
  const names = rows.map((r) => themeName(r.theme));
  const option: EChartsOption = base({
    grid: { left: compact ? 176 : 200, right: 30, top: 8, bottom: 22, containLabel: false },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (ps) => {
        const p = (Array.isArray(ps) ? ps : [ps])[0];
        const r = rows[p.dataIndex as number];
        return `<b>${themeName(r.theme)}</b><br/>${r.surveys} comment${r.surveys === 1 ? '' : 's'}: ${r.surveysNeg} negative · ${r.surveysPos} positive · ${r.surveys - r.surveysNeg - r.surveysPos} neutral`;
      },
    },
    xAxis: { type: 'value', min: -max, max, axisLabel: { formatter: (v: number) => String(Math.abs(v)), color: t.muted }, splitLine: { lineStyle: { color: t.grid } } },
    yAxis: { type: 'category', data: names, axisTick: { show: false }, axisLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.ink, width: compact ? 166 : 190, overflow: 'truncate', margin: 10 } },
    series: [
      { name: 'Negative', type: 'bar', stack: 'x', barWidth: '58%', data: rows.map((r) => -r.surveysNeg),
        itemStyle: { color: t.surveys, borderRadius: [4, 0, 0, 4] },
        label: { show: true, position: 'left', color: t.ink, formatter: (p: { value: unknown }) => (Number(p.value) ? String(Math.abs(Number(p.value))) : '') } },
      { name: 'Positive', type: 'bar', stack: 'x', barWidth: '58%', data: rows.map((r) => r.surveysPos),
        itemStyle: { color: t.calls, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: t.ink, formatter: (p: { value: unknown }) => (Number(p.value) ? String(p.value) : '') } },
    ],
  });
  return (
    <Chart
      title={title} height={height ?? Math.max(160, rows.length * (compact ? 26 : 34) + 40)}
      ariaLabel={`Survey comment themes: ${rows.slice().reverse().map((r) => `${themeName(r.theme)} ${r.surveys} comments, ${r.surveysNeg} negative, ${r.surveysPos} positive`).join('; ')}`}
      option={option}
      table={{ columns: ['Theme', 'Comments', 'Negative', 'Positive', 'Neutral'], rows: rows.slice().reverse().map((r) => [themeName(r.theme), r.surveys, r.surveysNeg, r.surveysPos, r.surveys - r.surveysNeg - r.surveysPos]) }}
      actions={
        <>
          {actions}
          <span className="mr-1 hidden items-center gap-2 text-xs text-muted sm:flex" aria-hidden>
            <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: t.surveys }} />Negative ←</span>
            <span className="inline-flex items-center gap-1">→ Positive<i className="inline-block h-2 w-2 rounded-sm" style={{ background: t.calls }} /></span>
          </span>
        </>
      }
    />
  );
}

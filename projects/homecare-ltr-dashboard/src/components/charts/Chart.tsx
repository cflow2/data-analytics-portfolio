import { useRef, useState, type ReactNode } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  AriaComponent, GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, AxisPointerComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import { copyPng, copyText, toTsv, type TableData } from '@/data/export';
import { useUi } from '@/state/ui';
import { Button, cx } from '@/components/ui/primitives';
import { useChartTokens } from './tokens';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent, AriaComponent, AxisPointerComponent, CanvasRenderer]);

const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Base option: recessive axes, solid hairline grid, Inter, tabular numbers, 150–200 ms animation. */
export function useBaseOption(): (o: EChartsOption) => EChartsOption {
  const t = useChartTokens();
  return (o) => ({
    animation: !reduced,
    animationDuration: 180,
    animationDurationUpdate: 180,
    textStyle: { fontFamily: 'Inter, ui-sans-serif, system-ui', color: t.muted, fontSize: 12 },
    tooltip: {
      backgroundColor: t.surface, borderColor: t.border, textStyle: { color: t.ink, fontSize: 12 },
      extraCssText: 'border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.08);font-variant-numeric:tabular-nums;',
      ...(o.tooltip as object),
    },
    ...o,
  });
}

export function Chart({ title, option, table, height = 260, ariaLabel, className, actions, fileName }: {
  title?: ReactNode;
  option: EChartsOption;
  /** Data behind the chart: powers "Copy data" and the "View as table" fallback. */
  table: TableData;
  height?: number;
  ariaLabel: string;
  className?: string;
  actions?: ReactNode;
  fileName?: string;
}) {
  const ref = useRef<ReactEChartsCore>(null);
  const [asTable, setAsTable] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const presentation = useUi((s) => s.presentation);
  const t = useChartTokens();
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 1800); };
  const name = fileName ?? (typeof title === 'string' ? title : 'chart').replace(/[^\w-]+/g, '_');

  return (
    <section className={cx('rounded-[12px] border border-border bg-surface p-4', className)} aria-label={ariaLabel}>
      <header className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        {title && <h2 className="font-display text-sm font-semibold">{title}</h2>}
        <div className="ml-auto flex items-center gap-1 whitespace-nowrap">
          {actions}
          {msg && <span role="status" className="text-xs text-grow">{msg}</span>}
          {!presentation && (
            <>
              <Button variant="ghost" className="h-7 px-2 text-xs" onClick={async () => {
                const inst = ref.current?.getEchartsInstance();
                if (!inst || asTable) return;
                const r = await copyPng(inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: t.surface }), name);
                flash(r === 'copied' ? 'PNG copied' : 'PNG downloaded');
              }} disabled={asTable}>Copy PNG</Button>
              <Button variant="ghost" className="h-7 px-2 text-xs" onClick={async () => { await copyText(toTsv(table)); flash('Data copied'); }}>Copy data</Button>
            </>
          )}
          <Button variant="ghost" className="h-7 px-2 text-xs" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>{asTable ? 'View as chart' : 'View as table'}</Button>
        </div>
      </header>
      {asTable ? (
        <div className="overflow-auto" tabIndex={0} style={{ maxHeight: height + 40 }}>
          <table className="w-full text-sm tnum">
            <thead className="sticky top-0 bg-surface text-left text-xs text-muted"><tr>{table.columns.map((c) => <th key={c} className="py-1 pr-3 font-medium">{c}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="py-1 pr-3">{c ?? '—'}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={ariaLabel}>
          <ReactEChartsCore ref={ref} echarts={echarts} option={option} notMerge lazyUpdate style={{ height, width: '100%' }} opts={{ renderer: 'canvas' }} />
        </div>
      )}
    </section>
  );
}

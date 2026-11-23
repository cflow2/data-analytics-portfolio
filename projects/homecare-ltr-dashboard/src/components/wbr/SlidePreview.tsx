import { forwardRef } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import type { EChartsOption } from 'echarts';
import type { WeekFacts } from '@/analytics/facts';
import { chartRows, niceMax, type WbrDraft } from '@/wbr/draft';

/** 16:9 preview mirroring the exported slide (fixed light colours, like the PPTX). */
export const SlidePreview = forwardRef<ReactEChartsCore, { d: WbrDraft; f: WeekFacts; scale?: number }>(function SlidePreview({ d, f }, chartRef) {
  const rows = chartRows(f, d);
  const max = rows.length ? niceMax(Math.max(...rows.map((r) => r.total))) : 10;
  const option: EChartsOption = {
    animation: false,
    textStyle: { fontFamily: 'Inter, Arial, sans-serif', color: '#4A5568', fontSize: 10 },
    grid: { left: 30, right: 8, top: 18, bottom: 56 },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 10, color: '#4A5568' }, data: ['Surveys', 'Calls'] },
    xAxis: { type: 'category', data: rows.map((r) => r.name), axisTick: { show: false }, axisLine: { lineStyle: { color: '#DCE1E8' } }, axisLabel: { interval: 0, fontSize: 10, width: 86, overflow: 'break', color: '#4A5568' } },
    yAxis: { type: 'value', min: 0, max, splitLine: { lineStyle: { color: '#ECEFF3' } }, axisLabel: { fontSize: 9, color: '#4A5568' } },
    series: [
      { name: 'Surveys', type: 'bar', stack: 'm', barWidth: '55%', data: rows.map((r) => r.surveys), itemStyle: { color: '#E07A1F', borderColor: '#fff', borderWidth: 1 }, label: { show: true, color: '#fff', fontSize: 9, formatter: (p) => (Number(p.value) >= 5 ? String(p.value) : '') } },
      { name: 'Calls', type: 'bar', stack: 'm', data: rows.map((r) => r.calls), itemStyle: { color: '#0D4E9E', borderColor: '#fff', borderWidth: 1, borderRadius: [3, 3, 0, 0] }, label: { show: true, color: '#fff', fontSize: 9, formatter: (p) => (Number(p.value) >= 5 ? String(p.value) : '') } },
      { name: 'Total', type: 'bar', stack: 'm', data: rows.map(() => 0), label: { show: true, position: 'top', color: '#12233F', fontSize: 10, fontWeight: 600, formatter: (p) => String(rows[p.dataIndex].total) }, tooltip: { show: false } },
    ],
  };
  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-border bg-white text-[#12233F] shadow-sm" style={{ aspectRatio: '16 / 9', containerType: 'inline-size' }} aria-label="Slide preview">
      <div className="absolute inset-0 flex flex-col" style={{ padding: '3.4cqw 3.4cqw 2.2cqw', fontFamily: 'Arial, Inter, sans-serif' }}>
        <div style={{ fontSize: '2.9cqw', fontWeight: 700, lineHeight: 1.1 }}>{d.title}</div>
        <div style={{ fontSize: '1.35cqw', color: '#4A5568', marginTop: '0.4cqw' }}>{d.subtitle}</div>
        <div style={{ borderTop: '1px solid #DCE1E8', margin: '1cqw 0' }} />
        <div className="flex min-h-0 flex-1" style={{ gap: '2cqw' }}>
          <div style={{ width: '56%' }}>
            <div style={{ fontSize: '1.55cqw', fontWeight: 700, marginBottom: '0.6cqw' }}>Key Themes &amp; Insights Seen in VOC</div>
            {d.themes.filter((t) => t.include).map((t) => (
              <div key={t.id} style={{ marginBottom: '0.75cqw' }}>
                <div style={{ fontSize: '1.22cqw', fontWeight: 700 }}>{t.header}</div>
                <div style={{ fontSize: '1.06cqw', paddingLeft: '1cqw', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>• {t.line}</div>
              </div>
            ))}
          </div>
          <div className="flex min-h-0 flex-col" style={{ width: '44%' }}>
            <div style={{ background: '#FBEADB', fontSize: '1.28cqw', fontWeight: 700, padding: '0.9cqw', borderRadius: '0.4cqw' }}>{d.callout}</div>
            <div style={{ fontSize: '1.35cqw', fontWeight: 700, margin: '1cqw 0 0.2cqw' }}>{d.chartTitle}</div>
            <div className="min-h-0 flex-1">
              <ReactEChartsCore ref={chartRef} echarts={echarts} option={option} notMerge style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
            </div>
          </div>
        </div>
        <div style={{ fontSize: '0.9cqw', color: '#4A5568', marginTop: '0.6cqw' }}>{d.footnote}</div>
      </div>
    </div>
  );
});

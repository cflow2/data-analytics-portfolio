import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { useWeekData } from '@/data/useWeekData';
import { SCREENS } from '@/screens';
import { GROUPS, groupRange, lowest, rangeLabel } from '@/analytics/attributes';
import { themeMentions } from '@/analytics/voc';
import { themeName } from '@/domain/taxonomy';
import { canColor } from '@/lib/ltr';
import { useSettings } from '@/state/settings';
import { Chart, useBaseOption } from '@/components/charts/Chart';
import { sequentialFill, useChartTokens } from '@/components/charts/tokens';
import { PageGate } from '@/components/ui/PageGate';
import { Card, PageHeader, PctN, cx } from '@/components/ui/primitives';

const STRIP_WEEKS = 8;

export function Attributes() {
  const s = SCREENS.find((x) => x.path === '/attributes')!;
  const { data, loading, error } = useWeekData();
  const t = useChartTokens();
  const base = useBaseOption();
  const thresholds = useSettings((x) => x.thresholds);

  const v = useMemo(() => {
    if (!data) return null;
    const fw = data.week.fw;
    const weeks = Array.from({ length: STRIP_WEEKS }, (_, i) => fw - STRIP_WEEKS + 1 + i).filter((w) => w >= 1);
    const strip = weeks.map((w) => ({ w, scores: data.attrsFor(w) }));
    const custIds = new Set(data.ds.calls.filter((c) => !c.isAssociate).map((c) => c.id));
    const mentions = new Map(themeMentions(data.ds.tagList, fw, custIds).map((m) => [m.theme, m]));
    return { fw, weeks, strip, low: lowest(data.attrs), mentions };
  }, [data]);

  if (!data || !v) return <><PageHeader title={s.title} subtitle={s.subtitle} /><PageGate screen={s} loading={loading} error={error} empty={false}>{null}</PageGate></>;
  const scores = data.attrs;
  const empty = scores.every((a) => a.n === 0);
  const src = scores.find((a) => a.source !== 'none')?.source;
  // Journey order: pre-visit, in-home, program (top to bottom).
  const ordered = GROUPS.flatMap((g) => scores.filter((a) => a.group === g));
  const plotted = [...ordered].reverse();
  const option: EChartsOption = base({
    grid: { left: 270, right: 110, top: 8, bottom: 24 },
    tooltip: { trigger: 'item', formatter: (p) => { const a = plotted[(p as { dataIndex: number }).dataIndex]; return `<b>${a.label}</b> (${a.group})<br/>Top-2-box ${a.pct === null ? '—' : a.pct.toFixed(1) + '%'} · n=${a.n}${a.nApprox ? ' (survey sample)' : ''}`; } },
    xAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%', color: t.muted }, splitLine: { lineStyle: { color: t.grid } } },
    yAxis: { type: 'category', data: plotted.map((a) => a.label), axisTick: { show: false }, axisLine: { lineStyle: { color: t.border } },
      axisLabel: { color: t.ink, formatter: (val: string) => (v.low && val === v.low.label ? `{low|Lowest}  ${val}` : val), rich: { low: { color: t.surveysDark, fontWeight: 600, fontSize: 11 } } } },
    series: [{
      type: 'bar', barWidth: '58%',
      data: plotted.map((a) => ({ value: a.pct === null ? null : Number(a.pct.toFixed(1)), itemStyle: { color: v.low?.key === a.key ? t.surveysDark : t.surveys, opacity: v.low?.key === a.key ? 1 : 0.55, borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: t.ink, formatter: (p) => { const a = plotted[p.dataIndex]; return a.pct === null ? 'no data' : `${a.pct.toFixed(1)}%  n=${a.n}`; } },
    }],
  });

  const allStrip = v.strip.flatMap((x) => x.scores.map((a) => a.pct)).filter((p): p is number => p !== null);
  const sMin = allStrip.length ? Math.min(...allStrip) : 80, sMax = allStrip.length ? Math.max(...allStrip) : 100;

  return (
    <>
      <PageHeader title={s.title} subtitle={s.subtitle} />
      <PageGate screen={s} loading={loading} error={error} empty={empty} emptyTitle={`No attribute scores for FW${v.fw}${data.geoFiltered ? ' at this geography' : ''}`}>
        <div className="space-y-3">
          <p className="text-xs text-muted">
            {src === 'analytics'
              ? 'From the Medallia Analytics report (company-wide). n is the survey Sample Size; the export has no per-question count.'
              : 'Top-2-box (9–10) from per-survey answers. Region/district/store filters apply.'}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {GROUPS.map((g) => {
              const r = groupRange(scores, g);
              const members = scores.filter((a) => a.group === g);
              return (
                <Card key={g} className="p-3">
                  <div className="text-xs font-medium text-muted">{g}</div>
                  <div className="font-display text-2xl font-semibold tnum">{rangeLabel(r)}</div>
                  <div className="text-xs text-muted">{members.map((a) => a.label.replace(/^Associate /, '')).join(' · ')}</div>
                </Card>
              );
            })}
          </div>

          <Chart title={`Top-2-box by attribute · FW${v.fw}`} height={330} option={option}
            ariaLabel={`Attribute top-2-box for FW${v.fw}. Lowest: ${v.low ? `${v.low.label} ${v.low.pct?.toFixed(1)}%` : 'none'}`}
            table={{ columns: ['Attribute', 'Group', 'Top-2-box %', 'n'], rows: ordered.map((a) => [a.label, a.group, a.pct === null ? null : Number(a.pct.toFixed(1)), a.n]) }} />

          <Card title={`Weekly trend · FW${v.weeks[0]}–FW${v.fw}`}>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-[2px] text-sm tnum" aria-label="Attribute top-2-box by week">
                <thead><tr className="text-xs text-muted"><th className="px-2 py-1 text-left font-medium">Attribute</th>{v.weeks.map((w) => <th key={w} className={cx('px-2 py-1 font-medium', w === v.fw && 'text-ink')}>FW{w}</th>)}</tr></thead>
                <tbody>
                  {ordered.map((a) => (
                    <tr key={a.key}>
                      <th scope="row" className="px-2 py-1 text-left font-normal">{a.label}<span className="ml-1 text-[11px] text-muted">{a.group}</span></th>
                      {v.strip.map(({ w, scores: sc }) => {
                        const x = sc.find((y) => y.key === a.key)!;
                        const show = x.pct !== null && canColor(x.n, thresholds);
                        return (
                          <td key={w} className={cx('min-w-[78px] rounded-md px-2 py-1 text-center', !show && 'text-muted')} style={show ? { background: sequentialFill(x.pct!, sMin, sMax, t) } : undefined}
                            title={x.pct === null ? `FW${w}: no data` : `FW${w}: ${x.pct.toFixed(1)}% (n=${x.n})`}>
                            {x.pct === null ? '—' : <><div className="text-ink">{x.pct.toFixed(1)}%</div><div className="text-[10px] text-muted">n={x.n}</div></>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">Darker = higher top-2-box within this table ({sMin.toFixed(0)}–{sMax.toFixed(0)}%). No shading when n &lt; {thresholds.noTrendBelow}.</p>
          </Card>

          <Card title={`Attribute ↔ theme cross-check · FW${v.fw}`}>
            <table className="w-full text-sm tnum">
              <thead className="text-left text-xs text-muted"><tr><th className="py-1 font-medium">Attribute</th><th className="font-medium">Top-2-box</th><th className="font-medium">Related theme</th><th className="text-right font-medium">Survey mentions</th><th className="text-right font-medium">of which negative</th><th className="text-right font-medium">Call mentions</th></tr></thead>
              <tbody>
                {ordered.map((a) => {
                  const m = v.mentions.get(a.relatedTheme);
                  return (
                    <tr key={a.key} className={cx('border-t border-border', v.low?.key === a.key && 'font-medium')}>
                      <td className="py-1.5">{a.label}{v.low?.key === a.key && <span className="ml-2 rounded bg-surveys-soft px-1.5 text-[11px] text-surveys">Lowest</span>}</td>
                      <td><PctN pct={a.pct} n={a.n} /></td>
                      <td>{themeName(a.relatedTheme)}</td>
                      <td className="text-right">{m?.surveys ?? 0}</td>
                      <td className="text-right">{m?.surveysNeg ?? 0}</td>
                      <td className="text-right">{m?.calls ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">Survey and call mentions are separate counts and are never combined into one rate.</p>
          </Card>
        </div>
      </PageGate>
    </>
  );
}

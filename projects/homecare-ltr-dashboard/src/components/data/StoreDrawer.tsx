import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { useDataset } from '@/data/dataset';
import { byWeek, districtFor, poolWeeks, weekOf } from '@/analytics/ltr';
import { attributeScores } from '@/analytics/attributes';
import { detractorRows } from '@/analytics/detractors';
import { countsForLtr } from '@/domain/survey';
import { storeLabel } from '@/domain/geo';
import { themeName } from '@/domain/taxonomy';
import { canColor } from '@/lib/ltr';
import { monthDay, todayISO } from '@/lib/dates';
import { useSettings } from '@/state/settings';
import { Drawer } from '@/components/ui/Drawer';
import { Chart, useBaseOption } from '@/components/charts/Chart';
import { useChartTokens } from '@/components/charts/tokens';
import { Card, PctN, cx } from '@/components/ui/primitives';
import { RedactedText } from './RedactedText';

export function StoreDrawer({ storeNo, fw, onClose }: { storeNo: string; fw: number; onClose: () => void }) {
  const { data: ds } = useDataset();
  const t = useChartTokens();
  const base = useBaseOption();
  const thresholds = useSettings((x) => x.thresholds);
  const v = useMemo(() => {
    if (!ds) return null;
    const surveys = ds.surveys.filter((s) => s.storeNo === storeNo && countsForLtr(s) && s.fw <= fw + 1).sort((a, b) => b.date.localeCompare(a.date));
    const m = byWeek(surveys.filter((s) => s.fw <= fw));
    const weeks = Array.from({ length: 13 }, (_, i) => fw - 12 + i).filter((w) => w >= 1);
    const last8 = surveys.filter((s) => s.fw > fw - 8 && s.fw <= fw);
    const attrs = attributeScores(last8, [], true);
    const dets = detractorRows(surveys.filter((s) => s.fw <= fw), ds.followups, ds.tags, ds.stores, todayISO());
    const calls = ds.calls.filter((c) => c.storeNo === storeNo && !c.isAssociate).sort((a, b) => b.date.localeCompare(a.date));
    return { surveys, m, weeks, attrs, dets, calls, cur: weekOf(m, fw), l8: poolWeeks(m, fw - 7, fw), fytd: poolWeeks(m, 1, fw) };
  }, [ds, storeNo, fw]);
  if (!ds || !v) return null;
  const st = ds.stores.get(storeNo);
  const option: EChartsOption = base({
    grid: { left: 40, right: 16, top: 12, bottom: 24 },
    tooltip: { trigger: 'axis', formatter: (ps) => { const w = v.weeks[(Array.isArray(ps) ? ps[0] : ps).dataIndex as number]; const s = weekOf(v.m, w); return `<b>FW${w}</b><br/>${s.pct === null ? '—' : s.pct.toFixed(1) + '%'} · n=${s.n}`; } },
    xAxis: { type: 'category', data: v.weeks.map((w) => `FW${w}`), axisLabel: { color: t.muted, interval: 2 }, axisLine: { lineStyle: { color: t.border } }, axisTick: { show: false } },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%', color: t.muted }, splitLine: { lineStyle: { color: t.grid } } },
    series: [{ type: 'line', connectNulls: true, lineStyle: { width: 2, color: t.calls }, symbolSize: 7,
      data: v.weeks.map((w) => { const s = weekOf(v.m, w); return { value: s.pct === null ? null : Number(s.pct.toFixed(1)), itemStyle: canColor(s.n, thresholds) ? { color: t.calls } : { color: t.surface, borderColor: t.neutral, borderWidth: 1.5 } }; }) }],
  });
  return (
    <Drawer title={storeLabel(storeNo, ds.stores)} subtitle={`${st?.region || '—'} › ${districtFor(storeNo, ds.stores)} · selected week FW${fw}`} onClose={onClose} width={700}>
      <div className="grid grid-cols-3 gap-2">
        {([['FW' + fw, v.cur], ['Last 8 weeks', v.l8], ['FYTD', v.fytd]] as const).map(([l, s]) => (
          <Card key={l} className="p-3"><div className="text-xs text-muted">{l}</div><div className="font-display text-xl font-semibold"><PctN pct={s.pct} n={s.n} /></div></Card>
        ))}
      </div>
      <Chart title="LTR, last 13 weeks" height={170} option={option} ariaLabel={`Store ${storeNo} LTR trend`}
        table={{ columns: ['FW', 'LTR %', 'n'], rows: v.weeks.map((w) => { const s = weekOf(v.m, w); return [`FW${w}`, s.pct === null ? null : Number(s.pct.toFixed(1)), s.n]; }) }} />
      <Card title="Attributes · last 8 weeks (top-2-box)">
        {v.attrs.every((a) => a.n === 0) ? <p className="text-sm text-muted">No attribute answers for this store. Upload the Medallia Responses export.</p> : (
          <ul className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">{v.attrs.map((a) => <li key={a.key} className="flex justify-between gap-2"><span className="truncate text-muted">{a.label}</span><PctN pct={a.pct} n={a.n} digits={0} /></li>)}</ul>
        )}
      </Card>
      <Card title={`Detractors · ${v.dets.length}`}>
        {v.dets.length === 0 ? <p className="text-sm text-muted">None through FW{fw}.</p> : (
          <ul className="divide-y divide-border text-sm">
            {v.dets.map((d) => (
              <li key={d.id} className="py-1.5">
                <div className="flex gap-3 text-xs text-muted tnum"><span>{monthDay(d.date)} · FW{d.fw}</span><span>Score {d.score}</span><span className={cx(d.followUp === 'Documented' ? 'text-grow' : 'text-surveys')}>{d.followUp}</span></div>
                <RedactedText recordId={d.id} field="comment" text={d.comment} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={`Surveys · ${v.surveys.length}`}>
        <ul className="max-h-80 divide-y divide-border overflow-y-auto text-sm" tabIndex={0}>
          {v.surveys.map((s) => {
            const tag = ds.tags.get(s.id);
            return (
              <li key={s.id} className="py-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted tnum">
                  <span>{monthDay(s.date)} · FW{s.fw}{s.fw > fw ? ' (next week)' : ''}</span><span className={cx('font-medium', (s.ltr ?? 10) < 9 ? 'text-surveys' : 'text-ink')}>Score {s.ltr ?? '—'}</span>
                  {tag && [tag.primary, ...tag.secondary].filter((x) => x !== 'other').map((th) => <span key={th} className="rounded bg-surface-2 px-1.5">{themeName(th)}</span>)}
                </div>
                {s.comment ? <RedactedText recordId={s.id} field="comment" text={s.comment} /> : <span className="text-xs italic text-muted">No comment</span>}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card title={`Calls mentioning this store · ${v.calls.length}`}>
        {v.calls.length === 0 ? <p className="text-sm text-muted">No call notes mention store #{storeNo}.</p> : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto text-sm" tabIndex={0}>
            {v.calls.map((c) => (
              <li key={c.id} className="py-1.5">
                <div className="flex gap-2 text-xs text-muted"><span>{monthDay(c.date)} · FW{c.fw}</span><span>{c.driver}</span>{ds.tags.get(c.id) && <span className="rounded bg-surface-2 px-1.5">{themeName(ds.tags.get(c.id)!.primary)}</span>}</div>
                <RedactedText recordId={c.id} field="notes" text={c.notes} className="text-xs" />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Drawer>
  );
}

import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { db } from '@/db/db';
import { useWeekData } from '@/data/useWeekData';
import { SCREENS } from '@/screens';
import { closedLoopText, detractorRows, rootCauseMix, type DetractorRow } from '@/analytics/detractors';
import { DEFAULT_TAXONOMY, themeName } from '@/domain/taxonomy';
import { storeLabel } from '@/domain/geo';
import { countsForLtr } from '@/domain/survey';
import { monthDay, todayISO } from '@/lib/dates';
import { copyText } from '@/data/export';
import { useUi } from '@/state/ui';
import type { FollowUpStatus, ThemeTag } from '@/domain/types';
import { Chart, useBaseOption } from '@/components/charts/Chart';
import { useChartTokens } from '@/components/charts/tokens';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageGate } from '@/components/ui/PageGate';
import { Button, Card, PageHeader, Select, cx } from '@/components/ui/primitives';
import { RedactedText } from '@/components/data/RedactedText';
import { insightReason } from '@/ingest/followup';
import { assertUnlocked } from '@/tagging/manual';

const UNTAGGED = 'untagged';
const label = (theme: string) => (theme === UNTAGGED ? 'Untagged' : themeName(theme));

async function setRootCause(r: DetractorRow, theme: string, existing?: ThemeTag) {
  await assertUnlocked(r.fw);
  await db.tags.put({
    recordId: r.id, channel: 'survey', fw: r.fw, primary: theme,
    secondary: (existing?.secondary ?? []).filter((x) => x !== theme), subTag: existing?.primary === theme ? existing.subTag : undefined,
    sentiment: existing?.sentiment ?? 'Negative', confidence: 1, source: 'Manual', reviewed: true,
    rationale: existing ? `Changed from ${existing.primary} (${existing.source})` : 'Set on the Detractors screen',
  });
}

const STATUS_CLS: Record<FollowUpStatus, string> = {
  Documented: 'bg-grow-soft text-grow', 'Email only': 'bg-watch text-watch-ink', Missing: 'bg-surveys-soft text-surveys',
};

export function Detractors() {
  const s = SCREENS.find((x) => x.path === '/detractors')!;
  const { data, loading, error } = useWeekData();
  const t = useChartTokens();
  const base = useBaseOption();
  const presentation = useUi((x) => x.presentation);
  const [band, setBand] = useState<'all' | '0-6' | '7-8'>('all');
  const [fu, setFu] = useState<'all' | FollowUpStatus>('all');
  const [theme, setTheme] = useState<string>('all');
  const [copied, setCopied] = useState(false);

  const v = useMemo(() => {
    if (!data) return null;
    const today = todayISO();
    const rows = detractorRows(data.weekSurveys, data.ds.followups, data.ds.tags, data.ds.stores, today);
    // Early next-week signal: dated after this week's Friday. Never counted in this week.
    const next = data.ltr.filter((x) => x.fw === data.week.fw + 1 && x.date > data.week.end && countsForLtr(x));
    const nextRows = detractorRows(next, data.ds.followups, data.ds.tags, data.ds.stores, today);
    return { rows, mix: rootCauseMix(rows), nextRows, nextN: next.length };
  }, [data]);

  const filtered = useMemo(() => (v?.rows ?? []).filter((r) =>
    (band === 'all' || r.band === band) && (fu === 'all' || r.followUp === fu) && (theme === 'all' || (r.rootCause ?? UNTAGGED) === theme)), [v, band, fu, theme]);

  if (!data || !v) return <><PageHeader title={s.title} subtitle={s.subtitle} /><PageGate screen={s} loading={loading} error={error} empty={false}>{null}</PageGate></>;

  const lbl = (no: string) => storeLabel(no, data.ds.stores);
  const cur = data.cur;
  const documented = v.rows.filter((r) => r.followUp === 'Documented').length;
  const top = v.mix[0];
  const mixText = top ? `${top.count} of ${v.rows.length} ${label(top.theme).toLowerCase()}` : '—';

  const cols: Col<DetractorRow>[] = [
    { id: 'date', header: 'Date', value: (r) => r.date, cell: (r) => <span className="whitespace-nowrap">{monthDay(r.date)}</span>, width: 72 },
    { id: 'fw', header: 'FW', value: (r) => r.fw, width: 50 },
    { id: 'store', header: 'Store', value: (r) => lbl(r.storeNo), width: 170 },
    { id: 'region', header: 'Region', value: (r) => r.region, width: 64 },
    { id: 'district', header: 'District', value: (r) => r.district, width: 84 },
    ...(v.rows.some((r) => r.associate) ? [{ id: 'associate', header: 'Associate', value: (r: DetractorRow) => r.associate ?? '—', width: 140 } as Col<DetractorRow>] : []),
    { id: 'score', header: 'Score', value: (r) => r.score, align: 'right', width: 62,
      cell: (r) => <span className={cx('font-semibold', r.band === '0-6' && 'text-surveys')}>{r.score}<span className="sr-only"> ({r.band})</span></span> },
    { id: 'comment', header: 'Comment (redacted)', value: (r) => r.comment, sortable: false, width: '24%', cell: (r) => <RedactedText recordId={r.id} field="comment" text={r.comment} /> },
    { id: 'root', header: 'Root cause', value: (r) => label(r.rootCause ?? UNTAGGED), width: 170,
      exportExtra: [{ header: 'Root cause source', value: (r) => r.rootCauseSource ?? '' }],
      cell: (r) => presentation || data.ds.weeks.get(r.fw)?.locked ? label(r.rootCause ?? UNTAGGED) : (
        <div>
          <select value={r.rootCause ?? ''} aria-label={`Root cause for survey ${r.id}`} onClick={(e) => e.stopPropagation()}
            onChange={(e) => e.target.value && void setRootCause(r, e.target.value, data.ds.tags.get(r.id))}
            className="h-7 w-full min-w-[150px] rounded border border-border bg-surface px-1 text-xs">
            <option value="">Untagged</option>
            {DEFAULT_TAXONOMY.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}
          </select>
          {r.rootCauseSource && <div className="mt-0.5 text-[10px] text-muted">{r.rootCauseSource === 'Demo' ? 'Demo tag' : r.rootCauseSource}</div>}
        </div>
      ) },
    { id: 'fu', header: 'SM follow-up', value: (r) => r.followUp, width: 108,
      cell: (r) => <span title={r.followUp === 'Missing' && !r.followUpId ? 'Survey not in the follow-up file' : insightReason(r.smInsight)} className={cx('rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_CLS[r.followUp])}>{r.followUp}</span> },
    { id: 'insight', header: 'SM insight (redacted)', value: (r) => r.smInsight, sortable: false, width: '18%',
      cell: (r) => (r.followUpId && r.smInsight ? <RedactedText recordId={r.followUpId} field="insights" text={r.smInsight} className="text-xs" /> : <span className="text-xs text-muted">—</span>) },
    { id: 'days', header: 'Days', value: (r) => r.daysSince, align: 'right', width: 56,
      cell: (r) => <span className={cx(r.overdue && 'font-medium text-surveys')}>{r.daysSince}{r.overdue && <span className="sr-only"> overdue</span>}</span> },
  ];

  const mixOption: EChartsOption = base({
    grid: { left: 190, right: 60, top: 8, bottom: 8 },
    tooltip: { trigger: 'item', formatter: (p) => { const m = v.mix[v.mix.length - 1 - (p as { dataIndex: number }).dataIndex]; return `${label(m.theme)}: ${m.count} of ${v.rows.length} detractors`; } },
    xAxis: { type: 'value', show: false, max: Math.max(1, ...v.mix.map((m) => m.count)) * 1.15 },
    yAxis: { type: 'category', data: v.mix.map((m) => label(m.theme)).reverse(), axisTick: { show: false }, axisLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.ink } },
    series: [{ type: 'bar', barWidth: '55%', data: v.mix.map((m) => m.count).reverse(), itemStyle: { color: t.surveys, borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: t.ink, formatter: (p) => `${p.value} of ${v.rows.length}` } }],
  });

  return (
    <>
      <PageHeader title={s.title} subtitle={s.subtitle} />
      <PageGate screen={s} loading={loading} error={error} empty={cur.n === 0} emptyTitle={`No Tracker surveys for FW${data.week.fw}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <KpiCard label={`Detractors (0–8) · FW${data.week.fw}`} value={String(cur.detractors)} sub={`of which ${cur.detractors0to6} scored 0–6 · ${cur.detractors7to8} scored 7–8`} />
            <KpiCard label="% of surveys" value={cur.n ? `${((100 * cur.detractors) / cur.n).toFixed(1)}%` : '—'} n={cur.n} />
            <KpiCard label="SM follow-up documented" value={<>{documented}<span className="font-sans text-sm font-normal text-muted"> of {v.rows.length}</span></>}
              sub={`${v.rows.filter((r) => r.followUp === 'Email only').length} email only · ${v.rows.filter((r) => r.followUp === 'Missing').length} missing from the follow-up file`} />
            <KpiCard label="Root-cause mix" value={<span className="text-xl">{mixText}</span>} sub={v.mix.slice(1, 4).map((m) => `${label(m.theme)} ${m.count}`).join(' · ')} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Chart className="col-span-2" title={`Root cause · ${v.rows.length} detractors`} height={Math.max(120, v.mix.length * 34 + 20)} option={mixOption}
              ariaLabel={`Detractor root causes: ${v.mix.map((m) => `${label(m.theme)} ${m.count}`).join(', ')}`}
              table={{ columns: ['Root cause', 'Detractors', 'Of'], rows: v.mix.map((m) => [label(m.theme), m.count, v.rows.length]) }} />
            <Card title={`Next week preview · FW${data.week.fw + 1}`} className="border-dashed">
              <p className="text-xs text-muted">Surveys dated after Fri {monthDay(data.week.end)}. Not counted in FW{data.week.fw}.</p>
              {v.nextN === 0 ? <p className="mt-2 text-sm text-muted">No FW{data.week.fw + 1} surveys loaded yet.</p> : (
                <>
                  <p className="mt-2 text-sm"><strong>{v.nextRows.length}</strong> detractor{v.nextRows.length === 1 ? '' : 's'} so far of n={v.nextN}</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {v.nextRows.map((r) => <li key={r.id} className="tnum">{monthDay(r.date)} · {lbl(r.storeNo)} · score <strong>{r.score}</strong>{r.rootCause && <span className="text-muted"> · {label(r.rootCause)}</span>}</li>)}
                  </ul>
                </>
              )}
            </Card>
          </div>

          <Card title={`Detractors · FW${data.week.fw}`}>
            <DataTable
              rows={filtered} columns={cols} getRowId={(r) => r.id} initialSort={[{ id: 'score', desc: false }]}
              exportName={`Detractors_FW${data.week.fw}`} maxHeight={680} empty="No detractors match these filters."
              rowClassName={(r) => (r.overdue ? 'bg-surveys-soft/40' : undefined)}
              toolbar={
                <>
                  <Select label="Score band" value={band} onChange={setBand} options={[{ value: 'all', label: 'All 0–8' }, { value: '0-6', label: '0–6' }, { value: '7-8', label: '7–8' }]} />
                  <Select label="Follow-up" value={fu} onChange={setFu} options={[{ value: 'all', label: 'All' }, { value: 'Documented', label: 'Documented' }, { value: 'Email only', label: 'Email only' }, { value: 'Missing', label: 'Missing' }]} />
                  <Select label="Root cause" value={theme} onChange={setTheme} options={[{ value: 'all', label: 'All themes' }, ...v.mix.map((m) => ({ value: m.theme, label: `${label(m.theme)} (${m.count})` }))]} />
                </>
              }
            />
          </Card>

          <Card title="Closed-loop tracker" actions={!presentation && (
            <Button variant="secondary" onClick={async () => { await copyText(closedLoopText(v.rows, lbl)); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>{copied ? 'Copied' : 'Copy list for stores'}</Button>
          )}>
            {v.rows.filter((r) => r.overdue).length === 0 ? <p className="text-sm text-muted">Every FW{data.week.fw} detractor has documented SM contact.</p> : (
              <>
                <p className="mb-2 text-sm"><strong className="text-surveys">{v.rows.filter((r) => r.overdue).length}</strong> detractor(s) have no documented SM contact 48+ hours after the survey.</p>
                <ul className="space-y-1 text-sm tnum">
                  {v.rows.filter((r) => r.overdue).map((r) => (
                    <li key={r.id} className="flex flex-wrap gap-x-3">
                      <span className="font-medium">{lbl(r.storeNo)}</span><span className="text-muted">{r.region} › {r.district}</span>
                      <span>Survey {r.id} · {monthDay(r.date)} · score {r.score}</span>
                      <span className={cx('rounded-full px-2 text-[11px] font-medium', STATUS_CLS[r.followUp])}>{r.followUp}</span>
                      <span className="text-muted">{r.daysSince} days</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">The copied list includes store, survey ID, date, score and status only, with no comments or names.</p>
              </>
            )}
          </Card>
        </div>
      </PageGate>
    </>
  );
}

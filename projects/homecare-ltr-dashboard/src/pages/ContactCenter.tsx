import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { db } from '@/db/db';
import { useWeekData } from '@/data/useWeekData';
import { SCREENS } from '@/screens';
import { callKpis } from '@/analytics/voc';
import { countBy, dailyVolume, repeatCallers, themeSubCounts } from '@/analytics/calls';
import { callOutcome, splitCallNotes } from '@/tagging/engine';
import { storeLabel } from '@/domain/geo';
import { dayName, monthDay } from '@/lib/dates';
import { copyText } from '@/data/export';
import type { CallRecord, Escalation, ThemeTag } from '@/domain/types';
import type { ValidationReport } from '@/ingest/types';
import { useUi } from '@/state/ui';
import { Chart, useBaseOption } from '@/components/charts/Chart';
import { useChartTokens } from '@/components/charts/tokens';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageGate } from '@/components/ui/PageGate';
import { Button, Card, PageHeader, Select, cx } from '@/components/ui/primitives';
import { RedactedText } from '@/components/data/RedactedText';
import { TagEditor } from '@/components/voc/TagEditor';

type EscStatus = Escalation['status'];
const ESC: EscStatus[] = ['New', 'Escalated to Field Support', 'Resolved'];

function escalationDraft(c: CallRecord, storeText: string): string {
  const { reason } = splitCallNotes(c.notes);
  return [
    `Subject: HomeCare+ post-service issue — Case ${c.caseNo}${c.storeNo ? ` — Store ${c.storeNo}` : ''}`,
    '',
    'Field Support team,',
    '',
    `A HomeCare+ member called on ${monthDay(c.date)} (case ${c.caseNo}) about a problem after a recent visit:`,
    `“${reason}”`,
    '',
    `Servicing store: ${storeText}`,
    'Could you review the case, contact the member, and let me know the outcome? I can share the full case notes if needed.',
    '',
    'Thank you,',
  ].join('\n');
}

function Draft({ text, onClose }: { text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Escalation draft" className="w-[640px] rounded-[12px] border border-border bg-surface p-4" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-semibold">Draft escalation to Field Support</h2>
        <p className="text-xs text-muted">Uses the redacted note. Edit before sending.</p>
        <textarea defaultValue={text} rows={14} className="mt-2 w-full rounded-lg border border-border bg-surface p-2 font-mono text-xs" aria-label="Draft text" id="esc-draft" />
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={async () => { await copyText((document.getElementById('esc-draft') as HTMLTextAreaElement).value); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</Button>
        </div>
      </div>
    </div>
  );
}

interface CallRow { c: CallRecord; tag?: ThemeTag }

export function ContactCenter() {
  const sc = SCREENS.find((x) => x.path === '/calls')!;
  const { data, loading, error } = useWeekData();
  const t = useChartTokens();
  const base = useBaseOption();
  const presentation = useUi((x) => x.presentation);
  const [draft, setDraft] = useState<string | null>(null);
  const [themeF, setThemeF] = useState('all');
  const [typeF, setTypeF] = useState('all');

  const v = useMemo(() => {
    if (!data) return null;
    const { ds, week } = data;
    const fw = week.fw;
    const all = ds.calls.filter((c) => c.fw === fw);
    const customer = all.filter((c) => !c.isAssociate);
    const k = callKpis(all, ds.tags);
    const tags = customer.map((c) => ds.tags.get(c.id)).filter((x): x is ThemeTag => !!x);
    const avoidable = tags.filter((x) => x.contactType === 'Avoidable').length;
    const dropped = ds.files.map((f) => f.report as ValidationReport | undefined).filter((r) => r?.targetWeek === fw).reduce((a, r) => a + (r!.outsideWeek ?? 0), 0);
    const cancels = customer.map((c) => ({ c, tag: ds.tags.get(c.id) })).filter((x) => x.tag?.cancellation).map((x) => ({ ...x, out: callOutcome(x.c.notes) }));
    const damage = customer.filter((c) => { const tg = ds.tags.get(c.id); return tg && (tg.primary === 'damage' || tg.escalate); });
    return {
      fw, week, all, customer, k, tags, avoidable, dropped, cancels, damage,
      drivers: countBy(customer, (c) => c.driver || '(blank)'),
      assocDrivers: countBy(all.filter((c) => c.isAssociate), (c) => c.driver),
      subs: themeSubCounts(tags),
      types: countBy(tags, (x) => x.contactType ?? 'Untagged'),
      daily: dailyVolume(customer, week.start),
      repeats: repeatCallers(customer),
      rows: customer.map((c) => ({ c, tag: ds.tags.get(c.id) })) as CallRow[],
      cancelDrivers: countBy(cancels, (x) => `${x.tag!.primary}|${x.tag!.subTag ?? ''}`),
    };
  }, [data]);

  if (!data || !v) return <><PageHeader title={sc.title} subtitle={sc.subtitle} /><PageGate screen={sc} loading={loading} error={error} empty={false}>{null}</PageGate></>;
  const { ds } = data;
  const tname = (id: string) => ds.taxonomy.find((x) => x.id === id)?.name ?? id;
  const lbl = (no?: string) => (no ? storeLabel(no, ds.stores) : 'Not stated in notes');

  const hbar = (rows: { key: string; count: number }[], color: string, labelW = 220): EChartsOption => base({
    grid: { left: labelW, right: 48, top: 4, bottom: 4 },
    tooltip: { trigger: 'item', formatter: (p) => { const r = [...rows].reverse()[(p as { dataIndex: number }).dataIndex]; return `${r.key}: <b>${r.count}</b> call${r.count === 1 ? '' : 's'}`; } },
    xAxis: { type: 'value', show: false, max: Math.max(1, ...rows.map((r) => r.count)) * 1.15 },
    yAxis: { type: 'category', data: [...rows].reverse().map((r) => r.key), axisTick: { show: false }, axisLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.ink, width: labelW - 12, overflow: 'truncate' } },
    series: [{ type: 'bar', barWidth: '60%', data: [...rows].reverse().map((r) => r.count), itemStyle: { color, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: t.ink } }],
  });

  // Theme × sub-tag stacked bars (blue shades by sub-tag order within the theme).
  const themeOrder = [...v.subs].map(([th, m]) => ({ th, total: [...m.values()].reduce((a, b) => a + b, 0), m })).sort((a, b) => a.total - b.total);
  const maxSubs = Math.max(1, ...themeOrder.map((x) => x.m.size));
  const shades = t.dark ? ['#4A8FE0', '#3570b8', '#7fb0f0', '#2a5a96', '#a9c9f3', '#1f4778'] : ['#0D4E9E', '#3a72bd', '#7fa6da', '#1b3f75', '#a9c4e8', '#5b8bcc'];
  const subSeries = Array.from({ length: maxSubs }, (_, i) => ({
    type: 'bar' as const, stack: 'x', barWidth: '60%',
    itemStyle: { color: shades[i % shades.length], borderColor: t.surface, borderWidth: 2 },
    data: themeOrder.map((x) => { const e = [...x.m].sort((a, b) => b[1] - a[1])[i]; return e ? { value: e[1], name: e[0] } : { value: 0, name: '' }; }),
    label: { show: true, color: i % 2 === 0 ? '#fff' : t.ink, formatter: (p: { value: unknown }) => (Number(p.value) >= 4 ? String(p.value) : '') },
  }));
  const themeOption: EChartsOption = base({
    grid: { left: 190, right: 60, top: 4, bottom: 4 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => {
      const i = (Array.isArray(ps) ? ps[0] : ps).dataIndex as number; const x = themeOrder[i];
      return `<b>${tname(x.th)}</b> · ${x.total} calls<br/>` + [...x.m].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s === '—' ? 'No sub-tag' : s}: ${n}`).join('<br/>');
    } },
    xAxis: { type: 'value', show: false, max: Math.max(1, ...themeOrder.map((x) => x.total)) * 1.12 },
    yAxis: { type: 'category', data: themeOrder.map((x) => tname(x.th)), axisTick: { show: false }, axisLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.ink } },
    series: [...subSeries, { type: 'bar', stack: 'x', data: themeOrder.map(() => 0), label: { show: true, position: 'right', color: t.ink, formatter: (p: { dataIndex: number }) => String(themeOrder[p.dataIndex].total) } }],
  });
  const dailyOption: EChartsOption = base({
    grid: { left: 36, right: 16, top: 20, bottom: 24 },
    tooltip: { trigger: 'axis', formatter: (ps) => { const d = v.daily[(Array.isArray(ps) ? ps[0] : ps).dataIndex as number]; return `${dayName(d.date)} ${monthDay(d.date)}: <b>${d.calls}</b> customer calls`; } },
    xAxis: { type: 'category', data: v.daily.map((d) => `${dayName(d.date)} ${monthDay(d.date).split(' ')[1]}`), axisTick: { show: false }, axisLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.muted } },
    yAxis: { type: 'value', min: 0, axisLabel: { color: t.muted }, splitLine: { lineStyle: { color: t.grid } } },
    series: [{ type: 'line', data: v.daily.map((d) => d.calls), lineStyle: { width: 2, color: t.calls }, itemStyle: { color: t.calls }, symbolSize: 7, label: { show: true, position: 'top', color: t.ink } }],
  });

  const typeRows = ['Avoidable', 'Deflectable', 'Necessary'].map((k) => ({ key: k, count: v.types.find((x) => x.key === k)?.count ?? 0 }));
  const cancelRows = v.cancelDrivers.map((x) => { const [th, sub] = x.key.split('|'); return { key: `${tname(th)}${sub ? ` · ${sub}` : ''}`, count: x.count }; });

  const cols: Col<CallRow>[] = [
    { id: 'date', header: 'Date', value: (r) => r.c.date, cell: (r) => <span className="whitespace-nowrap">{dayName(r.c.date)} {monthDay(r.c.date)}</span>, width: 92 },
    { id: 'driver', header: 'Call Driver (original)', value: (r) => r.c.driver, width: 180, exportExtra: [{ header: 'Driver (normalized)', value: (r) => r.c.driverNorm }] },
    { id: 'case', header: 'Case #', value: (r) => r.c.caseNo, width: 100 },
    { id: 'theme', header: 'Theme · sub-tag', value: (r) => (r.tag ? `${tname(r.tag.primary)}${r.tag.subTag ? ` · ${r.tag.subTag}` : ''}` : 'Untagged'), width: 290,
      cell: (r) => <TagEditor recordId={r.c.id} channel="call" fw={r.c.fw} tag={r.tag} taxonomy={ds.taxonomy} compact /> },
    { id: 'type', header: 'Contact type', value: (r) => r.tag?.contactType ?? '', width: 96 },
    { id: 'cancel', header: 'Cancel', value: (r) => (r.tag?.cancellation ? 'Yes' : ''), width: 60 },
    { id: 'notes', header: 'Note (redacted)', value: (r) => r.c.notes, sortable: false, cell: (r) => (
      <details><summary className="cursor-pointer text-xs">{splitCallNotes(r.c.notes).reason.slice(0, 110)}{splitCallNotes(r.c.notes).reason.length > 110 ? '…' : ''}</summary>
        <RedactedText recordId={r.c.id} field="notes" text={r.c.notes} className="text-xs" /></details>
    ) },
  ];
  const rows = v.rows.filter((r) => (themeF === 'all' || r.tag?.primary === themeF) && (typeF === 'all' || r.tag?.contactType === typeF));

  return (
    <>
      <PageHeader title={sc.title} subtitle={sc.subtitle} />
      <PageGate screen={sc} loading={loading} error={error} empty={v.all.length === 0} emptyTitle={`No Loyalty Case calls for FW${v.fw}`}>
        <div className="space-y-3">
          {data.geoFiltered && <p className="text-xs text-muted">Calls are shown company-wide: most call notes don’t name a store.</p>}
          <div className="grid grid-cols-5 gap-3">
            <KpiCard label="Customer calls" value={v.k.calls.toLocaleString()} sub={`${v.k.cases.toLocaleString()} distinct cases${v.dropped ? ` · ${v.dropped} rows outside FW${v.fw} dropped` : ''}`} />
            <KpiCard label="Associate / store calls" value={String(v.k.associate)} sub="Help-desk calls · never in VOC" />
            <KpiCard label="Cancellations" value={String(v.k.cancellations)} sub={`${v.cancels.filter((x) => x.out.cancellation === 'Processed').length} processed · ${v.cancels.filter((x) => x.out.cancellation !== 'Processed').length} requests`} />
            <KpiCard label="Driven by exclusions" value={v.k.exclusionCancelPct === null ? '—' : `${Math.round(v.k.exclusionCancelPct)}%`} sub={`${v.k.exclusionCancels} of ${v.k.cancellations} cancellations`} />
            <KpiCard label="Avoidable share" value={v.tags.length ? `${Math.round((100 * v.avoidable) / v.tags.length)}%` : '—'} sub={`${v.avoidable} of ${v.tags.length} tagged calls`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Chart title="Calls by theme and sub-tag" height={Math.max(180, themeOrder.length * 32 + 16)} option={themeOption}
              ariaLabel={`Calls by theme: ${[...themeOrder].reverse().map((x) => `${tname(x.th)} ${x.total}`).join(', ')}`}
              table={{ columns: ['Theme', 'Sub-tag', 'Calls'], rows: [...themeOrder].reverse().flatMap((x) => [...x.m].map(([s, n]) => [tname(x.th), s, n])) }} />
            <Chart title="Calls by Call Driver (original values)" height={Math.max(180, Math.min(14, v.drivers.length) * 28 + 16)} option={hbar(v.drivers.slice(0, 14), t.calls)}
              ariaLabel={`Calls by driver: ${v.drivers.slice(0, 8).map((d) => `${d.key} ${d.count}`).join(', ')}`}
              table={{ columns: ['Call Driver', 'Calls'], rows: v.drivers.map((d) => [d.key, d.count]) }} />
            <Chart title={<span>Contact type <span className="block text-[11px] font-normal text-muted">Avoidable = journey failure · Deflectable = self-service could handle · Necessary = member’s choice</span></span>} height={150} option={hbar(typeRows, t.calls, 120)} ariaLabel={`Contact types: ${typeRows.map((x) => `${x.key} ${x.count}`).join(', ')}`}
              table={{ columns: ['Contact type', 'Calls'], rows: typeRows.map((x) => [x.key, x.count]) }} />
            <Chart title={`Daily customer calls · Sat ${monthDay(v.week.start)} – Fri ${monthDay(v.week.end)}`} height={150} option={dailyOption}
              ariaLabel={`Daily calls: ${v.daily.map((d) => `${dayName(d.date)} ${d.calls}`).join(', ')}`} table={{ columns: ['Date', 'Calls'], rows: v.daily.map((d) => [d.date, d.calls]) }} />
          </div>

          <Card title={`Cancellation analysis · ${v.cancels.length}`}>
            <p className="mb-2 text-xs text-muted">A cancel request is not a processed cancellation, and a refund request is not a refund: the status columns come from the call’s “Completed Actions”.</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <h3 className="mb-1 text-xs font-medium text-muted">What drove it</h3>
                <ul className="space-y-1 text-sm tnum">{cancelRows.map((r) => <li key={r.key} className="flex justify-between gap-2"><span>{r.key}</span><span className="font-medium">{r.count}</span></li>)}</ul>
              </div>
              <div className="col-span-2">
                <DataTable rows={v.cancels} getRowId={(x) => x.c.id} exportName={`Cancellations_FW${v.fw}`} maxHeight={300}
                  columns={[
                    { id: 'd', header: 'Date', value: (x) => x.c.date, cell: (x) => monthDay(x.c.date), width: 64 },
                    { id: 'case', header: 'Case #', value: (x) => x.c.caseNo, width: 100 },
                    { id: 'why', header: 'Driver', value: (x) => `${tname(x.tag!.primary)}${x.tag!.subTag ? ` · ${x.tag!.subTag}` : ''}` },
                    { id: 'st', header: 'Status', value: (x) => x.out.cancellation, width: 90 },
                    { id: 'win', header: '30 days', value: (x) => x.out.window, width: 110 },
                    { id: 'ref', header: 'Refund', value: (x) => x.out.refund, width: 120 },
                  ]} />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <Card title={`Damage & safety queue · ${v.damage.length}`} className="col-span-2">
              {v.damage.length === 0 ? <p className="text-sm text-muted">No damage or safety calls in FW{v.fw}.</p> : (
                <div className="grid max-h-[520px] grid-cols-2 gap-2 overflow-y-auto" tabIndex={0}>
                  {v.damage.map((c) => {
                    const st: EscStatus = ds.escalations.get(c.id)?.status ?? 'New';
                    return (
                      <article key={c.id} className={cx('rounded-lg border p-2.5', st === 'New' ? 'border-surveys' : 'border-border')} aria-label={`Damage call ${c.caseNo}`}>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted tnum">
                          <span>Case {c.caseNo} · {monthDay(c.date)}</span>
                          {presentation ? <span>{st}</span> : (
                            <select value={st} aria-label={`Status for case ${c.caseNo}`} className="h-7 rounded border border-border bg-surface px-1 text-xs"
                              onChange={(e) => void db.escalations.put({ callId: c.id, status: e.target.value as EscStatus, updatedAt: new Date().toISOString() })}>
                              {ESC.map((x) => <option key={x}>{x}</option>)}
                            </select>
                          )}
                        </div>
                        <div className="text-xs font-medium">{lbl(c.storeNo)}</div>
                        <p className="mt-1 text-sm"><RedactedText recordId={c.id} field="notes" text={splitCallNotes(c.notes).reason} /></p>
                        {!presentation && <Button variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={() => setDraft(escalationDraft(c, lbl(c.storeNo)))}>Draft escalation</Button>}
                      </article>
                    );
                  })}
                </div>
              )}
            </Card>
            <Card title={`Repeat callers · ${v.repeats.length}`}>
              <p className="mb-2 text-xs text-muted">Cases with 2+ calls this week, and callers (matched by a hashed phone number, never shown) on 2+ cases.</p>
              <ul className="max-h-[470px] space-y-1.5 overflow-y-auto text-sm tnum" tabIndex={0}>
                {v.repeats.slice(0, 60).map((g) => (
                  <li key={`${g.kind}${g.key}`} className="flex flex-wrap justify-between gap-x-2">
                    <span className="font-medium">{g.kind === 'case' ? `Case ${g.key}` : g.key}</span>
                    <span className="text-muted">{g.calls.length} calls · {[...new Set(g.calls.map((c) => ds.tags.get(c.id)?.primary).filter(Boolean))].map((x) => tname(x!)).join(', ') || 'untagged'}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card title={`Calls · FW${v.fw}`}>
            <DataTable rows={rows} columns={cols} getRowId={(r) => r.c.id} exportName={`Calls_FW${v.fw}`} maxHeight={600}
              toolbar={
                <>
                  <Select label="Theme" value={themeF} onChange={setThemeF} options={[{ value: 'all', label: 'All themes' }, ...ds.taxonomy.map((x) => ({ value: x.id, label: x.name }))]} />
                  <Select label="Contact type" value={typeF} onChange={setTypeF} options={[{ value: 'all', label: 'All' }, { value: 'Avoidable', label: 'Avoidable' }, { value: 'Deflectable', label: 'Deflectable' }, { value: 'Necessary', label: 'Necessary' }]} />
                </>
              } />
            {v.assocDrivers.length > 0 && <p className="mt-2 text-xs text-muted">Not shown above (help-desk): {v.assocDrivers.map((d) => `${d.key} ${d.count}`).join(' · ')}</p>}
          </Card>
        </div>
      </PageGate>
      {draft && <Draft text={draft} onClose={() => setDraft(null)} />}
    </>
  );
}

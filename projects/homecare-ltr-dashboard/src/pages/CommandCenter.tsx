import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { db } from '@/db/db';
import { useWeekData } from '@/data/useWeekData';
import { SCREENS } from '@/screens';
import { baseline, deltaPts, groupByWeek, poolWeeks, weekOf } from '@/analytics/ltr';
import { groupRange, lowest, rangeLabel } from '@/analytics/attributes';
import { callKpis, themeMentions } from '@/analytics/voc';
import { detractorRows } from '@/analytics/detractors';
import { ruleHeadline } from '@/analytics/headline';
import { themeName } from '@/domain/taxonomy';
import { regionSortKey } from '@/domain/geo';
import { todayISO } from '@/lib/dates';
import { canColor } from '@/lib/ltr';
import { useSettings } from '@/state/settings';
import { useUi } from '@/state/ui';
import type { ValidationReport } from '@/ingest/types';
import { KpiCard } from '@/components/ui/KpiCard';
import { Butterfly } from '@/components/charts/Butterfly';
import { PageGate } from '@/components/ui/PageGate';
import { Button, Card, PageHeader, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';

const SPARK_WEEKS = 8;

function Headline({ fw, suggested, saved }: { fw: number; suggested: string; saved?: string }) {
  const presentation = useUi((s) => s.presentation);
  const [text, setText] = useState(saved ?? suggested);
  const [editing, setEditing] = useState(false);
  useEffect(() => setText(saved ?? suggested), [saved, suggested, fw]);
  const save = async (v: string) => {
    const w = await db.weeks.get(fw);
    await db.weeks.put({ ...(w ?? { fw, locked: false }), fw, headline: v });
    setEditing(false);
  };
  return (
    <Card className="col-span-3" title={<span className="flex items-center gap-2">Headline · FW{fw} <span className="text-xs font-normal text-muted">{saved ? 'saved' : 'rule-generated, not saved'}</span></span>}
      actions={!presentation && !editing && (
        <>
          <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>Edit</Button>
          {saved !== suggested && <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setText(suggested)} title="Replace with the rule-generated sentence">Use rule sentence</Button>}
          {text !== saved && <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => save(text)}>Save</Button>}
        </>
      )}>
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); void save(text); }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} autoFocus aria-label="Headline" className="w-full rounded-lg border border-border bg-surface p-2 font-display text-lg" />
          <div className="mt-2 flex gap-2"><Button type="submit" variant="primary">Save headline</Button><Button variant="ghost" onClick={() => { setText(saved ?? suggested); setEditing(false); }}>Cancel</Button></div>
        </form>
      ) : <p className="font-display text-lg leading-snug">{text}</p>}
    </Card>
  );
}

interface Alert { id: string; level: 'act' | 'watch'; text: string; to: string }

export function CommandCenter() {
  const s = SCREENS[0];
  const { data, loading, error } = useWeekData();
  const thresholds = useSettings((x) => x.thresholds);
  const { search } = useLocation();

  const m = useMemo(() => {
    if (!data) return null;
    const { ds, week, weekly, cur, filters, benchmark, ltr, attrs } = data;
    const fw = week.fw;
    const sparkWeeks = Array.from({ length: SPARK_WEEKS }, (_, i) => fw - SPARK_WEEKS + 1 + i).filter((w) => w >= 1);
    const base = baseline(weekly, fw, filters.compare);
    const fytd = poolWeeks(weekly, 1, fw);
    const fytdPrev = poolWeeks(weekly, 1, fw - 1);
    const callsFor = (w: number) => ds.calls.filter((c) => c.fw === w);
    const kFor = (w: number) => callKpis(callsFor(w), ds.tags);
    const k = kFor(fw);
    const kPrev = filters.compare === 'prior' ? kFor(fw - 1) : null;
    const kAvg = (sel: (x: ReturnType<typeof kFor>) => number) => {
      const ws = filters.compare === 'avg4' ? [fw - 4, fw - 3, fw - 2, fw - 1] : filters.compare === 'fytd' ? Array.from({ length: fw }, (_, i) => i + 1) : [fw - 1];
      const vals = ws.filter((w) => w >= 1 && callsFor(w).length).map((w) => sel(kFor(w)));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const low = lowest(attrs);
    const lowPrev = low ? data.attrsFor(fw - 1).find((a) => a.key === low.key) : undefined;
    const customerIds = new Set(ds.calls.filter((c) => !c.isAssociate).map((c) => c.id));
    const mentions = themeMentions(ds.tagList, fw, customerIds);
    const callThemes = [...mentions].sort((a, b) => b.calls - a.calls);
    const dets = detractorRows(data.weekSurveys, ds.followups, ds.tags, ds.stores, todayISO());
    const regions = groupByWeek(data.weekSurveys, (x) => x.region);
    const below = [...regions].map(([r, mm]) => ({ r, s: weekOf(mm, fw) }))
      .filter((x) => x.s.n >= 10 && x.s.pct !== null && x.s.pct < benchmark).sort((a, b) => regionSortKey(a.r) - regionSortKey(b.r));
    // damage / safety calls not yet escalated
    const weekCalls = callsFor(fw).filter((c) => !c.isAssociate);
    const damage = weekCalls.filter((c) => { const t = ds.tags.get(c.id); return t && (t.primary === 'damage' || t.escalate); });
    const unescalated = damage.filter((c) => !ds.escalations.get(c.id) || ds.escalations.get(c.id)!.status === 'New');
    // validation problems from the latest upload batch
    const latest = ds.files[0];
    const batch = latest ? ds.files.filter((f) => Math.abs(Date.parse(latest.importedAt) - Date.parse(f.importedAt)) < 3_600_000) : [];
    const problems: string[] = [];
    for (const f of batch) {
      const r = f.report as ValidationReport | undefined;
      if (!r) continue;
      if (r.scoreMismatches?.length) problems.push(`${f.name}: ${r.scoreMismatches.length} Score vs LTR disagreement(s)`);
      for (const c of r.followupCheck ?? []) if (c.missing.length) problems.push(`${f.name}: ${c.missing.length} FW${c.fw} detractor(s) missing from the follow-up file`);
      if (r.unmappedStores?.length) problems.push(`${f.name}: ${r.unmappedStores.length} unmapped store(s)`);
      if (r.redactionUncertain) problems.push(`${f.name}: ${r.redactionUncertain} record(s) with uncertain redaction`);
      if (r.outsideWeek) problems.push(`${f.name}: ${r.outsideWeek} call(s) dated outside FW${r.targetWeek} dropped`);
    }
    const alerts: Alert[] = [];
    if (unescalated.length) alerts.push({ id: 'dmg', level: 'act', text: `${unescalated.length} damage/safety call${unescalated.length === 1 ? '' : 's'} not yet escalated to Field Support`, to: '/calls' });
    const notDoc = dets.filter((d) => d.followUp !== 'Documented');
    if (notDoc.length) alerts.push({ id: 'fu', level: 'act', text: `${notDoc.length} of ${dets.length} detractors without documented SM follow-up (${dets.filter((d) => d.overdue).length} past 48 hours)`, to: '/detractors' });
    for (const b of below) alerts.push({ id: `r${b.r}`, level: 'watch', text: `${b.r} below ${benchmark}%: ${b.s.pct!.toFixed(1)}% (n=${b.s.n})`, to: `/regions` });
    for (const p of problems.slice(0, 5)) alerts.push({ id: p, level: 'watch', text: p, to: '/data' });

    const meta = ds.weeks.get(fw);
    const has = {
      tracker: data.weekSurveys.length > 0,
      medallia: data.weekSurveys.some((x) => x.attrs) || ds.surveys.some((x) => x.fw === fw && (x.source === 'medallia' || x.source === 'commentary')),
      analytics: ds.attributeWeekly.some((a) => a.fw === fw),
      calls: weekCalls.length > 0,
      followup: ds.followups.some((f) => f.fw === fw),
    };
    const vocIds = [...data.weekSurveys.filter((x) => x.comment).map((x) => x.id), ...weekCalls.map((c) => c.id)];
    const tagged = vocIds.length > 0 && vocIds.every((id) => ds.tags.has(id));

    return {
      fw, cur, base, fytd, fytdPrev, k, kPrev, kAvg, low, lowPrev, sparkWeeks, mentions, callThemes, dets, alerts, meta, has, tagged,
      ltrSpark: sparkWeeks.map((w) => weekOf(weekly, w).pct),
      ltrFaded: sparkWeeks.map((w) => !canColor(weekOf(weekly, w).n, thresholds)),
      fytdSpark: sparkWeeks.map((w) => poolWeeks(weekly, 1, w).pct),
      detSpark: sparkWeeks.map((w) => weekOf(weekly, w).detractors),
      lowSpark: low ? sparkWeeks.map((w) => data.attrsFor(w).find((a) => a.key === low.key)?.pct ?? null) : [],
      callSpark: sparkWeeks.map((w) => (callsFor(w).length ? kFor(w).calls : null)),
      cancelSpark: sparkWeeks.map((w) => (callsFor(w).length ? kFor(w).cancellations : null)),
      exclSpark: sparkWeeks.map((w) => (callsFor(w).length ? kFor(w).exclusionCancelPct : null)),
      headline: ruleHeadline({
        fw, cur, benchmark, lowest: low, inHome: rangeLabel(groupRange(attrs, 'In-home')), detractors0to6: cur.detractors0to6,
        topCallTheme: callThemes[0]?.calls ? { name: themeName(callThemes[0].theme), calls: callThemes[0].calls } : undefined,
      }),
      ltrN: ltr.length,
    };
  }, [data, thresholds]);

  const empty = !!data && !!m && m.cur.n === 0 && m.k.calls === 0;
  const cmpLabel = m?.base.label ?? '';
  const callDelta = (cur: number | null, sel: (x: NonNullable<typeof m>['k']) => number) => {
    if (!m || cur === null) return null;
    const ref = m.kPrev ? (m.kPrev.calls ? sel(m.kPrev) : null) : m.kAvg(sel);
    return ref === null ? null : cur - ref;
  };

  return (
    <>
      <PageHeader title={s.title} subtitle={s.subtitle} />
      <PageGate screen={s} loading={loading} error={error} empty={empty} emptyTitle={data ? `No data loaded for FW${data.week.fw}` : undefined}>
        {data && m && (
          <div className="space-y-3">
            {data.geoFiltered && <p className="text-xs text-muted">LTR, detractors and attributes are filtered to {[data.filters.region, data.filters.district, data.filters.store].filter(Boolean).join(' › ')}. Call KPIs are company-wide (most calls carry no store).</p>}
            <div className="grid grid-cols-4 gap-3">
              <KpiCard label={`LTR · FW${m.fw}`} value={m.cur.pct === null ? '—' : `${m.cur.pct.toFixed(1)}%`} n={m.cur.n}
                delta={deltaPts(m.cur, m.base.summary)} compareLabel={`${cmpLabel} (n=${m.base.summary.n})`} spark={m.ltrSpark} sparkFaded={m.ltrFaded} />
              <KpiCard label={`vs ${data.benchmark}% benchmark`} value={m.cur.pct === null ? '—' : `${m.cur.pct - data.benchmark >= 0 ? '+' : '−'}${Math.abs(m.cur.pct - data.benchmark).toFixed(1)} pts`}
                sub={m.cur.pct === null ? undefined : `${m.cur.pct >= data.benchmark ? '▲ Above' : '▼ Below'} benchmark · n=${m.cur.n}`} />
              <KpiCard label={`FYTD LTR (FW1–FW${m.fw})`} value={m.fytd.pct === null ? '—' : `${m.fytd.pct.toFixed(1)}%`} n={m.fytd.n}
                delta={deltaPts(m.fytd, m.fytdPrev)} compareLabel={`FYTD through FW${m.fw - 1}`} spark={m.fytdSpark} />
              <KpiCard label="Detractors (0–8)" value={<>{m.cur.detractors}<span className="font-sans text-sm font-normal text-muted"> of {m.cur.n}</span></>}
                sub={`${m.cur.detractors0to6} scored 0–6 · ${m.cur.detractors7to8} scored 7–8`}
                delta={m.base.summary.n ? m.cur.detractors - (data.filters.compare === 'prior' ? m.base.summary.detractors : (m.base.summary.detractors / Math.max(1, m.base.summary.n)) * m.cur.n) : null}
                deltaUnit="" deltaDigits={data.filters.compare === 'prior' ? 0 : 1} invert compareLabel={data.filters.compare === 'prior' ? cmpLabel : `${cmpLabel}, scaled to this week’s n`} spark={m.detSpark} />
              <KpiCard label="Lowest attribute" value={m.low?.pct != null ? `${m.low.pct.toFixed(1)}%` : '—'} n={m.low?.n}
                sub={m.low ? `${m.low.label}${m.low.nApprox ? ' · n = survey sample' : ''}` : 'Upload the Medallia Responses or Analytics file'}
                delta={m.low && m.lowPrev?.pct != null && m.low.pct != null ? m.low.pct - m.lowPrev.pct : null} compareLabel={`FW${m.fw - 1}`} spark={m.lowSpark} />
              <KpiCard label="Customer calls" value={m.k.calls ? m.k.calls.toLocaleString() : '—'}
                sub={m.k.calls ? `${m.k.cases} distinct cases · +${m.k.associate} associate/store (not VOC)` : 'Upload Loyalty Case files'}
                delta={callDelta(m.k.calls || null, (x) => x.calls)} deltaUnit="" deltaDigits={data.filters.compare === 'prior' ? 0 : 1} invert compareLabel={cmpLabel} spark={m.callSpark} />
              <KpiCard label="Cancellations" value={m.k.tagged ? String(m.k.cancellations) : '—'}
                sub={m.k.tagged ? 'Cancel requests/processed in call notes' : m.k.calls ? 'Needs call tagging (phase 4)' : 'Upload Loyalty Case files'}
                delta={m.k.tagged ? callDelta(m.k.cancellations, (x) => x.cancellations) : null} deltaUnit="" deltaDigits={data.filters.compare === 'prior' ? 0 : 1} invert compareLabel={cmpLabel} spark={m.cancelSpark} />
              <KpiCard label="Exclusion-driven cancel %" value={m.k.exclusionCancelPct === null ? '—' : `${Math.round(m.k.exclusionCancelPct)}%`}
                sub={m.k.cancellations ? `${m.k.exclusionCancels} of ${m.k.cancellations} cancellations` : undefined}
                delta={m.k.exclusionCancelPct === null ? null : callDelta(m.k.exclusionCancelPct, (x) => x.exclusionCancelPct ?? 0)} deltaUnit="pts" invert compareLabel={cmpLabel} spark={m.exclSpark} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Headline fw={m.fw} suggested={m.headline} saved={m.meta?.headline} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Card title={`Alerts · ${m.alerts.length}`} className="col-span-1">
                {m.alerts.length === 0 ? <p className="text-sm text-muted">Nothing needs attention.</p> : (
                  <ul className="space-y-1.5">
                    {m.alerts.map((a) => (
                      <li key={a.id}>
                        <Link to={{ pathname: a.to, search }} className="flex items-start gap-2 rounded-lg p-1.5 text-sm hover:bg-surface-2">
                          <span className={cx('mt-px shrink-0 rounded-full px-1.5 text-[10px] font-semibold', a.level === 'act' ? 'bg-surveys text-white dark:text-[#0d1524]' : 'bg-watch text-watch-ink')}>{a.level === 'act' ? 'ACT' : 'WATCH'}</span>
                          <span>{a.text}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <div className="col-span-2">
                {m.mentions.length ? (
                  <Butterfly compact counts={m.mentions} channel={data.filters.channel} title={`Top VOC themes · FW${m.fw}`}
                    actions={<Link to={{ pathname: '/cross', search }} className="mr-1 text-xs font-medium text-calls underline">Full view</Link>} />
                ) : (
                  <Card title="Top VOC themes (surveys vs calls)">
                    <p className="text-sm text-muted">No theme tags for FW{m.fw} yet. Tagging (keyword rules and optional AI) arrives in phase 4.</p>
                  </Card>
                )}
              </div>
            </div>

            <Card title={`Week status · FW${m.fw}`}>
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm" aria-label="Weekly workflow checklist">
                {([
                  ['Tracker', m.has.tracker], ['Medallia', m.has.medallia], ['Analytics', m.has.analytics], ['Calls', m.has.calls], ['Follow-up', m.has.followup],
                  ['Tagged', m.tagged], ['Reviewed', !!m.meta?.checklist?.reviewed], ['Slide exported', !!m.meta?.checklist?.slideExported],
                ] as [string, boolean][]).map(([label, done], i, arr) => (
                  <li key={label} className="flex items-center gap-2">
                    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1', done ? 'border-grow bg-grow-soft text-grow' : 'border-border text-muted')}>
                      <span aria-hidden>{done ? '✓' : '○'}</span>{label}<span className="sr-only">{done ? ' done' : ' not done'}</span>
                    </span>
                    {i < arr.length - 1 && <Icon name="chevronRight" size={14} className="text-muted" />}
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        )}
      </PageGate>
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { db } from '@/db/db';
import { useWeekData } from '@/data/useWeekData';
import { SCREENS } from '@/screens';
import { baseline, deltaPts, geoParts, groupByWeek, poolWeeks, weekOf } from '@/analytics/ltr';
import { groupRange, lowest, rangeLabel } from '@/analytics/attributes';
import { themeMentions } from '@/analytics/voc';
import { pointsLost } from '@/analytics/pointsLost';
import { PointsLostCard } from '@/components/voc/PointsLostCard';
import { detractorRows } from '@/analytics/detractors';
import { ruleHeadline } from '@/analytics/headline';
import { themeName } from '@/domain/taxonomy';
import { regionSortKey } from '@/domain/geo';
import { todayISO } from '@/lib/dates';
import { canColor } from '@/lib/ltr';
import { useSettings } from '@/state/settings';
import { useUi } from '@/state/ui';
import { useIsLocked } from '@/hooks/useLocked';
import type { ValidationReport } from '@/ingest/types';
import { KpiCard } from '@/components/ui/KpiCard';
import { ThemeBars } from '@/components/charts/ThemeBars';
import { PageGate } from '@/components/ui/PageGate';
import { Button, Card, PageHeader, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';

const SPARK_WEEKS = 8;

function Headline({ fw, suggested, saved }: { fw: number; suggested: string; saved?: string }) {
  const presentation = useUi((s) => s.presentation) || false;
  const locked = useIsLocked(fw);
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
      actions={!presentation && !locked && !editing && (
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
    const low = lowest(attrs);
    const lowPrev = low ? data.attrsFor(fw - 1).find((a) => a.key === low.key) : undefined;
    const mentions = themeMentions(ds.tagList, fw);
    const points = pointsLost(data.weekSurveys, ds.tags, benchmark, ltr.filter((x) => x.fw === fw - 1));
    const dets = detractorRows(data.weekSurveys, ds.followups, ds.tags, ds.stores, todayISO());
    const regions = groupByWeek(data.weekSurveys, (x) => x.region);
    const below = [...regions].map(([r, mm]) => ({ r, s: weekOf(mm, fw) }))
      .filter((x) => x.s.n >= 10 && x.s.pct !== null && x.s.pct < benchmark).sort((a, b) => regionSortKey(a.r) - regionSortKey(b.r));
    // Detractor comment themes (0–8 with a comment)
    const detThemes = new Map<string, number>();
    for (const sv of data.weekSurveys) {
      if (sv.ltr === null || sv.ltr > 8) continue;
      const tg = ds.tags.get(sv.id);
      if (tg && tg.primary !== 'other') detThemes.set(tg.primary, (detThemes.get(tg.primary) ?? 0) + 1);
    }
    const topDet = [...detThemes].sort((a, b) => b[1] - a[1])[0];
    // damage / safety mentioned in a survey comment this week
    const damage = data.weekSurveys.filter((sv) => { const tg = ds.tags.get(sv.id); return tg && (tg.primary === 'damage' || tg.escalate); });
    const comments = data.weekSurveys.filter((sv) => sv.comment.trim()).length;
    const regionsAll = [...regions].map(([, mm]) => weekOf(mm, fw)).filter((x) => x.n > 0);
    const atOrAbove = regionsAll.filter((x) => x.pct !== null && x.pct >= benchmark).length;
    const regionsPrev = [...groupByWeek(ltr.filter((x) => x.fw === fw - 1), (x) => x.region)].map(([, mm]) => weekOf(mm, fw - 1)).filter((x) => x.n > 0);
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
      if (r.removedFromTracker?.length) problems.push(`${f.name}: ${r.removedFromTracker.reduce((n, x) => n + x.count, 0)} survey(s) removed upstream (${r.removedFromTracker.map((x) => `FW${x.fw}`).join(', ')} restated)`);
      if (r.redactionUncertain) problems.push(`${f.name}: ${r.redactionUncertain} record(s) with uncertain redaction`);
    }
    const alerts: Alert[] = [];
    if (damage.length) alerts.push({ id: 'dmg', level: 'act', text: `${damage.length} survey comment${damage.length === 1 ? '' : 's'} mention damage or safety`, to: '/detractors' });
    const notDoc = dets.filter((d) => d.followUp !== 'Documented');
    if (notDoc.length) alerts.push({ id: 'fu', level: 'act', text: `${notDoc.length} of ${dets.length} detractors without documented SM follow-up (${dets.filter((d) => d.overdue).length} past 48 hours)`, to: '/detractors' });
    for (const b of below) alerts.push({ id: `r${b.r}`, level: 'watch', text: `${b.r} below ${benchmark}%: ${b.s.pct!.toFixed(1)}% (n=${b.s.n})`, to: `/regions` });
    for (const p of problems.slice(0, 5)) alerts.push({ id: p, level: 'watch', text: p, to: '/data' });

    const meta = ds.weeks.get(fw);
    const has = {
      tracker: data.weekSurveys.length > 0,
      medallia: data.weekSurveys.some((x) => x.attrs) || ds.surveys.some((x) => x.fw === fw && (x.source === 'medallia' || x.source === 'commentary')),
      analytics: ds.attributeWeekly.some((a) => a.fw === fw),
      followup: ds.followups.some((f) => f.fw === fw),
    };
    const vocIds = data.weekSurveys.filter((x) => x.comment).map((x) => x.id);
    const tagged = vocIds.length > 0 && vocIds.every((id) => ds.tags.has(id));

    return {
      fw, cur, base, fytd, fytdPrev, points, low, lowPrev, sparkWeeks, mentions, dets, alerts, meta, has, tagged, comments, atOrAbove, regionsN: regionsAll.length,
      atOrAbovePrev: regionsPrev.filter((x) => x.pct !== null && x.pct >= benchmark).length, regionsPrevN: regionsPrev.length,
      ltrSpark: sparkWeeks.map((w) => weekOf(weekly, w).pct),
      ltrFaded: sparkWeeks.map((w) => !canColor(weekOf(weekly, w).n, thresholds)),
      fytdSpark: sparkWeeks.map((w) => poolWeeks(weekly, 1, w).pct),
      detSpark: sparkWeeks.map((w) => weekOf(weekly, w).detractors),
      lowSpark: low ? sparkWeeks.map((w) => data.attrsFor(w).find((a) => a.key === low.key)?.pct ?? null) : [],
      commentSpark: sparkWeeks.map((w) => { const ws = ltr.filter((x) => x.fw === w); return ws.length ? (100 * ws.filter((x) => x.comment.trim()).length) / ws.length : null; }),
      fuDoc: dets.filter((d) => d.followUp === 'Documented').length,
      headline: ruleHeadline({
        fw, cur, benchmark, lowest: low, inHome: rangeLabel(groupRange(attrs, 'In-home')), detractors0to6: cur.detractors0to6,
        topDetractorTheme: topDet ? { name: themeName(topDet[0]), count: topDet[1] } : undefined,
      }),
      ltrN: ltr.length,
    };
  }, [data, thresholds]);

  const empty = !!data && !!m && m.cur.n === 0;
  const cmpLabel = m?.base.label ?? '';

  return (
    <>
      <PageHeader title={s.title} subtitle={s.subtitle} />
      <PageGate screen={s} loading={loading} error={error} empty={empty} emptyTitle={data ? `No data loaded for FW${data.week.fw}` : undefined}>
        {data && m && (
          <div className="space-y-3">
            {data.geoFiltered && <p className="text-xs text-muted">Filtered to {geoParts(data.geo).join(' › ')}.</p>}
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
              <KpiCard label={`Regions ≥ ${data.benchmark}`} value={m.regionsN ? `${m.atOrAbove} of ${m.regionsN}` : '—'}
                sub={m.regionsPrevN ? `FW${m.fw - 1}: ${m.atOrAbovePrev} of ${m.regionsPrevN}` : 'regions with surveys this week'} />
              <KpiCard label="Surveys with a comment" value={m.cur.n ? `${Math.round((100 * m.comments) / m.cur.n)}%` : '—'}
                sub={m.cur.n ? `${m.comments} of ${m.cur.n} surveys` : undefined} spark={m.commentSpark} />
              <KpiCard label="Detractor follow-up" value={m.dets.length ? `${m.fuDoc} of ${m.dets.length}` : '—'}
                sub={m.dets.length ? 'documented by the store (0–8)' : 'No detractors this week'} />
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
                  <ThemeBars compact counts={m.mentions} title={`Survey comment themes · FW${m.fw}`}
                    actions={<Link to={{ pathname: '/voc', search }} className="mr-1 text-xs font-medium text-calls underline">Full view</Link>} />
                ) : (
                  <Card title="Survey comment themes">
                    <p className="text-sm text-muted">No theme tags for FW{m.fw} yet. Upload this week’s files (they’re tagged on import) or use “Re-run tagging” on the Data Manager.</p>
                  </Card>
                )}
              </div>
            </div>

            <PointsLostCard p={m.points} fw={m.fw} benchmark={data.benchmark} />

            <Card title={`Week status · FW${m.fw}`}>
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm" aria-label="Weekly workflow checklist">
                {([
                  ['Tracker', m.has.tracker], ['Medallia', m.has.medallia], ['Analytics', m.has.analytics], ['Follow-up', m.has.followup],
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

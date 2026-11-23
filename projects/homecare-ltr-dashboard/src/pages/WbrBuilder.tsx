import { useEffect, useMemo, useRef, useState } from 'react';
import type ReactEChartsCore from 'echarts-for-react/lib/core';
import { db } from '@/db/db';
import { useLive } from '@/hooks/useLive';
import { useWeekData } from '@/data/useWeekData';
import { SCREENS } from '@/screens';
import { weekFacts } from '@/analytics/facts';
import { dailyVolume } from '@/analytics/calls';
import { ruleHeadline } from '@/analytics/headline';
import { themeName } from '@/domain/taxonomy';
import { REVIEW_THRESHOLD } from '@/tagging/engine';
import { verifyNumbers } from '@/writing/verify';
import { allowedForTheme, percentsForTheme, LINE_LIMIT } from '@/writing/write';
import { getWbrNotes, removeWbrNote } from '@/writing/notes';
import { chartRows, defaultDraft, slideText, MAX_THEMES, type WbrDraft } from '@/wbr/draft';
import { canExport, preflight } from '@/wbr/preflight';
import { buildNotes, openQuestionsFor } from '@/wbr/notes';
import { buildPptx, pptxFileName } from '@/wbr/pptx';
import { copyText, downloadBlob, toTsv } from '@/data/export';
import { useSettings } from '@/state/settings';
import { useUi } from '@/state/ui';
import { PageGate } from '@/components/ui/PageGate';
import { Button, Card, PageHeader, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { SlidePreview } from '@/components/wbr/SlidePreview';
import { useIsLocked } from '@/hooks/useLocked';

const KEY = (fw: number) => `wbr:${fw}`;

function NumberFlags({ text, allowed, percents }: { text: string; allowed: number[]; percents?: number[] }) {
  const bad = verifyNumbers(text, allowed, [], percents).filter((h) => !h.ok);
  if (!bad.length) return null;
  return <p className="text-[11px] text-surveys">⚠ {bad.map((b) => `“${b.text}”`).join(', ')} {bad.length === 1 ? 'doesn’t' : 'don’t'} match this week’s data</p>;
}

export function WbrBuilder() {
  const sc = SCREENS.find((x) => x.path === '/wbr')!;
  const { data, loading, error } = useWeekData();
  const thresholds = useSettings((s) => s.thresholds);
  const fyStart = useSettings((s) => s.fyStart);
  const presentation = useUi((s) => s.presentation);
  const chartRef = useRef<ReactEChartsCore>(null);
  const fw = data?.week.fw ?? 0;
  const locked = useIsLocked(fw);
  const saved = useLive(async () => (fw ? ((await db.kv.get(KEY(fw)))?.value as WbrDraft | undefined) ?? null : null), [fw]);
  const pinnedAsk = useLive(() => (fw ? getWbrNotes(fw) : Promise.resolve([] as string[])), [fw]);
  const [flash, setFlash] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [newQ, setNewQ] = useState('');
  const [asker, setAsker] = useState('');
  const [overrideFor, setOverrideFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const ctx = useMemo(() => {
    if (!data) return null;
    const { ds } = data;
    const f = weekFacts(ds, fw, data.benchmark, thresholds, { region: null, district: null, store: null });
    const meta = ds.weeks.get(fw);
    const headline = meta?.headline ?? ruleHeadline({ fw, cur: f.ltr.cur, benchmark: data.benchmark, lowest: f.lowestAttr, inHome: f.ranges.inHome, detractors0to6: f.ltr.cur.detractors0to6,
      topCallTheme: (() => { const t = [...f.mentions].sort((a, b) => b.calls - a.calls)[0]; return t?.calls ? { name: themeName(t.theme, ds.taxonomy), calls: t.calls } : undefined; })() });
    const open = openQuestionsFor(ds, ds.questions, fw);
    const customer = ds.calls.filter((c) => c.fw === fw && !c.isAssociate);
    const pendingReview = ds.tagList.filter((t) => t.fw === fw && !t.reviewed && t.source !== 'Manual' && t.confidence < REVIEW_THRESHOLD && (t.channel === 'survey' || customer.some((c) => c.id === t.recordId))).length
      + ds.surveys.filter((s) => s.fw === fw && s.redactionUncertain).length + customer.filter((c) => c.redactionUncertain).length;
    return { f, headline, open, pendingReview, daysWithCalls: dailyVolume(customer, data.week.start).filter((d) => d.calls > 0).length, asked: ds.questions.filter((q) => q.fw === fw) };
  }, [data, fw, thresholds]);

  const generated = useMemo(() => (ctx && data ? defaultDraft(ctx.f, data.ds.taxonomy, fyStart) : null), [ctx, data, fyStart]);
  const d: WbrDraft | null = saved.data ?? generated;
  const autoNotes = useMemo(() => (ctx && data ? buildNotes({ ds: data.ds, f: ctx.f, headline: ctx.headline, thresholds, questions: ctx.open, pinnedAsk: pinnedAsk.data ?? [] }) : ''), [ctx, data, thresholds, pinnedAsk.data]);
  const notes = d?.notes ?? autoNotes;
  const checks = useMemo(() => (d && ctx ? preflight(d, ctx.f, notes, { pendingReview: ctx.pendingReview, openQuestions: ctx.open.length, daysWithCalls: ctx.daysWithCalls }) : []), [d, ctx, notes]);
  const ok = canExport(checks);

  useEffect(() => { setOverrideFor(null); setReason(''); }, [fw]);

  const save = (patch: Partial<WbrDraft>) => { if (d && !locked) void db.kv.put({ key: KEY(fw), value: { ...d, ...patch, edited: true } }); };
  const setTheme = (i: number, patch: Partial<WbrDraft['themes'][number]>) => d && save({ themes: d.themes.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const move = (from: number, to: number) => {
    if (!d || to < 0 || to >= d.themes.length) return;
    const th = [...d.themes]; const [x] = th.splice(from, 1); th.splice(to, 0, x); save({ themes: th });
  };
  const note = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 2200); };
  const markExported = async () => {
    const w = await db.weeks.get(fw);
    await db.weeks.put({ ...(w ?? { fw, locked: false }), fw, checklist: { ...(w?.checklist ?? {}), slideExported: true } });
    save({ exportedAt: new Date().toISOString() });
  };

  if (!data || !ctx || !d) return <><PageHeader title={sc.title} subtitle={sc.subtitle} /><PageGate screen={sc} loading={loading || saved.loading} error={error} empty={false}>{null}</PageGate></>;
  const included = d.themes.filter((t) => t.include).length;
  const cr = chartRows(ctx.f, d);
  const failing = checks.filter((c) => !c.pass && !c.overridden);

  const exports = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button variant="primary" icon="download" disabled={!ok} title={ok ? '' : 'Resolve or override the pre-flight items first'} onClick={async () => {
        await buildPptx(d, ctx.f, notes).writeFile({ fileName: pptxFileName(d) }); await markExported(); note('PowerPoint downloaded');
      }}>Download .pptx</Button>
      <Button disabled={!ok} onClick={async () => { await copyText(slideText(d)); note('Slide text copied'); }}>Copy slide text</Button>
      <Button disabled={!ok} onClick={async () => { await copyText(toTsv({ columns: ['Theme', 'Surveys', 'Calls', 'Mentions'], rows: cr.map((r) => [r.name, r.surveys, r.calls, r.total]) })); note('Chart data copied'); }}>Copy chart data</Button>
      <Button disabled={!ok} onClick={async () => {
        const inst = chartRef.current?.getEchartsInstance(); if (!inst) return;
        const blob = await (await fetch(inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' }))).blob();
        downloadBlob(`FW${fw}_Top_VOC_Mentions.png`, blob, 'image/png'); note('Chart PNG (2×) downloaded');
      }}>Chart PNG 2×</Button>
      {flash && <span role="status" className="text-xs text-grow">{flash}</span>}
    </div>
  );

  if (presentation) return <div className="mx-auto max-w-[1280px]"><SlidePreview ref={chartRef} d={d} f={ctx.f} /></div>;

  return (
    <>
      <PageHeader title={sc.title} subtitle={sc.subtitle} actions={exports} />
      <PageGate screen={sc} loading={false} error={null} empty={!ctx.f.hasSurveys && !ctx.f.hasCalls} emptyTitle={`No data for FW${fw}`}>
        <div className="space-y-3">
          <div className="space-y-3">
            <div className="mx-auto max-w-[1180px] space-y-2">
              <SlidePreview ref={chartRef} d={d} f={ctx.f} />
              <p className="text-xs text-muted">{d.edited ? 'Edited draft, saved for this week.' : 'Generated from this week’s data; your edits are saved per week.'} {d.exportedAt && `Last exported ${new Date(d.exportedAt).toLocaleString()}.`}
                {d.edited && <Button variant="ghost" className="ml-2 h-6 px-2 text-xs" onClick={() => void db.kv.delete(KEY(fw))}>Reset to generated</Button>}</p>
            </div>
            <Card className="mx-auto max-w-[1180px]" title={<span>Pre-flight · {failing.length ? <span className="text-surveys">{failing.length} to fix</span> : <span className="text-grow">ready to export</span>}</span>}>
              <ul className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
                {checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-2">
                    <span aria-hidden className={cx('mt-0.5 font-bold', c.pass ? 'text-grow' : c.overridden ? 'text-watch-ink' : 'text-surveys')}>{c.pass ? '✓' : c.overridden ? '!' : '✕'}</span>
                    <div className="min-w-0 flex-1">
                      <div>{c.label}<span className="sr-only">{c.pass ? ' passed' : c.overridden ? ' overridden' : ' failed'}</span></div>
                      <div className="text-xs text-muted">{c.overridden ? `Overridden: ${c.overridden}` : c.detail}</div>
                      {!c.pass && !c.overridden && (overrideFor === c.id ? (
                        <form className="mt-1 flex gap-1" onSubmit={(e) => { e.preventDefault(); if (!reason.trim()) return; save({ overrides: [...d.overrides.filter((o) => o.check !== c.id), { check: c.id, reason: reason.trim(), at: new Date().toISOString() }] }); setOverrideFor(null); setReason(''); }}>
                          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for overriding" aria-label="Override reason" className="h-7 flex-1 rounded border border-border bg-surface px-2 text-xs" />
                          <Button type="submit" className="h-7 px-2 text-xs" disabled={!reason.trim()}>Override</Button>
                        </form>
                      ) : <button type="button" className="text-xs text-calls hover:underline" onClick={() => setOverrideFor(c.id)}>Override with a reason…</button>)}
                      {c.overridden && <button type="button" className="ml-2 text-xs text-calls hover:underline" onClick={() => save({ overrides: d.overrides.filter((o) => o.check !== c.id) })}>Remove override</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {locked && <p role="status" className="rounded-lg bg-watch px-3 py-2 text-sm text-watch-ink">FW{fw} is locked: the slide is read-only (export still works). Unlock the week on the Data Manager to edit.</p>}
          <fieldset disabled={locked} className="contents">
          <Card title={`Slide content · ${included} of ${MAX_THEMES} themes`}>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <label className="text-sm"><span className="text-xs text-muted">Title</span>
                <input value={d.title} onChange={(e) => save({ title: e.target.value })} className="mt-0.5 h-8 w-full rounded border border-border bg-surface px-2" /></label>
              <label className="text-sm"><span className="text-xs text-muted">Subtitle</span>
                <input value={d.subtitle} onChange={(e) => save({ subtitle: e.target.value })} className="mt-0.5 h-8 w-full rounded border border-border bg-surface px-2" />
                <NumberFlags text={d.subtitle} allowed={[...ctx.f.numbers, data.benchmark, fw]} /></label>
            </div>
            <ol className="space-y-2" aria-label="Themes on the slide (drag to reorder)">
              {d.themes.map((t, i) => {
                const over = t.line.length > LINE_LIMIT;
                return (
                  <li key={t.id} draggable onDragStart={() => setDragIdx(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragIdx !== null) move(dragIdx, i); setDragIdx(null); }}
                    className={cx('grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-2 rounded-lg border p-2', t.include ? 'border-border bg-surface' : 'border-dashed border-border bg-surface-2', dragIdx === i && 'ring-2 ring-calls')}>
                    <div className="flex flex-col items-center gap-0.5 pt-1">
                      <span className="cursor-grab text-muted" aria-hidden title="Drag to reorder">⋮⋮</span>
                      <button type="button" aria-label={`Move ${themeName(t.id, data.ds.taxonomy)} up`} className="text-xs text-muted hover:text-ink" onClick={() => move(i, i - 1)}>▲</button>
                      <button type="button" aria-label={`Move ${themeName(t.id, data.ds.taxonomy)} down`} className="text-xs text-muted hover:text-ink" onClick={() => move(i, i + 1)}>▼</button>
                    </div>
                    <label className="flex items-center gap-1 pt-1.5 text-xs"><input type="checkbox" checked={t.include} disabled={!t.include && included >= MAX_THEMES} onChange={(e) => setTheme(i, { include: e.target.checked })} aria-label={`Include ${themeName(t.id, data.ds.taxonomy)}`} />On slide</label>
                    <div className="space-y-1">
                      <input value={t.header} onChange={(e) => setTheme(i, { header: e.target.value })} aria-label="Theme header" className="h-7 w-full rounded border border-border bg-surface px-2 text-sm font-semibold" />
                      <div className="flex items-center gap-2">
                        <span aria-hidden>•</span>
                        <input value={t.line} onChange={(e) => setTheme(i, { line: e.target.value })} aria-label={`Insight line for ${themeName(t.id, data.ds.taxonomy)}`} aria-invalid={over}
                          className={cx('h-7 flex-1 rounded border bg-surface px-2 text-sm', over ? 'border-surveys' : 'border-border')} />
                        <span className={cx('w-14 text-right text-xs tnum', over ? 'font-semibold text-surveys' : 'text-muted')} aria-live="polite">{t.line.length}/{LINE_LIMIT}</span>
                      </div>
                      {over && <p className="text-[11px] text-surveys">⚠ Over {LINE_LIMIT} characters: won’t fit one line at 9.5 pt.</p>}
                      <NumberFlags text={t.header} allowed={allowedForTheme(t.id, ctx.f)} />
                      <NumberFlags text={t.line} allowed={allowedForTheme(t.id, ctx.f)} percents={percentsForTheme(t.id, ctx.f)} />
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-sm"><span className="text-xs text-muted">LTR callout</span>
                <textarea value={d.callout} onChange={(e) => save({ callout: e.target.value })} rows={2} className="mt-0.5 w-full rounded border border-border bg-surface p-2" />
                <NumberFlags text={d.callout} allowed={[...ctx.f.numbers, fw]} /></label>
              <label className="text-sm"><span className="text-xs text-muted">Footnote (sources and n)</span>
                <textarea value={d.footnote} onChange={(e) => save({ footnote: e.target.value })} rows={2} className="mt-0.5 w-full rounded border border-border bg-surface p-2 text-xs" /></label>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card title="Leadership questions log">
              <p className="mb-2 text-xs text-muted">Record what leadership asks at the FW{fw} WBR. Open questions open next week’s speaker notes (“Last week I was asked about…”) with an answer from that week’s data.</p>
              <form className="mb-2 flex gap-1.5" onSubmit={async (e) => {
                e.preventDefault(); if (!newQ.trim()) return;
                await db.questions.put({ id: `q-${Date.now().toString(36)}`, fw, asker: asker.trim() || undefined, question: newQ.trim(), answered: false, createdAt: new Date().toISOString() });
                setNewQ(''); setAsker('');
              }}>
                <input value={asker} onChange={(e) => setAsker(e.target.value)} placeholder="Who (optional)" aria-label="Who asked" className="h-8 w-32 rounded border border-border bg-surface px-2 text-sm" />
                <input value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="e.g. Asked for detractor detail by region" aria-label="Question" className="h-8 flex-1 rounded border border-border bg-surface px-2 text-sm" />
                <Button type="submit" disabled={!newQ.trim()}>Log</Button>
              </form>
              <h3 className="mt-2 text-xs font-medium text-muted">From earlier WBRs (answered in these notes)</h3>
              <QuestionList items={ctx.open} />
              <h3 className="mt-2 text-xs font-medium text-muted">Asked at the FW{fw} WBR (for next week)</h3>
              <QuestionList items={ctx.asked} />
            </Card>
            <Card title="Speaker notes" actions={d.notes !== null ? <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => save({ notes: null })}>Regenerate</Button> : <span className="text-xs text-muted">generated</span>}>
              <textarea value={notes} onChange={(e) => save({ notes: e.target.value })} rows={18} aria-label="Speaker notes" className="w-full rounded border border-border bg-surface p-2 font-mono text-xs leading-relaxed" />
              <NumberFlags text={notes} allowed={[...ctx.f.numbers, data.benchmark, fw, fw - 1, 0, 6, 7, 8, 9, 10, 30]} />
              {(pinnedAsk.data ?? []).length > 0 && (
                <div className="mt-2 text-xs">
                  <div className="font-medium text-muted">Pinned from Ask</div>
                  <ul>{pinnedAsk.data!.map((x) => <li key={x} className="flex gap-2"><span className="flex-1">{x}</span><button type="button" className="text-calls hover:underline" onClick={() => void removeWbrNote(fw, x)} aria-label="Remove pinned note"><Icon name="x" size={12} /></button></li>)}</ul>
                </div>
              )}
            </Card>
          </div>
          </fieldset>
        </div>
      </PageGate>
    </>
  );
}

function QuestionList({ items }: { items: { id: string; fw: number; asker?: string; question: string; answered: boolean }[] }) {
  if (!items.length) return <p className="text-xs text-muted">None.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {items.map((q) => (
        <li key={q.id} className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={q.answered} aria-label={`Mark “${q.question}” answered`} onChange={(e) => void db.questions.update(q.id, { answered: e.target.checked })} />
          <span className={cx('flex-1', q.answered && 'text-muted line-through')}>{q.question} <span className="text-xs text-muted">· FW{q.fw}{q.asker ? ` · ${q.asker}` : ''}</span></span>
          <button type="button" aria-label="Delete question" className="text-muted hover:text-surveys" onClick={() => void db.questions.delete(q.id)}><Icon name="trash" size={13} /></button>
        </li>
      ))}
    </ul>
  );
}

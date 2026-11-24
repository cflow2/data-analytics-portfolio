import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { createPortal } from 'react-dom';
import { db } from '@/db/db';
import { useLive } from '@/hooks/useLive';
import { useIsLocked } from '@/hooks/useLocked';
import { usePhone } from '@/hooks/usePhone';
import { useWeekData } from '@/data/useWeekData';
import { useUi } from '@/state/ui';
import { useSettings } from '@/state/settings';
import { getWbrNotes, removeWbrNote } from '@/writing/notes';
import { autoAnswer, openQuestionsFor } from '@/slide/questions';
import { QuestionsLog } from '@/components/slide/QuestionsLog';
import { Icon } from '@/components/ui/Icon';
import { SCREENS } from '@/screens';
import { DEFAULT_ANCHORS, getRegionConfig, DEFAULT_REGION_CONFIG } from '@/config/regions';
import type { RegionMapAsset } from '@/ingest/regionMap';
import { monthDay, rangeLabel } from '@/lib/dates';
import { storeLabel } from '@/domain/geo';
import { copyText, downloadBlob } from '@/data/export';
import { buildModel, signed, valueColor } from '@/slide/model';
import type { MedalliaRange } from '@/ingest/types';
import { COLORS, H, W, fitMap, placeCallouts } from '@/slide/layout';
import { paintMap, paintPlaceholder, regionCenter, PLACEHOLDER_ASPECT } from '@/slide/mapCanvas';
import { defaultEdits, getDriverDefs, loadEdits, resetEdits, saveEdits, saveSnapshot, type SlideEdits, type SlideSnapshot } from '@/slide/state';
import { talkTrack } from '@/slide/notes';
import { buildLtrPptx, ltrPptxName } from '@/slide/pptx';
import type { CalloutCategory } from '@/slide/ltrMetrics';
import { LtrSlideCanvas, type Kpi, type PlacedCallout } from '@/components/slide/LtrSlideCanvas';
import { PageGate } from '@/components/ui/PageGate';
import { Drawer } from '@/components/ui/Drawer';
import { Button, Card, PageHeader, cx } from '@/components/ui/primitives';
import { RedactedText } from '@/components/data/RedactedText';

const CATEGORIES: CalloutCategory[] = ['SCOPE', 'EXECUTION', 'CONFIRMING', 'LOW SURVEY COUNT', 'ABOVE BENCHMARK'];
const WHY_LIMIT = 60;

/** Scales the 1920×1080 canvas to the available width. */
function useFitScale(maxScale = 1) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(maxScale, el.clientWidth / W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxScale]);
  return { ref, scale };
}

export function LtrSlide() {
  const sc = SCREENS.find((x) => x.path === '/slide')!;
  const { data, loading, error } = useWeekData();
  const presentation = useUi((s) => s.presentation);
  const fw = data?.week.fw ?? 0;
  const locked = useIsLocked(fw);
  const cfg = useLive(() => getRegionConfig(), []);
  const mapAsset = useLive(async () => ((await db.kv.get('regionMap'))?.value as RegionMapAsset | undefined) ?? null, []);
  const driverDefs = useLive(() => getDriverDefs(), []);
  const saved = useLive(() => (fw ? loadEdits(fw) : Promise.resolve(null)), [fw]);
  const thresholds = useSettings((s) => s.thresholds);
  const pinnedAsk = useLive(() => (fw ? getWbrNotes(fw) : Promise.resolve([] as string[])), [fw]);
  const ranges = useLive(async () => (await db.kv.where('key').startsWith('medalliaRange:').toArray()).map((r) => r.value as MedalliaRange), []);
  const [drawer, setDrawer] = useState<{ kind: 'region'; region: string } | { kind: 'low' } | { kind: 'info' } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [mapSrc, setMapSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slideRef = useRef<HTMLDivElement>(null);
  const phone = usePhone();
  const [full, setFull] = useState(false);
  const { ref: fitRef, scale } = useFitScale();
  const note = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 2200); };

  const regionCfg = cfg.data ?? DEFAULT_REGION_CONFIG;
  const model = useMemo(() => (data && fw ? buildModel(data.ds.surveys, data.ds.attributeWeekly, fw, data.benchmark, regionCfg, driverDefs.data, ranges.data ?? [], saved.data?.ytdOverride ?? null) : null), [data, fw, regionCfg, driverDefs.data, ranges.data, saved.data?.ytdOverride]);
  const defaults = useMemo(() => (model && data ? defaultEdits(model.m, model.ltrSurveys, data.ds.tags) : null), [model, data]);
  const edits: SlideEdits | null = saved.data ?? defaults;

  const update = useCallback((patch: Partial<SlideEdits>) => {
    if (!edits || locked) return;
    void saveEdits({ ...edits, ...patch });
  }, [edits, locked]);

  // Paint the map whenever the colours or the asset change.
  const asset = mapAsset.data ?? null;
  const colorKey = model ? JSON.stringify(model.regionColor) : '';
  useEffect(() => {
    if (!model) return;
    let live = true;
    const anchors = { ...DEFAULT_ANCHORS, ...regionCfg.anchors };
    (asset ? paintMap(asset, model.regionColor) : Promise.resolve(paintPlaceholder(model.regionColor, anchors)))
      .then((src) => { if (live) setMapSrc(src); })
      .catch(() => { if (live) setMapSrc(paintPlaceholder(model.regionColor, anchors)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, colorKey, regionCfg]);

  const view = useMemo(() => {
    if (!model || !edits || !data) return null;
    const { m } = model;
    const aspect = asset ? asset.base.w / asset.base.h : PLACEHOLDER_ASPECT;
    const box = fitMap(aspect);
    const anchors = { ...DEFAULT_ANCHORS };
    const centers = Object.fromEntries(m.regions.map((r) => [r.region, regionCenter(asset, r.region, regionCfg.anchors, anchors)]));
    const callouts: PlacedCallout[] = placeCallouts(edits.callouts.filter((c) => m.regions.some((r) => r.region === c.region && r.cur.n > 0)), (r) => centers[r] ?? null, box)
      .map(({ item, box: b, anchor }) => ({ ...item, box: b, anchor }));
    const w = data.week;
    const title = `HomeCare+ LTR · FW${fw}`;
    const subtitle = `${rangeLabel(w.start, w.end)}, ${w.end.slice(0, 4)} · WBR ${monthDay(w.wbr)} · Q${w.quarter} · YTD ${model.ytd.display ?? '—'} on ${model.ytd.n.toLocaleString('en-US')}`;
    const kpis: Kpi[] = [
      { id: 'ltr', label: `FW${fw} LTR`, value: `${m.cur.display ?? '—'}`, color: valueColor(m.cur, m.benchmark), sub: `${m.delta === null ? '' : m.delta < 0 ? `▼${-m.delta}` : m.delta > 0 ? `▲${m.delta}` : 'flat'} vs FW${fw - 1} (${m.prior.display ?? '—'}) · n=${m.cur.n}`, tip: `${m.cur.ltr?.toFixed(2) ?? '—'}% = ${m.cur.promoters} of ${m.cur.n} scored 9–10` },
      { id: 'bench', label: 'vs benchmark', value: signed(m.benchDelta), color: m.benchDelta !== null && m.cur.ltr !== null && m.cur.ltr >= m.benchmark ? COLORS.blue : COLORS.red, sub: `Benchmark ${m.benchmark}`, tip: `Rounded LTR ${m.cur.display} minus the ${m.benchmark} benchmark` },
      { id: 'regions', label: `Regions ≥ ${m.benchmark}`, value: `${m.regionsAtOrAbove} of ${m.regionsWithSurveys}`, color: COLORS.ink, sub: 'by unrounded LTR', tip: 'Click a region on the map for its surveys' },
      { id: 'low', label: 'Scored 0–8', value: `${m.cur.low08}`, color: m.overAllowance > 0 ? COLORS.red : COLORS.ink,
        sub: edits.showAllowance ? `allowed ${m.cur.allowed} at ${m.benchmark} · ${m.overAllowance > 0 ? `${m.overAllowance} over` : 'within'}` : `of ${m.cur.n} surveys`, tip: 'Show the surveys that scored 0–8' },
    ];
    const open = openQuestionsFor(data.ds.questions, fw);
    const questions = open.map((q) => ({ question: q.question, fw: q.fw, answer: autoAnswer(q.question, { ds: data.ds, fw, benchmark: data.benchmark, thresholds }) }));
    const notes = talkTrack(m, model.drivers, edits, model.ytd, { questions, pinned: pinnedAsk.data ?? [] });
    return { box, centers, callouts, title, subtitle, kpis, notes };
  }, [model, edits, data, asset, regionCfg, fw, thresholds, pinnedAsk.data]);

  if (!data || !model || !edits || !view) return <><PageHeader title={sc.title} subtitle={sc.subtitle} /><PageGate screen={sc} loading={loading || saved.loading || cfg.loading} error={error} empty={!loading && !!data && !data.week.hasData} emptyTitle={`No surveys for FW${fw}`}>{null}</PageGate></>;
  const { m } = model;

  const canvas = (interactive: boolean, ref?: React.Ref<HTMLDivElement>) => (
    <LtrSlideCanvas ref={ref} model={model} edits={edits} title={view.title} subtitle={view.subtitle} kpis={view.kpis} callouts={view.callouts}
      map={{ src: mapSrc, box: view.box, placeholder: !asset, centers: view.centers }} interactive={interactive}
      onRegion={(region) => setDrawer({ kind: 'region', region })} onKpi={(id) => (id === 'low' || id === 'ltr' ? setDrawer({ kind: 'low' }) : id === 'regions' ? setDrawer({ kind: 'info' }) : undefined)}
      onInfo={() => setDrawer({ kind: 'info' })} />
  );

  const snapshot = (): SlideSnapshot => ({ version: 1, fw, savedAt: new Date().toISOString(), metrics: m, edits, drivers: model.drivers.map(({ short, pct, display }) => ({ short, pct, display })) });

  const exportPng = async () => {
    if (!slideRef.current) return;
    setBusy(true);
    try {
      const url = await toPng(slideRef.current, { width: W, height: H, pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: false, skipFonts: true });
      downloadBlob(`HomeCare_LTR_FW${fw}.png`, await (await fetch(url)).blob(), 'image/png');
      note('PNG downloaded (3840×2160)');
    } finally { setBusy(false); }
  };
  const exportPptx = async () => {
    setBusy(true);
    try {
      await buildLtrPptx({ model, edits, title: view.title, subtitle: view.subtitle, map: mapSrc ? { dataUrl: mapSrc, box: view.box } : null, callouts: view.callouts, notes: view.notes.text,
        labels: m.regions.filter((r) => view.centers[r.region]).map((r) => ({ region: r.region, x: view.box.x + view.centers[r.region]!.x * view.box.w, y: view.box.y + view.centers[r.region]!.y * view.box.h, text: r.cur.n ? `${r.cur.display}${r.lowCount ? '*' : ''}` : '—' })),
        kpis: view.kpis.map(({ label, value, sub, color }) => ({ label, value, sub, color })) }).writeFile({ fileName: ltrPptxName(fw) });
      await saveSnapshot(snapshot());
      note('PowerPoint downloaded; snapshot saved');
    } finally { setBusy(false); }
  };
  const exportJson = async () => {
    const s = snapshot();
    await saveSnapshot(s);
    downloadBlob(`HomeCare_LTR_FW${fw}_snapshot.json`, JSON.stringify(s, null, 2), 'application/json');
    note('Snapshot saved and downloaded');
  };

  const exports = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button variant="primary" icon="download" disabled={busy} onClick={exportPptx}>Download .pptx</Button>
      <Button disabled={busy} onClick={exportPng}>PNG 1920×1080 @2×</Button>
      <Button disabled={busy} onClick={exportJson}>JSON snapshot</Button>
      <Button onClick={async () => { await copyText(view.notes.text); note('Talk track copied'); }}>Copy talk track</Button>
      {flash && <span role="status" className="text-xs text-grow">{flash}</span>}
    </div>
  );

  const drawerEl = drawer && (() => {
    if (drawer.kind === 'info') return (
      <Drawer title="How the LTR slide is calculated" onClose={() => setDrawer(null)} width={560}>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li><b>LTR</b> = surveys scoring 9–10 ÷ all surveys with a 0–10 Likelihood to Recommend score, from the LTR Tracker.</li>
          <li><b>Whole numbers</b> round half up after the Tracker's one-decimal rounding (94.49 → 94.5 → 95). <b>Colours</b> use the unrounded value, so FW38's 92.55 shows “93” in red.</li>
          <li><b>Changes</b> are rounded minus rounded, in points. ▲ black = up, ▼ red = down.</li>
          <li><b>Scored 0–8</b> is Lowe's detractor count for the trend. Cards use Medallia's buckets: Promoters 9–10, Passives 7–8, Detractors 0–6.</li>
          <li><b>Allowed at {m.benchmark}</b> = floor(n × 0.07): FW{fw} {m.cur.n} × 0.07 → {m.cur.allowed}. Hidden until “Show allowance” is on.</li>
          <li><b>*</b> marks regions with fewer than 10 surveys. Regions with fewer than 5 are grey on the map.</li>
          <li><b>Divisions</b> follow the region config in Settings (South, West, North).</li>
          <li><b>Key Drivers</b> are Medallia Analytics % 9–10 for the week when that export is loaded, otherwise per-survey answers.</li>
          <li>Callout categories and card text are <b>suggestions</b> from comment tags and Medallia topics. Edit them below the slide; edits save per week.</li>
        </ul>
      </Drawer>
    );
    const list = drawer.kind === 'low'
      ? model.ltrSurveys.filter((s) => s.fw === fw && s.ltr !== null && s.ltr <= 8)
      : model.ltrSurveys.filter((s) => s.fw === fw && s.region === drawer.region);
    const r = drawer.kind === 'region' ? m.regions.find((x) => x.region === drawer.region) : null;
    return (
      <Drawer title={drawer.kind === 'low' ? `FW${fw} surveys that scored 0–8` : `${drawer.region} · FW${fw}`} onClose={() => setDrawer(null)}
        subtitle={r ? `${r.cur.display ?? '—'} (${r.cur.ltr?.toFixed(2) ?? '—'}%) on ${r.cur.n} · ${r.cur.low08} scored 0–8 · FW${fw - 1} ${r.prior.display ?? '—'} on ${r.prior.n}` : `${list.length} surveys · allowed at ${m.benchmark}: ${m.cur.allowed}`}>
        {list.length === 0 ? <p className="text-sm text-muted">No surveys.</p> : (
          <ul className="space-y-2">
            {[...list].sort((a, b) => (a.ltr ?? 0) - (b.ltr ?? 0)).map((s) => (
              <li key={s.id} className="rounded-lg border border-border bg-surface p-2 text-sm">
                <div className="text-xs text-muted tnum">Score <b className={cx((s.ltr ?? 10) <= 8 && 'text-surveys')}>{s.ltr}</b> · {s.region} · {storeLabel(s.storeNo, data.ds.stores)} · {monthDay(s.date)}</div>
                {s.comment ? <RedactedText recordId={s.id} field="comment" text={s.comment} /> : <span className="text-xs text-muted">No comment</span>}
                {!!s.topics?.length && <div className="mt-1 text-[11px] text-muted">Medallia topics: {s.topics.join('; ')}</div>}
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    );
  })();

  if (presentation) return (
    <div ref={fitRef} className="mx-auto w-full max-w-[1600px]">
      <div style={{ width: W * scale, height: H * scale }} className="overflow-hidden rounded-lg border border-border shadow-sm">
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>{canvas(true, slideRef)}</div>
      </div>
      {drawerEl}
    </div>
  );

  const setCallout = (i: number, patch: Partial<SlideEdits['callouts'][number]>) => update({ callouts: edits.callouts.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setCard = (k: keyof SlideEdits['cards'], patch: Partial<SlideEdits['cards'][typeof k]>) => update({ cards: { ...edits.cards, [k]: { ...edits.cards[k], ...patch } } });
  const minutes = view.notes.minutes;
  const ro = locked;

  return (
    <>
      <PageHeader title={sc.title} subtitle={sc.subtitle} actions={exports} />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={edits.showAllowance} disabled={ro} onChange={(e) => update({ showAllowance: e.target.checked })} />
            Show allowance (allowed 0–8 at {m.benchmark})
          </label>
          {locked && <span className="rounded bg-calls-soft px-2 py-0.5 text-xs">FW{fw} is locked: read-only</span>}
          {saved.data ? <span className="text-xs text-muted">Edits saved for FW{fw}</span> : <span className="text-xs text-muted">Showing suggestions; edits save per week</span>}
          {saved.data && !ro && <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => void resetEdits(fw)}>Reset to suggestions</Button>}
        </div>

        <div ref={fitRef} className="w-full">
          <div style={{ width: W * scale, height: H * scale }} className="overflow-hidden rounded-lg border border-border shadow-sm">
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: W, height: H }}>{canvas(true, slideRef)}</div>
          </div>
          {phone && <Button className="mt-2 w-full" onClick={() => setFull(true)}>View full screen</Button>}
        </div>
        {full && <FullScreenSlide onClose={() => setFull(false)}>{canvas(true)}</FullScreenSlide>}

        <div className="grid gap-3 xl:grid-cols-2">
          <QuestionsLog fw={fw} open={openQuestionsFor(data.ds.questions, fw)} asked={data.ds.questions.filter((q) => q.fw === fw)} readOnly={locked} />
          <Card title="Pinned from Ask" actions={<span className="text-xs text-muted">added to the Back pocket</span>}>
            {(pinnedAsk.data ?? []).length === 0 ? <p className="text-sm text-muted">Nothing pinned. On Ask, use “Add to slide notes” to keep an answer here.</p> : (
              <ul className="space-y-1 text-sm">{pinnedAsk.data!.map((x) => <li key={x} className="flex gap-2"><span className="flex-1">{x}</span><button type="button" className="text-calls" onClick={() => void removeWbrNote(fw, x)} aria-label="Remove pinned note"><Icon name="x" size={12} /></button></li>)}</ul>
            )}
          </Card>
          <Card title="Validation" actions={<span className="text-xs text-muted">Check before presenting</span>}>
            <ul className="space-y-1.5 text-sm">
              {model.checks.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <span aria-hidden className={cx('w-4 shrink-0 font-semibold', c.status === 'ok' ? 'text-grow' : c.status === 'warn' ? 'text-surveys' : 'text-muted')}>{c.status === 'ok' ? '✓' : c.status === 'warn' ? '!' : 'i'}</span>
                  <span><span className="font-medium">{c.label}</span><span className="sr-only"> ({c.status})</span>: <span className="text-muted">{c.detail}</span></span>
                </li>
              ))}
            </ul>
            <div className="mt-3 overflow-x-auto" tabIndex={0}>
              <table className="w-full text-xs tnum">
                <caption className="sr-only">Regions for FW{fw}</caption>
                <thead className="text-left text-muted"><tr><th className="pr-2">Region</th><th className="pr-2">Division</th><th className="pr-2 text-right">n</th><th className="pr-2 text-right">LTR</th><th className="pr-2 text-right">Shown</th><th className="pr-2 text-right">0–8</th><th className="pr-2 text-right">FW{fw - 1}</th><th className="text-right">Δ</th></tr></thead>
                <tbody>
                  {m.regions.map((r) => (
                    <tr key={r.region} className="border-t border-border">
                      <td className="pr-2">{r.region}</td><td className="pr-2">{r.division ?? '—'}</td><td className="pr-2 text-right">{r.cur.n}</td>
                      <td className="pr-2 text-right">{r.cur.ltr?.toFixed(2) ?? '—'}</td><td className="pr-2 text-right font-semibold">{r.cur.display ?? '—'}{r.lowCount ? '*' : ''}</td>
                      <td className="pr-2 text-right">{r.cur.low08}</td><td className="pr-2 text-right">{r.prior.display ?? '—'} <span className="text-muted">({r.prior.n})</span></td><td className="text-right">{signed(r.delta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Talk track (speaker notes)" actions={<span className={cx('text-xs tnum', minutes < 4 || minutes > 4.5 ? 'text-surveys' : 'text-grow')}>{view.notes.words} words ≈ {minutes.toFixed(1)} min (target 4–4.5)</span>}>
            <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap font-sans text-sm" tabIndex={0}>{view.notes.text}</pre>
          </Card>
        </div>

        <Card title="Edit the slide" actions={<span className="text-xs text-muted">Suggestions only: confirm categories and wording</span>}>
          <fieldset disabled={ro} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">Presenter
                <input className="h-8 rounded-lg border border-border bg-surface px-2" value={edits.presenter} onChange={(e) => update({ presenter: e.target.value })} placeholder="Name shown in the title bar" />
              </label>
              <label className="flex flex-col gap-1 text-sm">RedVest shout-out (talk track only)
                <input className="h-8 rounded-lg border border-border bg-surface px-2" value={edits.shoutout} onChange={(e) => update({ shoutout: e.target.value })} placeholder="Who earned it and why" />
              </label>
              <label className="flex flex-col gap-1 text-sm">Close (talk track)
                <input className="h-8 rounded-lg border border-border bg-surface px-2" value={edits.close} onChange={(e) => update({ close: e.target.value })} />
              </label>
            </div>

            <YtdEntry key={`${fw}:${edits.ytdOverride?.ltr ?? ''}:${edits.ytdOverride?.n ?? ''}`} value={edits.ytdOverride ?? null} source={model.ytd.source} onSave={(v) => update({ ytdOverride: v })} />

            <div>
              <h3 className="mb-1 text-sm font-semibold">Callouts ({edits.callouts.length} of 6)</h3>
              <div className="grid gap-2 lg:grid-cols-2">
                {edits.callouts.map((c, i) => (
                  <div key={i} className="rounded-lg border border-border p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs">Region{' '}
                        <select className="h-7 rounded border border-border bg-surface px-1 text-sm" value={c.region} onChange={(e) => setCallout(i, { region: e.target.value })} aria-label={`Callout ${i + 1} region`}>
                          {m.regions.filter((r) => r.cur.n > 0).map((r) => <option key={r.region} value={r.region}>{r.region} · {r.cur.display}{r.lowCount ? '*' : ''}</option>)}
                        </select>
                      </label>
                      {CATEGORIES.map((k) => (
                        <label key={k} className="flex items-center gap-1 text-[11px]">
                          <input type="checkbox" checked={c.categories.includes(k)} onChange={(e) => setCallout(i, { categories: e.target.checked ? [...c.categories, k] : c.categories.filter((x) => x !== k) })} />{k}
                        </label>
                      ))}
                      <Button variant="ghost" className="ml-auto h-6 px-1.5 text-xs" onClick={() => update({ callouts: edits.callouts.filter((_, j) => j !== i) })} aria-label={`Remove callout ${c.region}`}>Remove</Button>
                    </div>
                    <input className="mt-1 h-8 w-full rounded border border-border bg-surface px-2 text-sm" value={c.why} onChange={(e) => setCallout(i, { why: e.target.value })} aria-label={`Callout ${c.region} reason`} />
                    <div className={cx('text-right text-[11px] tnum', c.why.length > WHY_LIMIT ? 'text-surveys' : 'text-muted')}>{c.why.length}/{WHY_LIMIT}</div>
                  </div>
                ))}
              </div>
              {edits.callouts.length < 6 && (
                <Button className="mt-2 h-7 px-2 text-xs" onClick={() => { const r = m.regions.find((x) => x.cur.n > 0 && !edits.callouts.some((c) => c.region === x.region)); if (r) update({ callouts: [...edits.callouts, { region: r.region, categories: [], why: `${r.cur.n} surveys; ${r.cur.low08} scored 0–8` }] }); }}>Add callout</Button>
              )}
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {(['promoters', 'passives', 'detractors'] as const).map((k) => (
                <div key={k} className="space-y-1 rounded-lg border border-border p-2">
                  <h3 className="text-sm font-semibold capitalize">{k}</h3>
                  <label className="flex flex-col gap-0.5 text-xs">Top drivers (comma-separated)
                    <input className="h-8 rounded border border-border bg-surface px-2 text-sm" value={edits.cards[k].drivers.join(', ')} onChange={(e) => setCard(k, { drivers: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
                  </label>
                  <label className="flex flex-col gap-0.5 text-xs">Bullets (one per line, ≈60 characters)
                    <textarea rows={3} className="rounded border border-border bg-surface px-2 py-1 text-sm" value={edits.cards[k].bullets.join('\n')} onChange={(e) => setCard(k, { bullets: e.target.value.split('\n').slice(0, 3) })} />
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
        </Card>
      </div>
      {drawerEl}
    </>
  );
}

/** YTD typed in from Medallia's expanded view. Saved only when both numbers are valid. */
function YtdEntry({ value, source, onSave }: { value: { ltr: number; n: number } | null; source: string; onSave: (v: { ltr: number; n: number } | null) => void }) {
  const [ltr, setLtr] = useState(value ? String(value.ltr) : '');
  const [n, setN] = useState(value ? String(value.n) : '');
  const l = Number(ltr), k = Number(n.replace(/,/g, ''));
  const valid = ltr !== '' && n !== '' && l > 0 && l <= 100 && Number.isInteger(k) && k > 0;
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <span className="w-full text-xs text-muted">YTD from Medallia’s expanded view (optional). The slide uses, in order: this entry, a Medallia Analytics export run from the start of the year, then the Tracker. Now showing: {source}.</span>
      <label className="flex flex-col gap-1">YTD LTR %
        <input inputMode="decimal" className="h-8 w-24 rounded-lg border border-border bg-surface px-2" value={ltr} onChange={(e) => setLtr(e.target.value)} placeholder="e.g. 93.1" />
      </label>
      <label className="flex flex-col gap-1">YTD surveys
        <input inputMode="numeric" className="h-8 w-28 rounded-lg border border-border bg-surface px-2" value={n} onChange={(e) => setN(e.target.value)} placeholder="e.g. 3,629" />
      </label>
      <Button className="h-8" disabled={!valid} onClick={() => onSave({ ltr: l, n: k })}>Use these</Button>
      {value && <Button variant="ghost" className="h-8" onClick={() => onSave(null)}>Clear</Button>}
      {(ltr || n) && !valid && <span className="text-xs text-surveys">Enter a % between 0 and 100 and a whole number of surveys.</span>}
    </div>
  );
}

/** Phone: the slide fills the screen, turned sideways when the phone is upright. Tap Close (or Esc) to return. */
function FullScreenSlide({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('resize', on); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('keydown', key); };
  }, [onClose]);
  const upright = Math.min(vp.w / W, vp.h / H);
  const sideways = Math.min(vp.h / W, vp.w / H);
  const rotate = sideways > upright * 1.1;
  const s = rotate ? sideways : upright;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="LTR slide, full screen" className="fixed inset-0 z-50 overflow-hidden bg-black">
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: W, height: H, transform: `translate(-50%, -50%) ${rotate ? 'rotate(90deg) ' : ''}scale(${s})` }}>{children}</div>
      <Button className="absolute bottom-3 right-3 z-10" style={{ marginBottom: 'env(safe-area-inset-bottom)' }} onClick={onClose} autoFocus>Close</Button>
    </div>,
    document.body,
  );
}

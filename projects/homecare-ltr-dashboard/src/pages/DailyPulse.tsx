import { useEffect, useMemo, useState } from 'react';
import { db } from '@/db/db';
import { useDataset } from '@/data/dataset';
import { useLive } from '@/hooks/useLive';
import { SCREENS } from '@/screens';
import { PULSE_MAX_WORDS, WORDS_PER_MINUTE, plainText, pulseDoc, pulseFacts, pulseHtml, wordCount } from '@/writing/pulse';
import { verifyNumbers } from '@/writing/verify';
import { addDays, dayName, monthDay, todayISO, type ISODate } from '@/lib/dates';
import { copyHtml, copyText } from '@/data/export';
import { useSettings } from '@/state/settings';
import { useFilters } from '@/state/filters';
import type { PulseFacts } from '@/writing/pulse';
import { PaceLine } from '@/components/subs/PaceLine';
import { Link } from 'react-router';
import { useUi } from '@/state/ui';
import { PageGate } from '@/components/ui/PageGate';
import { Button, Card, PageHeader, Segmented, cx } from '@/components/ui/primitives';
import { RedactedText } from '@/components/data/RedactedText';

const KEY = (d: string) => `pulse:${d}`;

export function DailyPulse() {
  const sc = SCREENS.find((x) => x.path === '/pulse')!;
  const { data: ds, loading, error } = useDataset();
  const presentation = useUi((s) => s.presentation);
  const benchmark = useSettings((s) => s.benchmark);
  const fyStart = useSettings((s) => s.fyStart);
  // Default: the day after the latest survey (so "yesterday" has data), capped at today.
  const defaultDate = useMemo(() => {
    const latest = [...(ds?.surveys.map((c) => c.date) ?? []), ...(ds?.subscriptionSnapshots.map((s) => s.through) ?? [])].reduce<ISODate | null>((m, x) => (!m || x > m ? x : m), null);
    const t = todayISO();
    return latest ? (addDays(latest, 1) < t ? addDays(latest, 1) : t) : t;
  }, [ds]);
  const [date, setDate] = useState<ISODate | null>(null);
  const d = date ?? defaultDate;
  const saved = useLive(async () => ((await db.kv.get(KEY(d)))?.value as string | undefined) ?? null, [d]);
  const [big, setBig] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  useEffect(() => { if (!big) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setBig(false); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [big]);

  const [filters] = useFilters();
  const geo = useMemo(() => ({ division: filters.division, region: filters.region, district: filters.district, store: filters.store }), [filters.division, filters.region, filters.district, filters.store]);
  const f = useMemo(() => (ds ? pulseFacts(ds, d, benchmark, fyStart, geo) : null), [ds, d, benchmark, fyStart, geo]);
  if (!ds || !f) return <><PageHeader title={sc.title} subtitle={sc.subtitle} /><PageGate screen={sc} loading={loading} error={error} empty={false}>{null}</PageGate></>;
  const doc = pulseDoc(f);
  const script = saved.data ?? doc.text;
  const bad = verifyNumbers(plainText(script), doc.numbers, [0, 6, 7, 8, 9, 10]).filter((h) => !h.ok);
  const w = f.wtd;
  const words = wordCount(script);
  const secs = Math.round((words / WORDS_PER_MINUTE) * 60);
  const html = pulseHtml(script);
  const flash = (m: string) => { setCopied(m); setTimeout(() => setCopied(null), 1500); };

  return (
    <>
      <PageHeader title={sc.title} subtitle={sc.subtitle} actions={
        <label className="flex items-center gap-2 text-sm"><span className="text-xs text-muted">Meeting date</span>
          <input type="date" value={d} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-8 rounded-lg border border-border bg-surface px-2" aria-label="Meeting date" />
          <span className="text-xs text-muted">{dayName(d)}</span></label>
      } />
      <PageGate screen={sc} loading={false} error={null} empty={!f.hasData} emptyTitle={`Nothing loaded for ${f.periodLabel}`}>
        <div className="space-y-3">
          <p className="text-sm text-muted">Covering {f.periodLabel}.</p>
          <div className="grid grid-cols-4 gap-3">
            <Card title={`Surveys · ${f.surveys.length}`}>
              <p className="text-sm tnum">{f.period.pct === null ? '—' : `${f.period.pct.toFixed(1)}% scored 9–10`} <span className="text-xs text-muted">({f.period.promoters} of {f.period.n})</span></p>
              <p className="text-xs text-muted">{f.comments} with a comment</p>
              {f.topThemes.length > 0 && <><h3 className="mt-2 text-xs font-medium text-muted">Top comment themes</h3>
                <ul className="text-sm tnum">{f.topThemes.map((x) => <li key={x.key} className="flex justify-between gap-2"><span className="truncate">{x.key}</span><span>{x.count}</span></li>)}</ul></>}
            </Card>
            <Card title={`Scored 0–8 · ${f.detractors.length}`}>
              {f.detractors.length === 0 ? <p className="text-sm text-muted">None.</p> : (
                <ul className="max-h-56 space-y-1 overflow-y-auto text-sm tnum" tabIndex={0}>
                  {f.detractors.map(({ s, store, cause }) => <li key={s.id}><span className={cx('font-semibold', s.ltr! <= 6 && 'text-surveys')}>{s.ltr}</span> · {store}{cause && <span className="text-muted"> · {cause}</span>}</li>)}
                </ul>
              )}
            </Card>
            <Card title={`Damage & safety · ${f.damage.length}`}>
              {f.damage.length === 0 ? <p className="text-sm text-muted">None.</p> : (
                <ul className="max-h-56 space-y-1.5 overflow-y-auto text-sm" tabIndex={0}>
                  {f.damage.map(({ s, store }) => (
                    <li key={s.id}><div className="text-xs text-muted">Score {s.ltr} · {store}</div>
                      <RedactedText recordId={s.id} field="comment" text={s.comment} className="text-xs" /></li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={`FW${w.fw} so far`}>
              <p className="text-sm tnum">{w.s.pct === null ? '—' : <><span className={cx('font-semibold', w.s.pct < f.benchmark && 'text-surveys')}>{w.s.pct.toFixed(1)}%</span> on {w.s.n} surveys</>}</p>
              {w.s.n > 0 && <p className="text-xs text-muted tnum">{w.s.detractors} scored 0–8 · {w.allowed} allowed at {f.benchmark}</p>}
              <h3 className="mt-3 text-xs font-medium text-muted">One thing to watch</h3>
              <p className="text-sm font-medium">{f.watch}</p>
            </Card>
          </div>

          <SubsCard f={f} />

          <Card title={`${f.isFriday ? 'Pulse + week recap' : 'Pulse script'} · ${words} words (~${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')})`} actions={!presentation && (
            <>
              <Segmented label="View" value={mode} onChange={setMode} options={[{ value: 'read', label: 'Read' }, { value: 'edit', label: 'Edit' }]} />
              {saved.data !== null && <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => void db.kv.delete(KEY(d))}>Regenerate</Button>}
              <Button className="h-7 px-2 text-xs" onClick={async () => { await copyHtml(html, plainText(script)); flash('Copied with formatting'); }}>Copy for Teams/Outlook</Button>
              <Button className="h-7 px-2 text-xs" onClick={async () => { await copyText(plainText(script)); flash('Copied'); }}>Copy text</Button>
              <Button variant="primary" className="h-7 px-2 text-xs" onClick={() => setBig(true)}>Read in large type</Button>
            </>
          )}>
            {copied && <p role="status" className="mb-2 text-xs text-grow">{copied}</p>}
            {mode === 'edit' && !presentation ? (
              <textarea value={script} onChange={(e) => void db.kv.put({ key: KEY(d), value: e.target.value })} rows={18} aria-label="Pulse script" className="w-full rounded border border-border bg-surface p-3 text-sm leading-relaxed" />
            ) : (
              // pulseHtml escapes everything; ** becomes bold, • lines become a list.
              <div data-testid="pulse-script" className={cx('pulse-script leading-relaxed', presentation ? 'text-xl' : 'text-[15px]')} dangerouslySetInnerHTML={{ __html: html }} />
            )}
            {words > PULSE_MAX_WORDS && <p className="mt-1 text-xs text-surveys">Over two minutes ({words} words; the limit is {PULSE_MAX_WORDS}). Trim it in Edit.</p>}
            {bad.length > 0 && <p className="mt-1 text-xs text-surveys">⚠ {bad.map((b) => `“${b.text}”`).join(', ')} {bad.length === 1 ? 'doesn’t' : 'don’t'} match the data for {f.periodLabel}.</p>}
            <p className="mt-1 text-xs text-muted">
              Built from the loaded data only; anything not loaded is said plainly. {doc.dropped > 0 && saved.data === null ? `${doc.dropped} lower-priority line${doc.dropped === 1 ? ' was' : 's were'} left out to stay under two minutes. ` : ''}
              {f.isFriday ? 'Fridays add the week recap (Saturday through Thursday). ' : ''}Edits are saved for {monthDay(d)}; use **double asterisks** for bold. Comments are quoted from the redacted text; customer names never appear.
            </p>
          </Card>
        </div>
      </PageGate>
      {big && (
        <div role="dialog" aria-modal="true" aria-label="Pulse script, large type" className="fixed inset-0 z-50 flex flex-col bg-bg p-12" onClick={() => setBig(false)}>
          <p className="mb-6 text-sm text-muted">HomeCare+ pulse · {f.periodLabel} · Esc or click to close</p>
          <div className="pulse-script max-w-[1100px] overflow-y-auto text-[30px] leading-snug" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </>
  );
}

/** Subscriptions sold in the pulse period, fiscal week to date and vs the same point last week (from the subscription exports). */
function SubsCard({ f }: { f: PulseFacts }) {
  const s = f.subs;
  if (!s) return (
    <Card title="Subscriptions">
      <p className="text-sm text-muted">No subscription export covers {f.periodLabel}. Upload the daily HomeCare+ subscription export (store × week, YTD) on the Data Manager. Upload it every morning: “yesterday” is worked out from the difference between consecutive exports.</p>
    </Card>
  );
  const sp = s.samePointLastWeek;
  const delta = sp ? s.wtd.subs - sp.subs : null;
  return (
    <Card title={`Subscriptions · FW${s.fw} day ${s.days}`} actions={<Link to="/subscriptions" className="text-xs font-medium text-calls underline">Subscriptions screen</Link>}>
      <div className="grid grid-cols-4 gap-3 text-sm tnum">
        <div><div className="text-xs text-muted">{f.periodLabel.startsWith('the weekend') ? 'Over the weekend' : 'Yesterday'}</div>
          {s.period ? <><div className="font-display text-2xl font-semibold">{s.period.subs.toLocaleString('en-US')}</div><div className="text-xs text-muted">{s.period.instore} in store · {s.period.online} online</div></> : <p className="text-xs text-surveys">{s.periodNote}</p>}</div>
        <div><div className="text-xs text-muted">FW{s.fw} to date</div><div className="font-display text-2xl font-semibold">{s.wtd.subs.toLocaleString('en-US')}</div><div className="text-xs text-muted">{s.wtd.instore} in store · {s.wtd.online} online</div></div>
        <div><div className="text-xs text-muted">Same point last week</div>
          {sp ? <><div className="font-display text-2xl font-semibold">{sp.subs.toLocaleString('en-US')}</div><div className={cx('text-xs', delta! < 0 ? 'text-surveys' : 'text-grow')}>{delta! >= 0 ? '▲' : '▼'} {Math.abs(delta!)}{sp.subs ? ` (${Math.abs(Math.round((100 * delta!) / sp.subs))}%)` : ''} this week</div></>
            : <p className="text-xs text-muted">Needs the export from 7 days ago. FW{s.fw - 1} full week: {s.priorWeekFull.subs.toLocaleString('en-US')} ({s.priorWeekFull.instore} in store).</p>}</div>
        <div><div className="text-xs text-muted">Most in-store sales, FW{s.fw}</div>
          {s.topInstore.length ? <ol className="text-xs">{s.topInstore.slice(0, 3).map((t) => <li key={t.storeNo} className="flex justify-between gap-2"><span className="truncate">{t.label}</span><span>{t.instore}</span></li>)}</ol> : <p className="text-xs text-muted">None yet.</p>}</div>
      </div>
      <PaceLine s={s} />
      {s.stale && <p className="mt-2 text-xs text-surveys">The latest subscription export covers through {s.snap.through}, not {f.to}.</p>}
      <p className="mt-2 text-xs text-muted">Net of cancellations. Data through {s.snap.through} (export {s.snap.id.replace('T', ' ').slice(0, 16)}).</p>
    </Card>
  );
}


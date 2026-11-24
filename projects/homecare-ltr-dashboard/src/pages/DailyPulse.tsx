import { useEffect, useMemo, useState } from 'react';
import { db } from '@/db/db';
import { useDataset } from '@/data/dataset';
import { useLive } from '@/hooks/useLive';
import { SCREENS } from '@/screens';
import { pulseFacts, pulseScript } from '@/writing/pulse';
import { verifyNumbers } from '@/writing/verify';
import { addDays, dayName, monthDay, todayISO, type ISODate } from '@/lib/dates';
import { copyText } from '@/data/export';
import { useSettings } from '@/state/settings';
import { useUi } from '@/state/ui';
import { PageGate } from '@/components/ui/PageGate';
import { Button, Card, PageHeader, cx } from '@/components/ui/primitives';
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
    const latest = ds?.surveys.reduce<ISODate | null>((m, c) => (!m || c.date > m ? c.date : m), null);
    const t = todayISO();
    return latest ? (addDays(latest, 1) < t ? addDays(latest, 1) : t) : t;
  }, [ds]);
  const [date, setDate] = useState<ISODate | null>(null);
  const d = date ?? defaultDate;
  const saved = useLive(async () => ((await db.kv.get(KEY(d)))?.value as string | undefined) ?? null, [d]);
  const [big, setBig] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!big) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setBig(false); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [big]);

  const f = useMemo(() => (ds ? pulseFacts(ds, d, benchmark, fyStart) : null), [ds, d, benchmark, fyStart]);
  if (!ds || !f) return <><PageHeader title={sc.title} subtitle={sc.subtitle} /><PageGate screen={sc} loading={loading} error={error} empty={false}>{null}</PageGate></>;
  const generated = pulseScript(f);
  const script = saved.data ?? generated;
  const bad = verifyNumbers(script, f.numbers, [0, 6, 7, 8, 9, 10]).filter((h) => !h.ok);
  const w = f.wtd;
  const words = script.split(/\s+/).filter(Boolean).length;

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

          <Card title={`60-second script · ${words} words (~${Math.round(words / 2.5)} s)`} actions={!presentation && (
            <>
              {saved.data !== null && <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => void db.kv.delete(KEY(d))}>Regenerate</Button>}
              <Button className="h-7 px-2 text-xs" onClick={async () => { await copyText(script); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy'}</Button>
              <Button variant="primary" className="h-7 px-2 text-xs" onClick={() => setBig(true)}>Read in large type</Button>
            </>
          )}>
            {presentation ? <p className="font-display text-2xl leading-relaxed">{script}</p> : (
              <textarea value={script} onChange={(e) => void db.kv.put({ key: KEY(d), value: e.target.value })} rows={6} aria-label="Pulse script" className="w-full rounded border border-border bg-surface p-3 text-base leading-relaxed" />
            )}
            {bad.length > 0 && <p className="mt-1 text-xs text-surveys">⚠ {bad.map((b) => `“${b.text}”`).join(', ')} {bad.length === 1 ? 'doesn’t' : 'don’t'} match the data for {f.periodLabel}.</p>}
            <p className="mt-1 text-xs text-muted">Generated from the numbers above; edits are saved for {monthDay(d)}. Store numbers only, never names.</p>
          </Card>
        </div>
      </PageGate>
      {big && (
        <div role="dialog" aria-modal="true" aria-label="Pulse script, large type" className="fixed inset-0 z-50 flex flex-col bg-bg p-12" onClick={() => setBig(false)}>
          <p className="mb-6 text-sm text-muted">HomeCare+ pulse · {f.periodLabel} · Esc or click to close</p>
          <p className="max-w-[1100px] font-display text-[40px] leading-snug">{script}</p>
        </div>
      )}
    </>
  );
}

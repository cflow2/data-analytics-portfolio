import { geoParts } from '@/analytics/ltr';
import { useEffect, useRef, useState } from 'react';
import { useWeekData } from '@/data/useWeekData';
import { SCREENS } from '@/screens';
import { answer, SUGGESTIONS } from '@/ask/ask';
import { useAsk } from '@/state/ask';
import { useSettings } from '@/state/settings';
import { useUi } from '@/state/ui';
import { addWbrNote } from '@/writing/notes';
import { copyText, toTsv } from '@/data/export';
import { PageGate } from '@/components/ui/PageGate';
import { Button, Card, PageHeader, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';

export function Ask() {
  const sc = SCREENS.find((x) => x.path === '/ask')!;
  const { data, loading, error } = useWeekData();
  const thresholds = useSettings((s) => s.thresholds);
  const presentation = useUi((s) => s.presentation);
  const { turns, add, clear } = useAsk();
  const [q, setQ] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [turns.length]);

  const ask = (question: string) => {
    if (!data || !question.trim()) return;
    const a = answer(question, { ds: data.ds, fw: data.week.fw, benchmark: data.benchmark, thresholds, geo: data.geo });
    add({ q: question.trim(), fw: data.week.fw, a });
    setQ('');
  };
  const note = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 1800); };

  return (
    <>
      <PageHeader title={sc.title} subtitle={sc.subtitle} actions={turns.length > 0 && !presentation && <Button variant="ghost" onClick={clear}>Clear conversation</Button>} />
      <PageGate screen={sc} loading={loading} error={error} empty={!!data && data.ds.surveys.length === 0} emptyTitle="Nothing is loaded yet">
        {data && (
          <div className="mx-auto max-w-[920px] space-y-3">
            <p className="flex items-center gap-1.5 text-xs text-muted"><Icon name="lock" size={13} /> Answers are computed on this laptop from the loaded data, for {data.week.label.split(' · ')[0]}{data.geoFiltered ? ` · ${geoParts(data.geo).join(' › ')}` : ''} unless the question says otherwise. Nothing is sent anywhere.</p>
            {turns.length === 0 && (
              <Card>
                <p className="text-sm text-muted">Ask about LTR, detractors, regions, stores, attributes or comment themes. Name weeks (“FW38”, “last 4 weeks”, “FYTD”), a region (“R5”), a store (“#1234”) or a theme (“exclusions”).</p>
              </Card>
            )}
            <ol className="space-y-3" aria-live="polite">
              {turns.map((t) => (
                <li key={t.id} className="space-y-2">
                  <div className="ml-auto w-fit max-w-[80%] rounded-[12px] bg-calls px-3 py-2 text-sm text-white dark:text-[#0d1524]">{t.q}</div>
                  <article className={cx('rounded-[12px] border bg-surface p-3', t.a.notLoaded ? 'border-watch' : 'border-border')} aria-label={`Answer to: ${t.q}`}>
                    <div className="space-y-1.5 text-[15px] leading-relaxed tnum">{t.a.text.map((l, i) => <p key={i}>{l}</p>)}</div>
                    {t.a.dataUsed && (
                      <details className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                        <summary className="cursor-pointer text-xs font-medium text-muted">Data used · {t.a.dataUsed.filters.join(' · ')} · {t.a.dataUsed.n}</summary>
                        <div className="mt-2 max-h-64 overflow-auto">
                          <table className="w-full text-xs tnum">
                            <thead className="text-left text-muted"><tr>{t.a.dataUsed.table.columns.map((c) => <th key={c} className="py-1 pr-3 font-medium">{c}</th>)}</tr></thead>
                            <tbody>{t.a.dataUsed.table.rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="py-1 pr-3">{c ?? '—'}</td>)}</tr>)}</tbody>
                          </table>
                        </div>
                        {!presentation && <Button variant="ghost" className="mt-1 h-7 px-2 text-xs" onClick={async () => { await copyText(toTsv(t.a.dataUsed!.table)); note('Data copied'); }}>Copy data</Button>}
                      </details>
                    )}
                    {!presentation && !t.a.notLoaded && (
                      <div className="mt-2 flex gap-1">
                        <Button variant="ghost" className="h-7 px-2 text-xs" onClick={async () => { await copyText(t.a.text.join('\n')); note('Answer copied'); }}>Copy answer</Button>
                        <Button variant="ghost" className="h-7 px-2 text-xs" onClick={async () => { await addWbrNote(t.fw, `${t.q}: ${t.a.text.join(' ')}`); note(`Pinned to the FW${t.fw} LTR Slide notes`); }}>Add to slide notes</Button>
                      </div>
                    )}
                  </article>
                </li>
              ))}
            </ol>
            <div ref={end} />
            {flash && <p role="status" className="text-xs text-grow">{flash}</p>}
            <div className="sticky bottom-0 space-y-2 bg-bg pb-2 pt-1">
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => ask(s)} className="motion rounded-full border border-border bg-surface px-3 py-1 text-xs hover:border-calls hover:text-calls">{s}</button>)}
              </div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Which stores are lowest in R27 since FW30?" aria-label="Your question"
                  className="h-10 flex-1 rounded-[12px] border border-border bg-surface px-3 text-sm" />
                <Button type="submit" variant="primary" className="h-10" disabled={!q.trim()}>Ask</Button>
              </form>
            </div>
          </div>
        )}
      </PageGate>
    </>
  );
}

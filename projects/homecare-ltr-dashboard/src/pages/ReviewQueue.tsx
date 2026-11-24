import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/db/db';
import { useWeekData } from '@/data/useWeekData';
import { SCREENS } from '@/screens';
import { REVIEW_THRESHOLD } from '@/tagging/engine';
import { saveManualTag, markReviewed } from '@/tagging/manual';
import { addKeyword } from '@/tagging/taxonomyStore';
import { runRuleTagging } from '@/tagging/run';
import { storeLabel } from '@/domain/geo';
import { monthDay } from '@/lib/dates';
import type { ThemeTag } from '@/domain/types';
import { PageGate } from '@/components/ui/PageGate';
import { Button, Card, PageHeader, Segmented, cx } from '@/components/ui/primitives';
import { RedactedText } from '@/components/data/RedactedText';
import { SourceBadge } from '@/components/voc/TagEditor';

type Kind = 'low-confidence' | 'redaction';
interface Item { key: string; kind: Kind; recordId: string; channel: 'survey' | 'followup' }

export function ReviewQueue() {
  const sc = SCREENS.find((x) => x.path === '/review')!;
  const { data, loading, error } = useWeekData();
  const [scope, setScope] = useState<'week' | 'all'>('week');
  const [items, setItems] = useState<Item[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [phrase, setPhrase] = useState<{ theme: string; text: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editText, setEditText] = useState<string | null>(null);

  // Snapshot the queue when the scope or week changes, so items don't jump while you work.
  const fw = data?.week.fw;
  const build = useCallback((): Item[] => {
    if (!data) return [];
    const { ds } = data;
    const inScope = (w: number) => scope === 'all' || w === fw;
    const out: Item[] = [];
    for (const t of ds.tagList) {
      if (!inScope(t.fw) || t.reviewed || t.source === 'Manual' || t.confidence >= REVIEW_THRESHOLD) continue;
      out.push({ key: `lc:${t.recordId}`, kind: 'low-confidence', recordId: t.recordId, channel: t.channel });
    }
    for (const s of ds.surveys) if (s.redactionUncertain && inScope(s.fw)) out.push({ key: `rd:${s.id}`, kind: 'redaction', recordId: s.id, channel: 'survey' });
    for (const f of ds.followups) if (f.redactionUncertain && inScope(f.fw)) out.push({ key: `rd:${f.id}`, kind: 'redaction', recordId: f.id, channel: 'followup' });
    return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'redaction' ? -1 : 1));
  }, [data, scope, fw]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (data) { setItems(build()); setIdx(0); setDone(new Set()); } }, [scope, fw, !!data]);

  const item = items?.[idx];
  const rec = useMemo(() => {
    if (!data || !item) return null;
    const { ds } = data;
    if (item.channel === 'survey') { const s = ds.surveys.find((x) => x.id === item.recordId); return s && { text: s.comment, field: 'comment' as const, fw: s.fw, meta: `Survey · FW${s.fw} · ${monthDay(s.date)} · ${storeLabel(s.storeNo, ds.stores)} · score ${s.ltr ?? '—'}` }; }
    const f = ds.followups.find((x) => x.id === item.recordId); return f && { text: f.insights, field: 'insights' as const, fw: f.fw, meta: `SM follow-up · FW${f.fw} · ${monthDay(f.date)} · store ${f.storeNo}` };
  }, [data, item]);
  const tag: ThemeTag | undefined = item ? data?.ds.tags.get(item.recordId) : undefined;
  const tax = useMemo(() => data?.ds.taxonomy ?? [], [data]);

  const next = useCallback((markDone: boolean) => {
    if (!item || !items) return;
    if (markDone) setDone((d) => new Set(d).add(item.key));
    setPhrase(null); setEditText(null);
    setIdx((i) => Math.min(i + 1, items.length));
  }, [item, items]);

  const choose = useCallback(async (themeId: string) => {
    if (!item || !rec || item.kind !== 'low-confidence' || item.channel === 'followup') return;
    const changed = tag?.primary !== themeId;
    try { await saveManualTag(item.recordId, item.channel, rec.fw, { primary: themeId }, tag); } catch (e) { setMsg((e as Error).message); setTimeout(() => setMsg(null), 4000); return; }
    const sel = window.getSelection()?.toString().trim() ?? '';
    if (changed && themeId !== 'other') { setPhrase({ theme: themeId, text: sel }); setDone((d) => new Set(d).add(item.key)); }
    else next(true);
  }, [item, rec, tag, next]);

  const accept = useCallback(async () => {
    if (!item) return;
    if (item.kind === 'low-confidence' && tag) { try { await markReviewed(tag); } catch (e) { setMsg((e as Error).message); setTimeout(() => setMsg(null), 4000); return; } }
    if (item.kind === 'redaction') {
      const table = item.channel === 'survey' ? db.surveys : db.followups;
      await (table as typeof db.surveys).update(item.recordId, { redactionUncertain: false });
    }
    next(true);
  }, [item, tag, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (item?.kind === 'low-confidence' && /^[1-9]$/.test(e.key)) { const th = tax[Number(e.key) - 1]; if (th) { e.preventDefault(); void choose(th.id); } }
      else if (e.key === 'Enter') { e.preventDefault(); void accept(); }
      else if (e.key.toLowerCase() === 's') { e.preventDefault(); next(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, tax, choose, accept, next]);

  const total = items?.length ?? 0;
  const reviewed = done.size;

  return (
    <>
      <PageHeader title={sc.title} subtitle={sc.subtitle} actions={<Segmented label="Scope" value={scope} onChange={setScope} options={[{ value: 'week', label: `FW${fw ?? ''}` }, { value: 'all', label: 'All weeks' }]} />} />
      <PageGate screen={sc} loading={loading || !items} error={error} empty={false}>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={reviewed} aria-valuemax={total} aria-label="Review progress">
              <div className="motion h-full bg-calls" style={{ width: total ? `${(100 * reviewed) / total}%` : '0%' }} />
            </div>
            <span className="text-sm tnum">{reviewed} of {total} reviewed</span>
          </div>
          {total === 0 ? (
            <Card><p className="text-sm text-muted">Nothing to review {scope === 'week' ? `for FW${fw}` : ''}: every tag is confident or already reviewed, and no redaction is uncertain.</p></Card>
          ) : !item ? (
            <Card><p className="text-sm">Done for now. {reviewed} reviewed, {total - reviewed} skipped. <Button variant="ghost" onClick={() => { setItems(build()); setIdx(0); setDone(new Set()); }}>Reload queue</Button></p></Card>
          ) : (
            <Card title={<span className="flex items-center gap-2">Item {idx + 1} of {total}
              <span className={cx('rounded-full px-2 py-px text-[11px] font-medium', item.kind === 'redaction' ? 'bg-surveys-soft text-surveys' : 'bg-watch text-watch-ink')}>{item.kind === 'redaction' ? 'Redaction uncertain' : 'Low-confidence tag'}</span></span>}
              actions={<span className="text-xs text-muted">Keys: {item.kind === 'low-confidence' ? '1–9 pick theme · ' : ''}Enter accept · S skip</span>}>
              {rec ? (
                <div className="space-y-3">
                  <div className="text-xs text-muted">{rec.meta}</div>
                  <div className="rounded-lg bg-surface-2 p-3 text-[15px] leading-relaxed">
                    {editText !== null ? (
                      <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={5} className="w-full rounded border border-border bg-surface p-2 text-sm" aria-label="Edit redacted text" />
                    ) : <RedactedText recordId={item.recordId} field={rec.field} text={rec.text} />}
                  </div>
                  {item.kind === 'low-confidence' ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-muted">Current:</span>
                        <span className="font-medium">{tag ? tax.find((t) => t.id === tag.primary)?.name : 'Untagged'}</span>
                        {tag?.secondary.length ? <span className="text-muted">+ {tag.secondary.map((s) => tax.find((t) => t.id === s)?.name).join(', ')}</span> : null}
                        <span className="text-muted">· {tag?.sentiment}</span>
                        <SourceBadge tag={tag} />
                        {tag?.rationale && <span className="text-xs text-muted">({tag.rationale})</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {tax.slice(0, 9).map((t, i) => (
                          <Button key={t.id} variant={tag?.primary === t.id ? 'primary' : 'secondary'} className="justify-start" onClick={() => void choose(t.id)}>
                            <kbd className="rounded border border-current px-1 text-[11px]">{i + 1}</kbd> {t.name}
                          </Button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="primary" onClick={() => void accept()}>Accept current (Enter)</Button>
                        <Button variant="ghost" onClick={() => next(false)}>Skip (S)</Button>
                      </div>
                      {phrase && (
                        <form className="rounded-lg border border-calls bg-calls-soft p-3" onSubmit={async (e) => {
                          e.preventDefault();
                          const ok = await addKeyword(phrase.theme, phrase.text);
                          setMsg(ok ? `Added “${phrase.text}” to ${tax.find((t) => t.id === phrase.theme)?.name}. Re-run tagging to apply it to other records.` : 'That phrase is already a rule (or empty).');
                          setTimeout(() => setMsg(null), 5000);
                          next(true);
                        }}>
                          <p className="text-sm">Saved as <strong>{tax.find((t) => t.id === phrase.theme)?.name}</strong> (Manual). Add the phrase that decided it to the rules dictionary?</p>
                          <div className="mt-2 flex gap-2">
                            <input autoFocus value={phrase.text} onChange={(e) => setPhrase({ ...phrase, text: e.target.value })} placeholder="e.g. hot water heater flush" aria-label="Phrase to add"
                              className="h-8 flex-1 rounded-lg border border-border bg-surface px-2 text-sm" />
                            <Button type="submit" variant="primary" disabled={!phrase.text.trim()}>Add rule</Button>
                            <Button variant="ghost" onClick={() => next(true)}>No thanks</Button>
                          </div>
                          <p className="mt-1 text-xs text-muted">Tip: select words in the text before choosing a theme to pre-fill this box.</p>
                        </form>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="primary" onClick={() => void accept()}>Looks fine (Enter)</Button>
                      {editText === null ? <Button onClick={() => setEditText(rec.text)}>Edit redaction</Button> : (
                        <Button onClick={async () => {
                          const table = item.channel === 'survey' ? db.surveys : db.followups;
                          await (table as typeof db.surveys).update(item.recordId, { [rec.field]: editText, redactionUncertain: false } as never);
                          if (item.channel !== 'followup') await runRuleTagging({ fws: [rec.fw] });
                          setEditText(null); next(true);
                        }}>Save edited text</Button>
                      )}
                      <Button variant="ghost" onClick={() => next(false)}>Skip (S)</Button>
                      <p className="w-full text-xs text-muted">Something that looks like a name, number or email may remain. Edit the redacted text to replace it with [name], [phone] etc. The original stays only in this browser.</p>
                    </div>
                  )}
                </div>
              ) : <p className="text-sm text-muted">This record no longer exists. <Button variant="ghost" onClick={() => next(false)}>Next</Button></p>}
            </Card>
          )}
          {msg && <p role="status" className="rounded-lg bg-grow-soft px-3 py-2 text-sm text-grow">{msg}</p>}
          <p className="text-xs text-muted">Conflicts between AI and rule tags will appear here once the AI layer (phase 5) is on.</p>
        </div>
      </PageGate>
    </>
  );
}

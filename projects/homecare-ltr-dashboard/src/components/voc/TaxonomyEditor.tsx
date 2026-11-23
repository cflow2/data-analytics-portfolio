import { useEffect, useMemo, useState } from 'react';
import type { ThemeDef } from '@/domain/taxonomy';
import type { Status } from '@/domain/types';
import { getTaxonomy, resetTaxonomy, saveTaxonomy } from '@/tagging/taxonomyStore';
import { compileKeyword, tagRecord } from '@/tagging/engine';
import { runRuleTagging } from '@/tagging/run';
import { Button, StatusPill } from '@/components/ui/primitives';

const STATUSES: Status[] = ['ACT', 'WATCH', 'GROW', 'STABLE'];

export function TaxonomyEditor() {
  const [tax, setTax] = useState<ThemeDef[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [test, setTest] = useState('The tech was great but he could not flush our tankless water heater, so I want to cancel.');
  useEffect(() => { void getTaxonomy().then((t) => setTax(structuredClone(t))); }, []);
  const result = useMemo(() => (tax ? tagRecord({ id: 't', channel: 'survey', fw: 1, text: test }, tax) : null), [tax, test]);
  if (!tax) return null;
  const upd = (id: string, patch: Partial<ThemeDef>) => setTax(tax.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const bad = tax.flatMap((t) => t.keywords.filter((k) => !compileKeyword(k)).map((k) => `${t.name}: ${k}`));

  return (
    <div>
      <p className="mb-2 text-xs text-muted">Keywords: one per line. Phrases match as written; <code>word*</code> matches any ending; <code>/regex/</code> for patterns. Single words also match plurals. Themes are never inferred from the score, Medallia topic tags, or blank comments. Manual tags are never overwritten.</p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {tax.map((t) => (
          <li key={t.id} className="p-2">
            <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
              <span className="font-medium">{t.name}</span><StatusPill status={t.defaultStatus} />
              <span className="text-xs text-muted">{t.keywords.length} keyword rules{t.subTags.length ? ` · sub-tags: ${t.subTags.join(', ')}` : ''}</span>
            </button>
            {open === t.id && (
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <label className="flex flex-col gap-0.5"><span className="text-xs text-muted">Name</span>
                  <input value={t.name} onChange={(e) => upd(t.id, { name: e.target.value })} className="h-8 rounded border border-border bg-surface px-2" /></label>
                <label className="flex flex-col gap-0.5"><span className="text-xs text-muted">Default status</span>
                  <select value={t.defaultStatus} onChange={(e) => upd(t.id, { defaultStatus: e.target.value as Status })} className="h-8 rounded border border-border bg-surface px-2">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
                <label className="col-span-2 flex flex-col gap-0.5"><span className="text-xs text-muted">Definition (also sent to the AI tagger)</span>
                  <textarea value={t.definition} onChange={(e) => upd(t.id, { definition: e.target.value })} rows={2} className="rounded border border-border bg-surface p-2" /></label>
                <label className="col-span-2 flex flex-col gap-0.5"><span className="text-xs text-muted">Keyword rules</span>
                  <textarea value={t.keywords.join('\n')} onChange={(e) => upd(t.id, { keywords: e.target.value.split('\n').map((x) => x.trimEnd()).filter((x, i, a) => x || i < a.length - 1) })} rows={8} className="rounded border border-border bg-surface p-2 font-mono text-xs" disabled={t.id === 'other'} /></label>
              </div>
            )}
          </li>
        ))}
      </ul>
      {bad.length > 0 && <p className="mt-2 text-xs text-surveys">Invalid rules: {bad.join('; ')}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="primary" disabled={bad.length > 0} onClick={async () => {
          await saveTaxonomy(tax.map((t) => ({ ...t, keywords: t.keywords.filter(Boolean) })));
          const r = await runRuleTagging();
          setMsg(`Saved. Re-tagged ${r.tagged.toLocaleString()} records with the rules (${r.kept} manual/AI tags kept).`);
        }}>Save and re-tag</Button>
        <Button variant="ghost" onClick={async () => { await resetTaxonomy(); setTax(structuredClone(await getTaxonomy())); setMsg('Reset to the default taxonomy (not yet re-tagged).'); }}>Reset to defaults</Button>
        {msg && <span role="status" className="self-center text-xs text-grow">{msg}</span>}
      </div>
      <label className="mt-4 block text-sm"><span className="text-[11px] font-medium uppercase tracking-wide text-muted">Test a comment</span>
        <textarea value={test} onChange={(e) => setTest(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-border bg-surface p-2 text-sm" /></label>
      {result ? (
        <p className="mt-1 text-xs">Primary <strong>{tax.find((t) => t.id === result.primary)?.name}</strong>
          {result.secondary.length > 0 && <> · secondary {result.secondary.map((s) => tax.find((t) => t.id === s)?.name).join(', ')}</>}
          {' '}· {result.sentiment}{result.subTag ? ` · ${result.subTag}` : ''} · confidence {Math.round(result.confidence * 100)}%
          <span className="text-muted"> · {result.rationale}</span></p>
      ) : <p className="mt-1 text-xs text-muted">Blank text is never tagged.</p>}
    </div>
  );
}

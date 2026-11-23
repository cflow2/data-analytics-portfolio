import { useEffect, useMemo, useRef, useState } from 'react';
import { SPECS, SPEC_BY_KIND, type Candidate, type ColumnMapping } from '@/ingest/specs';
import { normalizeHeader } from '@/ingest/normalize';
import { Button } from '@/components/ui/primitives';
import type { StagedFile } from '@/state/imports';

/** Column-mapping dialog: shown when a required column isn't found. The mapping is remembered for future uploads. */
export function MappingDialog({ file, onClose, onApply }: {
  file: StagedFile;
  onClose: () => void;
  onApply: (force: { kind: Candidate['kind']; sheet: string; headerIndex: number; mapping: ColumnMapping }, remember: boolean) => void;
}) {
  const p = file.parsed!;
  const cand = p.candidate;
  const [kind, setKind] = useState<Candidate['kind']>(cand?.kind ?? 'loyalty-cases');
  const [sheet, setSheet] = useState(cand?.sheet ?? p.sheets[0]);
  const [headerRow, setHeaderRow] = useState((cand?.headerIndex ?? 0) + 1);
  const [remember, setRemember] = useState(true);
  const headers = p.headers;
  const initial = useMemo(() => {
    const m: Record<string, string> = {};
    if (cand && cand.kind === kind) for (const [k, i] of Object.entries(cand.map)) m[k] = normalizeHeader(headers[i]);
    return m;
  }, [cand, kind, headers]);
  const [mapping, setMapping] = useState<Record<string, string>>(initial);
  useEffect(() => setMapping(initial), [initial]);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);

  const spec = SPEC_BY_KIND[kind];
  const sameShape = sheet === cand?.sheet && headerRow - 1 === cand?.headerIndex;
  const missing = spec.fields.filter((f) => f.required && !mapping[f.key]);
  const opts = headers.map((h, i) => ({ i, h, n: normalizeHeader(h) })).filter((x) => x.n);

  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[720px] max-w-[95vw] rounded-[12px] border border-border bg-surface p-0 text-ink backdrop:bg-black/40" aria-labelledby="map-title">
      <form method="dialog" onSubmit={(e) => {
        e.preventDefault();
        const chosen = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v));
        onApply({ kind, sheet, headerIndex: headerRow - 1, mapping: chosen }, remember);
      }}>
        <header className="border-b border-border px-5 py-3">
          <h2 id="map-title" className="font-display text-lg font-semibold">Map columns · {file.name}</h2>
          <p className="text-sm text-muted">Tell me which column holds each field. Required fields are marked *. I’ll remember this for the next upload.</p>
        </header>
        <div className="grid grid-cols-3 gap-3 border-b border-border px-5 py-3 text-sm">
          <label className="flex flex-col gap-0.5"><span className="text-xs text-muted">File type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as Candidate['kind'])} className="h-8 rounded-lg border border-border bg-surface px-2">
              {SPECS.map((s) => <option key={s.kind} value={s.kind}>{s.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5"><span className="text-xs text-muted">Sheet</span>
            <select value={sheet} onChange={(e) => setSheet(e.target.value)} className="h-8 rounded-lg border border-border bg-surface px-2">
              {p.sheets.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5"><span className="text-xs text-muted">Header row</span>
            <input type="number" min={1} max={50} value={headerRow} onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value)))} className="h-8 rounded-lg border border-border bg-surface px-2" />
          </label>
          {!sameShape && <p className="col-span-3 text-xs text-surveys">Sheet or header row changed. Click “Re-read” to load that row’s headers, then map.</p>}
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-5 py-3">
          {sameShape ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="pb-1 font-medium">Field</th><th className="pb-1 font-medium">Column in this file</th></tr></thead>
              <tbody>
                {spec.fields.map((f) => (
                  <tr key={f.key} className="border-t border-border">
                    <td className="py-1.5 pr-3">{f.label}{f.required && <span className="text-surveys"> *</span>}</td>
                    <td className="py-1.5">
                      <select
                        aria-label={`Column for ${f.label}`}
                        value={mapping[f.key] ?? ''}
                        onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                        className="h-8 w-full rounded-lg border border-border bg-surface px-2"
                      >
                        <option value="">— not in this file —</option>
                        {opts.map((o) => <option key={o.i} value={o.n}>{o.h.length > 90 ? o.h.slice(0, 90) + '…' : o.h}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-muted">Headers will load after re-reading.</p>}
        </div>
        <footer className="flex items-center justify-between border-t border-border px-5 py-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember this mapping</label>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { ref.current?.close(); }}>Cancel</Button>
            {sameShape
              ? <Button type="submit" variant="primary" disabled={missing.length > 0}>{missing.length ? `Map ${missing.length} required field(s)` : 'Apply mapping'}</Button>
              : <Button type="submit" variant="primary">Re-read</Button>}
          </div>
        </footer>
      </form>
    </dialog>
  );
}

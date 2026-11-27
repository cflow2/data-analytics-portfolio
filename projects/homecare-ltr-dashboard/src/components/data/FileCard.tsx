import { useState } from 'react';
import { SPEC_BY_KIND } from '@/ingest/specs';
import { rangeLabel } from '@/lib/dates';
import { weekInfo } from '@/lib/fiscal';
import { useSettings } from '@/state/settings';
import { useImports, type StagedFile } from '@/state/imports';
import { Button, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { ValidationReportView } from './ValidationReportView';
import { MappingDialog } from './MappingDialog';

const STATUS: Record<StagedFile['status'], { label: string; cls: string }> = {
  parsing: { label: 'Reading…', cls: 'bg-stable text-muted' },
  'needs-mapping': { label: 'Needs column mapping', cls: 'bg-watch text-watch-ink' },
  ready: { label: 'Ready to import', cls: 'bg-calls-soft text-calls' },
  importing: { label: 'Importing…', cls: 'bg-stable text-muted' },
  imported: { label: 'Imported', cls: 'bg-grow-soft text-grow' },
  error: { label: 'Error', cls: 'bg-surveys-soft text-surveys' },
};

export function FileCard({ file }: { file: StagedFile }) {
  const { importOne, remove, reparse, setTopicMeta } = useImports();
  const fyStart = useSettings((x) => x.fyStart);
  const [open, setOpen] = useState(false);
  const [mapping, setMapping] = useState(false);
  const p = file.parsed;
  const c = p?.candidate;
  const r = file.report ?? p?.build?.report;
  const weeks = r ? Object.keys(r.weeks).map(Number).sort((a, b) => a - b) : [];
  const st = STATUS[file.status];
  const topics = c?.kind === 'medallia-topics';
  const needsDivision = topics && file.status === 'ready' && !file.topicMeta?.division;

  return (
    <article className="rounded-[12px] border border-border bg-surface p-3" aria-label={file.name}>
      <div className="flex items-start gap-3">
        <Icon name={file.name.endsWith('.csv') ? 'database' : 'slide'} size={20} className="mt-0.5 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold" title={file.name}>{file.name}</h3>
            <span className={cx('shrink-0 rounded-full px-2 py-px text-[11px] font-medium', st.cls)}>{st.label}</span>
          </div>
          <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted tnum">
            <div><dt className="inline">Type: </dt><dd className="inline text-ink">{c ? SPEC_BY_KIND[c.kind].label : '—'}</dd></div>
            {c && <div><dt className="inline">Sheet: </dt><dd className="inline text-ink">{c.sheet}</dd></div>}
            {c && <div><dt className="inline">Header row: </dt><dd className="inline text-ink">{c.headerIndex + 1}</dd></div>}
            {r && <div><dt className="inline">Rows: </dt><dd className="inline text-ink">{r.rowsRead.toLocaleString()} read · {r.rowsKept.toLocaleString()} kept</dd></div>}
            {r?.dateRange && <div><dt className="inline">Dates: </dt><dd className="inline text-ink">{rangeLabel(r.dateRange[0], r.dateRange[1])}</dd></div>}
            {weeks.length > 0 && <div><dt className="inline">Weeks: </dt><dd className="inline text-ink">{weeks.length > 4 ? `FW${weeks[0]}–FW${weeks[weeks.length - 1]}` : weeks.map((w) => `FW${w}`).join(', ')}</dd></div>}
            {p && <div><dt className="inline">Parsed in </dt><dd className="inline text-ink">{Math.round(p.ms)} ms</dd></div>}
          </dl>
          {c && c.missing.length > 0 && (
            <p className="mt-1 text-xs text-surveys">Missing required column(s): {c.missing.map((k) => SPEC_BY_KIND[c.kind].fields.find((f) => f.key === k)?.label).join(', ')}</p>
          )}
          {topics && file.status !== 'imported' && (
            <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 px-2 py-1.5">
              <label className="flex flex-col gap-0.5 text-xs">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Division</span>
                <select value={file.topicMeta?.division ?? ''} onChange={(e) => setTopicMeta(file.key, { division: e.target.value || undefined })} aria-label="Division this export covers"
                  className={cx('h-8 rounded-lg border bg-surface px-2 text-sm', needsDivision ? 'border-surveys' : 'border-border')}>
                  <option value="">Choose…</option>
                  <option value="NORTH">North</option><option value="SOUTH">South</option><option value="WEST">West</option><option value="ALL">All divisions</option>
                </select>
              </label>
              <label className="flex flex-col gap-0.5 text-xs">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Fiscal week</span>
                <select value={file.topicMeta?.fw ?? ''} onChange={(e) => setTopicMeta(file.key, { fw: Number(e.target.value) })} aria-label="Fiscal week this export covers" className="h-8 rounded-lg border border-border bg-surface px-2 text-sm">
                  <option value={0}>Whole export range (year to date)</option>
                  {Array.from({ length: 52 }, (_, i) => 52 - i).map((w) => <option key={w} value={w}>{weekInfo(w, fyStart).label.split(' · WBR')[0]}</option>)}
                </select>
              </label>
              <p className="pb-1 text-xs text-muted">Medallia doesn’t write the division or dates into this export. {file.topicMeta?.division ? 'Check both before importing.' : 'Pick the division to import.'} Name files like “Topics FW43 WEST.xlsx” and they fill in automatically.</p>
            </div>
          )}
          {file.error && <p role="alert" className="mt-1 text-xs text-surveys">{file.error}</p>}
          {file.previouslyImported && file.status === 'ready' && (
            <p className="mt-1 text-xs text-muted">This exact file was imported on {new Date(file.previouslyImported).toLocaleDateString()}. Importing again updates records; it won’t duplicate them.</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {file.status === 'ready' && <Button variant="primary" disabled={needsDivision} title={needsDivision ? 'Choose the division first' : undefined} onClick={() => importOne(file.key)}>Import</Button>}
          {(file.status === 'needs-mapping' || file.status === 'ready' || (file.status === 'error' && p?.sheets.length)) && p && (
            <Button variant={file.status === 'needs-mapping' ? 'primary' : 'ghost'} onClick={() => setMapping(true)}>Map columns</Button>
          )}
          {r && <Button variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide report' : 'Report'}</Button>}
          {file.status !== 'importing' && file.status !== 'parsing' && (
            <Button variant="ghost" onClick={() => remove(file.key)} aria-label={`Remove ${file.name} from the list`}><Icon name="x" size={14} /></Button>
          )}
        </div>
      </div>
      {open && r && (
        <div className="mt-2 rounded-lg bg-surface-2 px-3 py-1">
          <ValidationReportView report={r} />
          {file.status !== 'imported' && <p className="pb-1 text-xs text-muted">Preview before import. Duplicate and locked-week checks run on import.</p>}
        </div>
      )}
      {mapping && p && (
        <MappingDialog
          file={file}
          onClose={() => setMapping(false)}
          onApply={(force, remember) => {
            setMapping(false);
            const sameShape = force.sheet === c?.sheet && force.headerIndex === c?.headerIndex;
            void reparse(file.key, force, remember && sameShape ? { kind: force.kind, mapping: force.mapping } : undefined).then(() => {
              if (!sameShape) setMapping(true);
            });
          }}
        />
      )}
    </article>
  );
}

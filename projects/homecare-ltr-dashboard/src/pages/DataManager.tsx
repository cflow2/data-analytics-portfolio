import { useRef, useState, type DragEvent } from 'react';
import { db } from '@/db/db';
import { dataCounts } from '@/db/queries';
import { exportBackup, importBackup, clearAllData } from '@/db/backup';
import { loadDemoData, removeDemoData } from '@/demo/load';
import { useLive } from '@/hooks/useLive';
import { useSelectedWeek } from '@/hooks/useWeek';
import { ltrSummary } from '@/lib/ltr';
import { weekInfo } from '@/lib/fiscal';
import { countsForLtr } from '@/domain/survey';
import { SPEC_BY_KIND } from '@/ingest/specs';
import { deleteWeek, setWeekLocked } from '@/ingest/commit';
import { runRuleTagging } from '@/tagging/run';
import type { ValidationReport } from '@/ingest/types';
import { useSettings } from '@/state/settings';
import { useImports } from '@/state/imports';
import { SCREENS } from '@/screens';
import { Button, Card, PageHeader, PctN, Skeleton, DemoBanner, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { FileCard } from '@/components/data/FileCard';
import { ValidationReportView } from '@/components/data/ValidationReportView';

function download(name: string, data: BlobPart, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ACCEPT = '.xlsx,.xlsm,.xls,.csv';

function DropZone({ selectedWeek }: { selectedWeek: number }) {
  const addFiles = useImports((s) => s.addFiles);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const take = (list: FileList | null) => {
    const files = [...(list ?? [])].filter((f) => /\.(xlsx|xlsm|xls|csv)$/i.test(f.name));
    if (files.length) void addFiles(files, selectedWeek);
  };
  return (
    <div
      onDragOver={(e: DragEvent) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      className={cx('motion flex flex-col items-center justify-center rounded-[12px] border-2 border-dashed px-6 py-8 text-center', over ? 'border-calls bg-calls-soft' : 'border-border bg-surface')}
    >
      <Icon name="upload" size={26} className="mb-2 text-muted" />
      <p className="text-sm font-medium">Drop this week’s files here</p>
      <p className="mt-1 max-w-xl text-xs text-muted">LTR Tracker · Medallia Responses export · Analytics driver report · Customer Commentary · Loyalty Case files (many at once) · Detractor follow-up file · Store→District CSV. Each file is detected from its sheets and headers and read off the main thread.</p>
      <Button className="mt-3" icon="upload" onClick={() => input.current?.click()}>Choose files…</Button>
      <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" aria-label="Choose files to upload" onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

function WeekRow({ w, fyStart }: { w: { fw: number; ltr: ReturnType<typeof ltrSummary>; calls: number; assoc: number; followups: number; locked: boolean }; fyStart: string }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <tr className="border-t border-border">
      <td className="py-1.5">{weekInfo(w.fw, fyStart).label}</td>
      <td>{w.ltr.n ? <PctN pct={w.ltr.pct} n={w.ltr.n} /> : <span className="text-muted">—</span>}</td>
      <td className="tnum">{w.ltr.n ? `${w.ltr.detractors} (${w.ltr.detractors0to6} at 0–6)` : '—'}</td>
      <td className="tnum">{w.calls ? `${w.calls} (+${w.assoc} assoc.)` : '—'}</td>
      <td className="tnum">{w.followups || '—'}</td>
      <td>
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" onClick={() => setWeekLocked(w.fw, !w.locked)} aria-label={`${w.locked ? 'Unlock' : 'Lock'} FW${w.fw}`} title={w.locked ? 'Locked: read-only. Click to unlock.' : 'Lock this week (read-only)'}>
            <Icon name="lock" size={14} /> <span className="text-xs">{w.locked ? 'Locked' : 'Lock'}</span>
          </Button>
          <Button variant="ghost" disabled={w.locked || busy} title="Re-apply the keyword rules to this week (Manual and AI tags are kept)"
            onClick={async () => { setBusy(true); const r = await runRuleTagging({ fws: [w.fw] }); setBusy(false); setMsg(`FW${w.fw}: ${r.tagged} tagged by rules, ${r.kept} manual/AI kept`); setTimeout(() => setMsg(null), 4000); }}>
            <span className="text-xs">{busy ? 'Tagging…' : msg ?? 'Re-run tagging'}</span>
          </Button>
          {!confirm ? (
            <Button variant="ghost" disabled={w.locked} onClick={() => setConfirm(true)} aria-label={`Delete FW${w.fw}`}><Icon name="trash" size={14} /></Button>
          ) : (
            <>
              <Button variant="danger" onClick={() => { void deleteWeek(w.fw); setConfirm(false); }}>Delete FW{w.fw}</Button>
              <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export function DataManager() {
  const s = SCREENS.find((x) => x.path === '/data')!;
  const fyStart = useSettings((x) => x.fyStart);
  const week = useSelectedWeek();
  const staged = useImports((x) => x.files);
  const importAll = useImports((x) => x.importAll);
  const clearFinished = useImports((x) => x.clearFinished);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [showClear, setShowClear] = useState(false);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const counts = useLive(dataCounts, []);
  const files = useLive(() => db.files.orderBy('importedAt').reverse().toArray(), []);
  const unmapped = useLive(() => db.stores.filter((x) => !x.district).toArray(), []);
  const weeks = useLive(async () => {
    const [surveys, calls, fus, metas] = await Promise.all([db.surveys.toArray(), db.calls.toArray(), db.followups.toArray(), db.weeks.toArray()]);
    const fws = [...new Set([...surveys.map((x) => x.fw), ...calls.map((x) => x.fw)])].sort((a, b) => b - a);
    return fws.map((fw) => {
      const wc = calls.filter((x) => x.fw === fw);
      const cust = wc.filter((c) => !c.isAssociate).length;
      return {
        fw, ltr: ltrSummary(surveys.filter((x) => x.fw === fw && countsForLtr(x)).map((x) => x.ltr)),
        calls: cust, assoc: wc.length - cust, followups: fus.filter((f) => f.fw === fw).length,
        locked: !!metas.find((m) => m.fw === fw)?.locked,
      };
    });
  }, []);

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label); setMsg(null);
    try { setMsg(await fn()); } catch (e) { setMsg(`Error: ${(e as Error).message}`); } finally { setBusy(null); }
  };
  const readyCount = staged.filter((f) => f.status === 'ready').length;

  return (
    <>
      <PageHeader title={s.title} subtitle={s.subtitle} />

      <DropZone selectedWeek={week.fw} />

      {staged.length > 0 && (
        <section className="mt-3" aria-label="Files in this upload">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">This upload · {staged.length} file{staged.length === 1 ? '' : 's'}</h2>
            <div className="flex gap-2">
              {staged.some((f) => f.status === 'imported') && <Button variant="ghost" onClick={clearFinished}>Clear imported</Button>}
              <Button variant="primary" disabled={!readyCount} onClick={() => importAll()}>Import all ready ({readyCount})</Button>
            </div>
          </div>
          <div className="space-y-2">{staged.map((f) => <FileCard key={f.key} file={f} selectedWeek={week.fw} />)}</div>
        </section>
      )}

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Card title="What’s loaded" className="col-span-2">
          {counts.loading ? <Skeleton className="h-16" /> : counts.data && (
            <dl className="grid grid-cols-6 gap-3 text-sm">
              {([['Surveys', counts.data.surveys], ['Calls', counts.data.calls], ['Follow-ups', counts.data.followups], ['Stores', counts.data.stores], ['Unmapped stores', counts.data.unmapped], ['Files', counts.data.files]] as const).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className={cx('font-display text-2xl font-semibold tnum', k === 'Unmapped stores' && v > 0 && 'text-surveys')}>{v.toLocaleString()}</dd></div>
              ))}
            </dl>
          )}
          {!!unmapped.data?.length && (
            <p className="mt-3 text-xs text-muted">
              <strong className="text-surveys">{unmapped.data.length} unmapped store{unmapped.data.length === 1 ? '' : 's'}</strong> (shown as “Unmapped” in district views): {unmapped.data.slice(0, 20).map((x) => x.storeNo).join(', ')}{unmapped.data.length > 20 ? '…' : ''}. Upload a Store→District CSV (<code>Store #, Store Name, City, State, District, Region</code>).
            </p>
          )}
        </Card>
        <Card title="Demo data" actions={<DemoBanner />}>
          <p className="mb-3 text-sm text-muted">Synthetic, labeled data that reproduces the FW38–FW40 baselines. No real names.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!!busy} onClick={() => run('demo', async () => { const r = await loadDemoData(); return `Loaded ${r.surveys.toLocaleString()} demo surveys and ${r.calls.toLocaleString()} demo calls.`; })}>
              {busy === 'demo' ? 'Loading…' : 'Load demo data'}
            </Button>
            <Button disabled={!!busy} onClick={() => run('rmdemo', async () => { await removeDemoData(); return 'Demo data removed. Real uploads were not touched.'; })}>Remove demo</Button>
            <Button variant="ghost" icon="download" disabled={!!busy} onClick={() => run('files', async () => {
              const { demoFiles } = await import('@/demo/files');
              const fs = demoFiles();
              for (const f of fs) { download(f.name, f.data, f.name.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); await new Promise((r) => setTimeout(r, 250)); }
              return `Downloaded ${fs.length} demo source files. Drop them above to try the uploader.`;
            })}>Demo source files</Button>
          </div>
        </Card>
      </div>
      {msg && <p role="status" className="mt-3 rounded-lg bg-calls-soft px-3 py-2 text-sm text-calls">{msg}</p>}

      <Card title="Weeks" className="mt-3">
        {weeks.loading ? <Skeleton className="h-32" /> : !weeks.data?.length ? <p className="text-sm text-muted">No weeks loaded yet. Drop files above or load the demo data.</p> : (
          <div className="max-h-[380px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                <tr><th className="py-1.5 font-medium">Week</th><th className="font-medium">LTR</th><th className="font-medium">Detractors (0–8)</th><th className="font-medium">Customer calls</th><th className="font-medium">Follow-ups</th><th className="text-right font-medium">Actions</th></tr>
              </thead>
              <tbody>{weeks.data.map((w) => <WeekRow key={w.fw} w={w} fyStart={fyStart} />)}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Import history" className="mt-3">
        {!files.data?.length ? <p className="text-sm text-muted">Nothing imported yet.</p> : (
          <ul className="divide-y divide-border">
            {files.data.map((f) => (
              <li key={f.id} className="py-2">
                <div className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium" title={f.name}>{f.name}</span>
                  <span className="text-xs text-muted">{f.kind === 'demo' ? 'Demo' : SPEC_BY_KIND[f.kind].label}</span>
                  <span className="text-xs text-muted tnum">{f.kept.toLocaleString()} of {f.rows.toLocaleString()} rows</span>
                  <span className="text-xs text-muted tnum">{f.weeks.length ? (f.weeks.length > 3 ? `FW${f.weeks[0]}–FW${f.weeks[f.weeks.length - 1]}` : f.weeks.map((w) => `FW${w}`).join(', ')) : ''}</span>
                  <span className="text-xs text-muted">{new Date(f.importedAt).toLocaleString()}</span>
                  {!!f.report && <Button variant="ghost" onClick={() => setOpenHistory(openHistory === f.id ? null : f.id)} aria-expanded={openHistory === f.id}>Report</Button>}
                </div>
                {openHistory === f.id && !!f.report && <div className="mt-1 rounded-lg bg-surface-2 px-3 py-1"><ValidationReportView report={f.report as ValidationReport} /></div>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Card title="Backup">
          <p className="mb-3 text-sm text-muted">Everything lives in this browser’s IndexedDB. Export a JSON backup to keep a copy, or restore one. Backups include original (unredacted) text, so store them on your work laptop only.</p>
          <div className="flex gap-2">
            <Button icon="download" disabled={!!busy} onClick={() => run('export', async () => {
              download(`homecare-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportBackup()));
              return 'Backup downloaded.';
            })}>Export backup</Button>
            <Button icon="upload" disabled={!!busy} onClick={() => backupInput.current?.click()}>Import backup</Button>
            <input ref={backupInput} type="file" accept="application/json,.json" className="hidden" aria-label="Import backup file" onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void run('import', async () => `Restored ${(await importBackup(JSON.parse(await file.text()))).toLocaleString()} records.`);
            }} />
          </div>
        </Card>
        <Card title="Clear all data">
          {!showClear ? (
            <>
              <p className="mb-3 text-sm text-muted">Permanently deletes every upload, tag, note and setting stored in this browser.</p>
              <Button variant="danger" icon="trash" onClick={() => setShowClear(true)}>Clear all data…</Button>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (confirmText === 'DELETE') void run('clear', async () => { await clearAllData(); setShowClear(false); setConfirmText(''); return 'All data cleared.'; }); }}>
              <label className="block text-sm">Type <strong>DELETE</strong> to confirm
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus className="mt-1 h-8 w-full rounded-lg border border-border bg-surface px-2 text-sm" />
              </label>
              <div className="mt-2 flex gap-2">
                <Button type="submit" variant="danger" disabled={confirmText !== 'DELETE'}>Delete everything</Button>
                <Button variant="ghost" onClick={() => { setShowClear(false); setConfirmText(''); }}>Cancel</Button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}

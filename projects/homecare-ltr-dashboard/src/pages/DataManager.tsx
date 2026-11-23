import { useRef, useState } from 'react';
import { db } from '@/db/db';
import { dataCounts } from '@/db/queries';
import { exportBackup, importBackup, clearAllData } from '@/db/backup';
import { loadDemoData, removeDemoData } from '@/demo/load';
import { useLive } from '@/hooks/useLive';
import { ltrSummary } from '@/lib/ltr';
import { weekInfo } from '@/lib/fiscal';
import { useSettings } from '@/state/settings';
import { SCREENS } from '@/screens';
import { Button, Card, PageHeader, PctN, Skeleton, DemoBanner } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';

function download(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DataManager() {
  const s = SCREENS.find((x) => x.path === '/data')!;
  const fyStart = useSettings((x) => x.fyStart);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [showClear, setShowClear] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const counts = useLive(dataCounts, []);
  const files = useLive(() => db.files.orderBy('importedAt').reverse().toArray(), []);
  const weeks = useLive(async () => {
    const [surveys, calls, metas] = await Promise.all([db.surveys.toArray(), db.calls.toArray(), db.weeks.toArray()]);
    const fws = [...new Set([...surveys.map((x) => x.fw), ...calls.map((x) => x.fw)])].sort((a, b) => b - a);
    return fws.map((fw) => {
      const ws = surveys.filter((x) => x.fw === fw);
      const wc = calls.filter((x) => x.fw === fw);
      return { fw, ltr: ltrSummary(ws.map((x) => x.ltr)), calls: wc.filter((c) => !c.isAssociate).length, locked: !!metas.find((m) => m.fw === fw)?.locked };
    });
  }, []);

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label); setMsg(null);
    try { setMsg(await fn()); } catch (e) { setMsg(`Error: ${(e as Error).message}`); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader title={s.title} subtitle={s.subtitle} />
      <div className="grid grid-cols-3 gap-3">
        <Card title="Demo data" actions={<DemoBanner />}>
          <p className="mb-3 text-sm text-muted">Synthetic, clearly labeled data that reproduces the FW38–FW40 baselines (LTR 94.7% n=131, 340 calls, 41 cancellations…). No real names.</p>
          <div className="flex gap-2">
            <Button variant="primary" disabled={!!busy} onClick={() => run('demo', async () => { const r = await loadDemoData(); return `Loaded ${r.surveys.toLocaleString()} demo surveys and ${r.calls.toLocaleString()} demo calls.`; })}>
              {busy === 'demo' ? 'Loading…' : 'Load demo data'}
            </Button>
            <Button disabled={!!busy} onClick={() => run('rmdemo', async () => { await removeDemoData(); return 'Demo data removed. Real uploads were not touched.'; })}>Remove demo</Button>
          </div>
        </Card>
        <Card title="Backup">
          <p className="mb-3 text-sm text-muted">Everything lives in this browser’s IndexedDB. Export a JSON backup to keep a copy, or restore one.</p>
          <div className="flex gap-2">
            <Button icon="download" disabled={!!busy} onClick={() => run('export', async () => {
              const b = await exportBackup();
              download(`homecare-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b));
              return 'Backup downloaded.';
            })}>Export</Button>
            <Button icon="upload" disabled={!!busy} onClick={() => fileInput.current?.click()}>Import</Button>
            <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" aria-label="Import backup file" onChange={(e) => {
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
      {msg && <p role="status" className="mt-3 rounded-lg bg-calls-soft px-3 py-2 text-sm text-calls">{msg}</p>}

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Card title="Drop files here" className="col-span-1">
          <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            <Icon name="upload" size={24} className="mb-2" />
            File upload, auto-detection, column mapping, redaction and the validation report arrive in phase 2.
          </div>
        </Card>
        <Card title="What’s loaded" className="col-span-2">
          {counts.loading ? <Skeleton className="h-16" /> : counts.data && (
            <dl className="grid grid-cols-6 gap-3 text-sm">
              {([['Surveys', counts.data.surveys], ['Calls', counts.data.calls], ['Follow-ups', counts.data.followups], ['Stores', counts.data.stores], ['Unmapped stores', counts.data.unmapped], ['Files', counts.data.files]] as const).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-display text-2xl font-semibold tnum">{v.toLocaleString()}</dd></div>
              ))}
            </dl>
          )}
          {files.data && files.data.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-muted">
              {files.data.map((f) => <li key={f.id}>{f.name} · {f.kind} · {f.rows.toLocaleString()} rows · weeks {f.weeks[0]}–{f.weeks[f.weeks.length - 1]}</li>)}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Weeks" className="mt-3">
        {weeks.loading ? <Skeleton className="h-32" /> : !weeks.data?.length ? <p className="text-sm text-muted">No weeks loaded yet.</p> : (
          <div className="max-h-[360px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                <tr><th className="py-1.5 font-medium">Week</th><th className="font-medium">LTR</th><th className="font-medium">Detractors (0–8)</th><th className="font-medium">Customer calls</th><th className="font-medium">Status</th></tr>
              </thead>
              <tbody>
                {weeks.data.map((w) => (
                  <tr key={w.fw} className="border-t border-border">
                    <td className="py-1.5">{weekInfo(w.fw, fyStart).label}</td>
                    <td>{w.ltr.n ? <PctN pct={w.ltr.pct} n={w.ltr.n} /> : <span className="text-muted">—</span>}</td>
                    <td className="tnum">{w.ltr.n ? `${w.ltr.detractors} (${w.ltr.detractors0to6} at 0–6)` : '—'}</td>
                    <td className="tnum">{w.calls || '—'}</td>
                    <td>{w.locked ? <span className="inline-flex items-center gap-1 text-xs text-muted"><Icon name="lock" size={13} /> Locked</span> : <span className="text-xs text-muted">Open</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

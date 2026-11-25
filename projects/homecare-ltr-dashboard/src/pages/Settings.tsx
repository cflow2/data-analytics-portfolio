import { useRef, useState } from 'react';
import { SlideConfigEditor } from '@/components/settings/SlideConfigEditor';
import { RedactionRulesEditor } from '@/components/data/RedactionRulesEditor';
import { TaxonomyEditor } from '@/components/voc/TaxonomyEditor';
import { useImports } from '@/state/imports';
import { useLive } from '@/hooks/useLive';
import { db } from '@/db/db';
import { useSettings, applyTheme, type ThemeMode } from '@/state/settings';
import { isISODate, weekday } from '@/lib/dates';
import { weekInfo } from '@/lib/fiscal';
import { SCREENS } from '@/screens';
import { Card, PageHeader, Select, Button } from '@/components/ui/primitives';

function NumberField({ label, value, onChange, min, max, step = 1, hint }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; hint?: string }) {
  return (
    <label className="flex flex-col gap-0.5 text-sm">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= min && v <= max) onChange(v); }} className="h-8 w-28 rounded-lg border border-border bg-surface px-2 tnum" />
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Settings() {
  const s = SCREENS.find((x) => x.path === '/settings')!;
  const st = useSettings();
  const [fy, setFy] = useState(st.fyStart);
  const fyValid = isISODate(fy) && weekday(fy) === 6;
  const addFiles = useImports((x) => x.addFiles);
  const importOne = useImports((x) => x.importOne);
  const mapInput = useRef<HTMLInputElement>(null);
  const [mapMsg, setMapMsg] = useState<string | null>(null);
  const unmapped = useLive(() => db.stores.filter((x) => !x.district).count(), []);

  return (
    <>
      <PageHeader title={s.title} subtitle={s.subtitle} />
      <div className="grid grid-cols-2 gap-3">
        <Card title="Fiscal calendar">
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-0.5 text-sm">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">FW1 start date (Saturday)</span>
              <input type="date" value={fy} onChange={(e) => setFy(e.target.value)} className="h-8 rounded-lg border border-border bg-surface px-2" aria-invalid={!fyValid} />
            </label>
            <Button variant="primary" disabled={!fyValid || fy === st.fyStart} onClick={() => st.update({ fyStart: fy })}>Save</Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            {fyValid ? `FW1 = ${weekInfo(1, fy).label}. FW52 = ${weekInfo(52, fy).label}.` : 'The fiscal year must start on a Saturday.'}
            {' '}4-5-4 calendar, weeks run Saturday–Friday, WBR is the Wednesday after the week ends.
          </p>
        </Card>
        <Card title="LTR rules">
          <div className="flex flex-wrap gap-4">
            <NumberField label="Benchmark %" value={st.benchmark} min={0} max={100} step={0.1} onChange={(v) => st.update({ benchmark: v })} />
            <NumberField label="“No trend” below n" value={st.thresholds.noTrendBelow} min={1} max={100} onChange={(v) => st.update({ thresholds: { ...st.thresholds, noTrendBelow: v } })} />
            <NumberField label="“Directional” below n" value={st.thresholds.directionalBelow} min={1} max={200} onChange={(v) => st.update({ thresholds: { ...st.thresholds, directionalBelow: v } })} />
            <NumberField label="“Strong” at n ≥" value={st.thresholds.strongAtLeast} min={1} max={1000} onChange={(v) => st.update({ thresholds: { ...st.thresholds, strongAtLeast: v } })} />
          </div>
          <p className="mt-3 text-xs text-muted">LTR % = 9–10 ÷ all valid 0–10 scores. Detractor = 0–8. These two rules are fixed in code and guarded by unit tests.</p>
        </Card>
        <Card title="Appearance">
          <Select<ThemeMode> label="Theme" value={st.theme} onChange={(v) => { st.update({ theme: v }); applyTheme(v); }} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} className="w-40" />
        </Card>
        <Card title="Region / district mapping">
          <p className="text-sm text-muted">Hierarchy is Region → District → Store. District comes from the Tracker’s store sheets when present, otherwise from a CSV with <code className="text-xs">Store #, Store Name, City, State, District, Region</code>. “Lowe’s Market” is never used as a district.</p>
          <div className="mt-3 flex items-center gap-3">
            <Button icon="upload" onClick={() => mapInput.current?.click()}>Upload mapping CSV</Button>
            <span className="text-sm tnum">{unmapped.data ?? 0} unmapped store(s)</span>
          </div>
          <input ref={mapInput} type="file" accept=".csv,.xlsx" className="hidden" aria-label="Upload store to district mapping" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setMapMsg('Reading…');
            await addFiles([f]);
            const staged = useImports.getState().files[0];
            if (staged?.status === 'ready' && staged.parsed?.candidate?.kind === 'store-map') {
              await importOne(staged.key);
              const r = useImports.getState().files.find((x) => x.key === staged.key)?.report;
              setMapMsg(`Mapped ${r?.rowsKept ?? 0} stores. ${r?.unmappedStores?.length ?? 0} still unmapped.`);
            } else setMapMsg('That file doesn’t look like a store→district mapping. Open the Data Manager to map its columns.');
          }} />
          {mapMsg && <p role="status" className="mt-2 text-xs text-muted">{mapMsg}</p>}
        </Card>
        <Card title="LTR slide: divisions, map and Key Drivers" className="col-span-2">
          <SlideConfigEditor />
        </Card>
        <Card title="Theme taxonomy and keyword rules" className="col-span-2">
          <TaxonomyEditor />
        </Card>
        <Card title="Redaction rules" className="col-span-2">
          <RedactionRulesEditor />
        </Card>
        <Card title="AI" className="col-span-2">
          <p className="text-sm text-muted">Not used. Theme tags come from the keyword rules, Ask answers are computed locally, and slide lines, speaker notes and the daily pulse are written from the computed numbers by rules. The app makes no network requests; its content-security policy blocks outbound connections.</p>
        </Card>
      </div>
    </>
  );
}

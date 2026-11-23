import { useState } from 'react';
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
        <Card title="Coming in later phases">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Taxonomy editor and keyword rules (phase 4)</li>
            <li>Region/district mapping upload and redaction rules with a test box (phase 2)</li>
            <li>AI provider settings (phase 5)</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

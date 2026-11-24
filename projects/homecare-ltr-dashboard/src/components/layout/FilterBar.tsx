import { useMemo } from 'react';
import { db } from '@/db/db';
import { useLive } from '@/hooks/useLive';
import { useSelectedWeek } from '@/hooks/useWeek';
import { useFilters, type CompareTo } from '@/state/filters';
import { useSettings } from '@/state/settings';
import { weekInfo } from '@/lib/fiscal';
import { REGIONS, regionSortKey, storeLabel, UNMAPPED } from '@/domain/geo';
import { Select } from '@/components/ui/primitives';

export function FilterBar() {
  const [f, setF] = useFilters();
  const week = useSelectedWeek();
  const fyStart = useSettings((s) => s.fyStart);
  const { data: stores } = useLive(() => db.stores.toArray(), []);
  const storeMap = useMemo(() => new Map((stores ?? []).map((s) => [s.storeNo, s])), [stores]);

  const regions = useMemo(() => {
    const fromData = new Set((stores ?? []).map((s) => s.region));
    return [...new Set([...REGIONS, ...fromData])].sort((a, b) => regionSortKey(a) - regionSortKey(b));
  }, [stores]);
  const districts = useMemo(() => {
    if (!f.region) return [];
    const ds = new Set((stores ?? []).filter((s) => s.region === f.region).map((s) => s.district ?? UNMAPPED));
    return [...ds].sort();
  }, [stores, f.region]);
  const storeOpts = useMemo(() => (stores ?? [])
    .filter((s) => (!f.region || s.region === f.region) && (!f.district || (s.district ?? UNMAPPED) === f.district))
    .sort((a, b) => a.storeNo.localeCompare(b.storeNo)), [stores, f.region, f.district]);

  const weekOptions = useMemo(() => {
    const ws = Array.from({ length: 52 }, (_, i) => i + 1);
    return ws.map((w) => ({ value: String(w), label: `${weekInfo(w, fyStart).label}${week.weeks.includes(w) ? '' : ' · no data'}` })).reverse();
  }, [fyStart, week.weeks]);

  return (
    <div className="grid grid-cols-2 items-end gap-2 border-b border-border bg-surface/95 px-3 py-2.5 backdrop-blur md:sticky md:top-0 md:z-20 md:flex md:flex-wrap md:gap-3 md:px-6">
      <Select label="Fiscal week" value={String(week.fw)} onChange={(v) => setF({ fw: Number(v) })} options={weekOptions} className="col-span-2 w-full md:w-[318px]" />
      <Select<CompareTo>
        label="Compare to" value={f.compare} onChange={(v) => setF({ compare: v })}
        options={[{ value: 'prior', label: 'Prior week' }, { value: 'avg4', label: '4-week avg' }, { value: 'fytd', label: 'FYTD' }]}
      />
      <Select
        label="Region" value={f.region ?? ''} onChange={(v) => setF({ region: v || null })}
        options={[{ value: '', label: 'All regions' }, ...regions.map((r) => ({ value: r, label: r }))]}
      />
      <Select
        label="District" value={f.district ?? ''} onChange={(v) => setF({ district: v || null })}
        options={[{ value: '', label: f.region ? 'All districts' : 'Pick a region' }, ...districts.map((d) => ({ value: d, label: d }))]}
      />
      <Select
        label="Store" value={f.store ?? ''} onChange={(v) => setF({ store: v || null })} className="w-full md:w-[172px]"
        options={[{ value: '', label: 'All stores' }, ...storeOpts.map((s) => ({ value: s.storeNo, label: storeLabel(s.storeNo, storeMap) }))]}
      />
    </div>
  );
}

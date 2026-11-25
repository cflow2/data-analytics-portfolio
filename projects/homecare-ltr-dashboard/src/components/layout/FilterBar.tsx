import { useMemo } from 'react';
import { db } from '@/db/db';
import { useLive } from '@/hooks/useLive';
import { useSelectedWeek } from '@/hooks/useWeek';
import { useFilters, type CompareTo } from '@/state/filters';
import { useSettings } from '@/state/settings';
import { weekInfo } from '@/lib/fiscal';
import { REGIONS, regionSortKey, storeLabel, UNMAPPED } from '@/domain/geo';
import { Select } from '@/components/ui/primitives';
import { useDataset } from '@/data/dataset';
import { divisionOf } from '@/config/regions';
import { districtFor, surveyDivision } from '@/analytics/ltr';

export function FilterBar() {
  const [f, setF] = useFilters();
  const week = useSelectedWeek();
  const fyStart = useSettings((s) => s.fyStart);
  const { data: stores } = useLive(() => db.stores.toArray(), []);
  const storeMap = useMemo(() => new Map((stores ?? []).map((s) => [s.storeNo, s])), [stores]);

  const { data: ds } = useDataset();
  const regions = useMemo(() => {
    const fromData = new Set((stores ?? []).map((s) => s.region));
    // A region's division: the Tracker's Lowe's Division on its surveys, else the region config.
    const divOf = new Map<string, string>();
    for (const sv of ds?.surveys ?? []) if (sv.division && !divOf.has(sv.region)) divOf.set(sv.region, sv.division);
    return [...new Set([...REGIONS, ...fromData])]
      .filter((r) => !f.division || (divOf.get(r) ?? divisionOf(r)) === f.division)
      .sort((a, b) => regionSortKey(a) - regionSortKey(b));
  }, [stores, ds, f.division]);
  const associates = useMemo(() => {
    if (!ds?.associates.length) return [];
    const inScope = new Set<string>();
    for (const sv of ds.surveys) {
      if (!sv.associate) continue;
      if (f.division && surveyDivision(sv) !== f.division) continue;
      if (f.region && sv.region !== f.region) continue;
      if (f.district && districtFor(sv.storeNo, storeMap) !== f.district) continue;
      if (f.store && sv.storeNo !== f.store) continue;
      inScope.add(sv.associate);
    }
    return [...inScope].sort();
  }, [ds, f.division, f.region, f.district, f.store, storeMap]);
  const districts = useMemo(() => {
    if (!f.region) return [];
    const ds = new Set((stores ?? []).filter((s) => s.region === f.region).map((s) => s.district ?? UNMAPPED));
    return [...ds].sort();
  }, [stores, f.region]);
  const storeOpts = useMemo(() => (stores ?? [])
    .filter((s) => (!f.division || regions.includes(s.region)) && (!f.region || s.region === f.region) && (!f.district || (s.district ?? UNMAPPED) === f.district))
    .sort((a, b) => a.storeNo.localeCompare(b.storeNo)), [stores, f.division, regions, f.region, f.district]);

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
        label="Division" value={f.division ?? ''} onChange={(v) => setF({ division: v || null })}
        options={[{ value: '', label: 'All divisions' }, { value: 'SOUTH', label: 'South' }, { value: 'WEST', label: 'West' }, { value: 'NORTH', label: 'North' }]}
      />
      <Select
        label="Region" value={f.region ?? ''} onChange={(v) => setF({ region: v || null })}
        options={[{ value: '', label: f.division ? `All ${f.division[0]}${f.division.slice(1).toLowerCase()} regions` : 'All regions' }, ...regions.map((r) => ({ value: r, label: r }))]}
      />
      <Select
        label="District" value={f.district ?? ''} onChange={(v) => setF({ district: v || null })}
        options={[{ value: '', label: f.region ? 'All districts' : 'Pick a region' }, ...districts.map((d) => ({ value: d, label: d }))]}
      />
      <Select
        label="Store" value={f.store ?? ''} onChange={(v) => setF({ store: v || null })} className="w-full md:w-[172px]"
        options={[{ value: '', label: 'All stores' }, ...storeOpts.map((s) => ({ value: s.storeNo, label: storeLabel(s.storeNo, storeMap) }))]}
      />
      {(associates.length > 0 || f.associate) && (
        <Select
          label="Associate" value={f.associate ?? ''} onChange={(v) => setF({ associate: v || null })} className="w-full md:w-[190px]"
          options={[{ value: '', label: `All associates (${associates.length})` }, ...[...new Set([...associates, ...(f.associate ? [f.associate] : [])])].map((a) => ({ value: a, label: a }))]}
        />
      )}
    </div>
  );
}

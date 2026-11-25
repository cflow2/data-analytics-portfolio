/** Settings for the LTR slide: region → division, map picture → region, and which attributes are Key Drivers. */
import { useState } from 'react';
import { db } from '@/db/db';
import { useLive } from '@/hooks/useLive';
import { DEFAULT_REGION_CONFIG, getRegionConfig, saveRegionConfig, type Division, type RegionConfig } from '@/config/regions';
import { REGIONS } from '@/domain/geo';
import { ATTRIBUTES } from '@/domain/attributes';
import type { RegionMapAsset } from '@/ingest/regionMap';
import { getDriverDefs, saveDriverDefs } from '@/slide/state';
import { Button } from '@/components/ui/primitives';

const DIVS: Division[] = ['SOUTH', 'WEST', 'NORTH'];

export function SlideConfigEditor() {
  const cfg = useLive(() => getRegionConfig(), []);
  const asset = useLive(async () => ((await db.kv.get('regionMap'))?.value as RegionMapAsset | undefined) ?? null, []);
  const drivers = useLive(() => getDriverDefs(), []);
  const [msg, setMsg] = useState<string | null>(null);
  if (!cfg.data || !drivers.data) return <p className="text-sm text-muted">Loading…</p>;
  const c = cfg.data;
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 1800); };
  const divOf = (r: string) => DIVS.find((d) => c.divisions[d].includes(r)) ?? '';
  const setDiv = async (r: string, d: string) => {
    const divisions = Object.fromEntries(DIVS.map((x) => [x, c.divisions[x].filter((y) => y !== r).concat(x === d ? [r] : [])])) as RegionConfig['divisions'];
    await saveRegionConfig({ ...c, divisions }); say('Divisions saved');
  };
  const setPicture = async (name: string, region: string) => {
    const pictures = { ...c.pictures, [name]: region };
    if (!region) delete pictures[name];
    await saveRegionConfig({ ...c, pictures });
    if (asset.data) await db.kv.put({ key: 'regionMap', value: { ...asset.data, regions: asset.data.regions.map((p) => (p.name === name ? { ...p, region: region || undefined } : p)) } });
    say('Map picture saved');
  };
  const regions = [...new Set([...REGIONS, ...Object.values(c.divisions).flat()])];

  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="mb-1 font-semibold">Region → division</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4 lg:grid-cols-7">
          {regions.map((r) => (
            <label key={r} className="flex items-center gap-1">{r}
              <select className="h-7 rounded border border-border bg-surface px-1" value={divOf(r)} onChange={(e) => void setDiv(r, e.target.value)} aria-label={`Division for ${r}`}>
                <option value="">—</option>{DIVS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-1 font-semibold">Map pictures</h3>
        {!asset.data ? <p className="text-muted">No map yet. Import an LTR Tracker that has the “LTR Region Map” sheet.</p> : (
          <>
            <p className="mb-2 text-xs text-muted">From {asset.data.source}. Each coloured shape on the Tracker map is a picture; pick the region it shows.</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
              {asset.data.regions.map((p) => (
                <label key={p.name} className="flex flex-col items-center gap-1 rounded border border-border p-1 text-xs">
                  <img src={p.dataUrl} alt={`${p.name} shape`} className="h-14 w-full object-contain" />
                  <span className="text-muted">{p.name}</span>
                  <select className="h-7 rounded border border-border bg-surface px-1" value={p.region ?? ''} onChange={(e) => void setPicture(p.name, e.target.value)} aria-label={`Region for ${p.name}`}>
                    <option value="">—</option>{regions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
      <div>
        <h3 className="mb-1 font-semibold">Key Drivers on the slide</h3>
        <div className="grid gap-1 sm:grid-cols-2">
          {ATTRIBUTES.map((a) => {
            const d = drivers.data!.find((x) => x.key === a.key);
            return (
              <div key={a.key} className="flex items-center gap-2">
                <label className="flex flex-1 items-center gap-1.5">
                  <input type="checkbox" checked={!!d} onChange={(e) => void saveDriverDefs(e.target.checked ? [...drivers.data!, { key: a.key, short: a.label }] : drivers.data!.filter((x) => x.key !== a.key)).then(() => say('Drivers saved'))} />
                  {a.label}
                </label>
                {d && <input className="h-7 w-36 rounded border border-border bg-surface px-1 text-xs" value={d.short} aria-label={`Short name for ${a.label}`}
                  onChange={(e) => void saveDriverDefs(drivers.data!.map((x) => (x.key === a.key ? { ...x, short: e.target.value } : x)))} />}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="h-7 px-2 text-xs" onClick={async () => { await saveRegionConfig(DEFAULT_REGION_CONFIG); say('Region config reset'); }}>Reset regions to defaults</Button>
        {msg && <span role="status" className="text-xs text-grow">{msg}</span>}
      </div>
    </div>
  );
}

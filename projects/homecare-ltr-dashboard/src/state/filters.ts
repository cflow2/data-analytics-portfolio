import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

export type CompareTo = 'prior' | 'avg4' | 'fytd';

export interface Filters {
  fw: number | null;
  compare: CompareTo;
  region: string | null;
  district: string | null;
  store: string | null;
}

const COMPARES: CompareTo[] = ['prior', 'avg4', 'fytd'];

export function parseFilters(p: URLSearchParams): Filters {
  const fw = Number(p.get('fw'));
  const compare = p.get('cmp') as CompareTo;
  return {
    fw: Number.isInteger(fw) && fw >= 1 && fw <= 53 ? fw : null,
    compare: COMPARES.includes(compare) ? compare : 'prior',
    region: p.get('region') || null,
    district: p.get('district') || null,
    store: p.get('store') || null,
  };
}

export function serializeFilters(f: Partial<Filters>, base = new URLSearchParams()): URLSearchParams {
  const p = new URLSearchParams(base);
  const set = (k: string, v: string | number | null | undefined, dflt?: string) => {
    if (v === null || v === undefined || v === '' || String(v) === dflt) p.delete(k);
    else p.set(k, String(v));
  };
  if ('fw' in f) set('fw', f.fw);
  if ('compare' in f) set('cmp', f.compare, 'prior');
  if ('region' in f) set('region', f.region);
  if ('district' in f) set('district', f.district);
  if ('store' in f) set('store', f.store);
  return p;
}

/** Filters live in the URL hash query so every view is linkable and survives reloads. */
export function useFilters(): [Filters, (patch: Partial<Filters>) => void] {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const update = useCallback(
    (patch: Partial<Filters>) => {
      // Cascading: changing region clears district/store; changing district clears store.
      const p = { ...patch };
      if ('region' in p && !('district' in p)) { p.district = null; p.store = null; }
      if ('district' in p && !('store' in p)) p.store = null;
      setParams((prev) => serializeFilters(p, prev), { replace: true });
    },
    [setParams],
  );
  return [filters, update];
}

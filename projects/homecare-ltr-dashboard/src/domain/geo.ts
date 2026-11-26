import type { StoreRecord } from './types';

export const REGIONS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R12', 'R14', 'R15', 'R18', 'R21', 'R27'] as const;
export type Region = (typeof REGIONS)[number];

export const UNMAPPED = 'Unmapped';

/** Normalize "Region 5", "R05", "5", "r5" → "R5". Returns the trimmed input if it can't be parsed. */
export function normalizeRegion(raw: unknown): string {
  const s = String(raw ?? '').trim();
  const m = /^(?:region|reg|r)?\s*0*(\d{1,2})$/i.exec(s);
  return m ? `R${+m[1]}` : s;
}

/** Store numbers are 4 digits, zero-padded: "123" → "0123". */
export function normalizeStoreNo(raw: unknown): string {
  let s = String(raw ?? '').trim().replace(/^#/, '').replace(/\.0+$/, '');
  const lead = /^(\d{1,4})\s*-\s*\S/.exec(s); // "2702 - LOWE'S OF HAINES CITY, FL"
  if (lead) s = lead[1];
  return /^\d{1,4}$/.test(s) ? s.padStart(4, '0') : s;
}

/** "#### – City, ST" */
export function storeLabel(storeNo: string, stores?: Map<string, StoreRecord>): string {
  const s = stores?.get(storeNo);
  return s && s.city ? `${storeNo} – ${s.city}${s.state ? `, ${s.state}` : ''}` : storeNo;
}

/** "City, ST" for a store, or '' when no file names it. */
export function storeCity(storeNo: string, stores?: Map<string, StoreRecord>): string {
  const s = stores?.get(storeNo);
  return s?.city ? `${s.city}${s.state ? `, ${s.state}` : ''}` : '';
}

/** "2702 - LOWE'S OF HAINES CITY, FL" / "LOWE'S OF HAINES CITY, FL" → name, city "Haines City", state "FL". */
export function parseStoreName(raw: string): { name: string; city: string; state: string } {
  const name = raw.replace(/^\s*\d+\s*-\s*/, '').trim();
  const rest = name.replace(/^LOWE['’]?S\s+(OF\s+)?/i, '').trim();
  const m = /^(.*?),\s*([A-Za-z]{2})\.?\s*$/.exec(rest);
  const title = (x: string) => x.toLowerCase().replace(/(^|[\s.\-/])([a-z])/g, (_, a, b) => a + b.toUpperCase()).trim();
  return m ? { name, city: title(m[1]), state: m[2].toUpperCase() } : { name, city: title(rest.replace(/,$/, '')), state: '' };
}

/**
 * One store directory from every loaded file. The stores table (Tracker “Store” column, Medallia store name, store map)
 * comes first; stores it doesn't name are filled from the subscription export’s store names (“LOWE'S OF …, ST”).
 * Stores only seen as a number (follow-up file, appointment file) are added so lookups work, with region when known.
 */
export function buildStoreDirectory(
  stores: StoreRecord[],
  named: { storeNo: string; storeName?: string; region?: string }[],
  seen: { storeNo?: string; region?: string }[],
): Map<string, StoreRecord> {
  const m = new Map(stores.map((s) => [s.storeNo, { ...s }]));
  for (const x of named) {
    if (!x.storeNo || !x.storeName) continue;
    const cur = m.get(x.storeNo);
    if (cur?.city) continue;
    const p = parseStoreName(x.storeName);
    if (!p.city) continue;
    m.set(x.storeNo, { storeNo: x.storeNo, district: cur?.district ?? null, region: cur?.region || x.region || '', ...p });
  }
  for (const x of seen) {
    if (!x.storeNo || m.has(x.storeNo)) continue;
    m.set(x.storeNo, { storeNo: x.storeNo, name: '', city: '', state: '', district: null, region: x.region ?? '' });
  }
  return m;
}

export function districtOf(storeNo: string, stores: Map<string, StoreRecord>): string {
  return stores.get(storeNo)?.district || UNMAPPED;
}

export function regionSortKey(r: string): number {
  const i = (REGIONS as readonly string[]).indexOf(r);
  return i === -1 ? 999 : i;
}

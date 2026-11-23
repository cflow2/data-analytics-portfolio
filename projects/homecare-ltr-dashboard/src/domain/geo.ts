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
  const s = String(raw ?? '').trim().replace(/^#/, '').replace(/\.0+$/, '');
  return /^\d{1,4}$/.test(s) ? s.padStart(4, '0') : s;
}

/** "#### – City, ST" */
export function storeLabel(storeNo: string, stores?: Map<string, StoreRecord>): string {
  const s = stores?.get(storeNo);
  return s && s.city ? `${storeNo} – ${s.city}, ${s.state}` : storeNo;
}

export function districtOf(storeNo: string, stores: Map<string, StoreRecord>): string {
  return stores.get(storeNo)?.district || UNMAPPED;
}

export function regionSortKey(r: string): number {
  const i = (REGIONS as readonly string[]).indexOf(r);
  return i === -1 ? 999 : i;
}

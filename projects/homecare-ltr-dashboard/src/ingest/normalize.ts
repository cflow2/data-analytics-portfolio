import { fromDayNumber, isISODate, type ISODate } from '@/lib/dates';

/** Header normalization: trim, lowercase, curly → straight quotes, collapse whitespace. */
export function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).replace(/\r\n?/g, '\n').trim();
}

/** Case # values: trim whitespace and newlines; numeric cells lose any ".0". */
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function iso(y: number, m: number, d: number): ISODate | null {
  if (y < 100) y += 2000;
  const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isISODate(s) ? s : null;
}

/**
 * Parse a date cell: Excel serial numbers, JS Dates, "11/6/2026", "11/6/26", "2026-11-06",
 * "11/6/2026 10:32 AM", "Nov 6, 2026", "6-Nov-2026". Returns null when unparseable.
 */
export function parseDateCell(v: unknown): ISODate | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v === 'number') {
    // Excel serial date (1900 system). 25569 = 1970-01-01.
    if (v < 20000 || v > 80000) return null;
    return fromDayNumber(Math.floor(v) - 25569);
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/.exec(s);
  if (m) return iso(+m[3], +m[1], +m[2]);
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (m && MONTHS[m[1].slice(0, 4).toLowerCase()] !== undefined) return iso(+m[3], MONTHS[m[1].slice(0, 4).toLowerCase()], +m[2]);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return iso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  m = /^(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s,]+(\d{2,4})/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseDateCell(Number(s));
  return null;
}

/** 0–10 score from a cell: 9, "9", "9.0", "10 - Extremely likely". Null if not a valid integer 0–10. */
export function parseScore(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v <= 10 ? v : null;
  const m = /^\s*(\d{1,2})(?:\.0+)?(?:\s*[-–:].*)?\s*$/.exec(String(v ?? ''));
  if (!m) return null;
  const n = +m[1];
  return n >= 0 && n <= 10 ? n : null;
}

export function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/[,%\s]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Fast deterministic 53-bit string hash (cyrb53). Used for record ids, file ids and caches. Not for secrets. */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function hashBytes(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 16777619);
    h2 = Math.imul(h2 ^ bytes[i], 2246822519);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}-${bytes.length.toString(36)}`;
}

/** Normalized text used to match the same comment across sources. */
export function textKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Placeholder text that means "no comment" — treated as blank so no theme is ever inferred from it. */
const PLACEHOLDER = /^(?:no comments?|none|n\/?a|na|null|-+|\.+|nothing|no feedback|nc)\.?$/i;
export function cleanComment(v: unknown): string {
  const t = cellText(v);
  return PLACEHOLDER.test(t) ? '' : t;
}

/** Appointment IDs compare as trimmed text ("123.0" and " 123" are the same appointment). */
export const normalizeApptId = (v: unknown): string => cellText(v).replace(/\s+/g, '').replace(/^(\d+)\.0+$/, '$1');

/** 10-digit US numbers as 555-014-2231 (as in the store manager email); anything else is kept as written. */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : raw.trim();
}

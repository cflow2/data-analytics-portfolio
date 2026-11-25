/**
 * Number verification: every number in a piece of text must come from the data it summarises.
 * Used on generated text (guaranteed to pass) and on text you edit by hand (mismatches are highlighted).
 */
export interface NumberHit { text: string; value: number; start: number; end: number; ok: boolean }

const NUM = /(?<![\w.])(?:\$)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(%)?(?![\w])/g;

/** Numbers that never need checking: fiscal week labels (FW40), regions (R5), years, "0–6"/"7–8"/"9–10" bands, "93%" benchmark etc. are passed via `alwaysOk`. */
export function extractNumbers(text: string): NumberHit[] {
  const out: NumberHit[] = [];
  for (const m of text.matchAll(NUM)) {
    const before = text.slice(Math.max(0, m.index! - 2), m.index!);
    if (/FW$|R$|Q$|M$|#$/i.test(before) || /FW\s$/i.test(before)) continue; // FW40, R5, Q4, store #1234
    const word = text.slice(Math.max(0, m.index! - 5), m.index!);
    if (/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s$/i.test(word)) continue; // dates: "Oct 31", "Nov 6"
    if (/^\d+\/\d+/.test(text.slice(m.index!)) || /\d\/$/.test(text.slice(0, m.index!))) continue; // 11/6, 11/6/2026
    const raw = m[0];
    const value = Number(`${m[1].replace(/,/g, '')}${m[2] ? `.${m[2]}` : ''}`);
    out.push({ text: raw, value, start: m.index!, end: m.index! + raw.length, ok: false });
  }
  return out;
}

/**
 * Allowed values: exact, or equal after rounding to the precision the text uses (94.7 ← 94.6564).
 * If `percents` is given, a number written with % must match one of those (a count can't pass as a share).
 */
export function verifyNumbers(text: string, allowed: Iterable<number>, alwaysOk: Iterable<number> = [], percents?: Iterable<number>): NumberHit[] {
  const vals = [...allowed].filter((v) => Number.isFinite(v));
  const pvals = percents ? [...percents].filter((v) => Number.isFinite(v)) : null;
  const free = new Set([...alwaysOk]);
  const match = (pool: number[], h: NumberHit) => {
    const decimals = (h.text.split('.')[1] ?? '').replace(/\D/g, '').length;
    return pool.some((v) => Number(v.toFixed(decimals)) === h.value || Math.abs(v - h.value) < 1e-9);
  };
  return extractNumbers(text).map((h) => {
    if (free.has(h.value)) return { ...h, ok: true };
    const isPct = h.text.endsWith('%');
    return { ...h, ok: isPct && pvals ? match(pvals, h) : match(vals, h) };
  });
}

/** Common always-OK numbers in this domain: score bands and the 30-day window. */
export const DOMAIN_CONSTANTS = [0, 6, 7, 8, 9, 10, 30, 99, 12];

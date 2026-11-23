/** Call Driver normalization — for grouping only; the original value is always kept. */
const TYPO_FIXES: [RegExp, string][] = [
  [/\bgenearl\b/gi, 'General'],
  [/\bgeneral\b/gi, 'General'],
  [/\bassist(?:asnce|ance|ence|nace|anse)\b/gi, 'Assistance'],
  [/\bassitance\b/gi, 'Assistance'],
  [/\basistance\b/gi, 'Assistance'],
  [/\binquires\b/gi, 'Inquiries'],
  [/\binquries\b/gi, 'Inquiries'],
  [/\bsubscripton\b/gi, 'Subscription'],
  [/\bsubcription\b/gi, 'Subscription'],
  [/\bappointmnet\b/gi, 'Appointment'],
  [/\bcancell?ation\b/gi, 'Cancellation'],
];

export function normalizeDriver(raw: string): string {
  let s = String(raw ?? '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  for (const [re, fix] of TYPO_FIXES) s = s.replace(re, fix);
  return s;
}

const ASSOCIATE_DRIVERS = ["lowe's associate needs assistance", 'store associate needs assistance'];

/** Associate/store help-desk calls: counted separately, never part of VOC. */
export function isAssociateDriver(normalized: string): boolean {
  return ASSOCIATE_DRIVERS.includes(normalized.toLowerCase());
}

/** Original → normalized pairs that differ (shown to the user as the mapping). */
export function driverMapping(originals: Iterable<string>): { original: string; normalized: string }[] {
  const seen = new Map<string, string>();
  for (const o of originals) if (!seen.has(o)) seen.set(o, normalizeDriver(o));
  return [...seen].filter(([o, n]) => o !== n).map(([original, normalized]) => ({ original, normalized }));
}

/** First 3–4 digit store number mentioned in notes ("store #1234", "Store 0456"). */
export function storeFromNotes(notes: string): string | undefined {
  const m = /\bstore\s*(?:#|no\.?|number)?\s*:?\s*(\d{3,4})\b/i.exec(notes);
  return m ? m[1].padStart(4, '0') : undefined;
}

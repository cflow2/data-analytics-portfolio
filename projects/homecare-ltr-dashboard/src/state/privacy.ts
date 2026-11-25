import { db, type HomeCareDB } from '@/db/db';
import { DEFAULT_REDACTION_RULES, type RedactionRule } from '@/ingest/redact';
import type { ColumnMapping } from '@/ingest/specs';

const RULES_KEY = 'redactionRules';
const SALT_KEY = 'salt';
export const COLMAP_PREFIX = 'colmap:';

export async function getRedactionRules(database: HomeCareDB = db): Promise<RedactionRule[]> {
  const row = await database.kv.get(RULES_KEY);
  return (row?.value as RedactionRule[] | undefined) ?? DEFAULT_REDACTION_RULES;
}

export async function saveRedactionRules(rules: RedactionRule[], database: HomeCareDB = db) {
  await database.kv.put({ key: RULES_KEY, value: rules });
}

/** Per-install random salt for hashing phone numbers (repeat callers). Never leaves the machine. */
export async function getSalt(database: HomeCareDB = db): Promise<string> {
  const row = await database.kv.get(SALT_KEY);
  if (row) return row.value as string;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  await database.kv.put({ key: SALT_KEY, value: salt });
  return salt;
}

export async function getRememberedMappings(database: HomeCareDB = db): Promise<Record<string, ColumnMapping>> {
  const rows = await database.kv.where('key').startsWith(COLMAP_PREFIX).toArray();
  return Object.fromEntries(rows.map((r) => [r.key.slice(COLMAP_PREFIX.length), r.value as ColumnMapping]));
}

export async function rememberMapping(kind: string, mapping: ColumnMapping, database: HomeCareDB = db) {
  const prev = ((await database.kv.get(COLMAP_PREFIX + kind))?.value as ColumnMapping | undefined) ?? {};
  await database.kv.put({ key: COLMAP_PREFIX + kind, value: { ...prev, ...mapping } });
}

import { db as defaultDb, type HomeCareDB } from '@/db/db';
import { DEFAULT_TAXONOMY, type ThemeDef } from '@/domain/taxonomy';

const KEY = 'taxonomy';

export async function getTaxonomy(database: HomeCareDB = defaultDb): Promise<ThemeDef[]> {
  const row = await database.kv.get(KEY);
  return (row?.value as ThemeDef[] | undefined) ?? DEFAULT_TAXONOMY;
}

export async function saveTaxonomy(tax: ThemeDef[], database: HomeCareDB = defaultDb) {
  await database.kv.put({ key: KEY, value: tax });
}

export async function resetTaxonomy(database: HomeCareDB = defaultDb) {
  await database.kv.delete(KEY);
}

/** Add a phrase to a theme's keyword rules (from the Review Queue). Returns false if already present. */
export async function addKeyword(themeId: string, phrase: string, database: HomeCareDB = defaultDb): Promise<boolean> {
  const p = phrase.trim().toLowerCase();
  if (!p) return false;
  const tax = structuredClone(await getTaxonomy(database));
  const t = tax.find((x) => x.id === themeId);
  if (!t || t.keywords.map((k) => k.toLowerCase()).includes(p)) return false;
  t.keywords.push(p);
  await saveTaxonomy(tax, database);
  return true;
}

/** Applies the rules engine to stored records. Manual and AI tags are never overwritten. */
import { db as defaultDb, type HomeCareDB } from '@/db/db';
import type { ThemeTag } from '@/domain/types';
import { tagRecord } from './engine';
import { getTaxonomy } from './taxonomyStore';

export interface TagRunResult { tagged: number; kept: number; removed: number }

export async function runRuleTagging(opts: { fws?: number[]; database?: HomeCareDB } = {}): Promise<TagRunResult> {
  const database = opts.database ?? defaultDb;
  const tax = await getTaxonomy(database);
  const [surveys, calls] = await Promise.all([
    opts.fws ? database.surveys.where('fw').anyOf(opts.fws).toArray() : database.surveys.toArray(),
    opts.fws ? database.calls.where('fw').anyOf(opts.fws).toArray() : database.calls.toArray(),
  ]);
  const ids = [...surveys.map((s) => s.id), ...calls.map((c) => c.id)];
  const existing = new Map((await database.tags.bulkGet(ids)).filter((t): t is ThemeTag => !!t).map((t) => [t.recordId, t]));
  const put: ThemeTag[] = [];
  const del: string[] = [];
  let kept = 0;
  const consider = (id: string, t: ThemeTag | null) => {
    const prev = existing.get(id);
    if (prev && (prev.source === 'Manual' || prev.source === 'AI')) { kept++; return; }
    if (t) put.push(t);
    else if (prev) del.push(id);
  };
  for (const s of surveys) consider(s.id, tagRecord({ id: s.id, channel: 'survey', fw: s.fw, text: s.comment }, tax));
  for (const c of calls) consider(c.id, tagRecord({ id: c.id, channel: 'call', fw: c.fw, text: c.notes, driver: c.driver, isAssociate: c.isAssociate }, tax));
  await database.transaction('rw', database.tags, async () => {
    await database.tags.bulkPut(put);
    await database.tags.bulkDelete(del);
  });
  return { tagged: put.length, kept, removed: del.length };
}

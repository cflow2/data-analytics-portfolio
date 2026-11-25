/** Applies the rules engine to stored records. Manual and AI tags are never overwritten. */
import { db as defaultDb, type HomeCareDB } from '@/db/db';
import type { ThemeTag } from '@/domain/types';
import { tagRecord } from './engine';
import { getTaxonomy } from './taxonomyStore';

const CHUNK = 250;
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

export interface TagRunResult { tagged: number; kept: number; removed: number }

export async function runRuleTagging(opts: { fws?: number[]; database?: HomeCareDB } = {}): Promise<TagRunResult> {
  const database = opts.database ?? defaultDb;
  const tax = await getTaxonomy(database);
  const locked = new Set((await database.weeks.toArray()).filter((w) => w.locked).map((w) => w.fw));
  const surveys = opts.fws ? await database.surveys.where('fw').anyOf(opts.fws).toArray() : await database.surveys.toArray();
  const ids = surveys.map((s) => s.id);
  const existing = new Map((await database.tags.bulkGet(ids)).filter((t): t is ThemeTag => !!t).map((t) => [t.recordId, t]));
  const put: ThemeTag[] = [];
  const del: string[] = [];
  let kept = 0;
  const consider = (id: string, t: ThemeTag | null) => {
    const prev = existing.get(id);
    if (prev && locked.has(prev.fw)) { kept++; return; } // locked weeks: existing tags are read-only (first tags are still added)
    if (prev && (prev.source === 'Manual' || prev.source === 'AI')) { kept++; return; }
    if (t) put.push(t);
    else if (prev) del.push(id);
  };
  // Work in small chunks and yield between them so the UI never freezes on big imports.
  const jobs: (() => void)[] = surveys.map((s) => () => consider(s.id, tagRecord({ id: s.id, channel: 'survey', fw: s.fw, text: s.comment }, tax)));
  for (let i = 0; i < jobs.length; i += CHUNK) {
    for (const j of jobs.slice(i, i + CHUNK)) j();
    if (i + CHUNK < jobs.length) await yieldToUi();
  }
  await database.transaction('rw', database.tags, async () => {
    await database.tags.bulkPut(put);
    await database.tags.bulkDelete(del);
  });
  return { tagged: put.length, kept, removed: del.length };
}

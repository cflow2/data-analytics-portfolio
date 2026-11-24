import { db } from './db';

/** Per-week survey counts (used to skip partial weeks when picking a default). */
export async function weekCounts(): Promise<Record<number, { surveys: number }>> {
  const out: Record<number, { surveys: number }> = {};
  await db.surveys.each((s) => { (out[s.fw] ??= { surveys: 0 }).surveys++; });
  return out;
}

export async function dataCounts() {
  const [surveys, followups, stores, unmapped, files] = await Promise.all([
    db.surveys.count(), db.followups.count(), db.stores.count(),
    db.stores.filter((s) => !s.district).count(), db.files.count(),
  ]);
  return { surveys, followups, stores, unmapped, files };
}

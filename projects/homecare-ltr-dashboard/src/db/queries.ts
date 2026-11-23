import { db } from './db';

/** Fiscal weeks that have any survey or call data, ascending. */
export async function weeksWithData(): Promise<number[]> {
  const s = (await db.surveys.orderBy('fw').uniqueKeys()) as number[];
  const c = (await db.calls.orderBy('fw').uniqueKeys()) as number[];
  return [...new Set([...s, ...c])].sort((a, b) => a - b);
}

export async function dataCounts() {
  const [surveys, calls, followups, stores, unmapped, files] = await Promise.all([
    db.surveys.count(), db.calls.count(), db.followups.count(), db.stores.count(),
    db.stores.filter((s) => !s.district).count(), db.files.count(),
  ]);
  return { surveys, calls, followups, stores, unmapped, files };
}

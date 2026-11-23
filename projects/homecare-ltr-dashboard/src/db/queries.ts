import { db } from './db';

/** Per-week survey and customer-call counts (used to skip partial weeks when picking a default). */
export async function weekCounts(): Promise<Record<number, { surveys: number; calls: number }>> {
  const out: Record<number, { surveys: number; calls: number }> = {};
  await db.surveys.each((s) => { (out[s.fw] ??= { surveys: 0, calls: 0 }).surveys++; });
  await db.calls.each((c) => { if (!c.isAssociate) (out[c.fw] ??= { surveys: 0, calls: 0 }).calls++; });
  return out;
}

export async function dataCounts() {
  const [surveys, calls, followups, stores, unmapped, files] = await Promise.all([
    db.surveys.count(), db.calls.count(), db.followups.count(), db.stores.count(),
    db.stores.filter((s) => !s.district).count(), db.files.count(),
  ]);
  return { surveys, calls, followups, stores, unmapped, files };
}

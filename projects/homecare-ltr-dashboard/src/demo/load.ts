import { db, type HomeCareDB } from '@/db/db';
import { generateDemoData } from './generate';

/** Writes the DEMO dataset into IndexedDB. Idempotent: ids are deterministic, so re-loading overwrites. */
export async function loadDemoData(database: HomeCareDB = db): Promise<{ surveys: number; calls: number }> {
  const d = generateDemoData();
  await database.transaction('rw', [database.stores, database.surveys, database.calls, database.followups, database.tags, database.weeks, database.signals, database.questions, database.files, database.kv], async () => {
    await database.stores.bulkPut(d.stores);
    await database.surveys.bulkPut(d.surveys);
    await database.calls.bulkPut(d.calls);
    await database.followups.bulkPut(d.followups);
    await database.tags.bulkPut(d.tags);
    await database.weeks.bulkPut(d.weeks);
    await database.signals.bulkPut(d.signals);
    await database.questions.bulkPut(d.questions);
    await database.kv.put({ key: 'reportingWeek', value: 40 });
    await database.files.put({
      id: 'demo', name: 'DEMO data (synthetic)', kind: 'demo', importedAt: new Date().toISOString(),
      rows: d.surveys.length + d.calls.length, kept: d.surveys.length + d.calls.length,
      weeks: [...new Set(d.surveys.map((s) => s.fw))].sort((a, b) => a - b),
      dateRange: [d.surveys.reduce((m, s) => (s.date < m ? s.date : m), '9999'), d.surveys.reduce((m, s) => (s.date > m ? s.date : m), '0000')],
    });
  });
  return { surveys: d.surveys.length, calls: d.calls.length };
}

/** Removes only DEMO records, leaving real uploads untouched. */
export async function removeDemoData(database: HomeCareDB = db): Promise<void> {
  const d = generateDemoData();
  await database.transaction('rw', [database.stores, database.surveys, database.calls, database.followups, database.tags, database.weeks, database.signals, database.questions, database.files, database.kv], async () => {
    await database.surveys.filter((s) => !!s.demo).delete();
    await database.calls.filter((c) => !!c.demo).delete();
    await database.followups.filter((f) => !!f.demo).delete();
    await database.tags.filter((t) => t.source === 'Demo').delete();
    await database.stores.bulkDelete(d.stores.map((s) => s.storeNo));
    await database.signals.bulkDelete(d.signals.map((s) => s.id));
    await database.questions.bulkDelete(d.questions.map((q) => q.id));
    await database.weeks.bulkDelete(d.weeks.map((w) => w.fw));
    await database.files.delete('demo');
    await database.kv.delete('reportingWeek');
  });
}

import { db, type HomeCareDB } from '@/db/db';
import { generateDemoData } from './generate';
import { redact } from '@/ingest/redact';
import { getRedactionRules } from '@/state/privacy';
import type { OriginalText } from '@/domain/types';
import { runRuleTagging } from '@/tagging/run';

/** Writes the DEMO dataset into IndexedDB. Idempotent: ids are deterministic, so re-loading overwrites. */
export async function loadDemoData(database: HomeCareDB = db): Promise<{ surveys: number }> {
  const d = generateDemoData();
  // Demo text goes through the same redaction pass as real uploads.
  const rules = await getRedactionRules(database);
  const originals: OriginalText[] = [];
  const pass = (recordId: string, field: OriginalText['field'], text: string) => {
    if (!text) return { text, uncertain: false };
    const r = redact(text, rules);
    if (r.text !== text || r.uncertain) originals.push({ recordId, field, text });
    return r;
  };
  for (const s of d.surveys) { const r = pass(s.id, 'comment', s.comment); s.comment = r.text; s.source = 'demo'; if (r.uncertain) s.redactionUncertain = true; }
  for (const f of d.followups) { f.comment = pass(f.id, 'comment', f.comment).text; f.insights = pass(f.id, 'insights', f.insights).text; }
  await database.transaction('rw', [database.stores, database.surveys, database.appointments, database.subscriptionWeeks, database.subscriptionSnapshots, database.followups, database.tags, database.weeks, database.questions, database.files, database.kv, database.originals], async () => {
    await database.originals.bulkPut(originals);
    await database.stores.bulkPut(d.stores);
    await database.surveys.bulkPut(d.surveys);
    await database.followups.bulkPut(d.followups);
    await database.appointments.bulkPut(d.appointments);
    await database.subscriptionWeeks.bulkPut(d.subscriptionWeeks);
    await database.subscriptionSnapshots.bulkPut(d.subscriptionSnapshots);
    await database.weeks.bulkPut(d.weeks);
    await database.questions.bulkPut(d.questions);
    await database.kv.put({ key: 'reportingWeek', value: 40 });
    await database.files.put({
      id: 'demo', name: 'DEMO data (synthetic)', kind: 'demo', importedAt: new Date().toISOString(),
      rows: d.surveys.length, kept: d.surveys.length,
      weeks: [...new Set(d.surveys.map((s) => s.fw))].sort((a, b) => a - b),
      dateRange: [d.surveys.reduce((m, s) => (s.date < m ? s.date : m), '9999'), d.surveys.reduce((m, s) => (s.date > m ? s.date : m), '0000')],
    });
  });
  // Demo records are tagged by the same rules engine as real uploads.
  await runRuleTagging({ database });
  return { surveys: d.surveys.length };
}

/** Removes only DEMO records, leaving real uploads untouched. */
export async function removeDemoData(database: HomeCareDB = db): Promise<void> {
  const d = generateDemoData();
  await database.transaction('rw', [database.stores, database.surveys, database.appointments, database.subscriptionWeeks, database.subscriptionSnapshots, database.followups, database.tags, database.weeks, database.questions, database.files, database.kv, database.originals], async () => {
    const ids = [...d.surveys.map((s) => s.id), ...d.followups.map((f) => f.id)];
    await database.originals.where('recordId').anyOf(ids).delete();
    await database.surveys.filter((s) => !!s.demo).delete();
    await database.followups.filter((f) => !!f.demo).delete();
    await database.appointments.filter((a) => !!a.demo).delete();
    await database.subscriptionWeeks.filter((w) => !!w.demo).delete();
    await database.subscriptionSnapshots.filter((w) => !!w.demo).delete();
    await database.tags.bulkDelete(d.surveys.map((x) => x.id));
    await database.stores.bulkDelete(d.stores.map((s) => s.storeNo));
    await database.questions.bulkDelete(d.questions.map((q) => q.id));
    await database.weeks.bulkDelete(d.weeks.map((w) => w.fw));
    await database.files.delete('demo');
    await database.kv.delete('reportingWeek');
  });
}

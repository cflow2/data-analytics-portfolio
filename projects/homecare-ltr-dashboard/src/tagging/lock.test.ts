import { describe, expect, it } from 'vitest';
import { HomeCareDB } from '@/db/db';
import { loadDemoData } from '@/demo/load';
import { setWeekLocked } from '@/ingest/commit';
import { runRuleTagging } from './run';

describe('locked weeks are read-only', () => {
  it('re-tagging skips a locked week', async () => {
    const db = new HomeCareDB('lock-test');
    await loadDemoData(db);
    const one = (await db.tags.where('fw').equals(39).first())!;
    await db.tags.put({ ...one, primary: 'aging' });
    await setWeekLocked(39, true, db);
    await runRuleTagging({ database: db });
    expect((await db.tags.get(one.recordId))!.primary).toBe('aging'); // untouched
    await setWeekLocked(39, false, db);
    await runRuleTagging({ database: db });
    expect((await db.tags.get(one.recordId))!.primary).not.toBe('aging');
  });
});

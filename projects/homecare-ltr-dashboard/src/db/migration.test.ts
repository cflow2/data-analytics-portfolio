import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { HomeCareDB } from './db';

const V1 = {
  surveys: 'id, fw, date, storeNo, region, sourceFile, demo',
  calls: 'id, fw, date, caseNo, driverNorm, isAssociate, storeNo, sourceFile, demo',
  followups: 'id, fw, surveyId, storeNo, sourceFile, demo',
  attributeWeekly: 'id, fw, attr',
  stores: 'storeNo, region, district',
  tags: 'recordId, channel, fw, primary, source',
  originals: '[recordId+field], recordId',
  files: 'id, kind, importedAt',
  weeks: 'fw',
  signals: 'id, theme, firstSeenFw',
  questions: 'id, fw, answered',
  escalations: 'callId, status',
  kv: 'key',
};

describe('database v2 upgrade (surveys only)', () => {
  it('deletes call data once and keeps every survey record', async () => {
    const name = 'migration-test';
    const old = new Dexie(name);
    old.version(1).stores(V1);
    await old.open();
    await old.table('surveys').put({ id: 's1', fw: 40, date: '2026-11-02', storeNo: '1', region: 'R1', ltr: 10, comment: 'Great [name]', sourceFile: 'f' });
    await old.table('calls').put({ id: 'c1', fw: 40, date: '2026-11-02', caseNo: '1', driverNorm: 'x', isAssociate: false, notes: 'n', sourceFile: 'f' });
    await old.table('tags').bulkPut([
      { recordId: 's1', channel: 'survey', fw: 40, primary: 'associate', secondary: [], sentiment: 'Positive', confidence: 1, source: 'Rule' },
      { recordId: 'c1', channel: 'call', fw: 40, primary: 'exclusions', secondary: [], sentiment: 'Negative', confidence: 1, source: 'Rule' },
    ]);
    await old.table('originals').bulkPut([{ recordId: 's1', field: 'comment', text: 'Great Jane' }, { recordId: 'c1', field: 'notes', text: 'call (555)' }]);
    await old.table('files').bulkPut([{ id: 'a', name: 'LTR_Tracker.xlsx', kind: 'tracker', importedAt: '1' }, { id: 'b', name: 'x_HC_Loyalty_Cases.xlsx', kind: 'loyalty-cases', importedAt: '2' }]);
    await old.table('escalations').put({ callId: 'c1', status: 'New', updatedAt: '' });
    await old.table('signals').put({ id: 'sig', signal: 's', theme: 'exclusions', firstSeenFw: 40, status: 'ACT' });
    await old.table('kv').bulkPut([{ key: 'wbr:40', value: {} }, { key: 'ltrSlide:40', value: { fw: 40 } }]);
    old.close();

    const db = new HomeCareDB(name);
    await db.open();
    expect(db.verno).toBe(3);
    expect(db.tables.map((t) => t.name).sort()).not.toContain('calls');
    expect(db.tables.map((t) => t.name)).not.toContain('escalations');
    expect(db.tables.map((t) => t.name)).not.toContain('signals');
    expect(await db.surveys.count()).toBe(1);
    expect((await db.tags.toArray()).map((t) => t.recordId)).toEqual(['s1']);
    expect((await db.originals.toArray()).map((o) => o.recordId)).toEqual(['s1']);
    expect((await db.files.toArray()).map((f) => f.kind)).toEqual(['tracker']);
    expect(await db.kv.get('wbr:40')).toBeUndefined();
    expect(await db.kv.get('ltrSlide:40')).toBeDefined();
    db.close();
  });
});

describe('restoring an older backup', () => {
  it('leaves call data out', async () => {
    const { importBackup } = await import('./backup');
    const db = new HomeCareDB('restore-test');
    await importBackup({ format: 'homecare-ltr-backup', version: 1, exportedAt: '', tables: {
      surveys: [{ id: 's1', fw: 40, date: '2026-11-02', storeNo: '1', region: 'R1', ltr: 10, comment: '', sourceFile: 'f' }],
      calls: [{ id: 'c1' }],
      tags: [{ recordId: 'c1', channel: 'call', fw: 40 }, { recordId: 's1', channel: 'survey', fw: 40 }],
      originals: [{ recordId: 'c1', field: 'notes', text: 'x' }],
      files: [{ id: 'b', kind: 'loyalty-cases', importedAt: '1' }],
    } }, db);
    expect(await db.surveys.count()).toBe(1);
    expect((await db.tags.toArray()).map((t) => t.recordId)).toEqual(['s1']);
    expect(await db.originals.count()).toBe(0);
    expect(await db.files.count()).toBe(0);
  });
});

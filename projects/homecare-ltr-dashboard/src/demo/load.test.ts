import { describe, expect, it } from 'vitest';
import { HomeCareDB } from '@/db/db';
import { loadDemoData, removeDemoData } from './load';
import { exportBackup, importBackup, clearAllData } from '@/db/backup';

describe('demo load / backup round-trip', () => {
  it('loads idempotently, backs up, restores, clears', async () => {
    const db = new HomeCareDB('test-demo');
    const first = await loadDemoData(db);
    await loadDemoData(db);
    expect(await db.surveys.count()).toBe(first.surveys);
    expect(await db.calls.count()).toBe(first.calls);

    const backup = await exportBackup(db);
    expect(backup.tables.surveys.length).toBe(first.surveys);
    await clearAllData(db);
    expect(await db.surveys.count()).toBe(0);
    await importBackup(JSON.parse(JSON.stringify(backup)), db);
    expect(await db.surveys.count()).toBe(first.surveys);

    await removeDemoData(db);
    expect(await db.surveys.count()).toBe(0);
    expect(await db.calls.count()).toBe(0);
    await expect(importBackup({ nope: 1 }, db)).rejects.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { HomeCareDB } from '@/db/db';
import { loadDemoData } from '@/demo/load';
import { runRuleTagging } from './run';
import { addKeyword, getTaxonomy } from './taxonomyStore';

describe('tagging runner', () => {
  it('tags demo records with rules and never overwrites Manual tags', async () => {
    const db = new HomeCareDB('run-test');
    await loadDemoData(db);
    const all = await db.tags.toArray();
    expect(all.length).toBeGreaterThan(2000);
    expect(all.every((t) => t.source === 'Rule' && t.channel === 'survey')).toBe(true);
    const one = all.find((t) => t.fw === 40 && t.channel === 'survey')!;
    await db.tags.put({ ...one, primary: 'aging', source: 'Manual' });
    const r = await runRuleTagging({ fws: [40], database: db });
    expect(r.kept).toBe(1);
    expect((await db.tags.get(one.recordId))!.primary).toBe('aging');
  });
  it('adds keywords to the stored taxonomy once', async () => {
    const db = new HomeCareDB('kw-test');
    expect(await addKeyword('exclusions', 'Sprinkler system', db)).toBe(true);
    expect(await addKeyword('exclusions', 'sprinkler system', db)).toBe(false);
    expect((await getTaxonomy(db)).find((t) => t.id === 'exclusions')!.keywords).toContain('sprinkler system');
  });
});

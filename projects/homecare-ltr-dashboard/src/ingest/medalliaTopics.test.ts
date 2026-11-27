import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { HomeCareDB } from '@/db/db';
import { DEFAULT_FY_START } from '@/lib/fiscal';
import { parseFile, topicGuessFromName } from './parse';
import { commitParsed } from './commit';
import { DEFAULT_REDACTION_RULES } from './redact';
import { defaultTopicWeek } from '@/state/imports';
import { appThemeFor, compareTopics, countsOff, sharedNegatives } from '@/analytics/medalliaTopics';
import type { MedalliaTopic } from '@/domain/types';

const book = (aoa: unknown[][]) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet0'); return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer; };
const req = (name: string, buffer: ArrayBuffer) => ({ fileId: name, name, buffer, fyStart: DEFAULT_FY_START, rules: DEFAULT_REDACTION_RULES, salt: 's', remembered: {} });
const H = ['', 'Impact Score', '# of Responses', '% of Responses', '# Positive', '% Positive', '# Negative', '% Negative'];
// Same layout as the Text Analytics “Top and Bottom Topics” export (fictional counts).
const topBottom = book([
  ['Survey Export'], [], ['Top and Bottom Topics'], [], ['Top Topics'], H,
  ['Associate - Professionalism', 1.59, 31, 21.99, 30, 96.77, 0, 0],
  ['Associate - Customer Service', 0.71, 47, 33.33, 47, 100, 0, 0],
  ['Top and Bottom Topics'], [], ['Bottom Topics'], H,
  ['Electrical - Batteries', -1.29, 4, 2.84, 0, 0, 4, 100],
  ['Plumbing - Water Heaters', -0.49, 6, 4.26, 0, 0, 4, 66.67],
  ['Tools - Hand Tools', -0.67, 1, 0.71, 0, 0, 0, 0],
]);

describe('Medallia Text Analytics topics', () => {
  it('reads both Top and Bottom blocks, the comment base and the division/week in the file name', () => {
    const p = parseFile(req('Top and Bottom Topics FW43 WEST.xlsx', topBottom));
    expect(p.candidate?.kind).toBe('medallia-topics');
    const t = p.build!.medalliaTopics!;
    expect(t.map((x) => [x.section, x.topic, x.responses, x.negative])).toEqual([
      ['top', 'Associate - Professionalism', 31, 0], ['top', 'Associate - Customer Service', 47, 0],
      ['bottom', 'Electrical - Batteries', 4, 4], ['bottom', 'Plumbing - Water Heaters', 6, 4], ['bottom', 'Tools - Hand Tools', 1, 0],
    ]);
    expect(t[0].impact).toBeCloseTo(1.59);
    expect(t[0].base).toBe(141); // 31 ÷ 21.99%
    expect(p.build!.topicGuess).toMatchObject({ division: 'WEST', fw: 43, base: 141 });
  });

  it('a Medallia file name without division or week still parses; the card asks for them', () => {
    const p = parseFile(req('Top and Bottom Topics (60).xlsx', topBottom));
    expect(p.build!.topicGuess!.division).toBeUndefined();
    expect(topicGuessFromName('topics_fw_7_north.xlsx')).toEqual({ division: 'NORTH', fw: 7 });
    expect(topicGuessFromName('Themes Discussed (60).xlsx')).toEqual({});
    expect(topicGuessFromName('Topics-FW07-South.xlsx')).toEqual({ division: 'SOUTH', fw: 7 });
    // Friday counts as the end of its own week; any other day defaults to the last completed week
    expect(defaultTopicWeek('2026-11-27')).toBe(43);
    expect(defaultTopicWeek('2026-11-30')).toBe(43);
    expect(defaultTopicWeek('2026-11-26')).toBe(42);
  });

  it('import needs a division; one export per division and week, and a re-import replaces it', async () => {
    const db = new HomeCareDB('topics-test');
    const p = parseFile(req('Top and Bottom Topics (60).xlsx', topBottom));
    await expect(commitParsed(p, { database: db })).rejects.toThrow(/division/);
    await commitParsed(p, { database: db, topicMeta: { division: 'WEST', fw: 43 } });
    await commitParsed(p, { database: db, topicMeta: { division: 'NORTH', fw: 43 } });
    const smaller = book([['Survey Export'], [], ['Top Topics'], H, ['Associate - Professionalism', 1.2, 10, 50, 10, 100, 0, 0]]);
    const report = await commitParsed(parseFile(req('Top and Bottom Topics.xlsx', smaller)), { database: db, topicMeta: { division: 'WEST', fw: 43 } });
    expect(report.weeks).toEqual({ 43: 1 });
    const all = await db.medalliaTopics.toArray();
    expect(all.filter((t) => t.division === 'WEST').map((t) => t.topic)).toEqual(['Associate - Professionalism']);
    expect(all.filter((t) => t.division === 'NORTH')).toHaveLength(5);
    expect(all[0].id).toMatch(/^43:(NORTH|WEST):/);
  });

  it('maps topics to app themes and flags gaps, small counts and topics negative in several divisions', () => {
    expect(appThemeFor('Associate - Professionalism')).toBe('associate');
    expect(appThemeFor('Account Management - Appointments')).toBe('appointment');
    expect(appThemeFor('Pricing & Discount - Value for Money')).toBe('value');
    expect(appThemeFor('Plumbing - Water Heaters')).toBe('completion');
    expect(appThemeFor('Brand/Store - Overall Satisfaction')).toBeNull();
    // topic names from the real division exports
    expect(appThemeFor('Building Supplies - Ventillation')).toBe('completion'); // dryer vent
    expect(appThemeFor('Merchandise - Cancellations, Returns, and Refunds')).toBe('value');
    expect(appThemeFor('Lighting & Ceiling Fans - Light Bulbs')).toBe('completion');
    expect(appThemeFor('Building Supplies - Roofing')).toBe('completion');
    expect(appThemeFor('Electrical - Fire Safety')).toBe('completion');
    expect(appThemeFor('Filters - Other')).toBe('completion');
    expect(appThemeFor('Appliances - Refrigerators')).toBe('completion');
    expect(appThemeFor('Doors & Windows - Garage Doors')).toBe('completion');
    expect(appThemeFor('Associate - Overall Statisfaction/Employee Recognition')).toBe('associate');
    const t = (division: string, section: MedalliaTopic['section'], topic: string, responses: number, negative: number): MedalliaTopic =>
      ({ id: `43:${division}:${section}:${topic}`, fw: 43, division, section, topic, impact: -1, responses, positive: responses - negative, negative, base: 100, sourceFile: 'x' });
    const c = compareTopics([
      t('WEST', 'bottom', 'Plumbing - Water Heaters', 6, 4), t('NORTH', 'bottom', 'Plumbing - Water Heaters', 5, 3),
      t('WEST', 'bottom', 'Legal Request', 4, 4), t('WEST', 'bottom', 'Tools - Hand Tools', 1, 0), t('SOUTH', 'top', 'Associate - Professionalism', 20, 0),
      { ...t('WEST', 'top', 'Old week', 3, 0), fw: 42 },
    ], [], new Map(), 43);
    expect(c.divisions).toEqual(['SOUTH', 'WEST', 'NORTH']);
    expect(c.rows.find((r) => r.topic === 'Legal Request')!.gap).toBe(true);
    // maps to an app theme, but the app tagged none of this week's comments with it
    expect(c.rows.find((r) => r.topic === 'Plumbing - Water Heaters' && r.division === 'WEST')).toMatchObject({ appTheme: 'completion', appCount: 0, gap: true });
    expect(c.rows.find((r) => r.topic === 'Tools - Hand Tools')!.small).toBe(true);
    expect(c.rows.some((r) => r.topic === 'Old week')).toBe(false);
    expect(sharedNegatives(c.rows)).toEqual([{ topic: 'Plumbing - Water Heaters', divisions: ['WEST', 'NORTH'], negative: 7 }]);
    // a top topic with a few negatives in several divisions is not a shared problem
    const c2 = compareTopics([t('WEST', 'top', 'Associate - Customer Service', 300, 9), t('NORTH', 'top', 'Associate - Customer Service', 200, 4)], [], new Map(), 43);
    expect(sharedNegatives(c2.rows)).toEqual([]);
  });

  it('counts only turn red when far apart (Medallia counts somewhat more than the Tracker)', () => {
    expect(countsOff(130, 100)).toBe('ok');
    expect(countsOff(60, 100)).toBe('low');
    expect(countsOff(500, 10)).toBe('high');
    expect(countsOff(null, 10)).toBeNull();
    expect(countsOff(50, 0)).toBeNull();
  });

  it('a long-range export can be imported as year to date (week 0), and one imported as a week is flagged', async () => {
    const db = new HomeCareDB('topics-ytd');
    const s = (fw: number, i: number) => ({ id: `t${fw}-${i}`, source: 'tracker' as const, fw, date: '2026-11-22', storeNo: '0101', region: 'R1', division: 'NORTH', ltr: 10, comment: 'Great visit', sourceFile: 'x' });
    await db.surveys.bulkPut([...Array.from({ length: 10 }, (_, i) => s(43, i)), ...Array.from({ length: 80 }, (_, i) => s(30, i))]);
    const p = parseFile(req('north-Top_and_Bottom_Topics_6.xlsx', topBottom)); // base 141
    expect(p.build!.topicGuess).toMatchObject({ division: 'NORTH' });
    const asWeek = await commitParsed(p, { database: db, topicMeta: { division: 'NORTH', fw: 43 } });
    expect(asWeek.warnings.join(' ')).toMatch(/longer date range.*Whole export range/);
    const ytd = await commitParsed(p, { database: db, topicMeta: { division: 'NORTH', fw: 0 } });
    expect(ytd.warnings).toEqual([]);
    expect(ytd.info!.join(' ')).toMatch(/Year to date North: Medallia counted about 141 comments; the app has 90/);
    expect(await db.medalliaTopics.where('fw').equals(0).count()).toBe(5);
    const c = compareTopics(await db.medalliaTopics.toArray(), await db.surveys.toArray(), new Map(), 0);
    expect(c.checks).toEqual([{ division: "NORTH", medallia: 141, app: 90, topics: 5 }]);
  });
});

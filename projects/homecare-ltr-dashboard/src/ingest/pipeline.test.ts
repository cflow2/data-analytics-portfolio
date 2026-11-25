import { describe, expect, it, beforeAll } from 'vitest';
import * as XLSX from 'xlsx';
import { HomeCareDB } from '@/db/db';
import { demoFiles, trackerAoa } from '@/demo/files';
import { generateDemoData } from '@/demo/generate';
import { ltrSummary } from '@/lib/ltr';
import { countsForLtr } from '@/domain/survey';
import { DEFAULT_FY_START } from '@/lib/fiscal';
import { parseFile } from './parse';
import { commitParsed } from './commit';
import { DEFAULT_REDACTION_RULES } from './redact';
import { hashBytes } from './normalize';
import type { ParseRequest } from './types';

const demo = generateDemoData();
const files = demoFiles(demo);
const req = (name: string, buffer: ArrayBuffer, extra: Partial<ParseRequest> = {}): ParseRequest => ({
  fileId: hashBytes(buffer), name, buffer, fyStart: DEFAULT_FY_START, rules: DEFAULT_REDACTION_RULES, salt: 'test', remembered: {}, ...extra,
});
const file = (re: RegExp) => files.find((f) => re.test(f.name))!;

describe('parsing real-shaped files', () => {
  it('Tracker: header on row 3, ~300 columns, Score mismatch reported, stores from sheets', () => {
    const p = parseFile(req(file(/Tracker/).name, file(/Tracker/).data));
    expect(p.error).toBeUndefined();
    expect(p.candidate).toMatchObject({ kind: 'tracker', sheet: 'Export Data', headerIndex: 2, missing: [] });
    expect(p.headers.length).toBe(300);
    const b = p.build!;
    expect(b.surveys.length).toBe(demo.surveys.length);
    expect(b.report.scoreMismatches).toHaveLength(1);
    expect(b.report.fwMismatches).toBe(0);
    expect(b.stores.length).toBe(demo.stores.length);
    expect(b.stores.filter((s) => !s.district).length).toBe(5);
    expect(b.followups.length).toBeGreaterThan(0);
    const fw40 = ltrSummary(b.surveys.filter((s) => s.fw === 40).map((s) => s.ltr));
    expect([fw40.n, fw40.pct!.toFixed(1), fw40.detractors, fw40.detractors0to6]).toEqual([131, '94.7', 7, 2]);
  });

  it('redacts PII in survey comments and keeps originals separately', () => {
    const b = parseFile(req(file(/Tracker/).name, file(/Tracker/).data)).build!;
    const comments = b.surveys.map((x) => x.comment).join('\n');
    expect(comments).not.toMatch(/\(555\)|555-01\d|Jane Sample/);
    expect(comments).toMatch(/\[name\]|\[phone\]/);
    expect(b.originals.map((o) => o.text).join('\n')).toMatch(/555/);
  });

  it('a renamed column triggers mapping; the remembered mapping is applied next time', () => {
    const aoa = [['date', 'rating', 'comment'], ['11/2/2026', 9, 'Great visit']];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const first = parseFile(req('Customer_Commentary_renamed.xlsx', buf));
    expect(first.candidate?.kind).toBe('commentary');
    expect(first.candidate?.missing).toEqual(['ltr']);
    expect(first.build).toBeUndefined();
    const second = parseFile(req('Customer_Commentary_renamed.xlsx', buf, { remembered: { commentary: { ltr: 'rating' } } }));
    expect(second.candidate?.missing).toEqual([]);
    expect(second.build!.surveys).toHaveLength(1);
  });

  it('10,000 survey rows parse in under 3 seconds', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => ({ ...demo.surveys[i % demo.surveys.length], id: `P${i}` }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trackerAoa(many)), 'Export Data');
    const tBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;
    const t0 = performance.now();
    const a = parseFile(req('LTR_Tracker_big.xlsx', tBuf));
    const ms = performance.now() - t0;
    expect(a.build!.surveys.length).toBe(10_000);
    console.info(`parse 10k surveys: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(3000);
  }, 60_000);
});

describe('import pipeline end to end (demo files → IndexedDB)', () => {
  const db = new HomeCareDB('pipeline-test');
  const reports: Record<string, Awaited<ReturnType<typeof commitParsed>>> = {};

  beforeAll(async () => {
    // Medallia first (before the Tracker) to prove later folding works.
    const order = [/Responses/, /Tracker/, /Commentary/, /^Analytics/, /^FW40/, /Store_District/];
    for (const re of order) {
      for (const f of files.filter((x) => re.test(x.name))) {
        const p = parseFile(req(f.name, f.data));
        reports[f.name] = await commitParsed(p, { database: db });
      }
    }
  }, 60_000);

  it('reproduces the FW40 baselines from files', async () => {
    const surveys = (await db.surveys.where('fw').equals(40).toArray()).filter(countsForLtr);
    const s = ltrSummary(surveys.map((x) => x.ltr));
    expect([s.n, s.pct!.toFixed(1), s.detractors, s.detractors0to6]).toEqual([131, '94.7', 7, 2]);
    const fytd = ltrSummary((await db.surveys.where('fw').between(1, 40, true, true).toArray()).filter(countsForLtr).map((x) => x.ltr));
    expect([fytd.n, fytd.pct!.toFixed(1)]).toEqual([3736, '93.1']);
  });

  it('merges Medallia attributes and commentary into Tracker surveys (no duplicate surveys)', async () => {
    const all = await db.surveys.toArray();
    expect(all.filter((s) => !countsForLtr(s)).length).toBe(0);
    const fw40 = all.filter((s) => s.fw === 40);
    expect(fw40.filter((s) => s.attrs?.scheduling !== undefined).length).toBe(119);
    expect(reports['Customer_Commentary_DEMO.xlsx'].merged).toBeGreaterThan(80);
    // Medallia Analytics (real layout, FW40 by days): nine attributes + LTR
    const aw = await db.attributeWeekly.where('fw').equals(40).toArray();
    expect(aw).toHaveLength(10);
    expect(Math.abs(aw.find((a) => a.attr === 'scheduling')!.pct - 87.4)).toBeLessThan(1.5);
    const check = reports['Analytics - 2026-11-09T101500.000.xlsx'].medalliaLtrCheck!;
    expect(check).toHaveLength(1);
    expect(check[0]).toMatchObject({ fw: 40, medalliaN: 131, trackerN: 131 });
    expect(check[0].medalliaPct).toBeCloseTo(check[0].trackerPct!, 1);
  });

  it('follow-up cross-check names the surveys missing from the follow-up file', () => {
    const fc = reports['FW40_DEMO.xlsx'].followupCheck!.find((c) => c.fw === 40)!;
    expect(fc.trackerNonPromoters).toBe(7);
    expect(fc.inFile).toBe(5);
    expect(fc.documented).toBe(3);
    expect(fc.emailOnly).toBe(2);
    expect(fc.missing).toHaveLength(2); // surveys absent from the follow-up file
    expect(fc.missing.every((m) => m.score !== null && m.score < 9)).toBe(true);
  });

  it('uploading the same files again does not duplicate records', async () => {
    const before = [await db.surveys.count(), await db.followups.count()];
    for (const f of files.filter((x) => /Tracker|^FW40/.test(x.name))) {
      const p = parseFile(req(f.name, f.data));
      const r = await commitParsed(p, { database: db });
      expect(r.alreadyLoaded).toBe(r.rowsKept);
    }
    expect([await db.surveys.count(), await db.followups.count()]).toEqual(before);
  }, 60_000);

  it('unmapped stores are reported', async () => {
    expect((await db.stores.filter((s) => !s.district).count())).toBe(5);
  });
});

describe('analytics wide layout', () => {
  it('reads one-row-per-attribute, one-column-per-week reports', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Driver report'], ['Attribute', 'FW39', 'FW40'],
      ['Value for money', 0.93, 0.926], ['Ease of scheduling', '88.1%', '87.4%'], ['Associate professionalism', 96, 96.1], ['Quality of services', 95, 95.2],
    ]), 'Sheet1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const p = parseFile(req('Analytics_wide.xlsx', buf));
    expect(p.candidate?.kind).toBe('medallia-analytics');
    const aw = p.build!.attributeWeekly;
    expect(aw).toHaveLength(8);
    expect(aw.find((a) => a.id === '40:scheduling')!.pct).toBeCloseTo(87.4);
    expect(aw.find((a) => a.id === '39:value')!.pct).toBeCloseTo(93);
  });
});

describe('real Detractors tab layout (made-up names)', () => {
  it('parses, redacts staff names, classifies follow-up and flags FQ', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['LL', 'Score', 'Comment', 'Store', 'SM', 'Insights', 'Region', 'FW', 'FQ', 'FP'],
      ['11/11/26', 0, 'This is a complete waste of time.', 502, 'Pat Example', 'Pat Example reviewed the concerns. Sam Sample reviewed the visit with the associate, Alex Demo. Sam Sample also contacted the customer and apologized.', 27, 41, 3, 10],
      ['11/10/26', 7, '"The associate craftsmanship was top tier."', 2207, 'Jordan Placeholder', 'Email Sent to SM', 3, 41, 3, 10],
      ['11/09/26', 7, 'I wanted my water tank heater flushed.', 268, 'Casey Testcase', 'I will call the customer and get their feedback.', 5, 41, 3, 10],
      ['11/09/26', 5, 'No Comment', 2544, 'Riley Sample', 'Store Manager Riley Sample reviewed the detractor with technician Drew Example. Leadership believes it was a scope misunderstanding.', 18, 41, 3, 10],
    ]), 'Detractors');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const p = parseFile(req('FW41.xlsx', buf));
    expect(p.candidate).toMatchObject({ kind: 'followup', headerIndex: 0, missing: [] });
    const f = p.build!.followups;
    expect(f.map((x) => x.status)).toEqual(['Documented', 'Email only', 'Email only', 'Email only']);
    expect(f.map((x) => x.storeNo)).toEqual(['0502', '2207', '0268', '2544']);
    expect(f.map((x) => x.region)).toEqual(['R27', 'R3', 'R5', 'R18']);
    expect(f[3].comment).toBe('');
    const insights = f.map((x) => x.insights).join(' ');
    expect(insights).not.toMatch(/Pat|Sam Sample|Alex Demo|Riley|Drew Example/);
    expect(p.build!.report.warnings.join(' ')).toMatch(/FQ column differs from the fiscal calendar on 4 row\(s\) \(FW41: file FQ 3, calendar Q4\)/);
    expect(p.build!.report.warnings.join(' ')).not.toMatch(/FP column/);
  });
});

describe('a newer Tracker restates past weeks', () => {
  it('removes Tracker surveys the newer file no longer contains, and reports them by week', async () => {
    const db = new HomeCareDB('restate-test');
    const all = demo.surveys.filter((s) => s.fw <= 41).map((s) => ({ ...s, demo: undefined }));
    const tracker = (rows: typeof all, name: string) => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trackerAoa(rows)), 'Export Data');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      return parseFile(req(name, buf));
    };
    await commitParsed(tracker(all, 'LTR_Tracker1116.xlsx'), { database: db });
    const fw39 = all.filter((s) => s.fw === 39);
    const dropped = new Set(fw39.slice(0, 23).map((s) => s.id));
    const newer = all.filter((s) => !dropped.has(s.id));
    const r = await commitParsed(tracker(newer, 'LTR_Tracker1123.xlsx'), { database: db });
    expect(r.removedFromTracker).toEqual([{ fw: 39, count: 23 }]);
    expect(r.warnings.join(' ')).toMatch(/23 surveys from an earlier Tracker/);
    expect(await db.surveys.where('fw').equals(39).count()).toBe(fw39.length - 23);
    // A Tracker covering fewer days never removes surveys dated after its last survey.
    const older = all.filter((s) => s.fw <= 38);
    const r2 = await commitParsed(tracker(older, 'LTR_Tracker_old.xlsx'), { database: db });
    expect(r2.removedFromTracker).toBeUndefined();
    expect(await db.surveys.where('fw').equals(40).count()).toBe(all.filter((s) => s.fw === 40).length);
  }, 60_000);
});

import { describe, expect, it, beforeAll } from 'vitest';
import * as XLSX from 'xlsx';
import { HomeCareDB } from '@/db/db';
import { demoFiles, trackerAoa } from '@/demo/files';
import { generateDemoData } from '@/demo/generate';
import { ltrSummary } from '@/lib/ltr';
import { countsForLtr } from '@/domain/survey';
import { DEFAULT_FY_START } from '@/lib/fiscal';
import { parseFile, defaultTargetWeek } from './parse';
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

  it('Loyalty Cases: mixed sheet names, text dates, Case # with newlines, day-before rows', () => {
    const loyalty = files.filter((f) => /Loyalty/.test(f.name));
    expect(loyalty).toHaveLength(6);
    for (const f of loyalty) {
      const p = parseFile(req(f.name, f.data));
      expect(p.candidate?.kind).toBe('loyalty-cases');
      expect(p.build!.calls.every((c) => !/\s/.test(c.caseNo))).toBe(true);
    }
    const range = parseFile(req(file(/10\.30-11\.1/).name, file(/10\.30-11\.1/).data));
    expect(Object.keys(range.build!.report.weeks).map(Number).sort()).toEqual([39, 40]);
    expect(defaultTargetWeek(range.build!.report.weeks, 40)).toBe(40);
    expect(range.build!.report.driverMapping!.some((m) => m.original === 'Genearl Program Inquiries')).toBe(true);
  });

  it('redacts PII in call notes and keeps originals separately', () => {
    const all = files.filter((f) => /Loyalty/.test(f.name)).map((f) => parseFile(req(f.name, f.data)).build!);
    const notes = all.flatMap((b) => b.calls.map((c) => c.notes)).join('\n');
    expect(notes).not.toMatch(/\(555\)|555-01\d|@example\.com|Jane Sample|Sample Creek Rd|2000\d{8}/);
    expect(notes).toMatch(/\[name\]|\[phone\]/);
    const originals = all.flatMap((b) => b.originals.map((o) => o.text)).join('\n');
    expect(originals).toMatch(/555/);
  });

  it('a renamed column triggers mapping; the remembered mapping is applied next time', () => {
    const aoa = [['Call Date', 'Reason Code', 'Case #', 'Case Notes'], ['11/2/2026', 'Cancel Subscription', 'X1', 'Problem / Reason for Calling: cancel']];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const first = parseFile(req('11.2.2026_HC_Loyalty_Cases.xlsx', buf));
    expect(first.candidate?.kind).toBe('loyalty-cases');
    expect(first.candidate?.missing).toEqual(['driver']);
    expect(first.build).toBeUndefined();
    const second = parseFile(req('11.2.2026_HC_Loyalty_Cases.xlsx', buf, { remembered: { 'loyalty-cases': { driver: 'reason code' } } }));
    expect(second.candidate?.missing).toEqual([]);
    expect(second.build!.calls).toHaveLength(1);
  });

  it('10,000 survey rows + 2,000 call rows parse in under 3 seconds', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => ({ ...demo.surveys[i % demo.surveys.length], id: `P${i}` }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trackerAoa(many)), 'Export Data');
    const tBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;
    const calls = Array.from({ length: 2000 }, (_, i) => demo.calls[i % demo.calls.length]);
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([['Call Date', 'Call Driver', 'Case #', 'Case Notes'], ...calls.map((c, i) => [c.date, c.driver, `${c.caseNo}-${i}`, c.notes])]), 'Sheet1');
    const cBuf = XLSX.write(wb2, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;
    const t0 = performance.now();
    const a = parseFile(req('LTR_Tracker_big.xlsx', tBuf));
    const b = parseFile(req('big_HC_Loyalty_Cases.xlsx', cBuf));
    const ms = performance.now() - t0;
    expect(a.build!.surveys.length).toBe(10_000);
    expect(b.build!.calls.length).toBe(2000);
    console.info(`parse 10k surveys + 2k calls: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(3000);
  }, 60_000);
});

describe('import pipeline end to end (demo files → IndexedDB)', () => {
  const db = new HomeCareDB('pipeline-test');
  const reports: Record<string, Awaited<ReturnType<typeof commitParsed>>> = {};

  beforeAll(async () => {
    // Medallia first (before the Tracker) to prove later folding works.
    const order = [/Responses/, /Tracker/, /Commentary/, /^Analytics/, /Loyalty/, /^FW40/, /Store_District/];
    for (const re of order) {
      for (const f of files.filter((x) => re.test(x.name))) {
        const p = parseFile(req(f.name, f.data));
        const target = p.build?.kind === 'loyalty-cases' ? 40 : undefined;
        reports[f.name] = await commitParsed(p, { targetWeek: target, database: db });
      }
    }
  }, 60_000);

  it('reproduces the FW40 baselines from files', async () => {
    const surveys = (await db.surveys.where('fw').equals(40).toArray()).filter(countsForLtr);
    const s = ltrSummary(surveys.map((x) => x.ltr));
    expect([s.n, s.pct!.toFixed(1), s.detractors, s.detractors0to6]).toEqual([131, '94.7', 7, 2]);
    const fytd = ltrSummary((await db.surveys.where('fw').between(1, 40, true, true).toArray()).filter(countsForLtr).map((x) => x.ltr));
    expect([fytd.n, fytd.pct!.toFixed(1)]).toEqual([3736, '93.1']);
    const calls = await db.calls.where('fw').equals(40).toArray();
    const customer = calls.filter((c) => !c.isAssociate);
    expect(customer.length).toBe(340);
    expect(new Set(customer.map((c) => c.caseNo)).size).toBe(309);
    expect(calls.length - customer.length).toBe(36);
    expect(await db.calls.where('fw').equals(39).count()).toBe(0);
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

  it('drops calls outside the selected week and reports it', () => {
    const r = reports['10.30-11.1.2026_HC_Loyalty_Cases_DEMO.xlsx'];
    expect(r.targetWeek).toBe(40);
    expect(r.outsideWeek).toBeGreaterThan(0);
    expect(r.dropped['Dated outside FW40']).toBe(r.outsideWeek);
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
    const before = [await db.surveys.count(), await db.calls.count(), await db.followups.count()];
    for (const f of files.filter((x) => /Tracker|Loyalty|^FW40/.test(x.name))) {
      const p = parseFile(req(f.name, f.data));
      const r = await commitParsed(p, { targetWeek: p.build?.kind === 'loyalty-cases' ? 40 : undefined, database: db });
      expect(r.alreadyLoaded).toBe(r.rowsKept);
    }
    expect([await db.surveys.count(), await db.calls.count(), await db.followups.count()]).toEqual(before);
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

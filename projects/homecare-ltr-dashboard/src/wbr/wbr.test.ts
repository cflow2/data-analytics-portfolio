import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { demoDataset } from '@/test/demoDataset';
import { generateDemoData } from '@/demo/generate';
import { weekFacts } from '@/analytics/facts';
import { DEFAULT_THRESHOLDS } from '@/lib/ltr';
import { DEFAULT_FY_START } from '@/lib/fiscal';
import { chartRows, defaultDraft, niceMax, slideText, MAX_THEMES } from './draft';
import { canExport, preflight } from './preflight';
import { buildNotes } from './notes';
import { buildPptx } from './pptx';

const ds = demoDataset();
const f = weekFacts(ds, 40, 93, DEFAULT_THRESHOLDS);
const demo = generateDemoData();
const questions = demo.questions; // two open FW39 questions
const notes = buildNotes({ ds, f, headline: 'Members love the visit. The friction is getting it booked and getting it finished.', thresholds: DEFAULT_THRESHOLDS, questions, pinnedAsk: [] });
const opts = { pendingReview: 0, openQuestions: questions.length, daysWithCalls: 7 };

describe('WBR draft', () => {
  const d = defaultDraft(f, ds.taxonomy, DEFAULT_FY_START);
  it('title, subtitle with n, themes, callout, chart', () => {
    expect(d.title).toBe('Customer Insights FW40');
    expect(d.subtitle).toBe('LTR 94.7% (n=131) · above the 93% benchmark · FW40 Oct 31–Nov 6');
    const inc = d.themes.filter((t) => t.include);
    expect(inc.length).toBeLessThanOrEqual(MAX_THEMES);
    expect(inc.map((t) => t.id)).toContain('damage');
    expect(inc[0].header).toBe('Appointment management: 82 mentions · 76 calls · 6 surveys');
    expect(d.callout).toBe('FW40 Detractors: 7 of 131 — 3 of 7 cite service scope, the same driver behind 44% of cancellation calls.');
    const cr = chartRows(f, d);
    expect(cr.map((r) => r.total)).toEqual([...cr.map((r) => r.total)].sort((a, b) => b - a));
    expect(niceMax(82)).toBe(90);
    expect(niceMax(80)).toBe(90);
    expect(niceMax(140)).toBe(160);
    expect(niceMax(13)).toBe(15);
  });
  it('speaker notes open with last week’s questions, answered from this week’s data', () => {
    expect(notes.startsWith('Last week I was asked about…')).toBe(true);
    expect(notes).toMatch(/Leadership asked for detractor detail[\s\S]*→ 7 detractors \(0–8\) of n=131/);
    expect(notes).toMatch(/How many cancellations are exclusion-driven\?\n {2}→ 41 cancellation calls/);
    expect(notes).toMatch(/Handle offline:/);
  });
  it('pre-flight passes on the generated draft', () => {
    const c = preflight(d, f, notes, opts);
    expect(c.filter((x) => !x.pass).map((x) => `${x.id}: ${x.detail}`)).toEqual([]);
    expect(canExport(c)).toBe(true);
  });
  it('blocks long lines, wrong numbers, LTR without n and PII until overridden', () => {
    const bad = structuredClone(d);
    bad.themes[0].line = 'x'.repeat(90);
    bad.themes[1].line = 'Exclusions drove 19 of 41 cancellations (46%)';
    bad.callout = 'LTR was 94.7% this week. Spoke with Jane Smith at (704) 555-1234.';
    const c = preflight(bad, f, notes, opts);
    const failed = c.filter((x) => !x.pass).map((x) => x.id);
    expect(failed).toEqual(expect.arrayContaining(['length', 'numbers', 'ltr-n', 'pii']));
    expect(canExport(c)).toBe(false);
    bad.overrides = failed.map((id) => ({ check: id, reason: 'QA override', at: '' }));
    expect(canExport(preflight(bad, f, notes, opts))).toBe(true);
  });
  it('flags missing days and unanswered questions', () => {
    const c = preflight(d, f, 'no questions section', { pendingReview: 3, openQuestions: 2, daysWithCalls: 5 });
    expect(c.filter((x) => !x.pass).map((x) => x.id).sort()).toEqual(['complete', 'questions', 'review']);
  });
});

describe('PPTX export', () => {
  it('one slide, native chart, speaker notes, and no unredacted text anywhere', async () => {
    const d = defaultDraft(f, ds.taxonomy, DEFAULT_FY_START);
    const buf = (await buildPptx(d, f, notes).write({ outputType: 'nodebuffer' })) as Buffer;
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files);
    expect(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(1);
    expect(names.some((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))).toBe(true);
    const notesXml = await zip.file(names.find((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n))!)!.async('string');
    expect(notesXml).toMatch(/Last week I was asked about/);
    const slideXml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(slideXml).toMatch(/Customer Insights FW40/);
    expect(slideXml).toMatch(/7 of 131/);
    // Scan every XML part for the demo's raw PII (originals) and generic PII patterns.
    const raw = demo.calls.map((c) => c.notes).join('\n');
    const piiSamples = [...raw.matchAll(/CX ([A-Z][a-z]+ [A-Z][a-z]+)|\((555)\) 01\d-\d{4}|[\w.]+@example\.com/g)].map((m) => m[0]);
    expect(piiSamples.length).toBeGreaterThan(0);
    for (const n of names.filter((x) => x.endsWith('.xml'))) {
      const xml = await zip.file(n)!.async('string');
      for (const p of piiSamples) expect(xml.includes(p)).toBe(false);
      expect(xml).not.toMatch(/\(\d{3}\) \d{3}-\d{4}|@example\.com|Jane Sample|DEMO SM/);
    }
    expect(slideText(d)).not.toMatch(/\[name\]|@/);
  });
});

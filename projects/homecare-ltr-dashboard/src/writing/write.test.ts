import { describe, expect, it } from 'vitest';
import { demoDataset } from '@/test/demoDataset';
import { weekFacts } from '@/analytics/facts';
import { DEFAULT_THRESHOLDS } from '@/lib/ltr';
import { DEFAULT_TAXONOMY } from '@/domain/taxonomy';
import { allowedForTheme, percentsForTheme, ltrCallout, speakerNotes, themeHeader, themeLine, whatChangedSummary, LINE_LIMIT } from './write';
import { verifyNumbers, DOMAIN_CONSTANTS } from './verify';

const ds = demoDataset();
const f = weekFacts(ds, 40, 93, DEFAULT_THRESHOLDS);
const verified = (text: string) => verifyNumbers(text, f.numbers, [...DOMAIN_CONSTANTS, 93, 40, 39]).filter((h) => !h.ok).map((h) => h.text);

describe('rule-based writing (demo FW40)', () => {
  it('LTR callout matches the brief’s example', () => {
    expect(ltrCallout(f)).toBe('FW40 Detractors: 7 of 131 — 3 of 7 cite service scope, the same driver behind 44% of cancellation calls.');
  });
  it('theme headers use the slide format with the channel split', () => {
    expect(themeHeader('appointment', f, DEFAULT_TAXONOMY)).toBe('Appointment management: 82 mentions · 76 calls · 6 surveys');
    expect(themeHeader('associate', f, DEFAULT_TAXONOMY)).toBe('Associate experience: 80 mentions · 8 calls · 72 surveys');
  });
  it('theme lines fit one line (≤85 chars) and every number verifies', () => {
    for (const t of DEFAULT_TAXONOMY.filter((x) => x.id !== 'other')) {
      const line = themeLine(t.id, f);
      expect(line.length).toBeLessThanOrEqual(LINE_LIMIT);
      expect(verified(line)).toEqual([]);
      expect(verifyNumbers(line, allowedForTheme(t.id, f), [], percentsForTheme(t.id, f)).filter((h) => !h.ok)).toEqual([]);
    }
    expect(themeLine('exclusions', f)).toBe('Exclusions drove 18 of 41 cancellations (44%)');
    expect(themeLine('appointment', f)).toBe('30 of 76 calls are online/app failures; Ease of scheduling is lowest at 87.4%');
  });
  it('what-changed summary and speaker notes verify', () => {
    const s = whatChangedSummary(f, DEFAULT_TAXONOMY);
    expect(s).toMatch(/^LTR rose 0\.8 pts to 94\.7% \(n=131\) from 93\.9% \(n=131\)\./);
    expect(verified(s)).toEqual([]);
    const notes = speakerNotes({ facts: f, tax: DEFAULT_TAXONOMY, headline: 'Members love the visit.', questions: [{ q: { id: 'q', fw: 39, question: 'Detractor detail?', answered: false, createdAt: '' }, answer: '7 of 131 detractors; 3 cite service scope.' }] });
    expect(notes.startsWith('Last week I was asked about…')).toBe(true);
    expect(notes).toMatch(/Counts are calls, not unique members/);
    expect(notes).toMatch(/Handle offline:\n• Post-service damage escalations/);
    expect(verified(notes)).toEqual([]);
  });
  it('a hand-edited wrong number is flagged', () => {
    const bad = verifyNumbers('Exclusions drove 19 of 41 cancellations (46%)', allowedForTheme('exclusions', f), [], percentsForTheme('exclusions', f)).filter((h) => !h.ok).map((h) => h.text);
    expect(bad).toEqual(['19', '46%']);
  });
});

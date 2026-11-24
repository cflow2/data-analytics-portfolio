import { describe, expect, it } from 'vitest';
import { generateDemoData } from '@/demo/generate';
import { redact } from '@/ingest/redact';
import { themeMentions } from '@/analytics/voc';
import type { ThemeTag } from '@/domain/types';
import { compileKeyword, sentimentOf, tagRecord } from './engine';

const d = generateDemoData();
const tags: ThemeTag[] = [];
for (const s of d.surveys) { const t = tagRecord({ id: s.id, channel: 'survey', fw: s.fw, text: redact(s.comment).text }); if (t) tags.push(t); }
const byId = new Map(tags.map((t) => [t.recordId, t]));

describe('rules engine reproduces the demo baselines', () => {
  it('FW40 survey mentions: Associate 72, Value 9 (7+/2−), Appointment 6, Exclusions 4, Completion 1', () => {
    const m = new Map(themeMentions(tags, 40).map((x) => [x.theme, x]));
    expect(m.get('associate')!.surveys).toBe(72);
    expect(m.get('value')).toMatchObject({ surveys: 9, surveysPos: 7, surveysNeg: 2 });
    expect(m.get('appointment')!.surveys).toBe(6);
    expect(m.get('exclusions')!.surveys).toBe(4);
    expect(m.get('completion')!.surveys).toBe(1);
  });

  it('every demo comment matches the generator’s theme set', () => {
    let mismatches = 0;
    for (const tr of d.tags) {
      const t = byId.get(tr.recordId)!;
      if ([t.primary, ...t.secondary].sort().join() !== [tr.primary, ...tr.secondary].sort().join()) mismatches++;
    }
    expect(mismatches).toBe(0);
  });

  it('FW40 detractor root causes: exclusions 3, appointment 2, completion 1, value 1', () => {
    const det = d.surveys.filter((s) => s.fw === 40 && s.ltr! < 9).map((s) => byId.get(s.id)!.primary);
    const count = (k: string) => det.filter((x) => x === k).length;
    expect([count('exclusions'), count('appointment'), count('completion'), count('value')]).toEqual([3, 2, 1, 1]);
  });

  it('never tags blank comments', () => {
    expect(d.surveys.filter((s) => !s.comment).every((s) => !byId.has(s.id))).toBe(true);
    expect(tagRecord({ id: 'x', channel: 'survey', fw: 40, text: '   ' })).toBeNull();
    expect(tagRecord({ id: 'x', channel: 'survey', fw: 40, text: '[name]' })).toBeNull();
  });
});

describe('rules engine details', () => {
  it('keywords: phrases, prefixes, regex', () => {
    expect(compileKeyword('schedul*')!.re.test('Rescheduling was hard')).toBe(false);
    expect(compileKeyword('schedul*')!.re.test('scheduling was hard')).toBe(true);
    expect(compileKeyword('/no (one|body) came/')!.re.test('No one came')).toBe(true);
    expect(compileKeyword('12 ft')!.weight).toBe(2);
  });
  it('associate theme needs a quality word, not just the word “associate”', () => {
    expect(tagRecord({ id: 'a', channel: 'survey', fw: 1, text: 'The associate did not bring the filter.' })!.primary).toBe('completion');
    expect(tagRecord({ id: 'a', channel: 'survey', fw: 1, text: 'The associate did not bring the filter.' })!.secondary).not.toContain('associate');
    expect(tagRecord({ id: 'b', channel: 'survey', fw: 1, text: '[name] was amazing and very thorough.' })!.primary).toBe('associate');
  });
  it('precedence: damage beats everything; failures beat praise', () => {
    const t = tagRecord({ id: 'c', channel: 'survey', fw: 1, text: 'Friendly tech, but the water heater is leaking since the flush.' })!;
    expect(t.primary).toBe('damage');
    expect(t.escalate).toBe(true);
    expect(tagRecord({ id: 'd', channel: 'survey', fw: 1, text: 'Great associate, but nobody showed up the first time.' })!.primary).toBe('appointment');
  });
  it('associate praise vs concern is judged on the associate words, not the whole comment', () => {
    const t = tagRecord({ id: 'h', channel: 'survey', fw: 1, text: 'The RedVest Associate was friendly but could not do the roof vented dryer vent.' })!;
    expect(t).toMatchObject({ primary: 'exclusions', secondary: ['associate'], confidence: 0.75 });
    expect(tagRecord({ id: 'i', channel: 'survey', fw: 1, text: 'The tech was rude and rushed.' })).toMatchObject({ primary: 'associate', subTag: 'Concern' });
  });
  it('sentiment is text-only and weighs the clause after “but”', () => {
    expect(sentimentOf('Great associate, but the price went up and I am on the fence.')).toBe('Negative');
    expect(sentimentOf('Worth every penny for the peace of mind.')).toBe('Positive');
    expect(sentimentOf('Not sure it is worth $99 a year.')).toBe('Negative');
  });
  it('low-confidence cases go to review', () => {
    expect(tagRecord({ id: 'f', channel: 'survey', fw: 1, text: 'Great service, thank you!' })).toMatchObject({ primary: 'other', confidence: 0.8 });
    expect(tagRecord({ id: 'g', channel: 'survey', fw: 1, text: 'The whole thing with the porch and the garage door was a long story that went nowhere at all.' })!.confidence).toBeLessThan(0.7);
  });
});

import { describe, expect, it } from 'vitest';
import { generateDemoData } from '@/demo/generate';
import { redact } from '@/ingest/redact';
import { themeMentions } from '@/analytics/voc';
import type { ThemeTag } from '@/domain/types';
import { callOutcome, compileKeyword, isCancellation, sentimentOf, splitCallNotes, tagRecord } from './engine';

const d = generateDemoData();
const tags: ThemeTag[] = [];
for (const s of d.surveys) { const t = tagRecord({ id: s.id, channel: 'survey', fw: s.fw, text: s.comment }); if (t) tags.push(t); }
for (const c of d.calls) { const t = tagRecord({ id: c.id, channel: 'call', fw: c.fw, text: redact(c.notes).text, driver: c.driver, isAssociate: c.isAssociate }); if (t) tags.push(t); }
const byId = new Map(tags.map((t) => [t.recordId, t]));
const customer = (fw: number) => d.calls.filter((c) => c.fw === fw && !c.isAssociate);
const callTags = (fw: number) => customer(fw).map((c) => byId.get(c.id)!);

describe('rules engine reproduces the demo baselines', () => {
  it('FW40 survey mentions: Associate 72, Value 9 (7+/2−), Appointment 6, Exclusions 4, Completion 1', () => {
    const custIds = new Set(d.calls.filter((c) => !c.isAssociate).map((c) => c.id));
    const m = new Map(themeMentions(tags, 40, custIds).map((x) => [x.theme, x]));
    expect(m.get('associate')!.surveys).toBe(72);
    expect(m.get('value')).toMatchObject({ surveys: 9, surveysPos: 7, surveysNeg: 2 });
    expect(m.get('appointment')!.surveys).toBe(6);
    expect(m.get('exclusions')!.surveys).toBe(4);
    expect(m.get('completion')!.surveys).toBe(1);
  });

  it('FW40 calls: appointment 76 (30/19/12/11/4), exclusions 42, completion 22, damage 13', () => {
    const t = callTags(40);
    const sub = (s: string) => t.filter((x) => x.primary === 'appointment' && x.subTag === s).length;
    expect(t.filter((x) => x.primary === 'appointment')).toHaveLength(76);
    expect([sub('Online/app failure'), sub('No-show/missed'), sub('Auto-cancel'), sub('Cancelled by store/Lowe’s'), sub('Arrival-time request')]).toEqual([30, 19, 12, 11, 4]);
    expect(t.filter((x) => x.primary === 'exclusions')).toHaveLength(42);
    expect(t.filter((x) => x.primary === 'completion')).toHaveLength(22);
    expect(t.filter((x) => x.primary === 'damage')).toHaveLength(13);
    expect(t.filter((x) => x.escalate)).toHaveLength(13);
  });

  it('cancellations: FW40 41 / 18 exclusion-driven; FW38 41 / 20', () => {
    for (const [fw, total, excl] of [[40, 41, 18], [38, 41, 20]]) {
      const c = callTags(fw).filter((x) => x.cancellation);
      expect(c).toHaveLength(total);
      expect(c.filter((x) => x.primary === 'exclusions' && x.subTag === 'Exclusion drove cancel')).toHaveLength(excl);
    }
  });

  it('every demo record matches the generator’s truth on primary/subtag (calls) and theme set (surveys)', () => {
    let mismatches = 0;
    for (const tr of d.tags) {
      const t = byId.get(tr.recordId)!;
      if (tr.channel === 'call') { if (t.primary !== tr.primary || (t.subTag ?? '') !== (tr.subTag ?? '') || !!t.cancellation !== !!tr.cancellation) mismatches++; }
      else if ([t.primary, ...t.secondary].sort().join() !== [tr.primary, ...tr.secondary].sort().join()) mismatches++;
    }
    expect(mismatches).toBe(0);
  });

  it('FW40 detractor root causes: exclusions 3, appointment 2, completion 1, value 1', () => {
    const det = d.surveys.filter((s) => s.fw === 40 && s.ltr! < 9).map((s) => byId.get(s.id)!.primary);
    const count = (k: string) => det.filter((x) => x === k).length;
    expect([count('exclusions'), count('appointment'), count('completion'), count('value')]).toEqual([3, 2, 1, 1]);
  });

  it('never tags blank comments or help-desk calls', () => {
    expect(d.surveys.filter((s) => !s.comment).every((s) => !byId.has(s.id))).toBe(true);
    expect(d.calls.filter((c) => c.isAssociate).every((c) => !byId.has(c.id))).toBe(true);
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
  it('cancellation means the subscription, not an appointment', () => {
    expect(isCancellation('Member wants to cancel the subscription')).toBe(true);
    expect(isCancellation('Member wants to cancel')).toBe(true);
    expect(isCancellation('Appointment was automatically cancelled by the system')).toBe(false);
    expect(isCancellation('Store cancelled the appointment the morning of the visit')).toBe(false);
    expect(isCancellation('Member wants to cancel the appointment')).toBe(false);
    expect(isCancellation('Question about billing', 'Cancel Subscription')).toBe(true);
  });
  it('call themes come from the reason, outcomes from completed actions', () => {
    const notes = 'Problem / Reason for Calling: Member wants to cancel because the gas water heater is not covered.\nCompleted Actions: Processed cancellation; member is within 30 days. Refund processed.';
    expect(splitCallNotes(notes).reason).toBe('Member wants to cancel because the gas water heater is not covered.');
    const t = tagRecord({ id: 'e', channel: 'call', fw: 40, text: notes })!;
    expect(t).toMatchObject({ primary: 'exclusions', subTag: 'Exclusion drove cancel', cancellation: true, contactType: 'Avoidable' });
    expect(t.secondary).not.toContain('value');
    expect(callOutcome(notes)).toEqual({ cancellation: 'Processed', window: 'Within 30 days', refund: 'Refund processed' });
    expect(callOutcome('Completed Actions: Submitted cancel request to back office; refund request pending review.')).toEqual({ cancellation: 'Requested', window: 'Not stated', refund: 'Refund requested' });
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

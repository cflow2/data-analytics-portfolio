import { describe, expect, it } from 'vitest';
import { demoDataset } from '@/test/demoDataset';
import { DEFAULT_THRESHOLDS } from '@/lib/ltr';
import { answer, plan } from './ask';

const ds = demoDataset();
const ctx = { ds, fw: 40, benchmark: 93, thresholds: DEFAULT_THRESHOLDS, geo: { region: null, district: null, store: null } };
const ask = (q: string) => answer(q, ctx);

describe('Ask: planning', () => {
  it('weeks, geography, thresholds, intent', () => {
    expect(plan('LTR for R5 last 4 weeks', ctx)).toMatchObject({ intent: 'ltr', from: 37, to: 40, geo: { region: 'R5' } });
    expect(plan('FW36 to FW38 detractors in region 27', ctx)).toMatchObject({ intent: 'detractors', from: 36, to: 38, geo: { region: 'R27' } });
    expect(plan('Which regions are below 93% with n ≥ 10?', ctx)).toMatchObject({ intent: 'regions-below', threshold: 93, minN: 10 });
    expect(plan("What's new vs last week?", ctx)).toMatchObject({ intent: 'whats-new', from: 40, to: 40 });
    expect(plan('How did store #1053 do last week?', ctx)).toMatchObject({ intent: 'ltr', from: 39, geo: { store: '1053' } });
    expect(plan('How many exclusion calls in FW40?', ctx)).toMatchObject({ intent: 'theme', theme: 'exclusions', channel: 'calls' });
    expect(plan('ease of scheduling trend', ctx)).toMatchObject({ intent: 'attributes', attribute: 'scheduling' });
    expect(plan('FYTD LTR', ctx)).toMatchObject({ from: 1, to: 40 });
  });
});

describe('Ask: answers from the loaded data (demo)', () => {
  it('why did LTR move', () => {
    const a = ask('Why did LTR move this week?');
    expect(a.text[0]).toBe('LTR rose 0.8 pts: 94.7% (n=131) in FW40 vs 93.9% (n=131) in FW39.');
    expect(a.text.join(' ')).toMatch(/Detractors \(0–8\): 8 → 7/);
    expect(a.text.join(' ')).toMatch(/margin of error/);
    expect(a.dataUsed!.table.rows).toHaveLength(14);
  });
  it('regions below benchmark with n ≥ 10', () => {
    const a = ask('Which regions are below 93% with n ≥ 10?');
    expect(a.text[0]).toBe('2 regions below 93% with n ≥ 10 in FW40: R5 89.5% (n=19), R27 88.9% (n=18).');
  });
  it('what drove cancellations', () => {
    const t = ask('What drove cancellations?').text.join(' ');
    expect(t).toMatch(/^41 cancellation calls in FW40/);
    expect(t).toMatch(/Exclusions drove 18 of 41 \(44%\)/);
    expect(t).toMatch(/Counts are calls, not unique members/);
  });
  it('what is new', () => {
    expect(ask("What's new vs last week?").text[0]).toMatch(/^LTR rose 0\.8 pts to 94\.7% \(n=131\)/);
  });
  it('FYTD, themes, attributes, stores, calls', () => {
    expect(ask('FYTD LTR').text[0]).toMatch(/93\.1% \(n=3736\)/);
    expect(ask('How many exclusion mentions?').text[0]).toBe('Service exclusions in FW40: 4 survey mentions (0 positive, 4 negative) and 42 call mentions. Counted separately, never blended.');
    expect(ask('What is the lowest attribute?').text[0]).toBe('Lowest attribute in FW40: Ease of scheduling 87.4% (n=119).');
    expect(ask('Which stores are lowest since FW30?').text[0]).toMatch(/^Lowest LTR stores in FW30–FW40 \(n ≥ 5\)/);
    expect(ask('How many calls this week?').text[0]).toBe('340 customer calls (309 distinct cases) in FW40, plus 36 associate/store help-desk calls (not VOC).');
  });
  it('says “not in the loaded data” instead of guessing', () => {
    const a = ask('LTR for FW45');
    expect(a.notLoaded).toBe(true);
    expect(a.text[0]).toBe('LTR for FW45 is not in the loaded data.');
    expect(ask('How many calls in FW20?').notLoaded).toBe(true);
    expect(ask('What is the weather in Charlotte?').notLoaded).toBe(true);
    expect(ask('What drove cancellations in FW12?').text[0]).toBe('Call data for FW12 is not in the loaded data.');
  });
  it('detractor answers never include comments or names', () => {
    const a = ask('Show me the detractors');
    expect(a.text[0]).toBe('7 detractors (0–8) of n=131 in FW40: 2 scored 0–6 and 5 scored 7–8.');
    expect(JSON.stringify(a.dataUsed!.table)).not.toMatch(/tankless|showed up/i);
  });
});

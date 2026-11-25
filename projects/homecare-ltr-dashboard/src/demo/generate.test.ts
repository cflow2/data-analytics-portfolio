import { describe, expect, it } from 'vitest';
import { generateDemoData } from './generate';
import { ltrSummary, top2Box } from '@/lib/ltr';
import { ATTRIBUTES } from '@/domain/attributes';
import { REGIONS } from '@/domain/geo';
import { fiscalWeek } from '@/lib/fiscal';

const d = generateDemoData();
const surveysFw = (fw: number) => d.surveys.filter((s) => s.fw === fw);
const mentions = (fw: number, theme: string) =>
  d.tags.filter((t) => t.fw === fw && (t.primary === theme || t.secondary.includes(theme))).length;

describe('demo data reproduces the real baselines', () => {
  it('is deterministic', () => {
    const again = generateDemoData();
    expect(again.surveys.length).toBe(d.surveys.length);
    expect(again.surveys[100]).toEqual(d.surveys[100]);
  });

  it('every record is labeled DEMO', () => {
    expect(d.surveys.every((s) => s.demo && s.id.startsWith('DEMO'))).toBe(true);
    expect(d.stores.every((s) => s.name.startsWith('DEMO'))).toBe(true);
  });

  it('survey dates match their fiscal week', () => {
    for (const s of d.surveys) expect(fiscalWeek(s.date)).toBe(s.fw);
  });

  it('FW40 LTR = 94.7% on n=131: 124 promoters, 7 detractors, 2 scored 0–6', () => {
    const s = ltrSummary(surveysFw(40).map((x) => x.ltr));
    expect(s.n).toBe(131);
    expect(s.promoters).toBe(124);
    expect(s.detractors).toBe(7);
    expect(s.detractors0to6).toBe(2);
    expect(s.pct!.toFixed(1)).toBe('94.7');
  });

  it('FW39 LTR = 93.9%', () => {
    expect(ltrSummary(surveysFw(39).map((x) => x.ltr)).pct!.toFixed(1)).toBe('93.9');
  });

  it('FYTD through FW40 = 93.1% on n=3,736', () => {
    const s = ltrSummary(d.surveys.filter((x) => x.fw <= 40).map((x) => x.ltr));
    expect(s.n).toBe(3736);
    expect(s.pct!.toFixed(1)).toBe('93.1');
  });

  it('FW40 regions: R5 ≈ 89% on n=19, R27 ≈ 89% on n=18, all 14 regions present', () => {
    const r = (reg: string) => ltrSummary(surveysFw(40).filter((x) => x.region === reg).map((x) => x.ltr));
    expect(r('R5').n).toBe(19);
    expect(Math.round(r('R5').pct!)).toBe(89);
    expect(r('R27').n).toBe(18);
    expect(Math.round(r('R27').pct!)).toBe(89);
    for (const reg of REGIONS) expect(r(reg).n).toBeGreaterThan(0);
  });

  it('FW40 attributes: lowest = Ease of scheduling 87.4%; in-home 95–96%; professionalism 96.1%', () => {
    const pct = (k: string) => top2Box(surveysFw(40).map((s) => s.attrs?.[k as keyof typeof s.attrs])).pct!;
    const all = ATTRIBUTES.map((a) => ({ k: a.key, p: pct(a.key) }));
    const lowest = all.reduce((a, b) => (b.p < a.p ? b : a));
    expect(lowest.k).toBe('scheduling');
    expect(lowest.p.toFixed(1)).toBe('87.4');
    expect(pct('professionalism').toFixed(1)).toBe('96.1');
    for (const a of ATTRIBUTES.filter((x) => x.group === 'In-home')) {
      expect(pct(a.key)).toBeGreaterThanOrEqual(95);
      expect(pct(a.key)).toBeLessThan(97);
    }
  });

  it('FW40 survey mentions: Associate 72, Value 9 (7+/2−), Appointment 6, Exclusions 4, Completion 1', () => {
    expect(mentions(40, 'associate')).toBe(72);
    expect(mentions(40, 'value')).toBe(9);
    const value = d.tags.filter((t) => t.fw === 40 && t.primary === 'value');
    expect(value.filter((t) => t.sentiment === 'Positive').length).toBe(7);
    expect(value.filter((t) => t.sentiment === 'Negative').length).toBe(2);
    expect(mentions(40, 'appointment')).toBe(6);
    expect(mentions(40, 'exclusions')).toBe(4);
    expect(mentions(40, 'completion')).toBe(1);
  });

  it('FW40 follow-ups: 3 documented, 2 email only, 2 missing; FW41 next-week detractors exist', () => {
    const f = d.followups.filter((x) => x.fw === 40);
    expect(f.filter((x) => x.status === 'Documented').length).toBe(3);
    expect(f.filter((x) => x.status === 'Email only').length).toBe(2);
    expect(f.length).toBe(5);
    expect(ltrSummary(surveysFw(41).map((s) => s.ltr)).detractors).toBe(2);
  });

  it('some stores are unmapped', () => {
    expect(d.stores.filter((s) => !s.district).length).toBeGreaterThan(0);
  });
});

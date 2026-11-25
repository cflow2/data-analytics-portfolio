import { describe, expect, it } from 'vitest';
import type { SurveyRecord, ThemeTag } from '@/domain/types';
import { demoDataset } from '@/test/demoDataset';
import { serviceRequests } from './serviceRequests';

const sv = (id: string, fw: number, ltr: number, comment: string): SurveyRecord => ({ id, fw, date: `2026-11-0${fw - 38}`, storeNo: '1', region: 'R1', ltr, comment, sourceFile: 'f' });

describe('services members want added', () => {
  const surveys = [
    sv('a', 40, 7, 'They said the tankless water heater is not covered.'),
    sv('b', 41, 10, 'Great visit! I wish it included gutter cleaning.'),
    sv('c', 41, 9, 'Would be nice if you could add pressure washing and gutter service.'),
    sv('d', 41, 10, 'The associate changed my HVAC filter and cleaned the dryer vent.'),
    sv('e', 41, 5, 'Our dryer vent goes through the roof so it was skipped.'),
    sv('f', 41, 10, 'Love my new refrigerator.'),
  ];
  const rows = serviceRequests(surveys, new Map(), 41);
  const row = (id: string) => rows.find((r) => r.id === id);
  it('counts asks and not-covered mentions, once per survey and service', () => {
    expect(row('tankless')).toMatchObject({ surveys: 1, notCovered: 1, asked: 0, thisWeek: 0, lastFw: 40 });
    expect(row('gutters')).toMatchObject({ surveys: 2, asked: 2, thisWeek: 2, promoterPct: 100 });
    expect(row('pressure-wash')).toMatchObject({ surveys: 1, asked: 1 });
    expect(row('roof-vent')).toMatchObject({ surveys: 1, notCovered: 1 });
  });
  it('ignores mentions that are neither a request nor “not covered”', () => {
    expect(row('refrigerator')).toBeUndefined();
    expect(rows.map((r) => r.id)).not.toContain('hvac');
    expect(rows[0].id).toBe('gutters');
  });
  it('a Service-add or Exclusions tag is enough', () => {
    const t: ThemeTag = { recordId: 'f', channel: 'survey', fw: 41, primary: 'service-add', secondary: [], sentiment: 'Neutral', confidence: 1, source: 'Rule' };
    expect(serviceRequests(surveys, new Map([['f', t]]), 41).find((r) => r.id === 'refrigerator')).toMatchObject({ asked: 1 });
  });
  it('finds the demo’s exclusion complaints', () => {
    const ds = demoDataset();
    const r = serviceRequests(ds.surveys.filter((s) => s.fw === 40), ds.tags, 40);
    expect(r.find((x) => x.id === 'tankless')!.surveys).toBeGreaterThanOrEqual(1);
    expect(r.find((x) => x.id === 'roof-vent')!.surveys).toBeGreaterThanOrEqual(1);
    expect(r.find((x) => x.id === 'gas-wh')!.surveys).toBeGreaterThanOrEqual(1);
  });
});

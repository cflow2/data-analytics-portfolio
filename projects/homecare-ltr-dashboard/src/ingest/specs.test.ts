import { describe, expect, it } from 'vitest';
import { matchFields, SPEC_BY_KIND, detectCandidates } from './specs';
import { normalizeDriver, isAssociateDriver, driverMapping, storeFromNotes } from './drivers';
import { classifyInsight } from './followup';

describe('header matching', () => {
  it('fuzzy: case, curly quotes, extra spaces', () => {
    const { map, missing } = matchFields(['Call Date', ' CALL  DRIVER ', 'Case #', 'Case Notes'], SPEC_BY_KIND['loyalty-cases']);
    expect(missing).toEqual([]);
    expect(map).toEqual({ date: 0, driver: 1, caseNo: 2, notes: 3 });
    const t = matchFields(['Lowe’s Region', 'Store #'], SPEC_BY_KIND.tracker);
    expect(t.map.region).toBe(0);
  });
  it('reports missing required fields and honours remembered mappings', () => {
    const headers = ['Call Date', 'Reason Code', 'Case #', 'Case Notes'];
    expect(matchFields(headers, SPEC_BY_KIND['loyalty-cases']).missing).toEqual(['driver']);
    expect(matchFields(headers, SPEC_BY_KIND['loyalty-cases'], { driver: 'reason code' }).missing).toEqual([]);
  });
  it('detects the header row below title rows', () => {
    const rows = [['HomeCare+ LTR Tracker'], ['Exported 11/9/2026'], ['Surveyid for internal use (e.g. RI link)', "Lowe's Region", 'Store #', 'Date Only', 'Likelihood to Recommend', 'Score', 'FW #']];
    const [best] = detectCandidates('LTR_Tracker_FW40.xlsx', [{ name: 'Export Data', rows }]);
    expect(best.kind).toBe('tracker');
    expect(best.headerIndex).toBe(2);
    expect(best.missing).toEqual([]);
  });
});

describe('call drivers', () => {
  it('normalizes typos for grouping only', () => {
    expect(normalizeDriver('Genearl Program Inquiries')).toBe('General Program Inquiries');
    expect(normalizeDriver('Store Associate Needs Assistasnce')).toBe('Store Associate Needs Assistance');
    expect(normalizeDriver('  Cancel   Subscripton ')).toBe('Cancel Subscription');
    expect(driverMapping(['Genearl Program Inquiries', 'General Program Inquiries'])).toEqual([{ original: 'Genearl Program Inquiries', normalized: 'General Program Inquiries' }]);
  });
  it('associate/store help-desk drivers', () => {
    expect(isAssociateDriver(normalizeDriver("Lowe’s Associate Needs Assistance"))).toBe(true);
    expect(isAssociateDriver(normalizeDriver('Store Associate Needs Assistasnce'))).toBe(true);
    expect(isAssociateDriver('General Program Inquiries')).toBe(false);
  });
  it('store number from notes', () => {
    expect(storeFromNotes('Servicing store #1234.')).toBe('1234');
    expect(storeFromNotes('Store 456 cancelled')).toBe('0456');
    expect(storeFromNotes('no store here')).toBeUndefined();
  });
});

describe('follow-up insight classification', () => {
  it('documented / email only / missing', () => {
    expect(classifyInsight('Called member 11/9, apologized and rescheduled.')).toBe('Documented');
    expect(classifyInsight('Spoke with member about exclusions')).toBe('Documented');
    expect(classifyInsight('Sent email to SM')).toBe('Email only');
    expect(classifyInsight('Emailed')).toBe('Email only');
    expect(classifyInsight('')).toBe('Missing');
    expect(classifyInsight('N/A')).toBe('Missing');
  });
});

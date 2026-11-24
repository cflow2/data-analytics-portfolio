import { describe, expect, it } from 'vitest';
import { matchFields, SPEC_BY_KIND, detectCandidates } from './specs';
import { classifyInsight } from './followup';

describe('header matching', () => {
  it('fuzzy: case, curly quotes, extra spaces', () => {
    const { map, missing } = matchFields(['Date', ' SCORE ', 'Comment'], SPEC_BY_KIND.commentary);
    expect(missing).toEqual([]);
    expect(map).toEqual({ date: 0, ltr: 1, comment: 2 });
    const t = matchFields(['Lowe’s Region', 'Store #'], SPEC_BY_KIND.tracker);
    expect(t.map.region).toBe(0);
  });
  it('reports missing required fields and honours remembered mappings', () => {
    const headers = ['Date', 'Rating', 'Comment'];
    expect(matchFields(headers, SPEC_BY_KIND.commentary).missing).toEqual(['ltr']);
    expect(matchFields(headers, SPEC_BY_KIND.commentary, { ltr: 'rating' }).missing).toEqual([]);
  });
  it('detects the header row below title rows', () => {
    const rows = [['HomeCare+ LTR Tracker'], ['Exported 11/9/2026'], ['Surveyid for internal use (e.g. RI link)', "Lowe's Region", 'Store #', 'Date Only', 'Likelihood to Recommend', 'Score', 'FW #']];
    const [best] = detectCandidates('LTR_Tracker_FW40.xlsx', [{ name: 'Export Data', rows }]);
    expect(best.kind).toBe('tracker');
    expect(best.headerIndex).toBe(2);
    expect(best.missing).toEqual([]);
  });
});

describe('follow-up insight classification', () => {
  it('documented only when contact with the member is described', () => {
    expect(classifyInsight('Called member 11/9, apologized and rescheduled.')).toBe('Documented');
    expect(classifyInsight('Spoke with member about exclusions')).toBe('Documented');
    expect(classifyInsight('Store leadership contacted the customer, confirmed the issue stemmed from a broken tray.')).toBe('Documented');
    expect(classifyInsight('Pat Example reviewed the concerns. Sam Sample also contacted the customer and apologized for the experience.')).toBe('Documented');
    expect(classifyInsight('Left a voicemail for the member on 11/10.')).toBe('Documented');
  });
  it('emails, intentions and internal reviews are not documented contact', () => {
    expect(classifyInsight('Sent email to SM')).toBe('Email only');
    expect(classifyInsight('Email Sent to SM')).toBe('Email only');
    expect(classifyInsight('Emailed')).toBe('Email only');
    expect(classifyInsight('I will call the customer and get their feedback. I will also touch base with Pat.')).toBe('Email only');
    expect(classifyInsight('Customer cited concerns with value and service quality. Store asked to contact customer and document findings/actions taken.')).toBe('Email only');
    expect(classifyInsight('Store leadership reviewed the detractor experience with the associate and provided coaching on proper handling.')).toBe('Email only');
    expect(classifyInsight('Store Manager reviewed the detractor with the technician. Leadership believes the dissatisfaction stemmed from a misunderstanding of scope.')).toBe('Email only');
  });
  it('blank-like values are Missing', () => {
    expect(classifyInsight('')).toBe('Missing');
    expect(classifyInsight('N/A')).toBe('Missing');
    expect(classifyInsight('No Comment')).toBe('Missing');
  });
});

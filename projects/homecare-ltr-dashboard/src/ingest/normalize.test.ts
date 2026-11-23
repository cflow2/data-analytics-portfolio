import { describe, expect, it } from 'vitest';
import { normalizeHeader, parseDateCell, parseScore, cleanCaseNo, hashString, cleanComment } from './normalize';

describe('normalize', () => {
  it('headers: trim, case, curly quotes, spaces', () => {
    expect(normalizeHeader('  Lowe’s   Region ')).toBe("lowe's region");
    expect(normalizeHeader('Store #')).toBe('store #');
  });
  it('dates', () => {
    expect(parseDateCell('11/6/2026')).toBe('2026-11-06');
    expect(parseDateCell('11/6/26')).toBe('2026-11-06');
    expect(parseDateCell('2026-11-06')).toBe('2026-11-06');
    expect(parseDateCell('11/06/2026 10:32 AM')).toBe('2026-11-06');
    expect(parseDateCell('Nov 6, 2026')).toBe('2026-11-06');
    expect(parseDateCell('6-Nov-2026')).toBe('2026-11-06');
    expect(parseDateCell(46332)).toBe('2026-11-06');
    expect(parseDateCell(46332.75)).toBe('2026-11-06');
    expect(parseDateCell('13/45/2026')).toBeNull();
    expect(parseDateCell('n/a')).toBeNull();
    expect(parseDateCell(7)).toBeNull();
  });
  it('scores', () => {
    expect(parseScore(9)).toBe(9);
    expect(parseScore('10')).toBe(10);
    expect(parseScore('10 - Extremely likely')).toBe(10);
    expect(parseScore('8.0')).toBe(8);
    expect(parseScore(8.5)).toBeNull();
    expect(parseScore('11')).toBeNull();
    expect(parseScore('')).toBeNull();
  });
  it('case numbers', () => {
    expect(cleanCaseNo('\n\n04512345 ')).toBe('04512345');
    expect(cleanCaseNo(4512345)).toBe('4512345');
    expect(cleanCaseNo('4512345.0')).toBe('4512345');
  });
  it('hash is deterministic', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });

  it('placeholder comments are blank', () => {
    for (const v of ['No Comment', 'no comments', 'N/A', '-', 'None.']) expect(cleanComment(v)).toBe('');
    expect(cleanComment('No comment on the visit, but the price is high')).toBe('No comment on the visit, but the price is high');
  });
});

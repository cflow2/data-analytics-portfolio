import { describe, expect, it } from 'vitest';
import {
  fiscalWeek, fiscalWeekInYear, weekStart, weekEnd, wbrDate, fiscalMonth, fiscalQuarter,
  weekInfo, weeksInMonth, weekReportedAtWbr, lastCompletedWeek,
} from './fiscal';
import { weekday } from './dates';

describe('fiscal calendar FY26', () => {
  it('FW1 starts Saturday Jan 31, 2026', () => {
    expect(fiscalWeek('2026-01-31')).toBe(1);
    expect(weekday('2026-01-31')).toBe(6); // Saturday
    expect(fiscalWeek('2026-02-06')).toBe(1);
    expect(fiscalWeek('2026-02-07')).toBe(2);
  });

  it('quality-checklist values', () => {
    expect(fiscalWeek('2026-10-31')).toBe(40);
    expect(fiscalWeek('2026-11-06')).toBe(40);
    expect(fiscalWeek('2026-11-07')).toBe(41);
    expect(wbrDate(40)).toBe('2026-11-11');
    expect(fiscalMonth(40)).toBe(10);
    expect(fiscalQuarter(40)).toBe(4);
  });

  it('FW40 and FW41 ranges and WBR dates', () => {
    expect(weekStart(40)).toBe('2026-10-31');
    expect(weekEnd(40)).toBe('2026-11-06');
    expect(weekStart(41)).toBe('2026-11-07');
    expect(weekEnd(41)).toBe('2026-11-13');
    expect(wbrDate(41)).toBe('2026-11-18');
    expect(weekday(wbrDate(40))).toBe(3); // Wednesday
  });

  it('weeks run Saturday–Friday', () => {
    for (let fw = 1; fw <= 52; fw++) {
      expect(weekday(weekStart(fw))).toBe(6);
      expect(weekday(weekEnd(fw))).toBe(5);
      expect(weekday(wbrDate(fw))).toBe(3);
    }
  });

  it('label format', () => {
    expect(weekInfo(40).label).toBe('FW40 · Oct 31–Nov 6 · WBR Nov 11');
    expect(weekInfo(41).label).toBe('FW41 · Nov 7–13 · WBR Nov 18');
  });

  it('4-5-4 month boundaries', () => {
    const expected: [number, number][] = [
      [1, 1], [4, 1], [5, 2], [9, 2], [10, 3], [13, 3], [14, 4], [17, 4], [18, 5], [22, 5],
      [23, 6], [26, 6], [27, 7], [30, 7], [31, 8], [35, 8], [36, 9], [39, 9], [40, 10], [43, 10],
      [44, 11], [48, 11], [49, 12], [52, 12],
    ];
    for (const [fw, m] of expected) expect(fiscalMonth(fw)).toBe(m);
    expect(weeksInMonth(2)).toEqual([5, 6, 7, 8, 9]);
    expect(weeksInMonth(10)).toEqual([40, 41, 42, 43]);
    const total = Array.from({ length: 12 }, (_, i) => weeksInMonth(i + 1).length).reduce((a, b) => a + b);
    expect(total).toBe(52);
  });

  it('quarters = ceil(FW / 13)', () => {
    expect(fiscalQuarter(1)).toBe(1);
    expect(fiscalQuarter(13)).toBe(1);
    expect(fiscalQuarter(14)).toBe(2);
    expect(fiscalQuarter(39)).toBe(3);
    expect(fiscalQuarter(52)).toBe(4);
    expect(() => fiscalQuarter(0)).toThrow();
    expect(() => fiscalMonth(53)).toThrow();
  });

  it('dates outside the FY', () => {
    expect(fiscalWeek('2026-01-30')).toBe(0);
    expect(fiscalWeekInYear('2026-01-30')).toBeNull();
    expect(fiscalWeekInYear('2027-01-29')).toBe(52);
    expect(fiscalWeekInYear('2027-01-30')).toBeNull();
  });

  it('configurable FY start (FY27)', () => {
    const fy27 = '2027-01-30';
    expect(weekday(fy27)).toBe(6);
    expect(fiscalWeek('2027-01-30', fy27)).toBe(1);
    expect(weekInfo(1, fy27).wbr).toBe('2027-02-10');
  });

  it('WBR → reported week; last completed week', () => {
    expect(weekReportedAtWbr('2026-11-11')).toBe(40);
    expect(lastCompletedWeek('2026-11-23')).toBe(42);
    expect(lastCompletedWeek('2026-11-07')).toBe(40);
  });
});

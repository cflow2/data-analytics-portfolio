/**
 * Lowe's 4-5-4 fiscal calendar. Weeks run Saturday–Friday.
 * FY26 FW1 starts Saturday 2026-01-31. The FY start is configurable (Settings) so FY27 works.
 *
 *   fiscalWeek(date) = floor((date − fyStart) / 7) + 1
 *   WBR date        = Wednesday after week end = week end + 5 days
 */
import { addDays, dayNumber, rangeLabel, monthDay, type ISODate } from './dates';

export const DEFAULT_FY_START: ISODate = '2026-01-31';
export const WEEKS_PER_YEAR = 52;

/** Last fiscal week (inclusive) of each fiscal month, 4-5-4 pattern. */
const MONTH_END_WEEKS = [4, 9, 13, 17, 22, 26, 30, 35, 39, 43, 48, 52];

/** Raw fiscal week number. Can be < 1 (prior FY) or > 52 (next FY). */
export function fiscalWeek(date: ISODate, fyStart: ISODate = DEFAULT_FY_START): number {
  return Math.floor((dayNumber(date) - dayNumber(fyStart)) / 7) + 1;
}

/** Fiscal week if the date falls inside the fiscal year, otherwise null. */
export function fiscalWeekInYear(date: ISODate, fyStart: ISODate = DEFAULT_FY_START): number | null {
  const fw = fiscalWeek(date, fyStart);
  return fw >= 1 && fw <= WEEKS_PER_YEAR ? fw : null;
}

export function weekStart(fw: number, fyStart: ISODate = DEFAULT_FY_START): ISODate {
  return addDays(fyStart, (fw - 1) * 7);
}

export function weekEnd(fw: number, fyStart: ISODate = DEFAULT_FY_START): ISODate {
  return addDays(fyStart, (fw - 1) * 7 + 6);
}

/** The Wednesday after the week ends. */
export function wbrDate(fw: number, fyStart: ISODate = DEFAULT_FY_START): ISODate {
  return addDays(weekEnd(fw, fyStart), 5);
}

/** The fiscal week a given WBR (Wednesday) reports on: the prior completed week. */
export function weekReportedAtWbr(wbr: ISODate, fyStart: ISODate = DEFAULT_FY_START): number {
  return fiscalWeek(addDays(wbr, -5), fyStart);
}

export function fiscalMonth(fw: number): number {
  if (fw < 1 || fw > WEEKS_PER_YEAR) throw new RangeError(`Fiscal week out of range: ${fw}`);
  return MONTH_END_WEEKS.findIndex((end) => fw <= end) + 1;
}

export function fiscalQuarter(fw: number): number {
  if (fw < 1 || fw > WEEKS_PER_YEAR) throw new RangeError(`Fiscal week out of range: ${fw}`);
  return Math.ceil(fw / 13);
}

/** Weeks belonging to a fiscal month. */
export function weeksInMonth(month: number): number[] {
  const end = MONTH_END_WEEKS[month - 1];
  const start = month === 1 ? 1 : MONTH_END_WEEKS[month - 2] + 1;
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function isInWeek(date: ISODate, fw: number, fyStart: ISODate = DEFAULT_FY_START): boolean {
  return fiscalWeek(date, fyStart) === fw;
}

export interface FiscalWeekInfo {
  fw: number;
  start: ISODate;
  end: ISODate;
  wbr: ISODate;
  month: number;
  quarter: number;
  /** "FW40 · Oct 31–Nov 6 · WBR Nov 11" */
  label: string;
}

export function weekInfo(fw: number, fyStart: ISODate = DEFAULT_FY_START): FiscalWeekInfo {
  const start = weekStart(fw, fyStart);
  const end = weekEnd(fw, fyStart);
  const wbr = wbrDate(fw, fyStart);
  return {
    fw,
    start,
    end,
    wbr,
    month: fiscalMonth(fw),
    quarter: fiscalQuarter(fw),
    label: `FW${fw} · ${rangeLabel(start, end)} · WBR ${monthDay(wbr)}`,
  };
}

/** The most recently completed fiscal week as of `today` (clamped to 1..52). */
export function lastCompletedWeek(today: ISODate, fyStart: ISODate = DEFAULT_FY_START): number {
  const fw = fiscalWeek(today, fyStart) - 1;
  return Math.max(1, Math.min(WEEKS_PER_YEAR, fw));
}

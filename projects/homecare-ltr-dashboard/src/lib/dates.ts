/**
 * Date-only helpers. All business dates are ISO strings "YYYY-MM-DD" and all
 * arithmetic is done on UTC day numbers, so time zones and DST never shift a day.
 */
export type ISODate = string;

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string') return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** UTC day number (days since 1970-01-01). */
export function dayNumber(iso: ISODate): number {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS_PER_DAY;
}

export function fromDayNumber(n: number): ISODate {
  const d = new Date(n * MS_PER_DAY);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export function addDays(iso: ISODate, days: number): ISODate {
  return fromDayNumber(dayNumber(iso) + days);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return dayNumber(a) - dayNumber(b);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: ISODate): number {
  return (((dayNumber(iso) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function monthDay(iso: ISODate): string {
  const [, m, d] = iso.split('-');
  return `${MONTHS[+m - 1]} ${+d}`;
}

export function dayName(iso: ISODate): string {
  return DAYS[weekday(iso)];
}

/** "Oct 31–Nov 6" or "Nov 7–13" */
export function rangeLabel(start: ISODate, end: ISODate): string {
  const [, sm] = start.split('-');
  const [, em, ed] = end.split('-');
  return sm === em ? `${monthDay(start)}–${+ed}` : `${monthDay(start)}–${monthDay(end)}`;
}

export function todayISO(): ISODate {
  const d = new Date();
  return fromDayNumber(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY);
}

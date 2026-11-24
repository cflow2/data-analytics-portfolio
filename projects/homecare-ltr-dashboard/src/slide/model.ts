/** Everything the slide draws, computed once and shared by the screen, PNG, PPTX and JSON snapshot. */
import type { AttributeWeekly, SurveyRecord, ThemeTag } from '@/domain/types';
import { countsForLtr } from '@/domain/survey';
import { DEFAULT_REGION_CONFIG, type RegionConfig } from '@/config/regions';
import type { MedalliaRange } from '@/ingest/types';
import { weekEnd } from '@/lib/fiscal';
import { monthDay } from '@/lib/dates';
const weekEndLabel = (fw: number) => `${monthDay(weekEnd(fw))} (end of FW${fw})`;
import { atOrAbove, displayWhole, keyDrivers, slideMetrics, DEFAULT_DRIVERS, type DriverDef, type DriverValue, type RegionRow, type SlideMetrics, type WeekStats } from './ltrMetrics';
import { COLORS } from './layout';

export interface SlideModel {
  m: SlideMetrics;
  drivers: DriverValue[];
  regionColor: Record<string, string>;
  ltrSurveys: SurveyRecord[];
  checks: SlideCheck[];
  /** Medallia's own week LTR (from the Analytics export), for the reconciliation chip */
  medallia: { pct: number; n: number } | null;
  /** YTD shown on the slide: typed in > Medallia expanded-range export > Tracker */
  ytd: YtdValue;
}
export interface YtdValue { ltr: number | null; display: number | null; n: number; source: 'Entered' | 'Medallia' | 'Tracker'; note: string }

/** A Medallia range counts as YTD when it starts in the first fiscal weeks and ends on the slide week. */
export const ytdRangeFor = (ranges: MedalliaRange[], fw: number) => ranges
  .filter((r) => r.fwFrom <= 2 && r.n && (r.fwTo === fw || (r.openEnd && r.openEnd.lastStartFw <= fw && fw <= r.fwTo)))
  .sort((a, b) => Number(!!a.openEnd) - Number(!!b.openEnd) || (b.sourceFile > a.sourceFile ? 1 : -1))[0] ?? null;
export interface SlideCheck { id: string; label: string; status: 'ok' | 'warn' | 'info'; detail: string }

export const regionFill = (r: RegionRow, benchmark: number) => (r.cur.n < 5 ? '#C9CED6' : atOrAbove(r.cur, benchmark) ? COLORS.green : COLORS.yellow);
export const valueColor = (w: WeekStats, benchmark: number) => (w.ltr === null ? COLORS.gray : atOrAbove(w, benchmark) ? COLORS.blue : COLORS.red);
export const arrow = (d: number | null) => (d === null ? '' : d > 0 ? `▲${d}` : d < 0 ? `▼${Math.abs(d)}` : 'flat');
export const arrowColor = (d: number | null) => (d === null || d === 0 ? COLORS.gray : d > 0 ? COLORS.ink : COLORS.red);
export const signed = (d: number | null) => (d === null ? '—' : d > 0 ? `+${d}` : `${d}`.replace('-', '−'));

export function buildModel(surveys: SurveyRecord[], analytics: AttributeWeekly[], fw: number, benchmark: number, cfg: RegionConfig = DEFAULT_REGION_CONFIG, driverDefs: DriverDef[] = DEFAULT_DRIVERS,
  ranges: MedalliaRange[] = [], ytdOverride: { ltr: number; n: number } | null = null): SlideModel {
  const ltrSurveys = surveys.filter(countsForLtr);
  const m = slideMetrics(ltrSurveys, fw, benchmark, cfg);
  const drivers = keyDrivers(fw, driverDefs, analytics, ltrSurveys);
  const regionColor = Object.fromEntries(m.regions.map((r) => [r.region, regionFill(r, benchmark)]));
  const med = analytics.find((a) => a.fw === fw && a.attr === 'ltr');
  const medallia = med ? { pct: med.pct, n: med.n } : null;
  const checks: SlideCheck[] = [];
  const configRegions = new Set(Object.values(cfg.divisions).flat());
  checks.push({ id: 'counts', label: 'Survey count by week', status: m.cur.n ? 'ok' : 'warn', detail: m.trend.map((w) => `FW${w.fw} ${w.n}`).join(' · ') });
  const range = ytdRangeFor(ranges, fw);
  const trackerYtd = `Tracker ${m.ytd.ltr === null ? '—' : m.ytd.ltr.toFixed(2)}% on ${m.ytd.n.toLocaleString('en-US')} (FW1–FW${fw})`;
  const ytd: YtdValue = ytdOverride
    ? { ltr: ytdOverride.ltr, display: displayWhole(ytdOverride.ltr), n: ytdOverride.n, source: 'Entered', note: 'typed in on the LTR Slide' }
    : range
      ? { ltr: range.ltr, display: displayWhole(range.ltr), n: range.n ?? 0, source: 'Medallia', note: `Medallia Analytics FW${range.fwFrom}–FW${range.fwTo}${range.from && range.to ? ` (${range.from} to ${range.to})` : ''}` }
      : { ltr: m.ytd.ltr, display: m.ytd.display, n: m.ytd.n, source: 'Tracker', note: `Tracker FW1–FW${fw}` };
  checks.push({ id: 'ytd', label: 'Year to date', status: ytd.source === 'Tracker' ? 'info' : ytd.source === 'Medallia' && range?.openEnd ? 'warn' : 'ok',
    detail: ytd.source === 'Tracker'
      ? `${trackerYtd}. Leadership's YTD comes from Medallia's expanded view: upload a Medallia Analytics export run from the start of the fiscal year through FW${fw}, or type the figure under “Edit the slide”.`
      : `Showing ${ytd.source === 'Entered' ? 'the typed-in' : 'Medallia’s'} ${ytd.ltr?.toFixed(2)}% on ${ytd.n.toLocaleString('en-US')} (${ytd.note}). ${trackerYtd}; difference ${(ytd.n - m.ytd.n).toLocaleString('en-US')} surveys.${ytd.source === 'Medallia' && range?.openEnd ? ` The export's last column is a month, so confirm in Medallia that the date range ended ${weekEndLabel(fw)}.` : ''}` });
  if (medallia) {
    const diff = m.cur.ltr === null ? null : Math.abs(m.cur.ltr - medallia.pct);
    checks.push({ id: 'medallia', label: 'Tracker vs Medallia week LTR', status: diff !== null && diff < 0.5 ? 'ok' : 'warn', detail: `Tracker ${m.cur.ltr?.toFixed(2) ?? '—'}% (n=${m.cur.n}) · Medallia ${medallia.pct.toFixed(2)}% (n=${medallia.n})` });
  } else checks.push({ id: 'medallia', label: 'Tracker vs Medallia week LTR', status: 'info', detail: `No Medallia Analytics export for FW${fw}; nothing to reconcile.` });
  const week = ltrSurveys.filter((s) => s.fw === fw);
  const byAppt = new Map<string, SurveyRecord[]>();
  for (const s of week) if (s.appointmentId) byAppt.set(s.appointmentId, [...(byAppt.get(s.appointmentId) ?? []), s]);
  const repeats = [...byAppt.values()].filter((v) => v.length > 1);
  const sameDay = repeats.filter((v) => new Set(v.map((x) => x.date)).size < v.length);
  checks.push({ id: 'dups', label: 'Duplicate appointments', status: sameDay.length ? 'warn' : repeats.length ? 'info' : 'ok',
    detail: sameDay.length ? `${sameDay.length} appointment ID(s) have two surveys on the same date: check the Tracker for double entries`
      : repeats.length ? `${repeats.length} appointment ID(s) have surveys on different dates (repeat visits); the Tracker counts both, and so does the slide` : 'None' });
  const none = m.regions.filter((r) => configRegions.has(r.region) && r.cur.n === 0).map((r) => r.region);
  checks.push({ id: 'empty', label: 'Regions without surveys', status: none.length ? 'warn' : 'ok', detail: none.join(', ') || 'None' });
  const unknown = [...new Set(week.map((s) => s.region))].filter((r) => !configRegions.has(r));
  checks.push({ id: 'unknown', label: 'Regions not in the division config', status: unknown.length ? 'warn' : 'ok', detail: unknown.length ? `${unknown.join(', ')} (${week.filter((s) => unknown.includes(s.region)).length} surveys count in the week total but not in a division)` : 'None' });
  const missingDrivers = drivers.filter((d) => d.pct === null).map((d) => d.short);
  checks.push({ id: 'drivers', label: 'Key Drivers', status: missingDrivers.length ? 'warn' : 'ok', detail: missingDrivers.length ? `No data for ${missingDrivers.join(', ')} in FW${fw} (load the Medallia Analytics export)` : `From ${analytics.some((a) => a.fw === fw) ? 'Medallia Analytics' : 'per-survey answers'}` });
  return { m, drivers, regionColor, ltrSurveys, checks, medallia, ytd };
}

export type { ThemeTag };

import type { ISODate } from '@/lib/dates';
import type {
  AttributeWeekly, FileKind, FollowUpRecord, OriginalText, StoreRecord, SurveyRecord,
} from '@/domain/types';
import type { Candidate, ColumnMapping } from './specs';
import type { RedactionRule } from './redact';

export interface ValidationReport {
  kind: FileKind;
  rowsRead: number;
  rowsKept: number;
  /** reason → count */
  dropped: Record<string, number>;
  dateRange?: [ISODate, ISODate];
  /** fiscal week → rows */
  weeks: Record<number, number>;
  /** tracker: Score (100/0) vs Likelihood to Recommend disagreements */
  scoreMismatches?: { id: string; ltr: number; score100: number }[];
  fwMismatches?: number;
  noScore?: number;
  followupCheck?: FollowUpCheck[];
  /** Medallia Analytics LTR vs Tracker LTR for the same week (the Tracker is the source of truth). */
  medalliaLtrCheck?: { fw: number; medalliaPct: number; medalliaN: number; trackerPct: number | null; trackerN: number }[];
  unmappedStores?: string[];
  storesFromSheets?: number;
  redactions: Record<string, number>;
  redactionUncertain: number;
  /** Tracker: surveys in an earlier Tracker that this one no longer contains (removed), by week */
  removedFromTracker?: { fw: number; count: number }[];
  /** appointments: Tracker surveys linked to an associate / Tracker surveys with an Appointment ID */
  associateLinks?: { linked: number; withAppointment: number };
  /** commit stage */
  alreadyLoaded?: number;
  merged?: number;
  lockedWeekRows?: number;
  warnings: string[];
  /** Checks that passed (shown without a warning flag). */
  info?: string[];
}

export interface FollowUpCheck {
  fw: number;
  trackerNonPromoters: number;
  inFile: number;
  documented: number;
  emailOnly: number;
  missing: { surveyId: string; date: ISODate; storeNo: string; score: number | null }[];
}

export interface BuildResult {
  kind: FileKind;
  surveys: SurveyRecord[];
  followups: FollowUpRecord[];
  stores: StoreRecord[];
  attributeWeekly: AttributeWeekly[];
  originals: OriginalText[];
  report: ValidationReport;
  /** Tracker only: the region map pictures from the “LTR Region Map” sheet */
  regionMap?: import('./regionMap').RegionMapAsset | null;
  /** Subscription export: store × week sales and completed appointments, and the export's snapshot for day-over-day change */
  subscriptionWeeks?: import('@/domain/types').SubscriptionWeek[];
  subscriptionSnapshot?: import('@/domain/types').SubscriptionSnapshot | null;
  /** Appointment file: Appointment ID → RedVest Associate */
  appointments?: import('@/domain/types').AppointmentRecord[];
  /** Medallia Analytics only: the whole-range LTR (e.g. a fiscal-year-to-date view) */
  medalliaRange?: MedalliaRange | null;
}

/** Medallia's LTR and Sample Size over the full date range of an Analytics export (its Total column). */
export interface MedalliaRange {
  id: string; // `${fwFrom}-${fwTo}`
  fwFrom: number;
  fwTo: number;
  from?: ISODate;
  to?: ISODate;
  ltr: number;
  n: number | null;
  /** 'total' = read from the file's Total column; 'computed' = Sample-Size-weighted across the columns */
  basis: 'total' | 'computed';
  /** Last column is a month: the true end date is unknown, so any week from `lastStartFw` to `fwTo` may be the end */
  openEnd?: { lastStartFw: number };
  sourceFile: string;
}

export interface ParseRequest {
  fileId: string;
  name: string;
  buffer: ArrayBuffer;
  fyStart: ISODate;
  rules: RedactionRule[];
  salt: string;
  remembered: Partial<Record<string, ColumnMapping>>;
  /** Picture name → region for the Tracker's region map (from the region config). */
  pictureMap?: Record<string, string>;
  /** Fallback date for undated day columns ("14 Sat") when the file name has no export timestamp. */
  today?: ISODate;
  /** Force a kind / sheet / header row / mapping (from the mapping dialog). */
  force?: { kind: Candidate['kind']; sheet: string; headerIndex: number; mapping: ColumnMapping };
}

export interface ParsedFile {
  fileId: string;
  name: string;
  size: number;
  sheets: string[];
  candidate: Candidate | null;
  /** headers of the chosen sheet's header row */
  headers: string[];
  build?: BuildResult;
  error?: string;
  ms: number;
}

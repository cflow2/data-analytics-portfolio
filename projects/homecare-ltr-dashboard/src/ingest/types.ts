import type { ISODate } from '@/lib/dates';
import type {
  AttributeWeekly, CallRecord, FileKind, FollowUpRecord, OriginalText, StoreRecord, SurveyRecord,
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
  /** calls only: week the file was imported into, and rows outside it */
  targetWeek?: number;
  outsideWeek?: number;
  /** calls: rows vs distinct Case #, exact duplicate rows collapsed */
  duplicates?: { duplicateRows: number; repeatCaseRows: number; distinctCases: number };
  driverMapping?: { original: string; normalized: string }[];
  associateCalls?: number;
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
  calls: CallRecord[];
  followups: FollowUpRecord[];
  stores: StoreRecord[];
  attributeWeekly: AttributeWeekly[];
  originals: OriginalText[];
  report: ValidationReport;
}

export interface ParseRequest {
  fileId: string;
  name: string;
  buffer: ArrayBuffer;
  fyStart: ISODate;
  rules: RedactionRule[];
  salt: string;
  remembered: Partial<Record<string, ColumnMapping>>;
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

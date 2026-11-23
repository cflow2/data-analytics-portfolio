import type { ISODate } from '@/lib/dates';

export type Channel = 'survey' | 'call';
export type ChannelFilter = 'surveys' | 'calls' | 'both';
export type Status = 'ACT' | 'WATCH' | 'GROW' | 'STABLE';
export type Maturity = 'Emerging' | 'Repeated' | 'Corroborated' | 'Validated';
export type Sentiment = 'Positive' | 'Negative' | 'Neutral';
export type ContactType = 'Avoidable' | 'Deflectable' | 'Necessary';
export type TagSource = 'AI' | 'Rule' | 'Manual' | 'Demo';
export type FollowUpStatus = 'Documented' | 'Email only' | 'Missing';
export type FileKind =
  | 'tracker' | 'medallia-responses' | 'medallia-analytics' | 'commentary'
  | 'loyalty-cases' | 'followup' | 'store-map' | 'demo';

export type AttributeKey =
  | 'value' | 'scheduling' | 'quality' | 'timeToAppt' | 'processPrior'
  | 'overall' | 'craftsmanship' | 'professionalism' | 'knowledge';

/** A survey response (LTR Tracker / Medallia). Text fields are redacted; originals live in `originals`. */
export type SurveySource = 'tracker' | 'medallia' | 'commentary' | 'demo';

export interface SurveyRecord {
  id: string;
  /** Only Tracker (and demo) records count toward LTR; the Tracker is the source of truth. */
  source?: SurveySource;
  fw: number;
  date: ISODate;
  storeNo: string;
  region: string;
  market?: string;
  appointmentId?: string;
  ltr: number | null;
  /** Tracker Score column (100/0) when present */
  score100?: number | null;
  comment: string;
  attrs?: Partial<Record<AttributeKey, number>>;
  sourceFile: string;
  redactionUncertain?: boolean;
  demo?: boolean;
}

export interface CallRecord {
  id: string;
  fw: number;
  date: ISODate;
  driver: string;
  driverNorm: string;
  caseNo: string;
  notes: string;
  isAssociate: boolean;
  storeNo?: string;
  /** salted hash of a phone number found in the notes, never displayed */
  phoneHash?: string;
  sourceFile: string;
  redactionUncertain?: boolean;
  demo?: boolean;
}

export interface FollowUpRecord {
  id: string;
  surveyId?: string;
  date: ISODate;
  fw: number;
  score: number | null;
  comment: string;
  storeNo: string;
  sm: string;
  insights: string;
  region: string;
  status: FollowUpStatus;
  sourceFile: string;
  redactionUncertain?: boolean;
  demo?: boolean;
}

/** Weekly top-2-box from the Medallia Analytics driver report (used when per-survey attributes are missing). */
export interface AttributeWeekly {
  id: string; // `${fw}:${attr}`
  fw: number;
  attr: AttributeKey;
  top2: number;
  n: number;
  pct: number;
  sourceFile: string;
}

export interface StoreRecord {
  storeNo: string;
  name: string;
  city: string;
  state: string;
  district: string | null;
  region: string;
}

export interface ThemeTag {
  recordId: string;
  channel: Channel;
  fw: number;
  primary: string;
  secondary: string[];
  subTag?: string;
  sentiment: Sentiment;
  contactType?: ContactType;
  cancellation?: boolean;
  escalate?: boolean;
  confidence: number;
  source: TagSource;
  rationale?: string;
  reviewed?: boolean;
}

export interface OriginalText {
  recordId: string;
  field: 'comment' | 'notes' | 'insights';
  text: string;
}

export interface ImportedFile {
  id: string; // content hash
  name: string;
  kind: FileKind;
  importedAt: string;
  sheet?: string;
  headerRow?: number;
  rows: number;
  kept: number;
  weeks: number[];
  dateRange?: [ISODate, ISODate];
  /** ValidationReport (see src/ingest/types.ts) */
  report?: unknown;
}

export interface WeekMeta {
  fw: number;
  locked: boolean;
  headline?: string;
  note?: string;
  checklist?: Partial<Record<'tagged' | 'reviewed' | 'slideExported', boolean>>;
}

export interface Signal {
  id: string;
  signal: string;
  theme: string;
  firstSeenFw: number;
  owner?: string;
  nextAction?: string;
  notes?: string;
  status: Status;
  validated?: boolean;
}

export interface LeadershipQuestion {
  id: string;
  fw: number; // WBR week the question was asked about
  asker?: string;
  question: string;
  answered: boolean;
  createdAt: string;
}

export interface Escalation {
  callId: string;
  status: 'New' | 'Escalated to Field Support' | 'Resolved';
  updatedAt: string;
}

export interface KV<T = unknown> {
  key: string;
  value: T;
}

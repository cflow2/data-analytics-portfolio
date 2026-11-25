import type { ISODate } from '@/lib/dates';

export type Channel = 'survey';
export type Status = 'ACT' | 'WATCH' | 'GROW' | 'STABLE';
export type Maturity = 'Emerging' | 'Repeated' | 'Persistent';
export type Sentiment = 'Positive' | 'Negative' | 'Neutral';
export type TagSource = 'AI' | 'Rule' | 'Manual' | 'Demo';
export type FollowUpStatus = 'Documented' | 'Email only' | 'Missing';
export type FileKind =
  | 'tracker' | 'medallia-responses' | 'medallia-analytics' | 'commentary'
  | 'followup' | 'store-map' | 'appointments' | 'subscriptions' | 'demo';

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
  /** NORTH / SOUTH / WEST (Lowe's Division) */
  division?: string;
  market?: string;
  appointmentId?: string;
  ltr: number | null;
  /** Tracker Score column (100/0) when present */
  score100?: number | null;
  comment: string;
  attrs?: Partial<Record<AttributeKey, number>>;
  /** Medallia topic tags (“Category - Topic (Sentiment)”). Suggestions only, never used to set themes. */
  topics?: string[];
  /** RedVest Associate, joined from the appointment file by Appointment ID (not stored on the survey) */
  associate?: string;
  sourceFile: string;
  redactionUncertain?: boolean;
  demo?: boolean;
}

/** One store's HomeCare+ sales and completed appointments for one fiscal week (subscription export). Net = after cancellations. */
export interface SubscriptionWeek {
  id: string; // `${fy}:${fw}:${storeNo}`
  fy: number;
  fw: number;
  storeNo: string;
  storeName: string;
  /** National Stores / Test Stores service members; Selling Stores sell only */
  storeSet: string;
  division: string;
  region: string;
  district: string;
  subs: number;
  online: number;
  instore: number;
  revenue: number;
  appts: number;
  regular: number;
  assessments: number;
  followUps: number;
  exceptions: number;
  followUpRequired: number;
  sourceFile: string;
  demo?: boolean;
}

/** What one subscription export said about the current and prior week, so day-over-day change can be worked out. */
export interface SubscriptionSnapshot {
  id: string; // export timestamp (ISO) or import time
  /** last day the export covers (export date − 1 day) */
  through: ISODate;
  fy: number;
  /** latest week in the export (in progress) */
  fw: number;
  /** storeNo → [subs, instore] for the latest week, and the same for the week before */
  cur: Record<string, [number, number]>;
  prior: Record<string, [number, number]>;
  sourceFile: string;
  demo?: boolean;
}

/** One HomeCare+ appointment from the appointment file: links a survey (by Appointment ID) to its RedVest Associate. */
export interface AppointmentRecord {
  /** Appointment ID (same as the Tracker's Appointment ID) */
  id: string;
  jobId?: string;
  associate: string;
  storeNo?: string;
  date?: ISODate;
  fw?: number;
  sourceFile: string;
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
  /** One of the nine attributes, or 'ltr' (Medallia's LTR, kept only to cross-check the Tracker). */
  attr: AttributeKey | 'ltr';
  top2: number;
  n: number;
  pct: number;
  /** n is Medallia's survey Sample Size, not a per-question count. */
  nApprox?: boolean;
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
  escalate?: boolean;
  confidence: number;
  source: TagSource;
  rationale?: string;
  reviewed?: boolean;
}

export interface OriginalText {
  recordId: string;
  field: 'comment' | 'insights';
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


export interface LeadershipQuestion {
  id: string;
  fw: number; // WBR week the question was asked about
  asker?: string;
  question: string;
  answered: boolean;
  createdAt: string;
}


export interface KV<T = unknown> {
  key: string;
  value: T;
}

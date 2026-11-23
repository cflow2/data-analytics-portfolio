import Dexie, { type EntityTable } from 'dexie';
import type {
  SurveyRecord, CallRecord, FollowUpRecord, AttributeWeekly, StoreRecord, ThemeTag, OriginalText,
  ImportedFile, WeekMeta, Signal, LeadershipQuestion, Escalation, KV,
} from '@/domain/types';

export class HomeCareDB extends Dexie {
  surveys!: EntityTable<SurveyRecord, 'id'>;
  calls!: EntityTable<CallRecord, 'id'>;
  followups!: EntityTable<FollowUpRecord, 'id'>;
  attributeWeekly!: EntityTable<AttributeWeekly, 'id'>;
  stores!: EntityTable<StoreRecord, 'storeNo'>;
  tags!: EntityTable<ThemeTag, 'recordId'>;
  /** Unredacted text. Only read by the "Show original" toggle; never exported to AI or WBR. */
  originals!: Dexie.Table<OriginalText, [string, string]>;
  files!: EntityTable<ImportedFile, 'id'>;
  weeks!: EntityTable<WeekMeta, 'fw'>;
  signals!: EntityTable<Signal, 'id'>;
  questions!: EntityTable<LeadershipQuestion, 'id'>;
  escalations!: EntityTable<Escalation, 'callId'>;
  /** settings, column mappings, WBR drafts, AI cache, etc. */
  kv!: EntityTable<KV, 'key'>;

  constructor(name = 'homecare-ltr') {
    super(name);
    this.version(1).stores({
      surveys: 'id, fw, date, storeNo, region, sourceFile, demo',
      calls: 'id, fw, date, caseNo, driverNorm, isAssociate, storeNo, sourceFile, demo',
      followups: 'id, fw, surveyId, storeNo, sourceFile, demo',
      attributeWeekly: 'id, fw, attr',
      stores: 'storeNo, region, district',
      tags: 'recordId, channel, fw, primary, source',
      originals: '[recordId+field], recordId',
      files: 'id, kind, importedAt',
      weeks: 'fw',
      signals: 'id, theme, firstSeenFw',
      questions: 'id, fw, answered',
      escalations: 'callId, status',
      kv: 'key',
    });
  }
}

export const db = new HomeCareDB();

export const DATA_TABLES = [
  'surveys', 'calls', 'followups', 'attributeWeekly', 'stores', 'tags', 'originals', 'files',
  'weeks', 'signals', 'questions', 'escalations', 'kv',
] as const;
export type DataTable = (typeof DATA_TABLES)[number];

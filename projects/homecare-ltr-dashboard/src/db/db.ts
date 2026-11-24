import Dexie, { type EntityTable } from 'dexie';
import type {
  SurveyRecord, FollowUpRecord, AttributeWeekly, StoreRecord, ThemeTag, OriginalText,
  ImportedFile, WeekMeta, LeadershipQuestion, KV,
} from '@/domain/types';

export class HomeCareDB extends Dexie {
  surveys!: EntityTable<SurveyRecord, 'id'>;
  followups!: EntityTable<FollowUpRecord, 'id'>;
  attributeWeekly!: EntityTable<AttributeWeekly, 'id'>;
  stores!: EntityTable<StoreRecord, 'storeNo'>;
  tags!: EntityTable<ThemeTag, 'recordId'>;
  /** Unredacted text. Only read by the "Show original" toggle; never exported to AI or WBR. */
  originals!: Dexie.Table<OriginalText, [string, string]>;
  files!: EntityTable<ImportedFile, 'id'>;
  weeks!: EntityTable<WeekMeta, 'fw'>;
  questions!: EntityTable<LeadershipQuestion, 'id'>;
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
    // v2: the app reports LTR from surveys only. Contact-center calls, their tags, original notes, escalations,
    // the cross-channel signal register and Loyalty Cases file records are deleted once.
    this.version(2).stores({ calls: null, escalations: null, signals: null }).upgrade(async (tx) => {
      const callIds = (await tx.table('tags').where('channel').equals('call').primaryKeys()) as string[];
      await tx.table('tags').where('channel').equals('call').delete();
      if (callIds.length) await tx.table('originals').where('recordId').anyOf(callIds).delete();
      await tx.table('originals').filter((o: { field: string }) => o.field === 'notes').delete();
      await tx.table('files').where('kind').equals('loyalty-cases').delete();
      await tx.table('kv').where('key').startsWith('wbr:').delete(); // WBR Builder drafts
    });
  }
}

export const db = new HomeCareDB();

export const DATA_TABLES = [
  'surveys', 'followups', 'attributeWeekly', 'stores', 'tags', 'originals', 'files',
  'weeks', 'questions', 'kv',
] as const;
export type DataTable = (typeof DATA_TABLES)[number];

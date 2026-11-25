import Dexie, { type EntityTable } from 'dexie';
import type {
  SurveyRecord, AppointmentRecord, FollowUpRecord, SubscriptionWeek, SubscriptionSnapshot, AttributeWeekly, StoreRecord, ThemeTag, OriginalText,
  ImportedFile, WeekMeta, LeadershipQuestion, KV,
} from '@/domain/types';

export class HomeCareDB extends Dexie {
  surveys!: EntityTable<SurveyRecord, 'id'>;
  followups!: EntityTable<FollowUpRecord, 'id'>;
  /** Appointment ID → RedVest Associate (from the appointment file) */
  appointments!: EntityTable<AppointmentRecord, 'id'>;
  /** HomeCare+ subscriptions and completed appointments by store and fiscal week (latest export) */
  subscriptionWeeks!: EntityTable<SubscriptionWeek, 'id'>;
  /** one per subscription export: current/prior week by store, for “yesterday” and same-point-last-week */
  subscriptionSnapshots!: EntityTable<SubscriptionSnapshot, 'id'>;
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
    // v3: appointment file (associate filter)
    this.version(3).stores({ appointments: 'id, associate, storeNo, fw, jobId' });
    // v4: subscription exports
    this.version(4).stores({ subscriptionWeeks: 'id, fy, fw, storeNo, region', subscriptionSnapshots: 'id, through, fw' });
  }
}

export const db = new HomeCareDB();

export const DATA_TABLES = [
  'surveys', 'appointments', 'subscriptionWeeks', 'subscriptionSnapshots', 'followups', 'attributeWeekly', 'stores', 'tags', 'originals', 'files',
  'weeks', 'questions', 'kv',
] as const;
export type DataTable = (typeof DATA_TABLES)[number];

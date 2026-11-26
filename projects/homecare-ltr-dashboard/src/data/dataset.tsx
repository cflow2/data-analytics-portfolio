import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { db } from '@/db/db';
import { useLive } from '@/hooks/useLive';
import { DEFAULT_TAXONOMY, type ThemeDef } from '@/domain/taxonomy';
import { normalizeApptId } from '@/ingest/normalize';
import { buildStoreDirectory } from '@/domain/geo';
import type {
  AppointmentRecord, AttributeWeekly, FollowUpRecord, ImportedFile, LeadershipQuestion, StoreRecord, SubscriptionSnapshot, SubscriptionWeek, SurveyRecord, ThemeTag, WeekMeta,
} from '@/domain/types';

export interface Dataset {
  surveys: SurveyRecord[];
  /** HomeCare+ subscriptions and completed appointments by store and week (latest export) */
  subscriptionWeeks: SubscriptionWeek[];
  /** one per subscription export, for day-over-day change */
  subscriptionSnapshots: SubscriptionSnapshot[];
  /** every associate in the appointment file, sorted */
  associates: string[];
  /** appointment file rows by normalized Appointment ID */
  appointments: Map<string, AppointmentRecord>;
  followups: FollowUpRecord[];
  stores: Map<string, StoreRecord>;
  tags: Map<string, ThemeTag>;
  tagList: ThemeTag[];
  attributeWeekly: AttributeWeekly[];
  weeks: Map<number, WeekMeta>;
  files: ImportedFile[];
  taxonomy: ThemeDef[];
  questions: LeadershipQuestion[];
}

interface DatasetState { data: Dataset | undefined; loading: boolean; error: Error | null }
const Ctx = createContext<DatasetState>({ data: undefined, loading: true, error: null });

/** Loads the whole (local, modest-size) dataset once and keeps it live; screens compute from memory. */
export function DatasetProvider({ children }: { children: ReactNode }) {
  const q = useLive(async () => {
    const [surveys, appointments, subscriptionWeeks, subscriptionSnapshots, followups, stores, tagList, attributeWeekly, weeks, files, tax, questions] = await Promise.all([
      db.surveys.toArray(), db.appointments.toArray(), db.subscriptionWeeks.toArray(), db.subscriptionSnapshots.toArray(), db.followups.toArray(), db.stores.toArray(), db.tags.toArray(),
      db.attributeWeekly.toArray(), db.weeks.toArray(), db.files.orderBy('importedAt').reverse().toArray(),
      db.kv.get('taxonomy'), db.questions.toArray(),
    ]);
    const taxonomy = (tax?.value as ThemeDef[] | undefined) ?? DEFAULT_TAXONOMY;
    // RedVest Associate joined by Appointment ID (the appointment file can be loaded before or after the Tracker).
    // Job ID and customer contact fill in from the appointment file when the survey doesn't carry them.
    const byId = new Map(appointments.map((a) => [a.id, a]));
    if (byId.size) for (const s of surveys) {
      const a = s.appointmentId ? byId.get(normalizeApptId(s.appointmentId)) : undefined;
      if (!a) continue;
      s.associate = a.associate;
      s.jobId ||= a.jobId;
      s.customerName ||= a.customerName;
      s.customerPhone ||= a.customerPhone;
      if (!s.storeNo && a.storeNo) s.storeNo = a.storeNo;
    }
    // A survey without a store number takes it from its follow-up row (same survey ID).
    const fuStore = new Map(followups.filter((f) => f.surveyId && f.storeNo).map((f) => [f.surveyId!, f.storeNo]));
    for (const s of surveys) if (!s.storeNo && fuStore.has(s.id)) s.storeNo = fuStore.get(s.id)!;
    return { surveys, appointments: byId, subscriptionWeeks, subscriptionSnapshots, associates: [...new Set(appointments.map((a) => a.associate))].sort(), followups, stores, tagList, attributeWeekly, weeks, files, taxonomy, questions };
  }, []);
  const data = useMemo<Dataset | undefined>(() => q.data && {
    ...q.data,
    // Store names from every file: stores table first, then the subscription export's names; numbers-only stores too.
    stores: buildStoreDirectory(q.data.stores, q.data.subscriptionWeeks,
      [...q.data.surveys, ...q.data.followups, ...[...q.data.appointments.values()].map((a) => ({ storeNo: a.storeNo }))]),
    tags: new Map(q.data.tagList.map((t) => [t.recordId, t])),
    weeks: new Map(q.data.weeks.map((w) => [w.fw, w])),
  }, [q.data]);
  return <Ctx.Provider value={{ data, loading: q.loading && !q.data, error: q.error }}>{children}</Ctx.Provider>;
}

export function useDataset(): DatasetState {
  return useContext(Ctx);
}

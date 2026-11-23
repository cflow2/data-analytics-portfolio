import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { db } from '@/db/db';
import { useLive } from '@/hooks/useLive';
import { DEFAULT_TAXONOMY, type ThemeDef } from '@/domain/taxonomy';
import type {
  AttributeWeekly, CallRecord, Escalation, FollowUpRecord, ImportedFile, LeadershipQuestion, Signal, StoreRecord, SurveyRecord, ThemeTag, WeekMeta,
} from '@/domain/types';

export interface Dataset {
  surveys: SurveyRecord[];
  calls: CallRecord[];
  followups: FollowUpRecord[];
  stores: Map<string, StoreRecord>;
  tags: Map<string, ThemeTag>;
  tagList: ThemeTag[];
  attributeWeekly: AttributeWeekly[];
  weeks: Map<number, WeekMeta>;
  escalations: Map<string, Escalation>;
  files: ImportedFile[];
  taxonomy: ThemeDef[];
  signals: Signal[];
  pins: Record<number, Record<string, string>>;
  questions: LeadershipQuestion[];
}

interface DatasetState { data: Dataset | undefined; loading: boolean; error: Error | null }
const Ctx = createContext<DatasetState>({ data: undefined, loading: true, error: null });

/** Loads the whole (local, modest-size) dataset once and keeps it live; screens compute from memory. */
export function DatasetProvider({ children }: { children: ReactNode }) {
  const q = useLive(async () => {
    const [surveys, calls, followups, stores, tagList, attributeWeekly, weeks, escalations, files, tax, signals, pinRows, questions] = await Promise.all([
      db.surveys.toArray(), db.calls.toArray(), db.followups.toArray(), db.stores.toArray(), db.tags.toArray(),
      db.attributeWeekly.toArray(), db.weeks.toArray(), db.escalations.toArray(), db.files.orderBy('importedAt').reverse().toArray(),
      db.kv.get('taxonomy'), db.signals.toArray(), db.kv.where('key').startsWith('wbrPins:').toArray(), db.questions.toArray(),
    ]);
    const taxonomy = (tax?.value as ThemeDef[] | undefined) ?? DEFAULT_TAXONOMY;
    const pins = Object.fromEntries(pinRows.map((r) => [Number(r.key.split(':')[1]), r.value as Record<string, string>]));
    return { surveys, calls, followups, stores, tagList, attributeWeekly, weeks, escalations, files, taxonomy, signals, pins, questions };
  }, []);
  const data = useMemo<Dataset | undefined>(() => q.data && {
    ...q.data,
    stores: new Map(q.data.stores.map((s) => [s.storeNo, s])),
    tags: new Map(q.data.tagList.map((t) => [t.recordId, t])),
    weeks: new Map(q.data.weeks.map((w) => [w.fw, w])),
    escalations: new Map(q.data.escalations.map((e) => [e.callId, e])),
  }, [q.data]);
  return <Ctx.Provider value={{ data, loading: q.loading && !q.data, error: q.error }}>{children}</Ctx.Provider>;
}

export function useDataset(): DatasetState {
  return useContext(Ctx);
}

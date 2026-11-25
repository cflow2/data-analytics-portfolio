/** Editable slide fields, saved per week (kv “ltrSlide:<fw>”), plus JSON snapshots. */
import { db as defaultDb, type HomeCareDB } from '@/db/db';
import type { SurveyRecord, ThemeTag } from '@/domain/types';
import { bucketOf, draftBullets, suggestCallouts, suggestTopDrivers, DEFAULT_DRIVERS, type DriverDef, type Bucket, type CalloutCategory, type SlideMetrics } from './ltrMetrics';

export interface CalloutEdit { region: string; categories: CalloutCategory[]; why: string }
export interface CardEdit { drivers: string[]; bullets: string[] }
export interface SlideEdits {
  fw: number;
  presenter: string;
  callouts: CalloutEdit[];
  cards: Record<Bucket, CardEdit>;
  /** RedVest Associate shout-out for the talk track (no names in exports unless the analyst types one). */
  shoutout: string;
  close: string;
  showAllowance: boolean;
  /** YTD typed in from Medallia's expanded view (overrides the imported value) */
  ytdOverride?: { ltr: number; n: number } | null;
  updatedAt?: string;
}

export const slideKey = (fw: number) => `ltrSlide:${fw}`;
export const snapshotKey = (fw: number) => `ltrSlideSnapshot:${fw}`;

export function defaultEdits(m: SlideMetrics, surveys: SurveyRecord[], tags: Map<string, ThemeTag>, presenter = ''): SlideEdits {
  const week = surveys.filter((s) => s.fw === m.fw && s.ltr !== null);
  const group = (b: Bucket) => week.filter((s) => bucketOf(s.ltr!) === b);
  const card = (b: Bucket): CardEdit => ({ drivers: suggestTopDrivers(group(b), tags), bullets: draftBullets(b, group(b), tags) });
  return {
    fw: m.fw, presenter,
    callouts: suggestCallouts(m, surveys, tags).map(({ region, categories, why }) => ({ region, categories, why })),
    cards: { promoters: card('promoters'), passives: card('passives'), detractors: card('detractors') },
    shoutout: '',
    close: m.cur.ltr !== null && m.cur.ltr >= m.benchmark ? `Above the ${m.benchmark} benchmark; keep the focus on the regions still below it.` : `Below the ${m.benchmark} benchmark; focus is the regions driving the 0–8 scores.`,
    showAllowance: false,
  };
}

export async function loadEdits(fw: number, database: HomeCareDB = defaultDb): Promise<SlideEdits | null> {
  return ((await database.kv.get(slideKey(fw)))?.value as SlideEdits | undefined) ?? null;
}
export async function saveEdits(e: SlideEdits, database: HomeCareDB = defaultDb) {
  await database.kv.put({ key: slideKey(e.fw), value: { ...e, updatedAt: new Date().toISOString() } });
}
export async function resetEdits(fw: number, database: HomeCareDB = defaultDb) {
  await database.kv.delete(slideKey(fw));
}

export interface SlideSnapshot { version: 1; fw: number; savedAt: string; metrics: SlideMetrics; edits: SlideEdits; drivers: { short: string; pct: number | null; display: number | null }[] }
export async function saveSnapshot(s: SlideSnapshot, database: HomeCareDB = defaultDb) {
  await database.kv.put({ key: snapshotKey(s.fw), value: s });
}

// ───────── Key Drivers selection (Settings) ─────────
const DRIVERS_KEY = 'slideDrivers';
export async function getDriverDefs(database: HomeCareDB = defaultDb): Promise<DriverDef[]> {
  return ((await database.kv.get(DRIVERS_KEY))?.value as DriverDef[] | undefined) ?? DEFAULT_DRIVERS;
}
export async function saveDriverDefs(defs: DriverDef[], database: HomeCareDB = defaultDb) {
  await database.kv.put({ key: DRIVERS_KEY, value: defs });
}

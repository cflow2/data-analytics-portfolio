import { db } from '@/db/db';
import type { Channel, Sentiment, ThemeTag } from '@/domain/types';

/** Save a human override. Manual tags are never overwritten by the rules engine or AI. */
export class LockedWeekError extends Error {
  constructor(fw: number) { super(`FW${fw} is locked (read-only). Unlock it on the Data Manager to edit.`); }
}

export async function assertUnlocked(fw: number) {
  if ((await db.weeks.get(fw))?.locked) throw new LockedWeekError(fw);
}

export async function saveManualTag(recordId: string, channel: Channel, fw: number, patch: Partial<Pick<ThemeTag, 'primary' | 'secondary' | 'sentiment' | 'subTag' | 'cancellation' | 'contactType' | 'escalate'>>, prev?: ThemeTag) {
  await assertUnlocked(fw);
  const base: ThemeTag = prev ?? { recordId, channel, fw, primary: 'other', secondary: [], sentiment: 'Neutral' as Sentiment, confidence: 1, source: 'Manual' };
  const next: ThemeTag = { ...base, ...patch, recordId, channel, fw, confidence: 1, source: 'Manual', reviewed: true };
  next.secondary = [...new Set(next.secondary.filter((s) => s !== next.primary))].slice(0, 3);
  if (patch.primary && patch.primary !== base.primary && !('subTag' in patch)) next.subTag = undefined;
  next.rationale = prev ? `Manual override (was ${prev.primary}, ${prev.source})` : 'Manual';
  await db.tags.put(next);
}

export async function markReviewed(tag: ThemeTag) {
  await assertUnlocked(tag.fw);
  await db.tags.put({ ...tag, reviewed: true });
}

const PIN_KEY = (fw: number) => `wbrPins:${fw}`;
export type Pins = Record<string, string>; // theme → survey record id

export async function getPins(fw: number): Promise<Pins> {
  return ((await db.kv.get(PIN_KEY(fw)))?.value as Pins | undefined) ?? {};
}

/** Pin a quote to the WBR: at most one per theme (pinning replaces that theme's pin). */
export async function togglePin(fw: number, theme: string, recordId: string): Promise<Pins> {
  await assertUnlocked(fw);
  const pins = { ...(await getPins(fw)) };
  if (pins[theme] === recordId) delete pins[theme];
  else pins[theme] = recordId;
  await db.kv.put({ key: PIN_KEY(fw), value: pins });
  return pins;
}

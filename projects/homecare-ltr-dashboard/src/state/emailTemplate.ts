/** Store manager email template and per-survey composer edits, kept in IndexedDB (never sent anywhere). */
import { useMemo } from 'react';
import { db } from '@/db/db';
import { useLive } from '@/hooks/useLive';
import { DEFAULT_TEMPLATE, type EmailEdits, type EmailTemplate } from '@/writing/smEmail';

const TEMPLATE_KEY = 'smEmailTemplate';
const EDIT_PREFIX = 'smEmail:';

export function useEmailTemplate(): EmailTemplate {
  const q = useLive(() => db.kv.get(TEMPLATE_KEY), []);
  return useMemo(() => ({ ...DEFAULT_TEMPLATE, ...((q.data?.value as Partial<EmailTemplate> | undefined) ?? {}) }), [q.data]);
}

export async function saveEmailTemplate(patch: Partial<EmailTemplate>): Promise<void> {
  const cur = ((await db.kv.get(TEMPLATE_KEY))?.value as Partial<EmailTemplate> | undefined) ?? {};
  await db.kv.put({ key: TEMPLATE_KEY, value: { ...cur, ...patch } });
}

export async function resetEmailTemplate(): Promise<void> {
  await db.kv.delete(TEMPLATE_KEY);
}

/** Every survey’s saved composer edits, by survey ID. */
export function useEmailEdits(): Map<string, EmailEdits> {
  const q = useLive(() => db.kv.where('key').startsWith(EDIT_PREFIX).toArray(), []);
  return useMemo(() => new Map((q.data ?? []).map((r) => [r.key.slice(EDIT_PREFIX.length), r.value as EmailEdits])), [q.data]);
}

export async function saveEmailEdits(surveyId: string, patch: EmailEdits): Promise<void> {
  const key = EDIT_PREFIX + surveyId;
  const cur = ((await db.kv.get(key))?.value as EmailEdits | undefined) ?? {};
  const next: EmailEdits = { ...cur, ...patch };
  for (const k of Object.keys(next) as (keyof EmailEdits)[]) if (next[k] === undefined || next[k] === '') delete next[k];
  await db.kv.put({ key, value: next });
}

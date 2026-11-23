import { db } from '@/db/db';

const KEY = (fw: number) => `wbrNotes:${fw}`;

/** Extra lines pinned to a week's WBR speaker notes (e.g. from Ask). */
export async function getWbrNotes(fw: number): Promise<string[]> {
  return ((await db.kv.get(KEY(fw)))?.value as string[] | undefined) ?? [];
}
export async function addWbrNote(fw: number, text: string) {
  const cur = await getWbrNotes(fw);
  if (!cur.includes(text)) await db.kv.put({ key: KEY(fw), value: [...cur, text] });
}
export async function removeWbrNote(fw: number, text: string) {
  await db.kv.put({ key: KEY(fw), value: (await getWbrNotes(fw)).filter((x) => x !== text) });
}

import { addDays, type ISODate } from '@/lib/dates';
import type { CallRecord, ThemeTag } from '@/domain/types';

export function countBy<T>(xs: T[], key: (x: T) => string): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Calls per day, Saturday through Friday of the fiscal week. */
export function dailyVolume(calls: CallRecord[], weekStart: ISODate): { date: ISODate; calls: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    return { date, calls: calls.filter((c) => c.date === date).length };
  });
}

export interface RepeatGroup { key: string; kind: 'case' | 'phone'; calls: CallRecord[] }

/** Cases with 2+ call rows, and (hashed, never displayed) phone numbers seen on 2+ different cases. */
export function repeatCallers(calls: CallRecord[]): RepeatGroup[] {
  const byCase = new Map<string, CallRecord[]>();
  for (const c of calls) byCase.set(c.caseNo, [...(byCase.get(c.caseNo) ?? []), c]);
  const out: RepeatGroup[] = [...byCase].filter(([, cs]) => cs.length >= 2).map(([k, cs]) => ({ key: k, kind: 'case' as const, calls: cs }));
  const byPhone = new Map<string, CallRecord[]>();
  for (const c of calls) if (c.phoneHash) byPhone.set(c.phoneHash, [...(byPhone.get(c.phoneHash) ?? []), c]);
  let n = 0;
  for (const [, cs] of byPhone) {
    if (new Set(cs.map((c) => c.caseNo)).size >= 2) out.push({ key: `Caller ${String.fromCharCode(65 + (n++ % 26))}${n > 26 ? Math.ceil(n / 26) : ''}`, kind: 'phone', calls: cs });
  }
  return out.sort((a, b) => b.calls.length - a.calls.length);
}

/** Primary theme × sub-tag counts for stacked bars. */
export function themeSubCounts(tags: ThemeTag[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>();
  for (const t of tags) {
    const sub = t.subTag ?? '—';
    const inner = m.get(t.primary) ?? new Map<string, number>();
    inner.set(sub, (inner.get(sub) ?? 0) + 1);
    m.set(t.primary, inner);
  }
  return m;
}

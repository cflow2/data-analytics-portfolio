/** Theme mentions. A record counts toward a theme if it is the primary or a secondary theme. Channels are never blended. */
import type { CallRecord, Channel, ThemeTag } from '@/domain/types';

export interface ThemeCount { theme: string; surveys: number; calls: number; surveysPos: number; surveysNeg: number }

export function themeMentions(tags: ThemeTag[], fw: number, customerCallIds: Set<string>, exclude: string[] = ['other']): ThemeCount[] {
  const m = new Map<string, ThemeCount>();
  const bump = (theme: string, ch: Channel, sentiment: ThemeTag['sentiment']) => {
    if (exclude.includes(theme)) return;
    const c = m.get(theme) ?? { theme, surveys: 0, calls: 0, surveysPos: 0, surveysNeg: 0 };
    if (ch === 'survey') { c.surveys++; if (sentiment === 'Positive') c.surveysPos++; if (sentiment === 'Negative') c.surveysNeg++; } else c.calls++;
    m.set(theme, c);
  };
  for (const t of tags) {
    if (t.fw !== fw) continue;
    if (t.channel === 'call' && !customerCallIds.has(t.recordId)) continue; // associate/store calls never count
    for (const theme of new Set([t.primary, ...t.secondary])) bump(theme, t.channel, t.sentiment);
  }
  return [...m.values()];
}

export interface CallKpis {
  calls: number;
  cases: number;
  associate: number;
  cancellations: number;
  exclusionCancels: number;
  /** null when untagged */
  exclusionCancelPct: number | null;
  tagged: number;
}

export function callKpis(calls: CallRecord[], tags: Map<string, ThemeTag>): CallKpis {
  const customer = calls.filter((c) => !c.isAssociate);
  const t = customer.map((c) => tags.get(c.id)).filter((x): x is ThemeTag => !!x);
  const cancels = t.filter((x) => x.cancellation);
  const excl = cancels.filter((x) => x.primary === 'exclusions').length;
  return {
    calls: customer.length,
    cases: new Set(customer.map((c) => c.caseNo.trim())).size,
    associate: calls.length - customer.length,
    cancellations: cancels.length,
    exclusionCancels: excl,
    exclusionCancelPct: cancels.length ? (100 * excl) / cancels.length : null,
    tagged: t.length,
  };
}

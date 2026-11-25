/** Rule-based summaries. Every number comes from WeekFacts. */
import type { WeekFacts } from '@/analytics/facts';
import type { ThemeDef } from '@/domain/taxonomy';

const pct = (x: number | null, d = 1) => (x === null ? '—' : `${x.toFixed(d)}%`);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Two or three sentences on what moved vs the prior week (LTR, then survey comment themes). */
export function whatChangedSummary(f: WeekFacts, tax: ThemeDef[]): string {
  const name = (id: string) => tax.find((t) => t.id === id)?.name ?? id;
  const parts: string[] = [];
  const { cur, prior } = f.ltr;
  if (cur.pct !== null && prior.pct !== null) {
    const d = cur.pct - prior.pct;
    parts.push(`LTR ${d >= 0 ? 'rose' : 'fell'} ${Math.abs(d).toFixed(1)} pts to ${pct(cur.pct)} (n=${cur.n}) from ${pct(prior.pct)} (n=${prior.n}).`);
  }
  const up = [...f.changes].filter((c) => c.dPrior > 0).sort((a, b) => b.dPrior - a.dPrior)[0];
  const down = [...f.changes].filter((c) => c.dPrior < 0).sort((a, b) => a.dPrior - b.dPrior)[0];
  if (up) parts.push(`${name(up.theme)} comments rose by ${up.dPrior} to ${up.cur.surveys}${down ? `; ${lower(name(down.theme))} comments fell by ${Math.abs(down.dPrior)}` : ''}.`);
  const fresh = f.changes.filter((c) => c.isNew);
  if (fresh.length) parts.push(`New this week: ${fresh.map((c) => name(c.theme)).join(', ')}.`);
  return parts.join(' ') || `No week-over-week comparison available for FW${f.fw}.`;
}

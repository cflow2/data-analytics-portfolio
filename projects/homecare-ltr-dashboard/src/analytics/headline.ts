import type { LtrSummary } from '@/lib/ltr';
import type { AttributeScore } from './attributes';

/** Rule-generated one-sentence summary of the week. Every LTR % carries its n. */
export function ruleHeadline(o: {
  fw: number; cur: LtrSummary; benchmark: number; lowest: AttributeScore | null; inHome: string;
  topCallTheme?: { name: string; calls: number }; detractors0to6: number;
}): string {
  if (o.cur.pct === null) return `No LTR surveys loaded for FW${o.fw} yet.`;
  const pos = o.cur.pct >= o.benchmark ? 'above' : 'below';
  const parts = [`FW${o.fw} LTR ${o.cur.pct.toFixed(1)}% (n=${o.cur.n}), ${pos} the ${o.benchmark}% benchmark`];
  if (o.inHome !== '—') parts.push(`in-home attributes at ${o.inHome}`);
  let s = parts.join('; ') + '.';
  const friction: string[] = [];
  if (o.lowest && o.lowest.pct !== null) friction.push(`${o.lowest.label} is the lowest attribute (${o.lowest.pct.toFixed(1)}%)`);
  if (o.topCallTheme) friction.push(`${o.topCallTheme.name} leads calls (${o.topCallTheme.calls})`);
  if (friction.length) s += ` The friction: ${friction.join(' and ')}.`;
  return s;
}

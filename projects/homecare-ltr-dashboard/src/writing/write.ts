/** Rule-based writing for the WBR and summaries. Every number comes from WeekFacts. */
import type { WeekFacts } from '@/analytics/facts';
import type { ThemeDef } from '@/domain/taxonomy';
import type { LeadershipQuestion } from '@/domain/types';

export const LINE_LIMIT = 85;

const pct = (x: number | null, d = 1) => (x === null ? '—' : `${x.toFixed(d)}%`);
const plural = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "Appointment management: 82 mentions · 76 calls · 6 surveys" (counts are records; never a blended rate). */
export function themeHeader(theme: string, f: WeekFacts, tax: ThemeDef[]): string {
  const m = f.mentions.find((x) => x.theme === theme);
  const s = m?.surveys ?? 0, c = m?.calls ?? 0;
  return `${tax.find((t) => t.id === theme)?.name ?? theme}: ${plural(s + c, 'mention')} · ${plural(c, 'call')} · ${plural(s, 'survey')}`;
}

const SCOPE_LABEL: Record<string, string> = {
  exclusions: 'service scope', appointment: 'scheduling', completion: 'unfinished service', value: 'value',
  associate: 'the associate', damage: 'post-visit damage', 'service-add': 'missing services', aging: 'accessibility needs', other: 'other reasons', untagged: 'untagged reasons',
};

/** One-line insight per theme, ≤ 85 characters. Picks the first candidate that fits. */
export function themeLine(theme: string, f: WeekFacts): string {
  const m = f.mentions.find((x) => x.theme === theme) ?? { surveys: 0, calls: 0, surveysPos: 0, surveysNeg: 0, theme };
  const cands: string[] = [];
  const low = f.lowestAttr;
  switch (theme) {
    case 'appointment': {
      const top = f.appointmentSubs[0];
      if (top && m.calls) {
        const lbl = lower(top.key.replace('Cancelled by store/Lowe’s', 'store cancellations').replace('No-show/missed', 'no-shows').replace('Online/app failure', 'online/app failures').replace('Auto-cancel', 'auto-cancels'));
        if (low?.key === 'scheduling' && low.pct !== null) cands.push(`${top.count} of ${m.calls} calls are ${lbl}; Ease of scheduling is lowest at ${pct(low.pct)}`);
        cands.push(`${top.count} of ${m.calls} appointment calls are ${lbl}`);
      }
      if (m.surveys) cands.push(`${plural(m.surveys, 'survey comment')} on booking; ${m.surveysNeg} negative`);
      break;
    }
    case 'exclusions': {
      const c = f.calls;
      if (c.exclusionCancels && c.cancellations) cands.push(`Exclusions drove ${c.exclusionCancels} of ${c.cancellations} cancellations (${Math.round((100 * c.exclusionCancels) / c.cancellations)}%)`);
      if (m.calls) cands.push(`${plural(m.calls, 'call')} about what the plan doesn’t cover (gas, tankless, roof vents)`);
      if (m.surveys) cands.push(`${plural(m.surveys, 'member')} cite exclusions in surveys`);
      break;
    }
    case 'completion':
      if (m.calls || m.surveys) cands.push(`${plural(m.calls, 'call')} and ${plural(m.surveys, 'survey')} on services started but not finished`, `${m.calls + m.surveys} reports of unfinished services (parts not brought, flushes)`);
      break;
    case 'damage':
      if (m.calls) cands.push(`${plural(m.calls, 'call')} report post-visit damage; ${f.damageUnescalated} not yet escalated`, `${plural(m.calls, 'call')} report post-visit damage`);
      else if (m.surveys) cands.push(`${plural(m.surveys, 'survey')} report post-visit damage`);
      break;
    case 'value':
      if (m.surveys) cands.push(`${m.surveysPos} of ${plural(m.surveys, 'value comment')} positive${f.refundDisputes ? `; ${plural(f.refundDisputes, 'refund dispute')} in calls` : ''}`);
      if (m.calls) cands.push(`${plural(m.calls, 'call')} on price, renewal or refunds`);
      break;
    case 'associate':
      if (m.surveys) cands.push(`Members praise RedVest Associates in ${m.surveysPos} of ${plural(m.surveys, 'comment')}`, `${m.surveysPos} of ${m.surveys} associate comments are positive`);
      break;
    case 'service-add':
      if (m.surveys + m.calls) cands.push(`${plural(m.surveys + m.calls, 'member')} asked for services we don’t offer yet`);
      break;
    case 'aging':
      if (m.surveys + m.calls) cands.push(`${plural(m.surveys + m.calls, 'member')} rely on the service to age in place safely`);
      break;
  }
  cands.push(`${m.surveys + m.calls} mentions this week`);
  return cands.find((c) => c.length <= LINE_LIMIT) ?? cands[cands.length - 1];
}

/** "FW40 Detractors: 7 of 131 — 3 of 7 cite service scope, the same driver behind 44% of cancellation calls." */
export function ltrCallout(f: WeekFacts): string {
  const { cur } = f.ltr;
  if (!cur.n) return `FW${f.fw}: no LTR surveys loaded.`;
  let s = `FW${f.fw} Detractors: ${cur.detractors} of ${cur.n}`;
  const top = f.rootCauses[0];
  if (top && cur.detractors) {
    s += ` — ${top.count} of ${cur.detractors} cite ${SCOPE_LABEL[top.theme] ?? top.theme}`;
    const drive = f.cancelDrivers.find((d) => d.key === top.theme);
    if (drive && f.calls.cancellations) s += `, the same driver behind ${Math.round((100 * drive.count) / f.calls.cancellations)}% of cancellation calls`;
  }
  return `${s}.`;
}

/** Two or three sentences on what moved vs the prior week. */
export function whatChangedSummary(f: WeekFacts, tax: ThemeDef[]): string {
  const name = (id: string) => tax.find((t) => t.id === id)?.name ?? id;
  const parts: string[] = [];
  const { cur, prior } = f.ltr;
  if (cur.pct !== null && prior.pct !== null) {
    const d = cur.pct - prior.pct;
    parts.push(`LTR ${d >= 0 ? 'rose' : 'fell'} ${Math.abs(d).toFixed(1)} pts to ${pct(cur.pct)} (n=${cur.n}) from ${pct(prior.pct)} (n=${prior.n}).`);
  }
  const callUp = [...f.changes].filter((c) => c.dCallsPrior > 0).sort((a, b) => b.dCallsPrior - a.dCallsPrior)[0];
  const callDown = [...f.changes].filter((c) => c.dCallsPrior < 0).sort((a, b) => a.dCallsPrior - b.dCallsPrior)[0];
  if (callUp) parts.push(`${name(callUp.theme)} calls rose by ${callUp.dCallsPrior} to ${callUp.cur.calls}${callDown ? `; ${lower(name(callDown.theme))} calls fell by ${Math.abs(callDown.dCallsPrior)}` : ''}.`);
  const fresh = f.changes.filter((c) => c.isNew);
  if (fresh.length) parts.push(`New this week: ${fresh.map((c) => name(c.theme)).join(', ')}.`);
  return parts.join(' ') || `No week-over-week comparison available for FW${f.fw}.`;
}

export interface NotesInput {
  facts: WeekFacts;
  tax: ThemeDef[];
  headline: string;
  /** open questions from last week's WBR, each with an answer computed from this week's data */
  questions: { q: LeadershipQuestion; answer: string }[];
}

/** Speaker notes in the order the brief asks for. Private items are listed as "handle offline" without detail. */
export function speakerNotes({ facts: f, tax, headline, questions }: NotesInput): string {
  const lines: string[] = [];
  if (questions.length) {
    lines.push('Last week I was asked about…');
    for (const { q, answer } of questions) lines.push(`• ${q.question}`, `  → ${answer}`);
    lines.push('');
  }
  lines.push(headline, '');
  const { cur, prior } = f.ltr;
  const talking: string[] = [];
  if (cur.pct !== null) talking.push(`LTR is ${pct(cur.pct)} on n=${cur.n}${prior.pct !== null ? `, ${cur.pct >= prior.pct ? 'up' : 'down'} ${Math.abs(cur.pct - prior.pct).toFixed(1)} pts vs last week` : ''}, ${cur.pct >= f.benchmark ? 'above' : 'below'} the ${f.benchmark}% benchmark.`);
  talking.push(ltrCallout(f));
  const topCall = [...f.mentions].sort((a, b) => b.calls - a.calls)[0];
  if (topCall?.calls) talking.push(`${tax.find((t) => t.id === topCall.theme)?.name}: ${themeLine(topCall.theme, f)}.`);
  lines.push('Talking points:', ...talking.slice(0, 3).map((t) => `${talking.indexOf(t) + 1}. ${t}`), '');
  lines.push('Caveats:', '• Counts are calls, not unique members.', '• One call can carry several themes.', '• Call tags are directional (keyword rules, reviewed where flagged).');
  if (f.belowBenchmark.length) lines.push(`• Region results below ${f.benchmark}%: ${f.belowBenchmark.map((r) => `${r.region} ${pct(r.s.pct)} (n=${r.s.n})`).join(', ')}; small samples swing week to week.`);
  const priv: string[] = [];
  if (f.damageUnescalated) priv.push('Post-service damage escalations');
  if (f.detractors.some((d) => d.followUp !== 'Documented')) priv.push('Detractor follow-up gaps by store');
  if (priv.length) lines.push('', 'Handle offline:', ...priv.map((p) => `• ${p}`));
  return lines.join('\n');
}

/** Percentages a theme's line may quote. */
export function percentsForTheme(theme: string, f: WeekFacts): number[] {
  if (theme === 'appointment') return f.lowestAttr?.pct != null ? [f.lowestAttr.pct] : [];
  if (theme === 'exclusions' && f.calls.cancellations) return [(100 * f.calls.exclusionCancels) / f.calls.cancellations];
  return [];
}

/** The numbers a theme's slide line may use: that theme's mentions plus the facts the line templates draw on. */
export function allowedForTheme(theme: string, f: WeekFacts): number[] {
  const m = f.mentions.find((x) => x.theme === theme);
  const base = m ? [m.surveys, m.calls, m.surveys + m.calls, m.surveysPos, m.surveysNeg] : [0];
  switch (theme) {
    case 'appointment': return [...base, ...f.appointmentSubs.map((x) => x.count), ...(f.lowestAttr?.pct != null ? [f.lowestAttr.pct] : [])];
    case 'exclusions': return [...base, f.calls.exclusionCancels, f.calls.cancellations, f.calls.cancellations ? (100 * f.calls.exclusionCancels) / f.calls.cancellations : 0];
    case 'damage': return [...base, f.damageUnescalated];
    case 'value': return [...base, f.refundDisputes];
    default: return base;
  }
}

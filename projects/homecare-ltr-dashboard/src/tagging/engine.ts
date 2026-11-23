/**
 * Keyword rules engine — the always-available tagger (and the fallback when AI is off or fails).
 *
 * Rules (from the build brief):
 *  - One primary theme + up to 3 secondary, sentiment, confidence 0–1.
 *  - Primary precedence: safety/damage > failed experience > service demand > specific praise > general praise.
 *  - Never infer a theme from the score, from Medallia topic tags, or from a blank comment.
 *  - Calls: themes come from the "Problem / Reason for Calling" part; "Completed Actions" only informs outcomes.
 *  - Associate/store help-desk calls are never tagged.
 */
import { DEFAULT_TAXONOMY, type ThemeDef } from '@/domain/taxonomy';
import type { ContactType, Sentiment, ThemeTag } from '@/domain/types';

export interface TagInput {
  id: string;
  channel: 'survey' | 'call';
  fw: number;
  text: string;
  /** calls only */
  driver?: string;
  isAssociate?: boolean;
}

export const REVIEW_THRESHOLD = 0.7;

// ───────── text helpers ─────────
export function normText(s: string): string {
  return (s ?? '').replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
}

/** Split call notes into the reason (themes) and the actions (outcomes). */
export function splitCallNotes(notes: string): { reason: string; actions: string } {
  const t = normText(notes);
  const m = /completed actions?\s*:/i.exec(t);
  const reason = (m ? t.slice(0, m.index) : t).replace(/^.*?problem\s*\/?\s*reason for calling\s*:/i, '').trim();
  return { reason, actions: m ? t.slice(m.index + m[0].length).trim() : '' };
}

const compiled = new WeakMap<ThemeDef[], { def: ThemeDef; res: { re: RegExp; weight: number; kw: string }[] }[]>();

/** Keywords: phrases, `word*` prefixes, or `/regex/`. Multi-word phrases and regexes count double. */
export function compileKeyword(kw: string): { re: RegExp; weight: number } | null {
  const k = normText(kw);
  if (!k) return null;
  try {
    if (k.length > 2 && k.startsWith('/') && k.endsWith('/')) return { re: new RegExp(k.slice(1, -1), 'i'), weight: 2 };
    const body = k.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("[\\w']*");
    const pre = /^\w/.test(k) ? '\\b' : '';
    // Single words also match a plural ("senior" → "seniors"); phrases match as written.
    const plural = /^[a-z]+$/i.test(k) && !k.endsWith('s') ? '(?:s|es)?' : '';
    const post = /[\w]$/.test(k) ? '\\b' : '';
    return { re: new RegExp(pre + body + plural + post, 'i'), weight: /\s/.test(k) ? 2 : 1 };
  } catch { return null; }
}

function compile(tax: ThemeDef[]) {
  let c = compiled.get(tax);
  if (!c) {
    c = tax.map((def) => ({ def, res: def.keywords.map((kw) => ({ ...compileKeyword(kw)!, kw })).filter((x) => x.re) }));
    compiled.set(tax, c);
  }
  return c;
}

// ───────── sentiment ─────────
const POS = /\b(great|excellent|love[ds]?|loving|friendly|professional|worth|happy|thank(s| you)|awesome|helpful|knowledgeable|thorough|courteous|blessing|recommend(ed)?|pleased|satisfied|wonderful|amazing|good|nice|best|fantastic|outstanding|smooth(ly)?|peace of mind|pays for itself|great deal|perfect|appreciate[ds]?|impressed|kind|polite|respectful|easy|quick|on time|pleasure|huge help)\b/gi;
const NEG = /\b(not|never|no one|nobody|didn'?t|did not|don'?t|won'?t|wouldn'?t|couldn'?t|could not|can'?t|cannot|isn'?t|wasn'?t|waste|disappoint\w*|frustrat\w*|rude|cancel\w*|refund\w*|leak\w*|broke(n)?|damage[ds]?|skipped|excluded|confusing|error|late|missed|problem|issue|poor|terrible|horrible|unhappy|worst|expensive|rushed|chaos|annoy\w*|upset|angry|complain\w*|went up|on the fence|not sure|overheating|stuck|unplugged|timing out|half my list|difficult|hard to|waited|wait(ing)?)\b/gi;
const NEG_PHRASE_STRONG = /\b(not sure|waste of (time|money)|never again|not worth|do not recommend|don't recommend|would not recommend|wouldn't recommend)\b/gi;

function polarity(s: string): number {
  const pos = (s.match(POS) ?? []).length;
  const neg = (s.match(NEG) ?? []).length + 2 * (s.match(NEG_PHRASE_STRONG) ?? []).length;
  // "not good", "not worth" — negated positives count as negatives, not positives
  const negatedPos = (s.match(/\b(not|never|wasn'?t|isn'?t|didn'?t)\s+(very\s+)?(great|good|worth|happy|helpful|professional|friendly|satisfied|easy)\b/gi) ?? []).length;
  return pos - 2 * negatedPos - neg;
}

/** Text-only sentiment. The clause after "but"/"however" weighs double. Never uses the survey score. */
export function sentimentOf(text: string): Sentiment {
  const t = normText(text);
  const parts = t.split(/\b(?:but|however|although|though)\b/i);
  let score = polarity(parts[0]);
  for (const p of parts.slice(1)) score += 2 * polarity(p);
  if (score > 0) return 'Positive';
  if (score < 0) return 'Negative';
  return 'Neutral';
}

// ───────── call outcomes ─────────
const SUB_CANCEL = /\b(cancel(?:l?ing|l?ed)?|terminate)\s+(?:the |my |their |her |his |this )?(?:subscription|membership|homecare\+?|plan|program|service)\b|\bwants? to cancel\b(?!\s+(?:the |my |their )?(?:appointment|visit))|\b(?:requests?|requested|processed|submitted)\s+(?:a\s+)?(?:cancellation|cancel request)\b|\bcancellation\b(?!\s+of\s+(?:the |my )?(?:appointment|visit))|\bmember cancelling\b|\bcancelling\b(?!\s+(?:the |my )?(?:appointment|visit))/i;

export function isCancellation(reason: string, driver = ''): boolean {
  const r = normText(reason).replace(/\bauto-?cancel\w*/gi, '').replace(/\b(automatically|system) cancel\w*/gi, '').replace(/\bcancel\w*\s+(?:the |my |their )?(?:appointment|visit)\b/gi, '').replace(/\b(store|lowe'?s) cancel\w*/gi, '');
  return SUB_CANCEL.test(r) || /\bcancel\s*subscript/i.test(driver);
}

function appointmentSub(t: string): string {
  if (/\b(website|web site|online|the app|app (will|won't|wouldn't|kept|is|was|crash)|error|timing out|time(s|d)? out|won'?t load|will not load|log ?in|portal|link)\b/i.test(t)) return 'Online/app failure';
  if (/\b(never showed|no[- ]show|didn'?t show|did not show|nobody (showed|came)|no one (showed|came)|missed (the |my |an |a )?appointment|waited all day)\b/i.test(t)) return 'No-show/missed';
  if (/\b(auto-?cancel\w*|automatically cancel\w*|cancel\w* by the system|system cancel\w*)\b/i.test(t)) return 'Auto-cancel';
  if (/\b(store|lowe'?s)\s+cancel\w*|cancel\w*\s+(the|my)\s+(appointment|visit)\b/i.test(t)) return 'Cancelled by store/Lowe’s';
  if (/\b(arrival time|time window|what time|eta|when (will|would) (the|he|she|they))\b/i.test(t)) return 'Arrival-time request';
  return 'Routine scheduling';
}

const FAILURE_SUBS = new Set(['Online/app failure', 'No-show/missed', 'Auto-cancel', 'Cancelled by store/Lowe’s']);

function contactTypeFor(primary: string, subTag: string | undefined, cancellation: boolean): ContactType {
  switch (primary) {
    case 'damage': case 'completion': return 'Avoidable';
    case 'appointment': return subTag && FAILURE_SUBS.has(subTag) ? 'Avoidable' : 'Deflectable';
    case 'exclusions': return cancellation ? 'Avoidable' : 'Deflectable';
    case 'associate': return subTag === 'Concern' ? 'Avoidable' : 'Necessary';
    case 'value': case 'service-add': case 'aging': return 'Necessary';
    default: return cancellation ? 'Necessary' : 'Deflectable';
  }
}

// ───────── main ─────────
/** Associate concern words; any other associate keyword is praise. */
const ASSOC_CONCERN = /\b(rude|rushed|unprofessional|did not explain|didn'?t explain|shoe covers|careless|attitude|disrespect\w*|late|sloppy|messy|left a mess|didn'?t care|did not care|not (very )?(friendly|professional|knowledgeable|helpful))\b/i;
let assocConcern = false; // set per record before ranking

/** Precedence band for choosing the primary theme (lower wins). */
function band(theme: string, sentiment: Sentiment, subTag?: string): number {
  if (theme === 'damage') return 1; // safety / damage
  if (theme === 'appointment') {
    if (!subTag || FAILURE_SUBS.has(subTag)) return 2; // failed booking experience
    return sentiment === 'Positive' ? 5 : 3; // "easy to schedule" is general praise; a routine request is demand
  }
  if (theme === 'exclusions') return sentiment === 'Positive' ? 3 : 2; // a positive ask to add an excluded item is demand
  if (theme === 'completion') return 2; // failed experience
  if (theme === 'value') return sentiment === 'Positive' ? 5 : 2; // value praise is general praise
  if (theme === 'associate') return assocConcern ? 2 : 4; // concern = failure, praise = specific praise (judged on the associate words, not the whole comment)
  if (theme === 'service-add' || theme === 'aging') return 3; // service demand
  return 9;
}

export function tagRecord(input: TagInput, taxonomy: ThemeDef[] = DEFAULT_TAXONOMY): ThemeTag | null {
  if (input.channel === 'call' && input.isAssociate) return null; // help-desk calls are never VOC
  const { reason, actions } = input.channel === 'call' ? splitCallNotes(input.text) : { reason: normText(input.text), actions: '' };
  if (!reason || reason.replace(/\[[a-z#]+\]/gi, '').replace(/[\W_]+/g, '').length < 2) return null; // never infer from blank

  const hits: { theme: string; score: number; kws: string[] }[] = [];
  for (const { def, res } of compile(taxonomy)) {
    if (def.id === 'other') continue;
    let score = 0;
    const kws: string[] = [];
    for (const r of res) if (r.re.test(reason)) { score += r.weight; kws.push(r.kw); }
    if (score > 0) hits.push({ theme: def.id, score, kws });
  }
  const sentiment = sentimentOf(reason);
  const cancellation = input.channel === 'call' ? isCancellation(reason, input.driver) : false;
  const apptSub = hits.some((h) => h.theme === 'appointment') ? appointmentSub(reason) : undefined;
  assocConcern = hits.some((h) => h.theme === 'associate') && ASSOC_CONCERN.test(reason);

  let primary = 'other';
  let secondary: string[] = [];
  let confidence: number;
  let rationale: string;
  if (hits.length) {
    const ranked = [...hits].sort((a, b) =>
      band(a.theme, sentiment, a.theme === 'appointment' ? apptSub : undefined) - band(b.theme, sentiment, b.theme === 'appointment' ? apptSub : undefined)
      || b.score - a.score
      || taxonomy.findIndex((t) => t.id === a.theme) - taxonomy.findIndex((t) => t.id === b.theme));
    // A cancellation call whose reason mentions an exclusion is exclusion-driven.
    if (cancellation && hits.some((h) => h.theme === 'exclusions') && ranked[0].theme !== 'damage') {
      const i = ranked.findIndex((h) => h.theme === 'exclusions');
      ranked.unshift(...ranked.splice(i, 1));
    }
    primary = ranked[0].theme;
    secondary = ranked.slice(1, 4).map((h) => h.theme);
    const top = ranked[0];
    const runnerUp = ranked[1];
    const tie = runnerUp && band(runnerUp.theme, sentiment, apptSub) === band(top.theme, sentiment, apptSub) && runnerUp.score === top.score;
    confidence = tie ? 0.6 : top.score >= 2 ? 0.9 : 0.75;
    rationale = ranked.map((h) => `${h.theme}: ${h.kws.slice(0, 4).join(', ')}`).join(' · ');
  } else {
    // Text present but no theme keyword: short generic praise or a routine request is "Other"; anything longer needs a human.
    // Text present but no theme keyword: clearly positive text is general praise, a call is a routine request,
    // anything else (negative or unclear) needs a human.
    const words = reason.split(/\s+/).length;
    const clearlyPositive = sentiment === 'Positive' && !NEG.test(reason);
    NEG.lastIndex = 0;
    confidence = input.channel === 'call' || (words <= 10 && sentiment !== 'Negative') ? 0.8 : clearlyPositive ? 0.75 : 0.55;
    rationale = clearlyPositive ? 'General praise (no theme keywords)' : 'No theme keywords matched';
  }

  let subTag: string | undefined;
  if (primary === 'appointment') subTag = apptSub;
  else if (primary === 'exclusions') subTag = cancellation ? 'Exclusion drove cancel' : 'Exclusion question';
  else if (primary === 'value' && /\brefund/i.test(reason) && /\b(dispute|not performed|never performed|wasn'?t performed|charge|charged|want(s)? (a |my )?refund|requesting a refund)\b/i.test(reason)) subTag = 'Refund dispute';
  else if (primary === 'associate') subTag = assocConcern ? 'Concern' : 'Praise';

  const tag: ThemeTag = {
    recordId: input.id, channel: input.channel, fw: input.fw, primary, secondary, subTag, sentiment,
    confidence, source: 'Rule', rationale,
  };
  if (input.channel === 'call') {
    tag.cancellation = cancellation;
    tag.contactType = contactTypeFor(primary, subTag, cancellation);
    tag.escalate = primary === 'damage' || secondary.includes('damage');
    void actions;
  } else if (primary === 'damage') tag.escalate = true;
  return tag;
}

// ───────── outcomes from "Completed Actions" (calls) ─────────
export interface CallOutcome {
  cancellation: 'Processed' | 'Requested' | 'Not stated';
  window: 'Within 30 days' | 'After 30 days' | 'Not stated';
  refund: 'Refund processed' | 'Refund requested' | 'No refund' | 'Not stated';
}

export function callOutcome(notes: string): CallOutcome {
  const t = normText(notes).toLowerCase();
  const cancellation = /\bprocessed (the )?cancel|\bcancel(lation)? (was )?processed|\bcancelled the (subscription|membership)/.test(t) ? 'Processed'
    : /\bcancel(lation)? request|submitted (a )?cancel|request(ed)? to cancel|wants to cancel|cancel request/.test(t) ? 'Requested' : 'Not stated';
  const window = /\bwithin (the )?30 days\b/.test(t) ? 'Within 30 days' : /\b(outside|after|past|beyond) (the )?30 days\b/.test(t) ? 'After 30 days' : 'Not stated';
  const refund = /\bno refund|refund (was )?denied|not eligible for (a )?refund/.test(t) ? 'No refund'
    : /\brefund (was )?(processed|issued|completed)|processed (a |the )?refund|issued (a |the )?refund/.test(t) ? 'Refund processed'
      : /\brefund (request|requested|pending)|request(ed|ing)? (a )?refund|wants a refund/.test(t) ? 'Refund requested' : 'Not stated';
  return { cancellation, window, refund };
}

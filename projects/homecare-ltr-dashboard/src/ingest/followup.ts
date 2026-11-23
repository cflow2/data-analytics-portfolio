import type { FollowUpStatus } from '@/domain/types';

/** Intentions and requests are not contact: "I will call…", "Store asked to contact…", "need to reach out". */
const INTENT = /\b(?:will|to|plan(?:s|ning)? to|going to|asked to|ask(?:ing)? (?:the )?(?:store|sm) to|need(?:s)? to|should|please)\s+(?:also\s+)?(?:call|contact|reach(?: out)?|speak|talk|follow up|follow-up|connect|visit)\b[^.;]*/gi;

/** Evidence that someone actually reached the member. */
const CONTACT = new RegExp([
  String.raw`\b(?:called|contacted|spoke|talked|reached|connected with|met with|visited)\b`,
  String.raw`\bleft (?:a |an )?(?:voice ?mail|vm|message)\b`,
  String.raw`\b(?:phone call|by phone|over the phone|in person)\b`,
  String.raw`\bapologi[sz]ed (?:to )?(?:the )?(?:customer|member|her|him|them)\b`,
  String.raw`\b(?:customer|member|cx|she|he|they)\s+(?:confirmed|stated|said|shared|explained|agreed|was satisfied|is satisfied|accepted|declined)\b`,
].join('|'), 'i');

const EMAIL_ONLY = /\b(?:e-?mail(?:ed)?|sent (?:an? )?(?:e-?mail|note|message)|forwarded)\b/i;

const BLANK = /^(?:n\/?a|none|tbd|-+|\.+|pending|no comment|no insights?)$/i;

/**
 * Classify an SM's Insights note.
 *  - Documented: a real contact with the member is described (past tense)
 *  - Email only: forwarded/emailed, an intention ("I will call"), or internal review/coaching with no member contact
 *  - Missing: blank (a survey absent from the file is also Missing — computed at validation)
 */
export function classifyInsight(text: string): FollowUpStatus {
  const t = (text ?? '').trim();
  if (!t || BLANK.test(t)) return 'Missing';
  const withoutIntent = t.replace(INTENT, ' ');
  if (CONTACT.test(withoutIntent)) return 'Documented';
  return 'Email only';
}

/** Why a note was classified the way it was (shown as a tooltip). */
export function insightReason(text: string): string {
  const s = classifyInsight(text);
  if (s === 'Missing') return 'No insight recorded';
  if (s === 'Documented') return 'Describes contact with the member';
  if (EMAIL_ONLY.test(text)) return 'Email/forward only — no member contact described';
  if (INTENT.test(text)) { INTENT.lastIndex = 0; return 'Plan or request to contact — no completed contact described'; }
  return 'Internal review or note — no member contact described';
}

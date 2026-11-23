import type { FollowUpStatus } from '@/domain/types';

const CONTACT = /\b(called|call(?:ed)? (?:and|the)|spoke|speak|talked|reached|connected|met with|visited|discussed|apologi[sz]ed|contacted|rescheduled|left (?:a )?(?:voice ?mail|vm|message)|phone call|by phone)\b/i;
const EMAIL_ONLY = /\b(e-?mail(?:ed)?|sent (?:an? )?(?:e-?mail|email|note|message)|forwarded)\b/i;

/**
 * Classify an SM's Insights note.
 *  - Documented: a real contact is described
 *  - Email only: e.g. "Sent email to SM"
 *  - Missing: blank (a survey absent from the file is also Missing — computed at validation)
 */
export function classifyInsight(text: string): FollowUpStatus {
  const t = (text ?? '').trim();
  if (!t || /^(n\/?a|none|tbd|-+|pending)$/i.test(t)) return 'Missing';
  if (CONTACT.test(t)) return 'Documented';
  if (EMAIL_ONLY.test(t)) return 'Email only';
  return t.length >= 25 ? 'Documented' : 'Email only';
}

/**
 * Store manager email for one detractor, ready to paste into Outlook.
 * Built from the survey (score, exact comment), the appointment file (associate, Job ID, customer contact)
 * and the follow-up file (SM name). Anything missing becomes a highlighted [placeholder] so it can't go out unnoticed.
 * Nothing here leaves the machine: the text goes to the clipboard only when the user clicks Copy.
 */
import type { ISODate } from '@/lib/dates';

export interface EmailTemplate {
  /** the request paragraph; tokens: {customer} {associate} {associateFirst} {store} {score} {themeAsk} */
  request: string;
  /** sign-off lines, one per line (name, title, email) */
  signature: string;
  /** tokens as above plus {jobId} */
  subject: string;
}

export const DEFAULT_TEMPLATE: EmailTemplate = {
  request:
    'Please contact the customer to better understand the concerns and identify any service recovery opportunities. ' +
    'Additionally, please review this feedback with {associateFirst} and {themeAsk}. ' +
    'Please provide feedback on any actions taken, customer outreach completed, or findings from your review.',
  signature: '',
  subject: 'HomeCare+ LTR detractor ({score}) – Store {store} – {customer}',
};

/** The middle ask, by the detractor's root cause. Edit here to change the wording. */
export const THEME_ASK: Record<string, string> = {
  completion: 'determine what prevented the requested services from being completed',
  exclusions: 'confirm how the services outside the HomeCare+ visit were explained to the customer',
  appointment: 'determine what caused the scheduling or arrival issue',
  damage: 'document any damage and confirm Field Support has been notified',
  value: 'confirm what the customer was told the visit would include',
  'service-add': 'note the services the customer asked for that the visit does not include',
  aging: 'review whether the visit met the customer’s accessibility needs',
  associate: 'discuss how the visit went from the customer’s point of view',
};
export const DEFAULT_ASK = 'identify what could have made the visit better for the customer';

export interface EmailFacts {
  surveyId: string;
  score: number;
  /** the customer’s exact words (unredacted original) */
  quote: string;
  surveyDate: ISODate;
  appointmentDate?: ISODate;
  storeNo: string;
  storeCity?: string;
  storeState?: string;
  rootCause?: string | null;
  customerName?: string;
  customerPhone?: string;
  associate?: string;
  jobId?: string;
  smName?: string;
}

/** Per-survey edits made in the composer (saved locally). */
export type EmailEdits = Partial<Pick<EmailFacts, 'customerName' | 'customerPhone' | 'associate' | 'jobId' | 'appointmentDate' | 'smName'>> & {
  /** this email’s request paragraph, when edited */
  request?: string;
  copiedAt?: string;
};

export interface SmEmail {
  subject: string;
  text: string;
  html: string;
  /** labels of fields still showing a placeholder */
  missing: string[];
}

/** “Pat Lee” → Pat; “Lee, Pat” → Pat; demo names drop their DEMO/SM prefix. */
export function firstName(name: string | undefined): string {
  const n = (name ?? '').replace(/^DEMO\s+(SM\s+)?/i, '').trim();
  if (!n) return '';
  if (n.includes(',')) return n.split(',')[1].trim().split(/\s+/)[0] ?? '';
  return n.split(/\s+/)[0];
}

/** 2026-11-03 → 11/03/26, as in the example email */
export function shortDate(d: ISODate): string {
  return `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(2, 4)}`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildSmEmail(f: EmailFacts, tpl: EmailTemplate = DEFAULT_TEMPLATE, request?: string): SmEmail {
  const missing: string[] = [];
  // Each value renders as plain text, or as a yellow-highlighted [label] in HTML when missing.
  type V = { text: string; html: string };
  const val = (v: string | undefined, label: string): V => {
    const t = v?.trim();
    if (t) return { text: t, html: esc(t) };
    if (!missing.includes(label)) missing.push(label);
    return { text: `[${label}]`, html: `<span style="background:#FFFF00">[${esc(label)}]</span>` };
  };
  const sm = val(firstName(f.smName), 'SM first name');
  const customer = val(f.customerName, 'Customer name');
  const phone = val(f.customerPhone, 'Customer phone');
  const associate = val(f.associate, 'Associate');
  const assocFirst = f.associate?.trim() ? val(firstName(f.associate), 'Associate') : associate;
  const job = val(f.jobId, 'Job ID');
  const store = Number(f.storeNo) ? String(Number(f.storeNo)).padStart(4, '0') : f.storeNo;
  const place = [f.storeCity, f.storeState].filter(Boolean).join(', ');
  const storeLine = `Store ${store}${place ? ` – ${place}` : ''}`;
  const when = f.appointmentDate ? `following a HomeCare+ appointment on ${shortDate(f.appointmentDate)}` : `following a HomeCare+ appointment (survey dated ${shortDate(f.surveyDate)})`;
  // The example email bolds the appointment date.
  const whenHtml = f.appointmentDate ? `following a HomeCare+ appointment on <b>${shortDate(f.appointmentDate)}</b>` : esc(when);
  const quote = f.quote.trim();
  const quoteV = quote ? { text: quote, html: esc(quote).replace(/\n/g, '<br>') } : val('', 'Customer comment (the survey has none)');
  const ask = (f.rootCause && THEME_ASK[f.rootCause]) || DEFAULT_ASK;

  const fill = (t: string, html: boolean) => {
    const pick = (v: V) => (html ? v.html : v.text);
    const plain = (s: string) => (html ? esc(s) : s);
    return t.replace(/\{(\w+)\}/g, (m, k: string) => {
      switch (k) {
        case 'customer': return pick(customer);
        case 'associate': return pick(associate);
        case 'associateFirst': return pick(assocFirst);
        case 'store': return plain(store);
        case 'score': return plain(String(f.score));
        case 'themeAsk': return plain(ask);
        case 'jobId': return pick(job);
        default: return html ? esc(m) : m;
      }
    });
  };
  const req = request?.trim() || tpl.request;
  const stop = associate.text.endsWith('.') ? '' : '.';
  const sig = tpl.signature.split('\n').map((x) => x.trim()).filter(Boolean);

  const text = [
    `Hi ${sm.text},`,
    '',
    `We received a ${f.score} LTR detractor from ${customer.text} ${when} with ${associate.text}${stop}`,
    '',
    `"${quoteV.text}"`,
    '',
    'Customer Information',
    `• ${customer.text}`,
    `• ${phone.text}`,
    `• ${storeLine}`,
    `• Associate: ${associate.text}`,
    `• Job ID: ${job.text}`,
    '',
    fill(req, false),
    '',
    'Thank You,',
    ...sig,
  ].join('\n');

  const p = (inner: string) => `<p style="margin:0 0 12px 0">${inner}</p>`;
  const html = [
    '<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt;color:#000">',
    p(`Hi ${sm.html},`),
    p(`We received a <b>${f.score} LTR detractor</b> from <b>${customer.html}</b> ${whenHtml} with <b>${associate.html}</b>${stop}`),
    p(`<i>&quot;${quoteV.html}&quot;</i>`),
    p('<b>Customer Information</b>'),
    `<ul style="margin:0 0 12px 0;padding-left:24px;list-style:disc">${[customer.html, phone.html, esc(storeLine), `Associate: ${associate.html}`, `Job ID: ${job.html}`].map((x) => `<li>${x}</li>`).join('')}</ul>`,
    p(fill(req, true)),
    p(['Thank You,', ...sig.map(esc)].join('<br>')),
    '</div>',
  ].join('\n');

  // Missing fields recorded while filling the subject count too.
  const subject = fill(tpl.subject, false);
  return { subject, text, html, missing };
}

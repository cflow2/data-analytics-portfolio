/** Pre-flight checklist: every failing item blocks export until passed or overridden with a reason. */
import type { WeekFacts } from '@/analytics/facts';
import { redact, DEFAULT_REDACTION_RULES, type RedactionRule } from '@/ingest/redact';
import { verifyNumbers, DOMAIN_CONSTANTS } from '@/writing/verify';
import { allowedForTheme, percentsForTheme, LINE_LIMIT } from '@/writing/write';
import type { WbrDraft } from './draft';
import { slideText } from './draft';

export interface Check { id: string; label: string; pass: boolean; detail: string; overridden?: string }

export function preflight(d: WbrDraft, f: WeekFacts, notes: string, opts: { pendingReview: number; openQuestions: number; daysWithCalls: number; rules?: RedactionRule[] }): Check[] {
  const included = d.themes.filter((t) => t.include);
  const long = included.filter((t) => t.line.length > LINE_LIMIT);
  const free = [...DOMAIN_CONSTANTS, f.benchmark, f.fw, f.fw - 1];
  const bad: string[] = [];
  for (const t of included) {
    for (const h of verifyNumbers(t.line, allowedForTheme(t.id, f), [], percentsForTheme(t.id, f))) if (!h.ok) bad.push(`“${h.text}” in ${t.header.split(':')[0]} line`);
    for (const h of verifyNumbers(t.header, allowedForTheme(t.id, f))) if (!h.ok) bad.push(`“${h.text}” in ${t.header.split(':')[0]} header`);
  }
  for (const [label, text] of [['callout', d.callout], ['subtitle', d.subtitle], ['notes', notes]] as const) {
    for (const h of verifyNumbers(text, f.numbers, free)) if (!h.ok) bad.push(`“${h.text}” in ${label}`);
  }
  // Every LTR % must carry its n.
  const ltrNoN = [d.subtitle, d.callout, ...included.map((t) => t.line), notes].filter((s) => /\bLTR\b[^.;\n]*?\d+(\.\d+)?%(?![^.;\n]*\bn\s*=)/i.test(s));
  const all = `${slideText(d)}\n${notes}`;
  const pii = redact(all, opts.rules ?? DEFAULT_REDACTION_RULES);
  const piiHits = Object.entries(pii.hits).filter(([, n]) => n > 0);
  const checks: Check[] = [
    { id: 'themes', label: 'Between 1 and 6 themes on the slide', pass: included.length >= 1 && included.length <= 6, detail: `${included.length} included` },
    { id: 'length', label: `Every theme line fits one line (≤ ${LINE_LIMIT} characters)`, pass: long.length === 0, detail: long.length ? long.map((t) => `${t.header.split(':')[0]} (${t.line.length})`).join(', ') : 'All fit' },
    { id: 'numbers', label: 'Every number matches the data', pass: bad.length === 0, detail: bad.length ? bad.slice(0, 6).join('; ') : 'All numbers verified' },
    { id: 'ltr-n', label: 'Every LTR % shows n', pass: ltrNoN.length === 0, detail: ltrNoN.length ? `${ltrNoN.length} place(s) without n` : 'OK' },
    { id: 'pii', label: 'No names, phones, emails, addresses or order numbers', pass: piiHits.length === 0 && !pii.uncertain, detail: piiHits.length ? piiHits.map(([k, n]) => `${n} × ${k}`).join(', ') : pii.uncertain ? 'Something that may be a name remains' : 'Clean' },
    { id: 'data', label: 'This week’s surveys and calls are loaded', pass: f.hasSurveys && f.hasCalls, detail: `${f.hasSurveys ? `surveys n=${f.ltr.cur.n}` : 'no surveys'} · ${f.hasCalls ? `${f.calls.calls} calls` : 'no calls'}` },
    { id: 'complete', label: 'Calls cover all 7 days (Sat–Fri)', pass: opts.daysWithCalls === 7, detail: `${opts.daysWithCalls} of 7 days have calls` },
    { id: 'review', label: 'Review Queue cleared for this week', pass: opts.pendingReview === 0, detail: opts.pendingReview ? `${opts.pendingReview} item(s) waiting` : 'Nothing waiting' },
    { id: 'questions', label: 'Last week’s leadership questions are answered in the notes', pass: opts.openQuestions === 0 || notes.includes('Last week I was asked about'), detail: opts.openQuestions ? `${opts.openQuestions} open question(s)` : 'None open' },
  ];
  return checks.map((c) => {
    const o = d.overrides.find((x) => x.check === c.id);
    return !c.pass && o ? { ...c, overridden: o.reason } : c;
  });
}

export const canExport = (checks: Check[]) => checks.every((c) => c.pass || c.overridden);

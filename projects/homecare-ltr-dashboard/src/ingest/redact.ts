/**
 * PII redaction. Runs on import; the UI, exports and the AI layer only ever see the redacted text.
 * Rules are editable in Settings. Order matters: order numbers run before phones.
 */
export interface RedactionRule {
  id: string;
  label: string;
  pattern: string;
  flags: string;
  /** Replacement; may reference capture groups (e.g. "$1[name]"). */
  token: string;
  enabled: boolean;
}

const NAME = "[A-Z][A-Za-z'’-]+(?:[ \\t]+[A-Z][A-Za-z'’-]+){0,2}";
const STREET_SUFFIX = 'St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pl|Place|Cir|Circle|Pkwy|Parkway|Hwy|Highway|Ter|Terrace|Trl|Trail|Loop|Run|Pike';

export const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  { id: 'email', label: 'Email address', pattern: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}', flags: 'g', token: '[email]', enabled: true },
  { id: 'order', label: 'Order number (12+ digits)', pattern: '\\b\\d{12,}\\b', flags: 'g', token: '[order#]', enabled: true },
  { id: 'phone', label: 'US phone number', pattern: '(?:\\+?1[ .-]?)?(?:\\(\\d{3}\\)[ ]?|\\b\\d{3}[ .-]?)\\d{3}[ .-]?\\d{4}\\b', flags: 'g', token: '[phone]', enabled: true },
  {
    id: 'address', label: 'Street address',
    pattern: `\\b\\d{1,6}[ \\t]+(?:[NSEW]\\.?[ \\t]+)?(?:[A-Z0-9][A-Za-z0-9'’.-]*[ \\t]+){1,4}(?:${STREET_SUFFIX})\\b\\.?(?:,?[ \\t]*(?:Apt|Unit|Suite|Ste|#)\\.?[ \\t]*[A-Za-z0-9-]+)?`,
    flags: 'g', token: '[address]', enabled: true,
  },
  {
    id: 'name-cue', label: 'Name after CX / Caller / Spoke with / Name / Mr / Mrs / Ms',
    pattern: `(\\b(?:CX|Cx|cx|[Cc]aller|[Ss]poke [Ww]ith|[Nn]ame|[Cc]ustomer [Nn]ame|[Mm]ember [Nn]ame|M(?:rs?|s|iss)\\.?)[ \\t]*[:\\-]?[ \\t]*)(${NAME})`,
    flags: 'g', token: '$1[name]', enabled: true,
  },
  {
    id: 'staff-cue', label: 'Name after Store Manager / SM / technician / associate',
    pattern: `(\\b(?:Store Manager|Asst\\.? Store Manager|Assistant Store Manager|Department Manager|[Mm]anager|ASM|SM|RSM|DM|[Tt]echnician|[Tt]ech|RedVest Associate|[Aa]ssociate)[ \\t]*,?[ \\t]+)(?!Needs\\b|Assistance\\b)(${NAME})`,
    flags: 'g', token: '$1[name]', enabled: true,
  },
  {
    id: 'name-verb', label: 'First Last followed by an action (e.g. “Pat Example reviewed”)',
    pattern: `\\b(?!(?:Store|Field|Customer|Member|Lowe|Lowe’s|Lowe's|HomeCare|The|This|Our|Regional|District|Region|Team|Leadership|Service|Support)\\b)([A-Z][a-z'’-]+(?:[ \\t]+[A-Z][a-z'’-]+){1,2})(?=[ \\t]+(?:also[ \\t]+|then[ \\t]+|personally[ \\t]+)?(?:reviewed|contacted|called|spoke|explained|apologized|apologised|confirmed|stated|met|visited|reached|left|followed|sent|emailed|discussed|believes|determined|attempted|coached|shared|noted|said)\\b)`,
    flags: 'g', token: '[name]', enabled: true,
  },
];

/** Escape a literal for use in a RegExp. */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A per-file rule that redacts names the file itself tells us about (e.g. the SM column):
 * full names and surnames of 4+ letters, capitalised, as whole words.
 */
export function knownNamesRule(names: string[]): RedactionRule | null {
  const parts = new Set<string>();
  for (const raw of names) {
    const n = raw.replace(/\s+/g, ' ').trim();
    if (!/^[A-Z][A-Za-z'’-]+(?: [A-Z][A-Za-z'’-]+)+$/.test(n)) continue;
    parts.add(n);
    const last = n.split(' ').pop()!;
    if (last.length >= 4) parts.add(last);
  }
  if (!parts.size) return null;
  const alt = [...parts].sort((a, b) => b.length - a.length).map(esc).join('|');
  return { id: 'known-names', label: 'Names listed in this file (SM column)', pattern: `\\b(?:${alt})\\b`, flags: 'g', token: '[name]', enabled: true };
}

export interface RedactionResult {
  text: string;
  hits: Record<string, number>;
  /** Something that looks like residual PII remains: send to the Review Queue. */
  uncertain: boolean;
}

const compiled = new Map<string, RegExp>();
function re(rule: RedactionRule): RegExp {
  const key = `${rule.pattern}/${rule.flags}`;
  let r = compiled.get(key);
  if (!r) { r = new RegExp(rule.pattern, rule.flags.includes('g') ? rule.flags : rule.flags + 'g'); compiled.set(key, r); }
  r.lastIndex = 0;
  return r;
}

/** Heuristics for leftovers: a name cue followed by a lowercase word, long digit runs, an @. */
const NOT_A_NAME = 'member|customer|cx|caller|client|homeowner|the|a|an|him|her|them|sm|store|manager|associate|team|agent|rep|tech|back|again|about|to|and|said|says|states|stated|is|was|wants|asked|reports|requested|needs|would|called|calling|on|regarding|re|n\\/a|none|unknown';
const UNCERTAIN = [
  new RegExp(`\\b(?:cx|caller|spoke with|name)[ \\t]*:?[ \\t]+(?!\\[|(?:${NOT_A_NAME})\\b)[a-z]{2,}\\b`, 'i'),
  /\d{7,}/,
  /@\w/,
];

export function redact(input: string, rules: RedactionRule[] = DEFAULT_REDACTION_RULES): RedactionResult {
  let text = input ?? '';
  const hits: Record<string, number> = {};
  for (const rule of rules) {
    if (!rule.enabled) continue;
    let regex: RegExp;
    try { regex = re(rule); } catch { continue; }
    text = text.replace(regex, (...args) => {
      hits[rule.id] = (hits[rule.id] ?? 0) + 1;
      const groups = args.slice(1, -2) as (string | undefined)[];
      return rule.token.replace(/\$(\d)/g, (_, i) => groups[+i - 1] ?? '');
    });
  }
  const uncertain = UNCERTAIN.some((u) => u.test(text));
  return { text, hits, uncertain };
}

export function validateRule(rule: Pick<RedactionRule, 'pattern' | 'flags'>): string | null {
  try { new RegExp(rule.pattern, rule.flags); return null; } catch (e) { return (e as Error).message; }
}

/** Digits of every phone number in the raw text (last 10), for hashing repeat callers. */
export function extractPhones(raw: string): string[] {
  const r = new RegExp(DEFAULT_REDACTION_RULES[2].pattern, 'g');
  return [...raw.replace(/\b\d{12,}\b/g, '').matchAll(r)].map((m) => m[0].replace(/\D/g, '').slice(-10));
}

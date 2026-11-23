import { describe, expect, it } from 'vitest';
import { redact, extractPhones, validateRule, knownNamesRule, DEFAULT_REDACTION_RULES } from './redact';

const r = (s: string) => redact(s).text;

describe('redaction', () => {
  it('names after CX, Caller, Spoke with:, Name:', () => {
    expect(r('CX Jane Doe called about her visit')).toBe('CX [name] called about her visit');
    expect(r('Caller Mike wants to cancel')).toBe('Caller [name] wants to cancel');
    expect(r('Spoke with: Maria Lopez-Garcia')).toBe('Spoke with: [name]');
    expect(r('Name: Bob Smith\nCompleted Actions: x')).toBe('Name: [name]\nCompleted Actions: x');
    expect(r('cx: Ann')).toBe('cx: [name]');
    expect(r('Mrs. Patterson said thanks')).toBe('Mrs. [name] said thanks');
  });

  it('US phone formats', () => {
    expect(r('call (704) 555-1234 today')).toBe('call [phone] today');
    expect(r('call 704-555-1234')).toBe('call [phone]');
    expect(r('call 7045551234.')).toBe('call [phone].');
    expect(r('call 704.555.1234 or +1 704 555 1234')).toBe('call [phone] or [phone]');
  });

  it('emails, order numbers, street addresses', () => {
    expect(r('email jane.doe+hc@example.com please')).toBe('email [email] please');
    expect(r('order 200012345678 refund')).toBe('order [order#] refund');
    expect(r('order 2000123456789012')).toBe('order [order#]');
    expect(r('lives at 123 Main St, Apt 4B in town')).toBe('lives at [address] in town');
    expect(r('1450 N Oak Ridge Drive')).toBe('[address]');
  });

  it('leaves non-PII alone', () => {
    const s = 'Store #1234 on 11/6/2026: 12 ft ceiling, 2nd story vent, 10 years old, $99, within 30 days.';
    expect(r(s)).toBe(s);
    expect(r('Problem / Reason for Calling: Member wants to cancel.')).toBe('Problem / Reason for Calling: Member wants to cancel.');
  });

  it('counts hits and flags uncertain leftovers', () => {
    const res = redact('CX Jane Doe (704) 555-1234 jane@x.com');
    expect(res.hits).toEqual({ email: 1, phone: 1, 'name-cue': 1 });
    expect(res.uncertain).toBe(false);
    expect(redact('spoke with jane doe about it').uncertain).toBe(true);
    expect(redact('ref 98765432 pending').uncertain).toBe(true);
    expect(redact('Spoke with member 11/06. Explained exclusions.').uncertain).toBe(false);
    expect(redact('caller states the vent is on the roof').uncertain).toBe(false);
    expect(redact('Spoke with: bob jones').uncertain).toBe(true);
  });

  it('extracts phones for hashing and validates rules', () => {
    expect(extractPhones('(704) 555-1234 and 1-980-555-0000')).toEqual(['7045551234', '9805550000']);
    expect(validateRule({ pattern: '(', flags: 'g' })).not.toBeNull();
  });

  it('staff names in SM insights (made-up names)', () => {
    expect(r('Store Manager Pat Example reviewed the detractor with technician Sam Sample.')).toBe('Store Manager [name] reviewed the detractor with technician [name].');
    expect(r('reviewed the visit with the associate, Alex Demo, and determined')).toBe('reviewed the visit with the associate, [name], and determined');
    expect(r('Jordan Placeholder reviewed the concerns. Casey Testcase also contacted the customer.')).toBe('[name] reviewed the concerns. [name] also contacted the customer.');
    expect(r('Store leadership contacted the customer.')).toBe('Store leadership contacted the customer.');
    expect(r('Field Support reviewed the case.')).toBe('Field Support reviewed the case.');
    expect(r('The RedVest Associate was friendly.')).toBe('The RedVest Associate was friendly.');
    expect(r("Lowe's Associate Needs Assistance")).toBe("Lowe's Associate Needs Assistance");
  });
  it('names listed in the file are redacted wherever they appear', () => {
    const rule = knownNamesRule(['Pat Example', 'Sam Sample', '', 'DEMO SM Avery'])!;
    const rules = [...DEFAULT_REDACTION_RULES, rule];
    expect(redact('Per Example, the member was happy. Sam Sample will follow up.', rules).text).toBe('Per [name], the member was happy. [name] will follow up.');
  });
});

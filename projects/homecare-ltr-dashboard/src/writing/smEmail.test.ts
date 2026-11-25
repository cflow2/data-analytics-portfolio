import { describe, expect, it } from 'vitest';
import { buildSmEmail, DEFAULT_TEMPLATE, firstName, shortDate, type EmailFacts } from './smEmail';
import { formatPhone } from '@/ingest/normalize';

const facts: EmailFacts = {
  surveyId: 'S1', score: 3, quote: 'He said the "dryer vent" was not covered & left.', surveyDate: '2026-11-05', appointmentDate: '2026-11-03',
  storeNo: '0123', storeCity: 'Sampletown', storeState: 'NC', rootCause: 'completion',
  customerName: 'DEMO Avery Sample', customerPhone: '(555) 555-0101', associate: 'DEMO Rowan AB.', jobId: 'SA000000000001', smName: 'Lee, Pat',
};

describe('store manager email', () => {
  it('follows the example structure', () => {
    const e = buildSmEmail({ ...facts }, { ...DEFAULT_TEMPLATE, signature: 'DEMO Analyst\nSr Analyst\nme@example.com' });
    expect(e.missing).toEqual([]);
    expect(e.text.split('\n')).toEqual([
      'Hi Pat,',
      '',
      'We received a 3 LTR detractor from DEMO Avery Sample following a HomeCare+ appointment on 11/03/26 with DEMO Rowan AB.',
      '',
      '"He said the "dryer vent" was not covered & left."',
      '',
      'Customer Information',
      '• DEMO Avery Sample',
      '• (555) 555-0101',
      '• Store 0123 – Sampletown, NC',
      '• Associate: DEMO Rowan AB.',
      '• Job ID: SA000000000001',
      '',
      'Please contact the customer to better understand the concerns and identify any service recovery opportunities. Additionally, please review this feedback with Rowan and determine what prevented the requested services from being completed. Please provide feedback on any actions taken, customer outreach completed, or findings from your review.',
      '',
      'Thank You,',
      'DEMO Analyst',
      'Sr Analyst',
      'me@example.com',
    ]);
    expect(e.subject).toBe('HomeCare+ LTR detractor (3) – Store 0123 – DEMO Avery Sample');
    expect(e.html).toContain('<b>3 LTR detractor</b>');
    expect(e.html).toContain('<i>&quot;He said the &quot;dryer vent&quot; was not covered &amp; left.&quot;</i>');
    expect(e.html).toContain('<li>Job ID: SA000000000001</li>');
  });

  it('highlights missing fields and falls back to the survey date', () => {
    const e = buildSmEmail({ ...facts, customerName: undefined, customerPhone: '', jobId: undefined, appointmentDate: undefined, smName: undefined, rootCause: null });
    expect(e.missing).toEqual(['SM first name', 'Customer name', 'Customer phone', 'Job ID']);
    expect(e.text).toContain('Hi [SM first name],');
    expect(e.text).toContain('(survey dated 11/05/26)');
    expect(e.text).toContain('identify what could have made the visit better');
    expect(e.html).toContain('<span style="background:#FFFF00">[Customer phone]</span>');
  });

  it('escapes HTML in every value', () => {
    const e = buildSmEmail({ ...facts, customerName: '<script>x</script>' });
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('&lt;script&gt;');
  });

  it('uses an edited request paragraph', () => {
    const e = buildSmEmail(facts, DEFAULT_TEMPLATE, 'Call {customer} today about store {store}.');
    expect(e.text).toContain('Call DEMO Avery Sample today about store 0123.');
  });

  it('reads first names and formats dates and phones', () => {
    expect(firstName('Pat Lee')).toBe('Pat');
    expect(firstName('Lee, Pat J')).toBe('Pat');
    expect(firstName('DEMO SM Avery')).toBe('Avery');
    expect(firstName(undefined)).toBe('');
    expect(shortDate('2026-01-31')).toBe('01/31/26');
    expect(formatPhone('5555550142')).toBe('(555) 555-0142');
    expect(formatPhone('+1 555.555.0142')).toBe('(555) 555-0142');
    expect(formatPhone('ext 12')).toBe('ext 12');
  });
});

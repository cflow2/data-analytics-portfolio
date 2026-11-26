import { describe, expect, it } from 'vitest';
import { demoDataset } from '@/test/demoDataset';
import { countsForLtr } from '@/domain/survey';
import { PULSE_MAX_WORDS, detractorSummary, plainText, pulseDoc, pulseFacts, pulseHtml, pulsePeriod, pulseScript, shortQuote, trendOf, wordCount } from './pulse';
import { verifyNumbers } from './verify';
import { ltrSummary } from '@/lib/ltr';

const ds = demoDataset();
const ok = (text: string, numbers: number[]) => verifyNumbers(plainText(text), numbers, [0, 6, 7, 8, 9, 10]).filter((h) => !h.ok);

describe('daily pulse', () => {
  it('Monday covers the weekend; other days cover yesterday', () => {
    expect(pulsePeriod('2026-11-02')).toMatchObject({ from: '2026-10-31', to: '2026-11-01' });
    expect(pulsePeriod('2026-11-04')).toMatchObject({ from: '2026-11-03', to: '2026-11-03' });
  });

  it('follows the structure: opening, customer experience, subscriptions, things to watch', () => {
    const f = pulseFacts(ds, '2026-11-04');
    const day = ds.surveys.filter((s) => s.date === '2026-11-03' && countsForLtr(s) && s.ltr !== null);
    expect(f.surveys.length).toBe(day.length);
    expect(f.detractors.length).toBe(day.filter((s) => s.ltr! <= 8).length);
    const doc = pulseDoc(f);
    const t = doc.text;
    expect(t.startsWith('Good morning! Here’s your HomeCare+ Pulse for Wednesday, November 4 (FW40, day 5 of the fiscal week).')).toBe(true);
    const order = ['**Customer experience**', '**Subscriptions**', '**Things to watch today**'].map((h) => t.indexOf(h));
    expect(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1]))).toBe(true);
    expect(t).toMatch(new RegExp(`Yesterday we finished with \\*\\*${day.length} surveys\\*\\*: \\*\\*\\d+ promoters\\*\\* \\(9–10\\) and \\*\\*\\d+ detractors?\\*\\* \\(0–8\\)\\.`));
    expect(t).toMatch(/Yesterday’s LTR was \*\*\d+\.\d%\*\*, \*\*(up|down) \d+\.\d points\*\*|unchanged/);
    expect(t).toMatch(/So far in FW40 we’re at \*\*\d+\.\d%\*\* on \d+ surveys, \*\*(up|down) \d+\.\d points\*\* from the same 4 days of FW39/);
    expect(t).toMatch(/\*\*(above|below) the 93 benchmark\*\*/);
    expect(t).toMatch(/net new subscriptions/);
    expect(t).toMatch(/on track to (exceed|meet|fall short of)\*\* FW39/);
    expect(t).toMatch(/• \*\*LTR:\*\*/);
    expect(doc.words).toBeLessThanOrEqual(PULSE_MAX_WORDS);
    expect(ok(t, doc.numbers)).toEqual([]);
    // privacy: no customer names, phone numbers or redaction tokens; store numbers without thousands separators
    expect(t).not.toMatch(/\[name\]|Jane|@|555|Sample|store \d,\d{3}/);
    expect(t).not.toMatch(/\ba 8\b|\ba 11\b/);
  });

  it('describes each detractor with store number and name, root cause and a short summary', () => {
    const f = pulseFacts(ds, '2026-11-04');
    const t = pulseScript(f);
    const line = t.split('\n').find((l) => l.startsWith('Detractors yesterday:'))!;
    expect(line).toBeTruthy();
    for (const d of f.detractors.slice(0, 3)) {
      const st = ds.stores.get(d.s.storeNo)!;
      expect(line).toContain(`at store ${d.s.storeNo} (${st.city}, ${st.state})`);
      if (d.cause) expect(line).toContain(`**${d.cause.toLowerCase()}**`);
      if (d.summary) expect(line).toContain(`“${d.summary}”`);
    }
    // every store mentioned anywhere carries its name
    for (const m of t.matchAll(/store (\d{4})(?! \()/g)) throw new Error(`store ${m[1]} without a name`);
  });

  it('detractor summaries read cleanly', () => {
    expect(detractorSummary('Nobody came. [name] said they would call me back and never did, so I cancelled the whole plan today.')).toBe('Nobody came.');
    expect(detractorSummary('Tech said the [name] tankless heater is not covered')).toBe('Tech said the tankless heater is not covered');
    expect(detractorSummary('  ')).toBeNull();
    expect(detractorSummary('N/A')).toBeNull();
  });

  it('stays within two minutes on every day of a month', () => {
    for (let d = 1; d <= 30; d++) {
      const date = `2026-11-${String(d).padStart(2, '0')}`;
      const doc = pulseDoc(pulseFacts(ds, date));
      expect(doc.words, date).toBeLessThanOrEqual(PULSE_MAX_WORDS);
      expect(ok(doc.text, doc.numbers), date).toEqual([]);
    }
  });

  it('Friday adds the week recap (Saturday through Thursday) and what today needs', () => {
    const f = pulseFacts(ds, '2026-11-06');
    expect(f.isFriday).toBe(true);
    const t = pulseScript(f);
    expect(t).toMatch(/\*\*Week recap, FW40\*\*/);
    expect(t).toMatch(/Saturday through Thursday, FW40 is at \*\*\d+\.\d%\*\* on \d+ surveys/);
    expect(t).toMatch(/today can take \*\*\d+ more\*\*|more\*\* than a typical week can take/);
    expect(t).toMatch(/we need \*\*[\d,]+ today\*\* to beat FW39|already/);
    expect(t).not.toMatch(/So far in FW40/); // the recap replaces the daily week-to-date line
    expect(pulseScript(pulseFacts(ds, '2026-11-05'))).not.toMatch(/Week recap/);
  });

  it('Monday: weekend, the week so far without repeating it, and subscriptions from the demo exports', () => {
    const f = pulseFacts(ds, '2026-11-09');
    expect(f.subs!.fw).toBe(41);
    expect(f.subs!.days).toBe(2);
    expect(f.subs!.period!.subs).toBe(f.subs!.wtd.subs);
    expect(f.subs!.fyTotal).toBeGreaterThan(f.subs!.wtd.subs);
    const t = pulseScript(f);
    expect(t).toMatch(/Over the weekend we finished with/);
    expect(t).toMatch(/That’s all of FW41 so far/);
    expect(t).toMatch(/Over the weekend we finished with \*\*-?\d+ net new subscriptions\*\* \(\d+ in store\), bringing FW41 to \*\*-?\d+\*\* and the fiscal year to \*\*[\d,]+\*\*/);
    expect(t).not.toMatch(/Week-to-date leaders/);
  });

  it('recognizes associates only from the data and says when the schedule is missing', () => {
    const f = pulseFacts(ds, '2026-11-04');
    for (const a of f.associateStars) {
      const theirs = ds.surveys.filter((s) => s.associate === a.name && s.fw === 40 && s.date <= '2026-11-03' && countsForLtr(s) && s.ltr !== null);
      expect(theirs.every((s) => s.ltr! >= 9)).toBe(true);
      expect(theirs.length).toBe(a.surveys);
    }
    expect(f.appointmentsToday!.n).toBe([...ds.appointments.values()].filter((a) => a.date === '2026-11-04').length);
    expect(pulseScript(f)).toMatch(/Today’s appointments:\*\* \d+ appointments scheduled, most in R\d+ \(\d+\)/);
    // past the end of the appointment file → no schedule loaded, and the script says so (when it fits)
    expect(pulseFacts(ds, '2026-11-30').appointmentsToday).toBeNull();
  });

  it('helpers: quotes, trend, word count, html', () => {
    expect(shortQuote('Great visit. He replaced the filter and checked the water heater and explained everything clearly to us both. Would recommend!', 12)).toBe('Great visit.');
    const w = (p: number) => ({ s: { ...ltrSummary([]), n: 50, pct: p } });
    expect(trendOf([w(90), w(91), w(92), w(93)])).toBe('upward');
    expect(trendOf([w(94), w(93.8), w(94.1), w(93.9)])).toBe('stable');
    expect(trendOf([w(95), w(94), w(93), w(92)])).toBe('downward');
    expect(trendOf([w(95)])).toBeNull();
    expect(wordCount('**Bold** words • here')).toBe(3);
    const h = pulseHtml('Hi **there** <b>\n• **LTR:** fine');
    expect(h).toContain('Hi <b>there</b> &lt;b&gt;');
    expect(h).toContain('<li style="margin:0 0 4px 0"><b>LTR:</b> fine</li>');
  });

  it('no data → says so', () => {
    expect(pulseScript(pulseFacts(ds, '2026-01-15'))).toMatch(/no surveys or subscriptions loaded/);
  });
});

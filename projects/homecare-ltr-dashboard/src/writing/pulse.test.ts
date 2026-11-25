import { describe, expect, it } from 'vitest';
import { demoDataset } from '@/test/demoDataset';
import { countsForLtr } from '@/domain/survey';
import { pulseFacts, pulsePeriod, pulseScript } from './pulse';
import { verifyNumbers } from './verify';

const ds = demoDataset();

describe('daily pulse (surveys)', () => {
  it('Monday covers the weekend; other days cover yesterday', () => {
    expect(pulsePeriod('2026-11-02')).toMatchObject({ from: '2026-10-31', to: '2026-11-01' });
    expect(pulsePeriod('2026-11-04')).toMatchObject({ from: '2026-11-03', to: '2026-11-03' });
  });
  it('builds facts and a ~60-second script whose numbers all verify', () => {
    const f = pulseFacts(ds, '2026-11-04');
    const day = ds.surveys.filter((s) => s.date === '2026-11-03' && countsForLtr(s) && s.ltr !== null);
    expect(f.surveys.length).toBe(day.length);
    expect(f.detractors.length).toBe(day.filter((s) => s.ltr! <= 8).length);
    expect(f.wtd.fw).toBe(40);
    const script = pulseScript(f);
    expect(script.startsWith('Good morning. Here’s the HomeCare+ pulse for yesterday (Tue Nov 3).')).toBe(true);
    expect(script).toMatch(new RegExp(`^.*${day.length} surveys came in`));
    expect(script).toMatch(/FW40 so far: \d+\.\d% on \d+ surveys/);
    expect(script).toMatch(/One thing to watch: /);
    const words = script.split(/\s+/).length;
    expect(words).toBeGreaterThan(30);
    expect(words).toBeLessThan(190);
    expect(verifyNumbers(script, f.numbers, [0, 6, 7, 8, 9, 10]).filter((h) => !h.ok)).toEqual([]);
    expect(script).not.toMatch(/\[name\]|Jane|@|555/);
    expect(script).not.toMatch(/\ba 8\b/);
  });
  it('watch item prefers damage, then a 0–6 needing follow-up', () => {
    const f = pulseFacts(ds, '2026-11-04');
    if (f.damage.length) expect(f.watch).toMatch(/damage or safety/);
    else if (f.detractors.some((d) => d.s.ltr! <= 6)) expect(f.watch).toMatch(/48 hours/);
  });
  it('no data → says so', () => {
    expect(pulseScript(pulseFacts(ds, '2026-01-15'))).toMatch(/No surveys or subscriptions are loaded/);
  });
  it('adds subscriptions from the demo exports (Monday covers the weekend that started FW41)', () => {
    const f = pulseFacts(ds, '2026-11-09');
    expect(f.subs).not.toBeNull();
    expect(f.subs!.fw).toBe(41);
    expect(f.subs!.days).toBe(2);
    expect(f.subs!.period!.subs).toBe(f.subs!.wtd.subs);
    expect(f.subs!.samePointLastWeek!.through).toBe('2026-11-01');
    const script = pulseScript(f);
    expect(script).toMatch(/Subscriptions: we added -?\d+ net over the weekend, \d+ in store\. FW41 to date: -?\d+ \(\d+ in store\) after 2 days, (up|down) \d+/);
    expect(verifyNumbers(script, f.numbers, [0, 6, 7, 8, 9, 10]).filter((h) => !h.ok)).toEqual([]);
    const tue = pulseScript(pulseFacts(ds, '2026-11-04'));
    expect(tue).toMatch(/we added -?\d+ net yesterday/);
  });
});

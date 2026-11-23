import { describe, expect, it } from 'vitest';
import { demoDataset } from '@/test/demoDataset';
import { pulseFacts, pulsePeriod, pulseScript } from './pulse';
import { verifyNumbers } from './verify';

const ds = demoDataset();

describe('daily pulse', () => {
  it('Monday covers the weekend; other days cover yesterday', () => {
    expect(pulsePeriod('2026-11-02')).toMatchObject({ from: '2026-10-31', to: '2026-11-01' });
    expect(pulsePeriod('2026-11-04')).toMatchObject({ from: '2026-11-03', to: '2026-11-03' });
  });
  it('builds facts and a ~60-second script whose numbers all verify', () => {
    const f = pulseFacts(ds, '2026-11-04');
    const dayCalls = ds.calls.filter((c) => c.date === '2026-11-03' && !c.isAssociate).length;
    expect(f.calls.length).toBe(dayCalls);
    const script = pulseScript(f);
    expect(script.startsWith('Good morning. Here’s the HomeCare+ pulse for yesterday (Tue Nov 3).')).toBe(true);
    expect(script).toMatch(new RegExp(`We took ${dayCalls} customer calls`));
    expect(script).toMatch(/One thing to watch: /);
    const words = script.split(/\s+/).length;
    expect(words).toBeGreaterThan(40);
    expect(words).toBeLessThan(190);
    expect(verifyNumbers(script, f.numbers, [0, 6, 7, 8]).filter((h) => !h.ok)).toEqual([]);
    expect(script).not.toMatch(/\[name\]|Jane|@/);
    expect(script).not.toMatch(/\ba 8\b/);
  });
  it('watch item prefers unescalated damage', () => {
    const f = pulseFacts(ds, '2026-11-04');
    if (f.damage.length) expect(f.watch).toMatch(/damage call/);
  });
  it('no data → says so', () => {
    expect(pulseScript(pulseFacts(ds, '2026-03-02'))).toMatch(/No calls or surveys are loaded|No customer calls/);
  });
});

import { describe, expect, it } from 'vitest';
import { ruleHeadline } from './headline';
import { ltrSummary } from '@/lib/ltr';

describe('rule headline', () => {
  it('states LTR with n, position vs benchmark and the friction', () => {
    const cur = ltrSummary([...Array(124).fill(10), ...Array(7).fill(8)]);
    const h = ruleHeadline({ fw: 40, cur, benchmark: 93, inHome: '95–96%', detractors0to6: 2,
      lowest: { key: 'scheduling', label: 'Ease of scheduling', group: 'Pre-visit', relatedTheme: 'appointment', pct: 87.4, n: 119, source: 'surveys' },
      topCallTheme: { name: 'Appointment management', calls: 76 } });
    expect(h).toBe('FW40 LTR 94.7% (n=131), above the 93% benchmark; in-home attributes at 95–96%. The friction: Ease of scheduling is the lowest attribute (87.4%) and Appointment management leads calls (76).');
  });
});

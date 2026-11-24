import { describe, expect, it } from 'vitest';
import { demoDataset } from '@/test/demoDataset';
import { weekFacts } from '@/analytics/facts';
import { DEFAULT_THRESHOLDS } from '@/lib/ltr';
import { DEFAULT_TAXONOMY } from '@/domain/taxonomy';
import { whatChangedSummary } from './write';
import { verifyNumbers, DOMAIN_CONSTANTS } from './verify';

const ds = demoDataset();
const f = weekFacts(ds, 40, 93, DEFAULT_THRESHOLDS);
const verified = (text: string) => verifyNumbers(text, f.numbers, [...DOMAIN_CONSTANTS, 93, 40, 39]).filter((h) => !h.ok).map((h) => h.text);

describe('rule-based writing (demo FW40)', () => {
  it('what-changed summary states LTR with n and every number verifies', () => {
    const s = whatChangedSummary(f, DEFAULT_TAXONOMY);
    expect(s).toMatch(/^LTR rose 0\.8 pts to 94\.7% \(n=131\) from 93\.9% \(n=131\)\./);
    expect(s).not.toMatch(/\bcalls?\b/);
    expect(verified(s)).toEqual([]);
  });
  it('week facts are survey-only', () => {
    expect(f.hasSurveys).toBe(true);
    expect(f.mentions.find((m) => m.theme === 'associate')!.surveys).toBe(72);
    expect(f.detractors).toHaveLength(7);
  });
});

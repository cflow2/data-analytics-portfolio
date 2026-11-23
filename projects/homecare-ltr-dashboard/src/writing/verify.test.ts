import { describe, expect, it } from 'vitest';
import { extractNumbers, verifyNumbers } from './verify';

describe('number verification', () => {
  it('extracts numbers but skips FW/region/store labels', () => {
    expect(extractNumbers('FW40 LTR 94.7% (n=131) in R5 at store #1234, 3,736 surveys').map((h) => h.value)).toEqual([94.7, 131, 3736]);
  });
  it('accepts values that round to the shown precision and flags the rest', () => {
    const hits = verifyNumbers('LTR 94.7% on 131 surveys, 8 detractors', [94.6564, 131, 7]);
    expect(hits.map((h) => [h.value, h.ok])).toEqual([[94.7, true], [131, true], [8, false]]);
  });
  it('always-ok constants', () => {
    expect(verifyNumbers('scored 0–6', [], [0, 6]).every((h) => h.ok)).toBe(true);
  });
});

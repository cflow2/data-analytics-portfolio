import { describe, expect, it } from 'vitest';
import { normalizeRegion, normalizeStoreNo, storeLabel, districtOf } from './geo';

describe('geo', () => {
  it('normalizes regions', () => {
    expect(normalizeRegion('Region 5')).toBe('R5');
    expect(normalizeRegion('R05')).toBe('R5');
    expect(normalizeRegion(27)).toBe('R27');
    expect(normalizeRegion('r12')).toBe('R12');
  });
  it('normalizes store numbers', () => {
    expect(normalizeStoreNo(123)).toBe('0123');
    expect(normalizeStoreNo('#2456')).toBe('2456');
    expect(normalizeStoreNo('2456.0')).toBe('2456');
  });
  it('labels stores and districts', () => {
    const m = new Map([['0123', { storeNo: '0123', name: 'x', city: 'Maple Ridge', state: 'NC', district: 'D2', region: 'R1' }]]);
    expect(storeLabel('0123', m)).toBe('0123 – Maple Ridge, NC');
    expect(storeLabel('9999', m)).toBe('9999');
    expect(districtOf('9999', m)).toBe('Unmapped');
  });
});

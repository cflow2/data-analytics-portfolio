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

describe('store numbers in Medallia "Store" values', () => {
  it('reads the leading number', () => {
    expect(normalizeStoreNo("2702 - LOWE'S OF HAINES CITY, FL")).toBe('2702');
    expect(normalizeStoreNo("569 - LOWE'S OF LAKE COUNTY, FL")).toBe('0569');
  });
});

describe('store directory from every file', () => {
  it('keeps the stores table, fills unnamed stores from the subscription export, adds number-only stores', async () => {
    const { buildStoreDirectory, storeCity, storeLabel } = await import('./geo');
    const dir = buildStoreDirectory(
      [{ storeNo: '0101', name: "LOWE'S OF ALPHA, NC", city: 'Alpha', state: 'NC', district: 'R5-D1', region: 'R5' },
        { storeNo: '0202', name: '', city: '', state: '', district: 'R5-D2', region: 'R5' }],
      [{ storeNo: '0101', storeName: "LOWE'S OF WRONG, TX" }, { storeNo: '0202', storeName: "LOWE'S OF HAINES CITY, FL", region: 'R5' }, { storeNo: '0303', storeName: "LOWE'S OF N. BETA, GA", region: 'R12' }],
      [{ storeNo: '0404', region: 'R1' }, { storeNo: '' }],
    );
    expect(storeCity('0101', dir)).toBe('Alpha, NC'); // the stores table wins
    expect(dir.get('0202')).toMatchObject({ city: 'Haines City', state: 'FL', district: 'R5-D2' });
    expect(storeLabel('0303', dir)).toBe('0303 – N. Beta, GA');
    expect(dir.get('0404')).toMatchObject({ city: '', region: 'R1' });
    expect(storeCity('0404', dir)).toBe('');
    expect(dir.has('')).toBe(false);
  });
});

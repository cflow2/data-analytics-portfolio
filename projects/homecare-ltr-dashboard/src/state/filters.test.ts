import { describe, expect, it } from 'vitest';
import { parseFilters, serializeFilters } from './filters';

describe('URL filter state', () => {
  it('round-trips', () => {
    const p = serializeFilters({ fw: 40, compare: 'avg4', region: 'R5' });
    expect(p.toString()).toBe('fw=40&cmp=avg4&region=R5');
    expect(parseFilters(p)).toEqual({ fw: 40, compare: 'avg4', division: null, region: 'R5', district: null, store: null, associate: null });
    expect(parseFilters(serializeFilters({ division: 'WEST', associate: 'Pat Q' }))).toMatchObject({ division: 'WEST', associate: 'Pat Q' });
    expect(parseFilters(new URLSearchParams('div=EAST')).division).toBeNull();
  });
  it('drops defaults and rejects junk', () => {
    expect(serializeFilters({ compare: 'prior' }).toString()).toBe('');
    expect(parseFilters(new URLSearchParams('fw=abc&cmp=x'))).toMatchObject({ fw: null, compare: 'prior' });
  });
});

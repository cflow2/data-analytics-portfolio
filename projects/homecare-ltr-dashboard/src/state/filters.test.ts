import { describe, expect, it } from 'vitest';
import { parseFilters, serializeFilters } from './filters';

describe('URL filter state', () => {
  it('round-trips', () => {
    const p = serializeFilters({ fw: 40, compare: 'avg4', region: 'R5', channel: 'calls' });
    expect(p.toString()).toBe('fw=40&cmp=avg4&region=R5&ch=calls');
    expect(parseFilters(p)).toEqual({ fw: 40, compare: 'avg4', region: 'R5', district: null, store: null, channel: 'calls' });
  });
  it('drops defaults and rejects junk', () => {
    expect(serializeFilters({ compare: 'prior', channel: 'both' }).toString()).toBe('');
    expect(parseFilters(new URLSearchParams('fw=abc&cmp=x&ch=y'))).toMatchObject({ fw: null, compare: 'prior', channel: 'both' });
  });
});

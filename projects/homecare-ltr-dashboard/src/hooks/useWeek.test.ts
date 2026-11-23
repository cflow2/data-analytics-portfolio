import { describe, expect, it } from 'vitest';
import { pickDefaultWeek } from './useWeek';

describe('default reporting week', () => {
  it('prefers the saved reporting week', () => expect(pickDefaultWeek([39, 40, 41], 40, 42)).toBe(40));
  it('else latest week with data that has completed', () => expect(pickDefaultWeek([39, 40, 41], undefined, 40)).toBe(40));
  it('else the last completed week', () => expect(pickDefaultWeek([], undefined, 42)).toBe(42));
});

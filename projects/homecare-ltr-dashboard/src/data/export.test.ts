import { describe, expect, it } from 'vitest';
import { toCsv, toTsv } from './export';

describe('exports', () => {
  it('csv escapes quotes, commas and newlines', () => {
    expect(toCsv({ columns: ['a', 'b'], rows: [['x,y', 'say "hi"'], [1, null]] })).toBe('a,b\n"x,y","say ""hi"""\n1,');
  });
  it('tsv flattens tabs and newlines', () => {
    expect(toTsv({ columns: ['a'], rows: [['x\ty\nz']] })).toBe('a\nx y z');
  });
});

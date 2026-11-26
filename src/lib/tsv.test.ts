import { describe, expect, it } from 'vitest';
import { parseTsv, toTsv } from './tsv';

describe('tsv', () => {
  it('round-trips cells with tabs, line breaks and quotes', () => {
    const rows = [
      ['a', 'b\tc', 'line 1\nline 2'],
      ['say "hi"', '', 'plain'],
    ];
    expect(parseTsv(toTsv(rows))).toEqual(rows);
  });

  it('reads spreadsheet clipboard text', () => {
    expect(parseTsv('1\t2\r\n3\t4\r\n')).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(parseTsv('one')).toEqual([['one']]);
    expect(parseTsv('a\t\tc')).toEqual([['a', '', 'c']]);
    expect(parseTsv('')).toEqual([]);
  });

  it('keeps stray quotes that don’t wrap a whole cell', () => {
    expect(parseTsv('5" screen\tok')).toEqual([['5" screen', 'ok']]);
    expect(parseTsv('"quoted" tail\tx')).toEqual([['"quoted" tail', 'x']]);
  });
});

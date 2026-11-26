import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv, toCsv } from './csv';

describe('csv', () => {
  it('round-trips quotes, commas and line breaks', () => {
    const rows = [
      ['Name', 'Notes'],
      ['Ana, Jr.', 'Said "hi"\nthen left'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('reads semicolons and tabs, skips blank lines and a BOM', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(parseCsv('﻿a;b\r\n\r\n1;2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

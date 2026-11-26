import { describe, expect, it } from 'vitest';
import { detectDelimiter, neutralizeFormula, parseCsv, toCsv } from './csv';

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

  it('neutralizes cells a spreadsheet would run as formulas', () => {
    expect(neutralizeFormula('=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")');
    expect(neutralizeFormula('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(neutralizeFormula('-2+3')).toBe("'-2+3");
    expect(neutralizeFormula('-5')).toBe('-5');
    expect(neutralizeFormula('+1,234.50')).toBe('+1,234.50');
    expect(neutralizeFormula('Plain')).toBe('Plain');
    expect(toCsv([['=1+1']])).toBe("'=1+1");
  });
});

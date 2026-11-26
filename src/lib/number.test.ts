import { describe, expect, it } from 'vitest';
import { parseLocaleNumber, roundTo } from './number';

describe('parseLocaleNumber', () => {
  it('parses plain, grouped, currency and accounting forms', () => {
    expect(parseLocaleNumber('42')).toEqual({ value: 42, percent: false });
    expect(parseLocaleNumber('1,234.5')?.value).toBe(1234.5);
    expect(parseLocaleNumber('$1,234.50')?.value).toBe(1234.5);
    expect(parseLocaleNumber('-$3')?.value).toBe(-3);
    expect(parseLocaleNumber('(12)')?.value).toBe(-12);
    expect(parseLocaleNumber('USD 7')?.value).toBe(7);
    expect(parseLocaleNumber('.5')?.value).toBe(0.5);
    expect(parseLocaleNumber('1e3')?.value).toBe(1000);
  });

  it('follows the locale separators', () => {
    expect(parseLocaleNumber('1.234,5', 'de-DE')?.value).toBe(1234.5);
    expect(parseLocaleNumber('1 234,5', 'fr-FR')?.value).toBe(1234.5);
  });

  it('flags percentages and rejects non-numbers', () => {
    expect(parseLocaleNumber('25%')).toEqual({ value: 25, percent: true });
    expect(parseLocaleNumber('abc')).toBeNull();
    expect(parseLocaleNumber('')).toBeNull();
    expect(parseLocaleNumber('1.2.3')).toBeNull();
  });
});

describe('roundTo', () => {
  it('rounds without binary noise', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
    expect(roundTo(2.5, 0)).toBe(3);
  });
});

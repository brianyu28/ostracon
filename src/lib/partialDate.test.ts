import { describe, expect, it } from 'vitest';
import {
  comparePartialDates,
  datePrecision,
  isLocalDateTime,
  isPartialDate,
  partialEnd,
  partialStart,
} from './partialDate';

describe('partial dates', () => {
  it('validates years, months and days', () => {
    expect(isPartialDate('2019')).toBe(true);
    expect(isPartialDate('2019-07')).toBe(true);
    expect(isPartialDate('2019-13')).toBe(false);
    expect(isPartialDate('2019-02-29')).toBe(false);
    expect(isPartialDate('2020-02-29')).toBe(true);
    expect(isPartialDate('19')).toBe(false);
    expect(datePrecision('2019-07')).toBe('month');
  });

  it('covers the range of days it stands for', () => {
    expect([partialStart('2019'), partialEnd('2019')]).toEqual(['2019-01-01', '2019-12-31']);
    expect([partialStart('2020-02'), partialEnd('2020-02')]).toEqual(['2020-02-01', '2020-02-29']);
    expect([partialStart('2020-02-03'), partialEnd('2020-02-03')]).toEqual([
      '2020-02-03',
      '2020-02-03',
    ]);
  });

  it('sorts by start, narrower first', () => {
    const list = ['2019', '2018-12-31', '2019-01', '2019-01-01', '2019-02'];
    expect(list.sort(comparePartialDates)).toEqual([
      '2018-12-31',
      '2019-01-01',
      '2019-01',
      '2019',
      '2019-02',
    ]);
  });

  it('validates local date-times', () => {
    expect(isLocalDateTime('2026-11-26T19:30')).toBe(true);
    expect(isLocalDateTime('2026-11-26T24:00')).toBe(false);
    expect(isLocalDateTime('2026-11-26 19:30')).toBe(false);
    expect(isLocalDateTime('2026-11-26T19:30:00')).toBe(false);
  });
});

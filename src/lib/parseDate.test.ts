import { describe, expect, it } from 'vitest';
import { monthFirst, parseLocalDateTime, parsePartialDate, parseTime } from './parseDate';

const us = { today: '2026-11-26', locale: 'en-US' };
const uk = { today: '2026-11-26', locale: 'en-GB' };

describe('parsePartialDate', () => {
  it('parses ISO dates and, when allowed, partial ones', () => {
    expect(parsePartialDate('2026-03-04', us)).toBe('2026-03-04');
    expect(parsePartialDate('2026/3/4', us)).toBe('2026-03-04');
    expect(parsePartialDate('2026-03', us)).toBeNull();
    expect(parsePartialDate('2026-03', { ...us, allowPartial: true })).toBe('2026-03');
    expect(parsePartialDate('2014', { ...us, allowPartial: true })).toBe('2014');
    expect(parsePartialDate('2026-02-30', us)).toBeNull();
  });

  it('understands words and offsets from today', () => {
    expect(parsePartialDate('today', us)).toBe('2026-11-26');
    expect(parsePartialDate('Yesterday', us)).toBe('2026-11-25');
    expect(parsePartialDate('-3d', us)).toBe('2026-11-23');
    expect(parsePartialDate('+2w', us)).toBe('2026-12-10');
    expect(parsePartialDate('-1m', us)).toBe('2026-10-26');
    expect(parsePartialDate('+1y', us)).toBe('2027-11-26');
  });

  it('reads numeric dates in the locale order', () => {
    expect(monthFirst('en-US')).toBe(true);
    expect(monthFirst('en-GB')).toBe(false);
    expect(parsePartialDate('1/2/2026', us)).toBe('2026-01-02');
    expect(parsePartialDate('1/2/2026', uk)).toBe('2026-02-01');
    expect(parsePartialDate('26.11.26', uk)).toBe('2026-11-26');
    expect(parsePartialDate('3/4', us)).toBe('2026-03-04');
    expect(parsePartialDate('13/1/2026', us)).toBeNull();
  });

  it('reads month names in either order', () => {
    expect(parsePartialDate('Nov 26, 2026', us)).toBe('2026-11-26');
    expect(parsePartialDate('26 November 2026', uk)).toBe('2026-11-26');
    expect(parsePartialDate('3rd March 2020', uk)).toBe('2020-03-03');
    expect(parsePartialDate('Sept 9', us)).toBe('2026-09-09');
    expect(parsePartialDate('July 2019', { ...us, allowPartial: true })).toBe('2019-07');
    expect(parsePartialDate('July 2019', us)).toBeNull();
    expect(parsePartialDate('Feb 30 2026', us)).toBeNull();
  });

  it('rejects things that are not dates', () => {
    for (const text of ['', 'hello', '12', 'mar mar', '1/2/3/4']) {
      expect(parsePartialDate(text, us), text).toBeNull();
    }
  });
});

describe('times and date-times', () => {
  it('parses times of day', () => {
    expect(parseTime('19:30')).toEqual([19, 30]);
    expect(parseTime('7:05 pm')).toEqual([19, 5]);
    expect(parseTime('12am')).toEqual([0, 0]);
    expect(parseTime('12 PM')).toEqual([12, 0]);
    expect(parseTime('07:30:15')).toEqual([7, 30]);
    expect(parseTime('7')).toBeNull();
    expect(parseTime('25:00')).toBeNull();
  });

  it('parses date-times, with a date alone meaning midnight', () => {
    expect(parseLocalDateTime('2026-11-26 19:30', us)).toBe('2026-11-26T19:30');
    expect(parseLocalDateTime('2026-11-26T19:30:00Z', us)).toBe('2026-11-26T19:30');
    expect(parseLocalDateTime('Nov 26 7:30 pm', us)).toBe('2026-11-26T19:30');
    expect(parseLocalDateTime('today 8am', us)).toBe('2026-11-26T08:00');
    expect(parseLocalDateTime('2026-11-26', us)).toBe('2026-11-26T00:00');
    expect(parseLocalDateTime('soon', us)).toBeNull();
  });
});

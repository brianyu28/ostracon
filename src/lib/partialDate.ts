/**
 * Partial dates and floating local date-times.
 *
 * A partial date is a calendar date with a precision: `YYYY` (a year), `YYYY-MM` (a month) or
 * `YYYY-MM-DD` (a day). It stands for the range of days it covers, so "read it in 2014" and
 * "summer 2019 → 2019-07" can be recorded honestly. Like ISO dates, partial dates compare
 * lexically by their start, which keeps sorting cheap.
 *
 * A local date-time is `YYYY-MM-DDTHH:mm` wall-clock time with no zone: "7pm wherever I was".
 */
import { daysInMonth, isISODate, makeDate, type ISODate } from './date';

/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
export type PartialDate = string;
export type DatePrecision = 'year' | 'month' | 'day';
/** `YYYY-MM-DDTHH:mm` */
export type LocalDateTime = string;

const YEAR_RE = /^\d{4}$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

export function datePrecision(value: PartialDate): DatePrecision {
  return value.length === 4 ? 'year' : value.length === 7 ? 'month' : 'day';
}

export function isPartialDate(value: unknown): value is PartialDate {
  if (typeof value !== 'string') return false;
  if (YEAR_RE.test(value)) return true;
  const m = MONTH_RE.exec(value);
  if (m) {
    const month = Number(m[2]);
    return month >= 1 && month <= 12;
  }
  return isISODate(value);
}

/** First day covered by a partial date. */
export function partialStart(value: PartialDate): ISODate {
  if (value.length === 4) return `${value}-01-01`;
  if (value.length === 7) return `${value}-01`;
  return value;
}

/** Last day covered by a partial date. */
export function partialEnd(value: PartialDate): ISODate {
  if (value.length === 4) return `${value}-12-31`;
  if (value.length === 7) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    return makeDate(year, month, daysInMonth(year, month));
  }
  return value;
}

/** Orders by start, then the narrower date first ("2019-01-01" before "2019-01" before "2019"). */
export function comparePartialDates(a: PartialDate, b: PartialDate): number {
  const sa = partialStart(a);
  const sb = partialStart(b);
  if (sa !== sb) return sa < sb ? -1 : 1;
  return a.length === b.length ? 0 : b.length - a.length;
}

export function isLocalDateTime(value: unknown): value is LocalDateTime {
  if (typeof value !== 'string') return false;
  const m = DATE_TIME_RE.exec(value);
  if (!m) return false;
  const [, date, hh, mm] = m as unknown as [string, string, string, string];
  return isISODate(date) && Number(hh) <= 23 && Number(mm) <= 59;
}

export function makeLocalDateTime(date: ISODate, hours: number, minutes: number): LocalDateTime {
  return `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

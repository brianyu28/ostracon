/**
 * Date spans for filters, grouping and summaries: a stored date value or a filter operand becomes
 * an inclusive `[start, end]` span of ISO dates (`undefined` ends are open).
 */
import { addDays, addMonths, dayOfWeek, endOfMonth, startOfMonth, type ISODate } from '@/lib/date';
import { partialEnd, partialStart } from '@/lib/partialDate';
import type { DatePoint, DateRangeOperand, DateUnit, Field, RecordEntity } from '../schema/types';

export interface Span {
  start?: ISODate | undefined;
  end?: ISODate | undefined;
}

/** A span with both ends. */
export interface ClosedSpan {
  start: ISODate;
  end: ISODate;
}

export interface DateContext {
  today: ISODate;
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1;
}

/** A date moved by whole units (months and longer clamp the day). */
export function addUnits(date: ISODate, amount: number, unit: DateUnit): ISODate {
  switch (unit) {
    case 'day':
      return addDays(date, amount);
    case 'week':
      return addDays(date, amount * 7);
    case 'month':
      return addMonths(date, amount);
    case 'quarter':
      return addMonths(date, amount * 3);
    case 'year':
      return addMonths(date, amount * 12);
  }
}

/** The first day of the period (week, month, quarter, year) containing a date. */
export function periodStart(
  date: ISODate,
  unit: Exclude<DateUnit, 'day'>,
  weekStartsOn: 0 | 1,
): ISODate {
  switch (unit) {
    case 'week':
      return addDays(date, -((dayOfWeek(date) - weekStartsOn + 7) % 7));
    case 'month':
      return startOfMonth(date);
    case 'quarter': {
      const month = Number(date.slice(5, 7));
      const first = month - ((month - 1) % 3);
      return `${date.slice(0, 4)}-${String(first).padStart(2, '0')}-01`;
    }
    case 'year':
      return `${date.slice(0, 4)}-01-01`;
  }
}

/** The period (week, month, quarter, year) containing a date. */
export function periodSpan(
  date: ISODate,
  unit: Exclude<DateUnit, 'day'>,
  weekStartsOn: 0 | 1,
): ClosedSpan {
  const start = periodStart(date, unit, weekStartsOn);
  const end =
    unit === 'week'
      ? addDays(start, 6)
      : endOfMonth(addMonths(start, unit === 'month' ? 0 : unit === 'quarter' ? 2 : 11));
  return { start, end };
}

/** The days a filter's date point covers ("2019" covers the year; "3 days ago" one day). */
export function pointSpan(point: DatePoint, ctx: DateContext): ClosedSpan {
  if (point.kind === 'absolute')
    return { start: partialStart(point.date), end: partialEnd(point.date) };
  const date = addUnits(ctx.today, point.offset, point.unit);
  return { start: date, end: date };
}

/** The days a filter's date range covers. */
export function rangeSpan(range: DateRangeOperand, ctx: DateContext): Span {
  const { today, weekStartsOn } = ctx;
  switch (range.kind) {
    case 'absolute':
      return {
        start: range.start === undefined ? undefined : partialStart(range.start),
        end: range.end === undefined ? undefined : partialEnd(range.end),
      };
    case 'rolling': {
      const edge = range.includeToday ? today : addDays(today, range.direction === 'past' ? -1 : 1);
      if (range.direction === 'past')
        return { start: addDays(addUnits(today, -range.amount, range.unit), 1), end: edge };
      return { start: edge, end: addDays(addUnits(today, range.amount, range.unit), -1) };
    }
    case 'period': {
      const shifted = addUnits(today, range.offset, range.unit);
      return periodSpan(shifted, range.unit, weekStartsOn);
    }
    case 'toDate':
      return { start: periodStart(today, range.unit, weekStartsOn), end: today };
  }
}

/** The local calendar date of an ISO timestamp. */
export function timestampDate(iso: string): ISODate {
  const d = new Date(iso);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The days a record's date value covers, or undefined when it has none. */
export function valueSpan(record: RecordEntity, field: Field): ClosedSpan | undefined {
  switch (field.type) {
    case 'createdTime':
      return point(timestampDate(record.createdAt));
    case 'modifiedTime':
      return point(timestampDate(record.updatedAt));
    case 'date': {
      const v = record.values[field.id];
      return typeof v === 'string' ? { start: partialStart(v), end: partialEnd(v) } : undefined;
    }
    case 'dateTime': {
      const v = record.values[field.id];
      return typeof v === 'string' ? point(v.slice(0, 10)) : undefined;
    }
    case 'dateRange': {
      const v = record.values[field.id];
      if (typeof v !== 'object' || Array.isArray(v) || !('start' in v)) return undefined;
      const range = v as { start: string; end?: string };
      return { start: partialStart(range.start), end: partialEnd(range.end ?? range.start) };
    }
    default:
      return undefined;
  }
}

function point(date: ISODate): ClosedSpan {
  return { start: date, end: date };
}

/** Whether two spans share a day. */
export function overlaps(a: Span, b: Span): boolean {
  return (
    (a.end === undefined || b.start === undefined || a.end >= b.start) &&
    (b.end === undefined || a.start === undefined || b.end >= a.start)
  );
}

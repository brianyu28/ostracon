/**
 * Calendar layout: where a view's records fall in a month. Day-precision dates (and ranges)
 * sit on their days; dates known only to the month or year go in a tray for that month.
 */
import { addDays, dayOfWeek, daysInMonth, makeDate, type ISODate } from '@/lib/date';
import { datePrecision, partialEnd, partialStart } from '@/lib/partialDate';
import type { Field, RecordEntity, View } from '../schema/types';
import { timestampDate } from './dates';

export interface CalendarEntry {
  record: RecordEntity;
  start: ISODate;
  end: ISODate;
  /** HH:mm for date-time fields. */
  time?: string;
}

export interface CalendarMonth {
  /** The days shown: whole weeks covering the month. */
  days: ISODate[];
  /** Entries per day (multi-day ones on each of their days), in record order. */
  byDay: Map<ISODate, CalendarEntry[]>;
  /** Records with only a month or year in this month's range. */
  tray: RecordEntity[];
}

interface Placed {
  start: ISODate;
  end: ISODate;
  precise: boolean;
  time?: string;
}

/** Where a record falls, or undefined when it has no date. */
export function placeRecord(
  record: RecordEntity,
  field: Field,
  endField?: Field,
): Placed | undefined {
  const v = record.values[field.id];
  let placed: Placed | undefined;
  switch (field.type) {
    case 'createdTime':
      placed = point(timestampDate(record.createdAt));
      break;
    case 'modifiedTime':
      placed = point(timestampDate(record.updatedAt));
      break;
    case 'date':
      if (typeof v === 'string')
        placed = {
          start: partialStart(v),
          end: partialEnd(v),
          precise: datePrecision(v) === 'day',
        };
      break;
    case 'dateTime':
      if (typeof v === 'string') placed = { ...point(v.slice(0, 10)), time: v.slice(11, 16) };
      break;
    case 'dateRange':
      if (v && typeof v === 'object' && 'start' in v) {
        const range = v;
        placed = {
          start: partialStart(range.start),
          end: partialEnd(range.end ?? range.start),
          precise: datePrecision(range.start) === 'day',
        };
      }
      break;
  }
  if (placed?.precise && endField) {
    const end = placeRecord(record, endField);
    if (end?.precise && end.start >= placed.start) placed = { ...placed, end: end.start };
  }
  return placed;
}

function point(date: ISODate): Placed {
  return { start: date, end: date, precise: true };
}

/** The weeks shown for a month (`YYYY-MM`), starting on the week's first day. */
export function monthDays(month: string, weekStartsOn: 0 | 1): ISODate[] {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const first = makeDate(year, m, 1);
  const lead = (dayOfWeek(first) - weekStartsOn + 7) % 7;
  const start = addDays(first, -lead);
  const weeks = Math.ceil((lead + daysInMonth(year, m)) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

/** Places records in a month. */
export function calendarMonth(
  view: View,
  fields: Readonly<Record<string, Field>>,
  records: readonly RecordEntity[],
  month: string,
  weekStartsOn: 0 | 1,
): CalendarMonth {
  const days = monthDays(month, weekStartsOn);
  const byDay = new Map<ISODate, CalendarEntry[]>(days.map((d) => [d, []]));
  const tray: RecordEntity[] = [];
  const field = view.calendar ? fields[view.calendar.dateFieldId] : undefined;
  if (!field) return { days, byDay, tray };
  const endField = view.calendar?.endFieldId ? fields[view.calendar.endFieldId] : undefined;
  const first = days[0] as ISODate;
  const last = days[days.length - 1] as ISODate;
  const monthStart = `${month}-01`;
  const monthEnd = partialEnd(month);
  for (const record of records) {
    const placed = placeRecord(record, field, endField);
    if (!placed) continue;
    if (!placed.precise) {
      if (placed.start <= monthEnd && placed.end >= monthStart) tray.push(record);
      continue;
    }
    if (placed.end < first || placed.start > last) continue;
    const entry: CalendarEntry = {
      record,
      start: placed.start,
      end: placed.end,
      ...(placed.time ? { time: placed.time } : {}),
    };
    // A long span is shown on the visible days only.
    for (
      let d = placed.start < first ? first : placed.start;
      d <= placed.end && d <= last;
      d = addDays(d, 1)
    )
      byDay.get(d)?.push(entry);
  }
  for (const list of byDay.values())
    list.sort(
      (a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.start.localeCompare(b.start),
    );
  return { days, byDay, tray };
}

/** New values for moving a record's date by some days (ranges and end fields move with it). */
export function shiftedValues(
  record: RecordEntity,
  field: Field,
  days: number,
  endField?: Field,
): Record<string, unknown> | null {
  const v = record.values[field.id];
  const out: Record<string, unknown> = {};
  if (field.type === 'date' && typeof v === 'string' && datePrecision(v) === 'day')
    out[field.id] = addDays(v, days);
  else if (field.type === 'dateTime' && typeof v === 'string')
    out[field.id] = `${addDays(v.slice(0, 10), days)}${v.slice(10)}`;
  else if (field.type === 'dateRange' && v && typeof v === 'object' && 'start' in v) {
    const range = v;
    if (datePrecision(range.start) !== 'day') return null;
    out[field.id] = {
      start: addDays(range.start, days),
      ...(range.end && datePrecision(range.end) === 'day'
        ? { end: addDays(range.end, days) }
        : range.end
          ? { end: range.end }
          : {}),
    };
  } else return null;
  if (endField) {
    const e = record.values[endField.id];
    if (endField.type === 'date' && typeof e === 'string' && datePrecision(e) === 'day')
      out[endField.id] = addDays(e, days);
    else if (endField.type === 'dateTime' && typeof e === 'string')
      out[endField.id] = `${addDays(e.slice(0, 10), days)}${e.slice(10)}`;
  }
  return out;
}

/** The value a new record on a day gets for the calendar's date field. */
export function dayValue(field: Field, day: ISODate): unknown {
  if (field.type === 'dateTime') return `${day}T12:00`;
  if (field.type === 'dateRange') return { start: day };
  return day;
}

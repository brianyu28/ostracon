/**
 * Lenient parsing of dates and times typed or pasted by people:
 *   ISO and partial ISO       2026-11-26, 2026-11, 2026
 *   words and offsets         today, yesterday, tomorrow, -3d, +2w, -1m, +1y
 *   numeric                   11/26/2026, 26.11.2026 (month/day order from the locale), 11/26
 *   month names               Nov 26, 2026 · 26 November 2026 · November 2026 · Nov 2026
 *   times                     19:30, 7:30 pm, 7pm, 07:30:15 (seconds are dropped)
 * Everything is pure: "today" comes from the caller.
 */
import { addDays, addMonths, isISODate, makeDate, type ISODate } from './date';
import {
  isPartialDate,
  makeLocalDateTime,
  type LocalDateTime,
  type PartialDate,
} from './partialDate';

export interface DateParseOptions {
  today: ISODate;
  /** Decides whether 1/2/2026 is January 2 (en-US) or 1 February. */
  locale?: string;
  /** Accept `YYYY` and `YYYY-MM` results (otherwise only full dates). */
  allowPartial?: boolean;
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

function monthFromName(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return null;
  const index = MONTHS.findIndex((m) => m.startsWith(w) || (w === 'sept' && m === 'september'));
  return index === -1 ? null : index + 1;
}

/** Whether the locale writes numeric dates month first (US style). */
export function monthFirst(locale = 'en-US'): boolean {
  const parts = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).formatToParts(Date.UTC(2026, 10, 26));
  const order = parts.filter((p) => p.type === 'month' || p.type === 'day').map((p) => p.type);
  return order[0] === 'month';
}

function expandYear(y: number): number {
  return y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y;
}

function safeDate(year: number, month: number, day: number): ISODate | null {
  const date = makeDate(year, month, day);
  return isISODate(date) ? date : null;
}

/** Parses a (possibly partial) date. Returns null when the text isn't a date. */
export function parsePartialDate(input: string, options: DateParseOptions): PartialDate | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ').replace(/,/g, '');
  if (!text) return null;
  const allowPartial = options.allowPartial ?? false;
  const accept = (value: PartialDate | null) =>
    value !== null && isPartialDate(value) && (allowPartial || value.length === 10) ? value : null;

  if (text === 'today' || text === 'now') return options.today;
  if (text === 'yesterday') return addDays(options.today, -1);
  if (text === 'tomorrow') return addDays(options.today, 1);

  const offset = /^([+-])\s?(\d{1,4})\s?([dwmy])$/.exec(text);
  if (offset) {
    const n = Number(offset[2]) * (offset[1] === '-' ? -1 : 1);
    switch (offset[3]) {
      case 'd':
        return addDays(options.today, n);
      case 'w':
        return addDays(options.today, n * 7);
      case 'm':
        return addMonths(options.today, n);
      default:
        return addMonths(options.today, n * 12);
    }
  }

  // ISO and partial ISO (also with slashes: 2026/11/26).
  const iso = /^(\d{4})(?:[-/](\d{1,2})(?:[-/](\d{1,2}))?)?$/.exec(text);
  if (iso) {
    const [, y, m, d] = iso;
    if (m === undefined) return accept(y ?? null);
    const month = String(Number(m)).padStart(2, '0');
    if (d === undefined) return accept(`${y ?? ''}-${month}`);
    return accept(safeDate(Number(y), Number(m), Number(d)));
  }

  // Numeric: 11/26/2026, 26.11.2026, 11/26 (this year), 11-26-26.
  const numeric = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(text);
  if (numeric) {
    const [, a, b, y] = numeric;
    const [month, day] = monthFirst(options.locale) ? [a, b] : [b, a];
    const year = y === undefined ? Number(options.today.slice(0, 4)) : expandYear(Number(y));
    return safeDate(year, Number(month), Number(day));
  }

  // Month names: "nov 26 2026", "26 nov 2026", "november 2026", "nov 26".
  const words = text.split(' ');
  if (words.length >= 1 && words.length <= 3) {
    let month: number | null = null;
    let day: number | null = null;
    let year: number | null = null;
    for (const word of words) {
      const name = monthFromName(word);
      if (name !== null && month === null) {
        month = name;
        continue;
      }
      const n = /^(\d{1,4})(?:st|nd|rd|th)?$/.exec(word);
      if (!n) return null;
      const value = Number(n[1]);
      if (n[1] !== undefined && n[1].length === 4) {
        if (year !== null) return null;
        year = value;
      } else if (day === null && value >= 1 && value <= 31) day = value;
      else if (year === null) year = expandYear(value);
      else return null;
    }
    if (month === null) return null;
    if (day === null) {
      if (year === null) return null;
      return accept(`${String(year)}-${String(month).padStart(2, '0')}`);
    }
    return safeDate(year ?? Number(options.today.slice(0, 4)), month, day);
  }
  return null;
}

/** Parses a time of day ("19:30", "7:30 pm", "7pm"). Returns [hours, minutes] or null. */
export function parseTime(input: string): [number, number] | null {
  const m = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm|a|p)?$/i.exec(input.trim());
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] === undefined ? 0 : Number(m[2]);
  const meridiem = m[3]?.toLowerCase();
  if (m[2] === undefined && meridiem === undefined) return null; // a bare number isn't a time
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem.startsWith('p') && hours !== 12) hours += 12;
    if (meridiem.startsWith('a') && hours === 12) hours = 0;
  } else if (hours > 23) return null;
  return [hours, minutes];
}

/**
 * Parses a date and time ("2026-11-26 19:30", "Nov 26 7pm", "2026-11-26T19:30"). A date on its
 * own means midnight.
 */
export function parseLocalDateTime(input: string, options: DateParseOptions): LocalDateTime | null {
  const text = input.trim().replace(/\s+/g, ' ');
  const isoLike = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2}(?::\d{2})?)(?:\.\d+)?Z?$/i.exec(text);
  if (isoLike) {
    const time = parseTime(isoLike[2] ?? '');
    const date = isoLike[1] ?? '';
    return time && isISODate(date) ? makeLocalDateTime(date, ...time) : null;
  }
  // Try splitting the trailing time words off (up to two words: "7:30 pm").
  const words = text.split(' ');
  for (let take = Math.min(2, words.length - 1); take >= 1; take--) {
    const time = parseTime(words.slice(-take).join(' '));
    if (!time) continue;
    const date = parsePartialDate(words.slice(0, -take).join(' '), {
      ...options,
      allowPartial: false,
    });
    if (date) return makeLocalDateTime(date, ...time);
  }
  const date = parsePartialDate(text, { ...options, allowPartial: false });
  return date ? makeLocalDateTime(date, 0, 0) : null;
}

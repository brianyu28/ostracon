/** Display formatting shared by the date and number field types. */
import { formatDate } from '@/lib/date';
import { datePrecision, type LocalDateTime, type PartialDate } from '@/lib/partialDate';
import { roundTo } from '@/lib/number';
import type { NumberFormat } from '../schema/types';
import type { FormatContext } from './model';

const DAY_OPTIONS: Record<'medium' | 'numeric', Intl.DateTimeFormatOptions> = {
  medium: { month: 'short', day: 'numeric', year: 'numeric' },
  numeric: { month: 'numeric', day: 'numeric', year: 'numeric' },
};
const MONTH_OPTIONS: Record<'medium' | 'numeric', Intl.DateTimeFormatOptions> = {
  medium: { month: 'short', year: 'numeric' },
  numeric: { month: 'numeric', year: 'numeric' },
};

/** "Nov 26, 2026", "Nov 2026" or "2026" (or ISO / numeric per the date style). */
export function formatPartialDate(value: PartialDate, ctx: FormatContext): string {
  if (ctx.dateStyle === 'iso') return value;
  switch (datePrecision(value)) {
    case 'year':
      return value;
    case 'month':
      return formatDate(`${value}-01`, ctx.locale, MONTH_OPTIONS[ctx.dateStyle]);
    case 'day':
      return formatDate(value, ctx.locale, DAY_OPTIONS[ctx.dateStyle]);
  }
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

/** "7:30 PM" / "19:30", following the locale's clock. */
export function formatTime(hours: number, minutes: number, locale: string): string {
  let f = timeFormatters.get(locale);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    timeFormatters.set(locale, f);
  }
  return f.format(Date.UTC(2000, 0, 1, hours, minutes));
}

/** "Nov 26, 2026, 7:30 PM" (ISO style: "2026-11-26 19:30"). */
export function formatLocalDateTime(value: LocalDateTime, ctx: FormatContext): string {
  const date = value.slice(0, 10);
  const time = value.slice(11);
  if (ctx.dateStyle === 'iso') return `${date} ${time}`;
  const t = formatTime(Number(time.slice(0, 2)), Number(time.slice(3, 5)), ctx.locale);
  return `${formatPartialDate(date, ctx)}, ${t}`;
}

const numberFormatters = new Map<string, Intl.NumberFormat>();

/** The number of decimal places a format keeps (null: as entered). */
export function formatDecimals(format: NumberFormat): number | null {
  switch (format.style) {
    case 'plain':
      return null;
    case 'percent':
      return format.decimals ?? 0;
    default:
      return format.decimals ?? 2;
  }
}

/** Formats a number per a field's number format (percent values are fractions: 0.25 → 25%). */
export function formatNumber(value: number, format: NumberFormat, ctx: FormatContext): string {
  const decimals = formatDecimals(format);
  const options: Intl.NumberFormatOptions = {
    useGrouping: format.thousands === true,
    ...(decimals === null
      ? { maximumFractionDigits: 10 }
      : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  };
  if (format.style === 'currency') {
    options.style = 'currency';
    options.currency = format.currency ?? ctx.defaultCurrency;
  } else if (format.style === 'percent') {
    options.style = 'percent';
  }
  const key = `${ctx.locale}|${JSON.stringify(options)}`;
  let f = numberFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(ctx.locale, options);
    numberFormatters.set(key, f);
  }
  return f.format(value);
}

/** Canonical text for a number that `parse` reads back exactly ("25%" for a 0.25 percent). */
export function rawNumber(value: number, format: NumberFormat): string {
  return format.style === 'percent' ? `${String(roundTo(value * 100, 10))}%` : String(value);
}

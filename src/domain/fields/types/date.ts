/** Date field types: date (optionally partial), date-time (floating local time) and date range. */
import { parseLocalDateTime, parsePartialDate } from '@/lib/parseDate';
import {
  comparePartialDates,
  isLocalDateTime,
  isPartialDate,
  partialStart,
} from '@/lib/partialDate';
import type { DateRangeValue, Summary, Value } from '../../schema/types';
import { formatLocalDateTime, formatPartialDate } from '../format';
import { BASIC_SUMMARIES, INVALID, isRecordLike, type FieldTypeDef } from '../model';
import { DATE_OPERATORS } from '../operators';

const DATE_SUMMARIES: readonly Summary[] = [...BASIC_SUMMARIES, 'earliest', 'latest', 'range'];

const partialConfig = (config: unknown, what: string) => {
  if (config !== undefined && !isRecordLike(config)) return `Invalid ${what} options.`;
  return config?.partial === true ? { partial: true as const } : {};
};

const validDate = (value: unknown, partial: boolean): value is string =>
  isPartialDate(value) && (partial || value.length === 10);

export const dateType: FieldTypeDef<'date'> = {
  type: 'date',
  label: 'Date',
  stored: true,
  canBePrimary: false,
  defaultConfig: () => ({}),
  normalizeConfig: (config) => partialConfig(config, 'date'),
  isValid: (value, field) => validDate(value, field.config.partial === true),
  normalize(value, field) {
    if (value === undefined || value === null || value === '') return undefined;
    return validDate(value, field.config.partial === true) ? value : INVALID;
  },
  compare: (a, b) => comparePartialDates(a as string, b as string),
  format: (value, _field, ctx, style) =>
    style === 'raw' ? (value as string) : formatPartialDate(value as string, ctx),
  parse(text, field, ctx) {
    if (!text.trim()) return undefined;
    return (
      parsePartialDate(text, { ...ctx, allowPartial: field.config.partial === true }) ?? INVALID
    );
  },
  operators: DATE_OPERATORS,
  summaries: DATE_SUMMARIES,
};

export const dateTimeType: FieldTypeDef<'dateTime'> = {
  type: 'dateTime',
  label: 'Date and time',
  stored: true,
  canBePrimary: false,
  defaultConfig: () => undefined,
  normalizeConfig: () => undefined,
  isValid: (value) => isLocalDateTime(value),
  normalize(value) {
    if (value === undefined || value === null || value === '') return undefined;
    return isLocalDateTime(value) ? value : INVALID;
  },
  compare: (a, b) => ((a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0),
  format: (value, _field, ctx, style) =>
    style === 'raw'
      ? (value as string).replace('T', ' ')
      : formatLocalDateTime(value as string, ctx),
  parse(text, _field, ctx) {
    if (!text.trim()) return undefined;
    return parseLocalDateTime(text, ctx) ?? INVALID;
  },
  operators: DATE_OPERATORS,
  summaries: DATE_SUMMARIES,
};

/** Splits "a – b", "a — b", "a to b" and "a - b" (spaced hyphen) into two parts. */
const RANGE_SEPARATOR = /\s+(?:to|through|until|-)\s+|\s*[–—]\s*/i;

function normalizeRange(
  value: unknown,
  partial: boolean,
): DateRangeValue | undefined | typeof INVALID {
  if (value === undefined || value === null) return undefined;
  if (!isRecordLike(value)) return INVALID;
  const { start, end } = value;
  if (start === undefined || start === null || start === '') {
    return end === undefined || end === null || end === '' ? undefined : INVALID;
  }
  if (!validDate(start, partial)) return INVALID;
  if (end === undefined || end === null || end === '' || end === start) return { start };
  if (!validDate(end, partial)) return INVALID;
  // The end may not start before the start does.
  if (partialStart(end) < partialStart(start)) return INVALID;
  return { start, end };
}

const sameRange = (a: Value, b: DateRangeValue | undefined | typeof INVALID) =>
  b !== undefined &&
  b !== INVALID &&
  isRecordLike(a) &&
  Object.keys(a).length === Object.keys(b).length &&
  (a as Record<string, unknown>).start === b.start &&
  (a as Record<string, unknown>).end === b.end;

export const dateRangeType: FieldTypeDef<'dateRange'> = {
  type: 'dateRange',
  label: 'Date range',
  stored: true,
  canBePrimary: false,
  defaultConfig: () => ({}),
  normalizeConfig: (config) => partialConfig(config, 'date range'),
  isValid: (value, field) => sameRange(value, normalizeRange(value, field.config.partial === true)),
  normalize: (value, field) => normalizeRange(value, field.config.partial === true),
  compare(a, b) {
    const ra = a as DateRangeValue;
    const rb = b as DateRangeValue;
    return (
      comparePartialDates(ra.start, rb.start) ||
      comparePartialDates(ra.end ?? ra.start, rb.end ?? rb.start)
    );
  },
  format(value, _field, ctx, style) {
    const { start, end } = value as DateRangeValue;
    const f = (d: string) => (style === 'raw' ? d : formatPartialDate(d, ctx));
    return end === undefined ? f(start) : `${f(start)} – ${f(end)}`;
  },
  parse(text, field, ctx) {
    if (!text.trim()) return undefined;
    const options = { ...ctx, allowPartial: field.config.partial === true };
    const parts = text.trim().split(RANGE_SEPARATOR);
    if (parts.length > 2) return INVALID;
    const [a = '', b] = parts;
    const start = parsePartialDate(a, options);
    const end = b === undefined ? undefined : parsePartialDate(b, options);
    if (start === null || end === null) return INVALID;
    return normalizeRange({ start, end }, field.config.partial === true) ?? INVALID;
  },
  operators: DATE_OPERATORS,
  summaries: DATE_SUMMARIES,
};

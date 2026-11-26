/** Numeric field types: number (with formats), rating and duration. */
import { formatDuration, parseDuration } from '@/lib/duration';
import { parseLocaleNumber, roundTo } from '@/lib/number';
import type { NumberFormat, Summary } from '../../schema/types';
import { formatDecimals, formatNumber, rawNumber } from '../format';
import { BASIC_SUMMARIES, INVALID, isRecordLike, type FieldTypeDef } from '../model';
import { NUMBER_OPERATORS } from '../operators';

const NUMERIC_SUMMARIES: readonly Summary[] = [
  ...BASIC_SUMMARIES,
  'sum',
  'average',
  'median',
  'min',
  'max',
  'range',
];

const compareNumbers = (a: unknown, b: unknown) => (a as number) - (b as number);

/** Validates a number format from user input. */
export function normalizeNumberFormat(
  config: unknown,
  defaultCurrency: string,
): NumberFormat | string {
  if (!isRecordLike(config)) return 'Invalid number format.';
  const style = config.style;
  if (style !== 'plain' && style !== 'decimal' && style !== 'currency' && style !== 'percent')
    return 'Unknown number format.';
  const out: NumberFormat = { style };
  if (config.decimals !== undefined) {
    const d = config.decimals;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 10)
      return 'Decimal places must be between 0 and 10.';
    if (style !== 'plain') out.decimals = d;
  }
  if (config.thousands === true) out.thousands = true;
  if (style === 'currency') {
    const c = config.currency ?? defaultCurrency;
    if (typeof c !== 'string' || !/^[A-Z]{3}$/.test(c)) return 'Invalid currency code.';
    out.currency = c;
  }
  return out;
}

/** Rounds a value to what its format keeps (percent values are fractions). */
function roundForFormat(value: number, format: NumberFormat): number {
  const decimals = formatDecimals(format);
  if (decimals === null) return value;
  return roundTo(value, format.style === 'percent' ? decimals + 2 : decimals);
}

export const numberType: FieldTypeDef<'number'> = {
  type: 'number',
  label: 'Number',
  stored: true,
  canBePrimary: false,
  defaultConfig: () => ({ style: 'plain' }),
  normalizeConfig: (config, ctx) => normalizeNumberFormat(config, ctx.settings.defaultCurrency),
  isValid: (value) => typeof value === 'number' && Number.isFinite(value),
  normalize(value, field) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value)) return INVALID;
    return roundForFormat(value, field.config);
  },
  compare: compareNumbers,
  format: (value, field, ctx, style) =>
    style === 'raw'
      ? rawNumber(value as number, field.config)
      : formatNumber(value as number, field.config, ctx),
  parse(text, field, ctx) {
    if (!text.trim()) return undefined;
    const parsed = parseLocaleNumber(text, ctx.locale);
    if (!parsed) return INVALID;
    // In a percent field "25" means 25%; elsewhere "25%" means 0.25.
    const value =
      field.config.style === 'percent' || parsed.percent ? parsed.value / 100 : parsed.value;
    return roundForFormat(value, field.config);
  },
  operators: NUMBER_OPERATORS,
  summaries: NUMERIC_SUMMARIES,
};

export const ratingType: FieldTypeDef<'rating'> = {
  type: 'rating',
  label: 'Rating',
  stored: true,
  canBePrimary: false,
  defaultConfig: () => ({ max: 5 }),
  normalizeConfig(config) {
    if (!isRecordLike(config)) return 'Invalid rating options.';
    const max = config.max ?? 5;
    if (typeof max !== 'number' || !Number.isInteger(max) || max < 3 || max > 10)
      return 'A rating goes up to between 3 and 10.';
    const icon = config.icon;
    if (icon !== undefined && icon !== 'star' && icon !== 'heart' && icon !== 'circle')
      return 'Unknown rating icon.';
    return icon && icon !== 'star' ? { max, icon } : { max };
  },
  isValid: (value, field) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= field.config.max,
  normalize(value, field) {
    if (value === undefined || value === null || value === 0) return undefined;
    if (typeof value !== 'number' || !Number.isInteger(value)) return INVALID;
    return value >= 1 && value <= field.config.max ? value : INVALID;
  },
  compare: compareNumbers,
  format: (value, field, _ctx, style) =>
    style === 'raw'
      ? `${value as number}`
      : '★'.repeat(value as number) + '☆'.repeat(field.config.max - (value as number)),
  parse(text, field) {
    const t = text.trim();
    if (!t) return undefined;
    const stars = /^[★⭐*]+☆*$/u.test(t) ? t.replace(/☆/g, '').length : null;
    const n = stars ?? parseLocaleNumber(t.replace(/\s*\/\s*\d+$/, ''))?.value;
    if (n === undefined) return INVALID;
    const value = Math.round(n);
    if (value === 0) return undefined;
    return value >= 1 && value <= field.config.max ? value : INVALID;
  },
  operators: NUMBER_OPERATORS,
  summaries: [...BASIC_SUMMARIES, 'average', 'median', 'min', 'max'],
};

export const durationType: FieldTypeDef<'duration'> = {
  type: 'duration',
  label: 'Duration',
  stored: true,
  canBePrimary: false,
  defaultConfig: () => ({ display: 'h:mm' }),
  normalizeConfig(config) {
    if (!isRecordLike(config)) return 'Invalid duration options.';
    const display = config.display ?? 'h:mm';
    if (display !== 'h:mm' && display !== 'h:mm:ss' && display !== 'compact')
      return 'Unknown duration display.';
    return { display: display };
  },
  isValid: (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0,
  normalize(value) {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return INVALID;
    return Math.round(value);
  },
  compare: compareNumbers,
  format: (value, field, _ctx, style) =>
    formatDuration(value as number, style === 'raw' ? 'h:mm:ss' : field.config.display),
  parse(text) {
    if (!text.trim()) return undefined;
    return parseDuration(text) ?? INVALID;
  },
  operators: NUMBER_OPERATORS,
  summaries: NUMERIC_SUMMARIES,
};

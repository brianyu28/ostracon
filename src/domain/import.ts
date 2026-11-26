/** CSV import helpers: guessing a new field's type from a column's values. */
import { parseLocaleNumber } from '@/lib/number';
import { parsePartialDate } from '@/lib/parseDate';
import { datePrecision } from '@/lib/partialDate';
import { cleanUrl } from './fields/types/text';
import type { FieldType } from './schema/types';

export interface Inferred {
  type: Exclude<FieldType, 'link' | 'formula' | 'createdTime' | 'modifiedTime'>;
  config?: Record<string, unknown>;
}

const CHECKS = new Set(['true', 'false', 'yes', 'no', 'y', 'n', 'x', '✓', '✔', 'checked', '']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The most specific type every non-empty value of a column fits. */
export function inferType(
  values: readonly string[],
  ctx: { locale: string; today: string },
): Inferred {
  const filled = values.map((v) => v.trim()).filter(Boolean);
  if (filled.length === 0) return { type: 'text', config: {} };
  if (
    filled.every((v) => CHECKS.has(v.toLowerCase())) &&
    filled.some((v) => v.toLowerCase() !== 'no')
  )
    return { type: 'checkbox' };
  if (filled.every((v) => parseLocaleNumber(v.replace(/^[$€£¥]/, ''), ctx.locale) !== null)) {
    const currency = filled.some((v) => /^[$€£¥]/.test(v));
    return {
      type: 'number',
      config: currency ? { style: 'currency', decimals: 2 } : { style: 'plain' },
    };
  }
  const dates = filled.map((v) => parsePartialDate(v, { ...ctx, allowPartial: true }));
  if (!dates.includes(null)) {
    const partial = dates.some((d) => d !== null && datePrecision(d) !== 'day');
    return { type: 'date', config: partial ? { partial: true } : {} };
  }
  if (filled.every((v) => EMAIL.test(v))) return { type: 'email' };
  if (filled.every((v) => /^(https?:\/\/|www\.)/i.test(v) && cleanUrl(v) !== null))
    return { type: 'url', config: {} };
  if (filled.some((v) => v.includes('\n'))) return { type: 'text', config: { multiline: true } };
  // Few distinct short values: a select (multiple when values list several).
  const multi = filled.some((v) => v.includes(','));
  const names = new Set(
    (multi ? filled.flatMap((v) => v.split(',')) : filled)
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
  const short = [...names].every((n) => n.length <= 40);
  if (filled.length >= 4 && short && names.size <= Math.max(3, Math.min(30, filled.length / 3)))
    return { type: multi ? 'multiSelect' : 'singleSelect', config: { options: [] } };
  return { type: 'text', config: {} };
}

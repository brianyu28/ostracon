/** Formula results as text, by result type and the field's number format. */
import { formatNumber, formatPartialDate } from '../fields/format';
import type { FormatContext } from '../fields/model';
import type { FieldOf } from '../schema/types';
import type { FormulaType, RuntimeValue } from './ast';

export const ERROR_TEXT = '#ERR';

export function formulaText(
  value: RuntimeValue,
  type: FormulaType | undefined,
  field: FieldOf<'formula'>,
  ctx: FormatContext,
): string {
  if (value === null || value === '') return '';
  if (type === 'number' && typeof value === 'number')
    return formatNumber(value, field.config.number ?? { style: 'plain' }, ctx);
  if (type === 'date' && typeof value === 'string') return formatPartialDate(value, ctx);
  if (type === 'boolean') return value === true ? '✓' : '';
  return typeof value === 'string' ? value : String(value);
}

/**
 * Reading values for views: stored values, timestamps and formula results through one place, so
 * a formula filters, sorts, groups and summarizes like a field of its result type.
 */
import { FORMULA_ERROR, type FormulaValue } from '../computed';
import type { FormulaType } from '../formulas/ast';
import type { FormulaField } from '../formulas/compile';
import type { Field, RecordEntity } from '../schema/types';
import { valueSpan, type ClosedSpan } from './dates';

/** What views need to compute formulas (absent in contexts without them). */
export interface FormulaAccess {
  formula?: (record: RecordEntity, field: FormulaField) => FormulaValue;
  formulaType?: (field: FormulaField) => FormulaType | undefined;
}

/** A formula's value for a record (null when empty or an error). */
export function formulaOf(
  record: RecordEntity,
  field: FormulaField,
  ctx: FormulaAccess,
): number | string | boolean | null {
  const v = ctx.formula?.(record, field) ?? null;
  return v === FORMULA_ERROR ? null : v;
}

/** A number value (stored or computed). */
export function numberOf(
  record: RecordEntity,
  field: Field,
  ctx: FormulaAccess,
): number | undefined {
  const v = field.type === 'formula' ? formulaOf(record, field, ctx) : record.values[field.id];
  return typeof v === 'number' ? v : undefined;
}

/** The days a date value (stored, timestamp or computed) covers. */
export function spanOf(
  record: RecordEntity,
  field: Field,
  ctx: FormulaAccess,
): ClosedSpan | undefined {
  if (field.type !== 'formula') return valueSpan(record, field);
  if (ctx.formulaType?.(field) !== 'date') return undefined;
  const v = formulaOf(record, field, ctx);
  return typeof v === 'string' && v ? { start: v, end: v } : undefined;
}

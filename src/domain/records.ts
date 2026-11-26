/** Record helpers that need the schema: titles and value formatting. */
import { fieldType } from './fields/registry';
import { RAW_FORMAT, type FormatContext, type TextStyle } from './fields/model';
import { formulaValue, FORMULA_ERROR, type ComputeContext } from './computed';
import { formulaResultType } from './formulas/compile';
import { ERROR_TEXT, formulaText } from './formulas/format';
import type { DocModel } from './model';
import { today } from '@/lib/date';
import type { Field, RecordEntity } from './schema/types';

/** Text of a record's value for a stored field ('' when empty). */
export function valueText(
  record: RecordEntity,
  field: Field,
  ctx: FormatContext = RAW_FORMAT,
  style: TextStyle = 'display',
): string {
  const value = record.values[field.id];
  if (value === undefined) return '';
  return fieldType(field).format(value, field, ctx, style);
}

/** A record's title: its primary field's text (a formula's result), or "Untitled". */
export function recordTitle(doc: DocModel, record: RecordEntity, ctx?: ComputeContext): string {
  const collection = doc.collections[record.collectionId];
  const primary = collection ? doc.fields[collection.primaryFieldId] : undefined;
  if (primary?.type === 'formula') {
    const value = formulaValue(doc, primary, record, ctx ?? { today: today() });
    if (value === FORMULA_ERROR) return ERROR_TEXT;
    const text = formulaText(value, formulaResultType(doc.fields, primary), primary, RAW_FORMAT);
    return text || 'Untitled';
  }
  const title = primary ? valueText(record, primary) : '';
  return title || 'Untitled';
}

/** Record helpers that need the schema: titles and value formatting. */
import { fieldType } from './fields/registry';
import { RAW_FORMAT, type FormatContext, type TextStyle } from './fields/model';
import type { DocModel } from './model';
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

/** A record's title: its primary field's text, or "Untitled". */
export function recordTitle(
  doc: Pick<DocModel, 'collections' | 'fields'>,
  record: RecordEntity,
): string {
  const collection = doc.collections[record.collectionId];
  const primary = collection ? doc.fields[collection.primaryFieldId] : undefined;
  // Formula titles are computed by the formula engine (Phase 7).
  const title = primary && primary.type !== 'formula' ? valueText(record, primary) : '';
  return title || 'Untitled';
}

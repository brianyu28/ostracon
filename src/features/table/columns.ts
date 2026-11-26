/** Column layout for the table: which fields show, in what order, and how wide. */
import type { Collection, Field, FieldType, Id, View } from '@/domain/schema/types';

const DEFAULT_WIDTHS: Partial<Record<FieldType, number>> = {
  number: 110,
  duration: 90,
  rating: 110,
  checkbox: 70,
  date: 120,
  dateTime: 160,
  dateRange: 190,
  singleSelect: 150,
  multiSelect: 200,
  url: 180,
  email: 190,
  phone: 140,
  location: 220,
  link: 200,
  richText: 260,
  createdTime: 130,
  modifiedTime: 130,
};

export const GUTTER_WIDTH = 44;
export const MIN_COLUMN_WIDTH = 60;

export interface Column {
  field: Field;
  width: number;
  /** The collection's primary field: always first and frozen. */
  primary: boolean;
  /** Left offset within the row (after the gutter). */
  left: number;
}

export function defaultWidth(field: Field, primary: boolean): number {
  return primary ? 240 : (DEFAULT_WIDTHS[field.type] ?? 180);
}

/** Visible columns of a view, primary field first. */
export function viewColumns(
  view: View,
  fields: Readonly<Record<Id, Field>>,
  collection: Collection,
  widths: Readonly<Record<Id, number>> = {},
): Column[] {
  const entries = view.fields.filter((f) => !f.hidden && fields[f.fieldId]);
  const primaryEntry = view.fields.find((f) => f.fieldId === collection.primaryFieldId);
  const ordered = [
    ...(primaryEntry ? [primaryEntry] : []),
    ...entries.filter((f) => f.fieldId !== collection.primaryFieldId),
  ];
  let left = GUTTER_WIDTH;
  return ordered.flatMap((entry) => {
    const field = fields[entry.fieldId];
    if (!field) return [];
    const primary = field.id === collection.primaryFieldId;
    const width = widths[field.id] ?? entry.width ?? defaultWidth(field, primary);
    const column = { field, width, primary, left };
    left += width;
    return [column];
  });
}

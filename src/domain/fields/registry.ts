/** Maps each field type to its definition. */
import type { Field, FieldType } from '../schema/types';
import type { AnyFieldTypeDef, FieldTypeDef } from './model';
import { dateRangeType, dateTimeType, dateType } from './types/date';
import { durationType, numberType, ratingType } from './types/number';
import {
  checkboxType,
  createdTimeType,
  formulaType,
  linkType,
  locationType,
  modifiedTimeType,
} from './types/other';
import { multiSelectType, singleSelectType } from './types/select';
import { emailType, phoneType, richTextType, textType, urlType } from './types/text';

export const FIELD_TYPES: { readonly [T in FieldType]: FieldTypeDef<T> } = {
  text: textType,
  richText: richTextType,
  number: numberType,
  rating: ratingType,
  duration: durationType,
  date: dateType,
  dateTime: dateTimeType,
  dateRange: dateRangeType,
  singleSelect: singleSelectType,
  multiSelect: multiSelectType,
  checkbox: checkboxType,
  url: urlType,
  email: emailType,
  phone: phoneType,
  location: locationType,
  link: linkType,
  formula: formulaType,
  createdTime: createdTimeType,
  modifiedTime: modifiedTimeType,
};

/** Field types in the order the "add field" menu lists them. */
export const FIELD_TYPE_ORDER: readonly FieldType[] = [
  'text',
  'richText',
  'number',
  'rating',
  'duration',
  'date',
  'dateTime',
  'dateRange',
  'singleSelect',
  'multiSelect',
  'checkbox',
  'url',
  'email',
  'phone',
  'location',
  'link',
  'formula',
  'createdTime',
  'modifiedTime',
];

/** The definition for a field's type. */
export function fieldType(field: Field | FieldType): AnyFieldTypeDef {
  const type = typeof field === 'string' ? field : field.type;
  return FIELD_TYPES[type];
}

/** Types whose values sit on records and are edited directly. */
export function isStored(field: Field): boolean {
  return fieldType(field).stored;
}

/** Types usable as a board's columns. */
export const BOARD_GROUP_TYPES: ReadonlySet<FieldType> = new Set([
  'singleSelect',
  'checkbox',
  'rating',
]);

/** Types usable to place records on a calendar. */
export const CALENDAR_DATE_TYPES: ReadonlySet<FieldType> = new Set([
  'date',
  'dateTime',
  'dateRange',
  'createdTime',
  'modifiedTime',
]);

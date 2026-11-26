/**
 * Filter operators and summaries for a field. Most come from the field's type; a formula's come
 * from its result type (a number formula filters and sums like a number field).
 */
import { compileField } from '../formulas/compile';
import type { Field, Id, Summary } from '../schema/types';
import { BASIC_SUMMARIES } from './model';
import {
  DATE_OPERATORS,
  NUMBER_OPERATORS,
  TEXT_OPERATORS,
  type OperandKind,
  type OperatorId,
} from './operators';
import { fieldType } from './registry';

type Operators = Readonly<Partial<Record<OperatorId, OperandKind>>>;

const NUMBER_SUMMARIES: readonly Summary[] = [
  ...BASIC_SUMMARIES,
  'sum',
  'average',
  'median',
  'min',
  'max',
  'range',
];
const DATE_SUMMARIES: readonly Summary[] = [...BASIC_SUMMARIES, 'earliest', 'latest', 'range'];

export function operatorsFor(field: Field, fields: Readonly<Record<Id, Field>>): Operators {
  if (field.type !== 'formula') return fieldType(field).operators;
  const compiled = compileField(fields, field);
  switch (compiled.ok ? compiled.info.type : 'text') {
    case 'number':
      return NUMBER_OPERATORS;
    case 'date':
      return DATE_OPERATORS;
    case 'boolean':
      return { isChecked: 'none', isNotChecked: 'none' };
    default:
      return TEXT_OPERATORS;
  }
}

export function summariesFor(
  field: Field,
  fields: Readonly<Record<Id, Field>>,
): readonly Summary[] {
  if (field.type !== 'formula') return fieldType(field).summaries;
  const compiled = compileField(fields, field);
  switch (compiled.ok ? compiled.info.type : 'text') {
    case 'number':
      return NUMBER_SUMMARIES;
    case 'date':
      return DATE_SUMMARIES;
    case 'boolean':
      return ['count', 'checked', 'percentChecked'];
    default:
      return BASIC_SUMMARIES;
  }
}

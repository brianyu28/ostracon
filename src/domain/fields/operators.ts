/**
 * Filter operators. Each field type lists the operators it supports and the kind of operand
 * each one takes (`FieldTypeDef.operators`); this table holds the labels. Evaluation lives
 * with the view engine (`domain/views`).
 */

/** What the user supplies for an operator. */
export type OperandKind =
  | 'none'
  | 'text'
  | 'number'
  /** `[min, max]` */
  | 'numberRange'
  /** A `DatePoint`. */
  | 'datePoint'
  /** A `DateRangeOperand`. */
  | 'dateRange'
  /** Select option ids. */
  | 'options'
  /** Record ids in the link's target collection. */
  | 'records';

export const OPERATOR_LABELS = {
  contains: 'contains',
  notContains: 'does not contain',
  is: 'is',
  isNot: 'is not',
  startsWith: 'starts with',
  endsWith: 'ends with',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
  eq: '=',
  neq: '≠',
  lt: '<',
  lte: '≤',
  gt: '>',
  gte: '≥',
  between: 'is between',
  before: 'is before',
  after: 'is after',
  onOrBefore: 'is on or before',
  onOrAfter: 'is on or after',
  within: 'is within',
  notWithin: 'is not within',
  onThisDay: 'is on this day',
  isAnyOf: 'is any of',
  isNoneOf: 'is none of',
  hasAnyOf: 'has any of',
  hasAllOf: 'has all of',
  hasNoneOf: 'has none of',
  isExactly: 'is exactly',
  isChecked: 'is checked',
  isNotChecked: 'is not checked',
  countIs: 'count is',
  countAtLeast: 'count is at least',
  countAtMost: 'count is at most',
} as const;

export type OperatorId = keyof typeof OPERATOR_LABELS;

export const EMPTINESS = { isEmpty: 'none', isNotEmpty: 'none' } as const;

export const TEXT_OPERATORS = {
  contains: 'text',
  notContains: 'text',
  is: 'text',
  isNot: 'text',
  startsWith: 'text',
  endsWith: 'text',
  ...EMPTINESS,
} as const;

export const NUMBER_OPERATORS = {
  eq: 'number',
  neq: 'number',
  lt: 'number',
  lte: 'number',
  gt: 'number',
  gte: 'number',
  between: 'numberRange',
  ...EMPTINESS,
} as const;

export const DATE_OPERATORS = {
  is: 'datePoint',
  before: 'datePoint',
  after: 'datePoint',
  onOrBefore: 'datePoint',
  onOrAfter: 'datePoint',
  within: 'dateRange',
  notWithin: 'dateRange',
  onThisDay: 'none',
  ...EMPTINESS,
} as const;

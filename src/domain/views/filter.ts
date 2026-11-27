/**
 * Filter evaluation: a view's filter compiles once into a predicate over records. Conditions
 * missing an operand they need are ignored, so a half-built filter doesn't hide everything.
 * Negative operators ("is not", "has none of", "is not within"…) match empty values.
 */
import { locationText } from '../fields/types/other';
import type { OperatorId } from '../fields/operators';
import type { LinkField } from '../links';
import type {
  DatePoint,
  DateRangeOperand,
  Field,
  FilterCondition,
  FilterGroup,
  Id,
  LocationValue,
  RecordEntity,
} from '../schema/types';
import { overlaps, pointSpan, rangeSpan, type DateContext } from './dates';
import { formulaOf, numberOf, spanOf, type FormulaAccess } from './values';

export interface ViewContext extends DateContext, FormulaAccess {
  /** Linked record ids through a link field (from the index). */
  linked: (field: LinkField, recordId: Id) => readonly Id[];
}

export type Predicate = (record: RecordEntity) => boolean;

const always: Predicate = () => true;

const NEGATIVE: ReadonlySet<string> = new Set([
  'notContains',
  'isNot',
  'neq',
  'notWithin',
  'isNoneOf',
  'hasNoneOf',
]);

/** The text a text operator compares (lower-cased), or undefined when empty. */
function textOf(
  record: RecordEntity,
  field: Field,
  part: FilterCondition['part'],
  ctx: ViewContext,
): string | undefined {
  if (field.type === 'formula') {
    const f = formulaOf(record, field, ctx);
    return f === null || f === '' ? undefined : String(f).toLowerCase();
  }
  const v = record.values[field.id];
  if (v === undefined) return undefined;
  if (field.type === 'location') {
    const loc = v as LocationValue;
    const text = part ? loc[part] : locationText(loc);
    return text ? text.toLowerCase() : undefined;
  }
  return typeof v === 'string' ? v.toLowerCase() : undefined;
}

function idsOf(record: RecordEntity, field: Field, ctx: ViewContext): readonly Id[] {
  if (field.type === 'link') return ctx.linked(field, record.id);
  const v = record.values[field.id];
  return Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
}

export function isEmpty(
  record: RecordEntity,
  field: Field,
  ctx: ViewContext,
  part: FilterCondition['part'],
): boolean {
  switch (field.type) {
    case 'link':
      return ctx.linked(field, record.id).length === 0;
    case 'createdTime':
    case 'modifiedTime':
      return false;
    case 'location':
      return textOf(record, field, part, ctx) === undefined;
    case 'formula': {
      const v = formulaOf(record, field, ctx);
      return v === null || v === '' || v === false;
    }
    default:
      return record.values[field.id] === undefined;
  }
}

function needsOperand(value: unknown): boolean {
  return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

/** One condition as a predicate (or `always` when it can't be applied yet). */
export function compileCondition(
  c: FilterCondition,
  fields: Readonly<Record<Id, Field>>,
  ctx: ViewContext,
): Predicate {
  const field = fields[c.fieldId];
  if (!field) return always;
  const op = c.operator as OperatorId;
  const { part } = c;
  if (op === 'isEmpty') return (r) => isEmpty(r, field, ctx, part);
  if (op === 'isNotEmpty') return (r) => !isEmpty(r, field, ctx, part);
  const checked = (r: RecordEntity) =>
    field.type === 'formula' ? formulaOf(r, field, ctx) === true : r.values[field.id] === true;
  if (op === 'isChecked') return checked;
  if (op === 'isNotChecked') return (r) => !checked(r);
  if (op === 'onThisDay') {
    const md = ctx.today.slice(5);
    return (r) => {
      const span = spanOf(r, field, ctx);
      return span !== undefined && span.start === span.end && span.start.slice(5) === md;
    };
  }
  const value = c.value;
  if (needsOperand(value)) return always;
  const negative = NEGATIVE.has(op);
  const empty = (r: RecordEntity) => isEmpty(r, field, ctx, part);
  const test = compileTest(field, op, value, ctx, part);
  if (!test) return always;
  return (r) => (empty(r) ? negative : test(r));
}

function compileTest(
  field: Field,
  op: OperatorId,
  value: unknown,
  ctx: ViewContext,
  part: FilterCondition['part'],
): Predicate | undefined {
  switch (op) {
    case 'contains':
    case 'notContains':
    case 'is':
    case 'isNot':
    case 'startsWith':
    case 'endsWith': {
      if (
        DATE_FIELD.has(field.type) ||
        (field.type === 'formula' && ctx.formulaType?.(field) === 'date')
      )
        return op === 'is' ? dateTest(field, op, value, ctx) : undefined;
      if (typeof value !== 'string') return undefined;
      const q = value.trim().toLowerCase();
      const match = (t: string) =>
        op === 'contains' || op === 'notContains'
          ? t.includes(q)
          : op === 'startsWith'
            ? t.startsWith(q)
            : op === 'endsWith'
              ? t.endsWith(q)
              : t === q;
      const negate = op === 'notContains' || op === 'isNot';
      return (r) => match(textOf(r, field, part, ctx) ?? '') !== negate;
    }
    case 'eq':
    case 'neq':
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': {
      if (typeof value !== 'number') return undefined;
      return (r) => {
        const v = numberOf(r, field, ctx);
        if (v === undefined) return op === 'neq';
        switch (op) {
          case 'eq':
            return v === value;
          case 'neq':
            return v !== value;
          case 'lt':
            return v < value;
          case 'lte':
            return v <= value;
          case 'gt':
            return v > value;
          default:
            return v >= value;
        }
      };
    }
    case 'between': {
      if (!Array.isArray(value) || value.length !== 2) return undefined;
      const [lo, hi] = (value as [number, number]).slice().sort((a, b) => a - b) as [
        number,
        number,
      ];
      return (r) => {
        const v = numberOf(r, field, ctx);
        return v !== undefined && v >= lo && v <= hi;
      };
    }
    case 'before':
    case 'after':
    case 'onOrBefore':
    case 'onOrAfter':
    case 'within':
    case 'notWithin':
      return dateTest(field, op, value, ctx);
    case 'isAnyOf':
    case 'hasAnyOf':
    case 'isNoneOf':
    case 'hasNoneOf':
    case 'hasAllOf':
    case 'isExactly': {
      if (!Array.isArray(value)) return undefined;
      const wanted = new Set(value as string[]);
      return (r) => {
        const ids = idsOf(r, field, ctx);
        switch (op) {
          case 'isAnyOf':
          case 'hasAnyOf':
            return ids.some((id) => wanted.has(id));
          case 'isNoneOf':
          case 'hasNoneOf':
            return !ids.some((id) => wanted.has(id));
          case 'hasAllOf':
            return [...wanted].every((id) => ids.includes(id));
          default:
            return ids.length === wanted.size && ids.every((id) => wanted.has(id));
        }
      };
    }
    case 'countIs':
    case 'countAtLeast':
    case 'countAtMost': {
      if (typeof value !== 'number' || field.type !== 'link') return undefined;
      return (r) => {
        const n = ctx.linked(field, r.id).length;
        return op === 'countIs' ? n === value : op === 'countAtLeast' ? n >= value : n <= value;
      };
    }
    default:
      return undefined;
  }
}

const DATE_FIELD: ReadonlySet<string> = new Set([
  'date',
  'dateTime',
  'dateRange',
  'createdTime',
  'modifiedTime',
]);

function dateTest(
  field: Field,
  op: OperatorId,
  value: unknown,
  ctx: ViewContext,
): Predicate | undefined {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return undefined;
  if (op === 'within' || op === 'notWithin') {
    const span = rangeSpan(value as DateRangeOperand, ctx);
    return (r) => {
      const v = spanOf(r, field, ctx);
      return v !== undefined && overlaps(v, span) === (op === 'within');
    };
  }
  const p = pointSpan(value as DatePoint, ctx);
  return (r) => {
    const v = spanOf(r, field, ctx);
    if (!v) return false;
    switch (op) {
      case 'is':
        return overlaps(v, p);
      case 'before':
        return v.end < p.start;
      case 'after':
        return v.start > p.end;
      case 'onOrBefore':
        return v.start <= p.end;
      case 'onOrAfter':
        return v.end >= p.start;
      default:
        return false;
    }
  };
}

/** A filter group as one predicate ("and" of nothing matches everything). */
export function compileFilter(
  group: FilterGroup | undefined,
  fields: Readonly<Record<Id, Field>>,
  ctx: ViewContext,
): Predicate {
  if (!group || group.items.length === 0) return always;
  const parts = group.items.map((item) =>
    'items' in item ? compileFilter(item, fields, ctx) : compileCondition(item, fields, ctx),
  );
  const active = parts.filter((p) => p !== always);
  if (active.length === 0) return always;
  return group.op === 'and' ? (r) => active.every((p) => p(r)) : (r) => active.some((p) => p(r));
}

/** Conditions in a filter, at any depth (for the toolbar's count). */
export function countConditions(group: FilterGroup | undefined): number {
  if (!group) return 0;
  return group.items.reduce((n, item) => n + ('items' in item ? countConditions(item) : 1), 0);
}

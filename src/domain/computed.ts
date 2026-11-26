/**
 * Computed values: formula results, worked out on demand and cached per record object (records
 * are immutable, so an edited record is a new object). A cached value is reused while the
 * fields are unchanged, today's date matches (formulas using TODAY) and, for formulas reading
 * links, the document is the same.
 */
import { fieldType } from './fields/registry';
import { locationText } from './fields/types/other';
import { EvalError, type FormulaType, type RuntimeValue } from './formulas/ast';
import { compileField, type FormulaField } from './formulas/compile';
import { evaluate } from './formulas/evaluate';
import { linkedIdsInDoc, type LinkField } from './links';
import { getRecord, type DocModel } from './model';
import { recordTitle } from './records';
import type { DateRangeValue, Field, Id, LocationValue, RecordEntity } from './schema/types';
import { timestampDate } from './views/dates';
import { partialStart } from '@/lib/partialDate';

export interface ComputeContext {
  today: string;
  /** Linked ids (the index); without it links are found by scanning. */
  linked?: ((field: LinkField, recordId: Id) => readonly Id[]) | undefined;
}

/** A formula that can't be evaluated for a record (shown as #ERR). */
export const FORMULA_ERROR = Symbol('formula error');
export type FormulaValue = RuntimeValue | typeof FORMULA_ERROR;

interface Entry {
  fields: object;
  today: string | undefined;
  doc: object | undefined;
  value: FormulaValue;
}

const cache = new WeakMap<RecordEntity, Map<Id, Entry>>();
let depth = 0;

function linkedIds(
  doc: DocModel,
  field: LinkField,
  recordId: Id,
  ctx: ComputeContext,
): readonly Id[] {
  return ctx.linked ? ctx.linked(field, recordId) : linkedIdsInDoc(doc, field, recordId);
}

/** A field's value as a formula sees it. */
function inputValue(
  doc: DocModel,
  record: RecordEntity,
  field: Field,
  ctx: ComputeContext,
): RuntimeValue {
  const v = record.values[field.id];
  switch (field.type) {
    case 'formula': {
      const result = formulaValue(doc, field, record, ctx);
      if (result === FORMULA_ERROR) throw new EvalError(`“${field.name}” has an error`);
      return result;
    }
    case 'link':
      return linkedIds(doc, field, record.id, ctx)
        .map((id) => getRecord(doc, field.config.targetCollectionId, id))
        .filter((r) => r !== undefined)
        .map((r) => recordTitle(doc, r, ctx))
        .join(', ');
    case 'createdTime':
      return timestampDate(record.createdAt);
    case 'modifiedTime':
      return timestampDate(record.updatedAt);
    case 'checkbox':
      return v === true;
    case 'number':
    case 'rating':
    case 'duration':
      return typeof v === 'number' ? v : null;
    case 'date':
      return typeof v === 'string' ? partialStart(v) : null;
    case 'dateTime':
      return typeof v === 'string' ? v.slice(0, 10) : null;
    case 'dateRange':
      return v === undefined ? null : partialStart((v as DateRangeValue).start);
    case 'location':
      return v === undefined ? null : locationText(v as LocationValue);
    default:
      return v === undefined ? null : fieldType(field).format(v, field, RAW, 'raw');
  }
}

const RAW = { locale: 'en-US', defaultCurrency: 'USD', dateStyle: 'iso' } as const;

/** A formula field's value for a record. */
export function formulaValue(
  doc: DocModel,
  field: FormulaField,
  record: RecordEntity,
  ctx: ComputeContext,
): FormulaValue {
  const compiled = compileField(doc.fields, field);
  if (!compiled.ok) return FORMULA_ERROR;
  const { info, node } = compiled;
  let byField = cache.get(record);
  const hit = byField?.get(field.id);
  if (
    hit &&
    hit.fields === doc.fields &&
    (!info.usesToday || hit.today === ctx.today) &&
    (!info.usesLinks || hit.doc === doc)
  )
    return hit.value;

  let value: FormulaValue;
  // Titles of linked records can be formulas linking back: stop runaway recursion.
  if (depth > 16) return FORMULA_ERROR;
  depth++;
  try {
    value = evaluate(node, {
      today: ctx.today,
      fields: doc.fields,
      value: (f) => inputValue(doc, record, f, ctx),
      linkCount: (f) => (f.type === 'link' ? linkedIds(doc, f, record.id, ctx).length : 0),
    });
  } catch (err) {
    if (!(err instanceof EvalError)) throw err;
    value = FORMULA_ERROR;
  } finally {
    depth--;
  }
  if (!byField) cache.set(record, (byField = new Map<Id, Entry>()));
  byField.set(field.id, {
    fields: doc.fields,
    today: info.usesToday ? ctx.today : undefined,
    doc: info.usesLinks ? doc : undefined,
    value,
  });
  return value;
}

export type { FormulaType };

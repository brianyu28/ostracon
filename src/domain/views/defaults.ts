/**
 * Values a new record takes from the filter of the view it's added from, so it stays in that
 * view: "Status is any of Reading" sets Status, "Date is within this year" sets today, "Author
 * has any of Ada" links Ada. Only conditions that every record in the view must meet count
 * (those in "and" groups, or in a group of one), and a value is kept only when its condition
 * accepts it.
 */
import { INVALID } from '../fields/model';
import { fieldType } from '../fields/registry';
import { getRecord, type DocModel } from '../model';
import type {
  DatePoint,
  Field,
  FilterCondition,
  FilterGroup,
  Id,
  RecordEntity,
  Value,
} from '../schema/types';
import { pointSpan } from './dates';
import { compileCondition, type ViewContext } from './filter';

export interface FilterDefaults {
  /** Stored values by field id. */
  values: Record<Id, Value>;
  /** Linked record ids by link field id. */
  links: Record<Id, Id[]>;
}

/** The conditions every matching record meets: "and" groups (and groups of one), at any depth. */
function requiredConditions(group: FilterGroup, out: FilterCondition[] = []): FilterCondition[] {
  if (group.op === 'or' && group.items.length !== 1) return out;
  for (const item of group.items) {
    if ('items' in item) requiredConditions(item, out);
    else out.push(item);
  }
  return out;
}

const ids = (value: unknown): Id[] | undefined =>
  Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : undefined;

const isDatePoint = (value: unknown): value is DatePoint =>
  typeof value === 'object' && value !== null && 'kind' in value;

/** The day (or partial date) a date condition suggests; checked against the condition later. */
function dateCandidate(c: FilterCondition, ctx: ViewContext): string | undefined {
  switch (c.operator) {
    case 'is': {
      if (!isDatePoint(c.value)) return undefined;
      const span = pointSpan(c.value, ctx);
      if (span.start === span.end) return span.start;
      // "is 2019-07" on a field that allows partial dates.
      return c.value.kind === 'absolute' ? c.value.date : ctx.today;
    }
    case 'within':
    case 'before':
    case 'after':
    case 'onOrBefore':
    case 'onOrAfter':
    case 'onThisDay':
      return ctx.today;
    default:
      return undefined;
  }
}

/** The value one condition suggests (record ids for links), or undefined. */
function candidate(c: FilterCondition, field: Field, ctx: ViewContext): unknown {
  const { operator: op, value } = c;
  switch (field.type) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return op === 'is' && typeof value === 'string' ? value.trim() : undefined;
    case 'location':
      return op === 'is' && c.part && typeof value === 'string'
        ? { [c.part]: value.trim() }
        : undefined;
    case 'number':
    case 'rating':
    case 'duration':
      return op === 'eq' && typeof value === 'number' ? value : undefined;
    case 'checkbox':
      return op === 'isChecked' ? true : undefined;
    case 'singleSelect': {
      const list = ids(value);
      return op === 'isAnyOf' && list?.length === 1 ? list[0] : undefined;
    }
    case 'multiSelect':
    case 'link': {
      const list = ids(value);
      if (!list?.length) return undefined;
      if (op === 'hasAnyOf') return list.length === 1 ? list : undefined;
      if (op === 'hasAllOf' || op === 'isExactly') return list;
      return undefined;
    }
    case 'date':
      return dateCandidate(c, ctx);
    case 'dateRange': {
      const day = dateCandidate(c, ctx);
      return day === undefined ? undefined : { start: day };
    }
    default:
      return undefined;
  }
}

/** The values and links a new record in a view with this filter should start with. */
export function filterDefaults(
  doc: Pick<DocModel, 'fields' | 'records'>,
  filter: FilterGroup | undefined,
  ctx: ViewContext,
): FilterDefaults {
  const out: FilterDefaults = { values: {}, links: {} };
  if (!filter) return out;
  const conditions = requiredConditions(filter);
  const raw: Record<Id, unknown> = {};
  for (const c of conditions) {
    const field = doc.fields[c.fieldId];
    if (!field) continue;
    const value = candidate(c, field, ctx);
    if (value === undefined) continue;
    const prev = raw[field.id];
    if (prev === undefined) raw[field.id] = value;
    // Conditions on different parts of one location combine.
    else if (field.type === 'location' && typeof prev === 'object' && typeof value === 'object')
      raw[field.id] = { ...prev, ...value };
  }

  for (const [fieldId, value] of Object.entries(raw)) {
    const field = doc.fields[fieldId];
    if (!field) continue;
    if (field.type === 'link') {
      if (!field.config.multiple && (value as Id[]).length > 1) continue;
      const target = field.config.targetCollectionId;
      const existing = (value as Id[]).filter((id) => getRecord(doc, target, id) !== undefined);
      if (existing.length === (value as Id[]).length) out.links[fieldId] = existing;
      continue;
    }
    const normalized = fieldType(field).normalize(value, field);
    if (normalized !== undefined && normalized !== INVALID) out.values[fieldId] = normalized;
  }

  // Keep only what the conditions accept (e.g. today isn't "last year").
  const probe: RecordEntity = {
    id: '\u0000new',
    collectionId: '',
    values: out.values,
    createdAt: '',
    updatedAt: '',
  };
  const probeCtx: ViewContext = {
    ...ctx,
    linked: (field, id) => (id === probe.id ? (out.links[field.id] ?? []) : ctx.linked(field, id)),
  };
  for (const c of conditions) {
    const has = c.fieldId in out.values || c.fieldId in out.links;
    if (!has || compileCondition(c, doc.fields, probeCtx)(probe)) continue;
    Reflect.deleteProperty(out.values, c.fieldId);
    Reflect.deleteProperty(out.links, c.fieldId);
  }
  return out;
}

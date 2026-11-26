/**
 * Table grouping: records split by one field's value, in the order the group setting asks for,
 * with the empty group last. Keys are strings (stored in `group.collapsed`).
 */
import { collator } from '../fields/model';
import { locationText } from '../fields/types/other';
import type { Field, Id, LocationValue, RecordEntity, View } from '../schema/types';
import { periodStart, valueSpan } from './dates';
import { formulaOf } from './values';
import type { ViewContext } from './filter';

export type GroupSetting = NonNullable<View['group']>;

export interface RecordGroup {
  key: string;
  records: RecordEntity[];
}

/** The key of a record's group ('' for no value). */
export function groupKey(
  record: RecordEntity,
  field: Field,
  group: GroupSetting,
  ctx: ViewContext,
): string {
  const v = record.values[field.id];
  switch (field.type) {
    case 'formula': {
      const value = formulaOf(record, field, ctx);
      if (value === null || value === '') return '';
      if (typeof value === 'boolean') return value ? 'true' : 'false';
      if (typeof value === 'number') return String(value);
      if (ctx.formulaType?.(field) === 'date') {
        const bucket = group.dateBucket;
        if (!bucket || bucket === 'day') return value;
        if (bucket === 'week') return periodStart(value, 'week', ctx.weekStartsOn);
        return bucket === 'month' ? value.slice(0, 7) : value.slice(0, 4);
      }
      return value.trim().toLowerCase();
    }
    case 'checkbox':
      return v === true ? 'true' : 'false';
    case 'link':
      return ctx.linked(field, record.id).join(',');
    case 'singleSelect':
      return typeof v === 'string' ? v : '';
    case 'multiSelect':
      return Array.isArray(v) ? v.join(',') : '';
    case 'number':
    case 'rating':
    case 'duration':
      return typeof v === 'number' ? String(v) : '';
    case 'location': {
      if (v === undefined) return '';
      const loc = v as LocationValue;
      return ((group.part ? loc[group.part] : locationText(loc)) ?? '').trim().toLowerCase();
    }
    case 'date':
    case 'dateTime':
    case 'dateRange':
    case 'createdTime':
    case 'modifiedTime': {
      const span = valueSpan(record, field);
      if (!span) return '';
      const bucket = group.dateBucket;
      if (!bucket) {
        // Without a bucket a partial date keeps its own precision ("2019", "2019-07").
        if (field.type === 'date' && typeof v === 'string') return v;
        if (field.type === 'dateRange' && v && typeof v === 'object' && 'start' in v)
          return (v as { start: string }).start;
        return span.start;
      }
      if (bucket === 'day') return span.start;
      if (bucket === 'week') return periodStart(span.start, 'week', ctx.weekStartsOn);
      return bucket === 'month' ? span.start.slice(0, 7) : span.start.slice(0, 4);
    }
    default:
      return typeof v === 'string' ? v.trim().toLowerCase() : '';
  }
}

function keyComparator(field: Field, ctx: ViewContext): (a: string, b: string) => number {
  if (field.type === 'formula' && ctx.formulaType?.(field) === 'number')
    return (a, b) => Number(a) - Number(b);
  switch (field.type) {
    case 'number':
    case 'rating':
    case 'duration':
      return (a, b) => Number(a) - Number(b);
    case 'singleSelect':
    case 'multiSelect': {
      const order = new Map<Id, number>(field.config.options.map((o, i) => [o.id, i]));
      return (a, b) => {
        const x = a.split(',').map((id) => order.get(id) ?? 1e9);
        const y = b.split(',').map((id) => order.get(id) ?? 1e9);
        for (let i = 0; i < Math.min(x.length, y.length); i++)
          if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0);
        return x.length - y.length;
      };
    }
    default:
      return (a, b) => collator.compare(a, b);
  }
}

/** Splits sorted records into groups (records keep their order within a group). */
export function groupRecords(
  records: readonly RecordEntity[],
  field: Field,
  group: GroupSetting,
  ctx: ViewContext,
): RecordGroup[] {
  const byKey = new Map<string, RecordEntity[]>();
  for (const r of records) {
    const key = groupKey(r, field, group, ctx);
    let list = byKey.get(key);
    if (!list) byKey.set(key, (list = []));
    list.push(r);
  }
  const compare = keyComparator(field, ctx);
  const dir = group.dir === 'desc' ? -1 : 1;
  const keys = [...byKey.keys()].sort((a, b) => {
    if (a === '' || b === '') return a === b ? 0 : a === '' ? 1 : -1;
    return compare(a, b) * dir;
  });
  return keys
    .filter((key) => !(key === '' && group.hideEmpty && field.type !== 'checkbox'))
    .map((key) => ({ key, records: byKey.get(key) ?? [] }));
}

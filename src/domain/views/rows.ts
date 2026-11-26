/** Ordering records by a view's sorts (empty values last, then creation order). */
import { collator } from '../fields/model';
import { fieldType } from '../fields/registry';
import { formulaOf, type FormulaAccess } from './values';
import { iterateRecords, type DocModel } from '../model';
import type { Field, Id, RecordEntity, Sort, View } from '../schema/types';

function compareCreated(a: RecordEntity, b: RecordEntity): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A sortable value: stored values, timestamps or formula results. */
function sortValue(record: RecordEntity, field: Field, ctx: FormulaAccess): unknown {
  if (field.type === 'formula') {
    const v = formulaOf(record, field, ctx);
    return v === null || v === '' ? undefined : v;
  }
  if (field.type === 'createdTime') return record.createdAt;
  if (field.type === 'modifiedTime') return record.updatedAt;
  return record.values[field.id];
}

/** Sorts records in place by the given sorts. */
export function sortRecords(
  records: RecordEntity[],
  sorts: readonly Sort[] | undefined,
  fields: Readonly<Record<Id, Field>>,
  ctx: FormulaAccess = {},
): RecordEntity[] {
  const active = (sorts ?? [])
    .map((s) => ({ field: fields[s.fieldId], dir: s.dir === 'desc' ? -1 : 1 }))
    .filter(
      (s): s is { field: Field; dir: number } =>
        s.field !== undefined &&
        (fieldType(s.field).stored || s.field.type.endsWith('Time') || s.field.type === 'formula'),
    );
  if (active.length === 0) return records.sort(compareCreated);
  // Each record's sort values are read once (formulas and timestamps aren't free), then sorted.
  const keyed = records.map((record) => ({
    record,
    keys: active.map(({ field }) => sortValue(record, field, ctx)),
  }));
  keyed.sort((a, b) => {
    for (let i = 0; i < active.length; i++) {
      const { field, dir } = active[i] as { field: Field; dir: number };
      const x = a.keys[i];
      const y = b.keys[i];
      if (x === undefined && y === undefined) continue;
      if (x === undefined) return 1;
      if (y === undefined) return -1;
      const d =
        field.type === 'formula'
          ? compareComputed(x, y)
          : field.type === 'createdTime' || field.type === 'modifiedTime'
            ? (x as string) < (y as string)
              ? -1
              : (x as string) > (y as string)
                ? 1
                : 0
            : fieldType(field).compare(x as never, y as never, field);
      if (d) return d * dir;
    }
    return compareCreated(a.record, b.record);
  });
  for (let i = 0; i < keyed.length; i++) records[i] = (keyed[i] as { record: RecordEntity }).record;
  return records;
}

/** Records of the view's collection, ordered by its sorts (no filtering). */
export function viewRecords(doc: DocModel, view: View): RecordEntity[] {
  return sortRecords([...iterateRecords(doc, view.collectionId)], view.sorts, doc.fields);
}

function compareComputed(x: unknown, y: unknown): number {
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  if (typeof x === 'boolean' && typeof y === 'boolean') return Number(x) - Number(y);
  return collator.compare(String(x), String(y));
}

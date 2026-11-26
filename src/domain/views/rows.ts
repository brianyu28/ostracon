/**
 * The records a view shows, in order. Phase 3 orders by the view's sorts (empty values last,
 * then creation order); Phase 4 adds filtering and grouping here.
 */
import { fieldType } from '../fields/registry';
import { iterateRecords, type DocModel } from '../model';
import type { Field, RecordEntity, View } from '../schema/types';

function compareCreated(a: RecordEntity, b: RecordEntity): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A sortable value: stored values, or the record's timestamps. Links and formulas sort later phases. */
function sortValue(record: RecordEntity, field: Field): unknown {
  if (field.type === 'createdTime') return record.createdAt;
  if (field.type === 'modifiedTime') return record.updatedAt;
  return record.values[field.id];
}

/** Records of the view's collection, ordered by its sorts. */
export function viewRecords(doc: DocModel, view: View): RecordEntity[] {
  const records = [...iterateRecords(doc, view.collectionId)];
  const sorts = (view.sorts ?? [])
    .map((s) => ({ field: doc.fields[s.fieldId], dir: s.dir === 'desc' ? -1 : 1 }))
    .filter(
      (s): s is { field: Field; dir: number } =>
        s.field !== undefined && (fieldType(s.field).stored || s.field.type.endsWith('Time')),
    );
  records.sort((a, b) => {
    for (const { field, dir } of sorts) {
      const x = sortValue(a, field);
      const y = sortValue(b, field);
      if (x === undefined && y === undefined) continue;
      if (x === undefined) return 1;
      if (y === undefined) return -1;
      const d =
        field.type === 'createdTime' || field.type === 'modifiedTime'
          ? (x as string) < (y as string)
            ? -1
            : (x as string) > (y as string)
              ? 1
              : 0
          : fieldType(field).compare(x as never, y as never, field);
      if (d) return d * dir;
    }
    return compareCreated(a, b);
  });
  return records;
}

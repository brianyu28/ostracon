import type { DocIndex } from '@/domain/aggregates/docIndex';
import { getRecord, type DocModel } from '@/domain/model';
import { recordTitle } from '@/domain/records';
import type { Field, Id, RecordEntity } from '@/domain/schema/types';

/** A linked record as the table shows it. */
export interface LinkedRecord {
  id: Id;
  title: string;
}

/** Reads a record's linked records through a link field (empty for other fields). */
export type LinkReader = (record: RecordEntity, field: Field) => LinkedRecord[];

/**
 * A reader over the document's links. `_version` is the index version: the index changes in
 * place, so a new reader per version lets memoized rows re-render when links change.
 */
export function linkReader(
  doc: DocModel | null,
  index: DocIndex | null,
  _version: number,
): LinkReader {
  return (record, field) => {
    if (field.type !== 'link' || !doc || !index) return [];
    const target = field.config.targetCollectionId;
    return index
      .linked(field, record.id)
      .map((id) => getRecord(doc, target, id))
      .filter((r) => r !== undefined)
      .map((r) => ({ id: r.id, title: recordTitle(doc, r) }));
  };
}

/**
 * In-memory document model. Same content as the file, but entity collections are keyed
 * by id so commands can address entities directly (and Immer patches carry the entity id
 * in their path, which makes incremental index updates cheap).
 */
import type {
  Collection,
  Field,
  FileMeta,
  FileSettings,
  Id,
  Link,
  OstraconFile,
  RecordEntity,
  Tombstone,
  View,
} from './schema/types';
import { CURRENT_SCHEMA_VERSION, FILE_FORMAT } from './schema/version';

export type EntityMap<T> = Record<Id, T>;

/**
 * Records are the entities that grow large, so they are grouped by collection and then
 * split into buckets by the first character of their id's random part. Immer copies a
 * container when one of its entries changes; with buckets, an edit copies one bucket
 * (~1/62 of one collection's records) instead of all of them. Always access records
 * through the helpers below.
 */
export type RecordBuckets = Record<string, EntityMap<RecordEntity>>;
/** collectionId → bucket → recordId → record */
export type RecordStore = Record<Id, RecordBuckets>;

const BUCKET_CHAR = 4; // "rec_" prefix is 4 chars

export function recordBucket(id: Id): string {
  return id.charAt(BUCKET_CHAR);
}

export function getRecord(
  doc: Pick<DocModel, 'records'>,
  collectionId: Id,
  id: Id,
): RecordEntity | undefined {
  return doc.records[collectionId]?.[recordBucket(id)]?.[id];
}

/** Inserts or replaces a record (works on Immer drafts). */
export function putRecord(doc: Pick<DocModel, 'records'>, r: RecordEntity): void {
  const buckets = (doc.records[r.collectionId] ??= {});
  (buckets[recordBucket(r.id)] ??= {})[r.id] = r;
}

/** Removes a record (works on Immer drafts). Returns whether it existed. */
export function removeRecord(doc: Pick<DocModel, 'records'>, collectionId: Id, id: Id): boolean {
  const bucket = doc.records[collectionId]?.[recordBucket(id)];
  if (!bucket || !(id in bucket)) return false;
  Reflect.deleteProperty(bucket, id);
  return true;
}

export function* iterateRecords(
  doc: Pick<DocModel, 'records'>,
  collectionId?: Id,
): Generator<RecordEntity> {
  const stores =
    collectionId === undefined ? Object.values(doc.records) : [doc.records[collectionId] ?? {}];
  for (const buckets of stores) {
    for (const bucket of Object.values(buckets)) yield* Object.values(bucket);
  }
}

export function countRecords(doc: Pick<DocModel, 'records'>, collectionId?: Id): number {
  let n = 0;
  const stores =
    collectionId === undefined ? Object.values(doc.records) : [doc.records[collectionId] ?? {}];
  for (const buckets of stores) {
    for (const bucket of Object.values(buckets)) n += Object.keys(bucket).length;
  }
  return n;
}

/** Model key of a link (also its tombstone id). */
export function linkKey(link: Pick<Link, 0 | 1 | 2>): string {
  return `${link[0]}|${link[1]}|${link[2]}`;
}

export interface DocModel {
  meta: FileMeta;
  settings: FileSettings;
  collections: EntityMap<Collection>;
  fields: EntityMap<Field>;
  views: EntityMap<View>;
  records: RecordStore;
  /** Keyed by `linkKey`. */
  links: Record<string, Link>;
  tombstones: Tombstone[];
}

function toMap<T extends { id: Id }>(items: readonly T[]): EntityMap<T> {
  const map: EntityMap<T> = {};
  for (const item of items) map[item.id] = item;
  return map;
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byId = (a: { id: Id }, b: { id: Id }) => compareText(a.id, b.id);
/** Collection, then order: keeps a collection's fields and views together in the file. */
const byCollectionOrder = (
  a: { collectionId: Id; order: number; id: Id },
  b: { collectionId: Id; order: number; id: Id },
) => compareText(a.collectionId, b.collectionId) || a.order - b.order || byId(a, b);

export function fileToModel(file: OstraconFile): DocModel {
  const records: RecordStore = {};
  for (const r of file.records) putRecord({ records }, r);
  const links: DocModel['links'] = {};
  for (const l of file.links) links[linkKey(l)] = l;
  return {
    meta: file.meta,
    settings: file.settings,
    collections: toMap(file.collections),
    fields: toMap(file.fields),
    views: toMap(file.views),
    records,
    links,
    tombstones: file.tombstones,
  };
}

/** Converts back to the file shape with a deterministic order (stable, diff-friendly output). */
export function modelToFile(model: DocModel): OstraconFile {
  const v = <T>(m: EntityMap<T>) => Object.values(m);
  return {
    format: FILE_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: model.meta,
    settings: model.settings,
    collections: v(model.collections).sort((a, b) => a.order - b.order || byId(a, b)),
    fields: v(model.fields).sort(byCollectionOrder),
    views: v(model.views).sort(byCollectionOrder),
    records: [...iterateRecords(model)].sort(
      (a, b) => compareText(a.collectionId, b.collectionId) || byId(a, b),
    ),
    links: Object.entries(model.links)
      .sort(([a], [b]) => compareText(a, b))
      .map(([, l]) => l),
    tombstones: [...model.tombstones].sort(byId),
  };
}

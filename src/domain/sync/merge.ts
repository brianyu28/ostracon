/**
 * Entity-level merge of two versions of a document that diverged (edited on two devices).
 *
 * With a common base (the version both started from), each entity is compared on both
 * sides:
 *   - changed on one side only → that side's version (including deletions)
 *   - changed on both → merged property by property (a record's values field by field, a
 *     select's options by id): edits to different fields both survive. Only a property changed
 *     differently on both sides is a conflict; the more recent edit (updatedAt) wins it and
 *     it's reported for review. An edit always beats a deletion (nothing is silently lost).
 * Without a base (first sync between devices), records present on one side are kept,
 * unless the other side's tombstone shows a deletion newer than the record's last edit.
 */
import { rekeyLinks } from '../links';
import {
  iterateLinks,
  iterateRecords,
  putLink,
  putRecord,
  removeLink,
  type DocModel,
  type EntityMap,
} from '../model';
import { INVALID } from '../fields/model';
import { fieldType } from '../fields/registry';
import type { Collection, Field, Id, RecordEntity } from '../schema/types';
import { repairView } from '../views/repair';

export interface MergeConflict {
  collection: string;
  id: Id;
  /** Human-readable description of the record (e.g. collection and title). */
  label: string;
  resolution: 'kept-local' | 'kept-remote' | 'kept-edit-over-delete';
  /** For records: the collection, so the review can open the record. */
  collectionId?: Id;
  /** The properties edited differently on both sides (field names for records). */
  details?: string[];
}

export interface MergeResult {
  merged: DocModel;
  conflicts: MergeConflict[];
  /** Records taken from the other device's version. */
  fromRemote: number;
}

/** Structural equality ignoring key order (records are plain JSON). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

type Labeler<T> = (item: T) => string;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isIdList = (v: unknown): v is { id: string }[] =>
  Array.isArray(v) && v.every((x) => isObject(x) && typeof x.id === 'string');

/**
 * Three-way merge of JSON values. A side that didn't change from the base gives way to the
 * other; objects merge key by key and lists of `{ id }` items (select options) item by item.
 * Anything changed differently on both sides takes the preferred side and its path is
 * recorded in `conflicts`.
 */
export function merge3(
  base: unknown,
  local: unknown,
  remote: unknown,
  prefer: 'local' | 'remote',
  path: string[] = [],
  conflicts: string[][] = [],
): unknown {
  if (deepEqual(local, remote)) return local;
  if (deepEqual(base, local)) return remote;
  if (deepEqual(base, remote)) return local;
  if (isObject(local) && isObject(remote)) {
    const b = isObject(base) ? base : {};
    const out: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const value = merge3(b[key], local[key], remote[key], prefer, [...path, key], conflicts);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }
  if (isIdList(local) && isIdList(remote)) {
    const byId = (list: unknown) =>
      new Map(isIdList(list) ? list.map((x) => [x.id, x] as const) : []);
    const b = byId(base);
    const l = byId(local);
    const r = byId(remote);
    // Local order, then items only the other side added.
    const ids = [...l.keys(), ...[...r.keys()].filter((id) => !l.has(id))];
    const out: unknown[] = [];
    for (const id of ids) {
      const value = merge3(b.get(id), l.get(id), r.get(id), prefer, [...path, id], conflicts);
      if (value !== undefined) out.push(value);
    }
    // Removed on one side and untouched on the other: removed.
    return out.filter((item) => {
      const id = (item as { id: string }).id;
      return !(
        b.has(id) &&
        (!l.has(id) || !r.has(id)) &&
        (deepEqual(b.get(id), l.get(id)) || deepEqual(b.get(id), r.get(id)))
      );
    });
  }
  conflicts.push(path);
  return prefer === 'local' ? local : remote;
}
type Stamped = { id: Id; updatedAt?: string };

/** Describes conflicting property paths for the review (e.g. record values by field name). */
type Describer<T> = (item: T, paths: string[][]) => string[];

interface Context {
  conflicts: MergeConflict[];
  fromRemote: number;
  /** Deletion times from each side's tombstones (for base-less merges). */
  deletedLocal: Map<Id, string>;
  deletedRemote: Map<Id, string>;
  hasBase: boolean;
}

function mergeMap<T extends Stamped>(
  collection: string,
  base: EntityMap<T> | undefined,
  local: EntityMap<T>,
  remote: EntityMap<T>,
  label: Labeler<T>,
  ctx: Context,
  describe?: Describer<T>,
): EntityMap<T> {
  const out: EntityMap<T> = {};
  const ids = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base ?? {})]);
  for (const id of ids) {
    const b = base?.[id];
    const l = local[id];
    const r = remote[id];
    let pick: T | undefined;
    if (!ctx.hasBase) {
      pick = l ?? r;
      if (l && r && !deepEqual(l, r)) {
        const remoteNewer = (r.updatedAt ?? '') > (l.updatedAt ?? '');
        pick = remoteNewer ? r : l;
        ctx.conflicts.push({
          collection,
          id,
          label: label(l),
          resolution: remoteNewer ? 'kept-remote' : 'kept-local',
        });
      }
      // Deleted on the other side after this side's last edit → deleted.
      const deleted = l ? ctx.deletedRemote.get(id) : ctx.deletedLocal.get(id);
      const present = l ?? r;
      if (present && !(l && r) && deleted && deleted > (present.updatedAt ?? '')) pick = undefined;
    } else {
      const localChanged = !deepEqual(b, l);
      const remoteChanged = !deepEqual(b, r);
      if (!localChanged) pick = r;
      else if (!remoteChanged || deepEqual(l, r)) pick = l;
      else if (!l || !r) {
        // Deleted on one side, edited on the other: keep the edit.
        pick = l ?? r;
        const kept = pick;
        if (kept)
          ctx.conflicts.push({
            collection,
            id,
            label: label(kept),
            resolution: 'kept-edit-over-delete',
          });
      } else {
        // Both edited: merge property by property; only real overlaps are conflicts.
        const remoteNewer = (r.updatedAt ?? '') > (l.updatedAt ?? '');
        const paths: string[][] = [];
        const merged = merge3(b, l, r, remoteNewer ? 'remote' : 'local', [], paths) as T;
        const updatedAt = [l.updatedAt, r.updatedAt].filter(Boolean).sort().at(-1);
        pick = updatedAt ? { ...merged, updatedAt } : merged;
        const real = paths.filter((p) => p[0] !== 'updatedAt');
        if (real.length)
          ctx.conflicts.push({
            collection,
            id,
            label: label(l),
            resolution: remoteNewer ? 'kept-remote' : 'kept-local',
            ...('collectionId' in l && collection === 'records'
              ? { collectionId: (l as unknown as { collectionId: Id }).collectionId }
              : {}),
            ...(describe ? { details: describe(l, real) } : {}),
          });
      }
    }
    if (pick) {
      out[id] = pick;
      if (pick !== l && !deepEqual(pick, l)) ctx.fromRemote++;
    } else if (l) {
      ctx.fromRemote++; // a remote deletion applied here
    }
  }
  return out;
}

function flattenRecords(doc: Pick<DocModel, 'records'>): EntityMap<RecordEntity> {
  const map: EntityMap<RecordEntity> = {};
  for (const r of iterateRecords(doc)) map[r.id] = r;
  return map;
}

/**
 * Links have no `updatedAt` and never change, only appear and disappear, so they merge as a
 * set: with a base, each side's additions and removals apply; without one, a link present on
 * either side is kept unless the other side deleted it after it was created.
 */
function mergeLinks(
  baseBuckets: DocModel['links'] | undefined,
  localBuckets: DocModel['links'],
  remoteBuckets: DocModel['links'],
  ctx: Context,
): DocModel['links'] {
  const flat = (links: DocModel['links']) => Object.fromEntries(iterateLinks({ links }));
  const base = baseBuckets && flat(baseBuckets);
  const local = flat(localBuckets);
  const remote = flat(remoteBuckets);
  const out: DocModel['links'] = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base ?? {})]);
  for (const key of keys) {
    const l = local[key];
    const r = remote[key];
    let keep: boolean;
    if (base) {
      const b = base[key] !== undefined;
      const localChanged = b !== (l !== undefined);
      keep = localChanged ? l !== undefined : r !== undefined;
    } else {
      const present = l ?? r;
      const deleted = l ? ctx.deletedRemote.get(key) : ctx.deletedLocal.get(key);
      keep = present !== undefined && !(!(l && r) && deleted && deleted > present[3]);
    }
    const pick = keep ? (l ?? r) : undefined;
    if (pick) putLink({ links: out }, pick);
    if ((pick !== undefined) !== (l !== undefined)) ctx.fromRemote++;
  }
  return out;
}

/** Settings are merged per field (local wins when both changed differently). */
function mergeSettings(
  base: DocModel['settings'] | undefined,
  local: DocModel['settings'],
  remote: DocModel['settings'],
) {
  const out = { ...local } as Record<string, unknown>;
  for (const key of Object.keys(remote) as (keyof DocModel['settings'])[]) {
    const changedLocally = base ? !deepEqual(base[key], local[key]) : false;
    if (!changedLocally && base && !deepEqual(base[key], remote[key])) out[key] = remote[key];
  }
  return out as DocModel['settings'];
}

export function mergeDocuments(
  base: DocModel | null,
  local: DocModel,
  remote: DocModel,
): MergeResult {
  const tombstoneMap = (doc: DocModel) => new Map(doc.tombstones.map((t) => [t.id, t.deletedAt]));
  const ctx: Context = {
    conflicts: [],
    fromRemote: 0,
    deletedLocal: tombstoneMap(local),
    deletedRemote: tombstoneMap(remote),
    hasBase: base !== null,
  };
  const b = base ?? undefined;
  const named = (x: { name: string }) => x.name;

  const collections = mergeMap(
    'collections',
    b?.collections,
    local.collections,
    remote.collections,
    named,
    ctx,
  );
  const fieldLabel = (f: Field) =>
    `${collections[f.collectionId]?.name ?? 'collection'} › ${f.name}`;
  const fieldNames = new Map(
    [...Object.values(remote.fields), ...Object.values(local.fields)].map((f) => [f.id, f.name]),
  );
  const records = mergeMap(
    'records',
    b && flattenRecords(b),
    flattenRecords(local),
    flattenRecords(remote),
    (r) => recordLabel(r, collections),
    ctx,
    (_r, paths) => [
      ...new Set(
        paths.map((p) =>
          p[0] === 'values' && p[1] ? (fieldNames.get(p[1]) ?? 'a field') : (p[0] ?? ''),
        ),
      ),
    ],
  );
  const recordStore: DocModel['records'] = {};
  for (const r of Object.values(records)) putRecord({ records: recordStore }, r);

  const merged: DocModel = {
    meta: { ...local.meta, revision: Math.max(local.meta.revision, remote.meta.revision) },
    settings: mergeSettings(b?.settings, local.settings, remote.settings),
    collections,
    fields: mergeMap('fields', b?.fields, local.fields, remote.fields, fieldLabel, ctx),
    views: mergeMap('views', b?.views, local.views, remote.views, named, ctx),
    records: recordStore,
    links: mergeLinks(b?.links, local.links, remote.links, ctx),
    tombstones: [
      ...new Map([...remote.tombstones, ...local.tombstones].map((t) => [t.id, t])).values(),
    ],
  };
  repairReferences(merged);
  return { merged, conflicts: ctx.conflicts, fromRemote: ctx.fromRemote };
}

/** "Restaurants › Cafe Luna" (the record's primary field, when it is text). */
function recordLabel(r: RecordEntity, collections: EntityMap<Collection>): string {
  const collection = collections[r.collectionId];
  const title = collection ? r.values[collection.primaryFieldId] : undefined;
  const name = typeof title === 'string' && title.trim() ? title : 'record';
  return `${collection?.name ?? 'collection'} › ${name}`;
}

/**
 * Merging can leave references to things the other device deleted (a value for a deleted
 * field, a view showing a deleted field, a link to a deleted record). Removes them so the
 * file stays valid.
 */
function repairReferences(doc: DocModel): void {
  for (const f of Object.values(doc.fields)) {
    if (!doc.collections[f.collectionId]) Reflect.deleteProperty(doc.fields, f.id);
  }
  // A link field whose target is gone can't work; one whose pair is gone becomes one-way.
  for (const f of Object.values(doc.fields)) {
    if (f.type !== 'link') continue;
    if (!doc.collections[f.config.targetCollectionId]) {
      Reflect.deleteProperty(doc.fields, f.id);
      continue;
    }
    const inverseId = f.config.inverseFieldId;
    if (inverseId !== undefined && doc.fields[inverseId]?.type !== 'link') {
      const config = { ...f.config };
      delete config.inverseFieldId;
      doc.fields[f.id] = { ...f, config };
      // Links stored under the vanished pair move to this field.
      if (inverseId < f.id) rekeyLinks(doc, inverseId, f.id, true);
    }
  }
  // Options merged from both sides: their order follows their position.
  for (const f of Object.values(doc.fields)) {
    if (f.type !== 'singleSelect' && f.type !== 'multiSelect') continue;
    if (f.config.options.every((o, i) => o.order === i)) continue;
    doc.fields[f.id] = {
      ...f,
      config: { ...f.config, options: f.config.options.map((o, i) => ({ ...o, order: i })) },
    };
  }
  for (const v of Object.values(doc.views)) {
    if (!doc.collections[v.collectionId]) Reflect.deleteProperty(doc.views, v.id);
    else {
      const repaired = repairView(v, doc.fields);
      if (repaired !== v) doc.views[v.id] = repaired;
    }
  }
  for (const collectionId of Object.keys(doc.records)) {
    if (!doc.collections[collectionId]) Reflect.deleteProperty(doc.records, collectionId);
  }
  // Values for fields that are gone or no longer fit (e.g. an option deleted on the other side).
  for (const r of iterateRecords(doc)) {
    let values: RecordEntity['values'] | null = null;
    for (const [id, value] of Object.entries(r.values)) {
      const field = doc.fields[id];
      if (field?.collectionId === r.collectionId && fieldType(field).isValid(value, field))
        continue;
      values ??= { ...r.values };
      const normalized =
        field?.collectionId === r.collectionId ? fieldType(field).normalize(value, field) : INVALID;
      if (normalized === INVALID || normalized === undefined) Reflect.deleteProperty(values, id);
      else values[id] = normalized;
    }
    if (values) putRecord(doc, { ...r, values });
  }
  const recordIds = new Set([...iterateRecords(doc)].map((r) => r.id));
  for (const [key, [fieldId, fromId, toId]] of [...iterateLinks(doc)]) {
    if (!doc.fields[fieldId] || !recordIds.has(fromId) || !recordIds.has(toId))
      removeLink(doc, key);
  }
}

/**
 * Moving collections between documents. A collection export is an ordinary Ostraca file that
 * holds only some collections, so it loads (and migrates, after a schema change) through the
 * same pipeline as a document; importing copies collections out of any loaded file.
 *
 * - `extractCollections` cuts a document down to some collections. Link fields pointing at a
 *   collection that isn't included are left out (with their links), and views are repaired, so
 *   the result is a complete, consistent document of its own.
 * - `copyCollections` gives every entity of such a document a fresh id (so importing twice, or
 *   into the document it came from, never collides) and rewrites every reference to match.
 */
import { remapRefs } from './formulas/expression';
import { canonicalFieldId, storedLink } from './links';
import { iterateLinks, iterateRecords, putLink, putRecord, type DocModel } from './model';
import type { Collection, Field, FilterGroup, Id, Link, RecordEntity, View } from './schema/types';
import { repairView } from './views/repair';

/**
 * Collections reachable from `collectionId` through link fields (in either direction), each with
 * its distance: 1 for those it links to directly. Exporting a collection with these keeps its
 * links; leaving one out drops the links to it.
 */
export function linkedCollections(
  doc: Pick<DocModel, 'fields'>,
  collectionId: Id,
): Map<Id, number> {
  const neighbours = new Map<Id, Set<Id>>();
  const connect = (a: Id, b: Id) => {
    if (a === b) return;
    (neighbours.get(a) ?? neighbours.set(a, new Set()).get(a))?.add(b);
  };
  for (const f of Object.values(doc.fields)) {
    if (f.type !== 'link') continue;
    connect(f.collectionId, f.config.targetCollectionId);
    connect(f.config.targetCollectionId, f.collectionId);
  }
  const distance = new Map<Id, number>([[collectionId, 0]]);
  const queue = [collectionId];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const next of neighbours.get(id) ?? []) {
      if (distance.has(next)) continue;
      distance.set(next, (distance.get(id) ?? 0) + 1);
      queue.push(next);
    }
  }
  distance.delete(collectionId);
  return distance;
}

/** The document cut down to the given collections (in their current order). */
export function extractCollections(doc: DocModel, collectionIds: readonly Id[]): DocModel {
  const keep = new Set(collectionIds.filter((id) => doc.collections[id]));
  const collections: DocModel['collections'] = {};
  for (const id of keep) collections[id] = doc.collections[id] as Collection;

  const fields: DocModel['fields'] = {};
  for (const f of Object.values(doc.fields)) {
    if (!keep.has(f.collectionId)) continue;
    if (f.type === 'link' && !keep.has(f.config.targetCollectionId)) continue;
    fields[f.id] = f;
  }
  const views: DocModel['views'] = {};
  for (const v of Object.values(doc.views)) {
    if (keep.has(v.collectionId)) views[v.id] = repairView(v, fields);
  }
  const records: DocModel['records'] = {};
  for (const id of keep) if (doc.records[id]) records[id] = doc.records[id];
  const links: DocModel['links'] = {};
  for (const [, link] of iterateLinks(doc)) if (fields[link[0]]) putLink({ links }, link);

  return { ...doc, collections, fields, views, records, links, tombstones: [] };
}

/** What `copyCollections` produced. */
export interface CopiedCollections {
  collections: Collection[];
  fields: Field[];
  views: View[];
  records: RecordEntity[];
  links: Link[];
}

/**
 * Every entity of `source` with fresh ids and references rewritten to them. Collections are
 * ordered after `firstOrder` and renamed when their name is in `takenNames` ("Books 2").
 * Timestamps are kept: records keep their history.
 */
export function copyCollections(
  source: DocModel,
  options: {
    newId: (kind: 'collection' | 'field' | 'view' | 'record') => Id;
    firstOrder: number;
    takenNames: ReadonlySet<string>;
  },
): CopiedCollections {
  const ids = new Map<Id, Id>();
  const fresh = (kind: 'collection' | 'field' | 'view' | 'record', id: Id) => {
    const next = options.newId(kind);
    ids.set(id, next);
    return next;
  };
  const sourceCollections = Object.values(source.collections).sort((a, b) => a.order - b.order);
  for (const c of sourceCollections) fresh('collection', c.id);
  for (const f of Object.values(source.fields)) fresh('field', f.id);
  for (const v of Object.values(source.views)) fresh('view', v.id);
  for (const r of iterateRecords(source)) fresh('record', r.id);
  /** The new id; references to anything not copied are left alone (repair drops them). */
  const id = (old: Id) => ids.get(old) ?? old;

  const taken = new Set([...options.takenNames].map((n) => n.toLowerCase()));
  const collections = sourceCollections.map((c, i): Collection => {
    let name = c.name;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${c.name} ${String(n)}`;
    taken.add(name.toLowerCase());
    return {
      ...c,
      id: id(c.id),
      name,
      order: options.firstOrder + i,
      primaryFieldId: id(c.primaryFieldId),
    };
  });

  const fields = Object.values(source.fields).map((f): Field => {
    const base = { ...f, id: id(f.id), collectionId: id(f.collectionId) };
    if (f.type === 'link') {
      const { inverseFieldId, ...config } = f.config;
      return {
        ...base,
        type: 'link',
        config: {
          ...config,
          targetCollectionId: id(f.config.targetCollectionId),
          ...(inverseFieldId === undefined ? {} : { inverseFieldId: id(inverseFieldId) }),
        },
      };
    }
    if (f.type === 'formula')
      return {
        ...base,
        type: 'formula',
        config: { ...f.config, expression: remapRefs(f.config.expression, id) },
      };
    return base;
  });
  const fieldMap = Object.fromEntries(fields.map((f) => [f.id, f]));

  const views = Object.values(source.views).map((v) =>
    repairView(remapView(v, id, id(v.id)), fieldMap),
  );

  const records = [...iterateRecords(source)].map((r): RecordEntity => ({
    ...r,
    id: id(r.id),
    collectionId: id(r.collectionId),
    values: Object.fromEntries(Object.entries(r.values).map(([k, value]) => [id(k), value])),
  }));

  // A pair is stored under its smaller field id, which may now be the other side: store each
  // link afresh from the side it was stored on.
  const links: Link[] = [];
  for (const [, [fieldId, from, to, createdAt]] of iterateLinks(source)) {
    const field = fieldMap[id(fieldId)];
    if (field?.type !== 'link') continue;
    const [canonical, a, b] = storedLink(field, id(from), id(to));
    if (canonical !== canonicalFieldId(field)) continue;
    links.push([canonical, a, b, createdAt]);
  }
  return { collections, fields, views, records, links };
}

function remapFilter(group: FilterGroup, id: (old: Id) => Id): FilterGroup {
  return {
    ...group,
    items: group.items.map((item) =>
      'items' in item ? remapFilter(item, id) : { ...item, fieldId: id(item.fieldId) },
    ),
  };
}

function remapView(v: View, id: (old: Id) => Id, newId: Id): View {
  const out: View = {
    ...v,
    id: newId,
    collectionId: id(v.collectionId),
    fields: v.fields.map((f) => ({ ...f, fieldId: id(f.fieldId) })),
  };
  if (v.filter) out.filter = remapFilter(v.filter, id);
  if (v.sorts) out.sorts = v.sorts.map((s) => ({ ...s, fieldId: id(s.fieldId) }));
  if (v.group) out.group = { ...v.group, fieldId: id(v.group.fieldId) };
  if (v.summaries)
    out.summaries = Object.fromEntries(Object.entries(v.summaries).map(([k, s]) => [id(k), s]));
  if (v.board) {
    const { cardFields, cardOrder } = v.board;
    out.board = {
      ...v.board,
      groupFieldId: id(v.board.groupFieldId),
      ...(cardFields ? { cardFields: cardFields.map(id) } : {}),
      ...(cardOrder ? { cardOrder: cardOrder.map(id) } : {}),
    };
  }
  if (v.calendar) {
    const { endFieldId, colorFieldId, cardFields } = v.calendar;
    out.calendar = {
      ...v.calendar,
      dateFieldId: id(v.calendar.dateFieldId),
      ...(endFieldId ? { endFieldId: id(endFieldId) } : {}),
      ...(colorFieldId ? { colorFieldId: id(colorFieldId) } : {}),
      ...(cardFields ? { cardFields: cardFields.map(id) } : {}),
    };
  }
  return out;
}

/** Puts copied entities into a document (works on Immer drafts). */
export function addCopied(doc: DocModel, copied: CopiedCollections): void {
  for (const c of copied.collections) doc.collections[c.id] = c;
  for (const f of copied.fields) doc.fields[f.id] = f;
  for (const v of copied.views) doc.views[v.id] = v;
  for (const r of copied.records) putRecord(doc, r);
  for (const l of copied.links) putLink(doc, l);
}

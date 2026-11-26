import type { Collection, Field, Id, View } from '../schema/types';
import { applyChanges, CommandError, defineCommand, required, tombstone } from './define';

export const createCollection = defineCommand<{ name: string; icon?: string; color?: string }, Id>({
  label: 'Add collection',
  run(draft, { name, icon, color }, { now, newId }) {
    if (!name.trim()) throw new CommandError('Collection name is required.');
    const order = Math.max(-1, ...Object.values(draft.collections).map((c) => c.order)) + 1;
    const id = newId('collection');
    const primary: Field = {
      id: newId('field'),
      collectionId: id,
      name: 'Name',
      order: 0,
      type: 'text',
      createdAt: now,
      updatedAt: now,
    };
    const view: View = {
      id: newId('view'),
      collectionId: id,
      name: 'All',
      order: 0,
      layout: 'table',
      fields: [{ fieldId: primary.id }],
      createdAt: now,
      updatedAt: now,
    };
    const collection: Collection = {
      id,
      name: name.trim(),
      order,
      primaryFieldId: primary.id,
      createdAt: now,
      updatedAt: now,
    };
    if (icon) collection.icon = icon;
    if (color) collection.color = color;
    draft.collections[id] = collection;
    draft.fields[primary.id] = primary;
    draft.views[view.id] = view;
    return id;
  },
});

export type CollectionChanges = {
  [K in 'name' | 'icon' | 'color' | 'description']?: Collection[K] | undefined;
};

export const updateCollection = defineCommand<{ id: Id; changes: CollectionChanges }>({
  label: 'Edit collection',
  run(draft, { id, changes }, { now }) {
    const collection = required(draft.collections[id], 'Collection');
    if (changes.name !== undefined && !changes.name.trim())
      throw new CommandError('Collection name is required.');
    applyChanges(collection, {
      ...changes,
      ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
      ...(changes.description !== undefined
        ? { description: changes.description.trim() || undefined }
        : {}),
    });
    collection.updatedAt = now;
  },
});

/** Sets the display order of collections to the given id order (e.g. after drag and drop). */
export const reorderCollections = defineCommand<{ ids: readonly Id[] }>({
  label: 'Reorder collections',
  run(draft, { ids }, { now }) {
    for (const id of ids) required(draft.collections[id], 'Collection');
    ids.forEach((id, order) => {
      const collection = draft.collections[id];
      if (collection && collection.order !== order) {
        collection.order = order;
        collection.updatedAt = now;
      }
    });
  },
});

/** Deletes a collection with its fields, views, records and links. */
export const deleteCollection = defineCommand<{ id: Id }>({
  label: 'Delete collection',
  run(draft, { id }, { now }) {
    required(draft.collections[id], 'Collection');
    const fieldIds = new Set<Id>();
    for (const f of Object.values(draft.fields)) {
      if (f.collectionId !== id) continue;
      fieldIds.add(f.id);
      Reflect.deleteProperty(draft.fields, f.id);
      tombstone(draft, f.id, now);
    }
    for (const v of Object.values(draft.views)) {
      if (v.collectionId !== id) continue;
      Reflect.deleteProperty(draft.views, v.id);
      tombstone(draft, v.id, now);
    }
    for (const bucket of Object.values(draft.records[id] ?? {})) {
      for (const recordId of Object.keys(bucket)) tombstone(draft, recordId, now);
    }
    Reflect.deleteProperty(draft.records, id);
    // Links on this collection's fields. (Inbound link fields from other collections are
    // removed with their pair once link fields exist, in Phase 5.)
    for (const [key, link] of Object.entries(draft.links)) {
      if (!fieldIds.has(link[0])) continue;
      Reflect.deleteProperty(draft.links, key);
      tombstone(draft, key, now);
    }
    Reflect.deleteProperty(draft.collections, id);
    tombstone(draft, id, now);
  },
});

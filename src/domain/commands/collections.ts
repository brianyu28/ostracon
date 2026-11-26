import { original } from 'immer';
import { iterateRecords, removeRecord, type DocModel } from '../model';
import type { Collection, Color, Field, Id, View } from '../schema/types';
import { applyChanges, CommandError, defineCommand, required, tombstone } from './define';
import { deleteFields } from './helpers';

export const createCollection = defineCommand<{ name: string; icon?: string; color?: Color }, Id>({
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
      config: {},
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

/**
 * Deletes a collection with its fields, views, records and links, and the link fields in other
 * collections that point at it.
 */
export const deleteCollection = defineCommand<{ id: Id }>({
  label: 'Delete collection',
  run(draft, { id }, { now }) {
    required(draft.collections[id], 'Collection');
    const base: DocModel = original(draft);
    // Link fields first, from either side, so their pairs and links go with them.
    const linkFields = Object.values(base.fields).filter(
      (f) => f.type === 'link' && (f.collectionId === id || f.config.targetCollectionId === id),
    );
    deleteFields(
      draft,
      linkFields.map((f) => f.id),
      now,
    );
    for (const f of Object.values(base.fields)) {
      if (f.collectionId !== id || f.type === 'link') continue;
      Reflect.deleteProperty(draft.fields, f.id);
      tombstone(draft, f.id, now);
    }
    for (const v of Object.values(base.views)) {
      if (v.collectionId !== id) continue;
      Reflect.deleteProperty(draft.views, v.id);
      tombstone(draft, v.id, now);
    }
    for (const record of iterateRecords(base, id)) {
      removeRecord(draft, id, record.id);
      tombstone(draft, record.id, now);
    }
    Reflect.deleteProperty(draft.records, id);
    Reflect.deleteProperty(draft.collections, id);
    tombstone(draft, id, now);
  },
});

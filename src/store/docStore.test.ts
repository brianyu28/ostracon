import { beforeEach, describe, expect, it } from 'vitest';
import { generateDemoDocument } from '@/domain/demo/generate';
import { getRecord, iterateRecords } from '@/domain/model';
import { createEmptyDocument } from '@/domain/schema/defaults';
import { CommandError } from '@/domain/commands';
import { createDocStore, selectIsDirty } from './docStore';

let store: ReturnType<typeof createDocStore>;

beforeEach(() => {
  store = createDocStore();
  store.getState().load(createEmptyDocument({ appVersion: 'test' }));
});

function addCollectionAndRecord() {
  const { dispatch } = store.getState();
  const collectionId = dispatch('createCollection', { name: 'Restaurants' });
  const nameField = store.getState().doc!.collections[collectionId]!.primaryFieldId;
  const recordId = dispatch('createRecord', {
    collectionId,
    values: { [nameField]: 'Cafe Luna' },
  });
  return { collectionId, nameField, recordId };
}

describe('docStore', () => {
  it('applies commands and returns their results', () => {
    const { collectionId, nameField, recordId } = addCollectionAndRecord();
    const { doc, index } = store.getState();
    expect(doc?.collections[collectionId]?.name).toBe('Restaurants');
    expect(getRecord(doc!, collectionId, recordId)?.values[nameField]).toBe('Cafe Luna');
    expect(index?.recordCount(collectionId)).toBe(1);
  });

  it('creates a collection with a primary field and a default view', () => {
    const { collectionId, nameField } = addCollectionAndRecord();
    const doc = store.getState().doc!;
    expect(doc.fields[nameField]).toMatchObject({ collectionId, name: 'Name', type: 'text' });
    const views = Object.values(doc.views).filter((v) => v.collectionId === collectionId);
    expect(views).toEqual([
      expect.objectContaining({ name: 'All', layout: 'table', fields: [{ fieldId: nameField }] }),
    ]);
  });

  it('tracks dirty state against the last save', () => {
    expect(selectIsDirty(store.getState())).toBe(false);
    addCollectionAndRecord();
    expect(selectIsDirty(store.getState())).toBe(true);
    store.getState().markSaved(store.getState().contentId);
    expect(selectIsDirty(store.getState())).toBe(false);
  });

  it('is clean again after undoing back to the saved state, and dirty when redone', () => {
    const { collectionId } = addCollectionAndRecord();
    const { dispatch } = store.getState();
    store.getState().markSaved(store.getState().contentId);
    dispatch('updateCollection', { id: collectionId, changes: { name: 'A' } });
    dispatch('updateCollection', { id: collectionId, changes: { name: 'B' } });
    expect(selectIsDirty(store.getState())).toBe(true);
    store.getState().undo();
    expect(selectIsDirty(store.getState())).toBe(true);
    store.getState().undo();
    expect(selectIsDirty(store.getState())).toBe(false);
    store.getState().undo(); // before the save: unsaved again
    expect(selectIsDirty(store.getState())).toBe(true);
    store.getState().redo();
    expect(selectIsDirty(store.getState())).toBe(false);
    store.getState().redo();
    expect(selectIsDirty(store.getState())).toBe(true);
  });

  it('stays dirty after undo when the file never matched (markDirty, dirty loads)', () => {
    const { collectionId } = addCollectionAndRecord();
    store.getState().markSaved(store.getState().contentId);
    store.getState().markDirty();
    store.getState().dispatch('updateCollection', { id: collectionId, changes: { name: 'X' } });
    store.getState().undo();
    expect(selectIsDirty(store.getState())).toBe(true);
    store.getState().load(store.getState().doc!, { dirty: true });
    expect(selectIsDirty(store.getState())).toBe(true);
  });

  it('undoes and redoes, keeping the index in sync', () => {
    const { collectionId, recordId } = addCollectionAndRecord();
    const { dispatch } = store.getState();
    dispatch('deleteRecords', { collectionId, ids: [recordId] });
    expect(store.getState().undoLabel).toBe('Delete records');
    expect(store.getState().index?.recordCount(collectionId)).toBe(0);

    store.getState().undo();
    expect(getRecord(store.getState().doc!, collectionId, recordId)).toBeDefined();
    expect(store.getState().index?.recordCount(collectionId)).toBe(1);

    store.getState().redo();
    expect(getRecord(store.getState().doc!, collectionId, recordId)).toBeUndefined();
    expect(store.getState().index?.recordCount(collectionId)).toBe(0);
  });

  it('clears values set to undefined rather than storing them', () => {
    const { collectionId, nameField, recordId } = addCollectionAndRecord();
    store.getState().dispatch('setRecordValues', {
      collectionId,
      id: recordId,
      values: { [nameField]: undefined },
    });
    const r = getRecord(store.getState().doc!, collectionId, recordId);
    expect(r?.values).toEqual({});
  });

  it('deletes a collection with everything in it, leaving tombstones', () => {
    store
      .getState()
      .load(generateDemoDocument({ endDate: '2026-03-31', records: 5, appVersion: 't' }));
    const doc = store.getState().doc!;
    const people = Object.values(doc.collections).find((c) => c.name === 'People')!;
    const recordIds = [...iterateRecords(doc, people.id)].map((r) => r.id);
    store.getState().dispatch('deleteCollection', { id: people.id });
    const after = store.getState().doc!;
    expect(after.collections[people.id]).toBeUndefined();
    expect(Object.values(after.fields).some((f) => f.collectionId === people.id)).toBe(false);
    expect(Object.values(after.views).some((v) => v.collectionId === people.id)).toBe(false);
    expect([...iterateRecords(after, people.id)]).toEqual([]);
    expect(store.getState().index?.recordCount(people.id)).toBe(0);
    expect(after.tombstones.map((t) => t.id)).toEqual(
      expect.arrayContaining([people.id, people.primaryFieldId, ...recordIds]),
    );
  });

  it('rejects invalid commands without changing the document', () => {
    const before = store.getState().doc;
    expect(() =>
      store.getState().dispatch('createRecord', { collectionId: 'col_missing00000' }),
    ).toThrow(CommandError);
    expect(() => store.getState().dispatch('createCollection', { name: '  ' })).toThrow(
      CommandError,
    );
    expect(store.getState().doc).toBe(before);
    expect(store.getState().undoLabel).toBeNull();
  });
});

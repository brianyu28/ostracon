/**
 * Record commands. Phase 0: values are stored as given; Phase 1 validates them against
 * each field's type and normalizes empty values away.
 */
import { original } from 'immer';
import { getRecord, putRecord, removeRecord, type DocModel } from '../model';
import type { Id, RecordEntity } from '../schema/types';
import { CommandError, defineCommand, required, tombstone } from './define';

type Values = RecordEntity['values'];

function checkFields(draft: DocModel, collectionId: Id, values: Values) {
  for (const fieldId of Object.keys(values)) {
    if (draft.fields[fieldId]?.collectionId !== collectionId)
      throw new CommandError('That field is not in this collection.');
  }
}

export const createRecord = defineCommand<{ collectionId: Id; values?: Values }, Id>({
  label: 'Add record',
  run(draft, { collectionId, values = {} }, { now, newId }) {
    required(draft.collections[collectionId], 'Collection');
    checkFields(draft, collectionId, values);
    const record: RecordEntity = {
      id: newId('record'),
      collectionId,
      values: { ...values },
      createdAt: now,
      updatedAt: now,
    };
    putRecord(draft, record);
    return record.id;
  },
});

/** Sets field values on a record; `undefined` clears a value. */
export const setRecordValues = defineCommand<{
  collectionId: Id;
  id: Id;
  values: Record<Id, unknown>;
}>({
  label: 'Edit record',
  run(draft, { collectionId, id, values }, { now }) {
    const record = required(getRecord(draft, collectionId, id), 'Record');
    checkFields(draft, collectionId, values);
    for (const [fieldId, value] of Object.entries(values)) {
      if (value === undefined) Reflect.deleteProperty(record.values, fieldId);
      else record.values[fieldId] = value;
    }
    record.updatedAt = now;
  },
});

/** Deletes records and their links. */
export const deleteRecords = defineCommand<{ collectionId: Id; ids: readonly Id[] }>({
  label: 'Delete records',
  run(draft, { collectionId, ids }, { now }) {
    for (const id of ids) required(getRecord(draft, collectionId, id), 'Record');
    const doomed = new Set(ids);
    for (const id of ids) {
      removeRecord(draft, collectionId, id);
      tombstone(draft, id, now);
    }
    const base: DocModel = original(draft);
    for (const [key, link] of Object.entries(base.links)) {
      if (!doomed.has(link[1]) && !doomed.has(link[2])) continue;
      Reflect.deleteProperty(draft.links, key);
      tombstone(draft, key, now);
    }
  },
});

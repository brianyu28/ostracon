/** Record commands. Values are normalized by their field's type; links go through `links.ts`. */
import { original, type Draft } from 'immer';
import { fieldType } from '../fields/registry';
import { INVALID } from '../fields/model';
import { linksOf, storedLinkKey, type LinkField } from '../links';
import { getRecord, putRecord, removeLink, removeRecord, type DocModel } from '../model';
import type { Field, Id, RecordEntity, Value } from '../schema/types';
import { CommandError, defineCommand, required, tombstone } from './define';
import { changeLinks, linkFieldOf } from './links';

type DraftDoc = Draft<DocModel>;

function storedField(draft: DraftDoc, collectionId: Id, fieldId: Id): Field {
  const field = draft.fields[fieldId];
  if (field?.collectionId !== collectionId)
    throw new CommandError('That field is not in this collection.');
  if (field.type === 'link') throw new CommandError('Links are edited with the link commands.');
  if (!fieldType(field).stored) throw new CommandError(`“${field.name}” is calculated.`);
  return field;
}

/** Normalizes a value for a field, or throws a user-facing error. */
function normalizeValue(field: Field, value: unknown): Value | undefined {
  const normalized = fieldType(field).normalize(value, field);
  if (normalized === INVALID)
    throw new CommandError(`That isn’t a valid value for “${field.name}”.`);
  return normalized;
}

/** Applies value changes to a record (undefined or empty clears a value). */
function applyValues(draft: DraftDoc, record: Draft<RecordEntity>, values: Record<Id, unknown>) {
  for (const [fieldId, raw] of Object.entries(values)) {
    const value = normalizeValue(storedField(draft, record.collectionId, fieldId), raw);
    if (value === undefined) Reflect.deleteProperty(record.values, fieldId);
    else record.values[fieldId] = value;
  }
}

export interface NewRecord {
  collectionId: Id;
  values?: Record<Id, unknown>;
  /** Linked records per link field. */
  links?: Record<Id, readonly Id[]>;
}

export const createRecord = defineCommand<NewRecord, Id>({
  label: 'Add record',
  run(draft, { collectionId, values = {}, links = {} }, ctx) {
    const { now, newId } = ctx;
    required(draft.collections[collectionId], 'Collection');
    const record: RecordEntity = {
      id: newId('record'),
      collectionId,
      values: {},
      createdAt: now,
      updatedAt: now,
    };
    putRecord(draft, record);
    const draftRecord = required(getRecord(draft, collectionId, record.id), 'Record');
    applyValues(draft, draftRecord, values);
    for (const [fieldId, targetIds] of Object.entries(links)) {
      const field = linkFieldOf(draft, fieldId);
      if (field.collectionId !== collectionId)
        throw new CommandError('That field is not in this collection.');
      changeLinks(draft, field, record.id, { add: targetIds }, ctx);
    }
    return record.id;
  },
});

/** Sets field values on a record; `undefined` (or an empty value) clears a value. */
export const setRecordValues = defineCommand<{
  collectionId: Id;
  id: Id;
  values: Record<Id, unknown>;
}>({
  label: 'Edit record',
  run(draft, { collectionId, id, values }, { now }) {
    const record = required(getRecord(draft, collectionId, id), 'Record');
    applyValues(draft, record, values);
    record.updatedAt = now;
  },
});

/** Sets one field to the same value on many records (bulk edit, fill down). */
export const setFieldValue = defineCommand<{
  collectionId: Id;
  ids: readonly Id[];
  fieldId: Id;
  value: unknown;
}>({
  label: 'Edit records',
  run(draft, { collectionId, ids, fieldId, value }, { now }) {
    const field = storedField(draft, collectionId, fieldId);
    const normalized = normalizeValue(field, value);
    for (const id of ids) {
      const record = required(getRecord(draft, collectionId, id), 'Record');
      if (normalized === undefined) Reflect.deleteProperty(record.values, fieldId);
      else record.values[fieldId] = structuredClone(normalized);
      record.updatedAt = now;
    }
  },
});

/**
 * Copies records with their values and links. Links whose other side is single-valued aren't
 * copied (the copy would take the link away from the original).
 */
export const duplicateRecords = defineCommand<{ collectionId: Id; ids: readonly Id[] }, Id[]>({
  label: 'Duplicate records',
  run(draft, { collectionId, ids }, ctx) {
    const { now, newId } = ctx;
    const base: DocModel = original(draft);
    const linkFields = Object.values(base.fields).filter(
      (f): f is LinkField => f.type === 'link' && f.collectionId === collectionId,
    );
    return ids.map((id) => {
      const source = required(getRecord(base, collectionId, id), 'Record');
      const copy: RecordEntity = {
        id: newId('record'),
        collectionId,
        values: structuredClone(source.values),
        createdAt: now,
        updatedAt: now,
      };
      putRecord(draft, copy);
      for (const field of linkFields) {
        const inverse = base.fields[field.config.inverseFieldId];
        if (inverse?.type !== 'link' || !inverse.config.multiple) continue;
        const targets = linksOf(base, field, id, ctx.links);
        if (targets.length) changeLinks(draft, field, copy.id, { add: targets }, ctx);
      }
      return copy.id;
    });
  },
});

/** Deletes records and their links. */
export const deleteRecords = defineCommand<{ collectionId: Id; ids: readonly Id[] }>({
  label: 'Delete records',
  run(draft, { collectionId, ids }, ctx) {
    const { now } = ctx;
    for (const id of ids) required(getRecord(draft, collectionId, id), 'Record');
    // Every link of the records, through each link field of their collection.
    const linkFields = Object.values(draft.fields).filter(
      (f): f is Draft<LinkField> => f.type === 'link' && f.collectionId === collectionId,
    );
    for (const id of ids) {
      for (const field of linkFields) {
        for (const target of linksOf(draft, field, id, ctx.links)) {
          const key = storedLinkKey(field, id, target);
          if (removeLink(draft, key)) tombstone(draft, key, now);
        }
      }
    }
    for (const id of ids) {
      removeRecord(draft, collectionId, id);
      tombstone(draft, id, now);
    }
  },
});

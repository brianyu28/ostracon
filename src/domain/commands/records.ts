/** Record commands. Values are normalized by their field's type; links go through `links.ts`. */
import { original, type Draft } from 'immer';
import { fieldType } from '../fields/registry';
import { INVALID, type ParseContext } from '../fields/model';
import { normalizeOptions, optionByName, splitMulti } from '../fields/types/select';
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

/** Sets values on many records at once (fill down, clearing a range): one undo step. */
export const editRecords = defineCommand<{
  collectionId: Id;
  updates: readonly { id: Id; values: Record<Id, unknown> }[];
}>({
  label: 'Edit records',
  run(draft, { collectionId, updates }, { now }) {
    for (const { id, values } of updates) {
      const record = required(getRecord(draft, collectionId, id), 'Record');
      applyValues(draft, record, values);
      record.updatedAt = now;
    }
  },
});

export interface TextRow {
  /** The record to change; a new record is created when absent. */
  id?: Id;
  /** Typed or pasted text per field ('' clears). */
  texts: Record<Id, string>;
}

export interface TextResult {
  /** Ids of the records created for rows without an id. */
  created: Id[];
  /** Cells whose text isn't a value of their field (left unchanged). */
  invalid: number;
  /** Select options created for names that didn't exist yet. */
  addedOptions: number;
}

/**
 * Sets values from text, parsed by each field's type, as one undo step: pasting a range, or
 * typing a new option into a select. Unknown select names become new options; text that
 * isn't a value of its field is skipped and counted. Calculated and link fields are skipped.
 */
export const setFromText = defineCommand<
  { collectionId: Id; rows: readonly TextRow[]; parse: ParseContext },
  TextResult
>({
  label: 'Edit records',
  run(draft, { collectionId, rows, parse }, { now, newId }) {
    required(draft.collections[collectionId], 'Collection');
    const result: TextResult = { created: [], invalid: 0, addedOptions: 0 };
    for (const row of rows) {
      let record: Draft<RecordEntity> | undefined;
      if (row.id === undefined) {
        const id = newId('record');
        putRecord(draft, { id, collectionId, values: {}, createdAt: now, updatedAt: now });
        result.created.push(id);
        record = getRecord(draft, collectionId, id);
      } else {
        record = getRecord(draft, collectionId, row.id);
      }
      if (!record) throw new CommandError('Record not found');
      for (const [fieldId, text] of Object.entries(row.texts)) {
        const field = draft.fields[fieldId];
        if (field?.collectionId !== collectionId)
          throw new CommandError('That field is not in this collection.');
        if (field.type === 'link' || !fieldType(field).stored) continue;
        if (field.type === 'singleSelect' || field.type === 'multiSelect') {
          const names = field.type === 'multiSelect' ? splitMulti(text) : [text.trim()];
          const missing = names.filter((n) => n && !optionByName(field.config.options, n));
          if (missing.length) {
            const config = normalizeOptions(
              { options: [...field.config.options, ...missing.map((name) => ({ name }))] },
              { settings: draft.settings, newId },
            );
            if (typeof config === 'string') {
              result.invalid++;
              continue;
            }
            field.config = config;
            result.addedOptions += missing.length;
          }
        }
        const value = fieldType(field).parse(text, field, parse);
        if (value === INVALID) {
          result.invalid++;
          continue;
        }
        if (value === undefined) Reflect.deleteProperty(record.values, fieldId);
        else record.values[fieldId] = value;
      }
      record.updatedAt = now;
    }
    return result;
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

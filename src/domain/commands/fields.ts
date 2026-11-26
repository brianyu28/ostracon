/** Field commands: create (including link pairs), edit, retype, reorder, delete. */
import { original, type Draft } from 'immer';
import { planTypeChange } from '../fields/convert';
import { fieldType } from '../fields/registry';
import { INVALID, type ConfigContext } from '../fields/model';
import { canonicalFieldId, linksOf, storedLinkKey, type LinkField } from '../links';
import { getRecord, iterateRecords, removeLink, type DocModel } from '../model';
import type { Field, FieldType, Id } from '../schema/types';
import {
  applyChanges,
  CommandError,
  defineCommand,
  required,
  tombstone,
  type CommandContext,
} from './define';
import {
  addFieldToViews,
  checkFieldName,
  deleteFields,
  fieldsOf,
  orderAfter,
  removeLinksOfFields,
  repairViews,
  uniqueFieldName,
} from './helpers';

type DraftDoc = Draft<DocModel>;

function configContext(draft: DraftDoc, ctx: CommandContext): ConfigContext {
  return { settings: draft.settings, newId: ctx.newId };
}

/** A field object with the given type and (normalized) config. */
function buildField(base: Omit<Field, 'type' | 'config'>, type: FieldType, config: unknown): Field {
  return (config === undefined ? { ...base, type } : { ...base, type, config }) as Field;
}

export interface NewField {
  collectionId: Id;
  name: string;
  type: FieldType;
  /** Type-specific options; the type's defaults when omitted. */
  config?: unknown;
  description?: string;
  required?: boolean;
  /** Place the field after this one (default: at the end). */
  afterFieldId?: Id;
  /** The view the field is added from: it is shown there (see `addFieldToViews`). */
  viewId?: Id;
}

export const createField = defineCommand<NewField, Id>({
  label: 'Add field',
  run(draft, input, ctx) {
    const { collectionId, type } = input;
    required(draft.collections[collectionId], 'Collection');
    if (type === 'link') throw new CommandError('Link fields are added with createLinkField.');
    const def = fieldType(type);
    const name = checkFieldName(draft, collectionId, input.name);
    const cctx = configContext(draft, ctx);
    const config = def.normalizeConfig(input.config ?? def.defaultConfig(cctx), cctx);
    if (typeof config === 'string') throw new CommandError(config);
    const field = buildField(
      {
        id: ctx.newId('field'),
        collectionId,
        name,
        order: orderAfter(fieldsOf(draft, collectionId), input.afterFieldId),
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
        ...(input.required ? { required: true as const } : {}),
        createdAt: ctx.now,
        updatedAt: ctx.now,
      },
      type,
      config,
    );
    draft.fields[field.id] = field;
    addFieldToViews(draft, field, ctx.now, input);
    return field.id;
  },
});

export interface NewLinkField {
  collectionId: Id;
  name: string;
  targetCollectionId: Id;
  /** Name of the paired field on the target (default: this collection's name). */
  inverseName?: string;
  /** Each record links to many target records (default: true). */
  multiple?: boolean;
  /** Each target record links back to many records (default: true). */
  inverseMultiple?: boolean;
  /** One field linking records of the same collection both ways (e.g. Friends). */
  symmetric?: boolean;
  afterFieldId?: Id;
  viewId?: Id;
}

/** Creates a link field and its paired field on the target collection (one field if symmetric). */
export const createLinkField = defineCommand<NewLinkField, { fieldId: Id; inverseFieldId: Id }>({
  label: 'Add link field',
  run(draft, input, { now, newId }) {
    const source = required(draft.collections[input.collectionId], 'Collection');
    required(draft.collections[input.targetCollectionId], 'Linked collection');
    const symmetric = input.symmetric === true;
    if (symmetric && input.targetCollectionId !== input.collectionId)
      throw new CommandError('A two-way link within one field must link a collection to itself.');
    const name = checkFieldName(draft, input.collectionId, input.name);
    const id = newId('field');
    const inverseId = symmetric ? id : newId('field');
    const multiple = input.multiple !== false;
    const stamps = { createdAt: now, updatedAt: now };
    const field: Field = {
      id,
      collectionId: input.collectionId,
      name,
      order: orderAfter(fieldsOf(draft, input.collectionId), input.afterFieldId),
      type: 'link',
      config: {
        targetCollectionId: input.targetCollectionId,
        inverseFieldId: inverseId,
        ...(multiple ? { multiple: true as const } : {}),
      },
      ...stamps,
    };
    draft.fields[id] = field;
    addFieldToViews(draft, field, now, input);
    if (!symmetric) {
      const inverseName = input.inverseName?.trim()
        ? checkFieldName(draft, input.targetCollectionId, input.inverseName)
        : uniqueFieldName(draft, input.targetCollectionId, source.name);
      const inverse: Field = {
        id: inverseId,
        collectionId: input.targetCollectionId,
        name: inverseName,
        order: orderAfter(fieldsOf(draft, input.targetCollectionId)),
        type: 'link',
        config: {
          targetCollectionId: input.collectionId,
          inverseFieldId: id,
          ...(input.inverseMultiple !== false ? { multiple: true as const } : {}),
        },
        ...stamps,
      };
      draft.fields[inverseId] = inverse;
      addFieldToViews(draft, inverse, now);
    }
    return { fieldId: id, inverseFieldId: inverseId };
  },
});

export interface FieldChanges {
  name?: string;
  description?: string | undefined;
  required?: boolean | undefined;
  /** The type's full configuration (for links: `{ multiple }` only). */
  config?: unknown;
}

/** Removes values the field's new configuration can't hold (and re-normalizes the rest). */
function revalidateValues(draft: DraftDoc, field: Field): void {
  const def = fieldType(field);
  if (!def.stored) return;
  const base: DocModel = original(draft);
  for (const record of iterateRecords(base, field.collectionId)) {
    const value = record.values[field.id];
    if (value === undefined || def.isValid(value, field)) continue;
    const target = getRecord(draft, field.collectionId, record.id);
    if (!target) continue;
    const normalized = def.normalize(value, field);
    if (normalized === INVALID || normalized === undefined)
      Reflect.deleteProperty(target.values, field.id);
    else target.values[field.id] = normalized;
  }
}

/** Keeps only each record's oldest link when a link side becomes single-valued. */
function trimToSingleLinks(draft: DraftDoc, field: LinkField, ctx: CommandContext): void {
  const base: DocModel = original(draft);
  for (const record of iterateRecords(base, field.collectionId)) {
    const linked = linksOf(base, field, record.id, ctx.links);
    for (const targetId of linked.slice(1)) {
      const key = storedLinkKey(field, record.id, targetId);
      if (removeLink(draft, key)) tombstone(draft, key, ctx.now);
    }
  }
}

/** Applies name, description and required changes. */
function applyBasicChanges(
  draft: DraftDoc,
  field: Draft<Field>,
  changes: Omit<FieldChanges, 'config'>,
): void {
  if (changes.name !== undefined)
    field.name = checkFieldName(draft, field.collectionId, changes.name, field.id);
  applyChanges(field, {
    ...(changes.description !== undefined || 'description' in changes
      ? { description: changes.description?.trim() || undefined }
      : {}),
    ...(changes.required !== undefined || 'required' in changes
      ? { required: changes.required ? (true as const) : undefined }
      : {}),
  });
}

export const updateField = defineCommand<{ id: Id; changes: FieldChanges }>({
  label: 'Edit field',
  run(draft, { id, changes }, ctx) {
    const field = required(draft.fields[id], 'Field');
    applyBasicChanges(draft, field, changes);
    if (changes.config !== undefined) {
      if (field.type === 'link') {
        const multiple = (changes.config as { multiple?: unknown }).multiple;
        if (typeof multiple !== 'boolean') throw new CommandError('Invalid link options.');
        if (multiple) field.config.multiple = true;
        else if (field.config.multiple) {
          Reflect.deleteProperty(field.config, 'multiple');
          trimToSingleLinks(draft, field, ctx);
        }
      } else {
        const cctx = configContext(draft, ctx);
        const config = fieldType(field).normalizeConfig(changes.config, cctx);
        if (typeof config === 'string') throw new CommandError(config);
        (field as { config?: unknown }).config = config;
        revalidateValues(draft, field);
      }
      repairViews(draft, field.collectionId, ctx.now);
    }
    field.updatedAt = ctx.now;
  },
});

/**
 * Changes a field's type, converting every value (see `planTypeChange`, which the UI also uses
 * to preview the change). A link field's paired field and links are removed.
 */
export const changeFieldType = defineCommand<
  {
    id: Id;
    type: FieldType;
    config?: unknown;
    /** Name, description and required changes made together with the type change. */
    changes?: Omit<FieldChanges, 'config'>;
  },
  { converted: number; lost: number }
>({
  label: 'Change field type',
  run(draft, { id, type, config, changes }, ctx) {
    const field = required(draft.fields[id], 'Field');
    const base: DocModel = original(draft);
    const before = base.fields[id] ?? field;
    const plan = planTypeChange(base, before, type, config, {
      settings: base.settings,
      newId: ctx.newId,
      now: ctx.now,
      ...(ctx.links ? { links: ctx.links.index } : {}),
    });
    if (typeof plan === 'string') throw new CommandError(plan);
    if (before.type === 'link') {
      // The links go (their titles were converted above), and so does the paired field.
      removeLinksOfFields(draft, new Set([canonicalFieldId(before)]), ctx.now);
      const inverse = draft.fields[before.config.inverseFieldId];
      if (inverse && inverse.id !== id) {
        Reflect.deleteProperty(draft.fields, inverse.id);
        tombstone(draft, inverse.id, ctx.now);
        repairViews(draft, inverse.collectionId, ctx.now);
      }
    }
    draft.fields[id] = { ...plan.field, updatedAt: ctx.now };
    if (changes) applyBasicChanges(draft, draft.fields[id], changes);
    for (const [recordId, value] of plan.values) {
      const record = getRecord(draft, before.collectionId, recordId);
      if (!record) continue;
      if (value === undefined) Reflect.deleteProperty(record.values, id);
      else record.values[id] = value;
    }
    repairViews(draft, before.collectionId, ctx.now);
    return { converted: plan.converted, lost: plan.lost };
  },
});

/** Sets the order of a collection's fields to the given id order. */
export const reorderFields = defineCommand<{ collectionId: Id; ids: readonly Id[] }>({
  label: 'Reorder fields',
  run(draft, { collectionId, ids }, { now }) {
    for (const id of ids) {
      if (draft.fields[id]?.collectionId !== collectionId)
        throw new CommandError('Field not found');
    }
    ids.forEach((id, order) => {
      const field = draft.fields[id];
      if (field && field.order !== order) {
        field.order = order;
        field.updatedAt = now;
      }
    });
  },
});

/** Deletes a field and its values (a link field together with its pair and links). */
export const deleteField = defineCommand<{ id: Id }>({
  label: 'Delete field',
  run(draft, { id }, { now }) {
    const field = required(draft.fields[id], 'Field');
    if (draft.collections[field.collectionId]?.primaryFieldId === id)
      throw new CommandError(
        'The primary field can’t be deleted. Make another field primary first.',
      );
    if (field.type === 'link') {
      const inverse = draft.fields[field.config.inverseFieldId];
      if (inverse && draft.collections[inverse.collectionId]?.primaryFieldId === inverse.id)
        throw new CommandError('The linked field is a primary field.');
    }
    deleteFields(draft, [id], now);
  },
});

/** Makes a text or formula field the collection's primary (title) field. */
export const setPrimaryField = defineCommand<{ collectionId: Id; fieldId: Id }>({
  label: 'Set primary field',
  run(draft, { collectionId, fieldId }, { now }) {
    const collection = required(draft.collections[collectionId], 'Collection');
    const field = required(draft.fields[fieldId], 'Field');
    if (field.collectionId !== collectionId) throw new CommandError('Field not found');
    if (!fieldType(field).canBePrimary)
      throw new CommandError('The primary field must be text or a formula.');
    collection.primaryFieldId = fieldId;
    collection.updatedAt = now;
  },
});

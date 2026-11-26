/**
 * Link commands. Cardinality is kept on both sides: linking to a target whose side of the pair
 * is single-valued moves that target off whatever it was linked to before.
 */
import type { Draft } from 'immer';
import {
  isSymmetric,
  linksOf,
  linkTimestamp,
  storedLink,
  storedLinkKey,
  type LinkField,
} from '../links';
import { getRecord, putLink, removeLink, type DocModel } from '../model';
import type { Id } from '../schema/types';
import { CommandError, defineCommand, required, tombstone, type CommandContext } from './define';

type DraftDoc = Draft<DocModel>;

export function linkFieldOf(draft: DraftDoc, fieldId: Id): LinkField {
  const field = required(draft.fields[fieldId], 'Field');
  if (field.type !== 'link') throw new CommandError('That field doesn’t link records.');
  return field;
}

function inverseOf(draft: DraftDoc, field: LinkField): LinkField {
  if (isSymmetric(field)) return field;
  const inverse = draft.fields[field.config.inverseFieldId];
  if (inverse?.type !== 'link') throw new CommandError('The linked field is missing.');
  return inverse;
}

function unlink(draft: DraftDoc, field: LinkField, recordId: Id, targetId: Id, now: string): void {
  const key = storedLinkKey(field, recordId, targetId);
  if (removeLink(draft, key)) tombstone(draft, key, now);
}

/**
 * Adds and removes links of one record through one link field, keeping both sides' cardinality.
 * Targets must be records of the field's target collection.
 */
export function changeLinks(
  draft: DraftDoc,
  field: LinkField,
  recordId: Id,
  change: { add?: readonly Id[]; remove?: readonly Id[] },
  ctx: Pick<CommandContext, 'now' | 'links'>,
): void {
  const { now } = ctx;
  required(getRecord(draft, field.collectionId, recordId), 'Record');
  const targetCollection = field.config.targetCollectionId;
  for (const targetId of change.remove ?? []) unlink(draft, field, recordId, targetId, now);

  const add = [...new Set(change.add ?? [])];
  if (add.length === 0) return;
  for (const targetId of add) {
    required(getRecord(draft, targetCollection, targetId), 'Linked record');
    if (targetId === recordId) throw new CommandError('A record can’t link to itself.');
  }
  if (!field.config.multiple && add.length > 1)
    throw new CommandError('This field links to one record only.');

  const current = new Set(linksOf(draft, field, recordId, ctx.links));
  // A single-valued side replaces what it had.
  if (!field.config.multiple) {
    for (const old of current) if (!add.includes(old)) unlink(draft, field, recordId, old, now);
  }
  const inverse = inverseOf(draft, field);
  let added = 0;
  for (const targetId of add) {
    if (current.has(targetId)) continue;
    // The target's side is single-valued: it leaves its previous record.
    if (!inverse.config.multiple) {
      for (const previous of linksOf(draft, inverse, targetId, ctx.links)) {
        if (previous !== recordId) unlink(draft, inverse, targetId, previous, now);
      }
    }
    const [fieldId, fromId, toId] = storedLink(field, recordId, targetId);
    const key = putLink(draft, [fieldId, fromId, toId, linkTimestamp(now, added++)]);
    ctx.links?.added.add(key);
  }
}

/** Makes `targetIds` exactly the records linked to `recordId` through `fieldId`. */
export const setLinks = defineCommand<{ fieldId: Id; recordId: Id; targetIds: readonly Id[] }>({
  label: 'Edit links',
  run(draft, { fieldId, recordId, targetIds }, ctx) {
    const field = linkFieldOf(draft, fieldId);
    const keep = new Set(targetIds);
    const remove = linksOf(draft, field, recordId, ctx.links).filter((id) => !keep.has(id));
    changeLinks(draft, field, recordId, { add: targetIds, remove }, ctx);
  },
});

export const addLinks = defineCommand<{ fieldId: Id; recordId: Id; targetIds: readonly Id[] }>({
  label: 'Link records',
  run(draft, { fieldId, recordId, targetIds }, ctx) {
    changeLinks(draft, linkFieldOf(draft, fieldId), recordId, { add: targetIds }, ctx);
  },
});

export const removeLinks = defineCommand<{ fieldId: Id; recordId: Id; targetIds: readonly Id[] }>({
  label: 'Unlink records',
  run(draft, { fieldId, recordId, targetIds }, ctx) {
    changeLinks(draft, linkFieldOf(draft, fieldId), recordId, { remove: targetIds }, ctx);
  },
});

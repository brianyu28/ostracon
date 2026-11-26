/** Helpers shared by the schema and record commands (they all work on Immer drafts). */
import { current, isDraft, type Draft } from 'immer';
import { canonicalFieldId, parseLinkKey } from '../links';
import { iterateLinks, removeLink, type DocModel } from '../model';
import type { Field, Id, View } from '../schema/types';
import { collectionFields, repairView } from '../views/repair';
import { CommandError, tombstone } from './define';

type DraftDoc = Draft<DocModel>;

/** A plain snapshot of a draft value (or the value itself when it isn't a draft). */
export function snapshot<T>(value: T): T {
  return isDraft(value) ? current<T>(value as Draft<T>) : value;
}

/** An `order` between two neighbors (either may be missing), so a move edits one entity. */
export function orderBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 0;
  if (before === undefined) return (after ?? 0) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/** The order for an item placed after `afterId` in `items` (sorted by order), or at the end. */
export function orderAfter(items: readonly { id: Id; order: number }[], afterId?: Id): number {
  if (afterId === undefined) return orderBetween(items.at(-1)?.order, undefined);
  const index = items.findIndex((i) => i.id === afterId);
  if (index === -1) throw new CommandError('Field not found');
  return orderBetween(items[index]?.order, items[index + 1]?.order);
}

export function viewsOf(draft: DraftDoc, collectionId: Id): Draft<View>[] {
  return Object.values(draft.views)
    .filter((v) => v.collectionId === collectionId)
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
}

/** Trims a field name and checks it is unique in its collection (case-insensitive). */
export function checkFieldName(
  draft: DraftDoc,
  collectionId: Id,
  name: string,
  exceptId?: Id,
): string {
  const trimmed = name.trim();
  if (!trimmed) throw new CommandError('Field name is required.');
  if (trimmed.length > 200) throw new CommandError('Field names can be up to 200 characters.');
  const taken = Object.values(draft.fields).some(
    (f) =>
      f.collectionId === collectionId &&
      f.id !== exceptId &&
      f.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (taken) throw new CommandError(`There’s already a field named “${trimmed}”.`);
  return trimmed;
}

/** A unique field name based on `name` ("People", "People 2", …). */
export function uniqueFieldName(draft: DraftDoc, collectionId: Id, name: string): string {
  const names = new Set(
    Object.values(draft.fields)
      .filter((f) => f.collectionId === collectionId)
      .map((f) => f.name.toLowerCase()),
  );
  let candidate = name.trim() || 'Field';
  for (let n = 2; names.has(candidate.toLowerCase()); n++)
    candidate = `${name.trim()} ${String(n)}`;
  return candidate;
}

/**
 * Adds a new field to its collection's views: visible (after `afterFieldId`, or at the end) in
 * the view it was added from and in the collection's first view; hidden at the end elsewhere.
 */
export function addFieldToViews(
  draft: DraftDoc,
  field: Field,
  now: string,
  options: { viewId?: Id | undefined; afterFieldId?: Id | undefined } = {},
): void {
  const views = viewsOf(draft, field.collectionId);
  views.forEach((view, i) => {
    const visible = i === 0 || view.id === options.viewId;
    const entry = visible ? { fieldId: field.id } : { fieldId: field.id, hidden: true as const };
    const after = visible ? view.fields.findIndex((f) => f.fieldId === options.afterFieldId) : -1;
    if (after === -1) view.fields.push(entry);
    else view.fields.splice(after + 1, 0, entry);
    view.updatedAt = now;
  });
}

/** Repairs every view of a collection after its fields changed (see `repairView`). */
export function repairViews(draft: DraftDoc, collectionId: Id, now: string): void {
  const fields = snapshot(draft.fields);
  for (const view of viewsOf(draft, collectionId)) {
    const plain = snapshot(view);
    const repaired = repairView(plain, fields);
    if (repaired !== plain) draft.views[view.id] = { ...repaired, updatedAt: now };
  }
}

/** Removes every link stored under the given canonical field ids (with tombstones). */
export function removeLinksOfFields(draft: DraftDoc, fieldIds: ReadonlySet<Id>, now: string): void {
  if (fieldIds.size === 0) return;
  // Read keys from a plain snapshot (fast) and delete through the draft.
  for (const [key] of iterateLinks({ links: snapshot(draft.links) })) {
    if (!fieldIds.has(parseLinkKey(key)[0])) continue;
    removeLink(draft, key);
    tombstone(draft, key, now);
  }
}

/**
 * Deletes fields (and, for link fields, their inverse fields and links), removing their values
 * from records and repairing the affected views. Record `updatedAt` stays as it was: a schema
 * change isn't an edit of the record.
 */
export function deleteFields(draft: DraftDoc, ids: readonly Id[], now: string): void {
  const doomed = new Set<Id>();
  const linkCanonicals = new Set<Id>();
  for (const id of ids) {
    const field = draft.fields[id];
    if (!field) continue;
    doomed.add(id);
    if (field.type === 'link') {
      if (field.config.inverseFieldId !== undefined) doomed.add(field.config.inverseFieldId);
      linkCanonicals.add(canonicalFieldId(field));
    }
  }
  const collections = new Set<Id>();
  for (const id of doomed) {
    const field = draft.fields[id];
    if (!field) continue;
    collections.add(field.collectionId);
    if (field.type !== 'link') {
      for (const bucket of Object.values(draft.records[field.collectionId] ?? {})) {
        for (const record of Object.values(bucket)) {
          if (id in record.values) Reflect.deleteProperty(record.values, id);
        }
      }
    }
    Reflect.deleteProperty(draft.fields, id);
    tombstone(draft, id, now);
  }
  removeLinksOfFields(draft, linkCanonicals, now);
  for (const collectionId of collections) repairViews(draft, collectionId, now);
}

/** A collection's fields in order (from a draft). */
export function fieldsOf(draft: DraftDoc, collectionId: Id): Field[] {
  return collectionFields(snapshot(draft.fields), collectionId);
}

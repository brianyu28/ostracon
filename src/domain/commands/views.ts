/** View commands: create, configure, reorder, duplicate, delete. */
import type { Draft } from 'immer';
import { BOARD_GROUP_TYPES, CALENDAR_DATE_TYPES } from '../fields/registry';
import type { DocModel } from '../model';
import type { Id, View, ViewField, ViewLayout } from '../schema/types';
import { repairView } from '../views/repair';
import { CommandError, defineCommand, required, tombstone } from './define';
import { fieldsOf, orderAfter, snapshot, viewsOf } from './helpers';

type DraftDoc = Draft<DocModel>;

/** Board or calendar options for a layout, picking the first usable field. */
function layoutOptions(draft: DraftDoc, collectionId: Id, layout: ViewLayout): Partial<View> {
  const fields = fieldsOf(draft, collectionId);
  if (layout === 'board') {
    const group = fields.find((f) => BOARD_GROUP_TYPES.has(f.type));
    if (!group)
      throw new CommandError(
        'A board needs a single select, checkbox or rating field to group by.',
      );
    return { board: { groupFieldId: group.id } };
  }
  if (layout === 'calendar') {
    const date = fields.find((f) => CALENDAR_DATE_TYPES.has(f.type));
    if (!date) throw new CommandError('A calendar needs a date field.');
    return { calendar: { dateFieldId: date.id } };
  }
  return {};
}

function checkName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new CommandError('View name is required.');
  return trimmed.slice(0, 200);
}

export const createView = defineCommand<
  { collectionId: Id; name: string; layout: ViewLayout; afterViewId?: Id },
  Id
>({
  label: 'Add view',
  run(draft, { collectionId, name, layout, afterViewId }, { now, newId }) {
    required(draft.collections[collectionId], 'Collection');
    const view: View = {
      id: newId('view'),
      collectionId,
      name: checkName(name),
      order: orderAfter(viewsOf(draft, collectionId), afterViewId),
      layout,
      fields: fieldsOf(draft, collectionId).map((f) => ({ fieldId: f.id })),
      ...layoutOptions(draft, collectionId, layout),
      createdAt: now,
      updatedAt: now,
    };
    draft.views[view.id] = view;
    return view.id;
  },
});

export const duplicateView = defineCommand<{ id: Id }, Id>({
  label: 'Duplicate view',
  run(draft, { id }, { now, newId }) {
    const source = snapshot(required(draft.views[id], 'View'));
    const copy: View = {
      ...structuredClone(source),
      id: newId('view'),
      name: `${source.name} copy`.slice(0, 200),
      order: orderAfter(viewsOf(draft, source.collectionId), id),
      createdAt: now,
      updatedAt: now,
    };
    draft.views[copy.id] = copy;
    return copy.id;
  },
});

/** View settings; `undefined` removes a setting. */
export type ViewChanges = Partial<
  Pick<View, 'name' | 'layout' | 'filter' | 'sorts' | 'group' | 'summaries' | 'board' | 'calendar'>
>;

export const updateView = defineCommand<{ id: Id; changes: ViewChanges }>({
  label: 'Edit view',
  run(draft, { id, changes }, { now }) {
    const view = snapshot(required(draft.views[id], 'View'));
    const next: View = { ...view };
    for (const [key, value] of Object.entries(changes) as [keyof ViewChanges, unknown][]) {
      if (value === undefined) Reflect.deleteProperty(next, key);
      else (next as Record<string, unknown>)[key] = structuredClone(value);
    }
    if (changes.name !== undefined) next.name = checkName(changes.name);
    if (next.layout === 'board' && !next.board)
      Object.assign(next, layoutOptions(draft, view.collectionId, 'board'));
    if (next.layout === 'calendar' && !next.calendar)
      Object.assign(next, layoutOptions(draft, view.collectionId, 'calendar'));
    // Settings must refer to usable fields of this collection: anything repair would change
    // was invalid input.
    if (repairView(next, snapshot(draft.fields)) !== next)
      throw new CommandError('That view setting refers to a field that can’t be used there.');
    draft.views[id] = { ...next, updatedAt: now };
  },
});

/**
 * Sets the view's field order, visibility and widths. Fields of the collection missing from
 * the list are kept, hidden, at the end, so a view always covers every field.
 */
export const setViewFields = defineCommand<{ id: Id; fields: readonly ViewField[] }>({
  label: 'Edit view fields',
  run(draft, { id, fields }, { now }) {
    const view = required(draft.views[id], 'View');
    const all = fieldsOf(draft, view.collectionId);
    const valid = new Set(all.map((f) => f.id));
    const seen = new Set<Id>();
    const list: ViewField[] = [];
    for (const f of fields) {
      if (!valid.has(f.fieldId)) throw new CommandError('Field not found');
      if (seen.has(f.fieldId)) continue;
      seen.add(f.fieldId);
      const entry: ViewField = { fieldId: f.fieldId };
      if (f.hidden) entry.hidden = true;
      if (f.width !== undefined) entry.width = Math.round(Math.min(2000, Math.max(40, f.width)));
      list.push(entry);
    }
    for (const f of all) if (!seen.has(f.id)) list.push({ fieldId: f.id, hidden: true });
    view.fields = list;
    view.updatedAt = now;
  },
});

export const reorderViews = defineCommand<{ collectionId: Id; ids: readonly Id[] }>({
  label: 'Reorder views',
  run(draft, { collectionId, ids }, { now }) {
    for (const id of ids) {
      if (draft.views[id]?.collectionId !== collectionId) throw new CommandError('View not found');
    }
    ids.forEach((id, order) => {
      const view = draft.views[id];
      if (view && view.order !== order) {
        view.order = order;
        view.updatedAt = now;
      }
    });
  },
});

export const deleteView = defineCommand<{ id: Id }>({
  label: 'Delete view',
  run(draft, { id }, { now }) {
    const view = required(draft.views[id], 'View');
    if (viewsOf(draft, view.collectionId).length <= 1)
      throw new CommandError('A collection needs at least one view.');
    Reflect.deleteProperty(draft.views, id);
    tombstone(draft, id, now);
  },
});

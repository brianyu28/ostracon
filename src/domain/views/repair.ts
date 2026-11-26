/**
 * Keeps views consistent with their collection's fields. When a field is deleted or changes
 * type, views may refer to it in ways that no longer make sense (a filter operator the new
 * type lacks, a board grouped by a field that's gone). `repairView` returns the view with those
 * references removed or replaced, or the same object when nothing needed fixing.
 */
import { operatorsFor, summariesFor } from '../fields/dynamic';
import { BOARD_GROUP_TYPES, CALENDAR_DATE_TYPES } from '../fields/registry';
import type { EntityMap } from '../model';
import type { Field, FilterCondition, FilterGroup, Id, View } from '../schema/types';

/** Fields of a collection in their order. */
export function collectionFields(fields: EntityMap<Field>, collectionId: Id): Field[] {
  return Object.values(fields)
    .filter((f) => f.collectionId === collectionId)
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
}

function conditionValid(c: FilterCondition, fields: EntityMap<Field>, collectionId: Id): boolean {
  const field = fields[c.fieldId];
  if (field?.collectionId !== collectionId) return false;
  if (c.part !== undefined && field.type !== 'location') return false;
  return Object.hasOwn(operatorsFor(field, fields), c.operator);
}

/** The filter without invalid conditions or empty nested groups (undefined when nothing is left). */
export function repairFilter(
  group: FilterGroup,
  fields: EntityMap<Field>,
  collectionId: Id,
  depth = 0,
): FilterGroup | undefined {
  let changed = false;
  const items: FilterGroup['items'] = [];
  for (const item of group.items) {
    if ('items' in item) {
      const repaired = depth < 2 ? repairFilter(item, fields, collectionId, depth + 1) : undefined;
      if (repaired !== item) changed = true;
      if (repaired) items.push(repaired);
    } else if (conditionValid(item, fields, collectionId)) {
      items.push(item);
    } else {
      changed = true;
    }
  }
  if (items.length === 0 && depth > 0) return undefined;
  if (items.length === 0) return group.items.length === 0 ? group : undefined;
  return changed ? { ...group, items } : group;
}

/** The first field of the collection whose type is one of `types`. */
function firstFieldOfTypes(
  fields: EntityMap<Field>,
  collectionId: Id,
  types: ReadonlySet<string>,
): Field | undefined {
  return collectionFields(fields, collectionId).find((f) => types.has(f.type));
}

export function repairView(view: View, fields: EntityMap<Field>): View {
  const inCollection = (id: Id) => fields[id]?.collectionId === view.collectionId;
  let next = view;
  const edit = (patch: Partial<View>) => {
    next = { ...next, ...patch };
  };
  const drop = (key: keyof View) => {
    if (key in next) {
      const copy = { ...next };
      Reflect.deleteProperty(copy, key);
      next = copy;
    }
  };

  if (view.fields.some((f) => !inCollection(f.fieldId))) {
    edit({ fields: view.fields.filter((f) => inCollection(f.fieldId)) });
  }
  if (view.filter) {
    const filter = repairFilter(view.filter, fields, view.collectionId);
    if (filter === undefined) drop('filter');
    else if (filter !== view.filter) edit({ filter });
  }
  if (view.sorts?.some((s) => !inCollection(s.fieldId))) {
    const sorts = view.sorts.filter((s) => inCollection(s.fieldId));
    if (sorts.length) edit({ sorts });
    else drop('sorts');
  }
  if (view.group && !inCollection(view.group.fieldId)) drop('group');
  if (view.summaries) {
    const entries = Object.entries(view.summaries).filter(([id, summary]) => {
      const field = fields[id];
      return (
        field?.collectionId === view.collectionId && summariesFor(field, fields).includes(summary)
      );
    });
    if (entries.length !== Object.keys(view.summaries).length) {
      if (entries.length) edit({ summaries: Object.fromEntries(entries) });
      else drop('summaries');
    }
  }
  if (view.board) {
    const board = repairBoard(view.board, fields, view.collectionId);
    if (board === null) {
      drop('board');
      if (next.layout === 'board') edit({ layout: 'table' });
    } else if (board !== view.board) edit({ board });
  }
  if (view.calendar) {
    const calendar = repairCalendar(view.calendar, fields, view.collectionId);
    if (calendar === null) {
      drop('calendar');
      if (next.layout === 'calendar') edit({ layout: 'table' });
    } else if (calendar !== view.calendar) edit({ calendar });
  }
  return next;
}

type Board = NonNullable<View['board']>;
type Calendar = NonNullable<View['calendar']>;

/** The board options with a usable group field (another one if needed), or null if none. */
function repairBoard(board: Board, fields: EntityMap<Field>, collectionId: Id): Board | null {
  const inCollection = (id: Id) => fields[id]?.collectionId === collectionId;
  let next = board;
  const group = fields[board.groupFieldId];
  if (group?.collectionId !== collectionId || !BOARD_GROUP_TYPES.has(group.type)) {
    const replacement = firstFieldOfTypes(fields, collectionId, BOARD_GROUP_TYPES);
    if (!replacement) return null;
    next = { ...next, groupFieldId: replacement.id };
  }
  if (next.cardFields?.some((id) => !inCollection(id))) {
    next = { ...next, cardFields: next.cardFields.filter(inCollection) };
  }
  return next;
}

/** The calendar options with a usable date field (another one if needed), or null if none. */
function repairCalendar(
  calendar: Calendar,
  fields: EntityMap<Field>,
  collectionId: Id,
): Calendar | null {
  const inCollection = (id: Id) => fields[id]?.collectionId === collectionId;
  const isDate = (id: Id | undefined) => {
    const f = id === undefined ? undefined : fields[id];
    return f?.collectionId === collectionId && CALENDAR_DATE_TYPES.has(f.type);
  };
  let next = calendar;
  if (!isDate(calendar.dateFieldId)) {
    const replacement = firstFieldOfTypes(fields, collectionId, CALENDAR_DATE_TYPES);
    if (!replacement) return null;
    next = { ...next, dateFieldId: replacement.id };
  }
  if (next.endFieldId !== undefined && !isDate(next.endFieldId)) {
    next = { ...next };
    Reflect.deleteProperty(next, 'endFieldId');
  }
  if (next.colorFieldId !== undefined && !inCollection(next.colorFieldId)) {
    next = { ...next };
    Reflect.deleteProperty(next, 'colorFieldId');
  }
  if (next.cardFields?.some((id) => !inCollection(id))) {
    next = { ...next, cardFields: next.cardFields.filter(inCollection) };
  }
  return next;
}

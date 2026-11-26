/** Helpers for editing a filter tree immutably in the filter builder. */
import { fieldType } from '@/domain/fields/registry';
import type { OperandKind, OperatorId } from '@/domain/fields/operators';
import type { Field, FilterCondition, FilterGroup } from '@/domain/schema/types';

export type FilterItem = FilterGroup['items'][number];

/** Nested groups allowed below the top level (the schema repairs deeper ones away). */
export const MAX_DEPTH = 2;

export function operatorsOf(field: Field): [OperatorId, OperandKind][] {
  return Object.entries(fieldType(field).operators) as [OperatorId, OperandKind][];
}

export function operandKind(field: Field, operator: string): OperandKind {
  return (fieldType(field).operators as Partial<Record<string, OperandKind>>)[operator] ?? 'none';
}

/** The operand a new condition starts with (date inputs always show a choice). */
export function defaultOperand(kind: OperandKind): FilterCondition['value'] {
  if (kind === 'datePoint') return { kind: 'relative', offset: 0, unit: 'day' };
  if (kind === 'dateRange')
    return { kind: 'rolling', direction: 'past', amount: 7, unit: 'day', includeToday: true };
  return undefined;
}

/** A condition with an operator and its default operand. */
export function withOperator(
  fieldId: string,
  operator: string,
  kind: OperandKind,
): FilterCondition {
  const value = defaultOperand(kind);
  return { fieldId, operator, ...(value === undefined ? {} : { value }) };
}

/** A new condition on a field, with its type's first operator. */
export function newCondition(field: Field): FilterCondition {
  const [first] = operatorsOf(field);
  return withOperator(field.id, first?.[0] ?? 'isNotEmpty', first?.[1] ?? 'none');
}

/** Replaces the item at a path of indexes. */
export function updateAt(
  group: FilterGroup,
  path: readonly number[],
  item: FilterItem | null,
): FilterGroup {
  const [head, ...rest] = path;
  if (head === undefined) return group;
  const items = group.items.slice();
  if (rest.length === 0) {
    if (item === null) items.splice(head, 1);
    else items[head] = item;
  } else {
    const child = items[head];
    if (!child || !('items' in child)) return group;
    const next = updateAt(child, rest, item);
    if (next.items.length === 0) items.splice(head, 1);
    else items[head] = next;
  }
  return { ...group, items };
}

/** The group at a path. */
export function groupAt(group: FilterGroup, path: readonly number[]): FilterGroup {
  let g = group;
  for (const i of path) {
    const child = g.items[i];
    if (!child || !('items' in child)) break;
    g = child;
  }
  return g;
}

/** Adds an item to the group at a path. */
export function addTo(group: FilterGroup, path: readonly number[], item: FilterItem): FilterGroup {
  if (path.length === 0) return { ...group, items: [...group.items, item] };
  const target = groupAt(group, path);
  return updateAt(group, path, { ...target, items: [...target.items, item] });
}

/** A copy of an object without one key. */
export function without<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  Reflect.deleteProperty(copy, key);
  return copy;
}

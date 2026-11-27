import type { NewRecord } from '@/domain/commands';
import type { Id, View } from '@/domain/schema/types';
import { filterDefaults } from '@/domain/views/defaults';
import type { ViewContext } from '@/domain/views/filter';
import { docStore } from '@/store/docStore';

/**
 * What a record added from a view starts with: the values its filter asks for (so it stays in
 * the view), overridden by `values` given by the layout (a board column, a calendar day).
 */
export function newRecordInput(
  collectionId: Id,
  view: View | undefined,
  context: ViewContext,
  values: Record<Id, unknown> = {},
): NewRecord {
  const doc = docStore.getState().doc;
  if (!doc || !view) return { collectionId, values };
  const defaults = filterDefaults(doc, view.filter, context);
  const links = Object.fromEntries(
    Object.entries(defaults.links).filter(([fieldId]) => !(fieldId in values)),
  );
  return { collectionId, values: { ...defaults.values, ...values }, links };
}

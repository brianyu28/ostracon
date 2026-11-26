/** Creating collections from a template plan (or a copied schema): one undo step. */
import type { Draft } from 'immer';
import { fieldType } from '../fields/registry';
import type { DocModel } from '../model';
import type { Field, FilterGroup, Id, SelectOption, View } from '../schema/types';
import type { PlanCollection, TemplatePlan } from '../templates/plan';
import type { TemplateView } from '../templates/model';
import { repairView } from '../views/repair';
import { createCollection } from './collections';
import { CommandError, defineCommand, required, type CommandContext } from './define';
import { createField, createLinkField, reorderFields } from './fields';
import { uniqueFieldName } from './helpers';
import { createView, setViewFields, updateView } from './views';

type DraftDoc = Draft<DocModel>;

/** Option names in a filter's values become the created field's option ids. */
function mapFilter(
  group: FilterGroup,
  ids: ReadonlyMap<string, Id>,
  fields: Readonly<Record<Id, Field>>,
): FilterGroup | undefined {
  const items: FilterGroup['items'] = [];
  for (const item of group.items) {
    if ('items' in item) {
      const nested = mapFilter(item, ids, fields);
      if (nested) items.push(nested);
      continue;
    }
    const fieldId = ids.get(item.fieldId);
    const field = fieldId ? fields[fieldId] : undefined;
    if (!field) continue;
    let value = item.value;
    if ((field.type === 'singleSelect' || field.type === 'multiSelect') && Array.isArray(value)) {
      const options: readonly SelectOption[] = field.config.options;
      value = (value as string[])
        .map((v) => options.find((o) => o.id === v || o.name === v)?.id)
        .filter((v): v is string => v !== undefined);
    }
    items.push({ ...item, fieldId: field.id, ...(value === undefined ? {} : { value }) });
  }
  return items.length ? { ...group, items } : undefined;
}

function viewChanges(
  spec: TemplateView,
  ids: ReadonlyMap<string, Id>,
  fields: Readonly<Record<Id, Field>>,
): Partial<View> {
  const changes: Partial<View> = {};
  const sorts = (spec.sorts ?? [])
    .map((s) => ({ fieldId: ids.get(s.field) ?? '', dir: s.dir }))
    .filter((s) => s.fieldId);
  if (sorts.length) changes.sorts = sorts;
  const filter = spec.filter ? mapFilter(spec.filter, ids, fields) : undefined;
  if (filter) changes.filter = filter;
  const groupField = spec.group ? ids.get(spec.group.field) : undefined;
  if (spec.group && groupField)
    changes.group = {
      fieldId: groupField,
      dir: spec.group.dir,
      ...(spec.group.dateBucket ? { dateBucket: spec.group.dateBucket } : {}),
    };
  const summaries: NonNullable<View['summaries']> = {};
  for (const [key, summary] of Object.entries(spec.summaries ?? {})) {
    const id = ids.get(key);
    if (id) summaries[id] = summary;
  }
  if (Object.keys(summaries).length) changes.summaries = summaries;
  return changes;
}

/**
 * Builds a plan: each collection with its fields, then the links between them (and to existing
 * collections), then the starter views. Returns the created collections' ids by plan ref.
 */
export const createFromTemplate = defineCommand<{ plan: TemplatePlan }, Record<string, Id>>({
  label: 'Add collection',
  run(draft, { plan }, ctx) {
    if (plan.collections.length === 0) throw new CommandError('Nothing to create.');
    const refs: Record<string, Id> = {};
    const keys = new Map<string, Map<string, Id>>();

    for (const c of plan.collections) {
      const id = createCollection.run(
        draft,
        {
          name: c.name,
          ...(c.icon ? { icon: c.icon } : {}),
          ...(c.color ? { color: c.color } : {}),
        },
        ctx,
      );
      refs[c.ref] = id;
      const collection = required(draft.collections[id], 'Collection');
      if (c.template) collection.template = { ...c.template };
      const ids = new Map<string, Id>();
      keys.set(c.ref, ids);
      const primary = c.fields.find((f) => f.key === c.primary);
      const primaryField = required(draft.fields[collection.primaryFieldId], 'Field');
      if (primary?.name.trim()) primaryField.name = primary.name.trim();
      ids.set(c.primary, primaryField.id);
      for (const f of c.fields) {
        if (f.key === c.primary || f.type === 'link' || f.type === 'formula') continue;
        const config =
          f.config === undefined
            ? undefined
            : fieldType(f.type).normalizeConfig(f.config, {
                settings: draft.settings,
                newId: ctx.newId,
              });
        const fieldId = createField.run(
          draft,
          {
            collectionId: id,
            name: f.name,
            type: f.type,
            ...(config !== undefined && typeof config !== 'string' ? { config } : {}),
          },
          ctx,
        );
        ids.set(f.key, fieldId);
      }
    }

    // Links, once every collection exists. A field pair is created from one side only.
    for (const c of plan.collections) {
      const collectionId = refs[c.ref] ?? '';
      for (const f of c.fields) {
        if (f.type !== 'link' || !f.link || f.link.target.kind === 'skip') continue;
        const target =
          f.link.target.kind === 'existing' ? f.link.target.collectionId : refs[f.link.target.ref];
        if (!target || !draft.collections[target]) continue;
        const symmetric = f.link.symmetric === true && target === collectionId;
        const backlink = !symmetric && f.link.backlink !== undefined;
        const { fieldId } = createLinkField.run(
          draft,
          {
            collectionId,
            name: f.name,
            targetCollectionId: target,
            multiple: f.link.multiple,
            ...(symmetric ? { symmetric: true } : {}),
            ...(backlink && f.link.backlink
              ? {
                  inverseName: uniqueFieldName(draft, target, f.link.backlink.name),
                  inverseMultiple: f.link.backlink.multiple !== false,
                }
              : { backlink: false }),
          },
          ctx,
        );
        keys.get(c.ref)?.set(f.key, fieldId);
      }
    }

    // Fields in the plan's order (links were created last), then backlinks other collections added.
    for (const c of plan.collections) {
      const collectionId = refs[c.ref] ?? '';
      const ids = keys.get(c.ref);
      if (!ids) continue;
      const planned = c.fields
        .map((f) => ids.get(f.key))
        .filter((id): id is Id => id !== undefined);
      const rest = Object.values(draft.fields)
        .filter((f) => f.collectionId === collectionId && !planned.includes(f.id))
        .sort((a, b) => a.order - b.order)
        .map((f) => f.id);
      reorderFields.run(draft, { collectionId, ids: [...planned, ...rest] }, ctx);
    }
    for (const c of plan.collections)
      createViews(draft, c, refs[c.ref] ?? '', keys.get(c.ref), ctx);
    return refs;
  },
});

function createViews(
  draft: DraftDoc,
  c: PlanCollection,
  collectionId: Id,
  ids: ReadonlyMap<string, Id> | undefined,
  ctx: CommandContext,
) {
  if (!ids) return;
  const specs = c.views.length ? c.views : [{ name: 'All' }];
  // The collection's own default view becomes the first starter view.
  const defaultView = Object.values(draft.views).find((v) => v.collectionId === collectionId);
  specs.forEach((spec, i) => {
    const viewId =
      i === 0 && defaultView
        ? defaultView.id
        : createView.run(draft, { collectionId, name: spec.name, layout: 'table' }, ctx);
    const hidden = new Set((spec.hidden ?? []).map((k) => ids.get(k)).filter(Boolean));
    const fieldIds = Object.values(draft.fields)
      .filter((f) => f.collectionId === collectionId)
      .sort((a, b) => a.order - b.order)
      .map((f) => f.id);
    setViewFields.run(
      draft,
      {
        id: viewId,
        fields: fieldIds.map((fieldId) =>
          hidden.has(fieldId) ? { fieldId, hidden: true } : { fieldId },
        ),
      },
      ctx,
    );
    const changes = viewChanges(spec, ids, draft.fields);
    // Settings repair would drop (e.g. on a removed field) are left out rather than rejected.
    const view = required(draft.views[viewId], 'View');
    const repaired = repairView({ ...view, ...changes }, draft.fields);
    const keep: Partial<View> = {};
    for (const key of ['sorts', 'filter', 'group', 'summaries'] as const)
      if (repaired[key] !== undefined && changes[key] !== undefined)
        Object.assign(keep, { [key]: repaired[key] });
    updateView.run(draft, { id: viewId, changes: { name: spec.name, ...keep } }, ctx);
  });
}

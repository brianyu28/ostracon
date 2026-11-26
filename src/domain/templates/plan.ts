/**
 * Turning a template into a plan the user can edit before anything is created: which
 * collections to make, their fields (renamed, removed, added or retyped in the preview) and
 * where each link points (an existing collection, one the plan creates, or nowhere).
 */
import type { Collection, Color, Field, FieldType, Id, View } from '../schema/types';
import { toDisplay } from '../formulas/expression';
import { TEMPLATES_BY_KEY } from './catalog';
import type {
  Template,
  TemplateCollection,
  TemplateField,
  TemplateLinkField,
  TemplateView,
} from './model';

export type PlanTarget =
  | { kind: 'existing'; collectionId: Id }
  /** A collection in the plan, by its `ref`. */
  | { kind: 'plan'; ref: string }
  | { kind: 'skip' };

export interface PlanLink {
  target: PlanTarget;
  multiple: boolean;
  backlink?: { name: string; multiple?: boolean } | undefined;
  symmetric?: boolean | undefined;
  /** The template a "create" choice would create (people for a "With → People" field). */
  templateKey?: string | undefined;
}

export interface PlanField {
  key: string;
  name: string;
  type: FieldType;
  config?: Record<string, unknown> | undefined;
  link?: PlanLink | undefined;
}

export interface PlanCollection {
  ref: string;
  name: string;
  icon?: string | undefined;
  color?: Color | undefined;
  /** Key of the primary field (always in `fields`, always text). */
  primary: string;
  fields: PlanField[];
  views: TemplateView[];
  template?: { key: string; version: number } | undefined;
}

export interface TemplatePlan {
  /** In creation order; the first is the one to open afterwards. */
  collections: PlanCollection[];
}

/** An existing collection made from a template, or one with the same name. */
function findExisting(
  collections: readonly Collection[],
  template: Template,
): Collection | undefined {
  return (
    collections.find((c) => c.template?.key === template.key) ??
    collections.find((c) => c.name.toLowerCase() === template.collection.name.toLowerCase())
  );
}

function planField(f: TemplateField): PlanField {
  if (f.type === 'formula')
    return {
      key: f.key,
      name: f.name,
      type: 'formula',
      config: { expression: f.expression, ...(f.number ? { number: f.number } : {}) },
    };
  return {
    key: f.key,
    name: f.name,
    type: f.type,
    ...(f.type !== 'link' && f.config ? { config: structuredClone(f.config) } : {}),
  };
}

function planCollection(
  ref: string,
  source: TemplateCollection,
  template?: Template,
): PlanCollection {
  return {
    ref,
    name: source.name,
    icon: source.icon,
    color: source.color,
    primary: source.primary,
    fields: source.fields.map(planField),
    views: structuredClone(source.views),
    ...(template ? { template: { key: template.key, version: template.version } } : {}),
  };
}

/**
 * The plan for a template: its collection (and its log collection for the "with log" variant),
 * with links to other templates pointed at matching existing collections, or created.
 */
export function planTemplate(
  template: Template,
  options: { withLog: boolean; existing: readonly Collection[] },
): TemplatePlan {
  const main = planCollection('main', template.collection, template);
  const plan: TemplatePlan = { collections: [main] };
  const sources: [PlanCollection, TemplateCollection][] = [[main, template.collection]];
  if (options.withLog && template.log) {
    main.fields.push(...(template.log.parentFields ?? []).map(planField));
    const log = planCollection('log', template.log.collection);
    plan.collections.push(log);
    sources.push([log, template.log.collection]);
  }
  for (const [collection, source] of sources) {
    for (const field of collection.fields) {
      const spec = source.fields.find((f) => f.key === field.key);
      if (spec?.type !== 'link') continue;
      field.link = resolveLink(plan, collection, spec, options.existing);
    }
  }
  return plan;
}

function resolveLink(
  plan: TemplatePlan,
  collection: PlanCollection,
  spec: TemplateLinkField,
  existing: readonly Collection[],
): PlanLink {
  const base = {
    multiple: spec.multiple !== false,
    ...(spec.backlink ? { backlink: { ...spec.backlink } } : {}),
    ...(spec.symmetric ? { symmetric: true } : {}),
  };
  if ('self' in spec.target) return { ...base, target: { kind: 'plan', ref: collection.ref } };
  if ('parent' in spec.target) return { ...base, target: { kind: 'plan', ref: 'main' } };
  const key = spec.target.template;
  const target = TEMPLATES_BY_KEY.get(key);
  if (!target) return { ...base, target: { kind: 'skip' } };
  const found = findExisting(existing, target);
  if (found)
    return { ...base, templateKey: key, target: { kind: 'existing', collectionId: found.id } };
  return { ...base, templateKey: key, target: { kind: 'plan', ref: ensureTemplate(plan, key) } };
}

/** Adds another template's collection to the plan (once) and returns its ref. */
export function ensureTemplate(plan: TemplatePlan, key: string): string {
  if (!plan.collections.some((c) => c.ref === key)) {
    const template = TEMPLATES_BY_KEY.get(key);
    if (template) {
      const added = planCollection(key, template.collection, template);
      // Its own links (e.g. People's Friends) point at itself; others are skipped.
      for (const field of added.fields) {
        const spec = template.collection.fields.find((f) => f.key === field.key);
        if (spec?.type === 'link')
          field.link = {
            multiple: spec.multiple !== false,
            ...(spec.symmetric ? { symmetric: true } : {}),
            target: 'self' in spec.target ? { kind: 'plan', ref: key } : { kind: 'skip' },
          };
      }
      plan.collections.push(added);
    }
  }
  return key;
}

/** Drops collections the plan added for links that no longer point at them. */
export function pruneTemplates(plan: TemplatePlan): TemplatePlan {
  const used = new Set<string>(['main', 'log']);
  for (const c of plan.collections)
    for (const f of c.fields)
      if (f.link?.target.kind === 'plan' && f.link.target.ref !== c.ref)
        used.add(f.link.target.ref);
  return { collections: plan.collections.filter((c) => used.has(c.ref)) };
}

/** A plan that copies an existing collection's fields and views (its links point where they did). */
export function planFromCollection(
  doc: {
    collections: Readonly<Record<Id, Collection>>;
    fields: Readonly<Record<Id, Field>>;
    views: Readonly<Record<Id, View>>;
  },
  collectionId: Id,
): TemplatePlan {
  const source = doc.collections[collectionId];
  if (!source) return { collections: [] };
  const fields = Object.values(doc.fields)
    .filter((f) => f.collectionId === collectionId)
    .sort((a, b) => a.order - b.order);
  const keyOf = (id: Id) => id;
  const views: TemplateView[] = Object.values(doc.views)
    .filter((v) => v.collectionId === collectionId)
    .sort((a, b) => a.order - b.order)
    .map((v) => ({
      name: v.name,
      ...(v.sorts ? { sorts: v.sorts.map((s) => ({ field: keyOf(s.fieldId), dir: s.dir })) } : {}),
      ...(v.filter ? { filter: structuredClone(v.filter) } : {}),
      ...(v.group
        ? {
            group: {
              field: keyOf(v.group.fieldId),
              dir: v.group.dir,
              ...(v.group.dateBucket ? { dateBucket: v.group.dateBucket } : {}),
            },
          }
        : {}),
      hidden: v.fields.filter((f) => f.hidden).map((f) => keyOf(f.fieldId)),
      ...(v.summaries ? { summaries: { ...v.summaries } } : {}),
    }));
  return {
    collections: [
      {
        ref: 'main',
        name: `${source.name} copy`,
        icon: source.icon,
        color: source.color,
        primary: source.primaryFieldId,
        fields: fields.map((f) => {
          if (f.type === 'formula')
            return {
              key: f.id,
              name: f.name,
              type: 'formula',
              config: {
                ...structuredClone(f.config),
                expression: toDisplay(f.config.expression, doc.fields),
              },
            };
          if (f.type !== 'link')
            return {
              key: f.id,
              name: f.name,
              type: f.type,
              ...('config' in f ? { config: structuredClone(f.config) } : {}),
            };
          const symmetric = f.config.inverseFieldId === f.id;
          const inverse = f.config.inverseFieldId ? doc.fields[f.config.inverseFieldId] : undefined;
          const selfLink = f.config.targetCollectionId === collectionId;
          return {
            key: f.id,
            name: f.name,
            type: 'link',
            link: {
              target: selfLink
                ? { kind: 'plan', ref: 'main' }
                : { kind: 'existing', collectionId: f.config.targetCollectionId },
              multiple: f.config.multiple === true,
              ...(symmetric ? { symmetric: true } : {}),
              ...(!symmetric && inverse?.type === 'link'
                ? {
                    backlink: {
                      name: `${inverse.name} copy`,
                      multiple: inverse.config.multiple === true,
                    },
                  }
                : {}),
            },
          };
        }),
        views,
      },
    ],
  };
}

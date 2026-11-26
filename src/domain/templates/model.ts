/**
 * Templates: starting schemas for common collections. A template is data: its fields use the
 * same field types as everything else, referring to each other by `key`. `plan.ts` turns one into
 * an editable plan and the `createFromTemplate` command builds it.
 */
import type { Color, FieldType, FilterGroup, Sort, Summary, View } from '../schema/types';

/** A non-link field. `config` is checked by the type's `normalizeConfig` (select options may omit ids). */
export interface TemplateValueField {
  key: string;
  name: string;
  type: Exclude<FieldType, 'link' | 'formula'>;
  config?: Record<string, unknown>;
  description?: string;
}

/** Where a template's link field points. */
export type LinkTargetSpec =
  /** The main collection of another template (e.g. People), existing or created. */
  | { template: string }
  /** The template's own main collection (from its log collection). */
  | { parent: true }
  /** The same collection. */
  | { self: true };

export interface TemplateLinkField {
  key: string;
  name: string;
  type: 'link';
  target: LinkTargetSpec;
  multiple?: boolean;
  /** The paired field in the target (none: a one-way link). */
  backlink?: { name: string; multiple?: boolean };
  /** One field linking both ways (self links only). */
  symmetric?: boolean;
}

export type TemplateField = TemplateValueField | TemplateLinkField;

/** A starter view; fields are referred to by key. */
export interface TemplateView {
  name: string;
  sorts?: { field: string; dir: Sort['dir'] }[];
  filter?: FilterGroup;
  group?: {
    field: string;
    dir: Sort['dir'];
    dateBucket?: NonNullable<View['group']>['dateBucket'];
  };
  /** Field keys hidden in this view. */
  hidden?: string[];
  summaries?: Record<string, Summary>;
}

export interface TemplateCollection {
  name: string;
  icon: string;
  color: Color;
  /** Key of the primary (title) field, a text field. */
  primary: string;
  fields: TemplateField[];
  views: TemplateView[];
}

export interface Template {
  key: string;
  name: string;
  description: string;
  /** Extra words for the gallery's search. */
  keywords?: string;
  version: number;
  collection: TemplateCollection;
  /** The "With log" variant's second collection (e.g. visits), linked to the main one. */
  log?: { label: string; collection: TemplateCollection };
}

/** Shorthand for select options with colors. */
export function options(...names: (string | [string, Color])[]): Record<string, unknown> {
  return {
    options: names.map((n) => (typeof n === 'string' ? { name: n } : { name: n[0], color: n[1] })),
  };
}

/** A filter condition on a field key, for starter views. */
export function where(field: string, operator: string, value?: unknown): FilterGroup {
  return {
    op: 'and',
    items: [{ fieldId: field, operator, ...(value === undefined ? {} : { value }) } as never],
  };
}

export const THIS_YEAR = { kind: 'period', unit: 'year', offset: 0 } as const;

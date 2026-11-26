/**
 * The current schema of the Ostracon data file (version CURRENT_SCHEMA_VERSION), defined
 * as zod schemas. Older versions exist only as fixtures plus the migrations that upgrade
 * them (see migrations/). The TypeScript types are inferred from these, so validation and
 * types can never drift apart.
 *
 * Conventions:
 * - Optional fields are omitted when they hold their default (false / empty), which keeps
 *   files small; code must treat `undefined` as the default.
 * - Every entity has an `id` and `createdAt` / `updatedAt` timestamps; deletions leave a
 *   tombstone. Together these allow entity-level merging between devices
 *   (see `domain/sync/merge.ts`).
 * - Collections, fields and views are top-level entities that carry `collectionId`, so they
 *   merge, undo and tombstone individually.
 * - Record values are keyed by field id, so renaming a field never touches records.
 * - Links are stored once, in `links`, never on records (see PLAN §3.6).
 *
 * Phase 0 skeleton: field configs, values and view options are loosely typed here and are
 * tightened per field type in Phase 1.
 */
import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION, FILE_FORMAT } from './version';

// ── Primitives ───────────────────────────────────────────────────────────────

export const IdSchema = z.string().regex(/^[a-z]{3}_[0-9A-Za-z]{4,32}$/, 'Invalid id');
export const TimestampSchema = z.iso.datetime({ offset: true });
const NameSchema = z.string().trim().min(1).max(200);

const Stamps = { createdAt: TimestampSchema, updatedAt: TimestampSchema };

// ── File settings (shared by every device that opens the file) ──────────────

export const FileSettingsSchema = z.object({
  locale: z.string().min(2),
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  /** Default currency (ISO 4217) for new currency-formatted number fields. */
  defaultCurrency: z.string().length(3),
});

// ── Collections ──────────────────────────────────────────────────────────────

export const CollectionSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  /** Key into the curated icon set (`components/icons`). */
  icon: z.string().max(40).optional(),
  /** Key into the color palette. */
  color: z.string().max(20).optional(),
  description: z.string().max(2000).optional(),
  order: z.number(),
  /** The title field: shown in link chips, cards, search and the calendar. */
  primaryFieldId: IdSchema,
  /** Where a collection created from a template came from; never drives behavior. */
  template: z.object({ key: z.string(), version: z.number().int() }).optional(),
  ...Stamps,
});

// ── Fields ───────────────────────────────────────────────────────────────────

export const FieldTypeSchema = z.enum([
  'text',
  'richText',
  'number',
  'rating',
  'duration',
  'date',
  'dateTime',
  'dateRange',
  'singleSelect',
  'multiSelect',
  'checkbox',
  'url',
  'email',
  'phone',
  'location',
  'link',
  'formula',
  'createdTime',
  'modifiedTime',
]);

export const FieldSchema = z.object({
  id: IdSchema,
  collectionId: IdSchema,
  name: NameSchema,
  order: z.number(),
  description: z.string().max(2000).optional(),
  type: FieldTypeSchema,
  /** Type-specific configuration (Phase 1: a discriminated union per type). */
  config: z.record(z.string(), z.unknown()).optional(),
  /** Soft requirement: highlighted when empty, never blocks saving. */
  required: z.literal(true).optional(),
  ...Stamps,
});

// ── Views ────────────────────────────────────────────────────────────────────

export const ViewLayoutSchema = z.enum(['table', 'board', 'calendar']);

export const ViewSchema = z.object({
  id: IdSchema,
  collectionId: IdSchema,
  name: NameSchema,
  order: z.number(),
  layout: ViewLayoutSchema,
  /** Field order and visibility for this view. */
  fields: z.array(
    z.object({
      fieldId: IdSchema,
      hidden: z.literal(true).optional(),
      width: z.number().int().min(40).max(2000).optional(),
    }),
  ),
  /** Filters, sorts, grouping and layout options (Phase 1/4: typed). */
  options: z.record(z.string(), z.unknown()).optional(),
  ...Stamps,
});

// ── Records and links ────────────────────────────────────────────────────────

export const RecordSchema = z.object({
  id: IdSchema,
  collectionId: IdSchema,
  /** Values keyed by field id; empty values are omitted (Phase 1: validated per type). */
  values: z.record(IdSchema, z.unknown()),
  ...Stamps,
});

/** One link, stored from the pair's canonical side: [fieldId, fromId, toId, createdAt]. */
export const LinkSchema = z.tuple([IdSchema, IdSchema, IdSchema, TimestampSchema]);

// ── File ─────────────────────────────────────────────────────────────────────

export const FileMetaSchema = z.object({
  fileId: IdSchema,
  /** Incremented on every save; used to detect concurrent edits from other devices. */
  revision: z.number().int().min(0),
  createdAt: TimestampSchema,
  savedAt: TimestampSchema.nullable(),
  savedBy: IdSchema.nullable(),
  appVersion: z.string(),
});

export const TombstoneSchema = z.object({
  /** An entity id, or a link key (`fieldId|fromId|toId`). */
  id: z.string().min(1).max(200),
  deletedAt: TimestampSchema,
});

export const OstraconFileSchema = z.object({
  format: z.literal(FILE_FORMAT),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  meta: FileMetaSchema,
  settings: FileSettingsSchema,
  collections: z.array(CollectionSchema),
  fields: z.array(FieldSchema),
  views: z.array(ViewSchema),
  records: z.array(RecordSchema),
  links: z.array(LinkSchema),
  tombstones: z.array(TombstoneSchema),
});

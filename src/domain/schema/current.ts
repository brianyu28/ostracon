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
 * - Record values are keyed by field id, so renaming a field never touches records. A value's
 *   shape depends on its field's type; the loader checks values against their fields in the
 *   integrity pass (`integrity.ts`) because zod sees one entity at a time.
 * - Links are stored once, in `links`, never on records (see `domain/links.ts`).
 */
import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION, FILE_FORMAT } from './version';

// ── Primitives ───────────────────────────────────────────────────────────────

export const IdSchema = z.string().regex(/^[a-z]{3}_[0-9A-Za-z]{4,32}$/, 'Invalid id');
export const TimestampSchema = z.iso.datetime({ offset: true });
const NameSchema = z.string().trim().min(1).max(200);
const DescriptionSchema = z.string().max(2000);
/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD` (validated precisely in the integrity pass). */
const PartialDateSchema = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/);

const Stamps = { createdAt: TimestampSchema, updatedAt: TimestampSchema };

/** Named colors from the app palette (select options, collections). */
export const ColorSchema = z.enum([
  'gray',
  'brown',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
]);

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
  /** Key into the curated icon set (`components/CollectionIcon`), or an emoji. */
  icon: z.string().max(40).optional(),
  color: ColorSchema.optional(),
  description: DescriptionSchema.optional(),
  order: z.number(),
  /** The title field (text or formula): shown in link chips, cards, search and the calendar. */
  primaryFieldId: IdSchema,
  /** Where a collection created from a template came from; never drives behavior. */
  template: z.object({ key: z.string().max(60), version: z.number().int() }).optional(),
  ...Stamps,
});

// ── Fields ───────────────────────────────────────────────────────────────────

export const NumberFormatSchema = z.object({
  /** plain: as entered; decimal: fixed places; currency; percent (stored as a fraction). */
  style: z.enum(['plain', 'decimal', 'currency', 'percent']),
  /** Decimal places shown (and kept on input) for decimal, currency and percent. */
  decimals: z.number().int().min(0).max(10).optional(),
  /** Show thousands separators. */
  thousands: z.literal(true).optional(),
  /** ISO 4217 code for the currency style (default: the file's default currency). */
  currency: z.string().length(3).optional(),
});

export const SelectOptionSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(100),
  color: ColorSchema,
  order: z.number(),
});

export const LocationPartSchema = z.enum(['name', 'address', 'city', 'region', 'country']);

const fieldBase = {
  id: IdSchema,
  collectionId: IdSchema,
  name: NameSchema,
  order: z.number(),
  description: DescriptionSchema.optional(),
  /** Soft requirement: highlighted when empty, never blocks saving. */
  required: z.literal(true).optional(),
  ...Stamps,
};

const field = <T extends string, C extends z.ZodType>(type: T, config: C) =>
  z.object({ ...fieldBase, type: z.literal(type), config });
const bareField = <T extends string>(type: T) => z.object({ ...fieldBase, type: z.literal(type) });

export const FieldSchema = z.discriminatedUnion('type', [
  field('text', z.object({ multiline: z.literal(true).optional() })),
  bareField('richText'),
  field('number', NumberFormatSchema),
  field(
    'rating',
    z.object({
      max: z.number().int().min(3).max(10),
      icon: z.enum(['star', 'heart', 'circle']).optional(),
    }),
  ),
  field('duration', z.object({ display: z.enum(['h:mm', 'h:mm:ss', 'compact']) })),
  field('date', z.object({ partial: z.literal(true).optional() })),
  bareField('dateTime'),
  field('dateRange', z.object({ partial: z.literal(true).optional() })),
  field('singleSelect', z.object({ options: z.array(SelectOptionSchema) })),
  field('multiSelect', z.object({ options: z.array(SelectOptionSchema) })),
  bareField('checkbox'),
  field('url', z.object({ display: z.enum(['link', 'image']).optional() })),
  bareField('email'),
  bareField('phone'),
  field('location', z.object({ parts: z.array(LocationPartSchema).min(1) })),
  field(
    'link',
    z.object({
      targetCollectionId: IdSchema,
      /** The paired field on the target collection (this field's own id for a symmetric link). */
      inverseFieldId: IdSchema,
      /** Links to many records (otherwise at most one). */
      multiple: z.literal(true).optional(),
    }),
  ),
  field(
    'formula',
    z.object({
      /** Field references are stored as `{fld_…}` so renames are safe. */
      expression: z.string().max(5000),
      /** Display format when the result is a number. */
      number: NumberFormatSchema.optional(),
    }),
  ),
  field('createdTime', z.object({ includeTime: z.literal(true).optional() })),
  field('modifiedTime', z.object({ includeTime: z.literal(true).optional() })),
]);

export const FieldTypeSchema = z.enum(
  FieldSchema.options.map((o) => o.shape.type.value) as [
    FieldSchema['type'],
    ...FieldSchema['type'][],
  ],
);
type FieldSchema = z.infer<typeof FieldSchema>;

// ── Record values ────────────────────────────────────────────────────────────

export const LocationValueSchema = z.object({
  name: z.string().max(500).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(200).optional(),
  region: z.string().max(200).optional(),
  country: z.string().max(200).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const DateRangeValueSchema = z.object({
  start: PartialDateSchema,
  end: PartialDateSchema.optional(),
});

/** Every shape a stored value can take; which one is valid depends on the field's type. */
export const ValueSchema = z.union([
  z.string().max(100_000),
  z.number(),
  z.literal(true),
  z.array(IdSchema),
  DateRangeValueSchema,
  LocationValueSchema,
]);

export const RecordSchema = z.object({
  id: IdSchema,
  collectionId: IdSchema,
  /** Values keyed by field id; empty values are omitted. */
  values: z.record(IdSchema, ValueSchema),
  ...Stamps,
});

/** One link, stored from the pair's canonical side: [fieldId, fromId, toId, createdAt]. */
export const LinkSchema = z.tuple([IdSchema, IdSchema, IdSchema, TimestampSchema]);

// ── Views ────────────────────────────────────────────────────────────────────

export const DateUnitSchema = z.enum(['day', 'week', 'month', 'quarter', 'year']);

/** A single date in a filter: absolute, or relative to today (0 days = today). */
export const DatePointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('absolute'), date: PartialDateSchema }),
  z.object({ kind: z.literal('relative'), offset: z.number().int(), unit: DateUnitSchema }),
]);

/** A span of dates in a filter ("is within …"). */
export const DateRangeOperandSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('absolute'),
    start: PartialDateSchema.optional(),
    end: PartialDateSchema.optional(),
  }),
  /** "the past 3 weeks", "the next 10 days". */
  z.object({
    kind: z.literal('rolling'),
    direction: z.enum(['past', 'next']),
    amount: z.number().int().min(1).max(10_000),
    unit: DateUnitSchema,
    includeToday: z.literal(true).optional(),
  }),
  /** "this month" (0), "last year" (-1), "next week" (1). */
  z.object({
    kind: z.literal('period'),
    unit: z.enum(['week', 'month', 'quarter', 'year']),
    offset: z.number().int(),
  }),
  /** "year to date". */
  z.object({ kind: z.literal('toDate'), unit: z.enum(['week', 'month', 'quarter', 'year']) }),
]);

export const OperandSchema = z.union([
  z.string().max(10_000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)),
  z.tuple([z.number(), z.number()]),
  DatePointSchema,
  DateRangeOperandSchema,
]);

export const FilterConditionSchema = z.object({
  fieldId: IdSchema,
  /** For location fields: which part the condition tests. */
  part: LocationPartSchema.optional(),
  /** An operator id of the field's type (see `domain/fields`). */
  operator: z.string().min(1).max(40),
  value: OperandSchema.optional(),
});

export const FilterGroupSchema = z.object({
  op: z.enum(['and', 'or']),
  get items(): z.ZodArray<z.ZodUnion<[typeof FilterConditionSchema, typeof FilterGroupSchema]>> {
    return z.array(z.union([FilterConditionSchema, FilterGroupSchema]));
  },
});

export const SortSchema = z.object({ fieldId: IdSchema, dir: z.enum(['asc', 'desc']) });

export const SummarySchema = z.enum([
  'count',
  'filled',
  'empty',
  'unique',
  'percentFilled',
  'sum',
  'average',
  'median',
  'min',
  'max',
  'range',
  'earliest',
  'latest',
  'checked',
  'percentChecked',
]);

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
  filter: FilterGroupSchema.optional(),
  sorts: z.array(SortSchema).optional(),
  /** Table grouping. */
  group: z
    .object({
      fieldId: IdSchema,
      dir: z.enum(['asc', 'desc']),
      dateBucket: z.enum(['day', 'week', 'month', 'year']).optional(),
      part: LocationPartSchema.optional(),
      collapsed: z.array(z.string().max(200)).optional(),
      hideEmpty: z.literal(true).optional(),
    })
    .optional(),
  /** Footer and group-header summaries, by field id. */
  summaries: z.record(IdSchema, SummarySchema).optional(),
  board: z
    .object({
      groupFieldId: IdSchema,
      cardFields: z.array(IdSchema).optional(),
      hideEmpty: z.literal(true).optional(),
      /** Manual card order per record id, used while the view isn't sorted. */
      cardOrder: z.array(IdSchema).optional(),
    })
    .optional(),
  calendar: z
    .object({
      dateFieldId: IdSchema,
      /** Optional second date field marking the end of each record's span. */
      endFieldId: IdSchema.optional(),
      cardFields: z.array(IdSchema).optional(),
      colorFieldId: IdSchema.optional(),
    })
    .optional(),
  ...Stamps,
});

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

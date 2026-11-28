/**
 * Types for the current schema version, inferred from the zod schemas.
 * Import entity types from here rather than from the schema module.
 */
import type { z } from 'zod';
import type * as S from './current';

export type { Id } from '@/lib/id';
export type { ISODate } from '@/lib/date';
export type { LocalDateTime, PartialDate } from '@/lib/partialDate';

export type Timestamp = string;
export type OstracaFile = z.infer<typeof S.OstracaFileSchema>;
export type FileMeta = z.infer<typeof S.FileMetaSchema>;
export type FileSettings = z.infer<typeof S.FileSettingsSchema>;
export type Color = z.infer<typeof S.ColorSchema>;
export type Collection = z.infer<typeof S.CollectionSchema>;

export type Field = z.infer<typeof S.FieldSchema>;
export type FieldType = Field['type'];
/** The field variant of one type, e.g. `FieldOf<'number'>`. */
export type FieldOf<T extends FieldType> = Extract<Field, { type: T }>;
/** A type's config, or `undefined` for types without one. */
export type ConfigOf<T extends FieldType> = FieldOf<T> extends { config: infer C } ? C : undefined;
export type NumberFormat = z.infer<typeof S.NumberFormatSchema>;
export type SelectOption = z.infer<typeof S.SelectOptionSchema>;
export type LocationPart = z.infer<typeof S.LocationPartSchema>;

export type Value = z.infer<typeof S.ValueSchema>;
export type LocationValue = z.infer<typeof S.LocationValueSchema>;
export type DateRangeValue = z.infer<typeof S.DateRangeValueSchema>;
export type RecordEntity = z.infer<typeof S.RecordSchema>;
export type Link = z.infer<typeof S.LinkSchema>;

export type View = z.infer<typeof S.ViewSchema>;
export type ViewLayout = z.infer<typeof S.ViewLayoutSchema>;
export type ViewField = View['fields'][number];
export type FilterGroup = z.infer<typeof S.FilterGroupSchema>;
export type FilterCondition = z.infer<typeof S.FilterConditionSchema>;
export type Operand = z.infer<typeof S.OperandSchema>;
export type DatePoint = z.infer<typeof S.DatePointSchema>;
export type DateRangeOperand = z.infer<typeof S.DateRangeOperandSchema>;
export type DateUnit = z.infer<typeof S.DateUnitSchema>;
export type Sort = z.infer<typeof S.SortSchema>;
export type Summary = z.infer<typeof S.SummarySchema>;
export type Tombstone = z.infer<typeof S.TombstoneSchema>;

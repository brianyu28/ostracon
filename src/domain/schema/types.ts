/**
 * Types for the current schema version, inferred from the zod schemas.
 * Import entity types from here rather than from the schema module.
 */
import type { z } from 'zod';
import type * as S from './current';

export type { Id } from '@/lib/id';
export type { ISODate } from '@/lib/date';

export type Timestamp = string;
export type OstraconFile = z.infer<typeof S.OstraconFileSchema>;
export type FileMeta = z.infer<typeof S.FileMetaSchema>;
export type FileSettings = z.infer<typeof S.FileSettingsSchema>;
export type Collection = z.infer<typeof S.CollectionSchema>;
export type Field = z.infer<typeof S.FieldSchema>;
export type FieldType = z.infer<typeof S.FieldTypeSchema>;
export type View = z.infer<typeof S.ViewSchema>;
export type ViewLayout = z.infer<typeof S.ViewLayoutSchema>;
export type RecordEntity = z.infer<typeof S.RecordSchema>;
export type Link = z.infer<typeof S.LinkSchema>;
export type Tombstone = z.infer<typeof S.TombstoneSchema>;

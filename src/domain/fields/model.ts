/**
 * The contract every field type implements. One definition per type lives in
 * `domain/fields/types/`; the registry (`registry.ts`) maps a field's `type` to it. Everything
 * that handles values (commands, conversion, integrity checks, filters, sorting,
 * grouping, export and search) goes through these definitions, so adding a type is one
 * module here plus its cell renderer and editor in the UI.
 */
import type { ISODate } from '@/lib/date';
import type { IdKind } from '@/lib/id';
import type {
  ConfigOf,
  Field,
  FieldOf,
  FieldType,
  FileSettings,
  Id,
  Summary,
  Value,
} from '../schema/types';
import type { OperandKind, OperatorId } from './operators';

/** How values are shown: device and file preferences that affect formatting. */
export interface FormatContext {
  locale: string;
  defaultCurrency: string;
  dateStyle: 'medium' | 'numeric' | 'iso';
}

/** `display`: for people (locale formats, symbols). `raw`: canonical text that `parse` reads back exactly. */
export type TextStyle = 'display' | 'raw';

export interface ParseContext {
  locale: string;
  today: ISODate;
}

/** Returned by `normalize` and `parse` for input that isn't a valid value of the type. */
export const INVALID = Symbol('invalid');
export type Invalid = typeof INVALID;

export interface ConfigContext {
  settings: FileSettings;
  newId: (kind: IdKind) => Id;
}

export interface FieldTypeDef<T extends FieldType = FieldType> {
  type: T;
  label: string;
  /** Values are stored on records (false for links, which live in `links`, and computed types). */
  stored: boolean;
  /** Can be a collection's primary (title) field. */
  canBePrimary: boolean;
  /** Default configuration for a new field of this type. */
  defaultConfig(ctx: ConfigContext): ConfigOf<T>;
  /**
   * Checks and completes a configuration from user input (e.g. gives new select options ids
   * and colors). Returns an error message for an invalid one.
   */
  normalizeConfig(config: unknown, ctx: ConfigContext): ConfigOf<T> | string;
  /** Whether a stored value is valid for this field (used by the integrity check). */
  isValid(value: Value, field: FieldOf<T>): boolean;
  /**
   * Turns input into a stored value: `undefined` for an empty value (which is then omitted),
   * `INVALID` for input of the wrong shape.
   */
  normalize(value: unknown, field: FieldOf<T>): Value | undefined | Invalid;
  /** Orders two non-empty values ascending. */
  compare(a: Value, b: Value, field: FieldOf<T>): number;
  /** Text for a non-empty value. */
  format(value: Value, field: FieldOf<T>, ctx: FormatContext, style: TextStyle): string;
  /** Reads typed or pasted text: `undefined` when blank, `INVALID` when it isn't a value. */
  parse(text: string, field: FieldOf<T>, ctx: ParseContext): Value | undefined | Invalid;
  /** Filter operators and the kind of operand each takes. */
  operators: Readonly<Partial<Record<OperatorId, OperandKind>>>;
  /** Summaries offered for the type (footer and group headers). */
  summaries: readonly Summary[];
}

/** Any field's definition, typed loosely enough to call with any `Field`. */
export interface AnyFieldTypeDef {
  type: FieldType;
  label: string;
  stored: boolean;
  canBePrimary: boolean;
  defaultConfig(ctx: ConfigContext): unknown;
  /** The normalized config, or an error message (a string). */
  normalizeConfig(config: unknown, ctx: ConfigContext): unknown;
  isValid(value: Value, field: Field): boolean;
  normalize(value: unknown, field: Field): Value | undefined | Invalid;
  compare(a: Value, b: Value, field: Field): number;
  format(value: Value, field: Field, ctx: FormatContext, style: TextStyle): string;
  parse(text: string, field: Field, ctx: ParseContext): Value | undefined | Invalid;
  operators: Readonly<Partial<Record<OperatorId, OperandKind>>>;
  summaries: readonly Summary[];
}

/** Formatting for raw text: canonical, locale-independent output. */
export const RAW_FORMAT: FormatContext = {
  locale: 'en-US',
  defaultCurrency: 'USD',
  dateStyle: 'iso',
};

export const BASIC_SUMMARIES: readonly Summary[] = [
  'count',
  'filled',
  'empty',
  'unique',
  'percentFilled',
];

/** Shared helper: a plain object (not an array or null). */
export function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Collator used for every text comparison (numeric-aware, case-insensitive). */
export const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

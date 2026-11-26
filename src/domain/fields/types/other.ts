/** Checkbox, location, link and computed field types. */
import type { LocationPart, LocationValue } from '../../schema/types';
import {
  BASIC_SUMMARIES,
  collator,
  INVALID,
  isRecordLike,
  type FieldTypeDef,
  type Invalid,
} from '../model';
import { DATE_OPERATORS, EMPTINESS, TEXT_OPERATORS } from '../operators';

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'x', '✓', '✔', 'checked', 'on', 'done']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0', 'unchecked', 'off']);

export const checkboxType: FieldTypeDef<'checkbox'> = {
  type: 'checkbox',
  label: 'Checkbox',
  stored: true,
  canBePrimary: false,
  defaultConfig: () => undefined,
  normalizeConfig: () => undefined,
  isValid: (value) => value === true,
  /** Checked is stored as `true`; unchecked is the empty value. */
  normalize(value) {
    if (value === true) return true;
    if (value === false || value === undefined || value === null) return undefined;
    return INVALID;
  },
  compare: () => 0,
  format: (_value, _field, _ctx, style) => (style === 'raw' ? 'true' : '✓'),
  parse(text) {
    const t = text.trim().toLowerCase();
    if (!t || FALSE_WORDS.has(t)) return undefined;
    return TRUE_WORDS.has(t) ? true : INVALID;
  },
  operators: { isChecked: 'none', isNotChecked: 'none' },
  summaries: ['count', 'checked', 'percentChecked'],
};

/** Location parts in display order (most specific first). */
export const LOCATION_PARTS: readonly LocationPart[] = [
  'name',
  'address',
  'city',
  'region',
  'country',
];

export const LOCATION_PART_LABELS: Readonly<Record<LocationPart, string>> = {
  name: 'Place',
  address: 'Address',
  city: 'City',
  region: 'State / region',
  country: 'Country',
};

function normalizeLocation(value: unknown): LocationValue | undefined | typeof INVALID {
  if (value === undefined || value === null) return undefined;
  if (!isRecordLike(value)) return INVALID;
  const out: LocationValue = {};
  for (const part of LOCATION_PARTS) {
    const v = value[part];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') return INVALID;
    const text = v.trim().replace(/\s+/g, ' ');
    if (text.length > (part === 'name' || part === 'address' ? 500 : 200)) return INVALID;
    if (text) out[part] = text;
  }
  const { lat, lng } = value;
  if (lat !== undefined || lng !== undefined) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return INVALID;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return INVALID;
    out.lat = lat;
    out.lng = lng;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

/** "Cafe Luna, Portland, OR, USA": the non-empty parts, most specific first. */
export function locationText(value: LocationValue): string {
  return LOCATION_PARTS.map((p) => value[p])
    .filter(Boolean)
    .join(', ');
}

export const locationType: FieldTypeDef<'location'> = {
  type: 'location',
  label: 'Location',
  stored: true,
  canBePrimary: false,
  defaultConfig: () => ({ parts: ['city', 'region', 'country'] }),
  normalizeConfig(config) {
    if (!isRecordLike(config) || !Array.isArray(config.parts)) return 'Invalid location options.';
    const parts = LOCATION_PARTS.filter((p) => (config.parts as unknown[]).includes(p));
    return parts.length ? { parts } : 'Pick at least one part of the location.';
  },
  isValid(value) {
    const normalized = normalizeLocation(value);
    if (normalized === undefined || normalized === INVALID || !isRecordLike(value)) return false;
    const raw = value as Record<string, unknown>;
    return Object.keys(raw).every((k) => (normalized as Record<string, unknown>)[k] === raw[k]);
  },
  normalize: normalizeLocation,
  compare: (a, b) =>
    collator.compare(locationText(a as LocationValue), locationText(b as LocationValue)),
  format: (value) => locationText(value as LocationValue),
  /**
   * Reads "City, Region, Country" style text: comma-separated pieces fill the field's parts
   * in order; extra pieces join the last part.
   */
  parse(text, field) {
    const pieces = text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (pieces.length === 0) return undefined;
    const parts = field.config.parts;
    const out: Record<string, string> = {};
    parts.forEach((part, i) => {
      const piece = i === parts.length - 1 ? pieces.slice(i).join(', ') : pieces[i];
      if (piece) out[part] = piece;
    });
    return normalizeLocation(out);
  },
  operators: TEXT_OPERATORS,
  summaries: BASIC_SUMMARIES,
};

/** Shared parts of the types whose values aren't stored on records. */
const notStored = {
  stored: false,
  isValid: () => false,
  normalize: (): Invalid => INVALID,
  compare: () => 0,
  format: () => '',
  parse: (): Invalid => INVALID,
};

/** Link values live in the document's `links` table; see `domain/links.ts`. */
export const linkType: FieldTypeDef<'link'> = {
  ...notStored,
  type: 'link',
  label: 'Link to records',
  canBePrimary: false,
  defaultConfig: () => {
    throw new Error('Link fields are created in pairs (createLinkField).');
  },
  normalizeConfig: () => 'Link fields are created in pairs.',
  operators: {
    hasAnyOf: 'records',
    hasAllOf: 'records',
    hasNoneOf: 'records',
    countIs: 'number',
    countAtLeast: 'number',
    countAtMost: 'number',
    ...EMPTINESS,
  },
  summaries: ['count', 'filled', 'empty', 'percentFilled'],
};

export const formulaType: FieldTypeDef<'formula'> = {
  ...notStored,
  type: 'formula',
  label: 'Formula',
  canBePrimary: true,
  defaultConfig: () => ({ expression: '' }),
  normalizeConfig(config) {
    if (!isRecordLike(config) || typeof config.expression !== 'string') return 'Invalid formula.';
    // The expression is parsed and checked by the formula engine (Phase 7).
    return { expression: config.expression.slice(0, 5000) };
  },
  // The operators of a formula follow its result type (Phase 7); text operators until then.
  operators: TEXT_OPERATORS,
  summaries: BASIC_SUMMARIES,
};

const timestampConfig = (config: unknown) => {
  if (config !== undefined && !isRecordLike(config)) return 'Invalid options.';
  return config?.includeTime === true ? { includeTime: true as const } : {};
};

const timestamp = {
  ...notStored,
  canBePrimary: false,
  defaultConfig: () => ({}),
  normalizeConfig: timestampConfig,
  operators: DATE_OPERATORS,
  summaries: [...BASIC_SUMMARIES, 'earliest', 'latest', 'range'] as const,
};

export const createdTimeType: FieldTypeDef<'createdTime'> = {
  ...timestamp,
  type: 'createdTime',
  label: 'Created time',
};

export const modifiedTimeType: FieldTypeDef<'modifiedTime'> = {
  ...timestamp,
  type: 'modifiedTime',
  label: 'Last modified time',
};

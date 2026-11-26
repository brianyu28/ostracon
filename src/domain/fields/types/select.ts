/** Single and multiple select fields. Values store option ids, so renaming an option is one edit. */
import type { Color, Id, SelectOption, Value } from '../../schema/types';
import { COLORS } from '../colors';
import {
  BASIC_SUMMARIES,
  INVALID,
  isRecordLike,
  type ConfigContext,
  type FieldTypeDef,
} from '../model';
import { EMPTINESS } from '../operators';

/**
 * Completes options from user input: new options (no id) get ids, every option gets a color
 * (cycling through the palette) and its position as `order`. Names must be unique.
 */
export function normalizeOptions(
  config: unknown,
  ctx: ConfigContext,
): { options: SelectOption[] } | string {
  if (!isRecordLike(config) || !Array.isArray(config.options)) return 'Invalid options.';
  const seen = new Set<string>();
  const options: SelectOption[] = [];
  for (const [i, raw] of (config.options as unknown[]).entries()) {
    if (!isRecordLike(raw) || typeof raw.name !== 'string') return 'Invalid option.';
    const name = raw.name.trim();
    if (!name) return 'Options need a name.';
    if (name.length > 100) return 'Option names can be up to 100 characters.';
    const key = name.toLowerCase();
    if (seen.has(key)) return `There are two options named “${name}”.`;
    seen.add(key);
    const color =
      typeof raw.color === 'string' && (COLORS as readonly string[]).includes(raw.color)
        ? (raw.color as Color)
        : (COLORS[(i + 1) % COLORS.length] ?? 'gray');
    const id =
      typeof raw.id === 'string' && /^opt_\w+$/.test(raw.id) ? raw.id : ctx.newId('option');
    options.push({ id, name, color, order: i });
  }
  return { options };
}

/** The option with this name (case-insensitive). */
export function optionByName(
  options: readonly SelectOption[],
  name: string,
): SelectOption | undefined {
  const key = name.trim().toLowerCase();
  return options.find((o) => o.name.toLowerCase() === key);
}

function optionOrder(options: readonly SelectOption[], id: Id): number {
  return options.find((o) => o.id === id)?.order ?? Number.MAX_SAFE_INTEGER;
}

function optionName(options: readonly SelectOption[], id: Id): string {
  return options.find((o) => o.id === id)?.name ?? '';
}

export const singleSelectType: FieldTypeDef<'singleSelect'> = {
  type: 'singleSelect',
  label: 'Single select',
  stored: true,
  canBePrimary: false,
  defaultConfig: () => ({ options: [] }),
  normalizeConfig: normalizeOptions,
  isValid: (value, field) =>
    typeof value === 'string' && field.config.options.some((o) => o.id === value),
  normalize(value, field) {
    if (value === undefined || value === null || value === '') return undefined;
    return typeof value === 'string' && field.config.options.some((o) => o.id === value)
      ? value
      : INVALID;
  },
  compare: (a, b, field) =>
    optionOrder(field.config.options, a as Id) - optionOrder(field.config.options, b as Id),
  format: (value, field) => optionName(field.config.options, value as Id),
  parse(text, field) {
    if (!text.trim()) return undefined;
    return optionByName(field.config.options, text)?.id ?? INVALID;
  },
  operators: { isAnyOf: 'options', isNoneOf: 'options', ...EMPTINESS },
  summaries: BASIC_SUMMARIES,
};

/** Splits pasted multi-select text: "a, b; c" or one option per line. */
export function splitMulti(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const multiSelectType: FieldTypeDef<'multiSelect'> = {
  type: 'multiSelect',
  label: 'Multiple select',
  stored: true,
  canBePrimary: false,
  defaultConfig: () => ({ options: [] }),
  normalizeConfig: normalizeOptions,
  isValid(value, field) {
    const normalized = multiSelectType.normalize(value, field);
    return (
      Array.isArray(normalized) &&
      Array.isArray(value) &&
      normalized.length === value.length &&
      normalized.every((id, i) => id === value[i])
    );
  },
  /** Removes duplicates and keeps the options' order, so equal sets are equal values. */
  normalize(value, field) {
    if (value === undefined || value === null) return undefined;
    if (!Array.isArray(value)) return INVALID;
    const ids = new Set<string>();
    for (const id of value) {
      if (typeof id !== 'string' || !field.config.options.some((o) => o.id === id)) return INVALID;
      ids.add(id);
    }
    if (ids.size === 0) return undefined;
    return field.config.options.filter((o) => ids.has(o.id)).map((o) => o.id);
  },
  compare(a, b, field) {
    const x = a as Id[];
    const y = b as Id[];
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      const d =
        optionOrder(field.config.options, x[i] ?? '') -
        optionOrder(field.config.options, y[i] ?? '');
      if (d) return d;
    }
    return x.length - y.length;
  },
  format: (value, field) =>
    (value as Id[]).map((id) => optionName(field.config.options, id)).join(', '),
  parse(text, field) {
    const names = splitMulti(text);
    if (names.length === 0) return undefined;
    const ids: Value = [];
    for (const name of names) {
      const option = optionByName(field.config.options, name);
      if (!option) return INVALID;
      ids.push(option.id);
    }
    return multiSelectType.normalize(ids, field);
  },
  operators: {
    hasAnyOf: 'options',
    hasAllOf: 'options',
    hasNoneOf: 'options',
    isExactly: 'options',
    ...EMPTINESS,
  },
  summaries: BASIC_SUMMARIES,
};

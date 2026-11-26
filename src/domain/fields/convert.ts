/**
 * Changing a field's type: works out the new configuration and every record's converted value
 * before anything changes, so the UI can preview what will be kept and lost, and the command
 * applies exactly the same plan.
 *
 * Conversions go through canonical text (the source type's `raw` format, read back by the
 * target type's `parse`), with direct conversions where text would lose meaning (select ↔
 * multi-select, date ↔ date range, date ↔ date-time). Link fields convert to the titles of
 * their linked records.
 */
import type { IdKind } from '@/lib/id';
import { linksOf, type LinkLookup } from '../links';
import { getRecord, iterateRecords, type DocModel } from '../model';
import { recordTitle } from '../records';
import type { DateRangeValue, Field, FieldType, FileSettings, Id, Value } from '../schema/types';
import { fieldType } from './registry';
import { INVALID, RAW_FORMAT, type ConfigContext, type ParseContext } from './model';
import { normalizeOptions, splitMulti } from './types/select';

export interface TypeChangePlan {
  /** The field as it will be after the change. */
  field: Field;
  /** New value per record (undefined: the value is removed). Only records that change. */
  values: Map<Id, Value | undefined>;
  /** Records whose value carried over. */
  converted: number;
  /** Records whose value can't be represented in the new type and will be cleared. */
  lost: number;
  /** A few of the values that will be lost, as text, for the preview. */
  lostExamples: string[];
}

export interface TypeChangeContext {
  settings: FileSettings;
  newId: (kind: IdKind) => Id;
  /** ISO timestamp (the command's `now`); its date part is "today" for parsing. */
  now: string;
  /** Fast link lookups (the index); without them a link field's links are scanned. */
  links?: LinkLookup;
}

const MAX_EXAMPLES = 5;

/** The source value of a record as text plus its stored value (null when empty). */
function sourceValue(
  doc: Pick<DocModel, 'collections' | 'fields' | 'links' | 'records'>,
  field: Field,
  recordId: Id,
  links: LinkLookup | undefined,
): { value: Value | null; text: string } {
  if (field.type === 'link') {
    const target = field.config.targetCollectionId;
    const reader = links ? { index: links, added: new Set<string>() } : undefined;
    const titles = linksOf(doc, field, recordId, reader)
      .map((id) => getRecord(doc, target, id))
      .filter((r) => r !== undefined)
      .map((r) => recordTitle(doc as DocModel, r));
    return { value: null, text: titles.join(', ') };
  }
  const record = getRecord(doc, field.collectionId, recordId);
  const value = record?.values[field.id];
  if (value === undefined || !fieldType(field).stored) return { value: null, text: '' };
  return { value, text: fieldType(field).format(value, field, RAW_FORMAT, 'raw') };
}

/** Conversions that keep more meaning than going through text. */
function directConversion(
  from: Field,
  to: Field,
  value: Value,
): Value | undefined | typeof INVALID | null {
  switch (`${from.type}>${to.type}`) {
    case 'singleSelect>multiSelect':
      return [value as Id];
    case 'multiSelect>singleSelect':
      return (value as Id[])[0];
    case 'date>dateRange':
      return fieldType(to).normalize({ start: value }, to);
    case 'dateRange>date':
      return fieldType(to).normalize((value as DateRangeValue).start, to);
    case 'dateTime>date':
      return (value as string).slice(0, 10);
    case 'date>dateTime':
      return (value as string).length === 10 ? `${value as string}T00:00` : INVALID;
    case 'dateTime>dateRange':
      return { start: (value as string).slice(0, 10) };
    default:
      return null; // no direct conversion: go through text
  }
}

/** Builds select options from the distinct values being converted (in first-seen order). */
function derivedOptions(texts: readonly string[], multi: boolean, ctx: ConfigContext) {
  const names = new Map<string, string>();
  for (const text of texts) {
    for (const name of multi ? splitMulti(text) : [text.trim()]) {
      const key = name.toLowerCase();
      if (name && name.length <= 100 && !names.has(key)) names.set(key, name);
    }
  }
  const result = normalizeOptions({ options: [...names.values()].map((name) => ({ name })) }, ctx);
  return typeof result === 'string' ? { options: [] } : result;
}

/**
 * Plans changing `field` to `toType`. `config` is the new type's configuration from the user;
 * when omitted it is derived (select options from the existing values, options kept when
 * switching between select types). Returns an error message when the change isn't possible.
 */
export function planTypeChange(
  doc: Pick<DocModel, 'collections' | 'fields' | 'links' | 'records'>,
  field: Field,
  toType: FieldType,
  config: unknown,
  ctx: TypeChangeContext,
): TypeChangePlan | string {
  if (toType === 'link') return 'To link records, add a link field instead.';
  if (toType === field.type) return 'The field already has that type.';
  const toDef = fieldType(toType);
  const collection = doc.collections[field.collectionId];
  if (collection?.primaryFieldId === field.id && !toDef.canBePrimary)
    return 'The primary field must be text or a formula.';

  const configCtx: ConfigContext = { settings: ctx.settings, newId: ctx.newId };
  // In creation order, so options derived from values come in the order they were first used.
  const recordIds = [...iterateRecords(doc, field.collectionId)]
    .sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1,
    )
    .map((r) => r.id);
  const sources = recordIds.map((id) => ({ id, ...sourceValue(doc, field, id, ctx.links) }));

  let newConfig: unknown;
  if (config !== undefined) {
    newConfig = toDef.normalizeConfig(config, configCtx);
    if (typeof newConfig === 'string') return newConfig;
  } else if (
    (toType === 'singleSelect' || toType === 'multiSelect') &&
    (field.type === 'singleSelect' || field.type === 'multiSelect')
  ) {
    newConfig = field.config;
  } else if (toType === 'singleSelect' || toType === 'multiSelect') {
    newConfig = derivedOptions(
      sources.map((s) => s.text).filter(Boolean),
      toType === 'multiSelect',
      configCtx,
    );
  } else if (toType === 'text' && (field.type === 'richText' || field.type === 'location')) {
    newConfig = field.type === 'richText' ? { multiline: true } : {};
  } else if (toType === 'number' && field.type === 'formula' && field.config.number) {
    newConfig = field.config.number;
  } else {
    newConfig = toDef.defaultConfig(configCtx);
  }

  const base: Record<string, unknown> = { ...field };
  Reflect.deleteProperty(base, 'config');
  const next = (
    newConfig === undefined
      ? { ...base, type: toType }
      : { ...base, type: toType, config: newConfig }
  ) as Field;

  const parseCtx: ParseContext = { locale: ctx.settings.locale, today: ctx.now.slice(0, 10) };
  const plan: TypeChangePlan = {
    field: next,
    values: new Map(),
    converted: 0,
    lost: 0,
    lostExamples: [],
  };
  const fromStored = fieldType(field).stored;

  for (const { id, value, text } of sources) {
    const hasValue = value !== null || text !== '';
    let result: Value | undefined | typeof INVALID = undefined;
    if (hasValue && toDef.stored) {
      const direct = value !== null ? directConversion(field, next, value) : null;
      result = direct ?? toDef.parse(text, next, parseCtx);
    }
    if (result === INVALID || (hasValue && result === undefined)) {
      plan.lost++;
      if (plan.lostExamples.length < MAX_EXAMPLES && text) plan.lostExamples.push(text);
      if (fromStored) plan.values.set(id, undefined);
    } else if (result !== undefined) {
      plan.converted++;
      plan.values.set(id, result);
    }
  }
  return plan;
}

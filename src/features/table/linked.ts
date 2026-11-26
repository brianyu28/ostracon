import type { DocIndex } from '@/domain/aggregates/docIndex';
import { FORMULA_ERROR, formulaValue } from '@/domain/computed';
import type { FormatContext } from '@/domain/fields/model';
import { formulaResultType, type FormulaField } from '@/domain/formulas/compile';
import { ERROR_TEXT, formulaText } from '@/domain/formulas/format';
import { getRecord, type DocModel } from '@/domain/model';
import { recordTitle } from '@/domain/records';
import type { Field, Id, RecordEntity } from '@/domain/schema/types';

/** A linked record as the table shows it. */
export interface LinkedRecord {
  id: Id;
  title: string;
}

/** Reads a record's linked records through a link field (empty for other fields). */
export type LinkReader = (record: RecordEntity, field: Field) => LinkedRecord[];

/**
 * A reader over the document's links. `_version` is the index version: the index changes in
 * place, so a new reader per version lets memoized rows re-render when links change.
 */
export function linkReader(
  doc: DocModel | null,
  index: DocIndex | null,
  _version: number,
): LinkReader {
  return (record, field) => {
    if (field.type !== 'link' || !doc || !index) return [];
    const target = field.config.targetCollectionId;
    return index
      .linked(field, record.id)
      .map((id) => getRecord(doc, target, id))
      .filter((r) => r !== undefined)
      .map((r) => ({ id: r.id, title: recordTitle(doc, r) }));
  };
}

/** A formula's result as a cell shows it. */
export interface FormulaDisplay {
  text: string;
  /** Number results align right. */
  numeric: boolean;
  error: boolean;
}

export type FormulaReader = (record: RecordEntity, field: FormulaField) => FormulaDisplay;

/** A reader of formula results (cached per record by the engine). */
export function formulaReader(
  doc: DocModel | null,
  index: DocIndex | null,
  _version: number,
  today: string,
  format: FormatContext,
): FormulaReader {
  return (record, field) => {
    if (!doc) return { text: '', numeric: false, error: false };
    const value = formulaValue(doc, field, record, {
      today,
      linked: index ? (f, id) => index.linked(f, id) : undefined,
    });
    if (value === FORMULA_ERROR) return { text: ERROR_TEXT, numeric: false, error: true };
    const type = formulaResultType(doc.fields, field);
    return {
      text: formulaText(value, type, field, format),
      numeric: type === 'number',
      error: false,
    };
  };
}

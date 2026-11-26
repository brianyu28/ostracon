/**
 * A view's result: its collection's records filtered, searched, sorted and grouped. Pure; the UI
 * memoizes it on the collection's index version, the view and the fields.
 */
import type { FormatContext } from '../fields/model';
import { fieldType } from '../fields/registry';
import { locationText } from '../fields/types/other';
import { iterateRecords, type DocModel } from '../model';
import type { Field, LocationValue, RecordEntity, View } from '../schema/types';
import { compileFilter, type ViewContext } from './filter';
import { groupRecords, type RecordGroup } from './groups';
import { sortRecords } from './rows';
import { formulaOf } from './values';

export interface ViewResult {
  /** Matching records in order (all groups, collapsed ones included). */
  records: RecordEntity[];
  /** Groups when the view is grouped. */
  groups?: RecordGroup[];
}

export interface EvaluateOptions extends ViewContext {
  /** Quick search text (matches any field's text, case-insensitive). */
  search?: string;
  format: FormatContext;
  /** Titles of linked records, for searching link fields. */
  linkTitles?: (record: RecordEntity, field: Field) => readonly string[];
}

function searchText(record: RecordEntity, field: Field, options: EvaluateOptions): string {
  if (field.type === 'link') return options.linkTitles?.(record, field).join(' ') ?? '';
  if (field.type === 'formula') {
    const v = formulaOf(record, field, options);
    return v === null ? '' : String(v);
  }
  const v = record.values[field.id];
  if (v === undefined) return '';
  if (field.type === 'location') return locationText(v as LocationValue);
  if (typeof v === 'string' && field.type !== 'singleSelect') return v;
  return fieldType(field).format(v, field, options.format, 'display');
}

/** Evaluates a view (filter → search → sort → group). */
export function evaluateView(doc: DocModel, view: View, options: EvaluateOptions): ViewResult {
  const fields = Object.values(doc.fields).filter((f) => f.collectionId === view.collectionId);
  const predicate = compileFilter(view.filter, doc.fields, options);
  const query = options.search?.trim().toLowerCase();
  const records: RecordEntity[] = [];
  for (const record of iterateRecords(doc, view.collectionId)) {
    if (!predicate(record)) continue;
    if (query && !fields.some((f) => searchText(record, f, options).toLowerCase().includes(query)))
      continue;
    records.push(record);
  }
  sortRecords(records, view.sorts, doc.fields, options);
  const groupField = view.group ? doc.fields[view.group.fieldId] : undefined;
  if (!view.group || !groupField) return { records };
  const groups = groupRecords(records, groupField, view.group, options);
  return { records: groups.flatMap((g) => g.records), groups };
}

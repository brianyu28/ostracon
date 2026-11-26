/**
 * Pure helpers for the table's range selection, clipboard and fill: they work on the rows and
 * columns the table shows, by index, and return what to dispatch.
 */
import { fieldType } from '@/domain/fields/registry';
import { RAW_FORMAT } from '@/domain/fields/model';
import type { TextRow } from '@/domain/commands';
import type { Field, Id, RecordEntity, Value } from '@/domain/schema/types';
import type { CellRef } from './tableStore';

export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** The selected range as row and column indexes (inclusive), or null when a corner is gone. */
export function selectionRect(
  cursor: CellRef | null,
  anchor: CellRef | null,
  rowIndex: ReadonlyMap<Id, number>,
  columns: readonly Field[],
): Rect | null {
  if (!cursor) return null;
  const r1 = rowIndex.get(cursor.row);
  const c1 = columns.findIndex((f) => f.id === cursor.field);
  if (r1 === undefined || c1 < 0) return null;
  const other = anchor ?? cursor;
  const r2 = rowIndex.get(other.row) ?? r1;
  const c2Found = columns.findIndex((f) => f.id === other.field);
  const c2 = c2Found < 0 ? c1 : c2Found;
  return {
    top: Math.min(r1, r2),
    bottom: Math.max(r1, r2),
    left: Math.min(c1, c2),
    right: Math.max(c1, c2),
  };
}

/** Whether a field's values can be typed, pasted or cleared in the table (Phase 3). */
export function isEditable(field: Field): boolean {
  return field.type !== 'link' && fieldType(field).stored;
}

/** Text of a value for the clipboard: canonical text that pasting reads back. */
export function clipboardText(
  record: RecordEntity,
  field: Field,
  linkTitles: (record: RecordEntity, field: Field) => string[],
): string {
  if (field.type === 'link') return linkTitles(record, field).join(', ');
  if (field.type === 'createdTime') return record.createdAt.slice(0, 10);
  if (field.type === 'modifiedTime') return record.updatedAt.slice(0, 10);
  const value = record.values[field.id];
  return value === undefined ? '' : fieldType(field).format(value, field, RAW_FORMAT, 'raw');
}

/** The cells of a range as rows of clipboard text. */
export function copyCells(
  rect: Rect,
  rows: readonly RecordEntity[],
  columns: readonly Field[],
  linkTitles: (record: RecordEntity, field: Field) => string[],
): string[][] {
  const out: string[][] = [];
  for (let r = rect.top; r <= rect.bottom; r++) {
    const record = rows[r];
    if (!record) continue;
    out.push(
      columns.slice(rect.left, rect.right + 1).map((f) => clipboardText(record, f, linkTitles)),
    );
  }
  return out;
}

export interface PastePlan {
  rows: TextRow[];
  /** Cells that landed on columns that can't be edited (links, calculated fields). */
  skipped: number;
  /** New rows the paste adds below the last record. */
  added: number;
}

/**
 * Where pasted cells go. A single copied cell fills the whole selected range; otherwise the
 * block is pasted at the range's top-left corner, adding rows below the last record when it
 * runs past the end. Columns past the last one are dropped.
 */
export function planPaste(
  cells: readonly (readonly string[])[],
  rect: Rect,
  rows: readonly RecordEntity[],
  columns: readonly Field[],
): PastePlan {
  const plan: PastePlan = { rows: [], skipped: 0, added: 0 };
  const single = cells.length === 1 && cells[0]?.length === 1;
  const height = single ? rect.bottom - rect.top + 1 : cells.length;
  const width = single ? rect.right - rect.left + 1 : Math.max(0, ...cells.map((r) => r.length));
  for (let i = 0; i < height; i++) {
    const record = rows[rect.top + i];
    const source = single ? cells[0] : cells[i];
    const texts: Record<Id, string> = {};
    for (let j = 0; j < width; j++) {
      const field = columns[rect.left + j];
      if (!field) break;
      const text = single ? (source?.[0] ?? '') : source?.[j];
      if (text === undefined) continue;
      if (!isEditable(field)) {
        if (text !== '') plan.skipped++;
        continue;
      }
      texts[field.id] = text;
    }
    if (record) plan.rows.push({ id: record.id, texts });
    else if (Object.values(texts).some((t) => t.trim() !== '')) {
      plan.rows.push({ texts });
      plan.added++;
    }
  }
  return plan;
}

/**
 * Fill down: each column's top value of the range is copied to the rows below it. With one
 * row selected, the value comes from the row above.
 */
export function planFillDown(
  rect: Rect,
  rows: readonly RecordEntity[],
  columns: readonly Field[],
): { id: Id; values: Record<Id, Value | undefined> }[] {
  const sourceIndex = rect.top === rect.bottom ? rect.top - 1 : rect.top;
  const firstTarget = rect.top === rect.bottom ? rect.top : rect.top + 1;
  const source = rows[sourceIndex];
  if (!source) return [];
  const fields = columns.slice(rect.left, rect.right + 1).filter(isEditable);
  if (fields.length === 0) return [];
  const updates = [];
  for (let r = firstTarget; r <= rect.bottom; r++) {
    const record = rows[r];
    if (!record) continue;
    const values: Record<Id, Value | undefined> = {};
    for (const f of fields) values[f.id] = source.values[f.id];
    updates.push({ id: record.id, values });
  }
  return updates;
}

/** Clearing a range: every editable cell set to empty. */
export function planClear(
  rect: Rect,
  rows: readonly RecordEntity[],
  columns: readonly Field[],
): { id: Id; values: Record<Id, undefined> }[] {
  const fields = columns.slice(rect.left, rect.right + 1).filter(isEditable);
  if (fields.length === 0) return [];
  const updates = [];
  for (let r = rect.top; r <= rect.bottom; r++) {
    const record = rows[r];
    if (!record || !fields.some((f) => f.id in record.values)) continue;
    updates.push({
      id: record.id,
      values: Object.fromEntries(fields.map((f) => [f.id, undefined])) as Record<Id, undefined>,
    });
  }
  return updates;
}

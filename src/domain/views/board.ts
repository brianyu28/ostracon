/**
 * Board layout: a view's records split into columns by one field (single select, checkbox or
 * rating), with an "empty" column, in manual card order while the view isn't sorted.
 */
import type { Field, Id, RecordEntity, View } from '../schema/types';

export interface BoardColumn {
  /** Option id, 'true'/'false', a rating, or '' for no value. */
  key: string;
  records: RecordEntity[];
}

/** The column keys a field gives, in order (the empty column first). */
export function columnKeys(field: Field): string[] {
  switch (field.type) {
    case 'singleSelect':
      return ['', ...field.config.options.map((o) => o.id)];
    case 'checkbox':
      return ['false', 'true'];
    case 'rating':
      return ['', ...Array.from({ length: field.config.max }, (_, i) => String(i + 1))];
    default:
      return [''];
  }
}

/** A record's column key. */
export function columnOf(record: RecordEntity, field: Field): string {
  const v = record.values[field.id];
  if (field.type === 'checkbox') return v === true ? 'true' : 'false';
  if (field.type === 'rating') return typeof v === 'number' ? String(v) : '';
  return typeof v === 'string' ? v : '';
}

/** The value a card takes when dropped in a column. */
export function columnValue(field: Field, key: string): unknown {
  if (field.type === 'checkbox') return key === 'true' ? true : undefined;
  if (field.type === 'rating') return key ? Number(key) : undefined;
  return key || undefined;
}

/**
 * Splits records (already filtered and, if the view is sorted, in sort order) into columns. An
 * unsorted view keeps the board's manual card order; records not in it follow in their order.
 */
export function boardColumns(
  view: View,
  field: Field,
  records: readonly RecordEntity[],
): BoardColumn[] {
  const board = view.board;
  let ordered: readonly RecordEntity[] = records;
  if (!view.sorts?.length && board?.cardOrder?.length) {
    const position = new Map(board.cardOrder.map((id, i) => [id, i]));
    ordered = records
      .map((r, i) => ({ r, i, p: position.get(r.id) }))
      .sort((a, b) =>
        a.p !== undefined && b.p !== undefined
          ? a.p - b.p
          : a.p !== undefined
            ? -1
            : b.p !== undefined
              ? 1
              : a.i - b.i,
      )
      .map((x) => x.r);
  }
  const columns = new Map<string, RecordEntity[]>(columnKeys(field).map((k) => [k, []]));
  for (const r of ordered) {
    const key = columnOf(r, field);
    let list = columns.get(key);
    if (!list) columns.set(key, (list = [])); // a value no longer in the options
    list.push(r);
  }
  return (
    [...columns]
      // The no-value column shows only when it has cards (and never with hideEmpty).
      .filter(([key, list]) => !(key === '' && (board?.hideEmpty || list.length === 0)))
      .map(([key, list]) => ({ key, records: list }))
  );
}

/**
 * The board's card order after moving a card before another (or to the end of the board when
 * `beforeId` is null): every card in its current board order, with the moved one placed.
 */
export function movedOrder(
  columns: readonly BoardColumn[],
  recordId: Id,
  beforeId: Id | null,
): Id[] {
  const ids = columns.flatMap((c) => c.records.map((r) => r.id)).filter((id) => id !== recordId);
  const at = beforeId === null ? -1 : ids.indexOf(beforeId);
  if (at < 0) ids.push(recordId);
  else ids.splice(at, 0, recordId);
  return ids;
}

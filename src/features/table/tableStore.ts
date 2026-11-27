/**
 * Transient state of the table on screen: the cell cursor, the selected range, the cell being
 * edited, checked rows and the record panel. Cells are addressed by record and field id, so
 * the cursor stays on its record when rows re-sort.
 */
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { Id } from '@/domain/schema/types';

export interface CellRef {
  row: Id;
  field: Id;
}

export interface Editing extends CellRef {
  /** Text typed to start editing (replaces the value), or undefined to edit the current value. */
  initial?: string;
}

interface TableState {
  /** The view the state belongs to; switching views resets it. */
  viewId: Id | null;
  cursor: CellRef | null;
  /** The other corner of a range selection (the cursor is one corner). */
  anchor: CellRef | null;
  editing: Editing | null;
  /** Checked rows (bulk actions). */
  selected: ReadonlySet<Id>;
  /** The record panel shows the cursor's record when open. */
  panelOpen: boolean;
  /** Quick search text for the view. */
  search: string;
  /**
   * A record just added, shown at the top of the table (outside the view's sort, filter and
   * groups) until the cursor leaves its row, so it stays in view while it's filled in.
   */
  pinned: Id | null;
}

const initial = {
  cursor: null,
  anchor: null,
  editing: null,
  selected: new Set<Id>(),
  panelOpen: false,
  search: '',
  pinned: null,
};

/** The pin is kept while the cursor stays on the pinned row. */
const keepPin = (pinned: Id | null, row: Id) => (pinned === row ? pinned : null);

export const tableStore = createStore<TableState>()(() => ({ viewId: null, ...initial }));

export function useTable<T>(selector: (s: TableState) => T): T {
  return useStore(tableStore, selector);
}

export const tableActions = {
  /** Resets the state for another view (keeps the panel open). */
  forView(viewId: Id) {
    if (tableStore.getState().viewId === viewId) return;
    tableStore.setState((s) => ({ viewId, ...initial, panelOpen: s.panelOpen }));
  },
  moveTo(cell: CellRef, extend = false) {
    tableStore.setState((s) => ({
      cursor: cell,
      anchor: extend ? (s.anchor ?? s.cursor) : null,
      editing: null,
      pinned: keepPin(s.pinned, cell.row),
    }));
  },
  edit(cell: CellRef, initial?: string) {
    tableStore.setState((s) => ({
      cursor: cell,
      anchor: null,
      editing: initial === undefined ? { ...cell } : { ...cell, initial },
      pinned: keepPin(s.pinned, cell.row),
    }));
  },
  /** Pins a new record to the top and starts editing it. */
  editNew(cell: CellRef) {
    tableStore.setState({ cursor: cell, anchor: null, editing: { ...cell }, pinned: cell.row });
  },
  stopEditing() {
    tableStore.setState({ editing: null });
  },
  toggleSelected(id: Id) {
    tableStore.setState((s) => {
      const selected = new Set(s.selected);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { selected };
    });
  },
  setSelected(ids: Iterable<Id>) {
    tableStore.setState({ selected: new Set(ids) });
  },
  togglePanel(open?: boolean) {
    tableStore.setState((s) => ({ panelOpen: open ?? !s.panelOpen }));
  },
};

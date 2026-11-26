import { useVirtualizer } from '@tanstack/react-virtual';
import { IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { recordPath } from '@/app/routes';
import type { DocIndex } from '@/domain/aggregates/docIndex';
import { getRecord, type DocModel } from '@/domain/model';
import { DEFAULT_SETTINGS } from '@/domain/schema/defaults';
import { recordTitle } from '@/domain/records';
import type { Collection, Field, Id, RecordEntity, View } from '@/domain/schema/types';
import { useFormatContext } from '@/hooks/useFormatContext';
import { useParseContext } from '@/hooks/useParseContext';
import { parseTsv, toTsv } from '@/lib/tsv';
import { useCommandHandlers } from '@/keyboard/useCommandHandlers';
import { toastWithUndo, tryDispatch, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { usePrefs } from '@/store/prefsStore';
import { toast } from '@/store/toastStore';
import { ui } from '@/store/uiStore';
import { duplicateRecords } from '@/features/record/recordActions';
import { DeleteFieldDialog } from '@/features/schema/DeleteFieldDialog';
import { applyEdit, pasteMessage } from './applyEdit';
import { GUTTER_WIDTH, viewColumns } from './columns';
import { hasEditor } from './editors/hasEditor';
import { ValueEditor } from './editors/ValueEditor';
import type { EditorChange, EditorExit } from './editors/types';
import type { HeaderActions } from './HeaderCell';
import { navigate } from './navigation';
import {
  copyCells,
  isEditable,
  planClear,
  planFillDown,
  planPaste,
  selectionRect,
} from './selection';
import { TableHeader } from './TableHeader';
import { TableRow, type RowHandlers } from './TableRow';
import { tableActions, tableStore, useTable, type Editing } from './tableStore';
import styles from './TableView.module.scss';

interface TableViewProps {
  collection: Collection;
  view: View;
  records: readonly RecordEntity[];
  /** Records to act on: the checked rows, or the cursor's record. */
  onDeleteRecords: (ids: readonly Id[]) => void;
}

const ADD_COLUMN_WIDTH = 40;

/**
 * Reads linked records' titles. `_version` is the index version: the index changes in place, so
 * a new reader per version lets memoized rows re-render when links change.
 */
function linkTitleReader(doc: DocModel | null, index: DocIndex | null, _version: number) {
  return (record: RecordEntity, field: Field): string[] => {
    if (field.type !== 'link' || !doc || !index) return [];
    const target = field.config.targetCollectionId;
    return index
      .linked(field, record.id)
      .map((id) => getRecord(doc, target, id))
      .filter((r) => r !== undefined)
      .map((r) => recordTitle(doc, r));
  };
}

/**
 * The table layout: a virtualized grid with a cell cursor, range selection, typing to edit,
 * TSV copy and paste, fill down, row selection, and column reorder, resize and hide.
 */
export function TableView({ collection, view, records, onDeleteRecords }: TableViewProps) {
  const doc = useDocStore((s) => s.doc);
  const index = useDocStore((s) => s.index);
  const indexVersion = useDocStore((s) => s.indexVersion);
  const density = usePrefs((s) => s.density);
  const format = useFormatContext();
  const parse = useParseContext();
  const rowHeight = density === 'comfortable' ? 34 : 26;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  const cursor = useTable((s) => s.cursor);
  const anchor = useTable((s) => s.anchor);
  const editing = useTable((s) => s.editing);
  const selected = useTable((s) => s.selected);
  const panelOpen = useTable((s) => s.panelOpen);
  const [liveWidths, setLiveWidths] = useState<Record<Id, number>>({});
  const [deletingField, setDeletingField] = useState<Id | null>(null);

  useEffect(() => {
    tableActions.forView(view.id);
  }, [view.id]);

  const fields = doc?.fields;
  const columns = useMemo(
    () => (fields ? viewColumns(view, fields, collection, liveWidths) : []),
    [view, fields, collection, liveWidths],
  );
  const width = GUTTER_WIDTH + columns.reduce((sum, c) => sum + c.width, 0) + ADD_COLUMN_WIDTH;
  const columnFields = useMemo(() => columns.map((c) => c.field), [columns]);
  const rowIndex = useMemo(() => new Map(records.map((r, i) => [r.id, i])), [records]);
  const rect = selectionRect(cursor, anchor, rowIndex, columnFields);
  const rowIndexRef = useRef(rowIndex);
  useEffect(() => {
    rowIndexRef.current = rowIndex;
  }, [rowIndex]);
  const editingRow = editing ? rowIndex.get(editing.row) : undefined;

  const linkTitles = useMemo(
    () => linkTitleReader(doc, index, indexVersion),
    [doc, index, indexVersion],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns unstable functions by design.
  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => rowHeight,
    getItemKey: (i) => records[i]?.id ?? i,
    overscan: 12,
    scrollMargin: rowHeight,
    // Keep the row being edited mounted while it's scrolled out of view.
    rangeExtractor: (range) => {
      const indexes: number[] = [];
      for (
        let i = Math.max(0, range.startIndex - range.overscan);
        i <= Math.min(range.count - 1, range.endIndex + range.overscan);
        i++
      )
        indexes.push(i);
      if (editingRow !== undefined && !indexes.includes(editingRow)) indexes.push(editingRow);
      return indexes;
    },
  });

  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  const focusGrid = useCallback(() => {
    scrollerRef.current?.focus({ preventScroll: true });
  }, []);

  /** Scrolls a cell into view, leaving room for the frozen gutter and primary column. */
  const reveal = useCallback(
    (row: number, col: number) => {
      virtualizer.scrollToIndex(row, { align: 'auto' });
      const scroller = scrollerRef.current;
      const column = columns[col];
      if (!scroller || !column || column.primary) return;
      const frozen = GUTTER_WIDTH + (columns[0]?.primary ? columns[0].width : 0);
      const start = column.left;
      const end = column.left + column.width;
      if (start - frozen < scroller.scrollLeft) scroller.scrollLeft = start - frozen;
      else if (end > scroller.scrollLeft + scroller.clientWidth)
        scroller.scrollLeft = end - scroller.clientWidth;
    },
    [columns, virtualizer],
  );

  const cellAt = useCallback(
    (row: number, col: number) => {
      const record = records[row];
      const column = columns[col];
      return record && column ? { row: record.id, field: column.field.id } : null;
    },
    [records, columns],
  );

  const moveTo = useCallback(
    (row: number, col: number, extend = false) => {
      const cell = cellAt(row, col);
      if (!cell) return;
      tableActions.moveTo(cell, extend);
      reveal(row, col);
    },
    [cellAt, reveal],
  );

  // ── Editing ────────────────────────────────────────────────────────────────

  const setValue = useCallback(
    (record: RecordEntity, field: Field, value: unknown) => {
      applyEdit(collection.id, record.id, field, { kind: 'value', value }, parse);
    },
    [collection.id, parse],
  );

  const startEditing = useCallback(
    (row: number, col: number, initial?: string) => {
      const record = records[row];
      const column = columns[col];
      if (!record || !column) return;
      const { field } = column;
      if (field.type === 'checkbox') {
        setValue(record, field, record.values[field.id] === true ? undefined : true);
        return;
      }
      if (field.type === 'link') {
        tableActions.moveTo({ row: record.id, field: field.id });
        tableActions.togglePanel(true);
        return;
      }
      if (!hasEditor(field.type)) return;
      reveal(row, col);
      tableActions.edit({ row: record.id, field: field.id }, initial);
    },
    [records, columns, reveal, setValue],
  );

  const renderEditor = useCallback(
    (record: RecordEntity, field: Field, edit: Editing) => {
      const onDone = (change: EditorChange | null, exit: EditorExit) => {
        if (change) applyEdit(collection.id, record.id, field, change, parse);
        const current = tableStore.getState().editing;
        // A commit from an editor that closed because another cell was picked leaves that alone.
        if (current?.row !== record.id || current.field !== field.id) return;
        tableActions.stopEditing();
        focusGrid();
        if (exit) {
          const r = rowIndex.get(record.id);
          const c = columns.findIndex((col) => col.field.id === field.id);
          if (r === undefined || c < 0) return;
          const key = { right: 'Tab', left: 'Tab', down: 'ArrowDown', up: 'ArrowUp' }[exit];
          const next = navigate(
            { row: r, col: c },
            { key, mod: false, shift: exit === 'left' },
            { rows: records.length, cols: columns.length },
            1,
          );
          if (next) moveTo(next.row, next.col);
        }
      };
      return (
        <ValueEditor
          field={field}
          value={record.values[field.id]}
          {...(edit.initial !== undefined ? { initial: edit.initial } : {})}
          variant="cell"
          format={format}
          parse={parse}
          settings={doc?.settings ?? DEFAULT_SETTINGS}
          onCommit={onDone}
          onCancel={() => {
            tableActions.stopEditing();
            focusGrid();
          }}
        />
      );
    },
    [
      collection.id,
      parse,
      format,
      doc?.settings,
      rowIndex,
      columns,
      records.length,
      moveTo,
      focusGrid,
    ],
  );

  // ── Mouse ──────────────────────────────────────────────────────────────────

  const dragging = useRef(false);
  const lastChecked = useRef<number | null>(null);
  useEffect(() => {
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mouseup', up);
    };
  }, []);

  const handlers: RowHandlers = useMemo(
    () => ({
      onMouseDown: (row, col, e) => {
        if (e.button !== 0) return;
        const { editing: current } = tableStore.getState();
        const cell = cellAt(row, col);
        if (current && cell && current.row === cell.row && current.field === cell.field) return;
        moveTo(row, col, e.shiftKey);
        dragging.current = !e.shiftKey;
      },
      onMouseEnter: (row, col) => {
        if (!dragging.current) return;
        const cell = cellAt(row, col);
        if (!cell || !tableStore.getState().cursor) return;
        tableStore.setState({ anchor: cell });
      },
      onDoubleClick: (row, col) => {
        startEditing(row, col);
      },
      onSet: setValue,
      onCheck: (row, e) => {
        const record = records[row];
        if (!record) return;
        if (e.shiftKey && lastChecked.current !== null) {
          const [a, b] = [lastChecked.current, row].sort((x, y) => x - y) as [number, number];
          const next = new Set(tableStore.getState().selected);
          for (let i = a; i <= b; i++) {
            const id = records[i]?.id;
            if (id) next.add(id);
          }
          tableActions.setSelected(next);
        } else {
          tableActions.toggleSelected(record.id);
        }
        lastChecked.current = row;
      },
      onExpand: (id) => {
        const col = Math.max(
          0,
          columns.findIndex((c) => c.field.id === tableStore.getState().cursor?.field),
        );
        const row = rowIndex.get(id);
        if (row !== undefined) moveTo(row, col);
        tableActions.togglePanel(true);
      },
      renderEditor,
    }),
    [cellAt, moveTo, startEditing, setValue, records, columns, rowIndex, renderEditor],
  );

  // ── Range operations ───────────────────────────────────────────────────────

  const clearRange = () => {
    if (!rect) return;
    const updates = planClear(rect, records, columnFields);
    if (updates.length) tryRun('editRecords', { collectionId: collection.id, updates });
  };

  const fillDown = () => {
    if (!rect) return;
    const updates = planFillDown(rect, records, columnFields);
    if (updates.length) tryRun('editRecords', { collectionId: collection.id, updates });
  };

  const onCopy = (e: React.ClipboardEvent, cut = false) => {
    if (e.target !== e.currentTarget || !rect) return;
    e.preventDefault();
    e.clipboardData.setData(
      'text/plain',
      toTsv(copyCells(rect, records, columnFields, linkTitles)),
    );
    if (cut) clearRange();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (e.target !== e.currentTarget) return;
    // An empty table takes a paste at its first cell.
    const at = rect ?? (records.length === 0 ? { top: 0, bottom: 0, left: 0, right: 0 } : null);
    if (!at) return;
    e.preventDefault();
    const cells = parseTsv(e.clipboardData.getData('text/plain'));
    if (cells.length === 0) return;
    const plan = planPaste(cells, at, records, columnFields);
    if (plan.rows.length === 0) {
      if (plan.skipped)
        toast('Links and calculated fields can’t be pasted into.', { kind: 'error' });
      return;
    }
    const result = tryDispatch('setFromText', {
      collectionId: collection.id,
      rows: plan.rows,
      parse,
    });
    if (!result) return;
    const count = plan.rows.reduce((n, r) => n + Object.keys(r.texts).length, 0);
    const single = cells.length === 1 && cells[0]?.length === 1;
    if (!single || count > 1 || result.invalid || plan.skipped)
      toastWithUndo(pasteMessage(count, plan.added, result.invalid, plan.skipped));
    if (!single) {
      // Select what was pasted.
      const height = cells.length;
      const pastedWidth = Math.max(...cells.map((r) => r.length));
      const bottom = Math.min(at.top + height - 1, records.length - 1 + plan.added);
      const right = Math.min(at.left + pastedWidth - 1, columns.length - 1);
      const corner = cellAt(at.top, at.left);
      const end = cellAt(bottom, right);
      if (corner) tableStore.setState({ cursor: corner, anchor: end ?? null });
    }
  };

  // ── Keyboard ───────────────────────────────────────────────────────────────

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.nativeEvent.isComposing) return;
    const mod = e.metaKey || e.ctrlKey;
    const pos =
      rect && cursor
        ? {
            row: rowIndex.get(cursor.row) ?? 0,
            col: columns.findIndex((c) => c.field.id === cursor.field),
          }
        : null;

    if (!pos || pos.col < 0) {
      // Nothing selected yet: the first navigation key selects the first cell.
      if (records.length && /^(Arrow|Home|End|Page|Tab|Enter)/.test(e.key)) {
        e.preventDefault();
        moveTo(0, 0);
      }
      return;
    }

    const page = Math.max(
      1,
      Math.floor((scrollerRef.current?.clientHeight ?? 300) / rowHeight) - 2,
    );
    const next = navigate(
      pos,
      { key: e.key, mod, shift: e.shiftKey },
      { rows: records.length, cols: columns.length },
      page,
    );
    if (next && !e.altKey) {
      e.preventDefault();
      moveTo(next.row, next.col, e.shiftKey && e.key !== 'Tab');
      return;
    }

    switch (e.key) {
      case 'Enter':
      case 'F2':
        if (mod || e.shiftKey || e.altKey) return; // record shortcuts
        e.preventDefault();
        startEditing(pos.row, pos.col);
        return;
      case 'Escape':
        e.preventDefault();
        if (anchor) tableStore.setState({ anchor: null });
        else if (selected.size) tableActions.setSelected([]);
        else if (panelOpen) tableActions.togglePanel(false);
        else scrollerRef.current?.blur();
        return;
      case 'Delete':
      case 'Backspace':
        if (mod) return; // delete records
        e.preventDefault();
        clearRange();
        return;
      case 'a':
        if (mod) {
          e.preventDefault();
          const first = cellAt(0, 0);
          const last = cellAt(records.length - 1, columns.length - 1);
          if (first && last) tableStore.setState({ cursor: first, anchor: last });
          return;
        }
        break;
    }

    // Typing starts editing (rating cells take a digit directly). Space is the record panel.
    if (e.key.length === 1 && e.key !== ' ' && !mod && !e.altKey) {
      const column = columns[pos.col];
      const record = records[pos.row];
      if (!column || !record) return;
      e.preventDefault();
      e.stopPropagation(); // not a shortcut while the table has focus
      if (column.field.type === 'rating' && /^\d$/.test(e.key)) {
        const n = Number(e.key);
        if (n <= column.field.config.max) setValue(record, column.field, n || undefined);
        return;
      }
      if (isEditable(column.field) && hasEditor(column.field.type))
        startEditing(pos.row, pos.col, e.key);
    }
  };

  // ── Commands ───────────────────────────────────────────────────────────────

  const gridFocused = () => document.activeElement === scrollerRef.current;
  const targetIds = (): Id[] => {
    const { selected: checked, cursor: c } = tableStore.getState();
    if (checked.size) return records.filter((r) => checked.has(r.id)).map((r) => r.id);
    return c ? [c.row] : [];
  };

  const newRecord = () => {
    const id = tryDispatch('createRecord', { collectionId: collection.id });
    if (!id) return;
    const primary = columns[0]?.field.id;
    if (primary) {
      tableActions.edit({ row: id, field: primary });
      // The row is placed (by the view's sort) on the next render; scroll to it then.
      requestAnimationFrame(() => {
        const row = rowIndexRef.current.get(id);
        if (row !== undefined) virtualizer.scrollToIndex(row, { align: 'auto' });
      });
    }
  };

  useCommandHandlers({
    'record.new': { run: newRecord },
    'record.togglePanel': {
      run: () => {
        tableActions.togglePanel();
      },
      enabled: () => gridFocused() && tableStore.getState().cursor !== null,
    },
    'record.select': {
      run: () => {
        const c = tableStore.getState().cursor;
        if (c) tableActions.toggleSelected(c.row);
      },
      enabled: () => gridFocused() && tableStore.getState().cursor !== null,
    },
    'record.open': {
      run: () => {
        const c = tableStore.getState().cursor;
        if (c) setLocation(recordPath(collection.id, c.row));
      },
      enabled: () => tableStore.getState().cursor !== null,
    },
    'record.duplicate': {
      run: () => {
        duplicateRecords(collection.id, targetIds());
      },
      enabled: () => targetIds().length > 0,
    },
    'record.delete': {
      run: () => {
        onDeleteRecords(targetIds());
      },
      enabled: () => targetIds().length > 0 && tableStore.getState().editing === null,
    },
    'table.fillDown': { run: fillDown, enabled: () => gridFocused() && rect !== null },
  });

  // ── Header ─────────────────────────────────────────────────────────────────

  const headerActions: HeaderActions = {
    edit: (column) => {
      ui.openFieldEditor({ collectionId: collection.id, fieldId: column.field.id });
    },
    sort: (column, dir) => {
      tryRun('updateView', {
        id: view.id,
        changes: { sorts: [{ fieldId: column.field.id, dir }] },
      });
    },
    hide: (column) => {
      tryRun('setViewFields', {
        id: view.id,
        fields: view.fields.map((f) =>
          f.fieldId === column.field.id ? { ...f, hidden: true } : f,
        ),
      });
    },
    remove: (column) => {
      setDeletingField(column.field.id);
    },
    resize: (column, w, done) => {
      if (!done) {
        setLiveWidths((ws) => ({ ...ws, [column.field.id]: w }));
        return;
      }
      setLiveWidths({});
      tryRun('setViewFields', {
        id: view.id,
        fields: view.fields.map((f) => {
          if (f.fieldId !== column.field.id) return f;
          const rest = { ...f };
          delete rest.width;
          return w > 0 ? { ...rest, width: w } : rest;
        }),
      });
    },
  };

  const reorderColumns = (ids: string[]) => {
    const primary = collection.primaryFieldId;
    const visible = new Set(ids);
    const byId = new Map(view.fields.map((f) => [f.fieldId, f]));
    const ordered = [primary, ...ids].map((id) => byId.get(id)).filter((f) => f !== undefined);
    const rest = view.fields.filter((f) => f.fieldId !== primary && !visible.has(f.fieldId));
    tryRun('setViewFields', { id: view.id, fields: [...ordered, ...rest] });
  };

  if (!doc) return null;

  const allChecked = records.length > 0 && records.every((r) => selected.has(r.id));
  const panelRecord = panelOpen ? cursor?.row : undefined;
  const items = virtualizer.getVirtualItems();

  return (
    <div
      className={styles.scroller}
      ref={scrollerRef}
      tabIndex={0}
      role="grid"
      aria-label={`${collection.name}: ${view.name}`}
      aria-rowcount={records.length + 1}
      aria-colcount={columns.length}
      aria-multiselectable
      onKeyDown={onKeyDown}
      onCopy={onCopy}
      onCut={(e) => {
        onCopy(e, true);
      }}
      onPaste={onPaste}
      style={{ ['--row-height' as string]: `${String(rowHeight)}px` }}
    >
      <TableHeader
        columns={columns}
        width={width}
        sorts={view.sorts ?? []}
        allChecked={allChecked}
        someChecked={selected.size > 0}
        onCheckAll={() => {
          tableActions.setSelected(allChecked ? [] : records.map((r) => r.id));
        }}
        onReorder={reorderColumns}
        onAddField={() => {
          const last = columns.at(-1);
          ui.openFieldEditor({
            collectionId: collection.id,
            viewId: view.id,
            ...(last ? { afterFieldId: last.field.id } : {}),
          });
        }}
        actions={headerActions}
      />
      <div className={styles.body} style={{ height: virtualizer.getTotalSize(), width }}>
        {items.map((item) => {
          const record = records[item.index];
          if (!record) return null;
          const inRange = rect !== null && item.index >= rect.top && item.index <= rect.bottom;
          const isCursorRow = cursor?.row === record.id;
          return (
            <TableRow
              key={item.key}
              record={record}
              index={item.index}
              columns={columns}
              width={width}
              cursorCol={
                isCursorRow && rect ? columns.findIndex((c) => c.field.id === cursor.field) : -1
              }
              range={
                inRange && (rect.top !== rect.bottom || rect.left !== rect.right)
                  ? { left: rect.left, right: rect.right }
                  : null
              }
              editing={editing?.row === record.id ? editing : null}
              checked={selected.has(record.id)}
              active={panelRecord === record.id}
              format={format}
              linkTitles={linkTitles}
              handlers={handlers}
              style={{
                transform: `translateY(${String(item.start - virtualizer.options.scrollMargin)}px)`,
                height: rowHeight,
              }}
            />
          );
        })}
      </div>
      <button
        type="button"
        className={styles.newRow}
        style={{ width }}
        onClick={newRecord}
        tabIndex={-1}
      >
        <span className={styles.gutter}>
          <IconPlus size={14} />
        </span>
        <span>New record</span>
      </button>
      {records.length === 0 && <p className={styles.empty}>No records yet.</p>}
      {deletingField && (
        <DeleteFieldDialog
          fieldId={deletingField}
          onClose={() => {
            setDeletingField(null);
          }}
        />
      )}
    </div>
  );
}

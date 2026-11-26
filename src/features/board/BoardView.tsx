import {
  closestCorners,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Collection, Field, Id, RecordEntity, View } from '@/domain/schema/types';
import {
  boardColumns,
  columnOf,
  columnValue,
  movedOrder,
  type BoardColumn,
} from '@/domain/views/board';
import { useFormatContext } from '@/hooks/useFormatContext';
import { useCommandHandlers } from '@/keyboard/useCommandHandlers';
import { tryDispatch, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { toast } from '@/store/toastStore';
import { tableActions, tableStore, useTable } from '@/features/table/tableStore';
import { useReaders } from '@/features/table/useReaders';
import { BoardColumnView } from './BoardColumnView';
import { RecordCard } from './RecordCard';
import styles from './BoardView.module.scss';

interface BoardViewProps {
  collection: Collection;
  view: View;
  /** The view's records (filtered, searched, sorted). */
  records: readonly RecordEntity[];
  /** Opens a record (the panel on wide screens, its page on phones). */
  onOpen: (id: Id) => void;
}

/**
 * The board layout: a column per value of the group field. Drag cards between columns to change
 * the value and within one to reorder (while the view isn't sorted). Arrows move between cards,
 * Shift+arrows move the card, Enter opens it.
 */
export function BoardView({ collection, view, records, onOpen }: BoardViewProps) {
  const fields = useDocStore((s) => s.doc?.fields);
  const format = useFormatContext();
  const { links, formulas } = useReaders();
  const selected = useTable((s) => s.cursor?.row);
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Id | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  useEffect(() => {
    tableActions.forView(view.id);
  }, [view.id]);

  const field = view.board && fields ? fields[view.board.groupFieldId] : undefined;
  const columns = useMemo(
    () => (field ? boardColumns(view, field, records) : []),
    [view, field, records],
  );
  const cardFields = useMemo(
    () =>
      (view.board?.cardFields ?? [])
        .map((id) => fields?.[id])
        .filter((f): f is Field => f !== undefined),
    [view.board?.cardFields, fields],
  );

  const select = (id: Id) => {
    tableActions.moveTo({ row: id, field: collection.primaryFieldId });
  };
  const sorted = (view.sorts?.length ?? 0) > 0;

  /** Moves a card to a column, before a card (or at the column's end). */
  const move = (id: Id, toKey: string, beforeId: Id | null) => {
    if (!field) return;
    const record = records.find((r) => r.id === id);
    if (!record) return;
    const changesColumn = columnOf(record, field) !== toKey;
    if (!changesColumn && sorted) {
      toast('This view is sorted, so cards follow the sort.');
      return;
    }
    // "End of a column" is before the first card of the columns after it.
    let before = beforeId;
    if (before === null) {
      const index = columns.findIndex((c) => c.key === toKey);
      before = columns.slice(index + 1).find((c) => c.records.length)?.records[0]?.id ?? null;
    }
    tryRun('moveCard', {
      viewId: view.id,
      recordId: id,
      ...(changesColumn ? { values: { [field.id]: columnValue(field, toKey) } } : {}),
      ...(sorted ? {} : { cardOrder: movedOrder(columns, id, before) }),
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over || active.id === over.id) return;
    const id = String(active.id);
    const overData = over.data.current as { column?: string } | undefined;
    if (String(over.id).startsWith('column:')) {
      move(id, String(over.id).slice(7), null);
      return;
    }
    const toKey = overData?.column;
    if (toKey === undefined) return;
    const column = columns.find((c) => c.key === toKey);
    if (!column) return;
    const overIndex = column.records.findIndex((r) => r.id === over.id);
    const fromIndex = column.records.findIndex((r) => r.id === id);
    // Moving down within a column lands after the card it's over.
    const before =
      fromIndex >= 0 && fromIndex < overIndex
        ? (column.records[overIndex + 1]?.id ?? null)
        : String(over.id);
    move(id, toKey, before);
  };

  const locate = (id: Id | undefined): [number, number] | null => {
    if (!id) return null;
    for (let c = 0; c < columns.length; c++) {
      const r = columns[c]?.records.findIndex((x) => x.id === id) ?? -1;
      if (r >= 0) return [c, r];
    }
    return null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const at = locate(selected);
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dir = dirs[e.key];
    if (dir) {
      e.preventDefault();
      if (!at) {
        const first = columns.find((c) => c.records.length)?.records[0];
        if (first) select(first.id);
        return;
      }
      const [c, r] = at;
      const id = selected as Id;
      if (e.shiftKey) {
        // Move the card itself.
        if (dir[0] !== 0) {
          const target = columns[c + dir[0]];
          if (target) move(id, target.key, target.records[r]?.id ?? null);
        } else {
          const column = columns[c] as BoardColumn;
          const neighbor = r + dir[1];
          if (neighbor < 0 || neighbor >= column.records.length) return;
          const before =
            dir[1] < 0 ? column.records[neighbor]?.id : (column.records[neighbor + 1]?.id ?? null);
          move(id, column.key, before ?? null);
        }
        return;
      }
      let nc = c + dir[0];
      while (dir[0] !== 0 && columns[nc] && columns[nc]?.records.length === 0) nc += dir[0];
      const column = columns[nc];
      if (!column?.records.length) return;
      const target = column.records[Math.min(Math.max(0, r + dir[1]), column.records.length - 1)];
      if (target) select(target.id);
      return;
    }
    if (e.key === 'Enter' && selected) {
      e.preventDefault();
      onOpen(selected);
    }
  };

  useCommandHandlers({
    'record.togglePanel': {
      run: () => {
        tableActions.togglePanel();
      },
      enabled: () =>
        rootRef.current?.contains(document.activeElement) === true &&
        tableStore.getState().cursor !== null,
    },
  });

  if (!field) return <p className={styles.empty}>Pick a field to group the board by.</p>;
  const active = dragging ? records.find((r) => r.id === dragging) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active: a }) => {
        setDragging(String(a.id));
      }}
      onDragCancel={() => {
        setDragging(null);
      }}
      onDragEnd={onDragEnd}
    >
      <div
        ref={rootRef}
        className={styles.board}
        tabIndex={0}
        role="grid"
        aria-label={`${collection.name}: ${view.name}`}
        onKeyDown={onKeyDown}
      >
        {columns.map((column) => (
          <BoardColumnView
            key={column.key}
            column={column}
            field={field}
            cardFields={cardFields}
            format={format}
            links={links}
            formulas={formulas}
            selected={selected}
            dragging={dragging}
            onSelect={select}
            onOpen={onOpen}
            onAdd={() => {
              const id = tryDispatch('createRecord', {
                collectionId: collection.id,
                values: { [field.id]: columnValue(field, column.key) },
              });
              if (id) {
                select(id);
                onOpen(id);
              }
            }}
          />
        ))}
      </div>
      <DragOverlay>
        {active ? (
          <RecordCard
            record={active}
            fields={cardFields}
            format={format}
            links={links}
            formulas={formulas}
            className={styles.overlay}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { ActionIcon, Button } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Collection, Color, Field, Id, RecordEntity, View } from '@/domain/schema/types';
import { calendarMonth, dayValue, shiftedValues } from '@/domain/views/calendar';
import { useFormatContext } from '@/hooks/useFormatContext';
import {
  addDays,
  addMonthsToKey,
  diffDays,
  formatDate,
  monthKey,
  today as todayDate,
} from '@/lib/date';
import { tryDispatch, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { tableActions, useTable } from '@/features/table/tableStore';
import { useReaders } from '@/features/table/useReaders';
import { RecordCard } from '@/features/board/RecordCard';
import { CalendarDay } from './CalendarDay';
import styles from './CalendarView.module.scss';

interface CalendarViewProps {
  collection: Collection;
  view: View;
  records: readonly RecordEntity[];
  onOpen: (id: Id) => void;
}

const PHONE = '(max-width: 639.98px)';
const EDITABLE = new Set(['date', 'dateTime', 'dateRange']);

/**
 * The calendar layout: a month of days with each record on its date (ranges on every day they
 * cover). Drag a card to move its date. Arrows move between days, T jumps to today, [ and ]
 * change month, N adds a record on the focused day.
 */
export function CalendarView({ collection, view, records, onOpen }: CalendarViewProps) {
  const fields = useDocStore((s) => s.doc?.fields);
  const weekStartsOn = useDocStore((s) => s.doc?.settings.weekStartsOn ?? 0);
  const format = useFormatContext();
  const { links, formulas } = useReaders();
  const phone = useMediaQuery(PHONE);
  const selected = useTable((s) => s.cursor?.row);
  const today = todayDate();
  const [focused, setFocused] = useState(today);
  const month = monthKey(focused);
  const rootRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  useEffect(() => {
    tableActions.forView(view.id);
  }, [view.id]);

  const options = view.calendar;
  const field = options && fields ? fields[options.dateFieldId] : undefined;
  const endField = options?.endFieldId && fields ? fields[options.endFieldId] : undefined;
  const colorField = options?.colorFieldId && fields ? fields[options.colorFieldId] : undefined;
  const cardFields = useMemo(
    () =>
      (options?.cardFields ?? [])
        .map((id) => fields?.[id])
        .filter((f): f is Field => f !== undefined),
    [options?.cardFields, fields],
  );
  const placed = useMemo(
    () => (fields ? calendarMonth(view, fields, records, month, weekStartsOn) : null),
    [view, fields, records, month, weekStartsOn],
  );

  const colorOf = (record: RecordEntity): Color | undefined => {
    if (colorField?.type !== 'singleSelect') return undefined;
    const id = record.values[colorField.id];
    return colorField.config.options.find((o) => o.id === id)?.color;
  };
  const editable = field !== undefined && EDITABLE.has(field.type);

  const select = (id: Id) => {
    tableActions.moveTo({ row: id, field: collection.primaryFieldId });
  };
  const addOn = (day: string) => {
    if (!field || !editable) return;
    const id = tryDispatch('createRecord', {
      collectionId: collection.id,
      values: { [field.id]: dayValue(field, day) },
    });
    if (id) {
      select(id);
      onOpen(id);
    }
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || !field) return;
    const data = active.data.current as { recordId: Id; day: string } | undefined;
    const record = records.find((r) => r.id === data?.recordId);
    if (!data || !record) return;
    const delta = diffDays(data.day, String(over.id));
    if (delta === 0) return;
    const values = shiftedValues(record, field, delta, endField);
    if (values) tryRun('setRecordValues', { collectionId: collection.id, id: record.id, values });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const delta = step[e.key];
    let handled = true;
    if (delta !== undefined) setFocused(addDays(focused, delta));
    else if (e.key === 't' || e.key === 'T') setFocused(today);
    else if (e.key === '[') setFocused(`${addMonthsToKey(month, -1)}-01`);
    else if (e.key === ']') setFocused(`${addMonthsToKey(month, 1)}-01`);
    else if (e.key === 'n' || e.key === 'N') addOn(focused);
    else if (e.key === 'Enter') {
      const first = placed?.byDay.get(focused)?.[0];
      if (first) onOpen(first.record.id);
    } else handled = false;
    if (handled) {
      // These keys mean something here, not their app-wide shortcuts.
      e.preventDefault();
      e.stopPropagation();
    }
  };

  if (!field || !placed) return <p className={styles.empty}>Pick a date field for the calendar.</p>;

  const title = formatDate(`${month}-01`, format.locale, { month: 'long', year: 'numeric' });
  const weekdays = placed.days
    .slice(0, 7)
    .map((d) => formatDate(d, format.locale, { weekday: phone ? 'narrow' : 'short' }));
  const focusedEntries = placed.byDay.get(focused) ?? [];

  const card = (record: RecordEntity, prefix?: string, compact = false) => (
    <RecordCard
      record={record}
      fields={cardFields}
      format={format}
      links={links}
      formulas={formulas}
      compact={compact}
      prefix={prefix}
      color={colorOf(record)}
      selected={record.id === selected}
      onClick={() => {
        select(record.id);
      }}
      onDoubleClick={() => {
        onOpen(record.id);
      }}
    />
  );

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Previous month"
          onClick={() => {
            setFocused(`${addMonthsToKey(month, -1)}-01`);
          }}
        >
          <IconChevronLeft size={16} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Next month"
          onClick={() => {
            setFocused(`${addMonthsToKey(month, 1)}-01`);
          }}
        >
          <IconChevronRight size={16} />
        </ActionIcon>
        <h3 className={styles.title}>{title}</h3>
        <Button
          variant="default"
          size="xs"
          onClick={() => {
            setFocused(today);
          }}
        >
          Today
        </Button>
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div
          ref={rootRef}
          className={styles.grid}
          tabIndex={0}
          role="grid"
          aria-label={`${collection.name}: ${title}`}
          onKeyDown={onKeyDown}
        >
          {weekdays.map((d, i) => (
            <div key={`w${String(i)}`} className={styles.weekday} role="columnheader">
              {d}
            </div>
          ))}
          {placed.days.map((day) => (
            <CalendarDay
              key={day}
              day={day}
              inMonth={monthKey(day) === month}
              today={day === today}
              focused={day === focused}
              entries={placed.byDay.get(day) ?? []}
              compact={phone}
              draggable={editable}
              renderCard={(entry) => card(entry.record, entry.time, true)}
              onFocus={() => {
                setFocused(day);
              }}
              onAdd={
                editable
                  ? () => {
                      addOn(day);
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </DndContext>
      {(phone || placed.tray.length > 0) && (
        <div className={styles.below}>
          {phone && (
            <section>
              <h4>
                {formatDate(focused, format.locale, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </h4>
              {focusedEntries.length === 0 ? (
                <p className={styles.none}>Nothing</p>
              ) : (
                focusedEntries.map((e) => <div key={e.record.id}>{card(e.record, e.time)}</div>)
              )}
            </section>
          )}
          {placed.tray.length > 0 && (
            <section>
              <h4>This month, no day ({placed.tray.length})</h4>
              <div className={styles.tray}>
                {placed.tray.map((r) => (
                  <div key={r.id}>{card(r)}</div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

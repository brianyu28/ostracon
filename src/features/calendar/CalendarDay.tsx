import { useDraggable, useDroppable } from '@dnd-kit/core';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import type { CalendarEntry } from '@/domain/views/calendar';
import styles from './CalendarView.module.scss';

interface CalendarDayProps {
  day: string;
  inMonth: boolean;
  today: boolean;
  focused: boolean;
  entries: readonly CalendarEntry[];
  /** Phones: a count instead of the cards. */
  compact: boolean;
  draggable: boolean;
  renderCard: (entry: CalendarEntry) => ReactNode;
  onFocus: () => void;
  /** Adds a record on this day (double-click), when the date can be set. */
  onAdd: (() => void) | undefined;
}

/** One day of the month grid: a drop target holding that day's cards. */
export function CalendarDay({
  day,
  inMonth,
  today,
  focused,
  entries,
  compact,
  draggable,
  renderCard,
  onFocus,
  onAdd,
}: CalendarDayProps) {
  const { setNodeRef, isOver } = useDroppable({ id: day });
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-selected={focused}
      aria-label={day}
      className={clsx(
        styles.day,
        !inMonth && styles.outside,
        focused && styles.focused,
        isOver && styles.over,
      )}
      onClick={onFocus}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) onAdd?.();
      }}
    >
      <span className={clsx(styles.number, today && styles.today)}>{Number(day.slice(8))}</span>
      {compact ? (
        entries.length > 0 && <span className={styles.dot}>{entries.length}</span>
      ) : (
        <div className={styles.entries}>
          {entries.map((entry) => (
            <DraggableEntry key={entry.record.id} entry={entry} day={day} enabled={draggable}>
              {renderCard(entry)}
            </DraggableEntry>
          ))}
        </div>
      )}
    </div>
  );
}

function DraggableEntry({
  entry,
  day,
  enabled,
  children,
}: {
  entry: CalendarEntry;
  day: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, attributes, listeners, isDragging, transform } = useDraggable({
    id: `${entry.record.id}@${day}`,
    data: { recordId: entry.record.id, day },
    disabled: !enabled,
  });
  return (
    <div
      ref={setNodeRef}
      className={clsx(styles.entry, isDragging && styles.lifting)}
      style={
        transform
          ? { transform: `translate(${String(transform.x)}px, ${String(transform.y)}px)` }
          : undefined
      }
      {...attributes}
      {...listeners}
      tabIndex={-1}
    >
      {children}
    </div>
  );
}

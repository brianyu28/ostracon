import { ActionIcon } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import {
  addDays,
  addMonthsToKey,
  dayOfWeek,
  daysInMonth,
  makeDate,
  monthKey,
  today as todayDate,
  type ISODate,
} from '@/lib/date';
import styles from './MiniCalendar.module.scss';

interface MiniCalendarProps {
  /** Highlighted dates (a value, or a range's start and end). */
  selected?: readonly ISODate[];
  /** Dates between the first two selected ones are shaded (ranges). */
  range?: boolean;
  onPick: (date: ISODate) => void;
  locale: string;
  /** Monday-first weeks when 1. */
  weekStart?: 0 | 1;
}

/** A small month grid for picking a date. */
export function MiniCalendar({
  selected = [],
  range,
  onPick,
  locale,
  weekStart = 0,
}: MiniCalendarProps) {
  const today = todayDate();
  const [month, setMonth] = useState(() => monthKey(selected[0] ?? today));
  const [year, m] = month.split('-').map(Number) as [number, number];
  const first = makeDate(year, m, 1);
  const lead = (dayOfWeek(first) - weekStart + 7) % 7;
  const start = addDays(first, -lead);
  const weeks = Math.ceil((lead + daysInMonth(year, m)) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  const [lo, hi] = [selected[0], selected[1] ?? selected[0]].sort() as [ISODate?, ISODate?];
  const title = new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2026, 10, 1 + ((i + weekStart) % 7))).toLocaleDateString(locale, {
      weekday: 'narrow',
      timeZone: 'UTC',
    }),
  );
  return (
    <div
      className={styles.root}
      onMouseDown={(e) => {
        // Keep focus in the input that opened the calendar.
        e.preventDefault();
      }}
    >
      <div className={styles.header}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Previous month"
          onClick={() => {
            setMonth(addMonthsToKey(month, -1));
          }}
        >
          <IconChevronLeft size={14} />
        </ActionIcon>
        <span className={styles.title}>{title}</span>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Next month"
          onClick={() => {
            setMonth(addMonthsToKey(month, 1));
          }}
        >
          <IconChevronRight size={14} />
        </ActionIcon>
      </div>
      <div className={styles.grid} role="grid">
        {weekdays.map((d, i) => (
          <span key={`w${String(i)}`} className={styles.weekday}>
            {d}
          </span>
        ))}
        {days.map((date) => (
          <button
            key={date}
            type="button"
            tabIndex={-1}
            className={clsx(
              styles.day,
              monthKey(date) !== month && styles.outside,
              date === today && styles.today,
              selected.includes(date) && styles.selected,
              range && lo && hi && date > lo && date < hi && styles.inRange,
            )}
            onClick={() => {
              onPick(date);
            }}
          >
            {Number(date.slice(8))}
          </button>
        ))}
      </div>
    </div>
  );
}

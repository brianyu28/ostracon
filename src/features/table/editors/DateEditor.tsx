import { Popover } from '@mantine/core';
import { clsx } from 'clsx';
import { useState } from 'react';
import { MiniCalendar } from '@/components/MiniCalendar/MiniCalendar';
import { INVALID } from '@/domain/fields/model';
import { fieldType } from '@/domain/fields/registry';
import type { DateRangeValue, Field, Value } from '@/domain/schema/types';
import { partialStart, type PartialDate } from '@/lib/partialDate';
import { editText } from './editText';
import { exitKey, useEditorSession } from './useEditorSession';
import type { EditorProps } from './types';
import styles from './Editors.module.scss';

/** Dates shown as selected in the calendar for a parsed value. */
function calendarDates(field: Field, value: Value | undefined): string[] {
  if (value === undefined) return [];
  if (field.type === 'dateRange') {
    const range = value as DateRangeValue;
    return [range.start, ...(range.end ? [range.end] : [])].map((d) => partialStart(d));
  }
  if (field.type === 'dateTime') return [(value as string).slice(0, 10)];
  return [partialStart(value as PartialDate)];
}

/**
 * Dates, date-times and ranges: type them (`2024-03`, `today`, `-3d`, `Nov 26`) with a live
 * preview of what will be saved, or pick days on the calendar.
 */
export function DateEditor(props: EditorProps) {
  const { field, value, variant, format, parse, settings, onCommit, onCancel } = props;
  const original = value === undefined ? '' : editText({ field, value });
  const [text, setText] = useState(() => editText(props));
  /** First day picked for a range while waiting for the second. */
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const def = fieldType(field);
  const parsed = def.parse(text, field, parse);
  const invalid = parsed === INVALID;
  const change = invalid || text === original ? null : ({ kind: 'value', value: parsed } as const);
  const session = useEditorSession(change, onCommit, onCancel, props.saveOnClose);
  const preview = invalid
    ? 'Not a date'
    : parsed === undefined
      ? 'Empty'
      : def.format(parsed, field, { ...format, dateStyle: 'medium' }, 'display');

  const pick = (date: string) => {
    if (field.type === 'date') {
      session.commit({ kind: 'value', value: date });
    } else if (field.type === 'dateTime') {
      const time = typeof parsed === 'string' ? parsed.slice(11) : '';
      setText(time ? `${date} ${time}` : `${date} 12:00`);
    } else if (rangeStart === null) {
      setRangeStart(date);
      setText(date);
    } else {
      const [start, end] = [rangeStart, date].sort() as [string, string];
      session.commit({ kind: 'value', value: start === end ? { start } : { start, end } });
    }
  };

  return (
    <Popover
      opened
      position="bottom-start"
      offset={2}
      withinPortal
      trapFocus={false}
      shadow="md"
      closeOnEscape={false}
      onDismiss={() => {
        // A click outside saves, like Enter.
        if (invalid) session.cancel();
        else session.commit(change);
      }}
    >
      <Popover.Target>
        <input
          className={clsx(
            styles.input,
            variant === 'cell' && styles.cellInput,
            invalid && styles.invalid,
          )}
          value={text}
          autoFocus
          aria-label={field.name}
          aria-invalid={invalid}
          onChange={(e) => {
            setText(e.currentTarget.value);
            setRangeStart(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              session.cancel();
              return;
            }
            const exit = exitKey(e);
            if (exit === undefined || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (!invalid) session.commit(change, exit);
          }}
          onFocus={(e) => {
            if (variant === 'panel' && props.initial === undefined) e.currentTarget.select();
          }}
        />
      </Popover.Target>
      <Popover.Dropdown className={styles.dropdown}>
        <div className={clsx(styles.preview, invalid && styles.previewInvalid)}>
          {rangeStart ? 'Pick the last day' : preview}
        </div>
        <MiniCalendar
          // Jumps to the month of the date being typed.
          key={(rangeStart ?? calendarDates(field, invalid ? undefined : parsed)[0] ?? '').slice(
            0,
            7,
          )}
          selected={rangeStart ? [rangeStart] : calendarDates(field, invalid ? undefined : parsed)}
          range={field.type === 'dateRange'}
          locale={format.locale}
          weekStart={settings.weekStartsOn}
          onPick={pick}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

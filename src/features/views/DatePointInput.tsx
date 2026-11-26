import { NumberInput, Select, TextInput } from '@mantine/core';
import { useState } from 'react';
import type { DatePoint, DateUnit } from '@/domain/schema/types';
import { useParseContext } from '@/hooks/useParseContext';
import { parsePartialDate } from '@/lib/parseDate';
import { UNITS } from './units';
import styles from './ViewToolbar.module.scss';

type Mode = 'today' | 'yesterday' | 'tomorrow' | 'ago' | 'fromNow' | 'exact';

const MODES: { value: Mode; label: string }[] = [
  { value: 'today', label: 'today' },
  { value: 'yesterday', label: 'yesterday' },
  { value: 'tomorrow', label: 'tomorrow' },
  { value: 'ago', label: 'ago…' },
  { value: 'fromNow', label: 'from now…' },
  { value: 'exact', label: 'exact date…' },
];

function modeOf(point: DatePoint | undefined): Mode {
  if (!point) return 'today';
  if (point.kind === 'absolute') return 'exact';
  if (point.offset === 0) return 'today';
  if (point.unit === 'day' && point.offset === -1) return 'yesterday';
  if (point.unit === 'day' && point.offset === 1) return 'tomorrow';
  return point.offset < 0 ? 'ago' : 'fromNow';
}

/** A date for a condition: today, some time ago or from now, or an exact (partial) date. */
export function DatePointInput({
  value,
  onChange,
}: {
  value: DatePoint | undefined;
  onChange: (value: DatePoint | undefined) => void;
}) {
  const parse = useParseContext();
  const [mode, setMode] = useState<Mode>(() => modeOf(value));
  const [text, setText] = useState(value?.kind === 'absolute' ? value.date : '');
  const relative = value?.kind === 'relative' ? value : undefined;
  const amount = relative ? Math.abs(relative.offset) : 1;
  const unit = relative?.unit ?? 'day';
  const parsedDate = parsePartialDate(text, { ...parse, allowPartial: true });

  const setRelative = (n: number, u: DateUnit, sign: number) => {
    onChange({ kind: 'relative', offset: sign * n, unit: u });
  };
  const pickMode = (m: Mode) => {
    setMode(m);
    if (m === 'today') onChange({ kind: 'relative', offset: 0, unit: 'day' });
    else if (m === 'yesterday') onChange({ kind: 'relative', offset: -1, unit: 'day' });
    else if (m === 'tomorrow') onChange({ kind: 'relative', offset: 1, unit: 'day' });
    else if (m === 'ago') setRelative(amount, unit, -1);
    else if (m === 'fromNow') setRelative(amount, unit, 1);
    else onChange(parsedDate ? { kind: 'absolute', date: parsedDate } : undefined);
  };
  return (
    <div className={styles.pair}>
      {(mode === 'ago' || mode === 'fromNow') && (
        <>
          <NumberInput
            size="xs"
            className={styles.amount}
            aria-label="Amount"
            min={1}
            value={amount}
            onChange={(n) => {
              if (typeof n === 'number' && n >= 1) setRelative(n, unit, mode === 'ago' ? -1 : 1);
            }}
          />
          <Select
            size="xs"
            comboboxProps={{ withinPortal: false }}
            className={styles.unit}
            aria-label="Unit"
            data={UNITS}
            value={unit}
            allowDeselect={false}
            onChange={(u) => {
              if (u) setRelative(amount, u, mode === 'ago' ? -1 : 1);
            }}
          />
        </>
      )}
      <Select
        size="xs"
        comboboxProps={{ withinPortal: false }}
        className={styles.mode}
        aria-label="Date"
        data={MODES}
        value={mode}
        allowDeselect={false}
        onChange={(m) => {
          if (m) pickMode(m);
        }}
      />
      {mode === 'exact' && (
        <TextInput
          size="xs"
          aria-label="Exact date"
          placeholder="2024-03-14, Mar 2024, 2019"
          value={text}
          error={text.trim() !== '' && !parsedDate}
          onChange={(e) => {
            const t = e.currentTarget.value;
            setText(t);
            const d = parsePartialDate(t, { ...parse, allowPartial: true });
            onChange(d ? { kind: 'absolute', date: d } : undefined);
          }}
        />
      )}
    </div>
  );
}

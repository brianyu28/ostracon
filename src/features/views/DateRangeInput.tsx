import { NumberInput, Select, TextInput } from '@mantine/core';
import { useState } from 'react';
import type { DateRangeOperand, DateUnit } from '@/domain/schema/types';
import { useParseContext } from '@/hooks/useParseContext';
import { parsePartialDate } from '@/lib/parseDate';
import { UNITS } from './units';
import styles from './ViewToolbar.module.scss';

type Mode = 'past' | 'next' | 'this' | 'last' | 'nextPeriod' | 'toDate' | 'between';
type Period = 'week' | 'month' | 'quarter' | 'year';

const MODES: { value: Mode; label: string }[] = [
  { value: 'past', label: 'the past…' },
  { value: 'next', label: 'the next…' },
  { value: 'this', label: 'this…' },
  { value: 'last', label: 'last…' },
  { value: 'nextPeriod', label: 'next…' },
  { value: 'toDate', label: '… to date' },
  { value: 'between', label: 'between dates…' },
];

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'week' },
  { value: 'month', label: 'month' },
  { value: 'quarter', label: 'quarter' },
  { value: 'year', label: 'year' },
];

function modeOf(range: DateRangeOperand | undefined): Mode {
  if (!range) return 'past';
  switch (range.kind) {
    case 'rolling':
      return range.direction;
    case 'period':
      return range.offset === 0 ? 'this' : range.offset < 0 ? 'last' : 'nextPeriod';
    case 'toDate':
      return 'toDate';
    case 'absolute':
      return 'between';
  }
}

/** A span of dates for "is within": rolling, a calendar period, to date, or between two dates. */
export function DateRangeInput({
  value,
  onChange,
}: {
  value: DateRangeOperand | undefined;
  onChange: (value: DateRangeOperand | undefined) => void;
}) {
  const parse = useParseContext();
  const [mode, setMode] = useState<Mode>(() => modeOf(value));
  const amount = value?.kind === 'rolling' ? value.amount : 7;
  const unit: DateUnit = value?.kind === 'rolling' ? value.unit : 'day';
  const period: Period =
    value?.kind === 'period' || value?.kind === 'toDate' ? value.unit : 'month';
  const [startText, setStartText] = useState(value?.kind === 'absolute' ? (value.start ?? '') : '');
  const [endText, setEndText] = useState(value?.kind === 'absolute' ? (value.end ?? '') : '');
  const date = (t: string) => parsePartialDate(t, { ...parse, allowPartial: true });

  const emit = (
    m: Mode,
    opts: { amount?: number; unit?: DateUnit; period?: Period; start?: string; end?: string } = {},
  ) => {
    const a = opts.amount ?? amount;
    const u = opts.unit ?? unit;
    const p = opts.period ?? period;
    switch (m) {
      case 'past':
      case 'next':
        onChange({ kind: 'rolling', direction: m, amount: a, unit: u, includeToday: true });
        break;
      case 'this':
        onChange({ kind: 'period', unit: p, offset: 0 });
        break;
      case 'last':
        onChange({ kind: 'period', unit: p, offset: -1 });
        break;
      case 'nextPeriod':
        onChange({ kind: 'period', unit: p, offset: 1 });
        break;
      case 'toDate':
        onChange({ kind: 'toDate', unit: p });
        break;
      case 'between': {
        const s = date(opts.start ?? startText);
        const e = date(opts.end ?? endText);
        onChange(
          s || e
            ? { kind: 'absolute', ...(s ? { start: s } : {}), ...(e ? { end: e } : {}) }
            : undefined,
        );
      }
    }
  };

  return (
    <div className={styles.pair}>
      <Select
        size="xs"
        comboboxProps={{ withinPortal: false }}
        className={styles.mode}
        aria-label="Range"
        data={MODES}
        value={mode}
        allowDeselect={false}
        onChange={(m) => {
          if (!m) return;
          setMode(m);
          emit(m);
        }}
      />
      {(mode === 'past' || mode === 'next') && (
        <>
          <NumberInput
            size="xs"
            className={styles.amount}
            aria-label="Amount"
            min={1}
            value={amount}
            onChange={(n) => {
              if (typeof n === 'number' && n >= 1) emit(mode, { amount: n });
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
              if (u) emit(mode, { unit: u });
            }}
          />
        </>
      )}
      {(mode === 'this' || mode === 'last' || mode === 'nextPeriod' || mode === 'toDate') && (
        <Select
          size="xs"
          comboboxProps={{ withinPortal: false }}
          className={styles.unit}
          aria-label="Period"
          data={PERIODS}
          value={period}
          allowDeselect={false}
          onChange={(p) => {
            if (p) emit(mode, { period: p });
          }}
        />
      )}
      {mode === 'between' && (
        <>
          <TextInput
            size="xs"
            className={styles.dateText}
            aria-label="From"
            placeholder="From"
            value={startText}
            error={startText.trim() !== '' && !date(startText)}
            onChange={(e) => {
              setStartText(e.currentTarget.value);
              emit('between', { start: e.currentTarget.value });
            }}
          />
          <TextInput
            size="xs"
            className={styles.dateText}
            aria-label="To"
            placeholder="To"
            value={endText}
            error={endText.trim() !== '' && !date(endText)}
            onChange={(e) => {
              setEndText(e.currentTarget.value);
              emit('between', { end: e.currentTarget.value });
            }}
          />
        </>
      )}
    </div>
  );
}

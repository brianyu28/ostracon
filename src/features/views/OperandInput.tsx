import { MultiSelect, TextInput } from '@mantine/core';
import { useMemo, useState } from 'react';
import type { OperandKind } from '@/domain/fields/operators';
import { INVALID } from '@/domain/fields/model';
import { fieldType } from '@/domain/fields/registry';
import { iterateRecords } from '@/domain/model';
import { recordTitle } from '@/domain/records';
import type { DatePoint, DateRangeOperand, Field } from '@/domain/schema/types';
import { useParseContext } from '@/hooks/useParseContext';
import { useDocStore } from '@/store/docStore';
import { DatePointInput } from './DatePointInput';
import { DateRangeInput } from './DateRangeInput';
import styles from './ViewToolbar.module.scss';

interface OperandInputProps {
  field: Field;
  kind: OperandKind;
  value: unknown;
  onChange: (value: unknown) => void;
}

/** The input for a condition's operand, by the kind of operand its operator takes. */
export function OperandInput({ field, kind, value, onChange }: OperandInputProps) {
  switch (kind) {
    case 'none':
      return null;
    case 'text':
      return (
        <TextInput
          size="xs"
          aria-label="Value"
          placeholder="Value"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => {
            onChange(e.currentTarget.value || undefined);
          }}
        />
      );
    case 'number':
      return <NumberText field={field} value={value} onChange={onChange} />;
    case 'numberRange': {
      const [lo, hi] = Array.isArray(value) ? (value as [number, number]) : [undefined, undefined];
      return (
        <div className={styles.pair}>
          <NumberText
            field={field}
            value={lo}
            onChange={(v) => {
              onChange(
                typeof v === 'number' && typeof hi === 'number'
                  ? [v, hi]
                  : v === undefined
                    ? undefined
                    : [v, hi ?? v],
              );
            }}
          />
          <span className={styles.and}>and</span>
          <NumberText
            field={field}
            value={hi}
            onChange={(v) => {
              onChange(typeof v === 'number' ? [lo ?? v, v] : undefined);
            }}
          />
        </div>
      );
    }
    case 'options':
      return field.type === 'singleSelect' || field.type === 'multiSelect' ? (
        <MultiSelect
          size="xs"
          comboboxProps={{ withinPortal: false }}
          aria-label="Options"
          placeholder={Array.isArray(value) && value.length ? undefined : 'Pick options'}
          data={field.config.options.map((o) => ({ value: o.id, label: o.name }))}
          value={Array.isArray(value) ? (value as string[]) : []}
          searchable
          onChange={(ids) => {
            onChange(ids.length ? ids : undefined);
          }}
        />
      ) : null;
    case 'records':
      return field.type === 'link' ? (
        <RecordsInput
          targetId={field.config.targetCollectionId}
          value={value}
          onChange={onChange}
        />
      ) : null;
    case 'datePoint':
      return <DatePointInput value={value as DatePoint | undefined} onChange={onChange} />;
    case 'dateRange':
      return <DateRangeInput value={value as DateRangeOperand | undefined} onChange={onChange} />;
  }
}

/** Number text read by the field's type ("25%", "1:30", "$12"); counts read plain numbers. */
function NumberText({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const parse = useParseContext();
  const numeric = field.type === 'number' || field.type === 'rating' || field.type === 'duration';
  const shown = (v: unknown) =>
    typeof v !== 'number'
      ? ''
      : numeric
        ? fieldType(field).format(
            v,
            field,
            { locale: parse.locale, defaultCurrency: 'USD', dateStyle: 'iso' },
            'raw',
          )
        : String(v);
  const [text, setText] = useState(() => shown(value));
  const read = (t: string): number | undefined | typeof INVALID => {
    if (!t.trim()) return undefined;
    if (!numeric) return /^\d+$/.test(t.trim()) ? Number(t) : INVALID;
    const v = fieldType(field).parse(t, field, parse);
    return typeof v === 'number' ? v : v === undefined ? undefined : INVALID;
  };
  const parsed = read(text);
  return (
    <TextInput
      size="xs"
      aria-label="Number"
      placeholder="Number"
      className={styles.number}
      value={text}
      error={parsed === INVALID}
      onChange={(e) => {
        const t = e.currentTarget.value;
        setText(t);
        const v = read(t);
        if (v !== INVALID) onChange(v);
      }}
    />
  );
}

/** Records of a link's target collection, by title. */
function RecordsInput({
  targetId,
  value,
  onChange,
}: {
  targetId: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const doc = useDocStore((s) => s.doc);
  const data = useMemo(
    () =>
      doc
        ? [...iterateRecords(doc, targetId)]
            .map((r) => ({ value: r.id, label: recordTitle(doc, r) }))
            .sort((a, b) => a.label.localeCompare(b.label))
        : [],
    [doc, targetId],
  );
  return (
    <MultiSelect
      size="xs"
      comboboxProps={{ withinPortal: false }}
      aria-label="Records"
      placeholder={Array.isArray(value) && value.length ? undefined : 'Pick records'}
      data={data}
      value={Array.isArray(value) ? (value as string[]) : []}
      searchable
      limit={50}
      onChange={(ids) => {
        onChange(ids.length ? ids : undefined);
      }}
    />
  );
}

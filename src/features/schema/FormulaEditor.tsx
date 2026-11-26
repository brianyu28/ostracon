import { Text } from '@mantine/core';
import { clsx } from 'clsx';
import { useMemo, useRef, useState } from 'react';
import { FieldTypeIcon } from '@/components/FieldTypeIcon/FieldTypeIcon';
import type { FormatContext } from '@/domain/fields/model';
import { checkExpression, type FormulaField } from '@/domain/formulas/compile';
import { fieldRef, toStored } from '@/domain/formulas/expression';
import { FUNCTIONS } from '@/domain/formulas/functions';
import type { Field, Id, NumberFormat } from '@/domain/schema/types';
import { useDocStore } from '@/store/docStore';
import { NumberFormatEditor } from './FieldConfigEditor';
import styles from './FieldEditor.module.scss';

interface FormulaEditorProps {
  /** The formula being edited (absent for a new field). */
  fieldId: Id | undefined;
  collectionId: Id;
  /** The expression with field names, as typed. */
  expression: string;
  number: NumberFormat | undefined;
  format: FormatContext;
  onChange: (expression: string, number: NumberFormat | undefined) => void;
}

interface Suggestion {
  kind: 'field' | 'function';
  label: string;
  insert: string;
  detail: string;
  field?: Field;
}

const TYPE_LABELS = {
  number: 'Number',
  text: 'Text',
  date: 'Date',
  boolean: 'Yes / no',
  blank: 'Empty',
};

/**
 * A formula with field names in {braces}: checked as you type (result type, or the problem and
 * where it is), with autocomplete for fields (after `{`) and functions.
 */
export function FormulaEditor({
  fieldId,
  collectionId,
  expression,
  number,
  format,
  onChange,
}: FormulaEditorProps) {
  const fieldsMap = useDocStore((s) => s.doc?.fields);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(expression.length);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const fields = useMemo(
    () =>
      Object.values(fieldsMap ?? {})
        .filter((f) => f.collectionId === collectionId && f.id !== fieldId)
        .sort((a, b) => a.order - b.order),
    [fieldsMap, collectionId, fieldId],
  );

  const check = useMemo(() => {
    if (!fieldsMap || !expression.trim()) return null;
    const self: FormulaField = {
      id: fieldId ?? 'fld_draftformula',
      collectionId,
      name: 'This formula',
      order: 0,
      type: 'formula',
      config: { expression: '' },
      createdAt: '',
      updatedAt: '',
    };
    return checkExpression(fieldsMap, self, toStored(expression, fields));
  }, [fieldsMap, fieldId, collectionId, expression, fields]);

  // What's being typed at the caret: a field name after an open `{`, or a function name.
  const suggestions = useMemo((): { from: number; items: Suggestion[] } => {
    const before = expression.slice(0, caret);
    const open = before.lastIndexOf('{');
    if (open > before.lastIndexOf('}')) {
      const prefix = before.slice(open + 1).toLowerCase();
      return {
        from: open,
        items: fields
          .filter((f) => f.name.toLowerCase().includes(prefix))
          .slice(0, 8)
          .map((f) => ({
            kind: 'field',
            label: f.name,
            insert: fieldRef(f.name),
            detail: '',
            field: f,
          })),
      };
    }
    const word = /[A-Za-z_]+$/.exec(before);
    if (!word || /["'\d]/.test(before.slice(-word[0].length - 1, -word[0].length)))
      return { from: caret, items: [] };
    const prefix = word[0].toUpperCase();
    return {
      from: caret - word[0].length,
      items: [...FUNCTIONS.values()]
        .filter((f) => f.name.startsWith(prefix))
        .slice(0, 8)
        .map((f) => ({
          kind: 'function',
          label: f.signature,
          insert: `${f.name}(`,
          detail: f.description,
        })),
    };
  }, [expression, caret, fields]);

  const open = !dismissed && suggestions.items.length > 0;
  const activeIndex = Math.min(active, suggestions.items.length - 1);

  const apply = (s: Suggestion) => {
    const next = expression.slice(0, suggestions.from) + s.insert + expression.slice(caret);
    const position = suggestions.from + s.insert.length;
    onChange(next, number);
    setCaret(position);
    requestAnimationFrame(() => {
      ref.current?.setSelectionRange(position, position);
      ref.current?.focus();
    });
  };

  const error = check && !check.ok ? check.error : null;
  return (
    <div className={styles.formula}>
      <label className={styles.formulaLabel} htmlFor="formula-expression">
        Formula
      </label>
      <textarea
        id="formula-expression"
        ref={ref}
        className={clsx(styles.formulaInput, error && styles.formulaInvalid)}
        value={expression}
        rows={3}
        spellCheck={false}
        placeholder="e.g. DATEDIFF({Started}, {Finished})"
        onChange={(e) => {
          onChange(e.currentTarget.value, number);
          setCaret(e.currentTarget.selectionStart);
          setDismissed(false);
          setActive(0);
        }}
        onSelect={(e) => {
          setCaret(e.currentTarget.selectionStart);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          const item = suggestions.items[activeIndex];
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const n = suggestions.items.length;
            setActive((activeIndex + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
          } else if ((e.key === 'Enter' || e.key === 'Tab') && item) {
            e.preventDefault();
            apply(item);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setDismissed(true);
          }
        }}
      />
      {open && (
        <div className={styles.suggestions} role="listbox" aria-label="Suggestions">
          {suggestions.items.map((s, i) => (
            <div
              key={s.label}
              role="option"
              aria-selected={i === activeIndex}
              className={clsx(styles.suggestion, i === activeIndex && styles.suggestionActive)}
              onMouseDown={(e) => {
                e.preventDefault();
                apply(s);
              }}
            >
              {s.field ? (
                <FieldTypeIcon type={s.field.type} />
              ) : (
                <span className={styles.fx}>ƒ</span>
              )}
              <span className={styles.suggestionLabel}>{s.label}</span>
              {s.detail && <span className={styles.suggestionDetail}>{s.detail}</span>}
            </div>
          ))}
        </div>
      )}
      {error ? (
        <Text size="xs" c="red">
          {error.message}
          {expression.slice(error.at, Math.max(error.end, error.at + 1)).trim() &&
            ` — near “${expression.slice(error.at, Math.max(error.end, error.at + 1))}”`}
        </Text>
      ) : check?.ok ? (
        <Text size="xs" c="dimmed">
          Result: {TYPE_LABELS[check.info.type]}
        </Text>
      ) : (
        <Text size="xs" c="dimmed">
          Field names go in {'{braces}'}; type a letter for functions.
        </Text>
      )}
      {check?.ok && check.info.type === 'number' && (
        <NumberFormatEditor
          type="number"
          config={number ?? { style: 'plain' }}
          format={format}
          onChange={(next) => {
            onChange(expression, next as NumberFormat);
          }}
        />
      )}
    </div>
  );
}

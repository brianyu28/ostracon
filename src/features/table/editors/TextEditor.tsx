import { clsx } from 'clsx';
import { useState } from 'react';
import { INVALID } from '@/domain/fields/model';
import { fieldType } from '@/domain/fields/registry';
import { editText } from './editText';
import { exitKey, useEditorSession } from './useEditorSession';
import type { EditorProps } from './types';
import styles from './Editors.module.scss';

/**
 * Plain text input for scalar types (text, numbers, durations, ratings, URLs, email, phone).
 * Input is parsed by the field's type; invalid text is marked and isn't saved.
 */
export function TextEditor(props: EditorProps) {
  const { field, value, variant, parse, onCommit, onCancel } = props;
  const original = value === undefined ? '' : editText({ field, value });
  const [text, setText] = useState(() => editText(props));
  const def = fieldType(field);
  const parsed = def.parse(text, field, parse);
  const invalid = parsed === INVALID;
  const multiline = field.type === 'text' && field.config.multiline === true;
  const change = invalid || text === original ? null : ({ kind: 'value', value: parsed } as const);
  const session = useEditorSession(change, onCommit, onCancel, props.saveOnClose);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      session.cancel();
      return;
    }
    if (e.key === 'Enter' && (e.shiftKey || e.altKey) && multiline) return; // new line
    const exit = exitKey(e);
    if (exit === undefined || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (invalid) return;
    session.commit(change, exit);
  };

  const common = {
    className: clsx(
      styles.input,
      variant === 'cell' && styles.cellInput,
      invalid && styles.invalid,
    ),
    value: text,
    autoFocus: true,
    'aria-label': field.name,
    'aria-invalid': invalid,
    title: invalid ? `Not a valid ${def.label.toLowerCase()}` : undefined,
    onKeyDown,
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // In a cell the caret goes after the text (typed or existing); in the panel the value is
      // selected so typing replaces it.
      const el = e.currentTarget;
      if (variant === 'panel' && props.initial === undefined) el.select();
      else el.setSelectionRange(el.value.length, el.value.length);
    },
  };
  return multiline ? (
    <textarea
      {...common}
      rows={Math.min(10, Math.max(4, text.split('\n').length + 1))}
      onChange={(e) => {
        setText(e.currentTarget.value);
      }}
    />
  ) : (
    <input
      {...common}
      inputMode={field.type === 'number' || field.type === 'rating' ? 'decimal' : undefined}
      onChange={(e) => {
        setText(e.currentTarget.value);
      }}
    />
  );
}

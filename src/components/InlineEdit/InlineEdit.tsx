import { TextInput } from '@mantine/core';
import { clsx } from 'clsx';
import { useState } from 'react';
import styles from './InlineEdit.module.scss';

interface InlineEditProps {
  value: string;
  onCommit: (value: string) => void;
  /** Accessible label for the input. */
  label: string;
  className?: string | undefined;
  /** Start as an input (e.g. right after creating the thing being named). */
  startEditing?: boolean;
  /** Called when editing ends without a change. */
  onCancel?: () => void;
}

/** Text that turns into an input on click (or Enter); Enter/blur commits, Escape cancels. */
export function InlineEdit({
  value,
  onCommit,
  label,
  className,
  startEditing = false,
  onCancel,
}: InlineEditProps) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        className={clsx(styles.display, className)}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Click to rename"
      >
        {value}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) onCommit(draft.trim());
    else onCancel?.();
  };

  return (
    <TextInput
      autoFocus
      size="xs"
      aria-label={label}
      value={draft}
      onChange={(e) => {
        setDraft(e.currentTarget.value);
      }}
      onFocus={(e) => {
        // After the click or double-click that opened it, so the selection sticks.
        const input = e.currentTarget;
        requestAnimationFrame(() => {
          input.select();
        });
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setEditing(false);
          onCancel?.();
        }
      }}
      classNames={{ root: styles.input }}
    />
  );
}

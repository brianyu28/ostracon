import { Button, Popover, TextInput } from '@mantine/core';
import { clsx } from 'clsx';
import { useState } from 'react';
import { LOCATION_PART_LABELS, locationText } from '@/domain/fields/types/other';
import type { FieldOf, LocationPart, LocationValue } from '@/domain/schema/types';
import { CLICK_OUTSIDE_EVENTS, useEditorSession } from './useEditorSession';
import type { EditorChange, EditorProps } from './types';
import styles from './Editors.module.scss';

/** A structured location: one input per part the field uses. Enter saves. */
export function LocationEditor(props: EditorProps<FieldOf<'location'>>) {
  const { field, value, initial, variant, onCommit, onCancel } = props;
  const parts = field.config.parts;
  const original = (value ?? {}) as LocationValue;
  const [draft, setDraft] = useState<LocationValue>(() =>
    initial !== undefined ? { [parts[0] ?? 'name']: initial } : original,
  );
  const changed = parts.some((p) => (draft[p] ?? '') !== (original[p] ?? ''));
  const change: EditorChange | null = changed
    ? { kind: 'value', value: { ...original, ...draft } }
    : null;
  const session = useEditorSession(change, onCommit, onCancel, props.saveOnClose);
  const set = (part: LocationPart, text: string) => {
    setDraft((d) => ({ ...d, [part]: text }));
  };
  return (
    <Popover
      opened
      position="bottom-start"
      offset={2}
      withinPortal
      trapFocus={false}
      clickOutsideEvents={CLICK_OUTSIDE_EVENTS}
      // Outside the table, stay shown when iOS scrolls the page to clear the on-screen keyboard.
      hideDetached={variant === 'cell'}
      shadow="md"
      closeOnEscape={false}
      onDismiss={() => {
        // A click outside saves, like Enter.
        session.commit(change);
      }}
    >
      <Popover.Target>
        <div className={clsx(styles.anchor, variant === 'cell' && styles.cellAnchor)}>
          {locationText(draft)}
        </div>
      </Popover.Target>
      <Popover.Dropdown className={clsx(styles.dropdown, styles.formDropdown)}>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            session.commit(change);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              session.cancel();
            }
          }}
        >
          {parts.map((part, i) => (
            <TextInput
              key={part}
              size="xs"
              label={LOCATION_PART_LABELS[part]}
              value={draft[part] ?? ''}
              autoFocus={i === 0}
              onChange={(e) => {
                set(part, e.currentTarget.value);
              }}
            />
          ))}
          <div className={styles.formActions}>
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                session.cancel();
              }}
            >
              Cancel
            </Button>
            <Button size="xs" type="submit">
              Save
            </Button>
          </div>
        </form>
      </Popover.Dropdown>
    </Popover>
  );
}

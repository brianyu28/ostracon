import { Popover } from '@mantine/core';
import { IconCheck, IconPlus } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { OptionChip } from '@/components/OptionChip/OptionChip';
import type { FieldOf, Id } from '@/domain/schema/types';
import { useEditorSession } from './useEditorSession';
import type { EditorChange, EditorProps } from './types';
import styles from './Editors.module.scss';

type SelectField = FieldOf<'singleSelect'> | FieldOf<'multiSelect'>;

/** Lists at least this long show the options already picked first, so they're easy to remove. */
const PINNED_SELECTED_MIN = 10;

/**
 * Picked options first (in option order), then the rest. Uses the picks the editor opened
 * with, so rows don't jump while options are toggled.
 */
function pinSelected<T extends { id: Id }>(options: readonly T[], picked: readonly Id[]): T[] {
  if (picked.length === 0) return [...options];
  const set = new Set(picked);
  return [...options.filter((o) => set.has(o.id)), ...options.filter((o) => !set.has(o.id))];
}

/**
 * Single and multiple select: type to filter the options, Enter picks (or creates a new option),
 * arrows move. Multiple select stays open to pick more (Esc or Enter on an empty search closes
 * it, keeping the picks); Backspace on an empty search removes the last pick.
 */
export function SelectEditor(props: EditorProps<SelectField>) {
  const { field, value, initial, variant, onCommit, onCancel } = props;
  const multiple = field.type === 'multiSelect';
  const options = field.config.options;
  const originalIds: Id[] = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const [ids, setIds] = useState<Id[]>(originalIds);
  const [query, setQuery] = useState(initial ?? '');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  // Exact matches first, then names starting with the search, then names containing it.
  const rank = (name: string) => {
    const n = name.toLowerCase();
    return n === q ? 0 : n.startsWith(q) ? 1 : 2;
  };
  const matches = q
    ? options
        .filter((o) => o.name.toLowerCase().includes(q))
        .sort((a, b) => rank(a.name) - rank(b.name))
    : options.length >= PINNED_SELECTED_MIN
      ? pinSelected(options, originalIds)
      : options;
  const exact = options.some((o) => o.name.toLowerCase() === q);
  const canCreate = q !== '' && !exact;
  const itemCount = matches.length + (canCreate ? 1 : 0);
  const activeIndex = Math.min(active, Math.max(0, itemCount - 1));

  const valueChange = (next: Id[]): EditorChange | null =>
    next.join() === originalIds.join()
      ? null
      : { kind: 'value', value: multiple ? next : (next[0] ?? undefined) };
  const session = useEditorSession(valueChange(ids), onCommit, onCancel, props.saveOnClose);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${String(activeIndex)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const choose = (index: number) => {
    const option = matches[index];
    if (option) {
      if (!multiple) {
        session.commit(valueChange(ids[0] === option.id ? [] : [option.id]));
        return;
      }
      setIds(ids.includes(option.id) ? ids.filter((id) => id !== option.id) : [...ids, option.id]);
      setQuery('');
      return;
    }
    if (canCreate) {
      // New option: saved through text, which creates it in the same undo step.
      const names = ids
        .map((id) => options.find((o) => o.id === id)?.name)
        .filter((n): n is string => n !== undefined);
      session.commit({
        kind: 'text',
        text: multiple ? [...names, query.trim()].join(', ') : query.trim(),
      });
    }
  };

  const chips = ids.map((id) => {
    const option = options.find((o) => o.id === id);
    return option ? (
      <OptionChip key={id} color={option.color}>
        {option.name}
      </OptionChip>
    ) : null;
  });

  return (
    <Popover
      opened
      position="bottom-start"
      offset={2}
      width={260}
      withinPortal
      trapFocus={false}
      shadow="md"

      closeOnEscape={false}
      onDismiss={() => {
        // A click outside saves, like Enter.
        session.commit(valueChange(ids));
      }}
    >
      <Popover.Target>
        <div className={clsx(styles.anchor, variant === 'cell' && styles.cellAnchor)}>{chips}</div>
      </Popover.Target>
      <Popover.Dropdown className={clsx(styles.dropdown, styles.selectDropdown)}>
        <input
          className={styles.search}
          value={query}
          autoFocus
          placeholder={options.length ? 'Find or create an option' : 'Create an option'}
          aria-label={`${field.name} options`}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            switch (e.key) {
              case 'Escape':
                // Picks in a multiple select are deliberate, so closing keeps them.
                e.preventDefault();
                if (multiple) session.commit(valueChange(ids));
                else session.cancel();
                break;
              case 'ArrowDown':
                e.preventDefault();
                setActive((activeIndex + 1) % Math.max(1, itemCount));
                break;
              case 'ArrowUp':
                e.preventDefault();
                setActive((activeIndex - 1 + itemCount) % Math.max(1, itemCount));
                break;
              case 'Enter':
                e.preventDefault();
                if (multiple && e.metaKey) session.commit(valueChange(ids));
                else if (itemCount === 0 || (multiple && q === ''))
                  session.commit(valueChange(ids));
                else choose(activeIndex);
                break;
              case 'Tab':
                e.preventDefault();
                session.commit(valueChange(ids), e.shiftKey ? 'left' : 'right');
                break;
              case 'Backspace':
                if (query === '' && ids.length) {
                  e.preventDefault();
                  setIds(ids.slice(0, -1));
                }
                break;
            }
          }}
        />
        <div className={styles.optionList} ref={listRef} role="listbox">
          {matches.map((o, i) => (
            <div
              key={o.id}
              data-index={i}
              role="option"
              aria-selected={ids.includes(o.id)}
              className={clsx(styles.optionItem, i === activeIndex && styles.optionActive)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
              onMouseEnter={() => {
                setActive(i);
              }}
            >
              <span className={styles.check}>{ids.includes(o.id) && <IconCheck size={13} />}</span>
              <OptionChip color={o.color}>{o.name}</OptionChip>
            </div>
          ))}
          {canCreate && (
            <div
              data-index={matches.length}
              role="option"
              aria-selected={false}
              className={clsx(
                styles.optionItem,
                matches.length === activeIndex && styles.optionActive,
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(matches.length);
              }}
            >
              <span className={styles.check}>
                <IconPlus size={13} />
              </span>
              Create “{query.trim()}”
            </div>
          )}
          {itemCount === 0 && <div className={styles.empty}>No options yet</div>}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

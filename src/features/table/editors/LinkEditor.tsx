import { Popover } from '@mantine/core';
import { IconCheck, IconPlus } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { iterateRecords } from '@/domain/model';
import { recordTitle } from '@/domain/records';
import type { FieldOf, Id } from '@/domain/schema/types';
import { useDocStore } from '@/store/docStore';
import { LinkChip } from '../cells/LinkChip';
import { CLICK_OUTSIDE_EVENTS, useEditorSession } from './useEditorSession';
import type { EditorChange, EditorProps } from './types';
import styles from './Editors.module.scss';

/** Matches shown at once; typing narrows a long list. */
const LIMIT = 60;

/**
 * Picks linked records: type to find them by title, Enter or click links (or unlinks), arrows
 * move. A field that links to many stays open; Esc or a click outside saves. "Create" adds a
 * record to the other collection with the typed title and links it.
 */
export function LinkEditor(props: EditorProps<FieldOf<'link'>>) {
  const { field, value, initial, variant, recordId, onCommit, onCancel } = props;
  const multiple = field.config.multiple === true;
  const doc = useDocStore((s) => s.doc);
  const target = doc?.collections[field.config.targetCollectionId];
  const original = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const [ids, setIds] = useState<Id[]>(original);
  const [query, setQuery] = useState(initial ?? '');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Every candidate with its title, A–Z; built once per document version.
  const candidates = useMemo(() => {
    if (!doc) return [];
    return [...iterateRecords(doc, field.config.targetCollectionId)]
      .filter((r) => r.id !== recordId || field.config.targetCollectionId !== field.collectionId)
      .map((r) => ({ id: r.id, title: recordTitle(doc, r) }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [doc, field.config.targetCollectionId, field.collectionId, recordId]);
  const titleOf = useMemo(() => new Map(candidates.map((c) => [c.id, c.title])), [candidates]);

  const q = query.trim().toLowerCase();
  const rank = (title: string) => {
    const t = title.toLowerCase();
    return t === q ? 0 : t.startsWith(q) ? 1 : 2;
  };
  const matches = (
    q
      ? candidates
          .filter((c) => c.title.toLowerCase().includes(q))
          .sort((a, b) => rank(a.title) - rank(b.title))
      : // Linked records first, then the rest.
        [
          ...candidates.filter((c) => ids.includes(c.id)),
          ...candidates.filter((c) => !ids.includes(c.id)),
        ]
  ).slice(0, LIMIT);
  const exact = candidates.some((c) => c.title.toLowerCase() === q);
  const canCreate = q !== '' && !exact && recordId !== undefined;
  const itemCount = matches.length + (canCreate ? 1 : 0);
  const activeIndex = Math.min(active, Math.max(0, itemCount - 1));

  const linksChange = (next: Id[]): EditorChange | null =>
    next.join() === original.join() ? null : { kind: 'links', ids: next };
  const session = useEditorSession(linksChange(ids), onCommit, onCancel, props.saveOnClose);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${String(activeIndex)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const choose = (index: number) => {
    const match = matches[index];
    if (match) {
      const next = ids.includes(match.id)
        ? ids.filter((id) => id !== match.id)
        : multiple
          ? [...ids, match.id]
          : [match.id];
      if (!multiple) {
        session.commit(linksChange(next));
        return;
      }
      setIds(next);
      setQuery('');
      return;
    }
    if (canCreate)
      session.commit({ kind: 'createLinked', title: query.trim(), ids: multiple ? ids : [] });
  };

  return (
    <Popover
      opened
      position="bottom-start"
      offset={2}
      width={300}
      withinPortal
      trapFocus={false}
      clickOutsideEvents={CLICK_OUTSIDE_EVENTS}
      // Outside the table, stay shown when iOS scrolls the page to clear the on-screen keyboard.
      hideDetached={variant === 'cell'}
      shadow="md"
      closeOnEscape={false}
      onDismiss={() => {
        session.commit(linksChange(ids));
      }}
    >
      <Popover.Target>
        <div className={clsx(styles.anchor, variant === 'cell' && styles.cellAnchor)}>
          {ids.map((id) => (
            <LinkChip key={id}>{titleOf.get(id) ?? '…'}</LinkChip>
          ))}
        </div>
      </Popover.Target>
      <Popover.Dropdown className={clsx(styles.dropdown, styles.selectDropdown)}>
        <input
          className={styles.search}
          value={query}
          autoFocus
          placeholder={`Find ${target ? `in ${target.name}` : 'records'}`}
          aria-label={`${field.name}: find records`}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            switch (e.key) {
              case 'Escape':
                e.preventDefault();
                if (multiple) session.commit(linksChange(ids));
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
                if (itemCount === 0 || (multiple && q === '')) session.commit(linksChange(ids));
                else choose(activeIndex);
                break;
              case 'Tab':
                e.preventDefault();
                session.commit(linksChange(ids), e.shiftKey ? 'left' : 'right');
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
        <div
          className={styles.optionList}
          ref={listRef}
          role="listbox"
          aria-multiselectable={multiple}
        >
          {matches.map((m, i) => (
            <div
              key={m.id}
              data-index={i}
              role="option"
              aria-selected={ids.includes(m.id)}
              className={clsx(styles.optionItem, i === activeIndex && styles.optionActive)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
              onMouseEnter={() => {
                setActive(i);
              }}
            >
              <span className={styles.check}>{ids.includes(m.id) && <IconCheck size={13} />}</span>
              <span className={styles.optionText}>{m.title}</span>
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
              <span className={styles.optionText}>
                Create “{query.trim()}”{target ? ` in ${target.name}` : ''}
              </span>
            </div>
          )}
          {itemCount === 0 && <div className={styles.empty}>No records</div>}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

import { TextInput } from '@mantine/core';
import { Modal } from '@/components/Modal/Modal';
import { IconSearch } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useDeferredValue, useMemo, useState, type KeyboardEvent } from 'react';
import { useLocation } from 'wouter';
import { recordPath } from '@/app/routes';
import { CollectionIcon } from '@/components/CollectionIcon/CollectionIcon';
import { searchRecords } from '@/domain/home';
import { useDocStore } from '@/store/docStore';
import { uiStore, useUi } from '@/store/uiStore';
import styles from '@/keyboard/CommandPalette.module.scss';

/** ⌘P or /: find a record in any collection. Typing ">" switches to commands. */
export function SearchDialog() {
  const opened = useUi((s) => s.searchOpen);
  const close = () => {
    uiStore.setState({ searchOpen: false });
  };
  return (
    <Modal
      opened={opened}
      onClose={close}
      withCloseButton={false}
      size="lg"
      padding={0}
      yOffset="12vh"
      transitionProps={{ duration: 80 }}
    >
      {opened && <SearchBody onClose={close} />}
    </Modal>
  );
}

function SearchBody({ onClose }: { onClose: () => void }) {
  const doc = useDocStore((s) => s.doc);
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [active, setActive] = useState(0);
  const [, navigate] = useLocation();
  const results = useMemo(() => (doc ? searchRecords(doc, deferred, 50) : []), [doc, deferred]);

  const open = (index: number) => {
    const hit = results[index];
    if (!hit) return;
    onClose();
    navigate(recordPath(hit.record.collectionId, hit.record.id));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      open(active);
    }
  };

  return (
    <div>
      <TextInput
        data-autofocus
        size="sm"
        variant="unstyled"
        placeholder="Search records…  (> for commands)"
        leftSection={<IconSearch size={16} />}
        value={query}
        onChange={(e) => {
          const value = e.currentTarget.value;
          if (value.startsWith('>')) {
            uiStore.setState({ searchOpen: false, paletteOpen: true });
            return;
          }
          setQuery(value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        classNames={{ root: styles.input }}
        aria-label="Search records"
      />
      <ul className={styles.list} role="listbox">
        {query.trim() && results.length === 0 && (
          <li className={styles.empty}>No matching records</li>
        )}
        {results.map((hit, i) => {
          const collection = doc?.collections[hit.record.collectionId];
          return (
            <li
              key={hit.record.id}
              role="option"
              aria-selected={i === active}
              className={clsx(styles.item, i === active && styles.active)}
              onMouseMove={() => {
                setActive(i);
              }}
              onClick={() => {
                open(i);
              }}
            >
              <CollectionIcon
                icon={collection?.icon}
                color={collection?.color}
                size={15}
                stroke={1.75}
              />
              <span className={styles.title}>{hit.title}</span>
              <span className={styles.group}>{collection?.name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

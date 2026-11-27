import { TextInput } from '@mantine/core';
import { Modal } from '@/components/Modal/Modal';
import { IconSearch } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState, type KeyboardEvent } from 'react';
import { navigate } from 'wouter/use-hash-location';
import { collectionPath } from '@/app/routes';
import { KeyBinding } from '@/components/KeyBinding/KeyBinding';
import { useDocStore } from '@/store/docStore';
import { uiStore, useUi } from '@/store/uiStore';
import { COMMANDS, type CommandId } from './catalog';
import { bindingsFor, isCommandAvailable, runCommand, useRegistryVersion } from './registry';
import styles from './CommandPalette.module.scss';

interface PaletteItem {
  key: string;
  group: string;
  title: string;
  /** Set for catalog commands, to show their key binding. */
  commandId?: CommandId;
  run: () => void;
}

function matches(title: string, query: string): boolean {
  const t = title.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => t.includes(word));
}

/** ⌘K: search and run any command that's available right now, or jump to a collection. */
export function CommandPalette() {
  const opened = useUi((s) => s.paletteOpen);
  const close = () => {
    uiStore.setState({ paletteOpen: false });
  };
  return (
    <Modal
      opened={opened}
      onClose={close}
      withCloseButton={false}
      size="md"
      padding={0}
      yOffset="12vh"
      transitionProps={{ duration: 80 }}
    >
      {opened && <PaletteBody onClose={close} />}
    </Modal>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  // Re-render when handlers attach or detach, since that changes what's available.
  useRegistryVersion();
  const collections = useDocStore((s) => s.doc?.collections);

  const commandItems: PaletteItem[] = COMMANDS.filter(
    (c) => c.id !== 'app.palette' && isCommandAvailable(c.id) && matches(c.title, query),
  ).map((c) => ({
    key: `cmd:${c.id}`,
    group: c.group,
    title: c.title,
    commandId: c.id,
    run: () => {
      runCommand(c.id);
    },
  }));
  const collectionItems: PaletteItem[] = Object.values(collections ?? {})
    .filter((c) => matches(c.name, query))
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      key: `col:${c.id}`,
      group: 'Go to',
      title: c.name,
      run: () => {
        navigate(collectionPath(c.id));
      },
    }));
  // Typing a name should jump straight to the collection; otherwise commands lead.
  const results = query.trim()
    ? [...collectionItems, ...commandItems]
    : [...commandItems, ...collectionItems];

  const run = (item: PaletteItem) => {
    onClose();
    // Let the modal close (and focus return) before the command runs.
    setTimeout(item.run, 0);
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
      const item = results[active];
      if (item) run(item);
    }
  };

  return (
    <div>
      <TextInput
        data-autofocus
        size="sm"
        variant="unstyled"
        placeholder="Type a command or collection…"
        leftSection={<IconSearch size={16} />}
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        classNames={{ root: styles.input }}
        aria-label="Command"
      />
      <ul className={styles.list} role="listbox">
        {results.length === 0 && <li className={styles.empty}>No matches</li>}
        {results.map((c, i) => {
          const [binding] = c.commandId ? bindingsFor(c.commandId) : [];
          return (
            <li
              key={c.key}
              role="option"
              aria-selected={i === active}
              className={clsx(styles.item, i === active && styles.active)}
              onMouseMove={() => {
                setActive(i);
              }}
              onClick={() => {
                run(c);
              }}
            >
              <span className={styles.group}>{c.group}</span>
              <span className={styles.title}>{c.title}</span>
              {binding && <KeyBinding binding={binding} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

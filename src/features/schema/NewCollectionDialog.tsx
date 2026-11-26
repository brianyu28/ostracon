import { Button, Group, Modal, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { collectionPath } from '@/app/routes';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { IconPicker } from '@/components/IconPicker/IconPicker';
import type { Color } from '@/domain/schema/types';
import { tryDispatch } from '@/store/actions';
import { uiStore, useUi } from '@/store/uiStore';
import styles from './CollectionSettingsDialog.module.scss';

/**
 * Creates a blank collection (opened through `ui.openNewCollection`). Phase 6 adds the
 * template gallery here, keeping "Blank collection" as its first option.
 */
export function NewCollectionDialog() {
  const opened = useUi((s) => s.newCollectionOpen);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [color, setColor] = useState<Color | undefined>(undefined);
  const [, navigate] = useLocation();
  const close = () => {
    uiStore.setState({ newCollectionOpen: false });
    setName('');
    setIcon(undefined);
    setColor(undefined);
  };

  const create = () => {
    const id = tryDispatch('createCollection', {
      name,
      ...(icon ? { icon } : {}),
      ...(color ? { color } : {}),
    });
    if (id === undefined) return;
    close();
    navigate(collectionPath(id));
  };

  return (
    <Modal opened={opened} onClose={close} title="New collection" size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <div className={styles.identity}>
          <IconPicker value={icon} color={color} onChange={setIcon} />
          <ColorPicker value={color} label="Collection color" onChange={setColor} />
          <TextInput
            className={styles.name}
            data-autofocus
            aria-label="Name"
            placeholder="e.g. Restaurants"
            value={name}
            onChange={(e) => {
              setName(e.currentTarget.value);
            }}
          />
        </div>
        <Group justify="flex-end" mt="md" gap="xs">
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim()}>
            Create
          </Button>
        </Group>
      </form>
    </Modal>
  );
}

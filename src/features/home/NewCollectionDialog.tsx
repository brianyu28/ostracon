import { Button, Group, Modal, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { collectionPath } from '@/app/routes';
import { tryDispatch } from '@/store/actions';

interface NewCollectionDialogProps {
  opened: boolean;
  onClose: () => void;
}

/**
 * Creates a blank collection. (Phase 6 replaces this with the template gallery, which
 * keeps "Blank collection" as its first option.)
 */
export function NewCollectionDialog({ opened, onClose }: NewCollectionDialogProps) {
  const [name, setName] = useState('');
  const [, navigate] = useLocation();

  const create = () => {
    const id = tryDispatch('createCollection', { name });
    if (id === undefined) return;
    setName('');
    onClose();
    navigate(collectionPath(id));
  };

  return (
    <Modal opened={opened} onClose={onClose} title="New collection" size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <TextInput
          data-autofocus
          label="Name"
          placeholder="e.g. Restaurants"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value);
          }}
        />
        <Group justify="flex-end" mt="md" gap="xs">
          <Button variant="default" onClick={onClose}>
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

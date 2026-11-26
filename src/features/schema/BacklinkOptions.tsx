import { Button, Checkbox, Group, Text, TextInput } from '@mantine/core';
import { IconArrowBackUp, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog/ConfirmDialog';
import type { FieldOf } from '@/domain/schema/types';
import { toastWithUndo, tryDispatch, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import styles from './FieldEditor.module.scss';

/**
 * An existing link field's backlink: the paired field in the other collection. It can be
 * added or removed at any time; the links themselves stay either way.
 */
export function BacklinkOptions({ field }: { field: FieldOf<'link'> }) {
  const doc = useDocStore((s) => s.doc);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [multiple, setMultiple] = useState(true);
  const [confirming, setConfirming] = useState(false);
  if (!doc) return null;
  const inverseId = field.config.inverseFieldId;
  if (inverseId === field.id) return null; // links both ways within one field
  const target = doc.collections[field.config.targetCollectionId];
  const source = doc.collections[field.collectionId];
  const inverse = inverseId ? doc.fields[inverseId] : undefined;
  if (!target || !source) return null;

  if (inverse) {
    return (
      <div className={styles.backlink}>
        <Text size="sm">
          Linked back from <strong>{inverse.name}</strong> in {target.name}
        </Text>
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconTrash size={14} />}
          onClick={() => {
            setConfirming(true);
          }}
        >
          Remove backlink
        </Button>
        <ConfirmDialog
          opened={confirming}
          title={`Remove “${inverse.name}” from ${target.name}?`}
          confirmLabel="Remove backlink"
          danger
          onClose={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            if (tryRun('removeBacklink', { fieldId: field.id }))
              toastWithUndo(`Removed “${inverse.name}” from ${target.name}`);
          }}
        >
          The links stay on “{field.name}”; {target.name} just stops showing them.
        </ConfirmDialog>
      </div>
    );
  }

  if (!adding) {
    return (
      <div className={styles.backlink}>
        <Text size="sm" c="dimmed">
          Not shown in {target.name}
        </Text>
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconArrowBackUp size={14} />}
          onClick={() => {
            setName(source.name);
            setAdding(true);
          }}
        >
          Add backlink
        </Button>
      </div>
    );
  }
  return (
    <div className={styles.linkOptions}>
      <TextInput
        label={`Field in ${target.name}`}
        value={name}
        autoFocus
        onChange={(e) => {
          setName(e.currentTarget.value);
        }}
      />
      <Checkbox
        label={`Each ${target.name} record can be linked from more than one`}
        checked={multiple}
        onChange={(e) => {
          setMultiple(e.currentTarget.checked);
        }}
      />
      <Group gap="xs" justify="flex-end">
        <Button
          variant="default"
          onClick={() => {
            setAdding(false);
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={() => {
            const id = tryDispatch('addBacklink', { fieldId: field.id, name, multiple });
            if (id) setAdding(false);
          }}
        >
          Add backlink
        </Button>
      </Group>
    </div>
  );
}

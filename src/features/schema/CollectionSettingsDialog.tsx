import { Button, Select, Tabs, Textarea, TextInput } from '@mantine/core';
import { Modal } from '@/components/Modal/Modal';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { IconPicker } from '@/components/IconPicker/IconPicker';
import { fieldType } from '@/domain/fields/registry';
import type { CollectionChanges } from '@/domain/commands';
import type { Collection } from '@/domain/schema/types';
import { collectionFields } from '@/domain/views/repair';
import { tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { uiStore, useUi, type CollectionSettingsTab } from '@/store/uiStore';
import { DeleteCollectionDialog } from './DeleteCollectionDialog';
import { FieldList } from './FieldList';
import styles from './CollectionSettingsDialog.module.scss';

/** The app-wide collection settings dialog, opened through `ui.openCollectionSettings`. */
export function CollectionSettingsDialog() {
  const target = useUi((s) => s.collectionSettings);
  const collection = useDocStore((s) =>
    target ? s.doc?.collections[target.collectionId] : undefined,
  );
  const close = () => {
    uiStore.setState({ collectionSettings: null });
  };
  return (
    <Modal
      opened={target !== null && collection !== undefined}
      onClose={close}
      title={collection ? `${collection.name} settings` : 'Collection settings'}
      size="lg"
    >
      {target && collection && (
        <Tabs
          value={target.tab}
          onChange={(tab) => {
            if (tab)
              uiStore.setState({
                collectionSettings: { ...target, tab: tab as CollectionSettingsTab },
              });
          }}
          keepMounted={false}
        >
          <Tabs.List className={styles.tabs}>
            <Tabs.Tab value="general">General</Tabs.Tab>
            <Tabs.Tab value="fields">Fields</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="general" className={styles.panel}>
            <GeneralSettings key={collection.id} collection={collection} onDeleted={close} />
          </Tabs.Panel>
          <Tabs.Panel value="fields" className={styles.panel}>
            <FieldList collectionId={collection.id} />
          </Tabs.Panel>
        </Tabs>
      )}
    </Modal>
  );
}

function GeneralSettings({
  collection,
  onDeleted,
}: {
  collection: Collection;
  onDeleted: () => void;
}) {
  const fields = useDocStore((s) => s.doc?.fields);
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? '');
  const [deleting, setDeleting] = useState(false);
  const update = (changes: CollectionChanges) =>
    tryRun('updateCollection', { id: collection.id, changes });
  const primaryOptions = fields
    ? collectionFields(fields, collection.id)
        .filter((f) => fieldType(f).canBePrimary)
        .map((f) => ({ value: f.id, label: f.name }))
    : [];

  return (
    <div className={styles.general}>
      <div className={styles.identity}>
        <IconPicker
          value={collection.icon}
          color={collection.color}
          onChange={(icon) => update({ icon })}
        />
        <ColorPicker
          value={collection.color}
          label="Collection color"
          onChange={(color) => update({ color })}
        />
        <TextInput
          className={styles.name}
          aria-label="Collection name"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value);
          }}
          onBlur={() => {
            if (name.trim() && name.trim() !== collection.name) update({ name });
            else setName(collection.name);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </div>
      <Textarea
        label="Description"
        autosize
        minRows={2}
        maxRows={6}
        value={description}
        onChange={(e) => {
          setDescription(e.currentTarget.value);
        }}
        onBlur={() => {
          if (description !== (collection.description ?? '')) update({ description });
        }}
      />
      <Select
        label="Primary field"
        data={primaryOptions}
        value={collection.primaryFieldId}
        allowDeselect={false}
        onChange={(fieldId) => {
          if (fieldId) tryRun('setPrimaryField', { collectionId: collection.id, fieldId });
        }}
      />
      <div>
        <Button
          variant="subtle"
          color="red"
          leftSection={<IconTrash size={14} />}
          onClick={() => {
            setDeleting(true);
          }}
        >
          Delete collection
        </Button>
      </div>
      {deleting && (
        <DeleteCollectionDialog
          collectionId={collection.id}
          onClose={() => {
            setDeleting(false);
          }}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

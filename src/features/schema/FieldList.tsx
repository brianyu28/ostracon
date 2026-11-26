import { ActionIcon, Badge, Button, Menu, UnstyledButton } from '@mantine/core';
import { IconDots, IconPencil, IconPlus, IconStar, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { FieldTypeIcon } from '@/components/FieldTypeIcon/FieldTypeIcon';
import { DragHandle, SortableGroup, SortableProvider } from '@/components/Sortable/Sortable';
import { useSortableItem } from '@/components/Sortable/useSortableItem';
import { fieldType } from '@/domain/fields/registry';
import type { Field, Id } from '@/domain/schema/types';
import { collectionFields } from '@/domain/views/repair';
import { tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { ui } from '@/store/uiStore';
import { DeleteFieldDialog } from './DeleteFieldDialog';
import styles from './FieldList.module.scss';

/** A collection's fields in order: drag to reorder, click to edit, add and delete. */
export function FieldList({ collectionId }: { collectionId: Id }) {
  const fieldsMap = useDocStore((s) => s.doc?.fields);
  const collections = useDocStore((s) => s.doc?.collections);
  const [deleting, setDeleting] = useState<Id | null>(null);
  if (!fieldsMap || !collections) return null;
  const collection = collections[collectionId];
  if (!collection) return null;
  const fields = collectionFields(fieldsMap, collectionId);

  return (
    <div className={styles.root}>
      <SortableProvider
        onReorder={(_group, ids) => {
          tryRun('reorderFields', { collectionId, ids });
        }}
      >
        <SortableGroup ids={fields.map((f) => f.id)}>
          {fields.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              primary={field.id === collection.primaryFieldId}
              linkTarget={
                field.type === 'link'
                  ? collections[field.config.targetCollectionId]?.name
                  : undefined
              }
              onDelete={() => {
                setDeleting(field.id);
              }}
            />
          ))}
        </SortableGroup>
      </SortableProvider>
      <div className={styles.footer}>
        <Button
          variant="default"
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            ui.openFieldEditor({ collectionId });
          }}
        >
          Add field
        </Button>
      </div>
      <DeleteFieldDialog
        fieldId={deleting}
        onClose={() => {
          setDeleting(null);
        }}
      />
    </div>
  );
}

interface FieldRowProps {
  field: Field;
  primary: boolean;
  linkTarget: string | undefined;
  onDelete: () => void;
}

function FieldRow({ field, primary, linkTarget, onDelete }: FieldRowProps) {
  const { setNodeRef, style, handle } = useSortableItem(field.id, 'fields');
  const edit = () => {
    ui.openFieldEditor({ collectionId: field.collectionId, fieldId: field.id });
  };
  const def = fieldType(field);
  return (
    <div ref={setNodeRef} style={style} className={styles.row}>
      <DragHandle handle={handle} label={`Move ${field.name}`} />
      <UnstyledButton className={styles.main} onClick={edit} title="Edit field">
        <FieldTypeIcon type={field.type} className={styles.icon} />
        <span className={styles.name}>{field.name}</span>
        {primary && (
          <Badge size="xs" variant="light" className={styles.badge}>
            Primary
          </Badge>
        )}
        {field.required && (
          <Badge size="xs" variant="light" color="gray" className={styles.badge}>
            Required
          </Badge>
        )}
        <span className={styles.type}>{linkTarget ? `Link to ${linkTarget}` : def.label}</span>
      </UnstyledButton>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon color="gray" aria-label={`Actions for ${field.name}`}>
            <IconDots size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconPencil size={14} />} onClick={edit}>
            Edit
          </Menu.Item>
          {!primary && def.canBePrimary && (
            <Menu.Item
              leftSection={<IconStar size={14} />}
              onClick={() => {
                tryRun('setPrimaryField', { collectionId: field.collectionId, fieldId: field.id });
              }}
            >
              Make primary
            </Menu.Item>
          )}
          {!primary && (
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onDelete}>
              Delete
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}

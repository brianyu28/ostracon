import { Button, Checkbox, Popover } from '@mantine/core';
import { IconList, IconSettings } from '@tabler/icons-react';
import { FieldTypeIcon } from '@/components/FieldTypeIcon/FieldTypeIcon';
import type { Collection, View } from '@/domain/schema/types';
import { collectionFields } from '@/domain/views/repair';
import { tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { ui } from '@/store/uiStore';
import styles from './CollectionPage.module.scss';

/** Shows and hides fields in the current view. */
interface FieldsMenuProps {
  collection: Collection;
  view: View;
  opened: boolean;
  onChange: (opened: boolean) => void;
}

export function FieldsMenu({ collection, view, opened, onChange }: FieldsMenuProps) {
  const fieldsMap = useDocStore((s) => s.doc?.fields);
  if (!fieldsMap) return null;
  const fields = collectionFields(fieldsMap, collection.id);
  const hidden = new Set(view.fields.filter((f) => f.hidden).map((f) => f.fieldId));
  const toggle = (fieldId: string, show: boolean) => {
    const entries = view.fields.some((f) => f.fieldId === fieldId)
      ? view.fields
      : [...view.fields, { fieldId }];
    tryRun('setViewFields', {
      id: view.id,
      fields: entries.map((f) => {
        if (f.fieldId !== fieldId) return f;
        const rest = { ...f };
        delete rest.hidden;
        return show ? rest : { ...rest, hidden: true };
      }),
    });
  };
  return (
    <Popover position="bottom-end" withinPortal shadow="md" opened={opened} onChange={onChange}>
      <Popover.Target>
        <Button
          size="xs"
          variant={hidden.size ? 'light' : 'subtle'}
          color="gray"
          leftSection={<IconList size={14} />}
          onClick={() => {
            onChange(!opened);
          }}
          rightSection={
            hidden.size ? <span className={styles.badge}>{hidden.size} hidden</span> : undefined
          }
        >
          Fields
        </Button>
      </Popover.Target>
      <Popover.Dropdown className={styles.fieldsMenu}>
        {fields.map((f) => {
          const primary = f.id === collection.primaryFieldId;
          return (
            <Checkbox
              key={f.id}
              size="xs"
              checked={primary || !hidden.has(f.id)}
              disabled={primary}
              label={
                <span className={styles.fieldsMenuLabel}>
                  <FieldTypeIcon type={f.type} />
                  {f.name}
                </span>
              }
              onChange={(e) => {
                toggle(f.id, e.currentTarget.checked);
              }}
            />
          );
        })}
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          leftSection={<IconSettings size={14} />}
          onClick={() => {
            ui.openCollectionSettings(collection.id, 'fields');
          }}
        >
          Edit fields…
        </Button>
      </Popover.Dropdown>
    </Popover>
  );
}

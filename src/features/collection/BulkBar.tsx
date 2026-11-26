import { Button, Group, Menu, Modal } from '@mantine/core';
import { IconChevronDown, IconCopy, IconPencil, IconTrash, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { FieldTypeIcon } from '@/components/FieldTypeIcon/FieldTypeIcon';
import type { Field, Id } from '@/domain/schema/types';
import { collectionFields } from '@/domain/views/repair';
import { useFormatContext } from '@/hooks/useFormatContext';
import { useParseContext } from '@/hooks/useParseContext';
import { pluralize } from '@/lib/format';
import { toastWithUndo, tryDispatch, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { deleteRecords, duplicateRecords } from '@/features/record/recordActions';
import { ValueEditor } from '@/features/table/editors/ValueEditor';
import type { EditorChange } from '@/features/table/editors/types';
import { isEditable } from '@/features/table/selection';
import { tableActions } from '@/features/table/tableStore';
import styles from './CollectionPage.module.scss';

interface BulkBarProps {
  collectionId: Id;
  ids: readonly Id[];
}

/** Actions for the checked rows: set a field, duplicate, delete. */
export function BulkBar({ collectionId, ids }: BulkBarProps) {
  const fieldsMap = useDocStore((s) => s.doc?.fields);
  const settings = useDocStore((s) => s.doc?.settings);
  const format = useFormatContext();
  const parse = useParseContext();
  const [setting, setSetting] = useState<Field | null>(null);
  if (!fieldsMap || !settings) return null;
  const fields = collectionFields(fieldsMap, collectionId).filter(isEditable);
  const count = pluralize(ids.length, 'record');

  const apply = (field: Field, change: EditorChange | null) => {
    setSetting(null);
    if (!change) return;
    const ok =
      change.kind === 'value'
        ? tryRun('setFieldValue', { collectionId, ids, fieldId: field.id, value: change.value })
        : tryDispatch('setFromText', {
            collectionId,
            rows: ids.map((id) => ({ id, texts: { [field.id]: change.text } })),
            parse,
          }) !== undefined;
    if (ok) toastWithUndo(`Set “${field.name}” on ${count}`);
  };

  return (
    <div className={styles.bulk}>
      <span className={styles.bulkCount}>{ids.length} selected</span>
      <Menu position="bottom-start" withinPortal>
        <Menu.Target>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPencil size={14} />}
            rightSection={<IconChevronDown size={12} />}
          >
            Set field
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {fields.map((f) => (
            <Menu.Item
              key={f.id}
              leftSection={<FieldTypeIcon type={f.type} />}
              onClick={() => {
                setSetting(f);
              }}
            >
              {f.name}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      <Button
        size="xs"
        variant="default"
        leftSection={<IconCopy size={14} />}
        onClick={() => {
          if (duplicateRecords(collectionId, ids).length) tableActions.setSelected([]);
        }}
      >
        Duplicate
      </Button>
      <Button
        size="xs"
        variant="default"
        color="red"
        leftSection={<IconTrash size={14} />}
        onClick={() => {
          if (deleteRecords(collectionId, ids)) tableActions.setSelected([]);
        }}
      >
        Delete
      </Button>
      <Button
        size="xs"
        variant="subtle"
        color="gray"
        leftSection={<IconX size={14} />}
        onClick={() => {
          tableActions.setSelected([]);
        }}
      >
        Clear
      </Button>
      <Modal
        opened={setting !== null}
        onClose={() => {
          setSetting(null);
        }}
        title={setting ? `Set “${setting.name}” on ${count}` : ''}
        size="sm"
      >
        {setting?.type === 'checkbox' ? (
          <Group>
            <Button
              onClick={() => {
                apply(setting, { kind: 'value', value: true });
              }}
            >
              Checked
            </Button>
            <Button
              variant="default"
              onClick={() => {
                apply(setting, { kind: 'value', value: undefined });
              }}
            >
              Unchecked
            </Button>
          </Group>
        ) : (
          setting && (
            <div className={styles.bulkEditor}>
              <ValueEditor
                field={setting}
                value={undefined}
                variant="panel"
                saveOnClose={false}
                format={format}
                parse={parse}
                settings={settings}
                onCommit={(change) => {
                  apply(setting, change);
                }}
                onCancel={() => {
                  setSetting(null);
                }}
              />
            </div>
          )
        )}
      </Modal>
    </div>
  );
}

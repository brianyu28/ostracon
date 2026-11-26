import { ActionIcon, Button, Group, Menu, Modal, Text } from '@mantine/core';
import { IconDots, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Redirect, useParams } from 'wouter';
import { InlineEdit } from '@/components/InlineEdit/InlineEdit';
import { CollectionIcon } from '@/components/CollectionIcon/CollectionIcon';
import type { DocIndex } from '@/domain/aggregates/docIndex';
import type { FormatContext } from '@/domain/fields/model';
import { getRecord, iterateRecords, type DocModel } from '@/domain/model';
import { recordTitle, valueText } from '@/domain/records';
import type { Field, RecordEntity } from '@/domain/schema/types';
import { useFormatContext } from '@/hooks/useFormatContext';
import { pluralize } from '@/lib/format';
import { toastWithUndo, tryDispatch } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import styles from './CollectionPage.module.scss';

/** A cell's text: stored values through their type, links as titles, timestamps as dates. */
function cellText(
  doc: DocModel,
  index: DocIndex | null,
  record: RecordEntity,
  field: Field,
  ctx: FormatContext,
): string {
  if (field.type === 'link') {
    const target = field.config.targetCollectionId;
    return (index?.linked(field, record.id) ?? [])
      .map((id) => getRecord(doc, target, id))
      .filter((r) => r !== undefined)
      .map((r) => recordTitle(doc, r))
      .join(', ');
  }
  if (field.type === 'createdTime' || field.type === 'modifiedTime') {
    const iso = field.type === 'createdTime' ? record.createdAt : record.updatedAt;
    return new Date(iso).toLocaleDateString(ctx.locale, { dateStyle: 'medium' });
  }
  return valueText(record, field, ctx);
}

/**
 * A collection and one of its views. Placeholder: a plain, read-only list of the view's
 * visible fields, formatted by their types. Phase 3 replaces it with the editable, virtualized grid and Phase 4 adds
 * view tabs, filters and sorting.
 */
export function CollectionPage() {
  const { collectionId = '', viewId } = useParams<{ collectionId?: string; viewId?: string }>();
  const doc = useDocStore((s) => s.doc);
  const index = useDocStore((s) => s.index);
  useDocStore((s) => s.indexVersion); // links change with the index
  const format = useFormatContext();
  const collection = doc?.collections[collectionId];
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const view = useMemo(() => {
    if (!doc) return undefined;
    const views = Object.values(doc.views)
      .filter((v) => v.collectionId === collectionId)
      .sort((a, b) => a.order - b.order);
    return views.find((v) => v.id === viewId) ?? views[0];
  }, [doc, collectionId, viewId]);

  const columns = useMemo(() => {
    if (!doc || !view) return [];
    return view.fields
      .filter((f) => !f.hidden)
      .map((f) => doc.fields[f.fieldId])
      .filter((f): f is Field => f !== undefined);
  }, [doc, view]);

  const records = useMemo(
    () =>
      doc
        ? [...iterateRecords(doc, collectionId)].sort((a, b) =>
            a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
          )
        : [],
    [doc, collectionId],
  );

  if (!doc) return null;
  if (!collection) return <Redirect to="/" replace />;

  const deleteCollection = () => {
    setConfirmingDelete(false);
    if (tryDispatch('deleteCollection', { id: collection.id }) !== undefined)
      toastWithUndo(`Deleted ${collection.name}`);
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <CollectionIcon icon={collection.icon} size={18} stroke={1.75} className={styles.icon} />
        <InlineEdit
          value={collection.name}
          label="Collection name"
          className={styles.name}
          onCommit={(name) => {
            tryDispatch('updateCollection', { id: collection.id, changes: { name } });
          }}
        />
        <span className={styles.count}>{pluralize(records.length, 'record')}</span>
        <div className={styles.actions}>
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={() => {
              tryDispatch('createRecord', { collectionId: collection.id });
            }}
          >
            New record
          </Button>
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" aria-label="Collection actions">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => {
                  setConfirmingDelete(true);
                }}
              >
                Delete collection
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>
      <div className={styles.scroller}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((f) => (
                <th key={f.id}>{f.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                {columns.map((f) => {
                  return <td key={f.id}>{cellText(doc, index, r, f, format)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {records.length === 0 && <p className={styles.empty}>No records yet.</p>}
      </div>
      <Modal
        opened={confirmingDelete}
        onClose={() => {
          setConfirmingDelete(false);
        }}
        title={`Delete ${collection.name}?`}
        size="sm"
      >
        <Text size="sm">
          This deletes the collection and its {pluralize(records.length, 'record')}. You can undo
          it.
        </Text>
        <Group justify="flex-end" mt="md" gap="xs">
          <Button
            variant="default"
            onClick={() => {
              setConfirmingDelete(false);
            }}
          >
            Cancel
          </Button>
          <Button color="red" onClick={deleteCollection} data-autofocus>
            Delete
          </Button>
        </Group>
      </Modal>
    </div>
  );
}

import { ActionIcon, Button, Menu } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconColumnInsertRight,
  IconDots,
  IconLayoutSidebarRight,
  IconPlus,
  IconSettings,
  IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Redirect, useLocation, useParams } from 'wouter';
import { recordPath } from '@/app/routes';
import { CollectionIcon } from '@/components/CollectionIcon/CollectionIcon';
import { InlineEdit } from '@/components/InlineEdit/InlineEdit';
import { getRecord } from '@/domain/model';
import type { Field, Id, RecordEntity, View } from '@/domain/schema/types';
import { viewRecords } from '@/domain/views/rows';
import { DeleteCollectionDialog } from '@/features/schema/DeleteCollectionDialog';
import { deleteRecords } from '@/features/record/recordActions';
import { RecordPanel } from '@/features/record/RecordPanel';
import { TableView } from '@/features/table/TableView';
import { tableActions, useTable } from '@/features/table/tableStore';
import { runCommand } from '@/keyboard/registry';
import { useCommandHandlers } from '@/keyboard/useCommandHandlers';
import { pluralize } from '@/lib/format';
import { tryDispatch } from '@/store/actions';
import { docStore, useDocStore } from '@/store/docStore';
import { ui } from '@/store/uiStore';
import { BulkBar } from './BulkBar';
import { FieldsMenu } from './FieldsMenu';
import { RecordList } from './RecordList';
import styles from './CollectionPage.module.scss';

const PHONE_QUERY = '(max-width: 639.98px)';

/**
 * The view's records in order. The arguments after `view` are the cache keys: the collection's
 * version (its records or links changed) and the fields (a sort field changed).
 */
function orderedRecords(
  view: View | undefined,
  _version: number,
  _fields: unknown,
): RecordEntity[] {
  const doc = docStore.getState().doc;
  return doc && view ? viewRecords(doc, view) : [];
}

/** A collection and one of its views: the table with the record panel (a list on phones). */
export function CollectionPage() {
  const { collectionId = '', viewId } = useParams<{ collectionId?: string; viewId?: string }>();
  const doc = useDocStore((s) => s.doc);
  const phone = useMediaQuery(PHONE_QUERY);
  const [, navigate] = useLocation();
  const collection = doc?.collections[collectionId];
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const selected = useTable((s) => s.selected);
  const panelOpen = useTable((s) => s.panelOpen);
  const cursorRow = useTable((s) => s.cursor?.row);

  const views = doc?.views;
  const view = useMemo(() => {
    if (!views) return undefined;
    const list = Object.values(views)
      .filter((v) => v.collectionId === collectionId)
      .sort((a, b) => a.order - b.order);
    return list.find((v) => v.id === viewId) ?? list[0];
  }, [views, collectionId, viewId]);

  // Re-sorted when this collection's records or links change (not on edits elsewhere).
  const version = useDocStore((s) => s.index?.collectionVersion(collectionId) ?? 0);
  const fields = doc?.fields;
  const records = useMemo(() => orderedRecords(view, version, fields), [view, version, fields]);
  const checkedIds = useMemo(
    () => records.filter((r) => selected.has(r.id)).map((r) => r.id),
    [records, selected],
  );

  const addField = () => {
    const last = view?.fields.filter((f) => !f.hidden).at(-1);
    ui.openFieldEditor({
      collectionId,
      ...(view ? { viewId: view.id } : {}),
      ...(last ? { afterFieldId: last.fieldId } : {}),
    });
  };
  const newRecordOnPhone = () => {
    const id = tryDispatch('createRecord', { collectionId });
    if (id) navigate(recordPath(collectionId, id));
  };
  useCommandHandlers({
    'collection.addField': { run: addField, enabled: () => collection !== undefined },
    'collection.settings': {
      run: () => {
        ui.openCollectionSettings(collectionId);
      },
      enabled: () => collection !== undefined,
    },
  });

  if (!doc) return null;
  if (!collection || !view) return <Redirect to="/" replace />;

  const panelRecord =
    panelOpen && cursorRow && !phone ? getRecord(doc, collectionId, cursorRow) : undefined;
  const visibleFields = view.fields
    .filter((f) => !f.hidden)
    .map((f) => doc.fields[f.fieldId])
    .filter((f): f is Field => f !== undefined);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <CollectionIcon
          icon={collection.icon}
          color={collection.color}
          size={18}
          stroke={1.75}
          className={styles.icon}
        />
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
          {!phone && <FieldsMenu collection={collection} view={view} />}
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={() => {
              if (phone) newRecordOnPhone();
              else runCommand('record.new');
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
              <Menu.Item leftSection={<IconColumnInsertRight size={14} />} onClick={addField}>
                Add field…
              </Menu.Item>
              <Menu.Item
                leftSection={<IconSettings size={14} />}
                onClick={() => {
                  ui.openCollectionSettings(collection.id);
                }}
              >
                Collection settings…
              </Menu.Item>
              <Menu.Divider />
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
          {!phone && (
            <ActionIcon
              variant={panelOpen ? 'light' : 'subtle'}
              color="gray"
              aria-label="Record panel"
              title="Record panel (Space)"
              onClick={() => {
                tableActions.togglePanel();
              }}
            >
              <IconLayoutSidebarRight size={16} />
            </ActionIcon>
          )}
        </div>
      </div>
      {checkedIds.length > 0 && !phone && <BulkBar collectionId={collection.id} ids={checkedIds} />}
      <div className={styles.body}>
        {phone ? (
          <RecordList collection={collection} records={records} fields={visibleFields} />
        ) : (
          <TableView
            collection={collection}
            view={view}
            records={records}
            onDeleteRecords={(ids: readonly Id[]) => {
              if (deleteRecords(collection.id, ids)) tableActions.setSelected([]);
            }}
          />
        )}
        {panelRecord && (
          <RecordPanel
            record={panelRecord}
            onClose={() => {
              tableActions.togglePanel(false);
            }}
          />
        )}
      </div>
      {confirmingDelete && (
        <DeleteCollectionDialog
          collectionId={collection.id}
          onClose={() => {
            setConfirmingDelete(false);
          }}
        />
      )}
    </div>
  );
}

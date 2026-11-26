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
import { collectionPath, recordPath } from '@/app/routes';
import { CollectionIcon } from '@/components/CollectionIcon/CollectionIcon';
import { InlineEdit } from '@/components/InlineEdit/InlineEdit';
import { getRecord } from '@/domain/model';
import type { Field, Id } from '@/domain/schema/types';
import { collectionFields } from '@/domain/views/repair';
import { DeleteCollectionDialog } from '@/features/schema/DeleteCollectionDialog';
import { deleteRecords } from '@/features/record/recordActions';
import { RecordPanel } from '@/features/record/RecordPanel';
import { TableView } from '@/features/table/TableView';
import { tableActions, useTable } from '@/features/table/tableStore';
import { runCommand } from '@/keyboard/registry';
import { useCommandHandlers } from '@/keyboard/useCommandHandlers';
import { pluralize } from '@/lib/format';
import { tryDispatch } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { useViewResult } from '@/features/views/useViewResult';
import { ViewTabs } from '@/features/views/ViewTabs';
import { ViewToolbar } from '@/features/views/ViewToolbar';
import { ui } from '@/store/uiStore';
import { BulkBar } from './BulkBar';
import { RecordList } from './RecordList';
import styles from './CollectionPage.module.scss';

const PHONE_QUERY = '(max-width: 639.98px)';
const SHORT_QUERY = '(max-height: 520px)';

/** A collection and one of its views: the table with the record panel (a list on phones). */
export function CollectionPage() {
  const { collectionId = '', viewId } = useParams<{ collectionId?: string; viewId?: string }>();
  const doc = useDocStore((s) => s.doc);
  const phone = useMediaQuery(PHONE_QUERY);
  // Landscape phones and small windows: the collection header folds into the view bar.
  const short = useMediaQuery(SHORT_QUERY);
  const [, navigate] = useLocation();
  const collection = doc?.collections[collectionId];
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const selected = useTable((s) => s.selected);
  const panelOpen = useTable((s) => s.panelOpen);
  const cursorRow = useTable((s) => s.cursor?.row);

  const viewMap = doc?.views;
  const views = useMemo(
    () =>
      Object.values(viewMap ?? {})
        .filter((v) => v.collectionId === collectionId)
        .sort((a, b) => a.order - b.order),
    [viewMap, collectionId],
  );
  const view = views.find((v) => v.id === viewId) ?? views[0];
  const fieldMap = doc?.fields;
  const fields = useMemo(
    () => collectionFields(fieldMap ?? {}, collectionId),
    [fieldMap, collectionId],
  );

  const result = useViewResult(view);
  // The records the cursor moves through: all of them, or those in open groups.
  const records = useMemo(() => {
    if (!result.groups) return result.records;
    const collapsed = new Set(view?.group?.collapsed ?? []);
    return result.groups.filter((g) => !collapsed.has(g.key)).flatMap((g) => g.records);
  }, [result, view?.group?.collapsed]);
  const checkedIds = useMemo(
    () => result.records.filter((r) => selected.has(r.id)).map((r) => r.id),
    [result.records, selected],
  );
  const total = useDocStore((s) => s.index?.recordCount(collectionId) ?? 0);

  const goToView = (step: number) => {
    const i = views.findIndex((v) => v.id === view?.id);
    const next = views[(i + step + views.length) % views.length];
    if (next) navigate(collectionPath(collectionId, next.id));
  };

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
    'view.prev': {
      run: () => {
        goToView(-1);
      },
      enabled: () => views.length > 1,
    },
    'view.next': {
      run: () => {
        goToView(1);
      },
      enabled: () => views.length > 1,
    },
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

  const headerActions = (
    <div className={styles.actions}>
      {phone || short ? (
        <ActionIcon
          variant="filled"
          size="md"
          aria-label="New record"
          onClick={() => {
            if (phone) newRecordOnPhone();
            else runCommand('record.new');
          }}
        >
          <IconPlus size={16} />
        </ActionIcon>
      ) : (
        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            runCommand('record.new');
          }}
        >
          New record
        </Button>
      )}
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
  );

  return (
    <div className={styles.root}>
      {!short && (
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
          <span className={styles.count}>
            {result.records.length === total
              ? pluralize(total, 'record')
              : `${result.records.length.toLocaleString()} of ${pluralize(total, 'record')}`}
          </span>
          {headerActions}
        </div>
      )}
      <div className={styles.viewBar}>
        <ViewTabs collectionId={collection.id} views={views} activeId={view.id} />
        <ViewToolbar collection={collection} view={view} fields={fields} compact={phone || short} />
        {short && headerActions}
      </div>
      {checkedIds.length > 0 && !phone && <BulkBar collectionId={collection.id} ids={checkedIds} />}
      <div className={styles.body}>
        {phone ? (
          <RecordList
            collection={collection}
            records={result.records}
            fields={visibleFields}
            groups={result.groups}
            view={view}
          />
        ) : (
          <TableView
            collection={collection}
            view={view}
            records={records}
            groups={result.groups}
            context={result.context}
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

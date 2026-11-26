import { ActionIcon, Menu } from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconDots,
  IconPlus,
  IconSettings,
  IconTrash,
} from '@tabler/icons-react';
import { useState, type PointerEventHandler } from 'react';
import { collectionPath } from '@/app/routes';
import { CollectionIcon } from '@/components/CollectionIcon/CollectionIcon';
import { SortableGroup, SortableProvider } from '@/components/Sortable/Sortable';
import { useSortableItem } from '@/components/Sortable/useSortableItem';
import type { Collection, Id } from '@/domain/schema/types';
import { DeleteCollectionDialog } from '@/features/schema/DeleteCollectionDialog';
import { tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';
import { ui } from '@/store/uiStore';
import { NavItem } from './NavItem';
import styles from './Sidebar.module.scss';

/**
 * The open document's collections, in their order. Drag to reorder (or use the item menu's
 * Move up / Move down from the keyboard).
 */
export function SidebarCollections() {
  const collections = useDocStore((s) => s.doc?.collections);
  const [deleting, setDeleting] = useState<Id | null>(null);
  if (!collections) return null;
  const list = Object.values(collections).sort((a, b) => a.order - b.order);
  const ids = list.map((c) => c.id);
  const move = (id: Id, by: number) => {
    const i = ids.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    next.splice(i, 1);
    next.splice(j, 0, id);
    tryRun('reorderCollections', { ids: next });
  };

  return (
    <div className={styles.collections}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>Collections</span>
        <ActionIcon
          color="gray"
          className={styles.sectionAction}
          aria-label="New collection"
          title="New collection"
          onClick={ui.openNewCollection}
        >
          <IconPlus size={14} />
        </ActionIcon>
      </div>
      <SortableProvider
        onReorder={(_group, order) => {
          tryRun('reorderCollections', { ids: order });
        }}
      >
        <SortableGroup ids={ids}>
          <div className={styles.items}>
            {list.map((c, i) => (
              <CollectionItem
                key={c.id}
                collection={c}
                first={i === 0}
                last={i === list.length - 1}
                onMove={(by) => {
                  move(c.id, by);
                }}
                onDelete={() => {
                  setDeleting(c.id);
                }}
              />
            ))}
          </div>
        </SortableGroup>
      </SortableProvider>
      <DeleteCollectionDialog
        collectionId={deleting}
        onClose={() => {
          setDeleting(null);
        }}
      />
    </div>
  );
}

interface CollectionItemProps {
  collection: Collection;
  first: boolean;
  last: boolean;
  onMove: (by: number) => void;
  onDelete: () => void;
}

function CollectionItem({ collection, first, last, onMove, onDelete }: CollectionItemProps) {
  const { setNodeRef, style, handle } = useSortableItem(collection.id, 'collections');
  // Pointer dragging only: the link stays the item's single tab stop.
  const { onPointerDown } = handle as { onPointerDown?: PointerEventHandler };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={styles.collectionItem}
      onPointerDown={onPointerDown}
    >
      <NavItem
        href={collectionPath(collection.id)}
        title={collection.name}
        icon={(className) => (
          <CollectionIcon
            icon={collection.icon}
            color={collection.color}
            className={className}
            stroke={1.75}
            aria-hidden
          />
        )}
        variant="sidebar"
      />
      <Menu position="bottom-start" withinPortal>
        <Menu.Target>
          <ActionIcon
            color="gray"
            className={styles.itemMenu}
            aria-label={`Actions for ${collection.name}`}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
          >
            <IconDots size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconSettings size={14} />}
            onClick={() => {
              ui.openCollectionSettings(collection.id);
            }}
          >
            Settings…
          </Menu.Item>
          <Menu.Item
            leftSection={<IconArrowUp size={14} />}
            disabled={first}
            onClick={() => {
              onMove(-1);
            }}
          >
            Move up
          </Menu.Item>
          <Menu.Item
            leftSection={<IconArrowDown size={14} />}
            disabled={last}
            onClick={() => {
              onMove(1);
            }}
          >
            Move down
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onDelete}>
            Delete…
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}

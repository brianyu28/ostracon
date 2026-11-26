import { ActionIcon, Menu, UnstyledButton } from '@mantine/core';
import {
  IconCalendar,
  IconCopy,
  IconLayoutKanban,
  IconPencil,
  IconPlus,
  IconTable,
  IconTrash,
  type Icon,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { collectionPath } from '@/app/routes';
import { InlineEdit } from '@/components/InlineEdit/InlineEdit';
import { SortableGroup, SortableProvider } from '@/components/Sortable/Sortable';
import { useSortableItem } from '@/components/Sortable/useSortableItem';
import type { Id, View, ViewLayout } from '@/domain/schema/types';
import { toastWithUndo, tryDispatch, tryRun } from '@/store/actions';
import styles from './ViewTabs.module.scss';

interface ViewTabsProps {
  collectionId: Id;
  views: readonly View[];
  activeId: Id;
}

const LAYOUTS: Readonly<Record<ViewLayout, { label: string; Icon: Icon }>> = {
  table: { label: 'Table', Icon: IconTable },
  board: { label: 'Board', Icon: IconLayoutKanban },
  calendar: { label: 'Calendar', Icon: IconCalendar },
};

/** The collection's views as tabs: click to switch, double-click to rename, drag to reorder. */
export function ViewTabs({ collectionId, views, activeId }: ViewTabsProps) {
  const [, navigate] = useLocation();
  const [renaming, setRenaming] = useState<Id | null>(null);
  const open = (id: Id) => {
    navigate(collectionPath(collectionId, id));
  };
  const add = (layout: ViewLayout) => {
    const id = tryDispatch('createView', {
      collectionId,
      name: uniqueName(views, LAYOUTS[layout].label),
      layout,
      ...(views.length ? { afterViewId: views[views.length - 1]?.id ?? '' } : {}),
    });
    if (id) {
      open(id);
      setRenaming(id);
    }
  };
  return (
    <div className={styles.root} role="tablist" aria-label="Views">
      <SortableProvider
        axis="horizontal"
        onReorder={(_group, ids) => {
          tryRun('reorderViews', { collectionId, ids });
        }}
      >
        <SortableGroup axis="horizontal" ids={views.map((v) => v.id)}>
          {views.map((view) => (
            <ViewTab
              key={view.id}
              view={view}
              active={view.id === activeId}
              renaming={renaming === view.id}
              canDelete={views.length > 1}
              onOpen={() => {
                open(view.id);
              }}
              onRename={(name) => {
                setRenaming(null);
                if (name !== null) tryRun('updateView', { id: view.id, changes: { name } });
              }}
              onStartRename={() => {
                setRenaming(view.id);
              }}
              onDuplicate={() => {
                const id = tryDispatch('duplicateView', { id: view.id });
                if (id) open(id);
              }}
              onDelete={() => {
                const index = views.indexOf(view);
                if (!tryRun('deleteView', { id: view.id })) return;
                toastWithUndo(`Deleted view “${view.name}”`);
                const next = views[index + 1] ?? views[index - 1];
                if (view.id === activeId && next) open(next.id);
              }}
            />
          ))}
        </SortableGroup>
      </SortableProvider>
      <Menu position="bottom-start" withinPortal>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Add view">
            <IconPlus size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {(Object.keys(LAYOUTS) as ViewLayout[]).map((layout) => {
            const { label, Icon } = LAYOUTS[layout];
            return (
              <Menu.Item
                key={layout}
                leftSection={<Icon size={14} />}
                onClick={() => {
                  add(layout);
                }}
              >
                {label}
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}

function uniqueName(views: readonly View[], base: string): string {
  const names = new Set(views.map((v) => v.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++)
    if (!names.has(`${base} ${String(n)}`.toLowerCase())) return `${base} ${String(n)}`;
}

interface ViewTabProps {
  view: View;
  active: boolean;
  renaming: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onStartRename: () => void;
  /** The new name, or null when renaming was cancelled. */
  onRename: (name: string | null) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function ViewTab({
  view,
  active,
  renaming,
  canDelete,
  onOpen,
  onStartRename,
  onRename,
  onDuplicate,
  onDelete,
}: ViewTabProps) {
  const { setNodeRef, style, handle } = useSortableItem(view.id, 'views');
  const { setActivatorNodeRef, ...dragProps } = handle;
  const [menu, setMenu] = useState(false);
  const LayoutIcon = LAYOUTS[view.layout].Icon;
  return (
    <div ref={setNodeRef} style={style} className={clsx(styles.tab, active && styles.active)}>
      {renaming ? (
        <InlineEdit
          value={view.name}
          label="View name"
          className={styles.rename}
          startEditing
          onCommit={(name) => {
            onRename(name);
          }}
          onCancel={() => {
            onRename(null);
          }}
        />
      ) : (
        <Menu
          opened={menu}
          // The target's own click would toggle it: only our handlers open it.
          onChange={(open) => {
            if (!open) setMenu(false);
          }}
          position="bottom-start"
          withinPortal
        >
          <Menu.Target>
            <UnstyledButton
              ref={setActivatorNodeRef}
              className={styles.button}
              {...dragProps}
              role="tab"
              aria-selected={active}
              onClick={() => {
                if (active) setMenu((m) => !m);
                else onOpen();
              }}
              onDoubleClick={onStartRename}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onOpen();
              }}
            >
              <LayoutIcon size={13} className={styles.icon} />
              {view.name}
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconPencil size={14} />} onClick={onStartRename}>
              Rename
            </Menu.Item>
            <Menu.Item leftSection={<IconCopy size={14} />} onClick={onDuplicate}>
              Duplicate
            </Menu.Item>
            <Menu.Divider />
            {(Object.keys(LAYOUTS) as ViewLayout[])
              .filter((layout) => layout !== view.layout)
              .map((layout) => {
                const { label, Icon } = LAYOUTS[layout];
                return (
                  <Menu.Item
                    key={layout}
                    leftSection={<Icon size={14} />}
                    onClick={() => {
                      tryRun('updateView', { id: view.id, changes: { layout } });
                    }}
                  >
                    Show as {label.toLowerCase()}
                  </Menu.Item>
                );
              })}
            <Menu.Divider />
            {canDelete && (
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onDelete}>
                Delete
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      )}
    </div>
  );
}

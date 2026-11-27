import { Menu, UnstyledButton } from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconEyeOff,
  IconPencil,
  IconTextWrap,
  IconTrash,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { FieldTypeIcon } from '@/components/FieldTypeIcon/FieldTypeIcon';
import { useSortableItem } from '@/components/Sortable/useSortableItem';
import type { Sort } from '@/domain/schema/types';
import type { Column } from './columns';
import styles from './TableView.module.scss';

export interface HeaderActions {
  edit: (column: Column) => void;
  sort: (column: Column, dir: 'asc' | 'desc') => void;
  hide: (column: Column) => void;
  remove: (column: Column) => void;
  /** Turns text wrapping on or off for the column in this view. */
  wrap: (column: Column, on: boolean) => void;
  /** Live width while dragging the edge; `done` when released. */
  resize: (column: Column, width: number, done: boolean) => void;
}

interface HeaderCellProps {
  column: Column;
  sort: Sort | undefined;
  actions: HeaderActions;
}

/** A column header: click for the field menu, drag to reorder, drag the edge to resize. */
export function HeaderCell({ column, sort, actions }: HeaderCellProps) {
  const { field, width, primary, left } = column;
  const { setNodeRef, style, handle, isDragging } = useSortableItem(field.id, 'columns');
  const { setActivatorNodeRef, ...dragProps } = handle;
  const dragKeyDown = (dragProps as { onKeyDown?: (e: React.KeyboardEvent) => void }).onKeyDown;
  const [menuOpen, setMenuOpen] = useState(false);

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const widthAt = (x: number) => Math.max(60, width + x - startX);
    const move = (ev: PointerEvent) => {
      actions.resize(column, widthAt(ev.clientX), false);
    };
    const up = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      actions.resize(column, widthAt(ev.clientX), true);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={primary ? undefined : setNodeRef}
      role="columnheader"
      aria-sort={sort ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={clsx(styles.headerCell, primary && styles.primary, isDragging && styles.dragging)}
      style={{ ...(primary ? { left } : style), width }}
    >
      <Menu opened={menuOpen} onChange={setMenuOpen} position="bottom-start" withinPortal>
        <Menu.Target>
          <UnstyledButton
            ref={primary ? undefined : setActivatorNodeRef}
            className={styles.headerButton}
            {...(primary ? {} : dragProps)}
            // dnd-kit's keyboard sensor uses Space/Enter; keep Enter for the menu.
            onKeyDown={(e) => {
              if (e.key === 'Enter') setMenuOpen(true);
              else if (!primary) dragKeyDown?.(e);
            }}
          >
            <FieldTypeIcon type={field.type} className={styles.headerIcon} />
            <span className={styles.headerName}>{field.name}</span>
            {sort && (sort.dir === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />)}
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconPencil size={14} />}
            onClick={() => {
              actions.edit(column);
            }}
          >
            Edit field…
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            leftSection={<IconArrowUp size={14} />}
            onClick={() => {
              actions.sort(column, 'asc');
            }}
          >
            Sort ascending
          </Menu.Item>
          <Menu.Item
            leftSection={<IconArrowDown size={14} />}
            onClick={() => {
              actions.sort(column, 'desc');
            }}
          >
            Sort descending
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            leftSection={<IconTextWrap size={14} />}
            rightSection={column.wrap ? <IconCheck size={14} /> : undefined}
            onClick={() => {
              actions.wrap(column, !column.wrap);
            }}
          >
            Wrap text
          </Menu.Item>
          {!primary && (
            <>
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconEyeOff size={14} />}
                onClick={() => {
                  actions.hide(column);
                }}
              >
                Hide in this view
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => {
                  actions.remove(column);
                }}
              >
                Delete field
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
      <div
        className={styles.resizer}
        onPointerDown={startResize}
        onDoubleClick={() => {
          actions.resize(column, 0, true);
        }}
        aria-hidden
      />
    </div>
  );
}

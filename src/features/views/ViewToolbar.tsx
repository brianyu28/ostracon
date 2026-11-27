import { ActionIcon, Button, CloseButton, Popover, TextInput } from '@mantine/core';
import {
  IconArrowsSort,
  IconCalendar,
  IconFilter,
  IconLayoutKanban,
  IconLayoutRows,
  IconSearch,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Collection, Field, View } from '@/domain/schema/types';
import { countConditions } from '@/domain/views/filter';
import { FieldsMenu } from '@/features/collection/FieldsMenu';
import { tableStore, useTable } from '@/features/table/tableStore';
import { useCommandHandlers } from '@/keyboard/useCommandHandlers';
import { FilterEditor } from './FilterEditor';
import { GroupEditor } from './GroupEditor';
import { LayoutOptions } from './LayoutOptions';
import { SortEditor } from './SortEditor';
import styles from './ViewToolbar.module.scss';

type Panel = 'filter' | 'sort' | 'group' | 'fields' | 'layout';

interface ViewToolbarProps {
  collection: Collection;
  view: View;
  fields: readonly Field[];
  /** Icon-only buttons (phones). */
  compact?: boolean;
}

const GROUPABLE = (f: Field) => f.type !== 'formula' && f.type !== 'richText';

/** Filter, Sort, Group, Fields and search for the current view. */
export function ViewToolbar({ collection, view, fields, compact = false }: ViewToolbarProps) {
  const [open, setOpen] = useState<Panel | null>(null);
  const search = useTable((s) => s.search);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // A column header asked to filter on its field: open the filter with a condition on it.
  const [adding, setAdding] = useState<Field | null>(null);
  useEffect(
    () =>
      tableStore.subscribe(({ filterField }) => {
        if (filterField === null) return;
        tableStore.setState({ filterField: null });
        const field = fields.find((f) => f.id === filterField);
        if (!field) return;
        setAdding(field);
        setOpen('filter');
      }),
    [fields],
  );
  const toggle = (panel: Panel) => {
    setOpen((p) => (p === panel ? null : panel));
  };
  const showSearch = () => {
    setSearching(true);
    requestAnimationFrame(() => searchRef.current?.select());
  };
  useCommandHandlers({
    'view.filter': {
      run: () => {
        toggle('filter');
      },
    },
    'view.sort': {
      run: () => {
        toggle('sort');
      },
    },
    'view.group': {
      run: () => {
        toggle('group');
      },
    },
    'view.fields': {
      run: () => {
        toggle('fields');
      },
    },
    'view.search': { run: showSearch },
  });

  const filterCount = countConditions(view.filter);
  const sortCount = view.sorts?.length ?? 0;
  const groupField = view.group ? fields.find((f) => f.id === view.group?.fieldId) : undefined;

  const panel = (id: Panel, button: ReactNode, content: ReactNode, width?: number) => (
    <Popover
      opened={open === id}
      onChange={(o) => {
        setOpen(o ? id : null);
        if (!o) setAdding(null);
      }}
      position="bottom-end"
      shadow="md"
      withinPortal
      {...(width ? { width } : {})}
    >
      <Popover.Target>{button}</Popover.Target>
      <Popover.Dropdown className={styles.dropdown}>{open === id && content}</Popover.Dropdown>
    </Popover>
  );

  const toolButton = (id: Panel, icon: ReactNode, label: string, count: number | string) =>
    compact ? (
      <ActionIcon
        variant={count ? 'light' : 'subtle'}
        color={count ? 'accent' : 'gray'}
        size="md"
        aria-label={count ? `${label} (${String(count)})` : label}
        onClick={() => {
          toggle(id);
        }}
      >
        {icon}
      </ActionIcon>
    ) : (
      <Button
        size="xs"
        variant={count ? 'light' : 'subtle'}
        color="gray"
        leftSection={icon}
        onClick={() => {
          toggle(id);
        }}
      >
        {label}
        {count ? <span className={styles.count}>{count}</span> : null}
      </Button>
    );

  return (
    <div className={styles.root}>
      {panel(
        'filter',
        toolButton('filter', <IconFilter size={14} />, 'Filter', filterCount),
        <FilterEditor key={adding?.id} view={view} fields={fields} adding={adding} />,
      )}
      {panel(
        'sort',
        toolButton('sort', <IconArrowsSort size={14} />, 'Sort', sortCount),
        <SortEditor view={view} fields={fields} />,
      )}
      {view.layout === 'table' ? (
        <>
          {panel(
            'group',
            toolButton(
              'group',
              <IconLayoutRows size={14} />,
              'Group',
              groupField ? groupField.name : 0,
            ),
            <GroupEditor view={view} fields={fields.filter(GROUPABLE)} />,
            260,
          )}
          <FieldsMenu
            collection={collection}
            view={view}
            compact={compact}
            opened={open === 'fields'}
            onChange={(o) => {
              setOpen(o ? 'fields' : null);
            }}
          />
        </>
      ) : (
        panel(
          'layout',
          toolButton(
            'layout',
            view.layout === 'board' ? <IconLayoutKanban size={14} /> : <IconCalendar size={14} />,
            view.layout === 'board' ? 'Board' : 'Calendar',
            0,
          ),
          <LayoutOptions collection={collection} view={view} fields={fields} />,
          280,
        )
      )}
      {searching || search ? (
        <TextInput
          ref={searchRef}
          size="xs"
          className={styles.search}
          placeholder="Search"
          aria-label="Search this view"
          autoFocus
          leftSection={<IconSearch size={14} />}
          rightSection={
            <CloseButton
              size="xs"
              aria-label="Clear search"
              onClick={() => {
                tableStore.setState({ search: '' });
                setSearching(false);
              }}
            />
          }
          value={search}
          onChange={(e) => {
            tableStore.setState({ search: e.currentTarget.value });
          }}
          onBlur={() => {
            if (!search) setSearching(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              tableStore.setState({ search: '' });
              setSearching(false);
            }
          }}
        />
      ) : (
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Search this view"
          title="Search (⌘F)"
          onClick={showSearch}
        >
          <IconSearch size={15} />
        </ActionIcon>
      )}
    </div>
  );
}

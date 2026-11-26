import { ActionIcon, Button, CloseButton, Popover, TextInput } from '@mantine/core';
import { IconArrowsSort, IconFilter, IconLayoutRows, IconSearch } from '@tabler/icons-react';
import { useRef, useState, type ReactNode } from 'react';
import { fieldType } from '@/domain/fields/registry';
import type { Collection, Field, View } from '@/domain/schema/types';
import { countConditions } from '@/domain/views/filter';
import { FieldsMenu } from '@/features/collection/FieldsMenu';
import { tableStore, useTable } from '@/features/table/tableStore';
import { useCommandHandlers } from '@/keyboard/useCommandHandlers';
import { FilterEditor } from './FilterEditor';
import { GroupEditor } from './GroupEditor';
import { SortEditor } from './SortEditor';
import styles from './ViewToolbar.module.scss';

type Panel = 'filter' | 'sort' | 'group' | 'fields';

interface ViewToolbarProps {
  collection: Collection;
  view: View;
  fields: readonly Field[];
}

const SORTABLE = (f: Field) =>
  f.type !== 'link' && f.type !== 'formula' && (fieldType(f).stored || f.type.endsWith('Time'));
const GROUPABLE = (f: Field) => f.type !== 'formula' && f.type !== 'richText';

/** Filter, Sort, Group, Fields and search for the current view. */
export function ViewToolbar({ collection, view, fields }: ViewToolbarProps) {
  const [open, setOpen] = useState<Panel | null>(null);
  const search = useTable((s) => s.search);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
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

  const toolButton = (id: Panel, icon: ReactNode, label: string, count: number | string) => (
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
        <FilterEditor view={view} fields={fields.filter((f) => f.type !== 'formula')} />,
      )}
      {panel(
        'sort',
        toolButton('sort', <IconArrowsSort size={14} />, 'Sort', sortCount),
        <SortEditor view={view} fields={fields.filter(SORTABLE)} />,
      )}
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
        opened={open === 'fields'}
        onChange={(o) => {
          setOpen(o ? 'fields' : null);
        }}
      />
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

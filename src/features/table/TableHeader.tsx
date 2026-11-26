import { ActionIcon } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { SortableGroup, SortableProvider } from '@/components/Sortable/Sortable';
import type { Sort } from '@/domain/schema/types';
import type { Column } from './columns';
import { HeaderCell, type HeaderActions } from './HeaderCell';
import styles from './TableView.module.scss';

interface TableHeaderProps {
  columns: readonly Column[];
  width: number;
  sorts: readonly Sort[];
  allChecked: boolean;
  someChecked: boolean;
  onCheckAll: () => void;
  onReorder: (ids: string[]) => void;
  onAddField: () => void;
  actions: HeaderActions;
}

/** The sticky header row: select-all, column headers and "add field". */
export function TableHeader({
  columns,
  width,
  sorts,
  allChecked,
  someChecked,
  onCheckAll,
  onReorder,
  onAddField,
  actions,
}: TableHeaderProps) {
  const [primary, ...rest] = columns;
  return (
    <div className={styles.header} role="row" aria-rowindex={1} style={{ width }}>
      <div className={styles.gutter}>
        <input
          type="checkbox"
          className={styles.headerCheck}
          checked={allChecked}
          ref={(el) => {
            if (el) el.indeterminate = someChecked && !allChecked;
          }}
          aria-label="Select all rows"
          onChange={onCheckAll}
        />
      </div>
      {primary && (
        <HeaderCell
          column={primary}
          sort={sorts.find((s) => s.fieldId === primary.field.id)}
          actions={actions}
        />
      )}
      <SortableProvider
        axis="horizontal"
        onReorder={(_group, ids) => {
          onReorder(ids);
        }}
      >
        <SortableGroup axis="horizontal" ids={rest.map((c) => c.field.id)}>
          {rest.map((column) => (
            <HeaderCell
              key={column.field.id}
              column={column}
              sort={sorts.find((s) => s.fieldId === column.field.id)}
              actions={actions}
            />
          ))}
        </SortableGroup>
      </SortableProvider>
      <div className={styles.addColumn}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Add field"
          onClick={onAddField}
        >
          <IconPlus size={14} />
        </ActionIcon>
      </div>
    </div>
  );
}

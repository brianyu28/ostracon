import { ActionIcon, Button, Select, SegmentedControl } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { DragHandle, SortableGroup, SortableProvider } from '@/components/Sortable/Sortable';
import { useSortableItem } from '@/components/Sortable/useSortableItem';
import type { Field, Sort, View } from '@/domain/schema/types';
import { tryRun } from '@/store/actions';
import styles from './ViewToolbar.module.scss';

interface SortEditorProps {
  view: View;
  /** Fields that can be sorted by. */
  fields: readonly Field[];
}

/** The view's sorts in priority order: drag to reorder, add, remove, flip direction. */
export function SortEditor({ view, fields }: SortEditorProps) {
  const sorts = view.sorts ?? [];
  const save = (next: Sort[]) => {
    tryRun('updateView', { id: view.id, changes: { sorts: next.length ? next : undefined } });
  };
  const unused = fields.filter((f) => !sorts.some((s) => s.fieldId === f.id));
  return (
    <div className={styles.sorts}>
      {sorts.length === 0 && <div className={styles.emptyNote}>No sorts</div>}
      <SortableProvider
        onReorder={(_group, ids) => {
          save(ids.map((id) => sorts.find((s) => s.fieldId === id)).filter((s) => s !== undefined));
        }}
      >
        <SortableGroup ids={sorts.map((s) => s.fieldId)}>
          {sorts.map((sort, i) => (
            <SortRow
              key={sort.fieldId}
              sort={sort}
              fields={fields.filter((f) => f.id === sort.fieldId || unused.includes(f))}
              onChange={(next) => {
                const list = sorts.slice();
                if (next) list[i] = next;
                else list.splice(i, 1);
                save(list);
              }}
            />
          ))}
        </SortableGroup>
      </SortableProvider>
      {unused[0] && (
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          leftSection={<IconPlus size={14} />}
          className={styles.addButton}
          onClick={() => {
            save([...sorts, { fieldId: unused[0]?.id ?? '', dir: 'asc' }]);
          }}
        >
          Add sort
        </Button>
      )}
    </div>
  );
}

function SortRow({
  sort,
  fields,
  onChange,
}: {
  sort: Sort;
  fields: readonly Field[];
  onChange: (sort: Sort | null) => void;
}) {
  const { setNodeRef, style, handle } = useSortableItem(sort.fieldId, 'sorts');
  return (
    <div ref={setNodeRef} style={style} className={styles.row}>
      <DragHandle handle={handle} label="Move sort" />
      <Select
        size="xs"
        comboboxProps={{ withinPortal: false }}
        className={styles.fieldSelect}
        aria-label="Sort by"
        searchable
        allowDeselect={false}
        data={fields.map((f) => ({ value: f.id, label: f.name }))}
        value={sort.fieldId}
        onChange={(fieldId) => {
          if (fieldId) onChange({ ...sort, fieldId });
        }}
      />
      <SegmentedControl
        size="xs"
        value={sort.dir}
        data={[
          { value: 'asc', label: 'A → Z' },
          { value: 'desc', label: 'Z → A' },
        ]}
        onChange={(dir) => {
          onChange({ ...sort, dir: dir });
        }}
      />
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label="Remove sort"
        onClick={() => {
          onChange(null);
        }}
      >
        <IconTrash size={14} />
      </ActionIcon>
    </div>
  );
}

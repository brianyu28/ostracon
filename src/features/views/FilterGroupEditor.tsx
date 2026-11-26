import { ActionIcon, Button, Select } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { Field, FilterGroup } from '@/domain/schema/types';
import { ConditionRow } from './ConditionRow';
import { addTo, MAX_DEPTH, newCondition, updateAt } from './filterDraft';
import styles from './ViewToolbar.module.scss';

interface FilterGroupEditorProps {
  group: FilterGroup;
  /** Index path from the root group. */
  path: readonly number[];
  root: FilterGroup;
  fields: readonly Field[];
  onChange: (root: FilterGroup) => void;
}

/** One and/or group: its conditions and nested groups, with the connector on each row. */
export function FilterGroupEditor({ group, path, root, fields, onChange }: FilterGroupEditorProps) {
  const setOp = (op: 'and' | 'or') => {
    onChange(path.length ? updateAt(root, path, { ...group, op }) : { ...root, op });
  };
  const first = fields[0];
  return (
    <div className={styles.group}>
      {group.items.map((item, i) => {
        const itemPath = [...path, i];
        const connector =
          i === 0 ? (
            <span className={styles.connector}>Where</span>
          ) : i === 1 ? (
            <Select
              size="xs"
              comboboxProps={{ withinPortal: false }}
              className={styles.connectorSelect}
              aria-label="Combine conditions with"
              data={[
                { value: 'and', label: 'and' },
                { value: 'or', label: 'or' },
              ]}
              value={group.op}
              allowDeselect={false}
              onChange={(v) => {
                if (v === 'and' || v === 'or') setOp(v);
              }}
            />
          ) : (
            <span className={styles.connector}>{group.op}</span>
          );
        if ('items' in item) {
          return (
            <div key={i} className={styles.row}>
              {connector}
              <div className={styles.nested}>
                <FilterGroupEditor
                  group={item}
                  path={itemPath}
                  root={root}
                  fields={fields}
                  onChange={onChange}
                />
                {first && (
                  <Button
                    size="xs"
                    variant="subtle"
                    color="gray"
                    leftSection={<IconPlus size={14} />}
                    className={styles.addButton}
                    onClick={() => {
                      onChange(addTo(root, itemPath, newCondition(first)));
                    }}
                  >
                    Add condition
                  </Button>
                )}
              </div>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Remove group"
                onClick={() => {
                  onChange(updateAt(root, itemPath, null));
                }}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </div>
          );
        }
        return (
          <ConditionRow
            key={i}
            connector={connector}
            condition={item}
            fields={fields}
            onChange={(next) => {
              onChange(updateAt(root, itemPath, next));
            }}
            onAddGroup={
              path.length < MAX_DEPTH && first
                ? () => {
                    onChange(
                      updateAt(root, itemPath, {
                        op: group.op === 'and' ? 'or' : 'and',
                        items: [item, newCondition(first)],
                      }),
                    );
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

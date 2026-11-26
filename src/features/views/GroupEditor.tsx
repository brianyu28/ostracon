import { Button, Checkbox, SegmentedControl, Select } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { LOCATION_PART_LABELS, LOCATION_PARTS } from '@/domain/fields/types/other';
import type { Field, View } from '@/domain/schema/types';
import { tryRun } from '@/store/actions';
import styles from './ViewToolbar.module.scss';

type GroupSetting = NonNullable<View['group']>;

const DATE_TYPES = new Set(['date', 'dateTime', 'dateRange', 'createdTime', 'modifiedTime']);

/** Grouping for a table view: one field, its order, date buckets or location part. */
export function GroupEditor({ view, fields }: { view: View; fields: readonly Field[] }) {
  const group = view.group;
  const field = group ? fields.find((f) => f.id === group.fieldId) : undefined;
  const save = (next: GroupSetting | undefined) => {
    tryRun('updateView', { id: view.id, changes: { group: next } });
  };
  const set = (patch: Partial<GroupSetting>) => {
    if (!group) return;
    const next = { ...group, ...patch } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch))
      if (v === undefined) Reflect.deleteProperty(next, k);
    save(next as GroupSetting);
  };
  return (
    <div className={styles.groupEditor}>
      <Select
        size="xs"
        comboboxProps={{ withinPortal: false }}
        label="Group by"
        placeholder="None"
        searchable
        clearable
        data={fields.map((f) => ({ value: f.id, label: f.name }))}
        value={group?.fieldId ?? null}
        onChange={(fieldId) => {
          const f = fields.find((x) => x.id === fieldId);
          save(
            f
              ? {
                  fieldId: f.id,
                  dir: 'asc',
                  ...(DATE_TYPES.has(f.type) ? { dateBucket: 'month' as const } : {}),
                }
              : undefined,
          );
        }}
      />
      {group && field && (
        <>
          <SegmentedControl
            size="xs"
            value={group.dir}
            data={[
              { value: 'asc', label: 'A → Z' },
              { value: 'desc', label: 'Z → A' },
            ]}
            onChange={(dir) => {
              set({ dir: dir });
            }}
          />
          {DATE_TYPES.has(field.type) && (
            <Select
              size="xs"
              comboboxProps={{ withinPortal: false }}
              label="By"
              allowDeselect={false}
              data={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
                { value: 'year', label: 'Year' },
              ]}
              value={group.dateBucket ?? 'day'}
              onChange={(b) => {
                if (b) set({ dateBucket: b });
              }}
            />
          )}
          {field.type === 'location' && (
            <Select
              size="xs"
              comboboxProps={{ withinPortal: false }}
              label="Part"
              allowDeselect={false}
              data={[
                { value: '', label: 'Whole location' },
                ...LOCATION_PARTS.map((p) => ({ value: p, label: LOCATION_PART_LABELS[p] })),
              ]}
              value={group.part ?? ''}
              onChange={(p) => {
                set({ part: p ? p : undefined });
              }}
            />
          )}
          {field.type !== 'checkbox' && (
            <Checkbox
              size="xs"
              label="Hide the empty group"
              checked={group.hideEmpty === true}
              onChange={(e) => {
                set({ hideEmpty: e.currentTarget.checked ? true : undefined });
              }}
            />
          )}
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<IconX size={14} />}
            className={styles.addButton}
            onClick={() => {
              save(undefined);
            }}
          >
            Remove grouping
          </Button>
        </>
      )}
    </div>
  );
}

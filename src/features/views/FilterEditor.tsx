import { Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import type { Field, FilterGroup, View } from '@/domain/schema/types';
import { tryRun } from '@/store/actions';
import { addTo, newCondition } from './filterDraft';
import { FilterGroupEditor } from './FilterGroupEditor';
import styles from './ViewToolbar.module.scss';

interface FilterEditorProps {
  view: View;
  fields: readonly Field[];
}

const EMPTY: FilterGroup = { op: 'and', items: [] };
const SAVE_DELAY_MS = 400;

/**
 * The filter builder. Edits apply to the view shortly after they stop (so typing a value is one
 * undo step) and when the builder closes.
 */
export function FilterEditor({ view, fields }: FilterEditorProps) {
  const [draft, setDraft] = useState<FilterGroup>(() => view.filter ?? EMPTY);
  const pending = useRef<FilterGroup | null>(null);

  const save = (filter: FilterGroup) => {
    pending.current = null;
    if (JSON.stringify(filter) === JSON.stringify(view.filter ?? EMPTY)) return;
    tryRun('updateView', {
      id: view.id,
      changes: { filter: filter.items.length ? filter : undefined },
    });
  };
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    if (!pending.current) return;
    const timer = setTimeout(() => {
      if (pending.current) saveRef.current(pending.current);
    }, SAVE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [draft]);
  useEffect(
    () => () => {
      if (pending.current) saveRef.current(pending.current);
    },
    [],
  );

  const change = (next: FilterGroup) => {
    pending.current = next;
    setDraft(next);
  };

  const first = fields[0];
  return (
    <div className={styles.filter}>
      {draft.items.length === 0 ? (
        <div className={styles.emptyNote}>No filters</div>
      ) : (
        <FilterGroupEditor group={draft} path={[]} root={draft} fields={fields} onChange={change} />
      )}
      {first && (
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          leftSection={<IconPlus size={14} />}
          className={styles.addButton}
          onClick={() => {
            change(addTo(draft, [], newCondition(first)));
          }}
        >
          Add condition
        </Button>
      )}
    </div>
  );
}

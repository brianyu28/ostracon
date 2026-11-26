import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef } from 'react';
import { Link } from 'wouter';
import { recordPath } from '@/app/routes';
import { fieldType } from '@/domain/fields/registry';
import { recordTitle } from '@/domain/records';
import type { Collection, Field, RecordEntity, View } from '@/domain/schema/types';
import type { RecordGroup } from '@/domain/views/groups';
import { GroupLabel } from '@/features/table/GroupLabel';
import { useFormatContext } from '@/hooks/useFormatContext';
import { useDocStore } from '@/store/docStore';
import styles from './CollectionPage.module.scss';

interface RecordListProps {
  collection: Collection;
  records: readonly RecordEntity[];
  /** Fields shown under each title (the view's first visible ones). */
  fields: readonly Field[];
  /** Groups of a grouped view, shown as headers. */
  groups?: readonly RecordGroup[] | undefined;
  view: View;
}

type Row = { kind: 'group'; group: RecordGroup } | { kind: 'record'; record: RecordEntity };

/** The phone layout: one line per record with a short summary; tap to open it. */
export function RecordList({ collection, records, fields, groups, view }: RecordListProps) {
  const doc = useDocStore((s) => s.doc);
  const format = useFormatContext();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rows = useMemo<Row[]>(
    () =>
      groups
        ? groups.flatMap((group) => [
            { kind: 'group' as const, group },
            ...group.records.map((record) => ({ kind: 'record' as const, record })),
          ])
        : records.map((record) => ({ kind: 'record' as const, record })),
    [groups, records],
  );
  const groupField = view.group ? doc?.fields[view.group.fieldId] : undefined;
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns unstable functions by design.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: (i) => (rows[i]?.kind === 'group' ? 32 : 52),
    getItemKey: (i) => {
      const row = rows[i];
      return row ? (row.kind === 'group' ? `group:${row.group.key}` : row.record.id) : i;
    },
    overscan: 8,
  });
  if (!doc) return null;
  const summaryFields = fields
    .filter((f) => f.id !== collection.primaryFieldId && fieldType(f).stored)
    .slice(0, 3);
  return (
    <div className={styles.list} ref={scrollerRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          if (!row) return null;
          if (row.kind === 'group') {
            return (
              <div
                key={item.key}
                className={styles.listGroup}
                style={{ transform: `translateY(${String(item.start)}px)` }}
              >
                {groupField && view.group && (
                  <GroupLabel
                    field={groupField}
                    group={row.group}
                    setting={view.group}
                    format={format}
                  />
                )}
                <span className={styles.listGroupCount}>{row.group.records.length}</span>
              </div>
            );
          }
          const { record } = row;
          const summary = summaryFields
            .map((f) => {
              const v = record.values[f.id];
              return v === undefined ? '' : fieldType(f).format(v, f, format, 'display');
            })
            .filter(Boolean)
            .join(' · ');
          return (
            <Link
              key={item.key}
              href={recordPath(collection.id, record.id)}
              className={styles.listItem}
              style={{ transform: `translateY(${String(item.start)}px)` }}
            >
              <span className={styles.listTitle}>{recordTitle(doc, record)}</span>
              {summary && <span className={styles.listSummary}>{summary}</span>}
            </Link>
          );
        })}
      </div>
      {records.length === 0 && <p className={styles.empty}>No records yet.</p>}
    </div>
  );
}

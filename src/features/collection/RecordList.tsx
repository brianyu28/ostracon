import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { Link } from 'wouter';
import { recordPath } from '@/app/routes';
import { fieldType } from '@/domain/fields/registry';
import { recordTitle } from '@/domain/records';
import type { Collection, Field, RecordEntity } from '@/domain/schema/types';
import { useFormatContext } from '@/hooks/useFormatContext';
import { useDocStore } from '@/store/docStore';
import styles from './CollectionPage.module.scss';

interface RecordListProps {
  collection: Collection;
  records: readonly RecordEntity[];
  /** Fields shown under each title (the view's first visible ones). */
  fields: readonly Field[];
}

/** The phone layout: one line per record with a short summary; tap to open it. */
export function RecordList({ collection, records, fields }: RecordListProps) {
  const doc = useDocStore((s) => s.doc);
  const format = useFormatContext();
  const scrollerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns unstable functions by design.
  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 52,
    getItemKey: (i) => records[i]?.id ?? i,
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
          const record = records[item.index];
          if (!record) return null;
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

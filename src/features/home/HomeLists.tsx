import { useMemo } from 'react';
import { Link } from 'wouter';
import { recordPath } from '@/app/routes';
import { CollectionIcon } from '@/components/CollectionIcon/CollectionIcon';
import { onThisDay, recentRecords } from '@/domain/home';
import { recordTitle } from '@/domain/records';
import type { RecordEntity } from '@/domain/schema/types';
import { formatRelativeTime, pluralize } from '@/lib/format';
import { formatDate, today as todayDate } from '@/lib/date';
import { useDocStore } from '@/store/docStore';
import { useFormatContext } from '@/hooks/useFormatContext';
import { usePrefs } from '@/store/prefsStore';
import styles from './HomePage.module.scss';

/** Recently edited records and records from this day in earlier years. */
export function HomeLists() {
  const doc = useDocStore((s) => s.doc);
  const format = useFormatContext();
  const today = todayDate();
  const showOnThisDay = usePrefs((s) => s.homeOnThisDay);
  const showRecent = usePrefs((s) => s.homeRecent);
  const recentCount = usePrefs((s) => s.homeRecentCount);
  const recent = useMemo(
    () => (doc && showRecent ? recentRecords(doc, recentCount) : []),
    [doc, showRecent, recentCount],
  );
  const anniversaries = useMemo(
    () => (doc && showOnThisDay ? onThisDay(doc, today) : []),
    [doc, today, showOnThisDay],
  );
  if (!doc) return null;

  const row = (record: RecordEntity, detail: string, key: string) => {
    const collection = doc.collections[record.collectionId];
    return (
      <li key={key}>
        <Link href={recordPath(record.collectionId, record.id)} className={styles.row}>
          <CollectionIcon
            icon={collection?.icon}
            color={collection?.color}
            size={15}
            stroke={1.75}
          />
          <span className={styles.rowTitle}>{recordTitle(doc, record)}</span>
          <span className={styles.rowDetail}>{detail}</span>
        </Link>
      </li>
    );
  };

  return (
    <div className={styles.lists}>
      {anniversaries.length > 0 && (
        <section>
          <h3 className={styles.subtitle}>On this day</h3>
          <ul className={styles.rows}>
            {anniversaries.map((a) =>
              row(
                a.record,
                `${pluralize(a.yearsAgo, 'year')} ago · ${a.field.name}, ${formatDate(a.date, format.locale)}`,
                `${a.record.id}:${a.field.id}`,
              ),
            )}
          </ul>
        </section>
      )}
      {recent.length > 0 && (
        <section>
          <h3 className={styles.subtitle}>Recently edited</h3>
          <ul className={styles.rows}>
            {recent.map((r) =>
              row(
                r,
                `${doc.collections[r.collectionId]?.name ?? ''} · ${formatRelativeTime(r.updatedAt)}`,
                r.id,
              ),
            )}
          </ul>
        </section>
      )}
    </div>
  );
}

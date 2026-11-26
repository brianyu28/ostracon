import { Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { Link } from 'wouter';
import { collectionPath } from '@/app/routes';
import { CollectionIcon } from '@/components/CollectionIcon/CollectionIcon';
import { pluralize } from '@/lib/format';
import { useDocStore } from '@/store/docStore';
import { ui } from '@/store/uiStore';
import { HomeLists } from './HomeLists';
import styles from './HomePage.module.scss';

/** The open document's collections, recently edited records and "On this day". */
export function HomePage() {
  const collections = useDocStore((s) => s.doc?.collections);
  const index = useDocStore((s) => s.index);
  useDocStore((s) => s.indexVersion); // record counts change with the index
  const list = Object.values(collections ?? {}).sort((a, b) => a.order - b.order);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h2 className={styles.title}>Collections</h2>
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={ui.openNewCollection}>
          New collection
        </Button>
      </div>
      {list.length === 0 ? (
        <p className={styles.empty}>Create a collection to get started.</p>
      ) : (
        <div className={styles.grid}>
          {list.map((c) => (
            <Link key={c.id} href={collectionPath(c.id)} className={styles.tile}>
              <CollectionIcon
                icon={c.icon}
                color={c.color}
                size={18}
                stroke={1.75}
                className={styles.icon}
              />
              <span className={styles.name}>{c.name}</span>
              <span className={styles.count}>
                {pluralize(index?.recordCount(c.id) ?? 0, 'record')}
              </span>
            </Link>
          ))}
        </div>
      )}
      {list.length > 0 && <HomeLists />}
    </div>
  );
}

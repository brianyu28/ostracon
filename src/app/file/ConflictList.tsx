import { UnstyledButton } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'wouter';
import { recordPath } from '@/app/routes';
import type { MergeConflict } from '@/domain/sync/merge';
import styles from './NoticeBar.module.scss';

const RESOLUTION: Record<MergeConflict['resolution'], string> = {
  'kept-local': 'kept yours',
  'kept-remote': 'kept the other copy’s',
  'kept-edit-over-delete': 'kept the edit, not the deletion',
};

/** Things edited differently on both copies, with what was kept; records open on click. */
export function ConflictList({ conflicts }: { conflicts: readonly MergeConflict[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? conflicts : conflicts.slice(0, 5);
  return (
    <ul className={styles.list}>
      {shown.map((c) => (
        <li key={`${c.collection}:${c.id}`}>
          {c.collectionId ? (
            <Link href={recordPath(c.collectionId, c.id)} className={styles.link}>
              {c.label}
            </Link>
          ) : (
            c.label
          )}
          {c.details?.length ? ` (${c.details.join(', ')})` : ''}: {RESOLUTION[c.resolution]}
        </li>
      ))}
      {!all && conflicts.length > 5 && (
        <li>
          <UnstyledButton
            className={styles.link}
            onClick={() => {
              setAll(true);
            }}
          >
            Show all {conflicts.length}
          </UnstyledButton>
        </li>
      )}
    </ul>
  );
}

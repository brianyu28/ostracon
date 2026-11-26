import { ActionIcon, Tooltip } from '@mantine/core';
import { IconCopy, IconExternalLink, IconTrash, IconX } from '@tabler/icons-react';
import { Link } from 'wouter';
import { recordPath } from '@/app/routes';
import type { RecordEntity } from '@/domain/schema/types';
import { deleteRecords, duplicateRecords } from './recordActions';
import { RecordDetails } from './RecordDetails';
import styles from './RecordPanel.module.scss';

interface RecordPanelProps {
  record: RecordEntity;
  onClose: () => void;
}

/** The side panel next to the table: the cursor's record with every field. */
export function RecordPanel({ record, onClose }: RecordPanelProps) {
  return (
    <aside className={styles.root} aria-label="Record">
      <div className={styles.toolbar}>
        <Tooltip label="Open as page">
          <ActionIcon
            component={Link}
            href={recordPath(record.collectionId, record.id)}
            variant="subtle"
            color="gray"
            aria-label="Open as page"
          >
            <IconExternalLink size={15} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Duplicate">
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Duplicate record"
            onClick={() => {
              duplicateRecords(record.collectionId, [record.id]);
            }}
          >
            <IconCopy size={15} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Delete">
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Delete record"
            onClick={() => {
              deleteRecords(record.collectionId, [record.id]);
            }}
          >
            <IconTrash size={15} />
          </ActionIcon>
        </Tooltip>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Close panel"
          className={styles.close}
          onClick={onClose}
        >
          <IconX size={15} />
        </ActionIcon>
      </div>
      <div className={styles.body}>
        <RecordDetails key={record.id} record={record} variant="panel" />
      </div>
    </aside>
  );
}

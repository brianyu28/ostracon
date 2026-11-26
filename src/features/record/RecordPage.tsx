import { ActionIcon, Button } from '@mantine/core';
import { IconArrowLeft, IconCopy, IconTrash } from '@tabler/icons-react';
import { Link, Redirect, useLocation, useParams } from 'wouter';
import { collectionPath, recordPath } from '@/app/routes';
import { CollectionIcon } from '@/components/CollectionIcon/CollectionIcon';
import { getRecord } from '@/domain/model';
import { useDocStore } from '@/store/docStore';
import { deleteRecords, duplicateRecords } from './recordActions';
import { RecordDetails } from './RecordDetails';
import styles from './RecordPage.module.scss';

/** A record on its own page (also the phone layout's record view). */
export function RecordPage() {
  const { collectionId = '', recordId = '' } = useParams<{
    collectionId?: string;
    recordId?: string;
  }>();
  const doc = useDocStore((s) => s.doc);
  const [, navigate] = useLocation();
  if (!doc) return null;
  const collection = doc.collections[collectionId];
  const record = getRecord(doc, collectionId, recordId);
  if (!collection) return <Redirect to="/" replace />;
  if (!record) return <Redirect to={collectionPath(collectionId)} replace />;
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <ActionIcon
          component={Link}
          href={collectionPath(collectionId)}
          variant="subtle"
          color="gray"
          aria-label={`Back to ${collection.name}`}
        >
          <IconArrowLeft size={16} />
        </ActionIcon>
        <Link href={collectionPath(collectionId)} className={styles.crumb}>
          <CollectionIcon icon={collection.icon} color={collection.color} size={15} />
          {collection.name}
        </Link>
        <div className={styles.actions}>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconCopy size={14} />}
            onClick={() => {
              const [copy] = duplicateRecords(collectionId, [record.id]);
              if (copy) navigate(recordPath(collectionId, copy));
            }}
          >
            Duplicate
          </Button>
          <Button
            size="xs"
            variant="default"
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={() => {
              if (deleteRecords(collectionId, [record.id])) navigate(collectionPath(collectionId));
            }}
          >
            Delete
          </Button>
        </div>
      </div>
      <div className={styles.body}>
        <RecordDetails key={record.id} record={record} variant="page" />
      </div>
    </div>
  );
}

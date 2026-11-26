import { useLocation } from 'wouter';
import { ConfirmDialog } from '@/components/ConfirmDialog/ConfirmDialog';
import type { Id } from '@/domain/schema/types';
import { pluralize } from '@/lib/format';
import { toastWithUndo, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';

interface DeleteCollectionDialogProps {
  collectionId: Id | null;
  onClose: () => void;
  onDeleted?: () => void;
}

/** Confirms deleting a collection, naming the link fields elsewhere that go with it. */
export function DeleteCollectionDialog({
  collectionId,
  onClose,
  onDeleted,
}: DeleteCollectionDialogProps) {
  const [location, navigate] = useLocation();
  const doc = useDocStore((s) => s.doc);
  const index = useDocStore((s) => s.index);
  const collection = collectionId ? doc?.collections[collectionId] : undefined;
  if (!doc || !collection) return null;
  const count = index?.recordCount(collection.id) ?? 0;
  const inbound = Object.values(doc.fields).filter(
    (f) =>
      f.type === 'link' &&
      f.collectionId !== collection.id &&
      f.config.targetCollectionId === collection.id,
  );
  return (
    <ConfirmDialog
      opened
      title={`Delete ${collection.name}?`}
      confirmLabel="Delete collection"
      danger
      onClose={onClose}
      onConfirm={() => {
        if (!tryRun('deleteCollection', { id: collection.id })) return;
        toastWithUndo(`Deleted ${collection.name}`);
        if (location.startsWith(`/c/${collection.id}`)) navigate('/');
        onDeleted?.();
      }}
    >
      This deletes the collection and its {pluralize(count, 'record')}
      {inbound.length > 0 &&
        `, and the link field${inbound.length > 1 ? 's' : ''} ${inbound
          .map((f) => `“${f.name}” in ${doc.collections[f.collectionId]?.name ?? '?'}`)
          .join(', ')}`}
      . You can undo this.
    </ConfirmDialog>
  );
}

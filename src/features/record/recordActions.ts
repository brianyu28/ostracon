import type { Id } from '@/domain/schema/types';
import { pluralize } from '@/lib/format';
import { toastWithUndo, tryDispatch, tryRun } from '@/store/actions';

/** Deletes records with an Undo toast (no confirmation: it's one undo away). */
export function deleteRecords(collectionId: Id, ids: readonly Id[]): boolean {
  if (ids.length === 0) return false;
  if (!tryRun('deleteRecords', { collectionId, ids })) return false;
  toastWithUndo(`Deleted ${pluralize(ids.length, 'record')}`);
  return true;
}

/** Duplicates records; returns the copies' ids. */
export function duplicateRecords(collectionId: Id, ids: readonly Id[]): Id[] {
  if (ids.length === 0) return [];
  const copies = tryDispatch('duplicateRecords', { collectionId, ids }) ?? [];
  if (copies.length) toastWithUndo(`Duplicated ${pluralize(copies.length, 'record')}`);
  return copies;
}

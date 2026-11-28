/** Importing collections from another Ostraca file: one undo step. */
import type { DocModel } from '../model';
import type { Id } from '../schema/types';
import { addCopied, copyCollections, extractCollections } from '../transfer';
import { CommandError, defineCommand } from './define';

export interface ImportCollectionsResult {
  /** The new collections' ids, in the source's order. */
  collectionIds: Id[];
  records: number;
}

/**
 * Copies the chosen collections of a loaded file into the document, with fresh ids. Links to
 * collections that aren't chosen are left out.
 */
export const importCollections = defineCommand<
  { source: DocModel; collectionIds: readonly Id[] },
  ImportCollectionsResult
>({
  label: 'Import collections',
  run(draft, { source, collectionIds }, ctx) {
    const picked = extractCollections(source, collectionIds);
    if (Object.keys(picked.collections).length === 0)
      throw new CommandError('Choose at least one collection.');
    const existing = Object.values(draft.collections);
    const copied = copyCollections(picked, {
      newId: ctx.newId,
      firstOrder: Math.max(-1, ...existing.map((c) => c.order)) + 1,
      takenNames: new Set(existing.map((c) => c.name)),
    });
    addCopied(draft, copied);
    return {
      collectionIds: copied.collections.map((c) => c.id),
      records: copied.records.length,
    };
  },
});

/**
 * In-memory indexes over records, kept up to date incrementally from Immer patches.
 * A full build runs once on load; each edit then updates only the records it touched.
 *
 * The index is mutable for speed. Consumers observe `version` (and the per-collection
 * versions) to know when derived data needs recomputing.
 *
 * Phase 0 keeps per-collection record counts and versions; Phase 1 adds link sides,
 * Phase 10 the recent list and search tokens.
 */
import { iterateRecords, type DocModel } from '../model';
import type { Id, RecordEntity } from '../schema/types';

export class DocIndex {
  /** Bumped on every change to the index. */
  version = 0;
  private readonly counts = new Map<Id, number>();
  /** Bumped when any record in the collection changes (view caches key on it). */
  private readonly collectionVersions = new Map<Id, number>();

  static build(doc: DocModel): DocIndex {
    const index = new DocIndex();
    for (const r of iterateRecords(doc)) {
      index.counts.set(r.collectionId, (index.counts.get(r.collectionId) ?? 0) + 1);
    }
    return index;
  }

  recordCount(collectionId: Id): number {
    return this.counts.get(collectionId) ?? 0;
  }

  collectionVersion(collectionId: Id): number {
    return this.collectionVersions.get(collectionId) ?? 0;
  }

  /** Applies one record change (`prev` → `next`; either may be undefined). */
  update(prev: RecordEntity | undefined, next: RecordEntity | undefined): void {
    if (prev === next) return;
    if (prev) {
      this.counts.set(prev.collectionId, (this.counts.get(prev.collectionId) ?? 1) - 1);
      this.bump(prev.collectionId);
    }
    if (next) {
      this.counts.set(next.collectionId, (this.counts.get(next.collectionId) ?? 0) + 1);
      if (next.collectionId !== prev?.collectionId) this.bump(next.collectionId);
    }
    this.version++;
  }

  private bump(collectionId: Id): void {
    this.collectionVersions.set(collectionId, this.collectionVersion(collectionId) + 1);
  }
}

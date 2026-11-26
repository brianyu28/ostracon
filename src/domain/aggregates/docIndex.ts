/**
 * In-memory indexes over records and links, kept up to date incrementally from Immer patches.
 * A full build runs once on load; each edit then updates only the records and links it touched.
 *
 * The index is mutable for speed. Consumers observe `version` (and the per-collection
 * versions) to know when derived data needs recomputing.
 */
import { canonicalFieldId, compareLinkOrder, isSymmetric } from '../links';
import { iterateLinks, iterateRecords, linkKey, type DocModel } from '../model';
import type { Field, Id, Link, RecordEntity } from '../schema/types';

/** Links of one canonical field: record id → linked record ids, oldest link first. */
type Side = Map<Id, Link[]>;

const before = (a: Link, b: Link) => compareLinkOrder(a[3], linkKey(a), b[3], linkKey(b)) < 0;

function insertSorted(list: Link[], link: Link): void {
  // Links arrive mostly in creation order, so search from the end.
  let i = list.length;
  while (i > 0) {
    const prev = list[i - 1];
    if (!prev || before(prev, link)) break;
    i--;
  }
  list.splice(i, 0, link);
}

function removeFrom(side: Side, recordId: Id, link: Link): void {
  const list = side.get(recordId);
  if (!list) return;
  const i = list.findIndex((l) => l[0] === link[0] && l[1] === link[1] && l[2] === link[2]);
  if (i !== -1) list.splice(i, 1);
  if (list.length === 0) side.delete(recordId);
}

export class DocIndex {
  /** Bumped on every change to the index. */
  version = 0;
  private readonly counts = new Map<Id, number>();
  /** Bumped when any record in the collection, or a link of it, changes. */
  private readonly collectionVersions = new Map<Id, number>();
  /** Per canonical link field: links by their `from` record and by their `to` record. */
  private readonly forward = new Map<Id, Side>();
  private readonly backward = new Map<Id, Side>();
  /** Collections of both ends of each canonical field's links (for version bumps). */
  private linkCollections = new Map<Id, [Id, Id]>();

  static build(doc: DocModel): DocIndex {
    const index = new DocIndex();
    for (const r of iterateRecords(doc)) {
      index.counts.set(r.collectionId, (index.counts.get(r.collectionId) ?? 0) + 1);
    }
    index.syncFields(doc.fields);
    for (const [, link] of iterateLinks(doc)) index.addLink(link);
    return index;
  }

  recordCount(collectionId: Id): number {
    return this.counts.get(collectionId) ?? 0;
  }

  collectionVersion(collectionId: Id): number {
    return this.collectionVersions.get(collectionId) ?? 0;
  }

  /** Records linked to `recordId` through `field` (either side of a pair), oldest link first. */
  linked(field: Field, recordId: Id): readonly Id[] {
    if (field.type !== 'link') return [];
    const link = field;
    const canonical = canonicalFieldId(link);
    const out = (
      field.id === canonical || isSymmetric(link)
        ? (this.forward.get(canonical)?.get(recordId) ?? [])
        : []
    ).map((l) => ({ link: l, id: l[2] }));
    if (field.id !== canonical || isSymmetric(link)) {
      for (const l of this.backward.get(canonical)?.get(recordId) ?? [])
        out.push({ link: l, id: l[1] });
    }
    // A symmetric record's links sit on both sides: merge them back into one order.
    if (isSymmetric(link)) out.sort((a, b) => (before(a.link, b.link) ? -1 : 1));
    return out.map((o) => o.id);
  }

  /** Keeps track of which collections each link pair joins (call when fields change). */
  syncFields(fields: Record<Id, Field>): void {
    const map = new Map<Id, [Id, Id]>();
    for (const f of Object.values(fields)) {
      if (f.type !== 'link') continue;
      const canonical = canonicalFieldId(f);
      if (canonical === f.id) map.set(f.id, [f.collectionId, f.config.targetCollectionId]);
    }
    this.linkCollections = map;
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

  /** Applies one link change (added, removed, or both for a replaced link). */
  updateLink(prev: Link | undefined, next: Link | undefined): void {
    if (prev === next) return;
    if (prev) this.removeLink(prev);
    if (next) this.addLink(next);
    this.version++;
  }

  private addLink(link: Link): void {
    const [fieldId, fromId, toId] = link;
    let fwd = this.forward.get(fieldId);
    if (!fwd) this.forward.set(fieldId, (fwd = new Map<Id, Link[]>()));
    let bwd = this.backward.get(fieldId);
    if (!bwd) this.backward.set(fieldId, (bwd = new Map<Id, Link[]>()));
    let a = fwd.get(fromId);
    if (!a) fwd.set(fromId, (a = []));
    insertSorted(a, link);
    let b = bwd.get(toId);
    if (!b) bwd.set(toId, (b = []));
    insertSorted(b, link);
    this.bumpLink(fieldId);
  }

  private removeLink(link: Link): void {
    const [fieldId, fromId, toId] = link;
    const fwd = this.forward.get(fieldId);
    const bwd = this.backward.get(fieldId);
    if (fwd) removeFrom(fwd, fromId, link);
    if (bwd) removeFrom(bwd, toId, link);
    this.bumpLink(fieldId);
  }

  private bumpLink(fieldId: Id): void {
    for (const collectionId of this.linkCollections.get(fieldId) ?? []) this.bump(collectionId);
  }

  private bump(collectionId: Id): void {
    this.collectionVersions.set(collectionId, this.collectionVersion(collectionId) + 1);
  }
}

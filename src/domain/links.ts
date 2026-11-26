/**
 * Links between records. A link field pair (Restaurants.People ↔ People.Restaurants) shares
 * one set of links, stored once in the document's `links` table from the pair's
 * **canonical** side: the field with the smaller id. A symmetric link (People.Friends) is one
 * field paired with itself, and its links are stored with the smaller record id first.
 *
 *   link tuple: [canonicalFieldId, fromRecordId, toRecordId, createdAt]
 *   model key:  "canonicalFieldId|fromRecordId|toRecordId"   (also the tombstone id)
 *
 * The key encodes the whole link, so scanning keys never touches the tuples (cheap on Immer
 * drafts), and adding a link twice is a no-op.
 */
import { getLink, hasLink, linkKey, type DocModel } from './model';
import type { Field, FieldOf, Id } from './schema/types';

export type LinkField = FieldOf<'link'>;

export function isSymmetric(field: LinkField): boolean {
  return field.config.inverseFieldId === field.id;
}

/** The pair's canonical field id (where its links are stored). */
export function canonicalFieldId(field: LinkField): Id {
  const inverse = field.config.inverseFieldId;
  return field.id < inverse ? field.id : inverse;
}

/** The stored [field, from, to] of a link seen from `field`'s side (`recordId` → `targetId`). */
export function storedLink(field: LinkField, recordId: Id, targetId: Id): [Id, Id, Id] {
  const canonical = canonicalFieldId(field);
  if (isSymmetric(field)) {
    return recordId < targetId ? [canonical, recordId, targetId] : [canonical, targetId, recordId];
  }
  return field.id === canonical ? [canonical, recordId, targetId] : [canonical, targetId, recordId];
}

export function storedLinkKey(field: LinkField, recordId: Id, targetId: Id): string {
  return linkKey(storedLink(field, recordId, targetId));
}

/** Splits a link key back into its parts. */
export function parseLinkKey(key: string): [Id, Id, Id] {
  const [fieldId = '', fromId = '', toId = ''] = key.split('|');
  return [fieldId, fromId, toId];
}

/**
 * The records linked to `recordId` through `field`, oldest link first, by scanning every link.
 * The slow path: commands use `linksOf` (which reads the index), tests use this to check it.
 */
export function linkedIdsInDoc(doc: Pick<DocModel, 'links'>, field: LinkField, recordId: Id): Id[] {
  const canonical = canonicalFieldId(field);
  const symmetric = isSymmetric(field);
  const forward = field.id === canonical;
  const found: { id: Id; key: string; created: string }[] = [];
  const prefix = `${canonical}|`;
  for (const bucket of Object.values(doc.links)) {
    for (const [key, link] of Object.entries(bucket)) {
      if (!key.startsWith(prefix)) continue;
      const [, from, to] = parseLinkKey(key);
      if ((symmetric || forward) && from === recordId)
        found.push({ id: to, key, created: link[3] });
      else if ((symmetric || !forward) && to === recordId)
        found.push({ id: from, key, created: link[3] });
    }
  }
  found.sort((a, b) => compareLinkOrder(a.created, a.key, b.created, b.key));
  return found.map((f) => f.id);
}

/** Answers "which records are linked to this one" (the `DocIndex` implements it). */
export interface LinkLookup {
  linked(field: Field, recordId: Id): readonly Id[];
}

/**
 * What a command needs to read links quickly: the index as it was before the command, plus the
 * keys of links the command has added so far (removals show up as missing keys in the draft).
 */
export interface LinkReader {
  index: LinkLookup;
  added: Set<string>;
}

/**
 * The records linked to `recordId` through `field` in the document as it is now (a draft
 * during a command). With a reader this costs O(links of the record); without one it scans.
 */
export function linksOf(
  doc: Pick<DocModel, 'links'>,
  field: LinkField,
  recordId: Id,
  reader?: LinkReader,
): Id[] {
  if (!reader) return linkedIdsInDoc(doc, field, recordId);
  const ids = reader.index
    .linked(field, recordId)
    .filter((target) => hasLink(doc, storedLinkKey(field, recordId, target)));
  if (reader.added.size === 0) return ids;
  const canonical = canonicalFieldId(field);
  const symmetric = isSymmetric(field);
  const forward = field.id === canonical;
  const fresh: { id: Id; key: string; created: string }[] = [];
  for (const key of reader.added) {
    const [f, from, to] = parseLinkKey(key);
    if (f !== canonical || !hasLink(doc, key)) continue;
    let other: Id | undefined;
    if ((symmetric || forward) && from === recordId) other = to;
    else if ((symmetric || !forward) && to === recordId) other = from;
    if (other !== undefined && !ids.includes(other))
      fresh.push({ id: other, key, created: getLink(doc, key)?.[3] ?? '' });
  }
  fresh.sort((a, b) => compareLinkOrder(a.created, a.key, b.created, b.key));
  return [...ids, ...fresh.map((f) => f.id)];
}

/** Display order of links: oldest first, then by key so ties are stable everywhere. */
export function compareLinkOrder(
  createdA: string,
  keyA: string,
  createdB: string,
  keyB: string,
): number {
  if (createdA !== createdB) return createdA < createdB ? -1 : 1;
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
}

/**
 * Timestamps for links added together: one millisecond apart from `now`, so they keep the
 * order they were chosen in.
 */
export function linkTimestamp(now: string, index: number): string {
  if (index === 0) return now;
  const ms = Date.parse(now);
  return Number.isNaN(ms) ? now : new Date(ms + index).toISOString();
}

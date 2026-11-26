/**
 * Cross-reference checks that a structural schema can't express: duplicate ids, entities
 * pointing at missing collections, fields or records. Issues are reported (not fatal) so a
 * slightly damaged file can still be opened and repaired.
 */
import type { OstraconFile } from './types';

export interface IntegrityIssue {
  entityId: string;
  message: string;
}

export function checkIntegrity(file: OstraconFile): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const seen = new Set<string>();
  const ids = (items: readonly { id: string }[]) => {
    const set = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id)) issues.push({ entityId: item.id, message: 'Duplicate id' });
      seen.add(item.id);
      set.add(item.id);
    }
    return set;
  };

  const collections = ids(file.collections);
  const fieldCollection = new Map(file.fields.map((f) => [f.id, f.collectionId]));
  ids(file.fields);
  ids(file.views);
  const recordCollection = new Map(file.records.map((r) => [r.id, r.collectionId]));
  ids(file.records);

  const inCollection = (ownerId: string, collectionId: string) => {
    if (!collections.has(collectionId))
      issues.push({ entityId: ownerId, message: `Unknown collection ${collectionId}` });
  };

  for (const c of file.collections) {
    if (fieldCollection.get(c.primaryFieldId) !== c.id)
      issues.push({ entityId: c.id, message: 'Primary field is missing' });
  }
  for (const f of file.fields) inCollection(f.id, f.collectionId);
  for (const v of file.views) {
    inCollection(v.id, v.collectionId);
    for (const { fieldId } of v.fields) {
      if (fieldCollection.get(fieldId) !== v.collectionId)
        issues.push({ entityId: v.id, message: `Unknown field ${fieldId}` });
    }
  }
  for (const r of file.records) {
    inCollection(r.id, r.collectionId);
    for (const fieldId of Object.keys(r.values)) {
      if (fieldCollection.get(fieldId) !== r.collectionId)
        issues.push({ entityId: r.id, message: `Value for unknown field ${fieldId}` });
    }
  }
  for (const [fieldId, fromId, toId] of file.links) {
    const key = `${fieldId}|${fromId}|${toId}`;
    if (!fieldCollection.has(fieldId))
      issues.push({ entityId: key, message: `Link uses unknown field ${fieldId}` });
    if (!recordCollection.has(fromId) || !recordCollection.has(toId))
      issues.push({ entityId: key, message: 'Link points at a missing record' });
  }
  return issues;
}

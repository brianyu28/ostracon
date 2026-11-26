/**
 * Cross-reference checks that the structural schema can't express: duplicate ids, entities
 * pointing at missing collections, fields or records, values that don't fit their field's
 * type, broken link pairs and views referring to unusable fields. Issues are reported (not
 * fatal) so a slightly damaged file can still be opened and repaired.
 */
import { fieldType } from '../fields/registry';
import { canonicalFieldId, isSymmetric } from '../links';
import { repairView } from '../views/repair';
import type { Field, Id, OstraconFile } from './types';

export interface IntegrityIssue {
  entityId: string;
  message: string;
}

/** Stop collecting after this many issues (a badly damaged file would otherwise flood the UI). */
const MAX_ISSUES = 200;

export function checkIntegrity(file: OstraconFile): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const report = (entityId: string, message: string) => {
    if (issues.length < MAX_ISSUES) issues.push({ entityId, message });
  };
  const seen = new Set<string>();
  const ids = (items: readonly { id: string }[]) => {
    for (const item of items) {
      if (seen.has(item.id)) report(item.id, 'Duplicate id');
      seen.add(item.id);
    }
  };
  ids(file.collections);
  ids(file.fields);
  ids(file.views);
  ids(file.records);

  const collections = new Set(file.collections.map((c) => c.id));
  const fields = new Map<Id, Field>(file.fields.map((f) => [f.id, f]));
  const recordCollection = new Map(file.records.map((r) => [r.id, r.collectionId]));
  const inCollection = (ownerId: string, collectionId: string) => {
    if (!collections.has(collectionId)) report(ownerId, `Unknown collection ${collectionId}`);
  };

  for (const c of file.collections) {
    const primary = fields.get(c.primaryFieldId);
    if (primary?.collectionId !== c.id) report(c.id, 'Primary field is missing');
    else if (!fieldType(primary).canBePrimary)
      report(c.id, 'Primary field must be text or a formula');
  }

  for (const f of file.fields) {
    inCollection(f.id, f.collectionId);
    if (f.type === 'singleSelect' || f.type === 'multiSelect') {
      const optionIds = new Set(f.config.options.map((o) => o.id));
      if (optionIds.size !== f.config.options.length) report(f.id, 'Duplicate option ids');
    }
    if (f.type === 'link') {
      const inverse = fields.get(f.config.inverseFieldId);
      if (!collections.has(f.config.targetCollectionId))
        report(f.id, 'Link points at an unknown collection');
      if (
        inverse?.type !== 'link' ||
        inverse.config.inverseFieldId !== f.id ||
        inverse.collectionId !== f.config.targetCollectionId ||
        inverse.config.targetCollectionId !== f.collectionId
      )
        report(f.id, 'Link field is not paired correctly');
    }
  }

  const fieldMap = Object.fromEntries(fields);
  for (const v of file.views) {
    inCollection(v.id, v.collectionId);
    if (repairView(v, fieldMap) !== v) report(v.id, 'View refers to fields it can’t use');
  }

  for (const r of file.records) {
    inCollection(r.id, r.collectionId);
    for (const [fieldId, value] of Object.entries(r.values)) {
      const field = fields.get(fieldId);
      if (field?.collectionId !== r.collectionId) {
        report(r.id, `Value for unknown field ${fieldId}`);
      } else if (!fieldType(field).stored || !fieldType(field).isValid(value, field)) {
        report(r.id, `Invalid value for ${field.name}`);
      }
    }
  }

  // Links: the canonical field, endpoints in the right collections, cardinality on each side.
  const counts = new Map<string, number>();
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const [fieldId, fromId, toId] of file.links) {
    const key = `${fieldId}|${fromId}|${toId}`;
    const field = fields.get(fieldId);
    if (field?.type !== 'link') {
      report(key, `Link uses unknown field ${fieldId}`);
      continue;
    }
    const link = field;
    if (canonicalFieldId(link) !== fieldId) report(key, 'Link is stored on the wrong side');
    const symmetric = isSymmetric(link);
    if (symmetric && fromId >= toId) report(key, 'Two-way link is stored in the wrong order');
    if (
      recordCollection.get(fromId) !== link.collectionId ||
      recordCollection.get(toId) !== link.config.targetCollectionId
    )
      report(key, 'Link points at a missing record');
    bump(`${fieldId}|${fromId}`);
    bump(`${symmetric ? fieldId : link.config.inverseFieldId}|${toId}`);
  }
  for (const [side, count] of counts) {
    const [fieldId = '', recordId = ''] = side.split('|');
    const field = fields.get(fieldId);
    if (count > 1 && field?.type === 'link' && !field.config.multiple)
      report(recordId, `${field.name} links to more than one record`);
  }
  return issues;
}

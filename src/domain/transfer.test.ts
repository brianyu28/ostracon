import { describe, expect, it } from 'vitest';
import { newId } from '@/lib/id';
import { linkedIdsInDoc, type LinkField } from './links';
import { countLinks, countRecords, iterateRecords, modelToFile, type DocModel } from './model';
import { checkIntegrity } from './schema/integrity';
import { parseDocument } from './schema/document';
import fixtureText from './schema/fixtures/v1.json?raw';
import { addCopied, copyCollections, extractCollections, linkedCollections } from './transfer';

function fixture(): DocModel {
  const result = parseDocument(fixtureText);
  if (!result.ok) throw new Error('fixture did not load');
  return result.model;
}

const byName = (doc: DocModel, name: string) => {
  const found = Object.values(doc.collections).find((c) => c.name === name);
  if (!found) throw new Error(name);
  return found.id;
};

/** Imports the source's collections into `target`, as the command does. */
function importInto(target: DocModel, source: DocModel) {
  const existing = Object.values(target.collections);
  const copied = copyCollections(source, {
    newId,
    firstOrder: existing.length,
    takenNames: new Set(existing.map((c) => c.name)),
  });
  addCopied(target, copied);
  return copied;
}

describe('collection transfer', () => {
  it('extracts a collection without links to collections left out', () => {
    const doc = fixture();
    const visits = byName(doc, 'Restaurant visits');
    const part = extractCollections(doc, [visits]);
    expect(Object.keys(part.collections)).toEqual([visits]);
    expect(Object.values(part.fields).some((f) => f.type === 'link')).toBe(false);
    expect(countLinks(part)).toBe(0);
    expect(countRecords(part)).toBe(countRecords(doc, visits));
    expect(checkIntegrity(modelToFile(part))).toEqual([]);
  });

  it('copies collections with fresh ids, links and renamed duplicates', () => {
    const doc = fixture();
    const people = byName(doc, 'People');
    const visits = byName(doc, 'Restaurant visits');
    const source = extractCollections(doc, [people, visits]);
    const before = countLinks(source);
    expect(before).toBeGreaterThan(0);

    const copied = importInto(doc, source);
    const oldIds = new Set([
      ...Object.keys(source.collections),
      ...Object.keys(source.fields),
      ...Object.keys(source.views),
      ...[...iterateRecords(source)].map((r) => r.id),
    ]);
    for (const e of [...copied.collections, ...copied.fields, ...copied.views, ...copied.records])
      expect(oldIds.has(e.id)).toBe(false);
    expect(copied.collections.map((c) => c.name).sort()).toEqual([
      'People 2',
      'Restaurant visits 2',
    ]);
    expect(copied.links).toHaveLength(before);
    // The whole document, originals and copies, is still consistent.
    expect(checkIntegrity(modelToFile(doc))).toEqual([]);

    // A copied record links to the copies of what its original linked to.
    const withField = Object.values(source.fields).find(
      (f) => f.collectionId === visits && f.name === 'With',
    ) as LinkField;
    const original = [...iterateRecords(source, visits)].find(
      (r) => linkedIdsInDoc(source, withField, r.id).length > 0,
    );
    if (!original) throw new Error('no linked record');
    const copyField = copied.fields.find(
      (f) => f.name === 'With' && f.collectionId === copied.collections[1]?.id,
    ) as LinkField;
    const copy = copied.records.find(
      (r) => r.createdAt === original.createdAt && r.collectionId === copyField.collectionId,
    );
    if (!copy) throw new Error('no copy');
    const titles = (d: DocModel, field: LinkField, id: string) =>
      linkedIdsInDoc(d, field, id)
        .map((t) => [...iterateRecords(d)].find((r) => r.id === t)?.createdAt)
        .sort();
    expect(titles(doc, copyField, copy.id)).toEqual(titles(source, withField, original.id));
  });

  it('rewrites formula references to the copied fields', () => {
    const doc = fixture();
    const books = byName(doc, 'Books');
    const pages = Object.values(doc.fields).find(
      (f) => f.collectionId === books && f.name !== 'Name',
    );
    if (!pages) throw new Error('no field');
    doc.fields.fld_formula01 = {
      id: 'fld_formula01',
      collectionId: books,
      name: 'Calc',
      order: 99,
      type: 'formula',
      config: { expression: `len({${pages.id}}) + 1` },
      createdAt: pages.createdAt,
      updatedAt: pages.updatedAt,
    };
    const copied = importInto(doc, extractCollections(doc, [books]));
    const formula = copied.fields.find((f) => f.type === 'formula');
    const copiedPages = copied.fields.find((f) => f.name === pages.name);
    expect(formula?.type === 'formula' && formula.config.expression).toBe(
      `len({${copiedPages?.id ?? ''}}) + 1`,
    );
  });

  it('finds linked collections with their distance', () => {
    const doc = fixture();
    const linked = linkedCollections(doc, byName(doc, 'Restaurant visits'));
    const named = Object.fromEntries(
      [...linked].map(([id, d]) => [doc.collections[id]?.name ?? '', d]),
    );
    expect(named).toEqual({ Restaurants: 1, People: 1, Trips: 2, Devices: 2 });
    expect(linkedCollections(doc, byName(doc, 'Books')).size).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { testDocument } from '@/test/documents';
import { linkedIdsInDoc } from '../links';
import { countLinks, countRecords, iterateRecords } from '../model';
import { DocIndex } from './docIndex';

describe('DocIndex', () => {
  const doc = testDocument(20);
  const index = DocIndex.build(doc);

  it('counts records per collection', () => {
    let total = 0;
    for (const c of Object.values(doc.collections)) {
      expect(index.recordCount(c.id)).toBe(countRecords(doc, c.id));
      total += index.recordCount(c.id);
    }
    expect(total).toBe(countRecords(doc));
  });

  it('answers link lookups exactly like a scan of the document, from both sides', () => {
    let checked = 0;
    for (const field of Object.values(doc.fields)) {
      if (field.type !== 'link') continue;
      for (const record of iterateRecords(doc, field.collectionId)) {
        const expected = linkedIdsInDoc(doc, field, record.id);
        expect(index.linked(field, record.id)).toEqual(expected);
        checked += expected.length;
      }
    }
    // Every link counts once from each side.
    expect(checked).toBe(countLinks(doc) * 2);
  });
});

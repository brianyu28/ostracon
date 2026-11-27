import { describe, expect, it } from 'vitest';
import { serializeModel } from '@/persistence/codec/serialize';
import { countLinks, countRecords, iterateRecords } from '../model';
import { parseDocument } from '../schema/document';
import { generateShowcaseDocument } from './showcase';

const opts = { endDate: '2026-11-26', appVersion: 't', seed: 3 };

describe('generateShowcaseDocument', () => {
  const doc = generateShowcaseDocument(opts);
  const collections = Object.values(doc.collections);

  it('is a valid document with intact data', () => {
    const result = parseDocument(serializeModel(doc));
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.integrityIssues).toEqual([]);
  });

  it('has the four template collections, with companions as a multi-select', () => {
    expect(collections.map((c) => c.name)).toEqual(['Restaurants', 'Books', 'Movies', 'Trips']);
    expect(collections.map((c) => c.template?.key)).toEqual([
      'restaurants',
      'books',
      'movies',
      'trips',
    ]);
    const withFields = Object.values(doc.fields).filter((f) => f.name === 'With');
    expect(withFields).toHaveLength(3);
    expect(withFields.every((f) => f.type === 'multiSelect')).toBe(true);
    expect(countLinks(doc)).toBe(0);
  });

  it('fills every collection and is deterministic', () => {
    for (const c of collections) expect([...iterateRecords(doc, c.id)].length).toBeGreaterThan(5);
    expect(countRecords(doc)).toBeGreaterThan(80);
    expect(serializeModel(generateShowcaseDocument(opts))).toBe(serializeModel(doc));
  });
});

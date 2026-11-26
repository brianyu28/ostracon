/**
 * Seeded generator for entirely synthetic demo data. Used for the in-app demo, test
 * fixtures and (later) performance benchmarks, so no real data ever needs to enter the
 * repository. The same options always produce the same document.
 *
 * Phase 0: a few collections of text fields. Phase 1 grows this to every field type,
 * links and views, plus a `scale` option for benchmark-sized files.
 */
import { addDays, type ISODate } from '@/lib/date';
import { ID_PREFIXES, type IdKind } from '@/lib/id';
import { putRecord, type DocModel } from '../model';
import { createEmptyDocument } from '../schema/defaults';
import type { Collection, Field, Id, View } from '../schema/types';

export interface DemoOptions {
  /** Date the demo is "as of". Pass explicitly for deterministic output. */
  endDate: ISODate;
  appVersion: string;
  seed?: number;
  /** Records per collection (default 24). */
  records?: number;
}

/** mulberry32: tiny, fast, good-enough seeded PRNG. */
function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
  };
}

const ID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const FIRST = ['Ada', 'Bea', 'Cal', 'Dev', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lu'];
const LAST = ['Archer', 'Bloom', 'Cove', 'Dale', 'Ember', 'Frost', 'Grove', 'Heath', 'Isle'];
const RELATIONSHIPS = ['Friend', 'Family', 'Coworker', 'Neighbor'];
const PLACE_WORDS = ['Copper', 'Juniper', 'Lantern', 'Saffron', 'Harbor', 'Olive', 'Ember'];
const PLACE_KINDS = ['Kitchen', 'Bistro', 'Noodle Bar', 'Taqueria', 'Diner', 'Bakery'];
const CITIES = ['Springfield', 'Riverton', 'Lakeside', 'Fairview', 'Brookhaven'];
const BOOK_WORDS = ['Silent', 'Paper', 'Northern', 'Glass', 'Hidden', 'Last', 'Small'];
const BOOK_NOUNS = ['River', 'Garden', 'Lighthouse', 'Orchard', 'Atlas', 'Winter', 'Harbor'];

interface CollectionSpec {
  name: string;
  icon: string;
  fields: readonly string[];
  value: (fieldIndex: number) => string;
}

export function generateDemoDocument(options: DemoOptions): DocModel {
  const rng = createRng(options.seed ?? 42);
  const count = options.records ?? 24;
  const end = options.endDate;
  const stamp = (date: ISODate) => `${date}T12:00:00.000Z`;
  const now = stamp(end);

  const makeId = (kind: IdKind): Id => {
    let out = '';
    for (let i = 0; i < 12; i++) out += ID_CHARS.charAt(Math.floor(rng.next() * 62));
    return `${ID_PREFIXES[kind]}_${out}`;
  };

  const doc = createEmptyDocument({ appVersion: options.appVersion, now });
  doc.meta.fileId = makeId('file');
  doc.meta.createdAt = stamp(addDays(end, -365));

  const specs: CollectionSpec[] = [
    {
      name: 'People',
      icon: 'users',
      fields: ['Name', 'Relationship'],
      value: (i) => (i === 0 ? `${rng.pick(FIRST)} ${rng.pick(LAST)}` : rng.pick(RELATIONSHIPS)),
    },
    {
      name: 'Restaurants',
      icon: 'tools-kitchen-2',
      fields: ['Name', 'City'],
      value: (i) =>
        i === 0 ? `${rng.pick(PLACE_WORDS)} ${rng.pick(PLACE_KINDS)}` : rng.pick(CITIES),
    },
    {
      name: 'Books',
      icon: 'book',
      fields: ['Title', 'Author'],
      value: (i) =>
        i === 0
          ? `The ${rng.pick(BOOK_WORDS)} ${rng.pick(BOOK_NOUNS)}`
          : `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    },
  ];

  specs.forEach((spec, order) => {
    const collectionId = makeId('collection');
    const fields: Field[] = spec.fields.map((name, i) => ({
      id: makeId('field'),
      collectionId,
      name,
      order: i,
      type: 'text',
      createdAt: now,
      updatedAt: now,
    }));
    const primary = fields[0];
    if (!primary) throw new Error('A demo collection needs a field');
    const collection: Collection = {
      id: collectionId,
      name: spec.name,
      icon: spec.icon,
      order,
      primaryFieldId: primary.id,
      createdAt: now,
      updatedAt: now,
    };
    const view: View = {
      id: makeId('view'),
      collectionId,
      name: 'All',
      order: 0,
      layout: 'table',
      fields: fields.map((f) => ({ fieldId: f.id })),
      createdAt: now,
      updatedAt: now,
    };
    doc.collections[collectionId] = collection;
    for (const f of fields) doc.fields[f.id] = f;
    doc.views[view.id] = view;
    for (let n = 0; n < count; n++) {
      const created = stamp(addDays(end, -rng.int(0, 364)));
      putRecord(doc, {
        id: makeId('record'),
        collectionId,
        values: Object.fromEntries(fields.map((f, i) => [f.id, spec.value(i)])),
        createdAt: created,
        updatedAt: created,
      });
    }
  });
  return doc;
}

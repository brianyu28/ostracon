import { beforeEach, describe, expect, it } from 'vitest';
import { inferType } from '@/domain/import';
import { iterateRecords, type DocModel } from '@/domain/model';
import { createEmptyDocument } from '@/domain/schema/defaults';
import { parseCsv } from '@/lib/csv';
import { createDocStore } from './docStore';

const parse = { locale: 'en-US', today: '2026-11-26' };
let store: ReturnType<typeof createDocStore>;
const doc = (): DocModel => store.getState().doc!;

beforeEach(() => {
  store = createDocStore();
  store.getState().load(createEmptyDocument({ appVersion: 'test' }));
});

describe('inferType', () => {
  it('guesses the most specific type', () => {
    expect(inferType(['1', '2,500', ''], parse).type).toBe('number');
    expect(inferType(['$4.50', '$12'], parse).config).toMatchObject({ style: 'currency' });
    expect(inferType(['2024-03-01', 'Mar 2019'], parse)).toEqual({
      type: 'date',
      config: { partial: true },
    });
    expect(inferType(['yes', 'no', ''], parse).type).toBe('checkbox');
    expect(inferType(['a@b.co', 'c@d.org'], parse).type).toBe('email');
    expect(inferType(['https://a.com', 'www.b.org'], parse).type).toBe('url');
    expect(inferType(['Read', 'To read', 'Read', 'Read', 'To read', 'Read'], parse).type).toBe(
      'singleSelect',
    );
    expect(inferType(['a, b', 'b', 'a', 'c, a'], parse).type).toBe('multiSelect');
    expect(inferType(['one', 'two', 'three', 'four'], parse).type).toBe('text');
  });
});

describe('importRecords', () => {
  it('creates a collection, its fields and records, linking by title, as one undo step', () => {
    const people = store.getState().dispatch('createCollection', { name: 'People' });
    const personName = doc().collections[people]!.primaryFieldId;
    store
      .getState()
      .dispatch('createRecord', { collectionId: people, values: { [personName]: 'Ana' } });
    // An existing collection to import into, with a link field.
    const visits = store.getState().dispatch('createCollection', { name: 'Visits' });
    const { fieldId: withField } = store.getState().dispatch('createLinkField', {
      collectionId: visits,
      name: 'With',
      targetCollectionId: people,
      backlink: false,
    });
    const rows = parseCsv('Place,Spent,With\nCafe,$12,Ana\nDiner,oops,"Ana, Bo"\n').slice(1);
    const result = store.getState().dispatch('importRecords', {
      collectionId: visits,
      columns: [
        { target: { kind: 'primary', name: 'Place' } },
        {
          target: {
            kind: 'new',
            name: 'Spent',
            type: 'number',
            config: { style: 'currency', decimals: 2 },
          },
        },
        { target: { kind: 'field', fieldId: withField } },
      ],
      rows,
      createMissingLinks: true,
      parse,
    });
    expect(result).toMatchObject({ invalid: 1, linkedCreated: 1 });
    expect(result.created).toHaveLength(2);
    const names = [...iterateRecords(doc(), people)].map((r) => r.values[personName]).sort();
    expect(names).toEqual(['Ana', 'Bo']);
    const diner = [...iterateRecords(doc(), visits)].find((r) =>
      Object.values(r.values).includes('Diner'),
    )!;
    expect(store.getState().index!.linked(doc().fields[withField] as never, diner.id)).toHaveLength(
      2,
    );

    store.getState().undo();
    expect([...iterateRecords(doc(), visits)]).toHaveLength(0);
    expect([...iterateRecords(doc(), people)]).toHaveLength(1);
  });

  it('imports into a new collection', () => {
    const result = store.getState().dispatch('importRecords', {
      newCollection: { name: 'Books' },
      columns: [{ target: { kind: 'primary', name: 'Title' } }, { target: { kind: 'skip' } }],
      rows: [
        ['Dune', 'x'],
        ['Emma', 'y'],
      ],
      createMissingLinks: false,
      parse,
    });
    expect(doc().collections[result.collectionId]?.name).toBe('Books');
    const titles = [...iterateRecords(doc(), result.collectionId)]
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((r) => Object.values(r.values)[0]);
    expect(titles).toEqual(['Dune', 'Emma']);
  });
});

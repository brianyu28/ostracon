import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandError, type CommandName, type CommandPayload } from '@/domain/commands';
import { linkedIdsInDoc, type LinkField } from '@/domain/links';
import { countLinks, getRecord, iterateRecords, type DocModel } from '@/domain/model';
import { createEmptyDocument } from '@/domain/schema/defaults';
import { parseDocument } from '@/domain/schema/document';
import type { FieldOf, Id } from '@/domain/schema/types';
import { serializeModel } from '@/persistence/codec/serialize';
import { createDocStore } from './docStore';

let store: ReturnType<typeof createDocStore>;
/** Dispatches with the clock a second later each time, so link creation order is defined. */
const run = <K extends CommandName>(name: K, payload: CommandPayload<K>) => {
  vi.advanceTimersByTime(1000);
  return store.getState().dispatch(name, payload);
};
const doc = (): DocModel => store.getState().doc!;

/** The document survives a save/load round trip with no integrity issues. */
function expectIntact() {
  const result = parseDocument(serializeModel(doc()));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  expect(result.integrityIssues).toEqual([]);
}

/** Links seen through a field, from the index and from the document (they must agree). */
function linked(fieldId: Id, recordId: Id): Id[] {
  const field = doc().fields[fieldId] as LinkField;
  const fromIndex = [...store.getState().index!.linked(field, recordId)];
  expect(fromIndex).toEqual(linkedIdsInDoc(doc(), field, recordId));
  return fromIndex;
}

/** Creates a link field with a backlink and returns both ids. */
function linkPair(input: CommandPayload<'createLinkField'>) {
  const { fieldId, inverseFieldId } = run('createLinkField', input);
  return { fieldId, inverseFieldId: inverseFieldId ?? '' };
}

function collectionWithPrimary(name: string) {
  const id = run('createCollection', { name });
  return { id, primary: doc().collections[id]!.primaryFieldId };
}

function record(collectionId: Id, primary: Id, title: string): Id {
  return run('createRecord', { collectionId, values: { [primary]: title } });
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-26T12:00:00.000Z') });
  store = createDocStore();
  store.getState().load(createEmptyDocument({ appVersion: 'test' }));
});

describe('fields', () => {
  it('creates fields with normalized configs and shows them in the right views', () => {
    const c = collectionWithPrimary('Books');
    const second = run('createView', { collectionId: c.id, name: 'Second', layout: 'table' });
    const status = run('createField', {
      collectionId: c.id,
      name: 'Status',
      type: 'singleSelect',
      config: { options: [{ name: 'To read' }, { name: 'Read' }] },
    });
    const pages = run('createField', {
      collectionId: c.id,
      name: 'Pages',
      type: 'number',
      afterFieldId: c.primary,
      viewId: second,
    });
    const fields = Object.values(doc().fields).sort((a, b) => a.order - b.order);
    expect(fields.map((f) => f.name)).toEqual(['Name', 'Pages', 'Status']);
    const options = (doc().fields[status] as FieldOf<'singleSelect'>).config.options;
    expect(options.map((o) => [o.name, o.order])).toEqual([
      ['To read', 0],
      ['Read', 1],
    ]);
    expect(options.every((o) => o.id.startsWith('opt_'))).toBe(true);

    const views = Object.values(doc().views).sort((a, b) => a.order - b.order);
    // First view: everything visible. The other view shows Pages (added from it) after Name.
    expect(views[0]!.fields).toEqual([
      { fieldId: c.primary },
      { fieldId: pages },
      { fieldId: status },
    ]);
    expect(views[1]!.fields).toEqual([
      { fieldId: c.primary },
      { fieldId: pages },
      { fieldId: status, hidden: true },
    ]);
    expectIntact();
  });

  it('rejects duplicate names, bad configs and link fields made the wrong way', () => {
    const c = collectionWithPrimary('Books');
    expect(() => run('createField', { collectionId: c.id, name: 'name', type: 'text' })).toThrow(
      /already a field/,
    );
    expect(() =>
      run('createField', { collectionId: c.id, name: 'R', type: 'rating', config: { max: 50 } }),
    ).toThrow(CommandError);
    expect(() => run('createField', { collectionId: c.id, name: 'L', type: 'link' })).toThrow(
      CommandError,
    );
  });

  it('removes values that a new config can’t hold, and keeps the rest', () => {
    const c = collectionWithPrimary('Books');
    const status = run('createField', {
      collectionId: c.id,
      name: 'Status',
      type: 'singleSelect',
      config: { options: [{ name: 'To read' }, { name: 'Read' }] },
    });
    const [toRead, read] = (doc().fields[status] as FieldOf<'singleSelect'>).config.options;
    const a = run('createRecord', { collectionId: c.id, values: { [status]: toRead!.id } });
    const b = run('createRecord', { collectionId: c.id, values: { [status]: read!.id } });
    run('updateField', { id: status, changes: { config: { options: [read] } } });
    expect(getRecord(doc(), c.id, a)?.values[status]).toBeUndefined();
    expect(getRecord(doc(), c.id, b)?.values[status]).toBe(read!.id);
    store.getState().undo();
    expect(getRecord(doc(), c.id, a)?.values[status]).toBe(toRead!.id);
    expectIntact();
  });

  it('changes types, converting values and reporting what was lost', () => {
    const c = collectionWithPrimary('Things');
    const text = run('createField', { collectionId: c.id, name: 'Size', type: 'text' });
    const ids = ['12', '3.5', 'big', '  '].map((v) =>
      run('createRecord', { collectionId: c.id, values: { [text]: v } }),
    );
    const result = run('changeFieldType', { id: text, type: 'number' });
    expect(result).toEqual({ converted: 2, lost: 1 });
    expect(ids.map((id) => getRecord(doc(), c.id, id)?.values[text])).toEqual([
      12,
      3.5,
      undefined,
      undefined,
    ]);
    expect(doc().fields[text]).toMatchObject({ type: 'number', config: { style: 'plain' } });
    expectIntact();
  });

  it('derives select options from text when changing to a select', () => {
    const c = collectionWithPrimary('Things');
    const kind = run('createField', { collectionId: c.id, name: 'Kind', type: 'text' });
    for (const v of ['Phone', 'laptop', 'phone', 'Laptop, Tablet'])
      run('createRecord', { collectionId: c.id, values: { [kind]: v } });
    run('changeFieldType', { id: kind, type: 'multiSelect' });
    const field = doc().fields[kind] as FieldOf<'multiSelect'>;
    expect(field.config.options.map((o) => o.name)).toEqual(['Phone', 'laptop', 'Tablet']);
    const values = [...iterateRecords(doc(), c.id)].map((r) => r.values[kind]);
    expect(values.every((v) => Array.isArray(v) && v.length > 0)).toBe(true);
    expectIntact();
  });

  it('refuses to make the primary field a type that can’t be a title', () => {
    const c = collectionWithPrimary('Things');
    expect(() => run('changeFieldType', { id: c.primary, type: 'number' })).toThrow(/primary/);
    expect(() => {
      run('deleteField', { id: c.primary });
    }).toThrow(/primary/);
    const other = run('createField', { collectionId: c.id, name: 'Title', type: 'text' });
    run('setPrimaryField', { collectionId: c.id, fieldId: other });
    run('deleteField', { id: c.primary });
    expectIntact();
  });

  it('deletes a field with its values and its place in views', () => {
    const c = collectionWithPrimary('Things');
    const rating = run('createField', { collectionId: c.id, name: 'Rating', type: 'rating' });
    const r = run('createRecord', { collectionId: c.id, values: { [rating]: 3 } });
    const viewId = Object.values(doc().views)[0]!.id;
    run('updateView', {
      id: viewId,
      changes: {
        sorts: [{ fieldId: rating, dir: 'desc' }],
        filter: { op: 'and', items: [{ fieldId: rating, operator: 'gte', value: 2 }] },
        summaries: { [rating]: 'average' },
      },
    });
    run('deleteField', { id: rating });
    expect(getRecord(doc(), c.id, r)?.values).toEqual({});
    const view = doc().views[viewId]!;
    expect(view.fields.map((f) => f.fieldId)).toEqual([c.primary]);
    expect(view.sorts).toBeUndefined();
    expect(view.filter).toBeUndefined();
    expect(view.summaries).toBeUndefined();
    expectIntact();
  });
});

describe('links', () => {
  function restaurantsAndPeople() {
    const people = collectionWithPrimary('People');
    const places = collectionWithPrimary('Restaurants');
    const { fieldId, inverseFieldId } = linkPair({
      collectionId: places.id,
      name: 'People',
      targetCollectionId: people.id,
    });
    const ada = record(people.id, people.primary, 'Ada');
    const bea = record(people.id, people.primary, 'Bea');
    const luna = record(places.id, places.primary, 'Cafe Luna');
    const fern = record(places.id, places.primary, 'Fern Grill');
    return { people, places, fieldId, inverseFieldId, ada, bea, luna, fern };
  }

  it('creates a pair whose two sides see the same links', () => {
    const t = restaurantsAndPeople();
    expect(doc().fields[t.inverseFieldId]).toMatchObject({
      collectionId: t.people.id,
      name: 'Restaurants',
      config: { targetCollectionId: t.places.id, inverseFieldId: t.fieldId, multiple: true },
    });
    run('setLinks', { fieldId: t.fieldId, recordId: t.luna, targetIds: [t.ada, t.bea] });
    run('addLinks', { fieldId: t.inverseFieldId, recordId: t.ada, targetIds: [t.fern] });
    expect(linked(t.fieldId, t.luna)).toEqual([t.ada, t.bea]);
    expect(linked(t.inverseFieldId, t.ada)).toEqual([t.luna, t.fern]);
    expect(linked(t.inverseFieldId, t.bea)).toEqual([t.luna]);
    expect(countLinks(doc())).toBe(3);

    run('setLinks', { fieldId: t.fieldId, recordId: t.luna, targetIds: [t.bea] });
    expect(linked(t.inverseFieldId, t.ada)).toEqual([t.fern]);
    store.getState().undo();
    expect(linked(t.inverseFieldId, t.ada)).toEqual([t.luna, t.fern]);
    expectIntact();
  });

  it('keeps single-valued sides single', () => {
    const people = collectionWithPrimary('People');
    const devices = collectionWithPrimary('Devices');
    const owner = linkPair({
      collectionId: devices.id,
      name: 'Owner',
      targetCollectionId: people.id,
      multiple: false,
      inverseName: 'Devices',
    });
    const ada = record(people.id, people.primary, 'Ada');
    const bea = record(people.id, people.primary, 'Bea');
    const phone = record(devices.id, devices.primary, 'Phone');
    run('setLinks', { fieldId: owner.fieldId, recordId: phone, targetIds: [ada] });
    // Adding from the many side moves the phone to Bea.
    run('addLinks', { fieldId: owner.inverseFieldId, recordId: bea, targetIds: [phone] });
    expect(linked(owner.fieldId, phone)).toEqual([bea]);
    expect(linked(owner.inverseFieldId, ada)).toEqual([]);
    expect(() => {
      run('setLinks', { fieldId: owner.fieldId, recordId: phone, targetIds: [ada, bea] });
    }).toThrow(/one record/);
    expectIntact();
  });

  it('trims to one link per record when a side becomes single-valued', () => {
    const t = restaurantsAndPeople();
    run('setLinks', { fieldId: t.fieldId, recordId: t.luna, targetIds: [t.ada, t.bea] });
    run('updateField', { id: t.fieldId, changes: { config: { multiple: false } } });
    expect(linked(t.fieldId, t.luna)).toEqual([t.ada]);
    expectIntact();
  });

  it('stores symmetric links once and sees them from both records', () => {
    const people = collectionWithPrimary('People');
    const friends = linkPair({
      collectionId: people.id,
      name: 'Friends',
      targetCollectionId: people.id,
      symmetric: true,
    });
    expect(friends.inverseFieldId).toBe(friends.fieldId);
    const ada = record(people.id, people.primary, 'Ada');
    const bea = record(people.id, people.primary, 'Bea');
    const cal = record(people.id, people.primary, 'Cal');
    run('addLinks', { fieldId: friends.fieldId, recordId: bea, targetIds: [ada, cal] });
    run('addLinks', { fieldId: friends.fieldId, recordId: ada, targetIds: [bea] }); // already linked
    expect(countLinks(doc())).toBe(2);
    expect(linked(friends.fieldId, ada)).toEqual([bea]);
    expect(linked(friends.fieldId, bea)).toEqual([ada, cal]);
    expect(() => {
      run('addLinks', { fieldId: friends.fieldId, recordId: ada, targetIds: [ada] });
    }).toThrow(/itself/);
    expectIntact();
  });

  it('removes links with deleted records, deleted fields and deleted collections', () => {
    const t = restaurantsAndPeople();
    run('setLinks', { fieldId: t.fieldId, recordId: t.luna, targetIds: [t.ada, t.bea] });
    run('deleteRecords', { collectionId: t.people.id, ids: [t.ada] });
    expect(linked(t.fieldId, t.luna)).toEqual([t.bea]);
    expectIntact();

    run('deleteCollection', { id: t.people.id });
    expect(doc().fields[t.fieldId]).toBeUndefined();
    expect(countLinks(doc())).toBe(0);
    expect(doc().views[Object.keys(doc().views)[0]!]!.fields.map((f) => f.fieldId)).toEqual([
      t.places.primary,
    ]);
    expectIntact();

    store.getState().undo();
    expect(linked(t.fieldId, t.luna)).toEqual([t.bea]);
    expectIntact();
  });

  it('converts a link field to the titles of its linked records', () => {
    const t = restaurantsAndPeople();
    run('setLinks', { fieldId: t.fieldId, recordId: t.luna, targetIds: [t.ada, t.bea] });
    run('changeFieldType', { id: t.fieldId, type: 'text' });
    expect(getRecord(doc(), t.places.id, t.luna)?.values[t.fieldId]).toBe('Ada, Bea');
    expect(doc().fields[t.inverseFieldId]).toBeUndefined();
    expect(countLinks(doc())).toBe(0);
    expectIntact();
  });

  it('copies links when duplicating records, except where the other side is single', () => {
    const t = restaurantsAndPeople();
    run('setLinks', { fieldId: t.fieldId, recordId: t.luna, targetIds: [t.ada] });
    const [copy] = run('duplicateRecords', { collectionId: t.places.id, ids: [t.luna] });
    expect(getRecord(doc(), t.places.id, copy!)?.values[t.places.primary]).toBe('Cafe Luna');
    expect(linked(t.fieldId, copy!)).toEqual([t.ada]);
    expectIntact();
  });
});

describe('records', () => {
  it('normalizes values and rejects invalid ones without changing anything', () => {
    const c = collectionWithPrimary('Trips');
    const dates = run('createField', { collectionId: c.id, name: 'Dates', type: 'dateRange' });
    const id = run('createRecord', {
      collectionId: c.id,
      values: { [c.primary]: '  Lyon  ', [dates]: { start: '2026-01-02', end: '2026-01-02' } },
    });
    expect(getRecord(doc(), c.id, id)?.values).toEqual({
      [c.primary]: 'Lyon',
      [dates]: { start: '2026-01-02' },
    });
    const before = doc();
    expect(() => {
      run('setRecordValues', { collectionId: c.id, id, values: { [dates]: { start: 'soon' } } });
    }).toThrow(/valid value for “Dates”/);
    expect(doc()).toBe(before);
    expectIntact();
  });

  it('sets one value on many records', () => {
    const c = collectionWithPrimary('Tasks');
    const done = run('createField', { collectionId: c.id, name: 'Done', type: 'checkbox' });
    const ids = [1, 2, 3].map(() => run('createRecord', { collectionId: c.id }));
    run('setFieldValue', { collectionId: c.id, ids, fieldId: done, value: true });
    expect(ids.map((id) => getRecord(doc(), c.id, id)?.values[done])).toEqual([true, true, true]);
    run('setFieldValue', { collectionId: c.id, ids: [ids[0]!], fieldId: done, value: false });
    expect(getRecord(doc(), c.id, ids[0]!)?.values).toEqual({});
  });

  it('refuses values for computed fields', () => {
    const c = collectionWithPrimary('Books');
    const added = run('createField', { collectionId: c.id, name: 'Added', type: 'createdTime' });
    expect(() =>
      run('createRecord', { collectionId: c.id, values: { [added]: '2026-01-01' } }),
    ).toThrow(/calculated/);
  });
});

describe('views', () => {
  it('creates board and calendar views only when there is a field to use', () => {
    const c = collectionWithPrimary('Books');
    expect(() => run('createView', { collectionId: c.id, name: 'Board', layout: 'board' })).toThrow(
      /board needs/,
    );
    const status = run('createField', {
      collectionId: c.id,
      name: 'Status',
      type: 'singleSelect',
      config: { options: [{ name: 'Read' }] },
    });
    const board = run('createView', { collectionId: c.id, name: 'Board', layout: 'board' });
    expect(doc().views[board]?.board).toEqual({ groupFieldId: status });
    // Retyping the group field to text leaves no usable field: the view falls back to a table.
    run('changeFieldType', { id: status, type: 'text' });
    expect(doc().views[board]).toMatchObject({ layout: 'table' });
    expect(doc().views[board]?.board).toBeUndefined();
    expectIntact();
  });

  it('validates filters, sorts and summaries against the fields', () => {
    const c = collectionWithPrimary('Books');
    const view = Object.values(doc().views)[0]!.id;
    expect(() => {
      run('updateView', {
        id: view,
        changes: {
          filter: { op: 'and', items: [{ fieldId: c.primary, operator: 'gt', value: 2 }] },
        },
      });
    }).toThrow(CommandError);
    expect(() => {
      run('updateView', { id: view, changes: { summaries: { [c.primary]: 'sum' } } });
    }).toThrow(CommandError);
    run('updateView', {
      id: view,
      changes: {
        name: 'Recent',
        filter: { op: 'or', items: [{ fieldId: c.primary, operator: 'contains', value: 'the' }] },
        sorts: [{ fieldId: c.primary, dir: 'asc' }],
      },
    });
    expect(doc().views[view]).toMatchObject({ name: 'Recent', sorts: [{ dir: 'asc' }] });
    run('updateView', { id: view, changes: { sorts: undefined } });
    expect(doc().views[view]?.sorts).toBeUndefined();
    expectIntact();
  });

  it('keeps every field in a view’s field list', () => {
    const c = collectionWithPrimary('Books');
    const author = run('createField', { collectionId: c.id, name: 'Author', type: 'text' });
    const view = Object.values(doc().views)[0]!.id;
    run('setViewFields', { id: view, fields: [{ fieldId: author, width: 10 }] });
    expect(doc().views[view]?.fields).toEqual([
      { fieldId: author, width: 40 },
      { fieldId: c.primary, hidden: true },
    ]);
  });

  it('duplicates, reorders and deletes views, keeping at least one', () => {
    const c = collectionWithPrimary('Books');
    const first = Object.values(doc().views)[0]!.id;
    const copy = run('duplicateView', { id: first });
    expect(doc().views[copy]).toMatchObject({ name: 'All copy' });
    run('reorderViews', { collectionId: c.id, ids: [copy, first] });
    run('deleteView', { id: first });
    expect(() => {
      run('deleteView', { id: copy });
    }).toThrow(/at least one view/);
    expectIntact();
  });
});

describe('editing many records', () => {
  const parse = { locale: 'en-US', today: '2026-11-26' };

  it('sets values from text, creating select options and new rows, as one undo step', () => {
    const c = collectionWithPrimary('Books');
    const status = run('createField', {
      collectionId: c.id,
      name: 'Status',
      type: 'singleSelect',
      config: { options: [{ name: 'Read' }] },
    });
    const pages = run('createField', { collectionId: c.id, name: 'Pages', type: 'number' });
    const a = record(c.id, c.primary, 'A');
    const result = run('setFromText', {
      collectionId: c.id,
      parse,
      rows: [
        { id: a, texts: { [status]: 'read', [pages]: '1,200' } },
        { texts: { [c.primary]: 'B', [status]: 'Wishlist', [pages]: 'lots' } },
      ],
    });
    expect(result).toMatchObject({ invalid: 1, addedOptions: 1 });
    expect(result.created).toHaveLength(1);
    const field = doc().fields[status] as FieldOf<'singleSelect'>;
    expect(field.config.options.map((o) => o.name)).toEqual(['Read', 'Wishlist']);
    const [readId, wishId] = field.config.options.map((o) => o.id);
    expect(getRecord(doc(), c.id, a)?.values).toMatchObject({ [status]: readId, [pages]: 1200 });
    const b = getRecord(doc(), c.id, result.created[0]!);
    expect(b?.values).toEqual({ [c.primary]: 'B', [status]: wishId });
    expectIntact();

    store.getState().undo();
    expect((doc().fields[status] as FieldOf<'singleSelect'>).config.options).toHaveLength(1);
    expect([...iterateRecords(doc(), c.id)]).toHaveLength(1);
  });

  it('clears and copies values across records with editRecords', () => {
    const c = collectionWithPrimary('Books');
    const a = record(c.id, c.primary, 'A');
    const b = record(c.id, c.primary, 'B');
    run('editRecords', {
      collectionId: c.id,
      updates: [
        { id: a, values: { [c.primary]: undefined } },
        { id: b, values: { [c.primary]: 'Same' } },
      ],
    });
    expect(getRecord(doc(), c.id, a)?.values).toEqual({});
    expect(getRecord(doc(), c.id, b)?.values).toEqual({ [c.primary]: 'Same' });
    expect(() => {
      run('editRecords', { collectionId: c.id, updates: [{ id: a, values: { nope: 'x' } }] });
    }).toThrow(CommandError);
  });
});

describe('link values', () => {
  const parse = { locale: 'en-US', today: '2026-11-26' };

  it('sets, pastes and clears links like other values', () => {
    const people = collectionWithPrimary('People');
    const visits = collectionWithPrimary('Visits');
    const { fieldId: with_, inverseFieldId: visitsOf } = linkPair({
      collectionId: visits.id,
      name: 'With',
      targetCollectionId: people.id,
    });
    const ana = record(people.id, people.primary, 'Ana');
    const bo = record(people.id, people.primary, 'Bo');
    const v1 = record(visits.id, visits.primary, 'Lunch');
    const v2 = record(visits.id, visits.primary, 'Dinner');

    run('setRecordValues', { collectionId: visits.id, id: v1, values: { [with_]: [ana, bo] } });
    expect(linked(with_, v1)).toEqual([ana, bo]);
    expect(linked(visitsOf, bo)).toEqual([v1]);

    const result = run('setFromText', {
      collectionId: visits.id,
      parse,
      rows: [
        { id: v2, texts: { [with_]: 'bo, ANA' } },
        { id: v1, texts: { [with_]: 'Nobody' } },
      ],
    });
    expect(result.invalid).toBe(1);
    expect(linked(with_, v2)).toEqual([bo, ana]);
    expect(linked(with_, v1)).toEqual([ana, bo]); // unreadable: unchanged

    run('editRecords', {
      collectionId: visits.id,
      updates: [{ id: v2, values: { [with_]: undefined } }],
    });
    expect(linked(with_, v2)).toEqual([]);
    run('setFieldValue', { collectionId: visits.id, ids: [v1, v2], fieldId: with_, value: [bo] });
    expect(linked(visitsOf, bo)).toEqual([v1, v2]);
    expectIntact();
  });

  it('creates a linked record inline in one undo step', () => {
    const people = collectionWithPrimary('People');
    const visits = collectionWithPrimary('Visits');
    const { fieldId } = linkPair({
      collectionId: visits.id,
      name: 'With',
      targetCollectionId: people.id,
    });
    const ana = record(people.id, people.primary, 'Ana');
    const v1 = record(visits.id, visits.primary, 'Lunch');
    const created = run('createLinkedRecord', {
      fieldId,
      recordId: v1,
      title: 'Cy',
      targetIds: [ana],
    });
    expect(getRecord(doc(), people.id, created)?.values[people.primary]).toBe('Cy');
    expect(linked(fieldId, v1)).toEqual([ana, created]);
    expectIntact();
    store.getState().undo();
    expect(getRecord(doc(), people.id, created)).toBeUndefined();
    expect(linked(fieldId, v1)).toEqual([]);
  });
});

describe('backlinks', () => {
  function setup() {
    const people = collectionWithPrimary('People');
    const visits = collectionWithPrimary('Visits');
    const ana = record(people.id, people.primary, 'Ana');
    const bo = record(people.id, people.primary, 'Bo');
    const v1 = record(visits.id, visits.primary, 'Lunch');
    const v2 = record(visits.id, visits.primary, 'Dinner');
    return { people, visits, ana, bo, v1, v2 };
  }

  it('creates one-way links and adds or removes the backlink later, keeping the links', () => {
    const t = setup();
    const { fieldId, inverseFieldId } = run('createLinkField', {
      collectionId: t.visits.id,
      name: 'With',
      targetCollectionId: t.people.id,
      backlink: false,
    });
    expect(inverseFieldId).toBeUndefined();
    expect(Object.values(doc().fields).filter((f) => f.collectionId === t.people.id)).toHaveLength(
      1,
    );
    run('setLinks', { fieldId, recordId: t.v1, targetIds: [t.ana, t.bo] });
    run('setLinks', { fieldId, recordId: t.v2, targetIds: [t.ana] });
    expectIntact();

    // Add it, remove it and add it again: the links survive each change of the pair.
    for (let round = 0; round < 3; round++) {
      const back = run('addBacklink', { fieldId, name: 'Meals' });
      expect(doc().fields[back]).toMatchObject({ collectionId: t.people.id, name: 'Meals' });
      expect(linked(fieldId, t.v1)).toEqual([t.ana, t.bo]);
      expect(linked(back, t.ana)).toEqual([t.v1, t.v2]);
      expectIntact();
      run('removeBacklink', { fieldId });
      expect(doc().fields[back]).toBeUndefined();
      expect(linked(fieldId, t.v1)).toEqual([t.ana, t.bo]);
      expect(linked(fieldId, t.v2)).toEqual([t.ana]);
      expectIntact();
    }
  });

  it('removes the backlink from either side and undoes cleanly', () => {
    const t = setup();
    const { fieldId, inverseFieldId } = linkPair({
      collectionId: t.visits.id,
      name: 'With',
      targetCollectionId: t.people.id,
    });
    run('setLinks', { fieldId, recordId: t.v1, targetIds: [t.bo] });
    run('removeBacklink', { fieldId: inverseFieldId }); // keep People.Visits, drop Visits.With
    expect(doc().fields[fieldId]).toBeUndefined();
    expect(linked(inverseFieldId, t.bo)).toEqual([t.v1]);
    expectIntact();
    store.getState().undo();
    expect(linked(fieldId, t.v1)).toEqual([t.bo]);
    expectIntact();
  });

  it('refuses a single-valued backlink when records are linked from several', () => {
    const t = setup();
    const { fieldId } = run('createLinkField', {
      collectionId: t.visits.id,
      name: 'With',
      targetCollectionId: t.people.id,
      backlink: false,
    });
    run('setLinks', { fieldId, recordId: t.v1, targetIds: [t.ana] });
    run('setLinks', { fieldId, recordId: t.v2, targetIds: [t.ana] });
    expect(() => run('addBacklink', { fieldId, multiple: false })).toThrow(CommandError);
    expect(run('addBacklink', { fieldId, multiple: true })).toBeTruthy();
  });
});

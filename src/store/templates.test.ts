import { beforeEach, describe, expect, it } from 'vitest';
import { fieldType } from '@/domain/fields/registry';
import { createEmptyDocument } from '@/domain/schema/defaults';
import { parseDocument } from '@/domain/schema/document';
import type { DocModel } from '@/domain/model';
import { TEMPLATES, TEMPLATES_BY_KEY } from '@/domain/templates/catalog';
import { planFromCollection, planTemplate, pruneTemplates } from '@/domain/templates/plan';
import { serializeModel } from '@/persistence/codec/serialize';
import { createDocStore } from './docStore';

let store: ReturnType<typeof createDocStore>;
const doc = (): DocModel => store.getState().doc!;
const settingsCtx = () => ({ settings: doc().settings, newId: () => 'opt_x' });

function expectIntact() {
  const result = parseDocument(serializeModel(doc()));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  expect(result.integrityIssues).toEqual([]);
}

const named = (name: string) => Object.values(doc().collections).find((c) => c.name === name);
const fieldsOf = (collectionId: string) =>
  Object.values(doc().fields).filter((f) => f.collectionId === collectionId);

beforeEach(() => {
  store = createDocStore();
  store.getState().load(createEmptyDocument({ appVersion: 'test' }));
});

describe('template catalog', () => {
  it('has valid field configs, unique keys and views on known fields', () => {
    for (const t of TEMPLATES) {
      for (const c of [t.collection, ...(t.log ? [t.log.collection] : [])]) {
        const keys = c.fields.map((f) => f.key);
        expect(new Set(keys).size, `${t.key}: duplicate keys`).toBe(keys.length);
        expect(keys, `${t.key}: primary`).toContain(c.primary);
        for (const f of c.fields) {
          if (f.type === 'link' || !f.config) continue;
          const result = fieldType(f.type).normalizeConfig(f.config, settingsCtx());
          expect(typeof result, `${t.key}.${f.key}`).not.toBe('string');
        }
        for (const v of c.views) {
          for (const s of v.sorts ?? []) expect(keys).toContain(s.field);
          if (v.group) expect(keys).toContain(v.group.field);
        }
      }
    }
  });

  it('creates every template, simple and with its log, as one undo step', () => {
    for (const t of TEMPLATES) {
      for (const withLog of t.log ? [false, true] : [false]) {
        store.getState().load(createEmptyDocument({ appVersion: 'test' }));
        const plan = planTemplate(t, { withLog, existing: [] });
        const refs = store.getState().dispatch('createFromTemplate', { plan });
        expect(Object.keys(refs)).toEqual(plan.collections.map((c) => c.ref));
        expectIntact();
        store.getState().undo();
        expect(Object.keys(doc().collections)).toHaveLength(0);
      }
    }
  });
});

describe('planning', () => {
  it('links to an existing People collection, or creates it', () => {
    const restaurants = TEMPLATES_BY_KEY.get('restaurants')!;
    const created = planTemplate(restaurants, { withLog: true, existing: [] });
    expect(created.collections.map((c) => c.ref)).toEqual(['main', 'log', 'people']);
    store.getState().dispatch('createFromTemplate', { plan: created });
    const people = named('People')!;
    expect(people.template?.key).toBe('people');
    const visits = named('Restaurant visits')!;
    expect(
      fieldsOf(visits.id)
        .sort((a, b) => a.order - b.order)
        .map((f) => f.name),
    ).toEqual(['Visit', 'Restaurant', 'Date', 'With', 'Ordered', 'Spent', 'Rating', 'Notes']);
    const withField = fieldsOf(visits.id).find((f) => f.name === 'With');
    expect(withField?.type === 'link' && withField.config.targetCollectionId).toBe(people.id);
    expect(fieldsOf(people.id).map((f) => f.name)).toContain('Meals');
    expect(fieldsOf(named('Restaurants')!.id).map((f) => f.name)).toContain('Visits');
    expectIntact();

    // A second template reuses that People collection.
    const trips = planTemplate(TEMPLATES_BY_KEY.get('trips')!, {
      withLog: false,
      existing: Object.values(doc().collections),
    });
    expect(trips.collections).toHaveLength(1);
    store.getState().dispatch('createFromTemplate', { plan: trips });
    expect(fieldsOf(people.id).map((f) => f.name)).toContain('Trips');
    expectIntact();
  });

  it('skips links and drops collections nothing links to any more', () => {
    const plan = planTemplate(TEMPLATES_BY_KEY.get('trips')!, { withLog: false, existing: [] });
    const companions = plan.collections[0]!.fields.find((f) => f.key === 'companions')!;
    companions.link = { ...companions.link!, target: { kind: 'skip' } };
    const pruned = pruneTemplates(plan);
    expect(pruned.collections.map((c) => c.ref)).toEqual(['main']);
    store.getState().dispatch('createFromTemplate', { plan: pruned });
    expect(fieldsOf(named('Trips')!.id).some((f) => f.type === 'link')).toBe(false);
    expectIntact();
  });

  it('maps starter view filters onto the created options', () => {
    store.getState().dispatch('createFromTemplate', {
      plan: planTemplate(TEMPLATES_BY_KEY.get('books')!, { withLog: false, existing: [] }),
    });
    const books = named('Books')!;
    const status = fieldsOf(books.id).find((f) => f.name === 'Status');
    expect(
      fieldsOf(books.id)
        .sort((a, b) => a.order - b.order)
        .map((f) => f.name),
    ).toEqual([
      'Title',
      'Author',
      'Status',
      'Started',
      'Finished',
      'Rating',
      'Format',
      'Pages',
      'Genre',
      'Notes',
    ]);
    const list = Object.values(doc().views).find((v) => v.name === 'Reading list');
    const toRead = status?.type === 'singleSelect' ? status.config.options[0]?.id : undefined;
    expect(list?.filter).toEqual({
      op: 'and',
      items: [{ fieldId: status?.id, operator: 'isAnyOf', value: [toRead] }],
    });
  });

  it('copies a collection’s schema and views', () => {
    store.getState().dispatch('createFromTemplate', {
      plan: planTemplate(TEMPLATES_BY_KEY.get('books')!, { withLog: false, existing: [] }),
    });
    const books = named('Books')!;
    const copy = planFromCollection(doc(), books.id);
    store.getState().dispatch('createFromTemplate', { plan: copy });
    const copied = named('Books copy')!;
    expect(fieldsOf(copied.id).map((f) => f.name)).toEqual(fieldsOf(books.id).map((f) => f.name));
    expect(
      Object.values(doc().views)
        .filter((v) => v.collectionId === copied.id)
        .map((v) => v.name),
    ).toEqual(['All', 'Reading list', 'By status', 'Read this year']);
    expectIntact();
  });
});

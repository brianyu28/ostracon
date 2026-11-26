/**
 * Performance benchmarks against a synthetic ~50k-record file (7,400 people and everything
 * linked to them). Run with `pnpm bench`; exits non-zero if a target is missed.
 */
import { DocIndex } from '../src/domain/aggregates/docIndex';
import { generateDemoDocument } from '../src/domain/demo/generate';
import { countLinks, countRecords, iterateRecords, type DocModel } from '../src/domain/model';
import { parseDocument } from '../src/domain/schema/document';
import type { Field } from '../src/domain/schema/types';
import { formulaValue } from '../src/domain/computed';
import { formulaResultType } from '../src/domain/formulas/compile';
import { evaluateView } from '../src/domain/views/evaluate';
import { viewRecords } from '../src/domain/views/rows';
import { serializeModel } from '../src/persistence/codec/serialize';
import { createDocStore } from '../src/store/docStore';

interface Case {
  name: string;
  /** Target for the median run, in milliseconds. */
  targetMs: number;
  runs: number;
  fn: () => void;
}

function measure({ fn, runs }: Case): number {
  fn(); // warm-up
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] ?? 0;
}

const doc = generateDemoDocument({ endDate: '2026-11-26', records: 7400, appVersion: 'bench' });
const text = serializeModel(doc);
const store = createDocStore();
store.getState().load(doc);

const byName = (collection: string, field: string): Field => {
  const c = Object.values(doc.collections).find((x) => x.name === collection);
  const f = Object.values(doc.fields).find((x) => x.collectionId === c?.id && x.name === field);
  if (!c || !f) throw new Error(`Missing ${collection}.${field}`);
  return f;
};
const visits = byName('Restaurant visits', 'Visit');
const notes = byName('Restaurant visits', 'Notes');
const visitDate = byName('Restaurant visits', 'Date');
const withField = byName('Restaurant visits', 'With');
const visitIds = [...iterateRecords(doc, visits.collectionId)].map((r) => r.id);
const people = byName('People', 'Name');
const personIds = [...iterateRecords(doc, people.collectionId)].map((r) => r.id);
let n = 0;

const dispatch: ReturnType<typeof store.getState>['dispatch'] = (name, payload) =>
  store.getState().dispatch(name, payload);

/** Text fields filled on every visit, ready to be retyped (one per run, plus the warm-up). */
const retypeFields = [0, 1, 2, 3].map((i) => {
  const id = dispatch('createField', {
    collectionId: visits.collectionId,
    name: `Kind ${String(i)}`,
    type: 'text',
  });
  dispatch('setFieldValue', {
    collectionId: visits.collectionId,
    ids: visitIds,
    fieldId: id,
    value: i % 2 ? 'A' : 'B',
  });
  return id;
});
// A formula over every visit: days since the visit plus a text label.
const ageFormula = dispatch('createField', {
  collectionId: visits.collectionId,
  name: 'Days ago',
  type: 'formula',
  config: { expression: `DATEDIFF({${visitDate.id}}, TODAY()) + LEN({${notes.id}})` },
});
function evaluateByFormula() {
  const state = store.getState();
  const view = Object.values(state.doc?.views ?? {}).find(
    (v) => v.collectionId === visits.collectionId,
  );
  const doc = state.doc;
  if (!view || !doc) return;
  void evaluateView(
    doc,
    { ...view, sorts: [{ fieldId: ageFormula, dir: 'asc' }] },
    {
      today: '2026-11-26',
      weekStartsOn: 1,
      linked: (field, id) => state.index?.linked(field, id) ?? [],
      format: { locale: 'en-US', defaultCurrency: 'USD', dateStyle: 'medium' },
      formula: (record, field) => formulaValue(doc, field, record, { today: '2026-11-26' }),
      formulaType: (field) => formulaResultType(doc.fields, field),
    },
  );
}

const cases: Case[] = [
  {
    name: 'Parse + validate + integrity',
    targetMs: 800,
    runs: 5,
    fn: () => void parseDocument(text),
  },
  { name: 'Serialize', targetMs: 300, runs: 5, fn: () => void serializeModel(doc) },
  { name: 'Build index', targetMs: 150, runs: 5, fn: () => void DocIndex.build(doc) },
  {
    name: 'Edit one value (command, undo entry, index)',
    targetMs: 5,
    runs: 200,
    fn: () => {
      const id = visitIds[n++ % visitIds.length] ?? '';
      dispatch('setRecordValues', {
        collectionId: visits.collectionId,
        id,
        values: { [notes.id]: `Note ${String(n)}` },
      });
    },
  },
  {
    name: 'Set one record’s links',
    targetMs: 20,
    runs: 50,
    fn: () => {
      const id = visitIds[n++ % visitIds.length] ?? '';
      dispatch('setLinks', {
        fieldId: withField.id,
        recordId: id,
        targetIds: [
          personIds[n % personIds.length] ?? '',
          personIds[(n * 7) % personIds.length] ?? '',
        ],
      });
    },
  },
  {
    name: 'Look up linked records (index)',
    targetMs: 0.05,
    runs: 1000,
    fn: () => {
      const index = store.getState().index;
      void index?.linked(withField, visitIds[n++ % visitIds.length] ?? '');
    },
  },
  {
    name: 'Add a field to a 22k-record collection',
    targetMs: 10,
    runs: 20,
    fn: () => {
      dispatch('createField', {
        collectionId: visits.collectionId,
        name: `Extra ${String(n++)}`,
        type: 'text',
      });
    },
  },
  {
    name: 'Set one field on 22k records (bulk edit)',
    targetMs: 250,
    runs: 3,
    fn: () => {
      dispatch('setFieldValue', {
        collectionId: visits.collectionId,
        ids: visitIds,
        fieldId: notes.id,
        value: `Bulk ${String(n++)}`,
      });
    },
  },
  {
    name: 'Paste 1,000 rows × 2 columns (text, parsed)',
    targetMs: 60,
    runs: 5,
    fn: () => {
      const start = (n++ * 1000) % (visitIds.length - 1000);
      dispatch('setFromText', {
        collectionId: visits.collectionId,
        parse: { locale: 'en-US', today: '2026-11-26' },
        rows: visitIds.slice(start, start + 1000).map((id, i) => ({
          id,
          texts: { [notes.id]: `Pasted ${String(i)}`, [retypeFields[0] ?? '']: 'A' },
        })),
      });
    },
  },
  {
    name: 'Order a 22k-record view (sorted by a text field)',
    targetMs: 120,
    runs: 5,
    fn: () => {
      const view = Object.values(store.getState().doc?.views ?? {}).find(
        (v) => v.collectionId === visits.collectionId,
      );
      if (view)
        void viewRecords(store.getState().doc as DocModel, {
          ...view,
          sorts: [{ fieldId: notes.id, dir: 'asc' }],
        });
    },
  },
  {
    name: 'Evaluate a 22k-record view (filter, sort by date)',
    targetMs: 40,
    runs: 5,
    fn: () => {
      const state = store.getState();
      const view = Object.values(state.doc?.views ?? {}).find(
        (v) => v.collectionId === visits.collectionId,
      );
      if (!view || !state.doc) return;
      void evaluateView(
        state.doc,
        {
          ...view,
          filter: {
            op: 'and',
            items: [
              {
                fieldId: visitDate.id,
                operator: 'within',
                value: { kind: 'rolling', direction: 'past', amount: 2, unit: 'year' },
              },
              { fieldId: notes.id, operator: 'isNotEmpty' },
            ],
          },
          sorts: [{ fieldId: visitDate.id, dir: 'desc' }],
        },
        {
          today: '2026-11-26',
          weekStartsOn: 1,
          linked: (field, id) => state.index?.linked(field, id) ?? [],
          format: { locale: 'en-US', defaultCurrency: 'USD', dateStyle: 'medium' },
        },
      );
    },
  },
  {
    name: 'Search a 22k-record view',
    targetMs: 60,
    runs: 5,
    fn: () => {
      const state = store.getState();
      const view = Object.values(state.doc?.views ?? {}).find(
        (v) => v.collectionId === visits.collectionId,
      );
      if (!view || !state.doc) return;
      void evaluateView(state.doc, view, {
        today: '2026-11-26',
        weekStartsOn: 1,
        linked: (field, id) => state.index?.linked(field, id) ?? [],
        format: { locale: 'en-US', defaultCurrency: 'USD', dateStyle: 'medium' },
        search: `pasted ${String(n++ % 900)}`,
      });
    },
  },
  {
    name: 'Sort a 22k-record view by a formula (first run computes)',
    targetMs: 150,
    runs: 1,
    fn: () => {
      evaluateByFormula();
    },
  },
  {
    name: 'Sort a 22k-record view by a formula (cached)',
    targetMs: 60,
    runs: 5,
    fn: () => {
      evaluateByFormula();
    },
  },
  {
    name: 'Retype a field on 22k records (text → select)',
    targetMs: 300,
    runs: 3,
    fn: () => {
      const id = retypeFields.pop() ?? '';
      dispatch('changeFieldType', { id, type: 'singleSelect' });
    },
  },
];

console.log(
  `${countRecords(doc).toLocaleString()} records, ${countLinks(doc).toLocaleString()} links, ${(text.length / 1024 / 1024).toFixed(1)} MB\n`,
);
let failed = false;
for (const c of cases) {
  const ms = measure(c);
  const ok = ms <= c.targetMs;
  failed ||= !ok;
  console.log(
    `${ok ? '✓' : '✗'} ${c.name.padEnd(48)} ${ms.toFixed(2).padStart(9)} ms  (target ${String(c.targetMs)})`,
  );
}
if (failed) process.exit(1);

import { describe, expect, it } from 'vitest';
import { RAW_FORMAT } from '../fields/model';
import { putRecord, type DocModel } from '../model';
import type { Field, FilterGroup, RecordEntity, View } from '../schema/types';
import { pointSpan, rangeSpan } from './dates';
import { evaluateView } from './evaluate';
import { compileFilter, countConditions, type ViewContext } from './filter';
import { groupRecords } from './groups';
import { summarize } from './summaries';

const base = { collectionId: 'col', createdAt: '', updatedAt: '' };
const f = (id: string, type: string, config: unknown = {}) =>
  ({ ...base, id, name: id, type, ...(config === null ? {} : { config }) }) as unknown as Field;
const fields = {
  title: f('title', 'text'),
  pages: f('pages', 'number', { style: 'plain' }),
  read: f('read', 'date', { partial: true }),
  status: f('status', 'singleSelect', {
    options: [
      { id: 'opt_a', name: 'To read', color: 'gray', order: 0 },
      { id: 'opt_b', name: 'Read', color: 'green', order: 1 },
    ],
  }),
  done: f('done', 'checkbox', null),
  friends: f('friends', 'link', {
    targetCollectionId: 'col',
    inverseFieldId: 'friends',
    multiple: true,
  }),
};
const links: Record<string, string[]> = { r1: ['r2', 'r3'], r2: ['r1'] };
const ctx: ViewContext = {
  today: '2026-11-26',
  weekStartsOn: 1,
  linked: (_field, id) => links[id] ?? [],
};
const rec = (id: string, values: Record<string, unknown>, createdAt: string): RecordEntity =>
  ({ id, collectionId: 'col', values, createdAt, updatedAt: createdAt }) as RecordEntity;
const records = [
  rec('r1', { title: 'Dune', pages: 600, read: '2026-11-20', status: 'opt_b', done: true }, '1'),
  rec('r2', { title: 'Emma', pages: 300, read: '2019', status: 'opt_a' }, '2'),
  rec('r3', { title: 'Ulysses', read: '2026-10' }, '3'),
];
const ids = (group: FilterGroup) => {
  const p = compileFilter(group, fields, ctx);
  return records.filter(p).map((r) => r.id);
};
const where = (fieldId: string, operator: string, value?: unknown): FilterGroup => ({
  op: 'and',
  items: [{ fieldId, operator, ...(value === undefined ? {} : { value }) } as never],
});

describe('date spans', () => {
  it('resolves relative points and ranges against today', () => {
    expect(pointSpan({ kind: 'relative', offset: -3, unit: 'day' }, ctx)).toEqual({
      start: '2026-11-23',
      end: '2026-11-23',
    });
    expect(pointSpan({ kind: 'absolute', date: '2019' }, ctx)).toEqual({
      start: '2019-01-01',
      end: '2019-12-31',
    });
    expect(
      rangeSpan(
        { kind: 'rolling', direction: 'past', amount: 1, unit: 'week', includeToday: true },
        ctx,
      ),
    ).toEqual({
      start: '2026-11-20',
      end: '2026-11-26',
    });
    expect(rangeSpan({ kind: 'period', unit: 'month', offset: -1 }, ctx)).toEqual({
      start: '2026-10-01',
      end: '2026-10-31',
    });
    expect(rangeSpan({ kind: 'period', unit: 'week', offset: 0 }, ctx)).toEqual({
      start: '2026-11-23',
      end: '2026-11-29',
    });
    expect(rangeSpan({ kind: 'period', unit: 'quarter', offset: 0 }, ctx)).toEqual({
      start: '2026-10-01',
      end: '2026-12-31',
    });
    expect(rangeSpan({ kind: 'toDate', unit: 'year' }, ctx)).toEqual({
      start: '2026-01-01',
      end: '2026-11-26',
    });
  });
});

describe('filters', () => {
  it('matches text, numbers and checkboxes', () => {
    expect(ids(where('title', 'contains', 'u'))).toEqual(['r1', 'r3']);
    expect(ids(where('title', 'isNot', 'dune'))).toEqual(['r2', 'r3']);
    expect(ids(where('pages', 'gt', 400))).toEqual(['r1']);
    expect(ids(where('pages', 'neq', 600))).toEqual(['r2', 'r3']); // empty matches "≠"
    expect(ids(where('pages', 'between', [250, 350]))).toEqual(['r2']);
    expect(ids(where('done', 'isChecked'))).toEqual(['r1']);
    expect(ids(where('pages', 'isEmpty'))).toEqual(['r3']);
  });

  it('matches dates, including partial dates and relative operands', () => {
    expect(
      ids(where('read', 'within', { kind: 'rolling', direction: 'past', amount: 2, unit: 'week' })),
    ).toEqual(['r1']);
    expect(ids(where('read', 'within', { kind: 'period', unit: 'month', offset: -1 }))).toEqual([
      'r3',
    ]);
    expect(ids(where('read', 'before', { kind: 'absolute', date: '2026' }))).toEqual(['r2']);
    expect(ids(where('read', 'is', { kind: 'absolute', date: '2019-05-01' }))).toEqual(['r2']);
    expect(
      ids(where('read', 'onOrAfter', { kind: 'relative', offset: -1, unit: 'month' })),
    ).toEqual(['r1', 'r3']);
  });

  it('matches options and links, and combines groups', () => {
    expect(ids(where('status', 'isAnyOf', ['opt_a']))).toEqual(['r2']);
    expect(ids(where('status', 'isNoneOf', ['opt_a']))).toEqual(['r1', 'r3']);
    expect(ids(where('friends', 'hasAnyOf', ['r3']))).toEqual(['r1']);
    expect(ids(where('friends', 'countAtLeast', 1))).toEqual(['r1', 'r2']);
    const nested: FilterGroup = {
      op: 'or',
      items: [
        { fieldId: 'pages', operator: 'gt', value: 500 },
        {
          op: 'and',
          items: [
            { fieldId: 'status', operator: 'isEmpty' },
            { fieldId: 'title', operator: 'startsWith', value: 'u' },
          ],
        },
      ],
    };
    expect(ids(nested)).toEqual(['r1', 'r3']);
    expect(countConditions(nested)).toBe(3);
  });

  it('ignores conditions without an operand', () => {
    expect(ids(where('title', 'contains', ''))).toEqual(['r1', 'r2', 'r3']);
    expect(ids(where('status', 'isAnyOf', []))).toEqual(['r1', 'r2', 'r3']);
  });
});

describe('groups and summaries', () => {
  it('groups by option order with the empty group last', () => {
    const groups = groupRecords(records, fields.status, { fieldId: 'status', dir: 'asc' }, ctx);
    expect(groups.map((g) => [g.key, g.records.map((r) => r.id)])).toEqual([
      ['opt_a', ['r2']],
      ['opt_b', ['r1']],
      ['', ['r3']],
    ]);
    const byYear = groupRecords(
      records,
      fields.read,
      { fieldId: 'read', dir: 'desc', dateBucket: 'year' },
      ctx,
    );
    expect(byYear.map((g) => g.key)).toEqual(['2026', '2019']);
    const hidden = groupRecords(
      records,
      fields.status,
      { fieldId: 'status', dir: 'asc', hideEmpty: true },
      ctx,
    );
    expect(hidden).toHaveLength(2);
  });

  it('summarizes numbers, dates and checkboxes', () => {
    expect(summarize('sum', records, fields.pages, ctx)).toEqual({ kind: 'value', value: 900 });
    expect(summarize('average', records, fields.pages, ctx)).toEqual({ kind: 'value', value: 450 });
    expect(summarize('range', records, fields.pages, ctx)).toEqual({
      kind: 'numberRange',
      min: 300,
      max: 600,
    });
    expect(summarize('percentFilled', records, fields.pages, ctx)).toEqual({
      kind: 'percent',
      value: 2 / 3,
    });
    expect(summarize('range', records, fields.read, ctx)).toEqual({
      kind: 'dates',
      start: '2019-01-01',
      end: '2026-11-20',
    });
    expect(summarize('checked', records, fields.done, ctx)).toEqual({ kind: 'count', value: 1 });
    expect(summarize('unique', records, fields.status, ctx)).toEqual({ kind: 'count', value: 2 });
  });
});

describe('evaluateView', () => {
  it('filters, searches, sorts and groups', () => {
    const doc = { fields, records: {} } as unknown as DocModel;
    for (const r of records) putRecord(doc, r);
    const view = {
      id: 'v',
      collectionId: 'col',
      fields: [],
      filter: where('pages', 'isNotEmpty'),
      sorts: [{ fieldId: 'pages', dir: 'asc' }],
    } as unknown as View;
    const options = { ...ctx, format: RAW_FORMAT };
    expect(evaluateView(doc, view, options).records.map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(evaluateView(doc, view, { ...options, search: 'DUN' }).records.map((r) => r.id)).toEqual(
      ['r1'],
    );
    expect(
      evaluateView(doc, view, { ...options, search: 'read' }).records.map((r) => r.id),
    ).toEqual(['r2', 'r1']);
    const grouped = evaluateView(
      doc,
      { ...view, filter: undefined, group: { fieldId: 'done', dir: 'asc' } },
      options,
    );
    expect(grouped.groups?.map((g) => g.key)).toEqual(['false', 'true']);
    expect(grouped.records.map((r) => r.id)).toEqual(['r2', 'r3', 'r1']);
  });
});

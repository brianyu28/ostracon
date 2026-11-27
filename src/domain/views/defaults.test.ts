import { describe, expect, it } from 'vitest';
import { putRecord, type DocModel } from '../model';
import type { Field, FilterGroup } from '../schema/types';
import { filterDefaults } from './defaults';
import type { ViewContext } from './filter';

const base = { collectionId: 'col', createdAt: '', updatedAt: '' };
const f = (id: string, type: string, config: unknown = {}) =>
  ({ ...base, id, name: id, type, ...(config === null ? {} : { config }) }) as unknown as Field;
const fields = {
  title: f('title', 'text'),
  pages: f('pages', 'number', { style: 'plain' }),
  read: f('read', 'date', { partial: true }),
  day: f('day', 'date'),
  trip: f('trip', 'dateRange'),
  place: f('place', 'location', { parts: ['city', 'country'] }),
  status: f('status', 'singleSelect', {
    options: [
      { id: 'opt_a', name: 'To read', color: 'gray', order: 0 },
      { id: 'opt_b', name: 'Read', color: 'green', order: 1 },
    ],
  }),
  tags: f('tags', 'multiSelect', {
    options: [
      { id: 'opt_x', name: 'X', color: 'gray', order: 0 },
      { id: 'opt_y', name: 'Y', color: 'gray', order: 1 },
    ],
  }),
  done: f('done', 'checkbox', null),
  author: f('author', 'link', { targetCollectionId: 'people' }),
  friends: f('friends', 'link', { targetCollectionId: 'people', multiple: true }),
};
const doc = { fields, records: {} } as unknown as DocModel;
for (const id of ['p1', 'p2'])
  putRecord(doc, { id, collectionId: 'people', values: {}, createdAt: '', updatedAt: '' });

const ctx: ViewContext = { today: '2026-11-26', weekStartsOn: 1, linked: () => [] };
const c = (fieldId: string, operator: string, value?: unknown, part?: string) =>
  ({
    fieldId,
    operator,
    ...(value === undefined ? {} : { value }),
    ...(part ? { part } : {}),
  }) as never;
const and = (...items: unknown[]): FilterGroup => ({ op: 'and', items: items as never });
const or = (...items: unknown[]): FilterGroup => ({ op: 'or', items: items as never });
const defaults = (filter: FilterGroup | undefined) => filterDefaults(doc, filter, ctx);

describe('filterDefaults', () => {
  it('returns nothing without a filter', () => {
    expect(defaults(undefined)).toEqual({ values: {}, links: {} });
  });

  it('takes values from conditions that name one value', () => {
    expect(
      defaults(
        and(
          c('title', 'is', ' Dune '),
          c('pages', 'eq', 600),
          c('status', 'isAnyOf', ['opt_b']),
          c('tags', 'hasAllOf', ['opt_x', 'opt_y']),
          c('done', 'isChecked'),
          c('place', 'is', 'Lisbon', 'city'),
          c('place', 'is', 'Portugal', 'country'),
        ),
      ).values,
    ).toEqual({
      title: 'Dune',
      pages: 600,
      status: 'opt_b',
      tags: ['opt_x', 'opt_y'],
      done: true,
      place: { city: 'Lisbon', country: 'Portugal' },
    });
  });

  it('skips conditions that allow several values or none', () => {
    expect(
      defaults(
        and(
          c('title', 'contains', 'Du'),
          c('pages', 'gt', 100),
          c('status', 'isAnyOf', ['opt_a', 'opt_b']),
          c('status', 'isNoneOf', ['opt_a']),
          c('tags', 'hasAnyOf', ['opt_x', 'opt_y']),
          c('done', 'isNotChecked'),
          c('title', 'isNotEmpty'),
        ),
      ).values,
    ).toEqual({});
  });

  it('ignores "or" groups with more than one item but follows nested "and" groups', () => {
    expect(defaults(or(c('pages', 'eq', 1), c('pages', 'eq', 2))).values).toEqual({});
    expect(defaults(or(and(c('pages', 'eq', 1), c('done', 'isChecked')))).values).toEqual({
      pages: 1,
      done: true,
    });
    expect(
      defaults(and(c('done', 'isChecked'), or(c('pages', 'eq', 1), c('pages', 'eq', 2)))).values,
    ).toEqual({ done: true });
  });

  it('uses today for date conditions that include it', () => {
    const thisYear = { kind: 'period', unit: 'year', offset: 0 };
    const lastYear = { kind: 'period', unit: 'year', offset: -1 };
    expect(
      defaults(and(c('day', 'within', thisYear), c('trip', 'within', thisYear))).values,
    ).toEqual({ day: '2026-11-26', trip: { start: '2026-11-26' } });
    expect(defaults(and(c('day', 'within', lastYear))).values).toEqual({});
    expect(
      defaults(and(c('day', 'is', { kind: 'relative', offset: -1, unit: 'day' }))).values,
    ).toEqual({ day: '2026-11-25' });
  });

  it('keeps a partial date only where the field allows it', () => {
    const july = { kind: 'absolute', date: '2019-07' };
    expect(defaults(and(c('read', 'is', july))).values).toEqual({ read: '2019-07' });
    expect(defaults(and(c('day', 'is', july))).values).toEqual({});
  });

  it('drops a value another condition on the same field rejects', () => {
    expect(defaults(and(c('pages', 'eq', 5), c('pages', 'neq', 5))).values).toEqual({});
  });

  it('links records that exist, within the field’s cardinality', () => {
    expect(defaults(and(c('author', 'hasAnyOf', ['p1']))).links).toEqual({ author: ['p1'] });
    expect(defaults(and(c('author', 'hasAllOf', ['p1', 'p2']))).links).toEqual({});
    expect(defaults(and(c('friends', 'hasAllOf', ['p1', 'p2']))).links).toEqual({
      friends: ['p1', 'p2'],
    });
    expect(defaults(and(c('friends', 'hasAnyOf', ['gone']))).links).toEqual({});
  });
});

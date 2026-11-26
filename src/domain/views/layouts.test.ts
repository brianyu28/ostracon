import { describe, expect, it } from 'vitest';
import type { Field, RecordEntity, View } from '../schema/types';
import { boardColumns, columnValue, movedOrder } from './board';
import { calendarMonth, monthDays, shiftedValues } from './calendar';

const base = { collectionId: 'col', createdAt: '', updatedAt: '', order: 0 };
const status = {
  ...base,
  id: 'status',
  name: 'Status',
  type: 'singleSelect',
  config: {
    options: [
      { id: 'a', name: 'To do', color: 'gray', order: 0 },
      { id: 'b', name: 'Done', color: 'green', order: 1 },
    ],
  },
} as Field;
const date = {
  ...base,
  id: 'date',
  name: 'Date',
  type: 'date',
  config: { partial: true },
} as Field;
const range = { ...base, id: 'range', name: 'Range', type: 'dateRange', config: {} } as Field;
const rec = (id: string, values: Record<string, unknown>) =>
  ({ id, collectionId: 'col', values, createdAt: id, updatedAt: id }) as RecordEntity;

describe('board', () => {
  const records = [
    rec('r1', { status: 'b' }),
    rec('r2', {}),
    rec('r3', { status: 'a' }),
    rec('r4', { status: 'b' }),
  ];
  const view = (extra: Partial<View> = {}) =>
    ({
      id: 'v',
      collectionId: 'col',
      fields: [],
      layout: 'board',
      board: { groupFieldId: 'status' },
      ...extra,
    }) as View;

  it('splits records into columns, the empty one first', () => {
    expect(
      boardColumns(view(), status, records).map((c) => [c.key, c.records.map((r) => r.id)]),
    ).toEqual([
      ['', ['r2']],
      ['a', ['r3']],
      ['b', ['r1', 'r4']],
    ]);
    expect(columnValue(status, '')).toBeUndefined();
  });

  it('follows the manual order until the view is sorted', () => {
    const ordered = view({ board: { groupFieldId: 'status', cardOrder: ['r4', 'r1'] } });
    expect(boardColumns(ordered, status, records)[2]?.records.map((r) => r.id)).toEqual([
      'r4',
      'r1',
    ]);
    const sorted = { ...ordered, sorts: [{ fieldId: 'status', dir: 'asc' as const }] };
    expect(boardColumns(sorted, status, records)[2]?.records.map((r) => r.id)).toEqual([
      'r1',
      'r4',
    ]);
    const columns = boardColumns(view(), status, records);
    expect(movedOrder(columns, 'r4', 'r3')).toEqual(['r2', 'r4', 'r3', 'r1']);
    expect(movedOrder(columns, 'r2', null)).toEqual(['r3', 'r1', 'r4', 'r2']);
  });
});

describe('calendar', () => {
  it('lays out whole weeks', () => {
    const days = monthDays('2026-11', 1);
    expect(days[0]).toBe('2026-10-26');
    expect(days.length % 7).toBe(0);
    expect(days.at(-1)).toBe('2026-12-06');
  });

  it('places days, spans and partial dates', () => {
    const view = {
      id: 'v',
      collectionId: 'col',
      fields: [],
      layout: 'calendar',
      calendar: { dateFieldId: 'date' },
    } as unknown as View;
    const month = calendarMonth(
      view,
      { date },
      [
        rec('day', { date: '2026-11-05' }),
        rec('month', { date: '2026-11' }),
        rec('year', { date: '2026' }),
        rec('other', { date: '2026-12-25' }),
      ],
      '2026-11',
      1,
    );
    expect(month.byDay.get('2026-11-05')?.map((e) => e.record.id)).toEqual(['day']);
    expect(month.tray.map((r) => r.id)).toEqual(['month', 'year']);
    expect([...month.byDay.values()].flat().some((e) => e.record.id === 'other')).toBe(false);

    const ranged = { ...view, calendar: { dateFieldId: 'range' } } as View;
    const spans = calendarMonth(
      ranged,
      { range },
      [rec('trip', { range: { start: '2026-11-29', end: '2026-12-02' } })],
      '2026-11',
      1,
    );
    expect(
      ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'].map(
        (d) => spans.byDay.get(d)?.length,
      ),
    ).toEqual([1, 1, 1, 1]);
  });

  it('moves dates by days, keeping ranges whole', () => {
    expect(shiftedValues(rec('r', { date: '2026-11-30' }), date, 2)).toEqual({
      date: '2026-12-02',
    });
    expect(shiftedValues(rec('r', { date: '2026-11' }), date, 2)).toBeNull();
    expect(
      shiftedValues(rec('r', { range: { start: '2026-11-01', end: '2026-11-03' } }), range, -1),
    ).toEqual({
      range: { start: '2026-10-31', end: '2026-11-02' },
    });
  });
});

import { describe, expect, it } from 'vitest';
import type { Field, RecordEntity } from '@/domain/schema/types';
import { copyCells, planClear, planFillDown, planPaste, selectionRect } from './selection';

const text = (id: string): Field =>
  ({
    id,
    collectionId: 'col',
    name: id,
    type: 'text',
    config: {},
    createdAt: '',
    updatedAt: '',
  }) as Field;
const link = { ...text('lnk'), type: 'link', config: {} } as unknown as Field;
const columns = [text('a'), text('b'), link];
const rec = (id: string, values: Record<string, string>): RecordEntity => ({
  id,
  collectionId: 'col',
  values,
  createdAt: '',
  updatedAt: '',
});
const rows = [rec('r1', { a: 'A1', b: 'B1' }), rec('r2', { a: 'A2' }), rec('r3', {})];
const rowIndex = new Map(rows.map((r, i) => [r.id, i]));

describe('selection', () => {
  it('turns the cursor and anchor into a rectangle', () => {
    expect(
      selectionRect({ row: 'r3', field: 'a' }, { row: 'r1', field: 'b' }, rowIndex, columns),
    ).toEqual({ top: 0, bottom: 2, left: 0, right: 1 });
    expect(selectionRect({ row: 'gone', field: 'a' }, null, rowIndex, columns)).toBeNull();
  });

  it('copies cells as text, links as titles', () => {
    const rect = { top: 0, bottom: 1, left: 0, right: 2 };
    expect(
      copyCells(rect, rows, columns, () => [
        { id: 'x', title: 'X' },
        { id: 'y', title: 'Y' },
      ]),
    ).toEqual([
      ['A1', 'B1', 'X, Y'],
      ['A2', '', 'X, Y'],
    ]);
  });

  it('pastes a block at the corner, adding rows', () => {
    const plan = planPaste(
      [
        ['1', '2', 'link'],
        ['3', '4', ''],
        ['5', '6', ''],
        ['7', '', ''],
      ],
      { top: 1, bottom: 1, left: 0, right: 0 },
      rows,
      columns,
    );
    expect(plan.skipped).toBe(0);
    expect(plan.added).toBe(2);
    expect(plan.rows).toEqual([
      { id: 'r2', texts: { a: '1', b: '2', lnk: 'link' } },
      { id: 'r3', texts: { a: '3', b: '4', lnk: '' } },
      { texts: { a: '5', b: '6', lnk: '' } },
      { texts: { a: '7', b: '', lnk: '' } },
    ]);
  });

  it('fills a whole range with a single copied cell', () => {
    const plan = planPaste([['x']], { top: 0, bottom: 1, left: 0, right: 1 }, rows, columns);
    expect(plan.rows).toEqual([
      { id: 'r1', texts: { a: 'x', b: 'x' } },
      { id: 'r2', texts: { a: 'x', b: 'x' } },
    ]);
  });

  it('fills down from the top row, or from the row above a single row', () => {
    expect(planFillDown({ top: 0, bottom: 2, left: 0, right: 1 }, rows, columns)).toEqual([
      { id: 'r2', values: { a: 'A1', b: 'B1' } },
      { id: 'r3', values: { a: 'A1', b: 'B1' } },
    ]);
    expect(planFillDown({ top: 2, bottom: 2, left: 0, right: 0 }, rows, columns)).toEqual([
      { id: 'r3', values: { a: 'A2' } },
    ]);
    expect(planFillDown({ top: 0, bottom: 0, left: 0, right: 0 }, rows, columns)).toEqual([]);
  });

  it('clears only records with values in the range', () => {
    expect(planClear({ top: 0, bottom: 2, left: 1, right: 2 }, rows, columns)).toEqual([
      { id: 'r1', values: { b: undefined } },
    ]);
  });
});

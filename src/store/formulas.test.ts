import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandError, type CommandName, type CommandPayload } from '@/domain/commands';
import { FORMULA_ERROR, formulaValue } from '@/domain/computed';
import { operatorsFor } from '@/domain/fields/dynamic';
import { compileField, checkExpression, type FormulaField } from '@/domain/formulas/compile';
import { toDisplay, toStored } from '@/domain/formulas/expression';
import { parseFormula } from '@/domain/formulas/parse';
import { getRecord, type DocModel } from '@/domain/model';
import { recordTitle } from '@/domain/records';
import { createEmptyDocument } from '@/domain/schema/defaults';
import type { Id, RecordEntity } from '@/domain/schema/types';
import { evaluateView } from '@/domain/views/evaluate';
import { createDocStore } from './docStore';

let store: ReturnType<typeof createDocStore>;
const doc = (): DocModel => store.getState().doc!;
const run = <K extends CommandName>(name: K, payload: CommandPayload<K>) => {
  vi.advanceTimersByTime(1000);
  return store.getState().dispatch(name, payload);
};

let books: Id;
let title: Id;
let pages: Id;
let started: Id;
let finished: Id;

const today = '2026-11-26';
const value = (fieldId: Id, recordId: Id) =>
  formulaValue(doc(), doc().fields[fieldId] as FormulaField, getRecord(doc(), books, recordId)!, {
    today,
  });
const addFormula = (name: string, display: string, extra: object = {}) =>
  run('createField', {
    collectionId: books,
    name,
    type: 'formula',
    config: {
      expression: toStored(
        display,
        Object.values(doc().fields).filter((f) => f.collectionId === books),
      ),
      ...extra,
    },
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-26T12:00:00Z') });
  store = createDocStore();
  store.getState().load(createEmptyDocument({ appVersion: 'test' }));
  books = run('createCollection', { name: 'Books' });
  title = doc().collections[books]!.primaryFieldId;
  pages = run('createField', { collectionId: books, name: 'Pages', type: 'number' });
  started = run('createField', { collectionId: books, name: 'Started', type: 'date' });
  finished = run('createField', { collectionId: books, name: 'Finished', type: 'date' });
  run('createField', { collectionId: books, name: 'Done', type: 'checkbox' });
});

describe('parsing and checking', () => {
  it('respects precedence and reports positions', () => {
    expect(parseFormula('1 + 2 * 3 = 7 and not FALSE')).toMatchObject({ k: 'bin', op: 'and' });
    expect(() => parseFormula('1 +')).toThrow('ends too soon');
    try {
      parseFormula('IF(1, 2 3)');
    } catch (err) {
      expect((err as { at: number }).at).toBe(8);
    }
  });

  it('infers result types and rejects mistakes', () => {
    const f = {
      id: 'fld_new',
      collectionId: books,
      name: 'X',
      type: 'formula',
      config: { expression: '' },
      order: 9,
      createdAt: '',
      updatedAt: '',
    } as FormulaField;
    const check = (display: string) => {
      const result = checkExpression(
        doc().fields,
        f,
        toStored(display, Object.values(doc().fields)),
      );
      return result.ok ? result.info.type : result.error.message;
    };
    expect(check('{Pages} / 2')).toBe('number');
    expect(check('{Name} & " (" & {Pages} & ")"')).toBe('text');
    expect(check('DATEADD({Started}, 3, "days")')).toBe('date');
    expect(check('IF({Done}, "yes", BLANK())')).toBe('text');
    expect(check('{Name} + 1')).toMatch(/needs numbers; use & to join text/);
    expect(check('IF({Done}, 1, "one")')).toMatch(/different types/);
    expect(check('{Nope}')).toBe('Unknown field “Nope”');
    expect(check('ROUND()')).toMatch(/ROUND takes/);
    expect(check('YEAR({Name})')).toMatch(/YEAR expects date/);
  });

  it('stores field ids and shows names, so renames are safe', () => {
    const stored = toStored('{pages} * 2 & "{Pages}"', Object.values(doc().fields));
    expect(stored).toBe(`{${pages}} * 2 & "{Pages}"`);
    run('updateField', { id: pages, changes: { name: 'Page count' } });
    expect(toDisplay(stored, doc().fields)).toBe('{Page count} * 2 & "{Pages}"');
  });
});

describe('evaluation', () => {
  it('computes per record, following edits and today', () => {
    const days = addFormula(
      'Days',
      'DATEDIFF({Started}, IF(ISBLANK({Finished}), TODAY(), {Finished}))',
    );
    const label = addFormula('Label', 'UPPER({Name}) & ": " & {Pages} & " pages"');
    const half = addFormula('Half', 'ROUND({Pages} / 3, 1)');
    const id = run('createRecord', {
      collectionId: books,
      values: { [title]: 'Dune', [pages]: 100, [started]: '2026-11-01' },
    });
    expect(value(days, id)).toBe(25);
    expect(value(label, id)).toBe('DUNE: 100 pages');
    expect(value(half, id)).toBe(33.3);
    run('setRecordValues', { collectionId: books, id, values: { [finished]: '2026-11-11' } });
    expect(value(days, id)).toBe(10);
    // Division by zero is an error for that record only.
    const ratio = addFormula('Ratio', '1 / ({Pages} - 100)');
    expect(value(ratio, id)).toBe(FORMULA_ERROR);
  });

  it('references other formulas and rejects cycles', () => {
    const a = addFormula('A', '{Pages} + 1');
    const b = addFormula('B', '{A} * 2');
    const id = run('createRecord', { collectionId: books, values: { [pages]: 4 } });
    expect(value(b, id)).toBe(10);
    const toA = toStored('{B} + 1', Object.values(doc().fields));
    expect(() => {
      run('updateField', { id: a, changes: { config: { expression: toA } } });
    }).toThrow(CommandError);
    expect(compileField(doc().fields, doc().fields[a] as FormulaField).ok).toBe(true);
  });

  it('counts links and makes formula titles', () => {
    const people = run('createCollection', { name: 'People' });
    const { fieldId: readers } = run('createLinkField', {
      collectionId: books,
      name: 'Readers',
      targetCollectionId: people,
      backlink: false,
    });
    const ann = run('createRecord', { collectionId: people });
    const count = addFormula('Readers count', 'COUNT_LINKS({Readers})');
    const id = run('createRecord', { collectionId: books, values: { [title]: 'Emma' } });
    expect(value(count, id)).toBe(0);
    run('setLinks', { fieldId: readers, recordId: id, targetIds: [ann] });
    expect(value(count, id)).toBe(1);

    const titled = addFormula('Title', '{Name} & " (" & {Readers count} & ")"');
    run('setPrimaryField', { collectionId: books, fieldId: titled });
    expect(recordTitle(doc(), getRecord(doc(), books, id)!)).toBe('Emma (1)');
  });
});

describe('formulas in views', () => {
  it('filter, sort and summarize by their result type', () => {
    const doubled = addFormula('Doubled', '{Pages} * 2', {
      number: { style: 'decimal', decimals: 0 },
    });
    expect(Object.keys(operatorsFor(doc().fields[doubled]!, doc().fields))).toContain('gt');
    for (const [name, n] of [
      ['a', 5],
      ['b', 50],
      ['c', 20],
    ] as const)
      run('createRecord', { collectionId: books, values: { [title]: name, [pages]: n } });
    const view = Object.values(doc().views).find((v) => v.collectionId === books)!;
    const ctx = {
      today,
      weekStartsOn: 0 as const,
      linked: () => [],
      format: { locale: 'en-US', defaultCurrency: 'USD', dateStyle: 'medium' as const },
      formula: (r: RecordEntity, f: FormulaField) => formulaValue(doc(), f, r, { today }),
      formulaType: (f: FormulaField) => {
        const c = compileField(doc().fields, f);
        return c.ok ? c.info.type : undefined;
      },
    };
    const result = evaluateView(
      doc(),
      {
        ...view,
        filter: { op: 'and', items: [{ fieldId: doubled, operator: 'gt', value: 30 }] },
        sorts: [{ fieldId: doubled, dir: 'desc' }],
      },
      ctx,
    );
    expect(result.records.map((r) => r.values[title])).toEqual(['b', 'c']);
  });
});

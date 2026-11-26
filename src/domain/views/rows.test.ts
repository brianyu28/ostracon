import { describe, expect, it } from 'vitest';
import { putRecord, type DocModel } from '../model';
import type { Field, View } from '../schema/types';
import { sortRecords, viewRecords } from './rows';

const pages: Field = {
  id: 'fld_p',
  collectionId: 'col',
  name: 'Pages',
  type: 'number',
  config: { style: 'plain' },
  createdAt: '',
  updatedAt: '',
} as Field;

function docWith(values: (number | undefined)[]): DocModel {
  const doc = { fields: { [pages.id]: pages }, records: {} } as unknown as DocModel;
  values.forEach((v, i) => {
    putRecord(doc, {
      id: `rec_${String(i)}`,
      collectionId: 'col',
      values: v === undefined ? {} : { [pages.id]: v },
      createdAt: `2026-01-0${String(i + 1)}`,
      updatedAt: '',
    });
  });
  return doc;
}

const view = (sorts?: View['sorts']) =>
  ({ id: 'v', collectionId: 'col', fields: [], sorts }) as unknown as View;

describe('viewRecords', () => {
  it('keeps creation order without sorts', () => {
    expect(viewRecords(docWith([3, 1, 2]), view()).map((r) => r.id)).toEqual([
      'rec_0',
      'rec_1',
      'rec_2',
    ]);
  });

  it('sorts by a field with empty values last in both directions', () => {
    const doc = docWith([3, undefined, 1, 2]);
    expect(viewRecords(doc, view([{ fieldId: pages.id, dir: 'asc' }])).map((r) => r.id)).toEqual([
      'rec_2',
      'rec_3',
      'rec_0',
      'rec_1',
    ]);
    expect(viewRecords(doc, view([{ fieldId: pages.id, dir: 'desc' }])).map((r) => r.id)).toEqual([
      'rec_0',
      'rec_3',
      'rec_2',
      'rec_1',
    ]);
  });

  it('sorts by linked titles when they are available, empty last', () => {
    const link = { ...pages, id: 'fld_l', type: 'link', config: {} } as unknown as Field;
    const titles: Record<string, string[]> = { rec_0: ['Mia'], rec_1: [], rec_2: ['ana'] };
    const records = [...Object.keys(titles)].map((id, i) => ({
      id,
      collectionId: 'col',
      values: {},
      createdAt: String(i),
      updatedAt: '',
    }));
    const sorted = sortRecords(
      records,
      [{ fieldId: link.id, dir: 'asc' }],
      { [link.id]: link },
      {
        linkTitles: (r) => titles[r.id] ?? [],
      },
    );
    expect(sorted.map((r) => r.id)).toEqual(['rec_2', 'rec_0', 'rec_1']);
  });
});

import { describe, expect, it } from 'vitest';
import { generateDemoDocument } from './demo/generate';
import { onThisDay, recentRecords, searchRecords } from './home';
import { iterateRecords } from './model';
import { recordTitle } from './records';

const doc = generateDemoDocument({ endDate: '2026-11-26', records: 20, appVersion: 't', seed: 7 });

describe('home', () => {
  it('lists recent edits newest first', () => {
    const recent = recentRecords(doc, 10);
    expect(recent).toHaveLength(10);
    const all = [...iterateRecords(doc)]
      .map((r) => r.updatedAt)
      .sort()
      .reverse();
    expect(recent.map((r) => r.updatedAt)).toEqual(all.slice(0, 10));
  });

  it('finds dates on this day in earlier years', () => {
    const sample = [...iterateRecords(doc)].find((r) =>
      Object.values(r.values).some(
        (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && v < '2026',
      ),
    );
    const date = Object.values(sample?.values ?? {}).find(
      (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && v < '2026',
    ) as string;
    const hits = onThisDay(doc, `2026-${date.slice(5)}`);
    expect(
      hits.some(
        (h) => h.record.id === sample?.id && h.yearsAgo === 2026 - Number(date.slice(0, 4)),
      ),
    ).toBe(true);
  });

  it('searches every collection, titles first', () => {
    const person = [...iterateRecords(doc)][0]!;
    const title = recordTitle(doc, person);
    const hits = searchRecords(doc, title.slice(0, 4));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.title.toLowerCase().startsWith(title.slice(0, 4).toLowerCase())).toBe(true);
    expect(searchRecords(doc, 'zzzz qqqq')).toEqual([]);
  });
});

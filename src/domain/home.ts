/** Home and search: recently edited records, "on this day" and searching every collection. */
import { fieldType } from './fields/registry';
import { locationText } from './fields/types/other';
import { iterateRecords, type DocModel } from './model';
import { recordTitle } from './records';
import type { Field, LocationValue, RecordEntity } from './schema/types';
import { markdownText } from '@/lib/markdown';
import { datePrecision } from '@/lib/partialDate';

/** The most recently edited records, newest first. */
export function recentRecords(doc: DocModel, limit = 20): RecordEntity[] {
  const top: RecordEntity[] = [];
  for (const r of iterateRecords(doc)) {
    if (top.length < limit) {
      top.push(r);
      if (top.length === limit) top.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      continue;
    }
    const last = top[top.length - 1] as RecordEntity;
    if (r.updatedAt <= last.updatedAt) continue;
    // Insert in order, dropping the oldest.
    let i = top.length - 1;
    while (i > 0 && (top[i - 1] as RecordEntity).updatedAt < r.updatedAt) i--;
    top.splice(i, 0, r);
    top.pop();
  }
  return top.length < limit ? top.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)) : top;
}

export interface Anniversary {
  record: RecordEntity;
  field: Field;
  /** The full date it happened. */
  date: string;
  yearsAgo: number;
}

/** Records with a date (or a range's start) on today's month and day in an earlier year. */
export function onThisDay(doc: DocModel, today: string, limit = 30): Anniversary[] {
  const monthDay = today.slice(5);
  const year = Number(today.slice(0, 4));
  const out: Anniversary[] = [];
  const dateFields = Object.values(doc.fields).filter(
    (f) => f.type === 'date' || f.type === 'dateTime' || f.type === 'dateRange',
  );
  for (const field of dateFields) {
    for (const record of iterateRecords(doc, field.collectionId)) {
      const v = record.values[field.id];
      let date: string | undefined;
      if (field.type === 'dateRange' && v && typeof v === 'object' && 'start' in v) date = v.start;
      else if (typeof v === 'string') date = v.slice(0, 10);
      if (!date || datePrecision(date) !== 'day' || date.slice(5) !== monthDay) continue;
      const yearsAgo = year - Number(date.slice(0, 4));
      if (yearsAgo > 0) out.push({ record, field, date, yearsAgo });
    }
  }
  return out.sort((a, b) => a.yearsAgo - b.yearsAgo).slice(0, limit);
}

interface SearchEntry {
  record: RecordEntity;
  title: string;
  titleLower: string;
  textLower: string;
}

const indexCache = new WeakMap<DocModel, SearchEntry[]>();

/** Searchable text of a record's values (text-like fields, option names, places). */
function recordText(record: RecordEntity, fields: readonly Field[]): string {
  const parts: string[] = [];
  for (const field of fields) {
    const v = record.values[field.id];
    if (v === undefined) continue;
    switch (field.type) {
      case 'text':
      case 'url':
      case 'email':
      case 'phone':
        if (typeof v === 'string') parts.push(v);
        break;
      case 'richText':
        if (typeof v === 'string') parts.push(markdownText(v));
        break;
      case 'location':
        parts.push(locationText(v as LocationValue));
        break;
      case 'singleSelect':
      case 'multiSelect':
        parts.push(
          fieldType(field).format(
            v,
            field,
            { locale: 'en-US', defaultCurrency: 'USD', dateStyle: 'iso' },
            'display',
          ),
        );
        break;
    }
  }
  return parts.join(' ');
}

/** The search index for a document version (built on first use, then cached). */
function searchIndex(doc: DocModel): SearchEntry[] {
  let index = indexCache.get(doc);
  if (index) return index;
  const byCollection = new Map<string, Field[]>();
  for (const f of Object.values(doc.fields)) {
    const list = byCollection.get(f.collectionId) ?? [];
    list.push(f);
    byCollection.set(f.collectionId, list);
  }
  index = [];
  for (const record of iterateRecords(doc)) {
    const title = recordTitle(doc, record);
    index.push({
      record,
      title,
      titleLower: title.toLowerCase(),
      textLower: recordText(record, byCollection.get(record.collectionId) ?? []).toLowerCase(),
    });
  }
  indexCache.set(doc, index);
  return index;
}

export interface SearchHit {
  record: RecordEntity;
  title: string;
}

/**
 * Records matching every word of the query, best first: titles starting with the query, then
 * titles containing it, then matches in other fields; recent edits break ties.
 */
export function searchRecords(doc: DocModel, query: string, limit = 50): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const hits: { entry: SearchEntry; rank: number }[] = [];
  for (const entry of searchIndex(doc)) {
    const all = `${entry.titleLower} ${entry.textLower}`;
    if (!words.every((w) => all.includes(w))) continue;
    const rank = entry.titleLower.startsWith(q) ? 0 : entry.titleLower.includes(q) ? 1 : 2;
    hits.push({ entry, rank });
  }
  hits.sort(
    (a, b) => a.rank - b.rank || (a.entry.record.updatedAt < b.entry.record.updatedAt ? 1 : -1),
  );
  return hits.slice(0, limit).map(({ entry }) => ({ record: entry.record, title: entry.title }));
}

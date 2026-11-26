import { describe, expect, it } from 'vitest';
import { generateDemoDocument } from '../demo/generate';
import {
  countLinks,
  getRecord,
  hasLink,
  iterateLinks,
  iterateRecords,
  linkKey,
  putLink,
  putRecord,
  removeLink,
  removeRecord,
  type DocModel,
} from '../model';
import type { Link, RecordEntity } from '../schema/types';
import { serializeModel } from '@/persistence/codec/serialize';
import { parseDocument } from '../schema/document';
import { mergeDocuments } from './merge';

const clone = (d: DocModel): DocModel => structuredClone(d);
const base = generateDemoDocument({ endDate: '2026-03-31', records: 6, appVersion: 't', seed: 4 });
const people = Object.values(base.collections).find((c) => c.name === 'People')!;
const books = Object.values(base.collections).find((c) => c.name === 'Books')!;
const [p1, p2, p3] = [...iterateRecords(base, people.id)];
const nameField = people.primaryFieldId;
const friends = Object.values(base.fields).find(
  (f) => f.collectionId === people.id && f.name === 'Friends',
)!;
/** A friendship link between two people, stored the symmetric way (smaller id first). */
const friendship = (a: string, b: string, at: string): Link =>
  a < b ? [friends.id, a, b, at] : [friends.id, b, a, at];
const keysOf = (doc: DocModel, link: Link) => (hasLink(doc, linkKey(link)) ? [linkKey(link)] : []);

function edit(doc: DocModel, r: RecordEntity, values: object, at: string) {
  const current = getRecord(doc, r.collectionId, r.id)!;
  putRecord(doc, { ...current, values: { ...current.values, ...values }, updatedAt: at });
}

function addLink(doc: DocModel, link: Link) {
  putLink(doc, link);
}

describe('mergeDocuments (with a base)', () => {
  it('combines independent edits from both devices', () => {
    const local = clone(base);
    const remote = clone(base);
    edit(local, p1!, { [nameField]: 'Local name' }, '2026-04-01T10:00:00.000Z');
    edit(remote, p2!, { [nameField]: 'Remote name' }, '2026-04-01T11:00:00.000Z');
    remote.collections[books.id] = {
      ...books,
      name: 'Reading',
      updatedAt: '2026-04-01T11:00:00.000Z',
    };

    const { merged, conflicts } = mergeDocuments(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(getRecord(merged, people.id, p1!.id)?.values[nameField]).toBe('Local name');
    expect(getRecord(merged, people.id, p2!.id)?.values[nameField]).toBe('Remote name');
    expect(merged.collections[books.id]?.name).toBe('Reading');
  });

  it('applies deletions from either side', () => {
    const local = clone(base);
    const remote = clone(base);
    removeRecord(remote, people.id, p3!.id);
    const { merged } = mergeDocuments(base, local, remote);
    expect(getRecord(merged, people.id, p3!.id)).toBeUndefined();
  });

  it('resolves conflicting edits by the newer edit and reports them', () => {
    const local = clone(base);
    const remote = clone(base);
    edit(local, p1!, { [nameField]: 'Older' }, '2026-04-01T10:00:00.000Z');
    edit(remote, p1!, { [nameField]: 'Newer' }, '2026-04-01T12:00:00.000Z');
    const { merged, conflicts } = mergeDocuments(base, local, remote);
    expect(getRecord(merged, people.id, p1!.id)?.values[nameField]).toBe('Newer');
    expect(conflicts).toEqual([
      expect.objectContaining({ collection: 'records', id: p1!.id, resolution: 'kept-remote' }),
    ]);
  });

  it('keeps an edit over a deletion', () => {
    const local = clone(base);
    const remote = clone(base);
    edit(local, p2!, { [nameField]: 'Still here' }, '2026-04-01T10:00:00.000Z');
    removeRecord(remote, people.id, p2!.id);
    const { merged, conflicts } = mergeDocuments(base, local, remote);
    expect(getRecord(merged, people.id, p2!.id)?.values[nameField]).toBe('Still here');
    expect(conflicts[0]?.resolution).toBe('kept-edit-over-delete');
  });

  it('merges links as a set: additions and removals from both sides', () => {
    const withLink = clone(base);
    const existing = friendship(p1!.id, p2!.id, '2026-03-01T00:00:00.000Z');
    const added = friendship(p2!.id, p3!.id, '2026-04-01T00:00:00.000Z');
    removeLink(withLink, linkKey(added));
    addLink(withLink, existing);
    const local = clone(withLink);
    const remote = clone(withLink);
    addLink(local, added);
    removeLink(remote, linkKey(existing));

    const { merged } = mergeDocuments(withLink, local, remote);
    expect(keysOf(merged, added)).toEqual([linkKey(added)]);
    expect(keysOf(merged, existing)).toEqual([]);
    // Links neither side touched are untouched.
    expect(countLinks(merged)).toBe(countLinks(withLink));
  });

  it('drops values, view columns and links that point at things the other side deleted', () => {
    const local = clone(base);
    const remote = clone(base);
    const relationship = Object.values(base.fields).find(
      (f) => f.collectionId === people.id && f.name === 'Email',
    )!;
    Reflect.deleteProperty(remote.fields, relationship.id);
    edit(local, p1!, { [relationship.id]: 'new@example.com' }, '2026-04-01T10:00:00.000Z');
    const link = friendship(p1!.id, p3!.id, '2026-04-01T00:00:00.000Z');
    addLink(local, link);
    removeRecord(remote, people.id, p3!.id);

    const { merged } = mergeDocuments(base, local, remote);
    expect(merged.fields[relationship.id]).toBeUndefined();
    expect(getRecord(merged, people.id, p1!.id)?.values).not.toHaveProperty(relationship.id);
    for (const view of Object.values(merged.views))
      expect(view.fields.map((f) => f.fieldId)).not.toContain(relationship.id);
    expect([...iterateLinks(merged)].some(([key]) => key.includes(p3!.id))).toBe(false);
  });
});

describe('mergeDocuments (without a base)', () => {
  it('keeps records from both sides unless the other side deleted them later', () => {
    const local = clone(base);
    const remote = clone(base);
    removeRecord(remote, people.id, p1!.id);
    remote.tombstones.push({ id: p1!.id, deletedAt: '2027-01-01T00:00:00.000Z' });
    removeRecord(local, people.id, p2!.id); // no tombstone: just missing locally

    const { merged } = mergeDocuments(null, local, remote);
    expect(getRecord(merged, people.id, p1!.id)).toBeUndefined();
    expect(getRecord(merged, people.id, p2!.id)).toBeDefined();
  });
});

describe('mergeDocuments: per-field merging', () => {
  const email = Object.values(base.fields).find(
    (f) => f.collectionId === people.id && f.type === 'email',
  )!;
  const relationship = Object.values(base.fields).find(
    (f) => f.collectionId === people.id && f.type === 'multiSelect',
  )!;

  it('keeps edits to different fields of the same record from both devices', () => {
    const local = clone(base);
    const remote = clone(base);
    edit(local, p1!, { [nameField]: 'New name' }, '2026-04-01T10:00:00.000Z');
    edit(remote, p1!, { [email.id]: 'new@example.com' }, '2026-04-01T11:00:00.000Z');
    const { merged, conflicts } = mergeDocuments(base, local, remote);
    const r = getRecord(merged, people.id, p1!.id)!;
    expect(r.values[nameField]).toBe('New name');
    expect(r.values[email.id]).toBe('new@example.com');
    expect(r.updatedAt).toBe('2026-04-01T11:00:00.000Z');
    expect(conflicts).toEqual([]);
  });

  it('reports a field edited differently on both, keeping the newer edit', () => {
    const local = clone(base);
    const remote = clone(base);
    edit(
      local,
      p1!,
      { [nameField]: 'Mine', [email.id]: 'a@example.com' },
      '2026-04-01T12:00:00.000Z',
    );
    edit(remote, p1!, { [nameField]: 'Theirs' }, '2026-04-01T11:00:00.000Z');
    const { merged, conflicts } = mergeDocuments(base, local, remote);
    expect(getRecord(merged, people.id, p1!.id)!.values[nameField]).toBe('Mine');
    expect(conflicts).toMatchObject([
      { resolution: 'kept-local', collectionId: people.id, details: ['Name'] },
    ]);
  });

  it('merges select options added, renamed and recolored on different devices', () => {
    const local = clone(base);
    const remote = clone(base);
    if (relationship.type !== 'multiSelect') throw new Error('expected a multi select');
    const [first, second] = relationship.config.options;
    local.fields[relationship.id] = {
      ...relationship,
      config: {
        options: [
          ...relationship.config.options.map((o) =>
            o.id === first!.id ? { ...o, name: 'Kin' } : o,
          ),
          { id: 'opt_localnew', name: 'Club', color: 'teal', order: 99 },
        ],
      },
      updatedAt: '2026-04-01T10:00:00.000Z',
    };
    remote.fields[relationship.id] = {
      ...relationship,
      config: {
        options: [
          ...relationship.config.options.map((o) =>
            o.id === second!.id ? { ...o, color: 'red' as const } : o,
          ),
          { id: 'opt_remotenew', name: 'Team', color: 'blue', order: 99 },
        ],
      },
      updatedAt: '2026-04-01T11:00:00.000Z',
    };
    const { merged, conflicts } = mergeDocuments(base, local, remote);
    const field = merged.fields[relationship.id];
    if (field?.type !== 'multiSelect') throw new Error('expected a multi select');
    const options = field.config.options;
    expect(options.find((o) => o.id === first!.id)?.name).toBe('Kin');
    expect(options.find((o) => o.id === second!.id)?.color).toBe('red');
    expect(options.map((o) => o.id)).toEqual(
      expect.arrayContaining(['opt_localnew', 'opt_remotenew']),
    );
    expect(options.map((o) => o.order)).toEqual(options.map((_, i) => i));
    expect(conflicts).toEqual([]);
    const parsed = parseDocument(serializeModel(merged));
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
    expect(parsed.integrityIssues).toEqual([]);
  });
});

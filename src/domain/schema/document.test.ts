import { describe, expect, it } from 'vitest';
import { serializeModel } from '@/persistence/codec/serialize';
import { generateDemoDocument } from '../demo/generate';
import { countLinks, countRecords } from '../model';
import { parseDocument } from './document';
import { runMigrations, MigrationError, type Migration } from './migrations';
import { createEmptyDocument } from './defaults';
import { CURRENT_SCHEMA_VERSION } from './version';

const fixtures = import.meta.glob<string>('./fixtures/v*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const fixture = (version: number): string => {
  const text = fixtures[`./fixtures/v${version}.json`];
  if (text === undefined) throw new Error(`Missing fixture for schema v${version}`);
  return text;
};

describe('parseDocument', () => {
  it('loads every fixture, migrating older ones to the current version', () => {
    for (let v = 1; v <= CURRENT_SCHEMA_VERSION; v++) {
      const result = parseDocument(fixture(v));
      if (!result.ok) throw new Error(`v${v}: ${JSON.stringify(result.error)}`);
      expect(result.originalVersion).toBe(v);
      expect(result.migrated).toHaveLength(CURRENT_SCHEMA_VERSION - v);
      expect(result.model.meta.fileId).toMatch(/^fil_/);
      expect(result.integrityIssues).toEqual([]);
    }
  });

  it('round-trips the current fixture byte-for-byte', () => {
    const text = fixture(CURRENT_SCHEMA_VERSION);
    const result = parseDocument(text);
    if (!result.ok) throw new Error('fixture failed to load');
    expect(serializeModel(result.model)).toBe(text);
  });

  it('returns results that can cross the worker boundary (structured clone)', () => {
    for (let v = 1; v <= CURRENT_SCHEMA_VERSION; v++) {
      expect(() => structuredClone(parseDocument(fixture(v)))).not.toThrow();
    }
  });

  it('round-trips a new empty document', () => {
    const doc = createEmptyDocument({ appVersion: 'test' });
    const result = parseDocument(serializeModel(doc));
    expect(result.ok).toBe(true);
  });

  it('rejects files from a newer app version', () => {
    const text = JSON.stringify({ format: 'ostraca', schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
    expect(parseDocument(text)).toEqual({
      ok: false,
      error: {
        kind: 'newer-version',
        fileVersion: CURRENT_SCHEMA_VERSION + 1,
        supportedVersion: CURRENT_SCHEMA_VERSION,
      },
    });
  });

  it('recognizes non-Ostraca, invalid and encrypted files', () => {
    expect(parseDocument('{nope')).toMatchObject({ ok: false, error: { kind: 'invalid-json' } });
    expect(parseDocument('[1,2]')).toMatchObject({ ok: false, error: { kind: 'not-ostraca' } });
    expect(parseDocument('{"format":"other"}')).toMatchObject({
      ok: false,
      error: { kind: 'not-ostraca' },
    });
    expect(parseDocument('{"format":"ostraca-encrypted"}')).toMatchObject({
      ok: false,
      error: { kind: 'encrypted' },
    });
    expect(parseDocument('{"format":"ostracon-encrypted"}')).toMatchObject({
      ok: false,
      error: { kind: 'encrypted' },
    });
  });

  it('accepts the pre-rename "ostracon" format only on files from before the rename', () => {
    const current = JSON.parse(fixture(CURRENT_SCHEMA_VERSION)) as { format: string };
    expect(current.format).toBe('ostraca');
    const old = parseDocument(fixture(3));
    expect(old.ok && serializeModel(old.model)).toContain('"format": "ostraca"');
    current.format = 'ostracon';
    expect(parseDocument(JSON.stringify(current))).toMatchObject({
      ok: false,
      error: { kind: 'invalid-schema' },
    });
  });

  it('reports schema violations such as a record without a collection id', () => {
    const file = JSON.parse(fixture(CURRENT_SCHEMA_VERSION)) as {
      records: { collectionId?: string }[];
    };
    const record = file.records[0];
    if (!record) throw new Error('fixture has no records');
    delete record.collectionId;
    const result = parseDocument(JSON.stringify(file));
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid-schema' } });
  });

  it('reports dangling references as integrity issues without refusing the file', () => {
    const file = JSON.parse(fixture(CURRENT_SCHEMA_VERSION)) as {
      records: { values: Record<string, unknown> }[];
    };
    const record = file.records[0];
    if (!record) throw new Error('fixture has no records');
    record.values.fld_missing00000 = 'orphan';
    const result = parseDocument(JSON.stringify(file));
    expect(result.ok && result.integrityIssues).toEqual([
      expect.objectContaining({ message: 'Value for unknown field fld_missing00000' }),
    ]);
  });
});

describe('integrity checks', () => {
  type RawFile = {
    fields: { id: string; name: string; type: string; config?: Record<string, unknown> }[];
    records: { collectionId: string; values: Record<string, unknown> }[];
    links: [string, string, string, string][];
    views: { fields: { fieldId: string }[] }[];
  };
  const load = (edit: (file: RawFile) => void) => {
    const file = JSON.parse(fixture(CURRENT_SCHEMA_VERSION)) as RawFile;
    edit(file);
    const result = parseDocument(JSON.stringify(file));
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.integrityIssues.map((i) => i.message);
  };

  it('reports values that do not fit their field', () => {
    const issues = load((file) => {
      const rating = file.fields.find((f) => f.type === 'rating')!;
      const record = file.records.find((r) => rating.id in r.values)!;
      record.values[rating.id] = 99;
    });
    expect(issues).toEqual([expect.stringMatching(/^Invalid value for Rating/)]);
  });

  it('reports broken link pairs and links to missing records', () => {
    expect(
      load((file) => {
        const link = file.fields.find((f) => f.type === 'link' && f.name === 'Owner')!;
        link.config!.inverseFieldId = link.id;
      }),
    ).toContain('Link field is not paired correctly');
    expect(
      load((file) => {
        file.links[0]![2] = 'rec_missing00000';
      }),
    ).toContain('Link points at a missing record');
  });

  it('reports single-valued links with more than one record', () => {
    const issues = load((file) => {
      const restaurant = file.fields.find((f) => f.name === 'Restaurant')!;
      const canonical =
        restaurant.id < (restaurant.config!.inverseFieldId as string)
          ? restaurant.id
          : (restaurant.config!.inverseFieldId as string);
      const visitLinks = file.links.filter((l) => l[0] === canonical);
      const [a, b] = visitLinks;
      // Give the first visit a second restaurant (the visit is on the canonical side or not).
      const restaurantIsFrom = canonical === restaurant.id;
      file.links.push(
        restaurantIsFrom ? [canonical, a![1], b![2], a![3]] : [canonical, b![1], a![2], a![3]],
      );
    });
    expect(issues.some((m) => m.includes('links to more than one record'))).toBe(true);
  });

  it('reports views that refer to fields of another collection', () => {
    const issues = load((file) => {
      file.views[0]!.fields.push({ fieldId: file.fields.at(-1)!.id });
    });
    expect(issues).toContain('View refers to fields it can’t use');
  });
});

describe('runMigrations', () => {
  const v0to1: Migration = {
    from: 0,
    to: 1,
    description: 'Rename recs → records',
    migrate: ({ recs, ...rest }) => ({ ...rest, records: recs }),
  };

  it('applies migrations step by step and stamps the version', () => {
    const { doc, applied } = runMigrations({ schemaVersion: 0, recs: [1] }, 0, 1, [v0to1]);
    expect(doc).toEqual({ schemaVersion: 1, records: [1] });
    expect(applied).toEqual([v0to1]);
  });

  it('never mutates the input', () => {
    const input = { schemaVersion: 0, recs: [{ a: 1 }] };
    const mutating: Migration = {
      ...v0to1,
      migrate: (d) => {
        (d.recs as { a: number }[])[0]!.a = 2;
        return d;
      },
    };
    runMigrations(input, 0, 1, [mutating]);
    expect(input.recs[0]!.a).toBe(1);
  });

  it('fails clearly when a step is missing', () => {
    expect(() => runMigrations({}, 0, 2, [v0to1])).toThrow(MigrationError);
  });
});

describe('generateDemoDocument', () => {
  it('is deterministic and produces valid, consistent data', () => {
    const opts = { endDate: '2026-06-30', records: 30, appVersion: 'test', seed: 3 };
    const a = serializeModel(generateDemoDocument(opts));
    expect(serializeModel(generateDemoDocument(opts))).toBe(a);
    const result = parseDocument(a);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.integrityIssues).toEqual([]);
    // 30 people, 30 restaurants, 90 visits, 30 books, 8 trips, 15 devices.
    expect(countRecords(result.model)).toBe(203);
    expect(countLinks(result.model)).toBeGreaterThan(100);
  });
});

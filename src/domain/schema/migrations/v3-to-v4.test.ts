import { describe, expect, it } from 'vitest';
import { v3ToV4 } from './v3-to-v4';

describe('v3 → v4', () => {
  it('renames the file format and keeps everything else', () => {
    const doc = { format: 'ostracon', schemaVersion: 3, records: [{ id: 'rec_a' }] };
    expect(v3ToV4.migrate(doc)).toEqual({
      format: 'ostraca',
      schemaVersion: 3,
      records: [{ id: 'rec_a' }],
    });
  });
});

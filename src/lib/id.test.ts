import { describe, expect, it } from 'vitest';
import { idKind, newId } from './id';

describe('newId', () => {
  it('creates prefixed, unique ids', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newId('record')));
    expect(ids.size).toBe(10_000);
    for (const id of ids) expect(id).toMatch(/^rec_[0-9A-Za-z]{12}$/);
  });

  it('recovers the kind from an id', () => {
    expect(idKind(newId('collection'))).toBe('collection');
    expect(idKind('nope_123')).toBeUndefined();
  });
});

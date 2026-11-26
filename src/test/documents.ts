import { generateDemoDocument } from '@/domain/demo/generate';
import type { DocModel } from '@/domain/model';

/** A small, deterministic document with a few collections of records. */
export function testDocument(records = 5): DocModel {
  return generateDemoDocument({ endDate: '2026-06-30', records, appVersion: 'test', seed: 1 });
}

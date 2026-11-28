/**
 * Writes a synthetic demo data file.
 *   pnpm gen:demo --records 24 --seed 42 --end 2026-11-26 --out demo.ostraca.json
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { generateDemoDocument } from '../src/domain/demo/generate';
import { countRecords } from '../src/domain/model';
import { parseDocument } from '../src/domain/schema/document';
import { serializeModel } from '../src/persistence/codec/serialize';
import { today } from '../src/lib/date';

const { values } = parseArgs({
  options: {
    records: { type: 'string', default: '24' },
    seed: { type: 'string', default: '42' },
    end: { type: 'string', default: today() },
    out: { type: 'string', default: 'demo.ostraca.json' },
    'app-version': { type: 'string', default: 'demo' },
  },
});

const doc = generateDemoDocument({
  endDate: values.end,
  records: Number(values.records),
  seed: Number(values.seed),
  appVersion: values['app-version'],
});
// Round-trip through the loader so the output is validated and in canonical key order.
const loaded = parseDocument(serializeModel(doc));
if (!loaded.ok) throw new Error(`Generated invalid data: ${JSON.stringify(loaded.error)}`);
const text = serializeModel(loaded.model);
writeFileSync(values.out, text);
console.log(
  `Wrote ${values.out}: ${countRecords(doc)} records, ${(text.length / 1024).toFixed(0)} KiB`,
);

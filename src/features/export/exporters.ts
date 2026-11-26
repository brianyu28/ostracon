/**
 * Exports: the current view as CSV (visible fields, filtered and sorted), a collection's records
 * as readable JSON (field names as keys), a collection as an Ostracon file (re-importable), or
 * the whole document as plain JSON. Exports are never encrypted; when the file is, a toast says
 * so.
 */
import { FORMULA_ERROR, formulaValue } from '@/domain/computed';
import { fieldType } from '@/domain/fields/registry';
import { RAW_FORMAT } from '@/domain/fields/model';
import { getRecord, iterateRecords } from '@/domain/model';
import { recordTitle } from '@/domain/records';
import type { Collection, Field, Id, RecordEntity, View } from '@/domain/schema/types';
import { collectionFields } from '@/domain/views/repair';
import { viewColumns } from '@/features/table/columns';
import { linkReader, formulaReader } from '@/features/table/linked';
import { clipboardText } from '@/features/table/selection';
import { toCsv } from '@/lib/csv';
import { extractCollections } from '@/domain/transfer';
import { today } from '@/lib/date';
import { newId } from '@/lib/id';
import { serializeModel } from '@/persistence/codec/serialize';
import { docStore } from '@/store/docStore';
import { sessionStore } from '@/store/sessionStore';
import { toast } from '@/store/toastStore';

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]+/g, '-');
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function warnIfEncrypted(): void {
  if (sessionStore.getState().encryption)
    toast('Exports aren’t encrypted, even though your file is. Keep them somewhere safe.', {
      kind: 'info',
    });
}

/** The view's visible fields and records as CSV text (clipboard text per value). */
export function viewCsv(
  collection: Collection,
  view: View,
  records: readonly RecordEntity[],
): string {
  const { doc, index, indexVersion } = docStore.getState();
  if (!doc) return '';
  const columns = viewColumns(view, doc.fields, collection).map((c) => c.field);
  const links = linkReader(doc, index, indexVersion);
  const formulas = formulaReader(doc, index, indexVersion, today(), RAW_FORMAT);
  return toCsv([
    columns.map((f) => f.name),
    ...records.map((r) => columns.map((f) => clipboardText(r, f, links, formulas))),
  ]);
}

export function exportViewCsv(
  collection: Collection,
  view: View,
  records: readonly RecordEntity[],
): void {
  download(`${collection.name} - ${view.name}.csv`, viewCsv(collection, view, records), 'text/csv');
  warnIfEncrypted();
}

/** A value as plain JSON: option names, linked titles, formula results, ISO dates. */
function plainValue(record: RecordEntity, field: Field): unknown {
  const { doc, index } = docStore.getState();
  if (!doc) return null;
  if (field.type === 'link')
    return (index?.linked(field, record.id) ?? [])
      .map((id) => getRecord(doc, field.config.targetCollectionId, id))
      .filter((r) => r !== undefined)
      .map((r) => recordTitle(doc, r));
  if (field.type === 'formula') {
    const v = formulaValue(doc, field, record, { today: today() });
    return v === FORMULA_ERROR ? null : v;
  }
  if (field.type === 'createdTime') return record.createdAt;
  if (field.type === 'modifiedTime') return record.updatedAt;
  const v = record.values[field.id];
  if (v === undefined) return null;
  if (field.type === 'singleSelect' || field.type === 'multiSelect') {
    const names = fieldType(field).format(v, field, RAW_FORMAT, 'raw');
    return field.type === 'multiSelect'
      ? (v as string[]).map((id) => field.config.options.find((o) => o.id === id)?.name ?? '')
      : names;
  }
  return v;
}

/** A collection's records as readable JSON (keys are field names). */
export function collectionJson(collection: Collection): string {
  const doc = docStore.getState().doc;
  if (!doc) return '[]';
  const fields = collectionFields(doc.fields, collection.id);
  const records = [...iterateRecords(doc, collection.id)].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : 1,
  );
  return JSON.stringify(
    records.map((r) => {
      const out: Record<string, unknown> = { id: r.id };
      for (const f of fields) out[f.name] = plainValue(r, f);
      out.createdAt = r.createdAt;
      out.updatedAt = r.updatedAt;
      return out;
    }),
    null,
    2,
  );
}

export function exportCollectionJson(collection: Collection): void {
  download(`${collection.name}.json`, collectionJson(collection), 'application/json');
  warnIfEncrypted();
}

/**
 * A collection as an Ostracon file of its own, optionally with collections it links to (links
 * to collections left out are dropped). Re-importable into any document, also after a schema
 * change (it migrates like any file), and openable on its own. A new file id keeps it from being
 * mistaken for the document it came from.
 */
export function exportCollectionFile(collection: Collection, include: readonly Id[] = []): void {
  const doc = docStore.getState().doc;
  if (!doc) return;
  const part = extractCollections(doc, [collection.id, ...include]);
  part.meta = {
    ...doc.meta,
    fileId: newId('file'),
    revision: 0,
    createdAt: new Date().toISOString(),
    savedAt: null,
    savedBy: null,
  };
  download(`${collection.name}.ostracon.json`, serializeModel(part), 'application/json');
  warnIfEncrypted();
}

/** The whole document as a plain (unencrypted) Ostracon file. */
export function exportDocumentJson(): void {
  const doc = docStore.getState().doc;
  if (!doc) return;
  const name =
    sessionStore.getState().source?.name.replace(/\.ostracon\.json$|\.json$/, '') ?? 'Ostracon';
  download(`${name} (plain).ostracon.json`, serializeModel(doc), 'application/json');
  warnIfEncrypted();
}

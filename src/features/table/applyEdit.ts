import type { ParseContext } from '@/domain/fields/model';
import type { Field, Id } from '@/domain/schema/types';
import { pluralize } from '@/lib/format';
import { tryDispatch, tryRun } from '@/store/actions';
import { docStore } from '@/store/docStore';
import { getRecord } from '@/domain/model';
import { toast } from '@/store/toastStore';
import type { EditorChange } from './editors/types';

/** Saves an editor's change to one record's field (skipping changes that change nothing). */
export function applyEdit(
  collectionId: Id,
  recordId: Id,
  field: Field,
  change: EditorChange,
  parse: ParseContext,
): void {
  if (change.kind === 'links') {
    tryRun('setRecordValues', { collectionId, id: recordId, values: { [field.id]: change.ids } });
    return;
  }
  if (change.kind === 'createLinked') {
    tryRun('createLinkedRecord', {
      fieldId: field.id,
      recordId,
      title: change.title,
      targetIds: change.ids,
    });
    return;
  }
  if (change.kind === 'text') {
    const result = tryDispatch('setFromText', {
      collectionId,
      rows: [{ id: recordId, texts: { [field.id]: change.text } }],
      parse,
    });
    if (result?.invalid) toast(`That isn’t a valid value for “${field.name}”.`, { kind: 'error' });
    return;
  }
  const doc = docStore.getState().doc;
  const current = doc ? getRecord(doc, collectionId, recordId)?.values[field.id] : undefined;
  const next = change.value === '' ? undefined : change.value;
  if (JSON.stringify(current) === JSON.stringify(next)) return;
  tryRun('setRecordValues', { collectionId, id: recordId, values: { [field.id]: next } });
}

/** "Pasted 12 cells", with what was skipped or added. */
export function pasteMessage(
  cells: number,
  added: number,
  invalid: number,
  skipped: number,
): string {
  const parts = [`Pasted ${pluralize(cells, 'cell')}`];
  if (added) parts.push(`added ${pluralize(added, 'record')}`);
  if (invalid) parts.push(`${pluralize(invalid, 'value')} couldn’t be read`);
  if (skipped)
    parts.push(`${pluralize(skipped, 'cell')} can’t be pasted into links or calculated fields`);
  return parts.join(' · ');
}

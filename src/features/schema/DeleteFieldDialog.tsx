import { ConfirmDialog } from '@/components/ConfirmDialog/ConfirmDialog';
import { compileField } from '@/domain/formulas/compile';
import { iterateRecords } from '@/domain/model';
import type { Id } from '@/domain/schema/types';
import { pluralize } from '@/lib/format';
import { toastWithUndo, tryRun } from '@/store/actions';
import { useDocStore } from '@/store/docStore';

interface DeleteFieldDialogProps {
  fieldId: Id | null;
  onClose: () => void;
  onDeleted?: () => void;
}

/** Confirms deleting a field, saying what goes with it (values, or a link's paired field). */
export function DeleteFieldDialog({ fieldId, onClose, onDeleted }: DeleteFieldDialogProps) {
  const doc = useDocStore((s) => s.doc);
  const field = fieldId ? doc?.fields[fieldId] : undefined;
  if (!doc || !field) return null;
  let consequence: string;
  if (field.type === 'link') {
    const inverseId = field.config.inverseFieldId;
    const inverse = inverseId === undefined ? undefined : doc.fields[inverseId];
    const other = inverse ? doc.collections[inverse.collectionId] : undefined;
    consequence =
      inverse && inverse.id !== field.id
        ? `Its links are removed, and so is the paired field “${inverse.name}” in ${other?.name ?? 'the other collection'}.`
        : 'Its links are removed.';
  } else {
    let count = 0;
    for (const r of iterateRecords(doc, field.collectionId)) if (field.id in r.values) count++;
    consequence = count
      ? `Its values in ${pluralize(count, 'record')} are removed.`
      : 'No records have a value in it.';
  }
  // Formulas that read this field stop working (they show #ERR until edited).
  const users = Object.values(doc.fields).filter((f) => {
    if (f.type !== 'formula' || f.id === field.id) return false;
    const compiled = compileField(doc.fields, f);
    return compiled.ok && compiled.info.deps.has(field.id);
  });
  if (users.length)
    consequence += ` ${users.map((f) => `“${f.name}”`).join(', ')} ${users.length > 1 ? 'use' : 'uses'} it and will show an error.`;
  return (
    <ConfirmDialog
      opened
      title={`Delete “${field.name}”?`}
      confirmLabel="Delete field"
      danger
      onClose={onClose}
      onConfirm={() => {
        if (tryRun('deleteField', { id: field.id })) {
          toastWithUndo(`Deleted field “${field.name}”`);
          onDeleted?.();
        }
      }}
    >
      {consequence} You can undo this.
    </ConfirmDialog>
  );
}

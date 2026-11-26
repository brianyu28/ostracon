import type { FieldType } from '@/domain/schema/types';

const NO_EDITOR: ReadonlySet<FieldType> = new Set([
  'checkbox',
  'formula',
  'createdTime',
  'modifiedTime',
]);

/** Whether a field has an editor (stored values other than checkboxes). */
export function hasEditor(type: FieldType): boolean {
  return !NO_EDITOR.has(type);
}

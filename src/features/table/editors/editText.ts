import { RAW_FORMAT } from '@/domain/fields/model';
import { fieldType } from '@/domain/fields/registry';
import type { EditorProps } from './types';

/** The text a value is edited as: canonical text that parsing reads back. */
export function editText(props: Pick<EditorProps, 'field' | 'value' | 'initial'>): string {
  const { field, value, initial } = props;
  if (initial !== undefined) return initial;
  return value === undefined ? '' : fieldType(field).format(value, field, RAW_FORMAT, 'raw');
}

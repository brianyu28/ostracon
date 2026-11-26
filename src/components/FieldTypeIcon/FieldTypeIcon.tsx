import type { IconProps } from '@tabler/icons-react';
import type { FieldType } from '@/domain/schema/types';
import { FIELD_TYPE_ICONS } from './fieldTypeIcons';

/** The icon of a field type (in field lists, column headers and the type menu). */
export function FieldTypeIcon({ type, ...props }: IconProps & { type: FieldType }) {
  const Component = FIELD_TYPE_ICONS[type];
  return <Component size={14} stroke={1.75} aria-hidden {...props} />;
}

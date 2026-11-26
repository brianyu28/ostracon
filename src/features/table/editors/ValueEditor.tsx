import type { FieldOf } from '@/domain/schema/types';
import { DateEditor } from './DateEditor';
import { LocationEditor } from './LocationEditor';
import { RichTextEditor } from './RichTextEditor';
import { SelectEditor } from './SelectEditor';
import { TextEditor } from './TextEditor';
import type { EditorProps } from './types';

/** The editor for a field's type. Checkboxes, links and calculated fields have none. */
export function ValueEditor(props: EditorProps) {
  const { field } = props;
  switch (field.type) {
    case 'date':
    case 'dateTime':
    case 'dateRange':
      return <DateEditor {...props} />;
    case 'singleSelect':
    case 'multiSelect':
      return (
        <SelectEditor
          {...(props as EditorProps<FieldOf<'singleSelect'> | FieldOf<'multiSelect'>>)}
        />
      );
    case 'location':
      return <LocationEditor {...(props as EditorProps<FieldOf<'location'>>)} />;
    case 'richText':
      return <RichTextEditor {...props} />;
    case 'checkbox':
    case 'link':
    case 'formula':
    case 'createdTime':
    case 'modifiedTime':
      return null;
    default:
      return <TextEditor {...props} />;
  }
}

/** Whether a field has an editor (stored values other than checkboxes). */

import type { FormatContext, ParseContext } from '@/domain/fields/model';
import type { Field, FileSettings, Value } from '@/domain/schema/types';

/** What an editor produces: a value, or text to parse (which may create select options). */
export type EditorChange = { kind: 'value'; value: unknown } | { kind: 'text'; text: string };

/** Where the cell cursor goes after committing (null: stays). */
export type EditorExit = 'down' | 'up' | 'right' | 'left' | null;

export interface EditorProps<F extends Field = Field> {
  field: F;
  value: Value | undefined;
  /** Text typed to start editing; replaces the value. */
  initial?: string;
  /** In the table, editors overlay the cell; in the record panel they sit in the page. */
  variant: 'cell' | 'panel';
  format: FormatContext;
  parse: ParseContext;
  settings: FileSettings;
  onCommit: (change: EditorChange | null, exit: EditorExit) => void;
  onCancel: () => void;
  /** Save a pending change when the editor closes without Enter or Esc (default true). */
  saveOnClose?: boolean;
}

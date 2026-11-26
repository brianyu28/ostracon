import type { FormatContext, ParseContext } from '@/domain/fields/model';
import type { Field, FileSettings, Id, Value } from '@/domain/schema/types';

/**
 * What an editor produces: a value, text to parse (which may create select options), linked
 * record ids, or a new linked record to create (with the other picks).
 */
export type EditorChange =
  | { kind: 'value'; value: unknown }
  | { kind: 'text'; text: string }
  | { kind: 'links'; ids: Id[] }
  | { kind: 'createLinked'; title: string; ids: Id[] };

/** Where the cell cursor goes after committing (null: stays). */
export type EditorExit = 'down' | 'up' | 'right' | 'left' | null;

export interface EditorProps<F extends Field = Field> {
  field: F;
  /** The value; for link fields, the linked record ids. */
  value: Value | undefined;
  /** The record being edited (absent when setting many records at once). */
  recordId?: Id;
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

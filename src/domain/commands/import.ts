/** Importing rows of text (CSV) into a collection: one undo step. */
import { fieldType } from '../fields/registry';
import type { ParseContext } from '../fields/model';
import { iterateRecords } from '../model';
import { recordTitle } from '../records';
import type { FieldType, Id } from '../schema/types';
import { createCollection } from './collections';
import { CommandError, defineCommand, required } from './define';
import { createField } from './fields';
import { createRecord, setFromText, type TextResult } from './records';

export interface ImportColumn {
  /** An existing field, a new field, or nothing (the column is skipped). */
  target:
    | { kind: 'field'; fieldId: Id }
    | { kind: 'new'; name: string; type: FieldType; config?: Record<string, unknown> | undefined }
    | { kind: 'primary'; name?: string | undefined }
    | { kind: 'skip' };
}

export interface ImportInput {
  /** Import into this collection, or create one with this name. */
  collectionId?: Id;
  newCollection?: { name: string; icon?: string | undefined };
  columns: readonly ImportColumn[];
  rows: readonly (readonly string[])[];
  /** For link columns: create records for titles that match nothing. */
  createMissingLinks: boolean;
  parse: ParseContext;
}

export interface ImportResult extends TextResult {
  collectionId: Id;
  /** Linked records created for unmatched titles. */
  linkedCreated: number;
}

export const importRecords = defineCommand<ImportInput, ImportResult>({
  label: 'Import records',
  run(draft, input, ctx) {
    let collectionId = input.collectionId;
    if (!collectionId) {
      if (!input.newCollection?.name.trim()) throw new CommandError('Name the new collection.');
      collectionId = createCollection.run(
        draft,
        {
          name: input.newCollection.name,
          ...(input.newCollection.icon ? { icon: input.newCollection.icon } : {}),
        },
        ctx,
      );
    }
    const collection = required(draft.collections[collectionId], 'Collection');
    const fieldIds: (Id | null)[] = input.columns.map((column) => {
      switch (column.target.kind) {
        case 'skip':
          return null;
        case 'field':
          return column.target.fieldId;
        case 'primary': {
          const primary = required(draft.fields[collection.primaryFieldId], 'Field');
          if (column.target.name?.trim()) primary.name = column.target.name.trim();
          return primary.id;
        }
        case 'new':
          return createField.run(
            draft,
            {
              collectionId,
              name: column.target.name,
              type: column.target.type,
              ...(column.target.config ? { config: column.target.config } : {}),
            },
            ctx,
          );
      }
    });

    // Link columns: titles matching nothing become new records in the target, if asked.
    let linkedCreated = 0;
    if (input.createMissingLinks) {
      fieldIds.forEach((fieldId, col) => {
        const field = fieldId ? draft.fields[fieldId] : undefined;
        if (field?.type !== 'link') return;
        const target = field.config.targetCollectionId;
        const known = new Set(
          [...iterateRecords(draft, target)].map((r) => recordTitle(draft, r).toLowerCase()),
        );
        const primary = draft.collections[target]?.primaryFieldId;
        for (const row of input.rows) {
          const text = row[col]?.trim() ?? '';
          if (!text || known.has(text.toLowerCase())) continue;
          const names = field.config.multiple
            ? text
                .split(/[,;\n]/)
                .map((n) => n.trim())
                .filter(Boolean)
            : [text];
          for (const name of names) {
            if (known.has(name.toLowerCase())) continue;
            known.add(name.toLowerCase());
            if (primary && fieldType(draft.fields[primary]?.type ?? 'text').stored)
              createRecord.run(draft, { collectionId: target, values: { [primary]: name } }, ctx);
            linkedCreated++;
          }
        }
      });
    }

    const rows = input.rows.map((row) => {
      const texts: Record<Id, string> = {};
      fieldIds.forEach((fieldId, col) => {
        if (fieldId && row[col] !== undefined) texts[fieldId] = row[col];
      });
      return { texts };
    });
    const result = setFromText.run(draft, { collectionId, rows, parse: input.parse }, ctx);
    return { ...result, collectionId, linkedCreated };
  },
});

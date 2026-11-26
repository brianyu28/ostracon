import { CollectionSettingsDialog } from './CollectionSettingsDialog';
import { FieldEditorDialog } from './FieldEditor';
import { NewCollectionDialog } from './NewCollectionDialog';
import { ExportCollectionDialog } from '@/features/export/ExportCollectionDialog';
import { ImportDialog } from '@/features/import/ImportDialog';

/** The schema dialogs, mounted once in the app and opened through `ui` (uiStore). */
export function SchemaDialogs() {
  return (
    <>
      <NewCollectionDialog />
      <CollectionSettingsDialog />
      <FieldEditorDialog />
      <ImportDialog />
      <ExportCollectionDialog />
    </>
  );
}

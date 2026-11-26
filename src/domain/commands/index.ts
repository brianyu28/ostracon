/** Registry of all document commands. Add new commands here to make them dispatchable. */
import {
  createCollection,
  deleteCollection,
  reorderCollections,
  updateCollection,
} from './collections';
import {
  addBacklink,
  changeFieldType,
  createField,
  createLinkField,
  deleteField,
  removeBacklink,
  reorderFields,
  setPrimaryField,
  updateField,
} from './fields';
import { addLinks, removeLinks, setLinks } from './links';
import {
  createLinkedRecord,
  createRecord,
  deleteRecords,
  duplicateRecords,
  editRecords,
  setFieldValue,
  setFromText,
  setRecordValues,
} from './records';
import { importRecords } from './import';
import { updateSettings } from './settings';
import { createFromTemplate } from './templates';
import {
  createView,
  deleteView,
  duplicateView,
  moveCard,
  reorderViews,
  setViewFields,
  updateView,
} from './views';

export const commands = {
  createCollection,
  updateCollection,
  reorderCollections,
  deleteCollection,
  createField,
  createLinkField,
  addBacklink,
  removeBacklink,
  updateField,
  changeFieldType,
  reorderFields,
  deleteField,
  setPrimaryField,
  createView,
  duplicateView,
  updateView,
  setViewFields,
  reorderViews,
  deleteView,
  moveCard,
  createRecord,
  createLinkedRecord,
  setRecordValues,
  setFieldValue,
  editRecords,
  setFromText,
  duplicateRecords,
  deleteRecords,
  setLinks,
  addLinks,
  removeLinks,
  updateSettings,
  createFromTemplate,
  importRecords,
};

export type Commands = typeof commands;
export type CommandName = keyof Commands;
export type CommandPayload<K extends CommandName> = Parameters<Commands[K]['run']>[1];
export type CommandResult<K extends CommandName> = ReturnType<Commands[K]['run']>;

export { CommandError, type CommandContext } from './define';
export type { CollectionChanges } from './collections';
export type { FieldChanges, NewField, NewLinkField } from './fields';
export type { NewRecord, TextResult, TextRow } from './records';
export type { ImportColumn, ImportInput, ImportResult } from './import';
export type { ViewChanges } from './views';

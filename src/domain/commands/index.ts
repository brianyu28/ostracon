/** Registry of all document commands. Add new commands here to make them dispatchable. */
import {
  createCollection,
  deleteCollection,
  reorderCollections,
  updateCollection,
} from './collections';
import { createRecord, deleteRecords, setRecordValues } from './records';
import { updateSettings } from './settings';

export const commands = {
  createCollection,
  updateCollection,
  reorderCollections,
  deleteCollection,
  createRecord,
  setRecordValues,
  deleteRecords,
  updateSettings,
};

export type Commands = typeof commands;
export type CommandName = keyof Commands;
export type CommandPayload<K extends CommandName> = Parameters<Commands[K]['run']>[1];
export type CommandResult<K extends CommandName> = ReturnType<Commands[K]['run']>;

export { CommandError, type CommandContext } from './define';
export type { CollectionChanges } from './collections';

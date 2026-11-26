/** Transient UI state shared across components (not persisted). */
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { Id } from '@/domain/schema/types';

export type CollectionSettingsTab = 'general' | 'fields';

/** The field editor: editing `fieldId`, or adding a field to `collectionId` when it's absent. */
export interface FieldEditorTarget {
  collectionId: Id;
  fieldId?: Id;
  /** For a new field: the view it is added from, and the field to place it after. */
  viewId?: Id;
  afterFieldId?: Id;
}

interface UiState {
  paletteOpen: boolean;
  helpOpen: boolean;
  /** Dropbox file dialog: choosing a file to open, or naming a file to save. */
  dropboxDialog: 'open' | 'save' | null;
  newCollectionOpen: boolean;
  collectionSettings: { collectionId: Id; tab: CollectionSettingsTab } | null;
  fieldEditor: FieldEditorTarget | null;
}

export const uiStore = createStore<UiState>()(() => ({
  paletteOpen: false,
  helpOpen: false,
  dropboxDialog: null,
  newCollectionOpen: false,
  collectionSettings: null,
  fieldEditor: null,
}));

export function useUi<T>(selector: (s: UiState) => T): T {
  return useStore(uiStore, selector);
}

export const ui = {
  openNewCollection: () => {
    uiStore.setState({ newCollectionOpen: true });
  },
  openCollectionSettings: (collectionId: Id, tab: CollectionSettingsTab = 'general') => {
    uiStore.setState({ collectionSettings: { collectionId, tab } });
  },
  openFieldEditor: (target: FieldEditorTarget) => {
    uiStore.setState({ fieldEditor: target });
  },
};

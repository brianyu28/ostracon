/** Factory for new, empty documents. */
import { newId } from '@/lib/id';
import type { DocModel } from '../model';
import type { FileSettings } from './types';

export const DEFAULT_SETTINGS: FileSettings = {
  locale: 'en-US',
  weekStartsOn: 0,
  defaultCurrency: 'USD',
};

export interface NewDocumentOptions {
  appVersion: string;
  now?: string;
}

export function createEmptyDocument(options: NewDocumentOptions): DocModel {
  const now = options.now ?? new Date().toISOString();
  return {
    meta: {
      fileId: newId('file'),
      revision: 0,
      createdAt: now,
      savedAt: null,
      savedBy: null,
      appVersion: options.appVersion,
    },
    settings: structuredClone(DEFAULT_SETTINGS),
    collections: {},
    fields: {},
    views: {},
    records: {},
    links: {},
    tombstones: [],
  };
}

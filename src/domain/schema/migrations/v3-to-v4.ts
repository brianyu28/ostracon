import type { Migration } from './index';

/** v4 renames the file format from "ostracon" to "ostraca", following the app's new name. */
export const v3ToV4: Migration = {
  from: 3,
  to: 4,
  description: 'Rename the file format to "ostraca"',
  migrate: (doc) => ({ ...doc, format: 'ostraca' }),
};

import type { Migration } from './index';

/** v2 adds the optional `wrap` view setting; v1 files are already valid v2. */
export const v1ToV2: Migration = {
  from: 1,
  to: 2,
  description: 'Add optional text wrapping to views',
  migrate: (doc) => doc,
};

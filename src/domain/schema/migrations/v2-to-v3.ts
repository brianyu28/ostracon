import type { JsonObject, Migration } from './index';

/**
 * v3 moves text wrapping from the view to each of its fields. A v2 view with `wrap: true`
 * wraps every field.
 */
export const v2ToV3: Migration = {
  from: 2,
  to: 3,
  description: 'Move text wrapping from views to view fields',
  migrate: (doc) => {
    const views = Array.isArray(doc.views) ? (doc.views as JsonObject[]) : [];
    for (const view of views) {
      if (view.wrap !== true) continue;
      delete view.wrap;
      if (!Array.isArray(view.fields)) continue;
      for (const entry of view.fields as JsonObject[]) entry.wrap = true;
    }
    return doc;
  },
};

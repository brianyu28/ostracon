import { describe, expect, it } from 'vitest';
import { v2ToV3 } from './v2-to-v3';

describe('v2 → v3', () => {
  it('moves a view’s wrap onto each of its fields', () => {
    const doc = {
      views: [
        {
          id: 'viw_a',
          fields: [{ fieldId: 'fld_a' }, { fieldId: 'fld_b', hidden: true }],
          wrap: true,
        },
        { id: 'viw_b', fields: [{ fieldId: 'fld_a', width: 120 }] },
      ],
    };
    expect(v2ToV3.migrate(doc)).toEqual({
      views: [
        {
          id: 'viw_a',
          fields: [
            { fieldId: 'fld_a', wrap: true },
            { fieldId: 'fld_b', hidden: true, wrap: true },
          ],
        },
        { id: 'viw_b', fields: [{ fieldId: 'fld_a', width: 120 }] },
      ],
    });
  });
});

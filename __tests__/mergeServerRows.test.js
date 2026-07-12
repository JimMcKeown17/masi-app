import { mergeServerRows } from '../src/utils/mergeServerRows';

describe('mergeServerRows pending hard-delete suppression', () => {
  test('pending delete ids suppress server rows without changing the default merge', () => {
    const cached = [];
    const serverRows = [
      { id: 'child-9', first_name: 'Server Copy', synced: true },
      { id: 'child-10', first_name: 'Kept', synced: true },
    ];

    expect(mergeServerRows(cached, serverRows)).toEqual(serverRows);
    expect(mergeServerRows(cached, serverRows, {
      pendingDeleteIds: new Set(['child-9']),
    })).toEqual([
      expect.objectContaining({ id: 'child-10' }),
    ]);
  });
});

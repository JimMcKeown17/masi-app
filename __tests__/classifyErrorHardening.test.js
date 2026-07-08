jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  supabase: {},
}));

const { _testClassifyError } = require('../src/services/offlineSync');

describe('classifyError 23514 immutable-identity rejection (#48 part 1)', () => {
  test('23514 on an immutable-assignment table is terminal with a readable reason', () => {
    const result = _testClassifyError(
      { code: '23514', message: 'group_ea_assignments identity columns cannot be changed after insert' },
      { tableName: 'group_ea_assignments' }
    );

    expect(result.terminal).toBe(true);
    expect(result.markAsSynced).toBe(false);
    expect(result.reason).toMatch(/identity/i);
  });

  test('23514 on each immutable-assignment table is terminal', () => {
    for (const tableName of ['child_ea_assignments', 'class_ea_assignments', 'group_ea_assignments']) {
      expect(_testClassifyError({ code: '23514' }, { tableName }).terminal).toBe(true);
    }
  });

  test('23514 on a non-immutable table stays retryable (out of scope for #48)', () => {
    expect(_testClassifyError({ code: '23514' }, { tableName: 'sessions' }).terminal).toBe(false);
  });

  test('the 23514 reason never matches the RLS heal signature (regression guard for #44)', () => {
    const { reason } = _testClassifyError({ code: '23514' }, { tableName: 'child_ea_assignments' });
    expect(reason).not.toMatch(/row-level security|42501/i);
  });
});

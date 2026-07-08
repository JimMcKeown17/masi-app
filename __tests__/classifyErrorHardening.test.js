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

const { _testEvidenceMaps } = require('../src/services/offlineSync');

describe('evidence maps (#48 part 2)', () => {
  test('PARENT_FK_COLUMNS covers every TABLE_DEPENDENCIES FK-parent (no drift)', () => {
    const { TABLE_DEPENDENCIES, PARENT_FK_COLUMNS } = _testEvidenceMaps;
    for (const [child, parents] of Object.entries(TABLE_DEPENDENCIES)) {
      for (const parent of parents) {
        expect(PARENT_FK_COLUMNS[child]?.[parent]).toBeDefined();
      }
    }
  });

  test('PARENT_FK_COLUMNS includes the pushed grouping-version FK edges', () => {
    const { PARENT_FK_COLUMNS } = _testEvidenceMaps;
    expect(PARENT_FK_COLUMNS.groups.grouping_versions).toBe('grouping_version_id');
    expect(PARENT_FK_COLUMNS.child_group_memberships.grouping_versions).toBe('grouping_version_id');
    expect(PARENT_FK_COLUMNS.class_grouping_state.grouping_versions).toBe('active_grouping_version_id');
  });

  test('no PARENT_FK_COLUMNS edge points at its own table (no self-cycle)', () => {
    const { PARENT_FK_COLUMNS } = _testEvidenceMaps;
    for (const [child, parents] of Object.entries(PARENT_FK_COLUMNS)) {
      expect(Object.keys(parents)).not.toContain(child);
    }
  });

  test('GRANT_SUBJECTS references only the three device-produced assignment tables', () => {
    const { GRANT_SUBJECTS } = _testEvidenceMaps;
    const allowed = new Set(['child_ea_assignments', 'class_ea_assignments', 'group_ea_assignments']);
    for (const grants of Object.values(GRANT_SUBJECTS)) {
      for (const { grantTable } of grants) expect(allowed.has(grantTable)).toBe(true);
    }
  });

  test('GRANT_SUBJECTS maps the child- and class-scoped grants', () => {
    const { GRANT_SUBJECTS } = _testEvidenceMaps;
    expect(GRANT_SUBJECTS.child_group_memberships).toEqual(expect.arrayContaining([
      { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
      { grantTable: 'group_ea_assignments', subjectColumn: 'group_id' },
    ]));
    expect(GRANT_SUBJECTS.grouping_versions).toEqual([{ grantTable: 'class_ea_assignments', subjectColumn: 'class_id' }]);
    expect(GRANT_SUBJECTS.groups).toBeUndefined(); // created_by + staff_programme_assignments only: no device assignment grant
  });
});

describe('classifyError evidence-pending downgrade for 42501/23503 (#48 part 2)', () => {
  test('23503 retriable when evidence pending, terminal otherwise', () => {
    expect(
      _testClassifyError(
        { code: '23503' },
        { tableName: 'assessment_items' },
        { parentEvidencePending: true }
      ).terminal
    ).toBe(false);
    expect(
      _testClassifyError(
        { code: '23503' },
        { tableName: 'assessment_items' },
        { parentEvidencePending: false }
      ).terminal
    ).toBe(true);
  });

  test('42501 retriable when evidence pending, terminal otherwise', () => {
    expect(
      _testClassifyError(
        { code: '42501' },
        { tableName: 'session_attendees' },
        { parentEvidencePending: true }
      ).terminal
    ).toBe(false);
    expect(
      _testClassifyError(
        { code: '42501' },
        { tableName: 'session_attendees' },
        { parentEvidencePending: false }
      ).terminal
    ).toBe(true);
  });

  test('context defaults to not-pending for two-arg callers', () => {
    expect(_testClassifyError({ code: '23503' }, { tableName: 'assessment_items' }).terminal).toBe(true);
  });
});

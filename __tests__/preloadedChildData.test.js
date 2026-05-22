jest.mock('../src/services/supabaseClient', () => ({
  supabase: {},
}));

import { pullPreloadedChildData } from '../src/services/preloadedChildData';

const queryResult = (result) => {
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    in: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
};

describe('preloaded child-data pull', () => {
  test('returns server junction rows required for offline My Children hydration', async () => {
    const supabaseClient = {
      from: jest.fn((tableName) => {
        if (tableName === 'staff_programme_assignments') {
          return queryResult({ data: [{ programme_id: 'programme-a' }], error: null });
        }
        if (tableName === 'children') {
          return queryResult({
            data: [{
              id: 'child-1',
              first_name: 'Server',
              last_name: 'Child',
              child_ea_assignments: [{
                id: 'cea-1',
                child_id: 'child-1',
                user_id: 'user-1',
                unassigned_at: null,
              }],
              child_programme_enrollments: [{
                id: 'cpe-1',
                child_id: 'child-1',
                programme_id: 'programme-a',
                ended_at: null,
              }],
            }],
            error: null,
          });
        }
        if (tableName === 'child_class_memberships') {
          return queryResult({
            data: [{
              id: 'ccm-1',
              child_id: 'child-1',
              class_id: 'class-1',
              academic_year_id: 'year-2026',
              exited_at: null,
              classes: {
                id: 'class-1',
                name: 'Admin Assigned Class',
                school_id: 'school-1',
                academic_year_id: 'year-2026',
              },
            }],
            error: null,
          });
        }
        if (tableName === 'groups') {
          return queryResult({ data: [], error: null });
        }
        return queryResult({ data: [], error: null });
      }),
    };

    const result = await pullPreloadedChildData({ userId: 'user-1', supabaseClient });

    expect(result.children).toEqual([
      expect.objectContaining({ id: 'child-1', sync_status: 'synced' }),
    ]);
    expect(result.childEaAssignments).toEqual([
      expect.objectContaining({ id: 'cea-1', child_id: 'child-1', sync_status: 'synced' }),
    ]);
    expect(result.childProgrammeEnrollments).toEqual([
      expect.objectContaining({ id: 'cpe-1', programme_id: 'programme-a', sync_status: 'synced' }),
    ]);
    expect(result.childClassMemberships).toEqual([
      expect.objectContaining({ id: 'ccm-1', class_id: 'class-1', sync_status: 'synced' }),
    ]);
    expect(result.classes).toEqual([
      expect.objectContaining({ id: 'class-1', sync_status: 'synced' }),
    ]);
    expect(result.errors).toEqual([]);
  });
});

jest.mock('../src/services/supabaseClient', () => ({
  supabase: {},
}));

import {
  PULL_SCOPE_COMPLETENESS_LIMIT,
  pullPreloadedChildData,
} from '../src/services/preloadedChildData';

const successful = (data = []) => ({ data, error: null });

const queryResult = (result) => {
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    in: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    then: (resolve, reject) => Promise.resolve()
      .then(() => (typeof result === 'function' ? result(builder) : result))
      .then(resolve, reject),
  };
  return builder;
};

const defaultResults = {
  staff_programme_assignments: successful([{ programme_id: 'programme-a' }]),
  child_ea_assignments: successful(),
  child_programme_enrollments: successful(),
  children: successful(),
  child_class_memberships: successful(),
  groups: successful(),
  child_group_memberships: successful(),
};

const createSupabaseClient = (overrides = {}) => {
  const results = { ...defaultResults, ...overrides };
  const callCounts = {};
  const buildersByTable = {};
  const supabaseClient = {
    from: jest.fn((tableName) => {
      const callIndex = callCounts[tableName] || 0;
      callCounts[tableName] = callIndex + 1;
      const configured = results[tableName];
      const result = typeof configured === 'function'
        ? configured({ callIndex })
        : configured;
      const builder = result?.select ? result : queryResult(result);
      buildersByTable[tableName] = [...(buildersByTable[tableName] || []), builder];
      return builder;
    }),
  };
  supabaseClient.buildersByTable = buildersByTable;
  return supabaseClient;
};

const assignedRows = (count) => Array.from({ length: count }, (_, index) => ({
  id: `cea-${index}`,
  child_id: `child-${index}`,
  user_id: 'user-1',
  unassigned_at: null,
  children: { id: `child-${index}`, first_name: `Child ${index}` },
}));

const expectDependency = (scope) => {
  expect(scope).toEqual({
    ok: false,
    rows: [],
    complete: false,
    failureKind: 'dependency',
  });
};

describe('preloaded child-data pull', () => {
  test('keeps successful empty group scopes distinct from a failed class-membership query', async () => {
    const supabaseClient = createSupabaseClient({
      children: successful([{ id: 'child-1' }]),
      child_class_memberships: {
        data: null,
        error: { code: '42501', message: 'row-level security denied the query' },
      },
    });

    const result = await pullPreloadedChildData({ userId: 'user-1', supabaseClient });

    expect(result.activeProgrammeId).toBe('programme-a');
    expect(result.scopes.childClassMemberships).toEqual(expect.objectContaining({
      ok: false,
      rows: [],
      complete: false,
      failureKind: 'query',
    }));
    expectDependency(result.scopes.classes);
    expect(result.scopes.groups).toEqual({
      ok: true,
      rows: [],
      complete: true,
      failureKind: null,
    });
    expect(result.scopes.groupEaAssignments).toEqual({
      ok: true,
      rows: [],
      complete: true,
      failureKind: null,
    });
  });

  test('runs direct assignment branches when the intersection children query fails', async () => {
    const supabaseClient = createSupabaseClient({
      child_ea_assignments: successful(assignedRows(1)),
      child_programme_enrollments: successful([{
        id: 'cpe-1',
        child_id: 'child-0',
        programme_id: 'programme-a',
        ended_at: null,
      }]),
      children: {
        data: null,
        error: { code: '42501', message: 'children denied' },
      },
    });

    const result = await pullPreloadedChildData({ userId: 'user-1', supabaseClient });

    expect(result.scopes.children.failureKind).toBe('query');
    expect(result.scopes.childEaAssignments).toEqual(expect.objectContaining({
      ok: true,
      rows: [expect.objectContaining({ id: 'cea-0', child_id: 'child-0' })],
    }));
    expect(result.scopes.childProgrammeEnrollments).toEqual(expect.objectContaining({
      ok: true,
      rows: [expect.objectContaining({ id: 'cpe-1', child_id: 'child-0' })],
    }));
    expectDependency(result.scopes.childClassMemberships);
    expectDependency(result.scopes.classes);
  });

  test('skips enrollments when their direct assignment dependency fails', async () => {
    const supabaseClient = createSupabaseClient({
      child_ea_assignments: {
        data: null,
        error: { code: '42501', message: 'assignments denied' },
      },
    });

    const result = await pullPreloadedChildData({ userId: 'user-1', supabaseClient });

    expect(result.scopes.childEaAssignments.failureKind).toBe('query');
    expectDependency(result.scopes.childProgrammeEnrollments);
    expect(supabaseClient.from).not.toHaveBeenCalledWith('child_programme_enrollments');
    expect(result.scopes.children.ok).toBe(true);
  });

  test.each([
    {
      label: 'a thrown request',
      programmeResult: queryResult(() => {
        throw new Error('request rejected');
      }),
      failureKind: 'transport',
    },
    {
      label: 'a returned network-shaped error',
      programmeResult: {
        data: null,
        error: { code: '', message: 'TypeError: Network request failed' },
      },
      failureKind: 'transport',
    },
    {
      label: 'a returned RLS-shaped error',
      programmeResult: {
        data: null,
        error: { code: '42501', message: 'row-level security policy denied access' },
      },
      failureKind: 'query',
    },
  ])('classifies $label and dependency-skips domain scopes', async ({ programmeResult, failureKind }) => {
    const supabaseClient = createSupabaseClient({
      staff_programme_assignments: programmeResult,
    });

    const result = await pullPreloadedChildData({ userId: 'user-1', supabaseClient });

    expect(result.activeProgrammeId).toBeNull();
    expect(result.scopes.programmeAssignment).toEqual(expect.objectContaining({
      ok: false,
      rows: [],
      complete: false,
      failureKind,
    }));
    Object.entries(result.scopes)
      .filter(([name]) => name !== 'programmeAssignment')
      .forEach(([, scope]) => expectDependency(scope));
    expect(supabaseClient.from).toHaveBeenCalledTimes(1);
  });

  test('returns an explicit no-programme result with every domain scope skipped', async () => {
    const supabaseClient = createSupabaseClient({
      staff_programme_assignments: successful(),
    });

    const result = await pullPreloadedChildData({ userId: 'user-1', supabaseClient });

    expect(result.activeProgrammeId).toBeNull();
    expect(result.scopes.programmeAssignment).toEqual({
      ok: true,
      rows: [],
      complete: true,
      failureKind: null,
    });
    expect(Object.keys(result.scopes)).toEqual([
      'programmeAssignment',
      'children',
      'childEaAssignments',
      'childProgrammeEnrollments',
      'childClassMemberships',
      'classes',
      'groups',
      'groupEaAssignments',
      'childrenGroups',
    ]);
    Object.entries(result.scopes)
      .filter(([name]) => name !== 'programmeAssignment')
      .forEach(([, scope]) => expectDependency(scope));
    expect(result).not.toHaveProperty('children');
    expect(result).not.toHaveProperty('errors');
  });

  test('marks a scope incomplete when it reaches the pull completeness limit', async () => {
    const groups = Array.from({ length: PULL_SCOPE_COMPLETENESS_LIMIT }, (_, index) => ({
      id: `group-${index}`,
      name: `Group ${index}`,
      group_ea_assignments: [],
    }));
    const supabaseClient = createSupabaseClient({ groups: successful(groups) });

    const result = await pullPreloadedChildData({ userId: 'user-1', supabaseClient });

    expect(PULL_SCOPE_COMPLETENESS_LIMIT).toBe(1000);
    expect(result.scopes.groups).toEqual(expect.objectContaining({
      ok: true,
      complete: false,
    }));
    expect(result.scopes.groups.rows).toHaveLength(PULL_SCOPE_COMPLETENESS_LIMIT);
  });

  test('returns direct assignments with embedded children and full group assignment rows', async () => {
    const supabaseClient = createSupabaseClient({
      child_ea_assignments: successful(assignedRows(1)),
      child_programme_enrollments: successful([{
        id: 'cpe-1',
        child_id: 'child-0',
        programme_id: 'programme-a',
        ended_at: null,
      }]),
      children: successful([{
        id: 'child-0',
        first_name: 'Server',
        child_ea_assignments: [{ id: 'intersection-cea' }],
        child_programme_enrollments: [{ id: 'intersection-cpe' }],
      }]),
      child_class_memberships: successful([{
        id: 'ccm-1',
        child_id: 'child-0',
        class_id: 'class-1',
        exited_at: null,
        classes: { id: 'class-1', name: 'Admin Assigned Class' },
      }]),
      groups: successful([{
        id: 'group-1',
        name: 'Group One',
        group_ea_assignments: [{
          id: 'gea-1',
          group_id: 'group-1',
          ea_user_id: 'user-1',
          unassigned_at: null,
        }],
      }]),
      child_group_memberships: successful([{
        id: 'cgm-1',
        child_id: 'child-0',
        group_id: 'group-1',
        removed_at: null,
      }]),
    });

    const result = await pullPreloadedChildData({ userId: 'user-1', supabaseClient });

    expect(result.scopes.childEaAssignments.rows).toEqual([expect.objectContaining({
      id: 'cea-0',
      sync_status: 'synced',
      children: expect.objectContaining({ id: 'child-0', sync_status: 'synced' }),
    })]);
    expect(result.scopes.children.rows[0]).not.toHaveProperty('child_ea_assignments');
    expect(result.scopes.children.rows[0]).not.toHaveProperty('child_programme_enrollments');
    expect(result.scopes.childProgrammeEnrollments.rows).toEqual([
      expect.objectContaining({ id: 'cpe-1', sync_status: 'synced' }),
    ]);
    expect(result.scopes.childClassMemberships.rows[0]).not.toHaveProperty('classes');
    expect(result.scopes.classes.rows).toEqual([
      expect.objectContaining({ id: 'class-1', sync_status: 'synced' }),
    ]);
    expect(result.scopes.groups.rows[0]).not.toHaveProperty('group_ea_assignments');
    expect(result.scopes.groupEaAssignments.rows).toEqual([expect.objectContaining({
      id: 'gea-1',
      group_id: 'group-1',
      ea_user_id: 'user-1',
      sync_status: 'synced',
    })]);
    expect(result.scopes.childrenGroups.rows).toEqual([
      expect.objectContaining({ id: 'cgm-1', sync_status: 'synced' }),
    ]);
  });

  test('chunks enrollment child ids at 200, aggregates rows, and deduplicates by id', async () => {
    const cpeFactory = () => queryResult((builder) => {
      const childIds = builder.in.mock.calls[0][1];
      return successful([
        ...childIds.map((childId) => ({
          id: `cpe-${childId}`,
          child_id: childId,
          programme_id: 'programme-a',
        })),
        { id: 'cpe-shared', child_id: childIds[0], programme_id: 'programme-a' },
      ]);
    });
    const supabaseClient = createSupabaseClient({
      child_ea_assignments: successful(assignedRows(401)),
      child_programme_enrollments: cpeFactory,
    });

    const result = await pullPreloadedChildData({ userId: 'user-1', supabaseClient });

    const builders = supabaseClient.buildersByTable.child_programme_enrollments;
    expect(builders).toHaveLength(3);
    expect(builders.map((builder) => builder.in.mock.calls[0][1].length)).toEqual([200, 200, 1]);
    builders.forEach((builder) => {
      expect(builder.in).toHaveBeenCalledWith('child_id', expect.any(Array));
      expect(builder.eq).toHaveBeenCalledWith('programme_id', 'programme-a');
      expect(builder.is).toHaveBeenCalledWith('ended_at', null);
    });
    expect(result.scopes.childProgrammeEnrollments).toEqual(expect.objectContaining({
      ok: true,
      complete: true,
    }));
    expect(result.scopes.childProgrammeEnrollments.rows).toHaveLength(402);
    expect(result.scopes.childProgrammeEnrollments.rows.filter(
      (row) => row.id === 'cpe-shared',
    )).toHaveLength(1);
  });

  test('fails the aggregate enrollment scope as query when any chunk query fails', async () => {
    const supabaseClient = createSupabaseClient({
      child_ea_assignments: successful(assignedRows(201)),
      child_programme_enrollments: ({ callIndex }) => (
        callIndex === 0
          ? successful([{ id: 'cpe-first', child_id: 'child-0' }])
          : { data: null, error: { code: '42501', message: 'second chunk denied' } }
      ),
    });

    const result = await pullPreloadedChildData({ userId: 'user-1', supabaseClient });

    expect(result.scopes.childProgrammeEnrollments).toEqual(expect.objectContaining({
      ok: false,
      rows: [],
      complete: false,
      failureKind: 'query',
    }));
  });

  test('computes enrollment completeness over the deduplicated aggregate', async () => {
    const supabaseClient = createSupabaseClient({
      child_ea_assignments: successful(assignedRows(PULL_SCOPE_COMPLETENESS_LIMIT)),
      child_programme_enrollments: () => queryResult((builder) => successful(
        builder.in.mock.calls[0][1].map((childId) => ({
          id: `cpe-${childId}`,
          child_id: childId,
          programme_id: 'programme-a',
        })),
      )),
    });

    const result = await pullPreloadedChildData({ userId: 'user-1', supabaseClient });

    expect(supabaseClient.buildersByTable.child_programme_enrollments).toHaveLength(5);
    expect(result.scopes.childProgrammeEnrollments.rows).toHaveLength(
      PULL_SCOPE_COMPLETENESS_LIMIT,
    );
    expect(result.scopes.childProgrammeEnrollments.complete).toBe(false);
  });
});

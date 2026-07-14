import { supabase } from './supabaseClient';
import { enqueueSupabaseRequest } from './supabaseRequestQueue';

export const PULL_SCOPE_COMPLETENESS_LIMIT = 1000;
export const RECONCILE_ACK_SCHEMA_VERSION = 1;

const CHILD_PROGRAMME_ENROLLMENT_CHUNK_SIZE = 200;
const DOMAIN_SCOPE_NAMES = [
  'children',
  'childEaAssignments',
  'childProgrammeEnrollments',
  'childClassMemberships',
  'classes',
  'groups',
  'groupEaAssignments',
  'childrenGroups',
];

const markSynced = (row) => ({
  ...row,
  synced: true,
  sync_status: row.sync_status || 'synced',
});

const stripJoins = (row, joinKeys) => {
  const next = { ...row };
  for (const key of joinKeys) {
    delete next[key];
  }
  return markSynced(next);
};

const collectJoinRows = (rows, joinKey) => (
  (rows || []).flatMap((row) => {
    const joined = row?.[joinKey];
    if (!joined) return [];
    return (Array.isArray(joined) ? joined : [joined]).map(markSynced);
  })
);

const uniqueById = (rows) => {
  const byId = new Map();
  for (const row of rows || []) {
    if (row?.id) byId.set(row.id, row);
  }
  return [...byId.values()];
};

const successfulScope = (rows) => {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  return {
    ok: true,
    rows: normalizedRows,
    complete: normalizedRows.length < PULL_SCOPE_COMPLETENESS_LIMIT,
    failureKind: null,
  };
};

const failedScope = (failureKind, error) => ({
  ok: false,
  rows: [],
  complete: false,
  failureKind,
  ...(error === undefined ? {} : { error }),
});

const dependencyScope = () => failedScope('dependency');

const dependencyScopes = () => Object.fromEntries(
  DOMAIN_SCOPE_NAMES.map((scopeName) => [scopeName, dependencyScope()]),
);

const reconcileAcknowledgmentFailure = (failureKind, error) => ({
  ok: false,
  complete: false,
  failureKind,
  ...(error ? { error } : {}),
});

const snapshotArray = (snapshot, key) => (
  Array.isArray(snapshot?.[key]) ? snapshot[key] : null
);

export const pullReconcileAcknowledgments = async ({
  userId,
  supabaseClient = supabase,
} = {}) => {
  try {
    const { data, error } = await supabaseClient.rpc('get_reconcile_acknowledgments');
    if (error) {
      return reconcileAcknowledgmentFailure(classifyPullFailureKind(error), error);
    }

    const arrayKeys = [
      'child_ea_assignment_ids',
      'assigned_child_ids',
      'visible_child_ids',
      'child_programme_enrollment_ids',
      'child_class_membership_ids',
      'class_ea_assignment_ids',
      'class_ids',
      'group_ea_assignment_ids',
      'group_ids',
      'child_group_membership_ids',
    ];
    const valid = data?.schema_version === RECONCILE_ACK_SCHEMA_VERSION
      && data?.complete === true
      && data?.user_id === userId
      && arrayKeys.every((key) => snapshotArray(data, key));
    if (!valid) {
      return reconcileAcknowledgmentFailure(
        'query',
        new Error('Malformed reconcile acknowledgment snapshot')
      );
    }

    return {
      ok: true,
      complete: true,
      failureKind: null,
      data: {
        schemaVersion: data.schema_version,
        generatedAt: data.generated_at || null,
        activeProgrammeId: data.active_programme_id || null,
        childEaAssignmentIds: data.child_ea_assignment_ids,
        assignedChildIds: data.assigned_child_ids,
        visibleChildIds: data.visible_child_ids,
        childProgrammeEnrollmentIds: data.child_programme_enrollment_ids,
        childClassMembershipIds: data.child_class_membership_ids,
        classEaAssignmentIds: data.class_ea_assignment_ids,
        classIds: data.class_ids,
        groupEaAssignmentIds: data.group_ea_assignment_ids,
        groupIds: data.group_ids,
        childGroupMembershipIds: data.child_group_membership_ids,
      },
    };
  } catch (error) {
    return reconcileAcknowledgmentFailure('transport', error);
  }
};

export const classifyPullFailureKind = (error) => {
  const code = String(error?.code || '');
  const name = String(error?.name || '');
  const text = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ');

  const isTransport = /ECONN|ENOTFOUND|ETIMEDOUT|NETWORK|FETCH|ABORT/i.test(code)
    || /NetworkError|FetchError|AbortError/i.test(name)
    || /network request failed|failed to fetch|fetch failed|network error|socket hang up|connection (?:reset|refused|timed out)/i.test(text);
  return isTransport ? 'transport' : 'query';
};

const queryScope = async (task) => {
  try {
    const result = await task();
    if (result?.error) {
      return failedScope(
        classifyPullFailureKind(result.error),
        result.error,
      );
    }
    return successfulScope(result?.data);
  } catch (error) {
    return failedScope('transport', error);
  }
};

const chunkRows = (rows, chunkSize) => {
  const chunks = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }
  return chunks;
};

const markAssignmentWithChild = (row) => ({
  ...markSynced(row),
  ...(row?.children ? { children: markSynced(row.children) } : {}),
});

const pullChildProgrammeEnrollments = async ({
  supabaseClient,
  activeProgrammeId,
  childEaAssignmentsScope,
}) => {
  if (!childEaAssignmentsScope.ok) return dependencyScope();

  const assignedChildIds = [...new Set(
    childEaAssignmentsScope.rows.map((row) => row.child_id).filter(Boolean),
  )];
  if (assignedChildIds.length === 0) return successfulScope([]);

  const aggregate = [];
  for (const childIds of chunkRows(assignedChildIds, CHILD_PROGRAMME_ENROLLMENT_CHUNK_SIZE)) {
    const chunkScope = await queryScope(() => (
      supabaseClient
        .from('child_programme_enrollments')
        .select('*')
        .eq('programme_id', activeProgrammeId)
        .in('child_id', childIds)
        .is('ended_at', null)
    ));
    if (!chunkScope.ok) return chunkScope;
    aggregate.push(...chunkScope.rows);
  }

  return successfulScope(uniqueById(aggregate).map(markSynced));
};

export const pullPreloadedChildData = async ({
  userId,
  supabaseClient = supabase,
} = {}) => enqueueSupabaseRequest(async () => {
  const reconcileAcknowledgments = await pullReconcileAcknowledgments({
    userId,
    supabaseClient,
  });
  const queriedProgrammeAssignment = await queryScope(() => (
    supabaseClient
      .from('staff_programme_assignments')
      .select('programme_id')
      .eq('user_id', userId)
      .is('ended_at', null)
      .order('assigned_at', { ascending: false })
      .limit(1)
  ));
  const hasAuthoritativeProgramme = reconcileAcknowledgments.ok
    && reconcileAcknowledgments.complete;
  const activeProgrammeId = hasAuthoritativeProgramme
    ? reconcileAcknowledgments.data.activeProgrammeId
    : queriedProgrammeAssignment.ok
      ? queriedProgrammeAssignment.rows[0]?.programme_id || null
      : null;
  const programmeAssignment = hasAuthoritativeProgramme
    ? successfulScope(activeProgrammeId ? [{ programme_id: activeProgrammeId }] : [])
    : queriedProgrammeAssignment;

  if (!activeProgrammeId) {
    return {
      activeProgrammeId: null,
      reconcileAcknowledgments,
      scopes: {
        programmeAssignment,
        ...dependencyScopes(),
      },
    };
  }

  const rawChildEaAssignments = await queryScope(() => (
    supabaseClient
      .from('child_ea_assignments')
      .select('*, children(*)')
      .eq('user_id', userId)
      .is('unassigned_at', null)
  ));
  const childEaAssignments = rawChildEaAssignments.ok
    ? successfulScope(rawChildEaAssignments.rows.map(markAssignmentWithChild))
    : rawChildEaAssignments;

  const childProgrammeEnrollments = await pullChildProgrammeEnrollments({
    supabaseClient,
    activeProgrammeId,
    childEaAssignmentsScope: childEaAssignments,
  });

  const rawChildren = await queryScope(() => (
    supabaseClient
      .from('children')
      .select(`
        *,
        child_ea_assignments!inner(*),
        child_programme_enrollments!inner(*)
      `)
      .eq('child_ea_assignments.user_id', userId)
      .is('child_ea_assignments.unassigned_at', null)
      .eq('child_programme_enrollments.programme_id', activeProgrammeId)
      .is('child_programme_enrollments.ended_at', null)
      .order('first_name', { ascending: true })
  ));
  const children = rawChildren.ok
    ? successfulScope(rawChildren.rows.map((row) => stripJoins(
      row,
      ['child_ea_assignments', 'child_programme_enrollments'],
    )))
    : rawChildren;

  let rawChildClassMemberships;
  if (!rawChildren.ok) {
    rawChildClassMemberships = dependencyScope();
  } else if (rawChildren.rows.length === 0) {
    rawChildClassMemberships = successfulScope([]);
  } else {
    rawChildClassMemberships = await queryScope(() => (
      supabaseClient
        .from('child_class_memberships')
        .select('*, classes(*)')
        .in('child_id', rawChildren.rows.map((child) => child.id))
        .is('exited_at', null)
    ));
  }

  const childClassMemberships = rawChildClassMemberships.ok
    ? successfulScope(rawChildClassMemberships.rows.map((row) => stripJoins(row, ['classes'])))
    : rawChildClassMemberships;
  const classes = rawChildClassMemberships.ok
    ? successfulScope(uniqueById(
      rawChildClassMemberships.rows
        .map((row) => row.classes)
        .filter(Boolean)
        .map(markSynced),
    ))
    : dependencyScope();

  const rawGroups = await queryScope(() => (
    supabaseClient
      .from('groups')
      .select(`
        *,
        group_ea_assignments!inner(*)
      `)
      .eq('group_ea_assignments.ea_user_id', userId)
      .is('group_ea_assignments.unassigned_at', null)
      .eq('programme_id', activeProgrammeId)
      .order('name', { ascending: true })
  ));
  const groups = rawGroups.ok
    ? successfulScope(rawGroups.rows.map((row) => stripJoins(row, ['group_ea_assignments'])))
    : rawGroups;
  const groupEaAssignments = rawGroups.ok
    ? successfulScope(collectJoinRows(rawGroups.rows, 'group_ea_assignments'))
    : dependencyScope();

  let rawChildrenGroups;
  if (!rawGroups.ok) {
    rawChildrenGroups = dependencyScope();
  } else if (rawGroups.rows.length === 0) {
    rawChildrenGroups = successfulScope([]);
  } else {
    rawChildrenGroups = await queryScope(() => (
      supabaseClient
        .from('child_group_memberships')
        .select('*')
        .in('group_id', rawGroups.rows.map((group) => group.id))
        .is('removed_at', null)
    ));
  }
  const childrenGroups = rawChildrenGroups.ok
    ? successfulScope(rawChildrenGroups.rows.map(markSynced))
    : rawChildrenGroups;

  return {
    activeProgrammeId,
    reconcileAcknowledgments,
    scopes: {
      programmeAssignment,
      children,
      childEaAssignments,
      childProgrammeEnrollments,
      childClassMemberships,
      classes,
      groups,
      groupEaAssignments,
      childrenGroups,
    },
  };
});

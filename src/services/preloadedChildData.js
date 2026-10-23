import { classRosterDependencyScope, pullClassRoster, persistClassRoster } from './classRosterPull';
import { isStaleActorError } from '../session/staleActor';

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
  supabaseClient,
  enqueueRequest,
} = {}) => {
  try {
    const { data, error } = await enqueueRequest(() => (
      supabaseClient.rpc('get_reconcile_acknowledgments')
    ));
    if (isStaleActorError(error)) throw error;
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
        ...(Array.isArray(data.roster_class_ids) ? { rosterClassIds: data.roster_class_ids } : {}),
        ...(Array.isArray(data.roster_membership_ids) ? { rosterMembershipIds: data.roster_membership_ids } : {}),
      },
    };
  } catch (error) {
    if (isStaleActorError(error)) throw error;
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
    if (isStaleActorError(result?.error)) throw result.error;
    if (result?.error) {
      return failedScope(
        classifyPullFailureKind(result.error),
        result.error,
      );
    }
    return successfulScope(result?.data);
  } catch (error) {
    if (isStaleActorError(error)) throw error;
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
  queryScopeFn = queryScope,
}) => {
  if (!childEaAssignmentsScope.ok) return dependencyScope();

  const assignedChildIds = [...new Set(
    childEaAssignmentsScope.rows.map((row) => row.child_id).filter(Boolean),
  )];
  if (assignedChildIds.length === 0) return successfulScope([]);

  const aggregate = [];
  for (const childIds of chunkRows(assignedChildIds, CHILD_PROGRAMME_ENROLLMENT_CHUNK_SIZE)) {
    const chunkScope = await queryScopeFn(() => (
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
  supabaseClient,
  enqueueRequest,
} = {}) => {
  const queuedQueryScope = (task) => queryScope(() => enqueueRequest(task));
  const reconcileAcknowledgments = await pullReconcileAcknowledgments({
    userId,
    supabaseClient,
    enqueueRequest,
  });
  const queriedProgrammeAssignment = await queuedQueryScope(() => (
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
        classRoster: classRosterDependencyScope(),
      },
    };
  }

  const rawChildEaAssignments = await queuedQueryScope(() => (
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
    queryScopeFn: queuedQueryScope,
  });

  const rawChildren = await queuedQueryScope(() => (
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
    rawChildClassMemberships = await queuedQueryScope(() => (
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

  const rawGroups = await queuedQueryScope(() => (
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
    rawChildrenGroups = await queuedQueryScope(() => (
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

  const classRoster = await pullClassRoster({
    userId, activeProgrammeId, supabaseClient, queryScope: queuedQueryScope,
  });

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
      classRoster,
    },
  };
};

// Defer only when the new snapshot can supply a class pass. Completeness is
// finalized by roster persistence, so the shared pair checks it only afterward.
export const shouldDeferMembershipReconcile = ({ activeProgrammeId, scopes, reconcileAcknowledgments }) => (
  Boolean(activeProgrammeId) && scopes.programmeAssignment.ok && Boolean(scopes.classRoster)
  && reconcileAcknowledgments?.ok === true && reconcileAcknowledgments.complete === true
  && reconcileAcknowledgments.data.activeProgrammeId === activeProgrammeId
  && Array.isArray(reconcileAcknowledgments.data.rosterClassIds)
  && Array.isArray(reconcileAcknowledgments.data.rosterMembershipIds)
  && Array.isArray(reconcileAcknowledgments.data.visibleChildIds)
);

export const reconcilePulledClassMemberships = async ({
  pulled, repositories, pulledAt, authorizedBreakerScopes = new Set(),
}) => {
  if (!shouldDeferMembershipReconcile(pulled)) return [];
  const { scopes, reconcileAcknowledgments: { data: ack } } = pulled;
  const deliveryReady = scopes.childClassMemberships.ok;
  const rosterReady = scopes.classRoster.ok && scopes.classRoster.complete === true;
  if (!deliveryReady && !rosterReady) return [];
  return repositories.children.withTransaction(async txn => {
    const results = [];
    if (deliveryReady) {
      results.push({ scope: 'childClassMemberships', ...await repositories.children.buildClassMembershipReconcile({
        acknowledgedIds: ack.childClassMembershipIds,
        acknowledgedChildIds: ack.visibleChildIds,
        pulledAt,
        bypassBreaker: authorizedBreakerScopes.has('childClassMemberships'),
      })(txn) });
    }
    if (rosterReady) {
      results.push({ scope: 'classRosterMemberships', ...await repositories.children.buildClassRosterMembershipReconcile({
        rosterClassIds: ack.rosterClassIds,
        rosterMembershipIds: ack.rosterMembershipIds,
        deliveryChildIds: ack.visibleChildIds,
        pulledAt,
        bypassBreaker: authorizedBreakerScopes.has('classRosterMemberships'),
      })(txn) });
    }
    return results;
  });
};

// The handle service persists using the same guarded repositories and acknowledged scopes as
// the legacy contexts. Task 5 moves those contexts onto these entry points.
export const persistPreloadedChildData = async ({
  pulled, userId, repositories, authorizedBreakerScopes = new Set(),
}) => {
  const { activeProgrammeId, scopes, reconcileAcknowledgments } = pulled;
  const ack = reconcileAcknowledgments?.data;
  const authority = reconcileAcknowledgments?.ok === true
    && reconcileAcknowledgments.complete === true && ack?.activeProgrammeId === activeProgrammeId;
  const canReconcile = authority && scopes.programmeAssignment.ok && Boolean(activeProgrammeId);
  const pulledAt = new Date().toISOString();
  const reconciles = [];
  const save = async (name, method, rows, reconcile) => {
    if (!scopes[name].ok) return;
    const result = await method(rows, reconcile ? { reconcile: {
      ...reconcile, pulledAt, bypassBreaker: authorizedBreakerScopes.has(name),
    } } : {});
    if (reconcile) reconciles.push(result);
  };
  const deleted = await repositories.syncOutbox.getPendingHardDeleteIds({ tableName: 'children', ownerUserId: userId });
  const children = uniqueById([
    ...(scopes.children.ok ? scopes.children.rows : []),
    ...(scopes.childEaAssignments.ok ? scopes.childEaAssignments.rows.map((row) => row.children) : []),
  ]).filter((row) => !deleted.has(row.id));
  const kept = (name) => scopes[name].rows.filter((row) => !deleted.has(row.child_id));
  if (scopes.classes.ok) await repositories.classes.saveServerClassRows(scopes.classes.rows);
  if (scopes.children.ok || scopes.childEaAssignments.ok) await repositories.children.saveServerChildRows(children);
  await save('childEaAssignments', repositories.children.saveServerStaffChildRows, kept('childEaAssignments'),
    canReconcile ? { acknowledgedIds: ack.childEaAssignmentIds, userId } : null);
  await save('childProgrammeEnrollments', repositories.children.saveServerChildProgrammeEnrollmentRows, kept('childProgrammeEnrollments'),
    canReconcile ? { acknowledgedIds: ack.childProgrammeEnrollmentIds, acknowledgedAssignedChildIds: ack.assignedChildIds, programmeId: activeProgrammeId } : null);
  await save('childClassMemberships', repositories.children.saveServerChildClassMembershipRows, kept('childClassMemberships'),
    canReconcile && !shouldDeferMembershipReconcile(pulled)
      ? { acknowledgedIds: ack.childClassMembershipIds, acknowledgedChildIds: ack.visibleChildIds } : null);
  if (scopes.groups.ok) await repositories.groups.saveServerGroupRows(scopes.groups.rows);
  await save('groupEaAssignments', repositories.groupEaAssignments.saveServerRows, scopes.groupEaAssignments.rows,
    canReconcile ? { acknowledgedGroupIds: ack.groupIds, userId, programmeId: activeProgrammeId } : null);
  await save('childrenGroups', repositories.groups.saveServerChildrenGroupRows, scopes.childrenGroups.rows,
    canReconcile ? { acknowledgedIds: ack.childGroupMembershipIds, acknowledgedGroupIds: ack.groupIds } : null);
  await persistClassRoster({ scope: scopes.classRoster, repositories, deletedChildIds: deleted });
  reconciles.push(...await reconcilePulledClassMemberships({ pulled, repositories, pulledAt, authorizedBreakerScopes }));
  if (pullCanBeStamped(pulled, reconciles)) {
    await repositories.syncState.setPullState('child_data_pull', { lastPulledAt: pulledAt });
  }
  return { ...pulled, reconcileResults: reconciles };
};

const pullCanBeStamped = ({ activeProgrammeId, scopes, reconcileAcknowledgments: ack }, reconciles) => (
  (!scopes.classRoster || (scopes.classRoster.ok && scopes.classRoster.complete))
  && ack?.ok === true && ack.complete === true && ack.data.activeProgrammeId === activeProgrammeId
  && !Object.values(scopes).some((scope) => scope.failureKind === 'transport' || (scope.ok && !scope.complete))
  && reconciles.every((result) => result?.reconcileCompleted === true)
);

export const pullClassData = async ({ userId, supabaseClient, enqueueRequest, repositories, bypassBreaker = false }) => {
  const reconcileAcknowledgments = await pullReconcileAcknowledgments({ userId, supabaseClient, enqueueRequest });
  const query = (task) => queryScope(() => enqueueRequest(task));
  const assignments = await query(() => supabaseClient.from('staff_programme_assignments')
    .select('programme_id').eq('user_id', userId).is('ended_at', null).order('assigned_at', { ascending: false }).limit(1));
  const authoritative = reconcileAcknowledgments.ok && reconcileAcknowledgments.complete;
  const activeProgrammeId = authoritative ? reconcileAcknowledgments.data.activeProgrammeId : assignments.rows[0]?.programme_id || null;
  const programmeAssignment = authoritative ? successfulScope(activeProgrammeId ? [{ programme_id: activeProgrammeId }] : []) : assignments;
  const rawClasses = activeProgrammeId ? await query(() => supabaseClient.from('classes')
    .select('*, class_ea_assignments!inner(*)').eq('class_ea_assignments.ea_user_id', userId)
    .eq('class_ea_assignments.programme_id', activeProgrammeId).is('class_ea_assignments.unassigned_at', null)
    .order('name', { ascending: true })) : dependencyScope();
  const classes = rawClasses.ok ? successfulScope(rawClasses.rows.map((row) => stripJoins(row, ['class_ea_assignments']))) : rawClasses;
  const classEaAssignments = rawClasses.ok ? successfulScope(collectJoinRows(rawClasses.rows, 'class_ea_assignments')) : dependencyScope();
  const pulled = { activeProgrammeId, reconcileAcknowledgments, scopes: { programmeAssignment, classes, classEaAssignments } };
  const reconciles = [];
  const pulledAt = new Date().toISOString();
  if (classes.ok) {
    await repositories.classes.saveServerClassRows(classes.rows);
    const reconcile = activeProgrammeId && programmeAssignment.ok && authoritative
      && reconcileAcknowledgments.data.activeProgrammeId === activeProgrammeId;
    const result = await repositories.classEaAssignments.saveServerRows(classEaAssignments.rows, reconcile ? {
      reconcile: { userId, programmeId: activeProgrammeId, pulledAt, bypassBreaker, acknowledgedClassIds: reconcileAcknowledgments.data.classIds },
    } : {});
    if (reconcile) reconciles.push(result);
  }
  if (pullCanBeStamped(pulled, reconciles)) await repositories.syncState.setPullState('classes_pull', { lastPulledAt: pulledAt });
  return { ...pulled, reconcileResults: reconciles };
};

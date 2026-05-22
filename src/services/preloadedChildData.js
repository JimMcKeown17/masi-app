import { supabase } from './supabaseClient';
import { enqueueSupabaseRequest } from './supabaseRequestQueue';

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

const collectResult = async (scope, task, errors) => {
  try {
    const { data, error } = await task();
    if (error) {
      errors.push({ scope, message: error.message || String(error) });
      return null;
    }
    return data || [];
  } catch (error) {
    errors.push({ scope, message: error.message || String(error) });
    return null;
  }
};

export const pullPreloadedChildData = async ({
  userId,
  supabaseClient = supabase,
} = {}) => enqueueSupabaseRequest(async () => {
  const errors = [];

  const programmeRows = await collectResult('programmeAssignment', () => (
    supabaseClient
      .from('staff_programme_assignments')
      .select('programme_id')
      .eq('user_id', userId)
      .is('ended_at', null)
      .order('assigned_at', { ascending: false })
      .limit(1)
  ), errors);
  const activeProgrammeId = programmeRows?.[0]?.programme_id;

  if (!activeProgrammeId) {
    return {
      children: [],
      groups: [],
      childrenGroups: [],
      errors,
    };
  }

  const childRows = await collectResult('children', () => (
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
  ), errors);

  let classMembershipRows = [];
  if (Array.isArray(childRows) && childRows.length > 0) {
    const childIds = childRows.map(child => child.id);
    classMembershipRows = await collectResult('childClassMemberships', () => (
      supabaseClient
        .from('child_class_memberships')
        .select('*, classes(*)')
        .in('child_id', childIds)
        .is('exited_at', null)
    ), errors);
  }

  const groupRows = await collectResult('groups', () => (
    supabaseClient
      .from('groups')
      .select(`
        *,
        group_ea_assignments!inner(ea_user_id,unassigned_at)
      `)
      .eq('group_ea_assignments.ea_user_id', userId)
      .is('group_ea_assignments.unassigned_at', null)
      .eq('programme_id', activeProgrammeId)
      .order('name', { ascending: true })
  ), errors);

  let membershipRows = [];
  if (Array.isArray(groupRows) && groupRows.length > 0) {
    const groupIds = groupRows.map(group => group.id);
    membershipRows = await collectResult('childrenGroups', () => (
      supabaseClient
        .from('child_group_memberships')
        .select('*')
        .in('group_id', groupIds)
        .is('removed_at', null)
    ), errors);
  }

  return {
    children: Array.isArray(childRows)
      ? childRows.map(row => stripJoins(row, ['child_ea_assignments', 'child_programme_enrollments']))
      : null,
    classes: Array.isArray(classMembershipRows)
      ? uniqueById(classMembershipRows.map(row => row.classes).filter(Boolean).map(markSynced))
      : null,
    childEaAssignments: Array.isArray(childRows)
      ? collectJoinRows(childRows, 'child_ea_assignments')
      : null,
    childProgrammeEnrollments: Array.isArray(childRows)
      ? collectJoinRows(childRows, 'child_programme_enrollments')
      : null,
    childClassMemberships: Array.isArray(classMembershipRows)
      ? classMembershipRows.map(row => stripJoins(row, ['classes']))
      : null,
    groups: Array.isArray(groupRows)
      ? groupRows.map(row => stripJoins(row, ['group_ea_assignments']))
      : null,
    childrenGroups: Array.isArray(membershipRows)
      ? membershipRows.map(markSynced)
      : null,
    errors,
  };
});

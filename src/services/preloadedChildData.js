import { supabase } from './supabaseClient';
import { enqueueSupabaseRequest } from './supabaseRequestQueue';

const stripJoins = (row, joinKeys) => {
  const next = { ...row };
  for (const key of joinKeys) {
    delete next[key];
  }
  return {
    ...next,
    synced: true,
    sync_status: next.sync_status || 'synced',
  };
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

  const childRows = await collectResult('children', () => (
    supabaseClient
      .from('children')
      .select(`
        *,
        child_ea_assignments!inner(user_id,unassigned_at)
      `)
      .eq('child_ea_assignments.user_id', userId)
      .is('child_ea_assignments.unassigned_at', null)
      .order('first_name', { ascending: true })
  ), errors);

  const groupRows = await collectResult('groups', () => (
    supabaseClient
      .from('groups')
      .select(`
        *,
        group_ea_assignments!inner(ea_user_id,unassigned_at)
      `)
      .eq('group_ea_assignments.ea_user_id', userId)
      .is('group_ea_assignments.unassigned_at', null)
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
      ? childRows.map(row => stripJoins(row, ['child_ea_assignments']))
      : null,
    groups: Array.isArray(groupRows)
      ? groupRows.map(row => stripJoins(row, ['group_ea_assignments']))
      : null,
    childrenGroups: Array.isArray(membershipRows)
      ? membershipRows.map(row => ({ ...row, synced: true, sync_status: row.sync_status || 'synced' }))
      : null,
    errors,
  };
});

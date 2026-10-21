import { createSupabaseMock } from './supabaseSyncMock';

// Stateful FK/C19 and retry boundary only. The disposable PostgreSQL harness proves real policies.
export const createSessionGroupServer = ({
  actorId = 'user-1', initialRows = {}, failGroupInserts = 0, failGroupAssignmentInserts = 0,
} = {}) => {
  const rows = {};
  const tableRows = (table) => {
    if (!rows[table]) rows[table] = new Map();
    return rows[table];
  };
  for (const table of ['groups', 'group_ea_assignments', 'sessions', 'session_attendees', ...Object.keys(initialRows)]) {
    rows[table] = new Map((initialRows[table] || []).map(row => [row.id, { ...row }]));
  }
  const upsertResults = {};
  const updateResults = {};
  const lostResponses = new Set();
  const { supabaseClient: base, calls } = createSupabaseMock({ upsertResults, updateResults });

  const groupError = (table, row) => {
    if (!['sessions', 'session_attendees'].includes(table) || row.group_id == null) return null;
    const group = rows.groups.get(row.group_id);
    if (!group) return { code: '23503', message: 'group_id violates foreign key constraint' };
    const programmeId = table === 'sessions'
      ? row.programme_id : rows.sessions.get(row.session_id)?.programme_id;
    const held = [...rows.group_ea_assignments.values()].some(assignment => (
      assignment.group_id === row.group_id && assignment.ea_user_id === actorId
    ));
    if (group.programme_id !== programmeId || !held) {
      return { code: '42501', message: `new row violates row-level security policy for table "${table}"` };
    }
    return null;
  };

  const upsert = ({ tableName, payload, options }) => {
    if (tableName === 'groups' && failGroupInserts > 0) {
      failGroupInserts -= 1;
      return { error: { message: 'Network request failed' } };
    }
    if (tableName === 'group_ea_assignments' && failGroupAssignmentInserts > 0) {
      failGroupAssignmentInserts -= 1;
      return { error: { message: 'Network request failed' } };
    }
    const proposed = Array.isArray(payload) ? payload : [payload];
    // Validate the whole batch before committing any row.
    for (const row of proposed) {
      const error = groupError(tableName, row);
      if (error) return { error };
      if (tableName === 'sessions' && tableRows(tableName).has(row.id) && !options?.ignoreDuplicates
        && ![...rows.session_attendees.values()].some(attendee => attendee.session_id === row.id)) {
        return { error: {
          code: '42501',
          message: 'new row violates row-level security policy (USING expression) for table "sessions"',
        } };
      }
    }
    const stored = tableRows(tableName);
    for (const row of proposed) {
      if (options?.ignoreDuplicates && stored.has(row.id)) continue;
      stored.set(row.id, { ...stored.get(row.id), ...row });
    }
    if (proposed.map(row => lostResponses.delete(`${tableName}:${row.id}`)).some(Boolean)) {
      throw new Error('Network request failed: response lost after commit');
    }
    return { error: null };
  };

  const update = ({ tableName, payload, column, value }) => {
    const stored = tableRows(tableName);
    const row = [...stored.values()].find(candidate => candidate[column] === value);
    if (!row) return { data: [], error: null };
    stored.set(row.id, { ...row, ...payload });
    return { data: [{ id: row.id }], error: null };
  };

  const supabaseClient = {
    ...base,
    from: (table) => {
      tableRows(table);
      upsertResults[table] = upsert;
      updateResults[table] = update;
      return base.from(table);
    },
  };
  const endAssignment = (groupId) => {
    for (const [id, row] of rows.group_ea_assignments) {
      if (row.group_id === groupId) {
        rows.group_ea_assignments.set(id, { ...row, unassigned_at: new Date().toISOString() });
      }
    }
  };
  return {
    supabaseClient, rows, calls, endAssignment,
    loseNextResponse: (tableName, id) => lostResponses.add(`${tableName}:${id}`),
  };
};

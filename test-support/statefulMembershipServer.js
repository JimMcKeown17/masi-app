import { createSupabaseMock } from './supabaseSyncMock';

// Only the membership table is stateful. This models commits and lost responses, not RLS.
export const createStatefulMembershipServer = ({ initialRows = [], afterCommit } = {}) => {
  const rows = new Map(initialRows.map(row => [row.id, { ...row }]));
  const lostResponses = new Set();
  const { supabaseClient: fallback, calls } = createSupabaseMock();
  const tableName = 'child_class_memberships';
  const project = (row, columns) => columns === '*'
    ? { ...row }
    : Object.fromEntries(columns.split(',').map(column => [column.trim(), row[column.trim()]]));

  const query = (type, payload, initialColumns) => {
    const filters = [];
    let columns = initialColumns;
    let rowLimit = Infinity;
    let result;
    const builder = {
      eq: (column, value) => { filters.push({ column, value }); return builder; },
      is: (column, value) => { filters.push({ column, value }); return builder; },
      limit: value => { rowLimit = value; return builder; },
      select: value => { columns = value; return builder; },
      then: (resolve, reject) => {
        if (!result) {
          result = Promise.resolve().then(() => {
            calls.push({ type, tableName, payload, filters: [...filters] });
            const matched = [...rows.values()].filter(row => (
              filters.every(({ column, value }) => row[column] === value)
            )).slice(0, rowLimit);
            if (type === 'update') {
              for (const row of matched) rows.set(row.id, { ...row, ...payload });
            }
            return {
              data: columns ? matched.map(row => project(rows.get(row.id), columns)) : null,
              error: null,
            };
          });
        }
        return result.then(resolve, reject);
      },
    };
    return builder;
  };

  const supabaseClient = {
    ...fallback,
    from: name => name !== tableName ? fallback.from(name) : {
      select: columns => query('select', undefined, columns),
      update: patch => query('update', patch),
      upsert: async (payload, options) => {
        calls.push({ type: 'upsert', tableName, payload: { ...payload }, options });
        const next = { exited_at: null, row_version: 1, ...rows.get(payload.id), ...payload };
        const conflict = [...rows.values()].some(row => (
          row.id !== next.id && row.child_id === next.child_id
          && row.academic_year_id === next.academic_year_id
          && row.exited_at === null && next.exited_at === null
        ));
        if (conflict) return { error: { code: '23505', message: 'active membership already exists' } };
        rows.set(next.id, next);
        if (afterCommit) await afterCommit({ payload, rows });
        if (lostResponses.delete(next.id)) throw new Error('Network request failed: response lost after commit');
        return { data: null, error: null };
      },
    },
  };

  return { supabaseClient, rows, calls, loseNextResponse: id => lostResponses.add(id) };
};

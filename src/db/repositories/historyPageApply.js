import { chunkArray, quoteIdentifier, sqlPlaceholders } from './sqliteRepositoryUtils';
import { SERVER_COLUMNS } from '../../services/syncServerColumns';

export const SQLITE_BINDING_BUDGET = 999;

export const selectRowsByIds = async (txn, table, ids, columns = ['*']) => {
  const found = new Map();
  const projection = columns.map((column) => column === '*' ? '*' : quoteIdentifier(column)).join(', ');
  for (const batch of chunkArray([...new Set(ids)], SQLITE_BINDING_BUDGET)) {
    const rows = await txn.getAllAsync(
      `select ${projection} from ${quoteIdentifier(table)} where id in (${sqlPlaceholders(batch.length)})`,
      ...batch
    );
    for (const row of rows) found.set(row.id, row);
  }
  return found;
};

export const insertOrIgnoreRows = async (txn, { table, columns, rows }) => {
  const projection = columns.map(quoteIdentifier).join(', ');
  const tuple = `(${sqlPlaceholders(columns.length)})`;
  for (const batch of chunkArray(rows, Math.floor(SQLITE_BINDING_BUDGET / columns.length))) {
    await txn.runAsync(
      `insert or ignore into ${quoteIdentifier(table)} (${projection}) values ${batch.map(() => tuple).join(', ')}`,
      ...batch.flatMap((row) => columns.map((column) => row[column] ?? null))
    );
  }
};

export const ensureHistoryReferenceChildren = async (txn, identities) => {
  const unique = new Map(identities.map((identity) => [identity.child_id, identity]));
  const existing = await selectRowsByIds(txn, 'children', [...unique.keys()], ['id']);
  const rows = [...unique.values()].filter((identity) => !existing.has(identity.child_id)).map((identity) => ({
    id: identity.child_id, first_name: identity.child_first_name,
    last_name: identity.child_last_name, preferred_name: identity.child_preferred_name ?? null,
    history_reference: 1, sync_status: 'synced',
  }));
  await insertOrIgnoreRows(txn, { table: 'children',
    columns: ['id', 'first_name', 'last_name', 'preferred_name', 'history_reference', 'sync_status'], rows });
  return rows.length;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const refuseRun = (field) => { throw new TypeError(`Invalid pulled run: ${field}`); };
export const assertPulledRunShape = (run) => {
  for (const field of ['id', 'user_id', 'child_id', 'programme_id']) {
    if (typeof run?.[field] !== 'string' || !UUID.test(run[field])) refuseRun(field);
  }
  if (!['in_progress', 'completed', 'abandoned'].includes(run.status)) refuseRun('status');
  if (run.status === 'completed'
    ? typeof run.completed_at !== 'string' || !run.completed_at.length
    : run.completed_at != null) refuseRun('completed_at');
  if (typeof run.started_at !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(run.started_at)
    || !Number.isFinite(Date.parse(run.started_at))) refuseRun('started_at');
  // Date.parse normalizes dates such as February 30. Reject those without changing
  // the original server timestamp, whose microseconds must be stored verbatim.
  const datePart = run.started_at.slice(0, 10);
  const day = Date.parse(`${datePart}T00:00:00Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== datePart) refuseRun('started_at');
  if (typeof run.language !== 'string' || !/^[a-z]{2}$/.test(run.language)) refuseRun('language');
};

export const mergePulledRunHeaders = async (txn, runs) => {
  const unique = [...new Map(runs.map((run) => [run.id, run])).values()];
  const existing = await selectRowsByIds(txn, 'battery_runs', unique.map((run) => run.id), ['id', 'started_here', 'status']);
  const absent = unique.filter((run) => !existing.has(run.id));
  await insertOrIgnoreRows(txn, {
    table: 'battery_runs', columns: [...SERVER_COLUMNS.battery_runs, 'started_here', 'sync_status', 'server_updated_at'],
    rows: absent.map((run) => ({ ...run, started_here: 0, sync_status: 'synced', server_updated_at: run.updated_at })),
  });
  const advancing = unique.filter((run) => {
    const local = existing.get(run.id);
    return local?.started_here === 0 && local.status === 'in_progress'
      && ['completed', 'abandoned'].includes(run.status);
  });
  // Only these four columns advance. A CTE keeps terminal merges set-wise too, and each
  // call remains one statement on the signed-in transaction facade (four binds per run).
  for (const batch of chunkArray(advancing, Math.floor(SQLITE_BINDING_BUDGET / 4))) {
    await txn.runAsync(`
      with incoming(id, status, completed_at, updated_at) as (values ${batch.map(() => '(?, ?, ?, ?)').join(', ')})
      update battery_runs set
        status = (select status from incoming where incoming.id = battery_runs.id),
        completed_at = (select completed_at from incoming where incoming.id = battery_runs.id),
        updated_at = (select updated_at from incoming where incoming.id = battery_runs.id),
        server_updated_at = (select updated_at from incoming where incoming.id = battery_runs.id)
      where id in (select id from incoming)
    `, ...batch.flatMap((run) => [run.id, run.status, run.completed_at ?? null, run.updated_at]));
  }
  return { inserted: absent.length, advanced: advancing.length };
};

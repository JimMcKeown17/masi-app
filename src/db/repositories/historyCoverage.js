import { createSyncStateRepository } from './syncStateRepository';
import { decodeJson } from './sqliteRepositoryUtils';

export const coverageFields = (key) => {
  const suffix = key === 'childIds' ? 'ChildIds' : 'ClassIds';
  return ['rescan' + suffix, 'rewalk' + suffix, 'firstWalk' + suffix];
};

// Preserve snapshots and ordering, but never retain a grant that this writer cannot see.
export const boundHistoryCoverage = (cursorState, current, coverageKeys) => {
  const bounded = { ...cursorState };
  for (const key of coverageKeys) {
    const granted = new Set(current[key] || []);
    for (const field of coverageFields(key)) {
      if (bounded[field] != null) bounded[field] = bounded[field].filter((id) => granted.has(id));
    }
  }
  return bounded;
};

export const resolveHistoryPullState = async (txn, pullState) => (
  typeof pullState === 'function' ? await pullState(txn) : pullState
);

// Handover uses the same writer transaction as its local deletion. Never create a cursor.
export const removeFromHistoryCoverage = async (txn, { scope, coverageKey, ids }) => {
  const row = await txn.getFirstAsync('select last_pulled_at, cursor from sync_state where scope = ?', scope);
  if (!row || !ids.length) return false;
  const cursor = decodeJson(row.cursor, null);
  if (!cursor) return false;
  const removed = new Set(ids);
  let changed = false;
  const next = { ...cursor };
  for (const field of coverageFields(coverageKey)) {
    if (next[field] == null) continue;
    const kept = next[field].filter((id) => !removed.has(id));
    if (kept.length !== next[field].length) changed = true;
    next[field] = kept;
  }
  if (!changed) return false;
  await createSyncStateRepository({ database: txn }).setPullState(scope, {
    lastPulledAt: row.last_pulled_at, cursor: JSON.stringify(next),
  }, { transaction: txn });
  return true;
};

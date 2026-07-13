import { getDatabase, withTransaction } from '../client';
import { runMigrations } from '../migrations';
import { runWithTransaction } from './sqliteRepositoryUtils';

export const resolveDatabase = async (database) => {
  if (database) {
    // Test / injected-db path: migrate the supplied connection.
    await runMigrations(database);
    return database;
  }
  // Production: client.initialize() already ran migrations on the writer during bootstrap;
  // getDatabase() returns the read-only reader. Do NOT run migrations here (the reader is
  // query_only and would throw).
  return getDatabase();
};

export const runRepositoryTransaction = async (database, task) => {
  if (database) {
    const db = await resolveDatabase(database);
    return runWithTransaction(db, task);
  }
  // Production writes go through the persistent writer.
  return withTransaction(async (txn) => task(txn));
};

export const RECONCILE_BREAKER_SCOPE_PREFIX = 'pull_reconcile_breaker:';

const breakerStateScope = (scope) => `${RECONCILE_BREAKER_SCOPE_PREFIX}${scope}`;

export const runReconcileWithMassEndBreaker = async ({
  transaction,
  scope,
  pulledAt,
  bypassBreaker = false,
  countCandidates,
  countWouldEnd,
  apply,
}) => {
  const candidateCount = Number(await countCandidates(transaction)) || 0;
  const wouldEndCount = Number(await countWouldEnd(transaction)) || 0;
  const breakerTripped = wouldEndCount > 10 && wouldEndCount > candidateCount * 0.5;
  const stateScope = breakerStateScope(scope);

  if (breakerTripped && !bypassBreaker) {
    const note = {
      scope,
      candidateCount,
      wouldEndCount,
      triggeredAt: pulledAt,
    };
    await transaction.runAsync(`
      insert into sync_state (scope, last_pulled_at, cursor, updated_at)
      values (?, null, ?, ?)
      on conflict(scope) do update set
        last_pulled_at = null,
        cursor = excluded.cursor,
        updated_at = excluded.updated_at
    `, stateScope, JSON.stringify(note), pulledAt);
    console.error(
      `[Pull reconcile breaker] ${scope} would end ${wouldEndCount} of ${candidateCount} active synced rows; reconcile skipped`
    );
    return { ended: 0, reconcileCompleted: false };
  }

  const ended = Number(await apply(transaction)) || 0;
  await transaction.runAsync('delete from sync_state where scope = ?', stateScope);
  return { ended, reconcileCompleted: true };
};

export const runBatchWithPerRowFallback = async ({
  database,
  rows,
  saveRow,
  tableName,
  reconcile,
}) => {
  const applyRows = async (transaction) => {
    let applied = 0;
    let skipped = 0;
    for (const row of rows) {
      if (await saveRow(row, { transaction }) === false) {
        skipped += 1;
      } else {
        applied += 1;
      }
    }
    const reconcileResult = reconcile
      ? await reconcile(transaction)
      : { ended: 0, reconcileCompleted: false };
    return {
      applied,
      skipped,
      failed: 0,
      ended: reconcileResult.ended,
      fallbackUsed: false,
      reconcileCompleted: reconcileResult.reconcileCompleted,
    };
  };

  try {
    return await runRepositoryTransaction(database, applyRows);
  } catch (batchError) {
    console.error(
      `Pulled ${tableName} batch transaction failed; retrying rows without reconcile: ${batchError?.message || batchError}`
    );
    let applied = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        if (await saveRow(row) === false) {
          skipped += 1;
        } else {
          applied += 1;
        }
      } catch (error) {
        failed += 1;
        console.error(
          `Pulled ${tableName} row ${row?.id || '<unknown>'} failed local persistence: ${error?.message || error}`
        );
      }
    }
    return {
      applied,
      skipped,
      failed,
      ended: 0,
      fallbackUsed: true,
      reconcileCompleted: false,
    };
  }
};

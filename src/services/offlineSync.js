import { supabase } from './supabaseClient';
import { storage } from '../utils/storage';

/**
 * Offline Sync Service
 *
 * Handles syncing local data to Supabase with:
 * - Exponential backoff retry logic
 * - Last-write-wins conflict resolution
 * - Batch processing
 * - Error tracking
 */

const MAX_RETRY_ATTEMPTS = 5;
const BASE_RETRY_DELAY = 5000; // 5 seconds

// Table configuration for sync
const SYNC_TABLES = {
  TIME_ENTRIES: {
    key: 'TIME_ENTRIES',
    table: 'time_entries',
    getRecords: () => storage.getUnsyncedRecords('TIME_ENTRIES'),
  },
  SESSIONS: {
    key: 'SESSIONS',
    table: 'sessions',
    getRecords: () => storage.getUnsyncedRecords('SESSIONS'),
  },
  CLASSES: {
    key: 'CLASSES',
    table: 'classes',
    getRecords: () => storage.getUnsyncedClasses(),
    onConflict: 'staff_id,name,school_id',
  },
  CHILDREN: {
    key: 'CHILDREN',
    table: 'children',
    getRecords: () => storage.getUnsyncedChildren(),
  },
  STAFF_CHILDREN: {
    key: 'STAFF_CHILDREN',
    table: 'staff_children',
    getRecords: () => storage.getUnsyncedStaffChildren(),
    onConflict: 'staff_id,child_id',
  },
  GROUPS: {
    key: 'GROUPS',
    table: 'groups',
    getRecords: () => storage.getUnsyncedGroups(),
  },
  CHILDREN_GROUPS: {
    key: 'CHILDREN_GROUPS',
    table: 'children_groups',
    getRecords: () => storage.getUnsyncedChildrenGroups(),
    onConflict: 'child_id,group_id',
  },
  ASSESSMENTS: {
    key: 'ASSESSMENTS',
    table: 'assessments',
    getRecords: () => storage.getUnsyncedRecords('ASSESSMENTS'),
  },
  LETTER_MASTERY: {
    key: 'LETTER_MASTERY',
    table: 'letter_mastery',
    getRecords: () => storage.getUnsyncedLetterMastery(),
    onConflict: 'user_id,child_id,letter,language',
  },
};

/**
 * Calculate exponential backoff delay
 * Attempt 1: 0ms (immediate)
 * Attempt 2: 5s
 * Attempt 3: 15s (3x previous)
 * Attempt 4: 45s
 * Attempt 5: 135s (~2 minutes)
 */
const getRetryDelay = (attemptNumber) => {
  if (attemptNumber === 1) return 0;
  return BASE_RETRY_DELAY * Math.pow(3, attemptNumber - 2);
};

/**
 * Classify whether a Supabase/Postgres error is terminal (will never succeed on retry).
 * @returns {{ terminal: boolean, markAsSynced: boolean }}
 *   - terminal: stop retrying immediately
 *   - markAsSynced: the record effectively exists on server (treat as success)
 */
const classifyError = (error) => {
  const code = error?.code;

  // 23505: unique_violation — record already exists on server
  // (e.g., same child_id+group_id with different UUID). This is a success case.
  if (code === '23505') {
    return { terminal: true, markAsSynced: true };
  }

  // 23503: foreign_key_violation — parent record doesn't exist on server.
  // Retrying won't help unless parent syncs first.
  if (code === '23503') {
    return { terminal: true, markAsSynced: false };
  }

  // 42501: RLS violation — user doesn't have permission.
  // Retrying with same auth won't help.
  if (code === '42501') {
    return { terminal: true, markAsSynced: false };
  }

  // Everything else (network errors, timeouts, etc.) is retriable
  return { terminal: false, markAsSynced: false };
};

/**
 * Sync a single record to Supabase
 * Uses upsert for last-write-wins conflict resolution
 * @param {string} conflictTarget - Column(s) for ON CONFLICT, defaults to 'id'
 */
const syncRecord = async (tableName, record, conflictTarget = 'id') => {
  try {
    // Remove local-only fields before syncing
    const { synced, _deleted, ...recordData } = record;

    // Upsert: insert if new, update if exists (last-write-wins)
    const { error } = await supabase
      .from(tableName)
      .upsert(recordData, {
        onConflict: conflictTarget,
        ignoreDuplicates: false,
      });

    if (error) throw error;

    return { success: true, error: null };
  } catch (error) {
    console.error(`Error syncing ${tableName} record:`, error);
    return { success: false, error };
  }
};

/**
 * Sync all unsynced records for a given table
 */
const syncTable = async (tableConfig) => {
  const { key, table, getRecords, onConflict } = tableConfig;

  try {
    const unsyncedRecords = await getRecords();

    if (unsyncedRecords.length === 0) {
      return {
        success: true,
        synced: 0,
        failed: 0,
        failedRecords: [],
      };
    }

    console.log(`Syncing ${unsyncedRecords.length} unsynced ${key} records...`);

    const results = {
      synced: 0,
      failed: 0,
      failedRecords: [],
    };

    // Process records one by one
    for (const record of unsyncedRecords) {
      const attemptCount = await storage.getRetryAttempts(key, record.id);

      // Check if we've exceeded max retries
      if (attemptCount >= MAX_RETRY_ATTEMPTS) {
        const lastError = await storage.getLastSyncError(key, record.id);
        const reason = lastError || 'Max retry attempts exceeded';
        console.warn(`Record ${record.id} exceeded max retry attempts. Last error: ${reason}`);
        await storage.addFailedItem(key, record.id, reason);
        results.failed++;
        results.failedRecords.push({
          id: record.id,
          table: key,
          reason,
        });
        continue;
      }

      // Apply exponential backoff delay if this is a retry
      if (attemptCount > 0) {
        const delay = getRetryDelay(attemptCount + 1);
        console.log(`Retry attempt ${attemptCount + 1} for ${record.id}, waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Handle soft-deleted records (e.g., letter_mastery un-teach)
      if (record._deleted) {
        try {
          const { error } = await supabase.from(table).delete().eq('id', record.id);
          if (error) throw error;
          // Hard-remove from local storage after successful server delete
          await storage.removeLetterMasteryRecord(record.id);
          await storage.clearRetryAttempts(key, record.id);
          await storage.clearLastSyncError(key, record.id);
          results.synced++;
          console.log(`✓ Deleted ${key} record ${record.id} from server`);
        } catch (deleteError) {
          const errorMsg = deleteError?.message || deleteError?.code || 'Delete failed';
          await storage.recordRetryAttempt(key, record.id);
          await storage.setLastSyncError(key, record.id, errorMsg);
          results.failed++;
          results.failedRecords.push({
            id: record.id,
            table: key,
            error: errorMsg,
            attemptCount: attemptCount + 1,
          });
          console.error(`✗ Failed to delete ${key} record ${record.id}: ${errorMsg}`);
        }
        continue;
      }

      // Attempt to sync the record
      const result = await syncRecord(table, record, onConflict);

      if (result.success) {
        // Mark as synced in local storage
        await storage.markAsSynced(key, record.id);
        await storage.clearRetryAttempts(key, record.id);
        await storage.clearLastSyncError(key, record.id);
        results.synced++;
        console.log(`✓ Synced ${key} record ${record.id}`);
      } else {
        const errorMsg = result.error?.message || result.error?.code || 'Unknown error';
        const classification = classifyError(result.error);

        if (classification.terminal) {
          if (classification.markAsSynced) {
            // 23505: record already exists on server — treat as success
            await storage.markAsSynced(key, record.id);
            await storage.clearRetryAttempts(key, record.id);
            await storage.clearLastSyncError(key, record.id);
            results.synced++;
            console.log(`✓ ${key} record ${record.id} already exists on server (${result.error?.code}), marking synced`);
          } else {
            // 23503/42501: terminal error — quarantine immediately, no retries
            await storage.addFailedItem(key, record.id, `TERMINAL: ${errorMsg}`);
            await storage.markAsSynced(key, record.id);
            await storage.clearRetryAttempts(key, record.id);
            results.failed++;
            results.failedRecords.push({ id: record.id, table: key, reason: `TERMINAL: ${errorMsg}` });
            console.warn(`✗ TERMINAL error for ${key} record ${record.id}: ${errorMsg}`);
          }
        } else {
          // Retriable error — existing backoff logic
          await storage.recordRetryAttempt(key, record.id);
          await storage.setLastSyncError(key, record.id, errorMsg);
          results.failed++;
          results.failedRecords.push({
            id: record.id,
            table: key,
            error: errorMsg,
            attemptCount: attemptCount + 1,
          });
          console.error(`✗ Failed to sync ${key} record ${record.id}: ${errorMsg}`);
        }
      }
    }

    return {
      success: results.failed === 0,
      synced: results.synced,
      failed: results.failed,
      failedRecords: results.failedRecords,
    };
  } catch (error) {
    console.error(`Error syncing table ${key}:`, error);
    return {
      success: false,
      synced: 0,
      failed: -1,
      failedRecords: [],
      error,
    };
  }
};

// Explicit sync order — parent tables before their junction tables.
// Using an array instead of relying on object property iteration order.
const SYNC_ORDER = [
  'TIME_ENTRIES',
  'SESSIONS',
  'CLASSES',
  'CHILDREN',
  'GROUPS',
  'STAFF_CHILDREN',      // depends on CHILDREN
  'CHILDREN_GROUPS',     // depends on CHILDREN and GROUPS
  'ASSESSMENTS',
  'LETTER_MASTERY',
];

// Junction tables and the parent tables they depend on.
// If a parent fails, its dependents are skipped in this sync cycle.
const JUNCTION_DEPENDENCIES = {
  STAFF_CHILDREN: ['CHILDREN'],
  CHILDREN_GROUPS: ['CHILDREN', 'GROUPS'],
};

/**
 * Sync all tables
 * Returns aggregated results
 */
export const syncAll = async () => {
  console.log('Starting full sync...');

  const startTime = Date.now();
  const results = {
    success: true,
    totalSynced: 0,
    totalFailed: 0,
    failedRecords: [],
    tableResults: {},
  };

  const tablesWithFailures = new Set();

  for (const tableName of SYNC_ORDER) {
    const config = SYNC_TABLES[tableName];
    if (!config) continue;

    // Skip junction tables whose parent table had failures this cycle
    const deps = JUNCTION_DEPENDENCIES[tableName] || [];
    if (deps.some(dep => tablesWithFailures.has(dep))) {
      console.log(`⏭ Skipping ${tableName}: parent table(s) had failures this cycle`);
      results.tableResults[tableName] = { success: false, synced: 0, failed: 0, skipped: true };
      continue;
    }

    const tableResult = await syncTable(config);

    results.tableResults[tableName] = tableResult;
    results.totalSynced += tableResult.synced;
    results.totalFailed += tableResult.failed;
    results.failedRecords.push(...tableResult.failedRecords);

    if (!tableResult.success) {
      results.success = false;
      tablesWithFailures.add(tableName);
    }
  }

  // Update sync metadata
  const now = new Date().toISOString();
  const metaUpdate = { lastSyncTime: now };
  if (results.success) {
    metaUpdate.lastSuccessfulSyncTime = now;
  }
  await storage.updateSyncMeta(metaUpdate);

  const duration = Date.now() - startTime;
  console.log(`Sync complete in ${duration}ms: ${results.totalSynced} synced, ${results.totalFailed} failed`);

  return results;
};

/**
 * Sync a specific table
 */
export const syncTableByName = async (tableName) => {
  const tableConfig = SYNC_TABLES[tableName.toUpperCase()];

  if (!tableConfig) {
    throw new Error(`Unknown table: ${tableName}`);
  }

  return await syncTable(tableConfig);
};

/**
 * Get sync status (unsynced count, last sync time, etc.)
 */
export const getSyncStatus = async () => {
  const unsyncedCount = await storage.getAllUnsyncedCount();
  const syncMeta = await storage.getSyncMeta();

  // Get breakdown by table
  const breakdown = {};
  for (const [tableName, config] of Object.entries(SYNC_TABLES)) {
    const unsynced = await config.getRecords();
    breakdown[tableName] = unsynced.length;
  }

  return {
    unsyncedCount,
    lastSyncTime: syncMeta.lastSyncTime,
    lastSuccessfulSyncTime: syncMeta.lastSuccessfulSyncTime || null,
    breakdown,
    retryAttempts: syncMeta.retryAttempts,
    failedItems: syncMeta.failedItems || [],
  };
};

/**
 * Clear all sync metadata (useful for debugging)
 */
export const resetSyncMeta = async () => {
  await storage.updateSyncMeta({
    lastSyncTime: null,
    lastSuccessfulSyncTime: null,
    retryAttempts: {},
    failedItems: [],
  });
};

/**
 * Retry a previously failed item by clearing its failed state.
 * Does NOT trigger a sync — the caller is responsible for that
 * to avoid circular dependencies with OfflineContext.
 */
export const retryFailedItem = async (table, id) => {
  await storage.removeFailedItem(table, id);
  await storage.clearLastSyncError(table, id);
};

/**
 * One-time repair: find junction records (staff_children, children_groups)
 * stuck with FK errors because their parent child record was dropped from
 * local storage by the old loadChildren() merge bug.
 *
 * For each failed junction record referencing a child_id:
 *   - If the child exists locally as synced:true, mark it synced:false to re-sync
 *   - Clear retry/failed state on the junction records so they get a fresh attempt
 *
 * Runs once per device (gated by orphanRepairDone flag in sync metadata).
 */
export const repairOrphanedJunctions = async () => {
  try {
    const meta = await storage.getSyncMeta();
    if (meta.orphanRepairDone) return;

    const failedItems = meta.failedItems || [];
    if (failedItems.length === 0) {
      await storage.updateSyncMeta({ orphanRepairDone: true });
      return;
    }

    const children = await storage.getChildren();
    const staffChildren = await storage.getStaffChildren();
    const childrenGroups = await storage.getChildrenGroups();

    // Collect child_ids from failed junction records
    const childIdsToRepair = new Set();
    const junctionItemsToReset = [];

    for (const item of failedItems) {
      if (item.table === 'STAFF_CHILDREN' || item.table === 'CHILDREN_GROUPS') {
        const records = item.table === 'STAFF_CHILDREN' ? staffChildren : childrenGroups;
        const record = records.find(r => r.id === item.id);
        if (record?.child_id) {
          childIdsToRepair.add(record.child_id);
          junctionItemsToReset.push(item);
        }
      }
    }

    if (childIdsToRepair.size === 0) {
      await storage.updateSyncMeta({ orphanRepairDone: true });
      return;
    }

    // Mark referenced children as unsynced so they re-sync to server.
    // If the child was dropped from local storage by the old merge bug,
    // try to recover it from the server (it may have synced before being dropped).
    let repaired = 0;
    for (const childId of childIdsToRepair) {
      const child = children.find(c => c.id === childId);
      if (child) {
        // Child exists locally — mark unsynced so it re-syncs
        if (child.synced !== false) {
          await storage.markAsUnsynced('CHILDREN', childId);
        }
        repaired++;
      } else {
        // Child was dropped from local storage — try to recover from server
        try {
          const { data } = await supabase
            .from('children')
            .select('*')
            .eq('id', childId)
            .single();

          if (data) {
            // Re-add to local storage as synced (it's already on the server)
            await storage.saveChild({ ...data, synced: true });
            repaired++;
            console.log(`Orphan repair: recovered child ${childId} from server`);
          }
        } catch (fetchErr) {
          console.warn(`Orphan repair: could not recover child ${childId} from server:`, fetchErr);
        }
      }
    }

    // Reset failed/retry state on junction records so they retry after parent syncs
    for (const item of junctionItemsToReset) {
      await storage.removeFailedItem(item.table, item.id);
      await storage.clearLastSyncError(item.table, item.id);
      await storage.markAsUnsynced(item.table, item.id);
    }

    await storage.updateSyncMeta({ orphanRepairDone: true });
    console.log(`Orphan repair: re-queued ${repaired} children and ${junctionItemsToReset.length} junction records`);
  } catch (error) {
    console.error('Error in repairOrphanedJunctions:', error);
    // Don't block startup — repair will retry next launch
  }
};

/**
 * Fetch schools from Supabase and cache locally.
 * Schools are admin-managed (read-only for workers), so this is NOT
 * part of SYNC_TABLES — it's a one-way fetch, not an upsert.
 */
export const fetchAndCacheSchools = async () => {
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .order('name');

  if (error) throw error;
  await storage.setSchools(data || []);
  return data || [];
};

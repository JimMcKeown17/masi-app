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
 * Sync a single record to Supabase
 * Uses upsert for last-write-wins conflict resolution
 */
const syncRecord = async (tableName, record) => {
  try {
    // Remove local-only fields before syncing
    const { synced, ...recordData } = record;

    // Upsert: insert if new, update if exists (last-write-wins)
    const { error } = await supabase
      .from(tableName)
      .upsert(recordData, {
        onConflict: 'id',
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
  const { key, table, getRecords } = tableConfig;

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

      // Attempt to sync the record
      const result = await syncRecord(table, record);

      if (result.success) {
        // Mark as synced in local storage
        await storage.markAsSynced(key, record.id);
        await storage.clearRetryAttempts(key, record.id);
        await storage.clearLastSyncError(key, record.id);
        results.synced++;
        console.log(`✓ Synced ${key} record ${record.id}`);
      } else {
        // Record the retry attempt and store the actual error
        const errorMsg = result.error?.message || result.error?.code || 'Unknown error';
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

  // Sync each table
  for (const [tableName, config] of Object.entries(SYNC_TABLES)) {
    const tableResult = await syncTable(config);

    results.tableResults[tableName] = tableResult;
    results.totalSynced += tableResult.synced;
    results.totalFailed += tableResult.failed;
    results.failedRecords.push(...tableResult.failedRecords);

    if (!tableResult.success) {
      results.success = false;
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

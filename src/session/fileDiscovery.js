import { openDatabaseAsync, defaultDatabaseDirectory } from 'expo-sqlite';
import { Directory, File } from 'expo-file-system/next';
import { DATABASE_FILE_PREFIX, LEGACY_DATABASE_NAME, databaseNameForUser } from '../db/client';
import { readUnsentSummary } from '../db/repositories/syncOutboxRepository';
import { incidentRepeatKey } from '../db/repositories/supportIncidentRepository';
import { readUnderFileFence } from './signedInHandle';
import { isStaleActorError } from './staleActor';

const EA_FILE = new RegExp(`^${DATABASE_FILE_PREFIX}([0-9a-f-]{36})\\.db$`, 'i');

// Follow expo-sqlite's native directory; Android uses filesDir, iOS uses documents.
export const listDatabaseNames = () => {
  try {
    if (defaultDatabaseDirectory == null) return [];
    const uri = String(defaultDatabaseDirectory).startsWith('file://')
      ? String(defaultDatabaseDirectory) : 'file://' + defaultDatabaseDirectory;
    const directory = new Directory(uri);
    if (!directory.exists) return [];
    return directory.list().filter((entry) => entry instanceof File).map((entry) => entry.name);
  } catch (error) {
    console.warn('[FileDiscovery] could not list database files:', error?.message);
    return [];
  }
};

// Read-only and short-lived: another EA's file is never migrated, written, renamed or deleted.
export const readOtherDatabase = async ({ name, openDatabase }) => {
  let db = null;
  try {
    db = await openDatabase(name, { useNewConnection: true });
    await db.execAsync('PRAGMA query_only = ON');
    await db.execAsync('PRAGMA busy_timeout = 2000');
    return { name, readable: true, unsent: await readUnsentSummary(db) };
  } catch (error) {
    console.warn('[FileDiscovery] unreadable database file skipped:', name, error?.message);
    return { name, readable: false };
  } finally {
    try { await db?.closeAsync(); } catch (_) { /* best effort */ }
  }
};

export const discoverOtherDatabases = async ({
  signedInUserId, listNames, openDatabase,
  isActive = () => true, readUnderFence = (name, task) => task(),
}) => {
  const ownName = databaseNameForUser(signedInUserId);
  const results = [];
  for (const name of listNames()) {
    const eaMatch = EA_FILE.exec(name);
    const isLegacy = name === LEGACY_DATABASE_NAME;
    if ((!eaMatch && !isLegacy) || name === ownName) continue;
    // After sign-out the signed-out EA's discovery opens nothing more (spec §4.3 storage boundary).
    if (!isActive()) break;
    // Re-check inside the fence: waiting for a disposal can outlast the sign-in that queued this read.
    const read = await readUnderFence(name, () => (
      isActive() ? readOtherDatabase({ name, openDatabase }) : { name, readable: false }
    )).catch(() => ({ name, readable: false })); // that file is fenced as failed: leave it alone
    results.push({ ...read, kind: isLegacy ? 'legacy' : 'ea', strandedUserId: eaMatch ? eaMatch[1] : null });
  }
  return results;
};

const ageHours = (createdAt, now) => Math.max(0, Math.floor((now.getTime() - Date.parse(createdAt)) / 3_600_000));

export const incidentsFromDiscovery = (files, now = new Date()) => files
  .filter((file) => file.readable && file.unsent.total > 0)
  .map(({ kind, strandedUserId, unsent }) => {
    const counts = {
      unsentByTable: unsent.byTable,
      oldestUnsentAgeHours: ageHours(unsent.oldestCreatedAt, now),
    };
    // Ruling 2: the oldest row's id and created_at identify this episode; the key hides both.
    return kind === 'legacy'
      ? {
        kind: 'legacy_shared_file_unsent',
        repeatKey: incidentRepeatKey('legacy', unsent.oldestId, unsent.oldestCreatedAt),
        payload: counts,
      }
      : {
        kind: 'left_behind_unsent_work',
        repeatKey: incidentRepeatKey(strandedUserId, unsent.oldestId, unsent.oldestCreatedAt),
        payload: { strandedUserId, ...counts },
      };
  });

export const discoverAndQueueIncidents = async ({
  handle, listNames = listDatabaseNames, openDatabase = openDatabaseAsync, now = new Date(),
}) => {
  const isActive = () => handle.isOpen() && handle.isCurrent();
  const files = await discoverOtherDatabases({
    signedInUserId: handle.userId, listNames, openDatabase, isActive, readUnderFence: readUnderFileFence,
  });
  if (!isActive()) return { queued: 0 };
  let queued = 0;
  for (const incident of incidentsFromDiscovery(files, now)) {
    try {
      const result = await handle.services.repositories.supportIncidents.enqueue(incident);
      if (result.queued) queued += 1;
    } catch (error) {
      if (isStaleActorError(error)) return { queued };
      throw error;
    }
  }
  return { queued };
};

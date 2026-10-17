import { openDatabaseAsync } from 'expo-sqlite';
import { databaseNameForUser, openConfiguredConnections } from '../db/client';
import { createSyncOutboxRepository } from '../db/repositories/syncOutboxRepository';
import { registerHandleFacade } from '../db/repositories/sqliteRepositoryUtils';
import { createStartupRepairRunner } from '../services/startupRepairs';
import { captureOperationalError } from '../services/observability';
import { createHandleRequestQueue } from './handleRequestQueue';
import { createHandleDataClient } from './handleDataClient';
import { supabaseUrl, supabaseAnonKey } from '../services/supabaseClient';
import {
  StaleActorError, NoSignedInEAError, FileOwnerMismatchError, HandleDisposeFailedError,
} from './staleActor';

let currentHandle = null;
let generation = 0;
let epoch = 0;
let transition = Promise.resolve();
let latestRequest = null;
let latestAuthSession = null;
let connectionActors = new WeakMap();
const subscribers = new Set();
const generationWaiters = new Set();
const disposals = new Map();
const failedFiles = new Set();
const revocations = new WeakMap();

export const registerConnectionActor = (connection, userId) => { connectionActors.set(connection, userId); };
export const getConnectionActor = (connection) => connectionActors.get(connection) || null;
export const getLatestAuthSession = () => latestAuthSession;
export const setLatestAuthSession = (session) => { latestAuthSession = session; };
export const getCurrentHandle = () => currentHandle;
export const requireCurrentHandle = () => {
  if (!currentHandle) throw new NoSignedInEAError();
  return currentHandle;
};
export const subscribeToHandle = (listener) => {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
};

const report = (error, category) => {
  // Observability must never interrupt revocation, disposal, or transaction recovery.
  try { console.error(`[SignedInHandle] ${category}`, error?.message || 'Unknown error'); } catch (_) { /* best effort */ }
  try { captureOperationalError(error, { category }); } catch (_) { /* best effort */ }
};
const notify = (listeners, value) => {
  for (const listener of [...listeners]) {
    try { listener(value); } catch (error) { report(error, 'handle_listener_failed'); }
  }
};
const advanceGeneration = () => {
  generation += 1;
  for (const resolve of generationWaiters) resolve();
  generationWaiters.clear();
  return generation;
};

// A sealed queue refuses all work that has not started. Its sole privileged final item is
// disposal; no queued or late continuation can reach the native connection after that item.
const createNativeQueue = (connection) => {
  let tail = Promise.resolve();
  let sealed = false;
  let disposal = null;
  return {
    run(fn) {
      if (sealed) return Promise.reject(new StaleActorError());
      const run = tail.then(() => {
        if (sealed) throw new StaleActorError();
        return fn(connection);
      });
      tail = run.catch(() => {});
      return run;
    },
    seal() { sealed = true; },
    dispose(fn) {
      sealed = true;
      if (!disposal) {
        disposal = tail.then(() => fn(connection));
        tail = disposal.catch(() => {});
      }
      return disposal;
    },
  };
};

// Lex SQL before admission. Quoted strings/identifiers remain opaque tokens, so their
// semicolons and words cannot masquerade as statement boundaries or conflict clauses.
const statementTokens = (sql) => {
  if (typeof sql !== 'string') throw new Error('SQL must be a string');
  const tokens = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (sql.startsWith('--', i)) {
      while (i < sql.length && !/[\r\n]/.test(sql[i])) i += 1;
      continue;
    }
    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) throw new Error('Unterminated SQL comment');
      i = end + 2;
      continue;
    }
    if ("'\"`[".includes(ch)) {
      const endQuote = ch === '[' ? ']' : ch;
      let closed = false;
      i += 1;
      while (i < sql.length) {
        if (sql[i++] !== endQuote) continue;
        if (ch !== '[' && sql[i] === endQuote) { i += 1; continue; }
        closed = true;
        break;
      }
      if (!closed) throw new Error('Unterminated SQL quote');
      tokens.push('<quoted>');
      continue;
    }
    const word = /^[a-z_][a-z0-9_$]*/i.exec(sql.slice(i));
    if (word) { tokens.push(word[0].toUpperCase()); i += word[0].length; }
    else { tokens.push(ch); i += 1; }
  }
  return tokens;
};
const assertAllowedStatement = (sql) => {
  const tokens = statementTokens(sql);
  if (tokens[tokens.length - 1] === ';') tokens.pop();
  const forbidden = tokens.includes(';') || tokens.some((token, index) => (
    token === 'OR' && tokens[index + 1] === 'ROLLBACK'
  ));
  const allowed = ['SELECT', 'WITH', 'INSERT', 'UPDATE', 'DELETE', 'REPLACE'].includes(tokens[0])
    || ['PRAGMA USER_VERSION', 'PRAGMA DEFER_FOREIGN_KEYS = ON'].includes(tokens.join(' '));
  if (forbidden || !allowed) throw new Error('Statement is not allowed on a signed-in database facade');
};
const plainRow = (row) => row == null ? null : Object.fromEntries(Object.entries(row));
const createFacade = (queue, assertOpen) => registerHandleFacade(Object.freeze({
  async runAsync(sql, ...params) {
    assertOpen();
    assertAllowedStatement(sql);
    return queue.run(async (db) => {
      const result = await db.runAsync(sql, ...params);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    });
  },
  async getFirstAsync(sql, ...params) {
    assertOpen();
    assertAllowedStatement(sql);
    return queue.run(async (db) => plainRow(await db.getFirstAsync(sql, ...params)));
  },
  async getAllAsync(sql, ...params) {
    assertOpen();
    assertAllowedStatement(sql);
    return queue.run(async (db) => (await db.getAllAsync(sql, ...params)).map(plainRow));
  },
}));

const noActiveTransaction = (error) => /no transaction is active/i.test(error?.message || '');
const trackDisposal = (fileName, promise) => {
  disposals.set(fileName, promise);
  // Disposal is deliberately detached from sign-out. Keep the rejecting promise for
  // whenDisposed/same-file admission, but always observe its rejection here as well.
  promise.catch(() => {});
  return promise;
};
export const whenDisposed = (fileName) => disposals.get(fileName) || Promise.resolve();

const createHandle = ({ userId, fileName, openDatabase, connections, fetchImpl, timeoutMs }) => {
  const abortController = new AbortController();
  const closeListeners = new Set();
  const bundles = [];
  let state = 'open';
  let handleEpoch = 0;
  let writeTail = Promise.resolve();
  let reopening = null;
  let closePromise = null;
  const assertOpen = () => { if (state !== 'open') throw new StaleActorError(); };

  const wrap = ({ writer, reader }) => {
    const bundle = {
      writerQueue: createNativeQueue(writer), readerQueue: createNativeQueue(reader),
      writerClosed: false, readerClosed: false, disposal: null,
    };
    bundle.reader = createFacade(bundle.readerQueue, assertOpen);
    registerConnectionActor(writer, userId);
    bundles.push(bundle);
    return bundle;
  };
  let bundle = wrap(connections);

  const disposeBundle = (target) => {
    if (target.disposal) return target.disposal;
    target.writerQueue.seal();
    target.readerQueue.seal();
    const watchdog = setTimeout(() => {
      report(new Error('Signed-in database disposal is still pending'), 'handle_close_stalled');
    }, 5_000);
    watchdog?.unref?.();
    const writerDisposal = target.writerQueue.dispose(async (db) => {
      let rollbackError;
      try { await db.execAsync('ROLLBACK'); } catch (error) {
        if (!noActiveTransaction(error)) rollbackError = error;
      }
      try {
        const now = new Date().toISOString();
        await db.runAsync(`insert into local_state (key, value, updated_at)
          values ('last_active_at', ?, ?)
          on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`, now, now);
      } catch (error) { report(error, 'handle_last_active_failed'); }
      await db.closeAsync();
      target.writerClosed = true;
      if (rollbackError) throw rollbackError;
    });
    const readerDisposal = target.readerQueue.dispose(async (db) => {
      await db.closeAsync();
      target.readerClosed = true;
    });
    target.disposal = Promise.allSettled([writerDisposal, readerDisposal]).then((results) => {
      const failure = results.find((result) => result.status === 'rejected');
      if (failure) {
        failedFiles.add(fileName);
        const error = new HandleDisposeFailedError();
        error.cause = failure.reason;
        report(error, 'handle_dispose_failed');
        throw error;
      }
    }).finally(() => clearTimeout(watchdog));
    return trackDisposal(fileName, target.disposal);
  };

  const ensureConnections = async () => {
    assertOpen();
    if (reopening) return reopening;
    if (!bundle.disposal) return bundle;
    // A rollback failure retires this pair. The next transaction opens the SAME file,
    // only after safe disposal. Old captured facades remain sealed permanently.
    reopening = (async () => {
      await bundle.disposal;
      assertOpen();
      let raw;
      try { raw = await openConfiguredConnections({ name: fileName, openDatabase }); } catch (error) {
        if (error.connectionDisposalFailed) failedFiles.add(fileName);
        throw error;
      }
      bundle = wrap(raw);
      if (state !== 'open') {
        await disposeBundle(bundle);
        throw new StaleActorError();
      }
      return bundle;
    })();
    try { return await reopening; } finally { reopening = null; }
  };

  // Non-re-entrant BY CONTRACT: thread the transaction facade into nested work, never
  // call withTransaction from inside its task. An ambient depth flag would reject legitimate
  // concurrent writers; a timeout could let abandoned work commit after reported failure.
  const withTransaction = async (task) => {
    assertOpen();
    const work = writeTail.then(async () => {
      assertOpen();
      const active = await ensureConnections();
      try {
        await active.writerQueue.run((db) => db.execAsync('BEGIN IMMEDIATE'));
        assertOpen();
        let transactionEnded = false;
        const txn = createFacade(active.writerQueue, () => {
          assertOpen();
          if (transactionEnded) throw new Error('Transaction facade used after its transaction ended');
        });
        registerConnectionActor(txn, userId);
        let result;
        try {
          result = await task(txn);
        } finally {
          // Close admission before COMMIT/ROLLBACK; already queued statements still drain first.
          transactionEnded = true;
        }
        assertOpen(); // commit door: no await between this check and queue admission
        await active.writerQueue.run((db) => db.execAsync('COMMIT'));
        return result; // a COMMIT already running at revocation is allowed to finish
      } catch (error) {
        if (state !== 'open') throw new StaleActorError(); // disposal owns the rollback now
        try { await active.writerQueue.run((db) => db.execAsync('ROLLBACK')); } catch (rollbackError) {
          if (state === 'open' && !noActiveTransaction(rollbackError)) disposeBundle(active);
        }
        if (state !== 'open') throw new StaleActorError();
        throw error;
      }
    });
    writeTail = work.catch(() => {});
    return work;
  };
  const requestQueue = createHandleRequestQueue({ isOpen: () => state === 'open' });
  const handle = {
    userId, fileName,
    get state() { return state; },
    get epoch() { return handleEpoch; },
    async getReader() { return (await ensureConnections()).reader; },
    withTransaction,
    isOpen: () => state === 'open',
    isCurrent: () => currentHandle === handle && state === 'open',
    isConnectionClosed: () => bundles.every((item) => item.writerClosed && item.readerClosed),
    enqueueRequest: requestQueue.enqueue,
    requestQueue,
    abortSignal: abortController.signal,
    onClose(listener) {
      if (state === 'closed') notify([listener]);
      else closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
  };
  handle.dataClient = createHandleDataClient({
    handle, supabaseUrl, supabaseKey: supabaseAnonKey, fetchImpl, timeoutMs,
  });
  const revoke = () => {
    if (closePromise) return closePromise;
    state = 'closed';
    handleEpoch = ++epoch;
    for (const item of bundles) { item.writerQueue.seal(); item.readerQueue.seal(); }
    const wasCurrent = currentHandle === handle;
    if (wasCurrent) currentHandle = null;
    // Start disposal before callbacks so reentrant subscribers see its file fence.
    const pending = bundles.map(disposeBundle);
    // A failed attempt to open is not itself a failed disposal. Wait for its cleanup;
    // disposeBundle / openConfiguredConnections record any actual unsafe close separately.
    if (reopening) pending.push(reopening.catch(() => {}));
    closePromise = trackDisposal(fileName, Promise.allSettled(pending).then((results) => {
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
      if (failedFiles.has(fileName)) throw new HandleDisposeFailedError();
    }));
    abortController.abort();
    notify(closeListeners);
    closeListeners.clear();
    if (wasCurrent) notify(subscribers, currentHandle);
    return closePromise;
  };
  revocations.set(handle, revoke);
  return {
    handle,
    publish() { handleEpoch = ++epoch; currentHandle = handle; notify(subscribers, handle); },
  };
};

const waitForFile = async (fileName, myGeneration) => {
  let superseded;
  const changed = new Promise((resolve) => { superseded = resolve; });
  generationWaiters.add(superseded);
  try {
    if (generation !== myGeneration) return;
    // A later request releases this parked transition immediately, even if this file's
    // native close never returns. The next EA never inherits the stalled disposal.
    await Promise.race([whenDisposed(fileName), changed]);
  } finally { generationWaiters.delete(superseded); }
};

export const requestOpen = ({ userId, openDatabase = openDatabaseAsync, fetchImpl, timeoutMs }) => {
  if (latestRequest?.userId === userId && latestRequest.generation === generation) return latestRequest.promise;
  let fileName;
  try { fileName = databaseNameForUser(userId); } catch (error) { return Promise.reject(error); }
  const myGeneration = advanceGeneration();
  const request = { userId, generation: myGeneration, promise: null };
  const result = transition.then(async () => {
    if (generation !== myGeneration) return null;
    if (currentHandle?.userId === userId && currentHandle.isOpen()) return currentHandle;
    if (currentHandle) revocations.get(currentHandle)();
    await waitForFile(fileName, myGeneration);
    if (generation !== myGeneration) return null;
    if (failedFiles.has(fileName)) throw new HandleDisposeFailedError();
    let created;
    try {
      const connections = await openConfiguredConnections({ name: fileName, openDatabase });
      created = createHandle({ userId, fileName, openDatabase, connections, fetchImpl, timeoutMs });
      const { handle } = created;
      const outbox = createSyncOutboxRepository({ database: handle });
      await handle.withTransaction(async (txn) => {
        const owner = await txn.getFirstAsync("select value from local_state where key = 'file_owner_user_id'");
        if (owner && owner.value !== userId) throw new FileOwnerMismatchError(userId, owner.value);
        if (!owner) await txn.runAsync(
          "insert into local_state (key, value, updated_at) values ('file_owner_user_id', ?, ?)",
          userId, new Date().toISOString()
        );
        await outbox.quarantineForeignOwners({ fileUserId: owner?.value || userId, transaction: txn });
      });
      await outbox.resetInFlight({ ownerUserId: userId });
      await createStartupRepairRunner({ database: handle }).run();
      // Repositories import this module's connection-actor lookup. Load the service
      // composition only at open so its repository factories are fully initialized.
      const { createHandleServices } = require('./handleServices');
      handle.services = createHandleServices(handle);
      handle.repositories = handle.services.repositories;
      if (generation !== myGeneration) { revocations.get(handle)(); return null; }
      created.publish();
      return handle;
    } catch (error) {
      if (error.connectionDisposalFailed) failedFiles.add(fileName);
      if (created) revocations.get(created.handle)();
      throw error;
    }
  });
  request.promise = result;
  latestRequest = request;
  transition = result.then(() => {}, () => {});
  result.then((handle) => {
    if (!handle && latestRequest === request) latestRequest = null;
  }, () => { if (latestRequest === request) latestRequest = null; });
  return result;
};

export const requestClose = ({ reason } = {}) => {
  advanceGeneration();
  latestRequest = null;
  const result = transition.then(() => {
    if (currentHandle) revocations.get(currentHandle)();
  });
  transition = result.catch(() => {});
  return result;
};

export const resetHandleRegistryForTests = async () => {
  await requestClose({ reason: 'test reset' });
  await Promise.allSettled([...disposals.values()]);
  disposals.clear();
  failedFiles.clear();
  subscribers.clear();
  generationWaiters.clear();
  connectionActors = new WeakMap();
  latestAuthSession = null;
  latestRequest = null;
  transition = Promise.resolve();
};

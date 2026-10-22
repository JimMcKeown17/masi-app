// Shared durable keyset traversal. Session-specific reads and page apply live in its config.
import { isStaleActorError } from '../session/staleActor';
import { classifyPullFailureKind } from './preloadedChildData';
import { resolveDatabase, runRepositoryTransaction } from '../db/repositories/repositoryRuntime';
import { createSyncStateRepository } from '../db/repositories/syncStateRepository';
import { decodeJson } from '../db/repositories/sqliteRepositoryUtils';
import { boundHistoryCoverage, coverageFields } from '../db/repositories/historyCoverage';

const DAY_MS = 24 * 60 * 60 * 1000;
export const HISTORY_WALK_DEFAULTS = {
  requestTimeoutMs: 15_000, runBudgetMs: 60_000, overlapSeconds: 120,
  stalenessMs: 900_000, rewalkMinMs: 6 * DAY_MS, rewalkJitterMs: 2 * DAY_MS,
};
export const createHistoryWalkState = () => ({ actorGeneration: 0, inFlight: new Map() });
export const resetHistoryWalkState = (state) => {
  state.actorGeneration += 1;
  state.inFlight.clear();
};

class HistoryRunStop extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

// The deadline starts when the request is enqueued, so a hung predecessor in the shared
// queue cannot hold this run. Work that reaches the front after expiry or after an actor
// change never starts.
const withDeadline = ({ enqueueRequest, timeoutMs, isStale, start }) => {
  const controller = new AbortController();
  let expired = false;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      controller.abort();
      reject(new HistoryRunStop('transport', 'Session history request deadline exceeded'));
    }, timeoutMs);
  });
  // Normalize thenable RPC builders and synchronous queue errors into a Promise, so
  // cleanup still runs even when an injected queue executes its task immediately.
  const queued = Promise.resolve().then(() => enqueueRequest(() => {
    if (expired) throw new HistoryRunStop('transport', 'Expired while queued');
    if (isStale()) throw new HistoryRunStop('cancelled', 'Signed-in user changed');
    return start(controller.signal);
  }));
  queued.catch(() => {});
  return Promise.race([queued, deadline]).finally(() => clearTimeout(timer));
};

const runOnce = async ({ userId, force, deps, walk: config }) => {
  const {
    database,
    state: runState,
    repositories,
    client,
    enqueueRequest,
    now = () => Date.now(),
    wallNow = () => Date.now(),
    random = Math.random,
    requestTimeoutMs = HISTORY_WALK_DEFAULTS.requestTimeoutMs,
    runBudgetMs = HISTORY_WALK_DEFAULTS.runBudgetMs,
    onPageSaved = () => {},
  } = deps;
  const generation = runState.actorGeneration;
  const isStale = () => generation !== runState.actorGeneration;
  const stateRepo = repositories?.syncState || createSyncStateRepository({ database });
  const db = await resolveDatabase(database);

  const resolved = await config.resolveScope({ db, userId });
  if (!resolved) return { status: 'dependency', pages: 0 };
  const { scope, windowStart, context } = resolved;
  const stateRow = await db.getFirstAsync('select last_pulled_at, cursor from sync_state where scope = ?', scope);
  const emptyState = {
    windowStart, updatedAt: null, id: null, deltaComplete: false, complete: false,
    firstWalk: true, firstWalkChildIds: null,
    rescanAfter: null, rewalkChildIds: null, rescanCompletedAt: null, nextRewalkAt: null, rescanChildIds: [],
    lastFailureAt: null,
  };
  for (const key of config.coverageKeys) {
    const [rescan, rewalk, firstWalk] = coverageFields(key);
    emptyState[rescan] = [];
    emptyState[rewalk] = null;
    emptyState[firstWalk] = null;
  }
  let state = { ...emptyState, ...(decodeJson(stateRow?.cursor, {}) || {}) };
  let lastPulledAt = stateRow?.last_pulled_at || null;
  if (windowStart !== null && state.windowStart !== windowStart) {
    state = emptyState;
    lastPulledAt = null;
  }

  let currentCoverage = await config.readCoverage({ db, userId, context });
  const wallIso = () => new Date(wallNow()).toISOString();
  // Weekly backstop, jittered 6-8 days per phone so a fleet does not re-walk in one burst.
  // The common case (a handover) is the immediate new-delivery-child trigger below.
  const nextRewalkIso = () => new Date(
    wallNow() + HISTORY_WALK_DEFAULTS.rewalkMinMs + Math.floor(random() * HISTORY_WALK_DEFAULTS.rewalkJitterMs)
  ).toISOString();
  const rewalkDueFor = (candidate, coverage = currentCoverage) => Boolean(candidate.rescanAfter)
    || !candidate.nextRewalkAt
    || wallNow() >= Date.parse(candidate.nextRewalkAt)
    || config.coverageKeys.some((key) => (coverage[key] || []).some(
      (id) => !(candidate[coverageFields(key)[0]] || []).includes(id)
    ));
  const rewalkDue = () => rewalkDueFor(state);

  // A successful page clears this marker. Clock equality (or a clock correction)
  // must not conceal a later failure behind an earlier success.
  const failedSinceSuccess = Boolean(state.lastFailureAt);
  const lastPulledMs = Date.parse(lastPulledAt || '');
  if (!force && state.complete && !failedSinceSuccess && !rewalkDue()
    && Number.isFinite(lastPulledMs) && wallNow() - lastPulledMs < HISTORY_WALK_DEFAULTS.stalenessMs) {
    return { status: 'fresh', pages: 0 };
  }

  const startedAt = now();
  console.log(`[${config.tag}] start forced=${force} mode=${rewalkDue() ? 'rewalk_due' : 'delta'} firstWalk=${state.firstWalk}`);
  const remaining = () => runBudgetMs - (now() - startedAt);
  let rpcMs = 0;
  let saveMs = 0;
  let firstCommitMs = null;
  const request = (rpcName, args) => {
    const requestStarted = config.logTiming ? now() : 0;
    return withDeadline({
      enqueueRequest,
      timeoutMs: requestTimeoutMs,
      isStale,
      start: (signal) => client.rpc(rpcName, args).abortSignal(signal),
    }).then(({ data, error }) => {
      if (isStale()) throw new HistoryRunStop('cancelled', 'Signed-in user changed');
      if (isStaleActorError(error)) throw error;
      if (error) {
        const kind = error.code === 'MR001' ? 'disabled'
          : error.code === 'MR002' ? 'year_mismatch' : classifyPullFailureKind(error);
        throw new HistoryRunStop(kind, error.message || 'RPC failed');
      }
      return data || [];
    }).finally(() => {
      if (config.logTiming) rpcMs += now() - requestStarted;
    });
  };

  // The patch is a function of the current state so completeness can be computed from the
  // state as it will be after this page. last_pulled_at is stamped on every page that leaves
  // overall hydration complete (so a routine up-to-date check refreshes it), never otherwise.
  const persist = async (data, makePatch) => {
    let nextState = { ...state, ...makePatch(state), lastFailureAt: null };
    let nextLastPulledAt = nextState.complete ? wallIso() : lastPulledAt;
    let nextCoverage = currentCoverage;
    const pullState = config.dropLostCoverage ? async (txn) => {
      nextCoverage = await config.readCoverage({ db: txn, userId, context });
      nextState = boundHistoryCoverage(nextState, nextCoverage, config.coverageKeys);
      nextState.complete = nextState.deltaComplete && !rewalkDueFor(nextState, nextCoverage);
      nextLastPulledAt = nextState.complete ? wallIso() : lastPulledAt;
      return { lastPulledAt: nextLastPulledAt, cursor: JSON.stringify(nextState) };
    } : { lastPulledAt: nextLastPulledAt, cursor: JSON.stringify(nextState) };
    const saveStarted = config.logTiming ? now() : 0;
    try {
      await config.savePage({ data, scope, pullState, admit: () => !isStale() });
      if (config.logTiming && firstCommitMs === null) firstCommitMs = now() - startedAt;
    } finally {
      if (config.logTiming) saveMs += now() - saveStarted;
    }
    state = nextState;
    lastPulledAt = nextLastPulledAt;
    currentCoverage = nextCoverage;
    pages += 1;
    onPageSaved({ scope, pages });
  };

  // Pages from `from` to exhaustion. onPage returns the state patch for that page.
  const walk = async ({ from, firstOverlap, onPage }) => {
    let position = from;
    let overlap = firstOverlap;
    for (;;) {
      // Budget admission is between durable pages. Once admitted, finish all attendee
      // requests and save this page so slow connections can make forward progress.
      if (remaining() <= 0) throw new HistoryRunStop('budget', 'Run budget spent');
      const pageSize = pages === 0 ? (config.firstPageSize ?? config.pageSize) : config.pageSize;
      const { rows, data } = await config.fetchPage({
        request, position, overlapSeconds: overlap, pageSize, context,
      });
      overlap = 0;
      const last = rows[rows.length - 1];
      position = last ? { updatedAt: last.updated_at, id: last.id } : position;
      const exhausted = rows.length < pageSize;
      await onPage({ data: data ?? rows, position, exhausted });
      if (exhausted) return;
    }
  };

  let pages = 0;
  const finish = (status, error) => {
    const complete = Boolean(state.complete && !state.lastFailureAt && !error);
    const timing = config.logTiming
      ? ` rpcMs=${rpcMs} saveMs=${saveMs} firstCommitMs=${firstCommitMs ?? 'none'}` : '';
    const line = `[${config.tag}] end status=${status} pages=${pages} durationMs=${now() - startedAt} complete=${complete}${timing}`;
    if (error) {
      // Only the message, never the RPC arguments, response, details, or row contents.
      const logger = status === 'disabled' ? console.log : console.warn;
      logger(`${line} failureKind=${status} error=${JSON.stringify(error.message || 'Unknown error')}`);
    } else {
      console.log(line);
    }
    return { status, pages };
  };
  try {
    // 1. Delta. The first hydration (from an empty cursor) is a full walk of the year, so its
    //    completion also counts as a completed re-walk, even if it spanned several runs.
    if (state.firstWalk) {
      state = { ...state };
      for (const key of config.coverageKeys) {
        const firstWalk = coverageFields(key)[2];
        if (!state[firstWalk]) state[firstWalk] = currentCoverage[key] || [];
      }
    }
    await walk({
      from: state.updatedAt ? { updatedAt: state.updatedAt, id: state.id } : null,
      firstOverlap: state.deltaComplete && state.updatedAt ? HISTORY_WALK_DEFAULTS.overlapSeconds : 0,
      onPage: ({ data, position, exhausted }) => persist(data, (current) => {
        const patch = {
          updatedAt: position?.updatedAt ?? current.updatedAt,
          id: position?.id ?? current.id,
          deltaComplete: exhausted,
          complete: false,
          ...(exhausted && current.firstWalk
            ? {
              firstWalk: false,
              rescanAfter: null,
              rescanCompletedAt: wallIso(),
              nextRewalkAt: nextRewalkIso(),
              ...Object.fromEntries(config.coverageKeys.flatMap((key) => {
                const [rescan, , firstWalk] = coverageFields(key);
                return [[rescan, current[firstWalk]], [firstWalk, null]];
              })),
            }
            : {}),
        };
        // Complete only if no re-walk remains due once this page is applied.
        return { ...patch, complete: exhausted && !rewalkDueFor({ ...current, ...patch }) };
      }),
    });

    // 2. Re-walk of the academic year when due (a new delivery child, unfinished, or the weekly backstop).
    if (rewalkDue()) {
      if (!state.rescanAfter) {
        state = { ...state, ...Object.fromEntries(config.coverageKeys.map(
          (key) => [coverageFields(key)[1], currentCoverage[key] || []]
        )) };
      }
      await walk({
        from: state.rescanAfter,
        firstOverlap: 0,
        onPage: ({ data, position, exhausted }) => persist(data, (current) => {
          if (!exhausted) return { rescanAfter: position, complete: false };
          const patch = {
            rescanAfter: null,
            rescanCompletedAt: wallIso(),
            nextRewalkAt: nextRewalkIso(),
            ...Object.fromEntries(config.coverageKeys.flatMap((key) => {
              const [rescan, rewalk] = coverageFields(key);
              return [[rescan, current[rewalk]], [rewalk, null]];
            })),
          };
          // A delivery child may have arrived between runs of this walk. Preserve
          // its starting snapshot and leave another walk due for that child.
          return { ...patch, complete: current.deltaComplete && !rewalkDueFor({ ...current, ...patch }) };
        }),
      });
    }
    return finish(state.complete ? 'complete' : 'partial');
  } catch (error) {
    if (isStaleActorError(error)) throw error;
    const kind = error instanceof HistoryRunStop ? error.kind
      : error?.kind === 'cancelled' ? 'cancelled'
        : error?.kind === 'query' ? 'query'
        : 'transport';
    if (kind === 'budget') return finish('partial');
    if (kind !== 'cancelled' && !isStale()) {
      // Keep the first failure since success for the "Incomplete since" label. Written
      // through the writer transaction (the resolved handle is the read-only reader in
      // production), with admission re-checked inside it.
      let failed = { ...state, lastFailureAt: state.lastFailureAt ?? wallIso(),
        ...(['disabled', 'year_mismatch'].includes(kind) ? { complete: false } : {}) };
      try {
        await runRepositoryTransaction(database, async (txn) => {
          if (isStale()) return;
          if (config.dropLostCoverage) {
            const coverage = await config.readCoverage({ db: txn, userId, context });
            failed = boundHistoryCoverage(failed, coverage, config.coverageKeys);
          }
          if (isStale()) return;
          await stateRepo.setPullState(scope, { lastPulledAt, cursor: JSON.stringify(failed) }, { transaction: txn });
        });
        state = failed;
      } catch (writeError) {
        if (isStaleActorError(writeError)) throw writeError;
        console.warn(`[${config.tag}] could not record failure:`, writeError?.message);
      }
    }
    return finish(kind, error);
  }
};

export const runHistoryWalk = ({ userId, force = false, deps = {}, walk } = {}) => {
  const { inFlight } = deps.state;
  const existing = inFlight.get(userId);
  if (existing) return existing;
  const run = runOnce({ userId, force, deps, walk }).finally(() => {
    if (inFlight.get(userId) === run) inFlight.delete(userId);
  });
  inFlight.set(userId, run);
  return run;
};

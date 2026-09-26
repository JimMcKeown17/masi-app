// CAP-004 session history hydration (spec §5 and §12; ADR-0006 and its follow-ups).
// A cheap delta over the server's family timestamp, plus a re-walk of the academic year when
// the phone gains a delivery child (a handover) and as a weekly backstop, which catches what a
// timestamp cursor cannot see. Each page is persisted atomically with its cursor; absence never
// deletes; updatedAt is the raw PostgREST string and is never parsed into a Date.
import { supabase } from './supabaseClient';
import { enqueueSupabaseRequest } from './supabaseRequestQueue';
import { classifyPullFailureKind } from './preloadedChildData';
import { resolveDatabase, runRepositoryTransaction } from '../db/repositories/repositoryRuntime';
import { getActiveAcademicYear, getActiveProgrammeId } from '../db/repositories/domainRepositoryUtils';
import { createSessionsRepository, sessionsRepository } from '../db/repositories/sessionsRepository';
import { syncStateRepository } from '../db/repositories/syncStateRepository';
import { decodeJson } from '../db/repositories/sqliteRepositoryUtils';

export const SESSION_HISTORY_PAGE_SIZE = 200;
export const SESSION_HISTORY_REQUEST_TIMEOUT_MS = 15_000;
export const SESSION_HISTORY_RUN_BUDGET_MS = 60_000;
export const SESSION_HISTORY_OVERLAP_SECONDS = 120;
export const SESSION_HISTORY_STALENESS_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_HISTORY_REWALK_MIN_MS = 6 * DAY_MS;
export const SESSION_HISTORY_REWALK_JITTER_MS = 2 * DAY_MS;

export const sessionHistoryScope = (userId, programmeId) => `session_history_pull:${userId}:${programmeId}`;

let actorGeneration = 0;
const inFlight = new Map();

export const resetSessionHistoryForActorChange = () => {
  actorGeneration += 1;
  inFlight.clear();
};

class HistoryRunStop extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'transport' | 'query' | 'cancelled' | 'budget'
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

const runOnce = async ({ userId, force, deps }) => {
  const {
    database,
    client = supabase,
    enqueueRequest = enqueueSupabaseRequest,
    now = () => Date.now(),
    wallNow = () => Date.now(),
    random = Math.random,
    requestTimeoutMs = SESSION_HISTORY_REQUEST_TIMEOUT_MS,
    runBudgetMs = SESSION_HISTORY_RUN_BUDGET_MS,
    onPageSaved = () => {},
  } = deps;
  const generation = actorGeneration;
  const isStale = () => generation !== actorGeneration;
  const repo = database ? createSessionsRepository({ database }) : sessionsRepository;
  const db = await resolveDatabase(database);

  const programmeId = userId ? await getActiveProgrammeId(db, userId) : null;
  const year = await getActiveAcademicYear(db);
  if (!programmeId || !year?.starts_on) return { status: 'dependency', pages: 0 };

  const scope = sessionHistoryScope(userId, programmeId);
  const stateRow = await db.getFirstAsync('select last_pulled_at, cursor from sync_state where scope = ?', scope);
  const emptyState = {
    windowStart: year.starts_on, updatedAt: null, id: null, deltaComplete: false, complete: false,
    firstWalk: true, firstWalkChildIds: null,
    rescanAfter: null, rewalkChildIds: null, rescanCompletedAt: null, nextRewalkAt: null, rescanChildIds: [],
    lastFailureAt: null,
  };
  let state = { ...emptyState, ...(decodeJson(stateRow?.cursor, {}) || {}) };
  let lastPulledAt = stateRow?.last_pulled_at || null;
  if (state.windowStart !== year.starts_on) {
    state = emptyState;
    lastPulledAt = null;
  }

  const currentChildIds = (await db.getAllAsync(`
    select distinct child_id from child_ea_assignments
    where user_id = ? and unassigned_at is null
    order by child_id
  `, userId)).map((row) => row.child_id);
  const wallIso = () => new Date(wallNow()).toISOString();
  // Weekly backstop, jittered 6-8 days per phone so a fleet does not re-walk in one burst.
  // The common case (a handover) is the immediate new-delivery-child trigger below.
  const nextRewalkIso = () => new Date(
    wallNow() + SESSION_HISTORY_REWALK_MIN_MS + Math.floor(random() * SESSION_HISTORY_REWALK_JITTER_MS)
  ).toISOString();
  const rewalkDueFor = (candidate) => Boolean(candidate.rescanAfter)
    || !candidate.nextRewalkAt
    || wallNow() >= Date.parse(candidate.nextRewalkAt)
    || currentChildIds.some((id) => !(candidate.rescanChildIds || []).includes(id));
  const rewalkDue = () => rewalkDueFor(state);

  // A successful page clears this marker. Clock equality (or a clock correction)
  // must not conceal a later failure behind an earlier success.
  const failedSinceSuccess = Boolean(state.lastFailureAt);
  const lastPulledMs = Date.parse(lastPulledAt || '');
  if (!force && state.complete && !failedSinceSuccess && !rewalkDue()
    && Number.isFinite(lastPulledMs) && wallNow() - lastPulledMs < SESSION_HISTORY_STALENESS_MS) {
    return { status: 'fresh', pages: 0 };
  }

  const startedAt = now();
  const remaining = () => runBudgetMs - (now() - startedAt);
  const request = (rpcName, args) => {
    const budget = remaining();
    if (budget <= 0) throw new HistoryRunStop('budget', 'Run budget spent');
    return withDeadline({
      enqueueRequest,
      timeoutMs: Math.min(requestTimeoutMs, budget),
      isStale,
      start: (signal) => client.rpc(rpcName, args).abortSignal(signal),
    }).then(({ data, error }) => {
      if (isStale()) throw new HistoryRunStop('cancelled', 'Signed-in user changed');
      if (error) throw new HistoryRunStop(classifyPullFailureKind(error), error.message || 'RPC failed');
      return data || [];
    });
  };

  const fetchAttendees = async (sessionIds) => {
    const rows = [];
    let after = null;
    for (;;) {
      const page = await request('get_delivery_history_attendee_page', {
        p_session_ids: sessionIds,
        p_page_size: SESSION_HISTORY_PAGE_SIZE,
        p_after_session_id: after?.session_id ?? null,
        p_after_attendee_id: after?.id ?? null,
      });
      rows.push(...page);
      if (page.length < SESSION_HISTORY_PAGE_SIZE) return rows;
      after = page[page.length - 1];
    }
  };

  // The patch is a function of the current state so completeness can be computed from the
  // state as it will be after this page. last_pulled_at is stamped on every page that leaves
  // overall hydration complete (so a routine up-to-date check refreshes it), never otherwise.
  const persist = async (parents, attendees, makePatch) => {
    const byParent = new Map(parents.map((p) => [p.id, []]));
    for (const attendee of attendees) byParent.get(attendee.session_id)?.push(attendee);
    const nextState = { ...state, ...makePatch(state), lastFailureAt: null };
    const nextLastPulledAt = nextState.complete ? wallIso() : lastPulledAt;
    await repo.saveHistoryPage(
      parents.map((session) => ({ session, attendees: byParent.get(session.id) })),
      {
        scope,
        pullState: { lastPulledAt: nextLastPulledAt, cursor: JSON.stringify(nextState) },
        admit: () => !isStale(),
      }
    );
    state = nextState;
    lastPulledAt = nextLastPulledAt;
    pages += 1;
    onPageSaved({ scope, pages });
  };

  // Pages from `from` to exhaustion. onPage returns the state patch for that page.
  const walk = async ({ from, firstOverlap, onPage }) => {
    let position = from;
    let overlap = firstOverlap;
    for (;;) {
      const parents = await request('get_delivery_history_page', {
        p_programme_id: programmeId,
        p_window_start: year.starts_on,
        p_page_size: SESSION_HISTORY_PAGE_SIZE,
        p_after_updated_at: position?.updatedAt ?? null,
        p_after_id: position?.id ?? null,
        p_overlap_seconds: overlap,
      });
      overlap = 0;
      const attendees = parents.length ? await fetchAttendees(parents.map((p) => p.id)) : [];
      const last = parents[parents.length - 1];
      position = last ? { updatedAt: last.updated_at, id: last.id } : position;
      const exhausted = parents.length < SESSION_HISTORY_PAGE_SIZE;
      await onPage({ parents, attendees, position, exhausted });
      if (exhausted) return;
      if (remaining() <= 0) throw new HistoryRunStop('budget', 'Run budget spent');
    }
  };

  let pages = 0;
  try {
    // 1. Delta. The first hydration (from an empty cursor) is a full walk of the year, so its
    //    completion also counts as a completed re-walk, even if it spanned several runs.
    if (state.firstWalk && !state.firstWalkChildIds) state = { ...state, firstWalkChildIds: currentChildIds };
    await walk({
      from: state.updatedAt ? { updatedAt: state.updatedAt, id: state.id } : null,
      firstOverlap: state.deltaComplete && state.updatedAt ? SESSION_HISTORY_OVERLAP_SECONDS : 0,
      onPage: ({ parents, attendees, position, exhausted }) => persist(parents, attendees, (current) => {
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
              rescanChildIds: current.firstWalkChildIds,
              firstWalkChildIds: null,
            }
            : {}),
        };
        // Complete only if no re-walk remains due once this page is applied.
        return { ...patch, complete: exhausted && !rewalkDueFor({ ...current, ...patch }) };
      }),
    });

    // 2. Re-walk of the academic year when due (a new delivery child, unfinished, or the weekly backstop).
    if (rewalkDue()) {
      if (!state.rescanAfter) state = { ...state, rewalkChildIds: currentChildIds };
      await walk({
        from: state.rescanAfter,
        firstOverlap: 0,
        onPage: ({ parents, attendees, position, exhausted }) => persist(parents, attendees, (current) => {
          if (!exhausted) return { rescanAfter: position, complete: false };
          const patch = {
            rescanAfter: null,
            rescanCompletedAt: wallIso(),
            nextRewalkAt: nextRewalkIso(),
            rescanChildIds: current.rewalkChildIds,
            rewalkChildIds: null,
          };
          // A delivery child may have arrived between runs of this walk. Preserve
          // its starting snapshot and leave another walk due for that child.
          return { ...patch, complete: current.deltaComplete && !rewalkDueFor({ ...current, ...patch }) };
        }),
      });
    }
    return { status: state.complete ? 'complete' : 'partial', pages };
  } catch (error) {
    const kind = error instanceof HistoryRunStop ? error.kind
      : error?.kind === 'cancelled' ? 'cancelled'
        : 'transport';
    if (kind === 'budget') return { status: 'partial', pages };
    if (kind !== 'cancelled' && !isStale()) {
      // Remember the failure so a previous success is never presented as current. Written
      // through the writer transaction (the resolved handle is the read-only reader in
      // production), with admission re-checked inside it.
      const failed = { ...state, lastFailureAt: wallIso() };
      try {
        await runRepositoryTransaction(database, async (txn) => {
          if (isStale()) return;
          await syncStateRepository.setPullState(scope, { lastPulledAt, cursor: JSON.stringify(failed) }, { transaction: txn });
        });
        state = failed;
      } catch (writeError) {
        console.warn('[sessionHistoryPull] could not record failure:', writeError?.message);
      }
    }
    return { status: kind, pages };
  }
};

export const runSessionHistoryPull = ({ userId, force = false, deps = {} } = {}) => {
  const existing = inFlight.get(userId);
  if (existing) return existing;
  const run = runOnce({ userId, force, deps }).finally(() => {
    if (inFlight.get(userId) === run) inFlight.delete(userId);
  });
  inFlight.set(userId, run);
  return run;
};

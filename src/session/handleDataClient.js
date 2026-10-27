import { createClient } from '@supabase/supabase-js';
import { getLatestAuthSession } from './signedInHandle';
import { AuthUnavailableError, StaleActorError } from './staleActor';
import { MASI_LETTER_ORDER_EDITIONS } from '../utils/letterOrders';

// The lifecycle module calls this only after constructing its handle. Session lookup is
// deferred until a request; no database or current-handle fallback is resolved here.
export const createHandleDataClient = ({
  handle, supabaseUrl, supabaseKey, fetchImpl = fetch, timeoutMs = 30_000,
}) => {
  const requireAccessToken = () => {
    if (!handle.isOpen() || !handle.isCurrent()) {
      handle.requestQueue.currentTask()?.markStale();
      throw new StaleActorError();
    }
    if (!handle.requestQueue.currentTask()) throw new StaleActorError();
    const session = getLatestAuthSession();
    if (session?.user?.id !== handle.userId || !session?.access_token) {
      throw new AuthUnavailableError();
    }
    return session.access_token;
  };

  handle.requireAccessToken = async () => requireAccessToken();
  handle.fencedFetch = async (input, init = {}) => {
    // Supabase awaits accessToken before calling fetch. Re-check synchronously here:
    // neither a sign-out nor a token change in that gap may reach the transport.
    const token = requireAccessToken();
    const task = handle.requestQueue.currentTask();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Masi-Letter-Order-Editions', MASI_LETTER_ORDER_EDITIONS.join(','));
    const controller = new AbortController();
    const callerSignal = init.signal ?? input?.signal;
    const signals = [...new Set([handle.abortSignal, callerSignal].filter(Boolean))];
    let timer;
    let abort;
    try {
      return await new Promise((resolve, reject) => {
        abort = () => {
          if (!handle.isOpen() || !handle.isCurrent()) task.markStale();
          // Reject explicitly: a transport that ignores its signal must still settle.
          reject(new TypeError('Network request failed'));
          controller.abort();
        };
        for (const signal of signals) signal.addEventListener('abort', abort);
        if (signals.some((signal) => signal.aborted)) {
          abort();
          return;
        }
        timer = setTimeout(abort, timeoutMs);
        Promise.resolve(fetchImpl(input, { ...init, headers, signal: controller.signal }))
          .then(resolve, reject);
      });
    } finally {
      clearTimeout(timer);
      for (const signal of signals) signal.removeEventListener('abort', abort);
    }
  };

  return createClient(supabaseUrl, supabaseKey, {
    // supabase-js asks for a token at construction to prime Realtime, which Masi does not use.
    // Outside a queued task there is no token to give; fencedFetch still refuses every send.
    accessToken: async () => (
      handle.requestQueue.currentTask() ? handle.requireAccessToken() : null
    ),
    global: { fetch: handle.fencedFetch },
  });
};

import { AUTH_REQUEST_TIMEOUT_MS } from '../src/services/authRequestFetch';
import { createPasswordVerificationFetch } from '../src/services/passwordVerificationClient';
import { StaleActorError } from '../src/session/staleActor';

// Branch review round 2 of PR 5: password changes are queued per actor, so a private
// verification or cleanup request that never settles must still end, or every later
// change for that EA would wait forever. The private transport shares the 30s bound.
const BASE = 'https://example.supabase.co/auth/v1';
const TOKEN = [`${BASE}/token?grant_type=password`, { method: 'POST' }];
const LOGOUT = [`${BASE}/logout?scope=local`, { method: 'POST' }];
const handle = (current = true) => ({ userId: 'ea-1', epoch: 1, isCurrent: () => current });

describe('password verification transport', () => {
  let fetchSpy;
  beforeEach(() => {
    jest.useFakeTimers();
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    jest.useRealTimers();
  });

  test.each([['verification', TOKEN], ['local sign-out', LOGOUT]])(
    'a %s request that never settles fails at the auth request bound and aborts',
    async (_name, [url, init]) => {
      let outcome = null;
      createPasswordVerificationFetch(handle())(url, init).then(
        () => { outcome = 'resolved'; },
        (error) => { outcome = error; },
      );
      await jest.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS - 1);
      expect(outcome).toBeNull();
      await jest.advanceTimersByTimeAsync(1);
      expect(outcome).toBeInstanceOf(TypeError);
      expect(fetchSpy.mock.calls[0][1].signal.aborted).toBe(true);
    },
  );

  test('a stale handle refuses verification but still lets the private session be disposed', async () => {
    const transport = createPasswordVerificationFetch(handle(false));
    expect(() => transport(...TOKEN)).toThrow(StaleActorError);
    expect(fetchSpy).not.toHaveBeenCalled();
    transport(...LOGOUT).catch(() => {});
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS);
  });
});

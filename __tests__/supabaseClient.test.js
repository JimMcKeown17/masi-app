global.__MASI_NO_DEFAULT_HANDLE__ = true;
describe('supabase client guardrails', () => {
  let mockCreateClient;
  let mockAddEventListener;
  let mockRemoveSubscription;

  const loadClient = ({
    supabaseUrl = 'https://segygjzpujphwvrubusm.supabase.co',
    currentState = 'active',
  } = {}) => {
    jest.doMock('expo-constants', () => ({
      expoConfig: {
        extra: {
          supabaseTarget: 'sqlite-staging',
          supabaseProjectId: 'segygjzpujphwvrubusm',
          supabaseUrl,
          supabaseAnonKey: 'sqlite-key',
        },
      },
    }), { virtual: true });

    jest.doMock('react-native', () => ({
      AppState: {
        currentState,
        addEventListener: mockAddEventListener,
      },
      Platform: { OS: 'ios' },
    }));

    return require('../src/services/supabaseClient');
  };

  beforeEach(() => {
    jest.resetModules();
    delete globalThis.__MASI_SUPABASE_CLIENT_STATE__;
    mockRemoveSubscription = jest.fn();
    mockAddEventListener = jest.fn(() => ({ remove: mockRemoveSubscription }));
    mockCreateClient = jest.fn(() => ({
      auth: {
        initialize: jest.fn(() => Promise.resolve()),
        startAutoRefresh: jest.fn(() => Promise.resolve()),
        stopAutoRefresh: jest.fn(() => Promise.resolve()),
      },
    }));

    jest.doMock('@supabase/supabase-js', () => ({
      createClient: mockCreateClient,
      processLock: 'process-lock',
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.dontMock('@supabase/supabase-js');
    jest.dontMock('expo-constants');
    jest.dontMock('react-native');
    delete globalThis.__MASI_SUPABASE_CLIENT_STATE__;
  });

  test('refuses to create a client for a mismatched sqlite project URL', () => {
    expect(() => loadClient({ supabaseUrl: 'https://different-ref.supabase.co' }))
      .toThrow(/must be https:\/\/segygjzpujphwvrubusm\.supabase\.co/);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  test('reuses one client and AppState listener across module reloads', async () => {
    const first = loadClient();
    await Promise.resolve();
    jest.resetModules();
    const second = loadClient();
    await Promise.resolve();

    expect(second.supabase).toBe(first.supabase);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockAddEventListener).toHaveBeenCalledTimes(1);
    expect(first.supabase.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
  });

  test('shared requests abort and reject at exactly 30 seconds even if the transport ignores abort', async () => {
    jest.useFakeTimers();
    let release;
    const fetch = jest.spyOn(global, 'fetch').mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const { AUTH_REQUEST_TIMEOUT_MS } = loadClient({ currentState: 'background' });
    const options = mockCreateClient.mock.calls[0][2];
    expect(options.global?.fetch).toEqual(expect.any(Function));
    expect(AUTH_REQUEST_TIMEOUT_MS).toBe(30_000);
    let outcome;
    const pending = options.global.fetch('https://example.org/auth/v1/user', { method: 'PUT' })
      .then(value => { outcome = value; }, error => { outcome = error; });
    const signal = fetch.mock.calls[0][1].signal;
    await jest.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS - 1);
    expect(outcome).toBeUndefined();
    expect(signal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await pending;
    expect(outcome).toEqual(new TypeError('Network request failed'));
    expect(signal.aborted).toBe(true);
    release(new Response('{}'));
    await Promise.resolve();
    expect(outcome).toBeInstanceOf(TypeError);
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each([false, true])('login pause survives foreground transitions and resumes after settlement; failure = %s', async fails => {
    const { supabase, withAuthAutoRefreshPaused } = loadClient();
    await globalThis.__MASI_SUPABASE_CLIENT_STATE__.autoRefreshOperation;
    const changeAppState = mockAddEventListener.mock.calls[0][1];
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const operation = withAuthAutoRefreshPaused(async () => {
      entered(); await held;
      if (fails) throw new Error('Login failed');
      return 'signed in';
    });
    const outcome = operation.then(value => value, error => error.message);
    await ready;
    expect(supabase.auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    changeAppState('background'); changeAppState('active');
    await globalThis.__MASI_SUPABASE_CLIENT_STATE__.autoRefreshOperation;
    expect(supabase.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    release();
    expect(await outcome).toBe(fails ? 'Login failed' : 'signed in');
    await globalThis.__MASI_SUPABASE_CLIENT_STATE__.autoRefreshOperation;
    expect(supabase.auth.startAutoRefresh).toHaveBeenCalledTimes(2);
  });

  test.each([false, true])('login settlement in background keeps refresh stopped; failure = %s', async fails => {
    const { supabase, withAuthAutoRefreshPaused } = loadClient();
    await globalThis.__MASI_SUPABASE_CLIENT_STATE__.autoRefreshOperation;
    const changeAppState = mockAddEventListener.mock.calls[0][1];
    const outcome = withAuthAutoRefreshPaused(async () => {
      changeAppState('background');
      if (fails) throw new Error('Login failed');
      return 'signed in';
    }).catch(error => error.message);
    expect(await outcome).toBe(fails ? 'Login failed' : 'signed in');
    await globalThis.__MASI_SUPABASE_CLIENT_STATE__.autoRefreshOperation;
    expect(supabase.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    changeAppState('active');
    await globalThis.__MASI_SUPABASE_CLIENT_STATE__.autoRefreshOperation;
    expect(supabase.auth.startAutoRefresh).toHaveBeenCalledTimes(2);
  });

  test('a failed stop prevents login and releases its refresh pause', async () => {
    const { supabase, withAuthAutoRefreshPaused } = loadClient();
    await globalThis.__MASI_SUPABASE_CLIENT_STATE__.autoRefreshOperation;
    const operation = jest.fn();
    supabase.auth.stopAutoRefresh.mockRejectedValueOnce(new Error('Stop failed'));
    await expect(withAuthAutoRefreshPaused(operation)).rejects.toThrow('Stop failed');
    expect(operation).not.toHaveBeenCalled();
    await globalThis.__MASI_SUPABASE_CLIENT_STATE__.autoRefreshOperation;
    expect(supabase.auth.startAutoRefresh).toHaveBeenCalledTimes(2);
  });

  test('overlapping login pauses resume only after the last caller settles', async () => {
    const { supabase, withAuthAutoRefreshPaused } = loadClient();
    await globalThis.__MASI_SUPABASE_CLIENT_STATE__.autoRefreshOperation;
    await withAuthAutoRefreshPaused(async () => {
      await withAuthAutoRefreshPaused(async () => {});
      await globalThis.__MASI_SUPABASE_CLIENT_STATE__.autoRefreshOperation;
      expect(supabase.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    });
    await globalThis.__MASI_SUPABASE_CLIENT_STATE__.autoRefreshOperation;
    expect(supabase.auth.startAutoRefresh).toHaveBeenCalledTimes(2);
  });

  test('shared-client storage uses the fence with its actual SDK session key', async () => {
    // Construct the installed client with the production options, then exercise
    // its real session persistence path instead of a parallel test-only adapter.
    const sdk = jest.requireActual('@supabase/supabase-js');
    mockCreateClient.mockImplementation((url, key, options) => sdk.createClient(url, key, { ...options, auth: { ...options.auth, lock: sdk.processLock } }));
    const { supabase } = loadClient({ currentState: 'background' });
    const { admitAuthSessionUser, revokeAuthSessionAdmission } = require('../src/services/authSessionStorage');
    const storage = require('@react-native-async-storage/async-storage');
    await storage.clear();
    await supabase.auth.initialize();
    await supabase.auth.stopAutoRefresh();
    const value = { user: { id: 'A' }, access_token: 'A-token', refresh_token: 'A-refresh' };
    try {
      revokeAuthSessionAdmission();
      await supabase.auth._saveSession(value);
      expect(await storage.getItem(supabase.auth.storageKey)).toBeNull();
      admitAuthSessionUser({ id: 'A' });
      await supabase.auth._saveSession(value);
      expect(JSON.parse(await storage.getItem(supabase.auth.storageKey)).user.id).toBe('A');
      admitAuthSessionUser({ id: 'B' });
      await supabase.auth._saveSession({ ...value, user: { id: 'B' } });
      await supabase.auth._saveSession(value);
      expect(JSON.parse(await storage.getItem(supabase.auth.storageKey)).user.id).toBe('B');
    } finally { revokeAuthSessionAdmission(); await storage.clear(); await supabase.auth.stopAutoRefresh(); }
  });

  test('shared transport respects caller abort and clears completed request timers', async () => {
    jest.useFakeTimers();
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    loadClient({ currentState: 'background' });
    const boundedFetch = mockCreateClient.mock.calls[0][2].global.fetch;
    await boundedFetch('https://example.org');
    expect(jest.getTimerCount()).toBe(0);
    fetch.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = boundedFetch('https://example.org', { signal: controller.signal });
    const rejection = expect(pending).rejects.toEqual(new TypeError('Network request failed'));
    controller.abort();
    await rejection;
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
});

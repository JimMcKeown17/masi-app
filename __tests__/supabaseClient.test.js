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
});

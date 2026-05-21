const mockCreateClient = jest.fn(() => ({
  auth: {
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
  },
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
  processLock: 'process-lock',
}));

jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      supabaseTarget: 'sqlite-staging',
      supabaseProjectId: 'segygjzpujphwvrubusm',
      supabaseUrl: 'https://different-ref.supabase.co',
      supabaseAnonKey: 'sqlite-key',
    },
  },
}), { virtual: true });

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(),
  },
  Platform: { OS: 'ios' },
}));

describe('supabase client guardrails', () => {
  beforeEach(() => {
    jest.resetModules();
    mockCreateClient.mockClear();
  });

  test('refuses to create a client for a mismatched sqlite project URL', () => {
    expect(() => require('../src/services/supabaseClient'))
      .toThrow(/must be https:\/\/segygjzpujphwvrubusm\.supabase\.co/);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});

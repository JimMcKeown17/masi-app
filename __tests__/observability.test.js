const mockInit = jest.fn();
const mockSetContext = jest.fn();
const mockSetTags = jest.fn();
const mockAddBreadcrumb = jest.fn();
const mockCaptureException = jest.fn();
const mockCaptureMessage = jest.fn();
const mockFlush = jest.fn(async () => true);
const mockScope = {
  setTag: jest.fn(),
  setTags: jest.fn(),
  setContext: jest.fn(),
  setFingerprint: jest.fn(),
};
const mockWithScope = jest.fn((callback) => callback(mockScope));
const mockMobileReplayIntegration = jest.fn(() => ({ name: 'MobileReplay' }));
const mockReactNavigationIntegration = jest.fn(() => ({
  name: 'ReactNavigation',
  registerNavigationContainer: jest.fn(),
}));

jest.mock('@sentry/react-native', () => ({
  init: mockInit,
  setContext: mockSetContext,
  setTags: mockSetTags,
  addBreadcrumb: mockAddBreadcrumb,
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
  flush: mockFlush,
  withScope: mockWithScope,
  mobileReplayIntegration: mockMobileReplayIntegration,
  reactNavigationIntegration: mockReactNavigationIntegration,
}));

const mockLoggerInit = jest.fn();
jest.mock('../src/utils/logger', () => ({
  logger: {
    init: mockLoggerInit,
    flush: jest.fn(),
  },
}));

const runtimeContext = {
  application: { version: '1.2.0', build: '47' },
  device: { modelName: 'Pixel 8a', osVersion: '15' },
  update: { id: 'update-123', channel: 'production', runtimeVersion: '1.2.0' },
  backend: { target: 'sqlite-staging', projectId: 'segygjzpujphwvrubusm' },
  sqlite: { schemaVersion: 8 },
};

jest.mock('../src/utils/runtimeDiagnostics', () => ({
  getRuntimeDiagnostics: () => runtimeContext,
}));

describe('observability initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/123';
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  });

  test('starts native crash reporting and connects local logs as Sentry breadcrumbs', () => {
    const { initializeObservability } = require('../src/services/observability');

    const result = initializeObservability();

    expect(result.enabled).toBe(true);
    expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({
      dsn: 'https://public@example.ingest.sentry.io/123',
      enableNative: true,
      enableNativeCrashHandling: true,
      replaysOnErrorSampleRate: 1,
    }));
    expect(mockSetContext).toHaveBeenCalledWith('runtime', runtimeContext);
    expect(mockSetTags).toHaveBeenCalledWith(expect.objectContaining({
      app_build: '47',
      device_model: 'Pixel 8a',
      expo_update_id: 'update-123',
      supabase_project: 'segygjzpujphwvrubusm',
      sqlite_schema: '8',
    }));
    expect(mockLoggerInit).toHaveBeenCalledWith(expect.objectContaining({
      runtimeContext,
      breadcrumbSink: expect.any(Function),
    }));

    const { breadcrumbSink } = mockLoggerInit.mock.calls[0][0];
    breadcrumbSink({
      timestamp: '2026-07-14T12:00:00.000Z',
      level: 'WARN',
      message: 'sync stalled',
    });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({
      category: 'app.log',
      level: 'warning',
      message: 'sync stalled',
    }));
  });

  test('reports terminal sync rows and reconcile breakers once per distinct issue', () => {
    const {
      initializeObservability,
      reportSyncStatus,
      _testResetReportedSyncIssues,
    } = require('../src/services/observability');
    initializeObservability();
    _testResetReportedSyncIssues();
    const status = {
      unsyncedCount: 3,
      waitingCount: 1,
      needsAttentionCount: 2,
      lastSyncTime: '2026-07-14T11:59:00.000Z',
      lastSuccessfulSyncTime: '2026-07-14T11:00:00.000Z',
      needsAttentionItems: [{
        table: 'sessions',
        id: 'session-123',
        operation: 'insert',
        reason: 'PGRST204 missing column',
        retryCount: 8,
        terminal: true,
      }],
      reconcileBreakerNotes: [{
        scope: 'childEaAssignments',
        candidateCount: 15,
        wouldEndCount: 12,
        triggeredAt: '2026-07-14T12:00:00.000Z',
      }],
    };

    reportSyncStatus(status, { source: 'startup', isOnline: true });
    reportSyncStatus(status, { source: 'interval', isOnline: true });

    expect(mockCaptureMessage).toHaveBeenCalledTimes(2);
    expect(mockCaptureMessage).toHaveBeenCalledWith('Sync item needs attention', 'error');
    expect(mockCaptureMessage).toHaveBeenCalledWith('Pull reconcile breaker needs attention', 'error');
    expect(mockScope.setContext).toHaveBeenCalledWith('sync_issue', expect.objectContaining({
      table: 'sessions',
      recordId: 'session-123',
      errorCode: 'PGRST204',
      retryCount: 8,
      source: 'startup',
      isOnline: true,
      lastSyncTime: '2026-07-14T11:59:00.000Z',
      lastSuccessfulSyncTime: '2026-07-14T11:00:00.000Z',
      unsyncedCount: 3,
    }));
    expect(mockScope.setContext).toHaveBeenCalledWith('reconcile_breaker', expect.objectContaining({
      scope: 'childEaAssignments',
      candidateCount: 15,
      wouldEndCount: 12,
      isOnline: true,
      lastSuccessfulSyncTime: '2026-07-14T11:00:00.000Z',
    }));
  });

  test('reports non-crashing sync pass failures with bounded operational issues', () => {
    const {
      initializeObservability,
      reportSyncResult,
      _testResetReportedSyncIssues,
    } = require('../src/services/observability');
    initializeObservability();
    _testResetReportedSyncIssues();
    const result = {
      success: false,
      skippedNoSession: true,
      totalSynced: 2,
      totalFailed: 3,
      totalTerminal: 1,
      totalRetriable: 2,
      totalDeferred: 7,
      durationMs: 425,
      preflightErrors: [{ step: 'resetInFlight', error: 'database is locked' }],
      failedRecords: [{
        table: 'sessions',
        id: 'session-123',
        operation: 'insert',
        reason: 'network request failed',
      }],
    };

    reportSyncResult(result, { source: 'manual', force: true, isOnline: true });
    reportSyncResult(result, { source: 'background', force: true, isOnline: true });

    expect(mockCaptureException).toHaveBeenCalledTimes(4);
    expect(mockScope.setContext).toHaveBeenCalledWith('sync_pass', expect.objectContaining({
      source: 'manual',
      force: true,
      isOnline: true,
      totalFailed: 3,
      totalRetriable: 2,
      totalDeferred: 7,
      preflightErrors: [{ step: 'resetInFlight', error: 'database is locked' }],
      failedRecords: [expect.objectContaining({ table: 'sessions' })],
    }));
  });

  test('rate-limits repeated operational pull failures without suppressing the first report', () => {
    const {
      initializeObservability,
      captureOperationalError,
      _testResetReportedSyncIssues,
    } = require('../src/services/observability');
    initializeObservability();
    _testResetReportedSyncIssues();
    const error = new Error('network request failed');

    captureOperationalError(error, { category: 'child_data_pull_failed' });
    captureOperationalError(error, { category: 'child_data_pull_failed' });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  test('sends a non-crashing verification event for the release device gate', async () => {
    const { initializeObservability, sendObservabilityTest } = require('../src/services/observability');
    initializeObservability();

    await expect(sendObservabilityTest()).resolves.toEqual({ success: true });

    expect(mockCaptureException).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Masi observability test error',
    }));
    expect(mockScope.setTag).toHaveBeenCalledWith('observability_test', 'true');
    expect(mockFlush).toHaveBeenCalledWith(2000);
  });
});

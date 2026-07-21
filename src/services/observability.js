import * as Sentry from '@sentry/react-native';
import { getRuntimeDiagnostics } from '../utils/runtimeDiagnostics';
import { logger } from '../utils/logger';

let initialized = false;
let enabled = false;
let runtimeContext = null;
let navigationIntegration = null;
const reportedSyncIssueKeys = new Set();
const MAX_REPORTED_SYNC_ISSUES = 500;
const operationalErrorTimes = new Map();
const OPERATIONAL_ERROR_DEDUPE_MS = 15 * 60 * 1000;

const sentryDsn = () => process.env.EXPO_PUBLIC_SENTRY_DSN || '';

const compactTags = (context) => ({
  app_version: String(context.application.version || 'unknown'),
  app_build: String(context.application.build || 'unknown'),
  device_model: String(context.device.modelName || 'unknown'),
  device_os: String(context.device.osName || 'unknown'),
  device_os_version: String(context.device.osVersion || 'unknown'),
  expo_update_id: String(context.update.id || 'embedded'),
  expo_update_channel: String(context.update.channel || 'unknown'),
  supabase_target: String(context.backend.target || 'unknown'),
  supabase_project: String(context.backend.projectId || 'unknown'),
  sqlite_schema: String(context.sqlite.schemaVersion || 'unknown'),
});

const rememberSyncIssue = (key) => {
  if (reportedSyncIssueKeys.has(key)) return false;
  reportedSyncIssueKeys.add(key);
  if (reportedSyncIssueKeys.size > MAX_REPORTED_SYNC_ISSUES) {
    const oldestKey = reportedSyncIssueKeys.values().next().value;
    reportedSyncIssueKeys.delete(oldestKey);
  }
  return true;
};

const syncErrorCode = (reason = '') => {
  const text = String(reason);
  return text.match(/\bPGRST\d+\b/i)?.[0]?.toUpperCase()
    || text.match(/\b\d{5}\b/)?.[0]
    || (text.startsWith('deterministic:') ? 'deterministic' : 'unknown');
};

/**
 * Start crash reporting before the React tree mounts. Diagnostic console logs
 * remain local-only so arbitrary field data is not forwarded to Sentry as
 * breadcrumbs. Support exports remain available without cloud connectivity.
 */
export const initializeObservability = () => {
  if (initialized) return { enabled, runtimeContext };

  runtimeContext = getRuntimeDiagnostics();
  enabled = Boolean(sentryDsn());

  if (enabled) {
    navigationIntegration = Sentry.reactNavigationIntegration({
      enableTimeToInitialDisplay: true,
    });

    Sentry.init({
      dsn: sentryDsn(),
      environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT
        || runtimeContext.backend.target
        || 'unknown',
      enableNative: true,
      enableNativeCrashHandling: true,
      enableAutoSessionTracking: true,
      enableWatchdogTerminationTracking: true,
      enableAppHangTracking: true,
      enableCaptureFailedRequests: true,
      attachScreenshot: false,
      attachViewHierarchy: false,
      sendDefaultPii: false,
      maxBreadcrumbs: 100,
      tracesSampleRate: 0.1,
      profilesSampleRate: 0,
      integrations: [navigationIntegration],
    });
    Sentry.setContext('runtime', runtimeContext);
    Sentry.setTags(compactTags(runtimeContext));
  }

  logger.init({ runtimeContext });
  initialized = true;

  return { enabled, runtimeContext };
};

export const registerNavigationContainer = (navigationContainerRef) => {
  navigationIntegration?.registerNavigationContainer(navigationContainerRef);
};

export const wrapAppWithObservability = (AppComponent) => (
  enabled ? Sentry.wrap(AppComponent) : AppComponent
);

export const setObservabilityUser = (user) => {
  if (!enabled) return;
  Sentry.setUser(user ? { id: user.id } : null);
};

export const captureOperationalError = (error, { category, context, tags } = {}) => {
  if (!enabled) return null;
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  const dedupeKey = [category || 'operation', normalizedError.name, normalizedError.message].join(':');
  const lastReportedAt = operationalErrorTimes.get(dedupeKey) || 0;
  if (Date.now() - lastReportedAt < OPERATIONAL_ERROR_DEDUPE_MS) return null;
  operationalErrorTimes.set(dedupeKey, Date.now());

  return Sentry.withScope((scope) => {
    if (category) scope.setTag('operation_category', category);
    if (tags) scope.setTags(tags);
    if (context) scope.setContext(category || 'operation', context);
    return Sentry.captureException(normalizedError);
  });
};

const syncPassContext = (result, { source, force, isOnline }) => ({
  source,
  force,
  isOnline,
  success: result.success,
  skippedNoSession: Boolean(result.skippedNoSession),
  abortedUserSwitch: Boolean(result.abortedUserSwitch),
  totalSynced: result.totalSynced || 0,
  totalFailed: result.totalFailed || 0,
  totalTerminal: result.totalTerminal || 0,
  totalRetriable: result.totalRetriable || 0,
  totalDeferred: result.totalDeferred || 0,
  durationMs: result.durationMs || 0,
  preflightErrors: result.preflightErrors || [],
  failedRecords: (result.failedRecords || []).slice(0, 20),
  tableResults: result.tableResults || {},
});

/**
 * Report failures returned as data by the sync engine. These do not throw, so
 * a crash reporter cannot discover them without an explicit domain bridge.
 * The shared operational-error limiter bounds each condition to once per
 * fifteen minutes while preserving detailed pass context on the first event.
 */
export const reportSyncResult = (
  result,
  { source = 'unknown', force = false, isOnline = null } = {}
) => {
  if (!enabled || !result) return { reported: 0 };

  const context = syncPassContext(result, { source, force, isOnline });
  let reported = 0;
  const report = (message, tags = {}) => {
    const eventId = captureOperationalError(new Error(message), {
      category: 'sync_pass',
      context,
      tags,
    });
    if (eventId) reported += 1;
  };

  if (result.skippedNoSession) {
    report('Sync skipped: no auth session', { sync_state: 'skipped_no_session' });
  }

  for (const preflightError of result.preflightErrors || []) {
    const step = String(preflightError.step || 'unknown');
    report(`Sync preflight failed: ${step}`, {
      sync_state: 'preflight_failed',
      sync_preflight_step: step,
    });
  }

  if ((result.totalRetriable || 0) > 0) {
    report('Sync pass completed with retriable failures', {
      sync_state: 'retriable_failures',
    });
  }

  if ((result.totalDeferred || 0) > 0) {
    report('Sync batch fallback budget exhausted', {
      sync_state: 'batch_fallback_deferred',
    });
  }

  if (result.abortedUserSwitch) {
    report('Sync pass aborted after user changed', {
      sync_state: 'aborted_user_switch',
    });
  }

  return { reported };
};

const syncStatusContext = (status, { source, isOnline }) => ({
  source,
  isOnline,
  unsyncedCount: status.unsyncedCount || 0,
  readyCount: status.readyCount || 0,
  inFlightCount: status.inFlightCount || 0,
  waitingCount: status.waitingCount || 0,
  needsAttentionCount: status.needsAttentionCount || 0,
  nextRetryAt: status.nextRetryAt || null,
  lastSyncTime: status.lastSyncTime || null,
  lastSuccessfulSyncTime: status.lastSuccessfulSyncTime || null,
});

/**
 * Convert durable sync needs-attention state into high-signal Sentry issues.
 * A status poll happens every 30 seconds, so each launch reports a distinct
 * terminal row or breaker state once rather than producing an alert storm.
 */
export const reportSyncStatus = (
  status = {},
  { source = 'unknown', isOnline = null } = {}
) => {
  if (!enabled) return { terminalReported: 0, breakersReported: 0 };

  let terminalReported = 0;
  let breakersReported = 0;
  const statusContext = syncStatusContext(status, { source, isOnline });

  for (const item of status.needsAttentionItems || []) {
    const key = [
      'terminal',
      item.table,
      item.id,
      item.operation,
      item.reason,
    ].join(':');
    if (!rememberSyncIssue(key)) continue;

    const errorCode = syncErrorCode(item.reason);
    Sentry.withScope((scope) => {
      scope.setTags({
        sync_state: 'terminal',
        sync_table: String(item.table || 'unknown'),
        sync_operation: String(item.operation || 'unknown'),
        sync_error_code: errorCode,
      });
      scope.setFingerprint(['sync-terminal', item.table || 'unknown', item.operation || 'unknown', errorCode]);
      scope.setContext('sync_issue', {
        ...statusContext,
        table: item.table,
        recordId: item.id,
        operation: item.operation,
        reason: item.reason,
        errorCode,
        retryCount: item.retryCount || 0,
        failedAt: item.failedAt || null,
        nextRetryAt: item.nextRetryAt || null,
      });
      Sentry.captureMessage('Sync item needs attention', 'error');
    });
    terminalReported += 1;
  }

  for (const note of status.reconcileBreakerNotes || []) {
    const key = [
      'breaker',
      note.scope,
      note.triggeredAt,
      note.candidateCount,
      note.wouldEndCount,
    ].join(':');
    if (!rememberSyncIssue(key)) continue;

    Sentry.withScope((scope) => {
      scope.setTags({
        sync_state: 'reconcile_breaker',
        reconcile_scope: String(note.scope || 'unknown'),
      });
      scope.setFingerprint(['pull-reconcile-breaker', note.scope || 'unknown']);
      scope.setContext('reconcile_breaker', {
        ...statusContext,
        scope: note.scope,
        candidateCount: note.candidateCount,
        wouldEndCount: note.wouldEndCount,
        triggeredAt: note.triggeredAt,
      });
      Sentry.captureMessage('Pull reconcile breaker needs attention', 'error');
    });
    breakersReported += 1;
  }

  return { terminalReported, breakersReported };
};

export const _testResetReportedSyncIssues = () => {
  reportedSyncIssueKeys.clear();
  operationalErrorTimes.clear();
};

export const flushObservability = async (timeoutMs = 2000) => {
  await logger.flush();
  if (!enabled) return true;
  return Sentry.flush(timeoutMs);
};

export const sendObservabilityTest = async () => {
  if (!enabled) {
    return {
      success: false,
      error: 'Crash reporting is not configured in this build',
    };
  }
  Sentry.withScope((scope) => {
    scope.setTag('observability_test', 'true');
    Sentry.captureException(new Error('Masi observability test error'));
  });
  await flushObservability();
  return { success: true };
};

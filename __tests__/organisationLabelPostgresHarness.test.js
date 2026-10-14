jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  spawn: jest.fn(),
}));
jest.mock('node:perf_hooks', () => ({ performance: { now: jest.fn() } }));
jest.mock('../scripts/history-authorization-postgres-harness.cjs', () => ({
  ...jest.requireActual('../scripts/history-authorization-postgres-harness.cjs'),
  runPsql: jest.fn(),
  expectSqlState: jest.fn(),
}));

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { runPsql, expectSqlState } = require('../scripts/history-authorization-postgres-harness.cjs');
const {
  ORGANISATION_MIGRATION,
  installDefaultPrivileges,
  runLockTimeoutCase,
} = require('../scripts/organisation-label-postgres-harness.cjs');

const databaseUrl = 'postgresql://postgres:test@127.0.0.1:65433/masi_history_rls_jest_org';
const migrationSql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', ORGANISATION_MIGRATION), 'utf8');

describe('organisation harness lock and ACL safeguards (process boundary mocked)', () => {
  let blocker;
  let elapsedMs;
  let closeObserved;

  beforeEach(() => {
    jest.clearAllMocks();
    elapsedMs = 0;
    closeObserved = false;
    performance.now.mockImplementation(() => elapsedMs);
    blocker = new EventEmitter();
    blocker.stderr = new EventEmitter();
    blocker.kill = jest.fn((signal) => {
      queueMicrotask(() => {
        closeObserved = true;
        blocker.emit('close', null, signal);
      });
      return true;
    });
    spawn.mockReturnValue(blocker);
    runPsql.mockImplementation(({ label }) => {
      if (label === 'organisation-lock-blocker-ready') return '321';
      if (label === 'supabase-default-privileges') return '';
      if (['default-acl-control', 'lock-timeout-no-organizations', 'lock-timeout-no-user-column', 'stop-organisation-lock-blocker'].includes(label)) return 't';
      throw new Error(`Unexpected psql call: ${label}`);
    });
    expectSqlState.mockImplementation(() => { elapsedMs += 10_000; });
  });

  test('the migration sets 10s lock and 60s statement bounds and leaves the transaction to the CLI', () => {
    const statements = migrationSql.replace(/--[^\n]*/g, '').trim();
    expect(statements).toMatch(/^SET LOCAL lock_timeout = '10s';\s*SET LOCAL statement_timeout = '60s';/i);
    // The Supabase CLI applies the file and its schema_migrations insert in one transaction;
    // an explicit COMMIT in the file would commit the schema before the history row.
    expect(statements).not.toMatch(/^\s*(BEGIN|COMMIT|END|ROLLBACK)\s*;/im);
  });

  test('installs broad Supabase defaults and proves them on a control table', () => {
    expect(installDefaultPrivileges(databaseUrl)).toEqual({ 'default-acl-control': 'passed' });
    const setup = runPsql.mock.calls.find(([call]) => call.label === 'supabase-default-privileges')[0].sql;
    for (const kind of ['TABLES', 'SEQUENCES', 'FUNCTIONS']) {
      expect(setup).toContain(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ${kind} TO anon, authenticated, service_role;`);
    }
    expect(setup).toMatch(/CREATE TABLE public\.org_harness_acl_control/i);
    expect(runPsql.mock.calls.find(([call]) => call.label === 'default-acl-control')[0].sql)
      .toContain("has_table_privilege('authenticated', 'public.org_harness_acl_control', 'SELECT')");
  });

  test('refuses an ineffective default-ACL setup', () => {
    runPsql.mockReturnValue('f');
    expect(() => installDefaultPrivileges(databaseUrl)).toThrow(/control/i);
  });

  test('requires lock timeout and rollback, then terminates and awaits the blocker', async () => {
    await expect(runLockTimeoutCase(databaseUrl, migrationSql)).resolves.toEqual({
      'migration-lock-timeout': 'passed',
      'migration-lock-timeout-bound': 'passed',
      'lock-timeout-no-organizations': 'passed',
      'lock-timeout-no-user-column': 'passed',
    });
    const [command, args, options] = spawn.mock.calls[0];
    expect(command).toBe('psql');
    expect(args).toContain(databaseUrl);
    expect(args.join(' ')).toContain('LOCK TABLE public.users IN ACCESS SHARE MODE');
    expect(args.join(' ')).toContain('pg_sleep(20)');
    expect(options.env.PGAPPNAME).toMatch(/org-lock-blocker/);
    expect(expectSqlState).toHaveBeenCalledWith(expect.objectContaining({ sql: migrationSql, sqlState: '55P03' }));
    expect(runPsql).toHaveBeenCalledWith(expect.objectContaining({ label: 'stop-organisation-lock-blocker' }));
    expect(blocker.kill).toHaveBeenCalledWith('SIGTERM');
    expect(closeObserved).toBe(true);
  });

  test('still cleans up when applying the migration does not produce the expected SQLSTATE', async () => {
    expectSqlState.mockImplementation(() => { throw new Error('expected SQLSTATE 55P03'); });
    await expect(runLockTimeoutCase(databaseUrl, migrationSql)).rejects.toThrow('expected SQLSTATE 55P03');
    expect(blocker.kill).toHaveBeenCalledWith('SIGTERM');
    expect(closeObserved).toBe(true);
  });

  test.each([0, 20_000])('refuses a timeout outside the roughly 10s bound (%s ms)', async (duration) => {
    expectSqlState.mockImplementation(() => { elapsedMs += duration; });
    await expect(runLockTimeoutCase(databaseUrl, migrationSql)).rejects.toThrow(/8.*15.*seconds/);
    expect(closeObserved).toBe(true);
  });

  test.each(['lock-timeout-no-organizations', 'lock-timeout-no-user-column'])('refuses partial schema after rollback: %s', async (failedCheck) => {
    runPsql.mockImplementation(({ label }) => label === 'organisation-lock-blocker-ready' ? '321' : label === failedCheck ? 'f' : 't');
    await expect(runLockTimeoutCase(databaseUrl, migrationSql)).rejects.toThrow(failedCheck);
    expect(closeObserved).toBe(true);
  });

  test('awaits the child even if backend termination fails', async () => {
    runPsql.mockImplementation(({ label }) => {
      if (label === 'stop-organisation-lock-blocker') throw new Error('termination failed');
      return label === 'organisation-lock-blocker-ready' ? '321' : 't';
    });
    await expect(runLockTimeoutCase(databaseUrl, migrationSql)).rejects.toThrow('termination failed');
    expect(blocker.kill).toHaveBeenCalledWith('SIGTERM');
    expect(closeObserved).toBe(true);
  });

  test('cleans up a psql spawn failure without attempting the migration', async () => {
    spawn.mockImplementation(() => {
      queueMicrotask(() => {
        blocker.emit('error', new Error('psql unavailable'));
        closeObserved = true;
        blocker.emit('close', -2, null);
      });
      return blocker;
    });
    runPsql.mockReturnValue('');
    await expect(runLockTimeoutCase(databaseUrl, migrationSql)).rejects.toThrow('psql unavailable');
    expect(expectSqlState).not.toHaveBeenCalled();
    expect(closeObserved).toBe(true);
  });
});

const {
  DISPOSABLE_CONFIRMATION,
  assertDisposableAdminTarget,
  bootstrapSql,
} = require('../scripts/history-authorization-postgres-harness.cjs');

const validInput = {
  adminDatabaseUrl: 'postgresql://postgres:postgres@127.0.0.1:65433/postgres',
  databaseName: 'masi_history_rls_jest',
  confirmation: DISPOSABLE_CONFIRMATION,
};

describe('history authorization PostgreSQL harness safety', () => {
  test('bootstraps the Supabase compatibility roles required by a stock PostgreSQL image', () => {
    for (const role of ['anon', 'authenticated', 'service_role', 'authenticator']) {
      expect(bootstrapSql).toMatch(new RegExp(`CREATE ROLE ${role} NOLOGIN`, 'i'));
    }
  });

  test('accepts an explicitly confirmed disposable localhost database', () => {
    expect(assertDisposableAdminTarget(validInput).hostname).toBe('127.0.0.1');
  });

  test.each([
    [
      'a non-local PostgreSQL host',
      { adminDatabaseUrl: 'postgresql://postgres:secret@db.example.org/postgres' },
      'localhost-only',
    ],
    [
      'a non-admin database URL',
      { adminDatabaseUrl: 'postgresql://postgres:postgres@127.0.0.1:65433/masi' },
      'admin database must be postgres',
    ],
    [
      'a database outside the disposable namespace',
      { databaseName: 'masi_app' },
      'must start with masi_history_rls_',
    ],
    [
      'an unsafe database identifier',
      { databaseName: 'masi_history_rls_bad-name' },
      'not a safe PostgreSQL identifier',
    ],
    [
      'a missing destructive-operation confirmation',
      { confirmation: '' },
      'HISTORY_RLS_DISPOSABLE_CONFIRM must equal',
    ],
  ])('rejects %s', (_label, override, message) => {
    expect(() => assertDisposableAdminTarget({ ...validInput, ...override }))
      .toThrow(message);
  });
});

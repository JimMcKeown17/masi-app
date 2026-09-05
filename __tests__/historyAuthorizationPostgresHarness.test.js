const {
  DISPOSABLE_CONFIRMATION,
  assertDisposableAdminTarget,
  buildDatabaseUrl,
  buildPsqlEnv,
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

  test('accepts the unchanged CI connection URL', () => {
    const adminDatabaseUrl = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
    expect(assertDisposableAdminTarget({ ...validInput, adminDatabaseUrl }).href)
      .toBe(adminDatabaseUrl);
  });

  test.each(['sslmode=disable', 'connect_timeout=5', 'application_name=jest'])(
    'accepts the non-routing query parameter %s',
    (query) => {
      expect(() => assertDisposableAdminTarget({
        ...validInput,
        adminDatabaseUrl: `${validInput.adminDatabaseUrl}?${query}`,
      })).not.toThrow();
    }
  );

  test.each([
    'postgresql://127.0.0.1:65433/postgres',
    'postgresql://postgres:postgres@127.0.0.1/postgres',
  ])('still accepts an omitted username or port: %s', (adminDatabaseUrl) => {
    expect(() => assertDisposableAdminTarget({ ...validInput, adminDatabaseUrl }))
      .not.toThrow();
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
    ...[
      ['host', 'review-remote.invalid'],
      ['hostaddr', '203.0.113.10'],
      ['port', '5433'],
      ['dbname', 'postgres'],
      ['service', 'review-service'],
      ['options', '-csearch_path=public'],
      ['passfile', '/tmp/fake-pgpass'],
      ['unknown_key', 'unexpected'],
      ['%68ost', 'review-remote.invalid'],
    ].map(([key, value]) => [
      `the query parameter ${key}`,
      { adminDatabaseUrl: `${validInput.adminDatabaseUrl}?${key}=${value}` },
      `query parameter "${decodeURIComponent(key)}"`,
    ]),
    [
      'a routing key after an allowlisted query parameter',
      { adminDatabaseUrl: `${validInput.adminDatabaseUrl}?sslmode=disable&host=review-remote.invalid` },
      'query parameter "host"',
    ],
  ])('rejects %s', (_label, override, message) => {
    expect(() => assertDisposableAdminTarget({ ...validInput, ...override }))
      .toThrow(message);
  });

  test.each(['postgres', validInput.databaseName])(
    'builds the %s target without a query or fragment',
    (databaseName) => {
      const adminDatabaseUrl = `${validInput.adminDatabaseUrl}?sslmode=disable&connect_timeout=5&application_name=jest#ignored`;
      const adminUrl = assertDisposableAdminTarget({ ...validInput, adminDatabaseUrl });
      const target = buildDatabaseUrl(adminUrl, databaseName);

      expect(target.href).toBe(`postgresql://postgres:postgres@127.0.0.1:65433/${databaseName}`);
      expect(target.pathname).toBe(`/${databaseName}`);
      expect(target.search).toBe('');
      expect(target.hash).toBe('');
      expect(adminUrl.href).toBe(adminDatabaseUrl);
    }
  );

  test.each([
    'postgres://fake%40user:fake%3Apw%2F%40%3F%23@localhost:65433/postgres',
    'postgresql://fake:fake@[::1]:65433/postgres',
    'postgresql://127.0.0.1:65433/postgres',
    'postgresql://fake:fake@127.0.0.1/postgres',
  ])('preserves only the validated connection components: %s', (adminDatabaseUrl) => {
    const adminUrl = assertDisposableAdminTarget({ ...validInput, adminDatabaseUrl });
    const target = buildDatabaseUrl(adminUrl, validInput.databaseName);

    expect(target.href).toBe(adminDatabaseUrl.replace('/postgres', `/${validInput.databaseName}`));
    for (const component of ['protocol', 'username', 'password', 'hostname', 'port']) {
      expect(target[component]).toBe(adminUrl[component]);
    }
  });

  test('removes inherited libpq routing variables without mutating process.env or losing authentication', () => {
    const inherited = {
      PGHOST: 'review-remote.invalid',
      PGHOSTADDR: '203.0.113.10',
      PGPORT: '5433',
      PGDATABASE: 'postgres',
      PGSERVICE: 'review-service',
      PGSERVICEFILE: '/tmp/fake-pg_service.conf',
      PGSYSCONFDIR: '/tmp/fake-pg-config',
      PGOPTIONS: '-csearch_path=public',
      PGTARGETSESSIONATTRS: 'read-write',
    };
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      ...inherited,
      PGPASSWORD: 'fake-password',
      PGPASSFILE: '/tmp/fake-pgpass',
      PGAPPNAME: 'inherited-application',
    };

    try {
      const env = buildPsqlEnv('drop-database');

      for (const key of Object.keys(inherited)) {
        expect(env).not.toHaveProperty(key);
        expect(process.env[key]).toBe(inherited[key]);
      }
      expect(env.PGPASSWORD).toBe('fake-password');
      expect(env.PGPASSFILE).toBe('/tmp/fake-pgpass');
      expect(env.PGAPPNAME).toBe('masi-history-rls-drop-database');
      expect(env.PATH).toBe(originalEnv.PATH);
      expect(process.env.PGAPPNAME).toBe('inherited-application');
    } finally {
      process.env = originalEnv;
    }
  });
});

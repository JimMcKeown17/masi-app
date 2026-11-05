#!/usr/bin/env node
// repro-client-archive-chain: replay the EXACT wire requests the real Masi client sent to the
// fake PostgREST (wire-<label>.json, written by reproClientArchiveChain.test.js) against a
// disposable local PostgreSQL loaded with EVERY canonical migration in supabase/migrations.
// Each request becomes the SQL PostgREST would run, as `authenticated` with
// request.jwt.claim.sub = the EA, inside its own subtransaction (a failed request rolls back
// only itself, like a separate HTTP request). Each scenario runs in one rolled-back transaction.
//
// Env (same guards as scripts/history-authorization-postgres-harness.cjs):
//   HISTORY_RLS_ADMIN_DATABASE_URL=postgres://postgres:<password>@127.0.0.1:<port>/postgres
//   HISTORY_RLS_DATABASE_NAME=masi_history_rls_archive_chain
//   HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE
//   MASI_REPO=<checkout whose scripts/ and supabase/migrations to use>
// Usage: node pg-replay.cjs wire-C1.json wire-C2.json ...
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = process.env.MASI_REPO || '/Users/jimmckeown/Development/masi-app/.claude/worktrees/wf_dcd8023d-0b6-3';
const {
  MIGRATIONS_DIR, assertDisposableAdminTarget, bootstrapSql, buildDatabaseUrl, buildPsqlEnv, runPsql,
} = require(path.join(REPO, 'scripts/history-authorization-postgres-harness.cjs'));

const ORG = 'a111879f-d066-47c9-95a1-bed2a400319a';
const TABLE_ORDER = [
  'staff_programme_assignments', 'classes', 'class_ea_assignments', 'groups', 'group_ea_assignments',
  'children', 'child_ea_assignments', 'child_programme_enrollments', 'child_class_memberships', 'child_group_memberships',
];
const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;
const jlit = (value) => `$j$${JSON.stringify(value)}$j$::json`;
const qi = (id) => `"${id.replaceAll('"', '""')}"`;

const runCapture = ({ databaseUrl, sql, label }) => {
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-Atq', databaseUrl, '-c', sql], {
    encoding: 'utf8', env: buildPsqlEnv(label), timeout: 180_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

const requestSql = (req, columnsByTable) => {
  const notice = (body) => `RAISE NOTICE 'REQ|${req.seq}|%', ${body};`;
  const wrap = (decls, stmt) => `
DO $req${req.seq}$
DECLARE n bigint; ids text; ${decls}
BEGIN
  ${stmt}
  ${notice("'ok|' || n || '|' || coalesce(ids, '')")}
EXCEPTION WHEN OTHERS THEN
  ${notice("'err|' || SQLSTATE || '|' || SQLERRM")}
END $req${req.seq}$;`;
  if (req.target.startsWith('rpc/')) {
    const fn = req.target.slice(4);
    if (fn === 'set_letter_mastery') {
      return wrap(`a json := ${jlit(req.body)};`, `
  SELECT count(*), string_agg(r.outcome, ',') INTO n, ids FROM public.set_letter_mastery(
    p_correction_id := (a->>'p_correction_id')::uuid, p_child_id := (a->>'p_child_id')::uuid,
    p_letter := a->>'p_letter', p_language := a->>'p_language',
    p_confirmed := (a->>'p_confirmed')::boolean, p_changed_at := (a->>'p_changed_at')::timestamptz) r;`);
    }
    return `DO $s$ BEGIN RAISE NOTICE 'REQ|${req.seq}|skipped|rpc ${fn} not replayed'; END $s$;`;
  }
  const table = req.target;
  const cols = columnsByTable.get(table);
  if (!cols) throw new Error(`unknown table ${table}`);
  const rows = Array.isArray(req.body) ? req.body : [req.body];
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const unknown = keys.filter((key) => !cols.has(key));
  if (unknown.length) {
    return `DO $s$ BEGIN RAISE NOTICE 'REQ|${req.seq}|err|PGRST204|unknown columns ${unknown.join(',')}'; END $s$;`;
  }
  if (req.method === 'POST') {
    const list = keys.map(qi).join(', ');
    const conflict = req.prefer.includes('resolution=ignore-duplicates')
      ? 'ON CONFLICT (id) DO NOTHING'
      : `ON CONFLICT (id) DO UPDATE SET ${keys.filter((k) => k !== 'id').map((k) => `${qi(k)} = EXCLUDED.${qi(k)}`).join(', ')}`;
    if (process.env.NO_RETURNING === '1') {
      // return=minimal variant: no RETURNING, so SELECT policies cannot be what refuses the row.
      return wrap('', `
  INSERT INTO public.${qi(table)} (${list})
  SELECT ${list} FROM json_populate_recordset(NULL::public.${qi(table)}, ${jlit(rows)})
  ${conflict};
  GET DIAGNOSTICS n = ROW_COUNT;`);
    }
    return wrap('', `
  WITH ins AS (
    INSERT INTO public.${qi(table)} (${list})
    SELECT ${list} FROM json_populate_recordset(NULL::public.${qi(table)}, ${jlit(rows)})
    ${conflict}
    RETURNING id
  ) SELECT count(*), string_agg(id::text, ',') INTO n, ids FROM ins;`);
  }
  if (req.method === 'PATCH') {
    const id = new URLSearchParams(req.query).get('id').replace(/^eq\./, '');
    return wrap('', `
  WITH upd AS (
    UPDATE public.${qi(table)} t SET ${keys.map((k) => `${qi(k)} = src.${qi(k)}`).join(', ')}
    FROM (SELECT * FROM json_populate_record(NULL::public.${qi(table)}, ${jlit(req.body)})) src
    WHERE t.id = ${lit(id)}
    RETURNING t.id
  ) SELECT count(*), string_agg(id::text, ',') INTO n, ids FROM upd;`);
  }
  throw new Error(`unsupported ${req.method} ${req.target}`);
};

const main = () => {
  const files = process.argv.slice(2);
  const databaseName = process.env.HISTORY_RLS_DATABASE_NAME;
  const adminUrl = assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.HISTORY_RLS_ADMIN_DATABASE_URL,
    databaseName,
    confirmation: process.env.HISTORY_RLS_DISPOSABLE_CONFIRM,
  });
  const adminDatabaseUrl = buildDatabaseUrl(adminUrl, 'postgres').href;
  const databaseUrl = buildDatabaseUrl(adminUrl, databaseName).href;
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${qi(databaseName)} WITH (FORCE);`, label: 'drop-stale' });
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `CREATE DATABASE ${qi(databaseName)};`, label: 'create' });
  const out = { migrations: [], scenarios: {} };
  try {
    runPsql({ databaseUrl, sql: bootstrapSql, label: 'bootstrap' });
    runPsql({ databaseUrl, label: 'default-privileges', sql: `
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;` });
    for (const filename of fs.readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql')).sort()) {
      runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
      out.migrations.push(filename);
    }
    const literacy = runPsql({ databaseUrl, label: 'literacy', sql: "SELECT id FROM public.programmes WHERE code = 'literacy'" });
    const activeYear = runPsql({ databaseUrl, label: 'year', sql: 'SELECT id FROM public.academic_years WHERE is_active' });
    const columnsByTable = new Map();
    for (const line of runPsql({ databaseUrl, label: 'columns', sql: `
      SELECT table_name || '|' || column_name FROM information_schema.columns WHERE table_schema = 'public'` }).split('\n')) {
      const [table, column] = line.split('|');
      if (!columnsByTable.has(table)) columnsByTable.set(table, new Set());
      columnsByTable.get(table).add(column);
    }
    out.mapping = { literacy, activeYear };

    for (const file of files) {
      const raw = fs.readFileSync(file, 'utf8');
      const first = JSON.parse(raw);
      // Fixture programme/year ids map onto the seeded reference rows.
      const wire = JSON.parse(raw.replaceAll(first.ids.PROG, literacy).replaceAll(first.ids.YEAR, activeYear));
      const fixture = [
        `INSERT INTO auth.users (id) VALUES (${lit(wire.actor)}), (${lit(wire.headOffice)}) ON CONFLICT DO NOTHING;`,
        `INSERT INTO public.schools (id, name) VALUES (${lit(wire.ids.SCHOOL)}, 'Archive chain school') ON CONFLICT DO NOTHING;`,
        `INSERT INTO public.users (id, first_name, last_name, school_id, organization_id) VALUES
          (${lit(wire.actor)}, 'Field', 'EA', ${lit(wire.ids.SCHOOL)}, ${lit(ORG)}),
          (${lit(wire.headOffice)}, 'Head', 'Office', ${lit(wire.ids.SCHOOL)}, ${lit(ORG)}) ON CONFLICT DO NOTHING;`,
      ];
      for (const table of TABLE_ORDER) {
        const rows = wire.seed[table] || [];
        if (!rows.length) continue;
        const cols = columnsByTable.get(table);
        const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((k) => cols.has(k));
        const list = keys.map(qi).join(', ');
        fixture.push(`INSERT INTO public.${qi(table)} (${list}) SELECT ${list} FROM json_populate_recordset(NULL::public.${qi(table)}, ${jlit(rows)});`);
      }
      const ho = (wire.hoActions || []).map((a) => `UPDATE public.${qi(a.table)} SET ${Object.entries(a.set)
        .map(([k, v]) => `${qi(k)} = ${lit(v)}`).join(', ')}, row_version = row_version + 1 WHERE id = ${lit(a.id)};`);
      const replay = wire.requests.map((req) => requestSql(req, columnsByTable));
      const sql = `BEGIN;
${fixture.join('\n')}
${ho.join('\n')}
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = ${lit(wire.actor)};
${replay.join('\n')}
RESET ROLE;
SELECT 'FINAL|attendees|' || coalesce(string_agg(child_id::text, ',' ORDER BY child_id), '') FROM public.session_attendees;
SELECT 'FINAL|sessions|' || count(*) FROM public.sessions;
SELECT 'FINAL|letter_mastery|' || coalesce(string_agg(child_id::text, ',' ORDER BY child_id), '') FROM public.letter_mastery;
SELECT 'FINAL|child_ea_assignments|' || coalesce(string_agg(child_id::text || '=' || coalesce(unassigned_at::text, 'active'), ',' ORDER BY child_id), '') FROM public.child_ea_assignments;
ROLLBACK;`;
      const result = runCapture({ databaseUrl, sql, label: `replay-${wire.label}` });
      if (result.status !== 0) throw new Error(`replay ${wire.label} failed:\n${result.stderr}`);
      const pg = new Map();
      for (const line of result.stderr.split('\n')) {
        const m = line.match(/NOTICE:\s+REQ\|(\d+)\|(.*)$/);
        if (m) pg.set(Number(m[1]), m[2]);
      }
      const rows = wire.requests.map((req) => {
        const pgResult = pg.get(req.seq) || 'missing';
        const [kind, a, b] = pgResult.split('|');
        const pgOutcome = kind === 'ok' ? `ok rows=${a}` : kind === 'err' ? `${a} "${b}"` : pgResult;
        const fakeOutcome = req.fake.outcome === 'ok'
          ? `ok${req.fake.rowsAffected != null ? ` rows=${req.fake.rowsAffected}` : ''}`
          : `${req.fake.outcome} "${req.fake.message}"`;
        const agree = kind === 'skipped'
          || (kind === 'ok' && req.fake.outcome === 'ok' && (req.fake.rowsAffected == null || Number(a) === req.fake.rowsAffected))
          || (kind === 'err' && a === req.fake.outcome);
        const short = req.target.startsWith('rpc/') ? `${req.target} child=${req.body.p_child_id || ''}`
          : `${req.method} ${req.target}${Array.isArray(req.body) ? `[batch:${req.body.length}]` : ''}`;
        return { seq: req.seq, request: short, fake: fakeOutcome, postgres: pgOutcome, agree };
      });
      out.scenarios[wire.label] = {
        requests: rows,
        allAgree: rows.every((r) => r.agree),
        final: result.stdout.split('\n').filter(Boolean),
      };
    }
  } finally {
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${qi(databaseName)} WITH (FORCE);`, label: 'drop' });
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
};

main();

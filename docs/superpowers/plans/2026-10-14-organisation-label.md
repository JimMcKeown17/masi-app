# Organisation Label v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repository the implementer for each task is **Codex through the plugin** (gpt-5.6-sol); Claude reviews every diff, reruns the tests, and commits.

**Goal:** Record which organisation employs each staff member, as a required label with no default, before field data exists.

**Architecture:** One canonical Supabase migration adds `public.organizations` (readable only by `service_role`) and a required `public.users.organization_id`, backfilling existing users to Masinyusane through a catalog-only default so no `updated_at` moves. The provisioning script requires an organisation and refuses to change an existing user's. Nothing on the phone changes. The label is identity only: no RLS policy, trigger, or app behaviour reads it.

**Tech Stack:** Supabase PostgreSQL 17 migrations; Node scripts; the disposable PostgreSQL 17 harness pattern from `scripts/upload-contract-postgres-harness.cjs`; Jest under Node 20.

**Spec (decision source):** Jim, 2026-10-14: "A partner organisation is absolutely plausible within a year", with the instruction to follow Zazi iZandi. The design is Zazi's organisation label v1 (`zazi-izandi-app/documentation/plans/2026-09-22-organization-label-v1-card.md`, migration `supabase/migrations/20260922175324_organization_label_v1.sql`, commits `12319c33` and `7d96f703`), adapted to Masi's roster table `public.users`. Roadmap §0 item and memo Z19 (`documentation/zazi-sync-lessons-for-masi-2026-10-08.md`).

## What transfers from Zazi and what does not

| Zazi | Masi |
|---|---|
| `organizations (id, slug, name, created_at)`, slug check `^[a-z0-9-]{2,40}$`, non-blank name | Same |
| Masinyusane's fixed id `a111879f-d066-47c9-95a1-bed2a400319a` | Same id, so one organisation has one id across the portfolio |
| Masifunde seeded as the partner | Not seeded. A partner is added by a migration when it exists |
| Column on `education_assistants` | Column on `public.users` (Masi's staff roster; the app only reads it, service-role scripts write it) |
| Catalog-only constant default, then `DROP DEFAULT` + `SET NOT NULL` in one migration | Same; Masi's `users` has a `before update` `updated_at` trigger, which a fast default does not fire |
| RLS on, no policies; `REVOKE ALL` from every API role; `GRANT SELECT` to `service_role` | Same. Zazi found that a disposable database without default ACLs hides a missing `REVOKE` (`2b8ecf38`), so the harness asserts the grants explicitly |
| Provisioning requires `--organization <slug>`; preflight refuses a different stored organisation; insert-only compare-and-set | Same rule in `scripts/createTesters.js` |
| Reporting RPC v2 and Django/Next.js organisation filters | Not in this repo. Masi's reporting surfaces must default to Masinyusane and gain a filter when a partner exists; recorded in the roadmap |
| Phone ignores the column | Same: the profile read `select('*')` returns it and the app does not use it |

## Global Constraints

- Run Jest under Node 20: prefix every Jest command with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Stay on npm; add no dependencies.
- DDL only through `supabase/migrations/`. **No hosted apply** to `masi-app-sqlite` (`segygjzpujphwvrubusm`) without Jim's explicit yes; never touch `jcqrlwetutnpuchjoyyd`; never run raw `supabase` CLI; never source `.env.local`.
- Local harness runs need `PGTZ=UTC` and the three `HISTORY_RLS_*` variables (see `documentation/build-log.md` 2026-10-10 S1 row).
- Codex leaves changes uncommitted; the controller reviews and commits. No agent co-author trailer. Never use bare `git stash`.
- Update `documentation/rls-sync-contract-map.md`, `CONTEXT.md`, `documentation/ROADMAP.md`, and `documentation/build-log.md` in this branch.

## Review Focus

1. **An existing user's `updated_at` does not move** when the migration runs (the backfill must be catalog-only). Pinned in Task 1.
2. **A writer that omits the organisation fails** with `23502`, never silently files a partner's staff under Masinyusane. Pinned in Task 1.
3. **Re-running provisioning for an existing user with a different organisation** refuses before any write, and leaves the stored organisation unchanged. Pinned in Task 2.
4. **An authenticated EA cannot list organisations** (`42501`), and anonymous callers cannot either; `service_role` can. Pinned in Task 1.
5. **The app's own profile read still works** after the column appears (`select('*', school_lookup…, job_title_lookup…)` on the EA's own row). Pinned in Task 1.

---

### Task 1: Migration and PostgreSQL harness

**Files:**
- Create: `supabase/migrations/20261014120000_organisation_label_v1.sql`, `scripts/organisation-label-postgres-harness.cjs`
- Modify: `package.json` (`"verify:organisation-label:postgres": "node scripts/organisation-label-postgres-harness.cjs"`), `.github/workflows/tests.yml` (a step after the S1 harness, same `HISTORY_RLS_*` env)
- Test: `__tests__/organisationLabelPostgresHarness.test.js` (migration bounds and mocked process/cleanup safeguards; the controller runs the real PostgreSQL checks)

- [ ] **Step 1: Write the harness (red first).** Reuse `MIGRATIONS_DIR`, `assertDisposableAdminTarget`, `bootstrapSql`, `buildDatabaseUrl`, `expectSqlState`, `runPsql` from `scripts/history-authorization-postgres-harness.cjs`. Database name `${HISTORY_RLS_DATABASE_NAME}_org`. Sequence:
  1. Drop/create the database (two separate psql calls), apply `bootstrapSql`, then install Supabase-style default privileges locally: `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;` and the same for sequences and functions. Create `public.org_harness_acl_control` and assert authenticated has SELECT on it. Replay every migration **before** `20261014120000_organisation_label_v1.sql` in filename order. Leave shared `bootstrapSql` unchanged.
  2. Insert a fixture: one `auth.users` row and its `public.users` row (`id '12000000-0000-0000-0000-000000000001'`, school as in the S1 fixture) with `updated_at = '2026-01-01T00:00:00Z'`.
  3. Spawn a second psql connection with `BEGIN; LOCK TABLE public.users IN ACCESS SHARE MODE; SELECT pg_sleep(20); ROLLBACK;`. Observe its granted lock in `pg_locks` before applying the migration. Assert SQLSTATE `55P03` in 8–15 seconds and no partial schema: `public.organizations` and `users.organization_id` must both be absent. In `finally`, terminate the tagged backend, terminate/await the psql child, and escalate to SIGKILL if needed. The blocker uses the shared sanitized `buildPsqlEnv`.
  4. After the blocker is cleaned up, apply `20261014120000_organisation_label_v1.sql` for real.
  5. Assert, each as its own check (the original 18; with the ACL control and four lock/rollback checks, 23 total):
     - the fixture user's `organization_id` is `a111879f-d066-47c9-95a1-bed2a400319a` and `updated_at` is still `2026-01-01 00:00:00+00`;
     - `information_schema.columns` reports `is_nullable = 'NO'` and `column_default is null` for `users.organization_id`;
     - inserting a `public.users` row without `organization_id` fails with `23502`;
     - inserting one with an unknown organisation id fails with `23503`;
     - as `authenticated` (with `request.jwt.claim.sub` set to the fixture user), `select * from public.organizations` fails with `42501`; the same as `anon` fails with `42501`;
     - as `service_role`, `select slug from public.organizations` returns `masinyusane`;
     - `has_table_privilege('authenticated', 'public.organizations', 'SELECT')` is false, and the same for `anon` and `authenticator`; `service_role` has `SELECT` and no `INSERT`/`UPDATE`/`DELETE`;
     - as `authenticated`, the app's profile read `select u.*, s.id, s.name, j.id, j.name, j.code from public.users u left join public.schools s on s.id = u.school_id left join public.job_titles j on j.id = u.job_title_id where u.id = '<fixture>'` returns one row including `organization_id`.
- [ ] **Step 2: Run the harness to verify it fails** (migration file absent): `PGTZ=UTC HISTORY_RLS_ADMIN_DATABASE_URL=… HISTORY_RLS_DATABASE_NAME=masi_history_rls_org HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE npm run verify:organisation-label:postgres`. Codex's sandbox cannot reach a local PostgreSQL; the controller runs every harness RED and GREEN.
- [ ] **Step 3: Write the migration.** Local 10-second lock and 60-second statement timeouts, and no `BEGIN`/`COMMIT` in the file: the Supabase CLI applies the file and its `schema_migrations` insert in one implicit transaction (CLI 2.109.1, `pkg/migration/file.go`), so an explicit `COMMIT` would split them. The harness wraps the file in `BEGIN`/`COMMIT` to model the CLI. A lock refusal must roll back all schema changes.

```sql
-- Organisation label v1 (Jim, 2026-10-14; design from Zazi iZandi's
-- 20260922175324_organization_label_v1.sql). Identity only: no RLS policy,
-- trigger, or app behaviour reads it. The phone ignores the column.

-- No BEGIN/COMMIT: the Supabase CLI owns the transaction.

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (pg_catalog.btrim(name) <> ''),
  created_at timestamptz not null default now()
);

-- Masinyusane uses the same fixed id as in Zazi iZandi, so one organisation
-- has one id across the portfolio. Partners are added by migration.
insert into public.organizations (id, slug, name)
values ('a111879f-d066-47c9-95a1-bed2a400319a', 'masinyusane', 'Masinyusane');

-- RLS on with no policies: no API role reads through RLS. service_role gets
-- SELECT only, so provisioning can resolve a slug. The disposable harness
-- installs Supabase-style default ACLs to prove these revocations remove them.
alter table public.organizations enable row level security;
revoke all on table public.organizations
  from public, anon, authenticated, authenticator, service_role;
grant select on table public.organizations to service_role;

-- Every existing user is Masinyusane staff (Jim, 2026-10-14). A constant
-- default is stored once in the catalog: existing rows read it without a
-- rewrite and without firing the users updated_at trigger. Dropping the
-- default then leaves future inserts with none, so a writer that omits the
-- organisation fails with 23502 instead of filing a partner under Masinyusane.
alter table public.users
  add column organization_id uuid
    default 'a111879f-d066-47c9-95a1-bed2a400319a'
    references public.organizations (id) on delete restrict;

alter table public.users
  alter column organization_id drop default,
  alter column organization_id set not null;

create index idx_users_organization_id on public.users (organization_id);

comment on column public.users.organization_id is
  'Employing organisation. Written once at account creation; never changed.';
```

- [ ] **Step 4: Run the harness, then the existing harnesses** (history, S1) to prove nothing else changed. Expected: all pass.
- [ ] **Step 5: Leave uncommitted; report.** Controller commits as `feat(db): add the organisation label to staff`.

### Task 2: Provisioning requires an organisation

**Files:**
- Modify: `scripts/createTesters.js`, `scripts/lib/` (put pure helpers in a new `scripts/lib/organisationProvisioning.js`), `scripts/testers.example.csv` comment if it documents usage
- Test: `__tests__/organisationProvisioning.test.js`, plus `__tests__/testerProvisioning.test.js` if its usage assertions change

**Interfaces:**
- `parseOrganisationArg(argv) → slug` throws `Usage: … --organization <slug>` when absent or not matching `^[a-z0-9-]{2,40}$`.
- `resolveOrganisationId(admin, slug) → uuid` selects `id` from `organizations` by slug through the service-role client; unknown slug throws `Unknown organisation "<slug>"` before any user is touched.
- `checkExistingOrganisation(existingProfile, organisationId) → { ok: true } | { ok: false, reason }`: a stored `organization_id` that differs is refused with reason `organisation_conflict`.
- `buildProfile(row, lookupMaps, userId, organisationId)` includes `organization_id`.
- The preflight (`preflightExistingTester`) runs the organisation check first. The write then uses `upsert(profile, { onConflict: 'id', ignoreDuplicates: true })` to insert only if absent, followed by a conditional UPDATE of `first_name`, `last_name`, `email`, `job_title_id`, and `school_id` only. Never update `organization_id`. Constrain the UPDATE with `.eq('id', userId).eq('organization_id', organisationId).select('id')`. Zero returned rows means `organisation_conflict` before any Programme-assignment write; delete the auth user only if this run created it, as on other downstream failures. This protects against another organisation inserting the profile after preflight.

- [ ] **Step 1: Write the failing tests** for each helper: missing flag, malformed slug, unknown slug (mock client returning no row), matching stored organisation passes, different stored organisation refuses, `buildProfile` carries the id. Assert that on conflict no `users` upsert is attempted (mock client records calls).
  Also reproduce the write race through the real `processRow`: preflight sees no profile, another organisation's profile lands before the write, and the losing run must return `organisation_conflict`, leave the stored organisation unchanged, and write no Programme assignment. Cover new-auth cleanup, a concurrent matching organisation, and conditional-update errors. Known preflight conflicts still attempt no profile write.
- [ ] **Step 2: Run to verify failure:** `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/organisationProvisioning.test.js __tests__/testerProvisioning.test.js`.
- [ ] **Step 3: Implement.** Usage line becomes `node scripts/createTesters.js [--dry-run] --organization <slug> <path-to-csv>`. `--dry-run` still resolves the slug (read-only) and reports conflicts.
- [ ] **Step 4: Run** the focused tests and `npm test -- --silent`. Expected: pass.
- [ ] **Step 5: Leave uncommitted; report.** Controller commits as `feat(scripts): require an organisation when provisioning staff`.

### Task 3: Documentation

**Files:** `documentation/rls-sync-contract-map.md` (users row: `organization_id`, not synced to the phone; `organizations` table: service-role only, no policies), `CONTEXT.md` (term **Organisation**: the employer of a staff member; a label, not an access boundary), `documentation/ROADMAP.md` (§0 decision closed 2026-10-14; new open item: reporting surfaces default to Masinyusane and gain an organisation filter when the first partner exists; hosted apply pending Jim's yes), `documentation/build-log.md` (Decision row for the label and the shared Masinyusane id; Verification row with harness and test commands and results).

- [ ] **Step 1: Write the docs. Step 2: `git diff --check`. Step 3: Leave uncommitted; report.** Controller commits as `docs: record the organisation label`.

### Task 4 (only with Jim's yes): hosted apply

`npm run sqlite:staging:dry-run` must list only `20261014120000_organisation_label_v1.sql`; then `npm run sqlite:staging:push`; then a read-only probe (organisation row, column nullability and default, grants, every existing user labelled, `updated_at` values unchanged against a pre-apply snapshot of `id, updated_at`). Record in the build log.

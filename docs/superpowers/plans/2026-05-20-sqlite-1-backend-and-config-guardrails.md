# SQLite 1 Backend And Config Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a clean new Supabase target and app configuration guardrails before any mobile storage code points at it.

**Architecture:** Keep the current app working against the current backend while the new backend is built separately. Migrate `app.json` static config to `app.config.js`, add a config resolver that refuses mismatched Supabase target/project/URL combinations, and add staging scripts that always start Expo with explicit public env values.

**Tech Stack:** Supabase CLI, Supabase Postgres/RLS, Expo `app.config.js`, Jest.

---

## Inputs

- Spec: `docs/superpowers/specs/2026-05-20-sqlite-migration-design.md`
- Shared log: `documentation/sqlite-refactor-log.md`
- Current backend: `jcqrlwetutnpuchjoyyd`

## Tasks

### Task 1: Create New Supabase Project Record

**Files:**
- Modify: `documentation/sqlite-refactor-log.md`
- Create: `documentation/sqlite-staging-setup.md`

- [ ] **Step 1: Create project externally**

Create a new Supabase project in the Supabase dashboard or authenticated Terminal. Record project ref, URL, and whether it is staging-only or intended to become primary.

- [ ] **Step 2: Document local env names**

Add to `documentation/sqlite-staging-setup.md`:

```bash
SUPABASE_PROJECT_ID_SQLITE=project_ref_from_supabase_dashboard
SUPABASE_PROJECT_URL_SQLITE=https://project_ref_from_supabase_dashboard.supabase.co
SUPABASE_DB_PASSWORD_SQLITE=db_password_from_supabase_dashboard
SUPABASE_PUBLISHABLE_KEY_SQLITE=publishable_key_from_supabase_dashboard
```

Do not document service-role values in this file.

### Task 2: Add App Config Guard

**Files:**
- Create: `config/supabaseProjectConfig.js`
- Modify: `src/services/supabaseClient.js`
- Create: `app.config.js`
- Modify: `app.json`
- Test: `__tests__/supabaseProjectConfig.test.js`

- [ ] **Step 1: Write config resolver tests first**

Tests must cover:

- primary target resolves `jcqrlwetutnpuchjoyyd`
- sqlite target requires explicit project ID, URL, and anon/publishable key
- mismatched URL and project ID throws
- unknown target throws

Run:

```bash
npm test -- --runInBand __tests__/supabaseProjectConfig.test.js
```

Expected: fails because resolver does not exist.

- [ ] **Step 2: Implement resolver**

Use `KNOWN_SUPABASE_PROJECTS` with `primary: 'jcqrlwetutnpuchjoyyd'` and a sqlite-staging value read from env during local scripts.

The resolver returns:

```javascript
{
  supabaseTarget,
  supabaseProjectId,
  supabaseUrl,
  supabaseAnonKey
}
```

- [ ] **Step 3: Migrate Expo config to `app.config.js`**

Move existing `app.json` values into `app.config.js` so Supabase project values can be resolved at build/runtime through `config/supabaseProjectConfig.js`.

Keep all existing app identity values unchanged:

- `name: "Masi"`
- `slug: "masi-mobile-app"`
- `ios.bundleIdentifier: "org.masinyusane.masi"`
- `android.package: "org.masinyusane.masi"`
- current EAS project ID
- update URL and runtime policy

Expected behavior:

- default config still points at current primary until backend promotion
- sqlite staging start scripts override public Supabase env values explicitly

- [ ] **Step 4: Wire Supabase client**

Change `src/services/supabaseClient.js` to use the resolver and keep Supabase Auth persistence in AsyncStorage.

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- --runInBand __tests__/supabaseProjectConfig.test.js
git diff --check
```

### Task 3: Add SQLite Staging Helper

**Files:**
- Create: `scripts/sqlite-staging.cjs`
- Modify: `package.json`
- Modify: `documentation/sqlite-staging-setup.md`

- [ ] **Step 1: Add script commands**

Add:

```json
{
  "sqlite:staging:check": "node scripts/sqlite-staging.cjs check",
  "sqlite:staging:link": "node scripts/sqlite-staging.cjs link",
  "sqlite:staging:migrations": "node scripts/sqlite-staging.cjs migration-list",
  "sqlite:staging:dry-run": "node scripts/sqlite-staging.cjs db-push-dry-run",
  "sqlite:staging:push": "node scripts/sqlite-staging.cjs db-push",
  "sqlite:staging:advisors": "node scripts/sqlite-staging.cjs advisors",
  "sqlite:staging:start": "node scripts/sqlite-staging.cjs start",
  "sqlite:staging:ios": "node scripts/sqlite-staging.cjs ios",
  "sqlite:staging:android": "node scripts/sqlite-staging.cjs android"
}
```

- [ ] **Step 2: Implement helper**

The helper reads `.env`, never prints secrets, maps `SUPABASE_DB_PASSWORD_SQLITE` to `SUPABASE_DB_PASSWORD`, and starts Expo with:

```bash
EXPO_PUBLIC_SUPABASE_TARGET=sqlite-staging
EXPO_PUBLIC_SUPABASE_PROJECT_ID=project_ref_from_env
EXPO_PUBLIC_SUPABASE_URL=project_url_from_env
EXPO_PUBLIC_SUPABASE_ANON_KEY=publishable_key_from_env
```

- [ ] **Step 3: Verify helper**

Run:

```bash
npm run sqlite:staging:check
git diff --check
```

### Task 4: Create Server Migration Shell

**Files:**
- Create: `supabase/migrations/*.sql`
- Modify: `documentation/sqlite-staging-setup.md`

- [ ] **Step 1: Initialize canonical Supabase folder**

Run:

```bash
supabase --help
supabase migration new masi_clean_base_schema
supabase migration new masi_clean_rls_policies
supabase migration new masi_seed_reference_data
```

Use the generated filenames. Do not hand-write timestamped migration names.

- [ ] **Step 2: Add Data API grants and RLS to migration contract**

Every mobile-exposed table must have:

```sql
alter table public.table_name enable row level security;
grant select, insert, update, delete on public.table_name to authenticated;
```

Use narrower grants for read-only tables:

```sql
grant select on public.schools to authenticated;
grant select on public.programmes to authenticated;
grant select on public.job_titles to authenticated;
grant select on public.assessment_tools to authenticated;
```

This is required for new Supabase projects where public tables may not be auto-exposed to the Data API.

- [ ] **Step 3: Ban policy string replacement**

Migration files must not update policies by string replacement against `pg_policies.qual` or `pg_policies.with_check`.

Allowed:

```sql
drop policy if exists policy_name on public.table_name;
create policy policy_name on public.table_name
  for select to authenticated
  using (...);
```

Allowed:

```sql
alter policy policy_name on public.table_name
  using (...);
```

Not allowed:

```sql
replace(qual::text, 'public.', 'private.')
```

- [ ] **Step 4: Implement the spec RLS policy strategy**

The RLS migrations implement the exact policy model in `docs/superpowers/specs/2026-05-20-sqlite-migration-design.md`, not a new design invented during implementation.

Required policy contracts:

- mobile-created `children`, `classes`, and `groups` have SELECT through assignment/membership joins plus fallback `created_by = auth.uid()` SELECT policies
- `sessions`, `session_attendees`, `assessments`, `assessment_items`, and `letter_mastery` writes require an active `child_ea_assignments` row at write time
- historical assignees can still read child-specific event rows after handover
- old EAs cannot write child-specific event rows after `child_ea_assignments.unassigned_at` is set
- `time_entries` are self-scoped by `user_id = auth.uid()`
- admin-preloaded `classes` use service role and are not created through the mobile path
- cross-programme reads for the same child are allowed at RLS level; repository queries apply the default programme filter

### Review Gate

- [ ] Run:

```bash
npm test -- --runInBand __tests__/supabaseProjectConfig.test.js
npm run sqlite:staging:check
git diff --check
```

- [ ] Update `documentation/sqlite-refactor-log.md` with decisions and verification.
- [ ] Request a parallel code-review pass for config, secrets handling, RLS/Data API grants, and migration shell.
- [ ] Get user signoff before Plan 2.

# Masi App - Claude Context

## Project Overview
A React Native mobile application for Masi, a nonprofit, to manage their field staff's work with children, track time, record educational sessions, and children's assessments.

## Documentation Structure
Always consult these key documentation files:
- **PRD.md**: Complete product requirements, tech stack, database schema, feature specifications, and development progress
- **LEARNING.md**: Educational documentation of architectural decisions (**update regularly as you build**)
- **DATABASE_SCHEMA_GUIDE.md**: Detailed database schema reference and design rationale
- **documentation/sqlite-refactor-log.md**: Durable running log for the clean-slate SQLite refactor decisions, bugs, assumptions, verification, and review findings

## Quick Reference

### Navigation
Bottom tabs: Home → My Children → Sessions → Assessments
- Profile accessed via gear icon (⚙️) in Home tab header
- Sign In / Sign Out lives on Home screen (not a dedicated tab)
- Assessments tab contains EGRA Letter Sound Assessment feature
See PRD.md for complete app structure.

## Current Major Work -- Clean-Slate SQLite Refactor

We are beginning a clean-slate AsyncStorage-to-SQLite refactor. The active planning artifacts are:

- Spec: `docs/superpowers/specs/2026-05-20-sqlite-migration-design.md`
- Plans: `docs/superpowers/plans/2026-05-20-sqlite-*.md`
- Shared log: `documentation/sqlite-refactor-log.md`

Locked decisions for this refactor:

- This is a clean-slate storage and backend rebuild, not a backwards-compatible migration of existing field-device AsyncStorage data.
- Use a new Supabase backend and fresh auth users.
- No legacy AsyncStorage domain migration, no `legacyAsyncStorageMigration.js`, and no previous-user pending-outbox recovery flow.
- Field staff may lose unsynced device data at cutover; the user will handle communication.
- Domain and sync data move to SQLite. Supabase Auth session storage and app logs may remain in AsyncStorage.
- Use normalized tables from day one: `child_ea_assignments`, `child_group_memberships`, `child_programme_enrollments`, `session_attendees`, and `assessment_items`.
- Programme behavior is defined in the spec: children can have multiple programme enrollments, My Children is active-programme-scoped, and sessions/assessments store `programme_id` at creation.
- RLS behavior is defined in the spec: broad cross-programme reads for the same child are allowed for trusted field staff, while writes require active assignment.

The older "prefer backwards-compatible changes" guidance below still applies to ordinary production maintenance on the current app/backend. For this SQLite refactor, follow the clean-slate spec and log decisions instead of adding compatibility layers unless the user explicitly changes the cutover decision.

## Test Driven Development

Use the local TDD skill for this refactor: `/Users/jimmckeown/Development/masi-app/.agents/skills/tdd`.

Follow the skill's red-green-refactor loop:

- write one behavior test first
- run it and confirm it fails for the expected reason
- implement the smallest change that makes it pass
- refactor only while green
- repeat in vertical slices, not by writing all tests first

Prefer behavior/integration-style tests through public repository, context, service, or screen interfaces. Do not over-mock internals. SQLite migration, outbox, transaction, and PRAGMA behavior must include real SQLite or `better-sqlite3` integration coverage where mocks would hide device-only bugs.

## Deployment Status — Multiple App Versions in the Wild

The app launched in early March 2026 and is in its **first two weeks of field testing**. Multiple versions are simultaneously deployed across iOS and Android devices. Users do not update immediately.

**Rule: prefer backwards-compatible changes wherever possible.**

Exception: the clean-slate SQLite refactor has a user-approved one-shot cutover and is not optimized for backwards compatibility with the current backend or current field-device AsyncStorage data.

During the current field-testing window, force-update is operationally acceptable when a migration requires it, but still prefer a compatibility build and verification gate before destructive drops.

For database schema changes specifically:
- **Safe:** Adding nullable columns, adding new tables, relaxing constraints
- **Risky:** Dropping or renaming columns, tightening constraints, changing column types
- **Pattern:** Add the new column first → deploy the app → drop the old column only after all users have updated

When dropping a column that an older app version still writes, sync will fail with `PGRST204` for every affected record, cascading into FK failures on dependent tables. See migration 07 for an example of the compatibility fix this required.

## Key Implementation Patterns

### Offline Sync Strategy
All writes save locally first (`synced: false`) → background sync upserts to Supabase when online → last-write-wins conflict resolution. See PRD.md and `src/services/offlineSync.js` for full details.

For the SQLite refactor, replace `synced: false` scanning with durable `sync_outbox` processing as specified in the SQLite migration spec and plans. Multi-step domain writes plus outbox enqueue must be atomic.

## Known Issues & Testing Watchlist

### Offline Sync — Upsert + RLS Gotcha
PostgreSQL upserts require **SELECT visibility through RLS** to check the unique index — even when no conflict exists. Junction-table-based SELECT policies block upserts if the junction record hasn't synced yet. Fix: add a permissive SELECT policy on a direct column (e.g., `created_by = auth.uid()`). See migration `05_fix_children_select_rls_for_upsert.sql`.

### Schema Drift — Migration Files ≠ Production
**The `supabase-migrations/` directory has diverged from the live Supabase schema in multiple confirmed cases.** Treat migration files as *intent*, not *truth*. Known drifts (as of 2026-04-24):

- `children.synced` — defined in `00_initial_schema.sql` but absent in prod. Likely dropped manually via Studio at some point; no migration captures the change. Dashboard reads that filter on it return `code=42703` ("column does not exist").
- `time_entries.auto_clocked_out` — the app has been writing this field since the auto-clock-out feature landed, but the column was never created in prod until `10_add_auto_clocked_out_to_time_entries.sql`. Every auto-clocked-out record failed sync with `PGRST204` in the meantime.
- `users.job_title` — originally an enum in `00_initial_schema.sql`; prod has it as text and the enum type no longer exists. Migration 13 captures this drift.
- `children.age` — originally NOT NULL with a narrow CHECK; prod allows NULL and has no age CHECK. Migration 13 captures this drift.

**Before any schema-facing work** (writing migrations, building a dashboard, reviewing sync failures):
- Check the live schema via Supabase Studio → Table Editor OR a `supabase db pull`.
- Do NOT assume `supabase-migrations/` is authoritative.

**Symptoms to watch for**:
- `PGRST204` in mobile sync logs = *client writes a column prod doesn't have* → either add the column with a new migration (`ADD COLUMN IF NOT EXISTS ... DEFAULT ...`) or strip the field client-side. Prefer the migration; stripping loses data.
- `code=42703` in server reads = *prod is missing a column the migration file claims exists* → update the consumer code (dashboard, report, etc.) to not assume that column, and optionally add a migration to formally drop it from `supabase-migrations/` so history matches prod.

**Fix pattern**: always prefer additive, idempotent SQL (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`). Never rely on a clean migration history — it isn't clean.

**DDL rule**: all schema changes must go through migration files. Use Supabase `apply_migration` or `supabase migration new` for `ALTER TABLE`, `DROP TYPE`, `CREATE TABLE`, policy changes, and destructive drops. Do not run production DDL through ad-hoc `execute_sql`; use `execute_sql` for read-only preflights and verification queries.

For the new SQLite backend, use canonical Supabase CLI migrations under `supabase/migrations/`. Treat `supabase-migrations/` as historical reference only.

### TEMPORARY: Two Supabase backends — keep the CLI off the wrong one
*(Clean-slate refactor only. Remove once the SQLite cutover is complete.)*

Two Supabase projects exist:
- `masi-app` — current production, ref `jcqrlwetutnpuchjoyyd`
- `masi-app-sqlite` — clean-slate refactor backend, ref `segygjzpujphwvrubusm` (the repo is `supabase link`ed to this one)

`.env.local` carries the **old `masi-app`** connection (`MASI_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL` resolve to `jcqrlwetutnpuchjoyyd`). That is correct for the current production app — the clean-slate build selects `masi-app-sqlite` via `config/supabaseProjectConfig.js`.

**Trap:** running the `supabase` CLI with `.env.local` injected into its environment (e.g. wrapped in a `dotenv` loader) makes the CLI pick up the old-project connection and silently query **old production** — even when you pass `--linked`. Run `supabase db query --linked` plainly instead; `--linked` resolves `masi-app-sqlite` via the CLI's own auth. Do not inject `.env.local` into `supabase` CLI commands.

### EAS Builds — Environment Variables Not in `.env.local`
`process.env.EXPO_PUBLIC_*` variables from `.env.local` are NOT available in EAS cloud builds. Public values (Supabase URL, anon key) must also be available through Expo config `extra` with a fallback in the client. The current app used `app.json`; Plan 1 of the SQLite refactor migrates this to `app.config.js` with explicit Supabase target guardrails.
```javascript
const url = process.env.EXPO_PUBLIC_SUPABASE_URL
  || Constants.expoConfig?.extra?.supabaseUrl || '';
```

### Debugging Tools Available
- **Profile → Export Logs**: captures all `console.log/error/warn` output to a shareable text file
- **Profile → Export Database**: before the SQLite refactor, exports full AsyncStorage as JSON (includes sync queue, retry counts, failed items). Plan 6 changes this to a SQLite-aware support export.

---

## Documentation Guidelines

### IMPORTANT: Track Progress and Document Decisions

- **PRD.md → Development Progress**: Add a `- [ ]` checklist when starting multi-step work. Check off items as you go.
- **LEARNING.md** (`documentation/`): After significant architectural decisions or tricky bug fixes, add a narrative section explaining the "why" — written like teaching a junior developer.
- **documentation/sqlite-refactor-log.md**: During the SQLite refactor, update this after every task or meaningful work session. Always log bugs/problems, important assumptions, design decisions, review findings, verification commands, device checks, and anything surprising.
- **Always branch** off to a new git branch for features or bug fixes.

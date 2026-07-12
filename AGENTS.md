# Masi App - Agent Context

This file is the single source of truth for agent guidance in this repo. `CLAUDE.md` re-exports it via `@AGENTS.md`, so changes here flow to every agent automatically.

## Project Overview
A React Native mobile application for Masi, a nonprofit, to manage their field staff's work with children, track time, record educational sessions, and children's assessments.

## When Building

Default build workflow for Claude: Claude/Fable owns design, spec, review, and verification; delegate non-trivial implementation to Codex via `codex-first`, then inspect the diff and tests before ship. Use gpt-5.6-sol for most tasks.

## Agent skills

### Issue tracker

Issues and PRDs live as **GitHub issues** on `JimMcKeown17/masi-app` (use the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Documentation Structure
Always consult these key documentation files:
- **CONTEXT.md** (repo root): Domain glossary. The canonical definitions of programme, group, class, session, EA, field vs in-app assessment, and the head-office grouping workflow. Read this before any UX, schema, or naming discussion so terms stay grounded. The repo is single-context, so there is no `CONTEXT-MAP.md`; if Masi later splits into multiple bounded contexts, add one per the `grill-with-docs` skill convention.
- **PRD.md**: Complete product requirements, tech stack, database schema, feature specifications, and development progress.
- **LEARNING.md** (in `documentation/`): Educational documentation of architectural decisions (**update regularly as you build**).
- **documentation/DATABASE_SCHEMA_GUIDE.md**: Detailed database schema reference and design rationale.
- **documentation/rls-sync-contract-map.md**: Table-by-table RLS/sync operation contract. Consult this before changing RLS policies, synced repositories, outbox ordering, Supabase migrations, or server payload columns.
- **documentation/sqlite-refactor-log.md**: Durable running log for the clean-slate SQLite refactor decisions, bugs, assumptions, verification, and review findings.
- **docs/adr/** (if present): Architectural Decision Records for hard-to-reverse decisions with real trade-offs. Created lazily by the `grill-with-docs` skill.
- **docs/agent-context/** (if present): Progressive-disclosure briefings for specific in-flight workstreams. Read the relevant file *before* picking up any task in that workstream. Current entries:
  - `wela-assessment-component-build.md` — the WelaPLUS Assessment Battery work (modular in-app battery, open-source Tool components). PRD at `documentation/wela-plus-battery-prd-2026.md` (~45% complete). Read this file before any work on assessments, batteries, runs, or tools.

## Quick Reference

### Navigation
Bottom tabs: Home → My Children → Sessions → Assessments
- Profile accessed via gear icon (⚙️) in Home tab header
- Sign In / Sign Out lives on Home screen (not a dedicated tab)
- Assessments tab contains EGRA Letter Sound Assessment feature
See PRD.md for complete app structure.

## Cybersecurity
Prefer pnpm instead of npm or yarn for JavaScript dependency management where practical.
Configure pnpm with minimumReleaseAge: 1440 so newly published package versions cannot be installed until they are at least 24 hours old.
npm has been compromised by hackers many times recently, so we need to take extra precaution.

**Package-manager status:** this repository currently uses npm and `package-lock.json`. Stay on npm for ordinary app work; package-manager migration is a separate task.

**Adding dependencies — make the case, don't reflexively avoid them.** The caution above is about supply-chain risk, not a blanket "never add packages" rule. When a high-quality, well-known, widely-adopted dependency would do the job better than hand-rolled code (e.g. `react-native-svg` for vector drawing), proactively make the case for installing it — state what it's for, why it beats reinventing it, and confirm it's mature/widely-used — rather than silently working around its absence with a worse implementation. The user decides; your job is to surface the option with a clear recommendation. Still respect the safety posture: prefer established packages over obscure ones, and remember newly published versions should age before install.

## Current Architecture -- SQLite Backend

As of 2026-05-26, the SQLite backend is the app's forward path. New work should assume normalized SQLite local storage, durable `sync_outbox`, and the `masi-app-sqlite` Supabase backend (`segygjzpujphwvrubusm`) unless the user explicitly asks to work on the old production backend.

The SQLite refactor plans are historical implementation evidence; the active forward-looking artifacts are:

- Architecture/spec history: `docs/superpowers/specs/2026-05-20-sqlite-migration-design.md`
- Implementation plan history: `docs/superpowers/plans/2026-05-20-sqlite-*.md`
- RLS/sync contract map: `documentation/rls-sync-contract-map.md`
- Shared log: `documentation/sqlite-refactor-log.md`

Locked decisions from the cutover:

- This is a clean-slate storage and backend rebuild, not a backwards-compatible migration of existing field-device AsyncStorage data.
- Use the `masi-app-sqlite` Supabase backend and fresh auth users.
- No legacy AsyncStorage domain migration, no `legacyAsyncStorageMigration.js`, and no previous-user pending-outbox recovery flow.
- Field staff may lose unsynced legacy-device data at cutover; the user owns any field communication.
- Domain and sync data live in SQLite. Supabase Auth session storage and app logs may remain in AsyncStorage.
- Use normalized tables from day one: `child_ea_assignments`, `child_group_memberships`, `child_programme_enrollments`, `session_attendees`, and `assessment_items`.
- Programme behavior is defined in the spec: children can have multiple programme enrollments, My Children is active-programme-scoped, and sessions/assessments store `programme_id` at creation.
- RLS behavior is defined in the spec and the RLS/sync contract map: broad cross-programme reads for the same child are allowed for trusted field staff, while writes require active assignment. For implementation work, the contract map is the operative table-by-table source because it captures producer fields, exact sync operation shape, SELECT visibility, outbox ordering, and tests.

The older "prefer backwards-compatible changes" guidance below applies to future production maintenance after the SQLite cutover. It does not require compatibility with the retired AsyncStorage domain store or old Supabase schema unless the user explicitly reopens that requirement.

Current release gate status as of 2026-05-26:

- `npm run test:release` has passed after the physical-device RLS fixes: 56 Jest suites / 296 tests, 13 file-backed SQLite integration suites / 113 tests, and SQLite staging guard for `sqlite-staging` / `segygjzpujphwvrubusm`.
- SQLite staging migrations and dry run have passed; advisors have only known/recorded warnings.
- A deeper Android emulator pass has covered fresh sign-in, offline cached restart, offline session and assessment writes, force-stop/reopen with pending outbox, reconnect-and-sync, and Supabase row verification.
- A critical hardening pass has added SQLite WAL/busy-timeout pragmas, assessment-item sync batching/fallback, shared Supabase request queuing for sync uploads, 1000ms background-sync debounce, local-first screen completion without delayed navigation, domain input no-suggestion hardening, visible release/backend identity, and a soft clock-in warning before session capture.
- `supabase db pull --linked --schema public` reached Supabase but was blocked because Docker was not running for the CLI shadow database. Fallback verification used plain `supabase db query --linked` against `masi-app-sqlite` to spot-check high-write public table columns.
- User preview-build testing on an iPhone reported the new build working correctly after the final RLS/sync fixes. Keep testing future UI work against the SQLite backend.

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

Exception: the completed clean-slate SQLite cutover is not optimized for backwards compatibility with the retired AsyncStorage domain store or old Supabase schema.

For database schema changes specifically:
- **Safe:** Adding nullable columns, adding new tables, relaxing constraints
- **Risky:** Dropping or renaming columns, tightening constraints, changing column types
- **Pattern:** Add the new column first → deploy the app → drop the old column only after all users have updated

When dropping a column that an older app version still writes, sync will fail with `PGRST204` for every affected record, cascading into FK failures on dependent tables. See migration 07 for an example of the compatibility fix this required.

## Key Implementation Patterns

### Offline Sync Strategy
All writes save locally first (`synced: false`) → background sync upserts to Supabase when online → last-write-wins conflict resolution. See PRD.md and `src/services/offlineSync.js` for full details.

For current SQLite work, use durable `sync_outbox` processing as specified in the SQLite migration spec and plans. Multi-step domain writes plus outbox enqueue must be atomic. Do not reintroduce `synced: false` table scanning for domain sync.

For RLS-facing SQLite work, also update `documentation/rls-sync-contract-map.md`. Do not treat RLS policies, repository producers, Supabase payload columns, and outbox ordering as separate reviews; they are one contract.

## Known Issues & Testing Watchlist

### Offline Sync — Upsert + RLS Gotcha
PostgreSQL/Supabase upserts require **SELECT visibility through RLS** to check conflicts — even when the row is new from the app's point of view. Junction-table-based SELECT policies can block upserts if the junction record has not synced yet. The current contract is documented in `documentation/rls-sync-contract-map.md`.

Canonical clean-slate migrations for this gotcha include `20260522103000_masi_session_upsert_visibility.sql` and `20260526151352_creator_select_upsert_visibility.sql`. Do not remove `children_select_created_by`, `classes_select_created_by`, or `groups_select_created_by` just to eliminate `multiple_permissive_policies` advisor warnings; those policies are intentional while the mobile client uses queued Supabase upserts.

### Offline Sync — Immutable Assignment Inserts
`child_ea_assignments`, `class_ea_assignments`, and `group_ea_assignments` have database triggers that prevent identity columns from changing after insert. The sync engine must retry `insert` operations for those tables as insert-or-ignore by `id`; archive/update operations may still use update-capable upsert for lifecycle columns like `unassigned_at` and `handover_reason`.

Do not convert immutable assignment insert retries back to generic update-capable upserts. That recreates live-device failures such as `group_ea_assignments identity columns cannot be changed after insert`.

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

For the SQLite backend, use canonical Supabase CLI migrations under `supabase/migrations/`. Treat `supabase-migrations/` as historical reference only.

### Supabase Backends — Keep The CLI On SQLite

Two Supabase projects exist:
- `masi-app-sqlite` — **current forward backend**, ref `segygjzpujphwvrubusm` (the repo is `supabase link`ed to this one). This is the dev/staging + future-production backend for the new SQLite build. **As of 2026-06-09 it has NO field users** — the deployed field app still runs on the legacy backend (below), so `masi-app-sqlite` data is dev/test data you can wipe freely without coordinating with field staff.
- `masi-app` — **legacy pre-SQLite backend**, ref `jcqrlwetutnpuchjoyyd`. **This is what the deployed field app is still writing to.** Do not use for new mobile work unless the user explicitly asks for legacy-backend maintenance.

**Which backend is which (`segygjzpujphwvrubusm` = sqlite, `jcqrlwetutnpuchjoyyd` = legacy). As of 2026-07-12 every default points at the SQLite backend; verify the ref anyway:**
- **The app** → `config/supabaseProjectConfig.js` defaults to `sqlite-staging` with committed publishable-key fallbacks, so plain `npm start`, dev builds, and the `eas.json` preview and production profiles all target `masi-app-sqlite`. The legacy backend is reachable only behind an explicit `EXPO_PUBLIC_SUPABASE_TARGET=primary`. A URL that belongs to a different target than the selected one (e.g. a stale `.env.local` override) fails fast at startup with an actionable error instead of silently connecting to the wrong backend.
- **The repo `supabase link`** → `masi-app-sqlite` ✅. So `supabase ... --linked` (and the `npm run sqlite:staging:*` scripts) hit the SQLite backend.
- **`.env.local`** → `EXPO_PUBLIC_*` values now point at the sqlite backend (target, URL, publishable key), matching the code default. Legacy credentials remain available under `SUPABASE_PROJECT_URL` / `SUPABASE_ANON_KEY` / `MASI_SUPABASE_URL` for legacy-only tooling.
- **The Supabase MCP server** → pinned to the **LEGACY** ref in its URL (`https://mcp.supabase.com/mcp?project_ref=jcqrlwetutnpuchjoyyd`) ⚠️. **Do NOT use the Supabase MCP for `masi-app-sqlite` work** — `execute_sql`/`apply_migration` through it hit the *legacy* backend. Verify the ref before authenticating/using it.

**How to run ad-hoc SQL against `masi-app-sqlite` (read-only preflights, verification, disposable-data cleanup — NOT DDL; schema changes go through migrations):**
```
npm run sqlite:staging:query -- "select count(*) from letter_mastery;"
# or:  node scripts/sqlite-staging.cjs query "delete from letter_mastery;"
```
The `query` action (in `scripts/sqlite-staging.cjs`) reads the DB password from `.env`/`.env.local` and builds a clean command env that only ever targets `masi-app-sqlite` via `--linked`. It needs the CLI to be logged in (`supabase login`).

**Auth gotchas behind a `401 Unauthorized` from `db query`/`projects list` (it's the access token, not the DB password):**
- A **stale `SUPABASE_ACCESS_TOKEN` env var** (often exported from a shell profile) **silently overrides `supabase login`** — the CLI trusts the env var first, so a fresh login "doesn't take." Fix: `unset SUPABASE_ACCESS_TOKEN` (or refresh it to a valid token), then re-run.
- A **non-interactive shell** (e.g. an agent's Bash, CI without a token) often **can't reach the keychain** where `supabase login` stores the token, so it 401s even when your own terminal works. Run `db query`/cleanup in the **same interactive terminal where you logged in**.
- Always verify the target before a write: the command summary prints `project_ref=` — confirm `segygjzpujphwvrubusm` (sqlite), not `jcqrlwetutnpuchjoyyd` (legacy).
- **Non-interactive fallback that works (verified 2026-07-12):** direct psql with the DB password from `.env.local`, bypassing CLI auth entirely. Read-only probes only: `PGPASSWORD=<SUPABASE_DB_PASSWORD_SQLITE> /opt/homebrew/opt/libpq/bin/psql -h db.segygjzpujphwvrubusm.supabase.co -U postgres -d postgres`. Never paste the password into output or docs.

Trap: running the `supabase` CLI with `.env.local` injected into its environment (e.g. a `dotenv` wrapper) can make the CLI pick up the legacy connection and silently query the wrong backend even with `--linked`. Don't inject `.env.local` into `supabase` commands — use `--linked` (or the `sqlite:staging:query` helper, which does this correctly).

### EAS Builds — Environment Variables Not in `.env.local`
`process.env.EXPO_PUBLIC_*` variables from `.env.local` are NOT available in EAS cloud builds. Public values (Supabase URL, anon key) must also be available through Expo config `extra` with a fallback in the client. The SQLite app uses `app.config.js` with explicit Supabase target guardrails.
```javascript
const url = process.env.EXPO_PUBLIC_SUPABASE_URL
  || Constants.expoConfig?.extra?.supabaseUrl || '';
```

### Debugging Tools Available
- **Profile → Export Logs**: captures all `console.log/error/warn` output to a shareable text file
- **Profile → Export Database**: exports a SQLite-aware support package with schema version, table counts, sync status, failed outbox rows, release/backend identity, and support metadata.

---

## Documentation Guidelines

### Anti-drift rule: standing docs ship with the code that changes them

Docs are intent; code is truth; the gap between them is a bug with a fuse. Two doc classes, two rules:

- **Standing docs** (CONTEXT.md, `documentation/rls-sync-contract-map.md`, DEPLOYMENT.md, behavior docs like the auth-session-resilience notes, and this file) describe the present. When a code change contradicts one, update the doc **in the same branch as the code change**. If you find a standing doc making a claim the code contradicts, fix the doc immediately or file it; do not leave it for the next reader.
- **Dated docs** (reviews, audits, plans, PRDs, the refactor log) are historical records. Never rewrite them to match later reality; instead add a short dated status note at the top pointing at what superseded them.

The 2026-07-12 audit (`documentation/codebase-audit-2026-07-12.md`) found four standing-doc drifts this rule would have prevented; periodic audits verify docs against code with file:line evidence, but the same-branch rule is what keeps the interval clean.

### IMPORTANT: Track Progress and Document Decisions

- **PRD.md → Development Progress**: Add a `- [ ]` checklist when starting multi-step work. Check off items as you go.
- **LEARNING.md** (`documentation/`): After significant architectural decisions or tricky bug fixes, add a narrative section explaining the "why" — written like teaching a junior developer.
- **documentation/sqlite-refactor-log.md**: For SQLite/backend/sync work, update this after every task or meaningful work session. Always log bugs/problems, important assumptions, design decisions, review findings, verification commands, device checks, and anything surprising.
- **documentation/rls-sync-contract-map.md**: Update this whenever a synced table, repository write path, RLS policy, migration, server payload allowlist, or outbox ordering changes.
- **Always branch** off to a new git branch for features or bug fixes.

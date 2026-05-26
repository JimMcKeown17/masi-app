# Masi App - Codex Context

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

## Cybersecurity
Prefer pnpm instead of npm or yarn for JavaScript dependency management where practical.
Configure pnpm with minimumReleaseAge: 1440 so newly published package versions cannot be installed until they are at least 24 hours old.
npm has been compromised by hackers many times recently, so we need to take extra precaution.

**SQLite refactor exception:** this repository currently uses npm and `package-lock.json`. During the AsyncStorage-to-SQLite refactor, stay on npm and do not convert package managers. Package-manager migration is a separate task after the storage refactor stabilizes.

## Current Major Work -- Clean-Slate SQLite Refactor

We are in Plan 6 release validation for the clean-slate AsyncStorage-to-SQLite refactor. The implementation work for Plans 1-6 is substantially complete, but field cutover is not complete until the remaining validation and communication gates are logged.

The active planning artifacts are:

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

Current release gate status as of 2026-05-25:

- `npm run test:release` has passed.
- SQLite staging migrations and dry run have passed; advisors have only known/recorded warnings.
- A deeper Android emulator pass has covered fresh sign-in, offline cached restart, offline session and assessment writes, force-stop/reopen with pending outbox, reconnect-and-sync, and Supabase row verification.
- A critical hardening pass has added SQLite WAL/busy-timeout pragmas, assessment-item sync batching/fallback, shared Supabase request queuing for sync uploads, 1000ms background-sync debounce, local-first screen completion without delayed navigation, domain input no-suggestion hardening, visible release/backend identity, and a soft clock-in warning before session capture.
- Latest code gates passed on 2026-05-25: full Jest (`55` suites / `269` tests), file-backed SQLite integration (`13` suites / `100` tests), `npm run sqlite:staging:check`, and `git diff --check`.
- `supabase db pull --linked --schema public` reached Supabase but was blocked because Docker was not running for the CLI shadow database. Fallback verification used plain `supabase db query --linked` against `masi-app-sqlite` to spot-check high-write public table columns.
- Still pending before field distribution: user physical-device testing, preferably at least one low-end Android device plus iPhone/Expo Go, and the user-owned cutover communication gate.
- Emulator location did not complete the clock-in/out path because the Android emulator returned current-location unavailable. Test that on a physical device.

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

### Schema Drift — Old Backend Migration Files Are Not Truth
The current `supabase-migrations/` directory has drifted from the live Supabase schema in confirmed cases. For old-backend maintenance, verify live schema through Supabase Studio or `supabase db pull` before writing schema-facing code.

For the new SQLite backend, use canonical Supabase CLI migrations under `supabase/migrations/`. Treat `supabase-migrations/` as historical reference only.

### TEMPORARY: Two Supabase Backends — Keep The CLI Off The Wrong One
*(Clean-slate refactor only. Remove once the SQLite cutover is complete.)*

Two Supabase projects exist:
- `masi-app` — current production, ref `jcqrlwetutnpuchjoyyd`
- `masi-app-sqlite` — clean-slate refactor backend, ref `segygjzpujphwvrubusm` (the repo is `supabase link`ed to this one)

`.env.local` carries the old `masi-app` connection (`MASI_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL` resolve to `jcqrlwetutnpuchjoyyd`). That is correct for the current production app; the clean-slate build selects `masi-app-sqlite` via `config/supabaseProjectConfig.js`.

Trap: running the `supabase` CLI with `.env.local` injected into its environment, such as through a `dotenv` wrapper, makes the CLI pick up the old-project connection and silently query old production, even when `--linked` is passed. Run `supabase db query --linked` plainly instead; `--linked` resolves `masi-app-sqlite` through the CLI's own auth. Do not inject `.env.local` into `supabase` CLI commands.

### EAS Builds — Environment Variables Not in `.env.local`
`process.env.EXPO_PUBLIC_*` variables from `.env.local` are NOT available in EAS cloud builds. Public values (Supabase URL, anon key) must also be available through Expo config `extra` with a fallback in the client. The current app used `app.json`; Plan 1 of the SQLite refactor migrates this to `app.config.js` with explicit Supabase target guardrails.
```javascript
const url = process.env.EXPO_PUBLIC_SUPABASE_URL
  || Constants.expoConfig?.extra?.supabaseUrl || '';
```

### Debugging Tools Available
- **Profile → Export Logs**: captures all `console.log/error/warn` output to a shareable text file
- **Profile → Export Database**: exports a SQLite-aware support package with schema version, table counts, sync status, failed outbox rows, release/backend identity, and support metadata.

---

## Documentation Guidelines

### IMPORTANT: Track Progress and Document Decisions

- **PRD.md → Development Progress**: Add a `- [ ]` checklist when starting multi-step work. Check off items as you go.
- **LEARNING.md** (`documentation/`): After significant architectural decisions or tricky bug fixes, add a narrative section explaining the "why" — written like teaching a junior developer.
- **documentation/sqlite-refactor-log.md**: During the SQLite refactor, update this after every task or meaningful work session. Always log bugs/problems, important assumptions, design decisions, review findings, verification commands, device checks, and anything surprising.
- **Always branch** off to a new git branch for features or bug fixes.

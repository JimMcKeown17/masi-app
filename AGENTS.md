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
- **PRD.md**: Product requirements, tech stack, feature specifications. **Not a reliable progress ledger** — its Development Progress section is incomplete (it is missing the entire June 2026 Top-10 tranche, the GPS/logger hardening, collision proofing, the render-perf pack, and the sync-status trust UX, all of which are merged). For "what was built and did it pass?", read `documentation/build-log.md`. For "what is still open?", read `documentation/codebase-audit-2026-07-12.md` and `documentation/improvements-2026-07.md`.
- **LEARNING.md** (in `documentation/`): Educational documentation of architectural decisions (**update regularly as you build**).
- **documentation/design-system.md**: The colour/typography/spacing token contract, enforced by `__tests__/colors.test.js`. Read before any UI work. (Supersedes the archived `BRANDING.md` and `colour-semantics.md`, which described the retired blue palette and named two hex values the guard test now forbids.)
- **documentation/DATABASE_SCHEMA_GUIDE.md**: An **educational relational-modelling primer** that uses Masi as its worked example — *not* a reference for the current schema. Its Part 4 walks retired tables (`staff_children`, `children_groups`). For the actual schema, read `src/db/migrations.js` (local) and `supabase/migrations/` (server); for the operational contract, read the RLS/sync contract map below.
- **documentation/rls-sync-contract-map.md**: Table-by-table RLS/sync operation contract. Consult this before changing RLS policies, synced repositories, outbox ordering, Supabase migrations, or server payload columns.
- **documentation/build-log.md**: **The master build log.** One file, the whole history: what was built, when, why, what broke, what was decided, what was verified. Append a dated row to its Verification Register for every meaningful work session; put durable decisions in the Decision Register and defects in the Bug and Gap Register. It is the canonical answer to "what was built, when, and did it pass?". (It absorbed the old `sqlite-refactor-log.md` on 2026-07-13; that filename is now a redirect stub.)
- **documentation/open-work.md**: **The live backlog — the single answer to "what is still outstanding?"** Read this before proposing new work. It consolidates the still-open audit findings, the product/design/hygiene items the audit dropped, the deploy blockers, and the items rescued from archived docs. Add new open work here; do not scatter it back across dated reviews.
- **documentation/codebase-audit-2026-07-12.md**: A **dated** deep audit (21 ranked findings). Sixteen are now closed. Historical evidence that feeds `open-work.md` — do not rewrite it; record new findings in `open-work.md` instead.
- **documentation/device-gates-sqlite-backend-2026-07.md**: The on-device checklist Jim runs. Tests cannot model two SQLite connections, a real GPS chip, a force-quit, or native list virtualization. When you finish work that changes on-device behavior, add a gate here.
- **documentation/sprint4-followups-2026-07-13.md**: Open follow-ups and Jim's domain rulings on them (no head-office deletes, use an ignore flag; schools are never closed).
- **docs/adr/** (if present): Architectural Decision Records for hard-to-reverse decisions with real trade-offs. Created lazily by the `grill-with-docs` skill.
- **docs/agent-context/** (if present): Progressive-disclosure briefings for specific in-flight workstreams. Read the relevant file *before* picking up any task in that workstream. Current entries:
  - `wela-assessment-component-build.md` — the WelaPLUS Assessment Battery work (modular in-app battery, open-source Tool components). PRD at `documentation/wela-plus-battery-prd-2026.md`. **Nothing from this workstream is on `main`.** The 11 Question components are built on an unmerged worktree (`.claude/worktrees/feature+wela-plus-battery`, branch `worktree-feature+wela-plus-battery`), which branched 2026-05-29 and is now **310 commits behind main** — it predates the design tokens, the `storage.js` deletion, the `mergeServerRows` deletion, and outbox ownership. Do not assume `battery_runs`, `src/assessment-questions/`, or the additive `assessments` columns exist when working on `main`. Read this file before any work on assessments, batteries, runs, or tools.

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
- Shared log: `documentation/build-log.md`

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

Release-gate and verification history lives in `documentation/build-log.md` (Verification Register). That log, not this file, is the dated record of suite counts, device passes, and deploy gates.

## Test Driven Development

Use the local TDD skill for this refactor: `/Users/jimmckeown/Development/masi-app/.agents/skills/tdd`.

Follow the skill's red-green-refactor loop, in vertical slices.

Prefer behavior/integration-style tests through public repository, context, service, or screen interfaces. Do not over-mock internals. SQLite migration, outbox, transaction, and PRAGMA behavior must include real SQLite or `better-sqlite3` integration coverage where mocks would hide device-only bugs.

## Deployment Status — Multiple App Versions in the Wild

The app launched in early March 2026 and has been in field testing since. Multiple versions are simultaneously deployed across iOS and Android devices. Users do not update immediately.

**Rule: prefer backwards-compatible changes wherever possible.**

Exception: the completed clean-slate SQLite cutover is not optimized for backwards compatibility with the retired AsyncStorage domain store or old Supabase schema.

For database schema changes specifically:
- **Safe:** Adding nullable columns, adding new tables, relaxing constraints
- **Risky:** Dropping or renaming columns, tightening constraints, changing column types
- **Pattern:** Add the new column first → deploy the app → drop the old column only after all users have updated

When dropping a column that an older app version still writes, sync will fail with `PGRST204` for every affected record, cascading into FK failures on dependent tables. See migration 07 for an example of the compatibility fix this required.

## Key Implementation Patterns

### Offline Sync Strategy
**Write path:** a user-facing write persists its domain rows AND enqueues its `sync_outbox` row in ONE SQLite transaction. Background sync then pushes the outbox. Do not reintroduce `synced: false` table scanning for domain sync; the durable outbox replaced it.

**Read path (as of Sprint 4, 2026-07-13):** React state is a pure function of SQLite. A pull persists server rows in one transaction per table, reconciles server-side removals into SQLite (so a head-office removal survives a force-quit and stays gone offline), then republishes state from a fresh SQLite read. There is no in-memory three-way merge; `mergeServerRows` was deleted. **Reconcile is destructive to local rows, so its safety rails are load-bearing:** it only ever ends `synced` rows, never `pending`/`failed`/`terminal` ones; it never reconciles from an errored or truncated scope; and a mass-end circuit breaker escalates any large removal to a needs-attention card instead of applying it silently. The rules live in `documentation/rls-sync-contract-map.md` ("Pull Persistence & Reconcile"). Read them before touching the pull path.

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
- **The Supabase MCP server** → was pinned to the **LEGACY** ref in its URL (`project_ref=jcqrlwetutnpuchjoyyd`) ⚠️. **As of 2026-07-13 it is disabled for this project** (`disabledMcpServers`), and its four `mcp__supabase__*` pre-approvals (including `execute_sql`) were removed from `.claude/settings.local.json`, because a pre-approved `execute_sql` against the legacy backend would have run without prompting. **Do NOT re-enable it for `masi-app-sqlite` work.** If you ever need it for legacy maintenance, verify the ref first and approve each call deliberately. Use the `sqlite-staging-sql` skill for the SQLite backend instead.

**Ad-hoc SQL against `masi-app-sqlite`** (read-only preflights, verification, disposable-data cleanup — NOT DDL; schema changes go through migrations): use the `sqlite-staging-sql` skill (`.claude/skills/sqlite-staging-sql/`) for the runbook — the `sqlite:staging:query` helper, the 401 auth gotchas, and the non-interactive psql fallback. Two rules stay load-bearing everywhere: always verify the target before a write (the command summary prints `project_ref=` — confirm `segygjzpujphwvrubusm`, not `jcqrlwetutnpuchjoyyd`), and never inject `.env.local` into `supabase` CLI commands (it can silently retarget the legacy backend even with `--linked`).

### EAS Builds — Environment Variables Not in `.env.local`
`EXPO_PUBLIC_*` values from `.env.local` are NOT available in EAS cloud builds; public values must also come through Expo config `extra` with a client-side fallback (`app.config.js` carries the Supabase target guardrails). Fallback pattern and details: `expo-deployment` skill.

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
- **documentation/build-log.md**: Update after every task or meaningful work session, not just database work. Always log bugs and problems, important assumptions, design decisions, review findings, verification commands with their results, device checks, and anything surprising. A dead end recorded is worth as much as a success.
- **documentation/rls-sync-contract-map.md**: Update this whenever a synced table, repository write path, RLS policy, migration, server payload allowlist, or outbox ordering changes.
- **Always branch** off to a new git branch for features or bug fixes.

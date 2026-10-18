# Upload Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A late upload with an uncertain outcome can never undo a newer one, and the server closes
shifts left open past ten hours without ever reopening a closed shift.

**Architecture:** One server migration adds `row_version` to 11 tables with a shared `BEFORE UPDATE`
trigger that refuses a lower version (`MV001`), plus a forward-only `time_entries` trigger and a
`pg_cron` job. The phone stamps `row_version` at the moment it claims an upload (`updateInFlight`),
sends it, stores the server's version on download, and guards downloads against rolling a synced
row back.

**Tech Stack:** Expo/React Native, expo-sqlite (better-sqlite3 in tests), Jest (jest-expo),
Supabase PostgreSQL 17 + PostgREST, disposable PostgreSQL harness scripts.

**Spec:** `docs/superpowers/specs/2026-10-18-upload-contract-design.md` (Jim-approved and
Codex-approved round 3, 2026-10-18). Read it before any task; section numbers below refer to it.

## Global Constraints

- **Versioned tables (exactly these 11):** `children`, `classes`, `groups`, `child_ea_assignments`,
  `class_ea_assignments`, `group_ea_assignments`, `child_programme_enrollments`,
  `child_class_memberships`, `child_group_memberships`, `grouping_versions`, `class_grouping_state`.
- **Not versioned:** `time_entries`, `sessions`, `session_attendees`, `assessments`,
  `assessment_items`, `letter_mastery`.
- **Immutable assignment tables:** `child_ea_assignments`, `class_ea_assignments`,
  `group_ea_assignments`. Their `insert` is never stamped and never sends `row_version`.
- **Stamped operations:** `insert`, `update`, `archive`, `restore`. Never `hard_delete`.
- **Refusal:** SQLSTATE `MV001`, message `stale_version`, raised only when
  `NEW.row_version < OLD.row_version`. Ties and higher pass. The trigger never returns NULL.
- **Column:** server `row_version bigint not null default 1`; local
  `row_version integer not null default 1`.
- **Server migration file:** `supabase/migrations/20261018180000_upload_contract_row_version.sql`,
  one file for Tasks 1–2. Session-level `SET lock_timeout = '10s'; SET statement_timeout = '60s';`
  at the top and `RESET` at the end, never `SET LOCAL`. End with `notify pgrst, 'reload schema';`.
- **Local migration:** version 14, name `upload_contract_row_version`, in `src/db/migrations.js`.
- **Ten-hour rule:** `interval '10 hours'` on the server; `MAX_SHIFT_MS` on the phone.
- **Cron job name:** `masi_close_overdue_time_entries`, schedule `*/15 * * * *`.
- **Tests:** prefix every Jest command with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- **PostgreSQL harnesses:** the controller runs them (Codex's sandbox cannot open TCP to
  PostgreSQL). Implementers write the harness code and say in their report that it is unrun.
- **Commits:** no `Co-Authored-By` trailer. Never `git stash`.
- **Never** touch a hosted Supabase project, run the Supabase CLI, read `.env.local`, or start an
  EAS build. Hosted apply and builds need Jim's explicit yes at the time and are controller-only.

## Review Focus

1. **A pull that lands mid-upload must not roll back a just-synced row.** Owned by Task 3; its test
   "acknowledged v5 survives a pulled v4" pins it.
2. **An ordinary edit made while an upload is in flight must still upload afterwards.** Owned by
   Task 4; the claim-snapshot test asserts the replacement is sent as its own request.
3. **A child created on the phone and then edited before its first upload must end with the edit
   on the server and nothing needing attention.** Owned by Task 4; the test "create then edit before
   first upload": the insert goes before the edit, versions increase, both are accepted.
4. **An EA who taps Clock out eleven hours after clocking in sees the shift recorded as ten hours,
   with the existing auto-clock-out notice.** Owned by Task 6.
5. **A build from before this spec keeps uploading against the migrated server.** Owned by Task 1;
   the harness case "a write without row_version is accepted as a tie".

---

### Task 1: Server version rule

**Files:**
- Create: `supabase/migrations/20261018180000_upload_contract_row_version.sql`
- Modify: `scripts/upload-contract-postgres-harness.cjs` (add `runRowVersionCases`, called from the
  main run after `runLocationCases`)
- Test: `__tests__/uploadContractRowVersionMigration.test.js` (static checks on the SQL text, in the
  style of `__tests__/syncRelationshipIndexesSupabaseMigration.test.js`)

**Interfaces:**
- Produces: `private.enforce_row_version()`; triggers `<table>_enforce_row_version`; SQLSTATE `MV001`.

- [ ] **Step 1: Write the failing static test.** `uploadContractRowVersionMigration.test.js`
  reads the migration file and asserts: for each of the 11 tables, an
  `add column if not exists row_version bigint not null default 1` and a
  `create trigger <table>_enforce_row_version before update on public.<table>`; the function body
  contains `errcode = 'MV001'` and `new.row_version < old.row_version`; the file contains no
  `SET LOCAL`, contains `notify pgrst, 'reload schema'`, and adds no trigger to `time_entries`,
  `sessions`, `session_attendees`, `assessments`, `assessment_items` or `letter_mastery` named
  `*_enforce_row_version`.
- [ ] **Step 2: Run it.** `npx jest __tests__/uploadContractRowVersionMigration.test.js` → FAIL
  (file missing).
- [ ] **Step 3: Write the harness cases** (`runRowVersionCases(databaseUrl)`), each in its own
  rolled-back transaction as the assigned EA via the existing `asActor`, on `children` (update by
  id, single upsert, two-row batch upsert), `groups` (archive patch `archived_at` and restore
  patch `archived_at = null`, both by id) and `child_ea_assignments` (archive patch):
  - stored v3, incoming v2 → error `MV001` (use `expectSqlState`);
  - stored v3, write that omits `row_version` → exactly one returned id, stored stays 3;
  - stored v3, incoming v4 → applied, stored 4;
  - batch upsert where one row is v2 under stored v3 → `MV001` for the whole statement;
  - "S1 after S2": apply v3 content B, then v2 content A → `MV001`, row holds B;
  - must not break: immutable insert `ON CONFLICT DO NOTHING` of an existing assignment returns no
    error; deleting a class whose dependants are `ON DELETE SET NULL` succeeds (as `postgres`);
    the `child_class_memberships` exit update without `row_version` returns one id.
  Seed versions with `UPDATE ... SET row_version = 3` as `postgres` before switching role.
- [ ] **Step 4: Write the migration** per spec §1: the 11 `add column`s, the function
  (`language plpgsql`, `set search_path = ''`, `raise exception using errcode = 'MV001', message =
  'stale_version', detail = format(...)` naming table, id and both versions; `return new`), and
  `drop trigger if exists` + `create trigger` per table. Revoke `execute` on the function from
  `public, anon, authenticated` (trigger functions run as the table owner's trigger context).
- [ ] **Step 5: Run the static test** → PASS. Report the harness as unrun.
- [ ] **Step 6 (controller):** `npm run -s verify:upload-contract:postgres` and the other four
  `verify:*:postgres` harnesses against the disposable PG17 (port 55432, `PGTZ=UTC`) → all pass;
  with the migration file moved aside, the new row-version cases fail.
- [ ] **Step 7: Commit** `feat(server): row_version rule on the 11 EA-editable tables (MV001)`.

### Task 2: Server ten-hour clock-out and forward-only time entries

**Files:**
- Modify: `supabase/migrations/20261018180000_upload_contract_row_version.sql` (append)
- Modify: `scripts/upload-contract-postgres-harness.cjs` (add `runTimeEntryForwardCases`)
- Modify: `__tests__/uploadContractRowVersionMigration.test.js` (static assertions for this task)

**Interfaces:**
- Produces: `private.time_entries_forward_only()` (trigger `time_entries_forward_only`,
  `BEFORE INSERT OR UPDATE`); `private.close_overdue_time_entries() returns integer` (rows closed).

- [ ] **Step 1: Reproduce the bug red.** Add the harness case `late open write reopens a closed
  shift` first: as the owner, close `TIME_ENTRY`, then upsert the open snapshot
  (`sign_out_time = null`) by id; assert the stored row is still closed. Run it (controller) against
  the current migrations → FAIL (row reopened). Record the output in the report/ledger.
- [ ] **Step 2: Write the remaining harness cases** — every row of spec §3's table, plus:
  - insert of an already-closed row whose close is 11 h after sign-in → stored at
    `sign_in + 10 h`, `auto_clocked_out = true`, `sign_out_lat`, `sign_out_lon`,
    `sign_out_location_status` all NULL; the same through a conflicting upsert and update by id;
  - close at exactly `sign_in + 10 h` with `auto_clocked_out = true` over a job-closed row → one
    returned id, row unchanged;
  - honest close at `sign_in + 6 h` over a job-closed row → replaces it (`auto_clocked_out = false`,
    its location kept);
  - manual close then a later different close → stored manual close kept, one id returned;
  - as `postgres` (no `auth.uid()`): an update to a closed row passes untouched (Head Office path);
  - job: two open rows (11 h and 2 h old) → returns 1, closes only the 11-h row; second run → 0;
  - `anon` and `authenticated` get `42501` executing `private.close_overdue_time_entries()`.
- [ ] **Step 3: Static assertions** in the Jest file: `before insert or update on
  public.time_entries`; the job function has `interval '10 hours'`; the cron block is inside
  `if exists (select 1 from pg_available_extensions where name = 'pg_cron') and
  current_database() = 'postgres'`, runs `create extension if not exists pg_cron`, and calls
  `cron.schedule('masi_close_overdue_time_entries', '*/15 * * * *', ...)`. Run → FAIL.
- [ ] **Step 4: Append to the migration** per spec §3. The forward-only function compares only
  `sign_out_time`, `sign_out_lat`, `sign_out_lon`, `sign_out_location_status`, `auto_clocked_out`;
  owner test `auth.uid() = new.user_id` on insert and `auth.uid() = old.user_id` on update; an
  auto-close is recognised as `old.auto_clocked_out and old.sign_out_time = old.sign_in_time +
  interval '10 hours'`. To keep a stored row, copy the five `old` values onto `new`. The cron block
  is a `do $$ ... $$` with `execute` for the `cron.schedule` call so plain PostgreSQL never parses a
  reference to `cron`.
- [ ] **Step 5: Static test** → PASS. Report harness unrun.
- [ ] **Step 6 (controller):** all five harnesses → pass, including the Step 1 case now green.
- [ ] **Step 7: Commit** `feat(server): ten-hour clock-out job and forward-only time entries`.

### Task 3: Phone schema, write rule and download version

**Files:**
- Create: `src/db/repositories/rowVersion.js`
- Modify: `src/db/migrations.js` (version 14)
- Modify: `src/db/repositories/domainRepositoryUtils.js` (`upsertDomainRecord`,
  `serverPullWouldClobberPendingLocal`)
- Modify: the local column lists and server-row savers for the 11 tables:
  `childrenRepository.js` (`CHILD_COLUMNS`, `RELATIONSHIP_COLUMNS`, `saveStaffChild`,
  `saveChildProgrammeEnrollment`, `saveChildClassMembership`, `saveServerChildRow`),
  `classesRepository.js` (`CLASS_COLUMNS`, `CLASS_EA_ASSIGNMENT_COLUMNS`),
  `classEaAssignmentsRepository.js`, `groupsRepository.js` (`GROUP_COLUMNS`, `MEMBERSHIP_COLUMNS`,
  `GROUP_EA_ASSIGNMENT_COLUMNS`), `groupEaAssignmentsRepository.js`,
  `childClassMembershipsRepository.js`, `groupingVersionsRepository.js`,
  `classGroupingStateRepository.js`
- Test: `__tests__/rowVersionLocal.test.js` (real better-sqlite3); update existing
  `user_version` 13 assertions to 14 where suites pin it (Plan 3 precedent).

**Interfaces:**
- Produces, in `rowVersion.js`:
  - `export const VERSIONED_TABLES: Set<string>` (the 11);
  - `export const IMMUTABLE_ASSIGNMENT_TABLES: Set<string>` (the 3; `offlineSync.js` switches its
    private set to this import);
  - `export const isStampedOperation = (tableName: string, operation: string) => boolean` — true
    for a versioned table and `insert|update|archive|restore`, false for `hard_delete` and for
    `insert` on an immutable table.

- [ ] **Step 1: Write failing tests** in `rowVersionLocal.test.js`:
  - `migration 14 adds row_version default 1 to exactly the 11 tables` (PRAGMA table_info);
  - `a local write never sets row_version`: seed a `children` row at 5, save an edit through
    `childrenRepository` with an object carrying `row_version: 2` → stored 5; a new local child →
    stored 1;
  - `a pulled row stores the server version` — one case per pulled table (children, classes,
    groups, the three assignment tables, enrollments, class memberships, group memberships), each
    through its real server-row saver with `row_version: 7` on a fresh database → stored 7;
  - `acknowledged v5 survives a pulled v4`: local `synced` at 5, pull v4 → stored 5 and content
    unchanged; pull v6 → stored 6 with the new content; pull equal v5 with new content → applied;
  - `a terminal row converges`: local `terminal` at 7, pull v4 → stored 4;
  - pending/failed rows are still skipped, as today.
- [ ] **Step 2: Run** `npx jest __tests__/rowVersionLocal.test.js` → FAIL.
- [ ] **Step 3: Implement.**
  - Migration 14: `alter table <t> add column row_version integer not null default 1;` × 11.
  - `upsertDomainRecord`: for a `VERSIONED_TABLES` table, when the normalized record's
    `sync_status` is not `'synced'` (a local write), drop `row_version` from the record so it is
    neither inserted nor updated; a `'synced'` record (a pull) keeps it.
  - `serverPullWouldClobberPendingLocal`: also select `row_version` for versioned tables; return
    true when the local row is `synced`, the pulled `row_version` is a number, and it is lower
    than the local one. Keep the pending/failed rule and the function name; update its comment.
  - Add `row_version` to each local column list above, and carry `row_version` through every saver
    that rebuilds a record field by field (`saveStaffChild` is the known one; check the rest).
- [ ] **Step 4: Run** the new suite → PASS; then `npm test` → all pass (fix only version-pin
  assertions).
- [ ] **Step 5: Commit** `feat(sync): local row_version — schema 14, pulls store it, guard against rollback`.

### Task 4: Stamp at claim and send the version

**Files:**
- Modify: `src/db/repositories/syncOutboxRepository.js` (`updateInFlight`)
- Modify: `src/services/offlineSync.js` (`SERVER_COLUMNS`, `buildSyncPayload`, archive/restore
  patch, single-send claim in `processRecord`)
- Test: `__tests__/rowVersionSend.test.js` (real better-sqlite3 + `createSupabaseMock`, in the style
  of `__tests__/offlineSyncUpdateById.test.js`)

**Interfaces:**
- Consumes: `VERSIONED_TABLES`, `IMMUTABLE_ASSIGNMENT_TABLES`, `isStampedOperation` (Task 3).
- Produces: every claimed stamped outbox row has `payload.row_version === <new local row_version>`
  and the local row's `row_version` is one higher than before the claim.

- [ ] **Step 1: Write failing tests:**
  - `claim stamps once per send`: a `children` update at local v1 → request carries 2, local 2; a
    forced retry → request carries 3;
  - `batch claim stamps every row` (two `children` inserts in one batch);
  - `each operation carries row_version`: insert, batch upsert, update by id, archive, restore on
    a versioned table;
  - `immutable insert is not stamped`: a `child_ea_assignments` insert → request has no
    `row_version`, local stays 1; its later archive → carries 2;
  - `hard_delete is not stamped`;
  - `claim snapshot` (must fail with today's two-call claim): wrap the outbox repository so a
    deterministic barrier runs right after the claim transaction commits and before any separate
    read of the slot; there, replace the slot's payload via `childrenRepository` with a new edit.
    With the old `markInFlight` + `getById` path the request would carry the replacement; with
    `markInFlightAndGet` it carries the claimed content and version. Separately, a request-start
    hook that replaces the payload before the mock responds proves the stale-finalize path; the request carries the claimed content and version; after finalize the slot is
    `pending` again and the next pass sends the new edit at a higher version. Same for a lifecycle
    change, and for a record sent through batch fallback;
  - `create then edit before first upload`: the insert (v2) is sent before the edit (v3), both
    are accepted, the server ends with the edited content, nothing needs attention;
  - `a forced terminal retry is protected from an overlapping pull`: a `children` row `terminal` at
    v7 with its outbox row forced (`includeTerminal`); at a barrier after the claim (v8 sent), save
    a pulled v4 through the real server-row saver; acknowledge → local is v8 with the claimed
    content, `synced`; the next edit sends v9 and is accepted. Must fail if the claim leaves the
    domain row `terminal`;
  - `unversioned tables send no row_version` (`time_entries`, `sessions`, `letter_mastery`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
  - `updateInFlight(txn, ids, now)`: after the status update, read `id, table_name, record_id,
    operation` for the ids; for each where `isStampedOperation`, run
    `update <table> set row_version = row_version + 1, sync_status = case when sync_status =
    'terminal' then 'pending' else sync_status end where id = ?` then read the value (a claimed
    retry of a terminal row must be protected by the pull guard while it is in flight; terminal
    rows that are not being retried still converge); if the
    local row exists, `update sync_outbox set payload = json_set(payload, '$.row_version', ?)
    where id = ?`. Use `quoteIdentifier` for the table name.
  - `processRecord`: replace `markInFlight([id])` + `getById(id)` with
    `const [inFlightRecord] = await outboxRepository.markInFlightAndGet([outboxRecord.id])`,
    keeping the existing "disappeared" handling when it is undefined.
  - `SERVER_COLUMNS`: add `row_version` to the 11 tables.
  - `buildSyncPayload`: drop `row_version` when `!isStampedOperation(tableName, operation)` (pass
    the operation in from both callers).
  - Archive/restore patch: include `row_version` when the table is versioned and the payload has it.
  - `UPDATE_PATCH_EXCLUDED_COLUMNS` unchanged (must not contain `row_version`).
- [ ] **Step 4: Run** the new suite and `npx jest offlineSync syncOutboxRepository` → PASS; then
  `npm test`.
- [ ] **Step 5: Commit** `feat(sync): stamp row_version at claim and send it`.

### Task 5: Refusal, membership guard and the retry regressions

**Files:**
- Modify: `src/services/offlineSync.js` (`classifyError`, `reconcileChildClassMembership`)
- Create: `test-support/statefulMembershipServer.js` — a small stateful fake of the
  `child_class_memberships` server table for the engine's client: `from(t).select(cols).eq().eq()
  .is().limit()` resolves rows from its store; `from(t).update(patch).eq('id', x)` is thenable and
  applies without `.select`; `upsert` applies and can be told to commit and then reject with a
  codeless network error (lost response). `createSupabaseMock` lacks the select chain and only
  runs `update` when followed by `select`, so `reconcileChildClassMembership`'s catch would
  silently swallow the TypeError and the test would pass with no guard.
- Test: `__tests__/rowVersionRefusal.test.js` (real better-sqlite3); one case using the real
  `@supabase/postgrest-js` client with a mocked `fetch`

**Interfaces:**
- Consumes: Task 4's stamping.

- [ ] **Step 1: Write failing tests:**
  - `MV001 is terminal`: server mock returns `{ code: 'MV001', message: 'stale_version' }` for a
    `children` update → outbox row `terminal`, needs-attention reason contains
    `Server has a newer version of this record`, never marked synced, not retried on the next
    ordinary pass;
  - `MV001 reaches error.code through postgrest-js`: a `PostgrestClient` whose `fetch` returns HTTP
    400 with body `{"code":"MV001","message":"stale_version","details":null,"hint":null}` → the
    engine's classifier sees `code === 'MV001'`;
  - `class move under a lost response` (using `statefulMembershipServer`): offline A→B via
    `childrenRepository.updateChild`; A's insert commits on the fake server but its response is
    lost; B acknowledged; A retried → after the queue drains, the fake server has B active and A
    exited, the phone has B active, no failed or terminal rows. The test must fail, because A's
    retry closes B, when the `exited_at` guard is removed — verify this once and say so in the
    report;
  - the same with the move to B made while A's insert is in flight;
  - `ignored assignment insert`: an assignment insert committed with its response lost, retried
    (mock ignores the duplicate), then an interleaved reconcile ends it locally; the next pull of
    the server row restores it as active.
- [ ] **Step 2: Run** → FAIL (MV001 retried; B closed).
- [ ] **Step 3: Implement.**
  - `classifyError`: `code === 'MV001'` → `{ terminal: true, markAsSynced: false, reason: 'Server
    has a newer version of this record (stale_version)' }`, placed before the retriable default.
  - `reconcileChildClassMembership`: return immediately when `payload.exited_at` is set.
- [ ] **Step 4: Run** → PASS; `npm test`.
- [ ] **Step 5: Commit** `feat(sync): stale_version is terminal; a historical membership never closes the current one`.

### Task 6: Cap a manual clock-out at ten hours

**Files:**
- Modify: `src/context/TimeTrackingContext.js` (`handleSignOut`; `autoClockOut` resolves
  `undefined`, so `handleSignOut` returns `true` itself)
- Test: extend `__tests__/useTimeTracking.integration.test.js`

- [ ] **Step 1: Write the failing test** `a clock-out after ten hours records the ten-hour
  auto-close`: mount with an entry signed in 9 h 59 m ago (so the startup auto-close does not run),
  then advance the system clock past ten hours without firing the 30-second watchdog; leave the
  location request unresolved; call `handleSignOut` → it resolves `true`, and the stored row has
  `sign_out_time = sign_in + 10 h`, `auto_clocked_out = true`, sign-out location fields NULL, and
  the auto-clock-out notice is recorded. A clock-out at 9 h 59 m still stores the real time and
  location.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** In `handleSignOut` (`TimeTrackingContext.js:229-255`), read the
  active entry **before** requesting location; if it is already past `MAX_SHIFT_MS`, `await
  autoClockOut(entry)` and return `true` (callers such as `useSignOutFlow.js:66-68` treat a falsy
  result as failure). Keep the existing post-location reread, and apply the same check there for a
  shift that crosses ten hours while location is being captured.
- [ ] **Step 4: Run** → PASS; `npm test`; `npm run test:integration`.
- [ ] **Step 5: Commit** `fix(time): a clock-out after ten hours records the ten-hour auto-close`.

### Task 7: Standing documentation

**Files:**
- Modify: `documentation/rls-sync-contract-map.md`, `documentation/ROADMAP.md`,
  `documentation/build-log.md`, `documentation/LEARNING.md`

- [ ] **Step 1: Contract map.** Add a "Row versions (upload contract)" section: the 11 tables, the
  stamping point (`updateInFlight`, claim snapshot), what is never stamped, the write rule (local
  writes never set it; pulls store it), the pull guard, `MV001` in the error table as terminal, the
  `time_entries` forward-only rule and the job, the membership guard. Re-point the
  letter-mastery ordering limitation (currently "the upload-contract spec owns it") to D1 in the
  mastery re-key. Note the latent `groups` archive-before-update ranking.
- [ ] **Step 2: ROADMAP.** Mark U1 and the server ten-hour clock-out built (hosted apply and D2/D3
  open); rewrite D3 per spec §4; Ruling 11 closed for the 11 tables, open for `letter_mastery`.
- [ ] **Step 3: Build log.** Verification rows for each task's commands and results.
- [ ] **Step 4: LEARNING.md.** A short chapter, "Numbering writes when they leave, not when they
  are made", explaining why queue-time versions would refuse the phone's own writes.
- [ ] **Step 5: Commit** `docs: upload contract — contract map, roadmap, build log, learning`.

## Controller gates after Task 7

1. `npm test`, `npm run test:integration`, all five `verify:*:postgres` harnesses → green.
2. Codex adversarial review of the whole branch (`--base origin/main`); fix rounds until approved
   or the remaining findings are rare and recorded as accepted risks.
3. Push and PR, then CI green.
4. **Needs Jim's yes at the time:** merge; read-only pre-check that `pg_cron` is offered; hosted
   apply through the isolated helper; post-apply read-only check of `cron.job` and one successful
   `cron.job_run_details` run; drain the test phones; EAS builds; D2 and D3 on the A03s.

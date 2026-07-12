# Sprint 2A: Outbox Ownership + Deterministic-Error Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** implement items A and B of `docs/superpowers/specs/2026-07-12-sprint2-data-edges-design.md` (audit findings #2 and #6):

- **A. Outbox ownership:** `sync_outbox` rows gain an `owner_user_id` stamped at enqueue; readiness and status become owner-scoped so one EA's session can never push (and terminalize) another EA's pending rows. NULL owner = grandfathered (any session), preserving pre-migration behavior.
- **B. Deterministic-error budget:** `PGRST204`, `42703`, `22P02`, `23502`, and non-immutable-table `23514` stop retrying forever: after **8 failed attempts** they become terminal with a `deterministic:` reason prefix, landing in the existing needs-attention UI and resurrectable by force Sync Now.

**Branch:** `improvement/s2-outbox-ownership-and-error-budget` (already checked out in your worktree).

**Read the spec first** (`docs/superpowers/specs/2026-07-12-sprint2-data-edges-design.md`, sections A and B): it records the locked decisions and their rationale. Do not relitigate them.

## Verified anchors (2026-07-12, post-Sprint-1 tree; locate by pattern if lines drift)

- Ownership resolvers already exist for the auth-restore requeue: `directOwner`/`viaParentOwner`/`combineOwners`, `OWNER_RESOLVERS`, `genericOwnerResolver` at `src/services/offlineSync.js:449-497`; consumed at `:1362` (`OWNER_RESOLVERS[record.table_name] || genericOwnerResolver`). Resolvers are `async ({ db, row, payload }) => ownerId[]` and fall back from `row` to `payload` per column.
- `enqueueDomainOutbox(db, tableName, recordId, operation, payload)` at `src/db/repositories/domainRepositoryUtils.js:105`; outbox `enqueue` at `src/db/repositories/syncOutboxRepository.js:38`.
- `getReadyRecords` (with `includeBackedOff`/`includeTerminal`) and `getSyncStatus` (single-snapshot JS loop that already derives `readyCount`, `backedOffCount`, etc.) in `src/db/repositories/syncOutboxRepository.js`.
- `syncAll` resolves the session for the auth gate (`skippedNoSession` around `src/services/offlineSync.js:1147-1159`) and calls `getReadyRecords({ limit: 1000, includeBackedOff: force, includeTerminal: force })` at `:1238`. `getAuthSession` is injectable (`:932`).
- Local migrations: `src/db/migrations.js`, versions 1-5, `CURRENT_SCHEMA_VERSION` derived from the last entry (`:591`). New migration = version 6, additive.
- Retry/backoff: 15-minute cap with no retry-count cap (`offlineSync.js` around `:381` and `:772`); `retry_count` exists on outbox rows. Immutable-assignment `23514` is already immediately terminal; `23503`/`42501` evidence machinery must not change.
- `OfflineContext` already subscribes to `supabase.auth.onAuthStateChange` at `src/context/OfflineContext.js:214` (receives `session`), and its `refreshSyncStatus` calls `getSyncStatus()` at `:57`.
- Integration-test conventions: file-backed real SQLite through `createOutboxSyncEngine` with a second migrated SQLite database as the "server" where relevant; exemplars `__tests__/offlineSyncOutbox.test.js`, `__tests__/offlineSyncAuthGate.test.js`, `__tests__/childClassReassignment.test.js`.

## Codex plan review dispositions (2026-07-12, R1-R7) — BINDING

Adversarial review (gpt-5.6-sol) against the merged tree; all findings accepted. **Where a disposition conflicts with task text below, the disposition wins.**

- **R1 (Task 3, partial payloads):** archive producers enqueue deliberately partial payloads (`{id, archived_at}` etc., e.g. `childrenRepository.js:489-529`), so resolving with `row: null` stamps NULL owners on most lifecycle operations, defeating the guarantee. Amendment: `enqueueDomainOutbox` loads the current domain row by `(tableName, recordId)` inside the supplied transaction and passes it as `row` for every operation; keep the explicit `ownerRow` override for `hard_delete` (row already deleted), and change the hard-delete pre-check query in `childrenRepository.js:535-562` to select `created_by` too so the override has data. Add RED cases for a partial child archive and a partial assignment archive, not just full insert payloads.
- **R2 (Task 4, three-layer signature):** `getSyncStatus` has three layers and the outer two accept no arguments (`offlineSync.js:1332-1344`, `:1440-1444`); a context-level mock test can pass while production drops the option. Amendment: thread `options` through exported wrapper, engine method, and repository (`{ ownerUserId } = {}`), and add an engine-level real-repository test proving the owner filter reaches the SQL/snapshot.
- **R3 (Task 4, auth events must refresh):** assigning `currentUserIdRef` alone leaves the previous EA's counters visible (the auth listener never refreshes status, `OfflineContext.js:207-229`, and an offline sign-in produces no post-sync refresh). Amendment: set the owner ref before the existing heal logic, then call `refreshSyncStatus` on `SIGNED_IN`, sessionful `INITIAL_SESSION`, `TOKEN_REFRESHED`, and `SIGNED_OUT`. Tests: initial event, A-to-B transition, sign-out.
- **R4 (Task 4, resetInFlight):** every pass resets ALL `in_flight` rows (`syncOutboxRepository.js:129-137`), so B's pass would still mutate A's stranded row to `pending`. Amendment: owner-scope `resetInFlight` (`owner_user_id is null or owner_user_id = ?`), pass the authenticated user id from `syncAll`, and add an integration test where B's pass resets only B-plus-NULL rows.
- **R5 (Task 4, mid-pass user switch):** the session is read once per pass but server calls happen later under whatever session is live; a sign-out/sign-in during an active pass can upload A's selected rows under B. Amendment: capture `passUserId` at the gate; revalidate `getAuthSession()` immediately before each batch/record server request and abort the remaining pass (leave rows pending, no error stamping) if the user id changed. Test: swap the injectable `getAuthSession` from A to B between selection and upload; assert no A payload is sent and A's rows stay pending.
- **R6 (Task 5, attempt accounting):** classification runs before finalization; the terminal path does not increment `retry_count`, so a terminal eighth attempt would persist `retry_count = 7`, and `classifyError` does not return the error code. Amendment: at the failure-finalization site compute `attemptNumber = record.retry_count + 1` and use the error's own code for the deterministic check; the deterministic-terminal transition must persist `retry_count = attemptNumber`. The budget test must drive eight real attempts (force passes or explicit `next_retry_at` time advancement), assert exactly eight server calls and `retry_count === 8`, then flip the server mock to success and prove a ninth forced pass resurrects and finalizes the row.
- **R7 (Task 1, schema pins):** three exact v5 pins exist (`hotPathIndexes.test.js:17-31`, `sqliteFoundation.test.js:152-169`, `:582-604`) and migration entries carry `name` as well as `version` (a nameless v6 breaks the debug-dump metadata contract). Amendment: update all three tests, give migration 6 a stable `name`, and assert `owner_user_id` via a real-SQLite `pragma table_info(sync_outbox)`.
- Review-confirmed: moving `quoteIdentifier` creates no cycle (it lives in the leaf `sqliteRepositoryUtils.js`); `owner_user_id` cannot leak into server payloads through `buildSyncPayload`'s allowlists (keep a pin test anyway if cheap); new BetterSQLite tests should use the adapter's default per-test `:memory:` database, never fixed shared filenames (parallel-worker collisions).

## Global Constraints

- Node 20: prefix jest/npm commands with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Strict red-green per step; commit per task; NEVER push; no PR.
- Commit messages `type(scope): message`; no co-author line; no em dashes anywhere.
- The `42501`/`23503` evidence classification, auth-restore requeue semantics, immutable-assignment handling, and outbox push ordering must not change (pinned by existing suites; they must stay green untouched unless a task below says otherwise).
- `owner_user_id` is LOCAL-ONLY: it must never appear in server payloads (`buildSyncPayload` strips non-allowlisted keys already; add it to `LOCAL_ONLY_KEYS_TO_STRIP` if outbox payloads could carry it, verify rather than assume).
- Contract-map updates are part of this plan (Task 6), per the standing repo rule.

---

### Task 1: Schema v6, `owner_user_id` column

- [x] RED: extend the migration pin test (find the existing migrations test asserting `CURRENT_SCHEMA_VERSION`/column sets) to expect version 6 and a `sync_outbox.owner_user_id` column; run, watch it fail.
- [x] GREEN: append migration `{ version: 6 }` to `MIGRATIONS` in `src/db/migrations.js`: `alter table sync_outbox add column owner_user_id text` (nullable, no default, no index yet; readiness queries stay snapshot-loop based). Follow the exact shape of the version-5 entry.
- [x] Run the migrations integration suite; commit: `feat(sync): schema v6 adds sync_outbox.owner_user_id`

### Task 2: Extract the ownership module (pure move)

- [x] Create `src/db/repositories/outboxOwnership.js` exporting `directOwner`, `viaParentOwner`, `combineOwners`, `OWNER_RESOLVERS`, `genericOwnerResolver`, plus two new helpers: `resolveRecordOwners({ db, tableName, row, payload })` (applies the table resolver or the generic fallback) and `resolvePrimaryOwner(...)` (first resolved owner or null). Move the implementations from `offlineSync.js` verbatim (including the `quoteIdentifier` dependency; import it from where the repository layer defines it, or move that too if it is local to offlineSync).
- [x] `offlineSync.js` imports from the new module; the requeue call site (`:1362` area) switches to `resolveRecordOwners`. No behavior change.
- [x] Gate: the existing auth-restore requeue suites pass unmodified (this pins the move). Commit: `refactor(sync): extract outbox ownership resolvers to a shared module`

### Task 3: Stamp owner at enqueue

- [x] RED: repository test: enqueue a `sessions` insert whose payload carries `user_id: 'ea-1'`; assert the stored outbox row has `owner_user_id = 'ea-1'`. Second case: a `session_attendees` insert whose payload carries only `session_id` resolves the owner through the parent session row (write the parent session domain row first, same transaction pattern the real repositories use). Third case: a payload with no resolvable owner stores NULL.
- [x] GREEN: `enqueueDomainOutbox` resolves `resolvePrimaryOwner({ db, tableName, row: null, payload })` and passes it to `enqueue`; `enqueue` persists it. For `hard_delete` operations (payload is null), accept an optional `ownerRow` argument from the caller; update `childrenRepository`'s no-history delete to pass the child row it is deleting so the owner stamps. If the outbox upsert-on-conflict path updates existing rows, keep `owner_user_id` in the update set.
- [x] Gate: full outbox + repository suites. Commit: `feat(sync): stamp owner_user_id on every outbox enqueue`

### Task 4: Owner-scoped readiness and status

- [x] RED (integration, real SQLite): enqueue rows for owner `ea-a` and owner `ea-b` plus one NULL-owner row. Assert: `getReadyRecords({ ownerUserId: 'ea-b' })` returns only `ea-b`'s rows plus the NULL row; `getSyncStatus({ ownerUserId: 'ea-b' })` counts the same subset (all counters, including `readyCount` and `needsAttentionItems`); omitting `ownerUserId` returns everything (today's behavior).
- [x] RED (engine): drive `createOutboxSyncEngine` with a session for `ea-b` against a backlog containing `ea-a` rows: assert `ea-a` rows remain untouched (`pending`, zero server calls for them) while `ea-b` rows push. This is the finding-#2 kill shot; model it on `offlineSyncAuthGate.test.js`.
- [x] GREEN: `getReadyRecords` adds `and (owner_user_id is null or owner_user_id = ?)` when `ownerUserId` is provided; `getSyncStatus` filters rows in its existing snapshot loop the same way. `syncAll` passes `session.user.id` (it already has the session from the auth gate) for BOTH normal and forced passes.
- [x] `OfflineContext`: keep a `currentUserIdRef` updated from the existing `onAuthStateChange` listener (`session?.user?.id ?? null`; `SIGNED_OUT` sets null) and pass it to `getSyncStatus`. Context test: after a `SIGNED_IN` event for user X, `refreshSyncStatus` calls `getSyncStatus` with `{ ownerUserId: X }`.
- [x] Gate: full unit + integration. Commit: `feat(sync): owner-scoped readiness and status; a session only pushes its own rows`

### Task 5: Deterministic-error retry budget

- [x] RED (integration, real SQLite through the engine or repository failure path): a record failing with `PGRST204` seven times stays `failed`/retriable; the eighth failure marks it `terminal` with `last_error` starting `deterministic:`; force Sync Now (`includeTerminal: true`) resurrects it. A record failing with a codeless network error 20 times stays retriable. An immutable-assignment `23514` stays immediately terminal (existing behavior pinned).
- [x] GREEN: define `DETERMINISTIC_ERROR_CODES = ['PGRST204', '42703', '22P02', '23502', '23514']` next to `classifyError`; in the retriable-failure path (where `retry_count` increments, around `offlineSync.js:772`), when the classified error carries one of these codes AND the incremented `retry_count >= 8`, mark terminal with reason `deterministic: <original message>`. `23514` on the three immutable-assignment tables keeps its existing immediate-terminal path (checked first, unchanged); the budget applies to `23514` on other tables only.
- [x] Gate: full unit + integration; the classifyError hardening suites must pass unmodified. Commit: `feat(sync): deterministic server errors get an 8-attempt budget, then needs-attention`

### Task 6: Contract map + wrap

- [x] `documentation/rls-sync-contract-map.md`: update Item 10 and REPLACE the 2026-07-12 known-limitations bullet about deterministic errors with the new budget semantics; add `owner_user_id` (local-only, never in payloads, NULL = grandfathered) to the outbox description; note that readiness/status are owner-scoped.
- [x] One row in `documentation/sqlite-refactor-log.md`; tick all plan checkboxes; PRD progress entry.
- [x] Final gates: full `npx jest --silent` + `npm run test:integration`, exact counts in your report. Commit: `docs(s2a): ownership + error-budget wrap - contract map, checklists, log row`

**Device gate (Jim, after merge):** two-account handover (A captures offline, signs out, B signs in and syncs, A returns and drains); forced `PGRST204` in a dev build walks into needs-attention after 8 attempts and Sync Now resurrects it.

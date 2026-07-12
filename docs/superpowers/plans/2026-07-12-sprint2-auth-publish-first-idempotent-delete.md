# Sprint 2B: Publish-First Auth + Idempotent Child Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** implement items C and D of `docs/superpowers/specs/2026-07-12-sprint2-data-edges-design.md` (audit findings #7 and #14):

- **C. Publish-first auth:** cold start with a valid (restored or live) session publishes the user and cached profile immediately; the reference-data pull and network profile refresh run in the background. A stalled network can no longer hold the startup spinner.
- **D. Idempotent child delete:** the `delete_child_if_no_history` RPC treats an entirely absent child as success (a crash-retry stops producing false needs-attention), and the children pull merge suppresses server rows that have a pending `hard_delete` in the outbox (a failed delete stops resurrecting the child until retry).

**Branch:** `improvement/s2-auth-and-delete` (already checked out in your worktree).

**Read the spec first** (sections C and D of `docs/superpowers/specs/2026-07-12-sprint2-data-edges-design.md`). Decisions are locked; do not relitigate.

## Verified anchors (2026-07-12, post-Sprint-1 tree; locate by pattern if lines drift)

- `hydrateAuthenticatedUser` in `src/context/AuthContext.js` (pattern: `await pullReferenceData({ userId: authUser.id })` inside a try/catch, then `loadUserProfile(...)`, then `setUser(authUser)` + `setLoading(false)` in a `finally`). Version guards: `profileLoadVersionRef` / `isCurrentProfileLoad` (must be preserved unchanged). Sprint 1 wrapped the five exported auth functions in `useCallback` and memoized the provider value; do not disturb that.
- The pinned blocking test lives in `__tests__/AuthContext.test.js` (pattern: a test asserting `user` stays null while the reference-pull promise is unresolved, around a `pullReferenceData` mock that never resolves). `__tests__/authColdStartRestore.test.js` pins the cold-start restore and must stay green UNMODIFIED.
- The RPC lives in `supabase/migrations/20260521153217_masi_child_delete_guard.sql`: public wrapper `delete_child_if_no_history(p_child_id)` delegating to `private.delete_child_if_no_history`, whose first check raises `42501` when no accessible child exists (it cannot distinguish absent from unauthorized). History-blocked returns `false`; success returns whether a row was deleted.
- Client delete path: `childrenRepository` no-history delete removes the child + relationships and enqueues a `hard_delete` outbox row; the engine treats `data === true` as success (`src/services/offlineSync.js` around `:649`).
- Merge: `src/utils/mergeServerRows.js` signature `mergeServerRows(cached, serverRows, { unpushedRows = [] })`; tombstone suppression currently derives only from unsynced DOMAIN rows, so a hard-deleted child (no domain row) is invisible to it. `ChildrenContext` calls it for children/groups/memberships during `loadPreloadedChildData` (post-Sprint-1 reformat; locate by the `mergeServerRows(` call sites).
- Outbox queries: `src/db/repositories/syncOutboxRepository.js` has `hasPendingRecord({ tableName, recordId })`; there is no set-returning pending-ids query yet.

## Codex plan review dispositions (2026-07-12, R8-R11) — BINDING

Adversarial review (gpt-5.6-sol) against the merged tree; all findings accepted. **Where a disposition conflicts with task text below, the disposition wins. SEQUENCING: this plan executes AFTER Sprint 2A (outbox ownership) has merged to main; it depends on the `sync_outbox.owner_user_id` column and branches from post-2A main.**

- **R8 (Task 3, relationships too):** suppressing only the child row while `ChildrenContext` separately persists the pulled relationship arrays (`ChildrenContext.js:79-94`) re-saves active memberships/enrollments/assignments against a missing FK parent (`children(id)` FKs, `migrations.js:271-290`), aborting the preload. Amendment: filter `pulled.children` AND `childEaAssignments`, `childProgrammeEnrollments`, `childClassMemberships` by the pending child-delete ids before both merge and persistence. The context regression asserts none of the four storage save methods receives `child-9`; add a real-SQLite integration test so FK enforcement is actually exercised.
- **R9 (Task 3, owner scope + layering):** `getPendingHardDeleteIds` takes `{ tableName, ownerUserId }` with the standard `owner_user_id is null or owner_user_id = ?` semantics (Sprint 2A's column), is exposed through the `storage` facade like ChildrenContext's other local reads, and is called with the context's `activeUserId`. Do not import a repository directly into ChildrenContext.
- **R10 (Task 1, publish order + honest cache RED):** `setUser(authUser)` and `setLoading(false)` happen SYNCHRONOUSLY before any await in `hydrateAuthenticatedUser`; then `loadUserProfile` and `pullReferenceData` start as independent, caught background promises (concurrent, not re-sequenced). The cached-profile RED must defer the Supabase profile query too (the current test setup resolves it normally, `AuthContext.test.js:58-84`, so the assertion could observe the network result), use a cached profile distinguishable from the server profile, and assert the network profile request has started while the reference pull is still pending.
- **R11 (Task 2, static migration test is required):** a canonical static migration-SQL suite exists (`__tests__/sqlitePlan1Migrations.test.js`, which already pins the original delete function's attributes at `:251-281`). Amendment: write a RED static test targeting the NEW migration filename proving the absent-child existence check precedes the authorization check and that the replacement keeps `language plpgsql`, `security definer`, and `set search_path = ''`. Leave the existing `/child_delete_guard/` pins untouched (they document the original migration).
- Review-confirmed: replacing only the private function is sufficient (wrapper and grants are separate surviving objects); merge suppression alone is insufficient because persistence iterates `pulled.children` separately (`ChildrenContext.js:84-87`), so the plan's persistence-skip requirement stands.

## Global Constraints

- Node 20: prefix jest/npm commands with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Strict red-green per step; commit per task; NEVER push; no PR.
- Commit messages `type(scope): message`; no co-author line; no em dashes anywhere.
- **The Supabase migration file is authored here but NOT applied by you.** Do not run `supabase db push`, `psql`, or any command against a remote database. The orchestrator applies and verifies it after merge.
- Cross-user cache-leak guards in AuthContext (`profileLoadVersionRef`, `isCurrentProfileLoad`, sign-out semantics) must not change; the auth event handling (`SIGNED_OUT` immediate-commit, 15s grace for other null events, TOKEN_REFRESHED early return) must not change.
- `mergeServerRows` stays pure and backward-compatible: the new option is additive with a default that preserves current behavior.

---

### Task 1: Publish-first auth hydration

- [x] RED: rewrite the pinned blocking test to pin the NEW contract: with a `pullReferenceData` mock that never resolves, `user` becomes non-null and `loading` becomes false anyway, and `pullReferenceData` was called exactly once with the user's id. Run: fails today (user stays null).
- [x] RED 2: cached-profile visibility: with a stored cached profile and a never-resolving reference pull, `profile` reaches the cached value. (Follow the existing test file's mock conventions for the profile cache; if `loadUserProfile`'s cached read cannot complete independently of the network refresh, split the smallest seam that lets the cached read publish first, without changing `loadUserProfile`'s external behavior.)
- [x] GREEN: reorder `hydrateAuthenticatedUser`: publish first (`setUser(authUser)`, cached-profile load, `setLoading(false)`), then run `pullReferenceData` and the network profile refresh as non-blocking background work, still wrapped in try/catch and still guarded by `isCurrentProfileLoad(authUser.id, version)` before applying any late results. No new timeout machinery.
- [x] Gate: the full AuthContext suite plus `authColdStartRestore.test.js` (unmodified) green. Commit: `fix(auth): publish restored user immediately; reference pull moves to background`

### Task 2: Idempotent delete RPC migration (authored, not applied)

- [x] Create `supabase/migrations/<utc-timestamp>_masi_idempotent_child_delete.sql` (use `date -u +%Y%m%d%H%M%S`): `create or replace function private.delete_child_if_no_history(p_child_id uuid)` reproducing the current body (copy from `20260521153217`) with ONE change up front: `if not exists (select 1 from public.children c where c.id = p_child_id) then return true; end if;` before the authorization check. Present-but-unauthorized keeps raising `42501`; history-blocked keeps returning `false`. Keep `security definer`, `search_path`, grants, and the public wrapper untouched (do not recreate the wrapper).
- [x] No runtime test can execute this SQL here; add a static guard test only if one already exists for migration SQL shape (do not invent a SQL parser). The behavioral proof lands in the orchestrator's post-apply verification.
- [x] Commit: `feat(sync): idempotent child hard-delete RPC migration (absent child = success)`

### Task 3: Pull merge suppresses pending hard-deletes

- [x] RED (unit, `__tests__/mergeServerRows.test.js` or the existing merge suite): `mergeServerRows(cached, serverRows, { unpushedRows, pendingDeleteIds: new Set(['child-9']) })` excludes the server copy of `child-9`; default (no option) behavior byte-identical to today.
- [x] RED (context): in the ChildrenContext suite, with a pending `children` `hard_delete` outbox row for `child-9` and a server response still containing `child-9`, the post-pull state does not contain `child-9` and SQLite does not get `child-9` re-saved.
- [x] GREEN: add `getPendingHardDeleteIds({ tableName })` to `syncOutboxRepository` (ids of `hard_delete` rows in `pending`/`failed`/`in_flight`); `mergeServerRows` gains the additive `pendingDeleteIds` option; `ChildrenContext.loadPreloadedChildData` fetches the children pending-delete ids once per load and passes them to the children merge AND skips persisting those server rows.
- [x] Gate: full unit + integration. Commit: `fix(sync): pending hard-deletes suppress server resurrection in the children pull`

### Task 4: Contract map + wrap

- [x] `documentation/rls-sync-contract-map.md`: children row + delete-operation section: absent child now returns success (idempotent retry after crash), pull merge consults pending hard-deletes. Note the migration filename.
- [x] One row in `documentation/sqlite-refactor-log.md`; tick all plan checkboxes; PRD progress entry.
- [x] Final gates: full `npx jest --silent` + `npm run test:integration`, exact counts in your report. Commit: `docs(s2b): auth publish-first + idempotent delete wrap - contract map, checklists, log row`

**Orchestrator follow-up (not yours):** apply the Task 2 migration to `segygjzpujphwvrubusm` via the psql path, insert the version row into `supabase_migrations.schema_migrations`, and re-verify the RPC body live.

**Device gate (Jim, after merge):** airplane-mode cold start reaches Home instantly with cached data; delete a no-history child offline, force-kill mid-sync on reconnect, reopen: child stays deleted and no false needs-attention appears.

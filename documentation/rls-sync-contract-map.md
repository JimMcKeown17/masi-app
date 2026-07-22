# RLS / Sync Contract Map

This is the current source of truth for how the SQLite app writes local rows, pushes them through `sync_outbox`, and satisfies Supabase Row Level Security on the clean-slate `masi-app-sqlite` backend.

Use this map before changing any synced table, repository producer, outbox operation, migration, RLS policy, or Supabase payload allowlist. A table-level policy audit is not enough: the contract is the combination of producer fields, sync operation shape, RLS visibility, dependency ordering, and tests/probes.

## Backend Scope

- Backend: `masi-app-sqlite`
- Supabase project ref: `segygjzpujphwvrubusm`
- Canonical migrations: `supabase/migrations/`
- Historical migrations: `supabase-migrations/` is old-backend reference only
- Sync engine: `src/services/offlineSync.js`
- Local write boundary: repository methods under `src/db/repositories/`
- Durable queue: `sync_outbox`; schema v6 adds local-only `owner_user_id`, which is never included in server payloads. New rows stamp their EA owner at enqueue, readiness/status/reset queries include only the current owner plus NULL rows, and NULL means a grandfathered pre-v6 row that any authenticated EA session may drain.
- Server payload allowlist: `SERVER_COLUMNS` in `src/services/offlineSync.js`
- Insert order: `PUSH_ORDER` in `src/services/offlineSync.js`
- Archive order: `ARCHIVE_PUSH_ORDER` plus `ARCHIVE_TABLE_DEPENDENCIES` in `src/services/offlineSync.js`

## Global Contracts

1. Domain writes are local-first. A user-facing write must persist the domain row and enqueue the matching `sync_outbox` row in the same SQLite transaction.
2. RLS-required ownership and relationship columns must be present before enqueue. Missing values should fail locally through repository guards, not hours later as terminal sync failures.
3. Mobile upsert requires SELECT visibility. Supabase/PostgREST upsert checks row visibility while resolving conflicts, so policies must account for the exact operation shape, not only `INSERT WITH CHECK`.
4. Parent rows that create later access evidence need direct owner SELECT fallback. This is why `children`, `classes`, `groups`, and `sessions` keep direct creator/user visibility in addition to relationship-derived policies.
5. Relationship tables that grant access are not generic mutable rows. `child_ea_assignments`, `class_ea_assignments`, and `group_ea_assignments` have immutable identity columns protected by database triggers. Insert retries must not become identity-changing updates.
6. Insert and archive ordering differ. Insert can create access evidence early; archive must keep access-granting assignment rows alive until protected cleanup rows have synced.
7. Reference/admin tables are pulled from the server and are not mobile-writable through app-role DML.
8. Server pulls must not overwrite pending local rows (pending-local-wins, issue #42 / ZZ F7). See "Pull Persistence & Reconcile" below.
9. Sync auth state is part of the RLS contract (issues #43/#44). A sync pass with no Supabase session must return a structured skip (`{ success: true, skippedNoSession: true }`) before touching the outbox or sync metadata. A terminal `42501` recorded while a live session exists must store `last_error` with the `42501-authenticated:` prefix and must never be auto-healed. Unmarked RLS-terminal rows are treated as auth-loss collateral: when auth is restored through `SIGNED_IN`, `TOKEN_REFRESHED`, or sessionful `INITIAL_SESSION`, the engine requeues only rows owned by the signed-in user, and the outbox requeue plus domain `sync_status = 'pending'` reset happen in one SQLite transaction. See "Auth-Restore RLS Heal" below.
10. Error classification is local-state-only and bounded for the classes it models (issue #48 plus audit finding #6). `23514` from the immutable-assignment identity triggers (`child_ea_assignments`, `class_ea_assignments`, `group_ea_assignments`) is immediately terminal with reason `Immutable identity or check constraint rejected the update (23514)`; the insert path already avoids it via `ignoreDuplicates`, so this covers archive/update re-pushes. `23503` is retriable while the FK parent has a `pending`/`failed`/`in_flight` `sync_outbox` row (`hasPendingRecord`), terminal otherwise. `42501` is retriable while the FK parent OR the RLS assignment grant is pending locally, terminal otherwise; grant evidence is a direct active (`unassigned_at is null`), unsynced `child_ea_assignments`/`class_ea_assignments`/`group_ea_assignments` row for the record's subject (`PARENT_FK_COLUMNS` + `GRANT_SUBJECTS`). Only the direct-assignment arm of `private.current_user_can_write_for_*` is modeled (see limitations). Subject and FK values resolve from the outbox payload first and the record's own local domain row second, so archive/update payloads still yield evidence. The `42501` no-session downgrade (Item 9) still applies to an otherwise-terminal `42501`. The deterministic class `PGRST204`, `42703`, `22P02`, `23502`, and non-immutable-table `23514` is retriable for attempts 1 through 7; attempt 8 becomes terminal with `retry_count = 8` and a `deterministic:` reason. Codeless network/timeout errors remain retriable without an attempt cap. Force "Sync Now" includes terminal rows, so a repaired server condition can resurrect and finalize them. See "Error Classification" below.
11. Active-pair identity is collision-proof by construction (issue #47). The four active-pair tables whose identity IS their server partial-unique key -- `child_ea_assignments` `(user_id, child_id)`, `child_programme_enrollments` `(child_id, programme_id)`, `class_ea_assignments` `(class_id, ea_user_id, programme_id)`, `group_ea_assignments` `(group_id)` -- use a deterministic UUIDv5 id keyed EXACTLY on those columns (local mint in the repository create path plus a force-remap on push in `buildSyncPayload`, gated on all key columns so bare archive payloads are never remapped). Every writer (device or the future head-office seed) that means the same active pair derives the same id, so a would-be partial-index `23505` becomes an idempotent id-match. `child_class_memberships` cannot use this (it recurs on class moves and needs distinct archived rows for `deleteIfNoHistory` audit), so it uses reconcile-before-upsert: before an insert, a pre-push server read archives a conflicting active `(child_id, academic_year_id)` row (device-move-wins, audit-preserving), with a conservative fallback to the normal upsert on any error. See "Active-Pair Collision-Proofing" below.
12. Grouping-flow collision-proofing is partial and mostly deferred (issue #46). `class_grouping_state` is a one-row-per-`(class_id, academic_year_id)` singleton, so it uses a deterministic id `f(class_id, academic_year_id)` (local mint + push-remap), same shape as Item 11. `grouping_versions` (generational -- needs an activate-new/deactivate-old reconcile) and `groups.display_number` (a partial-unique sequence never populated today) are NOT built: their collision-proofing is inseparable from the grouping/regrouping workflow, which is deferred to next year (CONTEXT.md:161, ADR-0001). Their write paths do not exist yet, so nothing collides today. See "Grouping-Flow Collision-Proofing" below.
13. An outbox row's `created_at` is queue identity, not mutation time. Re-enqueueing the same `(table_name, record_id, operation)` refreshes its payload, owner, retry fields, status, and `updated_at`, but preserves its first `created_at`. Push ordering therefore remains fair when one record is edited repeatedly. Batch claiming is set-based: one local UPDATE assigns a shared in-flight timestamp, one SELECT returns the fresh records in input order, and finalization still compares each returned `updated_at` before deleting or failing the row.
14. The concurrency-1 Supabase queue serializes requests, not workflows. A dependent domain pull keeps its query order but acquires one queue lease per RPC or query. No child/class preload may wrap its entire multi-request workflow in one `enqueueSupabaseRequest`. This lets a waiting auth, profile, lookup, or push request run between responses without allowing simultaneous Supabase operations.

## Operation Semantics

| Operation shape | Tables | Server call | RLS implication |
| --- | --- | --- | --- |
| Default outbox push | Most synced domain tables | `upsert(payload, { onConflict: 'id' })` | Needs both write permission and SELECT visibility for upsert. |
| Batched upsert | `assessment_items`, `child_programme_enrollments`, `children`, `letter_mastery`, `session_attendees`, `time_entries` | `upsert(payloads, { onConflict: 'id' })` in batches of at most 100. A returned or thrown batch failure may spend at most 25 per-record fallback attempts across the entire pass, with concurrency at most five. | Parent row (`assessments` / `children` / `sessions`) must be visible/writable first for tables with parent FKs. Unattempted fallback rows return to pending without failure or retry inflation. `children` has no pre-push hook. Enrollment payloads are normalized to deterministic active-pair ids before array dispatch. |
| Immutable assignment insert push | `child_ea_assignments`, `class_ea_assignments`, `group_ea_assignments` when `operation === 'insert'` | One ready row uses `upsert(payload, { onConflict: 'id', ignoreDuplicates: true })`; consecutive ready rows use the same operation with `payloads`, bounded batch size, and bounded per-record fallback. | Duplicate insert retry must be insert-or-ignore, not update-capable upsert, because identity triggers reject changed identity/timestamp columns. Full payloads are normalized to deterministic active-pair ids before dispatch. |
| Assignment archive/update | Same assignment tables when `operation === 'archive'` or update-like payload | Update-capable upsert | Allowed only for lifecycle fields such as `unassigned_at` / `handover_reason`; identity columns remain immutable. |
| No-history child delete | `children` hard delete | RPC `delete_child_if_no_history(p_child_id)` | Direct mobile child DELETE is blocked; history rows require archive instead. `20260712202409_masi_idempotent_child_delete.sql` makes a wholly absent child return `true` before authorization, so a retry after server success and pre-finalization crash is idempotent. Present but unauthorized children still raise `42501`; history-blocked children still return `false`. The migration is authored here and remains orchestrator-owned for live application. |

### Same-pass dependency gating

Push order is necessary but not sufficient: when one row fails, only rows that depend on that exact record should wait. The sync engine tracks failed and dependency-skipped records as `{ table_name, record_id }`, not as a set of failed tables. Normal parent edges use `PARENT_FK_COLUMNS` to compare the dependent's FK with the failed parent's `record_id`. Archive ordering uses `ARCHIVE_DEPENDENCY_SUBJECT_COLUMNS` to compare the shared `child_id`, `class_id`, or `group_id`, so an access-ending assignment waits for failed cleanup about the same subject only. Fields come from the outbox payload first and the durable SQLite domain row second because lifecycle payloads are intentionally partial.

A matching dependent stays pending and its table result records both `skippedDependency` and `skippedDependencyRecordId`. The skipped record itself becomes scoped blocking evidence for later records in the same pass. Unrelated records continue, including records on the same dependent table and healthy records separated by a blocked row during batch formation. Every declared direct and inverse dependency edge has a static mapping guard. If a future edge lacks resolvable identity evidence, the engine falls back to conservative blocking rather than sending out of order.

### Failed-batch work budget

The ready queue may contain up to 1,000 rows, but that is a scheduling window, not permission to create a 1,000-row request or a 1,000-request fallback storm. `SYNC_BATCH_LIMITS` enforces three distinct ceilings: 100 records per batch request, 25 individual fallback attempts shared by the whole pass, and five simultaneous fallback requests. Small `Promise.allSettled` waves retain sibling-safe finalization without saturating a weak connection or hammering a failing backend.

When the fallback budget is exhausted, unattempted rows are reset from `in_flight` to `pending` in one local transaction. They keep `retry_count = 0` and no `last_error` because no individual server attempt occurred. The pass result increments `totalDeferred`, the table result increments `deferred`, and deferred rows become exact record-scoped blocking evidence so descendants do not overtake them. Operational reporting emits a rate-limited `batch_fallback_deferred` issue with the full sync-pass context.

### Outbox queue age and batch claim

`sync_outbox.created_at` orders otherwise-equal work and must remain the first-enqueue timestamp for one logical outbox id. The shared SQLite upsert helper therefore supports preserved conflict columns, and `insertOutboxRecord` preserves only `created_at`. Every mutable field still takes the newest enqueue value, including the latest domain payload and owner. Retry count, error, backoff, and status reset in the same upsert, so `syncOutboxRepository.enqueue` performs no follow-up UPDATE.

For a batch, `markInFlightAndGet(ids)` runs inside one writer transaction. It changes all ids through one `UPDATE`, then reads them through one `SELECT` and restores caller order in memory. The returned records carry the exact shared `updated_at` used by `finalizeManySuccess` and `finalizeManyRetriableFailure`. This removes O(N) local claim/read work without weakening stale-finalize protection: a concurrent re-enqueue changes `updated_at`, the compare-and-swap misses, and the newer payload remains pending.

### Supabase request queue granularity

`supabaseRequestQueue` remains concurrency 1 because React Native auth, preload, pull, and push calls share one client and previously exposed lock/race failures. Concurrency 1 does not imply that a high-level workflow owns the queue until every dependent request finishes. `pullPreloadedChildData` queues the reconcile acknowledgment RPC, Programme query, direct assignment query, each enrollment chunk, children query, class-membership query, group query, and group-membership query separately. `ClassesContext` similarly queues its acknowledgment, Programme, and classes requests separately.

Each workflow still awaits the result it needs before constructing the next dependent query. The change is fairness, not parallelism. If another operation was queued while request A was in flight, it runs after A and before the pull submits request B. Data shaping and SQLite persistence occur outside the network lease. Active-user guards still discard a completed old-user pull, and failed or incomplete scopes retain the same fail-closed reconcile rules.

## Error Classification (Item 10)

Classification is a pure decision in `classifyError` from `(code, tableName, parentEvidencePending)`, plus the per-record loop that computes `parentEvidencePending` from local state via `computeEvidencePending`. No server calls occur in the per-record failure path.

| Server error | Classification | Evidence checked |
| --- | --- | --- |
| `23514` on `child_ea_assignments` / `class_ea_assignments` / `group_ea_assignments` | Terminal, reason `Immutable identity or check constraint rejected the update (23514)` | none (neither drifted identity nor a check violation is satisfiable by re-push) |
| `23514` on any other table | Retriable (unchanged, out of #48 scope) | none |
| `23503` | Retriable while FK parent is pending in the outbox, terminal otherwise | `PARENT_FK_COLUMNS` via `hasPendingRecord` |
| `42501` (live session) | Retriable while FK parent OR assignment grant is pending, else terminal with the `42501-authenticated:` marker | `PARENT_FK_COLUMNS` + `GRANT_SUBJECTS` |
| `42501` (no session) | Retriable, unmarked (Item 9) | n/a |
| `PGRST204`, `42703`, `22P02`, `23502`, non-immutable `23514` | Retriable for attempts 1-7; terminal on attempt 8 with `deterministic:` prefix and `retry_count = 8` | persisted outbox `retry_count` |
| Codeless network/timeout error | Retriable without an attempt cap | none |

Known limitations:
- Deterministic server errors (`PGRST204`, `42703`, `22P02`, `23502`, and non-immutable-table `23514`) have an 8-attempt local budget. Attempts 1-7 use the existing capped exponential backoff; attempt 8 becomes needs-attention with a `deterministic:` reason. A forced Sync Now pass includes the terminal row and can recover it after the server condition is repaired. Codeless network/timeout failures remain retriable indefinitely by design.
- `staff_programme_assignments` grants are not device-produced (never pushed), so a `42501` that needs one stays terminal, which is correct: a real programme-assignment denial.
- A parent or grant that heals through the Item 9 auth-restore after its child was already stamped terminal does not auto-rescue the child (identical to pre-#48 behavior); force "Sync Now" (`includeTerminal`) resurrects the chain.
- Non-immutable-table `23514` follows the 8-attempt deterministic budget. A CHECK violation on an immutable-assignment table (for example, `unassigned_at >= assigned_at`) remains immediately terminal and shares the identity reason label.
- Only the DIRECT assignment grant of `current_user_can_write_for_child` is modeled. Its two membership-mediated paths (class_ea via `child_class_memberships`, group_ea via `child_group_memberships`) are not, so a child write whose only grant is a pending class/group assignment would false-terminal. Not reachable in the current direct-child-assignment field model; extend `GRANT_SUBJECTS` before group-centric (whole-class) access ships.

Guarded by `__tests__/classifyErrorHardening.test.js` (unit, via `_testClassifyError` / `_testEvidenceMaps` / `_testComputeEvidencePending`), `__tests__/deterministicErrorBudget.test.js`, and the `23514` / `42501` / evidence integration tests in `__tests__/offlineSyncOutbox.test.js`.

## Active-Pair Collision-Proofing (Item 11)

The four deterministic-id tables neutralize their partial-unique `23505` by construction; `child_class_memberships` reconciles.

| Table | Server partial-unique index | Mechanism |
| --- | --- | --- |
| `child_ea_assignments` | `(user_id, child_id) where unassigned_at is null` | deterministic id `f(user_id, child_id)` |
| `child_programme_enrollments` | `(child_id, programme_id) where ended_at is null` | deterministic id `f(child_id, programme_id)` |
| `class_ea_assignments` | `(class_id, ea_user_id, programme_id) where unassigned_at is null` | deterministic id `f(class_id, ea_user_id, programme_id)` |
| `group_ea_assignments` | `(group_id) where unassigned_at is null` | deterministic id `f(group_id)` (one active EA per group; server-wins on conflict) |
| `child_class_memberships` | `(child_id, academic_year_id) where exited_at is null` | reconcile-before-upsert (archive the conflicting server-active row, then insert) |

**Cross-writer id-derivation contract (the linchpin).** The multi-writer neutralization only works if EVERY writer derives the identical id. Any writer of these four tables -- the mobile app today, the future Head-Office seed script, the HO NextJS dashboard -- MUST use: UUIDv5, namespace `09dcf4b2-6c53-4c46-917f-33bc7f2df4d2`, parts joined by the unit-separator character (`U+001F`), parts = `[<table_name>, <key columns in the order above>]`, each part stringified as `String(part ?? '')`. This mirrors `deterministicDomainId` (`src/db/repositories/domainRepositoryUtils.js:14-17`). The seed-script author MUST reproduce this exactly, or seeded rows will collide with device rows instead of matching them.

**Deploy gate (mandatory, Jim-run at cutover).** `ignoreDuplicates` uses `onConflict: 'id'`, which does NOT arbitrate the partial-unique index, so a leftover pre-fix RANDOM-id active row still `23505`s a deterministic push. Before shipping: (1) clean pre-fix random-id active rows for the four tables on `masi-app-sqlite` (wipeable dev data, no field users), AND (2) ensure devices start from a fresh/wiped LOCAL DB (a pre-fix local row's insert remaps R to D while its bare archive stays keyed on the local id R, so the archive would mis-target). Mirrors the `letter_mastery` Task 0 gate.

**ccm reconcile boundary (RLS).** The reconcile archives the conflicting server row with an UPDATE that is itself RLS-gated on that row's class (`child_class_memberships_update_write_child_class`). It succeeds for a same-school move; a cross-school Head-Office reassignment (child in a class the device cannot access) is RLS-denied, the reconcile falls back conservatively, and the insert lands terminal (classified by Item 10). Acceptable while HO central reassignment is deferred; a complete fix would be a `SECURITY DEFINER` archive+insert RPC (follow-up, schema change). `group_ea_assignments` is now pulled and persisted. An assignment-scoped pull can therefore reactivate the deterministic local row when the server returns it again.

Guarded by `__tests__/activePairDomainIds.test.js`, the deterministic-id + archive-preservation tests in `__tests__/offlineSyncOutbox.test.js`, the per-repository mint tests, and `__tests__/childClassMembershipReconcile.test.js` (real second-SQLite server; note: runs no RLS, so the cross-school boundary above is not exercised in tests).

## Grouping-Flow Collision-Proofing (Item 12)

**Built (#46): `class_grouping_state` deterministic id.** A one-row-per-`(class_id, academic_year_id)` singleton whose identity IS that key (plain unique constraint `class_grouping_state_unique`). It uses `classGroupingStateDomainId({ classId, academicYearId })` = `f(class_id, academic_year_id)`, forced in `classGroupingStateRepository.save` (local mint) and in `buildSyncPayload` (push-remap). The Item 11 cross-writer id-derivation contract applies verbatim (namespace `09dcf4b2-6c53-4c46-917f-33bc7f2df4d2`, `U+001F` join, parts `['class_grouping_state', class_id, academic_year_id]`) -- the future Head-Office writer MUST reproduce it. No pre-fix rows exist today (the table has no production writer yet), so the deploy gate is a no-op now but applies if that changes.

**Deferred (build WITH the grouping-feature slice, next year -- CONTEXT.md:161, ADR-0001):**
- `grouping_versions` -- server constraints `(class_id, academic_year_id, version_number)` unique AND partial `idx_grouping_versions_active_unique (class_id, academic_year_id) where status='active'`. Identity is generational (v1, v2, ...), so a deterministic id is WRONG (distinct version rows must survive). Collision-proofing needs reconcile-before-upsert on the active constraint: before pushing a new `active` version, read the server's current active version for the class/year and archive it first, in a deterministic order (mirroring `reconcileChildClassMembership`). Not buildable correctly yet -- the activation workflow it reconciles (version_number assignment, activate-new/deactivate-old) does not exist; `groupingVersionsRepository` has no production caller.
- `groups.display_number` -- partial unique `idx_groups_active_display_number (grouping_version_id, display_number) where archived_at is null and display_number is not null`. Never populated by any current writer (live group numbering is free-text `Group N` in `name`; the column stays NULL, which the index excludes), so the constraint is unreachable today. A deterministic `groups.id` cannot fix a `display_number` collision (two different group ids can still race for one slot). When the group-editor/auto-grouping slice writes `display_number`, it needs a server-assigned sequence (RPC) or a reconcile reading the used numbers for the grouping_version before insert. Reserved, no mechanism until then.

## Upsert Visibility Rules

These direct SELECT fallbacks are intentional and should not be removed just to satisfy advisor output:

| Table | Required direct visibility | Reason |
| --- | --- | --- |
| `children` | `children_select_created_by` with `created_by = auth.uid()` | Child row syncs before child EA assignment/programme/class relationship rows can authorize relationship-derived SELECT. |
| `classes` | `classes_select_created_by` with `created_by = auth.uid()` | Mobile-created class row syncs before the matching class EA assignment may authorize relationship-derived SELECT. |
| `groups` | `groups_select_created_by` with `created_by = auth.uid()` | Mobile-created group row syncs before group EA assignment and memberships may authorize relationship-derived SELECT. |
| `sessions` | Direct `user_id = auth.uid()` inside the session SELECT policy | Session parent syncs before `session_attendees` exist, so attendee-derived SELECT cannot be the only visibility path. |

Accepted advisor context: `multiple_permissive_policies` warnings on `children`, `classes`, and `groups` SELECT are expected while the mobile client uses Supabase upsert from queued local rows.

**Probes/guards (Item 8).** The four rules above are guarded by `__tests__/rlsVisibilityProbe.test.js` (CI-safe: pins the four `{table, policy}` pairs, including the real `sessions_select_own_or_assigned_child_history`, plus the project-ref guard) and `scripts/rls-visibility-probe.cjs` (opt-in live probe of upsert SELECT visibility against the wipeable `masi-app-sqlite`; `npm run rls:probe`, interactive because the management token 401s in non-interactive shells). The same live probe now seeds all reconciled relationships with service-role access, signs in as the matching EA, and requires `get_reconcile_acknowledgments` to return the exact active Programme and id sets. Separately, the `SERVER_COLUMNS` allowlist is guarded against the Supabase migration schema by `__tests__/syncContractServerSchema.test.js` (the PGRST204 direction: every pushed column must exist server-side), complementing `syncContractCompleteness.test.js` (which guards it against the local SQLite schema).

### Query-shaped relationship indexes

SQLite migration v9 (`sync_relationship_indexes`) and Supabase migration `20260714233000_sync_relationship_indexes.sql` add partial indexes on `sessions.class_id`, `sessions.group_id`, and `session_attendees.group_id`, each restricted to non-null rows. These columns are nullable relationship/FK paths; excluding the dominant null case reduces index storage while still supporting equality lookups and parent-key maintenance. `__tests__/hotPathIndexes.test.js` uses real SQLite `EXPLAIN QUERY PLAN` assertions and belongs to the integration manifest.

No current pull filters by `updated_at`, so this contract does not require a blanket timestamp index on every synced table. Delta-pull work must define its actual scope predicate first and add a matching table-specific index, commonly a composite `(scope_column, updated_at)` rather than an unscoped timestamp index. This preserves the rule that index cost is justified by a real query shape. The Supabase relationship-index migration and the earlier reconcile migration were both applied to `segygjzpujphwvrubusm` on 2026-07-21; remote migration history matches the canonical files.

## Pull Persistence & Reconcile

A pull first persists returned server rows, then reconciles acknowledged relationship removals in SQLite. React state is never a second merge authority. `ChildrenContext` and `ClassesContext` publish the cache immediately, perform the pull, and then publish a fresh repository read after persistence and reconcile. The retired `mergeServerRows` helper and its three-way in-memory merge are gone.

A pulled row is stamped `sync_status: 'synced'` before it reaches a repository save function. `serverPullWouldClobberPendingLocal` runs in the same transaction as the upsert and skips a server row when the local row is `pending` or `failed`. `synced` and `terminal` local rows may be replaced by an acknowledged server copy. Owner-scoped pending hard-delete ids are filtered out before child and relationship persistence. A skipped row never changes its queued outbox payload and never enqueues new work.

### Stale active-pair supersede (2026-07-22)

Deterministic active-pair ids remain the **primary** convergence contract: every writer derives the
same id for the same logical pair. But when stored ids violate that contract — a server-side re-key
(as on 2026-07-14), a superseded derivation formula, or a wrong-id seed — a pulled ACTIVE row can
carry a different id than the device's local ACTIVE row for the same pair. The id-keyed upsert then
hits the partial unique active-pair index before reconcile can run, the batch rolls back, the
per-row fallback (which never reconciles) fails identically, and every later pull repeats forever
(open-work §0c.1, device-reproduced 2026-07-22).

`supersedeStaleActivePairRow` (`domainRepositoryUtils.js`) closes that gap inside the four
deterministic-id save paths — `child_ea_assignments`, `child_programme_enrollments`,
`class_ea_assignments`, `group_ea_assignments` — between the pending-local-wins guard and the
upsert, in the same transaction:

- It runs only for an incoming ACTIVE row stamped `sync_status: 'synced'` (server-sourced saves).
- A same-pair, different-id local ACTIVE row with `sync_status: 'synced'` is ended: its end column
  (`unassigned_at` / `ended_at`) and `updated_at` are stamped with one timestamp, `sync_status`
  stays `'synced'`, and no outbox row is enqueued — the server already owns the removal. The
  incoming row then persists, so one pull converges and a second identical pull is a no-op. The
  partial unique index guarantees at most one such stale row per pair.
- A same-pair local ACTIVE row in any other status (`pending`, `failed`, `terminal`, or anything
  unexpected) is never touched: the incoming row is skipped instead, mirroring the reconcile rail
  ("pending, failed, and terminal rows are never ended by pull reconcile") and the
  `serverPullWouldClobberPendingLocal` posture.
- `child_class_memberships` (random ids, reconcile-before-upsert by design) and
  `child_group_memberships` (collision contract deliberately deferred) are excluded.

This is a recovery rail, not a replacement contract. §0b's seed requirement (derive ids with the
app's own deterministic-id functions) still stands in full force, because the push-side wedge — the
device computing id `D` for a pair the server holds under a different id, `23505` forever — has no
equivalent rail. Real-SQLite coverage lives in `__tests__/pullReconcile.integration.test.js`
(twelve supersede tests: four convergence, four pending-collision, failed, terminal,
inactive-incoming, and local-create cases).

### Server-authoritative relationship acknowledgment

Ordinary authenticated SELECTs hydrate row content, but they do not authorize absence. PostgreSQL RLS can suppress a row while returning `{ data: [], error: null }`, so treating an ordinary empty result as proof of removal is unsafe. Migration `20260714220000_server_authoritative_reconcile_acknowledgments.sql` adds `public.get_reconcile_acknowledgments()`, backed by a fixed-search-path `SECURITY DEFINER` function in `private`. It accepts no caller-supplied identity, derives the EA from `auth.uid()`, and returns schema version 1, `complete: true`, the active Programme id, and every relationship-specific id set from one PostgreSQL statement snapshot.

The client validates the schema version, completeness flag, authenticated user id, active Programme id, and every required array. Ordinary scopes still decide which returned rows can be persisted. Only the validated RPC snapshot supplies the acknowledged sets used to end local relationships:

| Reconciled table and server scope | Acknowledged set | Local rows ended | End column |
| --- | --- | --- | --- |
| `child_ea_assignments`, direct active assignments for the EA with children embedded | RPC `child_ea_assignment_ids` | The EA's active synced assignments absent from the set | `unassigned_at` |
| `child_programme_enrollments`, active rows for the active Programme within acknowledged assigned child ids | RPC `child_programme_enrollment_ids` within `assigned_child_ids` | Active synced enrollments in that exact Programme and child scope whose ids are absent | `ended_at` |
| `child_class_memberships`, active rows for child ids returned by the children query | RPC `child_class_membership_ids` within `visible_child_ids` | Active synced memberships for acknowledged child ids whose ids are absent | `exited_at` |
| `group_ea_assignments`, full embedded rows from the active, EA-scoped, Programme-scoped groups query | RPC `group_ids` | The EA's active synced group assignments for the active Programme whose group ids are absent | `unassigned_at`, never `groups.archived_at` |
| `child_group_memberships`, active rows for returned group ids | RPC `child_group_membership_ids` within `group_ids` | Active synced memberships for acknowledged group ids whose ids are absent | `removed_at` |
| `class_ea_assignments`, active rows for the EA and Programme from the two-stage Classes pull | RPC `class_ids` | The EA's active synced class assignments for the active Programme whose class ids are absent | `unassigned_at`, never `classes.archived_at` |

`children`, `classes`, and `groups` entities are never archived because they are absent. Their server tombstones arrive on the rows themselves because the pull queries do not filter `archived_at`. `getGroups({ userId, programmeId })` joins an active `group_ea_assignments` row, so group state matches the assignment-scoped server read model. Memberships for an absent or unassigned group remain intact but `getVisibleChildrenGroups` excludes them from published state until the group becomes visible again.

### Reconcile invariants and safety rails

- A relationship reconciles only when its ordinary hydration scope is `ok`, the active Programme exists, and the RPC snapshot is valid and complete for that same Programme and authenticated user. An errored or dependency-skipped hydration scope never persists or reconciles its table.
- A missing, errored, malformed, wrong-version, wrong-user, or Programme-inconsistent RPC snapshot fails closed: ordinary rows may still hydrate SQLite, but no local relationship is ended and no successful pull stamp is written. The child and class contexts report the condition through operational observability.
- Candidates are active rows with `sync_status = 'synced'` inside the acknowledged scope. `pending`, `failed`, and `terminal` rows are never ended by pull reconcile.
- Reconcile runs at the end of the happy-path batch transaction. It stamps the relationship end column and `updated_at`, keeps `sync_status = 'synced'`, and enqueues no outbox row because the server already owns the removal.
- Batch results expose `{ applied, skipped, failed, ended, fallbackUsed, reconcileCompleted }`. If the batch fails, the original error is logged and per-row fallback may persist valid rows, but fallback never reconciles. An incomplete reconcile blocks the pull stamp.
- `PULL_SCOPE_COMPLETENESS_LIMIT` is 1000. A hydration scope at the limit is treated as possibly truncated: returned rows are persisted and the condition is reported, while the complete RPC id set still makes relationship reconcile safe. The successful pull stamp is withheld because relationship safety does not prove that all row content was hydrated.
- `failureKind` is `null`, `query`, `transport`, or `dependency`. Returned RLS and query errors classify as `query`; network-shaped returned errors and thrown requests classify as `transport`; a failed prerequisite produces `dependency`. Any `transport` failure blocks the staleness stamp. Query and dependency failures do not block unrelated complete scopes from converging.
- A reconcile that would end more than 10 rows and more than 50 percent of active synced candidates trips the mass-end breaker. The update is skipped, `reconcileCompleted` is false, a durable `sync_state` note is saved, and SyncStatusScreen shows "Large roster change from Head Office is waiting". Apply grants a one-shot breaker bypass to the next pull. A later safe-sized pull clears the note automatically.
- A server row that was ended locally by mistake converges when its direct scope returns it again. Deterministic active-pair ids let the synced server row reactivate the same local row.

### Scheduling and acknowledged-completeness authority

`OfflineContext` uses a 15-minute staleness threshold on reconnect and foreground. It reads the `child_data_pull` and `classes_pull` records in `sync_state` and bumps `domainPullNonce` when either stamp is missing or stale. Each context has a user-keyed single-flight pull. Mount and pull-to-refresh still pull directly, while sync completion only refreshes SQLite state. A context writes its `lastPulledAt` stamp only when the RPC snapshot is valid and complete, no successful ordinary scope is possibly truncated, no scope has a `transport` failure, and every requested reconcile reports `reconcileCompleted: true`.

The RLS under-return hazard is closed in code by separating hydration authority from absence authority. Migration `20260714220000` was applied to `masi-app-sqlite` on 2026-07-21. The live `npm run rls:probe` gate passed: it created disposable service-role truth, signed in as the matching EA, called the authenticated RPC, required every returned relationship set to match exactly, and cleaned up.

Guarded pulled tables are `children`, `classes`, `groups`, `child_group_memberships`, `child_ea_assignments`, `child_programme_enrollments`, `child_class_memberships`, `class_ea_assignments`, and `group_ea_assignments`.

Resolved (issue #47): the pending-local guard keys on `id`, but the active-pair tables no longer rely on it for collision safety. The four deterministic-id tables converge a pending local row and a server row for the same pair onto one id, and `child_class_memberships` reconciles before insert. See "Active-Pair Collision-Proofing (Item 11)".

Tests: `__tests__/serverPullGuard.test.js`, `__tests__/pullReconcile.integration.test.js`, `__tests__/pullReconcileOffline.integration.test.js`, `__tests__/ChildrenContextPull.integration.test.js`, `__tests__/ClassesContextPull.integration.test.js`, `__tests__/ChildrenContextPendingDelete.integration.test.js`, `__tests__/pullPersistenceBudget.test.js`, `__tests__/ChildrenContext.test.js`, `__tests__/ClassesContext.plan5.test.js`, `__tests__/preloadedChildData.test.js`, `__tests__/reconcileAcknowledgmentRpcMigration.test.js`, and `__tests__/rlsVisibilityProbe.test.js`.

## Versioned Startup Repairs

`src/services/startupRepairs.js` is the only standing hook for healing SQLite/outbox state already written by an older faulty build. Recipes have positive, strictly increasing versions and unique names. Each recipe must identify a proven, already-fixed failure cohort and be idempotent. A broad reset of terminal or failed rows is forbidden because terminal state can represent a genuine RLS or relational denial.

The durable `local_state.startup_repair_version` marker advances after each recipe succeeds. Recipe work and the marker are intentionally separate commits: a kill between them may rerun an idempotent recipe, while the reverse order could permanently skip unfinished repair. A failed recipe leaves its version unapplied, is reported as `startup_repair_failed`, does not block the app, and retries on the next launch. A marker newer than the running code is never downgraded.

`OfflineContext` creates one repair promise per provider lifetime. Initial status hydration, auth-restore healing, and every manual/background upload await that same promise, so sync cannot race a repair. Version 1 runs the former `repairGroupOwnershipForSync` cutover heal once, repairing stale `groups` and `child_group_memberships` rows/outbox payloads and creating missing `group_ea_assignments`. The sync engine no longer scans for this historical condition on every pass.

Tests: `__tests__/startupRepairs.test.js`, `__tests__/OfflineContext.test.js`, `__tests__/groupsRepository.test.js`, and the repaired group/membership tracers in `__tests__/offlineSyncOutbox.test.js`.

## Auth-Restore RLS Heal

Auth-loss `42501` failures are recoverable only when they were written without a live session marker. `OfflineContext` calls `offlineSync.requeueTerminalRlsFailures()` on `SIGNED_IN`, `TOKEN_REFRESHED`, and `INITIAL_SESSION` events that include a session. The engine resolves ownership against the restored user before requeueing, so a new user cannot revive another user's quarantined outbox rows.

Rows marked with `42501-authenticated:` in `sync_outbox.last_error` are genuine authenticated RLS denials and remain terminal. Rows without that marker may be requeued when their owner matches the restored auth user. `sync_outbox.status`, retry counters, `last_error`, and the domain row's `sync_status`/`last_sync_error` are reset inside the same SQLite transaction, so the queue and domain table cannot disagree after a heal.

Owner resolution in `src/services/offlineSync.js`:

| Table | Owner resolution |
| --- | --- |
| `time_entries` | Direct `user_id` |
| `classes` | Direct `created_by` or `staff_id` |
| `children` | Direct `created_by` |
| `child_ea_assignments` | Direct `user_id` or `created_by` |
| `child_programme_enrollments` | Direct `created_by` |
| `child_class_memberships` | Direct `created_by` |
| `class_ea_assignments` | Direct `ea_user_id` or `created_by` |
| `grouping_versions` | Direct `created_by`, `accepted_by_user_id`, or `archived_by_user_id` |
| `class_grouping_state` | Direct `class_list_completed_by_user_id` or `class_list_reopened_by_user_id`; otherwise parent `classes.created_by` through `class_id` |
| `groups` | Direct `created_by` or `staff_id` |
| `group_ea_assignments` | Direct `ea_user_id` or `created_by` |
| `child_group_memberships` | Direct `created_by` |
| `sessions` | Direct `user_id` |
| `session_attendees` | Parent `sessions.user_id` through `session_id` |
| `assessments` | Direct `user_id` |
| `assessment_items` | Parent `assessments.user_id` through `assessment_id` |
| `letter_mastery` | Direct `user_id` |
| Fallback for unmapped tables | Direct `user_id`, `created_by`, `staff_id`, or `ea_user_id` |

Tests: `__tests__/offlineSyncAuthGate.test.js`, `__tests__/requeueTerminalRlsFailures.test.js`, and `__tests__/OfflineContext.test.js`.

## Table Contract Map

| Table | Producer | Local required fields | Sync operation | RLS authority / SELECT dependency | Ordering / dependencies | Tests and probes |
| --- | --- | --- | --- | --- | --- | --- |
| `time_entries` | `timeEntriesRepository` | `id`, `user_id` | Batched upsert (onConflict=id) with per-record fallback on batch failure | Self-scoped by `user_id = auth.uid()` | No domain dependencies | `offlineSyncOutbox.test.js` time-entry sync coverage; `timeEntriesRepository.test.js` (integration tier, Item 8); `useTimeTracking.integration.test.js` (clock-in vertical through the real path, Item 8); `forceStopReopenOutbox.test.js` (force-stop close+reopen persistence, Item 8) |
| `classes` | `classesRepository.saveClass`; `classOnboardingRepository.start` transaction wrapper for locally onboarded classes | `id`, `created_by`, active `programme_id` for local class EA assignment. The onboarding wrapper adds only a user-scoped local-state marker in the same SQLite transaction; it does not change the server payload. | Default upsert | `classes_select_created_by`; `private.current_user_can_access_class` / `private.current_user_can_write_for_class` | Before `children`, `class_ea_assignments`, grouping rows, sessions with `class_id` | `classesRepository.test.js`; `classOnboardingRepository.test.js` atomic create, rollback, and restart marker coverage; `sqlitePlan1Migrations.test.js` creator SELECT coverage |
| `class_ea_assignments` | `classesRepository.saveClass`; `classEaAssignmentsRepository`; Classes pull persistence and reconcile | `class_id`, `ea_user_id`, `programme_id`, `created_by` | Consecutive inserts batch with insert-or-ignore; archive/update remains per-record and update-capable; direct pull scope persists and reconciles synced absentees | EA self assignment and class access; identity trigger blocks reassignment by update | Insert after `classes`; archive after dependent child/class cleanup rows | `junctionRepositoryGuards.test.js`; `offlineSyncOutbox.test.js` immutable assignment batching and lifecycle exclusion; `pullReconcile.integration.test.js`; `pullReconcileOffline.integration.test.js` |
| `children` | `childrenRepository.saveChildRecord`; `childrenRepository.updateChild`; `literacySessionPersistence` current-reading-level update; Children pull persistence | `id`, `created_by`; active programme and academic year when local save creates relationship rows. `reading_level` is nullable current child state. Literacy session submission updates it only for actual attendees whose selected level differs from the stored value, while the session keeps its own historical snapshot in `sessions.activities.child_reading_levels`. | Batched upsert (onConflict=id) for insert/update with bounded per-record fallback; hard delete via RPC only and never enters the batch path. `reading_level` is included in the explicit server payload allowlist. Pull hydration consults owner-scoped pending, failed, and in-flight `hard_delete` outbox ids and suppresses matching child, EA assignment, programme enrollment, and class membership rows before persistence. Entity absence never archives the local row. | `children_select_created_by`; `private.current_user_can_read_child` / write helper | After `classes` only when `class_id` is present; before child relationship rows | `childrenRepository.test.js`; `literacySessionPersistence.test.js` (real SQLite, changed-only update and attendee boundary); `offlineSyncOutbox.test.js` batch, fallback, and record-scoped dependency coverage; `offlineSync.stripping.test.js`; `EditChildScreen.test.js`; `ChildrenContext.test.js`; `ChildrenContextPendingDelete.integration.test.js`; `pullReconcile.integration.test.js`; `pullReconcileOffline.integration.test.js`; `syncOutboxRepository.test.js`; `sqlitePlan1Migrations.test.js`; authenticated live RLS reading-level round-trip probe |
| `child_ea_assignments` | `childrenRepository` relationship producer | `user_id`, `child_id`, `created_by` | Consecutive inserts batch with insert-or-ignore; archive/update remains per-record and update-capable | Self assignment; insert helper for locally-created child; identity trigger blocks reassignment by update | Insert after `children`; archive after child programme/class/group cleanup | `childrenRepository.test.js`; `offlineSyncOutbox.test.js` immutable assignment batching and lifecycle exclusion; `junctionRepositoryGuards.test.js` patterns |
| `child_programme_enrollments` | `childrenRepository` relationship producer | `child_id`, `programme_id`, `created_by` | Batched upsert (onConflict=id) for insert/update with bounded per-record fallback. Full payloads are normalized to the deterministic `(child_id, programme_id)` id before batching. Archive remains a per-record update-capable upsert. | Active child write access plus active programme | Insert after `children` and child EA access evidence; archive before ending child EA assignment | `childrenRepository.test.js`; `offlineSyncOutbox.test.js` deterministic-id batching and archive ordering |
| `child_class_memberships` | `childrenRepository` (incl. `updateChild` class-change reassignment); `childClassMembershipsRepository` | `child_id`, `class_id`, `academic_year_id`, `created_by` | Default upsert; on a class change the new membership is inserted (`insert` op) and the old active one is exited. If the old membership's original insert has already synced it is archived (`exited_at`, `archive` op); if that insert is still pending in `sync_outbox` (offline create→reassign before first sync) the reassignment **coalesces** by rewriting the pending insert to carry `exited_at` instead of queuing an archive (#35 P1) | Active child write access plus class access | Insert after `children` and `classes`; archive before ending child/class EA assignment. Membership archives sort **before** inserts (`ARCHIVE_PUSH_ORDER` 4 < `PUSH_ORDER` 5), so archiving a still-pending insert would reorder ahead of the stale active insert and recreate the old membership active — hence the unsynced case coalesces in place rather than archiving (same `updateChild` txn, #35) | `junctionRepositoryGuards.test.js`; `childrenRepository.test.js`; `childClassReassignment.test.js` (synced-archive, offline-coalesce, and end-to-end sync against a real-schema server) |
| `grouping_versions` | grouping repositories / class grouping flows | `class_id`, `academic_year_id`, `created_by` | Default upsert | Class write/access policy | After `classes`; before `class_grouping_state` and groups that reference a grouping version | `sqlitePlan1Migrations.test.js`; grouping repository tests |
| `class_grouping_state` | class grouping state repository | `class_id`, `academic_year_id` | Default upsert | Class write/access policy | After `classes` and `grouping_versions` when `active_grouping_version_id` is present | `offlineSyncOutbox.test.js` dependency coverage |
| `groups` | `groupsRepository.saveGroup`; `ChildrenContext.addGroup`; Children pull persistence | `id`, `name`, `programme_id`, `created_by`; `class_id` when class-scoped | Default upsert. Pulled tombstones persist, while entity absence never archives the local row. `getGroups` is assignment-scoped through an active `group_ea_assignments` join. | `groups_select_created_by`; group access helper via class/group EA assignment | After `classes` when `class_id` exists; before `group_ea_assignments` and memberships | `offlineSyncOutbox.test.js`; `pullReconcile.integration.test.js`; `pullReconcileOffline.integration.test.js`; `ChildrenContextPull.integration.test.js`; `sqlitePlan1Migrations.test.js`; live rollback group probes |
| `group_ea_assignments` | `groupsRepository.saveGroup`; `groupEaAssignmentsRepository`; Children pull persistence and reconcile | `group_id`, `ea_user_id`, `programme_id`, `created_by` | Consecutive inserts batch with insert-or-ignore; archive/update remains per-record and update-capable; full embedded server rows are pulled, persisted, and reconciled by acknowledged group ids | EA self assignment and group ownership/access; identity trigger blocks reassignment by update | Pull persistence follows `groups`; insert after `groups`; archive after `child_group_memberships` cleanup | `offlineSyncOutbox.test.js` immutable assignment batching, lifecycle exclusion, and group archive ordering; `pullReconcile.integration.test.js`; `pullReconcileOffline.integration.test.js`; `ChildrenContextPull.integration.test.js` |
| `child_group_memberships` | `groupsRepository.addChildToGroup` | `child_id`, `group_id`, `grouping_version_id`, `created_by` | Default upsert | Active child write access plus group write/access | After `children`, `groups`, and group EA access evidence; archive before ending group EA assignment | `offlineSyncOutbox.test.js`; group ownership repair tests |
| `sessions` | `sessionsRepository.saveSession` | `user_id`, `programme_id` | Default upsert | Direct `user_id = auth.uid()` SELECT fallback plus session read/write helpers | Before `session_attendees`; after `classes` only when `class_id` exists | `sessionsRepository.test.js`; `offlineSyncOutbox.test.js` session-before-attendees lock; `sqlitePlan1Migrations.test.js` |
| `session_attendees` | `sessionsRepository.saveSession` | `session_id`, `child_id`, `attendance_status` | Batched upsert (onConflict=id) with per-record fallback on batch failure | Parent session ownership plus active child/group/class access | After `sessions`, `children`, and `groups` when `group_id` exists | `sessionsRepository.test.js`; `offlineSyncOutbox.test.js` |
| `assessments` | `assessmentsRepository.saveAssessment` | `user_id`, `child_id`, `programme_id` | Default upsert | Direct owner plus `private.current_user_can_read_child`; writes require active child/programme access | After `children`; before `assessment_items` | `assessmentsRepository.test.js`; `sqlitePlan1Migrations.test.js`; `captureModeMigration.test.js` (nullable `capture_mode` — see note below) |
| `assessment_items` | `assessmentsRepository.saveAssessment` item producer | `assessment_id`, `item_key`, `position` / generated UUID `id` | Batched upsert with per-record fallback | Parent assessment visibility/write access | After `assessments` | `offlineSyncOutbox.test.js` batch and fallback coverage |
| `letter_mastery` | `masteryRepository.saveLetterMasteryRecord` | `user_id`, `child_id`, `programme_id`, `letter`, `language`, `source` | Batched upsert (onConflict=id) with per-record fallback on batch failure. **Prevention, not reconciliation.** New rows get a **deterministic logical-key id** (`letterMasteryDomainId`), and `buildSyncPayload` maps **every** `letter_mastery` push to that id (so a pre-fix random local id on an OTA-updated device still lands on the canonical server row). Same record → same id on every device/install → insert-by-id is idempotent and the `23505` collision is **impossible by construction** (no runtime adoption). `saveLetterMasteryRecord` returns the canonical id so callers (`LetterTrackerScreen`) track the persisted row; `LetterTrackerScreen` also toggles off by logical key (defensive). A soft-delete/edit on a row whose `insert` is still queued **coalesces** into that pending insert (rewrites it) instead of a separate `archive`/`update` that could sort ahead of it (the #35 ordering hazard); once synced, soft-delete uses an `archive` op. **Mandatory deploy gates:** (1) legacy random-id `letter_mastery` rows on staging MUST be cleaned before the deterministic build ships (else a deterministic push 23505-collides with them — codified by the REGRESSION GUARD test); (2) the rollout must ensure no active old build still writes random-id rows. Local `record_id` may stay device-local for pre-fix rows — only the **push identity** is canonical (same pattern as `session_attendees`/`assessment_items`). | Direct owner plus `private.current_user_can_read_child`; writes require active child/programme access | After `children` | `masteryRepository.test.js`; `letterMasterySync.test.js`; `sqlitePlan1Migrations.test.js`; `offlineSyncOutbox.test.js` batch coverage |

> **`sessions` forward-prep columns (not yet in the push payload, RLS-guarded to defaults).** SQLite migration v3 (`sessions_forward_prep_columns`) and Supabase migration `20260529214500_masi_sessions_forward_prep_columns` add `sessions.group_id` (nullable FK to `groups`) and `sessions.state` (NOT NULL DEFAULT `'completed'`, CHECK on `completed|in_progress|paused|discarded`). These are schema-only for go-live: `sessionsRepository.saveSession` does **not** write them and they are **not** in the session push allowlist (`SERVER_COLUMNS`), so the `sessions` producer fields, upsert shape, and outbox ordering above are unchanged.
>
> Because the existing permissive session policies (`sessions_insert_active_programme`, `sessions_update_own`) only validate `user_id`/active programme — not these columns — the Supabase migration also adds two **RESTRICTIVE** guard policies (`sessions_forward_prep_pin_defaults_insert` / `_update`) that pin `state = 'completed' AND group_id IS NULL` at the write boundary. This prevents a direct/raw client from writing a non-default state or an unauthorized group before the feature exists. Submit-and-go writes (which omit both columns) pass the guard via the server defaults.
>
> The later state-machine slice must, in one migration applied **before** wiring client writes: drop both guard policies, add real per-state/per-group authorization, add the columns to the producer set and the push allowlist. Writing a column the server lacks would `PGRST204`, so the Supabase migration must land before the client begins sending these fields.

> **`assessments.capture_mode` (additive, nullable, IN the push payload).** SQLite migration v4 (`assessments_capture_mode`) adds a nullable `capture_mode` TEXT column (with a `IS NULL OR IN ('grid','sequential')` CHECK where SQLite supports it on `ADD COLUMN`); Supabase migration `20260618120000_masi_assessments_capture_mode` adds the same column + a named CHECK constraint + an index. **No DB default** — `NULL` = legacy/grid captured before the column existed (a default would mislabel grid rows written by older field apps and corrupt the capture-mode A/B). Unlike the `sessions` forward-prep columns above, this column **is** written by the producer and **is** in the push allowlist: `saveAssessment` stamps the client-resolved mode, and it joins both `ASSESSMENT_COLUMNS` (local persist) and `SERVER_COLUMNS.assessments` (push). RLS authority, SELECT visibility, and outbox ordering are **unchanged** (additive column, no policy change). The per-attempt `correction_count` is **not** a column — it rides in the existing `__summary__` `assessment_items.metadata` JSON via `buildSummary`. Backwards-compat: older field apps that omit `capture_mode` upsert fine (nullable, no default); the Supabase migration must land before the new app ships (`PGRST204` otherwise). Tests: `__tests__/captureModeMigration.test.js` (real-SQLite migration + persistence + CHECK + `SERVER_COLUMNS` push-allowlist pin).

## Future RLS Audit Checklist

Use this checklist instead of a static "does the table have policies" audit.

1. Identify the exact repository producer and confirm it writes all RLS-required fields before enqueue.
2. Identify the exact Supabase call shape: default upsert, batched upsert, insert-or-ignore assignment retry, archive/update, delete, or RPC.
3. For every upserted table, prove SELECT visibility exists for the row at the moment it is pushed.
4. For rows that create future access evidence, verify the parent row has direct owner visibility until the evidence row syncs.
5. For relationship rows that end access, verify archive ordering keeps the access-granting row active until dependent cleanup rows sync.
6. For immutable assignment tables, verify insert retry cannot run an identity-changing update.
7. Confirm `SERVER_COLUMNS` includes every server-required writable column and strips every local-only screen/cache field.
8. Add or update a behavior test at the producer or sync-engine boundary.
9. Add or update a migration/static test for policy names or trigger invariants when RLS changes.
10. Run a live rollback probe for high-risk RLS changes before field builds.

## Current Accepted Advisor Warnings

| Warning | Status | Reason |
| --- | --- | --- |
| `multiple_permissive_policies` on `children`, `classes`, `groups` SELECT | Accepted for current SQLite backend | Direct creator SELECT fallback is required by mobile upsert visibility before relationship rows sync. |
| `auth_leaked_password_protection` | Product / Supabase project setting | Hosted Auth setting, not an app-code or migration correctness failure. Decide before broader external field rollout. |

## Source Files to Review Together

- `src/services/offlineSync.js`
- `src/db/repositories/domainRepositoryUtils.js`
- `src/db/repositories/childrenRepository.js`
- `src/db/repositories/classesRepository.js`
- `src/db/repositories/classOnboardingRepository.js`
- `src/db/repositories/groupsRepository.js`
- `src/db/repositories/sessionsRepository.js`
- `src/db/repositories/assessmentsRepository.js`
- `src/db/repositories/masteryRepository.js`
- `supabase/migrations/20260522103000_masi_session_upsert_visibility.sql`
- `supabase/migrations/20260525231506_masi_rls_contract_cleanup.sql`
- `supabase/migrations/20260526151352_creator_select_upsert_visibility.sql`
- `__tests__/offlineSyncOutbox.test.js`
- `__tests__/sqlitePlan1Migrations.test.js`
- `__tests__/childrenRepository.test.js`
- `__tests__/classesRepository.test.js`
- `__tests__/sessionsRepository.test.js`
- `__tests__/assessmentsRepository.test.js`
- `__tests__/masteryRepository.test.js`
- `__tests__/junctionRepositoryGuards.test.js`

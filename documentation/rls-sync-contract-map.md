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
- Durable queue: `sync_outbox`; local-only `owner_user_id` is never included in server payloads. Every enqueue stamps the signed-in EA from the connection-to-actor WeakMap, including transaction facades. Record provenance (`created_by`, domain `user_id`) never determines the mutation owner. Missing actors fail before the outbox write; SQLite v12 (`sync_outbox_owner_required`) also rejects raw inserts with a NULL owner. Existing rows and indexes are preserved. Owner-scoped readiness, pending hard-delete, and reset queries use strict equality and exclude NULL owners; omitting the owner scope remains file-wide. `getSyncStatus()` always counts the whole file. `countUnsent()` returns `{ total, byTable }` across `pending`, `failed`, `in_flight`, and `terminal`, including foreign/NULL-owned work so it cannot disappear from status.
- Server payload allowlist: `SERVER_COLUMNS` in `src/services/offlineSync.js`
- Insert order: `PUSH_ORDER` in `src/services/offlineSync.js`
- Archive order: `ARCHIVE_PUSH_ORDER` plus `ARCHIVE_TABLE_DEPENDENCIES` in `src/services/offlineSync.js`

## Pre-Live History Authorization — Hosted Session Gate Passed; Assessment Gate Open

Read-only Gate 0 inspection on 2026-08-27 verified the live policies and helper bodies on
`segygjzpujphwvrubusm`. Jim accepted the complete session aggregate on 2026-08-29. The following
two migrations were behavior-proven in disposable PostgreSQL, applied through the canonical
Supabase migration path on 2026-09-04, and then behavior-proven against hosted PostgreSQL and real
PostgREST:

- `20260828004500_history_session_authorization_scope.sql` replaces the general child projection
  with direct delivery-history authority for session parents and makes attendee visibility follow
  the authorized parent aggregate.
- `20260828010000_delivery_history_session_page.sql` adds a bounded
  `get_delivery_history_session_page` RPC and an owner/Programme/keyset index intended to support
  its owner branch.

**CAP-004 (applied to hosted `masi-app-sqlite` on 2026-09-26; hosted gate passed).** `20260925120000_session_history_family_delta.sql` has four parts:
- it makes the server own the session-family timestamp. The `sessions` and `session_attendees`
  `updated_at` triggers become `before insert or update`, and `private.touch_session_family()`
  re-stamps the parent on any attendee write;
- it replaces the date-ordered RPC with `get_delivery_history_page` and
  `get_delivery_history_attendee_page`;
- it normalizes any existing future `updated_at`;
- it drops `get_delivery_history_session_page` and its index.

It passed the disposable PostgreSQL 17 harness (six-actor matrices, keyset, overlap, triggers, and
dense-plan gates) and, after the canonical isolated-helper apply, the hosted gate:
- ledger at 24, with triggers `before insert or update`;
- a rollback-only six-actor matrix for both RPCs with zero residue, including insert stamping of a
  2001 phone timestamp to 2026;
- an authenticated PostgREST walk of 1,205 attendees in seven 200-row pages, with no duplicates and
  microsecond `updated_at` strings;
- anonymous callers denied (HTTP 401 / `42501`);
- zero fixture residue.

| Family | Current live SELECT authority | Accepted target | Required before inbound hydration |
|---|---|---|---|
| `sessions` / `session_attendees` | Capturer-or-historical-direct-delivery only. `private.can_read_session` grants the owner or an actor with any historical `child_ea_assignments` row for an attendee; attendee visibility follows the authorized parent. Class-only, group-only, and unrelated actors are denied | Same as live: one qualifying attendee grants the complete parent-and-attendee aggregate | **Built (CAP-004 branch):** bounded parent and attendee paging, deadlines, atomic SQLite publication, re-walk convergence. **Hosted gate passed 2026-09-26. Remaining:** device and two-device gates |
| `assessments` / `assessment_items` | Owner or the same general child-read helper | Current-academic-year class scope, including co-EA/turnover assessment history | Add an assessment-specific class/year predicate; do not expose arbitrary prior-year history |

### Session aggregate boundary — accepted 2026-08-29

A session is one indivisible delivery-history aggregate. Direct ownership, or a historical direct
delivery assignment to any attendee, grants the whole `sessions` parent and every related
`session_attendees` row. The authorized reader therefore receives coattendee `child_id`, `group_id`,
attendance status, grade snapshot, notes, and all child-keyed facts in `sessions.activities`. This
is a deliberate admission boundary, not an accidental over-read: a child-filtered attendee list
would misrepresent the delivery event while the parent JSON still disclosed all-child facts.

The containment rule is equally important. A future fact that truly needs per-child restricted
visibility must not be added to this aggregate and assumed private. It needs a separate table or
redacted projection with its own positive authorization and hydration-completeness contract. Revisit
the aggregate only if Masi introduces a less-trusted reader class or genuinely sensitive per-child
data whose visibility cannot follow admission to the delivery event.

This is not merely documentation wording. A live authenticated Programme-scoped session plan over
25 rows took 8.985 ms and 886 shared-buffer hits; five non-owned candidates caused 875 helper hits.
The owner-constrained plan returned 20 rows in 0.819 ms with 13 buffer hits. On disposable
PostgreSQL, the corrected raw RLS query over a deliberately hostile 2,000-session fixture reported
2,003 rows removed across visible plan filters. That metric can include ordinary predicates and join
filters as well as RLS; it is a regression signal, not attribution of every removal to authorization.
Its root plan reported 14,311 shared blocks and 122.271 ms;
the actor-derived RPC's opaque `Function Scan` root reported 803 shared blocks and 3.802 ms while
returning the same one authorized row. Root-node buffers are compared because PostgreSQL's parent
buffer counts are inclusive; summing every plan node would double-count work. This deterministic
local comparison is a regression tripwire, not a hosted latency SLO or proof that the RPC's inner
plan used a particular index. It supports deriving positive authority before keyset pagination
instead of treating an ordering index as an authorization optimization. See
[`pre-live-gate0-audit-2026-08-27.md`](./pre-live-gate0-audit-2026-08-27.md).

Before a mobile session-history pull can ship:

- page parents and attendees independently with bounded requests and request deadlines;
- publish a family only after the parent and its complete attendee set are durable in SQLite;
- withhold completeness and successful-pull metadata after any timeout, error, truncation, or
  partial family;
- preserve the raw PostgreSQL `created_at` cursor string instead of round-tripping it through a
  millisecond-only JavaScript `Date`;
- prove cold-open/reconnect behavior and populated two-device convergence before field release;
- do not treat the assessment policy's class arm as current-year bounded;
- ordinary empty/short RLS queries remain non-authoritative for deletion.

## Global Contracts

1. Domain writes are local-first. A user-facing write must persist the domain row and enqueue the matching `sync_outbox` row in the same SQLite transaction.
2. RLS-required ownership and relationship columns must be present before enqueue. Missing values should fail locally through repository guards, not hours later as terminal sync failures.
3. Mobile inserts and create-or-update upserts require SELECT visibility. Supabase/PostgREST upsert checks row visibility while resolving conflicts, so policies must account for the exact operation shape, not only `INSERT WITH CHECK`. Edits to `time_entries` and every table in `ARCHIVE_SERVER_COLUMNS`, plus lifecycle archives and restores, are acknowledged UPDATEs rather than upserts. Ordinary edits exclude the table's lifecycle fields; `letter_mastery.deleted_at` is the explicit reactivation exception. See Operation Semantics.
4. Parent rows that create later access evidence need direct owner SELECT fallback. This is why `children`, `classes`, `groups`, and `sessions` keep direct creator/user visibility in addition to relationship-derived policies.
5. Relationship tables that grant access are not generic mutable rows. `child_ea_assignments`, `class_ea_assignments`, and `group_ea_assignments` have immutable identity columns protected by database triggers. Insert retries must not become identity-changing updates.
6. Insert and archive ordering differ. Insert can create access evidence early; archive must keep access-granting assignment rows alive until protected cleanup rows have synced.
7. Reference/admin tables are pulled from the server and are not mobile-writable through app-role DML.
8. Server pulls must not overwrite pending local rows (pending-local-wins, issue #42 / ZZ F7). See "Pull Persistence & Reconcile" below.
9. Sync auth state is part of the RLS contract (issues #43/#44). A sync pass with no Supabase session must return a structured skip (`{ success: true, skippedNoSession: true }`) before touching the outbox or sync metadata. A terminal `42501` recorded while a live session exists must store `last_error` with the `42501-authenticated:` prefix and must never be auto-healed. Unmarked RLS-terminal rows are treated as auth-loss collateral: when auth is restored through `SIGNED_IN`, `TOKEN_REFRESHED`, or sessionful `INITIAL_SESSION`, the engine requeues only rows owned by the signed-in user, and the outbox requeue plus domain `sync_status = 'pending'` reset happen in one SQLite transaction. See "Auth-Restore RLS Heal" below.
10. Error classification is local-state-only and bounded for the classes it models (issue #48 plus audit finding #6). `23514` from the immutable-assignment identity triggers (`child_ea_assignments`, `class_ea_assignments`, `group_ea_assignments`) is immediately terminal with reason `Immutable identity or check constraint rejected the update (23514)`; inserts already avoid it via `ignoreDuplicates`, and archive patches are now lifecycle-only, so this remains a guard for other update-like paths or server check drift. `23503` is retriable while the FK parent has a `pending`/`failed`/`in_flight` `sync_outbox` row (`hasPendingRecord`), terminal otherwise. `42501` is retriable while the FK parent OR an RLS assignment grant is pending locally, terminal otherwise. Grant evidence covers a direct active, unsynced `child_ea_assignments`/`class_ea_assignments`/`group_ea_assignments` row for the record's subject and the membership-mediated child arms of `private.current_user_can_write_for_child`: an active class/group membership joined to its active assignment counts while either half is `pending`/`failed`/`in_flight`, provided neither half is terminal. The `child_class_memberships` or `child_group_memberships` row currently being inserted is excluded from this query because an INSERT cannot grant its own prerequisite authority; a different pending membership path still counts. `computeEvidencePending` resolves the runtime connection once through `resolveDatabase`, then uses that resolved handle for domain-row, direct-assignment, and membership-mediated reads, including the production engine where no database is injected. Subject and FK values resolve from the outbox payload first and the record's own local domain row second, so archive/update payloads still yield evidence. `UPDATE_NOT_APPLIED` uses the same grant evidence and is also retriable while the record's exact insert operation remains owed (`hasPendingOperation`); it is terminal when none of those evidence paths is pending. The `42501` no-session downgrade (Item 9) still applies to an otherwise-terminal `42501`. The deterministic class `PGRST204`, `42703`, `22P02`, `23502`, and non-immutable-table `23514` is retriable for attempts 1 through 7; attempt 8 becomes terminal with `retry_count = 8` and a `deterministic:` reason. `ARCHIVE_NOT_APPLIED` is terminal immediately because the server did not return the one exact updated id required to finalize the lifecycle transition. Codeless network/timeout errors remain retriable without an attempt cap. Force "Sync Now" includes terminal rows, so a repaired server condition can resurrect and finalize them. See "Error Classification" below.
11. Active-pair identity is collision-proof by construction (issue #47). The four active-pair tables whose identity IS their server partial-unique key -- `child_ea_assignments` `(user_id, child_id)`, `child_programme_enrollments` `(child_id, programme_id)`, `class_ea_assignments` `(class_id, ea_user_id, programme_id)`, `group_ea_assignments` `(group_id)` -- use a deterministic UUIDv5 id keyed EXACTLY on those columns (local mint in the repository create path plus a force-remap on insert/update/restore push in `buildSyncPayload`, gated on all key columns). Archive operations never remap identity: they scope a lifecycle-only update by the outbox record id. Every writer (device or the future head-office seed) that means the same active pair derives the same id, so a would-be partial-index `23505` becomes an idempotent id-match. `child_class_memberships` cannot use this (it recurs on class moves and needs distinct archived rows for `deleteIfNoHistory` audit), so it uses reconcile-before-upsert: before an insert, a pre-push server read archives a conflicting active `(child_id, academic_year_id)` row (device-move-wins, audit-preserving), with a conservative fallback to the normal upsert on any error. See "Active-Pair Collision-Proofing" below.
12. Grouping-flow collision-proofing is partial and mostly deferred (issue #46). `class_grouping_state` is a one-row-per-`(class_id, academic_year_id)` singleton, so it uses a deterministic id `f(class_id, academic_year_id)` (local mint + push-remap), same shape as Item 11. `grouping_versions` (generational -- needs an activate-new/deactivate-old reconcile) and `groups.display_number` (a partial-unique sequence never populated today) are NOT built: their collision-proofing is inseparable from the grouping/regrouping workflow, which is deferred to next year (CONTEXT.md:161, ADR-0001). Their write paths do not exist yet, so nothing collides today. See "Grouping-Flow Collision-Proofing" below.
13. An outbox row's `created_at` is queue identity, not mutation time. Re-enqueueing the same `(table_name, record_id, operation)` refreshes its payload, owner, retry fields, status, and `updated_at`, but preserves its first `created_at`. Lifecycle intents are the deliberate identity exception: archive and restore share `<table>:<record>:lifecycle`, so the operation itself can change while the stream keeps its original `created_at`. Push ordering therefore remains fair when one record is edited repeatedly. Batch claiming is set-based: one local UPDATE assigns a shared in-flight timestamp, one SELECT returns the fresh records in input order, and finalization still compares each returned `updated_at` before deleting or failing the row.
14. The concurrency-1 Supabase queue serializes requests, not workflows. A dependent domain pull keeps its query order but acquires one queue lease per RPC or query. No child/class preload may wrap its entire multi-request workflow in one `enqueueSupabaseRequest`. This lets a waiting auth, profile, lookup, or push request run between responses without allowing simultaneous Supabase operations.

## Operation Semantics

| Operation shape | Tables | Server call | RLS implication |
| --- | --- | --- | --- |
| Default outbox push | Most synced domain tables | `upsert(payload, { onConflict: 'id' })` | Needs both write permission and SELECT visibility for upsert. |
| Acknowledged edit | `time_entries` and every table in `ARCHIVE_SERVER_COLUMNS` when `operation === 'update'` | `update(editPatch).eq('id', serverId).select('id')`, where `serverId` is the payload id after `buildSyncPayload` (the re-derived deterministic id for `letter_mastery`), falling back to `record_id`. `editPatch` excludes `id`, `created_by`, `created_at`, `user_id`, and `archived_by_user_id`, plus the table's archive/restore columns. `letter_mastery.deleted_at` remains writable because reactivation uses update; see the exceptions below. Success requires exactly the requested id; zero or ambiguous acknowledgments fail as `UPDATE_NOT_APPLIED`. An edit is deferred, not failed, while its own `insert` is still owed (pending, failed, or in flight). | Exercises UPDATE policy without asking for INSERT permission: PostgreSQL applies INSERT `WITH CHECK` to every upsert row, even a conflicting one, so these edits never go as upserts. S1 (`npm run verify:upload-contract:postgres`) proved the original five-table permission contract; the additional lifecycle-table routing has real-SQLite/synthetic-server regression coverage, not new PostgreSQL or hosted evidence. `class_grouping_state` is the exception and stays an upsert, because its `update` means create-or-update and its INSERT policy is authorization-based. A zero-row result stays retriable only while the row's own insert or a direct/membership-mediated authorization grant is still owed locally; otherwise it is terminal. |
| Lifecycle archive | `classes`, `children`, assignment/enrollment/membership tables, `grouping_versions`, `groups`, `letter_mastery` | `update(lifecyclePatch).eq('id', recordId).select('id')`. `ARCHIVE_SERVER_COLUMNS` narrows even a legacy full-snapshot outbox row to its table's lifecycle fields. Success requires exactly the requested id in the returned rows; zero or ambiguous acknowledgments fail terminal as `ARCHIVE_NOT_APPLIED`. | Exercises UPDATE policy only. It must never create a missing row, run INSERT `WITH CHECK` on a partial payload, rewrite identity columns, or claim success without an exact server acknowledgment. |
| Lifecycle restore | `group_ea_assignments` (reactivation in `groupsRepository.createMissingGroupAssignment` and `groupEaAssignmentsRepository.save`); the engine accepts `restore` for any table in `ARCHIVE_SERVER_COLUMNS` | The same lifecycle UPDATE as an archive, with the same `ARCHIVE_SERVER_COLUMNS` allowlist (for `group_ea_assignments`: `{ unassigned_at: null, handover_reason: null }`). Zero or ambiguous acknowledgments fail terminal as `RESTORE_NOT_APPLIED`. Pushed at the table's `ARCHIVE_PUSH_ORDER` position, which still precedes dependent inserts (`group_ea_assignments` 6, `child_group_memberships` inserts 11). | Archive and restore share one outbox slot per record: `<table>:<record>:lifecycle`; the slot's `operation` and payload are the latest intent. Replacing even an in-flight slot resets it to pending and changes `updated_at`, so the stale request's success, retriable-failure, or terminal-failure finalizer misses its compare-and-swap and `restorePendingAfterStaleFinalize` preserves the replacement. Reactivation always queues restore and, when its insert is still owed, also re-queues that active insert payload; lifecycle UPDATEs wait for their own owed insert. Enqueue deletes pending/failed/terminal legacy `:archive` and `:restore` rows. A legacy row already in flight is left to settle, and the slot waits while a legacy per-operation row remains pending, failed, or in flight, so an older intent cannot run after the slot. Residual out-of-scope risk: an older request that times out locally but commits on the server only after a later request is network reordering, owned by the upload-contract spec. |
| Batched upsert | `assessment_items`, `session_attendees`, plus insert operations for `child_programme_enrollments`, `children`, `letter_mastery`, and `time_entries` (the three assignment tables batch their inserts too; see the next row) | `upsert(payloads, { onConflict: 'id' })` in batches of at most 100. A returned or thrown batch failure may spend at most 25 per-record fallback attempts across the entire pass, with concurrency at most five. | Parent row (`assessments` / `children` / `sessions`) must be visible/writable first for tables with parent FKs. Unattempted fallback rows return to pending without failure or retry inflation. `children` has no pre-push hook. Enrollment payloads are normalized to deterministic active-pair ids before array dispatch. Update operations for `time_entries` and every lifecycle-bearing table never enter a batch. In particular, enrollment updates cannot share a batch with inserts and replay `ended_at`. |
| Immutable assignment insert push | `child_ea_assignments`, `class_ea_assignments`, `group_ea_assignments` when `operation === 'insert'` | One ready row uses `upsert(payload, { onConflict: 'id', ignoreDuplicates: true })`; consecutive ready rows use the same operation with `payloads`, bounded batch size, and bounded per-record fallback. | Duplicate insert retry must be insert-or-ignore, not update-capable upsert, because identity triggers reject changed identity/timestamp columns. Full payloads are normalized to deterministic active-pair ids before dispatch. |
| Assignment archive/update | Same assignment tables | Archive and restore use the lifecycle-update contracts above; ordinary updates use acknowledged UPDATE by id with lifecycle fields excluded. | Lifecycle patches can contain only `unassigned_at` / `handover_reason`; identity columns remain immutable. |
| No-history child delete | `children` hard delete | RPC `delete_child_if_no_history(p_child_id)` | Local delete eligibility comes from the queued child INSERT, never the current domain `sync_status` (which an edit resets). See the no-history deletion rules below. Direct mobile child DELETE is blocked; history rows require archive instead. `20260712202409_masi_idempotent_child_delete.sql` makes a wholly absent child return `true` before authorization, so a retry after server success and pre-finalization crash is idempotent. Present but unauthorized children still raise `42501`; history-blocked children still return `false`. The migration was applied and verified against `masi-app-sqlite` on 2026-07-12. |
| Delivery-history parent page (CAP-004) | Inbound `sessions` history (`sessionHistoryPull`) | `get_delivery_history_page(programme, window_start, page_size, after_updated_at, after_id, overlap_seconds)`; page size 1–200; overlap 0–600 s; cursor wholly null or wholly populated; **ascending `(updated_at, id)`** keyset over the server-owned family timestamp | `SECURITY DEFINER` RPC. The owner arm and the historical-delivery arm are each ordered and limited before the union, so page work is bounded by the arms, not by remaining history. Class/group/creator arms are absent. `p_programme_id` is a partition key, not a grant. The client replays `updated_at` as the raw PostgREST string, never through a `Date`, and passes a 120 s overlap only on the first page of a delta that resumes from a completed cursor. Replaces `get_delivery_history_session_page`, which the same migration drops. |
| Delivery-history attendee page (CAP-004) | Inbound `session_attendees` plus the history-reference projection | `get_delivery_history_attendee_page(session_ids[1..200], page_size, after_session_id, after_attendee_id)`; ascending `(session_id, id)` keyset | Re-derives `private.can_read_session` per requested id at call time. Returns attendee columns plus `child_first_name`, `child_last_name` and `child_preferred_name` only: the history reference projection. Nothing else from `children` crosses this boundary. |

**No-history deletion.** `childrenRepository.deleteIfNoHistory` first checks all existing
history guards. With history it returns `false` and `ChildrenContext.deleteChild` archives the
child and active relationships. With no history, a child is local-only exactly when its INSERT
outbox row is still `pending`, `failed`, or `terminal`; deletion removes the child, active
relationships, and their outbox rows without a server request. No queued INSERT means acknowledged
or pulled; an `in_flight` INSERT may already have committed with its response lost. Both cases
queue `hard_delete` through the existing history-checked RPC. Queued child updates/lifecycle
operations and writes for the removed active relationships are superseded in the same SQLite
transaction as local deletion and RPC enqueue. A retained child INSERT stays queued; hard-delete
waits until it is acknowledged, even if it later backs off or becomes terminal and needs manual
retry. A successful local deletion still returns `true`; the caller does not additionally archive.
Hard-delete enqueue uses the connection actor even after the child row is deleted; it no longer
passes the deleted row as an ownership fallback. Lifecycle enqueue uses the same actor boundary.
`outboxOwnership.js` remains for the Task 7 integrity/heal work; enqueue no longer imports
`resolvePrimaryOwner`. Local regressions: `outboxOwnerStamping.test.js` covers an EA edit to a
Head Office child through a real SQLite adapter and signed-in transaction facade, then the Plan 1
fake-server UPDATE-by-id acknowledgement. `outboxOwnerMigration.test.js` covers the v11-to-v12
upgrade with existing owned and NULL-owned rows, index preservation, and raw-insert refusal.

**Edits and lifecycle are separate operations.** At dispatch, ordinary updates exclude every
column allowed to archive/restore that table: archive metadata for classes/children/groups;
`unassigned_at` for child EA assignments; `unassigned_at` and `handover_reason` for class/group EA
assignments; `ended_at`, `exited_at`, or `removed_at` for enrollments/class memberships/group
memberships; and `status` plus archive metadata for grouping versions. Archive and restore share
`ARCHIVE_SERVER_COLUMNS`; restore has no additional columns. This applies to older full-snapshot
outbox payloads as well as new edits. All these updates use UPDATE by id, so neither a single nor
a batched upsert can replay stale lifecycle values or apply omitted-column insert defaults.
Inserts retain their existing payload and retry behavior. `class_grouping_state` has no lifecycle
columns and its create-or-update operation remains an upsert.

The deliberate exception is **`letter_mastery.deleted_at`**: once its insert is acknowledged,
`updateLetterMasteryRecord` queues deletion as `archive` and reactivation as `update` with
`deleted_at: null`; with an INSERT still queued it coalesces both into that INSERT. Stripping
`deleted_at` from a mastery update would break reactivation. Group EA assignment reactivation
already uses explicit `restore`, so its lifecycle fields are excluded from ordinary updates.

**Local session edits.** `updateSession` applies updates and `keysToRemove`, then forces
`sync_status: 'pending'`, `synced: false`, and `last_sync_error: null` before `saveSession` writes
and queues the parent plus every attendee it rewrites in one transaction. Rewritten attendee
payloads carry the same pending/unsynced/cleared-error invariant. The existing parent/attendee
upsert operation shape and the status-trusting inbound `save*` contract are unchanged.

Parent-page exhaustion is a **bounded convergence traversal**, not a transaction-wide snapshot.
Each request is a separate database statement, so concurrent inserts or updates may appear on a
later pull rather than the current traversal. Completeness is per Programme and means only that all
pages reachable through the returned raw cursor tuples succeeded before their deadlines. History
absence never deletes local history. If an immutable cross-page snapshot becomes a product
requirement, add an explicit high-watermark/snapshot contract rather than implying one from keyset
pagination.

`p_programme_id` is a partition key for that traversal, not an additional authorization grant.
This preserves the locked trusted-field-staff contract: RLS permits same-child cross-Programme
history reads, while the app scopes ordinary display and hydration to Programme and writes remain
active-Programme-scoped. An actor whose authorized history spans multiple Programmes needs one
complete traversal per Programme. If Masi later introduces less-trusted account classes or strict
Programme confinement, that restriction belongs in the row policy and RPC together—not only in
the RPC, where direct table reads could bypass it.

### Same-pass dependency gating

Push order is necessary but not sufficient: when one row fails, only rows that depend on that exact record should wait. The sync engine tracks failed and dependency-skipped records as `{ table_name, record_id }`, not as a set of failed tables. Normal parent edges use `PARENT_FK_COLUMNS` to compare the dependent's FK with the failed parent's `record_id`. Archive ordering uses `ARCHIVE_DEPENDENCY_SUBJECT_COLUMNS` to compare the shared `child_id`, `class_id`, or `group_id`, so an access-ending assignment waits for failed cleanup about the same subject only. Fields come from the outbox payload first and the durable SQLite domain row second because lifecycle payloads are intentionally partial.

A matching dependent stays pending and its table result records both `skippedDependency` and `skippedDependencyRecordId`. The skipped record itself becomes scoped blocking evidence for later records in the same pass. Unrelated records continue, including records on the same dependent table and healthy records separated by a blocked row during batch formation. Every declared direct and inverse dependency edge has a static mapping guard. If a future edge lacks resolvable identity evidence, the engine falls back to conservative blocking rather than sending out of order.

Same-record gates apply before the relationship graph. An acknowledged edit waits while its own insert is owed, and every lifecycle row (`archive` or `restore`, for every table) does the same because a lifecycle UPDATE can acknowledge only a row that exists. A terminal insert does not block. A lifecycle row also waits while a different lifecycle operation for the same record is in flight; when that older request settles unsuccessfully, the single-record failure finalizer supersedes it instead of retaining a retry that could reverse the newer intent. Lifecycle rows are never batched, so batch finalizers are deliberately unchanged.

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

Classification is a pure decision in `classifyError` from `(code, tableName, parentEvidencePending)`, plus the per-record loop that computes `parentEvidencePending` from local state via `computeEvidencePending`. The resolver obtains the runtime SQLite connection once through `resolveDatabase`, so the production engine's undefined injected `database` uses the initialized client rather than dereferencing `undefined`. No server calls occur in the per-record failure path.

| Server error | Classification | Evidence checked |
| --- | --- | --- |
| `23514` on `child_ea_assignments` / `class_ea_assignments` / `group_ea_assignments` | Terminal, reason `Immutable identity or check constraint rejected the update (23514)` | none (neither drifted identity nor a check violation is satisfiable by re-push) |
| `23514` on any other table | Retriable (unchanged, out of #48 scope) | none |
| `23503` | Retriable while FK parent is pending in the outbox, terminal otherwise | `PARENT_FK_COLUMNS` via `hasPendingRecord` |
| `42501` (live session) | Retriable while FK parent OR direct/membership-mediated assignment grant is pending, else terminal with the `42501-authenticated:` marker | `PARENT_FK_COLUMNS` + `GRANT_SUBJECTS`; membership-mediated evidence requires an active membership/assignment pair, either half unacknowledged, neither half terminal, excluding the membership row currently being uploaded |
| `42501` (no session) | Retriable, unmarked (Item 9) | n/a |
| `UPDATE_NOT_APPLIED` | Retriable while the record's own insert OR direct/membership-mediated assignment grant is pending; terminal otherwise | exact `insert` via `hasPendingOperation` + `GRANT_SUBJECTS` |
| `ARCHIVE_NOT_APPLIED` | Terminal; the server returned no exact updated-row acknowledgment | returned id set from `update(...).select('id')` |
| `RESTORE_NOT_APPLIED` | Terminal; the server returned no exact updated-row acknowledgment for a lifecycle restore | returned id set from `update(...).select('id')` |
| `PGRST204`, `42703`, `22P02`, `23502`, non-immutable `23514` | Retriable for attempts 1-7; terminal on attempt 8 with `deterministic:` prefix and `retry_count = 8` | persisted outbox `retry_count` |
| Codeless network/timeout error | Retriable without an attempt cap | none |

Known limitations:
- Deterministic server errors (`PGRST204`, `42703`, `22P02`, `23502`, and non-immutable-table `23514`) have an 8-attempt local budget. Attempts 1-7 use the existing capped exponential backoff; attempt 8 becomes needs-attention with a `deterministic:` reason. A forced Sync Now pass includes the terminal row and can recover it after the server condition is repaired. Codeless network/timeout failures remain retriable indefinitely by design.
- `staff_programme_assignments` grants are not device-produced (never pushed), so a `42501` that needs one stays terminal, which is correct: a real programme-assignment denial.
- A parent or grant that heals through the Item 9 auth-restore after its child was already stamped terminal does not auto-rescue the child (identical to pre-#48 behavior); force "Sync Now" (`includeTerminal`) resurrects the chain.
- Non-immutable-table `23514` follows the 8-attempt deterministic budget. A CHECK violation on an immutable-assignment table (for example, `unassigned_at >= assigned_at`) remains immediately terminal and shares the identity reason label.
- Same-record ordering: `findBlockingDependency` defers an `update` for the five acknowledged-edit tables and every lifecycle operation while its own `insert` is owed; it also defers a newer lifecycle intent behind an older in-flight one. Ordering between a lifecycle row and a non-lifecycle `update` row for the same `letter_mastery` record (toggle off, on, off while offline) is not yet collapsed; the upload-contract spec owns it.
- Legacy per-operation lifecycle rows (`<table>:<record>:archive` / `:restore`) are deferred ahead of the single lifecycle slot, and deleted at enqueue when not in flight, but are not consolidated at startup. No build before `feat/upload-path-correctness` ever queued `restore`, so the only realistic legacy row is a lone `:archive`, which the deferral orders correctly. One narrow residue remains on development devices only: a legacy archive in flight during reactivation that then goes terminal, after which the slot's restore succeeds and a forced Sync Now (`includeTerminal`) replays the terminal archive. Accepted 2026-10-10 because `masi-app-sqlite` has no field users and launch is a clean install; clear development outboxes before field launch rather than ship migration code for development data.
- The membership-mediated query does not filter assignments to the signed-in EA, as `hasPendingActiveAssignment` never has. It can keep an edit retrying slightly longer, never drop one.
- Evidence is deliberately local and conservative: a membership-mediated grant counts only when the active membership and active assignment both exist locally, at least one half is unacknowledged, and neither half is terminal. A grant that exists only on the server cannot make a local zero-row result retriable.

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

**Deploy gate status and enduring rule.** The staging repair completed 2026-07-14: 26 active rows were re-keyed and zero mismatches remained; `letter_mastery` was already clean. The repair proved that "random ID" is the wrong test because all seven bad `group_ea_assignments` ids were deterministic under a superseded formula. Every import or repair must recompute today's expected id from the logical key and require exact equality. Fresh installations remain mandatory for the field cutover because pre-fix local rows can retain obsolete archive identities.

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

The hosted session-history RPC has a different intended query shape. Migration
`20260828010000_delivery_history_session_page.sql` adds
`idx_sessions_owner_programme_history_cursor (user_id, programme_id, session_date DESC,
created_at DESC, id DESC)`. Its leading owner/Programme keys are intended to serve the positive
owner branch, and the remaining tuple mirrors the descending keyset. The `UNION`-of-ids and final
join can require a re-sort, so use of the ordering tail is unproven. The direct-delivery branch starts from
`child_ea_assignments(user_id)`, reaches `session_attendees(child_id)`, and joins the session by
primary key. The disposable PostgreSQL plan gate in
`scripts/history-authorization-postgres-harness.cjs` compares root-node buffers for this
actor-derived RPC with the raw Programme/RLS shape over 2,000 unrelated fixtures and requires the
RPC root to use less than half the raw root's block work. The RPC appears only as an opaque
`Function Scan`, so this gate does not prove its inner index selection or turn local timing into a
hosted latency claim.

The 2026-09-04 hosted current-data probe returned 20 rows. Its opaque RPC root completed in
1.458 ms with 109 shared-buffer blocks; a separate `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` of the
RPC's exact inner query completed in 0.337 ms with 105 root blocks and used
`idx_child_ea_assignments_child`. PostgreSQL also chose sequential scans and a sort for parts of the
plan at this tiny estate. The current-data plan proves that the deployed query executes and exposes
its present shape; it is not a scale benchmark, a latency SLO, or proof that the
owner/Programme/cursor index's ordering tail wins at field volume. The dependent attendee query is
still unbuilt and must receive its own set-wise plan measurement before the mobile hydration slice
is considered scale-ready.

### Disposable PostgreSQL history-authorization verifier

The real-engine verifier is wired into the repository CI test workflow and can also run locally
against a localhost-only PostgreSQL admin database:

```sh
HISTORY_RLS_ADMIN_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:65433/postgres \
HISTORY_RLS_DATABASE_NAME=masi_history_rls_local \
HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE \
npm run verify:history-authorization:postgres
```

The harness rejects remote hosts, non-`postgres` admin databases, database names outside the
`masi_history_rls_` namespace, unsafe identifiers, and missing confirmation. It applies every
canonical migration to the disposable database and drops that database in `finally`. The Jest file
`historyAuthorizationPostgresHarness.test.js` proves only these safety guards; the command above is
the PostgreSQL behavior, pagination, actor-switch, privilege, and plan gate. On a stock PostgreSQL
cluster the harness idempotently creates Supabase's four compatibility roles as cluster-wide
`NOLOGIN` roles. Dropping the disposable database does not drop those roles; subsequent runs reuse
them. The workflow must be committed and complete a named remote Actions run before CI evidence is
claimed.

### Hosted session-authorization verifier — passed 2026-09-04

The canonical migration ledger initially showed exactly two pending versions,
`20260828004500` and `20260828010000`. `supabase db push --linked --dry-run` named only those two
files; the canonical linked push applied them, and both a dry-run and real rerun subsequently
reported `Remote database is up to date`.

The post-apply rollback-only actor matrix proved the accepted aggregate boundary:

- owner: one parent, both attendee rows, one owner-only parent, and four RPC parents;
- former direct-delivery EA: one parent, both attendee rows, no owner-only parent, and one RPC row;
- current direct-delivery EA: the same complete-family result as the former EA;
- class-only, group-only, and unrelated actors: zero parents, attendee rows, owner-only parents, and
  RPC rows.

The RPC and both private session helpers retain `EXECUTE` for `authenticated` and deny it to
`anon`. Authenticated PostgREST returned HTTP 200; anonymous PostgREST was denied with HTTP 401 and
PostgreSQL code `42501`. A namespaced 1,205-row HTTP fixture returned exactly 1,000 rows with
`Content-Range: 0-999/1205` and HTTP 206, proving the hosted PostgREST row cap is 1,000. All 1,205
cap rows were deleted with zero residue, and the actor fixture rolled back with zero residue.

This closes the hosted session-policy/RPC prerequisite only. It does not implement or verify the
mobile parent pager, attendee pager, request deadlines, SQLite publication, hydration completeness,
reconnect behavior, release uptake, or field behavior.

## Pull Persistence & Reconcile

A pull first persists returned server rows, then reconciles acknowledged relationship removals in SQLite. React state is never a second merge authority. `ChildrenContext` and `ClassesContext` publish the cache immediately, perform the pull, and then publish a fresh repository read after persistence and reconcile. The retired `mergeServerRows` helper and its three-way in-memory merge are gone.

A repository `update*` function (`updateTimeEntry`, `updateChild`, `updateClass`, `updateGroup`, `updateLetterMasteryRecord`) records a local edit, so it always writes `sync_status = 'pending'`, `synced = false`, and `last_sync_error = null` and enqueues the edit, whatever sync bookkeeping the caller spreads in. Only the sync engine (`setDomainSyncResult`) marks a row synced, and only pull and seed paths pass `synced: true`, through `save*` functions. Before 2026-10-15 a caller that spread a stored synced row (the clock-out) won, and the edit was never queued.

A pulled row is stamped `sync_status: 'synced'` before it reaches a repository save function. `serverPullWouldClobberPendingLocal` runs in the same transaction as the upsert and skips a server row when the local row is `pending` or `failed`. `synced` and `terminal` local rows may be replaced by an acknowledged server copy. Owner-scoped pending hard-delete ids are filtered out before child and relationship persistence. A skipped row never changes its queued outbox payload and never enqueues new work.

### Stale active-pair supersede (2026-07-22)

Deterministic active-pair ids remain the **primary** convergence contract: every writer derives the
same id for the same logical pair. But when stored ids violate that contract — a server-side re-key
(as on 2026-07-14), a superseded derivation formula, or a wrong-id seed — a pulled ACTIVE row can
carry a different id than the device's local ACTIVE row for the same pair. The id-keyed upsert then
hits the partial unique active-pair index before reconcile can run, the batch rolls back, the
per-row fallback (which never reconciles) fails identically, and every later pull repeats forever
(device-reproduced and fixed 2026-07-22; see the build log entry for stale active-pair supersede).

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

### Session history hydration (CAP-004)

- **Scope and cursor.** One `sync_state` row per EA and Programme,
  `session_history_pull:<userId>:<programmeId>`, because SQLite is shared by every EA who signs in on
  the phone. The window is the active academic year's `starts_on`; a new year resets the cursor.
- **Persistence.** Each parent page, its attendees, any history reference children, and the cursor
  commit in one transaction. Pending and failed local rows win. Absence never deletes, and history
  has no absence reconcile.
- **Convergence.** A delta over the server family timestamp, plus a full academic-year re-walk:
  - immediately when the phone has an active delivery child absent at the last completed walk (a
    handover), because a timestamp cursor watches writes, not authorization;
  - as a jittered 6–8 day backstop for the rare commit-behind-cursor case.

  The first hydration counts as a completed walk. `complete` means the delta is exhausted and no
  re-walk is due or part-way, and `last_pulled_at` is stamped only then.
- **Deadlines and budget.**
  - Each request has a 15 s deadline that starts at enqueue time, so a hung predecessor in the
    shared request queue cannot hold history.
  - The 60 s run budget admits new parent pages only; an admitted page finishes its attendee pages
    and is saved, so slow connections still progress.
- **Actor fencing.** A change of signed-in user invalidates in-flight runs. No queued request
  starts, no page commits (admission is checked at transaction entry and again after the cursor
  write), and no status publishes for a stale run.
- **Failure memory.** A failed run records `lastFailureAt` through the writer transaction, and any
  recorded failure blocks "Up to date" until a page succeeds.
- **Readers.** History, Home, the Sessions tab, and the daily goal stay "sessions I recorded". The
  session-count ranking counts every session a current child attended.

Tests: `sessionHistoryFamilyDeltaMigration.test.js`, the disposable PostgreSQL harness,
`sessionsHistoryPage.test.js`, `sessionHistoryPull.test.js`,
`sessionHistoryPullProductionRouting.test.js`, `sessionHistoryReaders.test.js`,
`sessionHistoryStatus.test.js`, `childrenHistoryReference.test.js`, and the ChildrenContext and
screen tests.

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
| `time_entries` | `timeEntriesRepository` | `id`, `user_id`; nullable `sign_in_lat`/`sign_in_lon` and `sign_out_lat`/`sign_out_lon`; nullable `sign_in_location_status`/`sign_out_location_status` | Inserts batch as upserts; edits use acknowledged UPDATE by id and are excluded from batching | Self-scoped by `user_id = auth.uid()` | No domain dependencies | `offlineSyncOutbox.test.js` time-entry sync coverage; `offlineSyncUpdateById.test.js`; `timeEntriesRepository.test.js` (integration tier, Item 8); `useTimeTracking.integration.test.js` (clock-in vertical through the real path, Item 8); `forceStopReopenOutbox.test.js` (force-stop close+reopen persistence, Item 8); `locationUnavailableClock.integration.test.js`; `timeEntryLocationMigration.test.js`; `offlineSyncUpdateById.test.js` no-location wire payload; local upload-contract PostgreSQL harness |
| `classes` | `classesRepository.saveClass`; `classOnboardingRepository.start` transaction wrapper for locally onboarded classes | `id`, `created_by`, active `programme_id` for local class EA assignment. The onboarding wrapper adds only a user-scoped local-state marker in the same SQLite transaction; it does not change the server payload. | Insert uses default upsert; edit uses acknowledged UPDATE by id; archive uses acknowledged lifecycle UPDATE by id | `classes_select_created_by`; `private.current_user_can_access_class` / `private.current_user_can_write_for_class` | Before `children`, `class_ea_assignments`, grouping rows, sessions with `class_id` | `classesRepository.test.js`; `classOnboardingRepository.test.js` atomic create, rollback, and restart marker coverage; `offlineSyncUpdateById.test.js`; `sqlitePlan1Migrations.test.js` creator SELECT coverage |
| `class_ea_assignments` | `classesRepository.saveClass`; `classEaAssignmentsRepository`; Classes pull persistence and reconcile | `class_id`, `ea_user_id`, `programme_id`, `created_by` | Consecutive inserts batch with insert-or-ignore; archive uses acknowledged lifecycle UPDATE by id and ordinary updates use acknowledged UPDATE with lifecycle columns excluded; direct pull scope persists and reconciles synced absentees | EA self assignment and class access; identity trigger blocks reassignment by update | Insert after `classes`; archive after dependent child/class cleanup rows | `junctionRepositoryGuards.test.js`; `offlineSyncOutbox.test.js` immutable assignment batching and lifecycle exclusion; `pullReconcile.integration.test.js`; `pullReconcileOffline.integration.test.js` |
| `children` | `childrenRepository.saveChildRecord`; `childrenRepository.updateChild`; `literacySessionPersistence` current-reading-level update; Children pull persistence; CAP-004 history reference rows from `saveHistoryPage` (`history_reference = 1`: identity and display name only, `synced`, never enqueued; `history_reference` is local-only and never pushed; excluded from `getChildren`/`getMyChildren`; `save`/`updateChild`/`archiveChild`/`deleteIfNoHistory` refuse them; any full-row roster save upgrades them to `0` in place) | `id`, `created_by`; active programme and academic year when local save creates relationship rows. `reading_level` is nullable current child state. Literacy session submission updates it only for actual attendees whose selected level differs from the stored value, while the session keeps its own historical snapshot in `sessions.activities.child_reading_levels`. | Inserts batch as upserts; edits use acknowledged UPDATE by id and are excluded from batching; archive uses acknowledged lifecycle UPDATE by id; hard delete uses the RPC only and never enters the batch path. `reading_level` is included in the explicit server payload allowlist. Pull hydration consults owner-scoped pending, failed, and in-flight `hard_delete` outbox ids and suppresses matching child, EA assignment, programme enrollment, and class membership rows before persistence. Entity absence never archives the local row. | `children_select_created_by`; `private.current_user_can_read_child` / write helper | After `classes` only when `class_id` is present; before child relationship rows | `childrenRepository.test.js`; `literacySessionPersistence.test.js` (real SQLite, changed-only update and attendee boundary); `offlineSyncOutbox.test.js` batch, fallback, and record-scoped dependency coverage; `offlineSyncUpdateById.test.js`; `offlineSync.stripping.test.js`; `EditChildScreen.test.js`; `ChildrenContext.test.js`; `ChildrenContextPendingDelete.integration.test.js`; `pullReconcile.integration.test.js`; `pullReconcileOffline.integration.test.js`; `syncOutboxRepository.test.js`; `sqlitePlan1Migrations.test.js`; authenticated live RLS reading-level round-trip probe |
| `child_ea_assignments` | `childrenRepository` relationship producer | `user_id`, `child_id`, `created_by` | Consecutive inserts batch with insert-or-ignore; archive uses acknowledged lifecycle UPDATE by id and ordinary updates use acknowledged UPDATE with lifecycle columns excluded | Self assignment; insert helper for locally-created child; identity trigger blocks reassignment by update | Insert after `children`; archive after child programme/class/group cleanup | `childrenRepository.test.js`; `offlineSyncOutbox.test.js` immutable assignment batching and lifecycle exclusion; `junctionRepositoryGuards.test.js` patterns |
| `child_programme_enrollments` | `childrenRepository` relationship producer | `child_id`, `programme_id`, `created_by` | Inserts batch as upserts (onConflict=id) with bounded per-record fallback. Full payloads are normalized to the deterministic `(child_id, programme_id)` id. Ordinary updates use acknowledged UPDATE by id, exclude `ended_at`, and cannot batch with inserts. Archive uses acknowledged lifecycle UPDATE by id. | Active child write access plus active programme | Insert after `children` and child EA access evidence; archive before ending child EA assignment | `childrenRepository.test.js`; `offlineSyncOutbox.test.js` deterministic-id batching and archive ordering |
| `child_class_memberships` | `childrenRepository` (incl. `updateChild` class-change reassignment); `childClassMembershipsRepository` | `child_id`, `class_id`, `academic_year_id`, `created_by` | Insert uses default upsert; archive/restore uses acknowledged lifecycle UPDATE by id; ordinary updates use acknowledged UPDATE excluding `exited_at`. On a class change the new membership is inserted (`insert` op) and the old active one is exited. If the old membership's original insert has already synced it is archived (`exited_at`, `archive` op); if that insert is still pending in `sync_outbox` (offline create→reassign before first sync) the reassignment **coalesces** by rewriting the pending insert to carry `exited_at` instead of queuing an archive (#35 P1) | Active child write access plus class access | Insert after `children` and `classes`; archive before ending child/class EA assignment. Membership archives sort **before** inserts (`ARCHIVE_PUSH_ORDER` 4 < `PUSH_ORDER` 5), so archiving a still-pending insert would reorder ahead of the stale active insert and recreate the old membership active — hence the unsynced case coalesces in place rather than archiving (same `updateChild` txn, #35) | `junctionRepositoryGuards.test.js`; `childrenRepository.test.js`; `childClassReassignment.test.js` (synced-archive, offline-coalesce, and end-to-end sync against a real-schema server) |
| `grouping_versions` | grouping repositories / class grouping flows | `class_id`, `academic_year_id`, `created_by` | Default upsert for insert; ordinary updates use acknowledged UPDATE excluding lifecycle status/archive metadata; archive uses acknowledged lifecycle UPDATE by id | Class write/access policy | After `classes`; before `class_grouping_state` and groups that reference a grouping version | `sqlitePlan1Migrations.test.js`; grouping repository tests |
| `class_grouping_state` | class grouping state repository | `class_id`, `academic_year_id` | Default upsert | Class write/access policy | After `classes` and `grouping_versions` when `active_grouping_version_id` is present | `offlineSyncOutbox.test.js` dependency coverage |
| `groups` | `groupsRepository.saveGroup`; `ChildrenContext.addGroup`; Children pull persistence | `id`, `name`, `programme_id`, `created_by`; `class_id` when class-scoped | Insert uses default upsert; edit uses acknowledged UPDATE by id; archive uses acknowledged lifecycle UPDATE by id. Pulled tombstones persist, while entity absence never archives the local row. `getGroups` is assignment-scoped through an active `group_ea_assignments` join. | `groups_select_created_by`; group access helper via class/group EA assignment | After `classes` when `class_id` exists; before `group_ea_assignments` and memberships | `offlineSyncOutbox.test.js`; `offlineSyncUpdateById.test.js`; `pullReconcile.integration.test.js`; `pullReconcileOffline.integration.test.js`; `ChildrenContextPull.integration.test.js`; `sqlitePlan1Migrations.test.js`; live rollback group probes |
| `group_ea_assignments` | `groupsRepository.saveGroup`; `groupEaAssignmentsRepository`; Children pull persistence and reconcile | `group_id`, `ea_user_id`, `programme_id`, `created_by` | Consecutive inserts batch with insert-or-ignore. Archive and reactivation (`restore`) use acknowledged lifecycle UPDATE by id and occupy the single `<table>:<record>:lifecycle` outbox slot, whose operation is the latest intent. Both repository producers use the slot; `groupEaAssignmentsRepository.save` detects reactivation from the pre-upsert local row. Reactivation always queues restore and also re-queues insert when it remains owed. In-flight replacement is protected by the existing `updated_at` stale-finalize guard; operation-keyed legacy lifecycle rows are cleaned up or ordered ahead of the slot. Full embedded server rows are pulled, persisted, and reconciled by acknowledged group ids | EA self assignment and group ownership/access; identity trigger blocks reassignment by update | Pull persistence follows `groups`; lifecycle waits for the same record's owed insert and for any still-owed legacy per-operation lifecycle row; archive otherwise follows `child_group_memberships` cleanup | `groupAssignmentLifecycle.test.js`; `offlineSyncOutbox.test.js` immutable assignment batching, lifecycle exclusion, and group archive ordering; `pullReconcile.integration.test.js`; `pullReconcileOffline.integration.test.js`; `ChildrenContextPull.integration.test.js` |
| `child_group_memberships` | `groupsRepository.addChildToGroup`; removal/archive flows in `groupsRepository` and `childrenRepository` | Insert requires `child_id`, `group_id`, `grouping_version_id`, `created_by`; archive carries `id`, `removed_at` locally and sends only `removed_at` | Insert uses default upsert. Archive uses acknowledged lifecycle UPDATE by id, avoiding the INSERT-policy check that rejects partial archive upserts. | Active child write access plus group write/access | After `children`, `groups`, and group EA access evidence; archive before ending group EA assignment | `offlineSyncOutbox.test.js` exact RLS regression, acknowledged-update guard, ordering, and group ownership repair tests |
| `sessions` | `sessionsRepository.saveSession`; inbound `sessionsRepository.saveHistoryPage` from `sessionHistoryPull` (CAP-004) | `user_id`, `programme_id` | Outbound default upsert. The server owns `updated_at` on insert and update (CAP-004 migration), and it means "family last written on the server". Inbound pages of 1–200 parents in ascending `(updated_at, id)`, persisted with the cursor in one SQLite transaction. A missing local `class_id` is stored as null | Direct `user_id = auth.uid()` SELECT fallback plus session read/write helpers. Hosted read authority is owner or any historical direct child delivery assignment; class/group/creator child visibility does not grant the diary | Outbound before `session_attendees`; after `classes` only when `class_id` exists. Inbound parents persist before dependent attendee pages; no history absence reconcile | `sessionsRepository.test.js`; `offlineSyncOutbox.test.js` session-before-attendees lock; `sqlitePlan1Migrations.test.js`; `historyAuthorizationPostgresHarness.test.js`; disposable and hosted PostgreSQL actor/page/plan probes; authenticated/anonymous PostgREST probes |
| `session_attendees` | `sessionsRepository.saveSession`; inbound `saveHistoryPage` (CAP-004) | `session_id`, `child_id`, `attendance_status` | Outbound batched upsert (onConflict=id) with per-record fallback. Any attendee write re-stamps its parent (`touch_session_family`), so late attendees re-surface the family in the next delta. Inbound pages keyed `(session_id, id)`. A missing local `group_id` is stored as null. A child absent locally becomes a history reference child | Writes require parent session ownership plus active child/group/class access. Hosted historical SELECT follows the authorized parent; the accepted aggregate returns the complete attendee family | Outbound after `sessions`, `children`, and `groups` when `group_id` exists. Inbound after durable parent page; no history absence reconcile | `sessionsRepository.test.js`; `offlineSyncOutbox.test.js`; `sqlitePlan1Migrations.test.js`; disposable and hosted PostgreSQL complete-family actor matrices |
| `assessments` | `assessmentsRepository.saveAssessment` | `user_id`, `child_id`, `programme_id` | Default upsert | Direct owner plus `private.current_user_can_read_child`; writes require active child/programme access | After `children`; before `assessment_items` | `assessmentsRepository.test.js`; `sqlitePlan1Migrations.test.js`; `captureModeMigration.test.js` (nullable `capture_mode` — see note below) |
| `assessment_items` | `assessmentsRepository.saveAssessment` item producer | `assessment_id`, `item_key`, `position` / generated UUID `id` | Batched upsert with per-record fallback | Parent assessment visibility/write access | After `assessments` | `offlineSyncOutbox.test.js` batch and fallback coverage |
| `letter_mastery` | `masteryRepository.saveLetterMasteryRecord` | `user_id`, `child_id`, `programme_id`, `letter`, `language`, `source` | Inserts batch as upserts; edits use acknowledged UPDATE by the re-derived deterministic id and are excluded from batching. **Prevention, not reconciliation.** New rows get a **deterministic logical-key id** (`letterMasteryDomainId`), and `buildSyncPayload` maps **every** `letter_mastery` push to that id. Same record means the same id on every device/install, so insert-by-id is idempotent. `saveLetterMasteryRecord` returns the canonical id so callers track the persisted row; toggling off is also resolved by logical key. A soft-delete/edit whose insert is still queued coalesces into that insert; once synced, soft-delete uses an acknowledged lifecycle UPDATE carrying only `deleted_at`. **Gate completed 2026-07-14:** all 13 staging rows already matched today's deterministic formula. The enduring rollout rule is that no active old build may mint obsolete identities. | Direct owner plus `private.current_user_can_read_child`; writes require active child/programme access | After `children` | `masteryRepository.test.js`; `letterMasterySync.test.js`; `sqlitePlan1Migrations.test.js`; `offlineSyncOutbox.test.js` batch coverage; `offlineSyncUpdateById.test.js` deterministic-id and pending-grant coverage |

**Time-entry location contract (2026-10-15):** Location availability never blocks a manual
clock-in or clock-out. The service uses Balanced accuracy and one 10-second deadline for live
GPS plus a last-known fix no older than 15 minutes. The cache is read alongside GPS and used
only on timeout/native failure, so a stalled cache cannot extend the deadline. Permission
recovery is bounded to one initial native ask plus one explicit retry, with Continue Without
Location available. A successful Open Settings handoff writes nothing; the EA must tap again.

Both status columns are server payload fields, with exactly `fix`, `timeout`, `denied`,
`services_off`, or `unavailable`. SQLite v11 and
`20261015120000_time_entry_location_optional.sql` enforce complete-or-null coordinate pairs,
`fix` with a present pair, and every no-fix status with a null pair. NULL status permits either
complete or absent coordinates and means **not recorded** (older builds and automatic clock-out).
Automatic clock-out keeps `auto_clocked_out = true`, null sign-out coordinates and null sign-out
status. Existing `time_entries_*_own` policies still scope access to `user_id = auth.uid()`;
the migration grants only SELECT/INSERT/UPDATE on the two added columns. It adds CHECKs NOT VALID
then validates them against existing rows. Apply the hosted migration before releasing the phone
change. The harness seeds legacy open, completed, and auto-closed rows before replaying this
migration and checks preservation, owner writes, non-owner refusal, grants and validation.
Local PostgreSQL execution and hosted application are separate gates; neither is implied by
SQLite or mocked upload tests.


> **`sessions` forward-prep columns are not end-to-end active.** SQLite migration v3 and Supabase migration `20260529214500_masi_sessions_forward_prep_columns` add `sessions.group_id` and `sessions.state`. The local schema can store them, but `sessionsRepository.SESSION_COLUMNS` currently omits both, the server payload allowlist strips both, and RLS pins server rows to `group_id IS NULL` and `state = 'completed'`. Therefore session-level group identity/state is not currently durable even locally through the typed repository, and it cannot cross sync. (`session_attendees.group_id` is a separate per-attendee field and is active.) The group-centred session slice must activate the session producer, payload, RLS, ordering, pull, and reporting behavior together.
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
- `supabase/migrations/20260828004500_history_session_authorization_scope.sql`
- `supabase/migrations/20260828010000_delivery_history_session_page.sql`
- `scripts/history-authorization-postgres-harness.cjs`
- `__tests__/offlineSyncOutbox.test.js`
- `__tests__/historyAuthorizationPostgresHarness.test.js`
- `__tests__/sqlitePlan1Migrations.test.js`
- `__tests__/childrenRepository.test.js`
- `__tests__/classesRepository.test.js`
- `__tests__/sessionsRepository.test.js`
- `__tests__/assessmentsRepository.test.js`
- `__tests__/masteryRepository.test.js`
- `__tests__/junctionRepositoryGuards.test.js`

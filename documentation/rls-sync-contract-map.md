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
- Durable queue: `sync_outbox`; local-only `owner_user_id` is never included in server payloads. Every enqueue stamps the signed-in EA from the connection-to-actor WeakMap, including transaction facades. Record provenance (`created_by`, domain `user_id`) never determines the mutation owner. Missing actors fail before the outbox write; SQLite v12 (`sync_outbox_owner_required`) also rejects raw inserts with a NULL owner. Existing rows and indexes are preserved. Owner-scoped readiness, pending hard-delete, and reset queries use strict equality with no NULL wildcard; omitting the owner scope remains file-wide. Legacy NULL-owner rows (queued before v12) are adopted for the file owner by the integrity scan, never left stranded (see "Signed-in EA handle"). `getSyncStatus()` always counts the whole file. `countUnsent()` returns `{ total, byTable }` across `pending`, `failed`, `in_flight`, and `terminal`, including foreign/NULL-owned work so it cannot disappear from status. It delegates to `readUnsentSummary(db)`, the single `UNSENT_STATUSES` definition used for file-wide summaries. The standalone reader also returns `oldestId` / `oldestCreatedAt` (null for an empty outbox), ordered by `(created_at, id)`, and accepts raw read-only connections without opening or migrating a database.
- Server payload allowlist: `SERVER_COLUMNS` in `src/services/offlineSync.js`
- Insert order: `PUSH_ORDER` in `src/services/offlineSync.js`
- Archive order: `ARCHIVE_PUSH_ORDER` plus `ARCHIVE_TABLE_DEPENDENCIES` in `src/services/offlineSync.js`

### Organisation label v1 — applied to hosted 2026-10-14

`supabase/migrations/20261014120000_organisation_label_v1.sql` adds `public.organizations` and
the required, no-default `public.users.organization_id`. Existing users become Masinyusane through
a temporary constant default; their `updated_at` does not move. Masinyusane's id is
`a111879f-d066-47c9-95a1-bed2a400319a`, intentionally shared with Zazi iZandi; its slug is
`masinyusane`. Partners are added by migration. The migration sets session-level `lock_timeout = '10s'` and `statement_timeout = '60s'` and
resets them at the end; it has no `BEGIN`/`COMMIT` of its own. `SET LOCAL` was dropped after the
hosted `supabase db push` (CLI 2.109.1) warned that it had no effect outside a transaction block.
**Applied to hosted `masi-app-sqlite` on 2026-10-14 with Jim's yes** (verification in the build log). Provisioning never deletes an Auth user on
`organisation_conflict`, because another run may already own that identity.

`scripts/createTesters.js` requires `--organization <slug>`, resolves it before user access,
and refuses a known different organisation with `organisation_conflict` before any write.
Dry runs resolve the slug and report those conflicts. The profile write inserts if absent
(`onConflict: 'id', ignoreDuplicates: true`), then updates only names, email, job title, and
school where both `id` and `organization_id` match. It never updates the stored organisation.
Zero returned ids means `organisation_conflict` before a Programme-assignment write, including
when another organisation inserts the profile after preflight. A newly created auth user is
cleaned up on that refusal. The label does not participate in app authorization, RLS policies, or triggers. The
phone ignores it; it is not synced into phone SQLite or the outbox.

The controller passed the 18-check harness on local PostgreSQL 17.11 with `PGTZ=UTC` and both
existing PostgreSQL harnesses after their fixtures gained `organization_id`. The visibility
probe fixture also supplies the id. See the [verification record](./build-log.md#organisation-label-v1--18-postgresql-checks).
The final-review harness adds a Supabase-default-ACL control and four lock-timeout/rollback
checks: 23 total. It observes a competing users lock, expects `55P03` in 8–15 seconds, checks
that no organisation table or user column committed, and always terminates/awaits the blocker
before the real migration apply. These new PostgreSQL checks await controller verification.
**Applied to hosted on 2026-10-14 with Jim's explicit yes.**

### EA access suspension — applied to hosted; device-proven

**Applied to hosted on 2026-10-18 with Jim's explicit yes.**

`20261018120000_ea_access_suspension.sql` adds server-only `private.ea_access_events` and three
SECURITY DEFINER functions with an empty `search_path`. The audit table has RLS enabled and no
policies; PUBLIC, anon, authenticated, authenticator, and service_role have no direct table grants.
Only service_role has API-role EXECUTE on `private.suspend_ea(uuid,text,text)`,
`private.restore_ea(uuid,text,text)`, and `private.ea_access_status(uuid)`. The current caller is
`scripts/ea-access.cjs`, connected as postgres to the fixed SQLite-project session pooler; the
service-role grants are for a future Head Office server. These are private SQL functions, not
mobile RPCs. No phone table, sync payload, or outbox operation is added.

Both mutations lock `auth.users` first, then `public.users`, and change the ban, profile flag, and
audit in one transaction. Suspend sets a 876000-hour Auth ban and changes `is_active` only from
true to false. Each event records the actual before/after values. Restore is permitted only when
the latest event is a suspend, and reactivates only if the first suspend in the uninterrupted run
since the latest restore recorded `was_active_before = true`. An initially inactive profile stays
inactive after repeated suspends and restore. Audit timestamps advance in row-lock order, even
within one transaction, so the original baseline and latest event are unambiguous. Missing Auth,
missing profile, and unavailable restore fail with SQLSTATE `PE001`, `PE002`, and `PE003` respectively.
Status returns email, ban, profile flag, latest event, and `restore_is_active` for an accurate dry-run
preview. The CLI confirms a suspension by rereading its event and requiring both a ban over 24
hours away and an inactive profile.

The ban is the enforcement boundary. RLS, history helpers, and app behavior still do not check
`users.is_active`; existing access tokens remain usable until expiry. Jim accepts the one-hour
residual window; the hosted JWT setting and phone sign-out at the next refresh still need proof.
No assignments, sessions, worked hours, or unsent phone data are deleted. Applied to hosted on
2026-10-18 with Jim's yes, after the schema preflight and disposable PostgreSQL checks. The harness includes repeated
suspends for initially active/inactive EAs, audit-failure rollback, migration replay, explicit grant
denials under permissive default ACLs, and service-role execution; this sandbox could not connect
to localhost PostgreSQL, so these cases are not yet verified. See the
[operator runbook](./ea-access-runbook.md) and [verification register](./build-log.md#verification-register).

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
3. Generic mobile inserts and create-or-update upserts require SELECT visibility. Assessment families and battery runs instead use the exclusive RPC boundaries below, with explicit new-write authority and committed-replay identity checks. Supabase/PostgREST upsert checks row visibility while resolving conflicts, so policies must account for the exact operation shape, not only `INSERT WITH CHECK`. Edits to `time_entries` and every table in `ARCHIVE_SERVER_COLUMNS`, plus lifecycle archives and restores, are acknowledged UPDATEs rather than upserts. Ordinary edits exclude the table's lifecycle fields; `letter_mastery.deleted_at` is the explicit reactivation exception. See Operation Semantics.
4. Parent rows that create later access evidence need direct owner SELECT fallback. This is why `children`, `classes`, `groups`, and `sessions` keep direct creator/user visibility in addition to relationship-derived policies.
5. Relationship tables that grant access are not generic mutable rows. `child_ea_assignments`, `class_ea_assignments`, and `group_ea_assignments` have immutable identity columns protected by database triggers. Insert retries must not become identity-changing updates.
6. Insert and archive ordering differ. Insert can create access evidence early; archive must keep access-granting assignment rows alive until protected cleanup rows have synced.
7. Reference/admin tables are pulled from the server and are not mobile-writable through app-role DML.
8. Server pulls must not overwrite pending local rows (pending-local-wins, issue #42 / ZZ F7). See "Pull Persistence & Reconcile" below.
9. Sync auth state is part of the RLS contract (issues #43/#44). A sync pass with no Supabase session must return a structured skip (`{ success: true, skippedNoSession: true }`) before touching the outbox or sync metadata. A terminal `42501` recorded while a live session exists must store `last_error` with the `42501-authenticated:` prefix and must never be auto-healed. Unmarked RLS-terminal rows are treated as auth-loss collateral: when auth is restored through `SIGNED_IN`, `TOKEN_REFRESHED`, or sessionful `INITIAL_SESSION`, the engine requeues only rows owned by the signed-in user, and the outbox requeue plus domain `sync_status = 'pending'` reset happen in one SQLite transaction. See "Auth-Restore RLS Heal" below.
10. Error classification is local-state-only and bounded for the classes it models (issue #48 plus audit finding #6). `23514` from the immutable-assignment identity triggers (`child_ea_assignments`, `class_ea_assignments`, `group_ea_assignments`) is immediately terminal with reason `Immutable identity or check constraint rejected the update (23514)`; inserts already avoid it via `ignoreDuplicates`, and archive patches contain lifecycle fields plus the claimed version, so this remains a guard for other update-like paths or server check drift. `23503` is retriable while the FK parent has a `pending`/`failed`/`in_flight` `sync_outbox` row (`hasPendingRecord`), terminal otherwise. `42501` is retriable while the FK parent OR an RLS assignment grant is pending locally, terminal otherwise. Grant evidence covers a direct active, unsynced `child_ea_assignments`/`class_ea_assignments`/`group_ea_assignments` row for the record's subject and the membership-mediated child arms of `private.current_user_can_write_for_child`: an active class/group membership joined to its active assignment counts while either half is `pending`/`failed`/`in_flight`, provided neither half is terminal. The `child_class_memberships` or `child_group_memberships` row currently being inserted is excluded from this query because an INSERT cannot grant its own prerequisite authority; a different pending membership path still counts. `computeEvidencePending` resolves the runtime connection once through `resolveDatabase`, then uses that resolved handle for domain-row, direct-assignment, and membership-mediated reads, including the production engine where no database is injected. Subject and FK values resolve from the outbox payload first and the record's own local domain row second, so archive/update payloads still yield evidence. `UPDATE_NOT_APPLIED` uses the same grant evidence and is also retriable while the record's exact insert operation remains owed (`hasPendingOperation`); it is terminal when none of those evidence paths is pending. The `42501` no-session downgrade (Item 9) still applies to an otherwise-terminal `42501`. The deterministic class `PGRST204`, `42703`, `22P02`, `23502`, and non-immutable-table `23514` is retriable for attempts 1 through 7; attempt 8 becomes terminal with `retry_count = 8` and a `deterministic:` reason. `ARCHIVE_NOT_APPLIED` is terminal immediately because the server did not return the one exact updated id required to finalize the lifecycle transition. Codeless network/timeout errors remain retriable without an attempt cap. Force "Sync Now" includes terminal rows, so a repaired server condition can resurrect and finalize them. See "Error Classification" below.

    **B2 / C19 exception to Item 10's active-only grants:** only `sessions` and
    `session_attendees` also use `{ heldGroupAssignment: 'group_id' }`. An owed `insert`
    (`pending`/`failed`/`in_flight`, never terminal) joined to the local `group_ea_assignments`
    row for that group counts even after the assignment has ended. `hasOwedHeldGroupAssignmentInsert`
    filters `gea.ea_user_id` to the outbox's signed-in `owner_user_id`, not the content creator;
    an archive alone is not evidence. It runs only with `includeGrant`, through the same resolved
    database handle. Every other grant retains its existing active-only rule.

11. Active-pair identity is collision-proof by construction (issue #47). The four active-pair tables whose identity IS their server partial-unique key -- `child_ea_assignments` `(user_id, child_id)`, `child_programme_enrollments` `(child_id, programme_id)`, `class_ea_assignments` `(class_id, ea_user_id, programme_id)`, `group_ea_assignments` `(group_id)` -- use a deterministic UUIDv5 id keyed EXACTLY on those columns (local mint in the repository create path plus a force-remap on insert/update/restore push in `buildSyncPayload`, gated on all key columns). Archive operations never remap identity: they scope the lifecycle fields and claimed version by the outbox record id. Every writer (device or the future head-office seed) that means the same active pair derives the same id, so a would-be partial-index `23505` becomes an idempotent id-match. `child_class_memberships` cannot use this (it recurs on class moves and needs distinct archived rows for `deleteIfNoHistory` audit), so it uses reconcile-before-upsert: before an active membership insert, a pre-push server read archives a conflicting active `(child_id, academic_year_id)` row (device-move-wins, audit-preserving), with a conservative fallback to the normal upsert on any error. Already-exited payloads skip this reconcile; see "Row versions (upload contract)" and "Active-Pair Collision-Proofing" below.
12. Grouping-flow collision-proofing is partial and mostly deferred (issue #46). `class_grouping_state` is a one-row-per-`(class_id, academic_year_id)` singleton, so it uses a deterministic id `f(class_id, academic_year_id)` (local mint + push-remap), same shape as Item 11. `grouping_versions` (generational -- needs an activate-new/deactivate-old reconcile) and `groups.display_number` (a partial-unique sequence never populated today) are NOT built: their collision-proofing is inseparable from the grouping/regrouping workflow, which is deferred to next year (CONTEXT.md:161, ADR-0001). Their write paths do not exist yet, so nothing collides today. See "Grouping-Flow Collision-Proofing" below.
13. An outbox row's `created_at` is queue identity, not mutation time. Re-enqueueing the same `(table_name, record_id, operation)` refreshes its payload, owner, retry fields, status, and `updated_at`, but preserves its first `created_at`. Child INSERTs also preserve `last_error` as dispatch evidence (see no-history deletion below). Lifecycle intents are the deliberate identity exception: archive and restore share `<table>:<record>:lifecycle`, so the operation itself can change while the stream keeps its original `created_at`. Push ordering therefore remains fair when one record is edited repeatedly. Claiming assigns the outbox ids a shared in-flight timestamp, stamps eligible domain versions and payloads in the same transaction, then returns the claimed snapshots in input order. Finalization compares each returned `updated_at` before deleting or failing the row; see "Row versions (upload contract)".
14. The concurrency-1 Supabase queue serializes requests, not workflows. A dependent domain pull keeps its query order but acquires one queue lease per RPC or query. No child/class preload may wrap its entire multi-request workflow in one `enqueueSupabaseRequest`. This lets a waiting auth, profile, lookup, or push request run between responses without allowing simultaneous Supabase operations.

## Operation Semantics

| Operation shape | Tables | Server call | RLS implication |
| --- | --- | --- | --- |
| Complete assessment family (`insert`) | `assessments` plus all `assessment_items` | `rpc('submit_assessment', { p_assessment, p_items })`; only `inserted` or `already_present` acknowledges the family | Exclusive authenticated write boundary; new ids require child/programme write authority, committed ids require matching identity and item-id set. No per-item DML or generic fallback. |
| Battery header (`insert` or `update`) | `battery_runs` | `rpc('save_battery_run', { p_run })` with the full header; only `inserted`, `updated` or `unchanged` acknowledges it | New ids require child/programme authority and, when supplied, class membership at `started_at`. Existing owned runs use immutable identity and forward-only status checks, without renewed assignment checks. |
| Default outbox push | Other synced domain tables without a special operation below | `upsert(payload, { onConflict: 'id' })` | Needs both write permission and SELECT visibility for upsert. |
| Acknowledged edit | `time_entries` and every table in `ARCHIVE_SERVER_COLUMNS` when `operation === 'update'` | `update(editPatch).eq('id', serverId).select('id')`, where `serverId` is the payload id after `buildSyncPayload` (the re-derived deterministic id for `letter_mastery`), falling back to `record_id`. `editPatch` excludes `id`, `created_by`, `created_at`, `user_id`, and `archived_by_user_id`, plus the table's archive/restore columns. `letter_mastery.deleted_at` remains writable because reactivation uses update; see the exceptions below. Success requires exactly the requested id; zero or ambiguous acknowledgments fail as `UPDATE_NOT_APPLIED`. An edit is deferred, not failed, while its own `insert` is still owed (pending, failed, or in flight). | Exercises UPDATE policy without asking for INSERT permission: PostgreSQL applies INSERT `WITH CHECK` to every upsert row, even a conflicting one, so these edits never go as upserts. S1 (`npm run verify:upload-contract:postgres`) proved the original five-table permission contract; the additional lifecycle-table routing has real-SQLite/synthetic-server regression coverage, not new PostgreSQL or hosted evidence. `class_grouping_state` is the exception and stays an upsert, because its `update` means create-or-update and its INSERT policy is authorization-based. A zero-row result stays retriable only while the row's own insert or a direct/membership-mediated authorization grant is still owed locally; otherwise it is terminal. |
| Lifecycle archive | `classes`, `children`, assignment/enrollment/membership tables, `grouping_versions`, `groups`, `letter_mastery` | `update(lifecyclePatch).eq('id', recordId).select('id')`. `ARCHIVE_SERVER_COLUMNS` narrows even a legacy full-snapshot outbox row to its table's lifecycle fields plus the claimed `row_version` on versioned tables. Success requires exactly the requested id in the returned rows; zero or ambiguous acknowledgments fail terminal as `ARCHIVE_NOT_APPLIED`. | Exercises UPDATE policy only. It must never create a missing row, run INSERT `WITH CHECK` on a partial payload, rewrite identity columns, or claim success without an exact server acknowledgment. |
| Lifecycle restore | `group_ea_assignments` (reactivation in `groupsRepository.createMissingGroupAssignment` and `groupEaAssignmentsRepository.save`); the engine accepts `restore` for any table in `ARCHIVE_SERVER_COLUMNS` | The same lifecycle UPDATE as an archive, with the same `ARCHIVE_SERVER_COLUMNS` allowlist (for `group_ea_assignments`: `{ unassigned_at: null, handover_reason: null }`). Zero or ambiguous acknowledgments fail terminal as `RESTORE_NOT_APPLIED`. Pushed at the table's `ARCHIVE_PUSH_ORDER` position, which still precedes dependent inserts (`group_ea_assignments` 6, `child_group_memberships` inserts 11). | Archive and restore share one outbox slot per record: `<table>:<record>:lifecycle`; the slot's `operation` and payload are the latest intent. Replacing even an in-flight slot resets it to pending and changes `updated_at`, so the stale request's success, retriable-failure, or terminal-failure finalizer misses its compare-and-swap and `restorePendingAfterStaleFinalize` preserves the replacement. Reactivation always queues restore and, when its insert is still owed, also re-queues that active insert payload; lifecycle UPDATEs wait for their own owed insert. Enqueue deletes pending/failed/terminal legacy `:archive` and `:restore` rows. A legacy row already in flight is left to settle, and the slot waits while a legacy per-operation row remains pending, failed, or in flight, so an older intent cannot run after the slot. Send-time versions fence late arrivals for the 11 versioned tables; see "Row versions (upload contract)". Letter-mastery ordering remains with D1 in the mastery re-key. |
| Batched upsert | `session_attendees`, plus insert operations for `child_programme_enrollments`, `children`, `letter_mastery`, and `time_entries` (the three assignment tables batch their inserts too; see the next row) | `upsert(payloads, { onConflict: 'id' })` in batches of at most 100. A returned or thrown batch failure may spend at most 25 per-record fallback attempts across the entire pass, with concurrency at most five. | Parent row (`children` / `sessions`) must be visible/writable first for tables with parent FKs. Unattempted fallback rows return to pending without failure or retry inflation. `children` has no pre-push hook. Enrollment payloads are normalized to deterministic active-pair ids before array dispatch. Update operations for `time_entries` and every lifecycle-bearing table never enter a batch. In particular, enrollment updates cannot share a batch with inserts and replay `ended_at`. |
| Immutable assignment insert push | `child_ea_assignments`, `class_ea_assignments`, `group_ea_assignments` when `operation === 'insert'` | One ready row uses `upsert(payload, { onConflict: 'id', ignoreDuplicates: true })`; consecutive ready rows use the same operation with `payloads`, bounded batch size, and bounded per-record fallback. | Duplicate insert retry must be insert-or-ignore, not update-capable upsert, because identity triggers reject changed identity/timestamp columns. Full payloads are normalized to deterministic active-pair ids before dispatch. |
| Session insert push | `sessions` when `operation === 'insert'` (its only operation) | `upsert(payload, { onConflict: 'id', ignoreDuplicates: true })`, one row at a time (sessions do not batch) | A retry after a lost response needs only INSERT authority. The merge upsert's UPDATE path met `sessions_update_active_assignment_after_attendee`, which needs a landed attendee, and went terminal when the parent was retried first (B2, Codex round 1). INSERT `WITH CHECK` still runs on the ignored row; `DO NOTHING` never changes a stored session. No error acknowledges, as for assignment inserts. `session_attendees` keeps its merge upsert, because its UPDATE policy asks for no more than its INSERT policy. |
| Assignment archive/update | Same assignment tables | Archive and restore use the lifecycle-update contracts above; ordinary updates use acknowledged UPDATE by id with lifecycle fields excluded. | Lifecycle patches contain `unassigned_at` / `handover_reason` plus the claimed `row_version`; identity columns remain immutable. |
| No-history child delete | `children` hard delete | RPC `delete_child_if_no_history(p_child_id)` | Local delete eligibility comes from the queued child INSERT, never the current domain `sync_status` (which an edit resets). See the no-history deletion rules below. Direct mobile child DELETE is blocked; history rows require archive instead. `20260712202409_masi_idempotent_child_delete.sql` makes a wholly absent child return `true` before authorization, so a retry after server success and pre-finalization crash is idempotent. Present but unauthorized children still raise `42501`; history-blocked children still return `false`. The migration was applied and verified against `masi-app-sqlite` on 2026-07-12. |
| Delivery-history parent page (CAP-004) | Inbound `sessions` history (`sessionHistoryPull`) | `get_delivery_history_page(programme, window_start, page_size, after_updated_at, after_id, overlap_seconds)`; page size 1–200; overlap 0–600 s; cursor wholly null or wholly populated; **ascending `(updated_at, id)`** keyset over the server-owned family timestamp | `SECURITY DEFINER` RPC. The owner arm and the historical-delivery arm are each ordered and limited before the union, so page work is bounded by the arms, not by remaining history. Class/group/creator arms are absent. `p_programme_id` is a partition key, not a grant. The client replays `updated_at` as the raw PostgREST string, never through a `Date`, and passes a 120 s overlap only on the first page of a delta that resumes from a completed cursor. Replaces `get_delivery_history_session_page`, which the same migration drops. |
| Delivery-history attendee page (CAP-004) | Inbound `session_attendees` plus the history-reference projection | `get_delivery_history_attendee_page(session_ids[1..200], page_size, after_session_id, after_attendee_id)`; ascending `(session_id, id)` keyset | Re-derives `private.can_read_session` per requested id at call time. Returns attendee columns plus `child_first_name`, `child_last_name` and `child_preferred_name` only: the history reference projection. Nothing else from `children` crosses this boundary. |

## Assessment results: one complete family per write

Implemented in Assessment Results Plan 1, Tasks 6–12, on `feat/assessment-results`.
[ADR-0009](../docs/adr/0009-assessment-results-one-write-call-complete-families.md) records the
boundary; the [design](../docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md)
separates upload (Plan 1), mastery confirmations (Plan 2), and history pull (Plan 3). The controller
reported the new PostgreSQL harness GREEN, **53/53 cases**, plus all five existing harnesses GREEN
on disposable PG17 at port 55432. Phone cutover is implemented. **Hosted application, the practice-data
wipe, EAS builds and device gates remain Task 14, each with Jim's approval.** This is not a claim
that the hosted schema already has the new grants or functions.

**Producer and outbox family rule.** `assessmentsRepository.saveQuestionResult` saves one typed
Question result, including a zero-item skipped result. In one SQLite transaction it resolves the
active programme, refuses an existing assessment id (`ASSESSMENT_ALREADY_SAVED`) or an already-decided
run/Question (`QUESTION_ALREADY_DECIDED`), validates the flat payload with `assertSubmitShape`,
writes the parent and items as pending, and enqueues exactly one `assessments:<id>:insert` row.
Its payload contains the parent columns and the complete `items` array. Items have no independent
outbox rows. The writer uses `progress_check`, a null assessment window, integer score/counts,
boolean correctness and object metadata/derived data. It does not write `items_tested` or a summary
item. Item identity remains `assessmentItemDomainId({ assessmentId, position, isCorrect })` (ADR-0007).

Dispatch takes the **claimed outbox payload snapshot**, not a fresh scan of domain rows.
`toSubmitArgs` validates it again, splits parent/items and applies the shared allowlists in
`src/services/syncServerColumns.js` without mutating it. A local shape failure becomes terminal
`22023` without a network call. The legacy-programme guard also runs before either RPC and returns
`LOCAL_ONLY_REFERENCE`. The 1,000-ready-row limit counts whole families; generic batch/fallback
limits cannot split their items.

**Server identity and replay.** `submit_assessment` requires Question version, item-set id,
language, stopped reason and object `derived` on every family, including skipped results. It
validates UUID/date/timestamp types, unique item ids and non-negative positions (gaps allowed),
boolean correctness, object metadata, and `total_items === p_items.length`. New ids require current
child write authority and an active programme assignment. An optional run must belong to the caller
and the same child/programme; a completed or abandoned run can still receive a late Question.
An existing assessment id is checked before current assignment authority: owner, child, programme,
run, Question code, item-set id and the exact item-id set must match. It returns `already_present`
without editing saved marks, or raises `MA001`. New families return `inserted`. This is an identity
and membership check, not a comparison of every captured field. A second id for the same
`(battery_run_id, question_code)` raises `23505`; the phone never interprets that as success.

**Battery headers and order.** `batteryRunsRepository` starts runs locally with `started_here = 1`,
`in_progress`, `progress_check` and a null window. It stores `started_at` once as an ISO string and
sends that stored string unchanged on every write. Finalize/abandon require a locally started,
still-open run; only `completed` has `completed_at`. Every write coalesces into the existing
`battery_runs:<id>:insert` slot, whatever its queue status, until it is acknowledged; later writes
use `battery_runs:<id>:update`. Both carry the full run header, without `started_here`.
The server can insert an already-terminal header when start and finish coalesced before upload.
On existing ids it locks the run and checks owner, child, programme, class, battery code/version,
language and start time (`MA001` on mismatch). It advances `in_progress` to `completed`/`abandoned`,
returns `unchanged` for a stale open write or equal terminal replay, and raises `MA002` for a
conflicting terminal status/completion time. Only status and completion time change on finalization;
notes remain as inserted.

Push order is child/access evidence, **battery runs before assessment families**; items travel only
inside the family. Local FK dependencies are `battery_runs → children` and
`assessments → children, battery_runs`, with the run dependency omitted for standalone results.
Run `class_id` is plain text locally, not an additional local FK dependency; the server validates
its membership interval when creating the run. A failed run blocks its own Questions, not standalone
families. Both run and assessment uploads use the existing direct/membership-mediated child grant
evidence for `42501` retries. None of these three tables participates in send-time `row_version`.

**One acknowledgement.** `finalizeSuccess` deletes the claimed outbox row only if its id,
`updated_at` and `in_flight` status still match. Only after that delete succeeds, and no other
outbox row remains for the record, it marks the parent and all its items synced and clears their
errors in the **same SQLite transaction**. The item update runs before the version-stamping early
return. A failure after deletion rolls back the outbox delete and both sync-state changes; a stale
response cannot acknowledge a replacement payload. A replay can then succeed as `already_present`.

**Error classes.** `MA001`, `MA002`, `22023` and `UNEXPECTED_RPC_RESULT` are terminal. An RPC response
outside its explicit success set is a failure, not a silent acknowledgement. `23505` remains
terminal and never marks assessments or runs synced. `28000` is retriable. Existing `42501`/`23503`
local-evidence rules remain in force: pending/failed access evidence can make authority failures
retriable. The thirty-family regression retries with `syncAll({ force: true })`, exactly like the
manual Sync action, after the assignment succeeds.

**SELECT and pull.** The migration preserves assessment/item SELECT policies (owner or child-read
authority, with items visible through their parent). Run SELECT is owner or
`private.current_user_can_read_child(child_id)`. Authenticated direct INSERT/UPDATE/DELETE is revoked
for all three tables; only authenticated callers receive EXECUTE on the two RPCs. Privileged
service-role table access remains outside the EA write contract. **No pull yet — Plan 3** owns
assessment/run history authorization and hydration; current local readers do not establish that
future server history scope. A zero-Question run already blocks no-history child deletion, with
restricting server child/user/run foreign keys protecting retained history.

**Server-owned change timestamps.** Migration `20261021120000_assessment_results_contract.sql`
stamps `updated_at` on INSERT and UPDATE for `assessments`, `assessment_items`, `battery_runs` and
`letter_mastery`. The phone never sends `updated_at` in `p_assessment`, `p_items` or `p_run`; the
RPCs also ignore it. Capture `created_at` is preserved when supplied. These server change times are
separate from local domain/outbox times used for queue order and compare-and-swap acknowledgement.
The existing `letter_mastery` generic writer still sends `updated_at`, which the new trigger
replaces; its confirmation writer/re-key belongs to Plan 2. Do not infer that Plan 1 has changed
that writer or added a mastery pull.

**No-history deletion.** `childrenRepository.deleteIfNoHistory` first checks all existing
history guards. With history it returns `false` and `ChildrenContext.deleteChild` archives the
child and active relationships. With no history, a child is local-only exactly when its INSERT
outbox row is `pending`, has `retry_count = 0`, and has `last_error IS NULL`: it has never been
marked in flight. Only then does deletion remove the child, active relationships, and their
outbox rows without a server request. Marking a child INSERT in flight durably records its
uncertain server outcome in `last_error`; resetting an interrupted INSERT to pending also
leaves evidence, including rows claimed by an earlier build. Child INSERT re-enqueue and manual
retry preserve that evidence even when retry counters reset. A failed, terminal, in-flight, or
recovered-pending INSERT may already have committed with its response lost. These cases, and
the absence of a queued INSERT (acknowledged or pulled), queue `hard_delete` through the existing
history-checked RPC. Queued child updates/lifecycle
operations and writes for the removed active relationships are superseded in the same SQLite
transaction as local deletion and RPC enqueue. A retained child INSERT stays queued; hard-delete
waits until it is acknowledged, even if it later backs off or becomes terminal and needs manual
retry. A successful local deletion still returns `true`; the caller does not additionally archive.
Hard-delete enqueue uses the connection actor even after the child row is deleted; it no longer
passes the deleted row as an ownership fallback. Lifecycle enqueue uses the same actor boundary.
`outboxOwnership.js` (ownership derived from record content) is deleted; the integrity scan and
rescue heal use only the stamped owner. Local regressions: `outboxOwnerStamping.test.js` covers an EA edit to a
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

**Sessions are insert-only (B2).** `saveSession` is the only session producer, and it queues
`insert`. B2 deleted the unused `updateSession`, because the server would now ignore its re-saved
edit. Saved-session editing (spec §8; the upload contract's Out list) must add an `update`
operation sent as UPDATE by id with a row version, never a re-sent insert.

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

Sessions now declare both `classes` and `groups` dependencies, with `class_id` and `group_id`
resolved independently. A failed group insert or deferred group archive holds back only that
group's sessions in that pass; their retry counters do not advance. A session without a group
does not wait for an unrelated failed group, whether or not it has a class. The group's own
class dependency and the assessment/battery-run clauses are unchanged.

Same-record gates apply before the relationship graph. An acknowledged edit waits while its own insert is owed, and every lifecycle row (`archive` or `restore`, for every table) does the same because a lifecycle UPDATE can acknowledge only a row that exists. A terminal insert does not block. A lifecycle row also waits while a different lifecycle operation for the same record is in flight; when that older request settles unsuccessfully, the single-record failure finalizer supersedes it instead of retaining a retry that could reverse the newer intent. Lifecycle rows are never batched, so batch finalizers are deliberately unchanged.

### Failed-batch work budget

The ready queue may contain up to 1,000 rows, but that is a scheduling window, not permission to create a 1,000-row request or a 1,000-request fallback storm. `SYNC_BATCH_LIMITS` enforces three distinct ceilings: 100 records per batch request, 25 individual fallback attempts shared by the whole pass, and five simultaneous fallback requests. Small `Promise.allSettled` waves retain sibling-safe finalization without saturating a weak connection or hammering a failing backend.

When the fallback budget is exhausted, unattempted rows are reset from `in_flight` to `pending` in one local transaction. They keep `retry_count = 0` and no `last_error` because no individual server attempt occurred. The pass result increments `totalDeferred`, the table result increments `deferred`, and deferred rows become exact record-scoped blocking evidence so descendants do not overtake them. Operational reporting emits a rate-limited `batch_fallback_deferred` issue with the full sync-pass context.

### Outbox queue age and batch claim

`sync_outbox.created_at` orders otherwise-equal work and must remain the first-enqueue timestamp for one logical outbox id. The shared SQLite upsert helper therefore supports preserved conflict columns, and `insertOutboxRecord` preserves only `created_at`. Every mutable field still takes the newest enqueue value, including the latest domain payload and owner. Retry count, error, backoff, and status reset in the same upsert, so `syncOutboxRepository.enqueue` performs no follow-up UPDATE.

`markInFlightAndGet(ids)` runs inside one writer transaction for single sends, batches and fallback. It updates outbox status and reads the candidate ids set-wise, stamps each eligible local row and payload, then reads the claimed snapshots and restores caller order. The returned records carry the exact shared `updated_at` used by finalization: a concurrent re-enqueue changes it, the compare-and-swap misses, and the newer payload remains pending. The version stamp and exclusions are defined under [Row versions (upload contract)](#local-writes-claim-snapshot-and-pulls).

### Request queue granularity

Each signed-in EA handle owns its own request queue (`handle.enqueueRequest`, concurrency 1) and its own data client; the shared `supabaseRequestQueue` module is deleted (Plan 2 Task 5). Concurrency 1 does not imply that a high-level workflow owns the queue until every dependent request finishes. `pullPreloadedChildData` queues the reconcile acknowledgment RPC, Programme query, direct assignment query, each enrollment chunk, children query, class-membership query, group query, and group-membership query separately. `ClassesContext` similarly queues its acknowledgment, Programme, and classes requests separately.

Each workflow still awaits the result it needs before constructing the next dependent query. The change is fairness, not parallelism. If another operation was queued while request A was in flight, it runs after A and before the pull submits request B. Data shaping and SQLite persistence occur outside the network lease. A pull begun under one handle cannot persist into another EA's file: its repositories are bound to its own handle, and a stale handle refuses every write. Failed or incomplete scopes retain the same fail-closed reconcile rules.

## Session group authorization (B2)

Server migration `20261021140000_session_group_authorization.sql` implements C19 for the
session family. A completed `sessions` row may carry a non-null group when the EA **holds or has
held** an assignment to that group in the session's Programme: any matching
`group_ea_assignments` row counts, whether active or ended. `session_attendees.group_id` uses the
same rule, resolving the Programme from its parent session. Null remains accepted on both tables
for older builds. The existing `state = 'completed'` boundary remains in force.

**History invariant (spec J23, Jim 2026-10-20).** The session history pull's delivery arm follows
`child_ea_assignments` (`supabase/migrations/20260925120000_session_history_family_delta.sql:110-115`).
That covers every member of an EA's groups, because a child in an EA's group is always one of
that EA's own children: app-made groups take their members from the delivery roster. A Head
Office seed must therefore give every group member a direct assignment to the group's EA; a
seed that breaks this needs a contract change first.

`private.current_user_has_held_group_assignment(group_id, programme_id)` is the shared
`SECURITY DEFINER` check. Its Programme provenance is deliberately `groups.programme_id`, not
`group_ea_assignments.programme_id`. The existing `group_ea_assignments_insert_self` policy checks
that an EA created the group and is actively assigned to the Programme supplied on the assignment,
but it does not require that supplied Programme to equal the group's Programme. Therefore an EA
can create an ended assignment row whose Programme is forged. The verifier case
`session-group-forged-assignment-programme` proves that such a row can be inserted but cannot
authorize a session or attendee in the forged Programme. Helper EXECUTE is revoked from `PUBLIC`
and `anon` and granted only to `authenticated`.

Four RESTRICTIVE policies add this invariant without replacing the existing permissive write
policies: `sessions_state_completed_group_held_insert`,
`sessions_state_completed_group_held_update`, `session_attendees_group_held_insert`, and
`session_attendees_group_held_update`. The two session policies also keep the completed-state
guard. They replace the forward-prep pins `sessions_forward_prep_pin_defaults_insert` and
`sessions_forward_prep_pin_defaults_update`; all four replacement guards are installed before
those pins are dropped. `private.current_user_can_write_for_child` is unchanged, so the attendee's
ordinary child-write requirement still applies. Session and attendee SELECT policies are also
unchanged: the direct session-owner arm and `can_read_session_attendee` retain upsert conflict
visibility, and historical delivery reads continue to return the saved group id without making
that group a new grant. The server does not require an attendee's group id to equal its session's;
the phone producer owns that equality.

**Group deletion (review round 1).** EAs archive groups, never hard-delete them. This B2 migration
drops `groups_delete_created_by` and revokes `DELETE` on `public.groups` from `authenticated`,
idempotently. A hard delete would cascade away group assignments and strand a session family
queued offline on another device: no group or held-assignment evidence would remain to authorize
it. Assignment DELETE was already revoked. `service_role` retains its existing group DELETE
privileges for privileged purges; the harness proves deletion of a disposable, unreferenced group.

**Session identity (review round 1).** `programme_id` and `group_id` are immutable after insert.
`private.prevent_session_identity_change()` runs through the `sessions_prevent_identity_change`
BEFORE UPDATE trigger, comparing both fields with `IS DISTINCT FROM` and raising `23514` with
`sessions programme_id and group_id cannot be changed after insert`. This includes null changes
and prevents a parent PATCH from moving already-landed attendees under another Programme/group.
Updates keeping both fields unchanged still pass through the existing policies, including notes
and family timestamps; no broader UPDATE right is added. The trigger follows the existing private
identity-trigger style (empty search path, direct EXECUTE revoked from public/anon/authenticated)
and applies to privileged updates too. Privileged purges involving referenced history must account
for the immutable identity: a group FK's `ON DELETE SET NULL` is also a group-id change.

The added PostgreSQL cases are `group-hard-delete-refused`, `session-programme-move-refused` and
`session-update-keeping-identity-allowed`, appended after the prior cases. They check retained
group/assignment rows after the authenticated refusal, a service-role disposable purge, both
cross-Programme PATCH shapes with unchanged session/attendee identity, and allowed updates that
preserve or omit the identity fields. Disposable PostgreSQL 17 proves both guards (34 session-group cases), including controls
showing the same programme move succeeds when the trigger is absent.
`sessionGroupServer` models group validation/upserts, not stateful group deletion, so no new
phone-side deletion test is added: the server refusal is this failure mode's guard. Existing
real-SQLite/synthetic-server archive-and-reconnect regressions remain, and phone sync is unchanged.

The held-assignment rule currently relies on the one-row-per-group assignment identity generated
by `groupEaAssignmentDomainId`. If grouping work later allows a group to change EA, the old
holder's ended assignment must survive as historical evidence, or this authorization check must
move to a history table.

**Group Programme (review round 2).** A group's `programme_id` is fixed after insert, including
for raw clients with group UPDATE authority. The B2 migration adds
`private.prevent_group_programme_change()` and the `groups_prevent_programme_change` BEFORE
UPDATE trigger: `IS DISTINCT FROM` rejects a changed Programme with `23514` and
`groups programme_id cannot be changed after insert`. It follows the same private/empty-search-path/
revoked-EXECUTE/idempotent trigger pattern as session identity. Name, class and archive/restore
edits remain allowed under their existing policies. Without this guard, changing a group to
Programme B could strand an offline Programme-A session or reinterpret already-uploaded history.

The held-group check's trusted inputs and retained evidence are fenced together:

- The proposed session's `group_id` and `programme_id` are immutable after insert (round 1).
- The referenced group's `programme_id` is immutable (round 2), so Programme provenance stays
  the group's own value, never the assignment's supplied Programme.
- Assignment `group_id`, `ea_user_id` and `programme_id` are immutable under
  `prevent_assignment_identity_change`; the helper reads only group/EA identity, not assignment
  Programme. The actor comes from server `auth.uid()`, not payload provenance.
- Authenticated DELETE is revoked for both groups and group assignments, preserving the rows
  that supply historical authority. `unassigned_at` may change and is deliberately ignored by C19.

On the phone, `updateGroup` and local existing-row `saveGroup` writes that will enqueue
(`shouldEnqueueOutbox(record)`) compare the Programme with the stored group inside the write
transaction and throw
`groups.programme_id cannot be changed after insert` before any write/outbox enqueue. Equal
Programmes pass; name-only edits retain the existing Programme. The guard also prevents an
existing group being re-scoped through Programme resolution during a local re-save. Authoritative
pull persistence bypasses this local-mutation guard: acknowledged and terminal cached groups
converge to the server's Programme, including historical drift from before B2. The existing
`serverPullWouldClobberPendingLocal` checks still protect pending/failed local rows and their owed
payloads, and reject older server versions for acknowledged rows. Real-SQLite tests verify
convergence restores the EA's Programme-scoped roster and permits a session in that Programme,
alongside pending/failed protection and older-version rejection. The local-mutation tests still
cover synced/pending rows, unchanged group/assignment/outbox snapshots on refusal, and accepted
equal-Programme/name-only writes. `groupsRepository.test.js` is included in the integration gate.
The appended PostgreSQL cases `group-programme-change-refused` and
`group-edit-keeping-programme-allowed` include the same-EA, trigger-dropped PATCH control and
allowed name/class/archive/restore edits. Both pass on disposable PostgreSQL 17 (36
session-group cases), and the fixture keeps only one active staff Programme assignment throughout.

**Phone history reference.** Local migration 16, `sessions_group_history_reference`, keeps all
session columns and the Programme/class FKs while removing the session's group FK.
`sessionsRepository.saveHistoryPage` stores the server's `group_id` verbatim through
`SESSION_COLUMNS`, and `getSessions` returns it even when the group is absent locally. This
creates no group, assignment, roster/picker entry or outbox work, including after ownership repair.
Attendee `group_id` still becomes null when its group is missing; the attendee-derived `group_ids`
is unchanged. `state` remains outside `SESSION_COLUMNS`, so the local completed default still
applies. `saveSession` now normalizes a missing `group_id` to explicit null and writes that value
on the parent, every attendee and all their outbox payloads. It ignores legacy `group_ids` and
does not change group membership. Before any enqueued non-null-group write, it requires a local
group in the resolved Programme; archived groups are allowed. Missing/wrong-Programme groups
raise the exact repository errors before any session/attendee/outbox write. Pulled synced history
does not need this local-write guard. `SERVER_COLUMNS.sessions` includes `group_id`; only `state`
stays intentionally unsynced. Previously queued payloads with no `group_id` key upload unchanged.

`sessionGroupSync.test.js` exercises the real SQLite repository and engine against the scoped
`sessionGroupServer` fake: save offline then delete, delete a half-uploaded family's group, and
Head Office ending an assignment all preserve the session/attendee group ids in ordinary passes.
An SQLite observation trigger retains evidence of any terminal outbox transition; none occurs in
these scenarios. This is local/synthetic-server evidence; the disposable harness proves RLS.
Task 5 also covers a failed group insert holding its lesson for one pass and a deleted group's
assignment insert failing across three attempts: the lesson's `42501` remains retriable on
EA-scoped owed-insert evidence even though the local assignment has ended. Attendees use the
same held-group evidence; other tables keep active-only grants. Archive-only, terminal and
other-EA assignment inserts do not count.

- **Retry after a lost response (B2 Task 6).** Session inserts now send insert-or-ignore by id,
  never the merge upsert's attendee-dependent UPDATE path. The real-SQLite/synthetic-server test
  `a session whose response was lost is retried before its attendees, and the family lands in ordinary passes`
  commits the session, loses its response and converges in two ordinary passes with no terminal
  row or manual retry. The unused `updateSession` is removed; `saveSession` is unchanged and
  attendees keep their batched merge upsert. Four disposable PostgreSQL cases pin the server
  boundary: `session-insert-retry-before-attendees`, `session-insert-retry-still-checks-the-row`,
  `session-merge-retry-before-attendees` and `attendee-merge-retry-after-commit`. All four pass on
  disposable PostgreSQL 17; the still-checks-the-row case returns `42501`, so an insert retry still
  meets the INSERT `WITH CHECK`. If it ever succeeds instead, stop and reconcile that claim before
  release; do not weaken the case.

The controller-owned disposable PostgreSQL gate is `npm run verify:session-group:postgres`; it
applies every canonical migration and exercises active, ended, archived, mismatched, forged, null,
child-check, history-read, privilege, and policy-replacement cases. This migration is **not yet
applied to hosted** `masi-app-sqlite`; hosted application remains a separately approved release
gate.

## Row versions (upload contract)

The upload contract shipped in #77 and was applied to `masi-app-sqlite` on 2026-10-19; the Galaxy
A03s D2/D3 checks passed. The server migration is
[`20261018180000_upload_contract_row_version.sql`](../supabase/migrations/20261018180000_upload_contract_row_version.sql).
It adds `row_version bigint not null default 1` to exactly these 11 tables:

| Group | Tables |
| --- | --- |
| Roster | `children`, `classes`, `groups` |
| Assignments | `child_ea_assignments`, `class_ea_assignments`, `group_ea_assignments` |
| Memberships | `child_programme_enrollments`, `child_class_memberships`, `child_group_memberships` |
| Grouping | `grouping_versions`, `class_grouping_state` |

### Server rule and scope

Each table's `<table>_enforce_row_version` trigger calls `private.enforce_row_version()` before
UPDATE. An incoming version lower than the stored version raises SQLSTATE `MV001`, message
`stale_version`. Equal and higher versions return `NEW` unchanged, preserving the exact returned-id
acknowledgement. The server does not increment the version. Writers that omit it on UPDATE retain
the stored version and pass as ties: older builds, Studio edits, FK `ON DELETE SET NULL` actions,
and the off-outbox membership exit. Conflicting single/batched upserts also reach this rule; one
stale row refuses the whole batch, after which the engine's bounded per-record fallback can send
the other rows. Immutable assignment inserts use `ON CONFLICT DO NOTHING` and cannot overwrite
an existing row.

This closes Ruling 11 for the 11 tables: an earlier-sent request that arrives after a later-sent
write cannot undo it. The counter orders one phone's sends; it does not detect stale edits by a
second writer. Before Head Office edits EA records, add the downloaded base-version comparison
and make Head Office writes bump the version. `sessions` and `session_attendees` remain insert-only
in the current UI; version them with saved-session editing and attendee-removal correctness.
`assessments` and `assessment_items` use the immutable complete-family RPC; `battery_runs` uses
its forward-only status RPC. All three remain outside the versioned-table lists.
`letter_mastery` remains outside this rule: D1 in the mastery re-key owns correction ordering and
is still a pilot gate. `time_entries` uses the forward-only rule below instead of a version.

### Local writes, claim snapshot, and pulls

SQLite migration 14 adds `row_version integer not null default 1` to the same 11 local tables.
Only the claim stamp and download save advance the local version; success finalization reapplies
the sent version. `upsertDomainRecord` removes
`row_version` from normalized records whose `sync_status` is not `synced`: local inserts take the
default and local edits preserve the stored version, even when a stale object contains a version.
All nine roster download savers retain the server version, including the field-by-field
`saveStaffChild` record. `grouping_versions` and `class_grouping_state` are never pulled.
Reconcile end-row SQL and stale active-pair supersede preserve the existing version. Session-history
reference children contain server attendee identity fields only, default to version 1, and remain
read-only until a full roster pull replaces them.

`rowVersion.js` defines the table sets and `isStampedOperation`. At claim, `updateInFlight`
increments each eligible local row's version and writes it into the outbox JSON payload in the
same SQLite transaction. Eligible operations are `insert`, `update`, `archive`, and `restore` on
the 11 tables. Never stamped: `hard_delete`, operations on other tables, a missing local record,
or `insert` on the three immutable assignment tables. Their ignored duplicate inserts leave the
server unchanged; incrementing only the phone's version would make the pull guard reject the
server's active assignment after an interleaved local reconcile. Assignment archive/restore
operations are updates and are stamped normally. A new versioned phone row first sends at v2;
each retry claims a higher version, and skipped numbers are harmless.

Single sends, batches, and batch fallback send the snapshot returned by `markInFlightAndGet`.
A coalesced edit after claim changes the slot's `updated_at`; stale finalization returns the
replacement to pending for its own send without changing the already-claimed request. Claiming a
terminal domain row makes it pending so an overlapping pull cannot replace that forced retry.
After an unchanged slot is acknowledged, single and batch success finalization apply the sent
operation's content and `row_version` in the same transaction, restricted to local domain columns
and the request's shared patch rules, unless another outbox slot for that record owns newer local
content.
The 11 `SERVER_COLUMNS` allowlists retain `row_version`; archive/restore patches include it, and
`UPDATE_PATCH_EXCLUDED_COLUMNS` does not remove it. Payload construction receives the operation
and strips the version from operations that must remain unstamped.

`serverPullWouldClobberPendingLocal` runs inside the save transaction. Pending and failed local
rows reject pulled replacements. A synced versioned row also rejects a numeric server version
lower than its own, so a pull that read before an upload cannot roll back a just-acknowledged
write. Equal or higher versions still apply, including Studio edits that leave the version
unchanged. A terminal row always remains eligible to converge to the server copy, even at a lower
version. Skipping a pull neither changes the queued payload nor enqueues work.

`MV001` is terminal with reason `Server has a newer version of this record (stale_version)`, never
marked synced or retried by an ordinary pass; see the error table below. Force Sync Now can retry
terminal work. A refusal can converge through a subsequent pull for tables that are downloaded.

### Historical membership guard

Before uploading a current `child_class_memberships` row, `reconcileChildClassMembership` may
close the conflicting server-active membership for that child and year. This off-outbox exit
omits the version and passes as a tie. When `payload.exited_at` is set, the guard skips reconcile
before any server read: an already-exited membership records history and must never close the
current one. After an offline A-to-B move, A can commit with its response lost, B can acknowledge,
and A can then retry without ending B. The same rule holds when the move replaces A's payload
while its insert is in flight. The existing RLS boundary is described under Active-Pair
Collision-Proofing.

### Forward-only time entries and ten-hour job

`private.time_entries_forward_only()` runs before INSERT or UPDATE for the row's owner
(`auth.uid() = NEW.user_id` on insert; `auth.uid() = OLD.user_id` on update). The job, service-role
and other non-owner writes pass through unchanged. Only `sign_out_*` and `auto_clocked_out` are
affected. The trigger always returns a row and never refuses a late snapshot, so exact
acknowledgements still work.

| Stored row | Incoming owner write | Stored close |
| --- | --- | --- |
| New insert or open row | Close at or before `sign_in_time + 10 h` | Incoming time, flag and location |
| New insert or open row | Close later than ten hours | `sign_in_time + 10 h`, `auto_clocked_out = true`, all three sign-out location fields NULL |
| New insert or open row | Still open | Remains open |
| Ten-hour auto-close | Close at or before the stored auto time | Incoming honest close replaces the auto-close |
| Ten-hour auto-close | Anything else, including open | Stored close kept |
| Manual close, or auto-flagged close not exactly at ten hours | Any write | Stored close kept |

The insert rule covers shifts opened and closed entirely offline: the close coalesces into the
pending insert. An honest earlier close can replace the server's ten-hour auto-close, while a late
open snapshot cannot reopen a closed shift.

`private.close_overdue_time_entries()` closes only open rows with
`sign_in_time < now() - interval '10 hours'`, using the ten-hour time, automatic flag, and NULL
`sign_out_lat`, `sign_out_lon`, and `sign_out_location_status`. It returns the changed-row count;
running it again changes nothing. EXECUTE is revoked from `public`, `anon`, `authenticated`, and
`service_role`; it runs with the job owner's privileges. The migration checks
`pg_available_extensions` for `pg_cron` and `current_database() = 'postgres'` before installing
the extension and scheduling `masi_close_overdue_time_entries` at `*/15 * * * *`. The fixed job name
makes rescheduling idempotent. Plain disposable PostgreSQL skips scheduling and tests the function
directly. Hosted gates remain: read-only extension pre-check, apply, then verify `cron.job` has the
15-minute schedule and `postgres` owner and `cron.job_run_details` contains a successful run.

The phone retains its load/watchdog automatic close. `handleSignOut` reads the active entry before
requesting location; past ten hours it awaits `autoClockOut` and explicitly returns `true`
(`autoClockOut` resolves `undefined`). The post-location reread repeats the cap if capture crossed
ten hours. At or before ten hours, a manual close keeps its actual time and location outcome.
The capped close uses the same ten-hour time, automatic flag, NULL location fields and transactional
Home notice. No time-entry download or server-row adoption path is added.

### Remaining limits and verification

- `class_grouping_state` has a fixed id and no pull. After reinstall its local version can trail
  the server and a regroup can become terminal. Forced Sync Now increments it on each retry;
  revisit this with grouping pulls or a pilot reinstall.
- A late insert can recreate a hard-deleted child; revisit if Head Office deletes children.
- After a refused edit is replaced locally by a pull, archiving the record before the forced
  retry leaves the phone's archived copy with the old content until the next pull: the queued
  archive owns the row, so the edit's acknowledged write-back is skipped. The server holds the
  correction. Accepted for the pilot (Codex whole-branch round 2); revisit if seen.
- `groups` archive ranks ahead of `groups` update. This is latent because `updateGroup` has no
  screen caller; revisit before a group-rename screen ships. Send-time numbering preserves send
  order, not the meaning of an incorrectly ordered queue.

`rowVersionLocal.test.js`, `rowVersionSend.test.js`, and `rowVersionRefusal.test.js` cover local
SQLite, claimed snapshots, rollback protection, ignored assignment retries and lost-response
membership moves. The membership fake applies awaited updates even without `.select()`; removing
the guard makes both move timings close B. The real PostgREST client receives `MV001` from mocked
HTTP in these tests. `useTimeTracking.integration.test.js` covers the phone's cap. Controller-run
disposable PostgreSQL results for the migration and all five harnesses are recorded in the
[Verification Register](./build-log.md#verification-register); they do not establish hosted cron,
real HTTP SQLSTATE propagation, or device proof. Apply the server migration before a versioned
phone build (`PGRST204` otherwise), after draining or reinstalling test phones on builds 13/14.
See [ROADMAP](./ROADMAP.md#upload-contract-before-pilot-priority-item-5) for the open rollout gates.

## Error Classification (Item 10)

Classification is a pure decision in `classifyError` from `(code, tableName, parentEvidencePending)`, plus the per-record loop that computes `parentEvidencePending` from local state via `computeEvidencePending`. The resolver obtains the runtime SQLite connection once through `resolveDatabase`, so the production engine's undefined injected `database` uses the initialized client rather than dereferencing `undefined`. No server calls occur in the per-record failure path.

| Server error | Classification | Evidence checked |
| --- | --- | --- |
| `MA001`, `MA002`, `22023`, `UNEXPECTED_RPC_RESULT` | Terminal; assessment/run identity conflict, terminal-status conflict, malformed family or unknown RPC acknowledgement | none; local shape failures use `22023` before any network call |
| `23505` | Terminal; never a successful assessment/run replay | success is the RPC acknowledgement string, not a uniqueness error |
| `28000` | Retriable | authentication can recover; no terminal family acknowledgement |
| `MV001` | Terminal, never marked synced; reason `Server has a newer version of this record (stale_version)` | none; ordinary passes do not retry it, and the terminal local row can converge through a pull |
| `23514` on `child_ea_assignments` / `class_ea_assignments` / `group_ea_assignments` | Terminal, reason `Immutable identity or check constraint rejected the update (23514)` | none (neither drifted identity nor a check violation is satisfiable by re-push) |
| `23514` on any other table | Retriable (unchanged, out of #48 scope) | none |
| `23503` | Retriable while FK parent is pending in the outbox, terminal otherwise | `PARENT_FK_COLUMNS` via `hasPendingRecord` |
| `42501` (live session) | Retriable while FK parent OR direct/membership-mediated assignment grant is pending; sessions and attendees also count an owed held-group assignment insert, ended or not. Otherwise terminal with the `42501-authenticated:` marker | `PARENT_FK_COLUMNS` + `GRANT_SUBJECTS`; membership-mediated evidence requires an active membership/assignment pair, either half unacknowledged, neither half terminal, excluding the membership row currently being uploaded. Held-group evidence joins a nonterminal owed `insert` for the group to this signed-in EA's assignment via outbox `owner_user_id`; archive alone does not count |
| `42501` (no session) | Retriable, unmarked (Item 9) | n/a |
| `UPDATE_NOT_APPLIED` | Retriable while the record's own insert OR direct/membership-mediated assignment grant is pending; sessions and attendees also count an owed insert of this EA's group assignment, ended or not. Terminal otherwise | exact `insert` via `hasPendingOperation` + `GRANT_SUBJECTS`, including the EA-scoped, nonterminal held-group insert evidence above |
| `ARCHIVE_NOT_APPLIED` | Terminal; the server returned no exact updated-row acknowledgment | returned id set from `update(...).select('id')` |
| `RESTORE_NOT_APPLIED` | Terminal; the server returned no exact updated-row acknowledgment for a lifecycle restore | returned id set from `update(...).select('id')` |
| `PGRST204`, `42703`, `22P02`, `23502`, non-immutable `23514` | Retriable for attempts 1-7; terminal on attempt 8 with `deterministic:` prefix and `retry_count = 8` | persisted outbox `retry_count` |
| Codeless network/timeout error | Retriable without an attempt cap | none |

Known limitations:
- Deterministic server errors (`PGRST204`, `42703`, `22P02`, `23502`, and non-immutable-table `23514`) have an 8-attempt local budget. Attempts 1-7 use the existing capped exponential backoff; attempt 8 becomes needs-attention with a `deterministic:` reason. A forced Sync Now pass includes the terminal row and can recover it after the server condition is repaired. Codeless network/timeout failures remain retriable indefinitely by design.
- `staff_programme_assignments` grants are not device-produced (never pushed), so a `42501` that needs one stays terminal, which is correct: a real programme-assignment denial.
- A parent or grant that heals through the Item 9 auth-restore after its child was already stamped terminal does not auto-rescue the child (identical to pre-#48 behavior); force "Sync Now" (`includeTerminal`) resurrects the chain.
- Non-immutable-table `23514` follows the 8-attempt deterministic budget. A CHECK violation on an immutable-assignment table (for example, `unassigned_at >= assigned_at`) remains immediately terminal and shares the identity reason label.
- Same-record ordering: `findBlockingDependency` defers an acknowledged edit and every lifecycle operation while its own `insert` is owed; it also defers a newer lifecycle intent behind an older in-flight one. Ordering between a lifecycle row and a non-lifecycle `update` row for the same `letter_mastery` record (toggle off, on, off while offline) is not yet collapsed; D1 in the mastery re-key owns it and remains a pilot gate ([ROADMAP §2](./ROADMAP.md#upload-contract-before-pilot-priority-item-5)).
- Legacy per-operation lifecycle rows (`<table>:<record>:archive` / `:restore`) are deferred ahead of the single lifecycle slot, and deleted at enqueue when not in flight, but are not consolidated at startup. No build before `feat/upload-path-correctness` ever queued `restore`, so the only realistic legacy row is a lone `:archive`, which the deferral orders correctly. One narrow residue remains on development devices only: a legacy archive in flight during reactivation that then goes terminal, after which the slot's restore succeeds and a forced Sync Now (`includeTerminal`) replays the terminal archive. Accepted 2026-10-10 because `masi-app-sqlite` has no field users and launch is a clean install; clear development outboxes before field launch rather than ship migration code for development data.
- The membership-mediated query does not filter assignments to the signed-in EA, as `hasPendingActiveAssignment` never has. It can keep an edit retrying slightly longer, never drop one. B2's held-group evidence is different: `hasOwedHeldGroupAssignmentInsert` filters to `outboxRecord.owner_user_id` and requires an owed insert, not merely an unsynced domain row; it ignores `unassigned_at` only for sessions and attendees. Other grants remain active-only.
- Evidence is deliberately local and conservative: a membership-mediated grant counts only when the active membership and active assignment both exist locally, at least one half is unacknowledged, and neither half is terminal. A grant that exists only on the server cannot make a local zero-row result retriable.

Guarded by `__tests__/classifyErrorHardening.test.js` (unit, via `_testClassifyError` / `_testEvidenceMaps` / `_testComputeEvidencePending`), `__tests__/deterministicErrorBudget.test.js`, the `23514` / `42501` / evidence integration tests in `__tests__/offlineSyncOutbox.test.js`, and the real-SQLite held-group evidence/backoff scenarios in `__tests__/sessionGroupSync.test.js`.

## Active-Pair Collision-Proofing (Item 11)

The four deterministic-id tables neutralize their partial-unique `23505` by construction; `child_class_memberships` reconciles.

| Table | Server partial-unique index | Mechanism |
| --- | --- | --- |
| `child_ea_assignments` | `(user_id, child_id) where unassigned_at is null` | deterministic id `f(user_id, child_id)` |
| `child_programme_enrollments` | `(child_id, programme_id) where ended_at is null` | deterministic id `f(child_id, programme_id)` |
| `class_ea_assignments` | `(class_id, ea_user_id, programme_id) where unassigned_at is null` | deterministic id `f(class_id, ea_user_id, programme_id)` |
| `group_ea_assignments` | `(group_id) where unassigned_at is null` | deterministic id `f(group_id)` (one active EA per group; server-wins on conflict) |
| `child_class_memberships` | `(child_id, academic_year_id) where exited_at is null` | reconcile-before-upsert for an active payload only (archive the conflicting server-active row, then insert); skip reconcile when `payload.exited_at` is set |

**Cross-writer id-derivation contract (the linchpin).** The multi-writer neutralization only works if EVERY writer derives the identical id. Any writer of these four tables -- the mobile app today, the future Head-Office seed script, the HO NextJS dashboard -- MUST use: UUIDv5, namespace `09dcf4b2-6c53-4c46-917f-33bc7f2df4d2`, parts joined by the unit-separator character (`U+001F`), parts = `[<table_name>, <key columns in the order above>]`, each part stringified as `String(part ?? '')`. This mirrors `deterministicDomainId` (`src/db/repositories/domainRepositoryUtils.js:14-17`). The seed-script author MUST reproduce this exactly, or seeded rows will collide with device rows instead of matching them.

**Deploy gate status and enduring rule.** The staging repair completed 2026-07-14: 26 active rows were re-keyed and zero mismatches remained; `letter_mastery` was already clean. The repair proved that "random ID" is the wrong test because all seven bad `group_ea_assignments` ids were deterministic under a superseded formula. Every import or repair must recompute today's expected id from the logical key and require exact equality. Fresh installations remain mandatory for the field cutover because pre-fix local rows can retain obsolete archive identities.

**ccm reconcile boundary (RLS).** The reconcile archives the conflicting server row with an UPDATE that is itself RLS-gated on that row's class (`child_class_memberships_update_write_child_class`). It succeeds for a same-school move; a cross-school Head-Office reassignment (child in a class the device cannot access) is RLS-denied, the reconcile falls back conservatively, and the insert lands terminal (classified by Item 10). Acceptable while HO central reassignment is deferred; a complete fix would be a `SECURITY DEFINER` archive+insert RPC (follow-up, schema change). `group_ea_assignments` is now pulled and persisted. An assignment-scoped pull can therefore reactivate the deterministic local row when the server returns it again.

The [historical membership guard](#historical-membership-guard) skips reconcile for an already-exited
payload, including retries after lost responses or a class move during an in-flight insert.

Guarded by `__tests__/activePairDomainIds.test.js`, the deterministic-id + archive-preservation tests in `__tests__/offlineSyncOutbox.test.js`, the per-repository mint tests, and `__tests__/childClassMembershipReconcile.test.js` (real second-SQLite server; note: runs no RLS, so the cross-school boundary above is not exercised in tests). Upload-contract regression coverage and its evidence limits are recorded under [Row versions](#row-versions-upload-contract).

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

A pulled row is stamped `sync_status: 'synced'` before it reaches a repository save function.
The transactional pending-local and version guards are defined under
[Row versions (upload contract)](#local-writes-claim-snapshot-and-pulls). Owner-scoped pending
hard-delete ids are filtered out before child and relationship persistence.

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

- **Scope and cursor.** One `sync_state` row per EA and Programme in that EA's own database file
  (ADR-0008), `session_history_pull:<userId>:<programmeId>`. The window is the active academic year's
  `starts_on`; a new year resets the cursor.
- **Persistence.** Each parent page, its attendees, any history reference children, and the cursor
  commit in one transaction. Pending and failed local rows win. Absence never deletes, and history
  has no absence reconcile.
- **Historical group reference (B2).** A pulled session keeps `group_id` even when the group is
  not on the phone; there is no `groups` row, and nothing reads it as roster, picker, edit or
  assignment authority. Attendee `group_id` stays null when the group is missing.
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

`OfflineContext` uses a 15-minute staleness threshold on reconnect and foreground. The first usable same-user credentials after a handle opened without them (`subscribeToFirstCredentials`, reason `credentials`) bump the nonce unconditionally, because this launch's mount pulls failed without credentials. The staleness check reads the `child_data_pull` and `classes_pull` records in `sync_state` and bumps `domainPullNonce` when either stamp is missing or stale. Each context has a user-keyed single-flight pull; ClassesContext also reloads school options on that nonce. Mount and pull-to-refresh still pull directly, while sync completion only refreshes SQLite state. A context writes its `lastPulledAt` stamp only when the RPC snapshot is valid and complete, no successful ordinary scope is possibly truncated, no scope has a `transport` failure, and every requested reconcile reports `reconcileCompleted: true`.

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

Auth-loss `42501` failures are recoverable only when they were written without a live session marker. `OfflineContext` runs the bound engine's `requeueTerminalRlsFailures()` once after the handle opens and again on `SIGNED_IN`/`TOKEN_REFRESHED`/`INITIAL_SESSION` for the same EA (subscribed through `AuthContext`). A row is requeued only when its stamped `owner_user_id` equals the signed-in EA, its `last_error` is not `foreign_owner`, and it is not marked `42501-authenticated:`. Ownership is never re-derived from record content, so an EA's own edit of a Head Office-created child heals, and another EA's quarantined row never does.

`sync_outbox.status`, retry counters, `last_error`, and the domain row's `sync_status`/`last_sync_error` are reset inside the same SQLite transaction, so the queue and domain table cannot disagree after a heal.

Tests: `__tests__/offlineSyncAuthGate.test.js`, `__tests__/requeueTerminalRlsFailures.test.js`, `__tests__/outboxIntegrityScan.test.js` (T9), and `__tests__/OfflineContext.test.js`.

## Signed-in EA handle (Plan 2, 2026-10-17)

Spec: `docs/superpowers/specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md`; ADR 0008. Code: `src/session/`.

- **One file per EA.** The handle opens `masi-<userId>.db` after sign-in or offline restore, checks or writes `local_state.file_owner_user_id` (a mismatch refuses to open), runs the integrity scan, resets in-flight rows, runs startup repairs, builds `handle.services`, and only then publishes. Production code reaches SQLite only through a handle-bound repository (`useSignedInEA()` or an explicit handle); an unbound repository throws `UnboundRepositoryError`.
- **Newer-schema refusal.** A file with `user_version > CURRENT_SCHEMA_VERSION` fails with `SchemaTooNewError` (`SCHEMA_TOO_NEW`, `fileVersion`, `appVersion`) before connection PRAGMA writes or migrations. The error reaches AuthContext unchanged; the update screen offers Sign out instead of Retry, and offers no action before authentication. Discovery checks the version before reading foreign tables and skips too-new files as unreadable.
- **Revocation before disposal.** `requestClose` resolves at logical revocation: the epoch advances, the handle is unpublished, requests abort, both native queues seal. Physical disposal is the last item on each connection's serial native queue (tolerant `ROLLBACK`, best-effort `last_active_at`, both closes attempted); `whenDisposed(fileName)` resolves when it finishes, and only a reopen of the same file waits for it. A failed disposal fences that file (`HandleDisposeFailedError`) but never another EA's sign-in.
- **Transaction doors.** Each `withTransaction` gets its own facade that expires when the task settles, before COMMIT/ROLLBACK is admitted. Facades expose only `runAsync`/`getFirstAsync`/`getAllAsync` under a single-statement policy (`PRAGMA user_version` and `PRAGMA defer_foreign_keys = ON` excepted; `OR ROLLBACK` refused). A COMMIT already running at revocation finishes; a queued one is refused and disposal rolls the transaction back.
- **Per-handle data client and queue.** Every server request runs inside `handle.enqueueRequest` on `handle.dataClient` (supabase-js in `accessToken` mode). Its fetch re-checks, at send time, that the handle is open and current, that a queued task is running, and that the latest session belongs to the handle's EA; it aborts on revocation or after 30 s and resolves as a codeless network error. The shared client is used only for `supabase.auth.*` in `supabaseClient.js`, `persistedAuthSession.js` and `AuthContext.js` (static test).
- **`StaleActorError` vs `AuthUnavailableError`.** Stale means the work belongs to a revoked or superseded handle: it is never retried under anyone else. Auth-unavailable means the handle is current but has no usable session: a retriable, codeless failure for later.
- **Whole-pass stale rule.** A stale refusal anywhere in a sync pass ends the pass: no record is finalised, no batch fallback runs, `sync_meta` is not written, and `syncAll` resolves `{ success: false, abortedStaleActor: true }` without observability noise. Rows left `in_flight` are reset when that EA's file next opens.
- **Integrity scan.** At open and before every pass: legacy NULL-owner rows are adopted for the file owner; rows stamped with another EA move to `terminal` with `last_error = 'foreign_owner'` (domain row too), stay counted as unsent, are recorded in `local_state.integrity_scan_last`, and raise one operational error (`foreign_owner_in_file`, counts by table only). A nonempty foreign set also queues a `foreign_owner_in_file` support incident in the same transaction as adoption, quarantine and scan evidence, using `enqueueSupportIncident(txn, ...)`. Its payload is exactly `{ foreignTotal, foreignByTable }`; its repeat key is `incidentRepeatKey('foreign', ...sortedForeignOutboxIds)`, so no outbox id, record id or foreign EA id is stored in the incident payload/key. Every scan includes already-quarantined terminal rows: the same set deduplicates (including after delivery), and a grown set creates a new incident even when its smallest id is unchanged. The shared queue's bounded-capacity/pruning rules still apply. Incident insert or scan-evidence SQL errors roll back the whole transaction. Coverage: `outboxIntegrityScan.test.js` (real SQLite, open/pass/reopen, all unsent states, privacy, set changes and rollback).
- **Sign-in discovery.** Each published handle exposes a non-rejecting `handle.discovery` promise. Discovery starts on a microtask after publication and never delays sign-in. `fileDiscovery` lists the directory from expo-sqlite's `defaultDatabaseDirectory`, converting a native path to a `file://` URI for `Directory`; an absent directory value or a listing failure yields no files. It examines only other UUID-shaped `masi-<userId>.db` files and legacy `masi.db`, ignoring the signed-in EA's own file and sidecars. Each read uses a new raw connection, `PRAGMA query_only = ON`, `PRAGMA busy_timeout = 2000`, and `readUnsentSummary`; it closes in `finally` without migrating, writing, renaming or deleting the source file. Unreadable/old-schema files are skipped. `readUnderFileFence` admits the read after pending disposal and makes a same-file `requestOpen` wait for it; failed disposals and bootstrap cleanup failures still refuse reads. Discovery checks handle currency before admitting each file and again inside the fence, stops after sign-out, and writes incidents only through the active handle's support repository. For another EA, the kind is `left_behind_unsent_work`, key `incidentRepeatKey(strandedUserId, oldestId, oldestCreatedAt)`, payload `{ strandedUserId, unsentByTable, oldestUnsentAgeHours }`; for legacy, the kind is `legacy_shared_file_unsent`, the key hashes `'legacy'` with the oldest id and creation time, and the payload omits `strandedUserId`. Ages are floored hours, minimum zero. Raw outbox/record ids enter only the hashed repeat key, never the queued payload or wire request. Dedupe and capacity follow the shared queue contract; a changed oldest id or creation time identifies a new episode. Tests: `fileDiscovery.test.js` (real SQLite, exact envelope, repeated/new episodes, source-file preservation, directory ruling, old/unreadable files, T12 through the real drain) and `signedInHandle.test.js` (cancellation, read/disposal ordering, same-file admission and failed-file fencing).
- **Incidents.** The three kinds are `left_behind_unsent_work`, `foreign_owner_in_file` and `legacy_shared_file_unsent`. Producers queue counts in the current EA's `support_incident_queue`, separate from the domain outbox, with at most 200 rows. At the end of a full `syncAll` pass with a live session, the drain sends up to 20 due rows through the handle's client and queue to `report_mobile_support_incident`. Table-only passes do not drain; due incidents schedule a pass without increasing the EA's unsent count. Local repeat keys are UUIDv5 digests of the episode: the stranded EA (or `legacy`), oldest outbox id and its `created_at`; the foreign-owner kind uses the whole sorted foreign-id set. The wire key adds `<installId>:` and the server dedupes on `(reporter_id, kind, repeat_key)`. Release/build/update/backend/install metadata is added at send time. The deny-list applies to the whole queued row and RPC request, including the repeat key: no raw outbox or record ids, child ids, names, notes or record payloads. The stranded EA id is intentional support metadata. T12 tests cover both queue and wire data; the RPC's kind and size checks do not replace that producer privacy rule.
- **Profile and reference refresh.** Startup and reconnect refresh the EA profile and reference data through the current handle. Profile refreshes share an in-flight request; a missing profile shows “Loading your profile...” with Retry in the session form router. Reference readiness requires the durable `local_state.reference_data_complete_at` ISO timestamp, written only after all seven reference-table writes succeed; non-empty tables alone never establish readiness after reopening. Completed caches remain ready offline, including legitimately empty tables and EAs with no programme assignment. A failed or partial refresh neither writes nor clears the marker; without it, readiness joins an active refresh or retries a failed one.
- **Shared auth session persistence.** The shared client's storage drops session writes for anyone but the admitted identity (the email being signed in, then that user's id; the restored user at launch; nobody after sign-out), and every shared auth request aborts after 30 s, so a late response can never restore or overwrite a session. **Accepted risk (Jim, 2026-10-17):** if A's background token refresh is in flight when B signs in on the same phone and the server rejects it, the SDK's own cleanup can remove B's new session and sign B out; B signs in again and nothing is lost, because B's work stays in B's file. A sequencing guard for this (Task 5 round 5) was built and then reverted by the auth simplicity check as not worth its complexity.
- **Field-release prerequisite (ruling 11).** Sign-out aborts in-flight uploads, so an upload the server already accepted may be re-sent when the EA returns. Identical replay is proven harmless (Task 4 T5). Ordering an uncertain older write against a newer one is owned by the upload-contract spec and must be closed before field release.
- **Device gates still open:** D1–D7 on the build intended to ship, including D7's native close under load on iOS and Android. Also confirm that `listDatabaseNames` finds the SQLite files on both platforms and visually check both sign-out sheets. Local Jest results do not close these gates.

## Table Contract Map

| Table | Producer | Local required fields | Sync operation | RLS authority / SELECT dependency | Ordering / dependencies | Tests and probes |
| --- | --- | --- | --- | --- | --- | --- |
| `mobile_support_incidents` | Server-only; written only by `report_mobile_support_incident(p_kind text, p_repeat_key text, p_payload jsonb)` | Phone queue: `support_incident_queue` (local, per-EA file). Reporter is derived from `auth.uid()`; kinds: `left_behind_unsent_work`, `foreign_owner_in_file`, `legacy_shared_file_unsent`; repeat key 1–512 characters; object payload ≤8192 bytes | SECURITY DEFINER RPC with empty `search_path`; unique `(reporter_id, kind, repeat_key)`; returns `true` for newly recorded, `false` for duplicate. No domain outbox write | RLS on with no policies. `service_role` SELECT only; `authenticated` EXECUTE on the RPC only, no direct table grants. Explicit REVOKEs remove permissive default ACLs. No subject: `28000`; invalid arguments: `22023`; anon EXECUTE: `42501` | Auth reporter must exist. Session-level 10s lock / 60s statement bounds with RESET. Applied to hosted 2026-10-17 (grants verified read-only against S2) | `support-incident-postgres-harness.cjs` (S2): default ACL control plus 17 acceptance, duplicate, reporter, validation, and role-grant cases (GREEN 2026-10-17; REVOKE mutations caught) |
| `support_incident_queue` | Local-only, per-EA file; `handle.repositories.supportIncidents` / `createSupportIncidentRepository`; integrity-scan and sign-in-discovery producers are described above; callers already inside a transaction use `enqueueSupportIncident` | SQLite v13. Kinds: `left_behind_unsent_work`, `foreign_owner_in_file`, `legacy_shared_file_unsent`; UTF-8 JSON payload ≤8192 bytes; unique `(kind, repeat_key)`; repeat keys from `incidentRepeatKey` (UUIDv5, fixed namespace) | Never synced as a domain table or enqueued into `sync_outbox`. A live-session full `syncAll` pass drains up to 20 due rows through `report_mobile_support_incident` after the domain outbox; table-only and sessionless passes do not drain. Both boolean RPC results mark sent; `22023` rejects and continues; transport/auth trouble backs off and stops this drain. Incident failures do not change domain-pass success; stale actors still abort. Pending rows are due when `next_attempt_at` is null or elapsed; retries start at 5 s, multiply by 3 and cap at 900000 ms | Local access is bound to the signed-in EA handle; no server RLS policy for this local table. Server grants remain on the incident RPC/table above | Cap 200 total rows. At capacity, prune oldest sent/rejected rows by `(updated_at, id)`; never prune pending rows. Duplicate, full and oversized enqueue outcomes are explicit. Lists use `(created_at, id)` order; sent/rejected rows retain dedupe until pruned | `supportIncidentRepository.test.js` (real SQLite, bounds, dedupe, retries, transaction rollback); `supportIncidentDrain.test.js` (RPC shape, privacy, lifecycle and status); `OfflineContext.test.js` (incident-only scheduling); `installId.test.js` (persistence/concurrency/sign-out); `handleServices.test.js` (per-EA isolation, stale refusal, reopen); `sqliteFoundation.test.js` (v13 table and migration ledger) |
| `organizations` | Canonical migrations; partners are added by migration | Server-only: `id`, `slug`, `name`; no phone table | No mobile sync | RLS enabled with no policies. Only `service_role` has API-role SELECT; no INSERT/UPDATE/DELETE. `anon`, `authenticated`, and `authenticator` have no SELECT | Seed before users, with session-level 10s lock / 60s statement bounds. Applied to hosted 2026-10-14 | `organisation-label-postgres-harness.cjs`: role refusals, slug resolution, explicit revocations under default ACLs, timeout rollback |
| `users` | `scripts/createTesters.js`; service-role insert-if-absent, then mutable-fields UPDATE restricted by id and organisation. Built EA-access functions update only `is_active` (applied to hosted 2026-10-18; contract above) | Server `organization_id` is required with no default. The phone ignores it; no SQLite/outbox sync | No mobile domain write. Own-profile SELECT with school/job-title joins stays unchanged | Existing own-profile SELECT policy. Organisation is an employer label, not an access boundary. Provisioning preflight rejects known conflicts; the conditional UPDATE refuses a concurrent organisation mismatch without overwriting it. Inactivity alone does not revoke access; the Auth ban does | Auth user and organisation must exist before profile creation. Confirm the profile UPDATE before Programme-assignment writes. Organisation label applied to hosted 2026-10-14; EA access apply pending | `organisationProvisioning.test.js` (including concurrent insertion); `testerProvisioning.test.js`; `organisation-label-postgres-harness.cjs` (timestamp, constraints, own-profile read); history/S1 and `rls-visibility-probe.cjs` fixtures supply the id; `ea-access-postgres-harness.cjs` (execution pending) |
| `time_entries` | `timeEntriesRepository` | `id`, `user_id`; nullable `sign_in_lat`/`sign_in_lon` and `sign_out_lat`/`sign_out_lon`; nullable `sign_in_location_status`/`sign_out_location_status` | Inserts batch as upserts; edits use acknowledged UPDATE by id and are excluded from batching | Self-scoped by `user_id = auth.uid()` | No domain dependencies | `offlineSyncOutbox.test.js` time-entry sync coverage; `offlineSyncUpdateById.test.js`; `timeEntriesRepository.test.js` (integration tier, Item 8); `useTimeTracking.integration.test.js` (clock-in vertical through the real path, Item 8); `forceStopReopenOutbox.test.js` (force-stop close+reopen persistence, Item 8); `locationUnavailableClock.integration.test.js`; `timeEntryLocationMigration.test.js`; `offlineSyncUpdateById.test.js` no-location wire payload; local upload-contract PostgreSQL harness |
| `classes` | `classesRepository.saveClass`; `classOnboardingRepository.start` transaction wrapper for locally onboarded classes | `id`, `created_by`, active `programme_id` for local class EA assignment. The onboarding wrapper adds only a user-scoped local-state marker in the same SQLite transaction; it does not change the server payload. | Insert uses default upsert; edit uses acknowledged UPDATE by id; archive uses acknowledged lifecycle UPDATE by id | `classes_select_created_by`; `private.current_user_can_access_class` / `private.current_user_can_write_for_class` | Before `children`, `class_ea_assignments`, grouping rows, sessions with `class_id` | `classesRepository.test.js`; `classOnboardingRepository.test.js` atomic create, rollback, and restart marker coverage; `offlineSyncUpdateById.test.js`; `sqlitePlan1Migrations.test.js` creator SELECT coverage |
| `class_ea_assignments` | `classesRepository.saveClass`; `classEaAssignmentsRepository`; Classes pull persistence and reconcile | `class_id`, `ea_user_id`, `programme_id`, `created_by` | Consecutive inserts batch with insert-or-ignore; archive uses acknowledged lifecycle UPDATE by id and ordinary updates use acknowledged UPDATE with lifecycle columns excluded; direct pull scope persists and reconciles synced absentees | EA self assignment and class access; identity trigger blocks reassignment by update | Insert after `classes`; archive after dependent child/class cleanup rows | `junctionRepositoryGuards.test.js`; `offlineSyncOutbox.test.js` immutable assignment batching and lifecycle exclusion; `pullReconcile.integration.test.js`; `pullReconcileOffline.integration.test.js` |
| `children` | `childrenRepository.saveChildRecord`; `childrenRepository.updateChild`; `literacySessionPersistence` current-reading-level update; Children pull persistence; CAP-004 history reference rows from `saveHistoryPage` (`history_reference = 1`: identity and display name only, `synced`, never enqueued; `history_reference` is local-only and never pushed; excluded from `getChildren`/`getMyChildren`; `save`/`updateChild`/`archiveChild`/`deleteIfNoHistory` refuse them; any full-row roster save upgrades them to `0` in place) | `id`, `created_by`; active programme and academic year when local save creates relationship rows. `reading_level` is nullable current child state. Literacy session submission updates it only for actual attendees whose selected level differs from the stored value, while the session keeps its own historical snapshot in `sessions.activities.child_reading_levels`. | Inserts batch as upserts; edits use acknowledged UPDATE by id and are excluded from batching; archive uses acknowledged lifecycle UPDATE by id; hard delete uses the RPC only and never enters the batch path. `reading_level` is included in the explicit server payload allowlist. Pull hydration consults owner-scoped pending, failed, and in-flight `hard_delete` outbox ids and suppresses matching child, EA assignment, programme enrollment, and class membership rows before persistence. Entity absence never archives the local row. | `children_select_created_by`; `private.current_user_can_read_child` / write helper | After `classes` only when `class_id` is present; before child relationship rows | `childrenRepository.test.js`; `literacySessionPersistence.test.js` (real SQLite, changed-only update and attendee boundary); `offlineSyncOutbox.test.js` batch, fallback, and record-scoped dependency coverage; `offlineSyncUpdateById.test.js`; `offlineSync.stripping.test.js`; `EditChildScreen.test.js`; `ChildrenContext.test.js`; `ChildrenContextPendingDelete.integration.test.js`; `pullReconcile.integration.test.js`; `pullReconcileOffline.integration.test.js`; `syncOutboxRepository.test.js`; `sqlitePlan1Migrations.test.js`; authenticated live RLS reading-level round-trip probe |
| `child_ea_assignments` | `childrenRepository` relationship producer | `user_id`, `child_id`, `created_by` | Consecutive inserts batch with insert-or-ignore; archive uses acknowledged lifecycle UPDATE by id and ordinary updates use acknowledged UPDATE with lifecycle columns excluded | Self assignment; insert helper for locally-created child; identity trigger blocks reassignment by update | Insert after `children`; archive after child programme/class/group cleanup | `childrenRepository.test.js`; `offlineSyncOutbox.test.js` immutable assignment batching and lifecycle exclusion; `junctionRepositoryGuards.test.js` patterns |
| `child_programme_enrollments` | `childrenRepository` relationship producer | `child_id`, `programme_id`, `created_by` | Inserts batch as upserts (onConflict=id) with bounded per-record fallback. Full payloads are normalized to the deterministic `(child_id, programme_id)` id. Ordinary updates use acknowledged UPDATE by id, exclude `ended_at`, and cannot batch with inserts. Archive uses acknowledged lifecycle UPDATE by id. | Active child write access plus active programme | Insert after `children` and child EA access evidence; archive before ending child EA assignment | `childrenRepository.test.js`; `offlineSyncOutbox.test.js` deterministic-id batching and archive ordering |
| `child_class_memberships` | `childrenRepository` (incl. `updateChild` class-change reassignment); `childClassMembershipsRepository` | `child_id`, `class_id`, `academic_year_id`, `created_by` | Insert uses default upsert; archive/restore uses acknowledged lifecycle UPDATE by id; ordinary updates use acknowledged UPDATE excluding `exited_at`. On a class change the new membership is inserted (`insert` op) and the old active one is exited. If the old membership's original insert has already synced it is archived (`exited_at`, `archive` op); if that insert is still pending in `sync_outbox` (offline create→reassign before first sync) the reassignment **coalesces** by rewriting the pending insert to carry `exited_at` instead of queuing an archive (#35 P1) | Active child write access plus class access | Insert after `children` and `classes`; archive before ending child/class EA assignment. Membership archives sort **before** inserts (`ARCHIVE_PUSH_ORDER` 4 < `PUSH_ORDER` 5), so archiving a still-pending insert would reorder ahead of the stale active insert and recreate the old membership active — hence the unsynced case coalesces in place rather than archiving (same `updateChild` txn, #35) | `junctionRepositoryGuards.test.js`; `childrenRepository.test.js`; `childClassReassignment.test.js` (synced-archive, offline-coalesce, and end-to-end sync against a real-schema server) |
| `grouping_versions` | grouping repositories / class grouping flows | `class_id`, `academic_year_id`, `created_by` | Default upsert for insert; ordinary updates use acknowledged UPDATE excluding lifecycle status/archive metadata; archive uses acknowledged lifecycle UPDATE by id | Class write/access policy | After `classes`; before `class_grouping_state` and groups that reference a grouping version | `sqlitePlan1Migrations.test.js`; grouping repository tests |
| `class_grouping_state` | class grouping state repository | `class_id`, `academic_year_id` | Default upsert | Class write/access policy | After `classes` and `grouping_versions` when `active_grouping_version_id` is present | `offlineSyncOutbox.test.js` dependency coverage |
| `groups` | `groupsRepository.saveGroup`; `ChildrenContext.addGroup`; Children pull persistence | `id`, `name`, `programme_id`, `created_by`; `class_id` when class-scoped | Insert uses default upsert; edit uses acknowledged UPDATE by id; archive uses acknowledged lifecycle UPDATE by id. Programme is fixed after insert for local mutations: `updateGroup` and existing-row `saveGroup` writes that enqueue refuse a change before writing/enqueueing; equal values and name-only edits pass. Authoritative pulls converge acknowledged/terminal caches to the server Programme, subject to existing pending/failed protection and row-version checks. EAs archive, never hard-delete groups. Pulled tombstones persist, while entity absence never archives the local row. `getGroups` is assignment-scoped through an active `group_ea_assignments` join. | `groups_select_created_by`; group access helper via class/group EA assignment. B2's BEFORE UPDATE trigger rejects Programme changes with `23514`, preserving other edits. B2 drops `groups_delete_created_by` and revokes authenticated DELETE; service-role DELETE privileges remain | After `classes` when `class_id` exists; before `group_ea_assignments` and memberships | `groupsRepository.test.js` (real SQLite); `offlineSyncOutbox.test.js`; `offlineSyncUpdateById.test.js`; `pullReconcile.integration.test.js`; `pullReconcileOffline.integration.test.js`; `ChildrenContextPull.integration.test.js`; `sqlitePlan1Migrations.test.js`; session-group PostgreSQL hard-delete, Programme-change/control and unchanged-Programme edit cases; live rollback group probes |
| `group_ea_assignments` | `groupsRepository.saveGroup`; `groupEaAssignmentsRepository`; Children pull persistence and reconcile | `group_id`, `ea_user_id`, `programme_id`, `created_by` | Consecutive inserts batch with insert-or-ignore. Archive and reactivation (`restore`) use acknowledged lifecycle UPDATE by id and occupy the single `<table>:<record>:lifecycle` outbox slot, whose operation is the latest intent. Both repository producers use the slot; `groupEaAssignmentsRepository.save` detects reactivation from the pre-upsert local row. Reactivation always queues restore and also re-queues insert when it remains owed. In-flight replacement is protected by the existing `updated_at` stale-finalize guard; operation-keyed legacy lifecycle rows are cleaned up or ordered ahead of the slot. Full embedded server rows are pulled, persisted, and reconciled by acknowledged group ids | EA self assignment and group ownership/access; identity trigger blocks reassignment by update | Pull persistence follows `groups`; lifecycle waits for the same record's owed insert and for any still-owed legacy per-operation lifecycle row; archive otherwise follows `child_group_memberships` cleanup | `groupAssignmentLifecycle.test.js`; `offlineSyncOutbox.test.js` immutable assignment batching, lifecycle exclusion, and group archive ordering; `pullReconcile.integration.test.js`; `pullReconcileOffline.integration.test.js`; `ChildrenContextPull.integration.test.js` |
| `child_group_memberships` | `groupsRepository.addChildToGroup`; removal/archive flows in `groupsRepository` and `childrenRepository` | Insert requires `child_id`, `group_id`, `grouping_version_id`, `created_by`; archive carries `id`, `removed_at` locally and sends `removed_at` plus the claimed `row_version` | Insert uses default upsert. Archive uses acknowledged lifecycle UPDATE by id, avoiding the INSERT-policy check that rejects partial archive upserts. | Active child write access plus group write/access | After `children`, `groups`, and group EA access evidence; archive before ending group EA assignment | `offlineSyncOutbox.test.js` exact RLS regression, acknowledged-update guard, ordering, and group ownership repair tests |
| `sessions` | `saveSession` writes `group_id` explicitly (missing means null); an enqueued non-null group must exist locally in the resolved Programme, including archived groups. Inbound `saveHistoryPage` preserves history | `user_id`, `programme_id`, optional `group_id` | Outbound insert-or-ignore by id (B2); `programme_id` and `group_id` are immutable after insert. `group_id` is in `SERVER_COLUMNS.sessions` (`syncServerColumns.js`), while `state` remains intentionally unsynced. Legacy queued payloads without the key are unchanged. Server owns family `updated_at`. Inbound pages persist atomically with the cursor; missing class becomes null, historical group id is kept even when absent locally | Owner SELECT fallback and existing session write policies plus B2's RESTRICTIVE completed-state/held-group checks; Programme provenance comes from the group. BEFORE UPDATE identity trigger rejects Programme/group changes with `23514`; unchanged identity retains existing UPDATE checks. Historical reads remain owner or historical direct child delivery scope | Before attendees; after its exact `classes`/`groups` parents when their ids exist, with independent nullable edges and same-pass failed-parent gating. An owed insert of this EA's group assignment is retry evidence even after it ends. No history absence reconcile | `sessionsRepository.test.js`; `sessionGroupSync.test.js`; `sessionsHistoryPage.test.js`; `sessionHistoryPull.test.js`; `syncContractCompleteness.test.js`; session-group disposable PostgreSQL harness, including refused parent moves and allowed identity-preserving updates |
| `session_attendees` | `saveSession` writes the session's `group_id` to every attendee, including a child visiting from another group; memberships are untouched. Inbound `saveHistoryPage` retains null-when-missing mapping | `session_id`, `child_id`, `attendance_status`, optional `group_id` | Batched merge upsert (onConflict=id), bounded fallback; group id is in `SERVER_COLUMNS.session_attendees`. Writes stamp the parent family timestamp. Inbound pages keyed `(session_id, id)`; missing group becomes null, absent child becomes a history reference child | Existing parent-ownership and active child-write checks plus B2's RESTRICTIVE held-group checks using the parent session's Programme. SELECT follows the authorized complete parent family | After `sessions`, `children`, and `groups` when `group_id` exists. Inbound after durable parent page; no history absence reconcile | `sessionsRepository.test.js`; `sessionGroupSync.test.js`; `sessionsHistoryPage.test.js`; `sessionHistoryPull.test.js`; disposable PostgreSQL session-group and complete-family actor matrices |
| `assessments` | `assessmentsRepository.saveQuestionResult` | Owner, child, programme, Question/version, item set, language, stop reason, object derived, exact item count; optional run | `submit_assessment` only: `inserted` / `already_present`; identity or item-set membership mismatch `MA001`, malformed `22023`, duplicate run/Question `23505` never success. One family outbox/ack transaction; no pull yet — Plan 3 | Existing owner or child-read SELECT. New writes require active child/programme authority; committed retries check identity before current authority. Direct EA DML revoked | After `children` and optional `battery_runs`; items inside the same RPC, no per-row push | `assessmentsRepository.questionResults.test.js`; `assessmentFamilySync.test.js`; `assessmentFamilyRpcError.test.js`; `assessment-results-postgres-harness.cjs` |
| `assessment_items` | `saveQuestionResult`, inside its parent transaction | Deterministic `id`, parent id, unique non-negative `position`, item key, boolean correctness, object metadata | Only `p_items` inside `submit_assessment`; no independent outbox row/upsert/fallback. Whole family is acknowledged together; no pull yet — Plan 3 | Existing parent-based SELECT; direct EA DML revoked | Same server and local acknowledgement transactions as parent; absent from `PUSH_ORDER` and batching | `assessmentFamilySync.test.js` complete 61-item send and injected acknowledgement rollback; repository and PostgreSQL family tests |
| `battery_runs` | `batteryRunsRepository.startRun` / `finalizeRun` / `abandonRun` | Owner, child, programme, optional class, battery code/version, language and stored start time are replay identity | Full-header `save_battery_run`: `inserted` / `updated` / `unchanged`; identity `MA001`, terminal conflict `MA002`, malformed `22023`, `23505` never success; `28000` retriable. No row version; no pull yet — Plan 3 | Owner or child-read SELECT; new writes require child/programme authority and optional class membership at start; owned existing runs do not renew assignment checks | After `children`, before linked assessments; optional class is not a local FK dependency | `batteryRunsRepository.test.js`; `assessmentFamilySync.test.js`; `assessment-results-postgres-harness.cjs` |
| `letter_mastery` | `masteryRepository.saveLetterMasteryRecord` | `user_id`, `child_id`, `programme_id`, `letter`, `language`, `source` | Inserts batch as upserts; edits use acknowledged UPDATE by the re-derived deterministic id and are excluded from batching. **Prevention, not reconciliation.** New rows get a **deterministic logical-key id** (`letterMasteryDomainId`), and `buildSyncPayload` maps **every** `letter_mastery` push to that id. Same record means the same id on every device/install, so insert-by-id is idempotent. `saveLetterMasteryRecord` returns the canonical id so callers track the persisted row; toggling off is also resolved by logical key. A soft-delete/edit whose insert is still queued coalesces into that insert; once synced, soft-delete uses an acknowledged lifecycle UPDATE carrying only `deleted_at`. **Gate completed 2026-07-14:** all 13 staging rows already matched today's deterministic formula. The enduring rollout rule is that no active old build may mint obsolete identities. | Direct owner plus `private.current_user_can_read_child`; writes require active child/programme access | After `children` | `masteryRepository.test.js`; `letterMasterySync.test.js`; `sqlitePlan1Migrations.test.js`; `offlineSyncOutbox.test.js` batch coverage; `offlineSyncUpdateById.test.js` deterministic-id and pending-grant coverage |

Support incident transport uses the device-level `masi:device:installId` (one persisted UUID per
installation, retained across sign-out). The wire repeat key is `<installId>:<repeatKey>` and the
payload adds only `appVersion`, `buildNumber`, `updateId`, `backend` and `installId` from the
release envelope. `getSyncStatus().incidentReadyCount` counts due pending incidents and falls
back to zero on ordinary count failures; stale-actor errors still propagate. OfflineContext uses
that count only to schedule uploads at status refresh, reconnect, foreground and background;
it never adds incidents to the EA-facing unsent/ready counts. Discovery settlement refreshes
status when the published handle's non-rejecting `handle.discovery` promise settles, and
the existing 30-second periodic refresh retries due work without an immediate post-pass loop.

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
Manual and automatic clock-out share `closeOpenTimeEntry`: it reads the still-open row,
writes its close and outbox mutation in one writer transaction, and returns the closed row
(or `null` if it was already closed or missing). Each successful close owns its local sync state:
`sync_status = 'pending'`, `synced = false`, `last_sync_error = null`; an existing insert absorbs
the close, otherwise the edit queues an acknowledged UPDATE. A second close does not enqueue
work or run `onClosed`. The automatic close records its Home notice through `onClosed` in the
same transaction, so the notice and close commit or roll back together. `handleSignOut` resolves
`true` when no open shift remains, including a shift closed by the watchdog while GPS was pending;
busy, cancelled and failed actions resolve `false`. No RLS or payload change.

The phone's ten-hour cap, server forward-only rule and scheduled close are defined under
[Row versions (upload contract)](#forward-only-time-entries-and-ten-hour-job).

Home attention is a handle service using that handle's `localState` repository. The local-only keys
`home_attention.auto_clock_out` and `home_attention.assessment_due_dismissed_on` need no user suffix
because the database file is per-EA; the notice value retains `userId` for support exports.

Automatic clock-out keeps `auto_clocked_out = true`, null sign-out coordinates and null sign-out
status. Existing `time_entries_*_own` policies still scope access to `user_id = auth.uid()`;
the migration grants only SELECT/INSERT/UPDATE on the two added columns. It adds CHECKs NOT VALID
then validates them against existing rows. Apply the hosted migration before releasing the phone
change. The harness seeds legacy open, completed, and auto-closed rows before replaying this
migration and checks preservation, owner writes, non-owner refusal, grants and validation.
Local PostgreSQL execution and hosted application are separate gates; neither is implied by
SQLite or mocked upload tests.


> **`sessions.group_id` is active end to end in B2's producer, payload, server authorization and history contracts.** `saveSession` writes the chosen group on the session and every attendee, validates a queued non-null group against the local Programme, and sends it through `SERVER_COLUMNS`. History retains the parent group id without a local group row; attendee history mapping stays null when absent. Task 5's per-record group dependency gates and EA-scoped owed-assignment evidence are built. Task 6's lost-response retry fix passes real-SQLite/synthetic-server tests; its four new PostgreSQL harness cases remain a controller-owned release gate.
>
> The original forward-prep server migration installed two RESTRICTIVE default pins. B2's canonical `20261021140000_session_group_authorization.sql` replaces those pins with the held-assignment group checks and preserves `state = 'completed'`; it retains the permissive session UPDATE policy `sessions_update_active_assignment_after_attendee`. Hosted application is a separate approved gate, documented in the B2 section above.
>
> **`sessions.state` stays intentionally unsynced and pinned to `'completed'` by B2's restrictive policies.** A later state-machine slice must add per-state authorization and activate the field in producer and push allowlist together. Apply the server authorization migration before releasing client group writes.

> **`assessments.capture_mode` (nullable, included in the family payload).** The historical v4 SQLite and `20260618120000_masi_assessments_capture_mode` server migrations retain the nullable `grid`/`sequential` column without a default. Current standalone letter and word tests always pass `sequential` to `saveQuestionResult`; there is no device capture-mode setting or old summary-item writer. Capture corrections live in the result's `derived.correction_count`, not a synthetic item. v15 clears the old local practice families before this writer is used (see the Task 7 build-log entry). `captureModeMigration.test.js` is retained to test the column and allowlist; it does not restore the deleted capture stack. Hosted deployment of the new family migration is a Task 14 gate, not an old-client upsert compatibility claim.

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

- `src/session/signedInHandle.js`, `handleDataClient.js`, `handleServices.js`, `handleRequestQueue.js`, `staleActor.js`
- `src/context/AuthContext.js`, `src/context/SignedInEAContext.js`, `src/services/authSessionStorage.js`, `src/services/authRequestFetch.js`
- `src/services/offlineSync.js`, `assessmentFamilyPayload.js`, `syncServerColumns.js`
- `src/db/repositories/domainRepositoryUtils.js`
- `src/db/repositories/childrenRepository.js`
- `src/db/repositories/classesRepository.js`
- `src/db/repositories/classOnboardingRepository.js`
- `src/db/repositories/groupsRepository.js`
- `src/db/repositories/sessionsRepository.js`
- `src/services/syncServerColumns.js` (`SERVER_COLUMNS.sessions`, including `group_id`)
- `src/db/migrations.js` v16 `sessions_group_history_reference`
- `supabase/migrations/20261021140000_session_group_authorization.sql`
- `scripts/session-group-postgres-harness.cjs`, `test-support/sessionGroupServer.js`
- `__tests__/sessionGroupAuthorizationMigration.test.js`, `__tests__/sessionGroupSync.test.js`, `__tests__/classifyErrorHardening.test.js`
- `__tests__/sessionGroupHistoryReferenceMigration.test.js`, `__tests__/sessionsHistoryPage.test.js`, `__tests__/sessionHistoryPull.test.js`
- `src/db/repositories/assessmentsRepository.js`, `batteryRunsRepository.js`
- `src/db/migrations.js` v15
- `supabase/migrations/20261021120000_assessment_results_contract.sql`
- `scripts/assessment-results-postgres-harness.cjs`
- `__tests__/assessmentFamilySync.test.js`, `__tests__/assessmentFamilyRpcError.test.js`
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

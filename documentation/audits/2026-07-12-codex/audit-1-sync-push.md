# Sync Push Engine Audit — 2026-07-12

## Summary table

| # | Finding | Severity | Score | Likelihood | Confidence | Effort |
|---|---|---:|---:|---|---|---|
| 1 | Deterministic server errors retry forever and remain non-actionable | P1 | 7 | Occasional | Confirmed | S/M |
| 2 | Backed-off rows trigger a no-op sync pass every 30 seconds | P2 | 6 | Occasional | Confirmed | S |
| 3 | Child hard-delete is not idempotent after a mid-sync crash | P2 | 5 | Rare | Confirmed | S |
| 4 | A failed large batch can fan out into up to 1,000 per-record attempts | P2 | 5 | Occasional | Confirmed | M |
| 5 | One failed parent table delays unrelated records for the whole pass | P2 | 5 | Occasional | Confirmed | M |

## Findings

### 1. Deterministic server errors retry forever and remain non-actionable

- Evidence:
  - [src/services/offlineSync.js:390](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:390) only terminalizes assignment-table `23514`, `23505`, evidence-free `23503`/`42501`, and three local sentinel codes. Everything else reaches [line 428](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:428): `return { terminal: false, markAsSynced: false };`.
  - [src/services/offlineSync.js:381](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:381) caps the delay at 15 minutes, but there is no retry-count cap.
  - [src/services/offlineSync.js:772](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:772) increments `retry_count` and schedules another attempt indefinitely.
  - [src/db/repositories/syncOutboxRepository.js:71](/Users/jimmckeown/Development/masi-app/src/db/repositories/syncOutboxRepository.js:71) selects failed rows again once `next_retry_at` expires.
  - Retriable failures do not make the pass unsuccessful at [src/services/offlineSync.js:1195](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1195), so `lastSuccessfulSyncTime` can still advance at [line 1323](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1323).
  - The UI itemizes only terminal rows at [src/screens/main/SyncStatusScreen.js:146](/Users/jimmckeown/Development/masi-app/src/screens/main/SyncStatusScreen.js:146). Retriable rows appear only as an aggregate “waiting to sync” count.
  - The roadmap itself confirms `PGRST204`, `42703`, `22P02`, `23502`, and generic `23514` remain open at [documentation/archive/improvements-2026-07.md:182](/Users/jimmckeown/Development/masi-app/documentation/archive/improvements-2026-07.md:182).
- Failure scenario: an app release sends a column missing from the live Supabase schema, producing `PGRST204`. A Session or Assessment remains safe locally but never reaches Head Office. It retries every 15 minutes forever, the EA sees calm “waiting” language rather than an actionable error, and “Last Synced” may continue advancing.
- Fix sketch: add an explicit deterministic-error policy for `PGRST204`, `42703`, `22P02`, `23502`, and non-assignment `23514`. Either quarantine them as terminal immediately or move them to a clearly visible long-cap state after a small bounded number of attempts. Keep errors with no code, timeouts, connection failures, and 5xx responses retriable.

### 2. Backed-off rows trigger a no-op sync pass every 30 seconds

- Evidence:
  - [src/db/repositories/syncOutboxRepository.js:243](/Users/jimmckeown/Development/masi-app/src/db/repositories/syncOutboxRepository.js:243) counts both `pending` and `failed` rows in `unsyncedCount`, including failures whose retry time is still in the future.
  - [src/context/OfflineContext.js:48](/Users/jimmckeown/Development/masi-app/src/context/OfflineContext.js:48) automatically schedules sync whenever `unsyncedCount > 0`.
  - [src/context/OfflineContext.js:241](/Users/jimmckeown/Development/masi-app/src/context/OfflineContext.js:241) repeats that status refresh every 30 seconds.
  - The sync pass then excludes the backed-off row through the `next_retry_at` condition at [src/db/repositories/syncOutboxRepository.js:78](/Users/jimmckeown/Development/masi-app/src/db/repositories/syncOutboxRepository.js:78).
  - Even with no ready records, the pass runs the writer transaction for group-ownership repair at [src/services/offlineSync.js:1227](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1227) and writes sync metadata at [line 1320](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1320).
  - The roadmap still lists ready-record gating as open at [documentation/archive/improvements-2026-07-roadmap.md:49](/Users/jimmckeown/Development/masi-app/documentation/archive/improvements-2026-07-roadmap.md:49).
- Failure scenario: one Assessment item hits a temporary server error and receives a 15-minute backoff. During those 15 minutes, a low-end Android phone starts a pointless writer-side sync pass every 30 seconds. This adds battery use and SQLite contention during normal capture even though the row is not eligible for retry.
- Fix sketch: expose `readyCount` or `hasReadyRecords` from the outbox snapshot and auto-trigger only when a pending or failed row is currently eligible. Continue showing backed-off rows in `waitingCount`.

### 3. Child hard-delete is not idempotent after a mid-sync crash

- Evidence:
  - The engine calls `delete_child_if_no_history` and accepts only `data === true` as success at [src/services/offlineSync.js:649](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:649).
  - The RPC requires the child to exist and be writable; an absent child raises `42501` at [supabase/migrations/20260521153217_masi_child_delete_guard.sql:61](/Users/jimmckeown/Development/masi-app/supabase/migrations/20260521153217_masi_child_delete_guard.sql:61).
  - After deleting the child, it returns whether a row was deleted at [supabase/migrations/20260521153217_masi_child_delete_guard.sql:87](/Users/jimmckeown/Development/masi-app/supabase/migrations/20260521153217_masi_child_delete_guard.sql:87).
  - Local success finalization occurs only afterward at [src/services/offlineSync.js:740](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:740).
  - On restart, stranded `in_flight` rows are reset and resent at [src/services/offlineSync.js:1215](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1215) and [src/db/repositories/syncOutboxRepository.js:129](/Users/jimmckeown/Development/masi-app/src/db/repositories/syncOutboxRepository.js:129).
- Failure scenario: the server successfully deletes a newly entered child, but Android kills the app before the local outbox row is deleted. On restart, the RPC is repeated. Because the child is already absent, it returns `42501`; with a live session, the engine records an authenticated terminal denial. The EA sees “Needs Attention” for an operation that already succeeded.
- Fix sketch: make the RPC idempotent by treating an already-absent target as success. Preserve the current authorization and history checks when the row exists.

### 4. A failed large batch can fan out into up to 1,000 per-record attempts

- Evidence:
  - A pass loads up to 1,000 ready rows at [src/services/offlineSync.js:1237](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1237).
  - Batch formation at [src/services/offlineSync.js:1277](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1277) keeps adding every contiguous eligible row without a smaller batch-size ceiling.
  - [src/services/offlineSync.js:690](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:690) builds a second payload array for the full batch.
  - Any returned or thrown batch error falls back to per-record processing at [src/services/offlineSync.js:1101](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1101).
  - The fallback creates one promise per member using `Promise.allSettled` at [src/services/offlineSync.js:1066](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1066). Server calls are serialized by [src/services/supabaseRequestQueue.js:1](/Users/jimmckeown/Development/masi-app/src/services/supabaseRequestQueue.js:1), but all promises and associated SQLite work remain alive.
- Failure scenario: after several offline weeks, a phone reconnects with hundreds of Assessment items or mastery rows. The combined request times out or exceeds an upstream payload limit. The engine then schedules hundreds of per-record operations in one long pass. On a low-end phone this increases memory pressure and makes the sync spinner long-lived; a background kill restarts the work later.
- Fix sketch: chunk server batches and fallback groups to approximately 50 to 100 rows. Finish and finalize each chunk before creating promises for the next one. Retain the 1,000-row ready window if desired.

### 5. One failed parent table delays unrelated records for the whole pass

- Evidence:
  - Failures are tracked only as table names in `failedTables` at [src/services/offlineSync.js:1183](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1183).
  - Any failed record adds its entire table at [src/services/offlineSync.js:1204](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1204).
  - Later rows skip if any dependency table appears in that set at [src/services/offlineSync.js:1244](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1244), without comparing the actual parent ID.
  - Batch candidates use the same table-level check at [src/services/offlineSync.js:1285](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1285).
  - The roadmap confirms record-scoped dependency tracking remains open at [documentation/archive/improvements-2026-07.md:190](/Users/jimmckeown/Development/masi-app/documentation/archive/improvements-2026-07.md:190).
- Failure scenario: one child row fails retriably. Assessments, mastery, and memberships for every other child are skipped for the rest of that connection window because all depend on the `children` table. They normally progress on a later pass once the bad row is backed off, but an EA with intermittent connectivity may lose the opportunity before that pass occurs.
- Fix sketch: track failed `(table_name, record_id)` pairs. Use the existing payload/domain-row FK resolution to skip only rows that depend on the specific failed parent.

## Verified fixed

- Auth gating is landed. `syncAll` checks the Supabase session before database, outbox, metadata, or upload work and returns `skippedNoSession` at [src/services/offlineSync.js:1144](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1144). The focused regression is at [__tests__/offlineSyncAuthGate.test.js:152](/Users/jimmckeown/Development/masi-app/__tests__/offlineSyncAuthGate.test.js:152).
- Supabase session persistence and React Native foreground refresh are configured at [src/services/supabaseClient.js:16](/Users/jimmckeown/Development/masi-app/src/services/supabaseClient.js:16) and [line 109](/Users/jimmckeown/Development/masi-app/src/services/supabaseClient.js:109).
- Mid-pass `42501` handling is hardened. Pending FK or assignment evidence keeps it retriable at [src/services/offlineSync.js:980](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:980); an otherwise-terminal denial is downgraded if the session disappeared, or marked `42501-authenticated:` with a live session at [line 999](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:999).
- Auth restoration requeues user-owned, unmarked historical RLS terminals on `SIGNED_IN`, `TOKEN_REFRESHED`, or sessionful `INITIAL_SESSION` at [src/context/OfflineContext.js:197](/Users/jimmckeown/Development/masi-app/src/context/OfflineContext.js:197).
- July 8 classifier hardening is present. Immutable-assignment `23514` is terminal at [src/services/offlineSync.js:397](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:397), while `23503`/`42501` consult pending local evidence at [line 414](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:414).
- Partial batch failures are isolated. Both returned and thrown batch failures fall back per record, and `Promise.allSettled` prevents one rejected sibling from reverting another sibling’s successful upload at [src/services/offlineSync.js:1066](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1066).
- Normal crash recovery converges. Stranded rows are reset first, and normal writes resend through `upsert(..., { onConflict: 'id' })` at [src/services/offlineSync.js:678](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:678). Generic deletes are also idempotent. The child RPC is the exception reported in Finding 3.
- Immutable assignment inserts remain insert-or-ignore-by-ID only for `child_ea_assignments`, `class_ea_assignments`, and `group_ea_assignments` at [src/services/offlineSync.js:274](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:274) and [line 678](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:678). Archive/update operations remain update-capable.
- Active-pair deterministic IDs match the canonical partial unique indexes:
  - ID helpers: [src/db/repositories/domainRepositoryUtils.js:56](/Users/jimmckeown/Development/masi-app/src/db/repositories/domainRepositoryUtils.js:56).
  - Push remapping, guarded so bare archives retain their original ID: [src/services/offlineSync.js:536](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:536).
  - Server indexes: [supabase/migrations/20260521115412_masi_clean_base_schema.sql:293](/Users/jimmckeown/Development/masi-app/supabase/migrations/20260521115412_masi_clean_base_schema.sql:293) and [supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:224](/Users/jimmckeown/Development/masi-app/supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:224).
- Multi-step domain writes and outbox enqueues remain atomic. Production repository writes run through one `BEGIN IMMEDIATE` transaction at [src/db/client.js:114](/Users/jimmckeown/Development/masi-app/src/db/client.js:114), and `enqueueDomainOutbox` uses the supplied transaction at [src/db/repositories/domainRepositoryUtils.js:105](/Users/jimmckeown/Development/masi-app/src/db/repositories/domainRepositoryUtils.js:105). Confirmed representative paths include:
  - Session plus attendees: [src/db/repositories/sessionsRepository.js:122](/Users/jimmckeown/Development/masi-app/src/db/repositories/sessionsRepository.js:122).
  - Assessment plus items: [src/db/repositories/assessmentsRepository.js:121](/Users/jimmckeown/Development/masi-app/src/db/repositories/assessmentsRepository.js:121).
  - Child plus assignment/enrollment/membership rows: [src/db/repositories/childrenRepository.js:101](/Users/jimmckeown/Development/masi-app/src/db/repositories/childrenRepository.js:101).
  - No enqueue-outside-transaction domain path was found.
- A poison row does not block the entire queue forever. Healthy rows from the same table continue, and only dependent tables are skipped for that pass. A terminal row is excluded from automatic passes and surfaced to the EA. Deterministic retriable rows themselves can loop forever, as reported in Finding 1.

## Docs-vs-code drift

- [documentation/rls-sync-contract-map.md:31](/Users/jimmckeown/Development/masi-app/documentation/rls-sync-contract-map.md:31) says error classification “never loops forever.” Current code contradicts this for `PGRST204`, `42703`, `22P02`, `23502`, non-assignment `23514`, and any other persistent unrecognized error. The same document partially acknowledges this at [lines 52-60](/Users/jimmckeown/Development/masi-app/documentation/rls-sync-contract-map.md:52).
- Ordering is deterministic only inside the selected ready snapshot:
  - `PUSH_ORDER`: [src/services/offlineSync.js:155](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:155).
  - Archive ordering: [src/services/offlineSync.js:255](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:255).
  - Table then `created_at`/ID sorting: [src/services/offlineSync.js:901](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:901).
  - The repository selects the oldest 1,000 before that table sort at [src/db/repositories/syncOutboxRepository.js:78](/Users/jimmckeown/Development/masi-app/src/db/repositories/syncOutboxRepository.js:78). This is not a globally strict queue, although no current capture-flow corruption was found from that boundary.
- Roadmap sync-convergence status is accurate and still open:
  - 11a deterministic-error policy: Finding 1.
  - 11b record-scoped dependency skipping: Finding 5.
  - 11c child-data pull queue granularity remains open in [src/services/preloadedChildData.js:48](/Users/jimmckeown/Development/masi-app/src/services/preloadedChildData.js:48), but pull behavior was outside this audit’s mission.
  - 11d bookkeeping remains open: `markInFlight` performs one update per ID at [src/db/repositories/syncOutboxRepository.js:113](/Users/jimmckeown/Development/masi-app/src/db/repositories/syncOutboxRepository.js:113), batch processing re-reads each ID separately at [src/services/offlineSync.js:1093](/Users/jimmckeown/Development/masi-app/src/services/offlineSync.js:1093), and outbox conflict updates overwrite `created_at` through [src/db/repositories/sqliteRepositoryUtils.js:222](/Users/jimmckeown/Development/masi-app/src/db/repositories/sqliteRepositoryUtils.js:222). The ordering risk is currently latent because the affected grouping-version workflow is deferred.
- The contract map accurately documents two remaining boundaries:
  - A healed terminal parent does not automatically rescue a child already stamped as an authenticated terminal denial: [documentation/rls-sync-contract-map.md:57](/Users/jimmckeown/Development/masi-app/documentation/rls-sync-contract-map.md:57).
  - Membership-mediated assignment grants are not modeled by `GRANT_SUBJECTS`; current direct-child assignment flow makes that branch unreachable today: [documentation/rls-sync-contract-map.md:61](/Users/jimmckeown/Development/masi-app/documentation/rls-sync-contract-map.md:61).

## Open questions

- The live `masi-app-sqlite` schema was not queried. Unique-index and column convergence was verified against today’s canonical `supabase/migrations/` tree only. Given the repository’s documented history of schema drift, the actual hosted indexes and RPC definitions still need a read-only live-schema check.
- Exact hosted Supabase error shapes for an expired or revoked JWT were not observable read-only. Errors without a SQL code, including ordinary timeout/network/5xx shapes, remain retriable. If hosted auth expiry arrives as `42501` and `getSession()` still returns a stale session during the recheck, the request could be mislabeled as a genuine authenticated denial. This is Suspected, not confirmed.
- The mandatory active-pair deployment gate cannot be confirmed from the tree: old random-ID server rows must be removed and pre-fix local databases must be wiped. `ignoreDuplicates` arbitrates `id`, not the partial unique indexes.
- Deterministic immutable-assignment IDs do not support reactivating an archived identical pair: insert-or-ignore would retain the archived server row while local finalization could mark the new active row synced. No reachable production reactivation caller was found, so this remains latent rather than a field finding.
- No tests were run, as required by the read-only audit constraint.


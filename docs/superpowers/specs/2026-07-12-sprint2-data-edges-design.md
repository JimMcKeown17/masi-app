# Sprint 2 Design Spec: Data Edges (audit findings #2, #6, #7, #14)

**Date:** 2026-07-12
**Source:** `documentation/codebase-audit-2026-07-12.md`, Sprint 2 of the suggested sequencing.
**Status:** decisions locked; TDD plan to be written just-in-time against the post-Sprint-1 tree (Sprint 1 touches `OfflineContext.js`, `syncOutboxRepository.js`, and `AuthContext.js`, so plan anchors written today would go stale on merge).
**Scope:** close every data-stranding path the audit found. Four items, four decisions below. Contract-map updates are part of the definition of done for A, B, and D.

## A. Outbox ownership (finding #2, P1/8)

**Problem:** `sync_outbox` rows carry no owner; sign-out leaves them; the next signed-in user's session pushes them; RLS rejects them as `42501-authenticated` terminals that auto-heal explicitly skips. Silent stranding on shared or reassigned devices.

**Decision: materialize ownership as a column, stamped at enqueue, single-sourced from the existing resolver.**

- Additive local SQLite migration (next `CURRENT_SCHEMA_VERSION` bump): `alter table sync_outbox add column owner_user_id text` (nullable). Local-only DDL; no Supabase migration; no server payload change (`owner_user_id` never leaves the device).
- Stamp at enqueue: the ownership inference already exists and is already trusted, the per-table resolver built for the auth-restore requeue (`offlineSync.js` `directOwner`/`viaParentOwner` map, ~447-490). Extract it to a shared module so enqueue and requeue use one source of truth. Enqueue has the payload in hand; `viaParentOwner` tables resolve through the parent row inside the same transaction.
- Readiness and status become owner-scoped: `getReadyRecords` and `getSyncStatus` gain an `ownerUserId` parameter and filter `owner_user_id is null OR owner_user_id = ?`. `syncAll` passes `session.user.id` (it already resolves the session for the auth gate). `OfflineContext` cannot `useAuth` (provider order), but it already subscribes to `supabase.auth.onAuthStateChange`; it keeps a current-user-id ref from those events and passes it through for status counts.
- **NULL = grandfathered:** pre-migration rows keep today's any-session behavior. No SQL backfill (`viaParentOwner` in pure SQL is fiddly and the sqlite backend has no field users; NULL rows exist only on dev devices).
- Rows belonging to a signed-out user simply wait: not ready, not counted in the signed-in user's status, resumed untouched when the owner signs back in. This makes the logout-stranding path structurally impossible, so no logout warning UI is needed.
- Out of scope: multi-profile UI, outbox purge on logout (never), server-side anything.

## B. Deterministic-error retry budget (finding #6, P1/7; roadmap 11a policy decision)

**Problem:** `PGRST204`, `42703`, `22P02`, `23502`, and non-immutable-table `23514` retry at the 15-minute cap forever, invisible except as a calm waiting count, while "Last Synced" advances.

**Decision: bounded retry budget, then needs-attention.**

- Deterministic class: exactly the five codes above. Everything codeless (network, timeout, 5xx) stays retriable forever, unchanged.
- Budget: **8 attempts** (with the existing exponential backoff this spans roughly the first hour and a half). Rationale: `PGRST204` is genuinely ambiguous in this repo's history, it heals when a server migration lands, so it gets a healing window instead of instant terminal; 8 attempts comfortably covers a deploy-in-progress without condemning the record.
- On budget exhaustion: mark terminal with a `deterministic:` reason prefix. Everything downstream already exists: terminal rows are itemized on `SyncStatusScreen` as needs-attention (trust UX), excluded from auto passes, and resurrected by force "Sync Now" (`includeTerminal`). No new UI.
- `retry_count` already exists on the outbox row; the budget check lives in the failure-classification path only. Immutable-assignment `23514` stays immediately terminal (issue #48 behavior, unchanged). The `42501` evidence machinery is untouched.
- Explicitly out of scope: making retriable failures block `lastSuccessfulSyncTime` (trust-UX semantics change, separate conversation); record-scoped dependency skipping (audit #17, later sprint).
- Contract map: rewrite the new limitations bullet (added 2026-07-12) to describe the budget; update Item 10.

## C. Cold-start publish-first (finding #7, P1/7)

**Problem:** `hydrateAuthenticatedUser` awaits `pullReferenceData` (up to seven sequential requests, no timeout in the queue) before `setUser`; a stalled socket holds the startup spinner indefinitely; `__tests__/AuthContext.test.js:111-139` pins the blocking order as expected.

**Decision: publish first, refresh in background.**

- Reorder: `setUser(authUser)` + cached-profile load + `setLoading(false)` happen immediately; `pullReferenceData` and the network profile refresh run after, non-blocking, still guarded by the existing `profileLoadVersionRef`/`isCurrentProfileLoad` cross-user machinery (unchanged).
- No timeout added to the request queue in this sprint; publish-first makes the stall harmless to startup (background refresh just finishes late or fails quietly, exactly like today's post-startup pulls).
- The pinned blocking test flips to pin the NEW contract: user is published while the reference pull is still pending, and the pull is still issued exactly once. The cold-start restore regression (`authColdStartRestore.test.js`) must stay green unmodified.
- Screens already tolerate empty reference caches (today's fast-fail offline path renders with cached/empty lookups), so no screen changes.

## D. Idempotent child delete (finding #14, P2/5)

**Problem (two facets):** (1) the `delete_child_if_no_history` RPC cannot distinguish "child absent" from "not authorized", so a crash between server success and local finalization makes the retry a false `42501-authenticated` needs-attention; (2) a failed delete lets the next pull re-save the server copy because the tombstone suppression only consults unsynced domain rows, and a hard-deleted child has none.

**Decision:**

- **Server:** one Supabase migration amending `private.delete_child_if_no_history`: first check bare existence; an entirely absent child returns `true` (idempotent success). Present-but-unauthorized keeps raising `42501`. History-blocked keeps returning `false`. Public wrapper unchanged. The migration is authored in `supabase/migrations/` by the implementer; **applying it to the live backend is an orchestrator step** (CLI auth is unavailable to agent shells; the orchestrator applies and verifies via the psql path and records the version row exactly as `supabase db push` would).
- **Client:** the children pull merge additionally suppresses server rows whose id has a pending/failed/in-flight `hard_delete` outbox row (children table only; it is the only hard-delete producer). Plumb a `pendingDeleteIds` set into `mergeServerRows` alongside `unpushedRows`; suppression semantics identical to the existing offline-tombstone case.
- Contract map: note the RPC's idempotent-absent semantics in the children row and the delete operation section.

## Sequencing and verification

- One branch per item is overkill here; **two branches**: `improvement/s2-outbox-ownership-and-error-budget` (A+B, both live in the sync engine seam) and `improvement/s2-auth-and-delete` (C+D). Worktree isolation, same loop as Sprint 1: TDD plan just-in-time after Sprint 1 merges, Codex adversarial plan review, binding dispositions, Codex build, orchestrator diff review and gates.
- Integration coverage must be real-SQLite where mocks would hide bugs (per the TDD skill): A's owner-scoping and B's budget-to-terminal transitions get file-backed integration tests through the real outbox repository and sync engine fakes, mirroring `offlineSyncOutbox`/`offlineSyncAuthGate` conventions.
- Device gate (Jim): two-account handover on one device (A captures offline, signs out; B signs in, syncs; A signs back in and drains); a forced `PGRST204` (temporarily add a bogus column to one payload in a dev build) walking through 8 attempts into needs-attention and resurrected by Sync Now; airplane-mode cold start reaching Home instantly.

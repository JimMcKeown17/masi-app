# Sprint 4 Design Spec: Pull Correctness + Facade Retirement (audit findings #4, #9, #19, #20 + #1 link d)

**Date:** 2026-07-13
**Source:** `documentation/archive/codebase-audit-2026-07-12.md` (Sprint 4 of the suggested sequencing), `documentation/archive/improvements-2026-07-roadmap.md` Phase 5 (this is the facade mini-spec that phase requires), handoff `/tmp/masi-app-sprint4-handoff.md`.
**Status:** decisions locked; two TDD plans, one per branch. Plan 4A written now; plan 4B written just-in-time after 4A merges (4A rewrites the exact lines 4B touches).
**Scope:** server removals reconciled into SQLite (#4), per-scope pull errors (#20), domain pull on foreground/reconnect (#9), storage facade retirement + batched pull persistence + re-pull decoupling (#19, roadmap item 9, audit #1 link d). Explicitly NOT: #8 roster virtualization, #11 draft persistence, #13 bootstrap recovery, #16 chunking, #17 record-scoped skipping, #21 OTA guard, pagination, WelaPLUS.

## The load-bearing decision: React state becomes a pure function of SQLite

Today each pull merges server rows into React state in memory (`mergeServerRows`) while separately persisting rows through the facade, because SQLite could not represent server-side removals (audit #4) and facade sidecar reads could race repository rows (audit #19). Once reconcile makes SQLite authoritative for absences and the sidecar is gone, the in-memory merge is redundant: **a pull mutates SQLite (guarded, batched, reconciled), then contexts re-read SQLite.** `mergeServerRows` and its `unpushedRows`/`pendingDeleteIds` context plumbing are deleted, not extended.

Why this is safe, case by case (all already guaranteed at the repository layer):
- Pending local edit: the transaction-scoped pull guard (`serverPullWouldClobberPendingLocal`) keeps the local row; cache re-read shows it.
- Offline tombstone (archive/remove/exit pending): active-only cache reads hide it intrinsically; no suppression list needed in state.
- Pending hard-delete: the owner-scoped `pendingDeleteIds` filter moves from the context merge into the pull persistence path (it already filters before persistence today); server copies are neither saved nor rendered.
- Offline-created rows: `createChild`/`saveClass` write domain + relationship rows locally, so cache reads return them.
- Terminal rows: server copy overwrites in SQLite (guard permits) and the cache read shows it immediately — strictly better than today's documented one-cycle UI divergence.
- Ordering: cache re-read happens once, after ALL scopes persist + reconcile, so join-based reads (`getMyChildren`) see relationship rows.

## A. Facade retirement (finding #19; roadmap item 9 mini-spec) — branch 4A

**Decision: full retirement this sprint, not the interim one-transaction patch.** The facade has 6 importers; roughly two-thirds of its ~70 methods have zero production callers.

Live surface by consumer (verified 2026-07-13):
- `ChildrenContext`: children/groups/memberships CRUD + reads + unsynced reads (20 methods)
- `ClassesContext`: classes CRUD, schools, unsynced classes (7)
- `LookupsContext`: `getJobTitles`/`saveJobTitles` (already thin repository passthroughs)
- `AuthContext`: `getUserProfile`/`saveUserProfile`/`clearUserProfile` (localState passthroughs)
- `ProfileScreen`: `getCaptureMode`/`setCaptureMode` (localState passthroughs)
- `offlineSync`: `setSchools` (inside `fetchAndCacheSchools`, itself a duplicate of `pullReferenceData`'s schools path)
- `assessmentRouting.js`: `getCaptureMode` at launch (imports the facade as `from './storage'`; found by the Codex plan review after the original six-importer inventory missed it — migrates to `deviceSettings` with the profile/capture-mode step)

Migration order (one commit each, test-guarded):
1. **Delete the dead surface**: sessions/assessments/mastery/time-entries methods, sync-meta and sync-queue blocks, `markAsSynced`/`markAsUnsynced`/`getUnsyncedRecords`/`getAllUnsyncedCount`, `ensureChildExists` (the "Unknown Child" landmine) and `ensureSchoolExists`/`ensureClassExists`/`normalize*ForLegacyFacade` where their last caller dies.
2. **`src/services/deviceSettings.js`**: a slim module over `localStateRepository` owning `user_profile` and `assessment_capture_mode` (keys unchanged — no data migration). AuthContext and ProfileScreen consume it.
3. **LookupsContext** → `jobTitlesRepository` direct.
4. **Schools**: `fetchAndCacheSchools` writes via `schoolsRepository.replaceFromServer` directly; `ClassesContext` reads `schoolsRepository.getAll()`; the `storage_payload:schools:list` copy dies.
5. **ChildrenContext** → `childrenRepository`/`groupsRepository`/`syncOutboxRepository` direct (before ClassesContext: it must expose `refreshFromCache` for ClassesContext's archive path to consume — a class archive nulls `children.class_id` in SQLite, and the children state must refresh in the same action or `getChildrenInClass` reads stale linkage).
6. **ClassesContext** → `classesRepository`/`classEaAssignmentsRepository` direct. The facade's `staff_id || created_by` display fallback is deleted, not relocated: verified 2026-07-13 that nothing outside the facade reads `staff_id` off class rows (classes has no local `staff_id` column; the context stamps it on creation for the outbox payload only).
7. **Delete `src/utils/storage.js`** + SQLite migration v7 purging `local_state` rows `where key like 'storage_payload:%'` (one-time sidecar cleanup; additive-safe, local-only).

Shape risk (facade reads stripped nulls/`sync_status` and let sidecar payload fields win): repository `mapDomainRow` rows expose nulls and `sync_status`, and payload-only fields disappear. Mitigation: per-scope shape-pin tests asserting the consumer-visible fields screens actually read (id, names, flags, `synced`, class/group linkage) before and after migration; any real payload-only field found gets promoted to a repository column decision, not silently dropped.

## B. Batched pull persistence + re-pull decoupling (audit #1 link d) — branch 4A

- Each pulled-table repository gains `saveServerRows(rows)`: ONE writer transaction per table, applying the existing per-row save semantics (including the pull-clobber guard and `synced` stamping) inside that transaction. Existing single-row saves keep their signatures for local writes.
- `loadPreloadedChildData` splits into two context functions:
  - `refreshFromCache()` — SQLite reads only → setState. Cheap.
  - `pullFromServer()` — network pull → await `ensureReferenceData()` (single-flight; schools/programmes/academic_years are enforced FK targets of domain rows, and since Sprint 2B auth publishes the user before the reference pull completes, a fresh device could otherwise persist domain rows before their reference parents exist) → batched persistence in dependency order (`classes` → `children` → relationship rows → `groups` → group memberships; the facade's `ensureClassExists` was silently masking the `children.class_id` FK, and an unresolvable `class_id` is nulled per the FK's own `on delete set null` semantics) → (4B: reconcile) → one post-commit state refresh.
  - 4A interim only: the post-commit state refresh applies `mergeServerRows(freshSnapshot, pulledRows)` so server-absent synced rows still leave React state before reconcile exists; the merge must NEVER run against pre-network snapshots (that was finding #19's race). 4B replaces the merge with reconcile + plain cache refresh. 4A alone is non-releasable (remote-change visibility window until 4B's scheduling lands).
- The `isSyncing` true→false effects in ChildrenContext/ClassesContext become `refreshFromCache()` only (synced flags stay honest with zero network/writer cost). Server pulls no longer ride on upload completion — this is the amplifier's link d, delivered structurally.
- `ChildrenListScreen` pull-to-refresh: `await syncNow()` then ONE explicit `pullFromServer()`; the duplicate double-load dies.

## C. Per-scope pull results (finding #20) — branch 4B

`pullPreloadedChildData` returns per-scope results instead of one shared `errors` array:
`{ activeProgrammeId, scopes: { programmeAssignment, children, childEaAssignments, childProgrammeEnrollments, childClassMemberships, classes, groups, groupEaAssignments, childrenGroups } }`, each `{ ok, rows, complete, failureKind: null | 'query' | 'transport' | 'dependency', error? }`.
- Dependency graph (revised with the relationship-specific scopes): `childEaAssignments` is a DIRECT query depending only on `programmeAssignment`; `childProgrammeEnrollments` is a direct query depending on `programmeAssignment` + the acknowledged assigned-children ids from `childEaAssignments` (issued in bounded id chunks, results aggregated and deduplicated; any failed chunk fails the whole scope as `query`; completeness computed over the aggregate); `children`/`childClassMemberships`/`classes` hang off the intersection children query; `groupEaAssignments` rides the groups query's embed. Scopes not attempted because a dependency failed report `failureKind: 'dependency'`.
- An `ok: true` empty scope IS applied: persistence writes nothing and reconcile (D) ends the scope's absentees in SQLite — empty-clearing falls out of the same mechanism instead of the `shouldApplyPulledRows` special case, which dies with `mergeServerRows`.
- `complete`: false when the scope's row count hits the truncation guard (see D). The ClassesContext pull adopts the same per-scope shape.

## D. Reconcile: server removals end locally (finding #4) — branch 4B

**Decision: full pull + reconcile-after-persist. No `updated_at` watermark, now or later, for scope-defining tables — a watermark cannot see removals.** (Watermarks remain an option for append-heavy tables like sessions if pulls are ever added there; decided once, here.)

Mechanics:
- Runs per scope, only when that scope is `ok && complete`, in the SAME writer transaction as that table's batched persistence.
- Reconcile updates are **local bookkeeping of server state**: they stamp the scope's end column with the pull timestamp, keep `sync_status = 'synced'`, and **never enqueue an outbox row** (the server already knows; pushing an archive back would be wrong and RLS-denied).
- Candidate predicate is always: active + `sync_status = 'synced'` + inside the scope the server query acknowledged. **`pending`/`failed` rows are never touched** (offline work wins); **`terminal` rows are never touched** (quarantined, needs-attention UX owns them).
- If a reconcile-ended row is actually still active server-side, the next pull returns it and the save reactivates it (synced-over-synced apply; deterministic active-pair ids land on the same local row). Convergent by construction.

**Relationship-specific acknowledged scopes (2026-07-13 plan-review revision, binding).** The first draft reconciled `child_ea_assignments` from the children intersection query and archived `groups` on assignment-scoped absence. The Codex review proved both unsafe: absence from an intersection (active assignment ∩ active enrollment) cannot identify WHICH relationship ended (HO ending only the enrollment would falsely end a server-active assignment, permanently), and assignment-scoped group absence must never archive the shared group entity (a reassignment is not an archive). The corrected rule: **every reconciled table gets its own directly-queried server scope.** The pull adds two lightweight queries (active `child_ea_assignments` for me, with children embedded for FK-safe persistence; active `child_programme_enrollments` for activeProgramme within my assigned children) and stops stripping `group_ea_assignments` (full rows pulled, persisted, reconciled; `getGroups({userId})` becomes assignment-scoped to match the server's read model). Memberships whose parent group is absent from the acknowledged groups scope are NEVER destructively ended (the server did not acknowledge that scope) — they are scoped out of publication instead (the childrenGroups state read joins visible groups).

| Reconciled table (its own server query) | Acknowledged set | Local rows ended | End column |
| --- | --- | --- | --- |
| child_ea_assignments (direct: active assignments for me, children embedded) | returned assignment ids | my active synced assignments absent from the set | `unassigned_at` |
| child_programme_enrollments (direct: active, `programme_id = activeProgramme`, `child_id` in my acknowledged assigned children) | returned enrollment ids | active synced enrollments in that exact scope absent from the set | `ended_at` |
| child_class_memberships (active, for the children query's returned child ids) | returned membership ids | active synced memberships whose `child_id` is in the returned children set and whose id is absent | `exited_at` |
| group_ea_assignments (embedded full rows in the groups query: active, mine, programme-scoped) | returned assignment ids / group ids | my active synced group assignments for activeProgramme whose `group_id` is absent from the acknowledged groups | `unassigned_at` — never `groups.archived_at` (server-archived groups arrive WITH their tombstone; the query has no archived filter) |
| child_group_memberships (active, for returned group ids) | returned membership ids | active synced memberships whose `group_id` is in the returned groups set and whose id is absent | `removed_at` |
| class_ea_assignments (ClassesContext pull: active for me + programme, two-stage so no-programme, zero-classes, and query-error are distinct states) | returned class ids | my active synced class assignments for activeProgramme whose `class_id` is absent | `unassigned_at` — never `classes.archived_at` (class rows are shared via children's memberships) |

Deliberate non-targets (4B reconciles ONLY the scope-defining roster relationships above; claiming more would be dishonest):
- `children`, `classes`, and `groups` entity rows are never archived by reconcile — server-archived entities arrive WITH their tombstones (none of the pull queries filter `archived_at`); absence means relationship loss and is handled by the relationship rows. A server-hard-deleted child (no-history RPC) disappears via the ended assignment; the orphaned local row is invisible and harmless.
- Memberships of groups absent from the acknowledged groups scope are not ended (unacknowledged scope); they are excluded from published state by the visible-groups join and converge when the group's fate clarifies on a later pull.
- No active programme returned: skip all reconcile (log). Programme-loss visibility is already handled by `pullReferenceData`'s user-scoped destructive replacement of `staff_programme_assignments` — `getMyChildren` joins it, so the roster empties from cache without reconcile guessing.
- Reference-table hard deletes (schools, teachers, job titles...) are NOT reconciled (only `staff_programme_assignments` has destructive scoped replacement); a server-deleted school can remain selectable locally until a broader reference strategy lands (follow-up).
- Server-side deletions of synced sessions/assessments are NOT reconciled; history screens read SQLite and retain them offline. They cannot resurrect roster entities (`getMyChildren` requires the active relationship chain). Whether historical retention is a feature or a gap is a product decision recorded for follow-up.

Safety rails against mass-archive:
- **Errored scope → no reconcile** (finding #20's plumbing is the prerequisite, which is why they land together). Scope results carry `failureKind: null | 'query' | 'transport' | 'dependency'` so callers can distinguish an RLS/query error from a network failure.
- **Truncation guard:** if a scope returns ≥ `PULL_SCOPE_COMPLETENESS_LIMIT` (1000) rows, treat it as possibly server-capped (PostgREST max-rows): persist rows, skip reconcile, log. Pagination is the future fix if this ever fires; real rosters are ~60 children.
- **Mass-end circuit breaker with an explicit recovery path:** a scope whose reconcile would end MORE than 10 rows AND more than 50% of its local active synced candidates skips the reconcile, logs loudly, and persists a durable breaker note (in `sync_state`) that the SyncStatusScreen surfaces as a needs-attention card ("Large roster change from Head Office is waiting"). The user applies it deliberately (one-shot authorized reconcile: the next pull runs that scope with the breaker bypassed). A legitimate whole-cohort handover therefore converges through one explicit confirmation instead of silently never; a silent RLS under-return still cannot become durable local archives without a human in the loop.
- RLS under-return is otherwise indistinguishable from removal client-side (`{ data: [], error: null }` is exactly what a broken SELECT policy returns). The breaker plus the per-scope gate plus the RLS contract tests/probes are the current defense; a **server-authoritative acknowledgment RPC** (one server transaction returning the acknowledged sets with an explicit completeness claim) is the recorded follow-up hardening, filed as an issue at sprint wrap. Documented in the contract map as a standing hazard of reconcile.
- **Reconcile failures are observable:** the batch runtime returns `{ applied, skipped, failed, ended, fallbackUsed, reconcileCompleted }` and logs the original batch error; the per-row fallback path never reconciles, and a scope whose reconcile did not complete does not advance the staleness stamp.
- Known interplay (documented, accepted): a child whose only change is losing its class membership disappears from My Children locally (`getMyChildren` requires an active membership + non-archived class) even though the server still returns the child. Pre-existing local-visibility rule, not a reconcile regression.

## E. Pull scheduling (finding #9) — branch 4B

- **Staleness threshold: 15 minutes**, one constant, applied to BOTH reconnect and foreground triggers. Sign-in and pull-to-refresh bypass it.
- Trigger inventory (complete): (a) user publication (existing mount effect); (b) pull-to-refresh; (c) offline→online transition when stale; (d) foreground when stale; (e) sync completion → `refreshFromCache()` only, never a server pull.
- Plumbing: staleness bookkeeping uses the EXISTING `sync_state` table via `syncStateRepository.getPullState`/`setPullState` (whose code comment already reserves it for domain pulls). Each context stamps its own scope (`child_data_pull`, `classes_pull`) with `lastPulledAt` on successful pull completion; `OfflineContext` (already owns the NetInfo/AppState listeners) reads both stamps on foreground/reconnect, and if either is older than the threshold bumps a `domainPullNonce` in its context value; ChildrenContext and ClassesContext subscribe to the nonce and run `pullFromServer()`. No new clock module; survives restarts for free.
- Single-flight is USER-KEYED: the in-flight ref stores `{ userId, promise }`; concurrent triggers join only when the requested user matches, a user transition starts its own queued pull, and the `finally` clears the ref only when it still holds that exact promise (an old user's completion must not clear a newer user's in-flight state). The nonce subscription initializes a previous-nonce ref from the initial value so mount does not double-pull on top of the user-publication effect.
- The staleness stamp advances only for a pull with no `transport` failure and, for scopes that requested reconcile, `reconcileCompleted: true`.

## F. Sequencing, verification, and definition of done

**Two branches, sequential** (4B's anchors are 4A's output):
- `improvement/s4a-facade-retirement`: sections A + B. Gate: full unit + integration suites; per-table transaction-count budgets via the Sprint 3 counting adapter (N pulled rows = 1 writer transaction per table); shape-pin tests green; migration v7 pin test.
- `improvement/s4b-pull-reconcile`: sections C + D + E. Gate: full suites; real-SQLite reconcile integration tests (file-backed, per the TDD skill — mocks would hide transaction/guard bugs) including: the killer scenario (HO ends class assignment → pull → simulated restart → class stays gone offline), pending-row immunity, terminal-row immunity, errored-scope no-op, truncated-scope no-op, empty-scope clearing, multi-programme enrollment isolation, reconcile-then-reassign reactivation.
- Contract map (in-branch, both): 4A rewrites the facade bullet in "Pull Merge Invariant" (sidecar gone, batched apply); 4B rewrites the section as "Pull Persistence, Merge & Reconcile" with the semantics table above and the invariants (synced-only, no-outbox, per-scope gating, truncation guard, mergeServerRows removed).
- `documentation/sqlite-refactor-log.md` row per work session; PRD progress checklist; LEARNING.md addendum on the state-as-function-of-SQLite decision at wrap.
- Device gate (Jim, after both merge): two-device head-office-removal test — end an EA's class assignment (or archive a class + unassign) at HO, pull on device, force-quit, reopen offline: the class must stay gone; same for a child assignment and a group; roster change at HO appears after reconnect/foreground without any local write; offline capture flows unchanged.

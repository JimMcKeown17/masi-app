# Field-App Capability Ledger

**Standing capability-and-evidence ledger. Updated 2026-08-27 after the session-history authorization tracer.**

This ledger answers whether a narrowly defined field-app capability exists, which invariants govern
it, where its implementation lives, what evidence has actually been earned, and what one verifier
could change confidence next. It is not a feature backlog. Execution priority remains in
[`ROADMAP.md`](./ROADMAP.md); historical evidence remains in [`build-log.md`](./build-log.md).

## Controlled vocabulary

Implementation status:

- `implemented` — all presently defined behavior exists in source; says nothing about release.
- `partial` — a meaningful subset exists, but an identified invariant/scope/recovery path is absent.
- `planned` — desired and defined enough to describe; production implementation absent.
- `deferred` — intentionally waiting on a prerequisite decision or workflow.
- `retired` — intentionally superseded; name the replacement.
- `not-applicable` — outside this product, with a reason.

Portfolio decision:

`preserve`, `harden`, `adapt`, `verify-first`, `blocked-on-ADR`, `extract-later`, or `do-not-share`.

Evidence levels:

| Level | Meaning |
|---|---|
| E0 — assumption | Believed but not inspected/tested; assumption must be named |
| E1 — source-reviewed | Current source/contracts inspected at a named ref |
| E2 — unit/contract | Deterministic test passed in a recorded run |
| E3 — real SQLite | Real local engine/transaction/constraint behavior passed |
| E4 — PostgreSQL/hosted contract | Intended live/disposable backend, RLS, RPC, index, or migration behavior verified |
| E5 — device | Installed binary/OTA exercised on physical hardware |
| E6 — populated-data/recovery | Realistic retained data, reinstall, second device, or force-stop convergence proved |
| E7 — field no-recurrence | Field observation supports a dated no-recurrence claim |

Capability evidence is component-scoped, never a readiness shortcut. A prerequisite's E4 proof is
not E4 proof of an unbuilt capability. Historical evidence that no longer identifies the current
estate is marked `needs-refresh`. Evidence entries remain separate because E4 does not imply E5,
and E5 does not imply recovery or field behavior.

## Current capabilities

| ID | Capability | Invariants | Status | Capability evidence | Decision | Known limit | Next independent verifier |
|---|---|---|---|---|---|---|---|
| CAP-001 | Exact estate, backend, and release identity | P-09, P-24, P-25 | partial | E4 current; historical E5 `needs-refresh` | verify-first | Forward backend/EAS known; production profile is cutover-sensitive; legacy and installed-device/store estate incomplete | Authorized legacy count probe plus App Store/Play/device inventory |
| CAP-002 | Actor attribution and positive authority | P-01–P-05 | partial | E4 disposable candidate; hosted session gate open | harden | Session branch candidate is locally proven but uncommitted pending aggregate-privacy choice; assessment current-year semantics/predicate remain open | Decide session aggregate boundary, then commit/apply and run hosted actor/RPC matrix |
| CAP-003 | Session/assessment atomic local aggregate plus durable outbox | P-06, P-07, P-10, P-13 | implemented | E3 | preserve | Does not claim every repository republishes through a fresh SQLite read; server-family atomicity and physical force-stop are not universal | Device force-stop at parent/child/outbox boundaries |
| CAP-004 | Session/attendee history hydration | P-16–P-21, P-27, P-28 | planned | E1 hydration; prerequisite branch candidate has E4 disposable evidence | adapt | Aggregate boundary undecided; parent page/RLS uncommitted and not hosted; no deadline, attendee pager, SQLite persistence, completeness state, or mobile pull | Privacy decision and hosted RPC gate, then populated two-device vertical slice |
| CAP-005 | Assessment/item history hydration | P-16–P-21, P-27, P-29 | planned | E1; E4 current/nonconforming policy inspection | adapt | No inbound pull; year scope, existing class-assignment integration, and item correction identity unresolved | Hosted current-year class-scope family test |
| CAP-006 | Durable incidents and release provenance | P-22–P-25 | partial | E2 | harden | Sentry/local export exist; no durable causal incident ledger/read-action loop | Repeated incident across force-stop yields one support-actionable record |
| CAP-007 | Bounded, complete, fleet-safe pulls | P-16, P-18–P-21, P-25 | partial | E3 roster rails; E4 disposable session-page candidate | harden | Candidate RPC keyset-pages parents, but no mobile page loop/deadline, attendee pager, jitter, or kill switch | >cap hosted fixture plus hung-request recovery |
| CAP-008 | Programme/group identity and concurrency policy | P-03–P-05, P-27, P-28 | partial | E3 | blocked-on-ADR | Programme model exists; group generation/two-writer semantics and session group persistence incomplete | Two-writer ADR and PostgreSQL/SQLite conflict matrix |

## CAP-001 — Exact estate, backend, and release identity

Source ownership:

- [`app.config.js`](../app.config.js)
- [`eas.json`](../eas.json)
- [`config/supabaseProjectConfig.js`](../config/supabaseProjectConfig.js)
- [`DEPLOYMENT.md`](../DEPLOYMENT.md)
- [`pre-live-gate0-audit-2026-08-27.md`](./pre-live-gate0-audit-2026-08-27.md)

Evidence:

- E1: source identity and target guards reviewed at `2f6b903`.
- E2/E3: post-push GitHub unit and real-SQLite workflow passed at the exact merge SHA.
- Hosted release metadata: EAS project/build/update identity inspected read-only on 2026-08-27.
- E4: live forward PostgreSQL project/migrations/counts inspected read-only on 2026-08-27.
- Historical E5 `needs-refresh`: the build log records one 1.3.0 TestFlight installation on
  2026-07-23; no current fleet or current installed-binary identity is established.

Non-claims: no direct Play delivery proof; no present installed-device inventory; legacy backend
unprobed without explicit authorization. Review when any profile, runtime, channel, backend target,
store track, or release process changes.

## CAP-002 — Actor attribution and positive authority

Source ownership:

- [`src/db/repositories/outboxOwnership.js`](../src/db/repositories/outboxOwnership.js)
- [`src/db/repositories/syncOutboxRepository.js`](../src/db/repositories/syncOutboxRepository.js)
- [`documentation/rls-sync-contract-map.md`](./rls-sync-contract-map.md)
- [`docs/adr/0005-assessment-delivery-scope-two-tier-access.md`](../docs/adr/0005-assessment-delivery-scope-two-tier-access.md)

Evidence:

- Owner-scoped queue, user-switch gates, and positive assignment helpers exist in source/tests.
- At source baseline `2f6b903`, the 2026-08-27 GitHub run `33128554546` passed the complete unit and
  real-SQLite gates. Live RLS/function inspection on 2026-08-27 earned E4 for current behavior, but
  exposed a conformance failure:
  session and assessment parent/child policies reuse a general child-read helper whose class/group
  arms do not match the accepted per-activity scopes.
- On the current authorization branch, migrations
  `20260828004500_history_session_authorization_scope.sql` and
  `20260828010000_delivery_history_session_page.sql` earned E4 against a disposable PostgreSQL 17
  database: owner, current/former delivery, class-only, group-only, unrelated, complete-family,
  same-connection actor switching, microsecond cursor, and same-tuple exhaustion cases pass. The
  aggregate boundary still needs Jim's decision. This is working-branch/disposable evidence, not
  committed or hosted evidence.
- Grandfathered null-owner outbox rows remain a documented pre-v6 compatibility exception.

Next verifier: decide the aggregate boundary, commit and apply the resulting session migrations to
the exact forward backend, then repeat the actor, RPC, privilege, and plan matrix through
authenticated hosted paths. Assessment still requires its class-move/year decision, implementation,
and prior-year matrix. Review whenever an assignment,
RLS helper, lifecycle command, or actor source changes.

## CAP-003 — Session/assessment atomic local aggregate and durable outbox

Source ownership:

- [`src/db/client.js`](../src/db/client.js)
- [`src/db/repositories/repositoryRuntime.js`](../src/db/repositories/repositoryRuntime.js)
- [`src/db/repositories/sessionsRepository.js`](../src/db/repositories/sessionsRepository.js)
- [`src/db/repositories/assessmentsRepository.js`](../src/db/repositories/assessmentsRepository.js)
- [`src/services/literacySessionPersistence.js`](../src/services/literacySessionPersistence.js)

Evidence: at source baseline `2f6b903`, the 2026-08-27 GitHub run `33128554546` passed the full unit
and real-SQLite gates, including repository coverage for serialized writes, FKs,
parent/child/outbox transactions, rollback, and local CAS behavior. Preserve this architecture.
The shared portfolio asset is the contract and failure attack; repositories/schemas remain
app-owned. This row is deliberately narrow: it does not claim that every context/repository path
already satisfies P-08's fresh-read publication rule.

Next verifier: interrupt session and assessment persistence after each family boundary on a real
device, force-stop, reopen, and prove there is neither accepted work without an outbox intent nor an
intent without durable domain state.

## CAP-004 — Session and attendee history hydration

Source ownership/prerequisites:

- [`src/db/repositories/sessionsRepository.js`](../src/db/repositories/sessionsRepository.js)
- [`src/services/preloadedChildData.js`](../src/services/preloadedChildData.js)
- [`documentation/rls-sync-contract-map.md`](./rls-sync-contract-map.md)
- [`CONTEXT.md`](../CONTEXT.md)

Local aggregate capture, outbound ordering, and server schema exist. No Supabase-to-SQLite pull
exists for either family. The live 2026-08-27 RLS/plan probe exposed the prerequisite defect; the
working-branch correction and parent-page RPC now have E4 disposable PostgreSQL evidence. They are
uncommitted pending the aggregate-privacy decision, neither migration is hosted, and prerequisite
E4 is not evidence of hydration.

The intended scope is Programme plus delivery-history authority, not capturer-only and not broad
class/group child visibility. Absence must not delete history. The source RPC now defines a bounded
descending `(session_date, created_at, id)` parent cursor. On a hostile 2,000-session disposable
fixture, the raw RLS query visibly removed 2,003 candidates and its root plan reported 14,311 shared
blocks; the RPC's opaque `Function Scan` root reported 803 blocks while returning the same one
authorized row. That root-only comparison is a deterministic local regression tripwire, not proof
of the RPC's inner index plan or a hosted latency SLO. Mobile deadlines, set-wise attendee paging,
family completeness, and persistence remain undefined/unbuilt. Cursor timestamps must remain raw
server ISO strings so JavaScript millisecond conversion cannot erase PostgreSQL microseconds.

Next verifier: hosted apply plus authenticated RPC/privilege/plan proof, then bounded attendee
pages, request deadlines, pending-local-wins, no absence reconcile, fresh-SQLite publication,
reinstall, second device, force-stop, prior capturer, and revocation.

## CAP-005 — Assessment and item history hydration

Source ownership/prerequisites:

- [`src/db/repositories/assessmentsRepository.js`](../src/db/repositories/assessmentsRepository.js)
- [`src/db/repositories/domainRepositoryUtils.js`](../src/db/repositories/domainRepositoryUtils.js)
- [`docs/adr/0005-assessment-delivery-scope-two-tier-access.md`](../docs/adr/0005-assessment-delivery-scope-two-tier-access.md)

Current E1 claim at `2f6b903`: local parent/items, outbound ordering, live schema, and
parent-derived item RLS exist; inbound hydration does not. The live 2026-08-27 RLS/schema probe is
E4 prerequisite evidence, not evidence of hydration. Target visibility is current-year class
scope. Current RLS is not year-bounded. `ClassesContext` already hydrates active class assignments,
but the assessment-capable wider-roster/history path does not yet consume that durable state
through one canonical SQLite scope query.

Assessment item deterministic identity currently includes correctness while PostgreSQL permits
only one non-null position per assessment. This is coherent only if submitted attempt evidence is
immutable. Correction/resume behavior needs an ADR before a generic Battery/Run or shared package.

Next verifier: after the authority and identity decisions, hydrate a complete parent/item family
through bounded keyset pages with request deadlines, real SQLite, and hosted RLS; prove incomplete
items cannot present a complete assessment or establish mastery.

## CAP-006 — Durable incidents and release provenance

Source ownership:

- [`src/services/observability.js`](../src/services/observability.js)
- [`src/utils/runtimeDiagnostics.js`](../src/utils/runtimeDiagnostics.js)
- [`src/utils/debugExport.js`](../src/utils/debugExport.js)

Current claim: privacy-hardened Sentry, runtime/backend diagnostics, local logs, and SQLite support
export exist. E2 comes from the 2026-07-21 Sentry/privacy TDD record in `build-log.md` (focused 7
suites / 24 tests, followed by the full unit gate). Deduplication is process-local; no durable
incident identity, idempotent server receipt, support reader/action, or retention contract survives
restart.

Next verifier: produce the same terminal/reconcile event across force-stop and restart; verify one
durable, privacy-safe incident with stable identity, first/last seen, exact release/backend/actor
provenance, and a named safe action.

## CAP-007 — Bounded, complete, and fleet-safe pulls

Source ownership:

- [`src/services/preloadedChildData.js`](../src/services/preloadedChildData.js)
- [`src/context/ChildrenContext.js`](../src/context/ChildrenContext.js)
- [`src/db/repositories/syncStateRepository.js`](../src/db/repositories/syncStateRepository.js)

Current claim: existing roster scopes treat 1,000 returned rows as possibly truncated, withhold
successful pull stamps, protect unsynced local rows, and refuse unsafe reconcile. These current
rails have real-SQLite E3 evidence in the July build-log records and the 2026-08-27 full integration
run. A working-branch session-parent RPC now has disposable E4 evidence for bounded keyset traversal
through 2,004 rows sharing hostile cursor boundaries, but there is no mobile page loop, structural
request deadline, dependent attendee pager, full jitter, or remote kill switch. Traversal
completeness is per Programme and is not a cross-request database snapshot. The live PostgREST cap
was not exposed by its database GUC and remains unverified.

Next verifier: a disposable hosted scope larger than the configured page size plus a deliberately
hung request; prove every page exactly once, incomplete/expired scopes never reconcile, fair request
queue recovery, and fleet triggers do not synchronize.

## CAP-008 — Programme/group identity and concurrency

Source ownership:

- [`CONTEXT.md`](../CONTEXT.md)
- [`docs/adr/0001-group-reconciliation-via-versioning-and-staging.md`](../docs/adr/0001-group-reconciliation-via-versioning-and-staging.md)
- [`documentation/group-session-workflow.md`](./group-session-workflow.md)
- [`src/db/repositories/groupsRepository.js`](../src/db/repositories/groupsRepository.js)

Programme identity and several assignment/version tables exist. The current workflow remains
child-first, group generation/collision semantics are incomplete, and `sessions.group_id/state` are
not end-to-end active. The local schema can hold them, but the session repository and server
allowlist omit them while RLS pins the server defaults.

Next verifier: settle and behavior-test identity across class, Programme, academic year, and
generation with EA and Head Office as concurrent writers. Do not extract a grouping package from
superficial table-name similarity.

## Anti-drift rules

1. One row owns one semantic capability boundary, even when several tables implement it.
2. Implementation status and evidence are separate. Never use `done`, `working`, or `safe`.
3. Every source claim links to current owning code/contract; every evidence claim records date,
   ref/build, verifier, and level.
4. Unknown is a valid result. Do not turn no active use into no installed/data estate.
5. A test file is potential proof; a recorded passing run is evidence.
6. Change the row in the same branch when producer, schema, RLS, RPC, payload, ordering, recovery,
   release identity, or product meaning changes.
7. `Next independent verifier` is one falsification target, not an implementation checklist.
8. Evidence is append-only and decays when its environment/contract changes; mark `needs-refresh`.
9. Issues, ADRs, migrations, and runbooks that change a capability link back to its `CAP-xxx`.
10. Runtime extraction stays `extract-later` until two shipped consumers satisfy invariant P-31.

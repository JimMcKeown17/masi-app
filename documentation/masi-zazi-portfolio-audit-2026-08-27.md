# Masi/Zazi Field-App Portfolio Audit

**Point-in-time strategic audit. Evidence captured 2026-08-27.**

This document preserves the first portfolio-level comparison of the Masi and Zazi iZandi mobile
systems, their connected backends, and the field lessons accumulated in Zazi. It is a decision
baseline, not a claim that every recommendation below has been implemented. Current implementation
status remains in [`build-log.md`](./build-log.md); outstanding work remains in
[`ROADMAP.md`](./ROADMAP.md); reusable portfolio rules live in
[`field-app-portfolio-invariants.md`](./field-app-portfolio-invariants.md).

## Executive conclusion

Masi should not become a copy of Zazi. It should become the second implementation of a deliberate
field-app reference architecture.

The highest-value transfer is not a directory of source files. It is the set of invariants, failure
models, verification attacks, operational evidence levels, and release guardrails that Zazi learned
through real field use. Masi already has several foundations worth preserving, especially its
serialized SQLite writer, normalized Programme-aware model, durable outbox, transactional pull
persistence, pending-local-wins behavior, and reconcile safety rails. Replacing those with Zazi's
exact implementation would discard useful work and import assumptions that do not fit Masi.

The portfolio sequence is therefore:

1. State each reusable safety property as an invariant.
2. Give the invariant a transport-neutral conformance test or verification attack.
3. Implement an app-specific adapter around the app's real domain, identity, and authorization
   model.
4. Prove it through the relevant evidence layers: source/local, real SQLite, real PostgreSQL,
   hosted, device, populated-data, and field recovery.
5. Extract a runtime package only after a second real consumer proves that the responsibility is
   actually the same.

This avoids two opposite mistakes: independently rediscovering Zazi's failures in Masi, and
prematurely forcing two materially different products through one generic framework.

## Why the timing matters

Jim confirmed on 2026-08-27 that no staff are currently using the Masi app. Staff want to launch it
soon, so this is an unusually valuable pre-live hardening window: structural changes, schema
corrections, backend resets, destructive test fixtures, and architecture experiments are much
cheaper now than after trusted work accumulates on phones.

That fact lowers the compatibility cost, but it does not eliminate the need for an estate check.
"No active users" does not, by itself, prove that there are no old binaries installed, no test or
pilot records in either Supabase project, no stale credentials, or no automation aimed at the
legacy backend. Gate 0 below verifies the exact estate before we exploit the window.

## Scope and evidence baseline

The audit was read-only. It did not change application code, database schema, hosted data, build
configuration, releases, or devices.

The compared source baselines were:

| System | Repository | Audited ref |
|---|---|---|
| Masi mobile | `/Users/jimmckeown/Development/masi-app` | `main` at `b0ddec00937f946cb0c38a374b4ba2e85e45c8c4`; preservation branch at `75eb0a8fe712dc9f7c151fec6ecf4e76eba201d3` before this audit was written |
| Zazi mobile | `/Users/jimmckeown/Development/zazi-izandi-app` | `origin/main` at `e50df3a3` |
| Zazi Django/backend | `/Users/jimmckeown/Development/Zazi_iZandi_Website_2025` | `1e89d02e` |
| Zazi Next.js frontend | `/Users/jimmckeown/Development/Zazi_iZandi_Website_2026` | `9b9ca667` |
| Masi Django/backend | `/Users/jimmckeown/Development/Masi_Website_2026/backend/Masi Web Main` | `e35cbf30` |

The two-month Git-history scale explains why a conceptual audit was necessary:

| Repository | Commits since 2026-06-27 | First-parent commits |
|---|---:|---:|
| Zazi mobile | 1,196 | 676 |
| Zazi Django/backend | 145 | 127 |
| Zazi Next.js frontend | 159 | 117 |
| Masi mobile | 195 | 60 |

Zazi's current bug registry contained 31 records: 7 P0, 20 P1, and 4 P2. At the audit snapshot,
24 were confirmed; 15 were released; 2 were fixed in code; 1 was in progress; 1 had a fix proposed;
and 12 had no fix proposed. Fourteen were locally tested, 3 had closed end-to-end reproduction, 1
was field verified, and 13 were not tested. Those categories are intentionally not collapsed:
recorded, diagnosed, fixed, released, installed, recovered, and field verified are different claims.

Zazi's current build log recorded 348 active Jest suites with 4,390 tests, plus 70 real-SQLite
suites with 1,844 tests. Masi's fresh audit runs passed 188 suites/1,179 tests in the ordinary Jest
gate and 32 suites/304 tests in the real-SQLite integration gate; both emitted the existing Jest
open-handle notice. These are source/local and real-engine claims, not device or field proof.

A scoped path comparison found 83 common source/configuration paths. Only one was byte-identical;
82 differed. Of 49 common test paths, none was byte-identical. The signal is clear: the apps share
concepts and failure modes much more strongly than they share drop-in source code.

## Independent Opus consultation

The `consult-claude` workflow requested Opus with `xhigh` reasoning. The local CLI resolved that to
`claude-opus-5`; two bounded consultation turns completed without writing files or changing Git.

Opus's most valuable formulation was:

> A projection or read model must not become the authorization substrate for the data that creates
> that projection.

That captures several Zazi failures at once. An app cannot safely decide whether a server row is
authorized, removable, or suspicious by consulting a cache that the same pull/reconcile operation
can lag, truncate, or delete. Authority needs a positive, durable source such as an active
assignment ledger or a server-validated command.

The consultation also produced a useful split comparison:

| Area | Masi's stronger current base | Zazi's stronger current evidence |
|---|---|---|
| SQLite writes | Persistent serialized writer and explicit transaction boundary | More failure-driven integration attacks across a larger runtime |
| Data model | Programme-aware normalized schema | More mature assignment and lifecycle behavior under field pressure |
| Pull/reconcile | Fresh SQLite publication, pending-local-wins, positive completeness, mass-removal breaker | Pagination, actor/database-epoch isolation, causal drop evidence, broader pull surfaces |
| Push protocol | Durable owner-scoped outbox, dependency ordering, local CAS | Mutation envelopes, receipts, record heads/generations, bundle RPCs, runtime protocol authorization |
| Operations | Useful local support/database exports | Durable incident channel, release provenance, recovery taxonomy, established evidence vocabulary |
| Product use | Pre-live freedom to change fundamentals | A month of real field use and dozens of concrete failure modes |

We accepted Opus's recommendations to share invariants before code, complete history hydration
first, add an incident/provenance lane before the pilot grows, and delay an assessment package until
Masi's Battery/Run model has been proven. We modified the broad claim that Masi was simply
"structurally ahead": Masi is ahead in important local foundations, while Zazi is ahead in causal
protocol, release, support, and field evidence. We rejected one proposed circuit-breaker concern
after source inspection showed Masi upserts one `sync_state` row per scope rather than accumulating
duplicate breaker rows. We also demoted `TIME_ENTRIES` from an immediate causal-protocol slice to an
optional, low-risk shadow tracer; the first real aggregate candidate should be sessions, with
assessments following only after their future shape is settled.

## The portfolio architecture

The cleanest mental model has four layers.

| Layer | Responsibility | Sharing policy |
|---|---|---|
| Portfolio operating system | ADR vocabulary, invariant catalog, capability matrix, evidence ladder, incident/release conventions, package graduation rules | Share now as maintained documentation and review discipline |
| Protocol specifications and conformance | Mutation/retry/pull/reconcile contracts, typed outcomes, fixtures, failure attacks, PostgreSQL and SQLite harness expectations | Share next; keep transport-neutral |
| App adapters | Table descriptors, serializers, repositories, RLS, RPCs, scope builders, migrations, conflict rules | App-owned; implement against shared contracts |
| Product domains | Programme semantics, literacy/group workflows, assessments, mastery, lifecycle meaning, admin/reporting language, UI | App/nonprofit-owned unless repeated evidence proves otherwise |

This is a reference architecture, not a single inheritance tree. A future nonprofit app should be
able to adopt the contracts and evidence gates without inheriting Zazi's tables or Masi's Programme
model.

## Audit rubric for every conceptual piece

Every capability should be evaluated with the same questions:

1. What user outcome does it protect or enable?
2. What is the authoritative source of truth?
3. Which actor owns the data, and when can authority be revoked?
4. What is the stable identity and idempotency key?
5. What must be atomic locally?
6. What must be atomic on the server?
7. What happens if the server accepted the write but the reply was lost?
8. What happens if another writer changes the same aggregate?
9. What makes a pull scope positively complete?
10. When may absence imply deletion or ending?
11. Which local states must survive a destructive reconcile?
12. What are the retry, blocked, needs-attention, and superseded exits?
13. What can support staff observe without accessing sensitive content?
14. Which release/runtime identity produced the behavior?
15. What evidence exists at each verification layer?
16. Is the responsibility genuinely identical in two apps, or merely similar in name?

## Capability matrix

This is the 30,000-foot portfolio map. Each row should eventually acquire links to code,
conformance tests, ADRs, and evidence in both apps.

| Capability | Masi today | Zazi lesson/evidence | Recommendation | Reuse boundary |
|---|---|---|---|---|
| Identity and actor provenance | Supabase auth plus owner-scoped local rows | Actor drift and shared-device risks require authoritative actor capture and database-epoch isolation | Preserve Masi owner scoping; add actor provenance inside every mutation transaction | Shared contract; app auth adapter |
| Programme and assignment authority | Programme is first-class; several assignment ledgers exist | Projections cannot grant/revoke their own authority; lifecycle and assignment must move together | Settle assignment-vs-projection ADR before group work | Domain-specific model; shared authority invariant |
| Bootstrap and first-install readiness | Explicit database gate, versioned repair, target guard | Field startup races require one lifecycle owner and recovery evidence | Preserve and conformance-test lifecycle states | Later runtime helper after second proof |
| SQLite local store | Normalized schema, serialized writer/read-only reader | Real SQLite repeatedly caught mock-hidden failures | Preserve Masi architecture; share harness patterns | App schema; potentially shared test/runtime primitives later |
| Domain write and outbox | One local transaction, durable owner-scoped outbox | Stable mutation identity and exact replay prevent duplicates and uncertainty loss | Keep Masi write path; add mutation envelope incrementally | Shared protocol, app repositories |
| Retry and recovery | Pending/in-flight/failed/terminal with bounded attempts | Error meaning depends on code, table, parent/authority state; requeue is not heal | Adopt four explicit recovery outcomes and exact matchers | Shared taxonomy and tests |
| Pull and pagination | Safe persistence/reconcile for current roster surfaces | Unpaginated/RLS-expensive pulls truncate or time out; actor cache isolation matters | Add keyset pagination, deadlines, per-scope cost proof | Shared pull contract; app scope adapter |
| Reconcile | Positive completeness, pending-local-wins, mass-removal breaker | Destructive absence needs causal evidence and deduplicated incidents | Preserve Masi implementation; extend to new aggregates | Shared invariant/conformance, app planner |
| Scheduler and connectivity | Existing orchestration, open fleet controls | Synchronized retries create thundering herds; circuits must re-arm | Add full jitter, randomized triggers, remote kill switch | Potential later runtime primitive |
| Time and active session | Mature local behavior; active-pair constraints | Capture-and-flag can preserve real work when GPS is irregular | Keep domain-owned; optionally shadow-test causal protocol | Domain adapter; not first shared package |
| Sessions and attendees | Atomic local aggregate and outbound sync; no history hydration | Stable replay and family atomicity prevent duplicate/partial sessions | First vertical slice: inbound history, then causal aggregate path | Conformance family fixture; app schema/RPC |
| Assessments and mastery | Atomic local family; future Battery/Run shape unresolved | Activity is not mastery; exact recency ties and ambiguous history must fail closed | Hydrate current history; delay shared package and generalized protocol | Content package later; product semantics app-owned |
| Grouping | Programme-aware schema, transitional child-first UX | Collision, version, stale-writer, and cross-writer conflicts need explicit policy | Resolve Programme/year identity and authority before UI | Masi-owned until semantics settle |
| Support and incidents | Local logs/database support package | Invisible support states stranded work; release/actor provenance accelerated diagnosis | Add minimal durable incident lane before expanding pilot | Shared envelope/transport contract; app renderers |
| Release safety | Explicit backend targeting, Sentry and release gates | Publication is not installation; runtime protocol compatibility is data safety | Carry release/backend/protocol identity through receipts and support | Shared conventions and tests |
| Reporting/User Health | Masi analytics surfaces exist but field ops are not mature | One exclusive activity population plus independent overlays avoids contradictory reports | Reuse semantics and reporting invariants, not Zazi queries | Shared report contract; app data adapters |
| Admin/import/handover | Deferred until source discovery | Imports and admin writers expand conflict and authority models | Audit real source first; design idempotent audited control plane | Organization-specific adapter |
| UI and low-end devices | Strong reusable sheets/capture chrome and device gates | Low-end devices expose timing, list, lifecycle, and portal defects | Share tokens/primitives selectively; keep workflow UI local | Small mature UI primitives only |
| Web capture | Not current Masi scope | Exact pending-command retry, provenance, and migration-ledger discipline are load-bearing | Treat as a future adapter to the same protocol, not a generic web clone | Protocol conformance shared; client implementation separate |

## Preserve: Masi capabilities that should not be displaced

- The persistent serialized SQLite writer, read-only reader, `BEGIN IMMEDIATE` transaction behavior,
  foreign-key enforcement, and failed-rollback disposal.
- Normalized Programme-aware tables and historical relationships.
- One transaction for the user-facing domain write and its outbox enqueue.
- Durable owner-scoped outbox rather than `synced=false` table scans.
- Explicit dependency ordering, bounded batch fallback, stale-claim recovery, and local CAS
  finalization.
- Transactional pull persistence followed by a fresh SQLite read to publish React state.
- Pending/failed/terminal-local-wins behavior.
- Positive completeness before absence-based reconcile, no reconcile on error or truncation, and a
  mass-removal circuit breaker.
- Fail-fast Supabase target identity and separate auth/domain persistence.
- Current support export, device gates, and real-SQLite integration suite.

## Port now: Zazi lessons expressed as invariants

- Capture the authoritative actor and release identity inside the mutation transaction.
- Give every logical mutation a stable idempotency identity; a timed-out reply is uncertain, not a
  rejection.
- Make retry classification contextual: error code alone is insufficient without table, parent,
  authority, and local-state information.
- Give every support or blocked state a named reader, action, and exit.
- Use exact compare-and-set predicates when finalizing, recovering, or superseding work.
- Prove pull completeness with pagination metadata; never infer it from a short response.
- Bound requests with deadlines and use full jitter for fleet-wide retry/reconnect triggers.
- Keep assignment/lifecycle authority separate from reporting/read-model projections.
- Carry immutable backend, app, runtime, build, OTA, actor, and protocol provenance into receipts,
  incidents, and support exports.
- Keep the evidence ladder explicit: source, real engine, hosted, device, populated data, recovery,
  and field verification.
- Add real PostgreSQL behavior tests before trusting SQL/RLS/RPC changes.
- Treat activity, assessment evidence, mastery, release, installation, and recovery as separate
  domain axes.

## Adapt: ideas that need a Masi implementation

- Mutation envelopes, generations, receipts, and record heads should use Masi aggregate identities
  and Programme-scoped authorization.
- Bundle RPCs should be introduced only for families where partial server acceptance is unsafe.
- Assignment and lifecycle commands need Masi's school, Programme, class, group, and Head Office
  roles rather than Zazi's vocabulary.
- Sessions need a Masi conflict policy for EA, group, Programme, academic year, and possible Head
  Office correction.
- Assessments need current EGRA behavior now and a future Battery/Run model later; do not force both
  into one premature generic aggregate.
- User Health/reporting should reuse the population-state mental model while deriving Masi-specific
  activity and support signals.
- Release authorization must fit Masi's own backend and channel topology.

## Extract later

The first extraction target should be a specification/conformance repository, tentatively
`field-app-contracts`, not a runtime framework. It can contain:

- invariant IDs and machine-readable capability manifests;
- canonical mutation, receipt, incident, and release-provenance shapes;
- retry and recovery taxonomies;
- pull/reconcile fixtures and adversarial cases;
- real-SQLite and disposable-PostgreSQL harness conventions;
- app adapter checklists and evidence-report schemas.

Possible later runtime packages include request deadlines, jitter/scheduler primitives, canonical
payload encoding, mutation identity helpers, claim/finalize helpers, support incident transport,
release identity, and debug-export framing. They should graduate only after their responsibility is
identical in two shipped consumers.

Assessment question content is a different kind of reusable asset. A package such as
`@masinyusane/assessment-questions` becomes sensible after the Masi Battery/Run integration is on
`main` and at least two shipped consumers prove the same content/component contract.

## Never port as shared infrastructure

- A generic mobile-sync monorepo that owns both apps' schemas, repositories, RLS, or migrations.
- Zazi's exact SQL, table names, RLS policies, Supabase identity, family boundaries, timeout values,
  lifecycle commands, TeamPact fields, or group semantics.
- Masi's Programme model as a universal nonprofit model.
- A broad shared UI system that absorbs workflow screens before visual and behavioral sameness is
  proven.
- A generic admin/import workflow engine invented before the real Masi and future-nonprofit source
  systems are inspected.
- A universal assessment/mastery abstraction that collapses teaching activity, evidence, scoring,
  diagnosis, and mastery into one state.

## Sequenced execution plan

### Gate 0 — establish exact pre-live ground truth

Before changing architecture, record:

- all Masi branches/build artifacts and installed-device expectations;
- which Supabase project every current profile, local environment, script, and backend targets;
- live SQLite-backend schema, migrations, RLS, functions, indexes, row counts, and test data;
- whether the legacy backend contains records or active automation that need preservation;
- query plans and RLS cost for the planned history pulls;
- actual PostgREST row limits and retention/history expectations;
- the release/runtime identity we will use for the next internal pilot.

If the inventory confirms there is no user data worth preserving, exploit that fact deliberately:
reset test data where useful, correct identity/schema contracts at the root, and avoid carrying
legacy compatibility machinery into the new launch.

### Slice 1 — sessions and attendees history hydration

Build the smallest complete vertical slice:

1. Define Programme/EA scope, stable identities, parent-child ordering, conflict policy, and
   positive completeness.
2. Add keyset-paginated authenticated pull for `sessions`.
3. Persist sessions transactionally without overwriting local pending/failed/terminal aggregates.
4. Pull `session_attendees` by parent IDs, then persist them after parents.
5. Publish state from a fresh SQLite read.
6. Distinguish outbound completion from inbound hydration in sync status.
7. Prove first install, reinstall, second device, offline restart, collision, truncation, and
   parent-before-child behavior in real SQLite and populated-device tests.

### Slice 2 — assessments and items history hydration

Repeat the contract for `assessments` and `assessment_items`, preserving the fact that current EGRA
history and future Battery/Run artifacts may have different aggregate boundaries. Hydration does
not justify prematurely extracting a universal assessment package.

### Parallel pre-pilot lane — incidents and provenance

Before more staff depend on the app, add a minimal privacy-safe incident path containing stable
deduplication identity, first/last seen time, actor ID, backend/project identity, app/runtime/build
identity, protocol version, capability/scope, normalized disposition, and bounded diagnostic
metadata. It needs a durable local queue, idempotent server acceptance, support reader, remediation
action, and retention policy. Sentry remains telemetry; it is not the durable sync-state ledger.

### Slice 3 — fleet safety

Add and prove:

- keyset pagination for every potentially unbounded pull;
- request deadlines and cancellation behavior;
- full-jitter retry and randomized foreground/reconnect scheduling;
- query-specific indexes justified by real predicates and plans;
- remote interval controls and a sync kill switch;
- actor/database-epoch isolation on shared or re-used devices.

### Slice 4 — Programme/group authority and identity

Before group-first UX, settle ADRs for:

- the authoritative assignment grant versus derived projections;
- group identity across class, Programme, academic year, and grouping generation;
- Head Office/EA concurrent writes and stale-writer rejection;
- assignment revocation, historical reads, and cross-device recovery;
- group membership history and conflict resolution.

Then implement access/RLS, local/server identities, sync, and two-writer tests before screens.

### Later — causal write protocol

Port Zazi's causal protocol in vertical families rather than as an engine rewrite. A `TIME_ENTRIES`
shadow tracer is acceptable if it gives low-risk evidence, but sessions are the preferred first real
aggregate because duplicates and partial attendee acceptance have meaningful user impact.
Assessments follow only after the Battery/Run boundary is settled.

## Retry and recovery model

The current vocabulary should evolve toward four operator-meaningful outcomes:

| State | Meaning | Exit |
|---|---|---|
| `retrying` | The same idempotent operation is expected to succeed without human interpretation | Backoff with deadline and jitter; preserve exact identity |
| `blocked` | A known prerequisite or authority relationship is missing but may arrive | Dependency/authority evidence re-arms the row |
| `needs_attention` | Automatic action could lose or misattribute data | Durable incident plus named support action; exact guarded recovery |
| `superseded` | Newer causal work makes this operation obsolete | Record the newer identity/reason; do not replay |

Unbounded retry is permissible only when the operation is provably idempotent, the exact identity is
stable, requests have bounded resource use, and the queue cannot starve other work. Otherwise the
system needs an explicit exit rather than infinite optimism.

## ADR backlog

The following decisions are hard to reverse and should be recorded before their implementation
slices:

1. History retention and what positively complete absence means.
2. Assignment authority versus reporting/read-model projections.
3. Group identity across Programme, class, academic year, and grouping generation.
4. Conflict policy per aggregate and cross-writer scenario.
5. Retry, needs-attention, exact recovery, and supersession semantics.
6. Actor/database-epoch isolation for shared or re-used devices.
7. Historical-read access after assignment revocation.
8. Release/protocol compatibility across installed binaries and OTA bundles.
9. Package graduation and ownership rules for shared infrastructure.

## Advisory `check-solution` review

`check-solution` was used as a skeptical simplification prompt, not as authority to delete safety
rails. Jim explicitly warned that the skill can oversimplify; every recommendation was therefore
checked against field failure evidence, exact retry, compatibility, authorization, and recovery.

| Element | A: user-visible delta | B1: scenario occurs? | B2: user can tell? | C: deletion test | Build | Carrying | Verdict |
|---|---|---|---|---|---|---|---|
| Live estate probe | Prevents work against the wrong backend/build assumptions | Yes, two backends and old artifacts exist | Usually not until data is missing | Deletion risks silent retargeting or false compatibility work | Low | Low | **NOW** |
| Session hydration | Restores history on reinstall/second device | Confirmed | Yes | Deletion leaves cross-device continuity false | Medium | Medium | **NOW** |
| Assessment hydration | Restores assessment history | Confirmed | Yes | Deletion leaves fresh devices incomplete | Medium | Medium | **NOW** |
| Incident/provenance lane | Makes stranded work and bad releases diagnosable | Repeatedly in Zazi | Often only support can tell | Deletion repeats blind field diagnosis | Medium | Medium | **NOW** |
| Pagination/deadline/jitter | Prevents truncation, hangs, and fleet retry waves | Confirmed in Zazi; likely at scale | Usually after data or availability degrades | Deletion makes pilot success non-predictive at scale | Medium | Low | **NOW** |
| Full causal package | Stronger server-observable write ordering | Relevant, but Masi aggregate policy is unsettled | Sometimes | Deletion now still leaves current protected local path | High | High | **LATER** |
| Shared conformance repository | Reuses lessons without coupling runtimes | Two apps already need the vocabulary | Indirectly | Deletion causes duplicated review/test design | Medium | Medium | **LATER** |
| Assessment package | Reuses content/components | Second stable consumer not yet proven | Yes when available | Deletion now avoids freezing the wrong Battery/Run API | High | High | **LATER** |
| Generic sync monorepo | One runtime/schema abstraction for all apps | Responsibility is not identical | Users see failures, not the abstraction | Deletion preserves app-specific correctness | Very high | Very high | **NEVER** |
| Broad UI package | Shared workflow screens | Workflows and domain language differ | Yes | Deletion avoids cross-app UX coupling | High | High | **NEVER** |
| Generic admin workflow engine | Universal import/control plane | Real sources are not yet audited | Eventually | Deletion forces source-grounded design | Very high | Very high | **NEVER** |

The three **NEVER** items fail for different reasons: the sync monorepo would couple domain and
authorization contracts, the broad UI package would turn superficial visual similarity into
workflow coupling, and the admin engine would encode imagined sources instead of observed ones.

## Package graduation rule

No shared runtime package graduates merely because code looks similar. Require all of:

1. Two real shipped consumers.
2. The same responsibility and lifecycle, not merely similar names.
3. Shared conformance tests that both adapters pass.
4. A named owner for compatibility, security, and incident response.
5. Versioning, release, rollback, and deprecation processes.
6. Evidence that extraction reduces total coupling rather than moving it into configuration.

Until then, share specifications, fixtures, and review checklists; allow intentional duplicated
implementation when the domain seams are still being discovered.

## Evidence gaps that remain

- The current live Masi SQLite-backend schema and RLS were not probed in this audit.
- No inventory yet proves that old Masi binaries, test records, or legacy-backend automation are
  absent.
- Masi's fresh test runs do not prove physical-device behavior.
- Zazi's large test and release record does not mean every current fix is installed or field
  verified.
- The exact Masi history-retention requirement and cross-writer conflict policies remain product
  decisions.
- RLS query cost, PostgREST row caps, and expected history volumes need measurement before pull
  implementation.
- Shared package boundaries are hypotheses until Masi becomes the second proven consumer.

The next artifact should be a source-linked capability ledger derived from this matrix. For every
row it should record Masi implementation/evidence, Zazi implementation/evidence, the governing
portfolio invariants, portability decision, open ADRs, and the next independently verifiable
vertical slice. That ledger can then generate focused GitHub issues without becoming a second
roadmap.

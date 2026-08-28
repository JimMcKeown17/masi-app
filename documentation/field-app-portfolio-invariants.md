# Field-App Portfolio Invariants

**Standing portfolio contract. Updated 2026-08-27.**

This catalog records safety and operability properties intended to survive across Masi, Zazi
iZandi, and future nonprofit field apps. These are constraints on observable behavior, not a shared
database schema or a demand that every app use identical code.

Each app should maintain a conformance mapping from every applicable invariant to:

- the authoritative source and implementation adapter;
- the local/unit and real-engine tests;
- the hosted, device, populated-data, and field evidence that exists;
- an explicit exception or `not applicable` rationale;
- the named operational reader/action when the invariant can create a support state.

The initial evidence and recommended sequencing are in
[`masi-zazi-portfolio-audit-2026-08-27.md`](./masi-zazi-portfolio-audit-2026-08-27.md).

## Identity and authority

### P-01 — Actor capture is transactional

The actor attributed to a mutation is captured from authoritative authenticated context inside the
same logical mutation boundary. A later auth event or cached UI identity may not rewrite ownership.

### P-02 — Local durable work is owner-scoped

Outbox, drafts, incidents, and other durable actor-owned state are scoped to an explicit owner. A
missing owner fails safe; it never becomes a wildcard shared by the next signed-in user.

### P-03 — Projections do not authorize their own source data

A read model, reporting projection, reconstructed roster, or cache may not be the sole
authorization substrate for writes, deletes, or reconciliation of the records that create it.

### P-04 — Access uses positive grants

Write authority comes from a positive, current, auditable grant such as an active assignment or a
server-validated command. The absence of a denial, a cached row, or creator provenance alone is not
a general grant.

### P-05 — Revocation is not eventual projection cleanup

Revoking authority and ending the affected assignment/lifecycle graph form one designed transition.
The system must not depend on eventually noticing a missing projection to infer revocation.

## Local persistence

### P-06 — Domain write and outbox enqueue are atomic

A user-visible durable mutation persists its domain rows and enqueues its sync intent in one local
transaction. A crash cannot leave accepted local work without a sendable intent, or an intent whose
domain state never committed.

### P-07 — Writes are serialized and constraints are real

The local database has a defined serialized write boundary, foreign keys and other relevant
constraints are enabled on every write connection, and concurrency tests exercise the real engine.

### P-08 — Published application state derives from the durable store

After a local mutation or pull, application state is republished from a fresh durable-store read.
An in-memory merge is not an independent source of truth.

### P-09 — Newer local schema fails safe

An older binary or OTA bundle must not continue mutating a database whose schema version is newer
than it understands. The stop state must be diagnosable and recoverable without silent downgrade.

## Outbound mutation and retry

### P-10 — Logical mutations have stable idempotency identity

Retries, restarts, and lost replies reuse the same mutation identity. Duplicate handling is designed
at the protocol boundary; it is not implemented by catching a uniqueness error after ambiguous
partial work.

### P-11 — Uncertain is not rejected

A timeout, connection loss, or missing response after request dispatch means the result is
uncertain. The client must reconcile or retry the same idempotent operation; it may not silently
discard the work as rejected.

### P-12 — Every retry/support state has an exit

Each non-success state is one of retrying, blocked on a known prerequisite, needs attention, or
superseded. It has a named re-arm condition or operator action; no row can remain frozen in a state
that no component reads.

### P-13 — Finalization and recovery use exact compare-and-set

Acknowledging, retrying, recovering, terminalizing, or superseding work must match the exact
observed mutation/claim/generation state. A stale response or repair cannot finalize newer work.

### P-14 — Unsafe partial families are server-atomic

When partial acceptance would create an invalid or user-misleading aggregate, the server accepts or
rejects the family atomically. Parent/child ordering alone is not a substitute for atomicity where
the business invariant spans the family. A second writer, shared mutable aggregate, side-effecting
RPC, or unsafe partial family must explicitly prove stable-ID upsert is sufficient or adopt a
narrower causal command; field loss is not a prerequisite for this review.

### P-15 — Server outcomes are typed and replayable

The server returns explicit accepted, already-applied, blocked, rejected, conflict, or equivalent
dispositions with stable receipt/provenance data. Human-readable error strings are not the protocol.

## Inbound pull and reconcile

### P-16 — Absence requires positive completeness

A missing row may imply deletion or ending only when the client has positive evidence that the
relevant authorized scope is complete, including every page. A short response is not completeness.

### P-17 — Unsynced local intent wins over stale server state

Pending, in-flight, failed, and needs-attention local work is not overwritten or ended by an older
or incomplete server snapshot.

### P-18 — Errored or truncated scopes never reconcile

Authentication errors, RLS ambiguity, request failures, pagination truncation, deadline expiry, and
scope mismatch disable absence-based destructive reconciliation for that scope.

### P-19 — Large destructive changes trip a circuit breaker

Removal or ending above a tested absolute/proportional threshold becomes a deduplicated
needs-attention incident rather than a silent mass mutation. The breaker has a reader and explicit
resolution path.

### P-20 — Outbound completion is not hydration completion

"All local writes uploaded" and "all authorized server history is present locally" are separate
states in code, UI, support output, and acceptance tests.

### P-21 — Parents become durable before dependents

Inbound aggregate families apply parents before children, in transactions whose failure cannot
publish a half-hydrated family. Child pulls should be scoped by known parent identities where this
improves authorization, cost, or completeness.

## Operations, evidence, and release safety

### P-22 — Every support state has a reader and action

If application logic can place work into a blocked, terminal, needs-attention, quarantine, or
incident state, a named user or support role can see it, understand the bounded reason, and invoke a
safe action.

### P-23 — Incidents have causal deduplication identity

Repeated observations of the same underlying problem update one incident with stable identity and
first/last-seen evidence. A new sync cycle alone does not mint a new incident forever.

### P-24 — Release and backend identity are observable

Receipts, incidents, and support exports carry immutable app version, native build, runtime/OTA,
source/release identity, protocol version, backend/project identity, platform, and actor scope as
appropriate. Secrets and sensitive payload content remain excluded.

### P-25 — Evidence levels remain distinct

Source review, mock/unit proof, real SQLite, real PostgreSQL, hosted migration/deployment, browser or
device behavior, populated-data convergence, installed-phone recovery, and field no-recurrence are
separate claims. Passing one never silently implies another.

### P-26 — Operational populations are conserved

Staff/User Health reporting assigns every eligible person to exactly one mutually exclusive base
activity state, with independent overlays for data quality, sync, support, or risk. Quiet users are
not automatically labeled blocked.

## Domain meaning

### P-27 — Programme is first-class where behavior differs

When access, delivery, enrollment, grouping, reporting, or pedagogy differs by Programme, Programme
identity is stored at creation and participates in authority and historical interpretation. It is
not inferred later from a mutable current roster.

### P-28 — Conflict policy is explicit per aggregate

Every multi-writer aggregate names its writers, stable identity, concurrency token, merge or
rejection rule, stale-writer behavior, and operator recovery. Silent last-write-wins is a deliberate
documented choice only when its consequences are acceptable.

### P-29 — Related domain axes remain distinct

Teaching activity is not assessment evidence; evidence is not diagnosis; diagnosis is not mastery.
Likewise recorded, synced, released, installed, recovered, and field verified are not synonyms.

## Sharing and package boundaries

### P-30 — Share contracts and attacks before runtime code

Cross-app reuse begins with vocabulary, invariant IDs, fixtures, conformance tests, evidence
schemas, and adversarial cases. Intentional implementation duplication is acceptable while app
domain and authorization seams are still being discovered.

### P-31 — Runtime packages must graduate

A shared runtime package requires two shipped consumers with the same responsibility, common
conformance tests, a named owner, version/release/rollback/deprecation rules, and evidence that the
package reduces coupling rather than moving domain differences into configuration.

## Initial portfolio coverage snapshot

This table is directional evidence as of 2026-08-27, not a substitute for the future source-linked
capability ledger.

| Invariant area | Masi | Zazi | Immediate portfolio action |
|---|---|---|---|
| Local atomic persistence | Strong | Strong, broader field attacks | Preserve both; align conformance cases |
| Actor/authority isolation | Partial | Stronger recent protocol/lifecycle work | Specify shared contract; implement Masi adapter |
| Idempotent causal outbound protocol | Partial local guarantees | Stronger protocol-v2 design/evidence | Port incrementally after Masi family ADRs |
| Pull completeness/reconcile safety | Strong on implemented scopes; history missing | Stronger pagination and actor isolation | Build Masi sessions then assessments hydration |
| Retry/support exits | Partial | Broad but still evolving under field failures | Adopt common four-state recovery vocabulary |
| Incident/release provenance | Partial/local | Stronger durable operational path | Add minimal Masi lane before expanded pilot |
| Programme/group conflict semantics | First-class but unsettled | More field evidence, different model | Keep Masi-owned and settle ADRs |
| Evidence ladder | Good automated/device gate structure | Much deeper real-field record | Standardize evidence vocabulary and ledgers |
| Package graduation | Not yet applicable | Not yet a second consumer | Share specifications first |

## Maintenance rule

Change an invariant only when field evidence, a proven counterexample, or a hard product requirement
shows that the portfolio rule is wrong. App-specific implementation changes belong in that app's
code, contract map, ADRs, and build log; they do not automatically rewrite this catalog. When an app
intentionally diverges, record the exception and its evidence rather than weakening the portfolio
rule silently.

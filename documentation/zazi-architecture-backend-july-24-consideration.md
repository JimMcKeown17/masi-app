> **Status note — 2026-08-27:** This is historical design input. The current portfolio decision
> baseline is [`masi-zazi-portfolio-audit-2026-08-27.md`](./masi-zazi-portfolio-audit-2026-08-27.md)
> and the standing contract is
> [`field-app-portfolio-invariants.md`](./field-app-portfolio-invariants.md). The selective-port
> conclusion below remains useful, but the claims that Zazi protocol v2 is flag-off and pre-field
> are stale: current Zazi `origin/main` authorizes v2 in production profiles and the app has real
> field use. Do not use this document as a current status ledger.

## Bottom line

  Yes, Masi should adopt most of the safety guarantees being built in Zazi Wave 2A.

  No, Masi should not copy the Zazi implementation wholesale.

  The best architecture is a shared causal-sync kernel with Masi-specific domain adapters:

  - Reuse the mutation envelope, actor provenance, generations, claims, full compare-and-set finalization, failure boundary, retry budgets,
    receipts, record heads, integrity detection, and release-gate ideas.

  - Preserve Masi’s stronger SQLite writer and pull/reconcile architecture.
  - Redesign every aggregate boundary, canonical identity, authorization rule, and server RPC around Masi’s Programme model.
  - For shared entities that Head Office and EAs both mutate, go beyond Zazi’s same-device-stream ordering and define an explicit cross-
    writer concurrency policy.

  - Do not extract a shared package yet. Port the kernel into Masi first, prove the second implementation, then extract the genuinely
    common code.

  My cost-planning estimate is that this selective approach should save roughly 40 to 60 percent of the engineering and review effort
  compared with independently rediscovering and rebuilding Wave 2A from scratch. I would expect only about 25 to 40 percent of the
  implementation to copy over with minimal modification. The biggest savings are in already-discovered failure modes, invariants, test
  attacks, concurrency harnesses, and review checklists, not in copying SQL.

  I would not start the large Masi implementation immediately. First finish Masi’s P1 session and assessment history hydration, complete
  the remaining Zazi runtime/cutover work, and settle Masi’s Programme-scoped grouping identity. Those three actions will substantially
  reduce rework.

  ## The important correction to the premise

  Zazi Wave 2A is not yet a finished sync engine that can simply be transplanted.

  Its most valuable parts are already substantial and well tested, but the production feature flag remains off. The shared v2 uploader,
  old-engine kill switch, dispatch/environment gate, complete integrity detector and UI, pull scalability, jitter, and final release proof
  remain open. The Zazi roadmap explicitly says that flipping the flag today would still permit dual legacy and v2 uploads, and that the
  manifest is not yet a live activation gate. See /Users/jimmckeown/Development/zazi-izandi-app/documentation/roadmap.md:225 and the /
  Users/jimmckeown/Development/zazi-izandi-app/documentation/roadmap.md:356.

  Wave 2A is also intentionally limited. Its own specification says it protects the mostly single-writer mobile model but does not provide
  complete causal consistency across mobile devices, Django, imports, administrators, and other writers. It still permits last-write-wins
  behavior for unrelated external writers. See /Users/jimmckeown/Development/zazi-izandi-app/documentation/plans/2026-07-15-wave2a-sync-
  safety-floor.md:16.

  That limitation matters far more in Masi because Masi already anticipates:

  - Head Office and EAs both modifying grouping data.
  - Children participating in more than one Programme.
  - Classes containing groups from more than one Programme.
  - Future Head Office importing and provisioning.
  - Cross-device history and recovery.
  - Different group semantics per Programme.

  Masi’s accepted grouping ADR already identifies Head Office and EAs as separate writers and rejects silent last-write-wins for
  regrouping. See docs/adr/0001-group-reconciliation-via-versioning-and-staging.md:15.

  So the right mental model is:

  > Zazi Wave 2A is a reusable safety kernel and a reference implementation, not Masi’s complete target architecture.

  ## What Masi already does well

  Masi is not starting from a primitive engine. Several parts are already stronger than Zazi’s current runtime.

  ### 1. Masi has the better SQLite connection architecture

  Masi now has:

  - One persistent serialized writer.
  - One read-only reader.
  - BEGIN IMMEDIATE transactions.
  - Foreign keys enabled on the writer.
  - A queue around all writer access.
  - Connection disposal after a failed rollback.

  That is a strong local foundation and should remain. See src/db/client.js:43.

  Zazi still uses withExclusiveTransactionAsync, which creates separate transactional connection objects. Therefore, porting Zazi’s
  database client into Masi would be a regression.

  ### 2. Masi already has useful local stale-finalization protection

  Masi claims queue records and finalizes them with a predicate containing the outbox id, observed updated_at, and status = 'in_flight'. If
  a newer local edit rewrites the slot, the old finalizer misses instead of deleting the current work. Batch finalization preserves the
  same check. See src/services/offlineSync.js:768 and src/services/offlineSync.js:875.

  That means Masi already has a partial answer to Zazi failure number two: a late local acknowledgement deleting newer queued work.

  Wave 2A is still stronger because it compares the complete mutation envelope:

  - descriptor;
  - canonical identity;
  - local record id;
  - mutation id;
  - stream id;
  - generation;
  - operation;
  - actor;
  - claim token;
  - state;
  - domain audit sequence.

  So the move is an upgrade from a timestamp-shaped CAS to an explicit mutation-generation CAS, not a total rewrite from nothing.

  ### 3. Masi’s pull/reconcile architecture should not be replaced

  Masi has already done important work that Zazi Wave 2A explicitly defers:

  - React state is rebuilt from SQLite.
  - Server rows are transactionally persisted.
  - Pending local work is protected.
  - Ordinary RLS-filtered absence is not trusted as proof of deletion.
  - A fixed acknowledgment RPC supplies positive completeness evidence.
  - Relationship reconciliation is Programme- and actor-scoped.
  - Large removal sets trip a mass-end circuit breaker.
  - Truncated or errored scopes cannot authorize destructive reconciliation.

  See documentation/rls-sync-contract-map.md:145, documentation/rls-sync-contract-map.md:186, and documentation/rls-sync-contract-
  map.md:203.

  That subsystem is more appropriate for Masi than Zazi’s older pull merge. Keep it, extend it for history and delta pulls, and do not fold
  it into the Wave 2A port.

  ### 4. Masi already has Programme-aware domain rows

  Masi freezes programme_id into sessions, assessments, groups, letter mastery, enrollments, and assignments. The active Programme at a
  later sync time is not supposed to redefine the meaning of an earlier write. See PRD.md:58.

  This is correct and should become an explicit mutation-envelope rule:

  > Actor identity, Programme scope, and domain identity are three different concepts. None may be inferred from another at upload time.

  ## What Masi still lacks, and why Wave 2A is valuable

  ### 1. Mutation authorship is not captured strongly enough

  Masi’s outbox has owner_user_id, and the sync pass filters the queue to the authenticated user. That is useful. But the owner is derived
  from a domain row or payload, and repository functions can accept caller-supplied actorUserId. The repository does not universally read
  an authoritative current actor inside the same transaction.

  The contract also permits grandfathered owner_user_id = NULL rows to be drained by any authenticated EA. See documentation/rls-sync-
  contract-map.md:13 and src/db/repositories/domainRepositoryUtils.js:106.

  Wave 2A’s stronger invariant is worth porting: the domain repository obtains the confirmed actor itself, inside the domain transaction,
  and the actor cannot be supplied or overridden by the screen, payload, or later sync pass.

  ### 2. Masi cannot prevent an older server request from overwriting a newer accepted request

  Masi’s local CAS protects local queue settlement. It does not protect the server from request reordering.

  Most writes still go through generic Supabase upserts. See documentation/rls-sync-contract-map.md:37. If request N times out after
  reaching PostgreSQL, the device may retry while request N+1 is also produced. Stable ids make replay more idempotent, but they do not
  establish generation ordering.

  Wave 2A’s server receipts and record heads solve this for one device stream:

  - exact mutation replay returns the stored result;
  - mutation-id reuse with different content is rejected;
  - stale generations cannot apply domain DML;
  - the accepted generation and result are durably recorded.

  This is one of the highest-value pieces to port.

  ### 3. Masi’s locally atomic aggregates are not server-atomic

  Masi already writes related local rows in one SQLite transaction:

  - A session plus its attendees: src/db/repositories/sessionsRepository.js:202.
  - An assessment plus item evidence: src/db/repositories/assessmentsRepository.js:186.
  - A child plus assignment, enrollment, and optional class membership: src/db/repositories/childrenRepository.js:284.

  But each row is queued separately and sent through separate generic server operations. Parent-before-child ordering and retries improve
  convergence, but there can still be a period where the server holds:

  - a session without all attendees;
  - an assessment without all evidence;
  - a child without its Programme enrollment or assignment;
  - an accepted parent request followed by an indefinitely failing member request.

  The root-owned family model is therefore highly valuable for Masi. A logical user action that is valid only as a complete set should have
  one immutable root snapshot, one server transaction, and one replayable receipt.

  ### 4. Masi has no structural network deadline around the serialized request queue

  The Supabase request queue is a promise chain with no deadline. If the underlying request never settles, later auth, pull, and push
  requests can remain behind it indefinitely. See src/services/supabaseRequestQueue.js:1.

  Wave 2A’s controlled fetch boundary, private provenance marker, local deadline, server statement timeout, and stale-claim recovery window
  are portable and should be adopted.

  ### 5. Some Masi failures still retry indefinitely

  Masi bounds known deterministic failures after eight attempts, but codeless network and timeout failures remain retriable without an
  attempt cap. See documentation/rls-sync-contract-map.md:72.

  Wave 2A’s distinction among transport, service, row, auth, and unknown failures, plus finite per-mutation and environment budgets, is a
  better long-term support model.

  ### 6. Masi lacks an independent mutation-surface completeness proof

  Masi has strong contract tests, an RLS map, server column allowlists, and dependency maps. It does not yet have a source-driven inventory
  proving that every reachable repository mutator either:

  - records a safe mutation;
  - is deliberately disabled;
  - or is unreachable.

  Wave 2A discovered that a second hand-maintained list was not enough, then added an AST-based mutator inventory. That lesson should be
  reused before Masi’s feature surface grows further.

  ## Architecture comparison

   Layer                         Masi today                        Zazi Wave 2A                       Masi recommendation
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SQLite access                 Persistent serialized writer      Exclusive transaction              Keep Masi
                                 plus read-only reader             connections
  ────────────────────────────  ────────────────────────────────  ─────────────────────────────────  ──────────────────────────────────────
   Local write atomicity         Domain row and ordinary outbox    Domain rows plus mutation          Upgrade Masi using the v2 kernel
                                 rows in one transaction           envelope, generation, audit,
                                                                   and family provenance
  ────────────────────────────  ────────────────────────────────  ─────────────────────────────────  ──────────────────────────────────────
   Actor provenance              Queue owner derived from row/     Actor read by repository and       Port Wave 2A invariant
                                 payload; authenticated pass       frozen into mutation envelope
                                 filtering
  ────────────────────────────  ────────────────────────────────  ─────────────────────────────────  ──────────────────────────────────────
   Local stale settlement        CAS on id, updated_at, and        Full mutation-envelope CAS plus    Port Wave 2A
                                 state                             claim token and audit sequence
  ────────────────────────────  ────────────────────────────────  ─────────────────────────────────  ──────────────────────────────────────
   Server idempotency            Mostly stable-id upsert           Durable receipt per mutation       Port Wave 2A
  ────────────────────────────  ────────────────────────────────  ─────────────────────────────────  ──────────────────────────────────────
   Server ordering               Generic upsert, no request        Per-actor, per-stream, per-        Port as a minimum
                                 generation                        record generation head
  ────────────────────────────  ────────────────────────────────  ─────────────────────────────────  ──────────────────────────────────────
   Server family atomicity       Parent and members usually        Fixed root-owned bundle RPCs       Redesign for Masi families
                                 separate writes
  ────────────────────────────  ────────────────────────────────  ─────────────────────────────────  ──────────────────────────────────────
   Failure provenance            Code and local-state              Controlled boundary plus           Port
                                 classification                    explicit provenance classes
  ────────────────────────────  ────────────────────────────────  ─────────────────────────────────  ──────────────────────────────────────
   Retry policy                  Some bounded, some unbounded      Finite mutation and environment    Port
                                                                   budgets
  ────────────────────────────  ────────────────────────────────  ─────────────────────────────────  ──────────────────────────────────────
   Missing mutation detection    Contract tests, but no            Inventory-driven integrity         Port after completing the Zazi slice
                                 recurring evidence ledger         evidence
  ────────────────────────────  ────────────────────────────────  ─────────────────────────────────  ──────────────────────────────────────
   Pull/reconcile                Strong SQLite-persistence and     Wave 2A largely keeps older        Keep and extend Masi
                                 acknowledged-completeness         pull behavior
                                 model
  ────────────────────────────  ────────────────────────────────  ─────────────────────────────────  ──────────────────────────────────────
   Cross-writer concurrency      Some deterministic ids and        Explicitly outside Wave 2A’s       Build a richer Masi policy
                                 grouping staging ADR              complete guarantee
  ────────────────────────────  ────────────────────────────────  ─────────────────────────────────  ──────────────────────────────────────
   Programme scope               First-class domain partition      Essentially single-Programme       Masi-specific design required
                                                                   product
  ────────────────────────────  ────────────────────────────────  ─────────────────────────────────  ──────────────────────────────────────
   Multiple deployed versions    Must remain backward              Zazi is pre-launch and can cut     Masi-specific rollout required
                                 compatible                        over more aggressively

  ## The multi-Programme issue is deeper than adding programme_id to RPCs

  This is the most important architecture difference.

  Masi’s domain says:

  - A child may have multiple concurrent Programme enrollments.
  - A class may have groups across one or more Programmes.
  - Every group belongs to one Programme.
  - Group rules differ by Programme.
  - EAs edit group composition in most Programmes.
  - Head Office can seed or regroup some Programme groupings.

  See CONTEXT.md:104.

  But the current grouping schema has:

  - groups.programme_id;
  - no programme_id on grouping_versions;
  - no programme_id on class_grouping_state;
  - one active grouping version per (class_id, academic_year_id);
  - one class grouping state per (class_id, academic_year_id).

  See src/db/migrations.js:324.

  Those shapes cannot independently represent two active Programme-specific groupings for the same class and academic year. For example,
  the same class could need:

  - Core Literacy pairs;
  - Numeracy groups of five to seven;
  - a 1000 Stories whole-class group.

  Yet the current class_grouping_state has only one active pointer for that class and year.

  Unless there is a stronger unstated business constraint that a class can participate in only one grouped Programme at a time, the likely
  correct aggregate identity is:

  (class_id, programme_id, academic_year_id)

  That probably needs to become the identity of both the grouping state and grouping-version stream.

  I would resolve this before porting Zazi’s grouping family. Otherwise, the sync RPC would harden the wrong aggregate boundary and make
  the schema more expensive to correct later.

  ## The architecture I recommend

  Use a layered design in which the causal machinery is shared conceptually, while Masi owns the domain policies.

  User command
      |
      v
  Masi domain repository
      |
      | one SQLite transaction
      +--> normalized domain rows
      +--> immutable mutation or aggregate snapshot
      +--> actor + Programme + stream + generation + audit provenance
                |
                v
          Causal sync kernel
          - claim token
          - full CAS
          - deadlines
          - finite budgets
          - integrity evidence
                |
                v
          Transport adapter
          - Supabase RPC now
          - replaceable later
                |
                v
          Fixed Masi aggregate command
          - typed arguments
          - Masi RLS and authorization
          - deterministic lock order
          - domain-specific conflict policy
          - one PostgreSQL transaction
                |
                +--> receipt
                +--> record or aggregate head
                +--> domain rows

  Inbound sync remains a separate Masi subsystem:
  authenticated scoped pull -> SQLite persistence -> completeness proof -> reconcile -> fresh SQLite read

  ### The shared kernel

  These pieces can be largely ported:

  - canonical typed-key encoding;
  - mutation UUIDs;
  - account-bound installation streams;
  - per-record generation allocation;
  - claim tokens;
  - full-CAS claim and finalization;
  - auth pause and same-actor revival;
  - retry and uncertain-attempt budgets;
  - controlled fetch and deadline provenance;
  - receipt and record-head result vocabulary;
  - release blocker framework;
  - source-driven mutation inventory;
  - sync-integrity evidence ledger;
  - capacity fixture and concurrency-harness conventions.

  ### The Masi descriptor layer

  Masi should define one declarative descriptor per synced domain concept. The descriptor should include more than Zazi’s present registry:

  descriptor key
  local table
  remote table or RPC family
  canonical identity
  Programme-scope rule
  actor rule
  aggregate root
  member ownership
  conflict policy
  pull scope
  reconcile authority
  authorization adapter
  wire serializer
  result validator
  capacity bounds

  Most importantly, add an explicit conflictPolicy or equivalent. Different data has different concurrency semantics.

  ### Concurrency policies by aggregate type

  1. Append-oriented facts

     Examples: completed sessions, assessments, time entries.

     Use stable identity, exact replay, immutable or narrowly correctable snapshots, and one transaction for their evidence rows. Same-
     stream generation ordering is usually sufficient because two devices should create distinct facts rather than update one shared row
     accidentally.

  2. Actor-owned mutable state

     Examples: some personal status or draft records.

     Same-actor and same-stream heads may be sufficient, with an explicit cross-device merge policy.

  3. Shared mutable aggregates

     Examples: child details, class data, grouping state, memberships that Head Office and EAs both change.

     Zazi’s actor-and-stream head is not enough. Masi needs one of:
      - a global aggregate version checked by every writer;
      - expected-version optimistic concurrency;
      - command-specific merge semantics;
      - staged proposals and explicit acceptance, as already chosen for Head Office grouping;
      - append/end lifecycle events instead of in-place replacement.

  4. Monotonic fields

     Examples: timestamps such as read/dismiss state if Masi later adds notifications.

     Merge by monotonic union rather than last-write-wins.

  This is how Masi stays flexible. The protocol kernel remains consistent while each domain descriptor names the correct conflict model.

  ## What can actually be ported

  The current Zazi v2 work is approximately:

  - 4,930 lines of client/kernel/inventory code.
  - 10,307 lines of focused JavaScript tests.
  - 20,747 lines of RPC migrations and post-apply verification SQL.
  - Roughly 36,000 lines in total.

  The distribution explains why direct copying is the wrong measure of savings. Most of the volume is domain-shaped tests and SQL
  verification, not generic queue machinery.

   Component                                        Portability    Recommendation
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Controlled fetch and failure normalizer            Very high    Port nearly directly
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Deadline/stale-claim timing invariants             Very high    Port directly, review constants
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Canonical scalar/key codec                              High    Port, then extend for Programme-aware keys
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Stream, generation, mutation, and claim model           High    Port
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Full-CAS state machine                                  High    Adapt to Masi’s repository runtime
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Finite failure budgets                                  High    Port policy, adapt classifications
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Receipt/head schema concept                             High    Reuse design, author a clean Masi base migration
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Source-driven mutation inventory                        High    Port scanner pattern, rebuild Masi surface registry
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Integrity evidence repository                    Medium-high    Port after Zazi detector is complete
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Family recorder framework                             Medium    Port structure, replace every family configuration
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   RPC client seams                                      Medium    Reuse adapter shape, replace arguments and validation
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Capacity fixtures and concurrency harnesses      Medium-high    Reuse harness architecture, rebuild fixtures
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Time-entry RPC                                   Medium-high    Likely first vertical slice
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Session family                                        Medium    Add Programme and group semantics
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Assessment family                                 Low-medium    Rebuild around Masi items, Windows, Batteries, Runs, and mastery
                                                                   identity
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Child family                                      Low-medium    Rebuild around assignment, enrollment, class membership, and Programme
                                                                   authorization
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Class family                                             Low    Masi classes and Programme-scoped class assignments differ materially
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Grouping family                                          Low    Must first correct the aggregate’s Programme scope and multi-writer
                                                                   model
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Letter mastery RPC                                Low-medium    Masi identity includes programme_id and source
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Notification-state RPC                            None today    Do not port until Masi has the feature
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Zazi SQLite client                                  Negative    Do not port
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Zazi pull merge                                     Negative    Do not port
  ───────────────────────────────────────────────  ─────────────  ─────────────────────────────────────────────────────────────────────────
   Exact SQL migrations                                     Low    Use as reviewed exemplars, not copy-ready migrations

  ## Cost and benefit

  These are planning ranges, not calendar estimates.

   Approach                         Initial effort relative to rebuilding independently    Long-term risk    Assessment
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Rebuild from scratch in Masi                                               100 units       Medium-high    Wastes the Wave 2A reasoning
                                                                                                             and review work
  ───────────────────────────────  ─────────────────────────────────────────────────────  ────────────────  ───────────────────────────────
   Copy the Zazi branch                                           55-75 units initially         Very high    Fast-looking false economy;
   wholesale                                                                                                 Programme and aggregate
                                                                                                             assumptions are wrong
  ───────────────────────────────  ─────────────────────────────────────────────────────  ────────────────  ───────────────────────────────
   Selectively port the kernel                                              40-60 units            Lowest    Recommended
   and redesign adapters
  ───────────────────────────────  ─────────────────────────────────────────────────────  ────────────────  ───────────────────────────────
   Extract a shared package                                                 55-70 units       Medium-high    Premature while Zazi’s
   immediately                                                                                               runtime contract is still
                                                                                                             moving
  ───────────────────────────────  ─────────────────────────────────────────────────────  ────────────────  ───────────────────────────────
   Port twice, then extract the                     40-60 now; lower future maintenance        Low-medium    Best sequencing
   stable common kernel

  ### Benefits

  - Cross-account safety: high. Masi’s owner filtering is helpful but weaker than transaction-authoritative actor capture.
  - Stale local acknowledgement safety: medium. Masi already has a useful CAS; Wave 2A makes it explicit and stronger.
  - Stale server request safety: high. Masi does not currently have server generation heads.
  - Atomic server aggregates: high. Masi’s sessions, assessments, and children already expose clear family boundaries.
  - Bounded failure and queue recovery: high. The current serialized request queue has no structural deadline.
  - Operational supportability: high. Receipts, audit sequences, and integrity evidence make “what happened?” answerable.
  - Scale benefit: medium. The protocol improves batching and controls bursts, but its main value is correctness, not raw throughput.
  - Maintainability: high if descriptor-driven. Low if the Zazi SQL and family assumptions are copied into Masi.

  ### Costs and risks

  - Every Masi RPC still needs typed payload design, authorization, lock order, capacity limits, real PostgreSQL tests, and rollback
    verification.

  - Multiple deployed Masi versions require a more careful coexistence strategy than Zazi.
  - Masi’s Head Office writers require conflict semantics outside the current Wave 2A guarantee.
  - Assessment architecture is still growing toward Questions, Batteries, Runs, drafts, and WelaPLUS. Building a rigid assessment RPC too
    early could cause expensive rework.

  - Grouping identity appears under-scoped by Programme and should be corrected first.

  ## Build versus buy does not remove the domain work

  I would not adopt PowerSync merely to avoid porting Wave 2A.

  PowerSync can take responsibility for local change capture, upload scheduling, and inbound replication, but its official React Native
  integration still requires your backend connector to implement uploadData() and decide how each transaction is applied to the source
  database. In other words, it can replace much of the transport and read-sync machinery, but it does not decide Masi’s aggregate
  boundaries, authorization, replay semantics, or Head Office conflict policy. See the official PowerSync React Native integration
  (https://docs.powersync.com/client-sdks/reference/react-native-and-expo) and upload loop behavior
  (https://docs.powersync.com/configuration/app-backend/client-side-integration).

  Keeping a transport-neutral mutation interface is still wise. It would let a future PowerSync connector feed the same Masi aggregate
  command layer instead of forcing another domain rewrite.

  For the present Supabase approach, fixed database functions remain appropriate for atomic, data-intensive family application. Supabase
  documents database functions as an API-accessible mechanism for database-local logic, and recommends an empty search_path for the cases
  where SECURITY DEFINER is required. See Supabase Database Functions (https://supabase.com/docs/guides/database/functions).

  ## Postgres implications from the best-practices review

  The Supabase/Postgres review reinforces four requirements for the Masi port:

  - Lock every receipt, head, parent, and member in a deterministic order. Family RPCs that lock overlapping rows in different orders will
    eventually deadlock.

  - Keep RPC transactions short. Validate shape and size before acquiring domain locks.
  - Add query-shaped composite and partial indexes for the actual actor, Programme, lifecycle, and cursor predicates. Do not add blanket
    indexes without a query contract.

  - Optimize RLS expressions and index all relationship columns used by policies. Supabase specifically recommends wrapping stable
    authentication calls as (select auth.uid()) so they can be evaluated once rather than once per row. See Supabase RLS performance
    guidance (https://supabase.com/docs/guides/database/postgres/row-level-security).

  This matters more in Masi because Programme scope adds another equality predicate to many authorization and pull queries.

  ## Recommended sequence

  ### Step 1: Finish Masi’s bidirectional history slice first

  The immediate, demonstrated product failure is that a fresh installation cannot hydrate session and assessment history. Masi’s roadmap
  correctly marks this P1. See documentation/ROADMAP.md:78.

  Wave 2A’s write protocol does not solve that. Delaying history hydration for a long write-engine rebuild would be the wrong product
  priority.

  Build history hydration in a way that remains compatible with the future kernel:

  - Programme- and EA-scoped;
  - parent-before-child;
  - keyset-paginated;
  - explicit completeness evidence;
  - pending-local protection;
  - no absence-based deletion from ordinary RLS results;
  - two-device physical proof.

  ### Step 2: Complete Zazi’s remaining kernel and cutover proof

  Before treating the Zazi implementation as the port source, complete or freeze:

  - the shared v2 worker;
  - legacy-engine kill switch;
  - live dispatch/environment gate;
  - full integrity detector and review UI;
  - jitter and pull decisions;
  - final release proof.

  Porting before these interfaces settle risks repeating the same corrections in both repositories.

  Masi work can still begin during this period with domain analysis, mutation inventory, and aggregate decisions.

  ### Step 3: Write a Masi-specific safety-floor specification

  Reuse Zazi’s six failure promises, but extend the scope for Masi:

  1. No cross-account upload.
  2. No stale local settlement.
  3. No stale same-stream server overwrite.
  4. No infinite retry or permanent queue wedge.
  5. No silent mutation missing its slot.
  6. No partial server aggregate.
  7. No Programme scope inferred at upload time.
  8. No silent cross-writer overwrite of a shared Masi aggregate.
  9. No v2 activation without dispatch, environment, rollback, and old-version coexistence proof.

  The spec should classify every Masi mutation surface before implementation.

  ### Step 4: Resolve Programme-scoped grouping identity

  Decide explicitly whether grouping state and grouping versions are scoped by:

  class + academic year

  or:

  class + Programme + academic year

  The current domain language strongly suggests the latter, but this deserves a deliberate ADR-level decision because it affects schema,
  identities, RLS, Head Office staging, group membership, session history, and sync heads.

  ### Step 5: Introduce a shadow protocol beside the existing engine

  Use additive local migrations:

  - account streams;
  - record counters;
  - v2 outbox;
  - audit sequence;
  - integrity evidence;
  - family provenance columns as each family converts.

  Keep the feature flag off and preserve the current engine byte-for-byte while the shadow path is built.

  Because multiple Masi versions remain in the wild, the server must support both:

  - old binaries using generic v1 operations;
  - new binaries using fixed v2 RPCs.

  The new binary must use one local engine per mutation surface. Older binaries can continue using v1 until they age out. Do not enforce
  server triggers that reject old-client writes while those binaries remain supported.

  ### Step 6: Port one standalone vertical slice

  Start with TIME_ENTRIES:

  - small payload;
  - no member family;
  - actor-owned;
  - easy replay testing;
  - good deadline and failure-taxonomy tracer.

  This proves the kernel against Masi’s persistent writer without prematurely confronting the complex Programme families.

  ### Step 7: Build the session aggregate

  Next use:

  SESSIONS root
    + complete SESSION_ATTENDEES snapshot
    + durable programme_id
    + durable group_id once the group-first contract lands

  Coordinate this with session-history hydration so push and pull agree on the same family identity and historical snapshot.

  ### Step 8: Delay the final assessment family shape until Battery/Run boundaries are clear

  Masi’s assessment domain is broader than Zazi’s:

  - assessment tools and Windows;
  - future Questions;
  - Batteries and Battery Runs;
  - durable drafts;
  - WelaPLUS;
  - Programme-scoped mastery;
  - multiple marking modes.

  Port the generic family machinery, but do not freeze the final assessment RPC around the current EGRA-only row shape if the Battery/Run
  work is likely to change the aggregate soon.

  ### Step 9: Build shared-aggregate commands last

  Children, classes, groupings, assignments, enrollments, and memberships require the most Masi-specific design.

  For each one, explicitly decide:

  - global or Programme-specific identity;
  - actor authority;
  - Head Office authority;
  - expected-version or staging behavior;
  - root and member ownership;
  - delete/archive semantics;
  - cross-device policy;
  - exact pull/reconcile authority.

  ### Step 10: Extract a shared package only after both implementations are proven

  Once Zazi and Masi have working kernels, compare the files mechanically. Extract only code that is truly identical in responsibility and
  tests.

  Likely shared-package candidates:

  - canonical encoding;
  - envelope validation;
  - claim/finalizer state machine;
  - failure normalization;
  - deadline boundary;
  - retry-budget logic;
  - release-gate primitives;
  - generic test-vector builders.

  Keep these app-owned:

  - SQLite migrations;
  - repositories;
  - domain descriptors;
  - family snapshots;
  - Supabase RPC migrations;
  - authorization SQL;
  - RLS;
  - pull/reconcile;
  - capacity fixtures;
  - product-specific conflict policy.

  That gives you real reuse without forcing two different domains into an abstraction designed from only one example.

  ## Final recommendation

  The cost-benefit case is positive, but only for a selective architectural port.

  I would make the decision as follows:

  1. Adopt the Wave 2A safety model for Masi.
  2. Do not adopt Zazi’s exact architecture as Masi’s final domain architecture.
  3. Keep Masi’s persistent SQLite writer and pull/reconcile system.
  4. Port the causal write kernel behind a transport-neutral interface.
  5. Redesign the aggregate adapters and RPCs around Programme scope.
  6. Give shared Masi entities a cross-writer policy beyond Zazi’s same-stream heads.
  7. Finish history hydration before the large write-engine build.
  8. Resolve Programme-scoped grouping before porting grouping code.
  9. Wait to extract a shared library until the second implementation proves the abstraction.

  This should let you retain most of the intellectual value of the enormous Zazi effort without inheriting its single-Programme assumptions
  or duplicating every discovery and review cycle.

  No code, documentation, git state, or database state was changed during this analysis.

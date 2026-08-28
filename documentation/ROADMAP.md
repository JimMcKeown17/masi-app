# Product and Engineering Roadmap

**Standing document. Updated 2026-08-27. This is the single in-repository answer to
"what is still outstanding?"**

This file contains open work only. Its priority section is the roadmap; the numbered sections are
the detailed work register behind that roadmap. Completed implementation and verification belong in
[`build-log.md`](./build-log.md); physical checks belong in
[`device-gates-sqlite-backend-2026-07.md`](./device-gates-sqlite-backend-2026-07.md);
unsettled product choices belong in
[`open-decisions-backlog.md`](./open-decisions-backlog.md). Dated plans and reviews are evidence,
not status.

## Pre-live hardening window

Jim confirmed on 2026-08-27 that no staff are currently using the Masi app, while staff want to go
live soon. Use this window for root-cause schema, identity, authorization, sync, and operational
changes that would become much more expensive after trusted work accumulates on phones. "No active
users" does not prove that no old binaries, test records, credentials, or legacy-backend automation
exist; the first gate is an exact estate and live-contract inventory.

The governing portfolio strategy and reusable safety contract are
[`masi-zazi-portfolio-audit-2026-08-27.md`](./masi-zazi-portfolio-audit-2026-08-27.md) and
[`field-app-portfolio-invariants.md`](./field-app-portfolio-invariants.md).

## Roadmap view

| Horizon | Outcome |
|---|---|
| **Now** | Finish exact pre-live ground truth, align history authorization with ADR-0005, build bounded bidirectional session then assessment history, and add minimum incident/release provenance. |
| **Next** | Close reachable correctness risks, finish reconnect/fleet admission controls, and settle Programme/group authority and identity before group-centred delivery. |
| **Later** | Build the group workflow and durable drafts, resume WelaPLUS on the current architecture, prepare the Head Office control plane, and validate national-scale operations. |
| **Ongoing** | Product polish, assessment content, dependency hygiene, teaching documentation, and evidence in the build log. |

These horizons summarize the ordered register below. They are not a second backlog.

## Priority order

1. **P0: establish pre-live ground truth and the next release baseline.** Inventory installed/build
   expectations, both Supabase projects, current configuration and automation; probe the live
   SQLite-backend schema/RLS/query cost; settle history retention and row-limit assumptions.
2. **P0: align history authorization before hydrating it.** Live policies currently reuse a broad
   child-read helper: session history can inherit class/group scope contrary to ADR-0005, while
   assessment history is not bounded to the current academic year. Add activity-specific predicates
   and authenticated behavior/plan proof first.
3. **P0: make session and assessment history bidirectional.** Start with sessions/attendees, then
   assessments/items. A fresh install currently uploads
   new work but cannot hydrate existing `sessions`/`session_attendees` or
   `assessments`/`assessment_items`. Bounded keyset pagination and request deadlines are part of the
   first implementation, not a later optimization.
4. **P0: add minimum incident and release provenance before expanding the pilot.** Durable,
   idempotent, privacy-safe incidents need stable causal identity, a reader, an action, and exact
   backend/app/runtime/protocol provenance.
5. **P1: close reachable correctness gaps.** Fix session-attendee removal before saved-session
   editing ships, add the newer-schema fail-safe, and resolve the remaining auth-diagnostic
   ambiguity.
6. **P1: finish sync efficiency and fleet controls.** Membership-specific batching, delta pulls,
   randomized retry/reconnect scheduling, remote controls, and proven query-specific indexes.
7. **P2: settle Programme/group authority, then build group-centred sessions in contract order.**
   Access grants and identity,
   then RLS/sync, then UI and durable session drafts.
8. **P3: resume WelaPLUS deliberately.** Integrate the off-main Question island without importing
   stale design or identity contracts.
9. **P4: polish, hygiene, and longer-horizon scale work.**

The deferred Head Office importer is not in the active execution order. It begins with read-only
discovery of the existing Airtable/Postgres source model with Jim, not with an invented CSV or JSON
shape.

## 0. Pre-live ground truth, observability, and pilot activation

### Exact estate and contract inventory

- [x] Inventory current Masi branches, EAS build artifacts, runtime/channel/update identity, and
  source release profiles. App Store Connect, Play delivery, and installed devices remain open.
- [ ] Verify which Supabase project every current app profile, local environment, script, and
  connected backend targets. The forward SQLite project is verified; the legacy project requires
  explicit authorization before a counts-only probe.
- [x] Probe the live SQLite-backend schema, migration ledger, RLS, functions, indexes, row counts,
  and unclassified forward data before schema-facing design. The data appears to be test/pilot
  data, but classification and disposition remain unsettled.
- [ ] Measure the final corrected history predicates against authenticated RLS/query plans. The
  current broad session plan has been measured and rejected; the hosted PostgREST cap is still
  unverified.
- [x] **Decision locked:** history event families (`sessions`/attendees and
  `assessments`/items) are retained truth and are never absence-deleted from an incomplete or
  ordinary empty page. Implementation proof remains open in §1. Active assignment/membership
  relationships retain their separate complete-snapshot reconcile contract.
- [ ] Decide whether the existing forward-backend test/pilot records are retained, snapshotted and
  reset, or left untouched until the history slices pass.
- [ ] Choose the immutable app/runtime/build/backend/protocol identity for the next internal pilot.

### Release and observability

- [x] Build iOS and Android preview binaries for app/runtime 1.3.0. Those July artifacts are
  historical evidence; source has moved and the post-hardening pilot will require a new build.
- [ ] Confirm the EAS build logs contain successful Sentry source-map uploads.
- [ ] Pass device gates N1, N2, N4, N6, and N7 for symbolication, structured sync reporting, local
  evidence, and telemetry privacy.
- [ ] Connect and test the agreed Sentry alert rules.
- [ ] Confirm every field device starts from a fresh installation, not an upgrade over the retired
  local data model.

Sentry native/JavaScript capture, privacy hardening, runtime diagnostics, structured sync events,
safe verification, EAS environment values, and the sensitive upload token are built. The remaining
work is external release and device proof.

### Minimum incident and provenance lane

- [ ] Define a stable incident identity and preserve first/last-seen evidence without minting one
  record per sync cycle.
- [ ] Add a durable local incident queue and an authenticated idempotent server-acceptance path
  outside the serialized domain outbox.
- [ ] Carry privacy-safe actor, backend/project, app/runtime/build, protocol, capability/scope, and
  normalized-disposition provenance.
- [ ] Give every incident/support state a named reader, bounded diagnostic view, safe action, and
  retention rule. Sentry is telemetry, not the durable sync-state ledger.

### Highest-signal device gates

The device checklist is not untouched: C7, C8, and D5 passed on 2026-07-23, and earlier pilot/device
checks are recorded in the build log. The remaining checklist is still substantial. Start with:

- G1: head-office removal persists through force-quit and offline restart.
- H3: pending work remains owned by the correct EA across sign-out/sign-in.
- I1: low-end Android session-roster scrolling.
- B1: indoor GPS timeout and no-location fallback.
- C6: durable current reading level plus immutable session snapshot.
- M1-M10: seeded and zero-class onboarding paths.
- J6: BottomSheet geometry on a standalone preview build.
- E4: assessment attribution across a South African Programme-day boundary.
- S1-S7: locked Home and five-slot navigation visual acceptance.

## 1. Bidirectional session and assessment history

**P0. First implementation slices: sessions/attendees, then assessments/items.**

On 2026-07-23, a fresh TestFlight 1.3.0 installation showed no historical sessions or assessments
even though the correct SQLite backend then held 20 sessions, 40 attendees, 22 assessments, and
604 assessment items for that EA. Those are dated diagnosis figures, not the current total estate;
the 2026-08-27 Gate 0 counts are recorded separately. Current history screens read SQLite
correctly; the missing contract is inbound hydration.

- [ ] Correct and behavior-test activity-specific RLS before pulling: sessions are
  capturer-or-delivery-history scoped; assessments are current-academic-year class scoped. Do not
  reuse every arm of `current_user_can_read_child` for both.
- [ ] Verify and reuse the existing `ClassesContext`/SQLite `class_ea_assignments` hydration for
  assessment scope. Define one canonical SQLite-derived assessment-eligibility query, including
  inactive/revoked and current-year behavior; do not couple correctness to React context arrival
  order.
- [ ] Prove that a server class-assignment row flows through `ClassesContext` into SQLite, survives
  a fresh read, and is consumed by the canonical assessment-scope query; prove an inactive/revoked
  assignment does not grant current scope.
- [ ] Add authenticated, Programme-scoped pull for `sessions` and `session_attendees` through the
  corrected delivery-history predicate.
- [ ] Add authenticated, Programme/current-year-class-scoped pull for `assessments` and
  `assessment_items`.
- [ ] Use bounded keyset pagination with an `id` tie-breaker and request deadline for every parent
  and child page from the first implementation. Do not ship an unpaginated intermediate path.
- [ ] Persist each parent and its children transactionally through typed repositories, with parents
  applied before dependents.
- [ ] Preserve pending, failed, and terminal local work when server rows overlap.
- [ ] Define positive parent/child completeness evidence. Ordinary RLS-filtered, expired, errored,
  or truncated queries may not mark hydration complete and never authorize history deletion.
- [ ] Update `rls-sync-contract-map.md` with producer, authorization, ordering, identity, conflict,
  and reconcile rules.
- [ ] Cover first install, reinstall, second device, offline restart, pending-local collision, and
  parent-before-child ordering in real-SQLite tests.
- [ ] Add two-device physical gates proving device A history appears on device B.
- [ ] Make sync status distinguish "all local writes uploaded" from "local history fully hydrated."

Until this lands, a green sync label proves outbound completion only.

## 2. Correctness and safety

### Data and lifecycle

- [ ] **Newer-schema fail-safe:** when SQLite `user_version` exceeds the bundle's
  `CURRENT_SCHEMA_VERSION`, stop safely instead of running an older OTA bundle against a newer
  schema.
- [ ] **Assessment draft persistence:** force-quit currently loses an in-progress assessment.
  Address this with the longer WelaPLUS/durable-draft lifecycle rather than a one-off 60-second EGRA
  patch.
- [ ] **Removed session attendees:** `sessionsRepository` does not delete
  `session_attendees` removed by a later save. No current screen edits submitted sessions, but this
  must be fixed and behavior-tested before edit UI ships.
- [ ] **Cross-school Head Office reassignment:** current reconcile can be RLS-denied and terminal.
  Design an authorized archive-and-insert RPC rather than weakening ordinary mobile RLS.
- [ ] **Manual sign-out diagnostics:** the auth runbook previously promised a reliable
  `manual-sign-out` clearing category, but the current manual path clears state directly and the
  later auth event may be recorded only as `signed-out`. Either restore reliable provenance or
  explicitly adopt the simpler diagnostic contract.

### Deliberate tripwires

- [ ] Extend `GRANT_SUBJECTS` before membership-mediated class/group access ships. It currently
  models only the direct child-assignment grant and can false-terminal writes whose only valid grant
  is a pending class or group relationship.
- [ ] Define collision-proof identity for `grouping_versions`, `groups.display_number`, and
  `child_group_memberships` before the group-centred slice.
- [ ] Decide whether leaked-password protection is required before broader external rollout.

## 3. Sync efficiency and fleet behavior

- [ ] Design collision-safe, table-specific batching for class memberships and group memberships.
  Do not put either through generic upsert batching.
- [ ] Design delta pulls with the real owner/scope/time predicates, then add and prove the matching
  composite indexes. Do not add blanket `updated_at` indexes to every table.
- [ ] Add pagination to every potentially unbounded pull and define an enforced maximum where a
  scope is operationally expected to remain bounded.
- [ ] Add full-jitter backoff and randomized foreground/reconnect pull scheduling so a national
  fleet does not retry in synchronized waves.
- [ ] Add remotely configurable pull intervals and a sync kill switch before large staged rollout.
- [ ] Resolve whether My Children pull-to-refresh should force-push pending work or reload only.

Already closed and therefore intentionally absent from this backlog: record-scoped dependency
gating, bounded failed-batch fallback, versioned startup repair, queue-age preservation, set-based
batch claims, request-level pull fairness, child/programme batching, immutable-assignment insert
batching, bootstrap recovery, nullable session-relationship indexes, and the live reconcile
acknowledgment RPC.

## 4. Group-centred sessions and Head Office changes

The active specification is
[`group-session-workflow.md`](./group-session-workflow.md). Implement it in this order:

1. access grants and whole-class visibility;
2. identity and lifecycle contracts;
3. local schema, Supabase schema, RLS, payloads, ordering, and reconcile;
4. group cards and Group Detail;
5. group-first capture and durable session drafts;
6. device and two-device proof.

Additional Head Office behavior retained from the Sprint 4 follow-up:

- [ ] Model a school pause by Programme and academic year. Schools are not hard-deleted or globally
  "closed."
- [ ] Add ignore metadata for captured records that Head Office wants excluded without erasing
  history, and apply it consistently to reporting, mastery, and statistics.
- [ ] Give the EA a comprehensible history/surface for what Head Office changed.

## 5. Product and UX

- [ ] Session completion should return to the Home payoff state instead of a bare `goBack()`.
- [ ] Add a `deviceTier`/reduced-motion contract before celebratory animation work.
- [ ] Roll typography tokens out or retire the incomplete token system. Current tree: two importers
  and 97 raw `fontSize:` declarations. Add a fail-closed floor/allowed-scale guard if rolling out.
- [ ] Replace the 14 screen-local Snackbar hosts with `SnackbarContext` and one root host.
- [ ] Add class/group context to assessment child rows.
- [ ] Decide how Session History names attendees: full list, truncated `"Amahle +3"`, or count only.
- [ ] Remove the cosmetic selected checkmark from the "No class" picker row, or give the row a
  real selectable meaning.
- [ ] Add an explicit manual retry state for failed school/class reference-data loading.
- [ ] Decide the fate of `session_type_id` and `activities.__legacySession`: promote a real synced
  contract or remove the machinery.
- [ ] Push notifications and a durable message inbox remain unbuilt.

## 6. Head Office import and provisioning

**Deferred by Jim on 2026-07-14.** Roughly half of EAs receive classes, children, and groups from
Head Office; roughly half create them through guided local onboarding. The future importer must be
one idempotent source-to-target pipeline, not separate "seed" and "bulk import" scripts.

When this resumes:

- [ ] Inspect the Airtable/Postgres source tables, identifiers, relationships, and data-quality rules
  read-only with Jim.
- [ ] Define identity mapping, reconciliation, dry-run output, rerun behavior, and failure recovery.
- [ ] Reuse the app's deterministic-ID functions for `child_ea_assignments`,
  `child_programme_enrollments`, `class_ea_assignments`, and `group_ea_assignments`.
- [ ] Recompute today's expected IDs after import and require zero mismatches, including
  `letter_mastery`. Checking only whether an ID is random is unsound because obsolete deterministic
  formulas can also be wrong.
- [ ] Preserve recurring audit history for `child_class_memberships`; random row IDs are correct
  there, with reconcile-before-upsert.
- [ ] Define the collision contract for imported `child_group_memberships`.
- [ ] Build an audited national provisioning/control plane with role separation, revocation,
  secrets handling, and operator logs.

Current narrow capability: `scripts/createTesters.js` provisions explicit zero-class pilot testers
against the exact SQLite backend. `scripts/loadTestUsers.js` is deliberately disabled. The archived
[`seed plan`](./archive/seed_data_plan.md) and
[`bulk-import plan`](./archive/bulk_import_children_plan.md) are schema-dead and must not be revived.

## 7. Assessment content and additional forms

- [ ] Gather requirements and build the Numeracy Coach, ZZ Coach, and Yeboneer session forms. Only
  Literacy exists.
- [ ] Replace placeholder EGRA word lists with authoritative English and isiXhosa content.
- [ ] Configure Word Reading score bands. Until then the Words ranking remains neutral.
- [ ] Keep score thresholds explicit in `assessment-score-bands-config.md` and runtime code until a
  tested synced-table configuration path exists.

## 8. WelaPLUS

WelaPLUS is not on `main`. The 11 Question components and their tests are on
`feature/wela-plus-battery-merge` at `fed3175`, currently 34 commits behind `main` and 19 commits
ahead. The old `.claude` worktree no longer exists.

### Integration and contract work

- [ ] Rebase or otherwise reconcile the merge branch and review all branch-only commits against
  current design tokens, shared capture chrome, BottomSheet behavior, SQLite repositories, and
  outbox ownership.
- [ ] Confirm the branch still defuses the `assessmentItemDomainId` rekey. Land any identity change
  separately with a literal expected-UUID test, contract-map/build-log updates, and an explicit
  staging-data plan.
- [ ] Add a source-wide raw-hex guard and complete the warm Masi design conformance pass.
- [ ] Repair and verify the TypeScript/typecheck dependency and release-gate setup.
- [ ] Build the remaining local/server schema and contract: `battery_runs`,
  `battery_run_artifacts`, additive `assessments`/`programmes` fields, local photo queue, Storage
  bucket/RLS, allowlists, ordering, reference data, and EGRA backfill.
- [ ] Build host integration: Run create/resume/finalize/results, Question sequencing, skip reasons,
  prerequisite gates, per-Question atomic persistence, photo capture/upload, Settings, and support
  export.
- [ ] Decide the package boundary, publish/extract the OSS package, and add README, example, setup
  guide, integration prompt, versioning, and licensing ratification.

### Pedagogy and field validation

- [ ] Supply authoritative bilingual item sets, story scripts/answers, stop-rule copy, Q6/Q8
  durations, prerequisite thresholds, Q5 assets, Q11 picture/rubric anchors, and score bands.
- [ ] Build the HQ rubric/calibration path and dashboard consumption.
- [ ] Validate the first 50 Runs, including offline/restart, photo, RLS, sync, and low-end Android
  gates.

The full product contract remains
[`wela-plus-battery-prd-2026.md`](./wela-plus-battery-prd-2026.md).

## 9. National-scale readiness

The dated strategic assessment remains
[`national-scale-readiness-250k-users-2026-07-15.md`](./national-scale-readiness-250k-users-2026-07-15.md).
Its open operational work is tracked here:

- [ ] Define SLOs, RTO/RPO, retention, partitioning, and data-lifecycle policy.
- [ ] Configure custom SMTP and complete a PITR restore drill.
- [ ] Create an environment/capacity inventory, pilot dashboard, staged-rollout plan, incident
  runbook, and Supabase launch-notice checklist.
- [ ] Run realistic RLS/load/storm tests and measure writes, pulls, Auth, Realtime, storage, and
  recovery under staged concurrency.
- [ ] Separate national reporting/analytics workloads from the mobile transactional write path.
- [ ] Complete penetration testing, POPIA/privacy review, data-processing agreements, breach
  response, and government security evidence.
- [ ] Establish on-call, support, escalation, and incident-command ownership before national scale.
- [ ] Plan primary-capacity, read-replica, regional latency, and failure-domain upgrades from
  measured pilot data.

## 10. Hygiene

- [ ] Remove or justify dead runtime dependencies: `react-hook-form` and
  `expo-linear-gradient`.
- [ ] Remove deprecated `@testing-library/jest-native`; move `jest-expo` to `devDependencies`.
- [ ] Verify the Expo-compatible `react-native-get-random-values` version online before changing it.
- [ ] Add ESLint and Prettier configuration plus CI checks.
- [ ] Add a `test:coverage` script.
- [ ] Rename the nine `.plan5.test.js` suites when touched.

## Archived source map

The following dated files were archived on 2026-07-23 after their survivors were consolidated here:

- [`codebase-audit-2026-07-12.md`](./archive/codebase-audit-2026-07-12.md)
- [`improvements-2026-07.md`](./archive/improvements-2026-07.md)
- [`improvements-2026-07-roadmap.md`](./archive/improvements-2026-07-roadmap.md)
- [`sprint4-followups-2026-07-13.md`](./archive/sprint4-followups-2026-07-13.md)
- [`zazi-izandi-feature-port-roadmap.md`](./archive/zazi-izandi-feature-port-roadmap.md)

These files preserve rationale. They are not alternate backlogs.

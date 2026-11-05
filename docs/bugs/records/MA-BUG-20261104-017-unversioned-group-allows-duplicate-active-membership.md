---
record_version: 1
id: MA-BUG-20261104-017
title: "A child can hold two active memberships in the same unversioned group"
classification: product_defect
subsystem: groups-lifecycle

severity_score: 3
severity_band: S3
severity_components:
  user_impact: 1
  data_security_privacy: 2
  scope: 0
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: CONFIRMED
delivery_state: NO_FIX_PROPOSED
verification_state: NOT_TESTED

root_cause_confidence_pct: 80
confidence_basis: "Executed once in disposable Postgres 17: with grouping_version_id NULL the active-membership unique index does not apply and a second active row for the same child and group was accepted (rows affected 1, both removed_at null); how a phone produces the second insert was not driven."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T09:00:00Z
first_observed_at: 2026-11-04T19:49:55Z
last_observed_at: 2026-11-04T19:49:55Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "any unversioned group; no field cohort yet"

environment: "Disposable PostgreSQL 17 with all 41 supabase/migrations at main 8b79eae5 (psql under the authenticated EA role); not production"
affected_releases:
  - 1.5.0 pilot builds (embedded f002e08)
  - main at 8b79eae5
affected_devices: []
affected_os_versions: []
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys: []
support_incident_signatures: []
evidence_paths:
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/results.json
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/sql/L5.unversioned_group_duplicate_active.sql
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/raw-output.log
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/154

data_safety_status: "no data lost; the shape is a duplicate active row, which makes the child appear twice in the group and may double-count attendance; nothing in 1.5.0 detects or repairs it"
workaround_status: "Head Office can end the extra membership by hand (the lifecycle script, fix step 6); nothing prevents it recurring"
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-017 — A child can hold two active memberships in the same unversioned group

## User-visible symptom

No field report; reproduced by Claude.

In a group that has no grouping version set, the same child can end up in the group twice.
The EA would see the child listed twice in the group, or counted twice, and removing the
child once on the phone ends only the rows the phone knows about. No error or Needs attention
card is shown, because the server accepts the second row.

## Operational impact

- **Can the user continue?** Yes. Nothing is refused.
- **Core workflow affected:** Group membership lists and anything counting group members (group lesson attendance, group assessments).
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** EAs with groups whose `grouping_version_id` is NULL (including groups seeded NULL as the interim for MA-BUG-20261104-016).
- **Workaround:** Head Office ends the extra membership. There is no EA-side repair.

## Data-safety assessment

- **UI visibility:** Not driven through the app. The server holds two active rows, so any list that reads both shows the child twice.
- **Durable local SQLite rows:** Not tested; a phone that pulls both rows stores both.
- **Backend rows and relationships:** L5.unversioned_group_duplicate_active: the active memberships for the child in the group are `9b000000-0000-0000-0000-000000000001` and `9b000000-0000-0000-0000-000000000004`, both `removed_at: null`.
- **sync_outbox status, error_class/error_code:** Not applicable; the insert succeeds (rows affected 1).
- **Incident queue evidence:** None. The server accepts the row, so no phone receipt would be produced.
- **Eventual convergence evidence:** None; the duplicate persists until Head Office ends one.
- **Duplication, misattribution, or cross-account risk:** Duplication of a membership row (the defect itself); no cross-account exposure.

Do not equate "not visible in the UI" with "deleted." Record local durability,
backend state, relationship rows, and convergence evidence separately.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude, executed reproduction (disposable Postgres 17) | None (no field user) | 2026-11-04T19:49:55Z | 2026-11-05T01:00:00Z | Disposable PostgreSQL 17 with all 41 supabase/migrations at main 8b79eae5 (psql under the authenticated EA role); not production | None | None | L5.unversioned_group_duplicate_active in `results.json` (sha256 6d99c2ffdacb49248fddd5…) and `sql/L5.unversioned_group_duplicate_active.sql` (bfddc44898eedf18…) |

## Reproduction

### Reporter steps

1. A group has `grouping_version_id` NULL and the child already holds an active membership in it.
2. As the signed-in EA, insert a second membership for the same child and group with a new id.

### Expected

The second active membership is refused or merged.

### Actual

The insert is accepted (`rows_affected: 1`, new id `9b000000-0000-0000-0000-000000000004`); both memberships stay active.

### Closest E2E reproduction

Plain SQL under the authenticated EA role in Postgres 17 with the 41 migrations. No phone path was driven, so how a 1.5.0 phone would generate the second insert (for example a re-add whose removal is still unsent) is inferred, not reproduced.

## Observed facts

- L5.unversioned_group_duplicate_active (observed 2026-11-04T19:49:55Z): step "second active membership same child+group" returned one row, `rows_affected: 1`; the follow-up read lists two memberships for the child in the group, both with `removed_at: null`.
- The only unique index on active memberships is `idx_child_group_memberships_active_by_version on (child_id, grouping_version_id) where removed_at is null` (`supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:242-244`). With `grouping_version_id` NULL, Postgres treats NULLs as distinct, so the index does not constrain the pair. The earlier `idx_child_group_memberships_active_unique` was dropped in the same migration (line 240). Inference from that index definition; the harness did not read `pg_indexes` for this record.
- Why this matters for the plan: the same NULL behaviour is what lets MA-BUG-20261104-016's interim (seed groups with a NULL grouping version) avoid its `23505`.
- Server-side, so it applies to every app version: 1.5.0 and main share one backend. The 1.5.0 client has no check for it.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The unique index does not cover unversioned groups, so a duplicate active row is accepted | L5 result; index definition | A phone-driven duplicate was not produced; `pg_indexes` was not read in this run | 80% | Run `pg_indexes` on the disposable database and on staging (read-only), then drive the add, remove, add sequence in an unversioned group |

## Root cause

The server enforces one active membership per child and grouping version only. Groups with no grouping version are outside that rule, and no other constraint or trigger covers `(child_id, group_id)` while `removed_at` is null. Any second insert with a fresh id is therefore stored.

## Suggested fix

No constraint is proposed, deliberately. A new unique index on `(child_id, group_id)` would turn the 1.5.0 phone's re-sends of the same shape into terminal `23505` refusals (the classifier treats them as terminal) and strand work on phones that cannot be updated at once. Instead the plan detects the shape: the daily read-only check (fix step 6, in `/bug-sync`) lists duplicate active `(child_id, group_id)` memberships. The November Head Office script (`scripts/ho-lifecycle.cjs`: handover, end-delivery, reopen) does **not** end memberships, so a repair is a separate, Jim-approved action (a vetted one-off statement, or a future `end-membership` command). Revisit a constraint only after no 1.5.0 phone can produce the shape.

## Verification plan

- [ ] Add the daily check query and confirm it returns the L5 duplicate on the disposable database.
- [ ] Add a CI harness case that records the current acceptance, so a later constraint change is a deliberate decision.
- [ ] Verify with `pg_indexes` that no other index covers unversioned active memberships (read-only, staging).
- [ ] Drive the phone path that creates the duplicate, on a 1.5.0 pilot build.
- [ ] Verify the repair script ends the extra membership and phones converge after a pull.
- [ ] Observe the daily check across the November retest with no new duplicates.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | L5.unversioned_group_duplicate_active; docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/ |
| 2026-11-05T02:30:00Z | Claude | Detection issue linked | Issues #154; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-ho-tools |
| 2026-11-05T03:40:00Z | Claude | Repair path corrected | The H1 script built on feat/lifecycle-ho-tools has no membership command; detection only for November, repair needs Jim's approval |
| 2026-11-05T09:00:00Z | Claude | Detection built (daily invariant check lists duplicates); no repair command | feat/lifecycle-ho-tools: ho-lifecycle harness 34/34 on all 46 migrations incl. the guard, 107 unit tests. Independent adversarial reviews of the server batch and the combined OTA; their findings fixed. Next: staging apply + two-phone 1.5.0 check (#157), OTA gate (#158) |

## Open questions

- Can a 1.5.0 phone actually produce the duplicate, or only direct SQL? This decides whether the daily check is enough.
- If Head Office stops seeding NULL grouping versions after the OTA, does this shape disappear in practice?

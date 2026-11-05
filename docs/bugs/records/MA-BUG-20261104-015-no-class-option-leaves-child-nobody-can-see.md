---
record_version: 1
id: MA-BUG-20261104-015
title: "Choosing 'No class' for a child makes the child disappear from My Children"
classification: product_defect
subsystem: children-lifecycle

severity_score: 5
severity_band: S2
severity_components:
  user_impact: 2
  data_security_privacy: 1
  scope: 1
  recoverability: 1
severity_override: none
priority: P2

diagnosis_state: CONFIRMED
delivery_state: IN_PROGRESS
verification_state: NOT_TESTED

root_cause_confidence_pct: 85
confidence_basis: "Real SQLite through the production repositories, sync engine and pull shows the child leave My Children after 'No class', with the same writes accepted by disposable PostgreSQL 17 (E6-no-class)."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T02:30:00Z
first_observed_at: 2026-11-04T19:55:33Z
last_observed_at: 2026-11-04T19:55:33Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "any time an EA picks No class on Edit child; not yet seen in the field"

environment: "Disposable PostgreSQL 17 with all 41 supabase/migrations at main 8b79eae5; real SQLite (better-sqlite3, Node 20) through the production repositories and sync engine with a stateful fake transport, wire replayed into PG17 (E6)"
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
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-client-lifecycle-edges/observations.jsonl
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-client-lifecycle-edges/pg-results.json
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-client-lifecycle-edges/reproLifecycleEdges.integration.test.js.txt
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/156

data_safety_status: "No data lost. The child, assignment and enrolment stay open; only the class membership is ended, so no reader lists the child."
workaround_status: "Interim: EAs avoid choosing No class. Whether the EA can reach the child afterwards to pick a class again is unknown; Head Office can reattach a class."
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-015 — Choosing 'No class' for a child makes the child disappear from My Children

## User-visible symptom

No field report; reproduced by Claude. On Edit child, the class picker offers "No class —
Remove the current class assignment". An EA who picks it sees "Class updated". The child is
then missing from My Children (and from the assessment list), although the EA is still
assigned to the child.

## Operational impact

- **Can the user continue?** Yes for other children. The affected child cannot be selected for a lesson or assessment.
- **Core workflow affected:** My Children, lessons, assessments for that child.
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** EAs who pick "No class".
- **Workaround:** Avoid the option. Recovery path for an EA who already chose it is unknown (the child is not in their list).

## Data-safety assessment

- **UI visibility:** E6 `getMyChildren` `[]` and `getAssessableChildren` `[]` right after the change; the class itself still shows in `getClasses`.
- **Durable local SQLite rows:** Child kept with `class_id: null`; assignment `cha-a-9` and enrolment `cpe-9` still open (`unassigned_at` / `ended_at` null); membership `ccm-9` has `exited_at` set.
- **Backend rows and relationships:** Server child `class_id: null`, `row_version` 2; membership `ccm-9` `exited_at: 2026-11-04T19:55:26.493Z`; assignment and enrolment still open.
- **sync_outbox status, error_class/error_code:** `child_class_memberships:ccm-9:archive` and `children:child-9:update`, both pending then drained (`success: true`, `totalTerminal: 0`).
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** The server and phone agree; the child stays hidden after the next pull (`childClassMemberships: []`).
- **Duplication, misattribution, or cross-account risk:** The membership is shared across programmes, so another EA's list can also lose the child (see MA-BUG-20261104-014).

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude executed reproduction, E6 (real SQLite + PG17) | None | 2026-11-04T19:55:33Z | 2026-11-05T01:00:00Z | main 8b79eae5, real SQLite Node 20, PostgreSQL 17 | None | None | `observations.jsonl` (sha256 `c0eea20fd866417fea90c33a91236d95468538d2733d715461e7cfabae7f374f`), `pg-results.json` (`1bade6e43debbec6c31aed1162328ed2f1f18e9b15358450a4281c01b9ce9f67`), `reproLifecycleEdges.integration.test.js.txt` (`e7fe8ca5553a8b6fa9409898e93c8963e1cac01f75b38fd2ac8ece399a1795cb`) |

## Reproduction

### Reporter steps

1. Open a child in My Children and tap Edit.
2. Tap the class row and choose "No class".
3. Go back to My Children.

### Expected

Either the child stays in My Children, or the app does not offer an option that removes the child.

### Actual

"Class updated" appears and the child is gone from My Children and assessments.

### Closest E2E reproduction

E6: production repositories, sync engine and pull against a stateful fake server with modelled
RLS, replayed into PostgreSQL 17 (`E6-no-class`: `children:rows=1`, `child_class_memberships:rows=1`,
`assignment-active:true`, `enrollment-active:true`, `open-class-memberships:0`).

## Observed facts

- UI: `EditChildScreen.js` offers `NO_CLASS_OPTION_KEY` with label "No class" and description "Remove the current class assignment" (`:331-337`); `handleClassSelect` maps it to `class_id: null` and calls `updateChild` (`:140-146`). The same option exists in the 1.5.0 pilot source (`git show f002e08:src/screens/children/EditChildScreen.js`, label at `:327`).
- E6 `after-no-class`: outbox `child_class_memberships:ccm-9:archive` and `children:child-9:update`; the local membership `exited_at` is set and `getMyChildren` is `[]` immediately.
- E6 `after-sync-and-pull`: calls `update:children:child-9 ... rowsAffected 1` and `update:child_class_memberships:ccm-9 [exited_at,row_version] -> rowsAffected 1`; the pull returns `child-9` with an empty `childClassMemberships` scope; `getMyChildren` still `[]`, `getClasses` `["class-k"]`.
- Reader: `getMyChildren` joins an open `child_class_memberships` row on a non-archived class (`src/db/repositories/childrenRepository.js:847-852`), so a child with no open membership is not listed even though the assignment and enrolment are open.
- 1.5.0 pilot source: `getMyChildren` has the same join (`f002e08`, `childrenRepository.js`, lines near 845-851).
- Not verified: how the EA reaches the child afterwards to choose a class again.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| "No class" ends the only membership and every reader requires an open membership | E6 local and server rows, `getMyChildren` SQL | None | 85% | After removal of the option, a harness case asserts the child is never orphaned |

## Root cause

The picker lets the EA remove the child's class. The app ends the class membership (and
clears the child's `class_id`), but delivery readers define "my child" as assigned, enrolled
and in an open membership of a live class. The three facts disagree, so the child exists on
the server and on the phone but no reader will list it.

## Suggested fix

Approved plan, fix step 8 (OTA): remove the "No class" option. To move a child, the EA picks
another class. Interim: EAs avoid choosing No class. 1.5.0 phones keep the option until the
OTA arrives.

## Verification plan

- [ ] Reproduce on a 1.5.0 pilot build: pick No class, check My Children.
- [ ] Add E6 to the frozen 1.5.0 compatibility gate (fix step 1), red first, and a screen test that the option is gone.
- [ ] Verify locally that the picker offers only real classes.
- [ ] Run the closest E2E flow on a physical device (OTA build).
- [ ] Verify local durability and backend convergence: a child always has an open membership.
- [ ] Identify the exact OTA updateId containing the fix.
- [ ] Field sweep: children with an open assignment but no open class membership.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | E6, `docs/bugs/evidence/MA-BUG-20261104-001/repro-client-lifecycle-edges/` |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #156; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-ota-removal |

## Open questions

- Can an EA reach a hidden child to pick a class again (for example from the class screen)? That decides whether recoverability is 0 or 1.
- Is the "Class updated" toast shown for this option on every path? E6 does not drive the screen, only the repository calls it makes.

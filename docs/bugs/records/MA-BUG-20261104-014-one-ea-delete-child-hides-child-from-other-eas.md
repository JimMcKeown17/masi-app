---
record_version: 1
id: MA-BUG-20261104-014
title: "One EA's Delete child hides the child from every other EA who teaches that child"
classification: product_defect
subsystem: children-lifecycle

severity_score: 8
severity_band: S1
severity_components:
  user_impact: 3
  data_security_privacy: 2
  scope: 2
  recoverability: 1
severity_override: none
priority: P1

diagnosis_state: PROBABLE
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 70
confidence_basis: "Mechanism traced step by step in the current source and the 1.5.0 pilot source and supported by executed single-EA archive runs (E1c, pg-results), but the two-EA (literacy plus numeracy) case itself was not executed."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T09:00:00Z
first_observed_at: 2026-11-05T00:50:00Z
last_observed_at: 2026-11-05T00:50:00Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; found by code trace before the November 2026 EA retest, not executed"
exposure_window: "any Delete child by an EA on a child that another EA (another programme or a class co-holder) also teaches; not yet seen in the field"

environment: "Code trace only, on main 8b79eae5 and the 1.5.0 pilot source (f002e08); not executed. Found by the plan's adversarial critic and spot-checked by Claude."
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
evidence_paths: []
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/156
  - https://github.com/JimMcKeown17/masi-app/issues/153

data_safety_status: "No rows deleted. The child is archived and its class membership ended on the server for everyone; the other EA's phone hides the child. Head Office can reopen them."
workaround_status: "Interim rule: EAs do not use Delete child until their phone shows the OTA updateId. The OTA part of the plan is a hard gate before real lessons."
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-014 — One EA's Delete child hides the child from every other EA who teaches that child

## User-visible symptom

No field report; found by reading the code, not executed. A literacy EA taps Delete child
on a child. That child later vanishes from the My Children list of a numeracy EA who also
teaches them (and from a co-EA who shares the class), although neither Head Office nor that
EA did anything.

## Operational impact

- **Can the user continue?** The other EA cannot teach or assess that child until Head Office repairs it.
- **Core workflow affected:** My Children, lessons and assessments for the second EA.
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** Children taught by more than one EA: both programmes (literacy and numeracy) and class co-holders. This is the normal shape once numeracy runs.
- **Workaround:** Do not use Delete child; Head Office repairs by script.

## Data-safety assessment

- **UI visibility:** The child disappears from the other EA's My Children (by trace).
- **Durable local SQLite rows:** The other EA's phone keeps its rows; it receives the archived child and ended membership on its next pull.
- **Backend rows and relationships:** By trace, `children.archived_at` and the child's class membership(s) are set on the shared rows. E1c (single EA) shows the server accepts exactly these writes from an actively assigned EA.
- **sync_outbox status, error_class/error_code:** Not observed for this case; the actor's archive rows are expected to drain as successes.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** None; not executed.
- **Duplication, misattribution, or cross-account risk:** One EA's action changes another EA's visible children.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Plan adversarial critic, spot-checked by Claude (code trace only) | None | 2026-11-05T00:50:00Z | 2026-11-05T01:00:00Z | main 8b79eae5 and f002e08 source | None | None | `src/db/repositories/childrenRepository.js`, `src/services/preloadedChildData.js`, `supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql` (source only; no repro file) |

## Reproduction

### Reporter steps

1. A child is taught by a literacy EA (A) and a numeracy EA (B); both have open assignments, and the child is in a class that appears in both lists.
2. EA A opens Edit child, taps Delete, confirms; A's phone syncs.
3. EA B's phone downloads.

### Expected

A leaves the child; B still sees the child.

### Actual

Not executed. By trace, B no longer sees the child.

### Closest E2E reproduction

Not attempted. An executed two-EA real-SQLite case is proposed (Open questions).

## Observed facts

- `archiveChild` (`src/db/repositories/childrenRepository.js:928-976`) first archives the shared child row (`update children set archived_at ...`, outbox `children` archive, `:935-945`). Then the `relationshipUpdates` loop (`:947-972`) selects every open row by `child_id` only, with no user filter, for `child_ea_assignments`, `child_programme_enrollments`, `child_class_memberships` and `child_group_memberships`, ends them locally and queues one archive row per relationship.
- What the actor's phone holds limits the loop. It pulls its own open assignments (`user_id = userId`, `preloadedChildData.js:265-271`) and only the active programme's enrolments (`:293`, `:340`), so another EA's assignment and the other programme's enrolment are not in the actor's database. It does hold the child's open class membership(s): `child_class_memberships` has no programme or user column (`supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:112-125`) and the pull fetches every open membership of the EA's children (`preloadedChildData.js:310-316`).
- The server accepts these writes from any EA with an open assignment: `children_update_active_assignment_or_creator` (`20260521144901_...sql:673-682`) and `child_class_memberships_update_write_child_class` (`:872-880`) both rest on `private.current_user_can_write_for_child`, which does not care whose assignment it is. E1c and its PG17 proof (`E1c-replay-child-archive-after-reassign`: `children:rows=1`, `child_programme_enrollments:rows=1`, `child_class_memberships:rows=1`) executed these writes for a single EA.
- Reader: `getMyChildren` (`childrenRepository.js:831-857`) requires `children.archived_at is null`, an open programme enrolment in the EA's programme, and an open `child_class_memberships` row in a non-archived class. Either an archived child row or an ended shared class membership removes the child from B's list.
- Server guard limit: the plan's end-once guard (step 3) cannot absorb the class-membership exit, because on the wire "exit this membership" looks the same as a class move.
- 1.5.0 pilot source (`git show f002e08:`): `archiveChild` and its `relationshipUpdates` loop (`childrenRepository.js:928`, `:947`, `:954`), the pull's membership fetch (`preloadedChildData.js:315`) and `getMyChildren`'s class join are present, so the pilot builds have the same shape.
- Not verified by execution: that both EAs' phones then show what is described. The mechanism relies on the two code paths above composing as traced.
- Related: if the child has no history, `ChildrenContext.deleteChild` reaches `deleteIfNoHistory` first (see MA-BUG-20261104-012), where the server RPC deletes every EA's relationship rows for the child.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| Delete child archives the shared child row and ends the shared class membership, hiding it from other EAs | Code trace; E1c server acceptance | Not executed with two EAs | 70% | Two-EA real-SQLite case in the CI harness |
| The numeracy enrolment is also ended | Update policy only needs any active assignment | The actor's phone does not hold the other programme's enrolment | 25% | Same case, check the enrolment row |

## Root cause

Delete child is implemented as "archive the child and end every open relationship the phone
knows about", written for a single-owner child. The child row and the class membership are
shared across EAs and programmes, and the server lets any EA with an open assignment write them.
So one EA's lifecycle action rewrites shared state and removes the child from the other EA's
reader without that EA's phone having done anything.

## Suggested fix

Approved plan, fix step 8 (OTA): Delete child goes through the server RPC (made actor-scoped
by fix step 5); locally only the EA's own relationship rows end, and no per-relationship
archive rows are queued. Fix step 5 (server): leave or archive for the caller only, always
returning true. Decision: Delete child is "leave" when someone else holds the child. Because the
server guard cannot absorb the class-membership exit, this OTA part is a hard gate before real
lessons. Interim: EAs do not use Delete child until their phone shows the OTA updateId.

## Verification plan

- [ ] Execute the two-EA (literacy plus numeracy, plus a shared class) case in real SQLite against the Postgres harness and confirm the traced behaviour, red first.
- [ ] Add it to the frozen 1.5.0 compatibility gate (fix step 1).
- [ ] Verify the correction locally: B keeps the child, A's own rows end.
- [ ] Two-phone 1.5.0 device check, then again on the OTA build.
- [ ] Verify local durability and backend convergence for both phones.
- [ ] Identify the exact OTA updateId containing the fix.
- [ ] Field sweep: children archived while another open assignment exists.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from code trace | Found by the plan's adversarial critic and spot-checked by Claude; no reproduction |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #156, #153; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-ota-removal, feat/lifecycle-safety-server |
| 2026-11-05T09:00:00Z | Claude | Fixed in code, locally tested (not merged, not applied, not released) | feat/lifecycle-ota: real-SQLite regressions red-first; combined tree tmp/lifecycle-integration 3e487fda unit 8,355/8,355, integration 1,555/1,555; feat/lifecycle-safety-server: lifecycle-compat harness 77/77 on disposable PG17 (red 13/68 before), all 14 PG harnesses green. Independent adversarial reviews of the server batch and the combined OTA; their findings fixed. Next: staging apply + two-phone 1.5.0 check (#157), OTA gate (#158) |

## Open questions

- Add an executed two-EA (literacy plus numeracy) real-SQLite case to the CI harness to confirm; until then diagnosis stays PROBABLE.
- The assigned chain named the membership loop as the cause. The code also shows the first statement archives the shared child row itself, which alone hides the child (`getMyChildren` requires `archived_at is null`). The harness case should say which of the two removes the child first.
- Does the group-membership loop affect another EA? Group memberships are per group and the actor's phone only holds those of its own groups; not traced further.

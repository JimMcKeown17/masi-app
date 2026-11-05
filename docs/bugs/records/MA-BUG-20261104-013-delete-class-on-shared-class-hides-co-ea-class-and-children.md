---
record_version: 1
id: MA-BUG-20261104-013
title: "Deleting a shared class hides the class and its children from the other EA who teaches it"
classification: product_defect
subsystem: classes-lifecycle

severity_score: 7
severity_band: S1
severity_components:
  user_impact: 3
  data_security_privacy: 2
  scope: 1
  recoverability: 1
severity_override: none
priority: P1

diagnosis_state: CONFIRMED
delivery_state: RELEASED
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 85
confidence_basis: "Real SQLite through the production repositories and sync engine for two phones shows the co-EA's lists go empty after the other EA's Delete class, and the same wire requests were accepted by disposable PostgreSQL 17 (E5-co-ea-archive-and-ea-b-view)."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T15:44:00Z
first_observed_at: 2026-11-04T19:55:33Z
last_observed_at: 2026-11-04T19:55:33Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "any time two EAs hold the same class and one taps Delete class; not yet seen in the field"

environment: "Disposable PostgreSQL 17 with all 41 supabase/migrations at main 8b79eae5; real SQLite (better-sqlite3, Node 20) for two phones through the production repositories and sync engine, stateful fake transport, wire replayed into PG17 (E5)"
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
  - https://github.com/JimMcKeown17/masi-app/issues/153
  - https://github.com/JimMcKeown17/masi-app/issues/156

data_safety_status: "No data deleted. The class is archived on the server and the co-EA's phone hides it; Head Office can clear the archive, and the EAs cannot undo it."
workaround_status: "None for the EA. Head Office must unarchive the class by hand until the fix ships."
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-013 — Deleting a shared class hides the class and its children from the other EA who teaches it

## User-visible symptom

No field report; reproduced by Claude. Two EAs teach the same class. One of them taps Delete
class. After the other EA's phone next downloads, that class is gone from Classes and every
child they teach in it is gone from My Children and from the assessment list, even though
Head Office still has them assigned.

## Operational impact

- **Can the user continue?** The affected EA cannot reach their class or its children until Head Office repairs it.
- **Core workflow affected:** Teaching sessions and assessments for the co-EA; My Children; Classes.
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** EAs who share a class with another EA (co-teaching).
- **Workaround:** None for the EA; Head Office clears the class archive.

## Data-safety assessment

- **UI visibility:** E5 EA B: `getClasses` `[]`, `getMyChildren` `[]`, `getAssessableChildren` `[]` after the pull (before: class-shared, child-7, child-7 and child-8).
- **Durable local SQLite rows:** EA B's phone keeps everything; it only sets the class `archived_at` from the server. `getChildren()` still returns child-7 and child-8.
- **Backend rows and relationships:** class `class-shared` `archived_at: 2026-11-04T19:55:26.440Z`; EA A's class assignment ended; EA B's class assignment `cea-b-s` stays open; child-7's membership and assignment stay open; EA A's child-8 membership exited and its `class_id` nulled.
- **sync_outbox status, error_class/error_code:** EA A's outbox drains clean (`success: true`, `totalTerminal: 0`).
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Converges on the archived class; nothing restores it.
- **Duplication, misattribution, or cross-account risk:** One EA's action changes another EA's visible work.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude executed reproduction, E5 (two real-SQLite phones + PG17) | None | 2026-11-04T19:55:33Z | 2026-11-05T01:00:00Z | main 8b79eae5, real SQLite Node 20, PostgreSQL 17 | None | None | `observations.jsonl` (sha256 `c0eea20fd866417fea90c33a91236d95468538d2733d715461e7cfabae7f374f`), `pg-results.json` (`1bade6e43debbec6c31aed1162328ed2f1f18e9b15358450a4281c01b9ce9f67`), `reproLifecycleEdges.integration.test.js.txt` (`e7fe8ca5553a8b6fa9409898e93c8963e1cac01f75b38fd2ac8ece399a1795cb`) |

## Reproduction

### Reporter steps

1. EA A and EA B are both assigned to class "shared". Each has a delivery child in it (EA A: child-8, EA B: child-7).
2. EA A opens Edit class and taps Delete class, then syncs.
3. EA B's phone downloads.

### Expected

EA A leaves the class. EA B still sees the class and child-7.

### Actual

The class is archived for everyone; EA B sees no classes and no children.

### Closest E2E reproduction

E5: two phones with their own SQLite databases, the production `classesRepository.archiveClass`,
sync engine and pull, against a stateful fake server with modelled RLS, replayed into PG17.

## Observed facts

- E5 EA A pass: `update:classes:class-shared [archived_at,row_version] -> rowsAffected 1`; then `update:children:child-8 ... 1`, `update:child_class_memberships:ccm-child-8 [exited_at,row_version] -> 1`, `update:class_ea_assignments:cea-a-s [unassigned_at,row_version] -> 1`. Result `success: true`.
- The server accepts the class archive from a non-creator: the class was created by `head-office`; EA A passes the update policy because `classes_update_assigned_ea` uses `private.current_user_can_write_for_class` (`supabase/migrations/20260525231506_masi_rls_contract_cleanup.sql:107-116`), which is true for the creator or any open class assignee (`20260521144901_masi_zazi_alignment_schema.sql:368-388`). Nothing checks whether someone else also holds the class.
- PG17 proof `E5-co-ea-archive-and-ea-b-view`: `classes:rows=1`, `b-roster-pull:...|archived=true`, `b-child7-membership-active:true`, `b-child7-assignment-active:true`.
- E5 EA B after pull: local class `archived_at` set, `cea-b-s`, `cha-child-7` and `ccm-child-7` all still open, `getClasses`/`getMyChildren`/`getAssessableChildren` all `[]`. The readers drop the class because it is archived; `getMyChildren` also requires an open membership in a non-archived class (`childrenRepository.js:847-852`).
- Client cascade (`classesRepository.js:223-313`): `archiveClass` archives the class, ends every open class assignment of the class (`:240-258`, all EAs, not only the caller), and then, for children the caller delivers (created by or actively assigned to the caller), exits their class membership (`:260-290`) and sets `class_id` null (`:~288-313`). The child-8 steps in E5 are that cascade; for EA A it empties its own child's class.
- Caller: `ClassesContext.deleteClass` (`:578-580`) -> `classesRepository.deleteClass` -> `archiveClass`, from `EditClassScreen.js:111`.
- 1.5.0 pilot source (`git show f002e08:`): `archiveClass` with the same cascade (`classesRepository.js:223`, `:261`) and the same callers; the server policy is shared by every app version.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| Delete class is a shared-row archive; any assignee may issue it | E5 server and PG results | None | 85% | Harness case: a co-EA archive leaves the class open for the other holder |
| The loss only appears while EA B's assignment is open | E5 title scenario | Not varied | 70% | Repeat after Head Office ends EA B's assignment |

## Root cause

A class is one shared row. Its UPDATE policy lets the creator or any open assignee set
`archived_at`, and the app's Delete class is a plain archive of that row with every
assignee's assignment ended. Nothing models "leave this class" versus "close this class for
everyone". The co-EA's phone then downloads an archived class, and every reader that needs a
non-archived class (Classes, My Children, assessments) drops both the class and their children
even though their own assignments are open. The client cascade also exits the caller's delivery
children from the class and clears their class, which compounds the loss for the caller's own
children.

## Suggested fix

Approved plan, fix step 3: the server end-once guard makes an archive of a class apply only
when the caller is the creator and the sole holder; otherwise it becomes "leave" (only the
caller's assignment ends) and still returns the row, so 1.5.0 sees success. Fix step 8 (OTA):
`archiveClass` stops exiting delivery children's class memberships and clearing their class.
Decision: only the creator who is the sole holder archives a class for everyone. Head Office
uses its lifecycle script (step 6) for the rest.

## Verification plan

- [ ] Reproduce on two 1.5.0 pilot phones: both assigned to one class, A deletes it, B downloads.
- [ ] Add E5 to the frozen 1.5.0 compatibility gate (fix step 1), red first.
- [ ] Verify locally: B keeps the class and child-7; A's assignment ends; server class `archived_at` null.
- [ ] Verify the sole-holder creator case still archives for everyone.
- [ ] Verify local durability and backend convergence for both phones.
- [ ] Identify the exact migration and OTA updateId containing the fix.
- [ ] Field sweep: any class archived while another open assignment exists.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | E5, `docs/bugs/evidence/MA-BUG-20261104-001/repro-client-lifecycle-edges/` |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #153, #156; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-safety-server, feat/lifecycle-ota-removal |
| 2026-11-05T09:00:00Z | Claude | Fixed in code, locally tested (not merged, not applied, not released) | feat/lifecycle-safety-server: lifecycle-compat harness 77/77 on disposable PG17 (red 13/68 before), all 14 PG harnesses green; feat/lifecycle-ota: real-SQLite regressions red-first; combined tree tmp/lifecycle-integration 3e487fda unit 8,355/8,355, integration 1,555/1,555. Independent adversarial reviews of the server batch and the combined OTA; their findings fixed. Next: staging apply + two-phone 1.5.0 check (#157), OTA gate (#158) |
| 2026-11-05T15:44:00Z | Claude | Released | Server batch applied to staging `segygjzpujphwvrubusm` at 15:39 UTC from `feat/lifecycle-safety-server` 09fb332a (PR #161; before/after checks in its build log, b15fb722); app update published to channel `preview`, runtime 1.5.0, update group `8addaae6` from `feat/lifecycle-ota` fd053cfc (PR #163). Not merged yet. Phones run the update from their second launch after it downloads. The device, uptake and field checks are still open (#157, #158, #159) |

## Open questions

- In E5 the class was created by Head Office. A class created by an EA who then co-teaches it with another EA is the same shape; confirm after the guard exists.
- A pure client-side reading of the cascade (child-8 steps) is only part of the loss; the dominant loss for EA B comes from the server class archive.

---
record_version: 1
id: MA-BUG-20261104-006
title: "A phone's queued end or restore can overwrite, reopen or re-grant what Head Office ended"
classification: product_defect
subsystem: lifecycle-authority

severity_score: 6
severity_band: S2
severity_components:
  user_impact: 2
  data_security_privacy: 2
  scope: 1
  recoverability: 1
severity_override: none
priority: P1

diagnosis_state: CONFIRMED
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 85
confidence_basis: "Executed in disposable PostgreSQL 17 with all 41 migrations: an EA token's later end overwrote Head Office's end time (and wiped the handover reason) on three assignment tables, redundant exits through a second access path returned one row and moved the end time, a group restore and a raw un-end cleared Head Office's end and made write-for-child true again, and a Head Office row_version bump turned the same writes into MV001. The unguarded UPDATE policies and the tie-passing row_version trigger are read in the migrations."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T09:00:00Z
first_observed_at: 2026-11-04T19:49:55Z
last_observed_at: 2026-11-04T19:49:55Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "every build since the row_version upload contract (20261018180000) and the EA lifecycle UPDATE policies (20260525231506); no field cohort has run the app"

environment: "Disposable PostgreSQL 17 (postgres:17-alpine) with all 41 supabase/migrations at main 8b79eae5, driven by repro-server-lifecycle-semantics/lifecycle-harness.cjs; Head Office is played by the postgres role, the EA by role authenticated with the EA's JWT sub; never run against hosted Supabase"
affected_releases:
  - 1.5.0 pilot builds (embedded f002e08)
  - main at 8b79eae5 (server rules)
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
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/raw-output.log
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/sql/
  - docs/bugs/evidence/MA-BUG-20261104-001/SHA256SUMS.txt
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/153
  - https://github.com/JimMcKeown17/masi-app/issues/154

data_safety_status: "Head Office's recorded end of access can be silently moved, blanked or reversed by a later phone write; no rows are lost, but who held a child, class or group and when becomes wrong, and write authority can return to an EA Head Office removed. Never seen in the field."
workaround_status: "None for the EA. Head Office can re-end the row, but nothing tells them it was overwritten. Interim rule: Head Office must not bump row_version on ends (that turns the overwrite into a terminal MV001 on the phone instead)."
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-006 — A phone's queued end or restore can overwrite, reopen or re-grant what Head Office ended

## User-visible symptom

No field report; reproduced by Claude. Nothing visible to the EA at the moment it
happens: the phone's queued "remove child from class", "stop teaching this group" or
"restore group" simply succeeds. What Head Office would see is wrong afterwards: an
EA they took off a group is back on it and can add that group's children to sessions
again, or the date Head Office ended a child's or class's assignment has moved to the
EA's date, and the handover reason Head Office wrote is blank.

## Operational impact

- **Can the user continue?** Yes. That is the problem: the EA continues with access Head Office removed.
- **Core workflow affected:** Head Office handover and off-boarding of children, classes and groups; every later history-authority decision reads these end times.
- **Known affected users:** 0. No field cohort has run the app.
- **Relevant exposed population:** Every EA whose phone holds a queued archive or restore for a row Head Office ends first (handovers during the November 2026 retest).
- **Workaround:** None for the EA. Head Office can re-end the row after the phone has synced, if they notice.

## Data-safety assessment

- **UI visibility:** The EA sees their own end or restore succeed. Head Office sees an end time that is not theirs, or no end at all.
- **Durable local SQLite rows:** Not exercised in this record; the phone's row is whatever the EA last did.
- **Backend rows and relationships:** No rows are deleted. The lifecycle columns are rewritten: `unassigned_at` / `exited_at` / `removed_at` / `ended_at` moved to the EA's time, `handover_reason` set to null, or `unassigned_at` set back to null (see Observed facts).
- **sync_outbox status, error_class/error_code:** The phone's archive or restore is acknowledged as success (one row returned). Under a Head Office `row_version` bump it is instead refused terminally with MV001.
- **Incident queue evidence:** None; success is silent.
- **Eventual convergence evidence:** The server converges on the phone's write, not on Head Office's.
- **Duplication, misattribution, or cross-account risk:** Misattribution of who held a child, class or group and until when; write authority returns to an EA who was removed (L2 restore case).

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude, executed reproduction L1.*, L2.* | None (no field report) | 2026-11-04T19:49:55Z | 2026-11-05T01:00:00Z | Disposable PostgreSQL 17, 41 migrations at main 8b79eae5; same server for 1.5.0 pilot builds | None | None | `repro-server-lifecycle-semantics/results.json` (sha256 6d99c2ffdacb49248fddd5f913a1eb9868ba8819329b98e5bffc2e13694e2e80) and the `sql/` files listed in Observed facts |

## Reproduction

### Reporter steps

1. Head Office ends something an EA holds (an assignment, a class membership, a group removal, an enrolment) with a plain UPDATE that does not touch `row_version`, as the contract map says unversioned writers may.
2. The EA's phone, which had queued its own archive, restore or exit before it saw the change, drains its outbox afterwards (or the EA taps "restore group" on a stale local copy).

### Expected

Head Office's end stands. A phone write may end something once; it may not move, blank or clear a recorded end.

### Actual

The phone's write is accepted (one row returned) and rewrites the end. Executed cases follow in Observed facts.

### Closest E2E reproduction

PostgreSQL 17 with all 41 migrations; SQL statements copied from the phone's wire shapes (archive and restore are plain `UPDATE ... WHERE id = ... RETURNING id` with the claimed `row_version`, `src/services/offlineSync.js` 603-614 and 749-766). Not driven from a physical phone.

## Observed facts

Head Office ends at 2026-11-03T07:00:00Z; the EA's write carries an older or different time and `row_version = 2`. Final rows are read back by the harness as the superuser.

**Redundant exit through another path (L1): 1 row returned, Head Office's end time moved.**
- `L1.class_membership.direct_path`: the EA still holds the child directly. Head Office's `exited_at` 2026-11-03T07:00Z becomes 2026-11-02T08:00Z, `row_version` 2. (`sql/L1.class_membership.direct_path.sql` sha256 8b5ced4f3fea)
- `L1.group_membership.direct_path`: same for `removed_at`. (3a3f00f42685)
- `L1.enrollment.direct_path` and `L1.enrollment.class_only_path`: the EA's archive returns the enrolment id and `ended_at` becomes 2026-11-02T08:00Z, even though in the class-only case the EA reaches the child only through the class. (ee17e815f304, 8cce46e3ff68)
- `L1.direct_assignment`: Head Office ends the assignment, the EA's later archive returns 1 row, `unassigned_at` 2026-11-02T08:00Z, `row_version` 2. (f2617415966)
- `L1.class_assignment_ended.membership_exit`: after Head Office ends the EA's class assignment, the EA's exit of the directly held child returns 1 row and moves `exited_at`; the exit of the class-only child returns 0 rows and leaves it untouched. (a7c476c0809)
- `L1.composite.archiveChild_after_HO_removed_all_paths`: after Head Office ended every path, steps 2-5 each return 0 rows (blocked), but step 7 (`child_ea_assignments` archive) still returns 1 row. (606db21ef329)
- Contrast, where the server already protects Head Office's end because the EA has no other path: `L1.class_membership.class_only_path` and `L1.group_membership.group_only_path` return 0 rows and the Head Office time stays (3525f4cbff88, 3c9d7cec99e2); `L1.group_assignment_ended.membership_removal` returns 0 rows.

**Later archive overwrites Head Office's end (L2, Head Office write without `row_version`, so it stays 1 and the EA's 2 passes).**
- `L2.child_ea.HO_no_version`: `unassigned_at` 2026-11-03T07:00Z becomes 2026-10-30T05:00Z, `row_version` 2. (e066660fa88c)
- `L2.class_ea.HO_no_version` and `L2.group_ea.HO_no_version`: same, and `handover_reason` "HO handover" becomes null. (1a73a343cefb, de10c4b03879)
- `L2.children.HO_unarchive_then_EA_archive`: Head Office un-archived two children; the EA's queued archives return 1 row each and both children are archived again at 2026-11-02T08:00Z (including the Head Office-created child the EA only holds directly). (f390aa355adb)

**Restore reopens and re-grants (L2).**
- `L2.group_ea.restore_after_HO_end`: the group assignment Head Office ended is restored with `unassigned_at = null, handover_reason = null`; `private.current_user_can_write_for_child(C_GROUPONLY)` is `false` before and `true` after. (5468269c05ee)
- `L2.group_ea.restore_after_HO_handover_to_EA_B`: when Head Office has already given the group to EA B, the restore is refused with 23505 `idx_group_ea_assignments_active_unique`, so it is not re-granted but it also never succeeds; the classifier treats 23505 as terminal (`offlineSync.js` 489-492). (7fdb326cd389)
- `L2.raw_capability.child_and_class_restore`: no phone producer for child or class assignment restores was found, but an EA token can set `unassigned_at = NULL` on both and both return 1 row. (01ba7ccf63d5)

**The `row_version` bump trap (L2).** `L2.child_ea.HO_bumps_version` (449bc8f9b77a) and `L2.group_ea.restore_HO_bumps_version` (1cd173798fb0): when Head Office sets `row_version = 5` on the end, the EA's `row_version = 2` write is refused with MV001 `stale_version` and Head Office's row stays. The contract map tells Head Office to bump `row_version` (`documentation/rls-sync-contract-map.md` 931-934), but a bump only converts the silent overwrite into a terminal item on the phone that the EA must clear; it does not make the end authoritative.

**Code.**
- EA-writable lifecycle UPDATE policies have only an ownership check, no check on what changes: `child_ea_assignments_update_self_archive`, `class_ea_assignments_update_self`, `group_ea_assignments_update_self` (`supabase/migrations/20260525231506_masi_rls_contract_cleanup.sql` 79-100); `classes_update_assigned_ea` (112-116).
- `private.enforce_row_version()` refuses only `new.row_version < old.row_version`; ties pass (`20261018180000_upload_contract_row_version.sql` 28-43).
- Phone producers (identical at `f002e08`): the group restore in `src/db/repositories/groupsRepository.js` 93-157 (restore enqueued at 149; called from the group save at 324 and, once per install, from `repairGroupOwnershipForSync` via `src/services/startupRepairs.js` 7-12, calling 603 and 654), and `src/db/repositories/groupEaAssignmentsRepository.js` 126-139. Archive and restore reach the server as `update(patch).eq('id', ...).select('id')` requiring exactly one row back (`src/services/offlineSync.js` 749-766).

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The server lets an EA's write change an existing lifecycle column (set, move, or clear), and nothing orders it against Head Office's end | L1/L2 cases above; policies and trigger read | None found | 85% | Add the end-once guard and re-run L1/L2 red-to-green |
| Head Office should guard itself by bumping `row_version` | L2.*HO_bumps_version | The bump only changes the failure to MV001 (terminal item on the phone) | 85% | Run L2.*HO_bumps_version after the fix; the EA write must be a no-op that still returns the row |

## Root cause

Three server gaps combine. (1) The EA lifecycle UPDATE policies authorise by ownership
only (`user_id` / `ea_user_id` equals the caller, or write access to the class), so
any column in the lifecycle set can be written, including back to null. (2) For
children, enrolments and memberships, "can the EA still write" is true while the EA has
any other active path, so a redundant exit passes RLS and rewrites the end Head Office
already recorded. (3) `enforce_row_version` is a tie-passing order check: a Head Office
write that omits `row_version` leaves it equal to the phone's stored copy, so the later
phone write wins; if Head Office does bump, the phone's write turns into MV001 rather
than a harmless no-op. The phone-side restore (`groupsRepository.js` 149 and
`groupEaAssignmentsRepository.js` 135) turns this into a real producer: re-adding or
repairing a group the EA lost clears the end and restores write authority.

## Suggested fix

Approved plan (Jim, 2026-11-04). Step 3, the end-once guard: one trigger so an EA write
may set an end or archive once, never clear or move it, with the end clamped to the
window between the row's start and server now; it never raises and still returns the
row, so 1.5.0 phones see success. Decision: EAs never un-end; Head Office reopens
through the script (step 6), which gets a runbook that says never bump `row_version`
on an end. Step 1 first adds red cases for every scenario above to the frozen 1.5.0
compatibility harness. Step 8 removes the group restore producer on new builds; the
guard covers 1.5.0 phones already in the field.

## Verification plan

- [ ] Reproduce the original workflow on the closest faithful environment: L1.* and L2.* in the frozen 1.5.0 Postgres harness, red first.
- [ ] Add regression tests that fail for the demonstrated mechanism: every L1 case that returned 1 row now leaves Head Office's end time unchanged and still returns the row; L2 overwrite and un-end cases leave the stored end and `handover_reason` unchanged; `write_for_child` stays false after the restore.
- [ ] Add the bump case: with Head Office `row_version = 5`, the phone write no longer produces a terminal MV001 item for an end already recorded.
- [ ] Verify the targeted correction locally.
- [ ] Two-phone 1.5.0 device check: Head Office ends a group handover while a pilot phone has a queued archive or restore; the phone reports success and Head Office's row is unchanged.
- [ ] Verify backend convergence: the daily read-only invariant query in `/bug-sync` reports no end time that differs from Head Office's recorded value.
- [ ] Identify the exact migration and release containing the fix.
- [ ] Field sweep after the November 2026 retest with no recurrence.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | L1.*, L2.*, `docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/` |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #153, #154; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-safety-server, feat/lifecycle-ho-tools |
| 2026-11-05T09:00:00Z | Claude | Fixed in code, locally tested (not merged, not applied, not released) | feat/lifecycle-safety-server: lifecycle-compat harness 77/77 on disposable PG17 (red 13/68 before), all 14 PG harnesses green. Independent adversarial reviews of the server batch and the combined OTA; their findings fixed. Next: staging apply + two-phone 1.5.0 check (#157), OTA gate (#158) |

## Open questions

- The harness plays Head Office as the `postgres` superuser. If the real Head Office tool writes through another role or sets `row_version`, the overwrite cases change to the MV001 cases; which does the November script use?
- Does the L1 redundant-exit case matter once the guard is in, given the EA can still legitimately end their own row once? (The guard makes the first end authoritative; confirm Head Office's end counts as that first end.)

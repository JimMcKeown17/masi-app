---
record_version: 1
id: MA-BUG-20261104-016
title: "Removing a child from a Head Office group and adding them back fails with a duplicate error"
classification: product_defect
subsystem: groups-lifecycle

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
confidence_basis: "Executed in real SQLite (E4: the phone sends the re-add before the removal and 23505 is recorded terminal) and in disposable Postgres 17 (L5: the same order is refused by idx_child_group_memberships_active_by_version, the reverse order succeeds); the unmerged queued insert in removeChildFromGroup is read in source, but no field phone has produced it."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T02:30:00Z
first_observed_at: 2026-11-04T19:49:55Z
last_observed_at: 2026-11-04T19:55:33Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "any build that uploads a re-add insert before the removal of the same child in the same grouping version; no field cohort yet"

environment: "Disposable PostgreSQL 17 with all 41 supabase/migrations at main 8b79eae5 (L5) and real SQLite via better-sqlite3 on Node 20 through the production repositories and sync engine, with a stateful fake transport replayed into that Postgres (E4); not production"
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
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/results.json
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/sql/L5.readd_same_group_before_removal.sql
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/sql/L5.move_to_sibling_group_before_removal.sql
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/sql/L5.reverse_order_removal_first.sql
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/sql/L5.HO_seeded_handover_vs_phone.sql
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/156

data_safety_status: "no data lost: the refused re-add stays on the phone (terminal outbox row, local row visible) and a later forced pass delivered it in E4; the risk is a stuck Needs attention item and, if nobody forces a pass, a child missing from the group on the server"
workaround_status: "a forced sync (Sync now, pull-to-refresh or sign-out) re-sends the terminal insert after the removal has landed (E4 forced-sync-now); Head Office group seeds can leave the grouping version empty until the OTA ships"
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-016 — Removing a child from a Head Office group and adding them back fails with a duplicate error

## User-visible symptom

No field report; reproduced by Claude.

An EA opens a group that Head Office set up, takes a child out of it and puts the child
back (or moves the child to a sister group of the same grouping). The phone shows the
child back in the group straight away. After the next upload the item appears under
Needs attention as a refused group change, and the server copy of the group still has the
child out (or in the old place) until the EA presses Sync now, pulls to refresh or signs out.
Head Office, doing the same move by hand in a seed script (add the new membership, then end
the old one), gets a "duplicate" error too.

## Operational impact

- **Can the user continue?** Yes. The phone keeps the child in the group.
- **Core workflow affected:** Editing who is in a group (re-add or move) for a group that Head Office already seeded; the group-based lesson and attendance views downstream.
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** EAs whose groups carry a grouping version (Head Office seeded groups). Unversioned groups do not hit it (see MA-BUG-20261104-017).
- **Workaround:** Press Sync now, pull to refresh, or sign out: forced passes re-send terminal rows, and the insert lands once the removal has gone through (E4 forced-sync-now: `outbox: []`). Until the OTA, Head Office group seeds leave `grouping_version_id` NULL, which the unique index does not cover.

## Data-safety assessment

- **UI visibility:** The re-added child is visible on the phone (`visible: ["cgm-m2"]` in E4 after pass 1, pass 2 and the pull).
- **Durable local SQLite rows:** Both membership rows persist: cgm-m1 ended (`removed_at` set, `synced`), cgm-m2 active with `sync_status: terminal`.
- **Backend rows and relationships:** After pass 1 the server holds cgm-m1 active (row_version 2). After pass 2 cgm-m1 is ended (row_version 3) and cgm-m2 is absent. After the forced pass both exist: cgm-m1 ended, cgm-m2 active.
- **sync_outbox status, error_class/error_code:** `child_group_memberships:cgm-m2:insert` is `terminal`, `error_class: terminal`, `error_code: 23505`, `last_error: duplicate key value violates unique constraint "idx_child_group_memberships_active_by_version"`, `retry_count: 0`. It is cleared by the forced pass.
- **Incident queue evidence:** None (no field phone).
- **Eventual convergence evidence:** Converges after a forced pass (E4). An ordinary pass skips terminal rows (`syncOutboxRepository.js` `includeTerminal` default false), so without a forced pass it does not converge.
- **Duplication, misattribution, or cross-account risk:** None seen. The index is exactly what prevents a duplicate active membership here.

Do not equate "not visible in the UI" with "deleted." Record local durability,
backend state, relationship rows, and convergence evidence separately.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude, executed reproduction (real SQLite plus disposable Postgres 17) | None (no field user) | 2026-11-04T19:55:33Z | 2026-11-05T01:00:00Z | Disposable PostgreSQL 17 with all 41 supabase/migrations at main 8b79eae5 (L5) and real SQLite via better-sqlite3 on Node 20 through the production repositories and sync engine, with a stateful fake transport replayed into that Postgres (E4); not production | None | None | E4 in `observations.jsonl` (sha256 c0eea20fd866417f…) and `pg-results.json` (1bade6e43debbec6…); L5.* in `results.json` (6d99c2ffdacb49248fddd5…); SQL digests in `SHA256SUMS.txt` |

## Reproduction

### Reporter steps

1. A child is in a Head Office group whose grouping version is set (M1, active on the server).
2. The EA, offline, adds the child to the group, removes them, and adds them again: M1 insert, M1 archive and M2 insert are all queued (E4 `after-offline-edits`). The same collision happens for a move to a sibling group of the same grouping version.
3. The phone goes online and one upload pass runs.

### Expected

The child ends up active once in the group with no refusal.

### Actual

M1's insert lands active; M1's archive is held behind its own insert in the same pass; M2's insert is refused `23505` and recorded terminal (E4 pass 1: `{"success":false,"totalTerminal":1}`). Pass 2 lands the removal. M2 stays terminal until a forced pass (E4 `forced-sync-now`).

### Closest E2E reproduction

E4 in real SQLite through the production repositories and sync engine, with the recorded requests replayed into Postgres 17 (`pg-results.json`, labels `E4-pass1-m2-23505-while-m1-active` and `E4-pass2-m1-archive-then-forced-m2-lands`, both `ok: true`). L5 runs the same server-side orders as plain SQL under the authenticated EA role. No physical device.

## Observed facts

- E4 (observed 2026-11-04T19:55:33Z): pass 1 calls `upsert child_group_memberships cgm-m1 -> applied 1` and `upsert child_group_memberships cgm-m2 -> error 23505 ... idx_child_group_memberships_active_by_version`; pass 2 calls `update child_group_memberships cgm-m1 ["removed_at","row_version"] -> rowsAffected 1`; the forced pass calls `upsert ... cgm-m2 -> applied 1` and leaves the outbox empty.
- L5.readd_same_group_before_removal (observed 2026-11-04T19:49:55Z): M2 insert while M1 is active fails `23505` on `idx_child_group_memberships_active_by_version`; M1 removal affects 1 row; M2 retry after the removal returns the new id.
- L5.move_to_sibling_group_before_removal: adding the child to a sibling seeded group of the same grouping version while M1 is active also fails `23505` on the same index; it succeeds after the removal. The index covers `(child_id, grouping_version_id)`, not the group.
- L5.reverse_order_removal_first (control): removal first, then insert, both succeed (rows affected 1 each).
- L5.HO_seeded_handover_vs_phone: Head Office (postgres role) inserting the new membership before ending the old one fails with `Key (child_id, grouping_version_id)=(5a000000-0000-0000-0000-000000000001, 6a000000-0000-0000-0000-000000000001) already exists.`, `23505`. So a seed script has the same trap.
- Index definition: `supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:242-244` creates `idx_child_group_memberships_active_by_version on child_group_memberships(child_id, grouping_version_id) where removed_at is null`.
- Classifier: `src/services/offlineSync.js:490-492` returns `terminal: true` for `23505` (`markAsSynced` only when `duplicateIsSuccess`); the 1.5.0 pilot has the same branch (`git show f002e08:src/services/offlineSync.js`, line 483).
- Client producer: `src/db/repositories/groupsRepository.js:440-464` `removeChildFromGroup` updates active rows and always enqueues a separate `archive` outbox row; it never looks at a still-queued `insert`. `src/db/repositories/childrenRepository.js:~575-608` `updateChild` does the opposite for class memberships (rewrites the pending insert to carry `exited_at`, issue #35). `git diff f002e08 -- src/db/repositories/groupsRepository.js src/db/repositories/childrenRepository.js` shows no change to these two paths since the 1.5.0 pilot (only an unrelated skill-mastery cleanup call), so the 1.5.0 pilot builds have the same behaviour.
- Forced passes include terminal rows: `src/db/repositories/syncOutboxRepository.js:~97-104` (`includeTerminal`); `src/services/offlineSync.js:1693` (line 1654 at f002e08).

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The re-add insert reaches the server before the removal because `removeChildFromGroup` queues a separate archive that waits behind the child's own unsent insert, and the active-membership unique index refuses the second insert | E4 order and 23505; L5 refusal and success in reverse order; code at `groupsRepository.js:440-464` | No field phone has produced it; the group screens that trigger a re-add were not driven through the UI | 85% | Add the red harness case (step 1) and the merge fix (step 8); drive the add, remove, add sequence on two 1.5.0 phones |

## Root cause

Two facts combine. On the server, an active membership is unique per child per grouping version (`idx_child_group_memberships_active_by_version`, `supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:242`), so a second active row for the same child in the same grouping version is refused with `23505`, whether it is the same group (re-add) or a sibling group (move).

On the phone, `removeChildFromGroup` (`groupsRepository.js:440-464`) marks the active rows ended and queues an `archive` for each, but it does not merge with a membership insert that has never been uploaded. The old membership's insert goes up active, its archive is held behind that insert in the same pass, and the new membership's insert is sent in that pass while the old one is still active. The server refuses it, the classifier treats `23505` as terminal for this table, and the item lands under Needs attention. An ordinary pass skips terminal rows; a forced pass re-sends it after the archive has landed, which is why E4 converges.

Head Office tooling shares the trap: inserting the new membership before ending the old one fails the same way (L5.HO_seeded_handover_vs_phone).

## Suggested fix

Approved (fix step 8, OTA): `removeChildFromGroup` merges or drops a membership insert that is still owed, mirroring what `updateChild` already does for class memberships, so the phone never sends the old insert, its archive and a new insert as three steps. The Head Office lifecycle script (step 6) ends the old membership before inserting the new one. Step 1 adds a harness case replaying 1.5.0's wire shapes (insert, then archive, then insert) judged by 1.5.0's own classifier.

1.5.0 compatibility: the server index is not changed, so 1.5.0 phones keep their current behaviour until the OTA reaches them; they recover through a forced pass. Interim: Head Office group seeds leave `grouping_version_id` NULL until the OTA ships (nulls are distinct under the index; see MA-BUG-20261104-017 for the cost).

## Verification plan

- [ ] Reproduce the original workflow (add, remove, add in a Head Office seeded group, then upload) on a 1.5.0 pilot build with two phones and the staging backend.
- [ ] Add the CI harness case (step 1) replaying the E4 wire requests; it must fail red on 1.5.0 behaviour and turn green with the step 8 change.
- [ ] Regression test for `removeChildFromGroup` merging an unsent insert (the E4 sequence ends with one upload pass, empty outbox).
- [ ] Verify the targeted correction locally.
- [ ] Run the add, remove, add and move-to-sibling flows on a physical device.
- [ ] Verify local durability and backend convergence: one active membership, ended predecessor, empty outbox.
- [ ] Identify the exact OTA release containing the fix.
- [ ] Check the daily invariant query after the retest begins; no terminal `23505` on `child_group_memberships` in receipts.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | E4, L5.readd_same_group_before_removal, L5.move_to_sibling_group_before_removal, L5.reverse_order_removal_first, L5.HO_seeded_handover_vs_phone; docs/bugs/evidence/MA-BUG-20261104-001/ |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #156; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-ota-removal |

## Open questions

- Which group screen actions can queue insert, archive and insert before the first upload? E4 builds the sequence through the repositories; the UI path was not driven.
- Does moving a child between two groups of the same grouping version exist as a user action, or only as remove then add?

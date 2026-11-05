---
record_version: 1
id: MA-BUG-20261104-012
title: "Deleting a handed-over child never finishes: the child comes back after every download"
classification: product_defect
subsystem: children-lifecycle

severity_score: 6
severity_band: S2
severity_components:
  user_impact: 2
  data_security_privacy: 1
  scope: 2
  recoverability: 1
severity_override: none
priority: P1

diagnosis_state: CONFIRMED
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 85
confidence_basis: "Real SQLite through the production repositories, sync engine and ChildrenContext pull reproduces the loop twice (E2, E2-ctx), and the server answer was reproduced in disposable PostgreSQL 17; the handover trigger is inferred from the server's history check, not executed with a literal handover."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T09:00:00Z
first_observed_at: 2026-11-04T19:55:33Z
last_observed_at: 2026-11-04T19:55:33Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "any Delete child tap on a child that has server-side history this phone has not seen, for example after a Head Office handover; not yet seen in the field"

environment: "Disposable PostgreSQL 17 with all 41 supabase/migrations at main 8b79eae5 (E2 server answer); real SQLite (better-sqlite3, Node 20) through the production repositories, sync engine and ChildrenContext pull with a stateful fake transport (E2, E2-ctx)"
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
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-client-lifecycle-edges/reproLifecycleEdgesE2Context.integration.test.js.txt
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-client-lifecycle-edges/jest-run-e2ctx.txt
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/153
  - https://github.com/JimMcKeown17/masi-app/issues/156

data_safety_status: "No data lost: the server keeps the child and its history; the phone deleted its local copy and the next download restores it."
workaround_status: "None that works: deleting again repeats the loop. The EA cannot remove the child from their list."
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-012 — Deleting a handed-over child never finishes: the child comes back after every download

## User-visible symptom

No field report; reproduced by Claude. The EA taps Delete child and confirms. The child
vanishes from My Children. After the next download (a pull to refresh, or the app
opening) the child is back, exactly as before. Deleting it again does the same thing. The
Home screen also gains an "item needs attention" card that cannot be cleared.

## Operational impact

- **Can the user continue?** Yes; the child just cannot be removed.
- **Core workflow affected:** Removing a child from My Children; the Home attention card.
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** Any EA who deletes a child that other people have recorded history for or that was ever handed over (near-certain once handovers start).
- **Workaround:** None. Head Office would have to end the EA's assignment.

## Data-safety assessment

- **UI visibility:** The child disappears for a moment, then reappears (E2 `readers.getMyChildren` goes `[]` then `["child-4"]`).
- **Durable local SQLite rows:** Deleted locally with the child's assignment, enrolment and class membership; the next pull re-creates them as `synced`, `archived_at` null.
- **Backend rows and relationships:** Untouched. The RPC returns `false` and the child, history and assignment remain (`child-still-there:1`, `pull-scope-active-assignment:1`).
- **sync_outbox status, error_class/error_code:** `children:child-4:hard_delete` goes `terminal` / `terminal` / `ARCHIVE_REQUIRED`, last_error "Child has history and must be archived instead of hard-deleted".
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** None; it converges back to the original state every time.
- **Duplication, misattribution, or cross-account risk:** None found in the loop itself. The server function also removes other EAs' rows when it does succeed (see Observed facts).

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude executed reproduction, E2 and E2-ctx (real SQLite + PG17) | None | 2026-11-04T19:55:33Z | 2026-11-05T01:00:00Z | main 8b79eae5, real SQLite Node 20, PostgreSQL 17 | None | None | `observations.jsonl` (sha256 `c0eea20fd866417fea90c33a91236d95468538d2733d715461e7cfabae7f374f`), `pg-results.json` (`1bade6e43debbec6c31aed1162328ed2f1f18e9b15358450a4281c01b9ce9f67`), `reproLifecycleEdges.integration.test.js.txt` (`e7fe8ca5553a8b6fa9409898e93c8963e1cac01f75b38fd2ac8ece399a1795cb`), `reproLifecycleEdgesE2Context.integration.test.js.txt` (`984437f3304a07f9422f6a8164f89de62316aedc3985e5b3f1e0ec82390197c2`), `jest-run-e2ctx.txt` (`adc2a6bb5c6b6a43cfd910e166a8634d261a115849ced663e017dbcc908071c0`) |

## Reproduction

### Reporter steps

1. A child the EA holds has history on the server that the phone does not hold (E2 seeds an attendance row recorded by another EA).
2. On Edit child, tap Delete, confirm.
3. Sync, then pull (pull to refresh, or reopen the app).
4. Tap Delete again.

### Expected

The child leaves the EA's list for good (or the EA is told it cannot be removed).

### Actual

Step 2 hides the child. Step 3 returns it. Step 4 repeats.

### Closest E2E reproduction

E2 and E2-ctx: production `childrenRepository`, sync engine, `pullPreloadedChildData`/
`persistPreloadedChildData` and the real `ChildrenContext` pull, transport faked with modelled
RLS. PostgreSQL 17 proved the server answers (`E2-delete-child-if-no-history-returns-false`
and the control `E2-control-no-history-deletes`, both `ok`).

## Observed facts

- E2 `after-local-delete`: `deleteIfNoHistory` returned `true`; outbox `children:child-4:hard_delete` pending; local child count 0; `getMyChildren` `[]`.
- E2 `pass1`: `rpc:delete_child_if_no_history(child-4) -> {"data":false}`; outbox row becomes `terminal`, `ARCHIVE_REQUIRED`, `totalTerminal: 1`.
- E2 `after-pull`: the pull returns `child-4` with `cha-a-4`, `cpe-4`, `ccm-4`; local child back with `archived_at: null`, `sync_status: synced`; `getPendingHardDeleteIds` is `[]`; `getMyChildren` is `["child-4"]`.
- E2 `ordinary-pass` sends nothing (terminal rows are skipped). `forced-sync-now` re-sends the RPC and gets `false` again. `after-retryFailedItem` sets the row `pending` and the local child `pending` with `getPendingHardDeleteIds: ["child-4"]`; `retry-forced-pass` goes terminal again. A second Delete tap and pass end the same way, and the next pull restores the child (`pull-after-second-delete`).
- E2-ctx (through ChildrenContext): with the hard_delete `pending`, `contextChildren` is `[]`; once it is `terminal` (`ARCHIVE_REQUIRED`), the context lists `child-9` again with all three relationships open.
- Server function: `private.delete_child_if_no_history` (`supabase/migrations/20260712202409_masi_idempotent_child_delete.sql`) returns `false` when `private.child_has_delete_blocking_history` is true. That check covers attendance, assessments, letter mastery, any group membership and any ended assignment, enrolment or class membership, for any EA (current definition in `20261101120000_skill_mastery_current_state.sql:258-313`).
- The phone's own check (`childrenRepository.js:~978-1004`) only sees rows it holds. A child handed over by Head Office carries the previous EA's ended assignment on the server, but the new EA's phone pulls only its own open assignment (`preloadedChildData.js:265-271`). So the local check passes, the child is deleted locally and the server refuses. This handover trigger is reasoned from the code, not executed with a literal handover; E2 uses another EA's attendance instead.
- Executor: `offlineSync.js:~722-737` calls the RPC and turns anything other than `data === true` into `ARCHIVE_REQUIRED`, classified terminal at `:495`.
- Why the pull brings the child back: the pull hides only children with a hard_delete in `pending`, `failed` or `in_flight` (`syncOutboxRepository.js:145-158`, used at `preloadedChildData.js:452-457` and `ChildrenContext.js:217`). A `terminal` hard_delete no longer hides it, and nothing re-archives the child.
- `ChildrenContext.deleteChild` (`:558-586`) falls back to `archiveChild` only when the local `deleteIfNoHistory` returns false, never after a later server refusal.
- Over-reach when it does succeed: the function deletes every class membership, programme enrolment and EA assignment of the child (`20260712202409_*.sql:35-45`, no filter by actor), then the child, so a delete by one EA also removes rows other EAs use when no blocking history exists. Verified in the SQL; not executed with two EAs.
- 1.5.0 pilot source (`git show f002e08:`): `deleteIfNoHistory`, `deleteChild`, the `data !== true` executor branch, the pending-only pull filter and the same migration are all present.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The loop is client-local history check versus server-wide history check, plus a pull filter that forgets terminal deletes | E2, E2-ctx, PG answers | None | 85% | Add an executed literal-handover case to the harness |
| Handovers make this near-certain | Server counts any ended assignment as history | Not executed with a handover | 70% | Run Head Office handover script, then Delete as the new EA |

## Root cause

The phone decides "no history" from the rows it holds, while the server decides from all
history for all EAs. They disagree for any child with history recorded by someone else
(including every handed-over child). The local delete has already removed the child, its
relationships and its other outbox rows, so when the server answers `false` the phone maps it
to a terminal `ARCHIVE_REQUIRED` and does nothing else. The pull then treats the child as live
again because only non-terminal hard_deletes suppress a child. The terminal row has no exit,
so Delete never converges.

## Suggested fix

Approved plan, fix step 5: make the server function actor-scoped, never a hard delete, and
always return `true` (leave or archive for the caller only), so existing `ARCHIVE_REQUIRED`
rows clear on the next forced pass. Fix step 8 (OTA): Delete child goes through the server
RPC and locally ends only the EA's own relationship rows. Decision: Delete child is "leave"
when someone else holds the child. 1.5.0 phones keep sending `delete_child_if_no_history`,
which now succeeds, so the server change repairs them before the OTA.

## Verification plan

- [ ] Reproduce on a 1.5.0 pilot build: hand a child over, then Delete child as the new EA.
- [ ] Add E2 and a literal-handover case to the frozen 1.5.0 compatibility gate (fix step 1), red first.
- [ ] Verify the targeted correction locally: RPC returns true, the child stays gone after a pull, no terminal row.
- [ ] Two-phone 1.5.0 device check: the other EA keeps the child.
- [ ] Verify existing `ARCHIVE_REQUIRED` rows clear on the next forced pass.
- [ ] Identify the exact server migration and OTA updateId containing the fix.
- [ ] Field sweep for persistent `ARCHIVE_REQUIRED` terminal rows.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | E2, E2-ctx, `docs/bugs/evidence/MA-BUG-20261104-001/repro-client-lifecycle-edges/` |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #153, #156; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-safety-server, feat/lifecycle-ota-removal |
| 2026-11-05T09:00:00Z | Claude | Fixed in code, locally tested (not merged, not applied, not released) | feat/lifecycle-safety-server: lifecycle-compat harness 77/77 on disposable PG17 (red 13/68 before), all 14 PG harnesses green; feat/lifecycle-ota: real-SQLite regressions red-first; combined tree tmp/lifecycle-integration 3e487fda unit 8,355/8,355, integration 1,555/1,555. Independent adversarial reviews of the server batch and the combined OTA; their findings fixed. Next: staging apply + two-phone 1.5.0 check (#157), OTA gate (#158) |

## Open questions

- Does a literal Head Office handover reproduce this exactly as reasoned (E2 used another EA's attendance as the unseen history)?
- The over-reach (the RPC removing other EAs' rows when no blocking history exists) is read from SQL only; run it with two active assignments to measure it.

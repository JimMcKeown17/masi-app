---
record_version: 1
id: MA-BUG-20261104-011
title: "A refused archive stays stuck and is replayed by Sync now or pull-to-refresh, which can archive or re-end what others still use"
classification: product_defect
subsystem: sync-outbox

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
confidence_basis: "Real SQLite through the production repositories and sync engine, with the recorded wire requests replayed into disposable PostgreSQL 17 (14/14 matched), shows a terminal archive refused with 0 rows being re-sent by a forced pass and later landing after Head Office reopened access; the bare existence of the repeating mechanism is certain, the exact field frequency is unknown."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T09:00:00Z
first_observed_at: 2026-11-04T19:49:55Z
last_observed_at: 2026-11-04T19:55:33Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "any time Head Office removes an EA's access (class, group or child) while that EA's phone still holds an unsent archive for it; not yet seen in the field"

environment: "Disposable PostgreSQL 17 with all 41 supabase/migrations at main 8b79eae5 (L1 cases); real SQLite (better-sqlite3, Node 20) through the production repositories and sync engine with a stateful fake transport, wire requests replayed into that Postgres (E1a, E1c, E1d)"
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
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-client-lifecycle-edges/observations.jsonl
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-client-lifecycle-edges/pg-results.json
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-client-lifecycle-edges/reproLifecycleEdges.integration.test.js.txt
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/155
  - https://github.com/JimMcKeown17/masi-app/issues/153

data_safety_status: "No data destroyed; a stale archive can hide a class or child from others, and Head Office can reopen it. The stuck row itself is durable on the phone."
workaround_status: "None for the EA (no way to clear the card). Interim rule: Head Office does not reopen access, and nobody tells the EA to pull to refresh, for an EA whose receipts show a refused archive, until that phone has the OTA."
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-011 — A refused archive stays stuck and is replayed by Sync now or pull-to-refresh, which can archive or re-end what others still use

## User-visible symptom

No field report; reproduced by Claude. After Head Office takes a class, group or
child away from an EA, anything the EA had already queued to archive or remove that
thing is refused. The Home screen then shows "1 item needs attention" (or more).
The card cannot be dismissed, and Sync status offers only Retry, which fails the same
way. If Head Office later gives the class or child back, a "Sync now" tap or a
pull-to-refresh on My Children or Time entries sends the old archive again. It now
succeeds, so the class disappears for the co-EA who still teaches it, or the returned
child is ended again.

## Operational impact

- **Can the user continue?** Yes for daily lessons. The warning card stays on Home for good.
- **Core workflow affected:** My Children and class lists for the EA and for co-EAs after a replay; the Home attention card.
- **Known affected users:** 0 (no field cohort yet).
- **Relevant exposed population:** EAs whose access Head Office removes while an archive or exit is still queued on the phone, and the EAs sharing those classes and children.
- **Workaround:** None for the EA. Head Office can re-archive or unarchive the server row by hand.

## Data-safety assessment

- **UI visibility:** After a replay the archived class or child disappears from the co-EA's lists (E1a, E1c readers go to empty).
- **Durable local SQLite rows:** The refused outbox row stays `terminal` for ever. Local rows are kept.
- **Backend rows and relationships:** E1a: class `class-k` goes from `archived_at: null` to archived on the replay while co-EA B's assignment `cea-b-k` stays open (`unassigned_at: null`). E1c: child `child-2` archived at `2026-10-20T08:00:00.000Z`, its enrolment and class membership ended, while the reopened assignment `cha-a-2` stays open.
- **sync_outbox status, error_class/error_code:** `terminal` / `terminal` / `ARCHIVE_NOT_APPLIED`, last_error "classes archive did not acknowledge exactly one updated row" (and the same wording for children, child_programme_enrollments and child_class_memberships).
- **Incident queue evidence:** None; the phone-incident reader was not run.
- **Eventual convergence evidence:** None. The stuck row never converges by itself; a forced pass re-sends it forever.
- **Duplication, misattribution, or cross-account risk:** A stale intent from one EA acts on rows a different EA still uses (E1a class). No cross-account data is read.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude executed reproduction, L1 refusals (disposable PG17) | None | 2026-11-04T19:49:55Z | 2026-11-05T01:00:00Z | main 8b79eae5 migrations, disposable PostgreSQL 17 | None | None | `repro-server-lifecycle-semantics/results.json` (sha256 `6d99c2ffdacb49248fddd5f913a1eb9868ba8819329b98e5bffc2e13694e2e80`) |
| R2 | Claude executed reproduction, E1a/E1c/E1d (real SQLite + PG replay) | None | 2026-11-04T19:55:33Z | 2026-11-05T01:00:00Z | main 8b79eae5 code, real SQLite Node 20, wire replayed into PG17 | None | None | `repro-client-lifecycle-edges/observations.jsonl` (`c0eea20fd866417fea90c33a91236d95468538d2733d715461e7cfabae7f374f`), `pg-results.json` (`1bade6e43debbec6c31aed1162328ed2f1f18e9b15358450a4281c01b9ce9f67`), `reproLifecycleEdges.integration.test.js.txt` (`e7fe8ca5553a8b6fa9409898e93c8963e1cac01f75b38fd2ac8ece399a1795cb`) |

## Reproduction

### Reporter steps

1. Head Office ends the EA's only path to a class, group or child (class assignment, direct assignment or group assignment).
2. The EA, not yet synced, had queued an archive or exit for it (Delete class, Delete child, removing a child from a group).
3. The phone syncs. The server answers 0 rows; the phone marks the row `terminal` (`ARCHIVE_NOT_APPLIED`).
4. Head Office gives the class or child back (reopens the assignment row), or a co-EA is still assigned.
5. The EA taps Sync now, or pulls to refresh My Children or Time entries, or signs out (all force a pass).

### Expected

A refused archive resolves to what the server says, shows the EA a plain-words exit, and is
never sent again.

### Actual

The row stays terminal and the card is permanent; step 5 re-sends the archive and it lands.

### Closest E2E reproduction

Real SQLite with the production repositories and sync engine, transport a stateful fake with
modelled RLS; each fake answer was proven by running the same request in PostgreSQL 17
(`pg-results.json`, 14 of 14 matched, includes `E1a-replay-class-archive-after-reassign` and
`E1c-replay-child-archive-after-reassign`).

## Observed facts

- Producers (L1, results.json, EA_A acting as `authenticated`, server answer to the queued write): `L1.class_membership.class_only_path` 0 rows; `L1.group_membership.group_only_path` 0 rows; `L1.group_assignment_ended.membership_removal` 0 rows (the group membership stays `removed_at: null`); `L1.class_assignment_ended.membership_exit` 0 rows for the class-only child (C_DIRECT exit returned 1 row); `L1.composite.archiveChild_after_HO_removed_all_paths`: after Head Office ended the direct, class and group assignments, steps "2 children archive", "3 enrolment archive", "4 class membership exit" and both "5 group membership" removals each returned 0 rows, while "7 child_ea_assignments archive" returned 1 row. The enrolment, class membership and group membership are all left open (`ended_at`/`exited_at`/`removed_at` null).
- Where the EA keeps a direct path the write still works (`L1.class_membership.direct_path`, `L1.enrollment.direct_path` return 1 row), so the refusal depends on which path Head Office removed.
- Client classification: `ARCHIVE_NOT_APPLIED` and `RESTORE_NOT_APPLIED` are `terminal: true` straight away (`src/services/offlineSync.js:495-499`); the executor raises it when the archive update does not return exactly one row (`offlineSync.js:~750-765`).
- E1a pass 1: `update:classes:class-k [archived_at,row_version] -> rowsAffected 0`; outbox `classes:class-k:archive` becomes `terminal`/`ARCHIVE_NOT_APPLIED`; the same pass still sent the child update (`rowsAffected 1`). A later ordinary pass sends the other pending rows (`child_class_memberships`, `class_ea_assignments`) and leaves only the terminal row.
- Forced passes include terminal rows: `getReadyRecords({ includeTerminal })` selects `('pending','failed','terminal')` (`src/db/repositories/syncOutboxRepository.js:101`), and `syncAll` passes `includeTerminal: force` (`offlineSync.js:1693`). E1a "forced-sync-now" re-sent `update:classes:class-k ... rowsAffected 0` and E1c "forced-sync-now" re-sent the child archive, both refused again.
- Forced triggers in the app: Sync now (`src/screens/main/SyncStatusScreen.js:173,186`), Retry (`:108`), My Children pull-to-refresh (`src/screens/main/ChildrenListScreen.js:179`), Time entries pull-to-refresh (`src/screens/main/TimeEntriesListScreen.js:95`), sign-out (`src/hooks/useSignOutFlow.js:85`), credentials refresh (`OfflineContext.js:254` pulls with force).
- E1a replay: after Head Office reopened `cea-a-k` (`row_version` 3) and the phone pulled, a forced pass sent `update:classes:class-k ... rowsAffected 1`; server class `archived_at` is now `2026-11-04T19:55:25.982Z`, co-EA assignment `cea-b-k` still `unassigned_at: null`, and the local class becomes archived after the next pull.
- E1c replay: after the reopen (`cha-a-2` `unassigned_at` back to null), a forced pass sent children, enrolment and class membership archives (`rowsAffected 1` each, outbox empty); server child `archived_at: 2026-10-20T08:00:00.000Z`; the EA's My Children reader goes from `["child-2"]` to `[]`. The stale timestamp (2026-10-20) is the time of the original tap, not now.
- E1c also shows the terminal row acting as a blocker: after `children:child-2:archive` goes terminal, the `child_ea_assignments` table result is `skipped: true, skippedDependency: children, skippedDependencyRecordId: child-2`; pass 2 then terminates the enrolment and class membership too.
- Needs attention card: `syncAttentionItem` has `dismissible: false` and routes to Sync status (`src/utils/homeAttention.js:42-53`), fed by `outboxStatus.needsAttentionCount` (`OfflineContext.js:87`, counted in `syncOutboxRepository.js:~444` for terminal rows).
- No exit: `syncOutboxRepository.deleteRecord` exists (`:380`, exported `:502`) but `grep -rn deleteRecord src` finds no caller. Sync status Retry (`retryFailedItem`, `offlineSync.js:1891`) only flips the row back to `pending`, so the next pass fails the same way. E2 evidence shows the same loop for a refused delete.
- 1.5.0 pilot source (`git show f002e08:`): the terminal classification (`offlineSync.js` 495-497), the `includeTerminal: force` pass, the `dismissible: false` card, `deleteRecord` with no caller and the same forced callers are all present, so the pilot builds behave the same.
- The scenario called N1 in the plan (forced passes keep remembering terminal rows as blockers) has no entry in the committed evidence; the blocker behaviour above comes from E1c/E1d. See Open questions.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| A refused lifecycle row is kept as a pending intent and re-sent by forced passes, so it can land later against changed rights | E1a and E1c replay steps; PG replay matches | None | 85% | Add the L1 and E1 cases to the frozen 1.5.0 compatibility harness and show them red |
| The server could make the stale archive harmless on its own | L1 shows only a refusal today | A stale archive after a reopen is accepted (E1a, E1c) | 70% | Step 3 end-once guard turns the replay into a one-row no-op; prove with the harness |

## Root cause

1. Head Office removes the actor's only path; the actor's RLS arm (assignee or direct holder) disappears, so the queued UPDATE matches 0 rows instead of raising an error.
2. The client treats "0 rows" as a permanent refusal and parks the row as `terminal`, but keeps the user's intent and never resolves it to server truth.
3. Forced passes re-send terminal rows (`includeTerminal: force`), and the app calls forced passes from ordinary gestures such as pull-to-refresh.
4. When access changes again (Head Office reopens an assignment, or a co-EA is still assigned), the same stale UPDATE now matches a row and is accepted, archiving a class others still teach or re-ending a returned child.
5. The row has no exit: the card is not dismissible and `deleteRecord` has no caller, so the loop runs for as long as the phone keeps the database.

## Suggested fix

Approved plan, fix step 7: forced passes (Sync now, pull-to-refresh, sign-out) re-send only
history and hard_delete rows; a refused lifecycle row is resolved to server truth once its
receipt has been delivered, and the EA gets a plain-words "The office has a copy — remove from
this phone" exit. Fix step 3 (server end-once guard) makes any stale archive that does still
arrive a one-row no-op, and archiving a shared class or child becomes "leave" when someone else
holds it. Decision: EA exit only after the receipt is delivered. 1.5.0 phones keep sending the
same shapes, so the server guard must return the row (1.5.0 sees success); the OTA is needed to
stop the replays on already-installed phones.

## Verification plan

- [ ] Reproduce the original end-user workflow on the affected release (1.5.0 pilot build): Head Office ends a class assignment, the EA taps Delete class offline, syncs, then Head Office reopens and the EA taps Sync now.
- [ ] Add the L1 refusal cases and E1a/E1c to the frozen 1.5.0 compatibility gate (fix step 1), written red first; they must turn green.
- [ ] Verify the targeted correction locally (forced pass sends no lifecycle rows; refused row clears after its receipt is delivered).
- [ ] Run the two-phone 1.5.0 device check: co-EA keeps the class after a replay attempt.
- [ ] Verify local durability and backend convergence: no terminal lifecycle row survives; server class and child state match Head Office's.
- [ ] Identify the exact OTA updateId and release/build containing the fix.
- [ ] Field sweep: after the retest starts, confirm no phone reports `ARCHIVE_NOT_APPLIED` terminal rows that persist.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | L1 refusals, E1a, E1c, E1d; `docs/bugs/evidence/MA-BUG-20261104-001/` |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #155, #153; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-ota-stuck-items, feat/lifecycle-safety-server |
| 2026-11-05T09:00:00Z | Claude | Fixed in code, locally tested (not merged, not applied, not released) | feat/lifecycle-ota: real-SQLite regressions red-first; combined tree tmp/lifecycle-integration 3e487fda unit 8,355/8,355, integration 1,555/1,555; feat/lifecycle-safety-server: lifecycle-compat harness 77/77 on disposable PG17 (red 13/68 before), all 14 PG harnesses green. Independent adversarial reviews of the server batch and the combined OTA; their findings fixed. Next: staging apply + two-phone 1.5.0 check (#157), OTA gate (#158) |

## Open questions

- Scenario N1 from the plan is not in the committed evidence files (`observations.jsonl` holds E1a, E1c, E1d, E2, E2-ctx, E3a, E3b, E4, E5, E6). The terminal-blocker behaviour is taken from E1c; confirm what N1 was meant to add.
- How often does Head Office remove access while an archive is queued? Unknown until the November retest; the scope score of 1 is a judgement.

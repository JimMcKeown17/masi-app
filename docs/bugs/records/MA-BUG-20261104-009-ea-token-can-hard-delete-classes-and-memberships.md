---
record_version: 1
id: MA-BUG-20261104-009
title: "An EA's login can hard-delete classes, memberships and enrolments through the raw API"
classification: product_defect
subsystem: data-retention

severity_score: 6
severity_band: S2
severity_components:
  user_impact: 2
  data_security_privacy: 3
  scope: 0
  recoverability: 1
severity_override: none
priority: P1

diagnosis_state: CONFIRMED
delivery_state: RELEASED
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 85
confidence_basis: "Executed in disposable PostgreSQL 17 with all 41 migrations: an EA token deleted its own class (cascading the class assignment and nulling the class on children, groups and sessions), deleted a Head Office class that had no memberships, and deleted membership and enrolment rows, all with one row returned; the live DELETE grants and policies were listed from the same database. The app has no producer for these deletes (searched, not exhaustively fuzzed)."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T15:44:00Z
first_observed_at: 2026-11-04T19:49:55Z
last_observed_at: 2026-11-04T19:49:55Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "every build since the clean RLS policies (20260521115416) and 20260525231506; no field cohort has run the app"

environment: "Disposable PostgreSQL 17 (postgres:17-alpine) with all 41 supabase/migrations at main 8b79eae5, driven by repro-server-lifecycle-semantics/lifecycle-harness.cjs; EA writes run as role authenticated with the EA's JWT sub; never run against hosted Supabase"
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
  - docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/sql/
  - docs/bugs/evidence/MA-BUG-20261104-001/SHA256SUMS.txt
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/153

data_safety_status: "Destructive capability, not behaviour: any holder of an EA's access token can delete that EA's classes, class memberships, group memberships and enrolments directly through the data API. The app never does this. Never seen in the field."
workaround_status: "None needed for the app, because it has no such write. The capability closes only by revoking the grants and dropping the policies."
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-009 — An EA's login can hard-delete classes, memberships and enrolments through the raw API

## User-visible symptom

No field report; reproduced by Claude. This is not something the app does, and no EA
would see it from the app. It is a capability: anyone holding an EA's login token
(a modified client, a script, a stolen phone session) can delete that EA's classes,
and the memberships and enrolments of children the EA can write for, with plain delete
requests. Afterwards the class, its assignment, or the child's class, group or
programme link is gone, and the children and sessions that pointed at the class lose
their class.

## Operational impact

- **Can the user continue?** Yes for the person who deleted. Other EAs lose the class or the link.
- **Core workflow affected:** Class and roster structure, and with it history authorisation, which reads class assignments and memberships as evidence.
- **Known affected users:** 0. The app has no producer for these deletes.
- **Relevant exposed population:** Every EA token (all EAs hold this capability today).
- **Workaround:** None short of the planned grant revoke.

## Data-safety assessment

- **UI visibility:** The class or membership vanishes from every other EA's roster after their next pull.
- **Durable local SQLite rows:** Other phones keep their copies until a pull reconciles the removal; not exercised here.
- **Backend rows and relationships:** Rows are deleted (not archived). Cascades and `SET NULL` follow, listed in Observed facts.
- **sync_outbox status, error_class/error_code:** Not applicable: the deletes do not come from a phone queue.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** None; deleted rows cannot be recovered by the app.
- **Duplication, misattribution, or cross-account risk:** An EA can delete a class Head Office created, as long as the class has no memberships (L6, third bullet).

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude, executed reproduction L6.EA_hard_delete_* | None (no field report) | 2026-11-04T19:49:55Z | 2026-11-05T01:00:00Z | Disposable PostgreSQL 17, 41 migrations at main 8b79eae5; same server for 1.5.0 pilot builds | None | None | `repro-server-lifecycle-semantics/results.json` (sha256 6d99c2ffdacb49248fddd5f913a1eb9868ba8819329b98e5bffc2e13694e2e80) and the `sql/` files listed in Observed facts |

## Reproduction

### Reporter steps

1. As an EA, send `DELETE` against `classes`, `child_class_memberships`, `child_group_memberships` or `child_programme_enrollments` for a row the EA's policies allow.

### Expected

The delete is refused: EAs archive; only privileged tooling deletes.

### Actual

One row is returned and the row is gone.

### Closest E2E reproduction

PostgreSQL 17 with all 41 migrations; statements run as role `authenticated` with the EA's JWT sub (EA_A). Not driven through PostgREST over HTTP.

## Observed facts

- `L6.EA_hard_delete_own_class` (`sql/L6.EA_hard_delete_own_class.sql` sha256 91f23b913f43): EA_A deleted its own class KA, 1 row. Afterwards the class row is gone, its class assignment is gone (cascade), and the `class_id` on the group in the class, on the child (C_EA) and on the session is null (`SET NULL`).
- `L6.EA_hard_delete_HO_class_without_memberships` (`sql/L6.EA_hard_delete_HO_class_without_memberships.sql` sha256 e16426638c1d): EA_A deleted Head Office's class K2 (assigned to the EA, no memberships, one session), 1 row. The class and the EA's class assignment (the held-grant evidence history authority reads) are gone; the session's `class_id` is null.
- `L6.EA_hard_delete_HO_class_with_memberships` (`sql/L6.EA_hard_delete_HO_class_with_memberships.sql` sha256 b14661507eba): refused with 23503, `child_class_memberships_class_id_fkey` (that foreign key is `RESTRICT`). This is the only protection and it depends on the class having a membership row.
- `L6.EA_hard_delete_rows` (`sql/L6.EA_hard_delete_rows.sql` sha256 f505ca104fe5): as EA_A, deletes returned 1 row for a `child_group_memberships` row, two `child_class_memberships` rows (one direct, one class-only path) and a `child_programme_enrollments` row, and the group membership, the direct class membership and the enrolment read back null. Deletes of `child_ea_assignments`, `class_ea_assignments`, `group_ea_assignments` and `groups` were refused with 42501 `permission denied for table`.
- `L6.fk_inventory` (`sql/L6.fk_inventory.sql` sha256 264e991fb172), "authenticated DELETE grants": EAs hold DELETE on exactly `child_class_memberships`, `child_group_memberships`, `child_programme_enrollments`, `class_grouping_state`, `classes`, `grouping_versions`, `session_attendees`, `sessions` and `time_entries`. Matching policies: `classes_delete_assigned_ea` (`current_user_can_write_for_class(id)`), `child_class_memberships_delete_write_child_class`, `child_group_memberships_delete_created_by`, `child_programme_enrollments_delete_active_assignment`, `class_grouping_state_delete_write_class`, `grouping_versions_delete_write_class`, `session_attendees_delete_own_session_active_assignment`, `sessions_delete_active_assignment_after_attendee`, `time_entries_delete_own`.
- Source: `classes_delete_assigned_ea` is in `supabase/migrations/20260525231506_masi_rls_contract_cleanup.sql` 118-121; the others are created in `20260521115416_masi_clean_rls_policies.sql` (enrolments 229, group memberships 329, time entries 346), `20260521144901_masi_zazi_alignment_schema.sql` (grouping versions 829, class grouping state 850, class memberships 884, sessions 953, attendees 991) and the grants at `20260521115416` 46-57. `20261021140000_session_group_authorization.sql` 107-111 already revoked DELETE on `groups` for the same reason ("A hard delete would cascade away the historical assignment that authorizes sessions queued offline"); `20260521153217_masi_child_delete_guard.sql` 3 revoked it on `children`.
- No app producer. The only code that issues a table delete is the generic branch in `src/services/offlineSync.js` 741-745, reached only for outbox operation `hard_delete`, and the only producer of `hard_delete` is the children repository (`src/db/repositories/childrenRepository.js` 1032; `f002e08` 1029), which the engine routes to the `delete_child_if_no_history` RPC (723-738, same at `f002e08`). Classes are archived, not deleted (`classesRepository.js` 238). So nothing the app does produces these deletes; it is a raw-API capability.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The delete grants and policies are left over from the first RLS design and were never revoked for tables the app now archives | Matching policies in the initial migrations; groups and children revoked later for the same reason | None found | 85% | Confirm against `pg_policies` on staging (read-only) that none were dropped by hand, given the repo's schema-drift warning |
| Something other than the app deletes these rows today | None | Search of `src` for `.delete()` and `hard_delete` finds only the children RPC path | 85% | Re-run the search after the fix; revoke breaks any hidden caller loudly |

## Root cause

The initial schema granted `delete` on most tables to `authenticated` and created
DELETE policies that check only "is this EA assigned". The app later moved to archive
and restore, and two tables (`groups`, `children`) got their DELETE revoked, but the
rest were never revisited. Foreign-key `RESTRICT` on class memberships protects a
class only while it has a membership row, and `SET NULL` / `CASCADE` do the rest of the
damage silently. The delete is a latent capability, not an app behaviour, so no
test of app flows would find it.

## Suggested fix

Approved plan (Jim, 2026-11-04). Step 2, remove destructive capabilities: revoke
`delete` from `authenticated` on these tables and drop the matching policies, the same
fix `20261021140000` made for groups (107-111). Privileged tooling keeps `service_role`.
`delete_child_if_no_history` stays the only delete path and becomes the safe
"leave or archive" RPC in step 5. Step 1 adds the delete cases to the frozen 1.5.0
harness first (red), and a guard that fails if `authenticated` regains any DELETE
grant. 1.5.0 compatibility: no 1.5.0 code path issues these deletes, so revoking
cannot break a pilot phone; the children `hard_delete` RPC path is unchanged.

## Verification plan

- [ ] Reproduce the original workflow on the closest faithful environment: L6.EA_hard_delete_* in the frozen Postgres harness, red first.
- [ ] Add a regression test that fails for the mechanism: every EA delete in these cases is refused with 42501, and a catalogue test asserts `authenticated` holds no DELETE grant.
- [ ] Verify the targeted correction locally.
- [ ] Run the full 1.5.0 wire-shape suite to prove no app flow depended on a delete.
- [ ] Confirm on staging (read-only) that the grants and policies match the migrations before applying.
- [ ] Identify the exact migration containing the fix.
- [ ] Device check on a 1.5.0 pilot phone: create, archive and leave classes and children still work.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | L6.EA_hard_delete_*, `docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/` |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #153; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-safety-server |
| 2026-11-05T09:00:00Z | Claude | Fixed in code, locally tested (not merged, not applied, not released) | feat/lifecycle-safety-server: lifecycle-compat harness 77/77 on disposable PG17 (red 13/68 before), all 14 PG harnesses green. Independent adversarial reviews of the server batch and the combined OTA; their findings fixed. Next: staging apply + two-phone 1.5.0 check (#157), OTA gate (#158) |
| 2026-11-05T15:44:00Z | Claude | Released | Server batch applied to staging `segygjzpujphwvrubusm` at 15:39 UTC from `feat/lifecycle-safety-server` 09fb332a (PR #161; before/after checks in its build log, b15fb722). Not merged yet. Phones run the update from their second launch after it downloads. The device, uptake and field checks are still open (#157, #158, #159) |

## Open questions

- `sessions`, `session_attendees` and `time_entries` also hold DELETE for EAs. Is any EA-facing flow supposed to remove them (for example editing a saved session)? The plan's step 2 revokes only the listed tables plus UPDATE on sessions; this list should be confirmed against the saved-session editing roadmap before the revoke.
- The staging backend was not queried, so the grants listed here are those of the migrated disposable database, not necessarily staging's.

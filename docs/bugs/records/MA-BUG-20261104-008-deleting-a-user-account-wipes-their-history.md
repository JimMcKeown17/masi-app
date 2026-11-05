---
record_version: 1
id: MA-BUG-20261104-008
title: "Deleting an EA's login account deletes their sessions, assessments, ticks and assignments"
classification: product_defect
subsystem: data-retention

severity_score: 7
severity_band: S1
severity_components:
  user_impact: 2
  data_security_privacy: 3
  scope: 1
  recoverability: 1
severity_override: none
priority: P1

diagnosis_state: CONFIRMED
delivery_state: IN_PROGRESS
verification_state: NOT_TESTED

root_cause_confidence_pct: 90
confidence_basis: "Executed in disposable PostgreSQL 17 with all 41 migrations: deleting one EA's login account removed their sessions, attendance, assessments, assessment items, time entries and every assignment (counts 1 to 0), while the same delete was refused only when the EA also had a tick or run row; the complete foreign-key inventory with ON DELETE actions was read from the live catalog of the same database."

created_at_utc: 2026-11-05T01:00:00Z
updated_at_utc: 2026-11-05T02:30:00Z
first_observed_at: 2026-11-04T19:49:55Z
last_observed_at: 2026-11-04T19:49:55Z

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: "no field exposure yet; reproduced in disposable Postgres / real SQLite before the November 2026 EA retest"
exposure_window: "every build since the clean base schema (20260521115412); no field cohort has run the app"

environment: "Disposable PostgreSQL 17 (postgres:17-alpine) with all 41 supabase/migrations at main 8b79eae5, driven by repro-server-lifecycle-semantics/lifecycle-harness.cjs; deletes run as the postgres role (what Auth admin deleteUser or Studio does); never run against hosted Supabase"
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

data_safety_status: "Destructive and unrecoverable from the app: deleting a login account or profile row removes the EA's teaching and assessment history for every child, with no archive. Reproduced only in a disposable database; never seen in the field."
workaround_status: "Off-board by suspending the account (npm run ea:suspend), never by deleting an auth user or public.users row. Restore from a Supabase backup if a delete has happened."
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261104-008 — Deleting an EA's login account deletes their sessions, assessments, ticks and assignments

## User-visible symptom

No field report; reproduced by Claude. Nothing is visible on any EA's phone at the
moment of the delete. Afterwards the office's reports and the next phone sync show the
EA's past sessions, attendance, assessments, hours and assignments as gone, and the
children's history that depended on them is gone with them. The other EAs and Head
Office have no way to see what was removed.

## Operational impact

- **Can the user continue?** Other EAs can. The deleted EA's history cannot be recovered through the app.
- **Core workflow affected:** Reporting and history for every child the EA taught or assessed; time records; handover continuity.
- **Known affected users:** 0. No field cohort has run the app.
- **Relevant exposed population:** Any EA whose login account or profile row is deleted: off-boarding, a test-account clean-up, or a provisioning rollback (see Observed facts).
- **Workaround:** Suspend instead of delete; restore from a backup.

## Data-safety assessment

- **UI visibility:** The history simply disappears from reports.
- **Durable local SQLite rows:** The EA's phone, if it still has the app, keeps its own copy until it signs out or pulls; not exercised here.
- **Backend rows and relationships:** Cascaded away with the profile row; counts in Observed facts. A child the EA created survives with `created_by` null.
- **sync_outbox status, error_class/error_code:** Not applicable to the delete.
- **Incident queue evidence:** `public.mobile_support_incidents` receipts (the diagnostic record of what the phone reported) are also removed, because that table cascades from `auth.users`.
- **Eventual convergence evidence:** None. The rows are deleted, not hidden.
- **Duplication, misattribution, or cross-account risk:** Destructive loss of other children's history that happened to be recorded by this EA.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude, executed reproduction L6.* | None (no field report) | 2026-11-04T19:49:55Z | 2026-11-05T01:00:00Z | Disposable PostgreSQL 17, 41 migrations at main 8b79eae5; same server for 1.5.0 pilot builds | None | None | `repro-server-lifecycle-semantics/results.json` (sha256 6d99c2ffdacb49248fddd5f913a1eb9868ba8819329b98e5bffc2e13694e2e80) and the `sql/` files listed in Observed facts |

## Reproduction

### Reporter steps

1. Take an EA with one session, one attendee, one assessment with one item, one time entry, a direct child assignment (two in total with the one for a child they created), a class assignment, a group assignment and a programme assignment.
2. Delete the EA's `auth.users` row (what the Auth admin API `deleteUser` does).
3. Count the same rows again.

### Expected

The history stays: the EA is suspended or marked left, and the delete is refused while history references them.

### Actual

The delete succeeds and the history cascades away. It is refused only when the EA also has a tick or run row.

### Closest E2E reproduction

PostgreSQL 17 with all 41 migrations; plain `DELETE` as the postgres role against `auth.users` and `public.users` inside rolled-back transactions. Not driven through the Auth admin HTTP API.

## Observed facts

Counts are the harness's before and after rows for one EA (EA_DOOMED). Files: `results.json` sha256 6d99c2ffdacb49248fddd5f913a1eb9868ba8819329b98e5bffc2e13694e2e80.

- `L6.delete_auth_user_without_mastery` (`sql/L6.delete_auth_user_without_mastery.sql` sha256 46988d4ad297): the delete succeeded, 1 row. Before to after: sessions 1 to 0, session attendees 1 to 0, assessments 1 to 0, assessment items 1 to 0, time entries 1 to 0, child assignments 2 to 0, class assignments 1 to 0, group assignments 1 to 0, programme assignments 1 to 0, profile rows 1 to 0. The child the EA created remained (1 to 1) with `created_by` now null.
- `L6.delete_auth_user_with_letter_mastery` (`sql/L6.delete_auth_user_with_letter_mastery.sql` sha256 c073df593ce6): refused with 23503, `letter_mastery_changed_by_fkey`, "Key (id)=(1a000000-...0004) is still referenced from table letter_mastery". Nothing changed (every count the same before and after). This is accidental protection: it holds only while the EA has a letter tick, and only the `RESTRICT` rows below.
- `L6.delete_public_users_row_with_mastery` (`sql/L6.delete_public_users_row_with_mastery.sql` sha256 6c43494dcd32): deleting only the profile row (for example from Studio) succeeded, 1 row. Sessions, attendees, assessments, assessment items, time entries and all assignments went 1 or 2 to 0; `letter_mastery` stayed at 1, because its `changed_by` points at `auth.users`, not the profile row.
- `L6.fk_inventory` (`sql/L6.fk_inventory.sql` sha256 264e991fb172) lists every foreign key whose parent is `auth.users`, `public.users`, `children`, `classes`, `groups`, sessions, assessments or battery runs. The CASCADE paths that carry history:
  - `auth.users` to `public.users` (`users_id_fkey`), `private.ea_access_events`, `private.history_pull_rollout`, `public.mobile_support_incidents` (receipts).
  - `public.users` to `sessions.user_id`, `assessments.user_id`, `time_entries.user_id`, `child_ea_assignments.user_id`, `class_ea_assignments.ea_user_id`, `group_ea_assignments.ea_user_id`, `staff_programme_assignments.user_id`.
  - Onward: `sessions` to `session_attendees`; `assessments` to `assessment_items`; `children` to `assessments`, `child_class_memberships`, `child_ea_assignments`, `child_group_memberships`, `child_programme_enrollments`, `letter_mastery`, `letter_mastery_corrections`, `session_attendees`; `classes` to `class_ea_assignments`, `class_grouping_state`, `grouping_versions`; `groups` to `child_group_memberships`, `group_ea_assignments`.
  - `RESTRICT` today: `battery_runs.user_id`, `letter_mastery.changed_by`, `letter_mastery_corrections.changed_by`, `skill_mastery.changed_by`, `skill_mastery_corrections.changed_by` (all to `auth.users`); `battery_runs.child_id`, `skill_mastery.child_id`, `skill_mastery_corrections.child_id`; `assessments.battery_run_id`.
  - `SET NULL`: `children.created_by`, `children.archived_by_user_id`, `classes.created_by`, `groups.created_by`, and the other `created_by` / `archived_by_user_id` columns; `sessions.class_id` and `sessions.group_id` on class or group delete.
- `L6.HO_delete_child` (`sql/L6.HO_delete_child.sql` sha256 9d82b3664698): Head Office deleting a child outright (bypassing the `delete_child_if_no_history` function) succeeded and the child's `session_attendees` row went 1 to 0 while the session itself stayed, so the session now shows no attendee for that child.
- `L6.HO_delete_group_with_session` (`sql/L6.HO_delete_group_with_session.sql` sha256 ee301cca3799): Head Office deleting a group that a session references was refused with 23514, "sessions programme_id and group_id cannot be changed after insert" (the `ON DELETE SET NULL` trips the identity trigger). Protected by accident, as with the mastery rows.
- Scripts: `scripts/createTesters.js` calls `admin.auth.admin.deleteUser(userId)` at 207, 226 and 245, each only when this run created the account (`createdNow`) and a later provisioning step failed; a never-used account is safe to delete. The script's own comment at 230-232 records the other case ("Never delete the Auth user here, even if this run created it: deleting it would cascade to the winner's profile and Programme assignment"). The safe off-boarding command is `npm run ea:suspend` (`scripts/ea-access.cjs`).

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| History tables cascade from the EA's profile row because they were modelled as the EA's own data, not the organisation's | FK inventory; L6 counts | None found | 90% | After the fix, repeat the three delete cases: all refused, test accounts with no history still delete |
| The `RESTRICT` rows on tick and run tables were intended as the protection | Mastery delete refused | They cover only some tables and only while a tick exists; the profile-row delete bypasses them | 90% | Confirm in the migration history that no comment claims this intent |

## Root cause

The schema ties every piece of history to the EA who recorded it with `ON DELETE
CASCADE` from `public.users` (and a cascade from `auth.users` to `public.users`), so
removing the person removes the work. Protection exists only as an accident of a few
`RESTRICT` foreign keys on tick and run tables, which stop an `auth.users` delete while
those rows exist but do nothing for the profile row, and which an EA with no ticks does
not have. Off-boarding practice should never reach a delete, but nothing in the database
prevents one, and the provisioning script legitimately deletes auth users on rollback.

## Suggested fix

Approved plan (Jim, 2026-11-04). Step 2, remove destructive capabilities: the history
foreign keys (sessions, attendees, assessments and items, time entries, assignments,
enrolments and memberships) become `ON DELETE RESTRICT`. Keep `auth.users` to
`public.users` as `CASCADE` so never-used test accounts and the provisioning rollback
still delete. Decision: off-boarding is suspend-only (`npm run ea:suspend`); never
delete an auth user or `public.users` row. Step 6 adds that rule to the Head Office
runbook. Step 1 adds the three delete cases as red cases first. A new restrict also
needs a decision on `mobile_support_incidents` receipts: they cascade from `auth.users`
today, so a deliberate delete of a never-used account still drops them.

## Verification plan

- [ ] Reproduce the original workflow on the closest faithful environment: L6 delete cases in the frozen Postgres harness, red first.
- [ ] Add regression tests that fail for the mechanism: deleting an auth user or profile row with any session, attendance, assessment, time entry or assignment is refused (23503) and every count is unchanged.
- [ ] Verify a never-used test account (profile row only) still deletes, as does the `createTesters.js` rollback path.
- [ ] Verify the targeted correction locally.
- [ ] Confirm the migration applies on the staging backend's real data without a foreign-key rewrite error (read-only preflight with the `sqlite-staging-sql` helper first).
- [ ] Identify the exact migration containing the fix.
- [ ] Record the off-boarding runbook step and that nobody ran a delete during the November 2026 retest.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T01:00:00Z | Claude | Recorded from executed reproduction | L6.*, `docs/bugs/evidence/MA-BUG-20261104-001/repro-server-lifecycle-semantics/` |
| 2026-11-05T01:00:00Z | Jim | Fix approved | Jim approved the prevention plan and all ten design decisions on 2026-11-04 (local) |
| 2026-11-05T02:30:00Z | Claude | Implementation started | Issues #153, #154; plan passed five rounds of Codex adversarial review (round 5: approve); built on branches feat/lifecycle-safety-server, feat/lifecycle-ho-tools |

## Open questions

- Should `mobile_support_incidents` receipts, `private.ea_access_events` and `private.history_pull_rollout` stay cascading from `auth.users`? Receipts are diagnostic, but deleting them with a suspended-then-deleted account loses the trail; the plan keeps the cascade only so test accounts still delete.
- The staging backend (`masi-app-sqlite`) was not queried; its foreign keys are assumed to match the migrations, per the project's schema-drift warning. A read-only check of `pg_constraint` there should precede the migration.

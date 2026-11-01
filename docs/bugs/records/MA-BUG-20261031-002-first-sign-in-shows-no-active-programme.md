---
record_version: 1
id: MA-BUG-20261031-002
title: First sign-in says "No active programme · Contact your supervisor" until the first download lands
classification: product_defect
subsystem: active-programme-gate-first-pull

severity_score: 4
severity_band: S2
severity_components:
  user_impact: 2
  data_security_privacy: 0
  scope: 2
  recoverability: 0
severity_override: none
priority: P2

diagnosis_state: CONFIRMED
delivery_state: NO_FIX_PROPOSED
verification_state: NOT_TESTED

root_cause_confidence_pct: 75
confidence_basis: Issue #80 traced the mechanism in code (the gate reads one local table and cannot say "unknown"; that table downloads last), and five sightings on two phones, an emulator and an iPhone fit it; no targeted change has yet removed the symptom.

created_at_utc: 2026-10-31T21:45:00Z
updated_at_utc: 2026-10-31T21:45:00Z
first_observed_at: 2026-10-19T19:08:03Z
last_observed_at: 2026-10-31T15:27:38Z

known_occurrences: 5
known_affected_users: 3
affected_user_ids:
  - 116abb34-7097-47f1-829f-0bd8e27f4ed9
exposure_denominator: every EA's first sign-in on a phone with no local data for them
exposure_window: main since at least 6fc0212 (2026-10-19) through 644b966f (2026-10-31)

environment: sqlite-staging (masi-app-sqlite)
affected_releases:
  - release build tested 2026-10-19 (issue #80; exact version unknown)
  - AR3 gate build 2026-10-22 (issue #94; exact version unknown)
  - debug .kbtest build of feat/egma-maths-assessment (gate and Home unchanged from main 644b966f)
  - EAS preview build, Android versionCode 56
affected_devices:
  - Samsung Galaxy A03s
  - iPhone (model unknown)
  - Android emulator Medium_Phone_API_35
affected_os_versions:
  - Android 13 (API 33)
  - Android 15 (API 35, emulator)
  - iOS version unknown
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys: []
support_incident_signatures: []
evidence_paths: []
github_issues:
  - "#80"
  - "#94 (closed as duplicate of #80)"

data_safety_status: no data risk; false message and a temporary block on Record
workaround_status: wait for the first download (about 10–45 s); the message clears by itself
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261031-002 — First sign-in says "No active programme · Contact your supervisor" until the first download lands

## User-visible symptom

On an EA's first sign-in on a phone with no local data for them, Home shows the
card **"No active programme · Contact your supervisor to be assigned."** The EA
does have a programme. After the first download finishes (about 10 s on an
iPhone, 20–45 s on the Galaxy A03s), Home switches to the programme by itself.
In the same window, **+ Record** shows "No active programme. You don't have a
programme assigned yet. Contact your supervisor to be assigned before recording
sessions." and blocks the session (#94).

## Operational impact

- **Can the user continue?** Yes, after waiting. Record is blocked until the
  download lands.
- **Core workflow affected:** First sign-in, Home, Record, and the Assessments
  notice.
- **Known affected users:** Three test accounts. No field cohort runs the app
  today.
- **Relevant exposed population:** Every EA at first sign-in. Masi's EAs start
  the November 2026 retest on fresh installs, so every one of them will see it
  in their first minute.
- **Workaround:** Wait. Nothing needs repairing.

The harm is the message, not data. A new EA is told something false and
alarming ("contact your supervisor") and may phone Head Office.

## Data-safety assessment

- **UI visibility:** The programme appears once the download lands.
- **Durable local SQLite rows:** Not affected. `staff_programme_assignments` is
  simply empty until the reference pull writes it.
- **Backend rows and relationships:** The assignment exists on the server
  throughout (read-only check for R4/R5: the numeracy tester has a `numeracy`
  assignment).
- **sync_outbox status, error_class/error_code:** Not involved. No write is
  attempted.
- **Incident queue evidence:** None. No receipt kind covers it.
- **Eventual convergence evidence:** Converges every time once the first
  download finishes (R1–R5).
- **Duplication, misattribution, or cross-account risk:** None found.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Issue #80 (log timeline) | Test account (UUID not recorded) | 2026-10-19T19:08:03Z, cleared 19:08:43Z (~35 s) | 2026-10-19T19:22:19Z | Release build on sqlite-staging | Galaxy A03s | Online | #80 log table |
| R2 | Issue #80 | Test account (UUID not recorded) | 2026-10-19, time unknown (~10 s) | 2026-10-19T19:22:19Z | Same main code | iPhone, model unknown | Online | #80 summary |
| R3 | Issue #94 (AR3 Gates 5 and 7) | "Volume test EA" (UUID not recorded) | 2026-10-22; Record blocked 35–45 s | 2026-10-22T13:24:35Z | AR3 gate build | Galaxy A03s | Online | #94 timings |
| R4 | Claude, EGMA device gate | test+numeracy@masinyusane.org (`116abb34…`) | 2026-10-31T14:51:23Z; gone by 14:54:52Z (estimated ~20 s; not timed) | 2026-10-31T21:45:00Z | Debug `.kbtest` build of `feat/egma-maths-assessment` via Metro | Galaxy A03s, Android 13 | Wi-Fi | Session screenshots (not kept) |
| R5 | Claude, preview build smoke | test+numeracy@masinyusane.org (`116abb34…`) | 2026-10-31T15:27:38Z (duration not timed) | 2026-10-31T21:45:00Z | EAS preview, versionCode 56 | Android emulator, API 35 | Host network | Session screenshots (not kept) |

R4 and R5 ran on the EGMA branch. Its programme gate, Home card and
`NoActiveProgrammeNotice` are unchanged from `origin/main` (checked with
`git diff --quiet origin/main` on each file), so this is main's behaviour.

## Reproduction

### Reporter steps

1. Install the app (or use a phone with no local data for this EA).
2. Sign in as an EA who has an active `staff_programme_assignments` row.
3. Watch Home, or tap **+ Record**, in the first minute.

### Expected

While the first download runs, Home says it is still getting the EA's programme
ready and does not tell them to contact a supervisor. Record waits or says the
same.

### Actual

"No active programme · Contact your supervisor to be assigned." until the
download lands, then the programme.

### Closest E2E reproduction

R4 is a faithful repro: a new staging EA's first sign-in on the Galaxy A03s at
360 dp. R5 repeats it on a preview build.

## Observed facts

- `src/screens/main/HomeScreen.js:257-258` renders "No active programme" /
  "Contact your supervisor to be assigned." (`origin/main` 644b966f).
- `src/hooks/useSessionLaunchGuard.js:10-12` and
  `src/components/common/NoActiveProgrammeNotice.js:16-17` carry the Record and
  Assessments versions of the same message.
- #80 (verified in code at 6fc0212): the active-programme gate
  (`src/services/activeProgrammeGate.js`) returns `hasActiveProgramme: false` on
  an empty local table. Home's skeleton covers only the first local read. Home
  re-reads only on focus, foreground or a `childrenList`/history change. In the
  reference pull, `staff_programme_assignments` comes last of seven tables, after
  all schools, behind one serial request queue and one serial SQLite writer.
- `ClassesContext` already separates "confirmed none" from "unconfirmed empty"
  for classes (#80).

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The gate treats "not downloaded yet" as "no programme", and the assignment table downloads last | #80 code trace; message clears exactly when the first pull publishes (R1 log); five sightings | None found | 75% | Instrument the domain pull with per-table timings, then make the gate report "unknown" until a pull has confirmed the table |
| The server assignment is missing or late for new EAs | — | R4/R5 assignment present on the server before sign-in; message clears without any server change | 5% | — |

## Root cause

1. On first sign-in the EA's database has no `staff_programme_assignments` rows.
2. The active-programme gate reads only that local table, so it reports "no
   programme" instead of "not known yet".
3. Home, Record and Assessments show the "contact your supervisor" message for
   "no programme".
4. The reference pull fetches that table last, behind the schools list and other
   work on one serial queue, so the false state lasts 10–45 s.
5. Home re-reads only when the roster pass publishes, which is why it flips late.

## Suggested fix

From #80 (no fix approved): tell "still loading" apart from "not assigned" (for
example "Getting your programme ready…" until the first pull confirms the
table), fetch the staff programme first in the reference pull, and log per-table
pull timings. Fix work belongs on #80.

## Verification plan

- [ ] Reproduce the original end-user workflow on the affected release or
      closest faithful environment.
- [ ] Add or identify a regression test that fails for the demonstrated causal
      mechanism.
- [ ] Verify the targeted correction locally.
- [ ] Run the closest representative E2E flow on a physical device when the
      bug is device-, lifecycle-, SQLite-, or network-sensitive.
- [ ] Verify local durability and backend convergence for data/sync incidents.
- [ ] Identify the exact release/build containing the fix.
- [ ] Obtain field confirmation or record an explicit observation window with
      sufficient exposure and no recurrence.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-10-19T19:22:19Z | JimMcKeown17 (GitHub) | Issue #80 opened | A03s log timeline and code trace |
| 2026-10-22T14:00:04Z | JimMcKeown17 (GitHub) | #94 closed as a duplicate of #80 | Same cause |
| 2026-10-31T21:45:00Z | Claude | Record created from #80, #94 and two new sightings (R4, R5) | EGMA device gate; AGENTS.md requires a record for bugs seen in a device gate |

## Open questions

- How long does the first download take for a real EA with a full class list on
  the A03s? That decides whether "Getting your programme ready…" is enough or
  the pull order must change before the November retest.

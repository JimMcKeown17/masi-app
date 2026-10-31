---
record_version: 1
id: MA-BUG-20261030-006
title: Send diagnostics text sits almost on the footer divider
classification: product_defect
subsystem: ui-bottom-sheet

severity_score: 1
severity_band: S3
severity_components:
  user_impact: 1
  data_security_privacy: 0
  scope: 0
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: CONFIRMED
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 90
confidence_basis: BottomSheet's body content has horizontal padding only, so a body whose last element has no bottom margin meets the footer divider directly. An audit of all 12 footer sheets found 0 dp gaps in 9 and per-sheet compensation in the rest; the A03s look is still to be checked.

created_at_utc: 2026-10-30T23:30:00Z
updated_at_utc: 2026-10-31T02:06:37Z
first_observed_at: 2026-10-30T16:45:00Z
last_observed_at: 2026-10-30T16:45:00Z

known_occurrences: 1
known_affected_users: 1
affected_user_ids:
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0
exposure_denominator: unknown
exposure_window: 2026-10-30 A03s device gates only

environment: sqlite-staging (masi-app-sqlite)
affected_releases:
  - 1.5.0 (55)
affected_devices:
  - Samsung Galaxy A03s (SM-A037U)
affected_os_versions:
  - Android 13 (API 33)
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys: []
support_incident_signatures: []
evidence_paths:
  - docs/bugs/evidence/MA-BUG-20261030-006/a03s-send-diagnostics-sheet.png
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/125

data_safety_status: no data risk
workaround_status: not needed
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261030-006 — Send diagnostics text sits almost on the footer divider

## User-visible symptom

In the Send diagnostics sheet, the last line of "Send app information to the
Masi team to help us investigate problems." ends about 4 dp above the footer's
divider line, which looks cramped next to the generous spacing elsewhere.

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** None; visual polish.
- **Known affected users:** One test account.
- **Relevant exposed population:** Every phone (layout rule).
- **Workaround:** Not needed.

## Data-safety assessment

- **UI visibility:** Cosmetic.
- **Durable local SQLite rows:** Not involved.
- **Backend rows and relationships:** Not involved.
- **sync_outbox status, error_class/error_code:** Not involved.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | A03s device gates (Claude) | test+b@masinyusane.org | 2026-10-30T16:45:00Z | 2026-10-30T16:45:00Z | 1.5.0 (55), sqlite-staging | Galaxy A03s, Android 13 | Wi-Fi | `a03s-send-diagnostics-sheet.png` SHA-256 `c9370463ed1dfd6dd2adad5789225c1738cda74bea227b40e9e34fc8649fa4ee` |

## Reproduction

### Reporter steps

1. Profile → Support tools → Send diagnostics.

### Expected

The body text has the same breathing room above the footer as other sheets.

### Actual

About 4 dp between the text and the divider.

### Closest E2E reproduction

The A03s observation above.

## Observed facts

- `SendDiagnosticsSheet` renders one `Text` with `typeRoles.textParagraph` and
  no margin as the sheet body.
- `BottomSheet`'s `bodyContent` style sets `paddingHorizontal` only; the footer
  adds `paddingTop` inside its own border, not space above it.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The shared sheet gives the body no bottom space before a footer, so it depends on each body's last margin | Source of both files | Other sheets with footers not yet checked | 50% | Inspect other footer sheets with a margin-less last element |

## Root cause

BottomSheet supplied no bottom padding to either body variant; footer top padding lives below its divider. Local tests confirm 0 dp before the divider without a caller spacer.

## Suggested fix

Shared spacing.md body bottom padding when footer exists; caller bodyContentStyle remains last. Remove BlendPoolSheet bottom compensation and reduce existing no-divider footer padding so it does not stack. Preserve ConfirmSheet accessory-to-body spacing.

## Verification plan

- [x] Local public-interface regression tests passed (see first-sweep build-log entry for exact counts).
- [ ] A03s and iPhone acceptance checks (2026-10-31).

- [ ] Compare sheets with footers on the A03s.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-10-30T16:45:00Z | Claude | Observed during A03s gate 1 | Screenshot |
| 2026-10-30T23:30:00Z | Claude | Report recorded | First registry sweep |
| 2026-10-31T02:06:37Z | Codex | Fixed in code; locally tested | Issue #125; RED → GREEN evidence in build log; device checks pending |

## Open questions

- Footer-sheet source audit completed; gap table in build log. Device visual checks remain open.

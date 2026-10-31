---
record_version: 1
id: MA-BUG-20261030-003
title: '"Remove screenshot" is styled unlike "Replace screenshot"'
classification: product_defect
subsystem: profile-support-tools

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
confidence_basis: The two buttons are declared with different BrandButton variants, tones and icons in ReportProblemSheet.js:75-78.

created_at_utc: 2026-10-30T23:30:00Z
updated_at_utc: 2026-10-31T02:06:37Z
first_observed_at: 2026-10-30T16:48:00Z
last_observed_at: 2026-10-30T16:48:00Z

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
  - docs/bugs/evidence/MA-BUG-20261030-003/a03s-report-problem-screenshot-actions.png
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/124

data_safety_status: no data risk
workaround_status: not needed
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261030-003 — "Remove screenshot" is styled unlike "Replace screenshot"

## User-visible symptom

Under "Screenshot attached.", "Replace screenshot" is a red, left-aligned link
with an image icon. "Remove screenshot" directly below it is black, centred and
has no icon. The pair reads as two unrelated controls.

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** None; visual consistency.
- **Known affected users:** One test account.
- **Relevant exposed population:** Every phone (code-level).
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
| R1 | A03s device gates (Claude) | test+b@masinyusane.org | 2026-10-30T16:48:00Z | 2026-10-30T16:48:00Z | 1.5.0 (55), sqlite-staging | Galaxy A03s, Android 13 | Wi-Fi | `a03s-report-problem-screenshot-actions.png` SHA-256 `3200466f860fd5c93a087ee20f6551e941749503c171c751b305e1c74ab59f61` |

## Reproduction

### Reporter steps

1. Profile → Support tools → Report a problem → Attach a screenshot.

### Expected

The two actions on the attachment share one visual treatment (or form a pair).

### Actual

Replace is `variant="tertiary"` with `icon="image-outline"` (brand red);
Remove is `variant="tertiary" tone="ink"` with no icon.

### Closest E2E reproduction

The A03s observation above.

## Observed facts

- `src/components/profile/ReportProblemSheet.js:75-78` declares the two buttons
  with different variants, tones and icons.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| Inconsistent BrandButton props | Source | None | 90% | Not needed |

## Root cause

Different tone, icon and alignment props made the attachment actions inconsistent; local component behavior tests confirm the old layout and the new matched row.

## Suggested fix

Implemented Replace and Remove in one spacing.sm row, both default brand tertiary buttons with image-outline/trash-outline and full accessible labels.

## Verification plan

- [x] Local public-interface regression tests passed (see first-sweep build-log entry for exact counts).
- [ ] A03s and iPhone acceptance checks (2026-10-31).

- [ ] Agree the treatment, then check on the A03s and an iPhone.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-10-30T16:48:00Z | Claude | Observed during A03s gate 3 | Screenshot |
| 2026-10-30T23:30:00Z | Claude | Report recorded | First registry sweep |
| 2026-10-31T02:06:37Z | Codex | Fixed in code; locally tested | Issue #124; RED → GREEN evidence in build log; device checks pending |

## Open questions

- Treatment settled by Jim: matched brand tertiary row; device appearance pending.

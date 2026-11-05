---
record_version: 1
id: MA-BUG-20261105-006
title: An app update published from main rolled every 1.5.0 phone back to code without the lifecycle fixes and the version card
classification: product_defect
subsystem: release-process

severity_score: 3
severity_band: S3
severity_components:
  user_impact: 2
  data_security_privacy: 1
  scope: 0
  recoverability: 0
severity_override: none
priority: P2

diagnosis_state: CONFIRMED
delivery_state: RELEASED
verification_state: E2E_REPRO_CLOSED

root_cause_confidence_pct: 85
confidence_basis: Both served manifests were fetched as a 1.5.0 iPhone and show which commit each update carried; the guard, merged in f4ba06bd, refused a live dry run from a main that lacked the live update's commit (the same shape), and passed a real guarded publish (1.5.0+5).

created_at_utc: 2026-11-05T18:30:00Z
updated_at_utc: 2026-11-05T20:45:00Z
first_observed_at: 2026-11-05T17:57:43Z
last_observed_at: 2026-11-05T18:10:53Z

known_occurrences: 1
known_affected_users: unknown
affected_user_ids: []
exposure_denominator: 1.5.0 pilot phones that launched in the window (count unknown)
exposure_window: 2026-11-05T17:57:43Z to 2026-11-05T18:10:53Z (13 minutes)

environment: preview update channel, runtime 1.5.0, sqlite-staging
affected_releases:
  - 1.5.0 update group 9542a163-7f54-4004-b4a9-68b1462f6107 (main 9f6b0f961da8)
affected_devices: []
affected_os_versions: []
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys: []
support_incident_signatures: []
evidence_paths: []
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/158
  - https://github.com/JimMcKeown17/masi-app/pull/167

data_safety_status: no data loss known; the server batch stayed applied and protects 1.5.0 clients on its own
workaround_status: publish only with npm run ota:publish from a tree that contains the live update's commit; 1.5.0+4 replaced the bad update
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261105-006 — An app update published from main rolled every 1.5.0 phone back to code without the lifecycle fixes and the version card

## User-visible symptom

Observed by the orchestrating session on 2026-11-05, not reported by a field user. For 13 minutes a 1.5.0 phone that restarted received an app update built from main. That update lacked the lifecycle app update (PR #163) and the App release card (PR #167) that the previous update, `1.5.0+2`, carried. A phone in that state shows no App release card in Profile.

## Operational impact

- **Can the user continue?** Yes. Nothing visibly broke.
- **Core workflow affected:** Archive and remove safety on the phone (plan decision D10 no longer held for those phones) and the version card.
- **Known affected users:** unknown. No phone is known to have taken the update.
- **Relevant exposed population:** 1.5.0 pilot phones that launched between 17:57 and 18:11 UTC (unknown count).
- **Workaround:** `1.5.0+4` (published 18:10:53 UTC with `npm run ota:publish`) replaced it; phones restart into it.

## Data-safety assessment

- **UI visibility:** Not affected.
- **Durable local SQLite rows:** No evidence of change.
- **Backend rows and relationships:** The server batch stayed applied and protects 1.5.0 clients on its own.
- **sync_outbox status, error_class/error_code:** Not examined.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not applicable; recovery is by the next update, not by data repair.
- **Duplication, misattribution, or cross-account risk:** None known.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Orchestrating session, manifest fetch as a 1.5.0 iPhone | Claude | 2026-11-05T17:57:43Z | 2026-11-05T18:30:00Z | preview channel, runtime 1.5.0 | simulated 1.5.0 iPhone request | n/a | Build-log section "Update `1.5.0+4`" on `feat/app-release-card` (96698fc3); issue #158 comment |

## Reproduction

### Reporter steps

1. Update `1.5.0+2` (group 2ed208c1, commit e9a4360d, unmerged PRs #163 and #167) is live on `preview`.
2. Merge #165 to main. Its PR body's Release section says to run `npx eas-cli@26.0.0 update --channel preview --environment preview --message "Draft words, blends and books"`.
3. Run that command from main.

### Expected

The publish is refused, or the update still carries the live update's code.

### Actual

Group `9542a163-7f54-4004-b4a9-68b1462f6107` published from main `9f6b0f961da8` and became the live update. Main lacked #163 and #167.

### Closest E2E reproduction

It happened as above. The served manifest, fetched as a 1.5.0 iPhone, showed that commit and no `otaRelease`.

## Observed facts

- 17:40 UTC: `1.5.0+2` was live on `preview`, runtime 1.5.0.
- 17:55 UTC: #165 merged to main.
- 17:57:43 UTC: group `9542a163-7f54-4004-b4a9-68b1462f6107` published from main `9f6b0f961da8`; served manifest showed that commit and no `otaRelease`.
- 18:10:53 UTC: `1.5.0+4` (group dd1ef964, commit b759128f = main + #163 + #167) published with `npm run ota:publish`; both served manifests show commit b759128f and `otaRelease 4`.
- Two publish paths exist (bare `eas update` and `npm run ota:publish`), and main lags behind what phones run while the lifecycle stack (#160, then #161/#162/#163, then #167) is unmerged.
- Nothing refused a publish from a tree missing the live update's commit.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| An unguarded publish from a tree behind the live update replaces it | Manifests before and after; PR body instruction | None | 85% | Try the guarded publish from main and confirm it refuses |

## Root cause

Two publish paths and a main that lags behind what phones run. The PR #165 body told the publisher to use bare `eas update`, which publishes whatever tree is checked out. No check compared that tree with the live update's commit, so an older tree replaced a newer one.

## Suggested fix

In progress: work order 9 on `feat/app-release-card` (PR #167). `ota:publish` refuses a tree that does not contain the live update's commit unless `--allow-rollback "<reason>"` is passed. The release instructions should name `ota:publish` only.

## Verification plan

- [ ] Run `ota:publish` from a tree missing the live commit and confirm it refuses.
- [ ] Confirm `--allow-rollback "<reason>"` publishes and records the reason.
- [ ] Confirm release instructions in PR bodies and docs name `ota:publish` only.
- [ ] Identify the exact release containing the guard.
- [ ] Learn how many phones launched in the 13-minute window.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T17:40:00Z | Claude | `1.5.0+2` live on `preview` | Group 2ed208c1, commit e9a4360d |
| 2026-11-05T17:55:00Z | Jim | #165 merged to main | PR body gave the bare `eas update` command |
| 2026-11-05T17:57:43Z | Claude | Group 9542a163 published from main 9f6b0f961da8 | Served manifest: that commit, no `otaRelease` |
| 2026-11-05T18:10:53Z | Claude | `1.5.0+4` published with `npm run ota:publish` | Manifests: commit b759128f, `otaRelease 4` |
| 2026-11-05T18:30:00Z | Claude | Report recorded | Guard in progress in PR #167 (work order 9) |
| 2026-11-05T19:55:00Z | Another Claude session | `1.5.0+5` published with `npm run ota:publish` from a release branch containing b759128f | The guard passed against `1.5.0+4` (b759128f); group 3ec327af, commit 1bddda8e |
| 2026-11-05T20:30:00Z | Jim (merge approval), Claude | Guard merged to main | PR #167 squash f4ba06bd; CI green on dd09429d |
| 2026-11-05T20:40:00Z | Claude | Live dry run from main f4ba06bd (lacks #169's Wrap up cards, which `1.5.0+5` carries): REFUSED | "Refusing to publish: phones on preview run update group 3ec327af… (release 1.5.0+5) from commit 1bddda8e…, and this commit (f4ba06b) does not contain it … (4 files: src/components/lessons/WrapUpChildCard.js, …). Nothing was published." The real EAS `update:view` output parsed. Delivery RELEASED, verification E2E_REPRO_CLOSED |

## Open questions

- How many 1.5.0 phones launched in the 13-minute window? Severity rises to S2 if more than one did, or if any took the update and archived or removed work.

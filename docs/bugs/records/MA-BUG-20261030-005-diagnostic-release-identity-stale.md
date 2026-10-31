---
record_version: 1
id: MA-BUG-20261030-005
title: Diagnostics report a stale release label, no commit and no Android version code
classification: product_defect
subsystem: diagnostics-release-metadata

severity_score: 2
severity_band: S3
severity_components:
  user_impact: 0
  data_security_privacy: 1
  scope: 1
  recoverability: 0
severity_override: none
priority: P2

diagnosis_state: CONFIRMED
delivery_state: FIXED_IN_CODE
verification_state: LOCAL_TESTED

root_cause_confidence_pct: 95
confidence_basis: The values come from a hand-written JSON file unchanged since the SQLite cutover, and EAS remote versioning never writes versionCode into the Expo config the export reads. Tests reproduced the null build, the 'unknown' commit and the frozen label, then the derived values.

created_at_utc: 2026-10-30T23:30:00Z
updated_at_utc: 2026-10-31T09:57:55Z
first_observed_at: 2026-10-30T16:45:07Z
last_observed_at: 2026-10-30T16:57:44Z

known_occurrences: 1
known_affected_users: 1
affected_user_ids:
  - 0d7e80de-df70-4d9a-a569-d8a4cdeba6a0
exposure_denominator: unknown
exposure_window: every receipt and bundle from 1.5.0 (55); likely every build since the cutover

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
evidence_paths: []
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/127

data_safety_status: no data risk; misleading diagnostics
workaround_status: use observed.application.version/build and update.id instead
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261030-005 — Diagnostics report a stale release label, no commit and no Android version code

## User-visible symptom

No EA-visible symptom. Receipts and bundles from build 55 say
`releaseLabel: "sqlite-critical-hardening"` and `gitCommit: "unknown"`, and the
bundle's `supportExport.releaseMetadata.androidVersionCode` is `null`. An
operator could read the label as naming the build.

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** Operator identification of the exact build.
- **Known affected users:** All receipts; one test account so far.
- **Relevant exposed population:** Every phone.
- **Workaround:** `observed.application.version` and `.build` (from
  expo-application) and `observed.update.id` are correct (1.5.0, 55, `20cb17f0…`).

## Data-safety assessment

- **UI visibility:** Profile release information may show the same label (not checked).
- **Durable local SQLite rows:** Not involved.
- **Backend rows and relationships:** Not involved.
- **sync_outbox status, error_class/error_code:** Not involved.
- **Incident queue evidence:** Every receipt carries the stale label.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** Misattribution of the
  release, if the label is trusted.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Receipts `dg:9be72255`, `ut:d59e852f` and their bundles | test+b@masinyusane.org | 2026-10-30T16:45:07Z | 2026-10-30T16:57:44Z | 1.5.0 (55), update `20cb17f0-c9bb-4eb2-9df2-35b33b695e5c` | Galaxy A03s, Android 13 | Wi-Fi | Excerpt below |

```json
"application": { "version": "1.5.0", "build": "55",
  "releaseLabel": "sqlite-critical-hardening", "gitCommit": "unknown" }
```

## Reproduction

### Reporter steps

1. Profile → Support tools → Send diagnostics; fetch the bundle with
   `--fetch <handle>`.

### Expected

The release identity names this build: version, build number, and the commit
(or EAS build id) it came from.

### Actual

A frozen label, `gitCommit: "unknown"`, and a null Android version code.

### Closest E2E reproduction

The A03s gates; any bundle shows it.

## Observed facts

- `src/constants/releaseMetadata.json` holds `releaseLabel`, `buildMessage` and
  `gitCommit` literally. It has not changed since commit `36af0e9`
  ("Finalize SQLite cutover hardening").
- `src/utils/releaseMetadata.js` reads `androidVersionCode` from
  `Constants.expoConfig.android.versionCode`. `eas.json` sets
  `appVersionSource: "remote"` with `autoIncrement`, so EAS writes the version
  code into the native project at build time, not into the Expo config.
- `runtimeDiagnostics.js` already prefers `Application.nativeBuildVersion`,
  which is why `observed.application.build` is correct.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| Hand-maintained metadata plus a config field EAS never sets | Source and receipts | None | 85% | Not needed |

## Root cause

Static JSON identity and config-only build numbers omit remotely assigned native versions. Public metadata/export tests confirm the mechanism.

## Suggested fix

Use installed native build on the matching platform with config fallback, extra.gitCommit with unknown fallback, and derived version/build label and buildMessage. app.config captures EAS commit or synchronous local HEAD with timeout and null-on-failure; static JSON removed.

## Verification plan

- [x] Local public-interface regression tests passed (see first-sweep build-log entry for exact counts).
- [x] A03s check (2026-10-31): build number and label from the installed binary; commit pending the next EAS build.

- [x] Unit test that the export uses the native build number.
- [ ] Check a bundle from the next build.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-10-30T16:45:07Z | Phone | First affected receipt | `dg:9be72255` |
| 2026-10-30T23:30:00Z | Claude | Report recorded | First registry sweep; source traced |
| 2026-10-31T02:06:37Z | Codex | Fixed in code; locally tested | Issue #127; RED → GREEN evidence in build log; device checks pending |
| 2026-10-31T09:57:55Z | Claude | Partly device-checked | Profile reads "1.5.0 (Build 1)" and diagnostics receipt `6049e8f2` carries `releaseLabel` "1.5.0 (1)", `buildNumber` 1 (the debug APK is versionCode 1). `gitCommit` was still "unknown": this debug APK has no dev client, so expo-constants reads the `assets/app.config` embedded at build time (built before this fix; verified by unzipping the APK), while Metro's manifest does carry the SHA. EAS embeds the config on the build server with `EAS_BUILD_GIT_COMMIT_HASH`; check on the next build |

## Open questions

- AppReleaseInfo displays native version/build, backend, device and update; it does not display buildMessage or releaseLabel.

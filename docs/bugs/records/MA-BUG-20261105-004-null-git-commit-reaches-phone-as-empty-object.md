---
record_version: 1
id: MA-BUG-20261105-004
title: A missing build commit would reach the phone as an empty object and be reported as the commit
classification: product_defect
subsystem: diagnostics-release-metadata

severity_score: 1
severity_band: S3
severity_components:
  user_impact: 0
  data_security_privacy: 1
  scope: 0
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: PROBABLE
delivery_state: NO_FIX_PROPOSED
verification_state: NOT_TESTED

root_cause_confidence_pct: 70
confidence_basis: The library code that turns null into an empty object is read at a line; no build was run with git unavailable and no phone has shown it. EAS builds set the commit.

created_at_utc: 2026-11-05T17:25:14Z
updated_at_utc: 2026-11-05T17:25:14Z
first_observed_at: unknown
last_observed_at: unknown

known_occurrences: 1
known_affected_users: 0
affected_user_ids: []
exposure_denominator: builds made where git is unavailable and EAS_BUILD_GIT_COMMIT_HASH is unset; none known
exposure_window: since app.config.js carries extra.gitCommit

environment: unknown
affected_releases: []
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
github_issues: []

data_safety_status: no data risk; misleading diagnostics only
workaround_status: EAS builds set EAS_BUILD_GIT_COMMIT_HASH, so field builds are unaffected
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261105-004 — A missing build commit would reach the phone as an empty object and be reported as the commit

## User-visible symptom

None. Found by Claude while reviewing PR #167's release identity. A diagnostic bundle or support export could carry `gitCommit: {}` instead of "unknown".

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** Operator identification of the exact build.
- **Known affected users:** 0.
- **Relevant exposed population:** Builds made without git or the EAS commit variable.
- **Workaround:** Field builds run on EAS, which sets the hash.

## Data-safety assessment

- **UI visibility:** Not shown on the card (PR #167 reads by type).
- **Durable local SQLite rows:** Not involved.
- **Backend rows and relationships:** Support bundles would carry the odd value.
- **sync_outbox status, error_class/error_code:** Not involved.
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Not applicable.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Claude, code reading | Claude | 2026-11-05 | 2026-11-05T17:25:14Z | main `a8f5db2a`; PR #167 head `e9a4360d` | none | n/a | File and line references below |

## Reproduction

### Reporter steps

1. Evaluate the config with git unavailable and no `EAS_BUILD_GIT_COMMIT_HASH`.
2. Open Profile → Send diagnostics.

### Expected

The commit reads `unknown`.

### Actual

Not run. Per the code, the commit would be `{}`.

### Closest E2E reproduction

Not attempted.

## Observed facts

- `app.config.js:8-17`: `gitCommit()` returns `null` when git fails and the EAS variable is unset.
- `node_modules/@expo/config/build/Serialize.js:14-30` (`serializeAndEvaluate`): a `null` has `typeof` `'object'`, so it falls to the object branch (line 22-29) and returns `{}`. `serializeSkippingMods` (:34-47) calls it for each top-level key, and `evalConfig.js:169-171` applies it to the config.
- `src/utils/releaseMetadata.js:32` on main: `gitCommit: fallback(extra.gitCommit)`; `fallback` only replaces `undefined`, `null` and `''`, so `{}` passes.
- PR #167 (`e9a4360d`): `buildReleaseIdentity` uses `text(extra.gitCommit)` (a string check, line 71), which is safe, but `getReleaseMetadata()` (line 111) still returns `fallback(extra.gitCommit)`.
- Consumers of `getReleaseMetadata().gitCommit`: `src/db/debugDump.js:243`, `src/utils/debugExport.js:45`, `src/utils/runtimeDiagnostics.js:28/43` (`present(release.gitCommit)`). All would carry `{}`. So #167 does not cover every consumer.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| `{}` reaches the phone when the commit is null | Serialize.js reads as above | Not run | 70% | Evaluate the config with git hidden and print `extra.gitCommit` |

## Root cause

Probable: Expo's config serializer turns `null` into `{}`; `gitCommit()` returns `null` instead of `undefined`.

## Suggested fix

No fix proposed. A direction for later: return `undefined` from `gitCommit()`, and make `getReleaseMetadata()` use the same string check as the identity code.

## Verification plan

- [ ] Evaluate the config without git and without the EAS variable; read `extra.gitCommit`.
- [ ] Add a test over `getReleaseMetadata()` with `gitCommit: {}`.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-05T17:25:14Z | Claude | Report recorded | Code read at main a8f5db2a and e9a4360d |

## Open questions

- Is any local or CI build run where git is missing?

---
record_version: 1
id: MA-BUG-20261106-001
title: A phone reopened days after its login lapsed reports every history download as failing, though none had been tried since
classification: observability_noise
subsystem: history-pull-and-incident-observer

severity_score: 1
severity_band: S3
severity_components:
  user_impact: 0
  data_security_privacy: 1
  scope: 0
  recoverability: 0
severity_override: none
priority: P2

diagnosis_state: PROBABLE
delivery_state: NO_FIX_PROPOSED
verification_state: NOT_TESTED

root_cause_confidence_pct: 70
confidence_basis: The phone's own log shows every history walk ending in 1-3 ms with AuthUnavailableError, stored as failureKind=query, at 2026-10-31T08:18:49Z, and no walk again until the observer reported those markers at 2026-11-03T04:13:00.8Z; source shows AuthUnavailableError carries no code (so classifyPullFailureKind calls it query) and the observer checks only the marker's age; not reproduced.

created_at_utc: 2026-11-06T20:10:00Z
updated_at_utc: 2026-11-06T20:10:00Z
first_observed_at: 2026-10-31T08:18:49.569Z
last_observed_at: 2026-11-03T04:21:43.757Z

known_occurrences: 5
known_affected_users: 1 (test)
affected_user_ids:
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef
exposure_denominator: unknown
exposure_window: 2026-10-31 to 2026-11-06 (receipt sweep snapshot 2026-11-06T19:42:48.650568+00:00)

environment: sqlite-staging (masi-app-sqlite)
affected_releases:
  - 1.5.0 (26) iOS, releaseLabel sqlite-critical-hardening, embedded update b90c0b70-7796-4030-b2fc-4155e8548eee
affected_devices:
  - iPhone 13 (iPhone14,5)
affected_os_versions:
  - iOS 26.3.1
repositories:
  - masi-app

sentry_issue_ids: []
sentry_event_ids: []
field_report_ids: []
support_incident_keys:
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef/pull_failing/79d70a96-a6ea-485a-afed-7f8a57610bd6:0dca4e9f-ac3e-53c4-b1ed-092b1d64e8ae
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef/pull_failing/79d70a96-a6ea-485a-afed-7f8a57610bd6:f5ff225c-4d3f-5b22-bf52-8004bd0a2a83
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef/pull_failing/79d70a96-a6ea-485a-afed-7f8a57610bd6:a6c732ba-d62d-50da-a6bf-fb603334d035
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef/pull_failing/79d70a96-a6ea-485a-afed-7f8a57610bd6:9529ff44-0b4d-5487-83f5-64bb4f4ee4bb
  - 1b1953c3-063e-4d89-8b07-5e55c970cfef/pull_failing/79d70a96-a6ea-485a-afed-7f8a57610bd6:17084d8b-eb5e-553e-b3e0-4e1aa200fc89
support_incident_signatures: []
evidence_paths:
  - docs/bugs/evidence/MA-BUG-20261106-001/pf-3e13b3ef-bundle-log-excerpt.txt
  - src/services/historyWalk.js
  - src/services/preloadedChildData.js
  - src/session/staleActor.js
  - src/services/supportIncidents.js
github_issues:
  - https://github.com/JimMcKeown17/masi-app/issues/120

data_safety_status: no data at risk seen; the phone held no unsent or refused rows (failedOutboxRows 0), and only history downloads were delayed while the phone was signed out
workaround_status: none needed; the markers clear on the next successful history download
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261106-001 — A phone reopened days after its login lapsed reports every history download as failing, though none had been tried since

## User-visible symptom

No one reported a symptom; these are automatic receipts from a test account's iPhone 13.
The receipts say four history downloads (past lessons, assessments, test runs and letter
progress) had been failing for about 68 hours. The phone's own log shows that none of those
downloads had been attempted in those 68 hours: each failed once, in 2 ms, because the phone
had no usable login yet, and the phone was not used again until it reported them.

Possible EA-visible effect, not observed: the Sync status screen labels a history scope with a
failure marker "Incomplete since <time>" (`src/utils/syncStatusPresenter.js`), so it would have
read "Incomplete since 31 Oct" until the next successful download.

## Operational impact

- **Can the user continue?** Yes. Nothing was blocked once the account signed in again.
- **Core workflow affected:** Operator triage. Each such open produces one `pull_failing` receipt
  per history scope (four here), which reads like a server or query failure.
- **Known affected users:** One test account (`test@masinyusane.org`).
- **Relevant exposed population:** Any phone whose last open before a gap of 24 hours or more
  started with an expired login (an EA's phone over a weekend is the obvious case), from the
  November 2026 retest onward.
- **Workaround:** None needed.

## Data-safety assessment

- **UI visibility:** Not observed.
- **Durable local SQLite rows:** Not affected. The bundle's support export lists 0 failed or
  refused outbox rows.
- **Backend rows and relationships:** Not affected; the failed walks never reached the server.
- **sync_outbox status, error_class/error_code:** Empty of failures at capture. Uploads were
  skipped with "Sync skipped: no auth session" on 2026-10-31.
- **Incident queue evidence:** Seven receipts in five conditions (Occurrences). One bundle,
  captured at 2026-11-03T04:13:00.845Z.
- **Eventual convergence evidence:** Probable, not proven. Three scopes (assessments, test runs,
  letter progress) were never re-observed after their first receipts at 04:13; the observer ran
  again at 04:20:44 and refreshed only the session-history condition. That scope failed once more
  at 04:20:45 with "Network request failed" and was last seen failing at 04:21:43. The phone was
  online and delivering receipts at 16:14:59 the same day, and the observer runs on every sync
  status read, yet the 2026-11-05 resends still carry 04:21:43 as last seen. No bundle or log
  after 04:13 exists to confirm a successful download.
- **Duplication, misattribution, or cross-account risk:** None seen.

## Occurrences

All from `test@masinyusane.org` (`1b1953c3-063e-4d89-8b07-5e55c970cfef`), install
`79d70a96-a6ea-485a-afed-7f8a57610bd6`, iPhone 13, iOS 26.3.1, observed on 1.5.0 (26).
The 2026-11-05 resends were delivered by build 28 (1.5.0 (28)) after the phone updated; their
observations are still from build 26.

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | `pf:3e13b3ef`, session history, failureKind `query`, receipts `58a8b762` (gen 1) and `e4182615` (gen 2) | Test | 2026-11-03T04:13:00.819Z to 04:20:44.617Z | 2026-11-03T04:13:14Z; 2026-11-05T12:34:50Z | 1.5.0 (26), sqlite-staging | iPhone 13, iOS 26.3.1 | Wi-Fi | Bundle `9e98a139…`, excerpt in evidence |
| R2 | `pf:6c15db96`, assessment history, `query`, receipt `97b870d3` | Test | 2026-11-03T04:13:00.823Z | 2026-11-03T04:13:16Z | 1.5.0 (26) | iPhone 13 | Wi-Fi | Payload only |
| R3 | `pf:c97acb6b`, test-run (battery run) history, `query`, receipt `9d8b47f9` | Test | 2026-11-03T04:13:00.831Z | 2026-11-03T04:13:17Z | 1.5.0 (26) | iPhone 13 | Wi-Fi | Payload only |
| R4 | `pf:a551b045`, letter progress, `query`, receipt `8c8f4f7a` | Test | 2026-11-03T04:13:00.833Z | 2026-11-03T04:13:19Z | 1.5.0 (26) | iPhone 13 | Wi-Fi | Payload only |
| R5 | `pf:7166e70f`, session history, failureKind `transport`, receipts `165c25c6` (gen 1) and `376c5d03` (gen 2) | Test | 2026-11-03T04:20:45.933Z to 04:21:43.757Z | 2026-11-03T16:15:00Z; 2026-11-05T12:34:52Z | 1.5.0 (26) | iPhone 13 | Wi-Fi | Payload only |

Every payload carries the same failure marker: `lastFailureAt` 2026-10-31T08:18:49.569–.599Z,
`lastFailureMessage` "AuthUnavailableError: auth unavailable" (R5: "TypeError: Network request
failed"), `failingForHours` 67.9–68.0, cursor `complete: true`, `deltaComplete: true`.

Evidence: `docs/bugs/evidence/MA-BUG-20261106-001/pf-3e13b3ef-bundle-log-excerpt.txt`, SHA-256
`3799d8a2ccb17f64cedecb3c5823a30a8800a1da2cccc8bbc58b098fca24cfa5`, a safe excerpt (stack frames
and app paths removed) of bundle `9e98a139-e160-4086-9c5c-da6fb965a9d8`, original SHA-256
`c604aa5d75b6afa6042c235c9734f58896ce0f2a68f9070fcb7a44c5e057cfd9`, kept unchanged in gitignored
`docs/bugs/user-submissions-bundles/pf:3e13b3ef/`.

## Reproduction

### Reporter steps

1. Not reported by a person. From the phone's log: cold-start the app after the saved access
   token has expired; the history downloads start before a fresh token exists.
2. The token refresh then fails (here, "Invalid Refresh Token: Refresh Token Not Found") and the
   phone is not used for more than 24 hours.
3. Sign in and open the app.

### Expected

History downloads retry; a `pull_failing` receipt is sent only if downloads keep failing.

### Actual

At open, before any download runs, the phone sends one `pull_failing` receipt per history scope
saying it has failed for about 68 hours.

### Closest E2E reproduction

Not attempted. A faithful run needs a signed-in phone, an expired access token, a cold start, and
a gap of more than 24 hours (or a moved clock) before the next open.

## Observed facts

- Bundle log, 2026-10-31T08:18:49Z cold start: profile, reference data, schools, job titles and
  classes all fail with `AuthUnavailableError`; the four history walks start and end within
  1-3 ms each (`rpcMs` 0-1) with `failureKind=query error="AuthUnavailableError: auth unavailable"`;
  uploads log "Sync skipped: no auth session". The same pattern repeats at 08:19:11.
- 08:23:22Z: "TypeError: Network request failed" and "AuthRetryableFetchError" (the token
  refresh could not reach the server). 08:23:23Z: "AuthApiError: Invalid Refresh Token: Refresh
  Token Not Found".
- Later launches: 2026-10-31T15:58:13Z ("Running main", nothing else logged) and
  2026-11-03T04:12:01Z. At 04:13:00.723Z the log shows "Requesting domain pull: reconnect"; the
  bundle was captured at 04:13:00.845Z with the four markers from 10-31 still set. No history walk
  appears between 2026-10-31T08:19:12Z and capture.
- `auth.sessions` (read-only, 2026-11-06): a new Test session was created at 2026-11-03 04:13 with
  user agent `Masi/28 CFNetwork/3860.400.51`, last refreshed 2026-11-05 12:34 (the time of the
  build-28 resends). The account signed in again on 11-03 rather than renewing the 10-31 session.
  `auth.audit_log_entries` holds 0 rows, so why the old refresh token was not found is
  unavailable from the server.
- Source (`origin/main` `ba148296`):
  - `src/session/staleActor.js`: `AuthUnavailableError` has `code = ''`; its comment says it is
    reported "as the existing codeless network error so the row stays retriable".
  - `src/services/preloadedChildData.js` `classifyPullFailureKind`: anything that is not a
    recognised network error is `query`. "AuthUnavailableError: auth unavailable" matches none of
    the network patterns, so the history walk stores `lastFailureKind: 'query'`.
  - `src/services/historyWalk.js`: a failed run keeps the first failure since success
    (`lastFailureAt: state.lastFailureAt ?? wallIso()`); a successful page clears it.
  - `src/services/supportIncidents.js` `observeStandingConditions`: reports `pull_failing` when
    `lastFailureAt` is at least 24 hours old with no later `lastSuccessAt`. History cursors carry
    no `lastSuccessAt` field, so in practice the test is the marker's age alone. It runs from
    `getSyncStatus` (`src/services/offlineSync.js`), which can come before the first download of
    a new session.
- The build log entry of 2026-11-05 ("First-sweep fixes released") already noted "7
  `pull_failing` receipts from builds 26 and 28 since 2026-11-03". The 7 receipts are the five
  conditions above; build 28 only delivered the two resends.
- Sentry: unavailable. This session had no read-only Sentry connector.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| H1. The receipts report stale failure markers: a "no login yet" stop was stored as a `query` failure, nothing retried during a 68-hour gap, and the observer reported the markers at open, before the walks could run | Log timings; 2 ms walks with `rpcMs` 0-1; source paths above; capture at 04:13:00.8Z before any walk | No reproduction | 70% | Reproduce on a test phone: expire the token, cold start, wait more than 24 h (or move the clock), open, and read the receipts and the log order |
| H2. The history queries really failed on the server | Receipt text says `failureKind: query` | Walks ended in 1-3 ms with `rpcMs` 0-1, so no request reached the server; every message is AuthUnavailableError | 5% | None needed unless a receipt shows a real PostgREST code |
| H3. The phone stayed failing after 11-03 | The 2026-11-05 resends exist | They carry 11-03 observations only; three scopes were never re-observed; the phone was online at 16:14 on 11-03 without a newer observation | 10% | Recheck in the next full sweep for a new generation from install `79d70a96…` |

Contributing, separate question: the session was lost on 2026-10-31 ("Refresh Token Not Found").
That is why no walk succeeded that day, but it is not why the receipts misreport. If it recurs it
deserves its own record.

## Root cause

Probable chain, not reproduced:

1. On a cold start with an expired access token, the history walks run before a fresh token
   exists. The data client throws `AuthUnavailableError`, which the walk classifies as a `query`
   failure and stores as the first failure since success.
2. Here the refresh then failed for good ("Refresh Token Not Found"), the phone was not used
   again, and the account signed in afresh 68 hours later.
3. At that open, `observeStandingConditions` found markers more than 24 hours old and queued a
   `pull_failing` receipt for each history scope before any walk ran.

The same misclassification is issue #120's subject (startup refreshes logging
`AuthUnavailableError` as an error); #120 does not yet mention the history walks or the observer.

## Suggested fix

No fix proposed. Directions to weigh later, separately from approval:

- Treat `AuthUnavailableError` in the history walk as "waiting for login", not a failure marker
  (in line with #120 option A).
- Have the observer require at least one failed attempt in the current app session, or a failure
  marker newer than the last app open, before reporting `pull_failing`.

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
| 2026-10-31T08:18:49Z | Phone | History walks stop with AuthUnavailableError, stored as `query` | Bundle log |
| 2026-10-31T08:23:23Z | Phone | Token refresh refused: "Refresh Token Not Found" | Bundle log |
| 2026-11-03T04:13:00Z | Phone | Four `pull_failing` conditions observed at open; bundle captured | Receipts `58a8b762`, `97b870d3`, `9d8b47f9`, `8c8f4f7a` |
| 2026-11-03T04:20:45Z | Phone | Session history fails once more ("Network request failed") | `pf:7166e70f` |
| 2026-11-05T12:34:50Z | Phone | Two resends delivered by build 28 | Receipts `e4182615`, `376c5d03` |
| 2026-11-06T20:10:00Z | Claude | Recorded from the full receipt sweep (snapshot 2026-11-06T19:42:48.650568+00:00) | Bundle fetched (`--fetch pf:3e13b3ef`, downloaded); resolve inapplicable (not a record-bearing kind); Sentry unavailable |

## Open questions

- Does the same stale report happen on an ordinary weekend gap, where the login renews
  normally? That decides whether this is a test-phone oddity or a weekly source of noise in the
  retest.
- Why was the iPhone 13's refresh token not found on 2026-10-31? The auth audit log is empty;
  the next check is the Supabase Auth logs for 2026-10-31 08:00–08:30 UTC.

---
record_version: 1
id: MA-BUG-20261101-008
title: "A delayed older tracker save can replace a newer owed correction after history repair and Retry"
classification: product_defect
subsystem: mastery-correction-slot

severity_score: 2
severity_band: S3
severity_components:
  user_impact: 1
  data_security_privacy: 1
  scope: 0
  recoverability: 0
severity_override: none
priority: P3

diagnosis_state: CONFIRMED
delivery_state: FIX_PROPOSED
verification_state: NOT_TESTED

root_cause_confidence_pct: 90
confidence_basis: "Real-SQLite reproductions through the production repository, sync engine, retryFailedItem, saveHistoryPage and handover cleanup lose the newer correction at the repository for letter and skill ticks; reading the owed slot by record id and guarding with its payload time closes both variants for skill ticks."

created_at_utc: 2026-11-01T18:00:00Z
updated_at_utc: 2026-11-01T19:00:00Z
first_observed_at: 2026-11-01T17:30:00Z
last_observed_at: 2026-11-01T17:30:00Z

known_occurrences: 2
known_affected_users: 0
affected_user_ids: []
exposure_denominator: no field exposure known; found by code review, never reported from a phone
exposure_window: letter_mastery since the letter tracker correction slot shipped on main; skill_mastery only on feat/numeracy-skill-mastery before its fix

environment: local tests (real SQLite, mocked transport)
affected_releases:
  - main at 297dbad3 (letter_mastery)
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

data_safety_status: latent at the repository; today's letter callers are protected by lessonSave's getCorrectionTimes pre-filter; never observed in the field
workaround_status: the EA can re-make the newer correction once the tick is visible
owner: unassigned
duplicate_of: none
possible_duplicate_of: []
---

# MA-BUG-20261101-008 — A delayed older tracker save can replace a newer owed correction after history repair and Retry

## User-visible symptom

No reporter. Found by the post-build Codex adversarial review of numeracy Track B
(round 2). An EA's later un-tick (letter tracker or maths step) can silently vanish
before it reaches the server, and an older tick becomes the final state.

## Operational impact

- **Can the user continue?** Yes.
- **Core workflow affected:** Letter tracker and lesson saves that carry a tap time; maths ticks once Tracks C/D call `setSkillMastery`.
- **Known affected users:** None known.
- **Relevant exposed population:** Phones whose tracker correction was refused terminally (42501), then retried.
- **Workaround:** Re-make the correction.

## Data-safety assessment

- **UI visibility:** The tracker shows the older accepted tick after history repair.
- **Durable local SQLite rows:** The newer correction's outbox payload is overwritten by the older save.
- **Backend rows and relationships:** The server never receives the newer correction.
- **sync_outbox status, error_class/error_code:** The slot moves from `failed` (newer payload) to `pending` (older payload).
- **Incident queue evidence:** None.
- **Eventual convergence evidence:** Converges on the older tick.
- **Duplication, misattribution, or cross-account risk:** None.

## Occurrences

| Report | Source | Reporter/user | Observed time | Received time | Release/environment | Device/OS | Network | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Codex adversarial review, confirmed by Claude | None (code review) | 2026-11-01T17:30:00Z | 2026-11-01T17:30:00Z | feat/numeracy-skill-mastery fb154dfe; main 297dbad3 for letters | None | None | `__tests__/skillMasteryCorrectionSync.test.js` regression; throwaway letter probe (same steps, not committed) |
| R2 | Codex adversarial review round 2, confirmed by Claude | None (code review) | 2026-11-01T18:45:00Z | 2026-11-01T18:45:00Z | feat/numeracy-skill-mastery 5ed5eff8 | None | None | `__tests__/skillMasteryCorrectionSync.test.js` "the owed correction still guards the slot after handover deleted its repaired row" |

## Reproduction

### Reporter steps

1. Tuesday: un-tick a step or letter (pending slot, payload dated Tuesday).
2. Sync refuses it terminally (42501).
3. A history page repairs the row to Monday morning's accepted tick; the terminal outbox keeps Tuesday's payload.
4. Retry, then a transport failure: the slot is `failed`, the row still says Monday morning.
5. Save a delayed Monday-afternoon tick (for example a lesson save with `changedAt: change.madeAt`).

### Expected

The older save is kept back; Tuesday's un-tick stays owed.

### Actual

The older save replaces the slot; Tuesday's correction id never reaches the server.

### Closest E2E reproduction

Real SQLite with the production repositories and sync engine, transport mocked.

## Observed facts

- `setSkillMastery` and `setLetterMastery` guarded the slot with `existing.changed_at` from the row (`skillMasteryRepository.js:134` before the fix; `masteryRepository.js:134` on main).
- `saveHistoryPage` repairs `terminal` rows, and `retryFailedItem` re-owes a terminal slot without restoring the row.
- `getCorrectionTimes` and `getSkillCorrectionTimes` already include outbox payloads for exactly this divergence; the setter guard did not.
- R2 variant: after history repair, handover cleanup (`deleteUndeliveredSkillMastery`) deletes the synced row while its terminal slot remains (documented behaviour). After reassignment and Retry, the slot is owed with no row; the guard joined the outbox through the row, saw no slot, and the older save replaced it.
- Today's letter callers do not reach this: `lessonSave` skips any tap older than `getCorrectionTimes`, which unions every outbox payload regardless of status or row presence, and `LetterMasteryPanel` saves with now. The repository guard is the second line of defence. Maths callers (Tracks C/D) should mirror the lessonSave pre-filter with `getSkillCorrectionTimes`.

## Hypotheses

| Hypothesis | Evidence for | Evidence against | Confidence | Next discriminating check |
| --- | --- | --- | ---: | --- |
| The older-save guard reads the displayed row instead of the owed payload | RED regression; letter probe loses the correction; guard fix makes it GREEN | None | 90% | Apply the same fix to `masteryRepository` with a mirrored regression |

## Root cause

History repair can make the displayed row older than the correction still owed in
`sync_outbox`. The setter's older-save guard compared the new save only against the
row's `changed_at`, so the owed newer payload was not protected.

## Suggested fix

Read the owed slot by the deterministic record id (not through the row), select
`json_extract(o.payload, '$.changed_at')`, and guard with the later of the row time and
the owed payload time (same clamp to now); return null when the guard keeps a slot that
has no row. Applied to `skillMasteryRepository` on `feat/numeracy-skill-mastery`
(post-build review rounds 1 and 2). The
identical change to `masteryRepository` (letters) is proposed, not applied: it needs
Jim's go-ahead and a mirrored regression in `letterMasteryCorrectionSync.test.js`.

## Verification plan

- [x] Add a regression test that fails for the demonstrated mechanism (skill).
- [x] Verify the targeted correction locally (skill).
- [ ] Apply and verify the letter fix.
- [ ] Identify the exact release/build containing both fixes.

## Timeline

| Time UTC | Actor | Event | Evidence or decision |
| --- | --- | --- | --- |
| 2026-11-01T17:30:00Z | Codex | Finding raised in the Track B round 2 adversarial review | High severity |
| 2026-11-01T18:00:00Z | Claude | Reproduced for skill and letter ticks; skill guard fixed with regression | Letter fix deferred to Jim |
| 2026-11-01T18:45:00Z | Codex | Round 2 raised the row-deleted-by-handover variant | High at the repository |
| 2026-11-01T19:00:00Z | Claude | Reproduced; skill guard now reads the slot by record id; severity lowered after finding lessonSave's caller pre-filter | S3, P3 |

## Open questions

- Should the letter fix ship on its own branch before the numeracy merge?

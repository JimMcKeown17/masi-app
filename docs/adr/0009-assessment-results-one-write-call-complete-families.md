---
status: accepted
date: 2026-10-20
---

# Assessment results are written through one type-agnostic call, as complete families

A Question result is one saved fact: its `assessments` parent and the complete set of
`assessment_items`. Sending those rows independently can expose a partial family as an apparently
real low score, split it at a queue limit, or acknowledge the parent while some answers remain
unsent. Standalone tests and WelaPLUS Questions also need to feed the same readers: the entry
point does not change what a letter result measures.

We use one authenticated write boundary, `submit_assessment(p_assessment, p_items)`, for every
Question result. A standalone result has a null `battery_run_id`; a battery Question has a run id.
Both retain `question_code`, `question_version`, `item_set_id`, language, stop reason, raw score,
item count, duration and derived data, with prompts, correctness and metadata stored on items.
Skipped Questions retain the same required identity with zero items. Readers select by Question
code, not by Battery or the legacy assessment type: `letter_sounds` includes standalone Letter
Sounds and WelaPLUS Q1. Raw score presentation follows [ADR-0003](./0003-assessment-score-bands.md).

## Considered options

- **Independent parent/item upserts.** Rejected: retries and ready-row limits can leave incomplete
  evidence visible, and generic batch fallback permits partial success.
- **A bundle RPC alongside direct EA writes.** Rejected: a second insertion path can still create
  incomplete families. The RPC must be the exclusive authenticated write boundary.
- **Separate standalone and battery result formats.** Rejected: readers would need parallel
  evidence rules for the same test and could silently omit battery results.
- **One immutable family and one type-agnostic call** (chosen). The server validates the shape
  without a hard-coded list of Questions; item-set version and stored items preserve meaning.

## Consequences

- `saveQuestionResult` validates with `assertSubmitShape` inside the save transaction, persists
  parent/items and enqueues one `assessments:<id>:insert` row containing all of them. Duplicate local
  ids and duplicate run/Question decisions are refused. Items never have their own outbox rows.
- Dispatch validates and splits the claimed payload through `toSubmitArgs`, applies shared server
  column allowlists, and omits `updated_at`. It does not reconstruct the family from a later domain
  read or send partial item batches. A malformed local family becomes terminal `22023` without a
  network call.
- The server inserts the whole family atomically and revokes direct authenticated INSERT, UPDATE
  and DELETE on assessments/items. This enforces [ADR-0007](./0007-submitted-assessments-are-immutable.md)
  while retaining `assessmentItemDomainId`. ADR-0007's earlier per-row insert-or-ignore transport
  and `saveAssessment` implementation are superseded by this family RPC and `saveQuestionResult`.
- `inserted` and `already_present` are the only successful assessment acknowledgements. Existing
  ids confirm owner, child, programme, run, Question, item-set identity and the exact item-id set
  before checking current assignment authority; mismatches raise `MA001`. Retries never edit
  saved marks. This check is not a deep comparison of every payload field. A second result id for
  the same run/Question raises `23505`, which is always a failure.
- Local acknowledgement deletes only the still-current claimed outbox row, then, when no other
  outbox row remains for that assessment, marks parent and items synced in one SQLite transaction.
  Failure after deletion rolls everything back. Lost acknowledgements can be retried safely.
- `save_battery_run(p_run)` is the exclusive authenticated run write boundary. Runs precede linked
  families in push order; standalone results have no run dependency. Headers use stored start time
  unchanged, matching immutable identity and forward-only status (`in_progress` to `completed` or
  `abandoned`). Success is `inserted`, `updated` or `unchanged`; conflicting terminal replay is
  `MA002`. The local insert slot coalesces writes until acknowledged, then later writes use update.
- `MA001`, `MA002`, `22023` and unknown RPC acknowledgements are terminal; `28000` is retriable.
  The existing pending-parent/grant rules still govern `23503`/`42501`. These immutable families
  and forward-only runs do not use send-time row versions.
- Server triggers own change timestamps. Assessment and run RPC payloads never send `updated_at`;
  local outbox timestamps still serve queue order and acknowledgement fencing. Capture time and
  server change time are different facts.
- No assessment/run history pull ships in Plan 1. Plan 3 owns its authorization and hydration;
  mastery-confirmation re-keying remains Plan 2. Existing SELECT policies are not proof of that
  future history scope. Local v15 clears obsolete practice families before the new writer runs.

Implementation and evidence: [contract map](../../documentation/rls-sync-contract-map.md),
[Assessment Results design](../superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md)
and [build log](../../documentation/build-log.md). Tasks 1–12 implement the phone/upload contract;
the controller reports disposable-PG17 validation. Hosted migration, practice-data wipe, builds and
device gates remain Task 14 with Jim's approval.

Revisit if submitted answers become mutable, Questions need streaming/partial submission, or a new
privileged writer needs to add evidence after submission. Such work must define its atomic boundary
and audit behavior explicitly rather than reopen direct EA writes.

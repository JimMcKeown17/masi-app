---
name: bug-user
description: Standardize one or many Masi bug reports that a human described, from Masi field staff/EAs, messages, screenshots, recordings, Profile Share logs, Profile Share database exports, Sentry issues or events, and user descriptions. Use when the user says they have a bug or several bugs to report; reports a crash, error, freeze, missing or duplicated data, login/sync problem, confusing or unexpected behavior; supplies diagnostic artifacts; or asks to record, deduplicate, triage, investigate, diagnose, update, or close an existing bug. Use bug-sync instead when the starting evidence is a sync incident receipt reported automatically by a phone. Default to documentation and read-only investigation. Do not implement fixes or mutate Sentry, Auth, databases, user data, builds, releases, or production unless the user explicitly requests that separate action.
---

# Bug intake and triage: human-reported channel

Turn incomplete field reports into durable, evidence-led bug records without
losing occurrences or interfering with active implementation work.

This is the **human-reported** intake channel. A person describing a symptom
starts here. Machine-emitted phone incident receipts start in `bug-sync`, which
shares this registry and every schema in `docs/bugs/README.md`. Both channels
write the same records; only their intake differs.

## Establish the boundary

1. Locate the `masi-app` repository root via `git rev-parse --show-toplevel`
   and verify the remote is `JimMcKeown17/masi-app`; worktree folder names may
   differ. Read `AGENTS.md`, `CONTEXT.md`, and the task-specific context. Stop
   and explain if
   `docs/bugs/README.md` and `docs/bugs/_template.md` are not present.
2. `git fetch origin`, then read `docs/bugs/` from **`origin/main`** (or a
   worktree created from it), not from whichever feature branch the current
   checkout happens to be on. Create an intake branch from `origin/main`,
   preserving unrelated work and the user's branch/worktree boundaries. Include
   additional `MA-BUG-*` allocations on known local branches in the scan to
   avoid collisions; `origin/main` remains canonical. If fetch fails, report
   the blocker before allocating. The canonical skill file is
   `.agents/skills/bug-user/SKILL.md`; `.claude/skills/bug-user` is a symlink.
3. Read both registry files completely before processing reports. Treat their
   schemas, severity scoring, confidence rubric, privacy rules, and ID
   allocation as authoritative.
4. Inspect current workspace changes before writing. Preserve every unrelated
   change and never overwrite an existing bug record or registry row.
5. Announce the active mode:
   - `RECORD_AND_TRIAGE` by default;
   - `READ_ONLY_DIAGNOSIS` when the user asks to figure out the cause; or
   - `FIX` only when the user explicitly asks to implement a correction.
6. Treat "figure this out," "investigate," and "diagnose" as read-only. They do
   not authorize source edits, Sentry state changes, database/Auth/data writes,
   reseeding, builds, deploys, releases, or repairs. After writing records they
   *do* require a commit of `docs/bugs/` and a request to merge/push that
   commit to `origin/main`, unless existing authorization already covers it.
   If filesystem permissions block Git, leave reviewable changes and report
   the blocker; never retry through another path or work around it.

## Capture a batch before going deep

When the user supplies several reports:

1. Inventory every description and attachment first.
2. Give each occurrence a temporary label such as `Report A`, `Report B`, and
   `Report C` so nothing disappears during investigation.
3. Identify immediate safety signals before deduplication: alleged missing or
   overwritten data, duplication, cross-account visibility, credential
   exposure, crash loops, widespread login failure, database corruption, or a
   rapidly growing core-workflow failure.
4. If a critical signal exists, tell the user immediately, preserve that report
   first, and prioritize it. Do not claim the incident is confirmed merely
   because it receives P0 review.
5. Save all reports at least provisionally before conducting a long diagnosis
   of the first one.

Do not demand complete intake data before saving a report. Record `unknown` and
ask only the smallest number of questions that would materially change safety,
severity, deduplication, or the next diagnostic step.

## Inspect supplied evidence

For each artifact:

1. Inspect the actual image, video, or log; do not rely only on the filename or
   the reporter's interpretation.
2. Record the original filename, source, received time, observed time and
   timezone when available, app release/build, environment, device/OS, network
   state, exact EA Auth UUID when verified, and attempted workflow. Keep learner
   identities and other private details out of committed artifacts.
3. Preserve the reporter's words under the user-visible symptom. Put technical
   interpretation under facts, hypotheses, or root cause.
4. Link an exact Sentry event as well as the grouped issue when available.
   Never diagnose from the issue title or aggregate event count alone.
   When Sentry correlation is relevant and no exact event was supplied, prefer
   the connected read-only Sentry tools when present; record `unavailable`
   when absent, never a clean miss. Search events or issues with the exact
   UUID, error text, release, and a narrow time window, then retrieve an exact
   event before citing it. The connector owns its authentication. Never reuse
   any upload-scoped token, including `SENTRY_AUTH_TOKEN`, and never use a browser
   to expose a token. A clean search miss is useful negative evidence but does
   not prove that the device emitted no event.
5. Never create a permanent link to `/tmp`, a clipboard path, or another
   ephemeral location.
6. When the user asks to save a report, persist a supplied artifact only after
   inspecting it:
   - copy a safe, diagnostically useful artifact to
     `docs/bugs/evidence/<BUG-ID>/` using a sanitized filename;
   - record its SHA-256 digest and never move or delete the original;
   - do not copy credentials, tokens, passwords, learner PII, or unredacted
     Share database exports (including support JSON) into Git; keep private
     originals in gitignored `docs/bugs/user-submissions*/`, never force-add; and
   - when sensitivity is uncertain, save a redacted excerpt or metadata and ask
     for a stable controlled-storage link instead.

Do not advise uninstalling, clearing app storage, or recreating missing work
before evidence is preserved. Those actions may destroy the only diagnostic or
recoverable local copy.

## Deduplicate cautiously

1. Search the registry and all existing `docs/bugs/records/` files using exact
   Sentry IDs, error strings, user-visible symptoms, workflows, releases,
   devices, and known causal mechanisms.
2. Treat each supplied message or event as an occurrence; treat a bug record as
   one causal problem.
3. Append a new occurrence to an existing record only when the evidence makes
   that grouping more likely than not.
4. Do not merge reports solely because they mention the same screen, SQLite,
   syncing, or login.
5. If relatedness is plausible but uncertain, create a new provisional record
   and populate `possible_duplicate_of`.
6. When later evidence proves duplication, preserve both histories, mark the
   duplicate record with `classification: duplicate` and `duplicate_of`, and
   append its occurrence to the canonical record.

## Create or update records

For a new causal problem:

1. Re-scan `origin/main` and known unintegrated allocations for
   `docs/bugs/records/MA-BUG-YYYYMMDD-*.md` immediately before writing.
   Recheck ID uniqueness at integration: fetch-and-rescan is not an atomic lock.
2. Allocate the next unused daily sequence from `001` upward.
3. Create `docs/bugs/records/<BUG-ID>-<short-kebab-title>.md` from
   `docs/bugs/_template.md`.
4. Replace every placeholder that is known and retain explicit `unknown` values
   for everything else. Never invent facts, identifiers, timestamps, counts,
   denominators, releases, or environments.
5. Score all four severity components and record the arithmetic. Apply a
   critical override only under the documented conditions.
6. Set priority independently from severity.
7. Record root-cause confidence and its evidence basis. Confidence is in the
   causal mechanism, not in the existence of the symptom.
8. Add an append-only timeline entry.
9. Add or update exactly one row in the registry table in
   `docs/bugs/README.md` and link the detailed record.
10. Record channel provenance in `field_report_ids` so the occurrence is
    searchable as recorded, and refresh the Field reports row of the Coverage
    table in `docs/bugs/README.md`. A targeted follow-up updates Notes, not the
    Last full sweep date; retain unknown totals outside the inspected batch.
    Preserve existing `support_incident_keys`, `support_incident_signatures`,
    `sentry_issue_ids`, and `sentry_event_ids`: one record keeps all channels.
    Use YAML block lists for machine-read lists; only empty `[]` is allowed
    inline. Follow README ownership rules; prefer actor-qualified exact keys
    over signatures. Never declare a signature owned by another causal record.
11. When the report or verified evidence identifies an exact staff Auth UUID,
    append it to `affected_user_ids`. Never infer this join from a fuzzy name,
    school, email guess, or the numeric `known_affected_users` field. The UUID
    is for operational reconciliation after intake; it is not a substitute for
    the occurrence and does not imply current blockage or recovery.

For an existing bug, append the occurrence and timeline event, then update
frontmatter, counts, first/last observation, severity, priority, lifecycle
states, hypotheses, and confidence only where the new evidence justifies it.

## Investigate in read-only mode

When the user asks to figure out a report:

1. Correlate the exact user, timestamp, release, environment, device/runtime,
   breadcrumbs, stack, and backend or local record evidence. Do not stop at an
   error title.
2. Trace the actual source path and relevant contracts without editing source.
3. Reproduce the end-user journey as faithfully as safely possible when a
   non-mutating or disposable environment is available. Do not use a live
   user's device or data as a disposable fixture.
4. Separate direct observations, inferences, and open questions.
5. Maintain competing hypotheses with evidence for, evidence against, current
   confidence, and the next discriminating check.
6. For sync or missing-data reports, verify these separately:
   - UI visibility;
   - durable local SQLite rows;
   - `sync_outbox` status, `error_class`/`error_code`, retry and blocker state;
   - `support_incident_queue`, including generation, counts, and interval;
   - backend rows and required relationships; and
   - eventual convergence.
   Inspect Profile → Share logs and Profile → Share database support JSON
   directly. Verify the export actor before joining `recordRef` values.
   A support summary alone cannot establish the full local row state.
   Use `npm run bugs:incidents` (`scripts/read-support-incidents.cjs`, built
   separately) when available; otherwise record it as unavailable. For backend
   checks, read `.claude/skills/sqlite-staging-sql/SKILL.md` and use its read-only
   SQL runbook. Verify `masi-app-sqlite` (`segygjzpujphwvrubusm`); never use the
   legacy backend `jcqrlwetutnpuchjoyyd`. Check live schema rather than assuming
   migration files prove hosted state.
7. Distinguish a handled, retriable operational event from a crash, terminal
   failure, persistent permissions defect, or destructive data loss.
8. Describe root cause as a causal chain. A native function name, stack frame,
   error code, or thrown line alone is not a root cause.
9. Update the record after each material evidence change, not only at the end.

Diagnostic commands and tests may run when they are read-only with respect to
real users and production and do not disturb another agent's work. Report unit,
real-SQLite, disposable-database, hosted read-only, browser/device, and field
evidence as distinct proof levels.

## Handle an explicitly requested fix

Do not enter this section unless the user explicitly says to fix or implement.

1. Ensure the bug is recorded and the causal hypothesis is strong enough to
   justify a change. If it is not, continue diagnosis rather than coding a
   guess.
2. Update delivery state to `FIX_APPROVED` only when the user's authority is
   clear.
3. Re-check repository and worktree ownership and isolate implementation from
   unrelated agents and changes.
4. Follow `AGENTS.md`: branch for the fix, use its local TDD skill in vertical
   RED → GREEN slices, reproduce the actual user path, and obtain review.
   Follow its Codex-first implementation rule when Claude owns design/review.
   A fix request does not itself authorize builds, releases, or live data repair.
5. Track executable work via `gh` on `JimMcKeown17/masi-app`, link the issue in
   the record's `github_issues` block list, and log shipped work in
   `documentation/build-log.md`.
6. Keep `FIXED_IN_CODE`, `RELEASED`, and field verification separate. Never
   close the bug merely because local tests pass.

## Finish the turn

Return a compact batch summary containing:

- each bug ID and title;
- whether the report created a new record or updated an existing one;
- classification, severity score/band, priority, and known affected scope;
- diagnosis, delivery, and verification states;
- root-cause confidence and basis;
- evidence preserved, redacted, or deliberately not persisted;
- immediate safety or workaround guidance;
- what was inspected or reproduced;
- the most valuable remaining question or next diagnostic action; and
- explicit confirmation of any source, Sentry, database, Auth, build, release,
  deploy, merge, push, or production mutations. In normal intake this list
  should list only the documented file changes and any authorized Git actions.

Provide clickable absolute links to every created or updated bug record and to
the registry.

After writing or updating records, commit `docs/bugs/` (and any skill edits)
on the intake branch from `origin/main`. Recheck ID uniqueness and ask before
merging or pushing unless already authorized. If permissions block the commit,
report that it remains uncommitted and do not retry or work around the block.
Do not resolve Sentry issues or change live database/Auth/build state unless
the user explicitly requested that action.

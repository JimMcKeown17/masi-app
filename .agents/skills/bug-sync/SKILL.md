---
name: bug-sync
description: >-
  Sweep, triage, and investigate Masi automatic phone incident receipts in
  mobile_support_incidents. Use when the user asks what phones are reporting,
  whether receipts are recorded, requests a full sweep, names a condition
  handle or reporter, or investigates terminal uploads, stale backlog, pull
  failure, reconcile breakers, caught app errors or left-behind work. Use
  bug-user for human descriptions and ea_report intake. Default to bug
  documentation and read-only investigation; fixes, live writes and releases
  require explicit separate authorization.
---

# Phone incident intake and triage

Turn phone observations into evidence-led records in the existing Masi registry.
Read `docs/bugs/README.md` and `docs/bugs/_template.md` in full. They own record
fields, severity arithmetic, priority, confidence, lifecycle states, privacy and
ID allocation. Phone observation, reporting, bundle capture and Profile behaviour
described here match the integrated code (spec Revision 4.1 plus the plan's
binding rulings). Device verification is a separate gate: check the build log
before assuming a behaviour is proven on a phone. One record holds one causal
problem across channels. Do not make
a second registry or infer a cause from an error code alone.

## Establish the boundary and canonical registry

1. Locate the repo with `git rev-parse --show-toplevel`; verify its remote is
   `JimMcKeown17/masi-app`. Worktree folder names vary. Read `AGENTS.md`,
   `CONTEXT.md` and the relevant task context. Stop if the registry/template is
   absent.
2. Announce the mode: **SWEEP** by default (read receipts and record every
   unrecorded condition in `docs/bugs/`); **INVESTIGATE** for deeper read-only
   diagnosis; **FIX** only for explicit implementation authorization.
   Investigate/diagnose/figure-this-out does not authorize source edits, Sentry
   mutations, Auth/data/database writes, repairs, builds, deploys or releases.
3. `git fetch origin` before reading or allocating. Canonical registry authority
   is **origin/main**, not the current feature worktree. Preserve dirty work and
   named worktree boundaries; create an intake branch/worktree from fetched
   main when authorized and permitted. If fetch fails, report it before
   allocating. Scan known unintegrated `MA-BUG-*` allocations too, then rescan
   immediately before writing and again at integration: this is not a lock.
4. Verify both reader-source commit and registry commit. `--registry-ref`
   selects committed docs only; it does not update an old reader. Run the
   current reader from fetched main. A reviewed strictly-ahead registry branch
   may be selected explicitly; never silently substitute working files.
5. Canonical paths after installation are `.agents/skills/bug-sync/SKILL.md`
   and `.claude/skills/bug-sync` (a symlink, never an independent copy).
   Receipts have no reviewed/assigned/resolved columns. Never mutate them or
   weaken their SELECT-only support access for bookkeeping.

## Sweep before going deep

Check the real interface first (no database access):

```sh
node scripts/read-support-incidents.cjs --help
```

First sweep, with no invented previous boundary:

```sh
node scripts/read-support-incidents.cjs --registry-ref origin/main --json
```

Later full sweeps:

```sh
node scripts/read-support-incidents.cjs --registry-ref origin/main --review-since <previous-boundary-minus-10-minutes> --json
```

Use the provisioned Node 20 runtime (`PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`)
for these commands. Direct node keeps npm banners out of JSON. Save raw output
privately under gitignored `docs/bugs/user-submissions*/`, never commit it.

The reader runs **one unfiltered SQL statement**, joins `auth.users` and
`public.users`, and returns the complete receipt set as one JSON value. No
paging, `--limit`, `--actors`, `--key` or descriptor flags exist. Process bounds
or invalid/truncated JSON fail the read; they do not certify a partial sweep.
Coverage is exact for that statement snapshot only, not the fleet's health.
Only after a successful canonical unfiltered sweep and its registry work are
complete, store the exact `snapshotAt` boundary in README Coverage, with counts,
reader/registry commits and limits. Do not use a wall-clock finish time.

`--review-since` selects recorded conditions with any `received_at` strictly
after its argument; **all unrecorded conditions remain listed**, however old.
Subtract ten minutes from the previous boundary once, as the caller. Overlap
re-review is harmless; this is a bounded late-commit convention. An arbitrarily
long transaction can commit a receipt older than the overlap. This is not an
unlimited completeness guarantee or a new watermark service.

Inventory all conditions before investigating the first one. Inspect unrecorded
**ea_report** first (people waiting), route those to `/bug-user`, then handle
other unrecorded conditions, then recorded recurrences in the review window.
Save provisional records before a long diagnosis. Recorded is not reviewed,
diagnosed, fixed, released or recovered.

## Real CLI, output and handles

| Flag | Actual behavior |
|---|---|
| `--json` | JSON on stdout; diagnostics/validated project ref on stderr. |
| `--registry-ref <ref>` | Committed Git registry; default `origin/main`. An empty registry is valid; an invalid ref fails. |
| `--actor <id\|email>` | Exact reporter UUID or email display filter. |
| `--kind <kind>` | One of the ten kinds below; display filter. |
| `--since <ISO>` | Display conditions with any receipt received at or after this time. |
| `--review-since <ISO>` | Recorded recurrence selection; not a coverage filter. |
| `--fetch <handle>` | Latest bundle-bearing receipt and its companion screenshot. |
| `--resolve <handle>` | Fixed-table SELECT by `serverRecordId`; existence only. |
| `--help` | Help without credentials or database access. |

Time arguments require an ISO timestamp with timezone. Unknown, duplicate or
malformed flags fail. `--actor`, `--kind`, `--since`, `--fetch` and `--resolve`
runs never advance **Last full sweep**. A targeted run can find a handle even
when display filters hide its condition.

Exit **0** = successful read (a fetch may be `unavailable` when no bundle exists);
**1** = failed/unsupported operation, including failed downloads or
`indeterminate`/`unsupported` resolve; **2** = contested registry ownership
(including signatures). Exit 2 aborts coverage even with an exact match or empty
display. Fix the declarations before claiming a complete sweep. Check both exit
status and `coverage.complete`, plus `fetch`/`resolve` outcomes.

JSON includes `snapshotAt`, raw `receipts`, `receiptCount`, `conditionCount`,
`coverage`, `registryRef`, `registryCommit`, `reviewSince`, `breadthByEA` and
displayed `conditions`. Each condition has `key`, `handle`, `kind`, `reporterId`,
`ea`, `receiptCount`, `firstSeenAt`, `latestSeenAt`, receipt times,
`latestOccurrenceCount`, `observed`, `firstObserved`, `delivery`, distinct
`releases`/`devices`, `bundles`, `latestPayload`, `recordedBy`, `receipts` and
`reviewRequired`. Count unrecorded conditions by `recordedBy === null`, not
receipt rows. Displayed conditions can omit recorded items outside the review
window; total conditions and raw receipts still cover the full snapshot.

Identity is `<reporter_id>/<kind>/<repeat_key>` including the wire install
prefix. Receipts group by that identity. Latest means maximum `(received_at,
id)`, preserving PostgreSQL timestamp precision, not highest generation.
Schema-1 rows have null new provenance/count/time fields; never fill them with
the upgrading or delivery release. Occurrence counts are observations, not
users, lost records or lifetime totals after pruning.

Handles are `<abbrev>:<first 8 hex of sha256(exact condition key)>`; a
within-sweep collision lengthens both to 12 hex. Copy actual output, never
invent a handle. An unresolved 12-hex collision fails.

| Kind | Abbreviation |
|---|---|
| upload_terminal | ut |
| upload_backlog_stale | bl |
| reconcile_breaker_tripped | rb |
| pull_failing | pf |
| app_error_caught | ae |
| ea_report | er |
| diagnostics_sent | dg |
| left_behind_unsent_work | lb |
| foreign_owner_in_file | fo |
| legacy_shared_file_unsent | ls |

## What a receipt proves

A receipt proves the backend accepted a phone's observation. It does not prove
lost work, a missing domain row, current impact, UI visibility, an online phone,
a successful mutation, complete history, recovery or a healthy fleet when zero
receipts are found. Read observation interval and `observed` release separately
from `received_at` and send-time `delivery`. An old observation arriving after
an OTA does not establish that the OTA caused the original failure.

Maintain separate evidence for UI visibility, durable local domain rows, local
outbox/incident state, hosted receipt, backend rows/relationships, Sentry event
and eventual convergence. Local tests, disposable PostgreSQL, hosted apply,
native build, device acceptance, release uptake, causal field recovery and a
no-recurrence observation window are separate gates.

## Resolve and fetch before causal diagnosis

For each record-bearing lead, check the actual server row first:

```sh
node scripts/read-support-incidents.cjs --registry-ref origin/main --resolve <handle> --json
node scripts/read-support-incidents.cjs --registry-ref origin/main --fetch <handle> --json
```

`--resolve` supports only `upload_terminal` and the reader's fixed
`RESOLVE_COLUMNS` table map. It binds the UUID as a psql variable; never use a
receipt's table text as SQL. Results are `present`, `absent`, `unsupported` or
`indeterminate`. Query/parse failure is indeterminate, never absent. For
non-record conditions record resolve as **inapplicable**, with the reason.
For unsupported record tables use the read-only SQL runbook after verifying
live schema. Do not infer a missing row from an unsupported resolver.

Use actual `serverRecordId`/`wirePayload`: serializer top-level `id`, nested
`p_assessment.id` for assessments, null for `letter_mastery`; serializer failure
keeps `wirePayload: null`, `wirePayloadError` and local `recordId` fallback.
Inspect the evidence before using the fallback. Presence does not prove correct
relationships, UI visibility, recovery or convergence. Preserve exact actor and
observation-time state when evaluating authority and parent dependencies.

`--fetch` chooses the receipt with non-null `bundle_path` and greatest
`(received_at,id)`, which can be older than the latest receipt. It prints
`fetch.reportId` and downloads **that receipt's** bundle and optional screenshot
together. Files are `bundle-<report_id>.json` and
`screenshot-<report_id>.<original extension>` beneath
`docs/bugs/user-submissions-bundles/<handle>/`. It validates reporter-folder
ownership, formats and local symlink safety. `downloaded`, `failed` and
`unavailable` are distinct; inspect each file outcome. Missing evidence is an
open gate, not permission to invent its contents.

Access is explicitly authorized operator **psql read-only** with validated
SQLite staging credentials, separate from service-role API access. The reader
parses `.env` then `.env.local` through `sqlite-staging` validation as data,
verifies `segygjzpujphwvrubusm` and uses `SUPABASE_DB_PASSWORD_SQLITE` with a
validated session pooler and read-only child environment. Never source/eval env
files, print secrets or use raw root Supabase CLI. Only fetch requires
`SUPABASE_SECRET_KEY_SQLITE` for private Storage reads. EA API clients cannot
read receipts or bundles; service role has receipt SELECT only. For additional
read-only SQL use `.claude/skills/sqlite-staging-sql/SKILL.md`. Migration files
are intent; verify hosted schema/RPC definitions rather than assuming apply.

## Read the diagnostic bundle

The bundle contract is spec §9.2 with plan R-O3–R-O11 and N1 overriding older
examples. Inspect the actual JSON, logs and screenshot rather than filenames:

| Top-level key | Meaning |
|---|---|
| `bundleVersion` | Bundle format version (1). |
| `bundleId` | Attachment identity; pair it with receipt paths/report id. |
| `trigger` | Why capture was requested (automatic, human report or manual diagnostics). |
| `incidentRef` | Local incident identity/generation that requested capture. |
| `capturedAt` | Capture time, distinct from observation and server receipt time. |
| `ea` | Captured EA `userId`, `email`, `displayName`; verify reporter before joining. |
| `runtime` | Complete capture-time runtime diagnostics: application including existing gitCommit, device including name, update, backend and schema. |
| `network` | Capture-time network state; not proof of domain delivery. |
| `disk` | Capture-time disk information. |
| `installId` | Installation identity, shared across EAs on that install; not a person. |
| `supportExport` | Schema/migrations/counts, sync state, failed/terminal payloads and dispositions, mastery rows, incident queue and record id map from debugDump. |
| `logs` | Bounded newest log tail from `logger.tail`, not unbounded `exportLogs()`. |
| `truncated` | Minimal-fallback marker when full serialized capture exceeds 12 MB; inspect markers before assuming completeness. |

Capture contract: after commit, newest 200 failed/terminal rows, each payload
≤20 KB, newest 500 mastery rows; logs ≤2 MB and each entry ≤4 KB. Budgets precede
allocation; capture yields and checks handle currency between sections. A >12 MB
bundle becomes minimal runtime/EA/network/disk/counts/first-50-outbox evidence.
An ordinary non-stale full capture/write failure also attempts the minimal
bundle. If even that write fails, `bundleCaptureFailed` records missing evidence.
Do not equate the absence of an export row with absence from the phone when
bounded/truncated. Manual Share database retains its unbounded export behavior.

Capture/upload are contracts pending their own integration/device proof. The
queue's `capturing` gate prevents early freeze; uploads finish or five failed
bundle attempts give up before receipt freeze. Inspect `bundleCaptureFailed`,
`bundleUploadFailed` and `bundleDropped`. Sign-out abandons capture without a
stale write; the observer marks it failed after ten minutes when that EA file
next opens. Original evidence stays untouched and gitignored. J4 permits raw
ids, payloads, text/stacks, logs and full identity/device data in diagnostics;
only safe excerpts with SHA-256 go to `docs/bugs/evidence/<BUG-ID>/`. Do not
redact diagnostic bundle contents as an intake side effect.

## EA reports (`er:`)

A report sent from Profile is `ea_report`, a fresh event condition with raw
message (≤4,000 characters), screenshot indicator and `screen: 'Profile'`.
`er:` identifies its handle. Route human intake to `/bug-user`; fetch and inspect
each unrecorded report's bundle and optional screenshot, preserve the EA's
words, and declare the exact condition key in **field_report_ids**. No signature
exists for EA reports or `diagnostics_sent`. Do not hide a person waiting behind
machine noise or treat a diagnostics request as proof of a product defect.

## Correlate Sentry honestly

Use connected read-only Sentry tools when available. Discover the actual Masi
project from configuration/tools; do not copy a project name or fingerprint
from another app. Search exact EA UUID, observation time/release/error text in a
narrow window, separately from delivery time if delayed. Retrieve and inspect an
exact event, including actor/runtime/context; grouped titles/counts are candidate
discovery only. Do not assume receipts carry a Sentry event id or that every
receipt produces an event; native crashes stay Sentry-only.

Before interpreting an empty result, inspect the executed query and verify its
project, identity, time and syntax. Retry malformed connector queries explicitly.
A valid-query miss is negative evidence only for that scope. Unavailable tools,
invalid queries and authorization errors are **unavailable/inconclusive**, not
zero events and not proof that no crash happened. Never reuse upload-scoped
`SENTRY_AUTH_TOKEN`, provision credentials as an intake side effect or mutate
Sentry state.

## Assign the registry outcome

1. Deduplicate against canonical records and maintain competing hypotheses.
   Read source and reproduce the real end-user path in a safe/disposable
   environment before calling a code or stack frame the root cause.
2. Prefer exact keys in `support_incident_keys`. For `ea_report` use
   `field_report_ids`. Exact ownership is checked before signatures. Declare
   machine-readable **frontmatter YAML block lists**; prose/comments/fences and
   nonempty inline lists do not record ownership. Empty `[]` is allowed.
3. Only declare a signature when it has exactly one causal owner. Actual reader
   signatures: `upload_terminal/<errorClass>/<errorCode>`,
   `pull_failing/<scopeFamily>/<failureKind>`,
   `reconcile_breaker_tripped/<scopeFamily>/-`,
   `app_error_caught/<errorName>/<first8-messageDigest>`,
   `upload_backlog_stale/-/-`. Missing parts produce no signature. Plan 3 kinds
   (`lb`, `fo`, `ls`) have **no signature**, exact keys only. Shared codes do not
   prove a shared cause. Never invent a signature to make unrecorded zero.
4. Append an occurrence when causally justified; otherwise create a provisional
   template record with honest unknowns/possible duplicates. Preserve all
   field/Sentry/support channel keys. Add verified `reporter_id` to
   `affected_user_ids` only after causal assignment; it records historical
   attribution, not current blockage or recovery.
5. Apply existing MA-BUG severity/state rules and confidence rubric. Update the
   registry index and Coverage without inventing totals. Save the whole batch
   before deep investigation. Review recorded recurrences, including new
   releases; matching an old record never proves a fix worked.

### Learned mappings

Starts empty. Add only proposals grounded in real Masi evidence with a source;
mark inference explicitly and obtain authorization before applying skill edits.

| Signature fragment | Reading | Source |
|---|---|---|

## Masi source map

- `documentation/rls-sync-contract-map.md`: signed-in EA, payload/RLS/outbox and incident contracts.
- `src/db/migrations.js`: v20 dispositions and per-EA incident queue.
- `src/services/offlineSync.js`: classification/finalization, refresh and drain scheduling.
- `src/db/repositories/syncOutboxRepository.js`: failure writers and quarantine.
- `src/services/historyWalk.js`: durable pull-failure cursors.
- `src/services/syncPayload.js`: actual wire serializer, shared with support export.
- `src/db/debugDump.js`: support export, wire identity and incident queue evidence.
- `src/db/repositories/supportIncidentRepository.js`: condition identity, generations and cadence contract.
- `src/services/supportIncidents.js`: observer, event capture and drain contract.
- `src/utils/runtimeDiagnostics.js`: observation/runtime object.
- `src/utils/logger.js`: local logs and bounded-tail contract.
- `scripts/read-support-incidents.cjs`: current flags, grouping, registry ownership, fetch and resolve.
- `supabase/migrations/20261030120000_incident_receipts.sql`: immutable receipt/RPC migration intent.
- `supabase/migrations/20261030120100_support_bundles_storage.sql`: private bucket/policy migration intent.
- `scripts/support-incident-postgres-harness.cjs`: disposable server proof; not hosted truth.
- `docs/superpowers/specs/2026-10-29-incident-lane-and-bug-registry-design.md` and `docs/superpowers/plans/2026-10-29-field-diagnostics-plan.md`: design intent and the binding rulings behind the integrated capture, observer and Profile code; read the code when they disagree.

## Land records with authorization

A written sweep is unfinished until records reach origin/main. On the intake
branch, review safe evidence and ID uniqueness, commit only authorized registry
changes, then rerun a full unfiltered reader with `--registry-ref HEAD --json`
(and the same review overlap when applicable). HEAD reads committed files,
not uncommitted edits; default origin/main remains blind to unmerged records.
Reconcile every new unrecorded item before calling the batch recorded.
Merge/push with existing authorization or request it for the concrete reviewed
commit, then verify remote main contains the IDs. Never disturb a diverged main
or unrelated branch. If sandbox rules block Git or network, leave reviewable
files and state exactly what remains uncommitted/unlanded; do not bypass them.
No sweep request grants source fixes, releases or live repair authority.

## Finish the turn and improve the skill

Report inventory/handles, raw receipt and condition totals, unrecorded and
reviewed counts with scope/snapshot/review boundary, reader and registry commits,
records allocated/updated, exact channel keys and index/Coverage changes. Link
records and registry. For each lead state evidence inspected, competing causes,
confidence, resolve/fetch/Sentry outcomes (including unavailable), what the
receipt proves, next discriminating check and open gates. Report Git landing
status and every mutation explicitly. Never call a test-only lead a field defect.

After every real-data use, propose concrete skill improvements: a sourced learned
mapping, missing guard, misleading order, needed reader flag or source-map fact.
Apply only with authorization; shared schema changes belong in README. Do not
silently change contracts to fit the latest receipt.

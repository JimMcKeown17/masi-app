# Incident Lane, Upload Dispositions, and the MA-BUG Registry — Design

**Status:** draft for review, 2026-10-29.
**Roadmap item:** `documentation/ROADMAP.md` → "Minimum incident and provenance lane" and the
field-bug feedback loop under it (priority-order item 4).
**Inputs:**
- `documentation/zazi-sync-lessons-for-masi-2026-10-08.md` §"Field incidents and `/bug-sync`"
  (B1–B7) and findings Z12–Z13.
- Plan 3's minimal envelope: `docs/superpowers/plans/2026-10-17-sign-out-and-incidents.md`
  (`mobile_support_incidents`, `report_mobile_support_incident`, `support_incident_queue`).
- Zazi iZandi's shipped machinery in `/Users/jimmckeown/Development/zazi-izandi-app`:
  `docs/bugs/`, `.agents/skills/bug-sync`, `.agents/skills/bug-user`,
  `scripts/read-sync-incidents.cjs`, and the `mobile_sync_support_incidents` migrations.

## 1. Goal

When something goes wrong on a phone that a person needs to know about, the phone records a
small, privacy-safe **incident** and delivers it to the server. An engineer (or agent) runs
`/bug-sync`, which sweeps those receipts into a git-tracked **bug registry** (`docs/bugs/`) of
evidence-led **MA-BUG** records. People who describe a problem in their own words go through
`/bug-user` into the same registry.

The loop that hardened Zazi: phones report → a sweep records every receipt → records
accumulate occurrences and causal evidence → fixes are tracked through diagnosis, delivery and
verification separately.

### Non-goals (deferred, roadmap B7)

- A web health panel or any staff dashboard.
- Automatic recovery of parked uploads.
- A user-health reconciliation workflow.
- An in-app "Report a problem" screen (free text needs its own privacy design).
- A retention/purge job (decision below).
- Converting Masi's domain uploads to Zazi's protocol-v2 RPCs. The incident lane is independent
  of how domain rows upload.

## 2. Decisions

Jim, 2026-10-29:

| # | Decision |
|---|---|
| J1 | Phones capture **sync conditions plus caught app errors**: terminal and repeatedly rejected uploads, a stale upload backlog, reconcile-breaker trips, persistent pull failure, the three existing sign-out kinds, and a fingerprint-only incident when the React error boundary catches a crash. Native crashes stay Sentry-only. |
| J2 | The server migration is applied to `masi-app-sqlite` once the disposable-PostgreSQL harness passes, through the guarded `sqlite-staging` helper, with a read-only grant verification afterwards. Never the legacy backend. |
| J3 | Receipts are kept through the pilot. No purge job now; revisit before national rollout. Deleting an EA's auth account still cascades their receipts. |

Design decisions this spec makes:

| # | Decision | Why |
|---|---|---|
| D1 | **Extend** Plan 3's queue, table and RPC. No second queue or table. | Roadmap rule. Plan 3 already solved actor binding, fencing, backoff, and per-EA files. |
| D2 | One row per **condition**, server and phone. A re-report carries a higher `(report_generation, occurrence_count)` and **updates the row in place**. The server orders by that tuple and never rejects a body for differing from an earlier one. | Zazi's key-reuse rejection (Z12) and per-cycle flood (ZZ-BUG-012) both came from mixing "same condition" with "same immutable submission". A monotonic tuple makes a re-send, a retry after a lost acknowledgement, and an out-of-order delivery all safe without a payload hash. |
| D3 | Structured `error_class` and `error_code` on `sync_outbox`, written in the same transaction as the failure transition. | Roadmap Z12/Z13: do it while the schema is cheap. Classification already exists in `classifyError`; it is lost when flattened into `last_error`. |
| D4 | Record identity leaves the phone only as a one-way **record ref** (UUIDv5 under the existing incident namespace). The reader resolves refs by hashing the reporter's server rows. | Keeps Plan 3's rule (T12) that incident payloads never carry child ids, while still letting `/bug-sync` ask "is this record on the server?" (B4). |
| D5 | Provenance is captured **when the condition is observed**, not when it is delivered. | Today's envelope is built at drain time, so a receipt queued before an OTA claims the new release. |
| D6 | Registry IDs are `MA-BUG-YYYYMMDD-NNN`. The registry starts empty; no Zazi records, people, or learned mappings are copied. | Zazi's mappings describe Zazi's RPCs and staff. Masi's mappings must be learned from Masi receipts. |
| D7 | Incident enqueue can never roll back the domain transition that observed it. It runs inside a SQLite `SAVEPOINT`; on any error it rolls back to the savepoint, logs, and lets the outer transaction commit. | Diagnostics must not become a new data-loss path (Codex map §9.2). |

## 3. Vocabulary

Add to `CONTEXT.md`:

- **Incident** — a phone's durable statement that it observed a reportable condition. Lives in
  `support_incident_queue` on the phone and `mobile_support_incidents` on the server.
- **Condition** — what an incident is about, identified by `(reporter, kind, condition key)`.
  One condition is one row, however many times it recurs.
- **Receipt** — the server row for a condition. A receipt is a lead, not proof: it says a phone
  observed something, not that data was lost, that the problem is current, or that it is fixed.
- **Bug record** — one causal problem in `docs/bugs/records/`. Many receipts, field reports and
  Sentry events can be occurrences of one bug.
- **Upload disposition** — the `error_class` of an unsent outbox row: what kind of failure it is
  and who owns the next step.

## 4. Upload dispositions on `sync_outbox`

### 4.1 Columns (SQLite migration 20)

Two nullable columns. (A `first_failed_at` column was considered and dropped by the
check-solution pass in §16: its only consumer was a per-row repeat rule that the backlog
condition already covers.)

| Column | Type | Meaning |
|---|---|---|
| `error_class` | text, nullable, CHECK in the set below | Disposition of the most recent failure. Null while the row has never failed. |
| `error_code` | text, nullable, ≤ 64 chars, token `[A-Za-z0-9_]+` | Normalized code: a SQLSTATE (`42501`), PostgREST code (`PGRST204`), or Masi code (`MV001`, `ARCHIVE_REQUIRED`, `UNKNOWN_TABLE`, `TRANSPORT`, `NO_SESSION`). Never free text. |

`last_error` stays as the human-readable reason shown in Sync Status.

### 4.2 Classes and owners

| `error_class` | Produced by | Owner and procedure |
|---|---|---|
| `retryable` | Returned server errors without a specific rule; thrown request failures (`TRANSPORT`) | Sync engine retries with backoff. Never reported per row; a backlog that stops draining is reported by `upload_backlog_stale`. |
| `needs_parent` | `23503`, `42501`, `UPDATE_NOT_APPLIED` while local parent or grant evidence is pending | Sync engine. Clears when the parent uploads. Never reported per row; covered by the backlog condition. |
| `needs_reauth` | `28000`; `42501` downgraded because no live session existed | The EA signs in again. Never reported per row. |
| `terminal` | Every path that sets `status = 'terminal'`, including the deterministic-at-8 rule and the unknown-table finalizer | Support and engineering through `/bug-sync`. `ARCHIVE_REQUIRED` is an EA action (archive instead of delete); everything else is a bug lead. |

The mapping lives in one exported function, `dispositionFor(classification, failureCode,
context)`, next to `classifyError` in `src/services/offlineSync.js`. Every finalizer
(`finalizeRetriableFailure`, `finalizeTerminalFailure`, `finalizeOutboxOnlyTerminalFailure`,
`finalizeManyRetriableFailure`) takes `{ errorClass, errorCode }` and writes them in its
existing compare-and-set update.

## 5. Incident kinds

Two producer styles:

- **Event incidents** are enqueued inside the transaction that makes the transition, after its
  compare-and-set succeeds, so a stale claim cannot produce a false receipt.
- **Standing conditions** are evaluated by one observer, `observeStandingConditions()`, at the
  end of each full sync pass, from durable state only.

| Kind | Style | Trigger | Condition key parts | Payload allowlist |
|---|---|---|---|---|
| `upload_terminal` | Event | An outbox row's CAS transition to `terminal`, on any path | `table`, `record_id`, `operation`, outbox `created_at` (Plan 3's episode rule) | `table`, `operation`, `errorClass`, `errorCode`, `retryCount`, `recordRef` |
| `upload_backlog_stale` | Standing | The oldest unsent row owned by the signed-in EA is older than 72 h **and** a full pass succeeded within the last 24 h (the phone reaches the server but the backlog is not draining) | `'backlog'` (one per install) | `unsentByClass` (counts per `error_class`, plus `none`), `unsentByTable` (counts), `oldestUnsentAgeHours`, `hoursSinceSuccessfulPass` |
| `reconcile_breaker_tripped` | Event | `runReconcileWithMassEndBreaker` trips (inside its transaction, beside the breaker note) | scope family (table name, never the scope string) | `scopeFamily`, `candidateCount`, `wouldEndCount` |
| `pull_failing` | Standing | A history walker's durable cursor has `lastFailureAt` ≥ 24 h old with no success since | `scopeFamily`, `failureKind` | `scopeFamily` (the walker's history family, e.g. `session_history`, `assessment_history`), `failureKind` (`transport`, `query`, `dependency`, `disabled`, `year_mismatch`), `failingForHours` |
| `app_error_caught` | Event (own transaction) | `ErrorBoundary.componentDidCatch` while an EA handle is open; without a handle, Sentry only | `errorName`, `messageDigest`, first component | `errorName` (identifier token), `messageDigest` (UUIDv5 of the message with digits and UUIDs stripped), `components` (≤ 5 names matching `^[A-Z][A-Za-z0-9]*$` from the component stack) |
| `left_behind_unsent_work`, `foreign_owner_in_file`, `legacy_shared_file_unsent` | unchanged | Plan 3 | unchanged | unchanged |

Rules that apply to every kind:

- Ordinary retries, offline passes, CAS misses, stale-actor cancellations, page-budget stops and
  dependency skips are **never** incidents (B3: 62% of Zazi's active EAs raised a receipt within
  10 days, mostly from upstream bugs).
- `recordRef = incidentRepeatKey('record', table, record_id)`.
- Hours are whole numbers. Counts are integers. No timestamps other than the condition's own
  `first_seen_at`/`last_seen_at`.
- Never in a payload: domain payloads, `last_error` or any server message text, child or school
  ids or names, notes, coordinates, sync scope strings, `deviceName`, exception messages, stack
  text.

## 6. Identity and re-report model

### 6.1 Phone (`support_incident_queue`, rebuilt in SQLite migration 20)

| Column | Meaning |
|---|---|
| `id`, `kind`, `repeat_key` | As today. `repeat_key` is the condition key digest. Unique `(kind, repeat_key)`. |
| `schema_version` | Envelope schema. `1` for rows migrated from migration 13, `2` for new rows. |
| `payload` | Kind-specific body (§5), JSON. |
| `observed` | Provenance at `last_seen_at` (§7), JSON. |
| `first_observed` | `{ appVersion, buildNumber, updateId }` at `first_seen_at`, JSON. |
| `report_generation` | Starts at 1. Increments when a sent condition is due for a re-report. |
| `occurrence_count` | Times the phone observed the condition. Monotonic. |
| `first_seen_at`, `last_seen_at` | Observation interval, kept as `min`/`max` so a phone-clock correction cannot invert it. |
| `status` | `pending`, `sent`, `rejected`. |
| `last_sent_at` | When the server last acknowledged this condition. |
| `attempts`, `next_attempt_at`, `last_error` | Backoff state. `last_error` holds a code token only. |
| `created_at`, `updated_at` | As today. |

`observe(kind, conditionParts, payload)`:

1. **No row** → insert at generation 1, occurrence 1, `pending`.
2. **`pending`** → increment `occurrence_count`, extend the interval, replace `payload` and
   `observed`. It is unsent, so nothing is frozen.
3. **`sent`** → increment `occurrence_count`, extend the interval, replace `payload` and
   `observed`. Become `pending` with `report_generation + 1` **only if** the release identity
   (`appVersion`, `buildNumber`, `updateId`) changed or `last_sent_at` is ≥ 24 h ago. Otherwise
   stay `sent`; the counters ride along on the next re-report. A release change re-reports at
   once because "the fixed build still sees it" is the verification signal.
4. **`rejected`** → leave it. A rejection is a contract bug, so re-sending would loop.

Capacity stays 200 rows. Prune closed rows oldest-first; if every row is `pending`, drop the new
incident and increment `local_state.support_incidents_dropped`. `observed` carries that counter,
so the server learns that drops happened.

### 6.2 Server merge

For `(reporter_id, kind, repeat_key)`:

- **New** → insert. Subject to the rate limit (§8.3).
- **Incoming `(report_generation, occurrence_count)` greater** than stored (lexicographic) →
  update every mutable column, set `last_received_at = now()`. Result `updated`.
- **Equal** → no change. Result `duplicate`.
- **Less** → no change. Result `stale`, returning the stored tuple.

The phone marks a row `sent` with a compare-and-set on the tuple it sent (held in memory for the
request). If the condition was
re-observed while the request was in flight, the CAS misses, the row stays `pending`, and the
next drain sends the larger tuple. `duplicate` and `stale` both count as delivered.

## 7. Provenance and privacy

`observed`, captured synchronously at observation (no AsyncStorage inside SQLite transactions):

```text
appVersion, buildNumber, releaseLabel,
updateId, updateChannel, runtimeVersion, isEmbeddedLaunch, isEmergencyLaunch,
platform, osVersion, deviceModel (Device.modelName),
backendProjectId, sqliteSchemaVersion, droppedIncidents
```

Added at delivery, in a separate `delivery` object: `installId`, `appVersion`, `buildNumber`,
`updateId`. The delivery release can differ from the observing release. That is the evidence
that tells a backlog flush after an OTA apart from a new outbreak.

Privacy:

- The payload limit stays 8,192 bytes. It is enforced on the **final** envelope at send time.
  The phone also refuses a body over 6,144 bytes at enqueue, so delivery metadata always fits.
- The server checks the key set of `payload` against an allowlist per kind, and the key sets of
  `observed`, `first_observed` and `delivery` against theirs. Unknown keys are rejected
  (`22023`). Values are bounded by the overall size cap only; there is no per-field type
  grammar. The server is a redaction
  boundary, not only a size check.
- This is pseudonymous, not anonymous: `reporter_id` is the EA's auth id. That is deliberate,
  because support needs to know whose phone it was.

## 8. Server

New migration `supabase/migrations/2026103012xxxx_incident_conditions.sql`. Session-level
`SET`/`RESET`, never `SET LOCAL`.

### 8.1 Table changes (`public.mobile_support_incidents`)

- Widen the `kind` CHECK to the eight kinds.
- Add `schema_version smallint not null default 1`, `report_generation integer not null default
  1`, `occurrence_count integer not null default 1`, `first_seen_at timestamptz`, `last_seen_at
  timestamptz`, `last_received_at timestamptz not null default now()`. The install id stays in
  the `repeat_key` prefix and `delivery.installId`; the reader parses it.
- Keep `received_at` as first receipt time. Keep the unique `(reporter_id, kind, repeat_key)`.
- Index `(last_received_at desc, id)` for keyset paging.
- Grants unchanged: `service_role` SELECT only; re-assert the revoke explicitly (Zazi's M1 found
  hosted default ACLs granting more).

### 8.2 RPC

- `report_mobile_support_incident_v2(p_envelope jsonb) returns jsonb`. It is SECURITY DEFINER
  with an empty `search_path`, and its actor comes from `auth.uid()`. It returns
  `{ status: 'inserted'|'updated'|'duplicate'|'stale', report_generation, occurrence_count }`.
  Errors: `28000` unauthenticated; `22023` invalid envelope; `54000` rate limited.
- Envelope: `{ schema_version: 2, kind, repeat_key, report_generation, occurrence_count,
  first_seen_at, last_seen_at, payload, observed, first_observed, delivery }`.
  `repeat_key = installId + ':' + local digest`, as today.
- The v1 function `report_mobile_support_incident(text, text, jsonb)` stays exactly as deployed.
  Installed 1.4.0 pilot builds keep working; their rows read as generation 1, occurrence 1,
  schema 1. New builds call only v2. This follows the roadmap's "never change a deployed RPC in
  place; add `_vN`" convention.

### 8.3 Limits

- At most **60 new conditions per reporter per rolling 24 h** (`54000`). Updates to existing
  conditions are not counted. They are bounded by the phone's cadence: at most one re-report per
  condition per 24 h unless the release changes.
- The phone treats `54000` like a transport failure: back off and keep the row.

### 8.4 Harness

Extend `scripts/support-incident-postgres-harness.cjs` (disposable local PostgreSQL). Cover:
v1 still works and reads as generation 1; v2 insert, update, duplicate and stale; out-of-order
delivery; allowlist rejections per kind; inverted interval rejected; the
rate limit counting only new conditions; grants and the absence of any authenticated table
access.

## 9. Phone delivery

`drainSupportIncidents` sends v2 envelopes. Changes:

- Build `delivery` at send time; never overwrite `observed`.
- Enforce the 8,192-byte limit on the final envelope. An oversize envelope is marked `rejected`
  locally with code `TOO_LARGE`, with no request.
- `22023` → `rejected`. `54000`, transport and auth trouble → backoff and stop this drain.
  Stale actor → propagate, as today.
- Mark sent with the tuple CAS (§6.2).
- Transport errors store a code token in `last_error`, never the server message.

Everything else stays as Plan 3 built it. Drain runs after domain uploads, bounded to 20 rows.
Incident-only passes are scheduled. A drain never sends under another EA's session.

## 10. Support export (B6)

The Profile → Share database export adds the following:

- `error_class` and `error_code` on every failed or terminal outbox row.
- A `supportIncidents` section: every queue row with its kind, status, generation, counts,
  interval, payload and `observed`. These are already privacy-safe.
- A `recordRefs` map from each failed or terminal outbox row to its `recordRef`. With it, an
  engineer holding a forwarded export can join a receipt's `recordRef` to the actual record.
  This must happen only after confirming the export belongs to the receipt's actor (B5).

## 11. Operator side

### 11.1 Reader: `scripts/read-support-incidents.cjs` (`npm run bugs:incidents`)

- Read-only. It uses supabase-js with `SUPABASE_SECRET_KEY_SQLITE` and
  `SUPABASE_PROJECT_URL_SQLITE`, parsed from `.env.local` as data (never sourced). It refuses
  to run unless the URL is `https://segygjzpujphwvrubusm.supabase.co`.
- **Pages to completion** by keyset on `(last_received_at, id)`. There is no silent cap. Zazi's
  default `--limit 100` truncated sweeps without warning.
- Filters: `--actor`, `--kind`, `--since`, `--key`; `--json` prints only JSON to stdout.
- `--registry-ref <ref>` (default `origin/main`) loads `docs/bugs/records/*.md` from that git
  tree, not the worktree. An empty registry is valid.
- Matching:
  - Exact `support_incident_keys` entries of the form `<reporter_id>/<kind>/<repeat_key>`. The
    key is actor-qualified, so it can never claim another EA's receipt; Zazi's matcher compared
    bare keys.
  - Then `support_incident_signatures`.
  - A signature declared by two records is an **error**: exit code 2, with no coverage claim.
- Signature: `<kind>/<a>/<b>`, where `a`/`b` are `errorClass`/`errorCode` for upload kinds,
  `scopeFamily`/`failureKind` for pulls, `scopeFamily`/`-` for breakers, and
  `errorName`/first 8 chars of `messageDigest` for app errors.
- Handles: `<kind-abbrev>:<first 8 hex of sha256(reporter/kind/repeat_key)>`.
- Report order:
  1. Unrecorded receipts.
  2. Breadth (distinct reporters).
  3. Occurrences.
  4. A **by affected record** grouping on `recordRef`.
  5. A **by signature** grouping.
- `--resolve-records` (SELECT only): for upload kinds, hash the reporter's rows in the named
  table and report each `recordRef` as `present` or `absent`. This is the B4 "does the record
  exist on the server?" check.
- Its output says plainly that counts are raw and unscoped (test accounts included).

### 11.2 Registry: `docs/bugs/`

- `README.md` is the single contract. It holds:
  - purpose;
  - the registry index;
  - intake channels;
  - coverage;
  - the frontmatter contract;
  - ID allocation (scan `origin/main` and rescan before each create);
  - classification;
  - the three independent state axes;
  - severity scoring S0–S4 with overrides;
  - separate priority P0–P3;
  - the root-cause confidence rubric;
  - privacy and evidence rules;
  - the relationship to GitHub issues (bugs are causal records; GitHub issues are executable
    work, and a record links its issue).
- The content is adapted from Zazi's README, minus Zazi history, people and project ids.
- `_template.md`: Zazi's template with the `MA-BUG` prefix, the `masi-app` repository, and the
  fields `support_incident_keys` and `support_incident_signatures`. Machine-read lists are
  always block lists, never inline YAML.
- `records/.gitkeep` and `evidence/.gitkeep`. `.gitignore` adds `docs/bugs/user-submissions*/`.

### 11.3 Skills

- `.agents/skills/bug-sync/SKILL.md` plus `agents/openai.yaml`; `.claude/skills/bug-sync` is a
  symlink. It keeps Zazi's generic skeleton:
  - modes: SWEEP default, INVESTIGATE, FIX only on request;
  - start from `origin/main`;
  - sweep before going deep;
  - what a receipt does and does not prove;
  - ask the database whether the row is there first, via `--resolve-records`;
  - correlate Sentry with valid-query negative evidence;
  - decide the registry outcome (exact keys by default, signatures only for single-owner
    conditions);
  - land records on `origin/main` with authorization;
  - finish-the-turn report;
  - propose improvements.
- The Masi-specific source map points at `offlineSync.js` (`classifyError`, `dispositionFor`,
  the finalizers), `supportIncidentRepository.js`, `observeStandingConditions`,
  `documentation/rls-sync-contract-map.md`, and the `sqlite-staging-sql` skill for read-only
  SQL. The **Learned mappings** table starts empty.
- `.agents/skills/bug-user/SKILL.md` plus `agents/openai.yaml`, with a symlink. It is Zazi's
  workflow with Masi paths:
  - capture the batch before going deep;
  - inspect the actual evidence;
  - dedupe cautiously;
  - read-only diagnosis by default;
  - explicit FIX mode;
  - finish-the-turn report.
  Masi's evidence sources are Profile → Share logs and Share database.
- `AGENTS.md` routes bug reports and receipt sweeps to these skills.

## 12. Standing documentation (same branch)

Update in the same branch:
- `CONTEXT.md` (§3).
- `documentation/rls-sync-contract-map.md` (outbox columns, the eight kinds, v2 RPC, grants).
- `documentation/ROADMAP.md` (tick the lane items; leave B7 open).
- `documentation/build-log.md`.
- `documentation/LEARNING.md`: one narrative on why a condition is ordered by a monotonic
  tuple instead of a frozen body.
- `AGENTS.md` routing.

## 13. Verification

- **Real SQLite (better-sqlite3)**, TDD through public interfaces:
  - migration 20 rebuilds the queue and preserves Plan 3 rows as schema 1;
  - dispositions are written by every finalizer, and the batch finalizer is covered;
  - no incident on a CAS miss;
  - `upload_terminal` atomic with the terminal transition;
  - savepoint isolation, so a forced enqueue failure still commits the transition;
  - standing observers from durable state;
  - the `observe` state machine and capacity drop counter;
  - drain tuple CAS under concurrent re-observation;
  - size enforcement on the final envelope;
  - privacy assertions: no `deviceName`, record ids, messages, or scope strings anywhere in the
    sent request.
- **Disposable PostgreSQL** harness: §8.4.
- **Reader** unit tests against a temporary git repository fixture:
  - empty registry;
  - key versus signature precedence;
  - a narrative mention is not ownership;
  - a contested signature exits 2;
  - an inline list is ignored;
  - keyset paging over more than one page with a stubbed client.
- **Hosted:** apply to `masi-app-sqlite` (J2), then read-only verification of columns, CHECK,
  grants, both function signatures, and a v1 call from a pilot-build-shaped request.
- **Device:** ride along on the next pilot build. Force one terminal upload on the Galaxy A03s
  and confirm it arrives through `npm run bugs:incidents`. No dedicated build for this lane.
- **End to end with the skill:** run `/bug-sync` against the staging receipts and create one
  real `MA-BUG` record.

## 14. Compatibility

- SQLite migration 20 is additive for `sync_outbox` (two nullable columns). It rebuilds
  `support_incident_queue` (SQLite cannot alter a CHECK) inside the migration transaction,
  copying rows as schema 1.
- The server change is additive. New columns have defaults; v1 is untouched; there are no field
  users on `masi-app-sqlite`.
- An older bundle reading a newer database is already refused (`SCHEMA_TOO_NEW`).

## 15. Open questions (non-blocking)

- Thresholds (72 h backlog; 24 h pull failure; 24 h re-report cadence; 60 new conditions a
  day) are first guesses. `/bug-sync` should report whether they are noisy or quiet, and the
  skill's improvement step proposes changes.
- Whether Sentry is configured in pilot builds. The skill must handle "Sentry unavailable"
  as a recorded result, not a clean miss.

## 16. Check-solution pass (2026-10-29)

Dropped as NEVER (deleting them makes complexity vanish; no user-visible delta this cycle):
- the `upload_rejected_repeatedly` kind and its `first_failed_at` column (the backlog condition
  covers it);
- the roster-staleness trigger of `pull_failing` (no evidence, six readers of `last_pulled_at`
  to reason about, and roster failures already reach Sentry);
- the material-field re-report table (24 h cadence plus release-change re-report covers it);
- `sent_generation`/`sent_occurrence_count` columns (the CAS uses the in-memory request);
- the server `install_id` column (parse the key prefix);
- `gitCommit` in provenance (always `unknown`);
- `routeName` in app errors (needs navigation plumbing into the root boundary).

Kept in simplest form: `reconcile_breaker_tripped` (a one-line data-safety event) and the
server allowlist (a key-set check, no per-field grammar). Evidence caveat: masi has no field
receipts yet, so B1 for most kinds rests on Zazi's field evidence from the same EA population.

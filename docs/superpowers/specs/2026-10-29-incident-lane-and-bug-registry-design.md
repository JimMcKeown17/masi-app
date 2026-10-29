# Incident Lane, Upload Dispositions, and the MA-BUG Registry — Design

**Status:** revision 2, 2026-10-29.
- Revision 1 was trimmed by a check-solution pass (§17).
- Revision 1 was then challenged by a Codex adversarial review: 10 blocking findings, all
  accepted (§18).

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

**Already built on this branch:**
- `docs/bugs/README.md` and `docs/bugs/_template.md`.
- The `bug-user` skill.

## 1. Goal

When something goes wrong on a phone that a person needs to know about, the phone records a
small, privacy-safe **incident** and delivers it to the server. An engineer (or agent) runs
`/bug-sync`, which sweeps those receipts into the git-tracked **bug registry** (`docs/bugs/`) of
evidence-led **MA-BUG** records. People who describe a problem in their own words go through
`/bug-user` into the same registry.

**Cycle objective:** before EAs retest in November 2026, every field failure that needs a human
reaches Jim durably and can be swept into the registry.

### Non-goals (deferred, roadmap B7)

- A web health panel or any staff dashboard.
- Automatic recovery of parked uploads.
- A user-health reconciliation workflow.
- An in-app "Report a problem" screen (free text needs its own privacy design).
- A retention/purge job (J3).
- Converting Masi's domain uploads to Zazi's protocol-v2 RPCs.

## 2. Decisions

Jim, 2026-10-29:

| # | Decision |
|---|---|
| J1 | Phones capture **sync conditions plus caught app errors**. Native crashes stay Sentry-only. |
| J2 | The server migration is applied to `masi-app-sqlite` once the disposable-PostgreSQL harness passes, through the guarded `sqlite-staging` helper, followed by read-only verification. Never the legacy backend. |
| J3 | Receipts are kept through the pilot. No purge job now; revisit before national rollout. Deleting an EA's auth account still cascades their receipts. |

Design decisions:

| # | Decision | Why |
|---|---|---|
| D1 | **Extend** Plan 3's queue, table and RPC. No second queue or table. | Roadmap rule. Plan 3 already solved actor binding, fencing, backoff and per-EA files. |
| D2 | One row per **condition**, on the phone and the server. Reports are ordered by `(report_generation, occurrence_count)`. A newer report **updates the row in place**. The server never rejects a body for differing from an earlier one. | Avoids Zazi's key-reuse rejection (Z12) and per-cycle flood (ZZ-BUG-012) by construction. |
| D3 | Structured `error_class` and `error_code` on `sync_outbox`, written in the same statement as the failure transition. | Roadmap Z12/Z13. |
| D4 | Record identity leaves the phone only as a one-way **record ref** (UUIDv5). It is produced only for tables whose local id is the server id. | Keeps Plan 3's rule that incident payloads never carry child ids, while letting `/bug-sync` ask "is this record on the server?" (B4). |
| D5 | Provenance is captured **when the condition is observed**. Delivery metadata is a separate object. | Today's envelope is built at drain time, so a receipt queued before an OTA claims the new release. |
| D6 | IDs are `MA-BUG-YYYYMMDD-NNN`. The registry starts empty; no Zazi records, people, or learned mappings are copied. | Zazi's mappings describe Zazi's RPCs and staff. |
| D7 | An event incident is enqueued **inside** the transaction that makes its transition. Its payload is built and validated **before** the transaction opens. If the enqueue statement still fails (storage-level error), the whole transition rolls back. Every hooked transition is safe to retry: a rolled-back terminal finalize leaves the row `in_flight`, the next pass resets it to `pending` and resends; a rolled-back breaker trip ends no rows (the safe direction) and the next pull re-evaluates. No savepoints. | The signed-in facade forbids `SAVEPOINT` (`signedInHandle.js:126-135`), and storage errors such as `SQLITE_FULL` roll back the outer transaction regardless. Atomic is honest; best-effort-after-commit would let a crash between the two lose the receipt. |
| D8 | Exact registry keys include the failure's causal class. A changed cause is a new condition, so it is a new, unrecorded receipt. | A mutable condition must not keep a key that the registry permanently assigned to an earlier cause (review finding 6). |

## 3. Vocabulary

Add to `CONTEXT.md`:

- **Incident** — a phone's durable statement that it observed a reportable condition. It lives
  in `support_incident_queue` on the phone and `mobile_support_incidents` on the server.
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

Two nullable columns, set by the same `UPDATE` that sets `status` on failure:

| Column | Type | Meaning |
|---|---|---|
| `error_class` | text, CHECK in §4.2 | Disposition of the most recent failure. Null until the row first fails. |
| `error_code` | text, CHECK matches `^[A-Z0-9_]{1,40}$` | Normalized code (§4.3). Never free text. |

`last_error` stays as the human-readable reason shown in Sync Status. It never leaves the phone
in an incident.

### 4.2 Classes and owners

| `error_class` | Produced when | Owner and procedure |
|---|---|---|
| `retryable` | A returned server error with no specific rule; a thrown request (`TRANSPORT`) | Sync engine retries with backoff. Never reported per row; covered by `upload_backlog_stale`. |
| `needs_parent` | `23503`, `42501`, `UPDATE_NOT_APPLIED` while local parent or grant evidence is pending | Sync engine. Clears when the parent uploads. Never reported per row. |
| `needs_reauth` | `28000`; a `42501` downgraded because no live session existed | The EA signs in again. Never reported per row. |
| `terminal` | Every path that sets `status = 'terminal'`, including the deterministic-at-8 rule and the unknown-table finalizer | Support and engineering through `/bug-sync`. `ARCHIVE_REQUIRED` is an EA action; every other code is a bug lead. |

One exported function, `dispositionFor({ classification, failureCode, parentEvidencePending,
downgradedForNoSession })`, sits next to `classifyError` in `src/services/offlineSync.js`. It
returns `{ errorClass, errorCode }`. Every finalizer takes that pair:
- `finalizeRetriableFailure`
- `finalizeTerminalFailure`
- `finalizeOutboxOnlyTerminalFailure`
- `finalizeManyRetriableFailure`

### 4.3 Code normalization

`normalizeErrorCode(raw)`:
- Uppercases the code.
- Returns it if it matches `^[A-Z0-9_]{1,40}$` (SQLSTATEs, `PGRST204`, `MV001`, `MA001`,
  `ARCHIVE_REQUIRED`, …).
- Returns `TRANSPORT` for a thrown request without a code, `UNKNOWN_TABLE` for the
  unknown-table path, and `OTHER` otherwise.

### 4.4 Unknown-table finalizer gains a compare-and-set

`finalizeOutboxOnlyTerminalFailure` (`offlineSync.js:1025-1038`) today updates by id, ignores
`changes`, and runs before the claim. It changes as follows:
- It updates only `where id = ? and updated_at = ? and status in ('pending','failed','terminal')`
  using the selected row's values.
- It returns whether a row changed.
- It reports an incident only when the row changed and its prior status was not already
  `terminal` with the same disposition.

## 5. Incident kinds

Two producer styles:

- **Event incidents** are enqueued inside the transaction that makes the transition, after its
  compare-and-set reports a change (D7).
- **Standing conditions** are evaluated by `observeStandingConditions()` from durable or handle
  state. It is called from the sync-status refresh path (which runs on the 30-second active
  poll, on foreground and on reconnect, whether or not upload work exists), throttled to once
  per 10 minutes per handle. If it queues a new incident, the existing `incidentReadyCount`
  scheduling triggers a drain.

| Kind | Style | Trigger | Condition key parts | Payload (schemas in §7.3) |
|---|---|---|---|---|
| `upload_terminal` | Event | A real transition to `terminal` on any path (§4.4) | `table`, `record_id`, `operation`, outbox `created_at`, `errorClass`, `errorCode` | `table`, `operation`, `errorClass`, `errorCode`, `retryCount`, `recordRef` |
| `upload_backlog_stale` | Standing | (a) The signed-in EA's oldest unsent row (`pending`/`failed`) is older than 72 h, and (b) the handle recorded a server HTTP response (status < 500) within the last 24 h (§5.1) | `'backlog'` (one per install and EA) | `unsentByClass`, `unsentByTable`, `oldestUnsentAgeHours` |
| `reconcile_breaker_tripped` | Event | `runReconcileWithMassEndBreaker` trips, in its transaction beside the breaker note | scope family (the table name, never the scope string) | `scopeFamily`, `candidateCount`, `wouldEndCount` |
| `pull_failing` | Standing | A history walker's cursor has `lastFailureAt` ≥ 24 h old, with `lastFailureKind` in `transport`, `query`, `disabled`, `year_mismatch`, and no success since | `scopeFamily`, `failureKind` | `scopeFamily`, `failureKind`, `failingForHours` |
| `app_error_caught` | Event (own transaction) | `ErrorBoundary.componentDidCatch` while an EA handle is open. Without a handle, Sentry only. | `errorName`, `messageDigest`, first component | `errorName`, `messageDigest`, `components` |
| `left_behind_unsent_work`, `foreign_owner_in_file`, `legacy_shared_file_unsent` | unchanged | Plan 3 | unchanged | unchanged |

Rules for every kind:

- **Never incidents:**
  - ordinary retries;
  - offline passes;
  - CAS misses;
  - stale-actor cancellations;
  - history page-budget stops;
  - dependency skips;
  - a history walker stopped for a missing dependency.
- `recordRef` is `incidentRepeatKey('record', table, record_id)` only for tables in
  `RECORD_REF_TABLES`: every outbox table whose server id equals the local `record_id`. The list
  is derived from `buildSyncPayload`, which rewrites ids for at least `session_attendees`,
  `assessment_items`, `child_ea_assignments`, `child_programme_enrollments`,
  `class_ea_assignments`, `group_ea_assignments` and `class_grouping_state`. A test pins
  `RECORD_REF_TABLES` against `buildSyncPayload` so a newly rewritten table cannot silently
  produce a wrong ref. Other tables send `recordRef: null`.
- `historyWalk.js` persists `lastFailureKind` alongside `lastFailureAt` in the same cursor
  write, and clears both on success.

### 5.1 Server-response evidence

`fencedFetch` in `src/session/handleDataClient.js` is the single choke point for the handle's
HTTP traffic. It records `handle.lastServerResponseAt` (in memory) whenever a response arrives
with status < 500. The backlog observer reads it. It is not persisted. After a restart the
backlog condition waits for real contact, which is the conservative direction. The existing
`lastSuccessfulSyncTime` is not used: it is set even when every upload failed on transport
(`offlineSync.js:1689-1702,1849-1855`).

## 6. Identity and re-report model

### 6.1 Phone: `support_incident_queue`, rebuilt in SQLite migration 20

SQLite cannot alter a CHECK, so the table is recreated and rows are copied.

| Column | Meaning |
|---|---|
| `id` | Local row uuid. Sent as `queue_row_id`. A new uuid every time the row is created. |
| `kind`, `repeat_key` | As today; `repeat_key` is the condition-key digest. Unique `(kind, repeat_key)`. |
| `schema_version` | `1` for rows copied from migration 13; `2` for new rows. |
| `payload` | Kind body (§5), JSON. |
| `observed` | Provenance at `last_seen_at` (§7.1), JSON. Null for schema-1 rows. |
| `first_observed` | `{ appVersion, buildNumber, updateId }` at `first_seen_at`, JSON. Null for schema-1 rows. |
| `report_generation`, `occurrence_count` | Start at 1. |
| `first_seen_at`, `last_seen_at` | The observation interval, stored as `min`/`max` so a clock correction cannot invert it. |
| `status` | `pending`, `sent`, `rejected`. |
| `last_sent_at` | When the server last acknowledged this row. |
| `attempts`, `next_attempt_at`, `last_error` | Backoff state. `last_error` holds a code token only. |
| `created_at`, `updated_at` | As today. |

`observe(txn, kind, conditionParts, payload)`, all inside the caller's transaction:

1. **No row** → insert at generation 1, occurrence 1, `pending`, with a new `id`.
2. **`pending`** → increment `occurrence_count`, extend the interval, replace `payload` and
   `observed`.
3. **`sent`** → do the same as `pending`. Then become `pending` with `report_generation + 1`
   only if the release identity (`appVersion`, `buildNumber`, `updateId`) differs from what
   was last sent, or `last_sent_at` is ≥ 24 h ago. Otherwise stay `sent`; the counters ride
   along on the next re-report.
4. **`rejected`** → unchanged. A rejection is a contract bug; re-sending would loop.

Capacity stays 200 rows. Prune closed rows oldest-first. If every row is `pending`, drop the
new incident and increment `local_state.support_incidents_dropped` (a cumulative counter).

### 6.2 Server merge

The server keys conditions on `(reporter_id, kind, repeat_key)` and stores `queue_row_id`.

| Case | Action | Result |
|---|---|---|
| No row | Insert. Subject to the rate limit (§8.3). | `inserted` |
| Row exists, **same** `queue_row_id`, incoming tuple greater | Update every mutable column; `last_received_at = now()`. | `updated` |
| Same `queue_row_id`, tuple equal | Nothing. A retry after a lost acknowledgement. | `duplicate` |
| Same `queue_row_id`, tuple less | Nothing. A delayed older request. | `stale` |
| Row exists, **different** `queue_row_id` | The phone pruned and recreated the condition (or restored a database). Merge additively: `report_generation = stored + 1`, `occurrence_count = stored + incoming`, interval widened to `min`/`max`, body and `observed` replaced, `queue_row_id` replaced. | `updated` |

Every result returns the server's resulting `(report_generation, occurrence_count)`.

The phone marks the row `sent` with a compare-and-set on the tuple it sent (held in memory for
the request). On `updated` it first adopts the returned tuple, so a merged row continues from
the server's counters. If the condition was re-observed during the request, the CAS misses and
the row stays `pending`. The next send is still greater, so the server accepts it.

This keeps Plan 3's guarantee that a reinstall (new `installId`) is a new condition, because the
install id is part of `repeat_key`. It also closes the prune-and-recreate gap from review
finding 2.

## 7. Provenance, payload schemas and privacy

### 7.1 Observation provenance (`observed`)

Captured synchronously at observation, with no AsyncStorage reads inside SQLite transactions:

| Key | Type |
|---|---|
| `appVersion`, `buildNumber`, `releaseLabel`, `runtimeVersion`, `updateChannel`, `osVersion`, `deviceModel` | short string (§7.3 `label`) or null |
| `updateId` | UUID or null |
| `isEmbeddedLaunch`, `isEmergencyLaunch` | boolean |
| `platform` | `ios` or `android` |
| `backendProjectId` | `^[a-z]{20}$` |
| `sqliteSchemaVersion` | integer |

`deviceModel` is `Device.modelName`, never `deviceName`.

### 7.2 Delivery metadata (`delivery`)

Added at send time:
- `installId` (UUID; must equal the `repeat_key` prefix)
- `appVersion`, `buildNumber`, `updateId`
- `droppedIncidents`: the cumulative counter. It lives here, not in `observed`, so a saturated
  queue still reports its drops on the next delivery of any row.

### 7.3 Value schemas

Enforced on the phone by one builder per kind (payloads are built only through it) **and**
re-checked on the server.

| Type | Rule |
|---|---|
| `table` | One of the outbox push-order tables (`offlineSync.js:73-143`) or `unknown`. A stored `table_name` outside the list is sent as `unknown`. |
| `operation` | `insert`, `update`, `archive`, `hard_delete`, `restore` |
| `errorClass` | §4.2 set |
| `errorCode` | `^[A-Z0-9_]{1,40}$` |
| `recordRef`, `messageDigest`, UUIDs | Canonical lowercase UUID, or null where allowed |
| `scopeFamily` | Closed set: the reconcile tables that call the breaker, and the history families |
| `failureKind` | `transport`, `query`, `disabled`, `year_mismatch` |
| `errorName` | `^[A-Za-z][A-Za-z0-9_]{0,63}$`; anything else becomes `Error` |
| `components` | Array of ≤ 5 strings matching `^[A-Z][A-Za-z0-9]{0,63}$` |
| counts, hours, `retryCount`, `candidateCount`, `wouldEndCount` | Integer 0–1,000,000 |
| `unsentByClass` | Object; keys from the `errorClass` set plus `none`; integer values |
| `unsentByTable` | Object; keys from the `table` set; integer values |
| `label` | String ≤ 64 chars matching `^[A-Za-z0-9 ._:+()/-]*$` |

Every object is closed: unknown keys are rejected with `22023`, and nested objects are allowed
only where the table says so. The server is a redaction boundary as well as a size check. One
residual is accepted and documented: the server cannot tell a UUIDv5 digest from a raw domain
UUID. That guarantee rests on the phone's single builder and its tests.

### 7.4 Never in an incident

- domain payloads;
- `last_error` or any server message;
- exception messages or stack text;
- child, school, class or group ids or names;
- notes;
- coordinates;
- sync scope strings;
- `deviceName`.

This is pseudonymous, not anonymous: `reporter_id` is the EA's auth id, deliberately.

### 7.5 Size

8,192 bytes on the final envelope at send time. The phone refuses a body over 6,144 bytes at
enqueue, so delivery metadata always fits. An oversize envelope at send is marked `rejected`
locally with code `TOO_LARGE`, without a request.

## 8. Server

New migration `supabase/migrations/2026103012xxxx_incident_conditions.sql`. Session-level
`SET`/`RESET`, never `SET LOCAL`.

### 8.1 Table changes (`public.mobile_support_incidents`)

- Widen the `kind` CHECK to the eight kinds.
- Add:
  - `schema_version smallint not null default 1`
  - `report_generation integer not null default 1`
  - `occurrence_count integer not null default 1`
  - `queue_row_id uuid`
  - `first_seen_at timestamptz`, `last_seen_at timestamptz`
  - `last_received_at timestamptz not null default now()`
- Keep `received_at` as first-receipt time; it is immutable and drives reader paging (§11.1).
- Keep the unique `(reporter_id, kind, repeat_key)`.
- Index `(received_at, id)`.
- Grants unchanged: `service_role` SELECT only. Re-assert the revoke explicitly.

### 8.2 RPCs

`report_mobile_support_incident_v2(p_envelope jsonb) returns jsonb`:
- SECURITY DEFINER, empty `search_path`, actor from `auth.uid()`.
- The envelope: `{ schema_version: 2, kind, repeat_key, queue_row_id, report_generation,
  occurrence_count, first_seen_at, last_seen_at, payload, observed, first_observed, delivery }`.
- It validates §7.3 per kind and the merge in §6.2.
- It returns `{ status, report_generation, occurrence_count }`.
- Errors: `28000` unauthenticated; `22023` invalid envelope; `54000` rate limited.

`report_mobile_support_incident(text, text, jsonb)` (v1) stays exactly as deployed. It serves
installed 1.4.0 pilot builds and the new build's **schema-1 rows** (§9). Its rows read as
schema 1, generation 1, occurrence 1.

### 8.3 Limits

At most **60 new conditions per reporter per rolling 24 h** (`54000`). Updates and additive
merges are not counted. They are bounded by the phone's cadence: at most one re-report per
condition per 24 h unless the release changes. The phone treats `54000` like a transport
failure: back off and keep the row.

### 8.4 Harness

Extend `scripts/support-incident-postgres-harness.cjs` (disposable local PostgreSQL) to cover:
- v1 unchanged and reading as generation 1;
- v2 `inserted`, `updated`, `duplicate`, `stale`;
- out-of-order delivery;
- prune-and-recreate additive merge (different `queue_row_id`);
- per-kind schema rejections, including hostile values under allowed keys (a child-name
  string as `errorCode`, a raw sentence as `errorName`, a nested object inside `unsentByTable`,
  an unknown table name);
- `installId` / `repeat_key` prefix mismatch;
- an inverted interval;
- the rate limit counting only new conditions;
- grants, with no authenticated table access.

## 9. Phone delivery

`drainSupportIncidents`:

- **Schema-1 rows** (copied from migration 13) drain through v1 exactly as today, with the
  drain-time envelope. This is their documented, unchanged provenance. They are never promoted;
  a new observation of the same Plan 3 episode is a duplicate under v1 semantics.
- **Schema-2 rows** send the v2 envelope. Delivery metadata is built at send time; `observed`
  is never overwritten.
- Outcomes:
  - `inserted`, `updated`, `duplicate` and `stale` are delivered: adopt the returned tuple,
    then CAS-mark `sent`.
  - `22023` → `rejected`.
  - `54000`, transport and auth trouble → backoff, and stop this drain.
  - Stale actor → propagate.
- `last_error` stores a code token, never a server message.
- Bounded to 20 rows; runs after domain uploads; incident-only passes are scheduled; never
  sends under another EA's session. All unchanged from Plan 3.

## 10. Support export (B6)

Profile → Share database adds:
- `error_class` and `error_code` on every failed or terminal outbox row.
- A `supportIncidents` section: every queue row with its kind, status, generation, counts,
  interval, payload and `observed`.
- A `recordRefs` map from each failed or terminal outbox row to its `recordRef` (null outside
  `RECORD_REF_TABLES`). This joins a receipt to a forwarded export, but only after confirming
  the export belongs to the receipt's reporter (B5).

## 11. Operator side

### 11.1 Reader: `scripts/read-support-incidents.cjs` (`npm run bugs:incidents`)

**Access.**
- Read-only, using supabase-js with `SUPABASE_SECRET_KEY_SQLITE` and
  `SUPABASE_PROJECT_URL_SQLITE`.
- Both are parsed from `.env.local` as data, never sourced.
- It refuses to run unless the URL is `https://segygjzpujphwvrubusm.supabase.co`.
- It never writes.

**Enumeration.**
- Keyset paging on the immutable `(received_at, id)`, with an upper bound `received_at <=
  sweep_started_at` fixed at start.
- Every condition first received before the sweep began is enumerated exactly once, with its
  current columns.
- Conditions first received during the sweep appear in the next sweep.
- The report states the interval. There is no limit flag that can silently truncate.

**Filters.** `--actor`, `--kind`, `--since` (on `last_received_at`), `--key`. `--json` prints
only JSON to stdout.

**Registry.** `--registry-ref <ref>` (default `origin/main`) loads `docs/bugs/records/*.md`
from that git tree. An empty registry is valid. Only block-list frontmatter is parsed for
`support_incident_keys` and `support_incident_signatures`.

**Matching.**
- Exact keys `<reporter_id>/<kind>/<repeat_key>` match first, then signatures.
- A signature declared by two records → exit code 2, with no coverage claim.

**Signatures** (`<kind>/<a>/<b>`):

| Kinds | `a` / `b` |
|---|---|
| upload kinds | `errorClass` / `errorCode` |
| pulls | `scopeFamily` / `failureKind` |
| breakers | `scopeFamily` / `-` |
| app errors | `errorName` / first 8 chars of `messageDigest` |
| backlog | `-` / `-` |

**Changed since recorded.** A recorded receipt whose `last_received_at` is later than its
owning record's `updated_at_utc` is listed separately as **updated since recorded**. Coverage
is not review: a known condition that keeps arriving, or arrives from a new release, still
needs a look.

**Report order:**
1. Unrecorded receipts.
2. Updated since recorded.
3. Breadth (distinct reporters).
4. Occurrences.
5. By affected record (`recordRef`).
6. By signature.

Handles are `<kind-abbrev>:<first 8 hex of sha256(reporter/kind/repeat_key)>`. The output says
counts are raw and unscoped.

**`--resolve-records`** (SELECT only). For each upload receipt with a non-null `recordRef`, the
reader pages through **all** ids of that table (no reporter filter, because EAs legitimately
edit rows created by others) and hashes them. The result per ref:
- `present` — a hashed id matches.
- `absent` — the scan completed and nothing matched.
- `unknown` — the scan failed or was incomplete, or the receipt has a null ref.

Existence is not convergence: `present` does not prove the intended change was applied.

### 11.2 Registry (`docs/bugs/`) — built

- `README.md` (single contract) and `_template.md`.
- `records/` and `evidence/`.
- `.gitignore` excludes `docs/bugs/user-submissions*/`.

### 11.3 Skills

**`.agents/skills/bug-sync/SKILL.md` plus `agents/openai.yaml`**, with a `.claude/skills/bug-sync`
symlink. It keeps Zazi's generic skeleton:
- modes: SWEEP default, INVESTIGATE, FIX only on request;
- start from `origin/main`;
- sweep before going deep;
- what a receipt does and does not prove;
- ask the server whether the record is there (`--resolve-records`) before diagnosing;
- Sentry correlation with valid-query negative evidence;
- the registry outcome: exact keys by default; signatures only for single-owner conditions;
  review "updated since recorded";
- land records on `origin/main` with authorization;
- the finish-the-turn report;
- propose improvements.

Its Masi source map:
- `classifyError`, `dispositionFor` and the finalizers in `offlineSync.js`;
- `supportIncidentRepository.js`;
- `observeStandingConditions`;
- `documentation/rls-sync-contract-map.md`;
- the `sqlite-staging-sql` skill for read-only SQL.

Its **Learned mappings** table starts empty.

**`bug-user`** is built.

**`AGENTS.md`** routes bug reports and receipt sweeps to these skills.

## 12. Standing documentation (same branch)

- `CONTEXT.md` (§3).
- `documentation/rls-sync-contract-map.md`: outbox columns, the eight kinds, v2 RPC, grants,
  the D7 atomicity rule.
- `documentation/ROADMAP.md`: tick the lane items; leave B7 open.
- `documentation/build-log.md`.
- `documentation/LEARNING.md`: one narrative on ordering a condition by a monotonic tuple,
  and why a recreated row merges additively.
- `AGENTS.md` routing.

## 13. Verification

### Real SQLite, through the signed-in handle

TDD through public interfaces. Tests run through `test-support/defaultTestHandle.js` (the
production facade, not a bare better-sqlite3 connection) and cover:

- migration 20: rebuilds the queue, keeps Plan 3 rows as schema 1, adds the outbox columns;
- dispositions written by every finalizer, including the batch finalizer;
- no incident on a CAS miss, for each finalizer and the unknown-table path; the latter
  includes deletion and replacement between selection and finalization, and a forced retry of
  an already-terminal unknown-table row;
- `upload_terminal` atomic with the terminal transition;
- a forced enqueue failure rolls the transition back, and the next pass recovers the row to
  `pending` (D7);
- the same mutation going terminal under two codes produces two conditions;
- the backlog observer:
  - all-transport-failure passes do not report;
  - empty passes do not report;
  - a server response within 24 h plus a 72 h backlog reports once;
- `pull_failing` with an **empty outbox**: a history failure older than 24 h reports through
  the status-refresh path; `lastFailureKind` persists and clears on success;
- the `observe` state machine, the prune-and-recreate path, and the drop counter reaching
  `delivery` after the queue saturates and drains with no further observations;
- the drain:
  - the tuple CAS under concurrent re-observation;
  - adopting a merged tuple;
  - schema-1 rows via v1;
  - size enforcement on the final envelope;
- EA switching: one EA's queue never drains under another's session;
- privacy: no `deviceName`, record ids, messages, scope strings, or non-schema values anywhere
  in the sent request; the `RECORD_REF_TABLES` pin against `buildSyncPayload`.

### Disposable PostgreSQL

The §8.4 harness.

### Reader unit tests

Against a temporary git repository fixture and a stubbed client:
- empty registry;
- key versus signature precedence;
- a narrative mention is not ownership;
- a contested signature exits 2;
- an inline list is ignored;
- keyset paging over several pages, where a row updated mid-sweep is still enumerated exactly
  once;
- updated-since-recorded;
- resolver `present` / `absent` / `unknown`.

### Hosted

Apply to `masi-app-sqlite` (J2). Then read-only verification of columns, CHECK, indexes,
grants, both function signatures and properties, and one v1 call shaped like a pilot-build
request.

### Device

Smoke only, riding the next pilot build: force one terminal upload on the Galaxy A03s and see it
in `npm run bugs:incidents`. The failure modes above are proven in the real-SQLite and
PostgreSQL tiers, not on the device.

### End to end with the skill

Run `/bug-sync` against the staging receipts and create one real `MA-BUG` record.

## 14. Compatibility

- SQLite migration 20:
  - adds two nullable `sync_outbox` columns;
  - rebuilds `support_incident_queue` in the migration transaction;
  - adds `lastFailureKind` to the history cursor JSON (absent means unknown; no backfill).
- The server change is additive. New columns have defaults; v1 is untouched; there are no field
  users on `masi-app-sqlite`.
- An older bundle reading a newer database is already refused (`SCHEMA_TOO_NEW`).

## 15. Thresholds (first guesses, tuned from sweeps)

| Threshold | Value |
|---|---|
| Backlog age | 72 h |
| Server contact window | 24 h |
| History failure age | 24 h |
| Re-report cadence | 24 h |
| New conditions per reporter per day | 60 |
| Standing-observer throttle | 10 min |

`/bug-sync`'s improvement step proposes changes when a sweep shows them noisy or quiet.

## 16. Open questions (non-blocking)

Whether Sentry is configured in pilot builds. The skill records "Sentry unavailable" as a
result, never as a clean miss.

## 17. Check-solution pass (2026-10-29)

Dropped as NEVER (deleting them makes complexity vanish; no user-visible delta this cycle):
- the `upload_rejected_repeatedly` kind and its `first_failed_at` column (the backlog condition
  covers it);
- the roster-staleness trigger of `pull_failing` (no evidence; six readers of
  `last_pulled_at` to reason about; roster failures already reach Sentry);
- the material-field re-report table (the 24 h cadence plus release-change re-report covers
  it);
- `sent_generation`/`sent_occurrence_count` columns (the CAS uses the in-memory request);
- a server `install_id` column (the key prefix carries it);
- `gitCommit` in provenance (always `unknown`);
- `routeName` in app errors (needs navigation plumbing into the root boundary).

Kept in simplest form:
- `reconcile_breaker_tripped` (a one-line data-safety event).
- The server value schema (§7.3), which revision 2 strengthened at the review's request because
  a key-only check was not a privacy boundary.

Evidence caveat: Masi has no field receipts yet, so B1 for most kinds rests on Zazi's field
evidence from the same EA population.

## 18. Codex adversarial review, round 1 (2026-10-29): all 10 blocking findings accepted

| # | Finding | Resolution |
|---|---|---|
| 1 | SAVEPOINT impossible on the signed-in facade; storage errors roll back anyway | D7: atomic enqueue; payload validated before the transaction; every hooked transition safe to retry |
| 2 | Prune-and-recreate resets counters below the server's | §6.2: `queue_row_id`; a different id merges additively; the phone adopts the returned tuple |
| 3 | Key-only validation is not a privacy boundary | §7.3 value schemas on both sides; unknown tables normalized |
| 4 | Standing observer missed history failures with an empty outbox; `failureKind` not persisted | §5: observer runs from status refresh; `lastFailureKind` persisted and cleared |
| 5 | Resolver could declare existing records absent | §5 `RECORD_REF_TABLES` pinned to `buildSyncPayload`; §11.1 scans all ids; `unknown` when unproven |
| 6 | One key could carry a later, different cause | D8: `errorClass`/`errorCode` in the terminal key; reader lists updated-since-recorded |
| 7 | "Successful pass" does not prove server contact | §5.1 `lastServerResponseAt` at `fencedFetch` |
| 8 | Schema-1 rows had no delivery path | §9: they drain through v1, unchanged |
| 9 | Unknown-table finalizer had no CAS | §4.4 |
| 10 | Paging by mutable timestamp could skip rows | §11.1: immutable `(received_at, id)` with a fixed upper bound |
| 11 (non-blocking) | Drop counter might never reach the server | §7.2: moved to `delivery` |

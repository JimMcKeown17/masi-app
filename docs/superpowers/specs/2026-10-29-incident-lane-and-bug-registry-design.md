# Incident Lane, Upload Dispositions, and the MA-BUG Registry — Design

**Status:** revision 3, 2026-10-29.
- Revision 1 was trimmed by a check-solution pass.
- Two Codex adversarial rounds followed (§17). Revision 3 replaces the mutable per-condition
  aggregate with **immutable receipts**. It also replaces transactional incident hooks with
  **observation of durable state**. Both changes remove whole failure classes the reviews
  found.

**Roadmap item:** `documentation/ROADMAP.md` → "Minimum incident and provenance lane" and the
field-bug feedback loop under it (priority-order item 4).

**Inputs:**
- `documentation/zazi-sync-lessons-for-masi-2026-10-08.md` §"Field incidents and `/bug-sync`"
  (B1–B7), Z12–Z13.
- Plan 3's minimal envelope (`docs/superpowers/plans/2026-10-17-sign-out-and-incidents.md`).
- Zazi iZandi's `docs/bugs/`, `bug-sync`, `bug-user`, `scripts/read-sync-incidents.cjs` and
  `mobile_sync_support_incidents` migrations.

**Already built on this branch:**
- `docs/bugs/README.md` and `docs/bugs/_template.md`.
- The `bug-user` skill.

## 1. Goal

When something goes wrong on a phone that a person needs to know about, the phone records a
small, privacy-safe **incident** and delivers it to the server as a **receipt**. `/bug-sync`
sweeps receipts into the git-tracked bug registry (`docs/bugs/`) of evidence-led **MA-BUG**
records. People who describe a problem in their own words go through `/bug-user` into the same
registry.

**Cycle objective:** before EAs retest in November 2026, every field failure that needs a human
reaches Jim durably and can be swept into the registry.

### Non-goals (deferred, roadmap B7)

- A health panel or dashboard.
- Automatic recovery.
- User-health reconciliation.
- An in-app "Report a problem" screen.
- A retention/purge job (J3).
- Lifetime occurrence totals across a phone's forgotten queue rows.
- Automatic whole-estate record resolution.
- Converting domain uploads to protocol-v2 RPCs.

## 2. Decisions

Jim, 2026-10-29:

| # | Decision |
|---|---|
| J1 | Phones capture **sync conditions plus caught app errors**. Native crashes stay Sentry-only. |
| J2 | The server migration is applied to `masi-app-sqlite` once the disposable-PostgreSQL harness passes, through the guarded `sqlite-staging` helper, then verified read-only. Never the legacy backend. |
| J3 | Receipts are kept through the pilot. No purge job now. Auth-user deletion still cascades. |

Design decisions:

| # | Decision | Why |
|---|---|---|
| D1 | **Extend** Plan 3's queue, table and RPC. No second queue or table. | Roadmap rule; Plan 3 already solved actor binding, fencing, backoff and per-EA files. |
| D2 | **Receipts are immutable.** Each report the phone sends is one server row identified by `(reporter_id, report_id)`. The server only inserts or ignores. The reader groups receipts into conditions. | Mutable aggregates were the source of every merge, adoption, restore and watermark defect in review rounds 1–2. Insert-or-ignore is idempotent under retries, lost acknowledgements, reordering, pruning and database restore. |
| D3 | Structured `error_class` and `error_code` on `sync_outbox`, written by the same `UPDATE` that sets the failure status. | Roadmap Z12/Z13. It also makes terminal rows observable as durable state (D4). |
| D4 | **Incidents are observed from durable state, not emitted from inside domain transitions.** One observer runs on every sync-status refresh. It reads terminal outbox rows, reconcile-breaker notes, the unsent backlog and history cursors, and records conditions in its own transaction. Only `app_error_caught` is an event, in its own transaction. | A failing incident write inside a finalizer could turn a parked `MV001` stale-write rejection into a retry that overwrites newer server data (review round 2, #1). Observation can never alter a domain transition. |
| D5 | Record identity leaves the phone only as a one-way **record ref** (UUIDv5), and only for tables whose local id is the server id. | Plan 3's rule (no child ids in incidents) plus B4's "is it on the server?". |
| D6 | Provenance is captured **when the condition is observed**. Delivery metadata is a separate object. | A receipt queued before an OTA must not claim the new release. |
| D7 | Registry IDs are `MA-BUG-YYYYMMDD-NNN`. No Zazi records, people or learned mappings are copied. | |
| D8 | The condition key of an upload receipt includes its `errorClass` and `errorCode`. A changed cause is a new, unrecorded condition. | A key must not inherit an earlier cause's registry ownership. |

## 3. Vocabulary

Add to `CONTEXT.md`:

- **Incident** — a phone's record that it observed a reportable condition, in
  `support_incident_queue`.
- **Condition** — what an incident is about: `(reporter, kind, condition key)`.
- **Receipt** — one immutable server row in `mobile_support_incidents`: one report of one
  condition. A condition persisting for days produces about one receipt per day. A receipt is a
  lead, not proof: it says a phone observed something, not that data was lost, that the problem
  is current, or that it is fixed.
- **Bug record** — one causal problem in `docs/bugs/records/`.
- **Upload disposition** — the `error_class` of an unsent outbox row.

## 4. Upload dispositions on `sync_outbox`

### 4.1 Columns (SQLite migration 20)

| Column | Type | Meaning |
|---|---|---|
| `error_class` | text, CHECK in §4.2 | Disposition of the most recent failure. Null until the row first fails. |
| `error_code` | text, CHECK `^[A-Z0-9_]{1,40}$` | Normalized code (§4.3). Never free text. |

They are set in the same `UPDATE` that sets `status` on every failure path:
- `finalizeRetriableFailure`
- `finalizeTerminalFailure`
- `finalizeOutboxOnlyTerminalFailure`
- `finalizeManyRetriableFailure`
- the foreign-owner quarantine in `syncOutboxRepository.js`

`last_error` stays as the human-readable reason in Sync Status and never leaves the phone.

### 4.2 Classes and owners

| `error_class` | Produced when | Owner and procedure |
|---|---|---|
| `retryable` | A returned server error with no specific rule; a thrown request (`TRANSPORT`) | Sync engine retries. Covered in aggregate by `upload_backlog_stale`. |
| `needs_parent` | `23503`, `42501`, `UPDATE_NOT_APPLIED` while local parent or grant evidence is pending | Sync engine; clears when the parent uploads. Aggregate only. |
| `needs_reauth` | `28000`; a `42501` downgraded because no live session existed | The EA signs in again. Aggregate only. |
| `terminal` | Every path that sets `status = 'terminal'` | Support and engineering through `/bug-sync`. `ARCHIVE_REQUIRED` is an EA action; every other code is a bug lead. |

`dispositionFor({ classification, failureCode, parentEvidencePending, downgradedForNoSession })`
sits beside `classifyError` in `src/services/offlineSync.js` and returns `{ errorClass,
errorCode }`.

### 4.3 Code normalization

`normalizeErrorCode(raw)`:
- Uppercases the code.
- Keeps it if it matches `^[A-Z0-9_]{1,40}$`.
- Otherwise returns `TRANSPORT` (thrown request), `UNKNOWN_TABLE` (unknown-table path),
  `FOREIGN_OWNER` (quarantine), or `OTHER`.

## 5. Incident kinds and the observer

### 5.1 The observer

`observeStandingConditions(handle)`:
- Called from the sync-status refresh path. That path already runs on the 30-second active
  poll, on foreground, on initial load and after each sync pass, whether or not upload work
  exists.
- Its observation is a few indexed `SELECT`s over the signed-in EA's own file, plus one write
  transaction only when something changed.
- No throttle.
- It also runs once when connectivity returns. The reconnect path calls
  `refreshSyncStatus`, or the observer directly. The plan pins which.
- If it records a condition that needs sending, the existing `incidentReadyCount` scheduling
  triggers a drain.

`app_error_caught` is the only event producer. It is called from
`ErrorBoundary.componentDidCatch` when an EA handle is open, in its own transaction. Without a
handle it is Sentry only.

### 5.2 Kinds

| Kind | Observed from | Condition key parts | Payload (schemas §7.3) |
|---|---|---|---|
| `upload_terminal` | Each `sync_outbox` row owned by the signed-in EA with `status = 'terminal'` | `table`, `record_id`, `operation`, outbox `created_at`, `errorClass`, `errorCode` | `table`, `operation`, `errorClass`, `errorCode`, `retryCount`, `recordRef` |
| `upload_backlog_stale` | The EA's oldest `pending`/`failed` row is older than 72 h **and** `handle.lastServerResponseAt` is within 24 h (§5.3) | `'backlog'` | `unsentByClass`, `unsentByTable`, `oldestUnsentAgeHours` |
| `reconcile_breaker_tripped` | Each `sync_state` row with scope prefix `pull_reconcile_breaker:` | scope family (the table name, never the scope string) | `scopeFamily`, `candidateCount`, `wouldEndCount` |
| `pull_failing` | Each history cursor whose `lastFailureAt` is ≥ 24 h old, with `lastFailureKind` in `transport`, `query`, `disabled`, `year_mismatch` | `scopeFamily`, `failureKind` | `scopeFamily`, `failureKind`, `failingForHours` |
| `app_error_caught` | Event (§5.1) | `errorName`, `messageDigest`, first component | `errorName`, `messageDigest`, `components` |
| `left_behind_unsent_work`, `foreign_owner_in_file`, `legacy_shared_file_unsent` | Plan 3, unchanged | unchanged | unchanged |

Rules:

- **Never incidents:**
  - ordinary retries;
  - offline passes;
  - CAS misses;
  - stale-actor cancellations;
  - history page-budget stops;
  - dependency skips;
  - a history walker stopped for a missing dependency.
- A condition resolved before the next refresh (a terminal row retried successfully within
  30 s; a breaker trip applied at once) may never be reported. That is accepted: it recovered,
  and Sentry still sees it.
- `recordRef = incidentRepeatKey('record', table, record_id)` only for tables in
  `RECORD_REF_TABLES`: outbox tables whose server id equals the local `record_id`.
  `buildSyncPayload` (`offlineSync.js:561-635`) rewrites ids for at least `session_attendees`,
  `assessment_items`, `child_ea_assignments`, `child_programme_enrollments`,
  `class_ea_assignments`, `group_ea_assignments` and `class_grouping_state`; its RPC delegates
  are included. A test pins the list against `buildSyncPayload`. Other tables send
  `recordRef: null`.
- `historyWalk.js` persists `lastFailureKind` in the same cursor write as `lastFailureAt`
  (`historyWalk.js:285-295`) and clears both on success (`historyWalk.js:149`).

### 5.3 Server-response evidence

`fencedFetch` (`src/session/handleDataClient.js`) records `handle.lastServerResponseAt` (in
memory) whenever a response arrives with status < 500. It is not persisted, and there is no
throttle that could consume a refresh before contact exists (review round 2, #4): the backlog
condition is recorded on the first refresh after real contact. `lastSuccessfulSyncTime` is not
used, because it is set even when every upload failed on transport.

## 6. Phone queue and reporting cadence

### 6.1 `support_incident_queue` (rebuilt in SQLite migration 20; SQLite cannot alter a CHECK)

| Column | Meaning |
|---|---|
| `id` | Local row uuid; a new one each time the row is created. |
| `kind`, `repeat_key` | As today; `repeat_key` is the condition-key digest. Unique `(kind, repeat_key)`. |
| `schema_version` | `1` for rows copied from migration 13; `2` for new rows. |
| `payload`, `observed`, `first_observed` | The live condition: body (§5.2), provenance at `last_seen_at` (§7.1), and `{ appVersion, buildNumber, updateId }` at `first_seen_at`. JSON. Null provenance for schema-1 rows. |
| `occurrence_count` | Event kinds count occurrences. Observed kinds stay at 1, because a persisting condition is one occurrence. |
| `first_seen_at`, `last_seen_at` | The observation interval, stored as `min`/`max`. |
| `report_generation` | Starts at 1. Increments each time a new report becomes due. |
| `report_snapshot` | JSON of the frozen report body, or null. Written at the first send attempt of a generation. |
| `status` | `pending`, `sent`, `rejected`. |
| `last_sent_at`, `last_sent_release` | When the last report was acknowledged and the release identity it carried. |
| `attempts`, `next_attempt_at`, `last_error` | Backoff state. `last_error` holds a code token only. |
| `created_at`, `updated_at` | As today. |

`report_id = uuidv5(id + ':' + report_generation, INCIDENT_NAMESPACE)`. It is computed, not
stored.

### 6.2 Recording an observation

`record(txn, kind, conditionParts, payload, { event })`:

1. **No row** → insert: generation 1, `pending`, `report_snapshot` null.
2. **Row exists** → update the live condition: `payload`, `observed`, interval; increment
   `occurrence_count` if `event`. Then:
   - `pending` with no snapshot → nothing else; the next drain sends the live state.
   - `pending` with a snapshot → nothing else. The frozen report finishes first; the live
     changes ride the next generation.
   - `sent` → if the release identity differs from `last_sent_release`, or `last_sent_at` is
     ≥ 24 h ago: increment `report_generation`, clear `report_snapshot`, set `pending`.
   - `rejected` → unchanged.

Capacity stays 200 rows:
- Prune closed rows oldest-first.
- If every row is `pending`, drop the new incident and increment
  `local_state.support_incidents_dropped` (a cumulative counter).

A pruned condition that recurs gets a new row `id`, so its reports carry new `report_id`s and
arrive as new receipts. Nothing is merged or double-counted.

### 6.3 Draining

`drainSupportIncidents`, bounded to 20 rows, after domain uploads, never under another EA's
session (all as Plan 3):

- **Schema-1 rows** drain through v1 exactly as today, with the drain-time envelope.
- **Schema-2 rows:**
  1. If `report_snapshot` is null, build it from the live condition and store it. This is the
     freeze.
  2. Send `snapshot + delivery` (§7.2) to v2.
  3. Then:
     - `inserted` or `duplicate` → one transaction: `status = 'sent'`, `last_sent_at`,
       `last_sent_release`, clear `report_snapshot`, **where `report_generation` still equals
       the sent generation**. If the row moved on meanwhile (a newer generation became due), it
       stays as it is.
     - `22023` → `rejected`.
     - `54000`, transport and auth → backoff, keep the snapshot, stop this drain.
     - Stale actor → propagate.
- A process death between send and acknowledgement resends the same snapshot with the same
  `report_id`; the server ignores the duplicate. A restored older database resends old
  `report_id`s, which are also ignored.

## 7. Provenance, payload schemas and privacy

### 7.1 Observation provenance (`observed`)

Captured synchronously at observation. No AsyncStorage reads inside SQLite transactions.

- `appVersion`, `buildNumber`, `releaseLabel`, `runtimeVersion`, `updateChannel`,
  `osVersion`, `deviceModel` (`Device.modelName`, never `deviceName`): `label` or null.
- `updateId`: UUID or null.
- `isEmbeddedLaunch`, `isEmergencyLaunch`: boolean.
- `platform`: `ios` or `android`.
- `backendProjectId`: `^[a-z]{20}$`.
- `sqliteSchemaVersion`: integer.

### 7.2 Delivery metadata (`delivery`, added at send time)

- `installId`: UUID; must equal the `repeat_key` prefix.
- `appVersion`, `buildNumber`, `updateId`.
- `droppedIncidents`: the cumulative counter, so drops are reported on the next delivery of any
  row.

### 7.3 Value schemas (one builder per kind on the phone; re-checked by the server)

| Type | Rule |
|---|---|
| `table` | One of the push-order tables (`offlineSync.js:73-143`) or `unknown` |
| `operation` | `insert`, `update`, `archive`, `hard_delete`, `restore` |
| `errorClass` | §4.2 |
| `errorCode` | `^[A-Z0-9_]{1,40}$` |
| `recordRef`, `messageDigest`, UUIDs | Canonical lowercase UUID, or null where allowed |
| `scopeFamily` | Closed set: the four breaker tables and the history families |
| `failureKind` | `transport`, `query`, `disabled`, `year_mismatch` |
| `errorName` | `^[A-Za-z][A-Za-z0-9_]{0,63}$`; otherwise `Error` |
| `components` | ≤ 5 strings matching `^[A-Z][A-Za-z0-9]{0,63}$` |
| integers | 0–1,000,000 |
| `unsentByClass` | Object; keys from the `errorClass` set plus `none`; integer values |
| `unsentByTable` | Object; keys from the `table` set; integer values |
| `label` | String ≤ 64 chars matching `^[A-Za-z0-9 ._:+()/-]*$` |

Every object is closed; unknown keys are rejected (`22023`).

One residual is documented: the server cannot tell a UUIDv5 digest from a raw domain UUID, so
that guarantee rests on the single builder and its tests.

**Never in an incident:**
- domain payloads;
- `last_error` or server messages;
- exception messages or stacks;
- child, school, class or group ids or names;
- notes;
- coordinates;
- scope strings;
- `deviceName`.

This is pseudonymous: `reporter_id` is the EA's auth id, deliberately.

### 7.4 Size

8,192 bytes on the final envelope. The phone refuses a body over 6,144 bytes when recording, so
delivery metadata fits. An oversize envelope at send is marked `rejected` locally with code
`TOO_LARGE`, without a request.

## 8. Server

New migration `supabase/migrations/2026103012xxxx_incident_receipts.sql`. Session-level
`SET`/`RESET`, never `SET LOCAL`.

### 8.1 Table changes (`public.mobile_support_incidents`)

- Widen the `kind` CHECK to the eight kinds.
- Add:
  - `report_id uuid`
  - `schema_version smallint not null default 1`
  - `report_generation integer not null default 1`
  - `occurrence_count integer not null default 1`
  - `first_seen_at timestamptz`, `last_seen_at timestamptz`
- Backfill `report_id` for existing rows from `md5(kind || chr(0) || repeat_key)::uuid`. Then:
  - set it `not null`;
  - drop the constraint `mobile_support_incidents_once`;
  - add unique `(reporter_id, report_id)`.
- Index `(reporter_id, kind, repeat_key)` for grouping, and `(received_at, id)` for paging.
- Rows are never updated. `service_role` SELECT only; re-assert the revoke explicitly.

### 8.2 RPCs

`report_mobile_support_incident_v2(p_envelope jsonb) returns jsonb`:
- SECURITY DEFINER, empty `search_path`, actor from `auth.uid()`.
- The envelope: `{ schema_version: 2, kind, repeat_key, report_id, report_generation,
  occurrence_count, first_seen_at, last_seen_at, payload, observed, first_observed, delivery }`.
- It validates §7.3 per kind, `first_seen_at <= last_seen_at`, and that `delivery.installId`
  matches the key prefix.
- It inserts `on conflict (reporter_id, report_id) do nothing` and returns
  `{ status: 'inserted' | 'duplicate' }`.
- Errors: `28000`, `22023`, `54000`.

`report_mobile_support_incident(text, text, jsonb)` (v1) keeps its signature and observable
behaviour. It still dedupes one row per reporter, kind and repeat key, and returns a boolean.
It is the only deployed function whose body changes: its insert computes the same derived
`report_id` and targets the new unique constraint. The harness pins its behaviour before and
after. This is a deliberate exception to the roadmap's "never change a deployed RPC in place"
convention, because the constraint it named must go. Its body md5 is recorded in the build
log.

### 8.3 Limits

At most **100 receipts per reporter per rolling 24 h**, any kind (`54000`). Duplicates are not
counted. The phone treats `54000` as transport: back off, keep the row.

### 8.4 Harness

Extend `scripts/support-incident-postgres-harness.cjs` to cover:
- v1 behaviour identical before and after the migration;
- v2 insert, duplicate, and a retry with the same `report_id`;
- two generations of one condition as two receipts;
- a restored database replaying old `report_id`s as duplicates;
- per-kind schema rejections with hostile values under allowed keys (a child name as
  `errorCode`, a sentence as `errorName`, a nested object in `unsentByTable`, an unknown
  table);
- install-prefix mismatch;
- an inverted interval;
- the rate limit;
- grants, with no authenticated table access.

## 9. Support export (B6)

Profile → Share database adds:
- `error_class` and `error_code` on failed/terminal outbox rows.
- A `supportIncidents` section: every queue row's kind, status, generation, interval, payload
  and `observed`.
- A `recordRefs` map from each failed/terminal outbox row to its `recordRef`. Join it to a
  receipt only after confirming the export belongs to the receipt's reporter (B5).

## 10. Operator side

### 10.1 Reader: `scripts/read-support-incidents.cjs` (`npm run bugs:incidents`)

**Access.**
- Read-only, using supabase-js with `SUPABASE_SECRET_KEY_SQLITE` and
  `SUPABASE_PROJECT_URL_SQLITE`.
- Both are parsed from `.env.local` as data, never sourced.
- It refuses any URL other than `https://segygjzpujphwvrubusm.supabase.co`.

**Enumeration.**
- Always the full receipt set, by keyset on the immutable `(received_at, id)`, with an upper
  bound fixed at start.
- Receipts never change, so the enumeration is exact for everything received before the
  sweep began.
- There is no limit or `--since` that affects coverage. `--actor`, `--kind` and `--since` are
  display filters applied after enumeration. A filtered run never reports coverage.

**Conditions.** Receipts are grouped by `(reporter_id, kind, repeat_key)`. Each condition
shows:
- its receipt count;
- the first and latest `first_seen_at`/`last_seen_at`;
- the latest receipt's payload and `observed` release;
- the distinct releases that reported it.

**Registry.**
- `--registry-ref <ref>` (default `origin/main`) loads `docs/bugs/records/*.md` from that git
  tree. An empty registry is valid.
- Only block-list frontmatter is parsed for `support_incident_keys` and
  `support_incident_signatures`.

**Matching.**
- Exact condition keys `<reporter_id>/<kind>/<repeat_key>` match first, then signatures.
- A signature declared by two records → exit code 2, with no coverage claim.

**Signatures** (`<kind>/<a>/<b>`):

| Kinds | `a` / `b` |
|---|---|
| upload | `errorClass` / `errorCode` |
| pulls | `scopeFamily` / `failureKind` |
| breakers | `scopeFamily` / `-` |
| app errors | `errorName` / first 8 of `messageDigest` |
| backlog | `-` / `-` |

**Review window.**
- `--review-since <ISO>` lists recorded conditions with receipts received after that time.
- The skill passes the README Coverage table's previous **Last full sweep** time.
- This is a display, not a reviewed/unreviewed claim. It surfaces recurrence and
  new-release receipts for known bugs without inferring review state from record edit times
  (review round 2, #5).

**Report order:**
1. Unrecorded conditions.
2. Recorded conditions with receipts in the review window.
3. Breadth (distinct reporters).
4. By affected record (`recordRef`).
5. By signature.

Handles are `<kind-abbrev>:<first 8 hex of sha256(reporter/kind/repeat_key)>`. The output says
counts are raw and unscoped.

**`--resolve <handle>`** (optional, SELECT only, one condition at a time). It pages through all
ids of the receipt's table (no reporter filter) and hashes them. The result:
- `present` — a hashed id matches;
- `absent` — the scan completed and nothing matched;
- `unknown` — the scan was incomplete or the ref is null.

Existence is not convergence.

### 10.2 Registry — built

- `docs/bugs/README.md`, `_template.md`, `records/`, `evidence/`.
- `.gitignore` excludes private submissions.
- Revision 3 adjusts the README: receipts are immutable and grouped into conditions; exact keys
  are condition keys; the coverage sweep passes `--review-since`.

### 10.3 Skills

**`bug-sync`** is a new skill: `.agents/skills/bug-sync/SKILL.md` plus `agents/openai.yaml`,
with a `.claude/skills/bug-sync` symlink. It is Zazi's skeleton adapted:
- SWEEP (default) / INVESTIGATE / FIX (explicit only);
- start from `origin/main`;
- a full sweep with `--review-since`;
- what a receipt does and does not prove;
- for an upload condition, `--resolve` before diagnosing;
- Sentry with valid-query negative evidence;
- exact keys by default, signatures only for single-owner conditions;
- land records on `origin/main` with authorization;
- the finish-the-turn report;
- propose improvements.

It carries the Masi source map. Its **Learned mappings** table starts empty.

**`bug-user`** is built.

**`AGENTS.md`** routes to both.

## 11. Standing documentation (same branch)

- `CONTEXT.md` (§3).
- `documentation/rls-sync-contract-map.md`: outbox columns, the eight kinds, v2 RPC, the v1
  body change, grants, the D4 rule that observation never writes inside domain transitions.
- `documentation/ROADMAP.md`: tick the lane items; leave B7 open.
- `documentation/build-log.md`.
- `documentation/LEARNING.md`: why receipts became immutable and incidents observed, told
  through the two review rounds.
- `AGENTS.md` routing.

## 12. Verification

### Real SQLite, through `test-support/defaultTestHandle.js` (the production facade)

TDD through public interfaces:

- migration 20: queue rebuilt; Plan 3 rows kept as schema 1; outbox columns added;
- dispositions written by every failure path, including the batch finalizer and the
  foreign-owner quarantine;
- the observer:
  - one `upload_terminal` per terminal row;
  - a second code on the same mutation is a second condition;
  - breaker notes;
  - backlog only with server contact (all-transport passes, empty passes and a cold launch
    before contact do not report; the first refresh after contact does);
  - `pull_failing` with an **empty outbox**;
  - repeated observation leaves one condition and one pending report;
- `record`: generation rules; the snapshot freeze; the 24 h and release-change re-report;
  prune-and-recreate gives a new row id; the drop counter reaches `delivery` after saturation
  with no further observations;
- the drain:
  - process death between send and acknowledgement resends the same `report_id`;
  - a concurrent new generation is not marked sent by an old acknowledgement;
  - schema-1 rows go via v1;
  - final-envelope size;
- EA switching: one EA's queue never drains under another's session;
- an observer failure leaves domain state and the outbox untouched;
- privacy: no `deviceName`, record ids, messages, scope strings or non-schema values in any
  sent request; `RECORD_REF_TABLES` pinned against `buildSyncPayload`.

### Disposable PostgreSQL

The §8.4 harness.

### Reader

Unit tests with a temporary git repository fixture and a stubbed client:
- empty registry;
- key versus signature precedence;
- a narrative mention is not ownership;
- a contested signature exits 2;
- an inline list is ignored;
- multi-page keyset enumeration;
- display filters never change coverage;
- `--review-since`;
- `--resolve` present / absent / unknown.

### Hosted

Apply (J2). Then read-only checks of columns, constraint swap, indexes, grants, both functions'
properties, and a v1 call shaped like a pilot-build request.

### Device

Smoke on the next pilot build: one forced terminal upload on the Galaxy A03s appears in
`npm run bugs:incidents`. Failure modes are proven in the tiers above.

### End to end

`/bug-sync` over the staging receipts records one real `MA-BUG`.

## 13. Compatibility

- SQLite migration 20:
  - adds two nullable outbox columns;
  - rebuilds `support_incident_queue`, copying rows as schema 1;
  - `lastFailureKind` is a new optional cursor field (absent means unknown).
- The server change is additive except the documented v1 body and constraint swap. There are no
  field users on `masi-app-sqlite`; installed 1.4.0 pilot builds keep their v1 behaviour.
- `SCHEMA_TOO_NEW` already refuses an older bundle on a newer database.

## 14. Thresholds (first guesses, tuned from sweeps)

| Threshold | Value |
|---|---|
| Backlog age | 72 h |
| Server contact window | 24 h |
| History failure age | 24 h |
| Re-report cadence | 24 h |
| Receipts per reporter per day | 100 |

## 15. Open question (non-blocking)

Whether Sentry is configured in pilot builds. The skill records "unavailable", never a clean
miss.

## 16. Check-solution passes

**Revision 1** dropped:
- the `upload_rejected_repeatedly` kind and `first_failed_at`;
- the roster-staleness trigger;
- the material-field re-report table;
- sent-tuple columns;
- a server `install_id` column;
- `gitCommit`;
- `routeName`.

**Revision 3**, after the round-2 simplicity assessment, dropped:
- server-side aggregation (additive merge, tuple adoption, `queue_row_id`, `last_received_at`);
- transactional incident hooks and the unknown-table CAS that only they needed;
- the observer throttle;
- `--since` as a coverage-bearing filter;
- automatic whole-estate record resolution in the sweep (now targeted `--resolve`);
- updated-since-recorded inferred from record edit times.

Evidence caveat: Masi has no field receipts yet; B1 rests mostly on Zazi's field evidence from
the same EA population.

## 17. Codex adversarial reviews

### Round 1: 10 blocking findings, accepted in revision 2

1. SAVEPOINT on the facade.
2. Prune resets counters.
3. Key-only privacy check.
4. Observer missed history failures with an empty outbox.
5. Resolver false absences.
6. A key inherited a later cause.
7. "Successful pass" ≠ server contact.
8. Schema-1 delivery.
9. Unknown-table CAS.
10. Mutable paging.
11. Drop counter (non-blocking).

### Round 2: 6 blocking findings, resolved in revision 3 by redesign

| # | Finding | Resolution |
|---|---|---|
| 1 | A failed incident write inside a terminal finalizer could retry an `MV001` stale write with a bumped `row_version` and overwrite newer server data | D4: incidents are observed from durable state; nothing writes inside domain transitions |
| 2 | Tuple adoption could lose observations made during delivery | D2: immutable receipts; a frozen snapshot per generation; acknowledgement CAS on the generation |
| 3 | A restored queue row could double-count | D2: insert-or-ignore on `report_id`; nothing aggregates |
| 4 | The observer throttle could suppress backlog reporting on short cold launches | No throttle (§5.3) |
| 5 | Record edit time cannot acknowledge receipt updates | `--review-since` from the Coverage table; no inferred review state |
| 6 | Mutable `--since` filtering skipped updates | Full enumeration always; filters are display-only; receipts are immutable |

Retained from round 1 as confirmed:
- closed value schemas;
- observation independent of upload work;
- null refs for rewritten ids;
- schema-1 via v1;
- `fencedFetch` contact evidence;
- immutable `received_at` paging;
- causal class in the terminal key.

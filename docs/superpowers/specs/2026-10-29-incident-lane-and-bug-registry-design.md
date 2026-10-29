# Field Diagnostics: Incident Receipts, Diagnostic Bundles, and the MA-BUG Registry — Design

**Status:** revision 4.1, 2026-10-29.

| Revision | Change |
|---|---|
| 1 | Trimmed by a check-solution pass. |
| 2–3 | Three Codex adversarial rounds (§16). Receipts became immutable; incidents became observed from durable state rather than written inside domain transactions. |
| 4 | Jim's capture-everything direction (J4), diagnostic bundles, Send diagnostics, Report a problem (J5–J6), and the round-3 fixes. |
| 4.1 | Round-4 fixes: native-module preflight for the picker; bounded bundle capture; queue fairness; promotion in the observer; a capture gate before delivery. Spec review is closed at four rounds; the plan gets its own review. |

**Roadmap item:** `documentation/ROADMAP.md` → "Minimum incident and provenance lane" and the
field-bug feedback loop under it (priority-order item 4).

**Inputs:**
- `documentation/zazi-sync-lessons-for-masi-2026-10-08.md` (B1–B7, Z12–Z13).
- Plan 3 (`docs/superpowers/plans/2026-10-17-sign-out-and-incidents.md`).
- Zazi iZandi's `docs/bugs/`, `bug-sync`, `bug-user` and receipt reader.

**Already built on this branch:**
- `docs/bugs/README.md` and `docs/bugs/_template.md`.
- The `bug-user` skill.

## 1. Goal

Make the field loop **collect → diagnose → fix → release** as fast as possible for the
November 2026 field test. Phones report problems automatically and carry the evidence with
them. EAs can report a problem or send diagnostics in one tap. `/bug-sync` and `/bug-user` sweep
everything into the git-tracked `MA-BUG` registry.

**Cycle objective:** during the field month, every failure that needs a human reaches Jim with
enough evidence to diagnose it without a follow-up conversation.

### Non-goals (deferred)

- A web health panel.
- Automatic recovery.
- User-health reconciliation.
- A retention/purge job (J3).
- Lifetime occurrence totals across a phone's forgotten queue rows.
- A raw SQLite file upload (the JSON support export is used instead; §9.2).
- Converting domain uploads to protocol-v2 RPCs.

## 2. Decisions

Jim, 2026-10-29:

| # | Decision |
|---|---|
| J1 | Phones capture sync conditions plus caught app errors. Native crashes stay Sentry-only. |
| J2 | Server migrations are applied to `masi-app-sqlite` once the disposable-PostgreSQL harness passes, through the guarded `sqlite-staging` helper, then verified read-only. Never the legacy backend. |
| J3 | Receipts and bundles are kept through the pilot. No purge job now. |
| J4 | **Capture too much rather than too little.** Permission slips cover EAs and children, so diagnostics carry raw ids, payloads, server error text, exception messages and stacks, log tails, full device detail (including device name), and EA identity. Access stays service-role only. |
| J5 | Add an **automatic diagnostic bundle**, a **Send diagnostics** button, and a **Report a problem** button. |
| J6 | Add `expo-image-picker` for an optional screenshot on Report a problem, shown only on builds that contain the native module. |

Design decisions:

| # | Decision | Why |
|---|---|---|
| D1 | Extend Plan 3's queue, table and RPC. No second receipt table. | Roadmap rule. |
| D2 | **Receipts are immutable**, identified by `(reporter_id, report_id)`. The server inserts or ignores. The reader groups receipts into conditions. | Idempotent under retries, lost acknowledgements, reordering, pruning and restore (review rounds 1–2). |
| D3 | Structured `error_class` and `error_code` on `sync_outbox`, set by the same `UPDATE` as the failure status, with a migration backfill for existing failed rows. | Roadmap Z12/Z13; makes terminal rows observable. |
| D4 | **Incidents are observed from durable state**, never written inside domain transactions. One observer runs on each sync-status refresh. Only `app_error_caught`, `ea_report` and `diagnostics_sent` are events, each in its own transaction. | A failed incident write inside a terminal finalizer could replay an `MV001` stale write over newer server data (review round 2, #1). |
| D5 | Big evidence (support export, logs, screenshot) travels as a **bundle** in a private Storage bucket. The receipt carries the bundle's path. | Rows stay small and sweepable; Zazi's hardest bugs needed exports, not receipts. |
| D6 | Provenance is captured at observation; delivery metadata is separate. | A receipt queued before an OTA must not claim the new release. |
| D7 | Registry IDs `MA-BUG-YYYYMMDD-NNN`; no Zazi records, people or mappings copied. | |
| D8 | The `upload_terminal` condition key includes `errorClass` and `errorCode`. | A changed cause is a new, unrecorded condition. |

## 3. Vocabulary

Add to `CONTEXT.md`:

- **Incident** — the phone's record that it observed a reportable condition
  (`support_incident_queue`).
- **Condition** — what an incident is about: `(reporter, kind, condition key)`.
- **Receipt** — one immutable server row in `mobile_support_incidents`: one report of one
  condition. A persisting condition sends about one a day. A lead, not proof.
- **Diagnostic bundle** — a JSON file uploaded to Storage holding the support export, a log
  tail and device state at the moment it was captured.
- **EA report** — an EA's own description of a problem, sent from Report a problem.
- **Bug record** — one causal problem in `docs/bugs/records/`.
- **Upload disposition** — the `error_class` of an unsent outbox row.

## 4. Upload dispositions on `sync_outbox`

### 4.1 Columns (SQLite migration 20)

| Column | Type | Meaning |
|---|---|---|
| `error_class` | text, CHECK in §4.2 | Disposition of the most recent failure. Null until the row first fails. |
| `error_code` | text, CHECK `^[A-Z0-9_]{1,40}$` | Normalized code (§4.3). |

They are set in the same `UPDATE` as `status` on every failure path:
- `finalizeRetriableFailure`
- `finalizeTerminalFailure`
- `finalizeOutboxOnlyTerminalFailure`
- `finalizeManyRetriableFailure`
- the foreign-owner quarantine in `syncOutboxRepository.js`

Migration 20 backfills existing rows: `terminal` → (`terminal`, `OTHER`); `failed` →
(`retryable`, `OTHER`). This never derives a code from `last_error` and never replays an
upload. `last_error` keeps the human-readable reason and is now **sent** in receipts (J4).

### 4.2 Classes

| `error_class` | Produced when | Owner |
|---|---|---|
| `retryable` | A returned server error with no rule; a thrown request (`TRANSPORT`) | Sync engine; aggregate in `upload_backlog_stale` |
| `needs_parent` | `23503`, `42501`, `UPDATE_NOT_APPLIED` with pending parent or grant evidence | Sync engine; aggregate |
| `needs_reauth` | `28000`; a `42501` downgraded because no live session existed | The EA signs in; aggregate |
| `terminal` | Every path that sets `status = 'terminal'` | `/bug-sync`. `ARCHIVE_REQUIRED` is an EA action; every other code is a bug lead. |

`dispositionFor(...)` sits beside `classifyError` in `src/services/offlineSync.js` and returns
`{ errorClass, errorCode }`.

### 4.3 Code normalization

`normalizeErrorCode(raw)`:
- Uppercases the code and keeps it if it matches `^[A-Z0-9_]{1,40}$`.
- Otherwise returns `TRANSPORT`, `UNKNOWN_TABLE`, `FOREIGN_OWNER` or `OTHER`.

## 5. Incident kinds and the observer

### 5.1 The observer

`observeStandingConditions(handle)`:
- Runs on every sync-status refresh. That covers the 30-second active poll, foreground,
  initial load, after each sync pass, and on reconnect. The plan pins the reconnect call.
- No throttle.
- A few indexed `SELECT`s over the signed-in EA's file, then one write transaction only when
  something changed.
- An observer failure is logged and never touches domain or outbox state.

Event producers, each in its own transaction:
- `app_error_caught` from `ErrorBoundary.componentDidCatch` while a handle is open (Sentry only
  otherwise);
- `ea_report` from Report a problem;
- `diagnostics_sent` from Send diagnostics.

### 5.2 Kinds

| Kind | Source | Condition key parts | Payload |
|---|---|---|---|
| `upload_terminal` | Each terminal `sync_outbox` row owned by the EA | `table`, `record_id`, `operation`, outbox `created_at`, `errorClass`, `errorCode` | `table`, `operation`, `recordId`, `serverRecordId`, `errorClass`, `errorCode`, `lastError`, `retryCount`, `outboxCreatedAt`, `outboxUpdatedAt`, `wirePayload` (the result of `buildSyncPayload(table, payload, operation)`, truncated per §7.3) |
| `upload_backlog_stale` | The oldest `pending`/`failed` row is older than 72 h **and** `handle.lastServerResponseAt` is within 24 h (§5.3) | `'backlog'` | `unsentByClass`, `unsentByTable`, `unsentByCode`, `oldestUnsentAgeHours`, `oldestUnsent` (table, record id, operation, class, code, `lastError`), `sampleLastErrors` (≤ 10 distinct) |
| `reconcile_breaker_tripped` | Each `sync_state` row with prefix `pull_reconcile_breaker:` | breaker scope | `scope`, `scopeFamily`, `candidateCount`, `wouldEndCount`, `triggeredAt` |
| `pull_failing` | Each history cursor with `lastFailureAt` ≥ 24 h old, with no success since | `scopeFamily`, `failureKind` | `scope`, `scopeFamily`, `failureKind`, `lastFailureMessage`, `failingForHours`, `cursor` (the cursor JSON) |
| `app_error_caught` | Event | `errorName`, normalized-message digest, first component | `errorName`, `message`, `stack`, `componentStack`, `components` |
| `ea_report` | Event: Report a problem | report id (each report is its own condition) | `message` (≤ 4,000 chars), `screenshotAttached`, `screen` (`Profile`) |
| `diagnostics_sent` | Event: Send diagnostics | request id | `trigger: 'manual'` |
| `left_behind_unsent_work`, `foreign_owner_in_file`, `legacy_shared_file_unsent` | Plan 3, unchanged | unchanged | unchanged |

Rules:

- **Never incidents:**
  - ordinary retries;
  - offline passes;
  - CAS misses;
  - stale-actor cancellations;
  - history page-budget stops;
  - dependency skips;
  - a walker stopped for a missing dependency.
- A condition resolved before the next refresh may never be reported. That is accepted.
- `historyWalk.js` persists `lastFailureKind` and `lastFailureMessage` in the same cursor write
  as `lastFailureAt`, and clears all three on success.
- `serverRecordId` is `wirePayload.id` when present, else `recordId`. `/bug-sync` uses it to ask
  the server whether the row exists.

### 5.3 Server-response evidence

`fencedFetch` (`src/session/handleDataClient.js`) records `handle.lastServerResponseAt` in
memory on any response with status < 500. It is not persisted. With no throttle, the first
refresh after real contact records a due backlog condition. `lastSuccessfulSyncTime` is not
used, because it is set even when every upload failed on transport.

## 6. Phone queue and reporting cadence

### 6.1 `support_incident_queue` (rebuilt in SQLite migration 20)

| Column | Meaning |
|---|---|
| `id` | Local row uuid; new each time the row is created. |
| `kind`, `repeat_key` | `repeat_key` is the condition-key digest. Unique `(kind, repeat_key)`. |
| `schema_version` | `1` for rows copied from migration 13; `2` for new rows. |
| `payload`, `observed`, `first_observed` | The live condition: body, provenance at `last_seen_at`, and provenance at `first_seen_at`. JSON. |
| `occurrence_count` | Event kinds count occurrences; observed kinds stay at 1. |
| `first_seen_at`, `last_seen_at` | The observation interval (`min`/`max`). |
| `report_generation` | Starts at 1. |
| `report_snapshot` | Frozen report body for the current generation, written at its first send attempt. |
| `has_unsent_changes` | 1 when the live condition changed after the current snapshot was frozen or sent. |
| `bundle_id`, `bundle_file`, `screenshot_file` | The attached bundle (§9), if any. |
| `bundle_state` | `none`, `capturing`, `ready`, `uploaded`, `failed`. Set to `capturing` in the same transaction that records an incident needing a bundle. |
| `status` | `pending`, `sent`, `rejected`. |
| `last_sent_at`, `last_sent_release` | Last acknowledgement and the release it carried. |
| `attempts`, `next_attempt_at`, `last_error` | Backoff state. |
| `created_at`, `updated_at` | As today. |

`report_id = uuidv5(id + ':' + report_generation, INCIDENT_NAMESPACE)`. It is computed, not
stored.

### 6.2 Recording

`record(txn, kind, conditionParts, payload, { event })`:

1. **No row** → insert at generation 1, `pending`.
2. **Row exists** → update the live condition and increment `occurrence_count` if `event`.
   Then:
   - `pending`, no snapshot → nothing else.
   - `pending` with a snapshot → set `has_unsent_changes = 1`.
   - `sent` → set `has_unsent_changes = 1`. If the release identity differs from
     `last_sent_release`, promote now: `report_generation + 1`, clear the snapshot,
     `pending`, `has_unsent_changes = 0`.
   - `rejected` → unchanged.

### 6.3 Promotion

Promotion runs **inside the observer's transaction** on every status refresh, before the ready
count is computed. A due promotion therefore makes `incidentReadyCount` non-zero and schedules
its own drain, with no domain work, auth event or manual sync needed (round 4, #4). Every `sent`
row with `has_unsent_changes = 1` whose `last_sent_at` is ≥ 24 h ago is promoted: `report_generation + 1`, clear the snapshot, `pending`,
`has_unsent_changes = 0`. A second crash after the freeze is therefore delivered within a day,
even with no third event (review round 3, #3).

### 6.4 Capacity and fairness

200 rows. Admission, in order:

1. Prune `sent` and `rejected` rows of **observed** kinds oldest-first, whatever their
   `has_unsent_changes`. They are re-derived from durable state on the next refresh if the
   condition persists.
2. Prune `sent` rows of event kinds without unsent changes.
3. If the newcomer is `ea_report` or `diagnostics_sent`, evict the oldest `pending` row of an
   observed kind (also re-derivable). **A human report is never dropped while any observed row
   exists.**
4. Otherwise drop the new incident and increment `local_state.support_incidents_dropped`.

The drain orders rows by priority:
1. `ea_report` and `diagnostics_sent`;
2. other first deliveries (generation 1);
3. re-reports.

Within each group, oldest first.
- A recreated condition gets a new row `id`, so its receipts have new `report_id`s. Nothing is
  merged.

### 6.5 Draining

Bounded to 20 rows, after domain uploads, never under another EA's session (Plan 3). Rows with
`bundle_state = 'capturing'` are not eligible, and are not counted as ready (round 4, #5).

**Schema-1 rows** drain through v1 exactly as today.

**Schema-2 rows:**
1. Build and store `report_snapshot` if it is null.
2. If the row has an un-uploaded bundle, upload it first (§9.3).
3. Send `snapshot + delivery` to v2.
4. Then:
   - `inserted` or `duplicate` → one transaction:
     - set `sent`, `last_sent_at`, `last_sent_release`;
     - clear the snapshot;
     - all only where `report_generation` equals the sent generation;
     - `has_unsent_changes` is left as is, so §6.3 still sees later changes.
   - `22023` → `rejected`.
   - `54000`, transport, auth → backoff, keep the snapshot, stop.
   - Stale actor → propagate.

Process death or a restored database replays the same `report_id`, which is ignored.

## 7. Evidence content

### 7.1 Observation provenance (`observed`)

`observed` is the entire `getRuntimeDiagnostics()` object (`src/utils/runtimeDiagnostics.js`),
captured synchronously at observation:
- application id, name, version, build, release label;
- device platform, versions, brand, manufacturer, model name and id, **device name**, type,
  physical-device flag, OS name, version and build, API level, CPUs, total memory;
- update id, channel, runtime version, embedded and emergency launch flags;
- backend target and project;
- supported SQLite schema version.

`first_observed` is the same object at `first_seen_at`.

### 7.2 Delivery metadata (`delivery`, at send time; async reads allowed)

- `installId`, which must equal the `repeat_key` prefix.
- EA identity: `userId`, `email`, `displayName`.
- Current app version, build and update id.
- `network`: the NetInfo state — type, connection and internet reachability, details such as
  cellular generation and carrier where available.
- `freeDiskBytes`, `totalDiskBytes`.
- `outboxSummary`: counts by status and class.
- `lastSuccessfulSyncTime`, `lastServerResponseAt`.
- `droppedIncidents`: cumulative.
- `sentAt`.

### 7.3 Validation and size

**Server:** structural only.
- The top-level envelope keys and types.
- `kind` in the enum.
- `payload`, `observed`, `first_observed` and `delivery` are JSON objects.
- `report_id` is a UUID.
- `first_seen_at <= last_seen_at`.
- The install prefix matches.
- Total envelope ≤ **65,536 bytes**.

**Phone:** keeps each body under 60,000 bytes by truncating, in this order:
1. `wirePayload` (keeping its keys and ids, cutting long strings and arrays);
2. `stack` and `componentStack`;
3. `sampleLastErrors`.

A truncated field carries a `truncated: true` marker beside it. An envelope still over the limit
at send is `rejected` locally with code `TOO_LARGE`, without a request. Bundles (§9) carry
anything larger.

Access is service-role only for receipts and bundles. That is the one boundary kept (J4).

## 8. Server: receipts

Migration `supabase/migrations/2026103012xxxx_incident_receipts.sql`. Session `SET`/`RESET`.

### 8.1 Table changes (`public.mobile_support_incidents`)

- Widen the `kind` CHECK to the ten kinds.
- Add:
  - `report_id uuid`
  - `schema_version smallint not null default 1`
  - `report_generation integer not null default 1`
  - `occurrence_count integer not null default 1`
  - `first_seen_at timestamptz`, `last_seen_at timestamptz`
  - `bundle_path text`, `screenshot_path text`
- Backfill `report_id = md5(jsonb_build_array(kind, repeat_key)::text)::uuid`. Then:
  - set it `not null`;
  - drop `mobile_support_incidents_once`;
  - add unique `(reporter_id, report_id)`.
- Indexes `(reporter_id, kind, repeat_key)` and `(received_at, id)`.
- v2 inserts set `received_at = clock_timestamp()`.
- Rows are never updated. `service_role` SELECT only; re-assert the revoke.

### 8.2 RPCs

`report_mobile_support_incident_v2(p_envelope jsonb) returns jsonb`:
- SECURITY DEFINER, empty `search_path`, actor from `auth.uid()`.
- The envelope: `{ schema_version: 2, kind, repeat_key, report_id, report_generation,
  occurrence_count, first_seen_at, last_seen_at, payload, observed, first_observed, delivery,
  bundle_path, screenshot_path }`.
- Validates §7.3.
- A non-null `bundle_path` or `screenshot_path` must start with `<auth.uid()>/`.
- Inserts `on conflict (reporter_id, report_id) do nothing` and returns
  `{ status: 'inserted' | 'duplicate' }`.
- Errors: `28000`, `22023`, `54000`.

`report_mobile_support_incident(text, text, jsonb)` (v1) keeps its signature and observable
behaviour. Its insert computes the same derived `report_id` and targets the new constraint. A
replay of an original request still returns `false`. This is a documented exception to the
"never change a deployed RPC in place" convention; its body md5 goes in the build log.

### 8.3 Limits

At most **150 receipts per reporter per rolling 24 h** across machine kinds, and a separate
**50 per 24 h** for `ea_report` and `diagnostics_sent`, so machine noise can never use up a
person's allowance. Both return `54000`; duplicates are not counted. The phone treats `54000`
as transport.

### 8.4 Harness

Extend `scripts/support-incident-postgres-harness.cjs`:
- a **populated** pre-migration fixture whose v1 replay returns `false` after the constraint
  swap;
- v1 behaviour unchanged;
- v2 insert and duplicate;
- two generations as two receipts;
- a restored-database replay;
- envelope structure rejections;
- bundle-path prefix enforcement;
- install-prefix mismatch;
- an inverted interval;
- the 64 KB limit;
- the rate limit;
- grants.

## 9. Diagnostic bundles

### 9.1 Storage

- Migration `…_support_bundles_storage.sql` creates a private bucket `support-bundles`.
- File size limit 15 MB; allowed types `application/json` and `image/jpeg`.
- Policies on `storage.objects` for this bucket:
  - `authenticated` may **INSERT** only where `(storage.foldername(name))[1] =
    auth.uid()::text`;
  - `authenticated` gets no SELECT, UPDATE or DELETE;
  - `service_role` reads.
- Object paths:
  - `<reporter_id>/<yyyy-mm-dd>/<bundle_id>.json`
  - `<reporter_id>/<yyyy-mm-dd>/<bundle_id>-screenshot.jpg`
- An upload uses `upsert: false`. A 409 "already exists" counts as uploaded, so a retry after
  a lost acknowledgement is idempotent.
- The harness (or a Storage-specific check in the hosted gate) proves:
  - one EA cannot write into another EA's folder;
  - EAs cannot read or list bundles.

### 9.2 Bundle contents (`buildDiagnosticBundle(handle, { trigger, incidentRef })`)

```text
{
  bundleVersion: 1, bundleId, trigger, incidentRef, capturedAt,
  ea: { userId, email, displayName },
  runtime: getRuntimeDiagnostics(),
  network, disk, installId,
  supportExport: debugDump({ handle }),   // schema, migrations, table counts, sync state,
                                          // failed/terminal outbox rows with payloads and
                                          // dispositions, mastery rows, incident queue,
                                          // record id map (§10)
  logs: last 2,000 entries of logger.exportLogs()
}
```

It is built **at capture time**, after the triggering transaction commits, so it shows the
state when the problem happened. It is written to
`FileSystem.documentDirectory + 'support-bundles/<bundle_id>.json'`.

**Budgets are applied before allocation** (round 4, #2), so a capture cannot exhaust memory on a
Galaxy A03s:

| Section | Budget |
|---|---|
| Failed/terminal outbox rows | Newest 200 |
| Each row's `payload` | ≤ 20 KB, truncated with a marker |
| Mastery rows | Newest 500 |
| Logs | Read newest-first from the logger buffer and storage until 2 MB, each entry ≤ 4 KB. This adds a bounded `logger.tail({ maxBytes, maxEntryBytes })`; `exportLogs()` is not used for bundles. |

`debugDump` gains an options argument for these limits; the Profile Share database export
keeps its current unbounded behaviour.

Capture rules:
- It yields to the event loop between sections.
- It checks that the handle is still open and current before each section and before writing.
  A sign-out mid-capture abandons the capture and marks it `failed`.
- If the serialized bundle still exceeds 12 MB, it is replaced by a minimal bundle: runtime,
  EA, network, disk, counts, and the first 50 outbox rows. `truncated` records this.

### 9.3 Triggers and queueing

| Trigger | When | Limit |
|---|---|---|
| Automatic | The first time a condition of kind `upload_terminal`, `app_error_caught`, `upload_backlog_stale`, `pull_failing` or `reconcile_breaker_tripped` is recorded | At most one automatic bundle per EA per 24 h |
| Send diagnostics | Each tap | Bundle + a `diagnostics_sent` incident |
| Report a problem | Each report | Bundle + optional screenshot + an `ea_report` incident |

The rules for every trigger:
- The incident is recorded with `bundle_state = 'capturing'` in its own transaction. The
  drain cannot freeze or send it until capture ends.
- Capture writes the file, then sets `bundle_id`, `bundle_file`, `screenshot_file` and
  `bundle_state = 'ready'` in one transaction. On failure it sets `failed`.
- A row still `capturing` 10 minutes after `updated_at` (process death mid-capture) is set to
  `failed` by the observer. It then sends with `bundleCaptureFailed: true`. Evidence of the
  problem still arrives; only the attachment is lost.
- The drain uploads the bundle and screenshot before sending the receipt, which carries
  `bundle_path` and `screenshot_path`.
- Upload failure → backoff; the receipt waits for its bundle. After 5 failed attempts the
  receipt is sent without it, with `bundleUploadFailed: true`, so evidence of the problem
  still arrives.
- Local files are deleted after a confirmed upload.
- At most 5 bundle files are kept. When a sixth is captured, the oldest unsent file is
  deleted and its incident sends with `bundleDropped: true`.

## 10. Support export (Profile → Share database)

The export adds:
- `error_class` and `error_code` on failed/terminal outbox rows;
- a `supportIncidents` section with every queue row;
- for each failed/terminal row, its `wirePayload` id (`serverRecordId`).

The same function feeds bundles (§9.2), so manual Share database and uploaded bundles never
diverge.

## 11. Profile actions

Both are rows in the Profile screen's support area, beside Share logs and Share database. Each
opens a **bottom sheet** (`src/components/common/BottomSheet.js`), never a dialog. Both follow
`documentation/design-system.md`.

**Report a problem.**
- A multiline field: "What went wrong?" (required, ≤ 4,000 characters).
- "Attach a screenshot" when `expo-image-picker` is available (J6): it picks one image from the
  gallery, resized to ≤ 1,600 px on the long edge as JPEG.
- **Send.**
- On submit: record `ea_report`, build the bundle, copy the screenshot into
  `support-bundles/`, then trigger a sync.
- Confirmation copy, by outcome:
  - "Sent. Thank you."
  - "Saved on your phone. It will send when you're online."

**Send diagnostics.**
- One sentence explaining it sends app information to the Masi team.
- **Send.**
- On submit: record `diagnostics_sent`, build the bundle, trigger a sync. Same confirmation
  copy.

**Picker availability** (round 4, #1):
- A plain guarded `require('expo-image-picker')` is **not** safe. The package calls
  `requireNativeModule('ExponentImagePicker')` at import. Metro's `guardedLoadModule` reports
  that failure as fatal before the caller's `catch` runs.
- So availability is decided first with the non-throwing
  `requireOptionalNativeModule('ExponentImagePicker')` from `expo-modules-core`. Only when it
  returns a module does the sheet `require('expo-image-picker')`. Otherwise the attach option
  is hidden.
- The version is installed with `npx expo install`, so it is SDK-matched and older than the
  24 h supply-chain window.
- **Device gate:** the A03s running the current pilot binary (no picker) plus an OTA of this
  branch opens Report a problem, sends a report, and does not crash.

Copy is provisional for a wording pass with Jim.

## 12. Operator side

### 12.1 Reader: `scripts/read-support-incidents.cjs` (`npm run bugs:incidents`)

**Access.**
- Receipts are read with **one SQL statement** through `psql` against `masi-app-sqlite`, using
  the `sqlite-staging` helper's validated credentials (`SUPABASE_DB_PASSWORD_SQLITE`, the
  pooler, project `segygjzpujphwvrubusm`). The env is parsed as data and never sourced, and the
  target is verified before connecting.
- The statement joins `auth.users` and `public.users` for EA email and display name. It returns
  the complete set as one JSON value.
- One statement is one snapshot, with no PostgREST row cap, so coverage is exact for that
  snapshot (review round 3, #1).
- The snapshot time is printed and is the sweep boundary.

**Review window.**
- `--review-since <ISO>` lists recorded conditions with receipts received after that time.
- The skill passes the previous sweep boundary minus **10 minutes** of overlap, because a
  late-committing insert can carry an earlier `received_at`.
- Display only; duplicates in the overlap are harmless.

**Filters.** `--actor`, `--kind`, `--since` are display filters. A filtered run never claims
coverage.

**Conditions.** Receipts are grouped by `(reporter_id, kind, repeat_key)`. Each condition shows:
- the EA (email, name, id);
- its receipt count;
- the first and latest seen times;
- the distinct releases and devices;
- the latest payload;
- its bundle paths.

**Registry.**
- `--registry-ref <ref>` (default `origin/main`) loads `docs/bugs/records/*.md` from git. An
  empty registry is valid. Block-list frontmatter only.
- Exact condition keys `<reporter_id>/<kind>/<repeat_key>` are read from
  `support_incident_keys`, and from `field_report_ids` for `ea_report`.
- Signatures are read from `support_incident_signatures`.
- A contested signature → exit code 2.

**Signatures** (`<kind>/<a>/<b>`):

| Kinds | `a` / `b` |
|---|---|
| upload | `errorClass` / `errorCode` |
| pulls | `scopeFamily` / `failureKind` |
| breakers | `scopeFamily` / `-` |
| app errors | `errorName` / first 8 of the message digest |
| backlog | `-` / `-` |

`ea_report` and `diagnostics_sent` have no signature.

**Report order:**
1. Unrecorded `ea_report` conditions (people waiting).
2. Other unrecorded conditions.
3. Recorded conditions in the review window.
4. Breadth by EA.
5. By record (`serverRecordId`).
6. By signature.

Handles: `<kind-abbrev>:<first 8 hex of sha256(reporter/kind/repeat_key)>`.

**`--fetch <handle>`** downloads that condition's latest bundle and screenshot with the
service secret key into `docs/bugs/user-submissions-bundles/<handle>/`, which is gitignored by
the existing pattern.

**`--resolve <handle>`** runs `select id, … from <table> where id = <serverRecordId>` (SELECT
only) and prints `present` or `absent` with the row's sync-relevant columns. Existence is not
convergence.

### 12.2 Registry (built; small updates)

The README adds:
- `ea_report` receipts in the Field reports channel (`/bug-user`, recorded in
  `field_report_ids`);
- bundles as an evidence source (`--fetch`), with the rule that a bundle stays under the
  gitignored path and only safe excerpts are committed to `docs/bugs/evidence/`;
- the review-window sweep.

### 12.3 Skills

**`bug-sync`** is new: `.agents/skills/bug-sync/SKILL.md` and `agents/openai.yaml`, plus a
symlink. It covers:
- SWEEP / INVESTIGATE / FIX;
- start from `origin/main`;
- the full sweep with `--review-since`;
- what a receipt proves;
- `--resolve` and `--fetch` before diagnosing;
- Sentry with valid-query negative evidence;
- exact keys by default;
- landing on `origin/main` with authorization;
- the finish-the-turn report;
- improvement proposals;
- the Masi source map;
- an empty Learned mappings table.

**`bug-user`** gains a "sweep EA reports" step: `npm run bugs:incidents -- --kind ea_report`,
then `--fetch` each unrecorded report's bundle and screenshot.

**`AGENTS.md`** routes to both.

## 13. Standing documentation (same branch)

- `CONTEXT.md` (§3).
- `documentation/rls-sync-contract-map.md`: outbox columns and backfill, kinds, v2, the v1 body
  change, the bucket and its policies, the D4 rule.
- `documentation/ROADMAP.md`: tick the lane items.
- `documentation/build-log.md`.
- `documentation/LEARNING.md`: why receipts became immutable and incidents observed.
- `documentation/design-system.md`, if the Profile rows add a pattern.
- `AGENTS.md`.

## 14. Verification

### Real SQLite, through `test-support/defaultTestHandle.js`

- Migration 20: queue rebuild, schema-1 copy, outbox columns, the backfill for existing
  failed/terminal rows. An upgraded terminal row yields a valid receipt with no domain request.
- Dispositions on every failure path.
- The observer:
  - one `upload_terminal` per terminal row, with its `wirePayload` and `serverRecordId`;
  - two codes give two conditions;
  - breaker notes;
  - backlog only after server contact (all-transport, empty and cold-launch-before-contact
    cases do not report);
  - `pull_failing` with an empty outbox;
  - an observer failure leaves domain state untouched.
- `record` and promotion:
  - freeze → second event → acknowledgement → no further events → the second observation is
    delivered after 24 h;
  - a release change promotes at once;
  - prune and recreate;
  - an unprunable unsent-changes row;
  - the drop counter reaches `delivery`.
- The drain:
  - the same `report_id` on replay;
  - the generation CAS;
  - schema-1 via v1;
  - bundle-before-receipt ordering;
  - the 5-attempt bundle fallback;
  - bundle file cleanup and the 5-file cap;
  - truncation markers;
  - the 64 KB limit.
- EA switching: no cross-EA drain; bundles are written under the right reporter folder.

### Components

Jest with `@testing-library/react-native`:
- Report a problem: validation, submit offline and online, picker absent hides attach.
- Send diagnostics.
- An `ErrorBoundary` crash records `app_error_caught` and a bundle.

### Disposable PostgreSQL

§8.4 and the Storage policy checks.

### Reader

With a temporary git fixture and a stubbed `psql` runner:
- an empty registry;
- key versus signature precedence;
- `field_report_ids` matching `ea_report`;
- narrative mentions ignored;
- a contested signature exits 2;
- inline lists ignored;
- filters never claim coverage;
- the review window with overlap;
- `--resolve` and `--fetch` command construction.

### Hosted

Apply both migrations (J2). Then read-only checks of columns, the constraint swap, indexes,
grants, both functions, and the bucket and its policies. Then a v1 call shaped like a
pilot-build request.

### Device (UI gates at default text size, per Jim's preference)

On the Galaxy A03s with the next native build:
- Report a problem, with and without a screenshot, online and offline.
- Send diagnostics.
- A forced terminal upload.
- Each appears in `npm run bugs:incidents`, and `--fetch` retrieves its bundle.

iPhone smoke when available.

### End to end

`/bug-sync` and `/bug-user` over staging receipts each record one real `MA-BUG`.

## 15. Compatibility

- SQLite migration 20 is additive for the outbox (two columns plus a backfill) and rebuilds
  the queue.
- `lastFailureKind` and `lastFailureMessage` are optional cursor fields.
- The server changes are additive except the documented v1 body and constraint swap. There are
  no field users; installed 1.4.0 builds keep v1.
- Report a problem and Send diagnostics work over OTA without a screenshot; the screenshot
  needs the next native build.

## 16. Review history

### Check-solution, revision 1

Dropped:
- `upload_rejected_repeatedly` and `first_failed_at`;
- the roster-staleness trigger;
- the material-field table;
- the sent-tuple columns;
- the server `install_id` column;
- `gitCommit`;
- `routeName`.

### Codex round 1 (10 blocking)

1. SAVEPOINT.
2. Prune counters.
3. Key-only privacy check.
4. Empty-outbox history failures.
5. Resolver false absences.
6. Mutable key ownership.
7. Pass success ≠ contact.
8. Schema-1 delivery.
9. Unknown-table CAS.
10. Mutable paging.
11. Drop counter.

Resolved in revision 2.

### Codex round 2 (6 blocking)

1. MV001 replay through an in-finalizer incident write.
2. Tuple adoption loses observations.
3. Restore double-counts.
4. Throttle suppresses backlog.
5. Record edit time is not review state.
6. Mutable `--since`.

Resolved in revision 3 by redesign:
- immutable receipts;
- observed incidents;
- no throttle;
- full enumeration;
- a review window.

Revision 3 also dropped server aggregation, transactional hooks, and whole-estate resolution.

### Codex round 4 (1 blocking, 4 advisory) — resolved in revision 4.1

1. A guarded picker `require` is fatal under Metro → native-module preflight (§11).
2. Unbounded capture → budgets before allocation, yields, handle checks (§9.2).
3. Queue starvation → observed rows are evictable; human reports are always admitted; priority
   drain; a separate human quota (§6.4, §8.3).
4. Promotion invisible to the scheduler → promotion in the observer (§6.3).
5. Receipt sent before its bundle → the `capturing` gate and stale-capture recovery (§9.3).

Spec review closed at four rounds. Remaining risk moves to plan review, tests and device gates.

### Codex round 3 (1 blocking, 3 advisory)

1. Paged sweeps are not a snapshot → one-statement `psql` read (§12.1).
2. `chr(0)` is invalid in PostgreSQL → `jsonb_build_array` (§8.1).
3. An acknowledgement strands post-freeze events → `has_unsent_changes` and promotion (§6.3).
4. Existing terminal rows had null dispositions → backfill (§4.1).

### Revision 4 and J4

J4 removed the privacy-driven elements of revisions 2–3:
- record-ref digests and `RECORD_REF_TABLES`;
- closed value grammars;
- payload exclusions;
- the 8 KB cap.

It also made round 1 #3 and #5 moot: raw ids replace digests and the hashed resolver.

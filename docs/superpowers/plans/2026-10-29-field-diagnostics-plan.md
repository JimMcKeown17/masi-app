# Field Diagnostics Implementation Plan — Revision 4.1

> **For agentic workers:** Implement one numbered task at a time with the local TDD skill. The orchestrator assigns the six slices to separate Git worktrees. Builders leave reviewable changes and a list of files to stage; they do not stage or commit. Checkbox steps are execution instructions, not claims that checks have already passed.

**Goal:** Complete the November field-test feedback loop: a phone preserves diagnostic evidence when a reportable condition occurs, an EA can report a problem or send diagnostics, and an operator can enumerate immutable receipts and turn them into the existing `MA-BUG` registry.

**Architecture:** Extend the existing per-EA `support_incident_queue` and `mobile_support_incidents`, keeping domain uploads in their existing outbox. Failure dispositions commit with the outbox failure; a separate observer reads durable state and records incidents. Each report generation freezes its observation body and has an immutable server receipt identity. Large evidence is captured locally after commit and uploaded to a private Storage bucket before its receipt. The operator reader takes one PostgreSQL statement snapshot, then groups receipts and matches registry declarations from a Git ref. Reuse the existing scheduler, signed-in EA handle, support export, logger, Profile primitives, and staging credential parser.

**Tech Stack:** Expo SDK 54 / React Native 0.81.5; expo-sqlite 16 with file-backed better-sqlite3 tests; expo-file-system 19; existing NetInfo, AsyncStorage, uuid, supabase-js, and YAML packages; PostgreSQL 17; CommonJS Node operator scripts; Jest / jest-expo / React Native Testing Library. The only new direct dependency authorized here is `expo-image-picker`, installed by the orchestrator.

**Spec:** [2026-10-29 incident lane and bug registry design, Revision 4.1](../specs/2026-10-29-incident-lane-and-bug-registry-design.md), re-read including the 4.1 status row and Codex round 4 history. J1–J6 and binding R-O1–R-O17 below govern; these rulings override superseded spec details. Earlier privacy restrictions do not govern this implementation.

**Style reference:** [Sign-out Questions and Support Incidents, Plan 3](2026-10-17-sign-out-and-incidents.md). Reuse its document/task organization, not its superseded 8 KB, counts-only, in-transaction incident, or hosted-permission instructions.

**Source baseline:** `/Users/jimmckeown/Development/masi-app-bug-machinery`, branch `feat/bug-machinery`, the plan itself is untracked; no other changes were present when re-inspected on 2026-10-29. References below are line numbers read from that baseline; new paths are explicitly marked **new**. Recheck anchors after integrating another slice. No hosted database, device, dependency installation, or executable test was run to write this plan. `node_modules` is absent in this checkout; commands below are for provisioned builder worktrees.

## Global Constraints

- Write implementation in assigned worktrees. The orchestrator creates branches/worktrees and handles Git integration. Builders cannot write the project's `.git`, must not commit project changes, and must not run staging commands. Each task ends with **Files to stage** for the orchestrator. D's expressly requested temporary Git-repo tests may initialize and commit synthetic fixtures under OS temp; that exception never authorizes project Git writes.
- Node 20 for every Jest or harness command: prefix `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`. Stay on npm and preserve `package-lock.json` ownership.
- Only the orchestrator runs `npx expo install expo-image-picker` and edits its `app.config.js` plugin entry, before Slice F. Verify the exact resolved SDK-matched version is older than 24 hours and record publication/check times; `expo install` selects compatibility, but does not itself enforce a 24-hour release-age policy. Builders install no packages. No resize dependency; see R-O1.
- Follow RED → GREEN → refactor vertically within every task: one behavior test, execute it and inspect the stated assertion failure, implement that behavior, rerun it, then repeat. A missing dependency, syntax failure, connection refusal, or undiscovered test is infrastructure failure, not the behavior's RED proof.
- Real-SQLite tests use `test-support/defaultTestHandle.js:3–31`, the actual signed-in handle and its writer/reader. Obtain it with `getDefaultTestHandle()`; fixture writes use `handle.withTransaction`, and assertions may inspect `handle.getReader()`. Do not copy the old incident tests' `__MASI_NO_DEFAULT_HANDLE__` opt-out (`__tests__/supportIncidentRepository.test.js:1–17`, `__tests__/supportIncidentDrain.test.js:1–38`). A pre-upgrade fixture may inject a v19 file into the normal handle opening path; it must still exercise the actual migration runner and handle lifecycle.
- Use an explicit handle in production. All data and Storage requests go through `handle.enqueueRequest` and `handle.dataClient`, whose fetch is actor fenced (`src/session/handleDataClient.js:11–68`). Propagate `StaleActorError`; never retry old work as another EA. No repository singleton, ambient database connection, or shared data client.
- Bottom sheets use `src/components/common/BottomSheet.js`, never dialogs or `Alert`. Use Bold Red tokens, `ListRow`, `TextField`, `BrandButton`, inline form errors, and actor-scoped toasts. Device UI gates run at **default text size** (`documentation/design-system.md:16–33`).
- Never touch the legacy backend `jcqrlwetutnpuchjoyyd`. The only hosted target is `masi-app-sqlite`, `segygjzpujphwvrubusm`. Never source dotenv files or run raw Supabase CLI from the repository root. Use the guarded staging helper for hosted operations.
- Hosted migration application is an **orchestrator gate after the disposable harness passes**, per J2, not a builder task and not a new request for permission. Perform read-only preflight/verification separately from the explicitly listed pilot-shaped v1 smoke request.
- Supabase migration SQL uses session `SET lock_timeout`, `SET statement_timeout`, and matching `RESET`; never `SET LOCAL`. Transaction-local role/claim setup in a disposable test is different and may retain the existing harness pattern.
- J4: collect raw record ids, wire payloads, server messages, exception text/stacks, logs, EA identity, and full runtime/device details including device name. Do not add diagnostic privacy redaction, field-value grammars, or an 8 KB v2 cap. Preserve service-role-only receipt/bundle reading. Git still receives safe excerpts only; downloaded originals remain gitignored (spec §12.2).
- Builders do **not** edit `documentation/build-log.md`. They hand over RED/GREEN commands, results, surprises, migration names and v1 function-body md5 evidence. The orchestrator makes the single final log update. Slice E owns the other standing-doc edits after integration.
- Do not rebuild `docs/bugs/README.md`, `_template.md`, or `bug-user`. Only the small §12.2–12.3 corrections listed in Slice E belong here. No new registry schema, copied Zazi records/mappings, web panel, retention job, automatic recovery, raw SQLite upload, or new scheduler.

## Review Focus — before dispatch

1. Keep an outbox failure and its disposition atomic, but keep incident/bundle failures outside that transaction. Preserve all existing outbox CAS and newer-local-write behavior.
2. Preserve schema-1 row delivery, populated server migration replay, and installed pilot-build v1 compatibility while adding schema 2.
3. Freeze observation evidence; acknowledge only the sent generation; never clear post-freeze `has_unsent_changes` by accident.
4. Exercise incident-only scheduling and empty-outbox pull failures. A successful pass is not proof of server contact.
5. Prove bundle upload state survives process death, lost acknowledgement, and local-file cleanup. File existence alone cannot mean “uploaded.”
6. Make coverage an explicit property of one successful unfiltered SQL snapshot, independent of display filters, registry matches, or human review state.
7. Apply R-O1–R-O17 in tasks, shared fixtures and gates. Keep the new contradictions below explicit; no builder may bypass actor fencing to settle it.

## Rulings and source conflicts

### Explicit rulings carried from Revision 4.1 and this task

- **R1 — Six work packages, one integration owner.** Dispatch A, B, and D immediately in separate worktrees. C starts from B. F can build presentational components and component tests in parallel against the interface below, but integrates only after C's recording/bundle API and the orchestrator's picker installation exist. E starts after D and reconciles docs against integrated A/B/C/F. File overlap is intentional only across those dependency edges.
- **R2 — Disposition is diagnostic metadata, not a new retry policy.** Keep `classifyError` behavior and eight-attempt deterministic escalation (`src/services/offlineSync.js:487–545`, `1296–1306`). `dispositionFor` records the decision actually taken, including terminal escalation and the no-live-session downgrade. Add columns to the very same status UPDATE, retaining its existing CAS predicates. The two additional repository failure writers at `src/db/repositories/syncOutboxRepository.js:351–378` are included even though spec §4.1 lists only finalizers and quarantine.
- **R3 — Replace the foreign-owner transactional incident hook.** Source `src/db/repositories/syncOutboxRepository.js:271–278` enqueues inside quarantine, and `__tests__/outboxIntegrityScan.test.js:49–59` expects it at open. This conflicts with spec D4 (`spec:63`, `126–138`). Keep quarantine, domain status, scan evidence and operational reporting; C removes only the incident hook and observes terminal rows with `error_code = 'FOREIGN_OWNER'` and foreign ownership separately. Preserve its unchanged kind, counts payload, and sorted-id episode key. This is an explicit Revision 4.1 change, not an accidental compatibility regression.
- **R4 — Local versus wire repeat key.** Preserve `incidentRepeatKey` and its fixed namespace (`src/db/repositories/supportIncidentRepository.js:11–18`). SQLite stores the digest. Transport prefixes it with `<installId>:` as today (`src/services/supportIncidents.js:25–28`). The v2 `delivery.installId` must equal that wire prefix; never read AsyncStorage inside a SQLite transaction.
- **R5 — One serializer for actual wire evidence.** Extract, without changing behavior, `buildSyncPayload` and its private stripping constants from `src/services/offlineSync.js:37–54`, `561–637` into **new** `src/services/syncPayload.js`. Keep the existing `_testBuildSyncPayload` re-export. Domain upload, support export, and incident payloads use it. This avoids a `debugDump → offlineSync → supportIncidents → diagnosticBundle → debugDump` import cycle and avoids an independently reimplemented id transform.
- **R6 — One status-refresh observer entry point.** Bind `observeStandingConditions(handle)` in the handle services; run it before counting due incidents in `syncEngine.getSyncStatus`, currently at `src/services/offlineSync.js:1869–1885`. Existing OfflineContext initial load, poll, foreground and after-pass refreshes then converge there. Reconnect currently does not refresh status (`src/context/OfflineContext.js:293–300`); add that explicit call. Do not add a timer or throttle.
- **R7 — v19 is the predecessor.** Current migrations end at 19 (`src/db/migrations.js:939–948`). Add exactly migration 20; do not modify migrations 1–19. Rebuild the queue and copy old rows as schema 1, preserving ids, keys, payloads, status, attempts, retry dates, errors, timestamps, and dedupe. Historical observation provenance is unknown; never manufacture it from the upgrading release.
- **R8 — Existing primitives suffice for the Profile layout.** Rows remain beside the current Share actions in the support panel (`src/screens/main/ProfileScreen.js:184–206`). Use `trailing="chevron"` because they open sheets; the sheet's primary action is Send. Component behavior must preserve actor fencing, keyboard access and truthful confirmation; general Profile redesign is outside scope.
- **R9 — Docs have known field-diagnostics drift.** `CONTEXT.md:315–319` says counts-only; `documentation/ROADMAP.md:276–306` specifies updates, field allowlists, payload hashes and no device name; `documentation/rls-sync-contract-map.md:1818–1820`, `1878–1879` documents transactional/counts-only v1 behavior. Slice E corrects those exact claims to Revision 4.1 plus the rulings, preserving separate v1 compatibility documentation. README's paging and recordRef wording (`docs/bugs/README.md:301–308`) and `bug-user`'s recordRef wording (`.agents/skills/bug-user/SKILL.md:186–190`) also need the small source-alignment edits.
- **R10 — Unknown-table finalization is currently id-only.** Unlike the other engine finalizers, `src/services/offlineSync.js:1025–1039` has no snapshot CAS and is called before marking in flight (`1192–1207`). When adding disposition metadata, Task 5 adds the narrow `id/updated_at/original-status` snapshot guard on this outbox-only path. Do not require in_flight here or update an unknown domain table. This source safety gap is explicit; no broader upload-policy change is included.

### Simplicity check — advisory, no scope change

Cycle objective is the spec's field-month diagnosis-without-follow-up objective (`spec:30–31`). The local check-solution skill was read because this plan adds persisted state and retry behavior. Source/tests establish the existing mechanisms, but they do not establish production counts or Masi field occurrence evidence for each new element. Its strict B1-dependent verdict therefore remains **unresolved**, rather than inventing a NOW verdict or deleting approved scope. This table reviews the added state at its subsystem boundary; carrying cost outside the named boundary is explicitly not counted yet.

| Element | A: user-visible delta | B1: scenario occurs? | B2: user can tell? | C: deletion test | Build | Carrying | Verdict |
|---|---|---|---|---|---|---|---|
| Outbox disposition columns | Jim can distinguish terminal, parent and auth failures in an export/receipt. | Failure paths exist in source; Masi field counts not supplied. | Yes, evidence names the action/owner. | Classification would reappear at 3 consumers: observer, export, delivery summary. | B; 1 SQLite migration. | 3 existing source files at this boundary: migrations, offlineSync, syncOutboxRepository; downstream consumers named above. | Unresolved B1; requested scope retained. |
| Queue generations/snapshot/dirty bit | Jim receives a second post-freeze observation after a lost ack or daily promotion. | Race is specified; Masi field occurrences not supplied. | Yes, later evidence otherwise disappears. | Same race would reappear at 2 boundaries: event recording and drain acknowledgement. | B/C; queue rebuild within migration 20. | 3 existing core files: migrations, supportIncidentRepository, supportIncidents; total downstream carrying count not yet measured. | Unresolved B1; requested scope retained. |
| Immutable report identity and v2 | Jim can retry/replay a report without counting another receipt. | Existing v1 duplicate tests demonstrate replay; new field generations unmeasured. | Yes, distinct observations remain distinguishable. | Idempotency would reappear at 2 clients: phone delivery and operator grouping. | A; 1 receipts migration and PostgreSQL gate. | 3 existing boundary files: original server contract, harness, phone transport; new reader/SQL files are named in File Structure. | Unresolved field B1; requested scope retained. |
| Local diagnostic bundle and upload progress | Jim can fetch capture-time logs/export instead of asking the EA to reproduce it. | Spec cites export-dependent diagnosis; no Masi field counts supplied. | Yes, diagnostic evidence becomes available. | Capture logic would reappear at 3 triggers: automatic conditions, EA reports, diagnostics. | C/F/A; 1 Storage migration, native screenshot gate. | 3 existing capture boundaries: debugDump, logger, supportIncidents; R-O3/R-O5 fix queue/local-state ownership; total downstream count not yet measured. | Unresolved field B1; no extra queue or scheduler authorized. |
| Profile screenshot picker | An EA can attach the problem's screenshot. | Explicit J6 request; field frequency not measured. | Yes, attachment is visible and fetchable. | Selection/copy would reappear at 1 real caller: ReportProblemSheet; no adapter framework needed. | F plus orchestrator dependency/native build. | 1 existing screen, 2 new sheet components and 1 new screenshot utility in this slice. | Unresolved field B1; requested UI retained. |

No LATER/NEVER scope verdict is being asserted, so this review creates no deferred files and changes none of the approved six slices.

### ORCHESTRATOR RULINGS — binding

These replace the former open questions O1–O17. Implement them in the named slices; no dependent task awaits another ruling on these points.

1. **R-O1 — Picker and formats (A/C/F).** No resize dependency. Launch with `mediaTypes: ['images']`, `allowsEditing: false`, `quality: 0.5`; one image. Upload the type returned and keep its original extension. Bucket MIME types: `image/jpeg`, `image/png`, `image/heic`, `image/heif`, `application/json`; 15 MB per file.
2. **R-O2 — Quota scope (A).** v1 stays unlimited. Quotas apply only to v2.
3. **R-O3 — Durable bundle state (B/C).** Queue columns: `bundle_id`, `bundle_file`, `screenshot_file`, `bundle_state` (`none|capturing|ready|uploaded|failed`), `bundle_attempts integer default 0`, `bundle_path`, `screenshot_path`. Per-EA `local_state` key `support_auto_bundle_last_at` is stamped atomically when automatic capture **starts**, consuming the allowance even if capture fails.
4. **R-O4 — Freeze after attachment outcome (A/C).** Upload first or give up after five failed `bundle_attempts` with state `failed`; only then build `report_snapshot`, including `bundle_path`, `screenshot_path` and `bundleUploadFailed`/`bundleCaptureFailed`/`bundleDropped`. Store outcome flags in the row's live payload until freeze; copy them into snapshot payload and preserve them on observer updates. Paths are top-level envelope fields. No attachment outcome can mutate a frozen, possibly accepted receipt.
5. **R-O5 — Local ownership/cap (C).** Use `documentDirectory/support-bundles/<userId>/`. Keep at most five bundles per EA directory; a screenshot counts with its bundle. Evict only within that directory, oldest unsent bundle first; its queue row becomes `bundle_state = failed` with `bundleDropped: true`.
6. **R-O6 — Capture failure (C).** If even the minimal bundle cannot be written, set `bundle_state = failed` with `bundleCaptureFailed: true`. The automatic allowance remains consumed.
7. **R-O7 — Byte contract (A/C).** Truncation uses sibling keys `"<field>Truncated": true` and `"<field>OriginalBytes": n`. Complete compact `JSON.stringify(envelope)`, including delivery, must be ≤56,000 UTF-8 bytes on phone. Server rejects `octet_length(p_envelope::text) > 65536`; the margin absorbs jsonb text formatting.
8. **R-O8 — App-error identity (C/D).** Normalize message in order: UUIDs → `"<uuid>"`, digit runs → `"#"`, collapse whitespace, then first 500 characters. `messageDigest = uuidv5(normalized, INCIDENT_KEY_NAMESPACE)`. C ships one shared JSON fixture consumed by C and D tests; raw message remains diagnostic evidence.
9. **R-O9 — Namespace/release (C).** `INCIDENT_NAMESPACE` means the existing `INCIDENT_KEY_NAMESPACE` in `src/db/repositories/supportIncidentRepository.js`: export it, never change its value. Release identity is `(application.version, application.build, update.id)` from `getRuntimeDiagnostics()`, with explicit nulls.
10. **R-O10 — Server identity (B/C/D).** Use `wirePayload.id` when present; assessments use the serializer's nested `p_assessment.id`; `letter_mastery` has `serverRecordId: null`. If serialization throws, retain the row with `wirePayload: null`, `wirePayloadError` equal to the error message, and `serverRecordId = recordId`. Never invent an id.
11. **R-O11 — Log capture (C).** Bundles use the new bounded `logger.tail({ maxBytes, maxEntryBytes })`, never `exportLogs()` text or an unbounded `getLogs()`/flush followed by slicing.
12. **R-O12 — Standing docs/access (E).** Add `PRD.md` to E. Replace its cloud-telemetry restriction with J4 for the field month. Document the reader's psql access as an explicitly authorized operator path, distinct from service-role API reads.
13. **R-O13 — Review overlap (D/E).** Accept ten-minute overlap as a bounded convention, not protection against unlimited commit delay. Document this in the skill and README; no new watermark state/job.
14. **R-O14 — Reader determinism (D/E).** Abbreviations: `ut` upload_terminal, `bl` upload_backlog_stale, `rb` reconcile_breaker_tripped, `pf` pull_failing, `ae` app_error_caught, `er` ea_report, `dg` diagnostics_sent, `lb` left_behind_unsent_work, `fo` foreign_owner_in_file, `ls` legacy_shared_file_unsent. Latest receipt = max `(received_at, id)`. Schema-1 rows display nulls for new fields. Within-sweep eight-hex handle collision lengthens **both** handles to 12 hex.
15. **R-O15 — Server storage (A/D).** Add nullable `observed jsonb`, `first_observed jsonb`, `delivery jsonb` (null for v1), plus `bundle_path` and `screenshot_path`. Keep payload as payload; no provenance wrapper.
16. **R-O16 — Plan 3/fetch (D/E).** The three Plan 3 kinds have no signature; exact keys only. Latest bundle = the condition's receipt with non-null `bundle_path` and max `(received_at, id)`. Fetch that receipt's bundle and optional screenshot together, and print its `report_id`.
17. **R-O17 — Plan 3 cadence (C).** Record Plan 3 kinds through new `record()` as schema 2 with per-kind cadence `once`: never promote or re-report them; their episode key changes per episode. All other kinds use `daily`. Copied schema-1 rows still use v1.

### New contradictions — ORCHESTRATOR RULINGS (binding)

**N1 — Sign-out mid-capture.** Do not write after the handle starts closing, and add no lifecycle
bypass. Capture checks `handle.isCurrent()` before each section and before writing, abandons work
on revocation, and leaves the row `capturing` in that EA's own file. The ten-minute stale-capture
recovery in the observer (Task 10) marks it `failed` with `bundleCaptureFailed: true` the next
time that EA's file is open. Delayed failure marking is accepted; spec §9.2's "marks it `failed`"
is satisfied by that recovery.

**N2 — Once cadence versus pruning.** Accepted as is. A pruned-then-recreated Plan 3 episode can
send a second receipt with a new `report_id`. The reader groups it into the same condition (same
`repeat_key`), so it is harmless. Task 8 tests this case and asserts exactly that behaviour. No
tombstone store, schema or fairness exemption.

### Shared interfaces for parallel builders

The following are **planned new interfaces**, not claims that these exports exist now. C owns their implementation; F mocks them while building its UI. A/C/D first exchange one JSON envelope/storage-row fixture implementing R-O4/R-O7/R-O9/R-O15. C publishes **new** `test-support/fixtures/fieldDiagnosticsIdentity.json` before dependent identity assertions, shared by C/D tests for R-O8 normalization/digest and R-O9 identity; D does not create a competing fixture. Do not import phone modules into the Node reader.

```js
// src/db/repositories/supportIncidentRepository.js (C)
record(txn, kind, conditionParts, payload, { event })
// cadence is derived from kind: Plan 3 once; all others daily.
// returns { queued, incidentRef: { id, kind, reportGeneration }, created, reason? }
// observation is captured synchronously; no native/network/AsyncStorage await in txn.

// src/services/supportIncidents.js (C; bound by handleServices)
observeStandingConditions(handle)
// services.supportIncidents exposes handle-bound event capture and receipt lookup:
captureEvent(kind, payload, { conditionParts, screenshotFile } = {})
// sets bundle_state='capturing' atomically when admitted -> post-commit bounded capture;
// returns { incidentRef, saved: true } only after durable local recording.
getDeliveryState(incidentRef) // reads this exact row/generation; sent|pending|rejected

// src/services/diagnosticBundle.js (new, C)
buildDiagnosticBundle(handle, { trigger, incidentRef })
// produces the bounded §9.2 file, never a network request; R-O3/R-O5/R-O6 outcomes.
```

F passes raw message text and validated screenshot metadata (private URI, original extension and returned MIME type) to C; C owns durable attachment, bundle capture, paths, throttling and uploads. `captureEvent('ea_report', {message,screenshotAttached,screen:'Profile'}, ...)` and `captureEvent('diagnostics_sent', {trigger:'manual'}, ...)` each allocate a fresh event condition id. F invokes the existing `syncNow()` after capture, then reads `getDeliveryState`; a generic sync success or an online network flag cannot prove this receipt was sent. App.js uses the same capture entry point with its explicitly captured open handle. `record` remains the lower-level transaction primitive.

## File Structure and Worktree Ownership

| Slice | Files touched / responsibility |
|---|---|
| A — Server, independent | **New** `supabase/migrations/20261030120000_incident_receipts.sql`, **new** `supabase/migrations/20261030120100_support_bundles_storage.sql`; modify `scripts/support-incident-postgres-harness.cjs`. Existing package script and CI already invoke it; change neither just to add a second harness. |
| B — Phone foundation, independent | Modify `src/db/migrations.js`, `src/services/offlineSync.js`, `src/db/repositories/syncOutboxRepository.js`, `src/services/historyWalk.js`, `src/db/debugDump.js`; **new** `src/utils/normalizeErrorCode.js`, **new** `src/services/syncPayload.js`; modify the focused existing tests below and `jest.integration.config.js`; **new** `__tests__/fieldDiagnosticsMigration.test.js`, **new** `__tests__/uploadDispositions.test.js`. |
| C — Incidents and bundles, after B | Modify `src/db/repositories/supportIncidentRepository.js`, `src/services/supportIncidents.js`, `src/db/repositories/syncOutboxRepository.js`, `src/services/offlineSync.js`, `src/session/handleServices.js`, `src/session/handleDataClient.js`, `src/context/OfflineContext.js`, `src/session/fileDiscovery.js`, `App.js`; **new** `src/services/incidentPayloads.js`, **new** `src/services/diagnosticBundle.js`, **new** `test-support/fixtures/fieldDiagnosticsIdentity.json`; modify `src/utils/logger.js`, `src/db/debugDump.js`, `__tests__/logger.test.js`, `__tests__/debugExport.test.js`; modify focused incident/drain/context/client/App/discovery/integrity tests and `jest.integration.config.js`; **new** `__tests__/incidentPayloads.test.js`, `__tests__/supportIncidentObserver.test.js`, `__tests__/diagnosticBundle.test.js`. B includes all R-O3 columns in migration 20; no migration 21. |
| F — Profile actions, after C interface; mockable in parallel | Modify `src/screens/main/ProfileScreen.js`, `__tests__/ProfileScreen.layout.test.js`; **new** `src/components/profile/ReportProblemSheet.js`, `src/components/profile/SendDiagnosticsSheet.js`, `src/utils/supportScreenshot.js`, `__tests__/ProfileDiagnostics.test.js`, `__tests__/supportScreenshot.test.js`. Orchestrator alone owns picker changes in `package.json`, `package-lock.json`, `app.config.js`. |
| D — Reader, independent | **New** `scripts/read-support-incidents.cjs`, **new** `__tests__/readSupportIncidents.test.js`; modify only the `bugs:incidents` entry in `package.json`. Import existing exported staging parser/validation; leave `scripts/sqlite-staging.cjs` unchanged unless an actual missing reusable capability is demonstrated. |
| E — Skills and standing docs, after D | Write **new scratch artifacts** `/tmp/masi-bug-sync/SKILL.md`, `/tmp/masi-bug-sync/agents/openai.yaml`; a patched copy of the existing bug-user skill at `/tmp/masi-bug-user/SKILL.md`. Modify `docs/bugs/README.md`, `AGENTS.md`, `CONTEXT.md`, `PRD.md`, `documentation/rls-sync-contract-map.md`, `documentation/ROADMAP.md`, `documentation/LEARNING.md`, and `documentation/design-system.md` only for an actual new Profile pattern. Orchestrator installs scratch skills and creates `.claude/skills/bug-sync` symlink. `_template.md` is untouched. R-O12 authorizes the PRD edit. |

The orchestrator reconciles D's single package-script line with its own picker dependency/lock edits. C follows B for shared files; E is the sole standing-doc writer. No builder edits the shared build log. A/B/D are independently testable without another slice's running services.

## Slice A — Server (independent)

**Spec:** §8.1–8.4, §9.1. **Done when:** a populated v1 database upgrades, v1 replay remains false, v2 validation/idempotency/generations/quota/grants pass disposable PostgreSQL, and bucket policy proof is either in the disposable harness or explicitly open in the hosted gate. Apply R-O2/R-O4/R-O15 and both separate v2 quotas.

### Task 1: Upgrade receipts with a populated compatibility fixture

**Files:** new receipts migration; modify existing support-incident PostgreSQL harness.

**Current source:** table/constraint/RPC/grants at `supabase/migrations/20261017120000_mobile_support_incidents.sql:8–69`; harness migration cutoff/apply at `scripts/support-incident-postgres-harness.cjs:154–183`, fixtures at `23–29`, v1 boolean tests at `88–125`, ACL controls at `31–48`, grants assertions at `127–150`. Disposable routing guards are `scripts/history-authorization-postgres-harness.cjs:31–75`.

- [ ] **Write one failing upgrade/replay case.** Apply all canonical migrations preceding `20261030120000_incident_receipts.sql`, including the original incident migration. Install the fixture EAs, then commit a v1 receipt **before** applying the new migration. Save its id/reporter/kind/key/payload/time. Explicitly load the new migration and assert the saved row's derived report id and a replay returning `false`. Do not mistake the old table's empty fixture for an upgrade test.
- [ ] **Run and inspect RED:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH PGTZ=UTC HISTORY_RLS_ADMIN_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres HISTORY_RLS_DATABASE_NAME=masi_history_rls_fielddiag HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE npm run -s verify:support-incident:postgres
  ```
  First RED may be the explicitly missing new migration. Once its file exists, replay/column/constraint assertions must independently fail against the old schema. A database connection failure is not RED. Use the existing disposable PostgreSQL 17 launcher/environment; never substitute a hosted URL.
- [ ] **Implement the migration.** Session timeouts plus RESET. Widen the kind constraint to all ten exact spec kinds. Add `report_id uuid`, `schema_version smallint not null default 1`, `report_generation integer not null default 1`, `occurrence_count integer not null default 1`, nullable first/last timestamps, `observed jsonb`, `first_observed jsonb`, `delivery jsonb`, and bundle/screenshot paths. The three JSON columns remain null for v1 rows (R-O15). Backfill exactly `md5(jsonb_build_array(kind, repeat_key)::text)::uuid`, then NOT NULL. Drop `mobile_support_incidents_once`; unique `(reporter_id, report_id)`. Add indexes `(reporter_id, kind, repeat_key)` and `(received_at, id)`. Preserve old row values; do not invent old observation times.
- [ ] **Adapt only v1's insertion body.** Compute the same derived report id and use the new conflict target. Preserve signature, three-kind validation, 1–512 key test, object/8192-byte payload test, subject/grants and true/false results; v1 remains unlimited (R-O2). Do not rewrite the original migration. Keep original `received_at` default behavior for v1.
- [ ] **Repeat RED/GREEN for v1 compatibility and isolation.** Replay every original acceptance/rejection/grant case after the swap. Two reporters may have the same derived report id; they remain separate. Verify saved payload and timestamps unchanged, no UPDATE grants, and both required indexes. Obtain md5 of the deployed replacement definition in the disposable DB for handoff; final hosted body md5 goes in the orchestrator's log.
- [ ] **Run GREEN:** repeat the harness command above and `git diff --check`.
- [ ] **Files to stage:** `supabase/migrations/20261030120000_incident_receipts.sql`, `scripts/support-incident-postgres-harness.cjs`.

### Task 2: Add v2 structural validation, immutable insertion and quota

**Files:** same receipts migration and harness. **Current source:** v1 definer/search path/auth flow at `original incident migration:26–57`; defaults/grant-control cases at `support-incident-postgres-harness.cjs:31–48`, `127–150`; spec envelope at §8.2.

- [ ] **Write the first failing v2 insert/duplicate case**, using the shared A/C/D fixture. Same reporter/report id inserts once, returns `{status:'inserted'}` then `{status:'duplicate'}`, and preserves the originally stored bytes/JSON values. Different generation/report id of one condition gives a second row. A restored-db replay is a duplicate. Persist provenance in R-O15's dedicated nullable JSON columns; assert v1 nulls and unchanged payloads.
- [ ] **Run RED:** use Task 1's exact harness command. Expected: v2 is undefined, then the new behavior assertions fail until implemented.
- [ ] **Implement v2.** `SECURITY DEFINER`, `search_path=''`, actor exclusively `auth.uid()`. Require the declared top-level keys/types, schema exactly 2, known kind, valid nonempty repeat key/install prefix, UUID report id, positive integral generation/count in integer range, parseable interval in order, four object bodies, and nullable string paths. Convert cast failures to `22023`; no `22P02` escape. No payload field-value allowlists or redaction. Store payload unchanged plus dedicated provenance/scalar/path columns (R-O15), setting `received_at=clock_timestamp()`. `ON CONFLICT (reporter_id,report_id) DO NOTHING`; never UPDATE a receipt.
- [ ] **Add each validation RED before implementing it.** Null/scalar/array envelope; missing or wrong-type fields; fractional/overflow counters; bad schema/kind/UUID/timestamps; inverted interval; missing or mismatching install prefix; nonobject payload/observed/first_observed/delivery; paths outside `<auth.uid()>/`; `octet_length(p_envelope::text)` boundary at 65,536 bytes, including R-O7's complete-envelope/multibyte fixture. Raw ids, long server messages, device name and unrestricted nested payloads remain valid within size. Record the chosen unknown-top-level-key behavior in the fixture.
- [ ] **Add quota RED/GREEN.** v2 only: at most 150 new machine receipts per reporter per rolling 24 h, plus an independent 50 for `ea_report` and `diagnostics_sent` combined; duplicates do not consume quota and still return duplicate when full. Exercise both category boundaries, machine exhaustion without blocking a human report, expired rows and concurrent attempts at each last slot. v1 stays unlimited and does not consume v2 allowances. Serialize admission per reporter (transaction advisory lock or equivalent existing PostgreSQL primitive), check duplicate under that lock before quota, and raise `54000` only for a new over-quota receipt. No new quota table/job.
- [ ] **Add grants RED/GREEN.** Anonymous execute denied; missing subject `28000`; authenticated execute only; authenticated/anon no table reads/writes; service_role SELECT only on receipts. Re-assert revokes against permissive defaults for table and both functions. Verify `prosecdef`, empty search path, and v2 `clock_timestamp()` semantics. Return only the documented statuses/errors.
- [ ] **Run GREEN:** Task 1's harness command and `git diff --check`. Preserve a case-name/results handoff and v1 definition md5; this is disposable proof only.
- [ ] **Files to stage:** `supabase/migrations/20261030120000_incident_receipts.sql`, `scripts/support-incident-postgres-harness.cjs`.

### Task 3: Add private support-bundles Storage migration and policy proof

**Files:** new storage migration; modify harness. **Current source:** existing harness bootstrap call at `support-incident-postgres-harness.cjs:169`, shared bootstrap at `history-authorization-postgres-harness.cjs:121–159` creates `auth` but no Storage model. Existing CI already runs this harness at `.github/workflows/tests.yml:57–63`.

- [ ] **Write a failing bucket/policy case.** Determine whether this disposable harness can accurately model `storage.buckets`, `storage.objects`, `storage.foldername`, role grants and object RLS. Keep any faithful minimum model local to this harness; do not alter shared bootstrap for other harnesses. The test must exercise INSERT/read/list/UPDATE/DELETE behavior, not merely search migration SQL for strings. If the model cannot prove it, record the exact limitation and make hosted read-only policy verification a named open gate.
- [ ] **Run RED:** Task 1's harness command. Expected: missing bucket/migration or missing/incorrect policy, not missing Storage infrastructure misreported as a policy failure.
- [ ] **Implement `20261030120100_support_bundles_storage.sql`.** Session SET/RESET, private `support-bundles`, 15 MB per-file limit and R-O1's five MIME types (`application/json`, `image/jpeg`, `image/png`, `image/heic`, `image/heif`). Authenticated INSERT only for this bucket and `(storage.foldername(name))[1]=auth.uid()::text`. No authenticated SELECT/UPDATE/DELETE policy for it; service-role reading. Do not revoke global object grants needed by unrelated buckets. Check policy composition: an existing broad permissive policy must not accidentally authorize this bucket.
- [ ] **Run behavior GREEN where modeled.** EA A can insert its own path, cannot insert B's; A/B cannot read or list, update, delete or overwrite; service-role can read. Verify bucket settings, path pairs and another bucket's unaffected behavior. `upsert:false` and client 409 retry behavior belong to C tests, not a pretend Storage HTTP implementation in SQL.
- [ ] **Run GREEN:** Task 1's harness command, `git diff --check`. Hand over modeled versus hosted-only claims separately. A does not apply either migration to hosted.
- [ ] **Files to stage:** `supabase/migrations/20261030120100_support_bundles_storage.sql`, `scripts/support-incident-postgres-harness.cjs`.

## Slice B — Phone Foundation (independent)

**Spec:** §4, §5.2 history fields, §6.1, §10. **Done when:** v19 data upgrades atomically to v20 without domain replay; all failure status writers persist valid dispositions; history failure metadata clears on success; the existing support export contains dispositions, every incident row and actual serialized server ids. All new SQLite cases pass through the default test handle. B exposes the unchanged shared wire serializer for C.

### Task 4: Migration 20 — dispositions, queue rebuild and schema-1 preservation

**Files:** modify migrations and integration config; new migration test. **Current source:** v13 queue `src/db/migrations.js:698–718`, current head `939–948`, atomic migration/PRAGMA/FK runner `959–1019`; default handle opening `test-support/defaultTestHandle.js:3–31`, `test-support/testDatabase.js:4–28`; old-version fixture example `__tests__/classLetterOrderMigration.test.js:8–35`.

- [ ] **Write the first failing v19→v20 public-open test.** Build a populated v19 file before the handle opens: pending/sent/rejected schema-1 incidents, their existing attempts/retry dates/errors/timestamps, and failed/terminal/nonfailed outbox rows. Open it through the default-handle fixture lifecycle, so the real migration runner runs. Assert old queue rows retain identity/body/dedupe/status/backoff and have `schema_version=1`.
- [ ] **Run RED:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx --no-install jest --config jest.integration.config.js --runInBand --runTestsByPath __tests__/fieldDiagnosticsMigration.test.js
  ```
  Register the new test in `jest.integration.config.js` first. Expected: schema still 19 or required columns absent; “no tests found” is not RED.
- [ ] **Implement v20.** Add nullable `error_class` with the four-class CHECK and nullable `error_code` with SQL-equivalent `^[A-Z0-9_]{1,40}$` validation. SQLite has no built-in REGEXP: use length and `NOT GLOB '*[^A-Z0-9_]*'`, not an unregistered REGEXP function. Backfill only existing terminal→`terminal/OTHER` and failed→`retryable/OTHER`; do not infer from `last_error`, change retry state or enqueue/replay domain work.
- [ ] **Rebuild the queue** with all §6.1 columns, exact ten kinds, unique `(kind,repeat_key)`, valid statuses, generation/count defaults, JSON storage and due-query index. Copy old rows explicitly as schema 1; new rows default schema 2. Preserve legacy payloads and ids; use honest nulls for unavailable observed provenance/sent release. Include R-O3's queue-row columns, state CHECK/default `none`, `bundle_attempts integer not null default 0` and nullable local files/remote paths. Old rows have no attachments; the automatic reservation uses existing `local_state`, not a new table. Cadence is a per-kind rule (R-O17), not another column. Rename/drop/recreate indexes safely inside migration 20's transaction.
- [ ] **Add RED/GREEN cases** for populated queue of every status, FK restoration, rollback/version atomicity, rerun no-op, malformed class/code rejection, unchanged outbox payload/owner/created_at and unsent counts. Later C must prove the upgraded terminal row produces a receipt without any domain upload; leave that cross-slice gate named, not claimed here.
- [ ] **Run GREEN:** same focused command, then:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- --runTestsByPath __tests__/sqliteFoundation.test.js __tests__/migrationsForeignKeysOff.test.js __tests__/fieldDiagnosticsMigration.test.js
  ```
  Update only current-schema assumptions that genuinely need v20; preserve historical-version fixture assertions.
- [ ] **Files to stage:** `src/db/migrations.js`, `jest.integration.config.js`, `__tests__/fieldDiagnosticsMigration.test.js`, `__tests__/sqliteFoundation.test.js` only if its current-schema assertion changes.

### Task 5: Normalize codes and persist disposition in every failure UPDATE

**Files:** new normalization utility and disposition tests; modify engine/repository and existing failure tests. **Current source inventory:**

| Writer / caller | Current source anchor | Required coverage |
|---|---|---|
| `finalizeRetriableFailure` | `src/services/offlineSync.js:966–993` | same CAS UPDATE gains class/code; returned errors, missing auth, thrown request, catch fallback |
| `finalizeTerminalFailure` | `offlineSync.js:995–1023` | immediate terminal and deterministic eighth attempt |
| `finalizeOutboxOnlyTerminalFailure` | `offlineSync.js:1025–1039`, caller `1192–1204` | UNKNOWN_TABLE; no nonexistent domain-table update; preserve identity/CAS safety |
| `finalizeManyRetriableFailure` | `offlineSync.js:1072–1098`, caller `1443–1455` | each batch row, same CAS/backoff/domain outcome |
| Engine returned-error callers | `offlineSync.js:1237–1320` | parent/grant evidence; 42501 no-live-session downgrade; terminal override |
| Engine exception callers | `offlineSync.js:1322–1342`, `1443–1461`, `1812–1818` | structured fallback code for each writer; stale cancellations remain nonfailures |
| Foreign-owner quarantine | `src/db/repositories/syncOutboxRepository.js:251–269` | terminal / FOREIGN_OWNER in the status UPDATE, including already terminal foreign rows |
| Repository `markRetriableFailure` | `syncOutboxRepository.js:351–365` | valid class/code on this public failure path too |
| Repository `markTerminalFailure` | `syncOutboxRepository.js:367–378` | terminal class and valid code on this public failure path too |

- [ ] **Write one failing public-engine test**, through the default handle, for a returned `23503` with pending parent evidence. Expect failed status plus `needs_parent/23503` in the same durable result, and unchanged payload/owner. Add normalization unit cases only as each behavior is implemented.
- [ ] **Run RED:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx --no-install jest --config jest.integration.config.js --runInBand --runTestsByPath __tests__/uploadDispositions.test.js
  ```
  Expected: status changes but disposition is null/missing. Register the file in the integration config; do not mock finalizer SQL.
- [ ] **Implement `normalizeErrorCode(raw)`** in new `src/utils/normalizeErrorCode.js`: uppercase and preserve matching 1–40 codes. Explicit caller context supplies TRANSPORT, UNKNOWN_TABLE or FOREIGN_OWNER; malformed/unrecognized fallback is OTHER. Do not classify by parsing a human message. Implement/export `dispositionFor` beside `classifyError`, taking actual decision context including terminal override, parent evidence and session downgrade.
- [ ] **Thread `{errorClass,errorCode}` through every writer/caller in the inventory.** Keep class/code on the same UPDATE as failed/terminal status. Respect terminal precedence, 28000 reauth, 42501 no-live-session reauth, needs_parent only with evidence, ordinary returned/unclassified retryable, and thrown transport. Preserve raw `last_error`. Repository methods accept validated structured values with honest defaults; terminal defaults terminal/OTHER. Quarantine always terminal/FOREIGN_OWNER. Retain current newer-row CAS protection and last-resort pending reset semantics; add the explicit R10 snapshot guard to the currently id-only unknown-table path.
- [ ] **Add each next RED/GREEN:** direct repository methods; immediate terminal, deterministic attempt 8, codeless request throw, code normalization boundaries, batch throw, unknown table, foreign-owner quarantine; 42501 with/without live session and pending grants. Inject a concurrent newer outbox mutation before each finalizer and assert a CAS miss does not stamp an old disposition on it. A stale actor and dependency skip must not create a failure disposition. This task adds no incident writes.
- [ ] **Run GREEN:** focused command, then:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- --runTestsByPath __tests__/offlineSyncOutbox.test.js __tests__/syncOutboxRepository.test.js __tests__/outboxIntegrityScan.test.js __tests__/bulkFinalize.test.js __tests__/batchFailureSemantics.test.js __tests__/uploadDispositions.test.js
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/classifyErrorHardening.test.js __tests__/deterministicErrorBudget.test.js
  ```
- [ ] **Files to stage:** `src/utils/normalizeErrorCode.js`, `src/services/offlineSync.js`, `src/db/repositories/syncOutboxRepository.js`, `__tests__/uploadDispositions.test.js`, `jest.integration.config.js`. Place new failure regressions in uploadDispositions; run the listed existing failure suites unchanged unless a separately reviewed fixture correction is needed.

### Task 6: Persist history failure kind/message and clear the complete marker

**Files:** modify history walker and its existing tests. **Current source:** empty cursor `src/services/historyWalk.js:75–87`; success persistence `145–170`; failure classification/admission/write `274–303`. Existing shared walker tests exercise public run/page persistence at `__tests__/historyWalk.test.js:34–71`.

- [ ] **Write a failing run-fails-then-succeeds case** through the default test handle. Verify `lastFailureAt`, `lastFailureKind` and raw `lastFailureMessage` commit together; a subsequent successful page clears all three in its cursor write. Preserve the first failure time during continuing failures while updating current kind/message.
- [ ] **Run RED:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- --runTestsByPath __tests__/historyWalk.test.js
  ```
  Expected: the persisted cursor lacks the two new fields or retains them after success.
- [ ] **Implement optional cursor fields**, keeping old cursors readable and unchanged coverage logic. The same durable failure write gets kind/message; every successful page clears the triad. Budget/dependency stops and stale cancellation must not introduce failure metadata. A failed metadata write must not invalidate a committed page or write under another EA.
- [ ] **Add RED/GREEN cases** for transport/query/disabled/year mismatch, a multi-run failure older than 24 h, old cursors, and failure followed by partial successful page. Preserve existing no-budget-failure and actor-admission tests. Use the default handle for new real-SQLite coverage; do not add a second standalone in-memory path.
- [ ] **Run GREEN:** focused command, then:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- --runTestsByPath __tests__/sessionHistoryPull.test.js __tests__/assessmentHistoryPull.test.js __tests__/historyWalk.test.js
  ```
- [ ] **Files to stage:** `src/services/historyWalk.js`, `__tests__/historyWalk.test.js`.

### Task 7: Share the actual wire serializer and extend support export

**Files:** new syncPayload module; modify engine, debugDump and export tests. **Current source:** serializer and special-id transforms `src/services/offlineSync.js:561–637`, current test alias `1959`; RPC-shaped payloads `src/services/assessmentFamilyPayload.js:119–129`, `src/services/letterMasteryCorrection.js:1–16`; export rows/result `src/db/debugDump.js:81–119`, `153–170`; manual export calls debugDump at `src/utils/debugExport.js:42–67`; existing real-SQLite export test `__tests__/debugExport.test.js:48–94`.

- [ ] **Write a failing export behavior case** with a terminal row whose local id is transformed for the server. Assert dispositions, full raw payload/error, actual `wirePayload`, `serverRecordId`, and all incident queue rows appear in the support export consumed by `exportDatabase`. Include pending/sent/rejected incidents, not only due rows.
- [ ] **Run RED:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- --runTestsByPath __tests__/debugExport.test.js
  ```
  Expected: added fields/section are missing, and the transformed server id is unavailable.
- [ ] **Extract the serializer unchanged** according to R5. Import it into offlineSync and debugDump; preserve the old test alias and actual domain request shapes. Add `error_class/error_code` data to failed/terminal rows (the export may retain its established camelCase field convention, documenting the mapping). Add `supportIncidents` containing every row, decoded JSON where appropriate, plus actual wire payload/id mapping per R-O10, without inventing an id for mastery. Preserve actor assertions before and after asynchronous export work.
- [ ] **Add RED/GREEN cases** for session attendees, assessment items, deterministic assignment ids, RPC-shaped assessment/mastery payloads, and malformed payload behavior under R-O10: `p_assessment.id`, null mastery id, and serialization failure retained as `wirePayload: null`, `wirePayloadError: error.message`, `serverRecordId: recordId`. The last case must not discard the entire failed-row list or entire export. Raw diagnostic evidence remains present; this is serialization fidelity, not redaction. Share database and bundles both consume this same debugDump result.
- [ ] **Run GREEN:** focused command, then:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/offlineSync.stripping.test.js __tests__/syncContractCompleteness.test.js
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- --runTestsByPath __tests__/debugExport.test.js __tests__/sessionGroupSync.test.js __tests__/letterMasteryCorrectionSync.test.js
  ```
- [ ] **Files to stage:** `src/services/syncPayload.js`, `src/services/offlineSync.js`, `src/db/debugDump.js`, `__tests__/debugExport.test.js`. Put new diagnostic assertions in debugExport; run existing serializer/contract suites unchanged. No change to `src/utils/debugExport.js` is required merely to add fields already returned by debugDump.

## Slice C — Phone Incidents and Bundles (after B)

**Spec:** §5–7, §9.2–9.3, §14 phone/component cases. **Done when:** observations, event capture, snapshots, promotion, bounded retention, bundle creation/upload and v1/v2 delivery pass real-handle SQLite tests; failure isolation and account switching pass; ErrorBoundary captures while a handle is open. Apply R-O3–R-O11/R-O17 and §6.4 fairness; N1/N2 remain named contract conflicts. F receives a real `captureEvent/getDeliveryState` API as soon as Task 8 and the capture portion of Task 11 are integrated.

### Task 8: Record, freeze, promote and prune incident generations

**Files:** modify incident repository and its tests; integration config; new shared identity fixture. **Current source:** fixed key namespace `src/db/repositories/supportIncidentRepository.js:11–18`; enqueue/cap `34–58`; due list/count `74–89`; non-CAS acknowledgements/backoff `90–111`; local-state transaction support `src/db/repositories/localStateRepository.js:15–24`.

- [ ] **Write the first failing record behavior** through `getDefaultTestHandle().services.repositories.supportIncidents`: observe a new condition, then observe it again. Assert one schema-2 row, live payload and complete synchronous runtime provenance, stable first observation and id, min/max interval, occurrence_count remaining 1 for observations. Event recording increments counts for the same event condition; distinct manual report/request ids create distinct conditions.
- [ ] **Run RED:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx --no-install jest --config jest.integration.config.js --runInBand --runTestsByPath __tests__/supportIncidentRepository.test.js
  ```
  Add this existing test path to integration config and migrate its fixture to the default handle. Expected: the new recording contract is absent, or repeated observations are discarded by old dedupe.
- [ ] **Implement `record(txn, kind, conditionParts, payload, {event})` and bound wrapper.** Capture `getRuntimeDiagnostics()` synchronously at observation, never at delivery; set generation 1 for new rows. Export the unchanged `INCIDENT_KEY_NAMESPACE` and publish R-O8/R-O9 identity fixtures in `test-support/fixtures/fieldDiagnosticsIdentity.json`; both C/D tests consume that one file. Preserve an `enqueue` compatibility wrapper for existing discovery callers with prehashed keys, through new `record()` without hashing old keys again or changing episode payloads. Plan 3 rows are schema 2, cadence `once`: existing episode rows never promote/re-report, including on release change; other kinds have `daily` cadence. Return explicit incident refs/results; update exact-result tests intentionally. Remove the old repository-wide 8192-byte rejection for schema 2 (`supportIncidentRepository.js:9`, `34–36`, `__tests__/supportIncidentRepository.test.js:34–38`, `89–97`); retain explicit v1 compatibility fixtures and let schema-2 payload builders enforce the new contract.
- [ ] **Add RED/GREEN for each transition:** pending/no snapshot updates live state; pending/frozen sets `has_unsent_changes=1`; daily-cadence sent sets it and immediately promotes on changed release; once-cadence sent never re-reports; rejected remains rejected. A freeze never adopts newer live body. Snapshot/report id use `uuidv5(id+':'+generation, INCIDENT_KEY_NAMESPACE)` and the shared fixture. Release comparison uses exactly R-O9's version/build/update tuple. Schema-1 rows never become schema 2 merely because they are read.
- [ ] **Add due promotion in the observer transaction**, before the ready count on every status refresh (§6.3). Promote daily-cadence sent/dirty rows acknowledged at least 24 h ago: clear snapshot/dirty flag, increment generation, reset retry admission. Test freeze → second event → acknowledge → no third event → exactly 24 h → status refresh makes `incidentReadyCount > 0` and schedules an incident-only drain. Test release-change promotion and once-cadence exclusion. Drain-time promotion alone cannot satisfy this contract.
- [ ] **Add capacity/fairness RED/GREEN** at 200, in exact §6.4 admission order: (1) prune oldest sent/rejected **observed** rows, even dirty; (2) prune oldest sent **event** rows without unsent changes; (3) for an incoming ea_report/diagnostics_sent, evict oldest pending observed row; (4) otherwise drop newcomer and atomically increment `local_state.support_incidents_dropped`. A human report is never dropped while any observed row exists. Event sent/dirty rows remain protected. Test every tier, all-pending observed pressure, all-event saturation, human admission and cumulative drop delivery. Re-derived daily conditions get fresh row/report ids; the once-cadence cross-prune requirement remains N2. Clean up only the same EA's evicted attachments (R-O3/R-O5); no capture continuation may resurrect an evicted row.
- [ ] **Implement generation-aware repository mutations** for bundle state/outcome and snapshot creation (only after R-O4's final attachment outcome), acknowledgement, rejection and backoff. Acknowledgement records the snapshot's release and leaves `has_unsent_changes` untouched; it clears only the acknowledged generation's snapshot. Keep backoff identical to the current 5 s ×3, cap 15 min curve. A stale generation cannot reject/backoff/ack a promoted row.
- [ ] **Run GREEN:** focused command and:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/installId.test.js
  git diff --check
  ```
- [ ] **Files to stage:** `src/db/repositories/supportIncidentRepository.js`, `__tests__/supportIncidentRepository.test.js`, `jest.integration.config.js`, `test-support/fixtures/fieldDiagnosticsIdentity.json`.

### Task 9: Build diagnostic payloads and bounded envelopes

**Files:** new incidentPayloads module and tests. **Current source:** B's extracted serializer originates at `src/services/offlineSync.js:561–637`; runtime object at `src/utils/runtimeDiagnostics.js:27–75` already includes deviceName and gitCommit; original small-envelope selection is `src/services/supportIncidents.js:5–13`; current byte counter is `supportIncidentRepository.js:23–30`.

- [ ] **Write a failing terminal-payload test** using the public payload builder and a real serialized outbox row. Assert table/operation/local id/server id, exact class/code/error/retry/timestamps and wire payload; preserve child identities, notes and raw errors per J4. No diagnostic deny-list.
- [ ] **Run RED:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/incidentPayloads.test.js
  ```
  Expected: builder absent, then field/size assertions fail. Pure payload tests may be unit tests; durable observer cases belong to Task 10.
- [ ] **Implement the §5.2 builders** for terminal rows, backlog, breaker notes, history failures, caught app errors, EA reports and manual diagnostics. Use B's exact serializer and R-O10's nested assessment/null mastery/serialization-failure representation. Keep first/current observed runtime complete; never filter gitCommit from the entire runtime object just because it is absent from §7.1's prose list. Use R-O8's UUID replacement → digit replacement → whitespace collapse → first 500 chars → UUIDv5 rule; retain raw message and full `messageDigest` in payload for D's signature. Both slices use the shared fixture; no extra crypto dependency.
- [ ] **Implement deterministic truncation** to R-O7's UTF-8/sibling-marker contract (`<field>Truncated`, `<field>OriginalBytes`): wirePayload long strings/arrays first while retaining keys and identifying ids, then stack/componentStack, then sampleLastErrors. Capture the bounded bundle evidence before further receipt truncation; never mutate domain/outbox data or the default manual support export to make a receipt small. Recompute complete final size including metadata/paths/markers; if compact `JSON.stringify` including delivery still exceeds 56,000 UTF-8 bytes, reject TOO_LARGE with no request.
- [ ] **Add RED/GREEN** for multibyte text, long stack, nested arrays/ids, ten distinct sample errors, marker placement, unchanged small payload, irreducibly oversized body, and a frozen observation made before an OTA delivered afterward. New runtime provenance stays in delivery; it must not overwrite observed/first_observed. Assert ≤56,000 bytes for the full phone envelope and the distinct 65,536-byte server jsonb-text boundary; include markers and delivery in measurement.
- [ ] **Run GREEN:** focused command and the existing runtime diagnostics tests:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/incidentPayloads.test.js __tests__/runtimeDiagnostics.test.js
  ```
- [ ] **Files to stage:** `src/services/incidentPayloads.js`, `__tests__/incidentPayloads.test.js`.

### Task 10: Observe durable conditions on status refresh and reconnect

**Files:** modify supportIncidents, handle services/client, engine, OfflineContext, quarantine and tests; new observer test. **Current source:** handle repository/service binding `src/session/handleServices.js:36–58`, `101–109`; fetch response resolution `src/session/handleDataClient.js:25–58`; status count `offlineSync.js:1869–1885`; refresh and reconnect `OfflineContext.js:78–120`, `280–304`; other refresh callers at `170`, `316`, `373`, `384–388`; quarantine hook `syncOutboxRepository.js:271–278`; breaker payload source `src/db/repositories/repositoryRuntime.js:35–67` and reader `syncStateRepository.js:53–64`.

- [ ] **Write the first failing real-handle observation test:** terminal row already committed, call status refresh/status service, expect one upload_terminal row with B's disposition/wire/server-id evidence. Domain rows and outbox are unchanged. Observe twice and expect one condition; change errorCode and expect another.
- [ ] **Run RED:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx --no-install jest --config jest.integration.config.js --runInBand --runTestsByPath __tests__/supportIncidentObserver.test.js
  ```
  Register the new path. Expected: terminal durable state produces no incident in current source.
- [ ] **Implement `observeStandingConditions(handle)`** with indexed reads of that EA's terminal rows, pending/failed backlog, breaker notes and known history cursor scopes. Use one independent observer transaction for changed records, daily promotion (Task 8), and recovery of rows `capturing` for at least ten minutes since `updated_at` to `failed` with `bundleCaptureFailed: true`. New eligible captures set `capturing` and reserve R-O3's allowance in that transaction; perform capture only after commit. Catch/log ordinary observer failure at the status boundary and still return domain status. Propagate actor staleness through service work. Do not write any domain/outbox status from this observer.
- [ ] **Add each source RED/GREEN.** Terminal owned rows use the full six-part key from §5.2. Backlog requires oldest pending/failed strictly older than 72 h **and** lastServerResponseAt within 24 h; include class/table/code aggregates, oldest row and ≤10 distinct errors. Empty outbox never creates backlog. Breaker key is full scope and payload comes from the stored note. History failures at least 24 h old report even with an empty outbox. Derive history families from actual prefixes: `session_history_pull` (`sessionHistoryPull.js:15`), `assessment_history_pull`/`battery_run_history_pull` (`assessmentHistoryPull.js:13–14`), `letter_mastery_pull` (`masteryRepository.js:22`). Persist raw scope separately; do not use a guessed history key format.
- [ ] **Record contact in `fencedFetch`.** Stamp the originating handle's in-memory `lastServerResponseAt` on HTTP status <500 after successful response admission; do not stamp thrown transport/timeout, 5xx, aborted or stale completion, or another EA's handle. Test 200, 401/403/409, 499, 500 and lost/late response. Nothing persists this timestamp or uses `lastSuccessfulSyncTime` as contact evidence.
- [ ] **Wire R6.** Run observation, promotion and stale-capture recovery before getSyncStatus computes `incidentReadyCount`; the due query/count excludes `bundle_state = 'capturing'`. Test capture in progress does not schedule a receipt and recovered failure does; test 9:59 versus 10:00, with no capture heartbeat from ordinary refreshes. Condition refresh must not reset a capturing row's age. Add `refreshSyncStatus()` on an offline→online transition, before deciding from newly observed ready counts; preserve reconnect history pull behavior. Test initial load, poll, foreground and after-pass through their existing calls, and an incident-only reconnect with stale zero counters. No throttle; the first refresh after real contact may report backlog.
- [ ] **Move foreign-owner reporting out of quarantine** per R3. Preserve the terminal/FOREIGN_OWNER writes, scan summary and operational capture. Derive the durable foreign set from terminal rows with `error_code = 'FOREIGN_OWNER'` and a foreign owner; use sorted outbox ids for the unchanged episode key and counts-only `{foreignTotal, foreignByTable}` payload through `record()` with cadence once; exclude it from the owned-row upload_terminal path. Update integrity tests to assert quarantine is committed even if incident recording later fails. Source open happens before all services are available (`signedInHandle.js:407–421`); initial status refresh supplies the observer, not a new domain-transaction hook.
- [ ] **Add failure isolation and upgrade RED/GREEN.** Fail the observer's incident write after an MV001 finalizer, then reopen; the stale domain payload must not be replayed. Observe B's upgraded terminal row and send only a receipt, with zero domain requests. Ordinary retries, offline-only/all-transport passes, missing dependencies, page budgets, CAS misses and stale cancellations produce no new incident kinds.
- [ ] **Run GREEN:** focused command, then:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/handleDataClient.test.js __tests__/OfflineContext.test.js __tests__/productionBindingStatic.test.js
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- --runTestsByPath __tests__/supportIncidentObserver.test.js __tests__/outboxIntegrityScan.test.js __tests__/handleServices.test.js __tests__/uploadDispositions.test.js
  ```
- [ ] **Files to stage:** `src/services/supportIncidents.js`, `src/session/handleServices.js`, `src/session/handleDataClient.js`, `src/services/offlineSync.js`, `src/context/OfflineContext.js`, `src/db/repositories/syncOutboxRepository.js`, `__tests__/supportIncidentObserver.test.js`, `__tests__/handleDataClient.test.js`, `__tests__/OfflineContext.test.js`, `__tests__/outboxIntegrityScan.test.js`, `__tests__/handleServices.test.js`, `jest.integration.config.js`.

### Task 11: Capture diagnostic bundles locally after commit

**Files:** new diagnosticBundle and tests; modify supportIncidents/handleServices, debugDump, logger and their tests for bounded capture. **Current source:** debugDump actor checks/result `src/db/debugDump.js:153–170`; existing File/Paths API and stale checks `src/utils/debugExport.js:1–6`, `23–36`; structured logs `src/utils/logger.js:167–187`; device profile service `src/session/handleServices.js:150–153`; local-state get/set `localStateRepository.js:9–24`; installation id `src/services/installId.js:4–17`.

- [ ] **Write a failing capture-after-commit test.** Record an incident, commit, then capture the bundle; assert it sees that incident and the triggering failed row. Capture a second event while delivery is delayed and assert the first file retains its original snapshot, not later send-time state. Fake only native filesystem/network/disk boundaries; SQLite and repository transactions remain real.
- [ ] **Run RED:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx --no-install jest --config jest.integration.config.js --runInBand --runTestsByPath __tests__/diagnosticBundle.test.js
  ```
  Register the test. Expected: no capture function/file/incident attachment exists.
- [ ] **Implement bounded capture before allocation (§9.2).** `buildDiagnosticBundle(handle,{trigger,incidentRef})` captures bundleVersion 1, id/trigger/ref/time, handle EA identity, full runtime, network/disk/install id and support export. Add `debugDump({handle}, options)` limits for newest 200 failed/terminal outbox rows, ≤20 KB per payload with markers, newest 500 mastery rows. Apply SQL row limits and bound raw payload extraction before parsing/serializing, rather than fetching/parsing all rows and slicing afterward. Bound other exported variable-size sections too; no full queue-snapshot duplication or unbounded intermediate in capture. Manual Share database remains unbounded by default.
- [ ] **Add `logger.tail({maxBytes, maxEntryBytes})`.** Read newest-first from buffer and persisted entries, ≤2 MB total and ≤4 KB per entry with truncation markers. Do not call getLogs/flush/exportLogs to materialize full history first. Test huge entries, unflushed buffer, persisted history and multibyte bytes; keep Share logs behavior unchanged.
- [ ] **Yield and fence each section.** Yield to the event loop between export/log/runtime/native sections; check open/current before each section, after awaits and before file write/attachment. Use installed File/Directory/Paths APIs for `Paths.document/support-bundles/<userId>/<bundleId>.json`. Screenshot companion keeps returned MIME type and original extension. Abandon immediately on sign-out; N1 leaves immediate durable-failure timing unresolved, never authorizes a stale write.
- [ ] **Finalize capture in a separate handle transaction.** Recording an incident needing a bundle sets `bundle_state = capturing` atomically; no drain/count may treat it as ready. After files exist, atomically set `bundle_id`, `bundle_file`, `screenshot_file`, state `ready`; ordinary capture/write failure attempts the minimal bundle before `failed`/`bundleCaptureFailed` (R-O6). Use row/generation/capturing CAS so eviction or ten-minute recovery wins over a late completion. No native/export/network work inside domain transactions.
- [ ] **Add automatic trigger RED/GREEN.** First creation of the five §9.3 automatic kinds only; no ordinary retry or Plan 3 bundle. Atomically stamp per-EA `support_auto_bundle_last_at` when capture starts. Test concurrent starts, restart, exact 24 h boundary, account switch and failed capture still consuming allowance. Manual reports/diagnostics bypass this automatic allowance.
- [ ] **Add size/fallback/cap RED/GREEN.** If bounded serialization still exceeds 12 MB or a non-stale full capture/write fails, attempt a minimal bundle of runtime, EA, network, disk, counts and first 50 bounded outbox rows; record `truncated`. If that cannot be written, fail explicitly per R-O6. Test disk failure, oversized inputs and early budgeting without large intermediate allocation. Keep five bundles **per EA directory**, screenshots paired; oldest-unsent eviction marks that row `failed`/`bundleDropped` before cleanup. Test two EAs, a late capture completion and pending drain; never evict another EA's files or rewrite a frozen outcome.
- [ ] **Expose the agreed capture API for F.** Capture event owns its transaction→bundle→attachment sequence and returns a durable incidentRef; `getDeliveryState` returns that exact generation. Bind in `handleServices`, without a mutable module-global current actor. Manual events receive unique report/request ids before recording. A screenshot copy failure remains distinguishable from a successfully queued attachment.
- [ ] **Run GREEN:** focused command plus:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- --runTestsByPath __tests__/diagnosticBundle.test.js __tests__/debugExport.test.js __tests__/handleServices.test.js
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/logger.test.js __tests__/moduleStateAllowlist.test.js __tests__/productionBindingStatic.test.js
  ```
- [ ] **Files to stage:** `src/services/diagnosticBundle.js`, `src/services/supportIncidents.js`, `src/session/handleServices.js`, `__tests__/diagnosticBundle.test.js`, `__tests__/handleServices.test.js`, `jest.integration.config.js`, `src/utils/logger.js`, `__tests__/logger.test.js`, `src/db/debugDump.js`, `__tests__/debugExport.test.js`; no new module-global actor cache.

### Task 12: Drain schema 1 and frozen schema 2, uploading bundles first

**Files:** modify supportIncidents/repository/engine and existing drain tests. **Current source:** v1 drain `src/services/supportIncidents.js:18–49`; engine invocation after domain loop `src/services/offlineSync.js:1823–1833`; existing session-gated client `src/session/handleDataClient.js:11–68`; row due/backoff primitives `supportIncidentRepository.js:74–111`; same-request installation prefix `supportIncidents.js:25–28`.

- [ ] **Write a failing mixed-schema drain case** with the default handle, a real queue and injected remote boundary. Assert a copied schema-1 row calls only v1 with exactly its existing argument/envelope shape and accepts true or false; a new row finalizes attachments, then freezes one v2 report id/body and calls v2. A replay after a lost ack sends that same id/frozen observation body; delivery metadata may refresh. Modify old tests that assumed every newly enqueued row is v1; keep explicit schema-1 regression fixtures. The old whole-request privacy assertion (`__tests__/supportIncidentDrain.test.js:140` onward) applies only to the unchanged legacy-kind fixture; it must not become a diagnostic deny-list for schema 2.
- [ ] **Run RED:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx --no-install jest --config jest.integration.config.js --runInBand --runTestsByPath __tests__/supportIncidentDrain.test.js
  ```
  Register this path and migrate new/changed SQLite fixtures to the default handle. Expected: only v1 is called, snapshots/generations are absent.
- [ ] **Implement §6.5 admission and §6.4 priority.** Observer promotion has already run before ready count. Select at most 20 due rows, excluding `capturing`, ordered human reports/diagnostics → other generation-1 deliveries → re-reports, oldest first within each. Do not freeze schema 2 until attachment outcome is final (R-O4). Then freeze transactionally if absent; preserve that snapshot until acknowledgement. Preserve domain-first placement, table-only exclusion, incident-only passes, live session checks, and support failure's independence from domain result.success.
- [ ] **Build delivery at each send.** Include current install id and EA identity, app version/build/update, full NetInfo state/details, disk bytes, outbox counts by status/class, lastSuccessfulSyncTime, handle.lastServerResponseAt, cumulative dropped incidents and sentAt. Read identity from this handle, never whichever actor is current after an await. Use snapshot release for acknowledgement, delivery release only in delivery.
- [ ] **Upload each unsent bundle/screenshot before its receipt.** Object paths are `<reporter>/<yyyy-mm-dd>/<bundleId>.json` and `.../<bundleId>-screenshot.<original-extension>`, stable across retries/restarts, based on capture identity/date. Use returned screenshot MIME type (R-O1), not a forced JPEG label; enforce 15 MB per file before loading oversized bytes. Use `handle.enqueueRequest(() => handle.dataClient.storage.from('support-bundles').upload(...,{upsert:false,contentType:...}))`. Use filesystem bytes/ArrayBuffer at the native boundary, not React Native Blob/FormData assumptions. 409 already-exists is confirmed success; do not grant EA read to probe an object.
- [ ] **Persist upload success before deleting local files.** A kill after upload but before progress persistence replays and gets 409; a kill after progress persistence/file removal skips re-upload and still includes the uploaded path. Persist remote `bundle_path`/`screenshot_path` separately on the queue row to resume a partial pair; state `uploaded` only after every requested attachment is resolved. `bundle_attempts` is durable and distinct from receipt `attempts`; only actual upload failures count toward five, not receipt transport/rate errors. A partial pair does not erase the other path.
- [ ] **Add five-attempt RED/GREEN.** Upload failure backs off and holds the receipt; the fifth failed attempt sets `bundle_state = failed` with `bundleUploadFailed:true`, then freezes a receipt containing final paths/outcome flags (R-O4). Missing/evicted local file uses `bundleDropped:true`, distinct from an upload error. Preserve report id throughout; build the snapshot only after this outcome, never before upload/fallback. Capturing rows never freeze/send; none/uploaded/failed permits final freeze, ready requires upload first. File cleanup is after confirmed upload, not merely starting a request or acknowledging an unrelated receipt.
- [ ] **Implement response transitions with generation CAS.** Only `inserted` or `duplicate` acknowledges; update status, last_sent_at and last_sent_release, clear snapshot for exactly the sent generation, leave dirty flag. Returned/thrown stale actor propagates with no cross-actor update. `22023` rejects, `54000`/transport/auth backs off, keeps snapshot and stops drain. Unknown acknowledgement is not success. Locally oversized envelope rejects TOO_LARGE without a request and does not prevent a later valid due row.
- [ ] **Add RED/GREEN races and restarts.** Event arrives while upload/RPC is in flight; delayed ack after promotion; reordering; force-quit after snapshot freeze/upload/receipt insertion; copied schema-1 replay; only incidents with an empty domain outbox; outcome-before-freeze bundle fallback and priority drain under 200-row machine pressure; late EA switch before each network step/finalization. Files and requests remain bound to the original reporter folder. Drop counter reaches delivery. Status-refresh promotion schedules a pass without prior pending work; capturing rows remain excluded until capture or ten-minute recovery completes.
- [ ] **Run GREEN:** focused command, then:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- --runTestsByPath __tests__/supportIncidentRepository.test.js __tests__/supportIncidentObserver.test.js __tests__/diagnosticBundle.test.js __tests__/supportIncidentDrain.test.js __tests__/handleServices.test.js
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/OfflineContext.test.js __tests__/offlineSyncResultSemantics.test.js __tests__/handleDataClient.test.js
  ```
- [ ] **Files to stage:** `src/services/supportIncidents.js`, `src/db/repositories/supportIncidentRepository.js`, `src/services/offlineSync.js`, `src/services/diagnosticBundle.js`, `__tests__/supportIncidentDrain.test.js`, `__tests__/supportIncidentRepository.test.js`, `__tests__/diagnosticBundle.test.js`, `__tests__/OfflineContext.test.js`, `jest.integration.config.js`.

### Task 13: Record caught React errors and preserve existing discovery behavior

**Files:** modify App and App tests; adjust discovery only for its compatibility wrapper; existing discovery/integrity tests. **Current source:** `App.js:46–60` ErrorBoundary reports only to Sentry; provider tree `113–133`; registry getter `src/session/signedInHandle.js:30–35`; handle-bound discovery enqueue `src/session/fileDiscovery.js:88–106`; existing App mocks `__tests__/App.plan5.test.js:16–36`.

- [ ] **Write a failing component test** with a crashing child under the real ErrorBoundary and a captured open test handle. Expect one app_error_caught incident and post-commit automatic bundle. Also crash without an open handle and expect existing Sentry reporting only. Do not fake `componentDidCatch` by calling a helper instead of rendering a throwing child.
- [ ] **Run RED:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/App.plan5.test.js
  ```
  Expected: operational capture occurs but no durable incident/bundle. Put the durable assertions through the default handle rather than the file's current opt-out fixture; preserve focused mock-only App composition cases separately within the file.
- [ ] **Implement best-effort componentDidCatch recording.** Capture an open/current handle at catch time and pass it explicitly to C's event service. Preserve errorName/message/stack/componentStack/components and the shared digest/key. Existing Sentry capture, logging, fallback and Try again continue to work. A recording/bundle failure must not throw recursively from the error boundary. A revoked handle must not record under its successor.
- [ ] **Adapt discovery only as needed** to the R4/Task 8 compatibility wrapper. Keep Plan 3's file-fence, readonly foreign-file reads, kinds, keys/counts and episode dedupe. No new full foreign-database support bundle or changed discovery lifecycle. New Plan 3 rows use schema 2 through record(), cadence once; copied rows remain schema 1. Test repeated episodes, release changes and >24 h refreshes never promote/re-report an existing episode.
- [ ] **Run GREEN and complete C regressions:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/App.plan5.test.js __tests__/fileDiscovery.test.js __tests__/signedInHandle.test.js __tests__/productionBindingStatic.test.js __tests__/moduleStateAllowlist.test.js
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- --runTestsByPath __tests__/fieldDiagnosticsMigration.test.js __tests__/uploadDispositions.test.js __tests__/supportIncidentRepository.test.js __tests__/supportIncidentObserver.test.js __tests__/diagnosticBundle.test.js __tests__/supportIncidentDrain.test.js __tests__/outboxIntegrityScan.test.js __tests__/debugExport.test.js
  git diff --check
  ```
  App.js is outside the src-only binding scan; do not use that fact to introduce an ambient data lookup into ordinary services/components.
- [ ] **Files to stage:** `App.js`, `__tests__/App.plan5.test.js`, `src/session/fileDiscovery.js` if the enqueue return contract requires it, `__tests__/fileDiscovery.test.js`, `__tests__/outboxIntegrityScan.test.js`.

## Slice F — Profile Actions UI (against C's agreed interface)

**Spec:** §11; J5/J6. **Start:** presentational sheets/tests can start in parallel; consume C's interface above without changing it unilaterally. Before picker integration, the orchestrator supplies the dependency, lockfile and native plugin change. **Done when:** component tests cover validation, actual per-report online/offline confirmation, diagnostics capture, missing native module, cancellation, duplicate taps and stale actor; R-O1's original-type attachment and §11 native preflight are implemented; default-size A03s acceptance remains a separate device gate.

### Task 14: Report a problem and Send diagnostics bottom sheets

**Files:** new ReportProblemSheet, SendDiagnosticsSheet and ProfileDiagnostics component test. **Current source:** `src/screens/main/ProfileScreen.js:184–206` support rows; existing sheet mount pattern `230–233`; `documentation/design-system.md:299–320` multiline TextField/errors, `404–429` Profile support panel, `488–516` BottomSheet keyboard/footer, `708–738` actor toast; actual shared props/accessibility setup `src/components/common/BottomSheet.js:24–46` and existing form reset/attempt guards `src/components/profile/ChangePasswordSheet.js:15–65` are the implementation references.

- [ ] **Write the first failing component test:** open ReportProblemSheet, tap Send with whitespace-only text, expect a required error beside “What went wrong?” and no capture or sync. Add one valid-text behavior only after that passes. Render the actual shared BottomSheet under the existing test providers; do not replace it with a dialog stub.
- [ ] **Run RED:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/ProfileDiagnostics.test.js
  ```
  Expected: component absent, then required-message assertion fails until implemented.
- [ ] **Implement presentational sheets** with explicit props for visibility, dismiss, submit and pending/error/result state. Report label is “What went wrong?”, required, ≤4,000 characters, multiline; Send in the footer. Send diagnostics has one plain sentence explaining app information goes to the Masi team, and Send. Use existing TextField/BrandButton/InlineNote, tokens and type roles; no raw typography/colors, Paper TextInput, dialog or Alert. Copy is provisional for Jim's wording gate.
- [ ] **Add RED/GREEN:** 4,000 accepted/4,001 refused, whitespace validation without silently rewriting the reporter's words, inline submission error, loading/duplicate-press prevention, cancel/backdrop/Android Back, keyboard-visible submit, reset on reopen and no late result overwriting a new form. A current-actor root toast may outlive navigation; a stale actor cannot publish it.
- [ ] **Run GREEN:** focused command plus:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/ProfileDiagnostics.test.js __tests__/BottomSheet.test.js __tests__/designSystemGuard.test.js
  ```
- [ ] **Files to stage:** `src/components/profile/ReportProblemSheet.js`, `src/components/profile/SendDiagnosticsSheet.js`, `__tests__/ProfileDiagnostics.test.js`.

### Task 15: Guard the SDK-matched screenshot picker

**Files:** new supportScreenshot utility and tests; modify ReportProblemSheet tests/attach action. **Current source:** installed SDK declaration `package.json:55`, no picker in dependencies `44–76`, existing plugins `app.config.js:62–73`. Use R-O1 and spec §11's native preflight contract. Builder must read the orchestrator-installed picker source and version before implementing the guard.

- [ ] **Write a failing picker-absent component/utility case.** Make `requireOptionalNativeModule('ExponentImagePicker')` return null for an older native binary and assert `require('expo-image-picker')` is **never executed**. Report form still renders and submits text; Attach a screenshot is hidden and nothing throws. Also test a loaded JS module with no usable launcher, not only a package-resolution failure.
- [ ] **Run RED:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/supportScreenshot.test.js __tests__/ProfileDiagnostics.test.js
  ```
  Expected: unguarded require crashes or attach stays visible despite native unavailability.
- [ ] **Preflight the native module before loading picker JS (§11).** Use `requireOptionalNativeModule` from `expo-modules-core`:
  ```js
  const availablePicker = () => {
    if (!requireOptionalNativeModule('ExponentImagePicker')) return null;
    const picker = require('expo-image-picker');
    return typeof picker.launchImageLibraryAsync === 'function' ? picker : null;
  };
  ```
  A catch-only dynamic require is unsafe under Metro: native import failure can be fatal before catch. No eager picker import. Test native-null skips JS load, native-present loads once and missing launcher hides attach; native binaries still need G3.
- [ ] **Implement R-O1 selection without transformation.** One gallery image with `mediaTypes: ['images']`, `allowsEditing: false`, `quality: 0.5`, no multi-select. Preserve returned type, bytes and original extension through copy/upload, including JPEG/PNG/HEIC/HEIF; bucket limit is 15 MB per file. Cancel or permission/unavailability/oversize errors stay inline without losing report text. Test original-format metadata, late result after dismissal/EA switch and same-form retry; no resize/conversion package or JPEG relabeling.
- [ ] **Run GREEN:** focused command. Read back `package-lock.json` version and native guard source in the orchestrator handoff; native present/absent behavior still needs the gate. F leaves package/plugin/lock files untouched.
- [ ] **Files to stage:** `src/utils/supportScreenshot.js`, `__tests__/supportScreenshot.test.js`, `src/components/profile/ReportProblemSheet.js`, `__tests__/ProfileDiagnostics.test.js`.

### Task 16: Wire Profile rows to durable capture and truthful delivery feedback

**Files:** modify ProfileScreen and layout/component tests. **Current source:** handle/user/profile/offline hooks `src/screens/main/ProfileScreen.js:32–42`, existing action/toast pattern `60–108`, support layout `184–206`, mounts `230–233`; component fixture hooks/mocks `__tests__/ProfileScreen.layout.test.js:25–35`, `83–114`; `syncNow` may return null or share an active pass (`src/context/OfflineContext.js:132–159`).

- [ ] **Write a failing user-path test**: expand Support tools, open Report a problem, enter text, Send. Assert `ea_report` durable capture, bundle/attachment completion, then sync trigger, then an exact-row delivery-state read. Mock the agreed service boundary for isolated components; add one integrated real-handle capture test using C's implementation once available.
- [ ] **Run RED:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/ProfileDiagnostics.test.js __tests__/ProfileScreen.layout.test.js
  ```
  Expected: rows/actions missing. Later RED must distinguish receipt pending from an apparently successful generic sync.
- [ ] **Add the two nested support rows** beside Share logs/database, with existing spacing/divider/accessibility conventions and `trailing='chevron'`. Update support-summary copy to include the new actions; the open-panel “Use when Masi support asks” subtitle (`ProfileScreen.js:192`) also needs wording compatible with proactive EA reporting. Mount the two BottomSheets; retain independent Share logs/database/Test crash reporting actions. Capture actor and one in-flight submission token/ref synchronously so same-render double taps cannot create two reports.
- [ ] **Wire C's capture API.** Report sends raw message ≤4,000 characters, screenshotAttached and screen Profile; diagnostics sends trigger manual. Await local recording and bundle preparation before triggering `syncNow`. After sync settles, read only that incidentRef/generation. Show **“Sent. Thank you.”** only for confirmed sent; otherwise durable pending gets **“Saved on your phone. It will send when you're online.”** An unsaved or rejected record gets an inline error, not a saved/sent success claim. An online device with a transport/auth/quota failure is still pending.
- [ ] **Add RED/GREEN** for online ack, offline save, online transport failure, joining a preexisting sync that never included this new report, rejected/oversized event, screenshot absent/present, diagnostics capture, same-tick double tap, dismiss/reopen, navigating away, EA switch, and attachment failure. Preserve root actor-scoped 4,000 ms outcome toasts and inline form failures.
- [ ] **Run GREEN:** focused command plus:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/ProfileDiagnostics.test.js __tests__/supportScreenshot.test.js __tests__/ProfileScreen.layout.test.js __tests__/ProfileScreen.releaseMetadata.test.js __tests__/designSystemGuard.test.js __tests__/ToastActorScope.test.js
  git diff --check
  ```
- [ ] **Files to stage:** `src/screens/main/ProfileScreen.js`, `__tests__/ProfileDiagnostics.test.js`, `__tests__/ProfileScreen.layout.test.js`. Add no native/package files from this slice.

## Slice D — Operator Reader (independent)

**Spec:** §12.1 and reader verification in §14. **Done when:** a stubbed runner proves a single complete snapshot query, grouping and Git-ref matching are deterministic, filtered runs never claim coverage, contested ownership exits 2, review windows work, and fetch/resolve construction is safe and SELECT-only. Live use waits for A's hosted gate and credentials. D can develop against the agreed A/C/D fixture without a running phone or server migration.

### Task 17: One-statement psql snapshot and exact enumeration

**Files:** new `scripts/read-support-incidents.cjs`, new reader test, package script. **Current source:** parser/load/target checks exported at `scripts/sqlite-staging.cjs:38–118`, `347–354`; existing psql connection validation/runner pattern `scripts/ea-access.cjs:49–82`, `109–141`; read-only fallback `.claude/skills/sqlite-staging-sql/SKILL.md:49–59`; receipt table source `original incident migration:8–18`; EA name columns in harness fixture `support-incident-postgres-harness.cjs:24–28`.

- [ ] **Write the first failing reader CLI test** with a stubbed process runner, dummy dotenv files and fixed JSON output. Assert exactly one receipt-read SQL statement, joining auth.users and public.users, and one returned JSON value containing snapshot time and the entire receipt set. Include >1,000 rows. No HTTP pagination, timestamp pre-query, count query, separate name reads or per-kind partition read may provide the sweep.
- [ ] **Run RED:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/readSupportIncidents.test.js
  ```
  Expected: reader missing, then the snapshot/coverage assertions fail. Tests must not contact the hosted pooler or read real credential files.
- [ ] **Implement an import-safe CommonJS CLI** with injected cwd/env/psql runner/Storage client for tests and `require.main===module` entry. Add `bugs:incidents: node scripts/read-support-incidents.cjs` to package.json. Support spec flags plus `--json` for machine consumers and `--help` without database access; reject unknown/duplicate/malformed arguments before subprocess. Keep stdout parseable for direct `node ... --json`; emit safe target diagnostics to stderr. npm's banner is why skills use direct node for JSON.
- [ ] **Reuse staging parsing/validation** by importing `loadEnvFiles`, `parseEnvContent` where needed and `validateSqliteEnv`; dotenv is data, never sourced/expanded. Validate the exact SQLite ref/URL and the explicit session pooler host, port 5432, database postgres, username postgres.segygjzpujphwvrubusm, SSL required. Refuse legacy/mismatched URLs before connecting. Read/validate a checkout pooler URL when present or the runbook's fixed session-pooler fallback; never trust inherited libpq routing or service configuration. No CLI call is needed for this psql path.
- [ ] **Build a clean subprocess environment.** PGPASSWORD comes only from validated SUPABASE_DB_PASSWORD_SQLITE, never argv/log output. Drop inherited PGHOSTADDR/PGSERVICE/PGOPTIONS and unrelated Supabase credentials; explicitly set read-only mode, timeout and connection bounds. Use `psql -X -w -v ON_ERROR_STOP=1 -Atq ... -f -` with SQL on stdin, matching the existing runner's variable behavior (`ea-access.cjs:129–135`). Prefer installed psql or `/opt/homebrew/opt/libpq/bin/psql`. No shell interpolation or login dependency.
- [ ] **One statement returns one snapshot.** Use one SELECT with `statement_timestamp()` as `snapshotAt`, deterministic aggregation of all receipts plus auth email and public first/last name. Preserve rows with missing profile names using LEFT JOINs. Include schema-1 null provenance honestly and R-O15's dedicated v2 observed/first_observed/delivery columns; no payload wrapper. Do not apply actor/kind/since/review filters in SQL. Process all output or fail on resource/truncation/JSON error; never report partial coverage. A streamed/buffer-limit failure must exit nonzero, not become an empty list.
- [ ] **Add RED/GREEN:** empty receipt set, missing/invalid env, literal shell syntax in dotenv data, IPv4 session-pooler validation, inherited hostile libpq variables, psql failure/timeout, malformed/truncated JSON and large snapshot. No secret in stdout/stderr/error text. Coverage is qualified by snapshot time and unfiltered status, not a forever-current fleet claim. R-O13's commit-delay limit is explicit.
- [ ] **Run GREEN:** focused command plus:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH node --check scripts/read-support-incidents.cjs
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/readSupportIncidents.test.js __tests__/sqliteStagingScript.test.js
  git diff --check
  ```
- [ ] **Files to stage:** `scripts/read-support-incidents.cjs`, `__tests__/readSupportIncidents.test.js`, `package.json` (only the `bugs:incidents` script line).

### Task 18: Group conditions, match registry from Git and report review windows

**Files:** reader and its test; consume C's shared identity fixture. **Current source:** registry fields/schema `docs/bugs/_template.md:43–48`; key/signature precedence and condition vocabulary `docs/bugs/README.md:39–64`; block-list contract `88–100`; coverage status `75–86`. Existing `yaml` dependency is `package.json` devDependencies; no parser installation. Read registry blobs from Git, not the working copy or `_template.md`.

- [ ] **Write the first failing temporary-Git-repository test.** Build an empty registry at an `origin/main` fixture ref, then a different working-tree record with a misleading claim. Reader must use the selected Git ref, accept empty records directory, ignore working-tree claims, and not read narrative mentions as ownership. The fixture may initialize/commit a scratch repository under the OS temp directory; this is explicitly a test fixture, not a builder commit to this worktree.
- [ ] **Run RED:** Task 17's exact focused Jest command. Expected: no registry/grouping implementation or the working-tree fixture incorrectly matches.
- [ ] **Implement grouping by `(reporter_id,kind,repeat_key)`**, not report id, generation or serverRecordId. Report receipt count, first/latest known seen times, distinct observed releases/devices, latest payload, all relevant bundle paths, EA email/name/id. Keep observation provenance distinct from delivery. Use latest by max `(received_at,id)` and nulls for schema-1 new fields (R-O14). Do not sum repeated snapshots of occurrence_count into a lifetime total.
- [ ] **Read `docs/bugs/records/*.md` from `--registry-ref`**, default origin/main, through argument-array Git commands. Validate the ref resolves; an invalid ref is not an empty registry. Parse frontmatter only. Accept YAML block lists and empty `[]`; ignore nonempty inline lists as required by spec tests, with a diagnostic that they were not treated as declarations. Ignore prose, comments, fenced examples, and unrecognized fields. A temporary repo fixture covers keys existing only on another ref and nonmatching working-copy edits.
- [ ] **Implement ownership.** Exact support_incident_keys match first; ea_report also matches exact actor-qualified keys from field_report_ids. Signatures use the table in spec §12.1; ea_report/diagnostics_sent have none. Do not invent signatures for the three Plan 3 kinds, per R-O16; match exact keys only. App-error signatures use errorName/first eight messageDigest characters and consume C's shared identity fixture; do not normalize independently. A contested signature exits 2 and prohibits a coverage claim even if an exact key happens to match one condition. Conflicting exact owners likewise fail explicitly rather than choosing one silently.
- [ ] **Implement report order and handles.** Unrecorded EA reports; other unrecorded; recorded conditions with a receipt received after review-since; breadth by EA; serverRecordId; signature. Use R-O14's exact ten abbreviations. Handles use the first eight hex of Node SHA-256 over the exact `reporter/kind/repeat_key` string. On an eight-hex collision within a sweep, lengthen both handles to 12 hex and test stable fetch/resolve of each. Remaining 12-hex ambiguity must fail explicitly, never guess. Filters actor/kind/since affect display only and label coverage as filtered; full snapshot remains available internally. A valid empty filtered result is not a clean fleet sweep.
- [ ] **Add review-window RED/GREEN.** Filter recorded conditions by receipt received_at, never record file mtime, last_seen_at or bug updated_at. Exercise a receipt with old observation time/new receipt time and overlap duplicates. The skill, not an extra hidden reader adjustment, supplies previous snapshot boundary minus 10 minutes; subtract once. `--review-since` alone is review selection and does not restrict the full unrecorded enumeration. Print snapshot boundary in human and JSON output.
- [ ] **Run GREEN:** Task 17's focused Jest command and `node --check` command. Required fixture cases: empty registry, exact-key precedence, field_report_ids for EA reports, contested signatures exit 2, narrative ignored, inline lists ignored, filters never claim coverage, overlap, stable grouping and handle collisions.
- [ ] **Files to stage:** `scripts/read-support-incidents.cjs`, `__tests__/readSupportIncidents.test.js`.

### Task 19: Fetch private evidence and resolve server record existence

**Files:** reader and tests. **Current source:** service secret convention `scripts/rls-visibility-probe.cjs:38–41`, client factory without session persistence `125–135`; actual table/column list `src/services/syncServerColumns.js:2–98`; deterministic wire ids `offlineSync.js:576–634` at baseline, B's shared serializer afterward; existing ignored path `.gitignore:62–63`; raw evidence rules `docs/bugs/README.md:275–287`.

- [ ] **Write failing command-construction tests**: `--fetch <handle>` selects that condition's latest available bundle/screenshot and prepares only local downloads under `docs/bugs/user-submissions-bundles/<handle>/`; `--resolve <handle>` constructs a SELECT for its payload.table and serverRecordId; fetch chooses R-O16's single bundle-bearing receipt and prints its report_id. Stub psql and Storage; do not test with a real service secret or account.
- [ ] **Run RED:** Task 17's focused Jest command. Expected: options missing or their external operations are not correctly constructed.
- [ ] **Implement fetch** with existing `@supabase/supabase-js` Storage download, the validated SQLite URL and SUPABASE_SECRET_KEY_SQLITE only when fetch is requested. Disable auth persistence/refresh/detectSessionInUrl. Resolve the exact handle and R-O16's max `(received_at,id)` receipt with non-null bundle_path; prefix-check stored object paths against its reporter, and do not trust remote filenames as local paths. Write JSON and original-format screenshot bytes beneath the ignored handle directory, print the selected receipt's `report_id` for its bundle and companion screenshot; report unavailable/missing attachments honestly. Download is a read, never delete/update/list or an upload. Partial fetch failure must remain visible.
- [ ] **Implement resolve as SELECT-only.** Use a fixed identifier allowlist derived from the actual synced tables in syncServerColumns, with explicit per-table sync columns; quote identifiers and bind id as a psql variable via stdin (`:'record_id'`). No arbitrary receipt-derived SQL identifiers or interpolation, no RPC repair, no broad-estate lookup. For successful valid-id lookup print present/absent with sync-relevant row values. Missing table mapping, invalid id, SQL error, timeout or unsupported non-record kind is indeterminate/unsupported, never absent. Include a local/server id mismatch fixture and RPC-shaped payload cases from R-O10.
- [ ] **Add RED/GREEN** for no attachment, lost/denied download, path traversal, another reporter prefix, collision/unknown handle, destination containment, secret omission in ordinary sweep, SQL metacharacters, unknown table, zero/one row and failed query. `present` proves existence only; neither present nor absent is an automatic recovery or convergence verdict.
- [ ] **Run GREEN:**
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/readSupportIncidents.test.js __tests__/sqliteStagingScript.test.js
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH node --check scripts/read-support-incidents.cjs
  git check-ignore docs/bugs/user-submissions-bundles/example/example.json
  git diff --check
  ```
  check-ignore must name the existing pattern; no `.gitignore` change is needed. No live reader sweep is claimed by these tests.
- [ ] **Files to stage:** `scripts/read-support-incidents.cjs`, `__tests__/readSupportIncidents.test.js`. Never stage downloaded originals or a service key.

## Slice E — Skills and Standing Docs (after D)

**Spec:** §3, §12.2–12.3, §13. **Done when:** the new skill is reviewable in scratch, existing bug-user/README changes are small and limited to this workflow, standing docs match integrated source, and the orchestrator has an exact install/stage list. The skills' first real sweeps, Git landing and build log remain orchestrator gates. No registry/template rebuild or copied Zazi people/learned mappings.

### Task 20: Draft bug-sync and make only the small intake/README updates

**Files:** new scratch bug-sync SKILL.md/openai.yaml; scratch patched bug-user; modify docs/bugs/README.md. **Current source:** existing bug-user mode/boundary ` .agents/skills/bug-user/SKILL.md:11–46`, evidence rules `69–106`, frontmatter linkage `146–159`, diagnosis `165–204`, finish report starts `227`; existing skill UI metadata `.agents/skills/bug-user/agents/openai.yaml:1–4`; README intake/ownership/coverage `26–64`, `75–100`, evidence/source map `275–312`.

- [ ] **Write a failing workflow acceptance transcript before editing.** Use D's temporary-registry/stub-psql fixtures to walk an unrecorded upload_terminal, an ea_report, a recorded recurrence and unavailable Sentry. Record expected commands, record fields, evidence claims and finish report. Baseline RED is concrete: no bug-sync artifact; existing bug-user lacks an EA-report sweep; README still prescribes paging and lacks the ten-minute overlap/bundle source. Documentation acceptance is a manual transcript, not a tautological Jest test that checks its own prose.
- [ ] **Run the baseline reader checks** to ensure its published CLI really supports the commands the skill will prescribe:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/readSupportIncidents.test.js
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH node scripts/read-support-incidents.cjs --help
  ```
  Save the manual documentation RED separately from these expected-green interface checks.
- [ ] **Write `/tmp/masi-bug-sync/SKILL.md` and `agents/openai.yaml`**, matching the installed skill format. Modes: SWEEP (default documentation/read-only), INVESTIGATE (read-only deeper evidence), FIX only with explicit fix authorization. Establish repository/remote and origin/main authority, fetch before allocations, preserve worktree boundaries, exact keys by default, valid block-list declarations, contested signatures fail, and the existing MA-BUG severity/state template. Start with an empty Learned mappings table.
- [ ] **Specify the full sweep.** Direct `node scripts/read-support-incidents.cjs --registry-ref origin/main --review-since <previous-boundary-minus-10-minutes> --json`; first sweep omits review-since rather than inventing a prior time. Require successful unfiltered one-statement coverage, print/store its snapshot boundary in README only after the canonical sweep completes, and keep overlap dedupe harmless. Document ten minutes as a bounded late-commit convention, not protection against arbitrarily long transactions (R-O13). Inspect people-waiting EA reports first and route their receipt keys to field_report_ids. Recorded is not reviewed or fixed. Filtered/failed/contested runs never advance Last full sweep.
- [ ] **Specify evidence-led investigation.** `--resolve` for record-bearing leads and `--fetch` where evidence exists before causal diagnosis; for non-record conditions explicitly record resolve as inapplicable. Inspect actual bundle/log/screenshot, correlate exact actor/time/release, read actual source and reproduce the end-user path where safe. Sentry uses connected read-only tools and a valid scoped query; unavailable is not zero. A valid-query miss is bounded negative evidence, not proof of no crash. Existence is not convergence; local/hosted/device/release/field recovery/no-recurrence are separate.
- [ ] **Specify the finish report and authorization boundaries.** Inventory all conditions, unrecorded/reviewed counts with scope/boundary, records allocated/updated, evidence inspected, competing causes/confidence, next checks and open gates. Propose improvements rather than silently changing contracts. Registry work must land on origin/main with authorization; sandbox-blocked Git is reported with reviewable files and no bypass. Do not grant source fixes, Sentry mutation, Auth/data changes, release or live repair from a sweep request.
- [ ] **Make a patched scratch copy of bug-user**, adding exactly the “sweep EA reports” step: `npm run bugs:incidents -- --kind ea_report`, fetch each unrecorded report's bundle/screenshot, inspect it and store its exact condition key in field_report_ids. Use direct node for JSON. Correct obsolete recordRef joins to actual serverRecordId/wirePayload evidence. Keep its existing modes, scoring, artifact handling and canonical-main/authorization contract; no rewrite.
- [ ] **Update only relevant README sections.** Add ea_report to Field reports, private bundle fetch/evidence source with gitignored-original/safe-excerpt rule; one-statement snapshot and previous boundary minus ten-minute bounded convention (unlimited commit delay can escape the review window); correct obsolete paged-reader/recordRef wording. Preserve registry table, field names, scoring and template. Explain J4 diagnostic capture versus safe Git publication; do not redact diagnostic bundle contents.
- [ ] **Run GREEN manual transcript** against D's fixture outputs and actual --help. Verify each skill command maps to an implemented flag, exact keys use correct channel fields, no signature is invented, every source-map path exists and Learned mappings is empty. Review scratch skill YAML/frontmatter with the already installed YAML parser; no new tool/dependency install. Hand over scratch SHA-256 values and a diff against the current bug-user.
- [ ] **Files to stage (after orchestrator installation):** `.agents/skills/bug-sync/SKILL.md`, `.agents/skills/bug-sync/agents/openai.yaml`, `.claude/skills/bug-sync` (symlink), `.agents/skills/bug-user/SKILL.md`, `docs/bugs/README.md`. Builder writes only scratch skills and README; cannot write `.agents/` or create its symlink. Existing bug-user metadata and `_template.md` remain unchanged.

### Task 21: Reconcile domain/routing/contract/roadmap/learning documentation

**Files:** AGENTS, CONTEXT, PRD, contract map, ROADMAP, LEARNING; design-system only if actual new pattern. R-O12 explicitly authorizes PRD. **Current source:** routing `AGENTS.md:13–31`; old counts-only term `CONTEXT.md:315–319`; roadmap lane `documentation/ROADMAP.md:263–306`; contract old hooks/transport `documentation/rls-sync-contract-map.md:1818–1820`, table rows `1878–1879`, scheduling `1902–1908`; learning narrative style `documentation/LEARNING.md:2295–2327`; Profile rules `documentation/design-system.md:404–429`, sheets `488–516`.

- [ ] **Write the failing reconciliation checklist.** Compare those standing claims to the integrated A/B/C/D/F artifacts. Baseline discrepancies are R9 and R-O12, not hypothetical future behavior. For each, record the exact old claim and new implementation/test or gate that must support its replacement. No docs-only unit tests are needed.
- [ ] **Run the baseline relevant checks** and capture actual outputs, not counts from this plan:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand --runTestsByPath __tests__/readSupportIncidents.test.js __tests__/ProfileDiagnostics.test.js __tests__/App.plan5.test.js
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- --runTestsByPath __tests__/fieldDiagnosticsMigration.test.js __tests__/uploadDispositions.test.js __tests__/supportIncidentRepository.test.js __tests__/supportIncidentObserver.test.js __tests__/diagnosticBundle.test.js __tests__/supportIncidentDrain.test.js __tests__/debugExport.test.js
  ```
  Existing prose remaining incompatible is the documentation RED. Failed code checks stay failures; do not “document them green.”
- [ ] **Update vocabulary and routing.** Replace the counts-only Support incident term with spec §3's incident/condition/receipt/bundle/EA-report/bug-record/upload-disposition terms. Route automatic phone receipts to bug-sync and human/ea_report intake to bug-user, using their installed canonical paths. Preserve domain distinctions and signed-in-EA rules. AGENTS must not imply the builder has installed scratch artifacts already.
- [ ] **Update PRD and operator access.** Replace the cloud-telemetry restriction (`PRD.md:41–42`) with the J4 field-month exception for this lane; keep unrelated Sentry rules distinct. Explicitly document authorized operator psql reads and service-role-only receipt/Storage API reads as separate access paths.
- [ ] **Update the contract map in one coherent account:** SQLite v20 two columns/checks/backfill; all seven failure-status writers; ten kinds and exact keys; separate observer transactions/D4; optional history failure fields; complete observed provenance versus delivery; schema-1/v1 compatibility; schema-2 outcome-before-freeze snapshot/generation CAS, observer promotion, once/daily cadence, §6.4 fairness/priority and capturing readiness/stale recovery; v1 body/constraint swap, unlimited v1, v2-only machine 150/human 50 per rolling day; bucket/object policies and path ownership; bounded capture/options/logger tail/minimal fallback, queue bundle columns, consumed start-time allowance, upload retry/409/five-attempt fallback/per-EA five-bundle cap; statuses and incident-only scheduling. Replace, do not leave adjacent contradictory paragraphs. Clearly label applied-to-hosted claims from the orchestrator's evidence, not migration files.
- [ ] **Reconcile the roadmap lane** to J4/immutable receipts/raw ids and actual integrated scope. Mark only implemented/verified items complete with appropriate gates; replace outdated update-in-place, hashes, 8 KB field allowlists and deviceName exclusion. Preserve unrelated outstanding work. Keep the registry already-built status distinct from the new reader/skill/device work.
- [ ] **Add a LEARNING narrative** explaining why immutable receipts solve retry/restore/reordering, why incidents observe committed state, how a post-freeze dirty bit avoids losing a second event, why bundling after commit avoids changing upload outcomes, and why one SQL snapshot differs from paging. Use the concrete MV001/capture/ack race and separate proof tiers. No new ADR/state machine or generalized observability framework.
- [ ] **Update design-system only for an actual pattern addition**, describing new support rows/sheets, multiline limits, outcome feedback and guarded attachment using real exports. Existing tokens/primitives already cover most of this; if no new reusable pattern is added, record no change. Verify required R-O12 PRD and psql-access edits landed.
- [ ] **Run GREEN reconciliation.** Repeat the focused commands if code changed since their previous results; otherwise use their current integrated evidence. Verify internal links, exact source/test names and `git diff --check`. Search active incident paragraphs for contradictory privacy caps/paging/update semantics, distinguishing retained v1 behavior and historical documents. Do not edit archived plan/spec bodies or update the design spec as a stealth ruling.
- [ ] **Files to stage:** `AGENTS.md`, `CONTEXT.md`, `PRD.md`, `documentation/rls-sync-contract-map.md`, `documentation/ROADMAP.md`, `documentation/LEARNING.md`; `documentation/design-system.md` only if a documented new Profile pattern landed. **Never** `documentation/build-log.md` from this builder.

## Review Focus — integrated adversarial review

1. **Populated migration and deployed clients:** old v1 receipt replay still false after report-id backfill/constraint swap, original behavior/grants remain pinned, new schema-1 phone rows keep the old delivery contract, and v1 stays unlimited while v2 enforces independent machine/human allowances. Original migrations are unchanged.
2. **Failure-path completeness:** four engine finalizers, foreign quarantine and both repository mark methods write class/code in the status UPDATE. Parent/auth/terminal precedence reflects the action actually taken. Unknown-table and stale-finalizer paths cannot overwrite a newer mutation. No incident-write failure replays MV001 over newer server data.
3. **Cadence and scheduling:** report id is stable on retry/restore; second event after freeze remains dirty after ack and promotes after 24 h without a third event; release change promotes immediately; observed rows are prunable per §6.4 even if dirty, event sent/dirty rows are protected, Plan 3 once never promotes; observer promotion precedes ready count. No hidden extra scheduler or timer.
4. **Observer truth:** transport-only success and cold launch before contact cannot make backlog; recent 4xx response can establish contact; 5xx cannot; empty outbox can still produce pull_failing. Reconnect runs the observer even when stale counters say no work. Observer failure cannot alter domain/outbox state.
5. **Evidence fidelity and limits:** synchronous full runtime at observation, first provenance retained, send-time identity/network/disk distinct; wire payload/error/text retained within explicit bundle budgets, with honest truncation markers. Truncation order/markers and exact byte representation are tested; TOO_LARGE is local and honest. No privacy scrub returns through an old test or doc.
6. **Bundles across crashes/actors:** capture after commit, start-stamped per-EA allowance consumed on failure, bounded reads/tail/yields/minimal fallback, capturing readiness gate and ten-minute recovery, actual five-failure counter distinct from receipt attempts, 409 success, durable progress before deleting files, stable paths, cap eviction flags and screenshot pairing. No stale continuation uploads or writes as the next EA. R-O3–R-O6 queue columns/paths/flags are durable; freeze follows final outcome. N1 immediate sign-out failure timing remains open.
7. **Server boundaries:** v2 structural validation/cast errors, immutable storage representation, own-folder path checks, concurrency-safe separate machine/human v2 limits and unlimited v1, default privilege revokes, no authenticated receipt/bundle read/list/update/delete, and no broad Storage policy accidentally authorizing the bucket. Ordinary payload contents are unrestricted within size.
8. **Reader coverage and attribution:** one SQL snapshot joins both identity sources; an absent registry is valid but an invalid ref is not; exact keys/EA-report keys precede signatures; contested ownership aborts coverage; inline lists/prose do not record an item. Handles/collisions and legacy kinds are deterministic. Late-commit overlap is qualified, not unlimited proof.
9. **Fetch/resolve:** only the correct reporter's files under ignored local paths, no secrets or downloaded originals staged; table identifiers fixed, ids bound, failed/unsupported lookups indeterminate. Backend existence is distinct from visible UI, correct relationships and convergence.
10. **Profile end-user flow:** real bottom sheets; keyboard and footer accessible; screenshot native absence is safe under OTA; no invented picker resize option; same-tick Send is guarded; stale/dismissed completions cannot alter a new form or another EA's toast. “Sent” is based on that receipt, never generic sync success.
11. **Standing docs and operator handoff:** README/template/bug-user are extended minimally; source map and empty learned mappings are Masi-specific; scratch skill install is orchestrator-owned. N1/N2 and hosted/native/device/first-sweep gates remain visible; PRD field-month J4 and authorized psql access are explicit. No builder has committed, installed packages, applied hosted migrations or written the build log.

## Gates — orchestrator owns completion and evidence

These are integration/release gates, **not additional builder implementation tasks**. Passing one does not imply any later gate passed.

### G0 — Ruling conformance and local integration

- Verify R-O1–R-O17 against task output, shared A/C/D envelope/storage fixtures and the single C/D identity fixture. Resolve N1's immediate sign-out failure timing and N2's once-cadence pruning conflict explicitly; preserve actor fencing and the binding fairness/cadence requirements meanwhile. No former O-item remains open.
- Integrate worktrees in dependency order; check only assigned file diffs and the staged scope. Reconcile D's package script with the orchestrator's picker changes; C follows B's migration/serializer; E follows integrated source. Install scratch bug-sync and patched bug-user at their canonical paths; create `.claude/skills/bug-sync` as the expected symlink, inspect/read back it and validate UI metadata.
- Run with the provisioned Node 20 runtime:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:types
  git diff --check
  ```
  Record actual suite/test counts, RED assertions, any preexisting failures and unexecuted tests. Do not claim device/hosted behavior from Jest. Tests already proven green need repeating only after integration changes or a justified concern.

### G1 — Disposable PostgreSQL harness

- Start/use a disposable PostgreSQL 17 instance and run:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH PGTZ=UTC HISTORY_RLS_ADMIN_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres HISTORY_RLS_DATABASE_NAME=masi_history_rls_fielddiag HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE npm run -s verify:support-incident:postgres
  ```
- Require every §8.4 case, including **populated pre-migration** replay, two generations, restored replay, full structural/path/install/interval/byte validation, separate v2 machine/human quotas, unlimited v1, duplicates/concurrency and grants. Record Storage checks as modeled behavior only if the harness faithfully supports them; otherwise explicitly require G2's policy proof. A failure before SQL execution is an infrastructure block, not a pass or a RED behavior result.

### G2 — Hosted apply and read-only verification (J2)

- First inspect live `masi-app-sqlite` schema/migration ledger, both function definitions/ACLs, default privileges and current Storage policies using the validated target. Local migration files are intent, not hosted truth. Never contact the legacy project.
- After G1 passes, use the isolated helper for both migrations, with a reviewed dry-run migration list:
  ```sh
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run sqlite:staging:check
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run sqlite:staging:dry-run
  PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run sqlite:staging:push
  ```
  Inspect printed project_ref `segygjzpujphwvrubusm` and reject any unrelated pending migration. J2 already authorizes this orchestrator gate; do not turn it into a builder apply step or raw root CLI command.
- Then **read-only** verify column types/defaults/nullability/checks, old constraint removal/new unique key, both indexes, no unexpected changed original rows, v1/v2 signature/body/search_path/security-definer/EXECUTE ACLs, receipt table SELECT-only service-role grants and no EA read/write grants. Record v1 function-definition md5 and the applied migration ids.
- Read-only verify private bucket id/name, 15 MB limit, JSON/JPEG/PNG/HEIC/HEIF MIME list, object-policy predicates, roles, commands, RLS and all applicable permissive/restrictive policy composition. Prove own-folder INSERT only and no authenticated SELECT/list/UPDATE/DELETE; service role reading remains. If disposable Storage behavior was not modeled, inspect effective role privileges and policy evaluation with read-only role-scoped SELECT/EXPLAIN checks. If read-only inspection cannot establish a policy behavior, leave that behavior gate open for an explicitly authorized Storage probe; do not claim a catalog string match proved an attempted write was refused.
- Run the spec's **separate pilot-shaped authenticated v1 RPC smoke** with a disposable test EA/request and verify boolean/replay behavior. This creates a receipt and is therefore not described as part of the read-only verification. Keep real/test evidence attribution explicit. Do not wipe receipts/bundles or mutate user data for cleanup without separate authority.

### G3 — Native dependency/build and OTA compatibility

- Before F's picker integration, orchestrator runs `npx expo install expo-image-picker` using npm, verifies the exact resolved SDK 54 version is older than 24 h (record publication/check times), reviews lockfile changes, and adds/reviews any plugin entry at `app.config.js:62–73`. The plugin scope is gallery screenshot capture; no accidental unrelated native permission changes.
- Verify R-O1 options and original type/extension survive local copy/upload, all five MIME types and 15 MB per-file bucket limit. No resize dependency. Confirm `requireOptionalNativeModule('ExponentImagePicker')` precedes picker require in the installed patch; catch-only require is insufficient. SDK matching does not establish publication age.
- Produce the next native build with the picker included. Separately load the OTA JS on an older pilot binary without the native picker: Report/Send diagnostics still work; attach is hidden without a crash. Verify actual native module behavior, not just Jest mocks. Record app version, native build, runtime, update id/channel and backend.

### G4 — Galaxy A03s device gates, default text size

- Use the next native build, **default system text size**, actual SQLite staging test EA. Inspect the Profile support rows and both sheets pixel by pixel: typography, wrapping, divider alignment, touch targets, keyboard lift, scroll/body/footer, Android Back/backdrop, loading state and root toast placement. No 130% text device gate; retain existing code/test scaling behavior.
- Report a problem online and offline, each with and without a screenshot; include a large portrait PNG and supported HEIC/HEIF input to verify returned type/original extension and 15 MB per-file behavior without forced conversion. Send diagnostics online/offline; force-quit/reopen before delivery. Check exact confirmation copy against actual queue/receipt state, plus duplicate taps and cancel/reopen.
- Force a terminal upload on disposable test work; verify disposition, observed condition, automatic capture allowance and no incident failure changing the domain result. Exercise empty-outbox pull failure and backlog-after-contact where practical with causally equivalent fixtures.
- For each case use `npm run bugs:incidents` to find the exact reporter/condition/observed release, then `--fetch` its bundle/screenshot and inspect the captured support export/log tail. Verify upload-before-receipt paths and local-file cleanup. An upload-only pass does not prove complete history hydration.
- Switch EAs during a pending capture/upload and confirm no cross-EA drain, local attachment or reporter-folder write. Test online with unavailable server/Storage separately from offline. iPhone smoke when available remains explicit if not run.

### G5 — First /bug-sync and /bug-user sweeps and final handoff

- Use the installed skills against real staging receipts, with current reader source and canonical registry ref. Full /bug-sync uses one unfiltered snapshot and previous boundary minus ten minutes (first sweep has no invented boundary). /bug-user sweeps EA reports and fetches each unrecorded report's real bundle/screenshot.
- Each workflow records one real `MA-BUG` lead/causal record with honest confidence, exact channel key, safe committed evidence and explicit diagnosis/delivery/verification states. Do not invent a product defect from a synthetic test just to satisfy the gate; label test-origin leads and require an actual report where the contract requires one. Include recorded conditions with new receipts in the review window.
- Fetch/inspect before diagnosis; resolve record-bearing leads before claiming backend presence/absence; correlate valid Sentry evidence where available. Verify no contested ownership or unrecorded-condition omission, and update channel coverage only to the exact successful snapshot boundary.
- Orchestrator reviews/lands registry and implementation changes with existing authorization, records commits/refs and open native/iPhone/field gates, and writes the sole `documentation/build-log.md` entry: decisions, v1 body md5, migration/harness/local suite results, hosted read-back, device evidence and first-sweep boundaries. Pilot retention remains no-purge. Field recovery and no-recurrence remain separate evidence gates, never inferred from these implementation results.

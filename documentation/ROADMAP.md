# Product and Engineering Roadmap

**Standing document. Updated 2026-10-14 with Jim's organisation, letter-mastery, and legacy
clock-in decisions. Includes the Zazi September–October sync review
([`zazi-sync-lessons-for-masi-2026-10-08.md`](./zazi-sync-lessons-for-masi-2026-10-08.md)) and the
CAP-004 session-history build. This is the single in-repository answer to "what is still outstanding?"**

This file contains open work only. Its priority section is the roadmap; the numbered sections are
the detailed work register behind that roadmap. Completed implementation and verification belong in
[`build-log.md`](./build-log.md); physical checks belong in
[`device-gates-sqlite-backend-2026-07.md`](./device-gates-sqlite-backend-2026-07.md);
unsettled product choices belong in
[`open-decisions-backlog.md`](./open-decisions-backlog.md). Dated plans and reviews are evidence,
not status.

## Pre-live hardening window

Jim confirmed on 2026-08-27 that no staff are currently using the Masi app, while staff want to go
live soon. On 2026-10-28 Jim confirmed there is still no field cohort, and set the next step:
Masi's EAs retest the SQLite app from November 2026, starting from the 1.5.0 pilot builds. Use
this window for root-cause schema, identity, authorization, sync, and operational
changes that would become much more expensive after trusted work accumulates on phones. "No active
users" does not prove that no old binaries, test records, credentials, or legacy-backend automation
exist; the first gate is an exact estate and live-contract inventory.

The governing portfolio strategy and reusable safety contract are
[`masi-zazi-portfolio-audit-2026-08-27.md`](./masi-zazi-portfolio-audit-2026-08-27.md) and
[`field-app-portfolio-invariants.md`](./field-app-portfolio-invariants.md).

## Roadmap view

| Horizon | Outcome |
|---|---|
| **Now** | Finish exact pre-live ground truth, align history authorization with ADR-0005, build bounded bidirectional session then assessment history, and add minimum incident/release provenance. |
| **Next** | Close reachable correctness risks, finish reconnect/fleet admission controls, and settle Programme/group authority and identity before group-centred delivery. |
| **Later** | Build the group workflow and durable drafts, resume WelaPLUS on the current architecture, prepare the Head Office control plane, and validate national-scale operations. |
| **Ongoing** | Product polish, assessment content, dependency hygiene, teaching documentation, and evidence in the build log. |

These horizons summarize the ordered register below. They are not a second backlog.

## Priority order

1. **P0: establish pre-live ground truth and the next release baseline.** Inventory installed/build
   expectations, both Supabase projects, current configuration and automation; probe the live
   SQLite-backend schema/RLS/query cost; settle history retention and row-limit assumptions.
2. **P0: finish history authorization before hydrating it.** Hosted session predicates and the
   actor-derived keyset RPC passed the six-actor PostgreSQL/PostgREST gate on 2026-09-04. The
   complete session aggregate is ratified. Assessment-history semantics were settled on 2026-09-21
   (any class the child was in this academic year); the predicate is still to be implemented.
3. **P0: make session and assessment history bidirectional.** Start with sessions/attendees, then
   assessments/items. A fresh install currently uploads
   new work but cannot hydrate existing `sessions`/`session_attendees` or
   `assessments`/`assessment_items`. Bounded keyset pagination and request deadlines are part of the
   first implementation, not a later optimization.
4. **P0: add minimum incident and release provenance before expanding the pilot.** Durable,
   idempotent receipts need stable condition identity, a reader, an action and exact
   observed backend/app/runtime provenance. J4 authorizes broad field-month diagnostic
   capture with service-role API reading and safe Git excerpts; integration/release gates
   remain in the incident lane below.
5. **P0: settle the upload contract and local-database ownership before the candidate build.**
   U1's bounded requests and send-order protection shipped in #77 (2026-10-19), applied to
   `masi-app-sqlite`, with D2/D3 passed on the Galaxy A03s (§2). Assessment-family upload is built and locally
   verified in Assessment Results Plan 1 (§1); hosted apply/build/device gates remain Task 14.
   D1 and the mastery re-key are built in Assessment Results Plan 2 and applied to `masi-app-sqlite`
   (2026-10-22); its A03s gates passed except the two-phone G1/G1r/G2, which wait for the iPhone, and
   the mastery pull is built in Plan 3. Multi-writer stale-edit rejection (U3) is deferred until Head Office
   edits EA records. Duplicate-proof submit and one database per EA are built (Plan 2; its
   sign-out UX is Plan 3).
   The newer-schema guard and minimum revocation tooling are built, and the revocation migration is
   applied to `masi-app-sqlite` and device-proven on Android build 14 (2026-10-18, §0). Evidence:
   [`zazi-sync-lessons-for-masi-2026-10-08.md`](./zazi-sync-lessons-for-masi-2026-10-08.md) Part 2.
6. **P0: settle field-continuity contracts before the candidate build.** Make location fallback
   truthful, apply and verify the built server-side ten-hour clock-out, verify Android backup
   exclusion on device (both decided by Jim on 2026-10-17), and complete the credential/PII and provisioning preflight.
   Unfinished-form loss is accepted for the pilot (Jim, 2026-10-17).
7. **P1: close reachable correctness gaps.** Fix session-attendee removal before saved-session
   editing ships and resolve the remaining auth-diagnostic ambiguity. The newer-schema fail-safe
   moved to item 5.
8. **P1: finish sync efficiency and fleet controls.** Membership-specific batching, delta pulls,
   randomized retry/reconnect scheduling, remote controls, and proven query-specific indexes.
9. **P2: settle Programme/group authority, then build group-centred sessions in contract order.**
   Access grants and identity,
   then RLS/sync, then UI and durable session drafts.
10. **P3: prove WelaPLUS on devices and produce its printout pack.** The Release 1 Battery Run
   host, Full EGRA, step-by-step marking and the shared reading content with skip rules (PR #108)
   are merged (§8), and the A03 pass is done. The iPhone pass, the EA usability check and print
   production remain.
   Artifact/photo capture is separate deferred work on the integrated Question/result foundation.
11. **P4: polish, hygiene, and longer-horizon scale work.**

The deferred Head Office importer is not in the active execution order. It begins with read-only
discovery of the existing Airtable/Postgres source model with Jim, not with an invented CSV or JSON
shape.

## 0. Pre-live ground truth, observability, and pilot activation

### Exact estate and contract inventory

- [x] Inventory current Masi branches, EAS build artifacts, runtime/channel/update identity, and
  source release profiles. App Store Connect, Play delivery, and installed devices remain open.
- [ ] Verify which Supabase project every current app profile, local environment, script, and
  connected backend targets. The forward SQLite project is verified. The legacy counts-only probe
  ran on 2026-09-23 (build log): session capture stopped by 26 Aug, but **legacy clock-ins
  continue** (4 since 22 Sep). Identifying those legacy clock-in users and deciding their cutover
  and field communication before the 1.4.0 pilot: **no action needed (Jim, 2026-10-14)**.
- [x] Probe the live SQLite-backend schema, migration ledger, RLS, functions, indexes, row counts,
  and unclassified forward data before schema-facing design. The data appears to be test/pilot
  data. Disposition decided 2026-09-23: wipe it after the assessment-history slice passes (below).
- [x] Applied and re-measured the session predicates/RPC against hosted PostgreSQL and PostgREST on
  2026-09-04. The six-actor matrix, RPC grants, anonymous denial, current-data plans, and canonical
  no-op rerun passed. A 1,205-row disposable HTTP fixture proved the PostgREST cap is 1,000 and was
  removed with zero residue. The earlier 2,000-row hostile plan remains disposable-local evidence,
  not a hosted scale benchmark.
- [x] **Decision locked:** history event families (`sessions`/attendees and
  `assessments`/items) are retained truth and are never absence-deleted from an incomplete or
  ordinary empty page. Implementation proof remains open in §1. Active assignment/membership
  relationships retain their separate complete-snapshot reconcile contract.
- [ ] Wipe the forward-backend practice data (5 accounts, 25 sessions, 31 assessments at the
  2026-08-27 count) after the assessment-history slice passes. **Decided by Jim 2026-09-23;** the
  wipe itself still needs his explicit yes at the time.
- [ ] Choose the immutable app/runtime/build/backend/protocol identity for the next internal pilot.
  The app version is decided: **1.4.0** marks the switch to the SQLite backend (Jim, 2026-09-23);
  runtime, build, and protocol identity remain open.
- [ ] Scan current files plus full Git history, issues, fixtures, screenshots, logs, and release
  artifacts for credentials, private service URLs, tokens, staff PII, and child data without
  printing discovered values. Disable or rotate every exposed credential; do not assume editing the
  current file removes a historical leak.
- [ ] Verify required schools, Programmes, and other first-login reference values before creating
  the field roster. Provision unique temporary credentials privately and prove each account through
  real password sign-in plus the same authenticated RLS reads the app requires.
- [ ] Mark every test, demo, and fixture account with `app_metadata.is_test_account = true` at
  creation (`scripts/createTesters.js` sets nothing today), and exclude marked accounts from every
  report and staff view. Zazi's unmarked demo pair appeared as real EAs on a live staff page
  ([Z15](./zazi-sync-lessons-for-masi-2026-10-08.md)).
- [x] **Organisation decision closed (Jim, 2026-10-14):** a partner organisation is plausible
  within a year. Adopt the required, no-default `users.organization_id` label, as in Zazi's
  organisation label v1. It does not change authorization or phone behaviour. Migration and
  provisioning are committed and locally verified; see the [build log](./build-log.md#organisation-label-v1--18-postgresql-checks)
  and [Z19 status note](./zazi-sync-lessons-for-masi-2026-10-08.md).
- [x] Applied `20261014120000_organisation_label_v1.sql` to hosted `masi-app-sqlite` on 2026-10-14
  with Jim's explicit yes; verified read-only (see the build log). Partners are added by migration.
- [ ] Reporting surfaces should default to Masinyusane. Add an organisation filter when the
  first partner exists.
- [ ] **Build one local database per EA (D2, decided by Jim 2026-10-08), before the first field install.**
  **Plan 2 built it** (`feat/signed-in-ea-handle`, 2026-10-17; ADR 0008; contract map "Signed-in EA
  handle"): each EA's data lives in `masi-<userId>.db`, reached only through the signed-in EA
  handle; sign-out revokes at once and disposes connections afterwards; every server request is
  fenced at send time on a per-handle data client and queue; the outbox owner is stamped from the
  signed-in EA (a local trigger refuses an ownerless row); an integrity scan quarantines foreign-owned
  rows and adopts legacy ownerless ones; shared auth-session persistence is fenced by admitted
  identity. The null-owner claim this item warned about is closed. Plan 3's sign-out questions,
  left-behind reporting, minimal incident envelope and legacy `masi.db` discovery are built.
  The Profile App Release information was already delivered at the bottom of Profile: version,
  build, backend, project, device and update id. The incident migration is on `masi-app-sqlite`
  (2026-10-17, grants verified against S2), and D1 passed on the Galaxy A03s with Android build 8.
  **Still open before the field:**
  - **Sign-out copy:** a wording pass with Jim; the current sheet copy is provisional.
  - **Ruling 11: implementation closed for the 11 tables in the upload contract.** Send-time
    versions prevent an uncertain earlier send from overwriting a later one; applied and D2-proved
    on device 2026-10-19. The `letter_mastery` re-key and receipt-backed D1 are built in Assessment
    Results Plan 2; hosted application and device proof remain Task 7 (§1/§2). Mastery pull remains Plan 3.
  - **Device gates:** D2–D7 on the build intended to ship
    ([actor lifecycle spec §9](../docs/superpowers/specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md);
    D7 is native close under load, iOS and Android). D3's ten-hour half is now the server-close
    check under [Upload contract](#upload-contract-before-pilot-priority-item-5), replacing the
    earlier phone-only expectation. iOS D1, native discovery on both platforms and both sheets passed
    on builds 9 and 10 (2026-10-17, build log). The Android header fix ("BackMy Profile") is built; verify it on the next build.
    A new EAS build needs Jim's yes.
  - **Legacy export gap:** spec §4.5 says Profile → Export Database can export `masi.db`.
    Today's export covers only the signed-in EA's file. Plan 3 did not change export; Step 4's
    support tooling must close this gap.
  - **Deleting another EA's file is deferred past the pilot** (Jim, 2026-10-09): no unsent work and
    unused for 30 days. Revisit before Step 9 Widen, for privacy (EA A's roster stays on EA B's
    personal phone), against POPIA. Design:
    `docs/superpowers/specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md`.
- [x] **Minimum revocation contract before pilot provisioning — built, applied to hosted, and
  device-proven 2026-10-18** (moved from §6 by the 2026-10-08 Codex review). **Decided by Jim 2026-10-17:
  copy Zazi's suspension, operated by a script first** (Head Office website later, §6). The canonical
  `20261018120000_ea_access_suspension.sql` migration builds `private.ea_access_events` and
  `suspend_ea`, `restore_ea`, and `ea_access_status`. `scripts/ea-access.cjs` exposes `ea:status`,
  `ea:suspend`, and `ea:restore`; changes default to a dry run and require `--apply`, an exact
  case-insensitive email match, a reason, and an operator. The connection is pinned to
  `masi-app-sqlite`; the script runs as postgres and only service_role may execute the functions
  through an API role. See the [operator runbook](./ea-access-runbook.md).

  Suspension locks the Auth and profile rows, sets `banned_until = now() + interval '876000 hours'`,
  changes an active profile to inactive, and writes the audit event in one transaction. Read-back
  confirms the ban is more than 24 hours away and the profile is inactive. Restore requires the
  latest audit event to be a suspend. It lifts the ban and reactivates only when the **first suspend
  since the most recent restore** recorded an active profile; repeated suspends preserve this
  baseline while recording each call's actual before/after state (Jim's clarification).

  `users.is_active = false` still does not enforce access: owner policies, `can_read_session`, the
  history RPC, and `AuthContext` do not check it. The Auth ban blocks sign-in and token refresh;
  already-issued access tokens remain valid until expiry. Jim accepts the one-hour residual window
  used by Zazi; the hosted JWT lifetime was measured at 3600 s on 2026-10-18. Assignments and worked hours stay
  intact, and unsent work stays on the phone for upload after restoration and sign-in. This follows
  Zazi's `api/mobile/account_access.py` at `21cb880` and suspension-v1 card, with both server writes
  and the audit now atomic rather than separate external calls.

  **Done:** the disposable PostgreSQL harness passes 43/43 and runs in CI; the hosted schema was
  inspected; with Jim's explicit yes the migration was applied to `masi-app-sqlite` on 2026-10-18
  and read back (see the build log). On Android build 14 (2026-10-18) a suspended, signed-in phone
  signed out at its first refresh after real token expiry, could not sign in while banned ("User is
  banned"), kept an offline clock-in, and uploaded it after restore and sign-in. The national admin portal stays
  in §6 ([Z16](./zazi-sync-lessons-for-masi-2026-10-08.md)).

### Release and observability

- [x] Build iOS and Android preview binaries for app/runtime 1.3.0. Those July artifacts are
  historical evidence; source has moved and the post-hardening pilot will require a new build.
- [x] **1.4.0 pilot builds (2026-10-28):** iOS 25 and Android 54 (`pilot` profile) from main
  `dffe22c`, after the lesson flow, letter orders and the version bump merged. iOS 25 was
  submitted to App Store Connect the same day.
- [x] **Automatic Android submission (2026-10-28).** Every `pilot` build goes to Play internal
  testing with `--auto-submit`, signed in as `eas-submit-masi`. Build 54 was the first, submitted
  by EAS with no manual AAB upload ([DEPLOYMENT.md](../DEPLOYMENT.md)).
- [ ] **November 2026 EA retest (Jim):** add the EAs' Google accounts to Play internal testing (up
  to 100) and iOS testers to TestFlight. From the first EA session, `masi-app-sqlite` holds field
  data, so nothing on it is wiped without Jim.
- [ ] Confirm the EAS build logs contain successful Sentry source-map uploads.
- [ ] Pass device gates N1, N2, N4, N6, and N7 for symbolication, structured sync reporting, local
  evidence, and telemetry privacy.
- [ ] Connect and test the agreed Sentry alert rules.
- [ ] Add Sentry fingerprint overrides for known native SQLite/Expo rejections (single-exception
  events with a recognized pattern only; never put native error text into the fingerprint), so
  unrelated rejections do not merge into one issue (Zazi `dff00db8`, `6339c958`).
- [ ] One-command OTA publish wrapper that binds channel to build profile and reads back the
  published manifest. Native version bumps come before any OTA that needs them. A raw `eas update`
  published Zazi's wrong-lane bundle ([F3](./zazi-sync-lessons-for-masi-2026-10-08.md)).
- [ ] Make sure server rows carry the evidence a future User Health view needs (actor, app build,
  and last-sync time), so "who is active / who needs help" can be derived rather than reconstructed
  from spreadsheets ([F5](./zazi-sync-lessons-for-masi-2026-10-08.md)).
- [ ] Confirm every field device starts from a fresh installation, not an upgrade over the retired
  local data model.
- [ ] **Android backup: decided by Jim 2026-10-17, built (allowBackup false and extraction
  exclusions); restore test open.** Cloud backup AND device transfer are excluded by config:
  `android.allowBackup: false` plus the local Expo plugin's `data_extraction_rules.xml`, which
  excludes all nine valid domains from both `cloud-backup` and `device-transfer`, including
  device-protected storage. This covers per-EA SQLite files, the legacy `masi.db`, WAL/SHM sidecars,
  AsyncStorage auth sessions, files and shared preferences; the server is the recovery path
  instead of a restored outbox (Zazi ZZ-BUG-20260907-001). Prebuild introspection confirms
  `android:allowBackup="false"` and `android:dataExtractionRules="@xml/data_extraction_rules"`.
  Legacy `fullBackupContent` is redundant because `allowBackup=false` already disables backup on
  Android 11 and lower. On build 12 (2026-10-18) `adb shell bmgr` with `LocalTransport` refused
  Masi's backup while allowing a control app's. Still open: uninstall/reinstall and Google restore
  on the A03s, plus a device-transfer check if
  a second Android phone is available. A reinstall may not be called “fresh” until the resulting
  database identity, contents and signed-out auth state prove it.
- [ ] Prove `masi-app-sqlite` is healthy after its restore onto the Pro plan. Jim moved the project
  to Pro on 2026-09-23 so it cannot auto-pause (it was found paused on 2026-09-04 and again on
  2026-09-23). The dashboard shows Nano compute; confirm the intended compute size. Zazi's local
  herd measurement (2026-09-24) had older-style full pulls failing on 2 cores somewhere between
  1,000 and 3,000 EAs and clearing 1,000 EAs on 4 cores; size from Masi's own pull shape, not by
  inheritance ([Z9](./zazi-sync-lessons-for-masi-2026-10-08.md)). The
  post-restore read-only probe matched the 2026-09-04 baseline on 2026-09-23 (build log). While restoring on 2026-09-04 it
  accepted connections with an empty `public` schema for roughly four minutes, so pilot
  automation, migration scripts, and support tooling must treat an empty or missing migration
  ledger as "restoring", never as a clean slate.

Sentry native/JavaScript capture, privacy hardening, runtime diagnostics, structured sync events,
safe verification, EAS environment values, and the sensitive upload token are built. The remaining
work is external release and device proof.

### Minimum incident and provenance lane

The active contract is the
[Field diagnostics Revision 4.1 spec](../docs/superpowers/specs/2026-10-29-incident-lane-and-bug-registry-design.md)
with the [binding plan rulings](../docs/superpowers/plans/2026-10-29-field-diagnostics-plan.md).
All six slices A–F are merged on `feat/bug-machinery`, including the phone
observer, immutable generations, bundles and Profile support sheets. Local
unit/integration verification covers the merged implementation. The controller's
prior disposable PostgreSQL run passed all ten harnesses, including 225
support-incident cases with the shared Storage bootstrap. That Storage proof is
a local policy model, not hosted Storage HTTP behavior. Checked items below do
not establish hosted apply, native/device or field proof.

- [x] Existing `MA-BUG` registry, template and human-intake skill are built under
  `docs/bugs/`. Keep one causal record across channels; do not rebuild the schema.
- [x] SQLite v20 adds structured `error_class`/`error_code` in all seven failure
  status writers and backfills existing terminal/failed rows without replay.
  Classes: retryable, needs_parent, needs_reauth, terminal. Support export includes
  dispositions, every queue row, actual wire payload and raw server record id.
- [x] V20 queue schema preserves schema-1 row delivery while providing schema-2
  generations, snapshot/dirty state and durable bundle columns in the same queue.
- [x] Server migration artifacts extend the existing receipt table to ten kinds
  and immutable `(reporter_id,report_id)` identity. V1 insert body/constraint swap
  preserves boolean replay and unlimited v1; v2 alone has structural/size checks
  and independent rolling-day machine 150 / human 50 allowances. No update-in-place
  receipt, payload hash, field-value allowlist or 8 KB v2 privacy cap.
- [x] Private `support-bundles` migration artifact declares own-folder INSERT,
  service-role reading, 15 MB per-file and JSON/JPEG/PNG/HEIC/HEIF types, with
  restrictive guards against broad pre-existing object policies. Hosted effective
  policy proof remains open.
- [x] Operator reader `scripts/read-support-incidents.cjs` enumerates one complete
  psql snapshot, groups exact conditions and matches committed registry ownership.
  Fetch pairs private evidence; resolve distinguishes existence from convergence.
  Filtered/failed/contested runs never advance coverage. Recorded recurrences use
  previous snapshot minus ten minutes, a bounded overlap convention.
- [x] Slice E drafts `/bug-sync` and the narrow `/bug-user` EA-report patch in
  `/tmp/masi-bug-sync/` and `/tmp/masi-bug-user/`, and reconciles standing docs.
  Canonical `.agents/skills/bug-sync` and `bug-user` artifacts and the
  `.claude/skills/bug-sync` symlink are present; final installed-artifact review
  remains open. The learned mappings table starts empty.
- [x] D4 observer implemented and locally tested: terminal owned work, stale
  backlog only after real contact, reconcile breakers and ≥24 h history failures,
  even with an empty domain outbox. Ordinary retries/offline passes/CAS misses/stale actors/
  dependency stops do not produce diagnostic incidents. Foreign-owner incidents
  derive from committed quarantine; the transactional incident hook is removed.
  Persisting conditions re-record only on payload/release change or when
  `last_seen_at` is ≥15 minutes old; unchanged refreshes acquire no writer unless
  promotion or stale-capture recovery is due.
- [x] Immutable generations implemented and locally tested: synchronous
  first/current full observed runtime versus delivery; outcome-before-freeze,
  generation CAS ack preserving post-freeze dirty events, observer-before-ready promotion, once/daily cadence,
  200-row fairness and human-first drain. Complete runtime includes device name.
- [x] Bounded after-commit bundles implemented and locally tested: capture gate,
  consumed start-time automatic allowance, per-EA retention of five ready,
  unfrozen bundles (capturing/frozen rows are outside that eviction query),
  ten-minute stale-capture recovery, upload-before-receipt/409 retries and
  five-failure fallback. J4 captures raw ids,
  wire payloads, error text/stacks, logs and EA identity; safe Git excerpts are a
  separate publication rule. No diagnostic redaction or raw SQLite upload.
  Automatic observer capture runs detached from status refresh; `capturing`
  excludes its receipt from ready counting and delivery until capture settles.
- [x] Profile Report a problem / Send diagnostics bottom sheets implemented and
  locally tested, with exact receipt-based feedback and optional-native-module
  screenshot preflight. Preserve original returned type/extension; no forced resize/conversion dependency.
  Feedback reads the captured incident reference after a sync attempt; a missing
  row returns `unknown` and cannot claim saved/sent.
- [x] Orchestrator reviewed the installed skill artifacts and the final integrated
  diff; final whole-branch Codex review approved (2026-10-29). Types and content pass.
- [x] Hosted apply through the guarded SQLite staging helper, read-only
  schema/function/grant/policy read-back and the pilot-shaped authenticated v1
  smoke (2026-10-29; v1 md5 `fc9fa2bc52e4f58060057884769435eb`, build log).
- [x] Native 1.5.0 pilot builds (iOS 26, Android 55 from `f002e08`, submitted
  2026-10-30). Galaxy A03s at default text size passed online/offline reports and
  diagnostics, a JPEG screenshot, force-quit then send, exact fetch and resolve, and
  a forced terminal upload (build log, 2026-10-30). The pass found the bugs in
  MA-BUG-20261030-001 to -007.
- [ ] Still open from that gate: capture/sign-out/account-switch fencing on a
  device, PNG/HEIC screenshots, and the iPhone smoke on TestFlight 26.
- [x] First `/bug-sync` and `/bug-user` sweep (2026-10-30): 10 test receipts and
  the A03s observations recorded as MA-BUG-20261030-001 to -008; 0 unrecorded.
  Sentry was not searched (no read-only connector in that session).

**B7 deferrals stay open:** web health panel, retention job, additional
schema-version ceremony and guarded automatic recovery. The approved design
explicitly brings the already-built bug-user intake into this lane. Other
non-goals remain user-health reconciliation, lifetime totals across pruned rows,
raw SQLite upload and converting domain uploads to protocol-v2 RPCs. Receipts
and bundles are retained through the pilot with no purge. Causal field recovery
and a no-recurrence window remain later evidence, independent of implementation.

### Highest-signal device gates

The device checklist is not untouched: C7, C8, and D5 passed on 2026-07-23, and earlier pilot/device
checks are recorded in the build log. The remaining checklist is still substantial. Start with:

- G1: head-office removal persists through force-quit and offline restart.
- H3: pending work remains owned by the correct EA across sign-out/sign-in.
- I1: low-end Android session-roster scrolling.
- B1: indoor GPS timeout and no-location fallback.
- C6: durable current reading level plus immutable session snapshot.
- M1-M10: seeded and zero-class onboarding paths.
- J6: BottomSheet geometry on a standalone preview build.
- E4: assessment attribution across a South African Programme-day boundary.
- S1-S7: Home and five-slot navigation visual acceptance. Home is now the Bold Red Home (2026-10-17); check it against the Design Round 4 canvas v2 boards and the device gate in `docs/superpowers/plans/2026-10-17-bold-red-home.md` Task 12. Android build 14 (2026-10-18) covered normal day, offline, sync attention (badge 1) and the largest One UI font (1.3) at 360dp and 411dp: all text complete. Still open: iOS; getting location, target met, above ceiling, no target, two messages; badges 12 and 99+; canvas comparison.

## 1. Bidirectional session and assessment history

**P0. First implementation slices: sessions/attendees, then assessments/items.**

**Active spec (sessions/attendees):**
[`docs/superpowers/specs/2026-09-08-cap-004-session-history-hydration-design.md`](../docs/superpowers/specs/2026-09-08-cap-004-session-history-hydration-design.md),
design approved 2026-09-08 with [ADR-0006](../docs/adr/0006-session-history-converges-on-server-stamped-family-timestamp.md).
Locked there: current-academic-year window; coattendees outside scope become **history reference
children**; convergence is a delta on the parent session's server-stamped `updated_at`; the
descending session-date RPC is dropped. Agent handoff:
[`docs/agent-context/cap-004-session-history-hydration.md`](../docs/agent-context/cap-004-session-history-hydration.md).

On 2026-07-23, a fresh TestFlight 1.3.0 installation showed no historical sessions or assessments
even though the correct SQLite backend then held 20 sessions, 40 attendees, 22 assessments, and
604 assessment items for that EA. Those are dated diagnosis figures, not the current total estate;
the 2026-08-27 Gate 0 counts are recorded separately. Current history screens read SQLite
correctly; the missing contract is inbound hydration.

- [x] **Decision locked:** one qualifying delivery relationship grants the complete
  session/coattendee aggregate. The parent activities JSON already contains child-keyed facts and a
  partial attendee list would misrepresent the event. Future restricted per-child facts require a
  separately authorized projection or table.
- [x] Applied and hosted-behavior-tested the committed session authorization migrations. Hosted
  PostgreSQL proves owner, current/former direct delivery, class-only, group-only, unrelated, and
  complete-family behavior; authenticated PostgREST proves the RPC and anonymous denial. Local
  PostgreSQL retains the deeper same-connection, microsecond-cursor, 2,004-row exhaustion, and
  hostile-plan evidence.
- [x] Implement the assessment-specific current-year class predicate (Assessment Results Plan 3
  Task 1, migration `20261022120000_assessment_history_pull.sql`; controller PostgreSQL and hosted
  verification remain open, see the build-log entry dated 2026-10-21). **Settled 2026-09-21:** an EA
  with an active class assignment sees a child's assessments from the current academic year if
  the child was a member of that class at any point in the current academic year. After a mid-year
  move, the old-class EA and the new-class EA both see that year's assessments. Do not reuse every
  arm of `current_user_can_read_child`. See ADR-0005's 2026-09-21 follow-up.
- [x] Verify and reuse the existing `ClassesContext`/SQLite `class_ea_assignments` hydration for
  assessment scope. Define one canonical SQLite-derived assessment-eligibility query, including
  inactive/revoked and current-year behavior; do not couple correctness to React context arrival
  order. Built in AR Plan 3 Task 7: `readAssessmentScope` in
  [assessmentHistoryPull.js](../src/services/assessmentHistoryPull.js), tested against real SQLite.
- [x] Prove that a server class-assignment row flows through `ClassesContext` into SQLite, survives
  a fresh read, and is consumed by the canonical assessment-scope query; prove an inactive/revoked
  assignment does not grant current scope. AR Plan 3 Task 7:
  [ClassesContextPull integration proof](../__tests__/ClassesContextPull.integration.test.js).
- [x] Add authenticated, Programme-scoped pull for `sessions` and `session_attendees` through the
  corrected delivery-history predicate. Built on `feat/cap-004-session-history-hydration`
  (2026-09-26). Hosted apply and device gates are the remaining items below.
- [x] Define an authorized history-reference projection for coattendee children (identity and
  display fields only, no roster or write authority) so a fresh device can persist a complete
  session family with SQLite foreign keys enabled. Built with CAP-004
  (`get_delivery_history_attendee_page`, `children.history_reference`). Surfaced by the 2026-09-04 adversarial review: session authority
  follows any historical direct assignment, child-read authority does not.
- [x] Reshape the parent page RPC so each grant arm yields ordered, bounded candidates before the
  merge, and extend the PostgreSQL harness with dense fixtures. `get_delivery_history_page`
  replaces it; with 125,007 sessions, pages read about 0.1% of a full scan. Surfaced by the same review; no field impact today.
- [x] **Server-stamped `updated_at` for assessment uploads.** Built in
  `20261021120000_assessment_results_contract.sql`: INSERT/UPDATE triggers on `assessments`,
  `assessment_items`, `battery_runs` and `letter_mastery`. The phone strips the timestamp from
  assessment/run RPC payloads. The Plan 2 mastery writer sends only the correction RPC's six
  arguments, without `updated_at`; the server advances the record timestamp only when a correction applies. See [ADR-0009](../docs/adr/0009-assessment-results-one-write-call-complete-families.md) and the
  [contract map](./rls-sync-contract-map.md). Controller disposable-PG17 verification is GREEN;
  hosted migration remains Assessment Results Task 14, not completed by this checkbox.
- [x] Audit insert timestamps for the new assessment/run/mastery delta pulls
  ([Z1](./zazi-sync-lessons-for-masi-2026-10-08.md)). Their server-owned INSERT/UPDATE triggers
  are in `20261021120000_assessment_results_contract.sql`; AR Plan 3 Task 7 uses their raw
  timestamps with keyset/overlap/re-walks. See the
  [walk contract](./rls-sync-contract-map.md#assessment-run-and-mastery-history-ar-plan-3).
  Audit any additional table before adding a future delta pull for it.
- [x] **Cheap page apply for assessment families and Battery Runs.** Built in Assessment Results
  Plan 3 Task 5: batched id lookups, whole immutable-family insert-or-ignore, and forward-only run
  merges in `historyPageApply.js`, using multi-row statements with at most 999 bindings through
  the signed-in facade. Present families, including pending uploads, stay untouched. Each page
  commits with its cursor; the 50-family / 3,050-item real-SQLite test uses fewer than 100
  statements. See [page-apply rules](./rls-sync-contract-map.md#page-apply--assessments-and-runs).
  Mastery page apply and handover are built in Task 6, traversal in Task 7; A03s timing remains
  a device gate. The batching rationale is [Z2](./zazi-sync-lessons-for-masi-2026-10-08.md) and CAP-004
  plan Task 9 Step 4e.
- [x] Add authenticated, Programme/current-year-class-scoped pull for `assessments`,
  `assessment_items` and `battery_runs` — **Assessment Results Plan 3**, not part of the upload
  completion below. Task 7 supplies all three walks and scope queries in
  [assessmentHistoryPull.js](../src/services/assessmentHistoryPull.js); the handle-owned store and triggers are built in Task 8.
  Combined status/readers are built in Task 9; hosted/device gates remain Task 14. See the [Assessment Results design](../docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md).
- [x] **Upload the assessment family all-or-nothing ([U2](./zazi-sync-lessons-for-masi-2026-10-08.md)).**
  Built in Assessment Results Plan 1, Tasks 6–9: exclusive `submit_assessment`, one complete
  outbox payload, one call regardless of the 1,000-row ready limit, no per-item fallback, and atomic
  parent/items acknowledgement. `save_battery_run` precedes linked families. The new disposable
  PostgreSQL harness passed 53/53 cases and all five existing harnesses passed (controller-run);
  real-SQLite/synthetic-network tests cover missing/malformed evidence, grant retries, lost
  acknowledgements and interrupted finalization. Direct EA item writes are denied, so a separate
  late-item insertion is not a supported path needing a parent timestamp touch. Server change
  times and local outbox times are documented separately in the [contract map](./rls-sync-contract-map.md).
  Hosted apply, practice-data wipe, EAS and device gates remain Task 14 with Jim's approval.
- [x] **Enforce submitted-assessment immutability (ADR-0007) for upload.** Built in the same slice:
  direct authenticated INSERT/UPDATE/DELETE on assessments/items revoked; only `submit_assessment`
  can insert a complete family. `saveQuestionResult` refuses existing ids, and committed RPC
  retries return `already_present` only after identity/item-id-set confirmation. `23505` never
  counts as success. Item identity is unchanged. [ADR-0009](../docs/adr/0009-assessment-results-one-write-call-complete-families.md)
  supersedes the older per-row insert-or-ignore proposal; hosted enforcement awaits Task 14.
- [ ] **Release the built letter-mastery current-state contract (ADR-0005 follow-up 2).**
  Assessment Results Plan 2 implements one current confirmation per child, letter and language
  code, current-deliverer correction writes, last-writer/current-deliverer SELECT, and D1.
  `set_letter_mastery` fixes a correction's effective time once in a receipt and resolves the
  natural key inside SQL, covering the ZZ-BUG-20260813-006 race. Both tracker surfaces write
  corrections; local acknowledgement displays the winner and terminal refusals do not count.
  **Remaining: Task 7's hosted apply/practice-data wipe and two-phone device gate.** Each external
  step needs Jim's yes. The mastery walk is built in Assessment Results Plan 3 Task 7;
  its handle-owned store and triggers are built in Task 8; combined status/readers are built in Task 9.
  Assessment evidence already uses, for each letter, the newest non-skipped stored letter result
  that reached it, from any recorder in the active Programme, including WelaPLUS Q1 and Full
  EGRA (per-letter since 2026-10-27); `userId` scopes that Programme, not the recorder.
  Confirmation reads have no recorder or Programme filter. The correction rule is in the
  [design §10](../docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md#10-letter-mastery).
  Practice data is wiped only at the approved release gate; no field-data re-key is planned.
- [x] Use bounded keyset pagination with an `id` tie-breaker and request deadline for every parent
  and child page from the first implementation. Built by CAP-004 and AR Plan 3 Tasks 2/4/7;
  assessment items arrive embedded as complete families. See the
  [walk contract](./rls-sync-contract-map.md#assessment-run-and-mastery-history-ar-plan-3).
- [x] Persist each parent and its children transactionally through typed repositories, with parents
  applied before dependents. AR Plan 3 Tasks 5–7:
  [page apply](./rls-sync-contract-map.md#page-apply--assessments-and-runs).
- [x] Preserve pending, failed, and terminal local work when server rows overlap. AR Plan 3
  Tasks 5–7 preserve immutable families and outstanding corrections; a terminal mastery value
  can recover while its refusal evidence stays. See the
  [mastery rules](./rls-sync-contract-map.md#page-apply--mastery-and-handover).
- [x] Define positive parent/child completeness evidence. AR Plan 3 Tasks 4/7 require an exhausted,
  error-free delta and no due re-walk; coverage is bounded inside the committing transaction.
  Ordinary queries never authorize history deletion. See the
  [walk contract](./rls-sync-contract-map.md#assessment-run-and-mastery-history-ar-plan-3).
  Per-child lesson-input completeness remains Task 11.
- [x] Update `rls-sync-contract-map.md` with producer, authorization, ordering, identity, conflict,
  and reconcile rules. AR Plan 3 Task 7:
  [history contract](./rls-sync-contract-map.md#assessment-run-and-mastery-history-ar-plan-3)
  and the four operation rows.
- [x] Cover first install, reinstall, second device, offline restart, pending-local collision, and
  parent-before-child ordering in real-SQLite tests. Synthetic remote history/fresh-state/restart
  proof: `assessmentHistoryPull.test.js`, `letterMasteryHandover.test.js`,
  `assessmentHistoryPage.test.js` and `batteryRunHistoryMerge.test.js`.
  Physical-device proof remains the open gates below.
- [ ] Add two-device physical gates proving device A history appears on device B. (2026-10-22: proven
  on one A03s with two EAs signed in in turn, AR3 Gates 3–4; the A03s + iPhone run remains.)
- [x] Make sync status distinguish "all local writes uploaded" from "local history fully hydrated."
  CAP-004 plus AR Plan 3 Task 9: one History row combines sessions, Battery Runs, assessments
  and mastery; missing or incomplete walks cannot show Up to date. Readers re-read SQLite as
  pages land, while the open session tracker sheet deliberately keeps its baseline. See the
  [status and reader contract](./rls-sync-contract-map.md#assessment-run-and-mastery-history-ar-plan-3).
- [x] CAP-004 hosted gate: `20260925120000` applied to `masi-app-sqlite` on 2026-09-26 through the
  isolated helper; hosted six-actor matrix and 1,205-attendee HTTP walk passed.
- [ ] **CAP-004 device gates (new phone within a minute on iPhone and low-end Android; two-device convergence with a
  backdated session; force-stop and offline mid-download).
  Step 1 passed for correctness with 20 practice sessions on 2026-10-08.
  **Fix first (plan Task 9 Step 4-0):** a stopped or failed history run is not resumed by a
  foreground or reconnect within 15 minutes, because history starts only after a roster pull that
  skips itself while its stamps are fresh (2026-10-08 Codex review).
  Added from Zazi's field evidence and the same review (plan Task 9 Steps 4a–4e):
  - an RPC/save timing split in the run log;
  - a realistic-volume account on the Galaxy A03s;
  - user writes timed during a download;
  - repeated early force-stops that resume forward, with the first durable commit within 3 s on a
    throttled network;
  - cheap page apply if any of these fail.

Until this lands, a green sync label proves outbound completion only.

Zazi parity: converging Zazi on this current-state correction rule remains separate Zazi work
(it has field users). Masi's per-child `children.reading_level` already matches
the current-state model better than Zazi's per-session carry-forward.

## 2. Correctness and safety

### Data and lifecycle

- [ ] **No-location release gates:** manual clock-in/out now save without location and carry the
  reason through SQLite and the upload payload (PR #65). `20261015120000_time_entry_location_optional.sql`
  is applied to the hosted backend (its status columns are present; the Plan 3 device pass read them
  on 2026-10-17). Before release, run the extended local upload-contract PostgreSQL harness and
  pass Android/iOS denial, services-off, indoor-timeout, stale-cache, offline, Settings return,
  double-tap, and successful-fix device scenarios. Controller owns hosted application and release.
- [x] **Server-side ten-hour clock-out — shipped in #77 and applied 2026-10-19.** The migration adds
  the 15-minute job and owner-write forward-only rule, including the cap on offline closed inserts.
  The phone checks the cap before and after location capture. The job's first runs succeeded and D3
  passed on the Galaxy A03s (build log, 2026-10-19).
- [x] **Newer-schema fail-safe (before pilot; priority item 5):** refuses to open a file whose SQLite
  `user_version` exceeds the bundle's `CURRENT_SCHEMA_VERSION` and shows an update screen with
  Sign out instead of Retry. Discovery skips too-new foreign files ([F2](./zazi-sync-lessons-for-masi-2026-10-08.md)).
- [ ] **Assessment draft persistence:** force-quit currently loses an in-progress assessment.
  **Loss accepted for the pilot (Jim, 2026-10-17).** Address this later with the longer
  WelaPLUS/durable-draft lifecycle rather than a one-off 60-second EGRA patch.
- [x] **Session form draft persistence or explicit launch acceptance:** navigate-away or process
  death loses an unfinished submit-and-go session. **Accepted for the pilot (Jim, 2026-10-17).** The
  local `lesson_drafts` table and handle-bound repository (C1) now provide the session side of the
  SQLite-backed draft/run lifecycle. They remain inert until C3: `LiteracySessionForm` stays
  draft-less until C3 replaces it. The storage layer alone does not supply autosave or resume UI;
  the assessment-draft item above remains separate and open.
- [ ] **Removed session attendees:** `sessionsRepository` does not delete
  `session_attendees` removed by a later save. No current screen edits submitted sessions, but this
  must be fixed and behavior-tested before edit UI ships.
- [ ] **Cross-school Head Office reassignment:** current reconcile can be RLS-denied and terminal.
  Design an authorized archive-and-insert RPC rather than weakening ordinary mobile RLS.
- [ ] **Manual sign-out diagnostics:** the auth runbook previously promised a reliable
  `manual-sign-out` clearing category, but the current manual path clears state directly and the
  later auth event may be recorded only as `signed-out`. Either restore reliable provenance or
  explicitly adopt the simpler diagnostic contract.
- [ ] **Real supabase-js start-up harness (issue #73).** The local-first cold start (PR #74) passed
  on the Galaxy A03s with build 13 on 2026-10-18: offline with an expired token Home appeared in
  about 6 s despite the same auth-js lock timeout that stalled build 12, and an online start loaded
  profile, classes and children without Retry. Build #73's harness, which runs the real auth-js lock
  and ticker, so lost or late auth events fail in CI instead of on a phone.

- [ ] **Literacy form forces a letter selection (issue #54):** a letters-mastered group has no
  letters to pick, so the EA taps an arbitrary letter and corrupts `activities.letters_focused`.
  Add a truthful "no letters taught this session" state. The first pilot is Literacy-only, so fix
  this before the pilot candidate build.
- [ ] **One stated timestamp-precision rule.** Record in `rls-sync-contract-map.md` the precision of
  every timestamp the server compares, orders, or checks, and pin it with a shared client/server
  corpus test. Zazi's millisecond-versus-microsecond equality refused every lifecycle request
  (ZZ-BUG-20260915-001). Check one possible Masi risk, which is not reproduced: a millisecond
  phone `unassigned_at` (`childrenRepository.js:154`) against a microsecond server `assigned_at`
  under the `unassigned_at >= assigned_at` CHECKs, which `classifyError` treats as terminal
  ([Z14](./zazi-sync-lessons-for-masi-2026-10-08.md)).
- [ ] **Lesson flow: phone checks left after merge.** The flow merged as #97 on 2026-10-28, with
  Jim's acceptance of the product choices P1–P12 that day; letter orders merged right after it.
  ADR 0010 records "advice from the children, record with the group".
  [Device gates V1–V8](./device-gates-sqlite-backend-2026-07.md#v-lesson-flow-c2c3-2026-10): the A03
  passed all eight, and Jim's iPhone pass on build 24 passed V3's swipe, V5's keyboard, V6, V7 and
  V8. Still to check on the 1.4.0 pilot build: Wrap up's "None of these yet" and header date
  button, and lesson advice after the known-letters fix (both postdate build 24); iPhone V1, V2
  and V4; ECD (no ECD class on staging). v1 has no timer. C4/C5 reader/receipt work remains
  separate; release packs are letters-only (P11). The build log holds implementation and review
  evidence.

### Upload contract (before pilot; priority item 5)

**Two live defects confirmed by the 2026-10-08 Codex round 2 (fix first, pilot blockers):**

- [x] **An EA's edit to a child Head Office created never uploads.** *Closed: server half by Plan 1
  (PR #64): edits go as UPDATE by id with an exact acknowledgement, proven against the replayed
  migrations by S1. Phone half by Plan 2 (PR #67): the outbox owner is the signed-in EA, never
  `created_by`. The two-EA device check of this exact path is still worth running on the pilot build. Plan 1 also fixed a third defect: group-assignment reactivation was
  sent as an ignored insert and now goes as an acknowledged `restore`. Before field launch, clear
  development outboxes: legacy per-operation lifecycle rows are not consolidated at startup (see the
  contract map's Error Classification known limitations).*
  - `updateChild` takes `actorUserId` but enqueues without it (`childrenRepository.js:404-426`).
    The outbox owner therefore resolves from the child's `created_by`
    (`outboxOwnership.js`, `children: directOwner('created_by')`), which is the office account,
    and the EA's owner-scoped claim never selects the row. The reading-level update submitted
    with a session takes the same path.
  - Fix: separate mutation ownership from creator attribution. Every user-facing enqueue
    records the authenticated editing actor as the outbox owner; `created_by` is unchanged.
  - Test an EA editing Head Office-created children and groups, including reading levels
    submitted with a session, through claim, status, recovery, and sign-out.
- [x] **An upload can run under the next EA's session.** *Closed by Plan 2 (PR #67): every server
  request goes through the signed-in EA handle's own data client and queue, fenced when it sends;
  a stale refusal ends the pass without finalising. Device gate D2 is the remaining field proof.*
  - The pass checks the session before enqueueing, but the queued task runs later through the
    shared Supabase client without re-checking (`offlineSync.js:1009-1016, 1196-1205`). Codex
    probed an A→B switch between admission and dequeue: A's upload ran as B and finalized.
  - Fix: every queued request and transaction captures its actor (and, under D2, its database
    handle and connection epoch) and re-validates at execution, at transaction admission, and at
    finalization.
  - Test A→B and A→B→A switches for delayed uploads and roster persistence. This is required
    whichever way D2 is decided.

**Shipped in #77 (2026-10-19).** The
[upload-contract design](../docs/superpowers/specs/2026-10-18-upload-contract-design.md) is implemented:
send-time `row_version` on 11 tables, terminal `MV001`, guarded pulls and historical membership
retries, plus the server and phone ten-hour clock-out rules. The
[contract map](./rls-sync-contract-map.md#row-versions-upload-contract) owns the current behavior;
the [Verification Register](./build-log.md#verification-register) owns the local results.

- [x] **Bounded completion for every signed-in EA request, uploads included (U1).** Plan 2's
  per-handle client aborts requests at its deadline and releases the queue. The upload contract now
  fences uncertain late writes for the 11 tables; time entries cannot reopen after a close.
  Timeouts remain retryable uncertain outcomes and do not consume the deterministic-error cap.
  Ruling 11 is closed for the 11 tables; applied 2026-10-19 and D2/D3 passed on the Galaxy A03s.
  Letter mastery retains its separate D1 pilot gate below.
- [x] **Controller and release gates for the upload contract — done 2026-10-19.** #76 and #77
  merged after green CI; migration applied to `masi-app-sqlite` and verified read-only (job runs
  succeeded); Android build 16 and iOS build 13 built from 6fc0212; D2 and an accelerated D3 passed
  on the Galaxy A03s (build log, 2026-10-19). D2 proved an edit queued at sign-out, not a sign-out
  with a request in flight; the in-flight case is covered by the automated lost-reply tests.
- [ ] **Reject stale edits on records more than one writer can change (U3), deferred until
  Head Office edits EA records.** Send the server version last downloaded as a base, reject a
  base behind the stored version, and make Head Office writes bump `row_version`. The current
  counter only orders one phone's sends; it does not establish multi-writer conflict protection.
  The column and trigger accept that additional comparison without a replacement protocol.
- [ ] **Verify the built letter-mastery D1 contract on hosted and both phones (Assessment Results
  Plan 2 Task 7; decided by Jim 2026-10-08, reconfirmed 2026-10-14).**
  The re-key, correction receipts/RPC, phone acknowledgement, readers and both writers are built.
  The most recently *made* correction wins by effective time and UUID. A new future timestamp is
  clamped once at server arrival; a lost-reply retry retains that receipt's effective time.
  **Still open before pilot:** hosted application and the two-phone correction-order gate,
  including the fast-clock/lost-reply case. The upload-contract row-version mechanism does not
  cover mastery. Plan 3 owns mastery download/completeness; it is not part of this release gate.
- [x] **Duplicate-proof submit (U5).** Literacy session capture now mints one session id per form,
  reuses it on retry, and uses a synchronous ref lock to prevent double-tap saves; assessment
  submit already guards completion with a ref and reuses its record on retry. This closes the
  per-tap identity risk behind Zazi's 302 extra session copies (ZZ-BUG-20260819-021).
  LetterMasteryPanel taps are now corrections through `setLetterMastery`, guarded while a
  write is pending, with one child/letter/language record and one correction outbox slot.
  The deterministic per-EA id is retired; hosted/device rollout remains Plan 2 Task 7.
- [x] Android cloud-backup and device-transfer exclusion is built with `android.allowBackup: false`
  and explicit data-extraction exclusions (U6). A restored database replayed already-accepted work
  in Zazi (ZZ-BUG-20260907-001); the
  [§0 backup item](#0-pre-live-ground-truth-observability-and-pilot-activation) retains the A03s
  restore and device-to-device transfer proof as an open gate.

Deferred: mutation ids and server receipts for edits (U4, only if U3 proves insufficient), an
environment circuit breaker, and strict acknowledgement inventories. Not adopted: per-install
generations, client streams, cutover and activation machinery (U7).

### Deliberate tripwires

- [x] Extend `GRANT_SUBJECTS` before membership-mediated class/group access ships. **2026-10-21:**
  membership-mediated child evidence already existed; B2 Task 5 adds held-group evidence for
  sessions and attendees, counting this EA's owed assignment insert even after it has ended.
- [ ] Define collision-proof identity for `grouping_versions`, `groups.display_number`, and
  `child_group_memberships` before the group-centred slice. **2026-10-21:** lesson-plan C16 keeps
  this deferred; B2 adds no new kind of group write.
- [ ] Decide whether leaked-password protection is required before broader external rollout.

## 3. Sync efficiency and fleet behavior

- [ ] Design collision-safe, table-specific batching for class memberships and group memberships.
  Do not put either through generic upsert batching.
- [ ] Design delta pulls with the real owner/scope/time predicates, then add and prove the matching
  composite indexes. Do not add blanket `updated_at` indexes to every table.
- [ ] Add pagination to every potentially unbounded pull and define an enforced maximum where a
  scope is operationally expected to remain bounded.
- [ ] Give every roster/reference pull request a deadline. Today a hung request blocks the shared
  `supabaseRequestQueue` for all later pulls (found by the 2026-09-26 Codex review of CAP-004).
  Session history's deadline reports failure but does not release the queue; uploads have none.
  This is now one queue-level contract under "Upload contract" in §2 (U1).
- [ ] Add full-jitter backoff and randomized foreground/reconnect pull scheduling so a national
  fleet does not retry in synchronized waves.
- [ ] Add remotely configurable pull intervals and a sync kill switch before large staged rollout.
- [ ] Resolve whether My Children pull-to-refresh should force-push pending work or reload only.

Sharpened by Zazi's 2026-09/10 delta-pull, first-install, and measurement work
([`zazi-sync-lessons-for-masi-2026-10-08.md`](./zazi-sync-lessons-for-masi-2026-10-08.md), Z3–Z11).
Order these before the pilot unless marked otherwise:

- [x] **Server-owned rollout and kill switch for the three AR history RPCs (Z8).**
  AR Plan 3 Tasks 1/2/7/8 use `private.history_pull_rollout`: per-EA row, then everyone row,
  then off; disabled RPCs return `MR001 / rollout_disabled`. The phone preserves rows and cursor
  position, records incompleteness and resumes from that position when enabled. See the
  [history switch and trigger contract](./rls-sync-contract-map.md#assessment-run-and-mastery-history-ar-plan-3).
  **Scope:** uploads, roster/reference and session-history pulls are not gated. A broader sync
  kill switch, remotely configurable intervals/minimum protocol and the cohort rollback drill
  remain open; this checkbox closes only the three assessment/run/mastery RPC gates.
- [ ] **Jitter covers cold opens, not only warm caches (Z7).** Use one shared 0–3 minute
  admission window per cold open or offline-to-online transition. Empty-cache bootstrap and
  explicit refresh bypass it.
- [ ] **Any user-visible "stuck" limit measures lack of progress, never elapsed time (Z5).** Use a
  no-progress timer, with Retry/Sign out shown only after a no-progress interval. Pair it with a
  visible "still downloading" state, so an empty screen is never read as "no data". A run budget
  that resumes from its cursor, as CAP-004's does, is not a failure claim and stays as is.
- [x] **Pull-trigger budget tests for history pulls (Z4).** AR Plan 3 Task 8 pins all seven
  session/assessment-history service start sites and their frequencies in
  `historyPullTriggerBudget.test.js`. Repositories, components, hooks, uploads, literacy saves
  and sync completion never start history. The real-store budget proves zero RPCs at +1/+7/+14
  minutes and three delta calls at +16. See the
  [trigger inventory](./rls-sync-contract-map.md#assessment-run-and-mastery-history-ar-plan-3).
  Broader roster/reference/upload trigger budgets remain open. Zazi's save-triggered full
  re-download and 22.8 s Start regression are the motivating case.
- [ ] **Write-wait measurement (Z3).** Add a real-SQLite test that times a user write queued behind
  a pull transaction. Add enqueue/start/end timing lines on the writer queue (`src/db/client.js`),
  tagged with the pull that was active when the write was queued.
- [ ] **Delta split (Z9).** Delta only the large history families. Keep roster/reference scopes as
  paginated snapshots. Narrow each scope to the actor's ids before RLS runs. Prove scan work stays
  flat as unrelated rows grow, rather than adding indexes by column inventory.
- [ ] **Server-decided baseline mode (Z10).** Distinguish `no_cursor`, a future cursor (more than a
  few minutes ahead of server time → re-baseline), and periodic. **Do not** import Zazi's "cursor
  never passes a pending row" rule (Codex 2026-10-08). Masi skips a dirty family and advances
  (`sessionsRepository.js:279, 318`). The family returns when its upload is re-stamped after the
  cursor, or at the re-walk. Freezing the cursor would recreate the stall spec §12.3 rejected. Test
  a dirty first parent followed by healthy later pages.
- [ ] **Tombstones (Z11), decided before any roster delta.** Zazi never built them and relies on
  periodic baselines. Decide whether removals ride a family timestamp, a tombstone table, or
  snapshot reconcile alone.
- [ ] **Per-phase pull timing on every pull (Z3, Z5).** Every pull, not only history, logs RPC time
  versus SQLite save time, so an exported log can attribute a slow phone.

Already closed and therefore intentionally absent from this backlog: record-scoped dependency
gating, bounded failed-batch fallback, versioned startup repair, queue-age preservation, set-based
batch claims, request-level pull fairness, child/programme batching, immutable-assignment insert
batching, bootstrap recovery, nullable session-relationship indexes, and the live reconcile
acknowledgment RPC.

## 4. Group-centred sessions and Head Office changes

The active specification is
[`group-session-workflow.md`](./group-session-workflow.md). Implement it in this order:

1. **Whole-class visibility/access implementation is closed** (2026-10-23); complete its
   staging and device gates below before treating it as deployed;
2. identity and lifecycle contracts;
3. local schema, Supabase schema, RLS, payloads, ordering, and reconcile;
4. group cards and Group Detail;
5. group-first capture and durable session drafts;
6. device and two-device proof.

Status (2026-10-21): item 3's session-group contract is built on `feat/lesson-plan-b2-session-group`
(lesson-plan B2: held-group authorization, local history reference, upload and ordering, the
lost-reply fix). Its hosted migration was applied on 2026-10-22, and its A03s device gates G1 and G2 passed the same
day; the iPhone rows remain.

Whole-class assessment access:

- [x] **Build whole-class visibility/access** — Tasks 1–8 implemented on
  `feat/whole-class-assessment`, rebased through `6215c04`. Assessment scope includes delivery
  and control children; delivery surfaces remain unchanged. See the
  [2026-10-23 build entry](./build-log.md#2026-10-23--whole-class-assessment-access).
- [ ] **Staging apply and verification, only after Jim's go.** Apply
  `20261023120000_whole_class_assessment_access.sql`, check both new acknowledgment keys, and
  verify a class-only EA can submit a control-child result. Disposable PostgreSQL proof is not
  evidence that staging has the migration.
- [ ] **Device gate — A03 and iPhone.** Sign in as a class-assigned EA; see "Rest of the class";
  assess and sync a control child with the letter test and WelaPLUS after its host flow is
  available; verify the server rows; end the child's membership, pull, and confirm the child
  leaves the assessment picker. Keep the child out of delivery lists and counts throughout.

Additional Head Office behavior retained from the Sprint 4 follow-up:

- [ ] Model a school pause by Programme and academic year. Schools are not hard-deleted or globally
  "closed."
- [ ] Add ignore metadata for captured records that Head Office wants excluded without erasing
  history, and apply it consistently to reporting, mastery, and statistics.
- [ ] Give the EA a comprehensible history/surface for what Head Office changed.

## 5. Product and UX

- [ ] **Masi's second letter order edition:** add the edition schedule in the same migration that
  widens the class edition check constraint. The first edition, `2026-10-23`, needs no schedule
  ([ADR-0011](../docs/adr/0011-letter-order-edition-per-class-set-by-server.md)).
- [ ] **Readers for the books v2 previews:** add readers to the new-order preview packs in the
  early-reader-books project. They currently supply candidate word banks without readers.
- [ ] **One "current class" rule for delivery lists (deferred 2026-10-28).** The letter tracker
  and the Letter mastery ranking take a child's class from the active class membership. Class
  lists and Child Results' "Assess now" still use `children.class_id`. They agree today: on
  staging, 0 of 46 children differ, and phone writes change both together. Revive when anything
  other than the app can write memberships without `children.class_id`, such as a head-office
  tool or a new-year rollover seed (build log, 2026-10-28, letter orders review round 2).
- [ ] **Lesson clock (Jim, 2026-10-28: wanted later, not in this release).** The lesson flow has no
  timer by design (lesson-plan spec §8; `group-session-workflow.md`), and main's old Record form
  had none either. Zazi's session clock is the model: a countdown to the target length with
  Pause, saving the active teaching time, capped at 60 minutes. Masi's lesson sections already
  carry times (Letters 15, Blending 15, Pair reading 5 min). `sessions.started_at` and `ended_at`
  exist, but nothing fills them yet.
- [ ] **Lesson plan (spec 2026-10-20): A1 content packs built; the Android Hermes check (T1) passed on 2026-10-22; the iOS check (A1 Task 7, T2) remains open.** Record: build log, "Lesson plan A1: content packs".
- [ ] **Bold Red for the rest of the app (Jim, 2026-10-18: build all of it).** Shared look built
  on `feat/bold-red-app` (2026-10-19), following Home (#70). Design source: the Design Round 4
  canvas (https://claude.ai/artifact/8gQRtyqZ5Q1vTCTdSkz6zc, private to Jim), Bold Red (B) boards on
  the Log in, Children, Record / New session, Session complete and Profile pages, plus the Bold Red
  system sheet. Children (My Children and Class detail) is built on `feat/bold-red-children`;
  its Task 11 preview/device gate remains open. Record is built on `feat/bold-red-record`; its
  Task 14 branch review and preview/device gate remain open. Session complete is built on
  `feat/bold-red-complete`; its Task 13 branch review and Task 14 preview/device gate remain open.
  Profile is built on `feat/bold-red-profile`; its Task 9 branch review and Task 10 preview/device
  gate remain open. Login and reset password are built through Task 8 on `feat/bold-red-login`;
  its Task 10 branch review and Task 11 preview/device gate remain open. All board screens are
  implemented; the overall item remains open for review, merge and native acceptance. Approved behaviour decisions are in
  `docs/superpowers/specs/2026-10-18-bold-red-app-design.md` §6. PR 1's Task 34 EAS preview/device
  gate remains open. **C11:** reproduced on the A03s, build 15 (Create class → School search
  results under the keyboard), and fixed in Profile Task 2. The A03s/iPhone no-double-lift row
  remains open in Profile Task 10. Each later board PR also needs its own preview/device check.
- [x] Roll typography tokens out or retire the incomplete token system. Built 2026-10-19 on
  `feat/bold-red-app`: legacy export retired, 42 `typeRoles`, Figtree 600, mapped themes and
  fail-closed typography/source guards. All ten board files have now removed their raw-type/Paper
  allowances; `BOARD_RATCHET` is empty after Login Tasks 6 and 8.
- [x] Replace the 14 screen-local Snackbar hosts with one root host. Built 2026-10-19 on
  `feat/bold-red-app` as **`ToastProvider`**, not `SnackbarContext`: actor-scoped publishers,
  keyboard/obstruction placement and a host after the Paper tree. Native layering remains Task 34.
- [ ] Add class/group context to assessment child rows.
- [ ] Decide how Session History names attendees: full list, truncated `"Amahle +3"`, or count only.
- [ ] Remove the cosmetic selected checkmark from the "No class" picker row, or give the row a
  real selectable meaning.
- [ ] Add an explicit manual retry state for failed school/class reference-data loading.
- [ ] Decide the fate of `session_type_id` and `activities.__legacySession`: promote a real synced
  contract or remove the machinery.
- [ ] Push notifications and a durable message inbox remain unbuilt.
- [ ] **Password recovery dead-ends; “Forgot password?” is hidden on Log in** until a deep link
  and set-new-password screen exist ([#78](https://github.com/JimMcKeown17/masi-app/issues/78),
  Jim 2026-10-19). Reset is restyled and registered but unreachable from Log in; D10 is deferred to #78.
- [x] **Suspended sign-in copy:** build 14's raw "User is banned"/purple-action Snackbar finding
  (2026-10-18) is addressed on `feat/bold-red-app`, 2026-10-19. `describeAuthError` now gives
  "Your access is paused. Please contact your supervisor." Login now shows it inline on
  `feat/bold-red-login`; Task 34 and the Login preview/device gate still own native acceptance.
- [ ] **Bold Red clock row at large font:** at One UI's largest font (1.3), "Not clocked in" wraps to
  two lines at 411dp and three at 360dp, making the row tall. Text stays complete and the action
  tappable; consider a shorter label or stacking the button. Found on build 14, 2026-10-18.
  Low priority: no EA has been seen using that font size, and device gates no longer check it
  (Jim, 2026-10-27).

## 6. Head Office import and provisioning

**Deferred by Jim on 2026-07-14.** Roughly half of EAs receive classes, children, and groups from
Head Office; roughly half create them through guided local onboarding. The future importer must be
one idempotent source-to-target pipeline, not separate "seed" and "bulk import" scripts.

When this resumes:

- [ ] Inspect the Airtable/Postgres source tables, identifiers, relationships, and data-quality rules
  read-only with Jim.
- [ ] Define identity mapping, reconciliation, dry-run output, rerun behavior, and failure recovery.
- [ ] Reuse the app's deterministic-ID functions for `child_ea_assignments`,
  `child_programme_enrollments`, `class_ea_assignments`, and `group_ea_assignments`.
- [ ] Recompute today's expected IDs after import and require zero mismatches, including
  `letter_mastery`. Checking only whether an ID is random is unsound because obsolete deterministic
  formulas can also be wrong.
- [ ] Preserve recurring audit history for `child_class_memberships`; random row IDs are correct
  there, with reconcile-before-upsert.
- [ ] Define the collision contract for imported `child_group_memberships`.
- [ ] Build an audited national provisioning/control plane with role separation, revocation,
  secrets handling, and operator logs.
- [ ] Build the audited suspension surface on top of §0's minimum revocation contract. Zazi's
  version writes an audit row before any external call and restores only its own suspensions
  ([Z16](./zazi-sync-lessons-for-masi-2026-10-08.md)).

Current narrow capability: `scripts/createTesters.js` provisions explicit zero-class pilot testers
against the exact SQLite backend. `scripts/ea-access.cjs` supplies audited suspension/status/restore
tooling (applied to hosted and device-proven 2026-10-18, §0). `scripts/loadTestUsers.js` is deliberately disabled. The archived
[`seed plan`](./archive/seed_data_plan.md) and
[`bulk-import plan`](./archive/bulk_import_children_plan.md) are schema-dead and must not be revived.

## 7. Assessment content and additional forms

- [ ] **Finalize and build the Numeracy and 1000 Stories session forms** (Jim, 2026-09-23: a
  deliberate push in parallel with the history work, not a pilot gate). Only Literacy exists. The
  first pilot stays Literacy-only. Jim supplies the form requirements; the earlier numeracy
  comparison draft was lost with its temporary folder and must be redone.
- [ ] Yebo (Yeboneer) session form: deferred by Jim on 2026-09-23. Zazi iZandi sessions belong to
  the separate Zazi app, not Masi.
- [ ] **Full EGRA 2026.1: device gate and field materials.** One Battery, `egra@2026.1`, in
  isiXhosa, English (HL), Afrikaans and isiZulu on the shared 2026.3 content, opening in the class
  language with no form picker (merged in PR #108, 2026-10-27,
  [spec](../docs/superpowers/specs/2026-10-26-egra-content-and-skip-rules-design.md)). The 13 old
  forms (PR #104) stay registered for saved and unfinished assessments only. The quick tests use
  the same DBE words, so the old placeholder word lists (including Zazi's provisional Afrikaans
  list) are no longer offered. On the A03 (build 49, 2026-10-27) Afrikaans and isiZulu started in
  the class language, captured, stopped on a first row, showed "No story words read" beside the
  Skipped chip for a zero story, resumed after force-quit and finalized; the isiZulu quick tests
  saved. Remaining:
  - on the A03: the language sheet for a class with none, "Not available in … yet" for other
    languages, Undo after a first-row stop, offline then sync, and the results screens;
  - the iPhone pass;
  - print the Reading Card 2026.3 per language (task in §8);
  - resolve the pack's `sourceNotes` before field use (see the open decisions below).
- [ ] **EGRA open decisions (Jim):**
  - **Source notes.** The pack's `sourceNotes` must be resolved before a form is used in the field.
    Each note on a chart in use needs a recorded keep-or-fix decision before printing (for example
    the isiXhosa story's "nguSidumo Wabona", printed without a full stop, and its question 4 answer
    guide, which ends with an unmatched `”`). A fix is never an in-place edit: the pack is shared
    byte-for-byte with Zazi and both websites, so its owner issues a new form id (such as
    `dbe-egra-xh-hl-1-v2`) to all four repos. #111 edited that quote in place; it was restored.
  - **Answer guides to review (EGRA review, 2026-10-27).** isiZulu question 4 ("Umama wamtshela
    ukuthi yini ebalulekile?") expects "Ukusizana kanye nokuhlanzeka", but in the story Usisi says
    that and Umama says everyone must wash dishes, so a careful child is marked wrong; it needs an
    isiZulu reviewer. English question 5's guide gives only "The dog ate the bone"; DBE's worked
    example also accepts "He slept".
  - **DBE administration rules (training or instructions).** The shared instructions leave out
    DBE rules that change scores: about 3 s of hesitation is Incorrect, self-corrections count as
    correct, and story questions are asked only for the part of the story the child read.
  - **Per-minute scores.** DBE scores letters and words as correct per minute (correct ÷ elapsed
    × 60); the app saves the raw count in 60 s (`duration_ms` is kept, so a rate can be derived).
    They differ only when a child finishes early; `scoreBands.js` and the score-bands doc call the
    raw count "LCPM". An early End on the story shortens the time a per-minute figure divides by.
  - **isiXhosa letter practice items.** DBE's isiXhosa HL 3 chart prints none; confirm on the proof.
  - **Letter charts settled (Jim, 2026-10-27).** English letters use DBE English FAL 3 (all 26);
    HL 3 never asked q, v, x or z. isiZulu's SMRS chart has no `r` and stays as printed. Only the
    English letter chart is FAL; English words, story and questions are HL 1. Since the tracker
    keeps each letter's newest evidence, either English chart is safe for the tracker, so HL 3 vs
    FAL 3 is now a teaching choice (are the English-assessed children HL or FAL learners?).
    Before printing, switching is a one-line change; after the pilot starts, it needs a new
    shared reading version (old results keep theirs) and reprinted Reading Card side A.
  - **Skip rules for Full EGRA (deferred, 2026-10-26).** WelaPLUS 2026.1 has first-row skip rules
    (§8); Full EGRA keeps only the story-comprehension skip. Decide whether Full EGRA gets them,
    and whether government-funded schools that need every Question can switch them off (the
    per-EA switch in §8).
  - **Story first-line stop rule (wanted, Jim 2026-10-23).** It needs the printed line breaks of
    each story, which the pack does not have; get them from the source charts first.
  - **Score bands.** Should `oral_reading` and `reading_comprehension` get score bands?
  - **isiZulu mastery.** isiZulu letter mastery needs an isiZulu 26-letter order.
  - **Rankings.** Letter cards are now the 100-letter DBE charts (110 for isiZulu), so the
    60-second raw score is not capped. Rankings read by Question code and keep combining
    versions (2026-10-26 spec).
  - **Comparable and per-grade forms (later).** Baseline, midline and endline use the same form
    for now (Jim, 2026-10-25); experts may write comparable versions and per-grade forms later.
- [ ] Configure Word Reading score bands. Until then the Words ranking remains neutral, and the
  Word Reading quick-test result gives no praise (it follows the bands, 2026-10-27).
- [ ] Keep score thresholds explicit in `assessment-score-bands-config.md` and runtime code until a
  tested synced-table configuration path exists.

## 8. WelaPLUS

**WelaPLUS 2026.1 is merged** (PR #108, 2026-10-27,
[spec](../docs/superpowers/specs/2026-10-26-egra-content-and-skip-rules-design.md)): 12
Questions on the shared DBE/SMRS reading content (Story comprehension is Q9), first-row skip
rules with a one-off skip card, one Reading Card per language, and the literacy default moved to
2026.1 by migration (applied to staging 2026-10-27). Apps built before PR #108 cannot start
WelaPLUS on staging; new builds come from main. 2024.1 stays registered for saved assessments. The paragraphs below describe
the Release 1 host it runs in.

**The Release 1 Battery Run host is merged** (Plan 3, PR #101, on whole-class access, PR #100;
2026-10-25), pending the rest of its device gate. Every Question except the Story writing rubric is marked
step by step (2026-10-26). Plan 3 adds the
Assessments card and unfinished runs, whole-class child selection, create/resume/abandon,
Question capture and skips, atomic saves, review/finalize and History-to-summary navigation.
Both roster sections use the assessable roster, including ECD/Grade R and control children.
WelaPLUS 2024.1 supports EN/XH; other class languages stay visible with an availability note,
and a missing language opens a picker limited to the battery's languages. Generic
`fixedLanguage` support is built for the EGRA team's registration follow-up (§7).

The package's 11 Questions, 2024.1 bilingual content, evaluator and shared capture primitives
are built. WelaPLUS Q1 shares `letter_sounds@2026.2` with standalone capture. Assessment Results
Plan 1 supplies the stored-result/upload foundation, family/run-header RPCs and ADR-0007
identity contract; the literal-UUID test pins `assessmentItemDomainId` (Story writing HQ positions 5–8
remain distinct from the EA's 1–4). `npm run test:types` checks the package in CI. These are
WelaPLUS release-plan numbers, distinct from the Assessment Results plans. Evidence and scope:
[build log](./build-log.md), [Release 1 design and dated amendments](../docs/superpowers/specs/2026-10-14-welaplus-release-1-design.md).

### Integration and contract work

- [ ] **A03 and iPhone device gate:** prove the complete host flow, whole-class selection,
  language gating, materials handoff, skips, save/discard, between-Question force-quit/resume,
  single run-code/name tick, finalize/Back, pulled-run read-only summary and offline-then-sync.
  Check Bold Red tokens, BottomSheets, wrapping and bottom insets physically, at default text
  size: large text is no longer a device-gate check (Jim, 2026-10-27; `design-system.md`).
  The A03 passes on builds 49–52 (build log, 2026-10-27) covered child selection, materials
  handoff, every Question, skips, force-quit resume, the run-code tick and finalize. Still to
  prove on the A03: language gating, the pulled-run read-only summary and offline-then-sync.
  Everything remains for the iPhone. Package capture Task 17's native gates remain open too; a
  local test pass does not close them (2026-10-22 build log).
- [ ] **Produce the printout pack after the app is finished** (Jim, 2026-10-26: EAs receive cards
  and app together): approve artwork, physical proofs and stock from the
  [designer brief](./welaplus-printout-pack.md): one Reading Card 2026.3 per language (EN/XH
  sides A–D, AF/ZU sides A–C; 100-letter charts, 110 for isiZulu; exact first rows), Andika
  Regular, exact footers, boxed Assessment code, Picture Cards and consumable Writing Sheets.
  WelaPLUS 2024.1 cards (Grid A 6 × 10, Side B 5 × 8) and the Masi 60-letter Grade 1 cards are
  never printed.
- [ ] Build `battery_run_artifacts`, the local photo queue and Storage bucket/RLS, including their
  payload declarations and upload ordering. This deferred artifact/photo scope is not supplied
  by the completed family/run-header RPCs or Release 1 host.
- [ ] Complete deferred photo capture/upload, WelaPLUS Settings and support export integration.
- [ ] Decide the package boundary, publish/extract the OSS package, and add README, example, setup
  guide, integration prompt, versioning, and licensing ratification.

### Pedagogy and field validation

- [ ] **Step-by-step marking: what the A03 pass left open** (built 2026-10-26;
  [spec](../docs/superpowers/specs/2026-10-25-step-by-step-capture-design.md),
  [plan](../docs/superpowers/plans/2026-10-25-step-by-step-capture.md)). The A03 pass on builds
  45 and 47 saved every Question correctly. Still to do:
  - run it on the iPhone, and listen with TalkBack and VoiceOver: the flip notice should be read
    once, and the spoken answer guides (Q2, Q4, EGRA comprehension) should make sense;
  - Q5 review: the page indicator grows by its arrows and the grid shifts down about 18dp;
  - the Select child list scrolls under the Android navigation bar (pre-existing).
- [ ] **EA usability check of step-by-step marking on a preview build.** Watch two or three EAs
  mark a real child (or a colleague reading from the cards) through WelaPLUS and Full EGRA.
  Look for: the ring followed without hunting, Back used rather than flipping, the End sheet
  understood, the review line read before Finish, and the flip notice noticed but not
  distracting.
- [ ] **Shared reading content and skip rules: iPhone pass.** Merged in PR #108 (2026-10-27;
  [spec](../docs/superpowers/specs/2026-10-26-egra-content-and-skip-rules-design.md),
  [plan](../docs/superpowers/plans/2026-10-26-egra-content-and-skip-rules.md)); the literacy
  default migration `20261026120000_welaplus_2026_1_default.sql` is applied to staging. The A03
  pass is done (builds 49–52, build log 2026-10-27): WelaPLUS 2026.1 isiXhosa with a Q1 trigger
  (card, row labels, Back and backdrop ignored, card back after force-quit, finalize), English with
  a Q6 trigger, isiXhosa with a Q5 trigger, a clean 12-Question run, Full EGRA in isiZulu and
  Afrikaans, both quick tests in isiZulu, and staging rows matching each run. Still to do: the same
  runs on the iPhone. The EGRA session reviewed #108 (2026-10-27): the adapter refactor is
  byte-identical for the 13 forms, saved `-masi60` results still read in history, rankings and
  mastery, and scoring holds under step-by-step marking. Its fixes landed in #111 and the English
  letter-chart PR; its content questions are in §7 ("EGRA open decisions").
- [ ] **Small follow-ups from the 2026-10-27 A03 pass and EGRA review** (none blocks the pilot):
  - sheet footers sit flush against Android's three-button bar: `BottomSheet` pads its bottom with
    `max(safe-area inset, 24dp)`, and on that bar the inset equals the bar (check the iPhone too);
  - "Letter writing first row wrong" leaves "wrong" alone on a second line in question rows at
    360dp (`ListRow` subtitles wrap greedily; Android's `textBreakStrategy="balanced"` would fix it);
  - the create-class form offers no isiZulu home language (`HOME_LANGUAGES` lists isiXhosa,
    English and Afrikaans), so isiZulu classes need a data fix today;
  - rankings: bar width is score ÷ that result's own item count but rows sort by raw score, so
    mixing 60-, 100- and 110-letter cards (or 50- and 80-word cards) puts bars out of order;
  - the dev/preview Question Gallery still lists only the 13 old forms and WelaPLUS 2024.1.
- [ ] **Skip-rule switch (deferred, Jim 2026-10-26).** Rules are always on in WelaPLUS 2026.1.
  Government-funded schools sometimes need every Question, so build later: a per-EA setting (not
  per school) with a Head Office default and lock, an EA Profile toggle that syncs when unlocked
  (partners may choose for themselves), a website admin screen, and the setting recorded on each
  assessment. Full EGRA skip rules are a separate decision (§7).
- [ ] **Revisit early endings as triggers (deferred).** Today an End tap before the first row is
  complete never triggers a skip (Jim, 2026-10-26: "leave it as is for now").

- [ ] Close remaining content approvals: XH Q5 g/n/z picture choices and clock artwork, plus a
  first-language spelling review before the pilot (Release 1 §4.3; #34). The bilingual item
  sets/scripts and Q6/Q8 60-second durations are built; do not reopen them as missing content.
- [ ] Settle Story writing's (Q12 in 2026.1) final rubric anchors/isiXhosa labels, future prerequisite thresholds and
  score bands. WelaPLUS 2026.1 has first-row skip rules and a Story comprehension
  prerequisite; 2024.1 has none. Manual skips and generic evaluator support are built.
- [ ] Build the HQ rubric/calibration path and dashboard consumption.
- [ ] Validate the first 50 Runs, including paper matching, offline/restart, RLS, sync and low-end
  Android behavior. Photo validation belongs to the deferred artifact rollout.

The full product contract remains
[`wela-plus-battery-prd-2026.md`](./wela-plus-battery-prd-2026.md).

## 9. National-scale readiness

The dated strategic assessment remains
[`national-scale-readiness-250k-users-2026-07-15.md`](./national-scale-readiness-250k-users-2026-07-15.md).
Its open operational work is tracked here:

- [ ] Define SLOs, RTO/RPO, retention, partitioning, and data-lifecycle policy.
- [ ] Configure custom SMTP and complete a PITR restore drill.
- [ ] Create an environment/capacity inventory, pilot dashboard, staged-rollout plan, incident
  runbook, and Supabase launch-notice checklist.
- [ ] Run realistic RLS/load/storm tests and measure writes, pulls, Auth, Realtime, storage, and
  recovery under staged concurrency. Model the harness on Zazi's local pull-herd stack: Postgres,
  pgbouncer, and PostgREST in containers, a synthetic EA dataset, and HTTP replay of real pull
  traffic. Build it after Masi's delta design lands. Treat absolute numbers as noisy; Zazi saw 57–116 s
  p95 on repeats of one configuration.
- [ ] Adopt a versioned server-function convention: never change a deployed RPC in place; add `_vN`
  and keep the previous version for rollback. Each apply carries a post-apply verifier and a
  `pg_get_functiondef` md5 record ([Z17](./zazi-sync-lessons-for-masi-2026-10-08.md)).
- [ ] Separate national reporting/analytics workloads from the mobile transactional write path.
- [ ] Complete penetration testing, POPIA/privacy review, data-processing agreements, breach
  response, and government security evidence.
- [ ] Establish on-call, support, escalation, and incident-command ownership before national scale.
- [ ] Plan primary-capacity, read-replica, regional latency, and failure-domain upgrades from
  measured pilot data.

## 10. Hygiene

- [ ] Remove or justify dead runtime dependencies: `react-hook-form` and
  `expo-linear-gradient`.
- [ ] Remove deprecated `@testing-library/jest-native`; move `jest-expo` to `devDependencies`.
- [ ] Verify the Expo-compatible `react-native-get-random-values` version online before changing it.
- [ ] Add ESLint and Prettier configuration plus CI checks.
- [ ] Add a `test:coverage` script.
- [ ] Rename the nine `.plan5.test.js` suites when touched.

## Archived source map

The following dated files were archived on 2026-07-23 after their survivors were consolidated here:

- [`codebase-audit-2026-07-12.md`](./archive/codebase-audit-2026-07-12.md)
- [`improvements-2026-07.md`](./archive/improvements-2026-07.md)
- [`improvements-2026-07-roadmap.md`](./archive/improvements-2026-07-roadmap.md)
- [`sprint4-followups-2026-07-13.md`](./archive/sprint4-followups-2026-07-13.md)
- [`zazi-izandi-feature-port-roadmap.md`](./archive/zazi-izandi-feature-port-roadmap.md)

These files preserve rationale. They are not alternate backlogs.

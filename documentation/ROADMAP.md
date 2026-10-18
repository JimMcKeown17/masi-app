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
live soon. Use this window for root-cause schema, identity, authorization, sync, and operational
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
   idempotent, privacy-safe incidents need stable causal identity, a reader, an action, and exact
   backend/app/runtime/protocol provenance.
5. **P0: settle the upload contract and local-database ownership before the candidate build.**
   Put a deadline and release on every request in the shared queue, uploads included. Upload the
   assessment family all-or-nothing. Reject stale edits on records more than one writer can change.
   Make submit duplicate-proof. One database per EA is built (Plan 2; its sign-out UX is Plan 3).
   The newer-schema guard and minimum revocation tooling are built, and the revocation migration is
   applied to `masi-app-sqlite`; its device proof remains open (§0). Evidence:
   [`zazi-sync-lessons-for-masi-2026-10-08.md`](./zazi-sync-lessons-for-masi-2026-10-08.md) Part 2.
6. **P0: settle field-continuity contracts before the candidate build.** Make location fallback
   truthful, build the server-side ten-hour clock-out and verify the built Android backup exclusion
   on device (both decided by Jim on 2026-10-17), and complete the credential/PII and provisioning preflight.
   Unfinished-form loss is accepted for the pilot (Jim, 2026-10-17).
7. **P1: close reachable correctness gaps.** Fix session-attendee removal before saved-session
   editing ships and resolve the remaining auth-diagnostic ambiguity. The newer-schema fail-safe
   moved to item 5.
8. **P1: finish sync efficiency and fleet controls.** Membership-specific batching, delta pulls,
   randomized retry/reconnect scheduling, remote controls, and proven query-specific indexes.
9. **P2: settle Programme/group authority, then build group-centred sessions in contract order.**
   Access grants and identity,
   then RLS/sync, then UI and durable session drafts.
10. **P3: resume WelaPLUS deliberately.** Wire the unwired Question island on `main` without
   importing stale design or identity contracts.
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
  - **Ruling 11, field-release prerequisite owned by the upload-contract spec:** abort-on-sign-out
    can re-send an upload the server already accepted. Identical replay is proven harmless; the
    ordering of an uncertain older write against a newer one is not yet closed.
  - **Device gates:** D2–D7 on the build intended to ship
    ([actor lifecycle spec §9](../docs/superpowers/specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md);
    D7 is native close under load, iOS and Android) and D3's ten-hour half, which changes with
    the server-side clock-out. iOS D1, native discovery on both platforms and both sheets passed
    on builds 9 and 10 (2026-10-17, build log). The Android header fix ("BackMy Profile") is built; verify it on the next build.
    A new EAS build needs Jim's yes.
  - **Legacy export gap:** spec §4.5 says Profile → Export Database can export `masi.db`.
    Today's export covers only the signed-in EA's file. Plan 3 did not change export; Step 4's
    support tooling must close this gap.
  - **Deleting another EA's file is deferred past the pilot** (Jim, 2026-10-09): no unsent work and
    unused for 30 days. Revisit before Step 9 Widen, for privacy (EA A's roster stays on EA B's
    personal phone), against POPIA. Design:
    `docs/superpowers/specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md`.
- [ ] **Minimum revocation contract before pilot provisioning — built and applied to hosted; device
  proof open** (moved from §6 by the 2026-10-08 Codex review). **Decided by Jim 2026-10-17:
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
  used by Zazi; verify the hosted JWT lifetime before pilot use. Assignments and worked hours stay
  intact, and unsent work stays on the phone for upload after restoration and sign-in. This follows
  Zazi's `api/mobile/account_access.py` at `21cb880` and suspension-v1 card, with both server writes
  and the audit now atomic rather than separate external calls.

  **Done:** the disposable PostgreSQL harness passes 43/43 and runs in CI; the hosted schema was
  inspected; with Jim's explicit yes the migration was applied to `masi-app-sqlite` on 2026-10-18
  and read back (see the build log). **Remaining gate:** prove that a suspended, already-signed-in
  phone signs out at its next refresh, then restore and confirm retained work uploads. The national admin portal stays
  in §6 ([Z16](./zazi-sync-lessons-for-masi-2026-10-08.md)).

### Release and observability

- [x] Build iOS and Android preview binaries for app/runtime 1.3.0. Those July artifacts are
  historical evidence; source has moved and the post-hardening pilot will require a new build.
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
  Android 11 and lower. Device proof remains open after the next native build: uninstall/reinstall
  and Google restore / `adb shell bmgr` backup/restore on the A03s, plus a device-transfer check if
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

- [ ] Define a stable incident identity and preserve first/last-seen evidence without minting one
  record per sync cycle.
- [ ] Add a durable local incident queue and an authenticated idempotent server-acceptance path
  outside the serialized domain outbox.
- [ ] Carry privacy-safe actor, backend/project, app/runtime/build, protocol, capability/scope, and
  normalized-disposition provenance.
- [ ] Give every incident/support state a named reader, bounded diagnostic view, safe action, and
  retention rule. Sentry is telemetry, not the durable sync-state ledger.

Design rules from Zazi's field evidence ([Z12, Z13](./zazi-sync-lessons-for-masi-2026-10-08.md)):

- [ ] The incident key identifies the **causal condition**. A re-report of the same condition with
  a newer body (`last_seen_at`, observed build) is accepted as an update, never rejected as a key
  mismatch. Zazi's server rejected exactly this and needed schema v3 (`condition_key`,
  `report_generation`).
- [ ] A size-bounded payload with an explicit allowlist of fields per schema version (Zazi: 8 KB).
- [ ] Observed OTA provenance (update id, embedded-launch flag, release label), not only the app
  version and build number. Zazi found build numbers did not prove which OTA was running.
- [ ] Store a structured `error_class` and `error_code` on `sync_outbox` rows (today: `status` plus
  free-text `last_error`, `src/db/migrations.js:45-48`). Map each class (retryable, needs-parent,
  support-needed, terminal) to a named owner and procedure. Do this while the schema is still cheap
  to change.

The field-bug feedback loop, a pilot-sized version of Zazi's incident envelopes and `/bug-sync`
([B1–B6](./zazi-sync-lessons-for-masi-2026-10-08.md)):

Plan 3 supplies `mobile_support_incidents`, its reporting RPC and a capped local queue with backoff
and an actor fence. Step 4 extends that envelope; it does not add a second queue or table.

- [ ] Extend the incident RPC for the wider kinds: versioned field allowlists, payload hashes,
  per-actor daily limits and rules for updating a continuing condition. Keep the existing three
  kinds' episode dedupe; define the new key and update rules in Step 4's spec.
- [ ] Report only terminal, support-needed, or long-failing outbox rows, reconcile-breaker events,
  and persistent pull failure. Never report an ordinary retry: 62% of Zazi's active EAs raised a
  receipt within 10 days, mostly from upstream bugs.
- [ ] A Masi `/bug-sync` skill and an `MA-BUG` registry under `docs/bugs/`. The skill sweeps
  receipts, dedupes against the registry, and checks whether each record exists on the server
  before diagnosing. Its rules: receipts are leads, not proof; bind attribution to the receipt's
  actor id, never to a forwarded file.
- [ ] The support export carries outbox rows with their `error_class`/`error_code`, because Zazi's
  hardest bugs needed exports, not receipts. Keep `deviceName` out of every incident payload
  (`runtimeDiagnostics.js` collects it today).

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
- S1-S7: locked Home and five-slot navigation visual acceptance.

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
- [ ] Implement the assessment-specific current-year class predicate. **Settled 2026-09-21:** an EA
  with an active class assignment sees a child's assessments from the current academic year if
  the child was a member of that class at any point in the current academic year. After a mid-year
  move, the old-class EA and the new-class EA both see that year's assessments. Do not reuse every
  arm of `current_user_can_read_child`. See ADR-0005's 2026-09-21 follow-up.
- [ ] Verify and reuse the existing `ClassesContext`/SQLite `class_ea_assignments` hydration for
  assessment scope. Define one canonical SQLite-derived assessment-eligibility query, including
  inactive/revoked and current-year behavior; do not couple correctness to React context arrival
  order.
- [ ] Prove that a server class-assignment row flows through `ClassesContext` into SQLite, survives
  a fresh read, and is consumed by the canonical assessment-scope query; prove an inactive/revoked
  assignment does not grant current scope.
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
- [ ] **Server-stamped `updated_at` on insert for the assessment family, before its pull.** Only
  `sessions` and `session_attendees` are stamped `before insert or update` today
  (`20260925120000`). `assessments`, `assessment_items`, `letter_mastery`, and every other domain
  table set the time on update only, so an insert keeps the phone clock and can land behind
  another device's cursor ([Z1](./zazi-sync-lessons-for-masi-2026-10-08.md)). First audit client
  code that relies on the phone-sent value. Extend to any other table before it gets a delta.
- [ ] **Cheap page apply before the assessment pull copies the session shape.** Assessments carry
  up to 61 items. Batch the per-page existence and pending-local lookups, skip rows identical to
  the stored row, and reuse prepared statements. Keep one transaction per page together with its
  cursor. Zazi went from 300 s to 46 s on a Galaxy A03s this way ([Z2](./zazi-sync-lessons-for-masi-2026-10-08.md);
  CAP-004 plan Task 9 Step 4e).
- [ ] Add authenticated, Programme/current-year-class-scoped pull for `assessments` and
  `assessment_items`.
- [ ] **Upload the assessment family all-or-nothing ([U2](./zazi-sync-lessons-for-masi-2026-10-08.md)).**
  - **Codex round 2:** the bundle RPC must be the *exclusive* EA insertion boundary. Revoke direct
    INSERT on `assessments` and `assessment_items`.
  - Dispatch the family once, regardless of the 1,000-row ready limit, with no generic per-row
    fallback.
  - Acknowledge the whole family locally in one transaction.
  - Test missing members, pending child or grant evidence, malformed references, lost
    acknowledgements, and interrupted finalization.
  - Use one insert-or-ignore RPC for an assessment plus its items, with a member-set check, so the
    server never holds an assessment with only some of its answers. A partial one reads as a real
    low score.
  - Because of ADR-0007, no version heads or generations are needed.
  - Prove in the disposable PostgreSQL harness that:
    - a late item insert re-surfaces its parent for the history delta, if items can ever arrive
      separately;
    - insert-or-ignore retries converge.
  - Document server-owned change timestamps separately from local outbox timestamps in the contract
    map.
- [ ] **Enforce submitted-assessment immutability (ADR-0007) in the same slice.** Remove EA
  `UPDATE`/`DELETE` RLS on `assessments` and `assessment_items`, push this family as
  insert-or-ignore by `id`, and make `saveAssessment` refuse an already-saved assessment id, with
  real-SQLite and disposable-PostgreSQL tests. Keep the current answer id; do not rekey.
- [ ] **Letter mastery as current state (ADR-0005 2026-09-21 follow-up).** Re-key the stored EA
  confirmation to one current record per `(child, letter, language)`, recording the last writer.
  Narrow hosted read to the last writer plus current deliverers, and let current deliverers
  insert/update/soft-delete. Latest server write wins. Resolve the natural key inside the write
  transaction; Zazi's production crash ZZ-BUG-20260813-006 is the regression case to test. Then
  add the mastery pull. Change the mastery loader so "most recent letter assessment" means the
  child's most recent assessment the EA may read, not only the EA's own
  (`src/utils/masteryState.js` currently passes `userId` to both reads). Practice data is wiped
  after this slice, so the re-key needs no field-data migration.
- [ ] Use bounded keyset pagination with an `id` tie-breaker and request deadline for every parent
  and child page from the first implementation. Do not ship an unpaginated intermediate path.
- [ ] Persist each parent and its children transactionally through typed repositories, with parents
  applied before dependents.
- [ ] Preserve pending, failed, and terminal local work when server rows overlap.
- [ ] Define positive parent/child completeness evidence. Ordinary RLS-filtered, expired, errored,
  or truncated queries may not mark hydration complete and never authorize history deletion.
- [ ] Update `rls-sync-contract-map.md` with producer, authorization, ordering, identity, conflict,
  and reconcile rules.
- [ ] Cover first install, reinstall, second device, offline restart, pending-local collision, and
  parent-before-child ordering in real-SQLite tests.
- [ ] Add two-device physical gates proving device A history appears on device B.
- [x] Make sync status distinguish "all local writes uploaded" from "local history fully hydrated."
  Sessions done (CAP-004 History row); assessments follow with their slice.
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

Zazi parity: Zazi's letter tracker has the same per-EA identity and author-only correction, and
its mobile pulls fetch only the EA's own mastery and sessions. Converging Zazi on the same rule is
separate Zazi work (it has field users). Masi's per-child `children.reading_level` already matches
the current-state model better than Zazi's per-session carry-forward.

## 2. Correctness and safety

### Data and lifecycle

- [ ] **No-location release gates:** manual clock-in/out now save without location and carry the
  reason through SQLite and the upload payload (PR #65). `20261015120000_time_entry_location_optional.sql`
  is applied to the hosted backend (its status columns are present; the Plan 3 device pass read them
  on 2026-10-17). Before release, run the extended local upload-contract PostgreSQL harness and
  pass Android/iOS denial, services-off, indoor-timeout, stale-cache, offline, Settings return,
  double-tap, and successful-fix device scenarios. Controller owns hosted application and release.
- [ ] **Server-side ten-hour clock-out (decided by Jim 2026-10-17: the server closes it).** Today
  the close is device-owned and runs only while the app is active or when the open entry is next
  loaded. Build a scheduled server close for entries open more than ten hours, marked
  `auto_clocked_out`, fenced so a stale offline write from the phone cannot reopen the entry, and
  reconcile the phone's own close with the server's. Spec §7.1's "Stay clocked in" text and device
  gate D3 assume the phone-side close and must be updated with this change.
- [x] **Newer-schema fail-safe (before pilot; priority item 5):** refuses to open a file whose SQLite
  `user_version` exceeds the bundle's `CURRENT_SCHEMA_VERSION` and shows an update screen with
  Sign out instead of Retry. Discovery skips too-new foreign files ([F2](./zazi-sync-lessons-for-masi-2026-10-08.md)).
- [ ] **Assessment draft persistence:** force-quit currently loses an in-progress assessment.
  **Loss accepted for the pilot (Jim, 2026-10-17).** Address this later with the longer
  WelaPLUS/durable-draft lifecycle rather than a one-off 60-second EGRA patch.
- [x] **Session form draft persistence or explicit launch acceptance:** navigate-away or process
  death loses an unfinished submit-and-go session. **Accepted for the pilot (Jim, 2026-10-17).** The
  SQLite-backed draft/run lifecycle stays with the group-centred workstream. Do not add a second
  temporary draft mechanism or imply autosave before it exists.
- [ ] **Removed session attendees:** `sessionsRepository` does not delete
  `session_attendees` removed by a later save. No current screen edits submitted sessions, but this
  must be fixed and behavior-tested before edit UI ships.
- [ ] **Cross-school Head Office reassignment:** current reconcile can be RLS-denied and terminal.
  Design an authorized archive-and-insert RPC rather than weakening ordinary mobile RLS.
- [ ] **Manual sign-out diagnostics:** the auth runbook previously promised a reliable
  `manual-sign-out` clearing category, but the current manual path clears state directly and the
  later auth event may be recorded only as `signed-out`. Either restore reliable provenance or
  explicitly adopt the simpler diagnostic contract.
- [ ] **Offline cold start device recheck, then a real supabase-js start-up harness (issue #73).**
  The local-first cold start (build-log 2026-10-18) passes only in Jest. On the next preview build,
  prove on the Galaxy A03s: offline start with an expired token reaches Home within seconds; an
  online start loads profile, classes and children without Retry. Then build #73's harness, which
  runs the real auth-js lock and ticker so lost or late auth events fail in CI instead of on a phone.

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
- [ ] **When durable session drafts ship (§4), key them per group and refuse a second start;
  bound any session timer.** Zazi's single active-session key let a second group overwrite an
  unfinished session (ZZ-BUG-20260922-001), and its unbounded timer saved a 1,140-minute session
  (ZZ-BUG-20260924-001) ([Z18](./zazi-sync-lessons-for-masi-2026-10-08.md)).

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

**The contract below is a set of requirements for a design spec, not ready to implement.**
Round 2 showed that a naive version introduces new failures:

- Releasing a timed-out upload lets an older whole-row upsert commit after a newer acknowledged
  one. Codex's probe reopened a closed time entry on the server while the phone showed it synced.
- A `stale_base` comparison has no base to compare against today. Pushes return no server
  version, finalization writes phone time, and offline create→edit queues have no base.

The spec must define, together:

- uncertain-outcome recovery and same-record ordering (idempotent acknowledgements or
  equivalent server fencing for mutable writes, single-writer tables such as time entries
  included);
- the full version lifecycle (base captured per pending mutation, compared atomically,
  authoritative versions returned for single, batch, archive, and insert-or-ignore operations,
  successor bases advanced);
- the assessment bundle as the *exclusive* insertion boundary.

Zazi's per-record generations do address the single-writer reordering case, so the spec should
weigh them honestly rather than dismiss them.

Masi's upload path is close to the one Zazi's July audit overturned. Zazi's replacement, about
4,700 lines of client protocol, guards the wrong risk for Masi: its generations stop one install
overtaking itself, while Masi's exposure is several writers editing one record. Build this smaller
contract ([U1–U7](./zazi-sync-lessons-for-masi-2026-10-08.md)):

- [ ] **Bounded completion for every shared-queue request, uploads included (U1; Codex 2026-10-08,
  high). Prerequisite (round 2): uncertain-outcome recovery and same-record ordering must exist
  before a timed-out upload is released.**
  - Single and batch pushes enqueue with no deadline (`offlineSync.js:1014-1016, 1203-1205`), and
    the queue holds every successor behind an unresolved task. A hung push therefore:
    - leaves its rows `in_flight`;
    - blocks every later pull;
    - pins `activeSyncPromise`, so a manual retry joins the hung pass.
  - The queue itself must abort and release a task at its deadline. A caller-side race alone
    reports failure without freeing the queue.
  - A timeout is an *uncertain* outcome: retried, never counted toward the deterministic-error cap.
  - Test a hung upload, queue release, uncertain server acceptance, a late response after release,
    and a safe outbox retry.
- [ ] **Reject stale edits on records more than one writer can change (U3).** The client sends the
  server `updated_at` it last saw, and the server rejects a mismatch as `stale_base`, which the phone
  surfaces as needs-attention. Scope: children, assignments, and groups that Head Office or another
  EA can also edit. Never compare phone clocks. This depends on server-owned timestamps (§1).
- [ ] **Letter mastery: the most recently *made* correction wins (D1, decided by Jim
  2026-10-08; reconfirmed 2026-10-14).**
  - The server keeps whichever confirmation has the later correction time and treats a future
    correction time as its own `now()`.
  - This is a narrow, single-column guard, not the general `stale_base` mechanism.
  - Build it with the mastery re-key in §1. `CONTEXT.md` is updated.
- [x] **Duplicate-proof submit (U5).** Literacy session capture now mints one session id per form,
  reuses it on retry, and uses a synchronous ref lock to prevent double-tap saves; assessment
  submit already guards completion with a ref and reuses its record on retry. This closes the
  per-tap identity risk behind Zazi's 302 extra session copies (ZZ-BUG-20260819-021).
  LetterMasteryPanel's same-EA/programme double taps already converge through the repository's
  deterministic mastery id; its broader re-key remains separate.
- [x] Android cloud-backup and device-transfer exclusion is built with `android.allowBackup: false`
  and explicit data-extraction exclusions (U6). A restored database replayed already-accepted work
  in Zazi (ZZ-BUG-20260907-001); the
  [§0 backup item](#0-pre-live-ground-truth-observability-and-pilot-activation) retains the A03s
  restore and device-to-device transfer proof as an open gate.

Deferred: mutation ids and server receipts for edits (U4, only if U3 proves insufficient), an
environment circuit breaker, and strict acknowledgement inventories. Not adopted: per-install
generations, client streams, cutover and activation machinery (U7).

### Deliberate tripwires

- [ ] Extend `GRANT_SUBJECTS` before membership-mediated class/group access ships. It currently
  models only the direct child-assignment grant and can false-terminal writes whose only valid grant
  is a pending class or group relationship.
- [ ] Define collision-proof identity for `grouping_versions`, `groups.display_number`, and
  `child_group_memberships` before the group-centred slice.
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

- [ ] **Server-owned rollout and kill switch (Z8).**
  - A `private` table holds a per-account row and an "all" row. The RPC answers `rollout_disabled`
    when the caller sees no row, so a canary is one insert and a rollback is one delete, with no OTA.
  - The same table can carry the pull interval and a minimum client protocol. This closes the
    "remotely configurable pull intervals and a sync kill switch" item above.
  - Disabling a feature never deletes a phone's cursor. The presence of a cursor does not mean the
    feature is enabled.
  - Run a rollback drill before the first cohort.
  - **Scope it explicitly (Codex 2026-10-08):** an RPC-level gate stops only RPC pulls. Masi's
    roster pulls and uploads are direct table calls, so the client must read the switch before
    each sync pass, and the switch's behaviour on a read failure must be defined.
- [ ] **Jitter covers cold opens, not only warm caches (Z7).** Use one shared 0–3 minute
  admission window per cold open or offline-to-online transition. Empty-cache bootstrap and
  explicit refresh bypass it.
- [ ] **Any user-visible "stuck" limit measures lack of progress, never elapsed time (Z5).** Use a
  no-progress timer, with Retry/Sign out shown only after a no-progress interval. Pair it with a
  visible "still downloading" state, so an empty screen is never read as "no data". A run budget
  that resumes from its cursor, as CAP-004's does, is not a failure claim and stays as is.
- [ ] **Pull-trigger budget tests (Z4).** Pin every caller that may start a pull, with its frequency:
  launch, per save, per foreground, per gesture. Per-save and per-foreground callers must request
  the narrowest domains. Zazi shipped a save that triggered a full re-download, and Start took
  22.8 s.
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

1. access grants and whole-class visibility;
2. identity and lifecycle contracts;
3. local schema, Supabase schema, RLS, payloads, ordering, and reconcile;
4. group cards and Group Detail;
5. group-first capture and durable session drafts;
6. device and two-device proof.

Additional Head Office behavior retained from the Sprint 4 follow-up:

- [ ] Model a school pause by Programme and academic year. Schools are not hard-deleted or globally
  "closed."
- [ ] Add ignore metadata for captured records that Head Office wants excluded without erasing
  history, and apply it consistently to reporting, mastery, and statistics.
- [ ] Give the EA a comprehensible history/surface for what Head Office changed.

## 5. Product and UX

- [ ] Session completion should return to the Home payoff state instead of a bare `goBack()`.
- [ ] Add a `deviceTier`/reduced-motion contract before celebratory animation work.
- [ ] Roll typography tokens out or retire the incomplete token system. Current tree: two importers
  and 97 raw `fontSize:` declarations. Add a fail-closed floor/allowed-scale guard if rolling out.
- [ ] Replace the 14 screen-local Snackbar hosts with `SnackbarContext` and one root host.
- [ ] Add class/group context to assessment child rows.
- [ ] Decide how Session History names attendees: full list, truncated `"Amahle +3"`, or count only.
- [ ] Remove the cosmetic selected checkmark from the "No class" picker row, or give the row a
  real selectable meaning.
- [ ] Add an explicit manual retry state for failed school/class reference-data loading.
- [ ] Decide the fate of `session_type_id` and `activities.__legacySession`: promote a real synced
  contract or remove the machinery.
- [ ] Push notifications and a durable message inbox remain unbuilt.

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
tooling (applied to hosted 2026-10-18; device proof pending, §0). `scripts/loadTestUsers.js` is deliberately disabled. The archived
[`seed plan`](./archive/seed_data_plan.md) and
[`bulk-import plan`](./archive/bulk_import_children_plan.md) are schema-dead and must not be revived.

## 7. Assessment content and additional forms

- [ ] **Finalize and build the Numeracy and 1000 Stories session forms** (Jim, 2026-09-23: a
  deliberate push in parallel with the history work, not a pilot gate). Only Literacy exists. The
  first pilot stays Literacy-only. Jim supplies the form requirements; the earlier numeracy
  comparison draft was lost with its temporary folder and must be redone.
- [ ] Yebo (Yeboneer) session form: deferred by Jim on 2026-09-23. Zazi iZandi sessions belong to
  the separate Zazi app, not Masi.
- [ ] Replace placeholder EGRA word lists with authoritative English and isiXhosa content.
- [ ] Configure Word Reading score bands. Until then the Words ranking remains neutral.
- [ ] Keep score thresholds explicit in `assessment-score-bands-config.md` and runtime code until a
  tested synced-table configuration path exists.

## 8. WelaPLUS

The 11 Question components and their tests are on `main` under `src/assessment-questions/`
(merged 2026-10-09 from `feature/wela-plus-battery-merge`). The package is unwired: nothing in
`src/` or `App.js` imports it. `npm run test:types` type-checks it in CI. A literal-UUID
contract test pins current `assessmentItemDomainId` output. **No identity change is planned**
(ADR-0007 keeps the id; Q11 HQ calibration rows use positions 5–8, so they never collide with the
EA's 1–4). Release 1 scope and decisions:
[`2026-10-14-welaplus-release-1-design.md`](../docs/superpowers/specs/2026-10-14-welaplus-release-1-design.md).

### Integration and contract work

- [ ] Review the island against current design tokens, shared capture chrome, BottomSheet behavior,
  SQLite repositories, and outbox ownership.
- [ ] WelaPLUS Release 1 depends on ADR-0007 enforcement (the assessment-history item above). If
  that has not landed first, Release 1 lands it (spec §7.1).
- [ ] Host-side Masi design conformance for the WelaPLUS screens (Plan 3). The package itself
  now has Masi-aligned tokens and a raw-hex guard (Plan 1, 2026-10-14).
- [ ] Plan 2 (data foundation) and Plan 3 (host Run flow, docs, printout pack). Plan 1 (Question
  package: 2024.1 EN/XH content, battery and evaluator, component contract) is complete; see
  [`2026-10-14-welaplus-plan-1-question-package.md`](../docs/superpowers/plans/2026-10-14-welaplus-plan-1-question-package.md).
- [ ] Build the remaining local/server schema and contract: `battery_runs`,
  `battery_run_artifacts`, additive `assessments`/`programmes` fields, local photo queue, Storage
  bucket/RLS, allowlists, ordering, reference data, and EGRA backfill.
- [ ] Build host integration: Run create/resume/finalize/results, Question sequencing, skip reasons,
  prerequisite gates, per-Question atomic persistence, photo capture/upload, Settings, and support
  export.
- [ ] Decide the package boundary, publish/extract the OSS package, and add README, example, setup
  guide, integration prompt, versioning, and licensing ratification.

### Pedagogy and field validation

- [ ] Supply authoritative bilingual item sets, story scripts/answers, stop-rule copy, Q6/Q8
  durations, prerequisite thresholds, Q5 assets, Q11 picture/rubric anchors, and score bands.
- [ ] Build the HQ rubric/calibration path and dashboard consumption.
- [ ] Validate the first 50 Runs, including offline/restart, photo, RLS, sync, and low-end Android
  gates.

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

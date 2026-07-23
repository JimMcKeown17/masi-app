# Open Work — The Live Backlog

**Standing doc. This is the single answer to "what is still outstanding?"**

Created 2026-07-13 during a documentation audit that found open work scattered across nine separate
documents, several of which were about to be archived as "done". Every item below is **verified against
the code on `main`**, not taken on a document's word.

## How this file relates to the others

| Question | File |
|---|---|
| What was built, when, and did it pass? | `build-log.md` (Verification Register) |
| **What is still open?** | **this file** |
| What is the RLS/sync contract? | `rls-sync-contract-map.md` |
| What must Jim check on a device? | `device-gates-sqlite-backend-2026-07.md` |
| What unresolved *product* decisions exist? | `open-decisions-backlog.md` |

`codebase-audit-2026-07-12.md` and `improvements-2026-07.md` are **dated evidence** that fed this
list. They are historical records — do not rewrite them; add new findings here instead.

> **Note on PRD.md:** it is not a progress ledger. Its Development Progress section is missing the
> entire June 2026 Top-10 tranche, the GPS/logger hardening, collision proofing, the render-perf pack,
> and the sync-status trust UX — all merged. Do not infer "not built" from "absent in the PRD".

---

## Priority order as of 2026-07-21

This is the execution order, not a second backlog. The numbered sections below remain the detailed source.

1. **P0, validate what is already built:** execute the highest-signal physical-device gates (§0), beginning with G1, H3, I1, B1, and the new reading-level gate C6. This is the highest risk-reduction per hour because four completed sprints still have zero real-hardware passes.
2. **P0, activation and device proof:** build the app/runtime 1.3.0 preview binaries, confirm Sentry source-map upload, and run the zero-class and observability device gates (§2/14a, §3). The public Sentry variables and sensitive source-map token are configured in both EAS environments. The class -> children onboarding, durable restart recovery, privacy-hardened crash capture, and explicit sync-failure reporting are built and automated-green; real-device behavior and live release-event delivery remain unverified.
3. **Closed 2026-07-21, structural data safety:** the two pending canonical migrations are deployed to `segygjzpujphwvrubusm`, remote migration history matches local history, and the live RLS/reconcile probe passes all five assertions. Record-scoped dependency skipping, bounded failed-batch fallback, and the versioned startup repair registry were built 2026-07-14.
4. **P2, sync efficiency and recovery:** finish membership-specific batching and design delta-pull indexes with the actual future predicates (§1, §2, §3). SQLite bootstrap recovery, child/programme-enrollment upserts, immutable assignment inserts, domain-pull queue monopolies, outbox `created_at` stability, redundant enqueue writes, batch claim rereads, and the three nullable session-relationship indexes were closed 2026-07-14. Class and group memberships still require their own collision-safe operation designs.
5. **P2, time-sensitive only when WelaPLUS resumes:** deliberately re-key `assessmentItemDomainId` before real SQLite-backend assessment data exists, but only as a standalone reviewed change (§7). Do not pull it forward merely because the current staging database is disposable.
6. **P3, group-centred session model:** settle `GRANT_SUBJECTS`, group identity/collision rules, session `group_id` authorization, and then rebuild the group/session workflow in dependency order (§4, §6). The group's latest literacy-session letters belong in that workflow, not in the current child-first form.
7. **P4, latent correctness and polish:** fix attendee removal before any saved-session edit UI ships; then shared snackbars, picker clears, typography rollout, search/filter gaps, dependency cleanup, and diagnostics (§2, §3). The attendee bug is real at repository level, but no current screen edits a saved session, so it is not the highest-ROI immediate build.

**2026-07-22 addendum:** §0c records three defects from the first blank-onboarding smoke test. The
pull-convergence fix (§0c.1) and school-picker fix (§0c.2) are built and automated-green; the picker
was also device-verified. The remaining work from that smoke test is the bottom-sheet flushness check
in device gate J6.

The real-data seed/import work is deliberately **not in the active execution order**. Jim deferred it
on 2026-07-14 because the source of truth is an existing Airtable/Postgres system whose table shape,
identifiers, relationships, and data-quality rules have not yet been mapped into this repo. When it is
resumed, the first step is read-only source-model discovery with Jim, not an assumed CSV/JSON contract.

## 0. Blockers before any field build

> **Go-live target: 1-2 weeks from 2026-07-14 (Jim).** That turns everything below from "sometime"
> into a deadline, and it **closes the window on the `assessmentItemDomainId` rekey** (§7), which must
> land while `masi-app-sqlite` still has no field users.

- [x] **`letter_mastery` deterministic ids — already clean** (verified 2026-07-14; 13/13 current-formula v5).
- [x] **Pre-fix ids in the four active-pair tables — fixed 2026-07-14.** 26 rows re-keyed in place (delete+reinsert inside one transaction, to get past the `prevent_assignment_identity_change` trigger). Test EA fixture preserved. 0 mismatches remain.
- [ ] Field devices must start from a **fresh install**, not an upgrade over an old local DB.

**Lesson from that fix, worth keeping:** the gate said to clean *"random-id"* rows. But all 7
`group_ea_assignments` rows had valid **v5 deterministic** ids from a **superseded formula**. Filtering
on "is the id random?" would have missed every one. With a deterministic-id scheme the derivation is
part of the data contract; the only sound test is *"does the stored id equal what today's code would
compute for this row's logical key?"*

**Still owed: 61 device gates in `device-gates-sqlite-backend-2026-07.md`, 0 executed.**
Sprints 1-4B are merged but *unverified on real hardware*. Highest-signal: G1 (force-quit + airplane
mode; a head-office removal must stay gone), H3 (outbox ownership across an EA handover), I1 (low-end
Android roster scroll), B1 (indoor GPS 10s timeout).

---

## 0b. Deferred Head Office import, not a universal onboarding precondition

**Decision (Jim, 2026-07-14): roughly half of EAs will receive class, child, and group data from Head
Office; roughly half must create it locally through guided onboarding. The import path is deferred
until Jim explains the existing Airtable/Postgres source model. Do not invent a source shape.**

The import script does not exist. Both historical plans
(`seed_data_plan.md`, `bulk_import_children_plan.md`) are **schema-dead** — they target
`staff_children` / `children_groups` / `children.class` text columns, none of which exist.

### ⚠️ The requirement that will silently destroy go-live if missed

**The seed script MUST derive row ids with the app's own deterministic-id functions.** Not random
UUIDs. This is not a style preference; it is a correctness contract, and it is already mandated by
`rls-sync-contract-map.md:32`: *"Every writer (device **or the future head-office seed**) that means
the same active pair derives the same id."*

Four tables have a **partial unique index whose columns are exactly the deterministic-id derivation**:

| Table | Partial unique index | Must use |
|---|---|---|
| `child_ea_assignments` | `(user_id, child_id)` where `unassigned_at is null` | `childEaAssignmentDomainId({ userId, childId })` |
| `child_programme_enrollments` | `(child_id, programme_id)` where `ended_at is null` | `childProgrammeEnrollmentDomainId({ childId, programmeId })` |
| `class_ea_assignments` | `(class_id, ea_user_id, programme_id)` where `unassigned_at is null` | `classEaAssignmentDomainId({ classId, eaUserId, programmeId })` |
| `group_ea_assignments` | `(group_id)` where `unassigned_at is null` | `groupEaAssignmentDomainId({ groupId })` |

**If the seed writes these with random UUIDs**, then when a field device later means the same logical
pair it computes deterministic id `D`, upserts `onConflict: 'id'`, finds no id match, attempts an
INSERT, and violates the partial unique index → `23505`. The server already holds that pair under a
different id. **The device can never push it. The row is stuck permanently — on a live field device,
with real children's data, and with no ability to wipe.**

This is exactly the defect that was cleaned off staging on 2026-07-14 (26 rows), reintroduced at
production scale at the worst possible moment.

**The fix is structural, not vigilance:** the seed script lives in this repo and must
`import { childEaAssignmentDomainId, ... } from '../src/db/repositories/domainRepositoryUtils'`.
One implementation, three writers (app, sync engine, seed), no possible drift.

**Verification gate before any Head Office import reaches field users:** re-run the id diff (recompute
`uuid_generate_v5` in SQL, compare to the stored id) against the imported database. It must return
**0 mismatches** on all four tables plus `letter_mastery`. The exact query is in the 2026-07-14
build-log row.

### Other seed-script requirements

**Deferred by Jim, 2026-07-14.** The programme has run in a separate Airtable/Postgres system to date.
Do not design a seed manifest or importer until Jim has explained that source model and the relevant
tables/data have been inspected read-only. The target-schema rules below remain valid constraints, but
they are not a source-to-target mapping.

- **It is the same thing as the bulk import.** `bulk_import_children_plan.md`'s purpose ("import real class lists — children + group assignments — from spreadsheets") *is* the go-live seed. **Do not build two scripts.** Build one, idempotent, re-runnable.
- **Already exists, reuse:** `scripts/seedSchools.js` (325 schools from CSV). For the limited pilot, `scripts/createTesters.js` safely provisions only explicit `zero_class` testers on `segygjzpujphwvrubusm`: Auth user, normalized `public.users` profile, and matching active `staff_programme_assignments`. It requires per-user passwords, exact project/URL identity, dry-run support, and never prints credentials. The obsolete generic-env `scripts/loadTestUsers.js` is disabled. Seeded rosters still belong to the canonical Head Office importer below. Reference data (`job_titles`, `programmes`, `assessment_tools`, `academic_years`, `assessment_windows`, `schools`) is seeded by migration.
- **Still to seed:** `teachers`, `classes`, `children`, `child_class_memberships`, `staff_programme_assignments`, `groups`, `child_group_memberships`, plus the four deterministic-id assignment tables above.
- **`child_class_memberships` does NOT use deterministic ids** (it recurs on class moves and needs distinct archived rows for audit). It uses reconcile-before-upsert. Random ids are correct there — see contract map §"Active-Pair Collision-Proofing".
- **Check `child_group_memberships`:** it has a partial unique index on `(child_id, grouping_version_id)` where `removed_at is null`, but no deterministic-id function and no documented reconcile path. Confirm how an imported membership and a device-created membership avoid colliding before importing any source data.

---

## 0c. Found 2026-07-22 during the first blank-onboarding smoke test (Expo Go, iOS)

Three defects observed by Jim on a real device. Status as of later that day: §0c.1 and §0c.2 fixed,
with §0c.2 device-verified; §0c.3 root-caused, residual check moved to device gate J6.

### 1. ~~P1 — Pull persistence cannot converge when a server row's id changes under an unchanged active pair~~ **FIXED 2026-07-22 (branch `fix/pull-supersede`)**

**Resolution:** `supersedeStaleActivePairRow` in the four deterministic-id save paths ends a
same-pair different-id local ACTIVE `synced` row before the upsert (skipping the incoming row when
the local row is pending/failed/terminal). One pull now converges the re-key scenario; twelve
real-SQLite tests in `pullReconcile.integration.test.js` reproduce the exact device wedge RED and
prove convergence, idempotency, and every rail. Contract recorded in `rls-sync-contract-map.md`
("Stale active-pair supersede"). Deterministic ids remain the primary contract; §0b's seed
requirement is unchanged. Original record below.

**Symptom:** signing into `test@masinyusane.org` on a dev device whose local DB predates 2026-07-14
produced 26 LogBox errors on every pull, forever: `Error code 19: UNIQUE constraint failed` on the four
active-pair partial unique indexes (`class_ea_assignments`, `child_ea_assignments`,
`child_programme_enrollments`, `group_ea_assignments`).

**Root cause (verified in code):** pulled rows are upserted `on conflict(id) do update`
(`domainRepositoryUtils.js:183`); reconcile runs *after* all row saves inside the batch transaction
(`repositoryRuntime.js:77-98`); and the per-row fallback retries explicitly *without* reconcile
(`repositoryRuntime.js:104-121`). So when the server holds the same active pair under a different id
than the device, the insert violates the partial unique index before anything can end the stale local
row, the whole batch rolls back, and every later pull repeats identically. The pull can never converge.

**Trigger:** the 2026-07-14 staging re-key (§0, "26 rows re-keyed in place") changed ids under active
pairs the device had already pulled. This is the **pull-side mirror of §0b's push-side warning** ("the
row is stuck permanently"): any id/natural-key disagreement — a superseded deterministic-id formula
(see the §0 lesson and §7's `assessmentItemDomainId` BLOCKER), a wrong-id seed, or a future re-key —
wedges sync, in both directions.

**Server verified healthy** (2026-07-22, read-only psql): zero duplicate active pairs in all four tables.

**Implemented direction (Jim, 2026-07-22):** natural-key supersede in the pull save path respects the
existing rails: when persisting an *active* server row, first end any *active* local row holding the
same natural key under a different id **iff** that local row is `sync_status='synced'`; if it is
pending/failed/terminal, skip the incoming row instead (same posture as
`serverPullWouldClobberPendingLocal`). Real-SQLite integration coverage and the
`rls-sync-contract-map.md` pull contract shipped in branch `fix/pull-supersede`.

**Why the pilot is safe day-one:** fresh installs + blank accounts cannot hit this (§0 already mandates
fresh installs). Fix before field data accumulates, and certainly before any future server-side re-key
or the Head Office importer.

### 2. ~~P2 — School picker unusable with the real 325-school list~~ **FIXED 2026-07-22, device-verified**

Blank onboarding → Create Class → School showed a dimmed screen with no visible sheet content, ever.
Backend was verified healthy the same morning (325 active schools; `schools_read` RLS for
`authenticated`; plain `select * order by name` fetch).

**Root cause (established by simulator bisection with fresh-launch trials and `measureInWindow`):**
not the picker, the list size, the search input, or the keyboard handling — four hypotheses each
disproven experimentally. React Native's transparent `<Modal>` positions its content off-screen under
the new architecture in Expo Go on iOS 26: the sheet panel laid out correctly (402x699) but measured a
full window-height above the viewport (y = -844/-1001) regardless of content, animation type, or
KeyboardAvoidingView state, and absolute `bottom: 0` anchoring failed identically inside a Portal.

**Fix (branch `fix/school-picker-search-preload`):** `BottomSheet` now renders through
react-native-paper's `Portal` (hosted by the root `PaperProvider`) instead of RN `Modal`, pins the
sheet with flexbox `justifyContent: 'flex-end'` instead of absolute bottom anchoring, and dismisses on
Android hardware back via a `BackHandler` subscription (replacing Modal `onRequestClose`). Alongside
it, `SelectSheet` was virtualized (`FlatList`, no eager mounting), the school pickers gained
case-insensitive search, and Create Class preloads the signed-in EA's school from the profile
(override still allowed). Jim verified on device: school list renders, class created. Every sheet in
the app inherits the Portal fix since all go through `BottomSheet`.

### 3. P4 — BottomSheet panel not flush with the screen bottom → **device gate J6**

Same underlying pathology family as §0c.2: the modal/host container mis-sizing under Expo Go's
new-architecture runtime (one captured frame showed the modal backdrop stopping ~91pt above the
screen bottom with the tab bar exposed). After the Portal fix the sheet renders and is usable, but
Jim reports residual imperfect flushness in Expo Go. Deliberately parked: verify on the real preview
build (gate J6 in `device-gates-sqlite-backend-2026-07.md`) before spending more time on what is
likely an Expo Go-only artifact.

---

## 1. Still open from the 2026-07-12 audit

Nineteen of the 21 findings are closed (see the build log). These two are not:

| # | Finding | Sev | Evidence on `main` |
|---|---------|-----|--------------------|
| 21 | No OTA-rollback schema guard | P3 | `src/db/migrations.js:606` defines `CURRENT_SCHEMA_VERSION` but nothing fails safe when `user_version` exceeds it. Latent while migrations stay additive. |
| 11 | Force-quit loses the in-progress assessment | P2 | Open **by design** — deferred until WelaPLUS capture work, where the loss window grows from one 60s EGRA run to a long untimed Question. |

**Closed 2026-07-14:** finding 13. `DatabaseBootstrapGate` now opens and migrates SQLite before any app provider mounts. A failed bootstrap stays on a dedicated non-destructive recovery surface, reports `sqlite_bootstrap_failed` with attempt/error context, and offers a real clean retry backed by the client's existing half-open connection disposal. Error-log sharing uses the AsyncStorage logger and does not require SQLite; a failed share action leaves retry usable. No database wipe action is exposed.

**Closed 2026-07-14:** finding 17. Same-pass dependency gating now records the exact failed or skipped record, resolves each dependent's FK or archive subject from its payload and durable SQLite row, and skips only matching relationships. A failed Child A no longer blocks Child B's assignment, assessment, mastery, or membership work. Access-ending archive rows still wait for cleanup failures about the same child, class, or group, and unresolved mapping evidence falls back conservatively.

**Closed 2026-07-14:** finding 16. Batchable payloads are capped at 100 rows. If a batch fails, the engine spends at most 25 per-record diagnostic attempts across the entire pass, in waves of at most five concurrent requests. Any remaining rows are atomically returned to `pending` with no retry increment or failure label, exact dependents remain blocked for that pass, and `totalDeferred` plus Sentry/local sync context make the bounded deferral visible.

---

## 2. Dropped by the audit, still real (from `improvements-2026-07.md`)

**The 2026-07-12 audit is not a superset of the July review.** It re-verified the sync/perf/reliability
items and silently dropped every product, design-system, and hygiene item. These are those items.

### 14a — Zero-class onboarding — **GO-LIVE BLOCKING**
**Built on the current branch; physical-device gates M1-M10 remain.** Class bootstrap distinguishes temporary loading,
cached/seeded data, a backend-confirmed zero, a zero that could not be confirmed because the backend
was unreachable, and a missing programme assignment. Home and My Children automatically enter the
onboarding screen only for the two settled zero states. An unconfirmed zero requires the EA to choose
"Create locally anyway" after a duplicate-data warning. Seeded EAs continue normally.

After class creation, the app requires at least one child, loops child creation, warns until the class
reaches 10 children, permits finishing from one child onward with confirmation, and ends after the
child step. The incomplete child step is user-scoped durable SQLite state committed atomically with
class creation, so Home and My Children resume it after a force-quit. Group creation is deferred from
this version. Automated verification: 178 unit suites / 1,074 tests, 30 SQLite integration suites /
261 tests, and an Android production export are green; physical gates M1-M10 are still open.

### 5 — Child Results workflow (Top-10 item 5)
The child-results work is complete. Its former capture-flow remainder now belongs to the group-centred session model:
- [x] **Child row opens Child Results, built 2026-07-14.** The entire roster row now opens the child's results in the Children-tab stack. The old redundant chart shortcut became an explicit pencil edit action, so editing remains discoverable without making it the primary meaning of tapping a child. The letter-tracker action is unchanged.
- [x] **Last-session-letters meaning settled 2026-07-14; implementation moved to §4.** Jim chose the group-based interpretation: show the assigned group's latest literacy-session letters when group-first capture is built. Do not add child-by-child latest-session summaries to the current form; selected children can have different histories, and that temporary model would contradict one session = one group-block.

### 5b — Reconciliation doc-drift (2026-07-14)
A full item-by-item reconciliation of the June Top-10 and the ZZ port against the code (2026-07-14) found `improvements-2026-07.md:6`'s summary line **overstates completion**: it lists items "1, 2, 3, 4, 8 and most of 5 are done", but verified against the tree, **item 2 was missing 2c** (closed 2026-07-14), **item 3 is missing its entire typography half** (item 15 below), and **item 5 was missing the row-tap flip** (closed 2026-07-14). Treat this file, not that summary line, as the backlog. The reconciliation confirmed every other spot-checked claim in this file holds against the code.

### Other product items
- **14b** — ring payoff navigation: `SessionCompleteScreen.js:46` is still a bare `navigation.goBack()`.
- **14c** — staged ring colours: mapping is hardcoded in `SessionsTodayRing.js`; the `ringNeutral` / `ringStart` tokens in `colors.js:78-79` have **zero importers** (dead tokens).
- **14d** — no `deviceTier` utility exists; needed before any animation work on low-end Android.
- **12** — session-type machinery undecided: the `__legacySession` envelope and `sessionTypeResolver.js` are still live, and `session_type_id` **never reaches the server**. Decide: promote it to a real column, or delete the machinery.

### Sync items the audit missed
- [x] **11c, closed 2026-07-14** — domain pulls no longer monopolize the concurrency-1 Supabase queue. `preloadedChildData` gives the acknowledgment RPC and every dependent child/group query its own lease; `ClassesContext` does the same for acknowledgment, Programme, and class requests. Dependency order remains serial, but a waiting auth/profile/push operation can run between responses instead of waiting for the whole roster workflow.
- [x] **11d, closed 2026-07-14** — outbox queue age and batch-claim efficiency. Re-enqueue now refreshes payload, owner, status, and retry metadata without changing the logical operation's original `created_at`, so repeated edits cannot move old work behind newer work. The redundant second enqueue UPDATE is gone. Batch claim now uses one set-based UPDATE and one SELECT, returns fresh CAS records in caller order, and replaces the prior per-row mark plus N `getById` reads.

### 15 — Typography rollout
`src/constants/typography.js` has **one** importer against **82** raw `fontSize:` declarations in
`src/`. No guard test. The token file exists and is essentially unused. (See `design-system.md`.)

### 16 — Hygiene
- Dead dependencies still shipped: `react-hook-form`, `expo-linear-gradient` (zero `src/` imports); `@testing-library/jest-native`; `jest-expo` sits in `dependencies` rather than `devDependencies`.
- `npx expo install --check` reports `react-native-get-random-values@2.0.0` while Expo SDK 54 expects `~1.11.0`. The check ran with networking disabled and used Expo's local bundled-native-module map, so confirm online before changing this existing native dependency.
- **No ESLint/Prettier config at all.**
- ~~`AssessmentChildSelectScreen.js` uses raw `home_language.toLowerCase()` instead of `normalizeLanguageKey`.~~ **Fixed 2026-07-22** (pilot polish pack).
- ~~`ProfileScreen` reports "Current password is incorrect" for *any* sign-in error, including a network failure. Both exports share one `exportLoading` flag.~~ **Fixed 2026-07-22**: credential message requires explicit credential evidence; exports have independent flags.
- ~~`HomeScreen.loadStats` has no `try/catch`.~~ **Fixed 2026-07-22**: try/catch/finally, loading indicator, stats keep prior values on failure.
- **`sessionsRepository` has no `delete from session_attendees`** — editing a session to *remove* an attendee leaves the row. A live data-integrity landmine.
- No `test:coverage` script; 9 `.plan5.test.js` suites still named after a retired plan.

---

## 3. Rescued from documents archived on 2026-07-13

These were the *only* record of the item. Their source docs are now in `documentation/archive/`.

- [ ] **Activate and verify Sentry Cloud.** The `masinyusane/react-native` Sentry project exists. Public DSN/environment/organization/project values are configured in EAS preview and production, and `SENTRY_AUTH_TOKEN` is present in both with sensitive visibility. The app includes `@sentry/react-native`, native/JavaScript crash and hang capture, source-map configuration, safe Profile verification, runtime/build/device/Expo Update/backend/SQLite context, and explicit non-crashing sync issue reporting. The initial field-release configuration disables Session Replay, screenshots, view hierarchy, default PII, email identity, and automatic cloud forwarding of local console logs. Remaining external work: build both platforms, verify source-map upload, privacy, symbolication, and structured sync reporting, connect alert rules, and pass device gates N1, N2, N4, N6, and N7. *(Original gap from the 2026-04-24 field-reliability review.)*
- **Push notifications + message inbox** — no `expo-notifications`, no `NotificationsContext`. *(from the June Top-10, item 10 — its only spec)*
- **`SnackbarContext` / `RootSnackbarHost` never ported** — **14 screens** still render their own `<Snackbar>`. *(from the June Top-10, item 9b; dropped entirely from the July review)*
- [x] **Version-gated startup repair hook, built 2026-07-14.** `startupRepairs.js` owns a strictly increasing recipe registry and the durable `startup_repair_version` marker. Every recipe must be narrowly scoped and idempotent. It commits before its marker, so a kill can cause safe replay but cannot record unfinished repair. `OfflineContext` gives every sync entry point one shared repair promise; failures are reported, do not brick startup, leave the marker unchanged, and retry on the next launch. Repair version 1 owns the group-ownership cutover heal. Future sync fixes must add a new proven recipe and bump the registry version, never broadly resurrect all terminal rows.
- **Upsert batching is still incomplete, but the child-creation and immutable-assignment slices closed 2026-07-14** - bounded batching now covers `children`, `child_programme_enrollments`, and insert operations for `child_ea_assignments`, `class_ea_assignments`, and `group_ea_assignments`, in addition to `assessment_items`, `letter_mastery`, `session_attendees`, and `time_entries`. Assignment inserts preserve deterministic-id normalization and `ignoreDuplicates: true`; assignment lifecycle updates remain per-record and update-capable. Class memberships retain reconcile-before-upsert and group memberships still need a collision contract, so those two tables remain deliberately per-record. *(ZZ review)*
- [x] **Nullable session relationship indexes, built 2026-07-14; deployed 2026-07-21.** SQLite migration v9 and canonical Supabase migration `20260714233000_sync_relationship_indexes.sql` add sparse indexes for `sessions.class_id`, `sessions.group_id`, and `session_attendees.group_id`; real-SQLite query plans select all three. The migration is applied to `segygjzpujphwvrubusm`, remote history matches local history, and the post-deploy dry run reports the database is up to date.
- **Delta-pull indexes require the delta-pull query design.** No current pull filters on `updated_at`. Do not add a standalone timestamp index to every synced table merely to close an audit line: that taxes every write and may be the wrong shape when the real predicate needs `(owner_scope, updated_at)`. Add and prove the table-specific indexes in the same slice that implements delta pulls. *(refined from ZZ review)*
- [x] **Time-box `repairGroupOwnershipForSync()`, completed 2026-07-14.** The function remains as idempotent repair version 1 for upgraded tester databases, but it is no longer called by every sync preflight. Once marker version 1 is durable, healthy launches and sync passes pay no repeated scan/write cost.
- **Unanswered product question: pull-to-refresh now force-pushes.** My Children pull-to-refresh triggers a *push*, not just a reload. Jim never chose between force-push and reload-only. *(from the sync-reliability build log)*
- **Four UX gaps** *(from the 2026-03-25 children/classes/groups review)*:
  - ~~`ChildrenListScreen` destructures `loading` / `classesLoading` and **never uses them**; `ClassDetailScreen` renders "Class not found." with no loading check. Empty states flash during load.~~ **Fixed 2026-07-22** (pilot polish pack).
  - ~~`EditChildScreen` has no explicit "No class" / clear option in the class picker.~~ **Fixed 2026-07-22**; cosmetic nit: the "No class" row is not check-marked when already unassigned.
  - Assessment child rows show name + last-assessed only — no class/group context.
- **`date_assessed` still stamps the device-local date** (found 2026-07-22 while reviewing the
  session-date alignment fix): assessment capture has the same latent out-of-SAST business-day
  mismatch that `session_date` had before `38eebf9`. Harmless for SA-based devices; align it with
  `toLocalDateString` attribution in a small follow-up before any out-of-country capture matters.
  - Session history shows an attendee **count**, not names. (Product question pending with Jim: full names vs truncated "Amahle +3" style.)

---

## 4. Unbuilt features with a written spec

- **Groups Workflow (§3) and Session Reliability (§4)** in `zazi-izandi-feature-port-roadmap.md` are **entirely unbuilt**, and that roadmap is their only spec. `sessions.group_id` and `sessions.state` exist as *forward-prep server columns only* — RLS pins them NULL/`completed` and the client never writes them. **Do not archive that roadmap.**
  - **Sharpened 2026-07-14:** `group_id` is not merely unwritten — the client *does* write it locally (`sessionsRepository.js:233`) and the server then **strips it to NULL** (`offlineSync.js:67`). So a reader checking only `migrations.js:561` would wrongly conclude group-context capture shipped; it is inert end-to-end. The consequence is concrete: the ZZ PRD's user story 15 (longitudinal per-group dosage research) is **not satisfied**, because which group a session belonged to is discarded on upload. This must be resolved as part of the group-centric rebuild — capturing group context on the home screen is pointless while the server drops it.
- **2026-cohort seed script** (`scripts/seed-2026-cohort.js`) — not built. The go-live PRD it belongs to treats seeded data as a *precondition* for the tranche it already shipped.
- **`seed_data_plan.md` and `bulk_import_children_plan.md`** — both still unbuilt **and both plans are schema-dead**: they target `staff_children` / `children_groups` / `children.class` text columns, none of which exist under the SQLite backend. The *need* is real (bulk import is the onboarding rate-limiter); the *plans* need rewriting, not executing.
- **Additional session forms** — Numeracy, ZZ Coach, Yeboneer (PRD Phase 5). Only Literacy exists.

> **Pilot provisioning boundary, 2026-07-21:** `scripts/createTesters.js` provisions guarded
> zero-class testers only (Auth user, normalized profile, and active Programme assignment).
> `scripts/loadTestUsers.js` is disabled because its generic backend selection, shared password,
> credential output, legacy columns, and missing Programme assignment are unsafe. Seeded staff and
> child rosters remain part of the deferred canonical Head Office importer.

---

## 5. Assessment / pedagogy blocked on content

- **Real EGRA word lists were never supplied.** `egraConstants.js` ships *"Placeholder word lists — replace with real EGRA word lists when available."*
- **`word_reading` score bands are unset**, so the Words tab on `AssessmentRankingScreen` degrades to neutral grey ("No benchmark"). Dropping rows into `assessment-score-bands-config.md` + `scoreBands.js` lights it up **with no code change**. Blocked on the word lists above.
- WelaPLUS Question bands, prerequisite-gate thresholds, Q5 picture assets, and Q11 rubric anchors are all pedagogy-TBD and off-team.

---

## 6. Contract-map deferrals (deliberate, but tripwired)

From `rls-sync-contract-map.md` — these are *documented* deferrals, listed here so they are not lost:

- **`GRANT_SUBJECTS` models only the direct child-assignment grant.** The two membership-mediated paths (class-EA via `child_class_memberships`, group-EA via `child_group_memberships`) are unmodelled, so a child write whose only grant is a pending class/group assignment would **false-terminal**. Unreachable today — **but must be extended before group-centric (whole-class) access ships**, which is the next roadmap item. This is a live tripwire.
- **Cross-school head-office reassignment** reconcile is RLS-denied and lands terminal. Full fix needs a `SECURITY DEFINER` archive+insert RPC.
- [x] **Server-authoritative acknowledgment RPC, built 2026-07-14; deployed and live-probed 2026-07-21.** `get_reconcile_acknowledgments` derives the authenticated EA from `auth.uid()` inside a fixed-search-path `SECURITY DEFINER` function and returns the active Programme plus every reconciled relationship id set with a versioned completeness claim. `ChildrenContext` and `ClassesContext` use ordinary RLS queries only to hydrate content; only a validated RPC snapshot can authorize local relationship end-dates or a successful pull stamp. Missing, malformed, mismatched, and errored snapshots fail closed and are reported through observability. Migration `20260714220000_server_authoritative_reconcile_acknowledgments.sql` is applied to `segygjzpujphwvrubusm`; `npm run rls:probe` passed all four upsert-visibility rules plus the exact authenticated reconcile snapshot assertion.
- **`grouping_versions` / `groups.display_number`** collision-proofing not built; deferred to the grouping slice.
- **`auth_leaked_password_protection`** — decide before broader external rollout.

---

## 7. WelaPLUS — merge debt

The WelaPLUS Assessment Battery is **not on `main`**. All 11 Question components, batteries, itemsets
and 28 test files (5,236 lines of source) live on an unmerged worktree
(`.claude/worktrees/feature+wela-plus-battery`), branched 2026-05-29, now **310 commits behind main**.
It is an **unwired island** — nothing in `src/` or `App.js` imports it; it is reachable only from its
own tests.

A trial merge was run on 2026-07-13. **The merge is mechanically almost free** — one conflict
(`CLAUDE.md`, a pure doc conflict), and the full suite passes green on the merged tree
(201 suites / 1233 tests). *That is the problem.* Four things merge clean and are still wrong:

### 🔴 BLOCKER — do not merge `src/db/repositories/domainRepositoryUtils.js`

The worktree rewrites `assessmentItemDomainId` to include `itemKey` in the hash whenever `position`
is present. `main` hashes positioned rows on **position only** (`const key = position ?? itemKey`).

**This is not dead WelaPLUS code. It is live shipping code**, called from
`assessmentsRepository.js:217,226,240` (which passes `position: item.index` on **every** EGRA letter
item) and from the sync push path at `offlineSync.js:464`.

Merging it **silently rekeys every `assessment_items` row that has a position.** Local re-saves insert
new rows beside the old ones; the outbox then upserts by the new `id`, producing duplicate letter items
server-side and double-counted aggregations. It does not crash and it does not fail a build.

**Every guard is structurally blind to it.** `__tests__/offlineSync.stripping.test.js:136` asserts
`payload.id === assessmentItemDomainId(...)` — recomputing the expected value with the very function
under change. It asserts `f(x) == f(x)` and can never fail. The `syncErrorGuard` tests only assert
uniqueness, which the new shape also satisfies.

The change is arguably *correct* (it fixes a real Q11 `ea:`/`hq:` rubric-row collision). It must land
as **its own deliberate PR**, with a build-log decision entry, an `rls-sync-contract-map.md` update
(row identity *is* a sync contract), a staging `assessment_items` wipe, and a **non-tautological test
that asserts the literal expected UUID for a known input**. Do it while `masi-app-sqlite` still has no
field users — that window closes the day the SQLite build ships.

### Other merge-clean-but-wrong items

- **52 hardcoded hexes in a navy/green palette.** The 11 Question components import nothing from the app (by design of the boundary guard), so every colour is a literal: `#2e7d32` green (×10), `#1f3a5c` navy (×8), and others. **None** are in the approved red/warm-neutral set. `__tests__/colors.test.js` validates `Object.values(colors)` — it guards *the token file, not the codebase*, so these pass forever. The screens would render as a cool navy island in a warm red app. **The missing guard is a test that greps for raw hex literals outside `src/constants/`.**
- **Chrome duplication.** All 11 components hand-roll `StyleSheet.create`, and two hand-roll raw `<Modal animationType="slide">` bottom sheets — exactly what `src/components/common/BottomSheet.js` now provides. Main also owns `CaptureHeader`, `captureStyles`, `AssessmentInstructions`.
- **`test:release` gains a `tsc` gate that isn't installed** — the merged `package.json` adds `test:types`, but `typescript` is not in main's `node_modules`. Also drop the deprecated `@types/react-native`.

### The one piece of good news

The worktree touched **zero migrations**, so it has no migration-number collision with main. Main is
now at `CURRENT_SCHEMA_VERSION = 9`; any future WelaPLUS schema work must start at v10. The schema and
wiring (~55% of the PRD) remain to be built and are unaffected by the merge.

**Recommended:** restore `domainRepositoryUtils.js` from main on the branch, then merge (~1 hour). Land
the ID rekey separately (~half a day). Design-conformance pass + the hex-literal guard (~1-1.5 days).

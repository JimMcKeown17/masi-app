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

## 0. Blockers before any field build

Three deploy gates, mandated by both `device-gates-sqlite-backend-2026-07.md` and
`rls-sync-contract-map.md`. These are not optional.

- [ ] Clean legacy random-id `letter_mastery` rows on `masi-app-sqlite` — they will `23505`-collide with deterministic pushes.
- [ ] Clean pre-fix random-id rows in the four active-pair tables (`child_ea_assignments`, `child_programme_enrollments`, `class_ea_assignments`, `group_ea_assignments`).
- [ ] Field devices must start from a **fresh install**, not an upgrade over an old local DB.

**And: 46 device gates in `device-gates-sqlite-backend-2026-07.md` are unchecked — 0 of 46 executed.**
Sprints 1–4B are merged but *unverified on real hardware*. Highest-signal gates: G1 (force-quit +
airplane mode; a head-office removal must stay gone), H3 (outbox ownership across an EA handover),
I1 (low-end Android roster scroll), B1 (indoor GPS 10s timeout).

---

## 1. Still open from the 2026-07-12 audit

Sixteen of the 21 findings are closed (see the build log). These five are not:

| # | Finding | Sev | Evidence on `main` |
|---|---------|-----|--------------------|
| 13 | SQLite bootstrap failure has no recovery surface | P2 | No bootstrap gate; only the generic `ErrorBoundary` "Try Again" (`App.js:17`). Export Database itself needs a working DB. |
| 16 | A failed large batch fans out to up to 1,000 per-record attempts in one pass | P2 | `offlineSync.js:1234` loads `limit: 1000`; batch formation has no size ceiling; per-record fallback via `Promise.allSettled` (`:1059`). *(The `chunkArray(records, 200)` at `:798` bounds bookkeeping transactions — a different layer. Do not mistake it for this fix.)* |
| 17 | Dependency skipping is table-scoped, not record-scoped | P2 | `offlineSync.js:1178` builds a `failedTables` Set; `:1248` skips by table name. One bad child blocks assessments/mastery/memberships for *all* children. |
| 21 | No OTA-rollback schema guard | P3 | `src/db/migrations.js:606` defines `CURRENT_SCHEMA_VERSION` but nothing fails safe when `user_version` exceeds it. Latent while migrations stay additive. |
| 11 | Force-quit loses the in-progress assessment | P2 | Open **by design** — deferred until WelaPLUS capture work, where the loss window grows from one 60s EGRA run to a long untimed Question. |

---

## 2. Dropped by the audit, still real (from `improvements-2026-07.md`)

**The 2026-07-12 audit is not a superset of the July review.** It re-verified the sync/perf/reliability
items and silently dropped every product, design-system, and hygiene item. These are those items.

### 14a — Zero-class onboarding — **GO-LIVE BLOCKING**
A brand-new EA with no classes lands on a Home screen that shows nothing actionable.
`HomeScreen.js` has **zero** references to classes. The roadmap explicitly flags this as go-live
blocking, not polish.

### Other product items
- **14b** — ring payoff navigation: `SessionCompleteScreen.js:46` is still a bare `navigation.goBack()`.
- **14c** — staged ring colours: mapping is hardcoded in `SessionsTodayRing.js`; the `ringNeutral` / `ringStart` tokens in `colors.js:78-79` have **zero importers** (dead tokens).
- **14d** — no `deviceTier` utility exists; needed before any animation work on low-end Android.
- **12** — session-type machinery undecided: the `__legacySession` envelope and `sessionTypeResolver.js` are still live, and `session_type_id` **never reaches the server**. Decide: promote it to a real column, or delete the machinery.

### Sync items the audit missed
- **11c** — the domain pull monopolizes the concurrency-1 Supabase queue: `preloadedChildData.js` wraps its whole multi-query body in one `enqueueSupabaseRequest`.
- **11d** — `created_at` perturbation: the upsert update-clause includes every non-PK column, and `created_at` is the **outbox ordering key**. Plus a redundant second UPDATE in `syncOutboxRepository.js`, and `processBatch` re-reading rows one-by-one.

### 15 — Typography rollout
`src/constants/typography.js` has **one** importer against **82** raw `fontSize:` declarations in
`src/`. No guard test. The token file exists and is essentially unused. (See `design-system.md`.)

### 16 — Hygiene
- Dead dependencies still shipped: `react-hook-form`, `expo-linear-gradient` (zero `src/` imports); `@testing-library/jest-native`; `jest-expo` sits in `dependencies` rather than `devDependencies`.
- **No ESLint/Prettier config at all.**
- `AssessmentChildSelectScreen.js` uses raw `home_language.toLowerCase()` instead of `normalizeLanguageKey`.
- `ProfileScreen` reports "Current password is incorrect" for *any* sign-in error, including a network failure. Both exports share one `exportLoading` flag.
- `HomeScreen.loadStats` has no `try/catch`.
- **`sessionsRepository` has no `delete from session_attendees`** — editing a session to *remove* an attendee leaves the row. A live data-integrity landmine.
- No `test:coverage` script; 9 `.plan5.test.js` suites still named after a retired plan.

---

## 3. Rescued from documents archived on 2026-07-13

These were the *only* record of the item. Their source docs are now in `documentation/archive/`.

- **Crash reporting was never added.** No Sentry/Bugsnag/Crashlytics in `package.json` (the only `@sentry` string is a stale jest `transformIgnorePatterns` entry). A field crash currently leaves no trace beyond a manual log export. *(from the 2026-04-24 field-reliability review)*
- **Push notifications + message inbox** — no `expo-notifications`, no `NotificationsContext`. *(from the June Top-10, item 10 — its only spec)*
- **`SnackbarContext` / `RootSnackbarHost` never ported** — **14 screens** still render their own `<Snackbar>`. *(from the June Top-10, item 9b; dropped entirely from the July review)*
- **Version-gated startup repair hook (`requeueFrozen`)** — does not exist. Consequence: **a future field fix cannot heal rows already quarantined on devices.** *(from the ZZ field-lessons review)*
- **Upsert batching is narrow** — `BATCHABLE_UPSERT_TABLES` covers only `assessment_items`, `letter_mastery`, `session_attendees`, `time_entries`. Memberships and enrollments are still one HTTP round-trip *per record*. Called "a contained change with an outsized field payoff". *(ZZ review)*
- **Index gaps** — no index on `sessions.class_id`, `sessions.group_id`, or `session_attendees.group_id`, and **no `updated_at` index on any synced table**. Bites the day delta pulls land. *(ZZ review)*
- **Retire `repairGroupOwnershipForSync()`** — a cutover-only heal, still live (`groupsRepository.js:487`, called in the sync preflight at `offlineSync.js:1225`). Remove or time-box it once cutover completes. *(from the 2026-05-25 RLS audit — its last unchecked box)*
- **Unanswered product question: pull-to-refresh now force-pushes.** My Children pull-to-refresh triggers a *push*, not just a reload. Jim never chose between force-push and reload-only. *(from the sync-reliability build log)*
- **Four UX gaps** *(from the 2026-03-25 children/classes/groups review)*:
  - `ChildrenListScreen` destructures `loading` / `classesLoading` and **never uses them**; `ClassDetailScreen` renders "Class not found." with no loading check. Empty states flash during load.
  - `EditChildScreen` has no explicit "No class" / clear option in the class picker.
  - Assessment child rows show name + last-assessed only — no class/group context.
  - Session history shows an attendee **count**, not names.

---

## 4. Unbuilt features with a written spec

- **Groups Workflow (§3) and Session Reliability (§4)** in `zazi-izandi-feature-port-roadmap.md` are **entirely unbuilt**, and that roadmap is their only spec. `sessions.group_id` and `sessions.state` exist as *forward-prep server columns only* — RLS pins them NULL/`completed` and the client never writes them. **Do not archive that roadmap.**
- **2026-cohort seed script** (`scripts/seed-2026-cohort.js`) — not built. The go-live PRD it belongs to treats seeded data as a *precondition* for the tranche it already shipped.
- **`seed_data_plan.md` and `bulk_import_children_plan.md`** — both still unbuilt **and both plans are schema-dead**: they target `staff_children` / `children_groups` / `children.class` text columns, none of which exist under the SQLite backend. The *need* is real (bulk import is the onboarding rate-limiter); the *plans* need rewriting, not executing.
- **Additional session forms** — Numeracy, ZZ Coach, Yeboneer (PRD Phase 5). Only Literacy exists.

> **PRD correction:** PRD "Planned Admin Script #3 — Staff User Creation Automation" is described as
> unbuilt, but `scripts/loadTestUsers.js` already does it (CSV → auth user + `public.users` row,
> idempotent). That PRD section is stale.

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
- **Server-authoritative acknowledgment RPC** — RLS under-return is currently *undetectable* (`{ data: [], error: null }` is indistinguishable from a genuinely empty scope). This is also `sprint4-followups` item 1, and it is the last structural gap in reconcile.
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

The worktree touched **zero migrations**. There is no v5/v6/v7 collision because there are no worktree
migrations at all. Main is at `CURRENT_SCHEMA_VERSION = 7`; WelaPLUS starts cleanly at v8. The schema
and wiring (~55% of the PRD) remain to be built and are unaffected by the merge.

**Recommended:** restore `domainRepositoryUtils.js` from main on the branch, then merge (~1 hour). Land
the ID rekey separately (~half a day). Design-conformance pass + the hex-literal guard (~1-1.5 days).

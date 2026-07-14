# Masi Catch-Up Review From Zazi iZandi

Date: 2026-05-19
Repos compared:

- Masi: `/Users/jimmckeown/Development/masi-app`
- Zazi iZandi: `/Users/jimmckeown/Development/zazi-izandi-app`

Status: Planning and review artifact only. No app code changed.

## Scope

This review compares the current Masi app against the more advanced Zazi
iZandi app and ranks the features, design patterns, and architecture that Masi
should adopt if the goal is to make Masi the organisation's premier field app.

I intentionally did not rank "move AsyncStorage to SQLite" as a normal backlog
item because you asked to skip over that transition. I do include a storage
stance near the end because several of the best Zazi patterns become much safer
once the app has a relational local store or at least a stronger repository
boundary.

## Ranking Method

The ranking is not easiest-to-hardest. It is ordered by:

1. Field value for daily users.
2. How far Masi currently lags Zazi.
3. How much the item unlocks later features.
4. Risk reduction for low-connectivity, low-end Android field usage.

Lift bands:

| Band | Meaning |
| --- | --- |
| S | Small focused change or narrow UI/service extraction. |
| M | A meaningful feature slice with tests. |
| L | New workflow or multiple screens/services with sync implications. |
| XL | Product subsystem or storage/schema/release-gate project. |

## Highest-Value Catch-Up List

### 1. Group-First Field Workflow And Group Intelligence

Priority: Critical
Lift: L
Zazi evidence: `src/screens/groups/*`, `src/services/groupingService.js`, `src/utils/autoGrouping.js`, `src/hooks/useCurrentGroupingGroups.js`, `src/components/groups/GroupCard.js`, `src/screens/children/ClassDetailScreen.js`
Masi evidence: `src/screens/children/ClassDetailScreen.js`, `src/components/children/GroupPickerBottomSheet.js`, `PRD.md`

Zazi has moved beyond "children can be manually assigned to groups." It has a
real group workflow: class list completion, baseline assessment readiness,
suggested groups, late insertion, redo all groups, group detail pages, group
stats, group programme levels, and a clear Children/Groups view switch inside a
class.

Masi has group data and a group picker, but it is still mostly manual. The UI
does not yet treat groups as the central unit of daily work, and it does not
guide staff through readiness states such as "finish the class list", "assess
more children", "suggest groups", or "add newly assessed children to groups."

Recommended Masi direction:

- Build a Masi-specific group workflow around the real Masi programme model.
- Add a Groups screen and class-level Children/Groups switch.
- Add group cards with child count, sessions this week, current focus, and
  progress.
- Add readiness gates before group generation or group-based work.
- Treat Zazi's grouping algorithm as a pattern, not a direct copy. The ZZ
  letter/blending thresholds are programme-specific.

First safe slice:

- Add a read-only Groups screen and Group Detail screen for Masi using existing
  groups and children groups. Then add smarter creation/assignment.

Why this is rank 1:

If Masi is the premier app, staff should not be hunting through individual
children for every action. Groups are the natural field-work unit for sessions,
progress, catch-up actions, and dashboards.

### 2. Groups-First Session Capture With Attendance, Timer, Backfill, And Resume

Priority: Critical
Lift: L
Zazi evidence: `src/screens/sessions/NewSessionScreen.js`, `src/screens/groups/GroupPickerScreen.js`, `src/components/session/ResumeBanner.js`, `src/hooks/useActiveSessionState.js`, `src/utils/activeSessionState.js`, `src/utils/sessionCaptureValidator.js`
Masi evidence: `src/screens/main/SessionsScreen.js`, `src/screens/sessions/SessionFormScreen.js`, `src/screens/sessions/LiteracySessionForm.js`

Zazi's session capture is much more field-realistic. A session starts from a
group picker, defaults the roster into attendance, supports present/absent,
tracks active timer state, can resume an in-progress session from a top banner,
supports backfilled sessions, and validates letters versus blending differently.

Masi's literacy session form is a capable first version, but it is still a
generic child-selection form. It does not preserve an active session across
navigation with a prominent resume path, does not record attendance per child,
does not make group selection the primary flow, and does not offer a clean "log
past session" path.

Recommended Masi direction:

- Replace "Record New Session" with "Choose group" as the default route when
  groups exist.
- Add `NewSessionScreen` style draft state for the selected group and roster.
- Add attendance status per child.
- Add active session timer persistence and a global resume banner.
- Add "Log past session" from Session History.
- Extract validation into a pure helper with tests.

First safe slice:

- Add a group picker before the existing literacy form, passing selected group
  children into the current form. Then replace the form internals with the
  draft/attendance/timer model.

Why this is rank 2:

This directly affects the highest-frequency field workflow. It is also the
foundation for daily plans, group stats, session history quality, manager views,
and child progress.

### 3. Local-First UX Responsiveness Instead Of Waiting On Sync

Priority: Critical
Lift: M
Zazi evidence: `src/context/OfflineContext.js`, `src/screens/children/AddChildScreen.js`, `__tests__/screenTimerAudit.test.js`
Masi evidence: `src/context/OfflineContext.js`, `src/screens/children/AddChildScreen.js`, `src/screens/children/CreateClassScreen.js`, `src/screens/children/EditChildScreen.js`, `src/screens/children/EditClassScreen.js`

Zazi's write paths now return immediately after the local save and trigger sync
in the background. It also has a regression test that prevents artificial
`setTimeout` navigation delays from creeping back into screens.

Masi still has several screen-level delays after local saves, including Add
Child, Create Class, Edit Child, and Edit Class. Several context write paths
also await sync-status refresh directly. That makes local-first behavior feel
slower than it needs to, especially on lower-end Android devices.

Recommended Masi direction:

- Port Zazi's `triggerBackgroundSync` pattern.
- Remove artificial post-save navigation delays from screen code.
- Add a screen timer audit test.
- Keep success feedback lightweight: navigate immediately after the local write,
  then surface sync state through the existing sync banner/status screen.

First safe slice:

- Add `triggerBackgroundSync` to Masi's `OfflineContext`, switch Add Child and
  Create Class to immediate navigation, and add the audit test.

Why this is rank 3:

The app should feel instant when the local write succeeds. Users in the field
should not experience background network uncertainty as form lag.

### 4. A Real "Today" Work Cockpit And Priority Action Items

Priority: High
Lift: M/L
Zazi evidence: `src/screens/main/TodayScreen.js`, `src/screens/main/HomeScreen.js`, `src/utils/homeActionItems.js`, `src/utils/groupPickerPresentation.js`
Masi evidence: `src/screens/main/HomeScreen.js`, `src/screens/main/SessionsScreen.js`

Zazi has started turning the app into a daily cockpit. Home computes action
items such as class list completion, assessments needed before grouping, and
ungrouped children. Today gives the user a clean session start surface and
reserves space for Daily Plan and AI Coach.

Masi Home has useful stats and time tracking, but it is not yet a true "what
should I do next?" surface. The Sessions tab is mostly a static landing page.

Recommended Masi direction:

- Add a Today tab or upgrade the Sessions tab into a Today workflow.
- Add action items generated from Masi data:
  - children not seen this week,
  - children needing assessment,
  - groups with no recent sessions,
  - failed sync needing support,
  - classes missing children or groups.
- Make "Start session" route through group selection when groups exist.
- Keep AI placeholders out of the main path until there is a concrete backend
  plan; deterministic local action items are more valuable now.

First safe slice:

- Add a `computeMasiActionItems` helper and show the top 3-5 items on Home.

Why this is rank 4:

This changes the app from a record-keeping tool into a daily operating tool.

### 5. Release Visibility, OTA Metadata, And Support-Friendly Versioning

Priority: High
Lift: M
Zazi evidence: `src/screens/main/ProfileScreen.js`, `src/utils/appRelease.js`, `src/constants/releaseMetadata.json`, `scripts/eas-update.cjs`, `__tests__/appRelease.test.js`, `__tests__/easUpdateScript.test.js`
Masi evidence: `src/screens/main/ProfileScreen.js`, `src/utils/debugExport.js`, `app.json`

Zazi exposes a full App Release card: release label, build, channel, runtime,
update id, launch source, and publish time. It also has an `eas:update` wrapper
that bumps release metadata before publishing an OTA update.

Masi only shows basic app version/build text and has no dedicated OTA metadata
workflow. Masi does include useful debug export metadata, but support still has
less visible information when a tester says "I am on the latest version."

Recommended Masi direction:

- Port `appRelease.js` and the Profile App Release card.
- Add `src/constants/releaseMetadata.json`.
- Add a tested `eas:update` wrapper adapted to Masi's production channel and
  current `runtimeVersion.policy = "appVersion"`.
- Include release metadata in exported logs/database payloads.

First safe slice:

- Add the read-only release card and tests without changing the release script.

Why this is rank 5:

Multiple app versions are already in the field. Support and rollout decisions
need exact release visibility inside the app.

### 6. A Professional Test And Release Gate

Priority: High
Lift: M/L
Zazi evidence: `package.json`, `jest.integration.config.js`, `__tests__/`, `scripts/sqlite-staging.cjs`, `docs/agent-context/development-workflow.md`
Masi evidence: `package.json`, `__tests__/`

Zazi has 62 test files and a release gate shape: unit tests, integration tests,
SQLite/staging checks, release workflow tests, screen tests, repository tests,
and docs describing the workflow. Masi currently has 15 test files and only a
single `jest` script.

Recommended Masi direction:

- Add a `test:release` script even before SQLite. It should run:
  - normal Jest,
  - targeted sync/session/assessment tests,
  - schema migration SQL checks,
  - a lightweight release metadata check.
- Add tests around the workflows we plan to upgrade first:
  - `NewSessionScreen` or equivalent,
  - active session resume,
  - Add/Edit child immediate navigation,
  - release metadata,
  - sync duplicate/error classification.
- Keep `npm` versus `pnpm` consistent with the project's security preference.
  If introducing new scripts, prefer pnpm-compatible commands and ensure
  minimum release age is configured before new installs.

First safe slice:

- Add `test:release` as a wrapper around the current Jest suite plus schema
  checks, then grow it as features land.

Why this is rank 6:

Masi is live in field testing. A premier app needs a release gate that catches
real workflow regressions, not just helper-level happy paths.

### 7. Sync Error Handling Improvements That Are Transferable Before SQLite

Priority: High
Lift: M
Zazi evidence: `src/services/offlineSync.js`, `src/services/supabaseRequestQueue.js`, `__tests__/offlineSyncOutbox.test.js`, `__tests__/supabaseRequestQueue.test.js`
Masi evidence: `src/services/offlineSync.js`

Some of Zazi's sync improvements are tied to SQLite and the durable outbox, but
not all of them. The transferable parts are worth doing in Masi even before a
storage migration:

- serialize Supabase-backed sync requests,
- avoid marking non-primary-key unique violations as "synced",
- preserve terminal failures for support review instead of hiding them,
- use a background sync trigger from write paths,
- expand dependency-aware sync ordering as new tables are added.

Masi currently treats all `23505` unique violations as success. That is safe
only when the duplicate proves the exact same row already exists. For domain
unique constraints, it can hide a real conflict.

Recommended Masi direction:

- Add a safer `23505` classifier like Zazi's constraint-aware logic.
- Add `runSerializedSupabaseRequest`.
- Add tests for primary-key duplicate versus domain uniqueness conflict.
- Leave the full durable outbox for the SQLite/storage milestone.

First safe slice:

- Fix the unique-violation classifier and add tests.

Why this is rank 7:

Bad sync state is costly in field apps. This reduces support risk without
forcing the whole SQLite transition first.

### 8. Cache-Preserving Pull Guards For Partial Server Failures

Priority: Medium/High
Lift: S/M
Zazi evidence: `src/utils/serverPullGuard.js`, `src/screens/sessions/SessionHistoryScreen.js`, `src/screens/assessments/AssessmentHistoryScreen.js`, `__tests__/serverPullGuard.test.js`
Masi evidence: `src/screens/sessions/SessionHistoryScreen.js`, `src/screens/assessments/AssessmentHistoryScreen.js`

Zazi has a tiny but useful rule: if a server pull errors and returns no useful
items, keep the cached list instead of blanking the screen. That is exactly the
kind of defensive mobile behavior that matters when connectivity is unstable.

Masi's current direct Supabase calls are simpler, but this guard should become a
shared pattern as Masi adds richer repository pull paths and server refreshes.

Recommended Masi direction:

- Add `shouldReplaceCachedList`.
- Use it wherever a cache-first screen fetches server data after showing local
  data.
- Add the regression test now so future pull refactors inherit the rule.

First safe slice:

- Add the helper and tests, then use it in Session History and Assessment
  History when those screens are next touched.

Why this is rank 8:

It is small, but it protects a key trust property: cached local data should not
disappear because a network refresh partially failed.

### 9. Field-Optimized Form Controls And Input Hygiene

Priority: Medium/High
Lift: S/M
Zazi evidence: `src/components/forms/ChipSelector.js`, `src/constants/textInputProps.js`, `src/screens/children/AddChildScreen.js`, `__tests__/ChipSelector.test.js`, `__tests__/AddChildScreen.test.js`
Masi evidence: `src/screens/children/AddChildScreen.js`

Zazi replaced a heavier gender dialog with inline chips, standardized text
input props, disabled unhelpful autocorrect/autofill behavior, sanitized numeric
input, and tested the behavior. This is small, but it reduces field friction.

Masi still uses a dialog for gender and accepts non-digit age input until
validation.

Recommended Masi direction:

- Port `ChipSelector`.
- Port `textInputProps`.
- Sanitize numeric input as the user types or pastes.
- Prefer inline chips for small fixed option sets.

First safe slice:

- Update Add Child only, with tests.

Why this is rank 9:

It is not glamorous, but it makes repeated field entry faster and less error
prone.

### 10. Auth And Supabase Environment Guardrails

Priority: Medium/High
Lift: M
Zazi evidence: `src/services/supabaseClient.js`, `config/supabaseProjectConfig.js`, `__tests__/supabaseProjectConfig.test.js`, `__tests__/supabaseClient.test.js`
Masi evidence: `src/services/supabaseClient.js`, `app.json`

Zazi has stronger protection against pointing a build at the wrong Supabase
project. It resolves an explicit target, verifies project id and URL alignment,
and keeps a single hot-reload-safe Supabase client state.

Masi's client reads env vars or app config directly. That is fine for simple
local work, but production/staging mix-ups are costly once Masi has multiple
release tracks and field users.

Recommended Masi direction:

- Add `config/supabaseProjectConfig.js`.
- Encode known Masi project refs.
- Test wrong-target and mismatched-url failure cases.
- Consider the hot-reload-safe client wrapper from Zazi if local development
  sees duplicate AppState auth refresh listeners.

First safe slice:

- Add config resolution tests without changing app behavior, then switch the
  client import.

Why this is rank 10:

It is a release safety improvement. It will matter more as staging/internal
testing grows.

### 11. More Polished, Componentized Mobile Design System

Priority: Medium
Lift: S/M
Zazi evidence: `src/constants/colors.js`, `src/components/common/BottomTabIcon.js`, `src/components/common/SectionHeader.js`, `__tests__/BottomTabIcon.test.js`, `__tests__/SectionHeader.test.js`
Masi evidence: `src/constants/colors.js`, `src/navigation/AppNavigator.js`, `src/screens/main/HomeScreen.js`

Zazi has more complete color tokens, a reusable tab icon component, a reusable
section header, a cleaner active-tab indicator, and a more restrained primary
gradient. Masi's Home header currently uses a blue-to-red gradient, which makes
the main surface feel more urgent than necessary and mixes brand colors in a
way that the Masi color guidance itself cautions against.

Recommended Masi direction:

- Add a primary color scale to `colors.js`.
- Replace the Home header gradient with a primary-blue gradient and reserve red
  for urgent or destructive states.
- Extract `BottomTabIcon` and `SectionHeader`.
- Add tests for visual-state helpers where practical.

First safe slice:

- Port `BottomTabIcon` and `SectionHeader`, then adjust the Home gradient.

Why this is rank 11:

It is not as important as workflow correctness, but it helps Masi feel more
finished and less prototype-like.

### 12. Better Support Exports And Support Summaries

Priority: Medium
Lift: M
Zazi evidence: `src/utils/debugExport.js`, `src/db/debugDump.js`, `docs/agent-context/safety-guards.md`
Masi evidence: `src/utils/debugExport.js`, `src/utils/logger.js`

Zazi's database export is a support payload, not just a raw dump. It includes
app metadata, device info, storage ownership notes, table counts, local state
keys, sync state keys, failed outbox summaries, and terminal items.

Masi exports AsyncStorage plus some release/schema metadata. That is useful,
but support still has to manually inspect a large JSON object to answer common
questions.

Recommended Masi direction:

- Add a `support_summary` section to the Masi export.
- Include per-table counts, sync meta counts, failed item counts, retry counts,
  last successful sync time, and app release metadata.
- Keep the raw AsyncStorage dump for now.

First safe slice:

- Add `buildDatabaseExportData` as a testable helper and keep `exportDatabase`
  as the share wrapper.

Why this is rank 12:

The app is in field testing. Better support exports shorten bug diagnosis
without changing user workflows.

### 13. Seed, Wipe, And Staging Operations For Real Tester Cohorts

Priority: Medium
Lift: M
Zazi evidence: `scripts/seed-test-eas.js`, `scripts/wipe-test-eas.js`, `scripts/seed-testflight.js`, `scripts/wipe-testflight.js`, `scripts/sqlite-staging.cjs`, `documentation/test-eas-cheatsheet.md`
Masi evidence: `scripts/seedSchools.js`, `scripts/createTesters.js`

Zazi has more complete operational scripts for seeded test environments and
tester cohorts. Masi has useful starter scripts, but not the same disciplined
seed/wipe workflow.

Recommended Masi direction:

- Add named seed/wipe scripts for internal testing.
- Document exactly which Supabase project and release channel they target.
- Add dry-run or environment checks before destructive operations.
- Keep production data safeguards explicit.

First safe slice:

- Add a Masi internal-test seed script that checks project ref before writing.

Why this is rank 13:

Premier apps need repeatable testing environments. Manual tester data setup
becomes a bottleneck as workflows get richer.

### 14. Assessment Result Framing And Grade-Aware Interpretation

Priority: Medium
Lift: S/M
Zazi evidence: `src/screens/assessments/AssessmentResultsScreen.js`, `src/utils/assessmentScoreColors.js`, `__tests__/AssessmentResultsScreen.test.js`, `__tests__/assessmentScoreColors.test.js`
Masi evidence: `src/screens/assessments/AssessmentResultsScreen.js`

Zazi made a subtle but important product decision: the main completed
assessment stat is letters correct, while percent correct is secondary. It also
has a helper for grade-aware score colors.

Masi's result screen emphasizes percentage as the hero metric. That may be less
useful educationally if coaches think in "letters correct" thresholds.

Recommended Masi direction:

- Confirm with programme leads whether Masi coaches should see "correct
  responses" or "accuracy percent" as the hero metric.
- If correct responses are the real coaching metric, port the Zazi result
  framing.
- Add grade/programme-aware color thresholds if Masi has similar rules.

First safe slice:

- Add a small decision note and test before changing the UI.

Why this is rank 14:

This is important, but only after confirming Masi's educational interpretation
rules. Do not copy ZZ thresholds blindly.

### 15. Roadmap Discipline For "Next-Level" Features

Priority: Medium
Lift: S
Zazi evidence: `documentation/next-level-feature-difficulty-order-2026-05-18.md`, `documentation/next-level-feature-ideas-2026-05-15.md`
Masi evidence: `documentation/`

Zazi has a useful next-level feature backlog that separates quick local slices
from full infrastructure-heavy versions. It explicitly calls out blockers such
as push notifications, manager role/view, AI backend, parent messaging, and
achievement/event ledger.

Masi should have the same discipline before adding "premier app" features. Many
features sound easy until they require push tokens, manager permissions,
caregiver consent, AI freshness gates, or durable achievement events.

Recommended Masi direction:

- Create a Masi next-level feature backlog with v1/full splits.
- Rank by implementation dependency, not just impact.
- Make shared blockers explicit:
  - push notifications,
  - manager/admin role model,
  - achievement ledger,
  - parent messaging consent,
  - AI/backend plan,
  - storage/repository migration.

First safe slice:

- Turn this catch-up review into a delivery roadmap after choosing which
  features are in the next release bundle.

Why this is rank 15:

This prevents the premier-app ambition from becoming a pile of half-connected
features.

## What I Would Not Copy Blindly

### Do not copy Zazi's grouping thresholds directly

`src/utils/autoGrouping.js` is tailored to ZZ's letters/blending programme and
references a canonical Python grouping rule. Masi needs its own programme
logic.

### Do not copy Zazi's one-class auto-redirect without validating Masi roles

Zazi redirects the Children tab to the first class when an EA has a class. That
works for its current single-EA workflow, but Masi has multiple job titles and
may need stronger class management visibility.

### Do not ship AI placeholders as if they are product value

Zazi's Today screen has Daily Plan and AI Coach placeholders. For Masi, local
deterministic action items should come first. Add AI surfaces only when the
backend, freshness, privacy, and evaluation path are real.

### Do not treat Zazi's SQLite-specific code as a small copy-paste

The repository layer, outbox, debug export, and integration tests are valuable,
but they are part of a large storage refactor. Copying pieces without the full
storage contract would create confusing half-patterns.

## SQLite / AsyncStorage Stance

Short answer: I feel strongly that SQLite is the right long-term direction for
Masi, but I would not casually start it in the same branch as UI catch-up work.

Why I feel strongly:

- Masi is already relational: users, classes, children, groups, memberships,
  sessions, assessments, and letter mastery.
- The app is offline-first and field users may be offline for days.
- The next best features in this review make the local data model more
  relational: group-first sessions, attendance rows, group history, backfill,
  action items, sync retry state, and support exports.
- AsyncStorage is still fine for tiny settings, auth/session cache, logs, and
  small queues. It is not ideal as the main domain store for a premier
  offline-first app that keeps growing.

Why I would not do it casually today:

- Masi already has multiple app versions in the wild.
- Storage migration must preserve existing unsynced local data, debug exports,
  rollback paths, and Android behavior.
- The hard part is not installing `expo-sqlite`; it is preserving the app's
  local-data contract and sync behavior during a live rollout.

My practical recommendation:

1. Do the small transferable improvements now: background sync trigger,
   artificial-delay removal, release metadata, release gate, support export
   summary, safer sync classifier.
2. Before building the full group-first session/attendance/grouping subsystem,
   decide whether Masi is ready for a dedicated SQLite migration milestone.
3. If the answer is yes, treat SQLite as its own stabilization project with
   TDD, export compatibility, staged rollout, and Android validation.
4. If the answer is no, still introduce repository-style helper boundaries so
   later SQLite migration is less painful.

Strength of recommendation:

- Long-term architecture: strong yes.
- Immediate next branch: no, unless the explicit branch goal is storage
  migration.
- Before adding lots of new relational workflows: strong yes or at minimum add
  repository boundaries first.

## Suggested Delivery Sequence

### Phase 1: Fast Stabilization And Polish

Lift: S/M

- Add release metadata card and tests.
- Add `triggerBackgroundSync`.
- Remove artificial post-save delays.
- Add screen timer audit.
- Add safer unique-violation sync classification.
- Add support export summary.
- Add `test:release` wrapper.

This phase improves live-field quality without a large product redesign.

### Phase 2: Daily Operating UX

Lift: M/L

- Add Home action items.
- Add or upgrade Today/Sessions into a daily work cockpit.
- Add read-only Groups screen and Group Detail.
- Add group picker as the default session start path when groups exist.

This phase makes Masi feel like a field operating system instead of just a data
entry app.

### Phase 3: Group-First Session System

Lift: L/XL

- Add active session draft state.
- Add persistent resume banner.
- Add attendance capture.
- Add backfill flow.
- Add validation helpers and tests.
- Add group/session history stats.

This should be built carefully because it touches the highest-frequency field
workflow.

### Phase 4: Storage And Sync Architecture Milestone

Lift: XL

- Decide on SQLite timing.
- If proceeding, migrate with a Build A/Build B style rollout and explicit
  support-export compatibility.
- If deferring, at least add repository/helper boundaries and stronger sync
  tests before adding more relational features.

## Best First Bundle

If we want visible progress quickly while staying careful with the live app, I
would start with:

1. Release card and OTA metadata.
2. Background sync trigger plus removal of artificial navigation delays.
3. `test:release` wrapper and screen timer audit.
4. Safer sync duplicate/error classification.
5. Home action items v1.
6. Read-only Groups screen and Group Detail.

That bundle improves reliability, supportability, and daily usability without
committing immediately to the storage migration or the full group-first session
rewrite.

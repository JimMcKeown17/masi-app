# PRD: Masi UX Port — Go-Live Tranche (2026 Season)

**Date:** 2026-05-27
**Source roadmap:** [`documentation/zazi-izandi-feature-port-roadmap.md`](./zazi-izandi-feature-port-roadmap.md)
**Domain glossary:** [`CONTEXT.md`](../CONTEXT.md)
**Architectural decisions:** [`docs/adr/0001-group-reconciliation-via-versioning-and-staging.md`](../docs/adr/0001-group-reconciliation-via-versioning-and-staging.md)
**Branch:** `ui/zazi-feature-polish`
**Status:** Ready for implementation. Outstanding open product questions are captured in `CONTEXT.md` and tracked in this PRD's *Further Notes*; they do not block this tranche.

## Problem Statement

Masi EAs are starting the 2026 season with a SQLite-backed app that is technically reliable but visually thin: the Home screen has no daily goal motivation, the assessment completion screen has been only partially ported from Zazi iZandi, session capture ends without acknowledgement, and several small visual patterns (active tab indicator, section headers, monthly stats clarification, consistent colour semantics) are inconsistent across screens. EAs are also early-career field workers with little prior workplace-app experience, so each piece of unclear or inconsistent UI translates directly into wasted training time and lost field-data quality. Separately, sessions do not yet record which **group** of children was worked with, even though "one session = one group-block of work" is the settled domain rule, which prevents per-group reporting and blocks the Sessions Today daily-goal ring.

## Solution

Ship a focused UX tranche on the `ui/zazi-feature-polish` branch that gives EAs a clear daily motivation loop, finishes the Zazi-derived screen polish that was already started, and adds the additive schema columns needed to make the new UI work. All grouping-management UX (manual group editor, Head Office push, acceptance gate) is deferred to a later tranche aligned to the next academic year cycle, because the 2026 cohort's children/programmes/classes/groups will be **seeded** centrally before EAs first log in. This tranche assumes seeded data and focuses on the **capture and motivation** experience.

Concretely, the tranche delivers:

- A programme-aware **Sessions Today ring** on Home that knows each programme's daily target and stretch ceiling, renders empty when no sessions yet today, and falls back to a count card for programmes with no target (1000 Stories).
- A **session completion interstitial** that fires after a session is saved, replacing the current silent `navigation.goBack()`.
- The finished hero stat on **Assessment Complete** (already on the branch — needs verification only).
- A small set of cross-screen polish ports: monthly stats footnote, active bottom-tab indicator, reusable section header, and a colour-semantics audit pass.
- Two additive schema migrations to `programmes` and `sessions` so the ring and per-session group context can be computed, plus a **seed script** that loads the 2026 cohort.

## User Stories

1. As an EA who has just opened the app for the day, I want to see my daily session goal as a visible target on the Home screen, so that I know what I'm aiming for before I start any work.
2. As an EA who has completed one session today, I want to see my Sessions Today ring partially filled, so that I feel my progress toward the goal.
3. As an EA on Core Literacy Grade R–3 who has completed three sessions today, I want my ring to show as full with a "Goal met!" indicator, so that I can stop or push for a stretch session with intention.
4. As an EA on Core Literacy Grade R–3 who has completed a fourth or fifth session today, I want a stretch arc to appear outside the main ring with a "Stretch goal!" label and a light haptic, so that I feel celebrated for going beyond the baseline.
5. As an EA on the 1000 Stories programme, I want to see today's session count and books-read total as a clear count card rather than an empty ring, so that the Home screen reflects the fact that my programme has no fixed daily session target.
6. As an EA on the Yebo programme, I want to see a simple "1 of 1, today's session done" indicator after my after-school session, so that I know my work is recorded.
7. As an EA with no active programme assignment, I want to see a clear "Contact your administrator" gate instead of being dropped into capture screens, so that I do not accidentally capture sessions against the wrong programme.
8. As an EA who has just submitted a session, I want to see a completion screen that confirms the save, summarises what I just captured, and shows my updated Sessions Today ring, so that I have an explicit moment of acknowledgement rather than silently dropping back to the form's predecessor.
9. As an EA on a low-end Android device, I want the completion screen's animation and haptics to scale down so it remains smooth and battery-friendly, so that the celebration doesn't degrade my device experience.
10. As an EA finishing the EGRA Letter Sound Assessment, I want the results screen to show my **correct count** as the hero number with the percentage as supporting text, so that I quickly see what the child got right rather than computing it from a percentage.
11. As an EA browsing the bottom tabs, I want a visible dot or indicator under the active tab, so that I always know which screen I am on without parsing icon colour alone.
12. As an EA scanning the Home screen for monthly stats, I want a small footnote that explicitly says these are "monthly" figures, so that I do not misread them as weekly or daily.
13. As an EA on any list or detail screen, I want section headers that look consistent across Home, Sessions, Children, Assessments, and Profile, so that the app feels unified rather than stitched together.
14. As a Masi admin preparing the 2026 cohort, I want a single seed script that loads programmes, schools, classes, children, child-class memberships, child-programme enrollments, groups, child-group memberships, and EA assignments from a structured source, so that we can stand up the season's data centrally without asking EAs to enter it.
15. As a researcher analysing Masi data over multiple years, I want every captured session to record its `group_id` so that "how many sessions did Thandi's pair get this term" is a direct query, so that longitudinal dosage research is possible without join-and-guess heuristics.
16. As an EA using Core Literacy ECD, I want the same ring component to display my higher daily target of 5 sessions, so that the UI behaves consistently with my programme's pedagogy without me needing to switch a mode.
17. As an EA whose programme has a daily target, I want the ring to clearly show 0/target when I haven't started yet, so that I can plan my day from the moment I open the app.
18. As an EA who returns to Home after completing the day's last session, I want my ring to retain its filled state, so that I can verify what I accomplished without re-opening the session history.
19. As a future Head Office admin (post-go-live), I want the existing `grouping_versions` and `class_grouping_state` infrastructure to be untouched by this tranche, so that next year's grouping reconciliation work can proceed against the documented design (ADR-0001) without conflict.
20. As an engineer maintaining the codebase, I want the per-programme daily targets to live on the `programmes` table (not on `staff_programme_assignments`, not hard-coded), so that future programme additions (e.g., a Numeracy ECD/R-3 split) only require a data row, not a code change.
21. As an EA whose device drops to offline during a session, I want my completion to happen locally and the ring to update from local data, so that motivation feedback is not gated on network state.
22. As an EA who has clocked in and is on the right programme, I want the Sessions Today ring to count *all* of today's sessions for that programme regardless of which class or group they were with, so that the ring reflects my whole day's work, not just one classroom.
23. As an EA who tries to capture a session, I want the existing soft clock-in warning to remain in place, so that the new completion screen and ring do not bypass that safety guard.
24. As a Masi support engineer reviewing an exported support package, I want the new schema columns (`programmes.daily_session_target`, `programmes.daily_session_ceiling`, `sessions.group_id`) to appear in the support diagnostics and database export, so that field issues can be diagnosed remotely.

## Implementation Decisions

### Schema changes (additive, backwards-compatible)

- `programmes.daily_session_target INTEGER NULL` — nullable, allows the 1000 Stories case of "no target" and any future programme that doesn't have one.
- `programmes.daily_session_ceiling INTEGER NULL` — only populated for programmes with a stretch range (initially: `core_literacy_r3` at 5). When null, the ring has no bonus arc.
- `sessions.group_id TEXT REFERENCES groups(id)` — nullable for safe rollout; app-side validation requires it for any new session capture. Because each `groups` row carries `grouping_version_id`, sessions never go stale when a future regroup happens.

All three are forward-compatible with older app builds in the field — the rule established in `AGENTS.md` for the field-testing window is honoured.

### Seed data

- Programme rows for `core_literacy_r3`, `core_literacy_ecd`, `numeracy`, `one_thousand_stories`, `yebo` (codes are the proposed schema codes; display names use the canonical Masi labels).
- The Zazi iZandi programme is **not** seeded into Masi for this season because it is delivered via a separate app.
- A seed script (idempotent, re-runnable) loads schools, classes, children, child-class memberships, child-programme enrollments, EA programme assignments, groups, and child-group memberships from a structured source (CSV or JSON — format TBD with the operations team). Membership rows are inserted under a freshly created `grouping_versions` row per class with `status = 'active'` and `class_grouping_state.class_list_status = 'complete'`.

### Modules to build or modify

The following module shape is the leading proposal — if the user wants different boundaries, raise it before implementation starts.

- **`useActiveProgramme` hook** — reads `staff_programme_assignments` for the signed-in user, exposes either the active programme object (joined with `programmes` columns including the new target/ceiling) or `null`. Drives the "Contact administrator" empty state at the screen level. Pure read; no writes.
- **`useSessionsToday` hook** — queries today's `sessions` for the active EA + active programme; returns `{ count, target, ceiling, mode: 'ring' | 'count_card', isComplete, isStretch }`. The mode is determined by whether the active programme has a `daily_session_target`. This is the **deep module** of the tranche — its interface is small and stable, its implementation can change (caching, debounce, sync interaction) without rippling outward.
- **`SessionsTodayRing` component** — pure presentational; takes the hook's output as props. Renders ring (with stretch arc when applicable) or count card. Uses `react-native-svg` (new dependency) and reads `expo-haptics` (new dependency) only via the device-tier framework if it is ported as part of this tranche; otherwise haptics are a follow-up.
- **`SessionCompleteScreen`** — new route; entered via `navigation.replace` from `LiteracySessionForm` after a successful save. Shows a confirmation block, a small summary of the just-saved session, the updated `SessionsTodayRing`, and a primary action that returns to Sessions list (or auto-continues after a configurable delay). Uses the existing `useDelayedAction` hook pattern if ported from Zazi.
- **`SectionHeader` component** — small reusable component with Masi tokens; applied incrementally to Home, Sessions, Children, Assessments, Profile section breaks.
- **`BottomTabIcon` component** — extracts the inline icon mapping from `AppNavigator.js` into a single component with an active-state dot. Centralises route/icon mapping.
- **`AssessmentResultsScreen` verification** — branch already changes the hero number to `assessment.correct_responses`. The new render test should confirm correct count is displayed prominently and percent is supporting copy only.
- **`programmeConfig` helper** (optional, only if needed beyond what the hook returns) — a pure function `programmeRingConfig(programme) → { mode, target, ceiling, ringLabel, countCardSubtitle }` so the ring component's branching logic is testable in isolation.
- **Seed script** — `scripts/seed-2026-cohort.js` (or similar). Repeatable, transactional per class. Verifies foreign-key integrity before commit. Logs a per-table count summary at the end.

### Interface contracts

- The Sessions Today ring component must accept `count`, `target` (null-safe), `ceiling` (null-safe), and a `programmeDisplayName` for accessibility labels. It must render in *all three modes* (ring with no stretch, ring with stretch, count card) from a single component without callers needing to switch components.
- The `useSessionsToday` hook must invalidate or recompute when a new session is saved locally — the ring updates immediately offline, not on next sync.
- The session completion route receives the saved session id (not the full session object) and re-reads it; this avoids stale props if the underlying row is updated between save and screen mount.

### Visual and brand

- Reskin all ported Zazi components to Masi tokens defined in `src/constants/colors.js`. Do not import Zazi yellow accent semantics literally; audit existing usage and replace any drift.
- Stretch arc uses a Masi accent colour (TBD in the colour-semantics audit), not Zazi's yellow.
- The completion screen's animation intensity is gated by the device-tier framework if it is ported in this tranche; otherwise a single low-cost transition is used.

## Testing Decisions

A good test in this tranche tests **external behaviour** of a module — the inputs the caller controls and the outputs they observe — not the internal queries, state shape, or render-tree details. Tests should be resilient to refactor inside the module.

### Modules to test

- **`useSessionsToday` hook** — file-backed SQLite integration test (in line with the existing 13 SQLite integration suites). Seed a programme with target 3 ceiling 5, insert 0, 1, 3, 4, 5 sessions, assert the returned count/target/ceiling/mode/isComplete/isStretch for each. This is the contract the ring depends on; if this is right, the visual layer is easy.
- **`SessionsTodayRing` component** — render tests for all three modes: ring under target, ring at target, ring in stretch, count card. Verify accessibility labels include the programme name and the count/target. Prior art: existing Jest render tests in `__tests__/screenTimerAudit.test.js` and the focused `AssessmentResultsScreen` test referenced in the roadmap handoff.
- **`useActiveProgramme` hook** — integration test that covers (a) EA with one active assignment, (b) EA with no assignment, (c) EA with an ended assignment only.
- **`SessionCompleteScreen`** — render test for the summary block + ring + primary action. Snapshot-style is fine if it sticks to user-visible elements.
- **Schema migration** — additive-only verification test that the new columns exist, accept nulls, and that an older app build's `INSERT` into `sessions` without `group_id` still succeeds during the rollout window.
- **Seed script** — integration run against a temp SQLite DB; assert that a small fixture (one school, one class, four children, one programme, one EA, one group) lands all expected rows and that running the script twice does not double-insert.

### What not to test in this tranche

- Internal SQL of the hook implementations (refactor-fragile).
- The ring's exact pixel layout (visual regression is out of scope; rely on render+a11y tests).
- Device-tier framework behaviour beyond mode selection (its own tests come with that port).

## Out of Scope

The following are settled in design but **not** part of this tranche:

- **Manual group editor** (add/remove/move children within an active grouping version). Settled in design; ships next year's tranche.
- **Head Office NextJS dashboard.** Not built; staging surface unused this season.
- **Acceptance gate UX** (Option B itemized merge) for new grouping versions. Settled in `ADR-0001`; ships when HO dashboard ships.
- **Provenance column** (`last_written_by_role` on `child_group_memberships`). Schema addition deferred.
- **Algorithmic auto-grouping**, including the trivial day-1 random partition for ECD. Deferred — could become a small follow-up post-go-live if useful.
- **Active session state machine, resume banner, partial-save / discard prompt, explicit session timer, backfill mode** (roadmap 4.1–4.5). All require an open product decision before any of them ships; tracked in `CONTEXT.md`'s "Open questions" section.
- **Today vs Sessions tab rename** (roadmap 2.1).
- **Children auto-route to first class** (roadmap 2.2).
- **Login screen redesign / Masi-specific motif** (roadmap 6.2).
- **Notification UX and push transport** (roadmap 8.1).
- **Grade-aware assessment ranking colour thresholds** (roadmap 1.2). Open question — Masi thresholds need confirmation before any code change.
- **Yebo during-school-day as a session** — pending PM input.
- **1000 Stories one-group-per-class entity vs class-as-group** — open question.
- **Field-Assessment digitisation direction.** Long-term vision; not part of this tranche.

## Further Notes

### Sequencing within the tranche

Recommended order, each step independently shippable:

1. **Schema migrations** (`programmes.daily_session_target`, `programmes.daily_session_ceiling`, `sessions.group_id`) plus seed-row updates for programmes. Verify with the additive-migration test. *Lowest risk; should land first.*
2. **`useActiveProgramme` hook + empty state on Home.** This blocks every later screen needing the active programme; verify the "Contact administrator" gate.
3. **`useSessionsToday` hook + `SessionsTodayRing` component.** Wire the ring into Home. The ring is shippable on its own without the completion screen.
4. **Assessment Complete verification.** Already on branch; finish the render test.
5. **Small visual ports** in any order: monthly stats footnote (roadmap 1.3), `BottomTabIcon` (2.3), `SectionHeader` rollout (6.1), colour-semantics audit (6.4).
6. **`SessionCompleteScreen`.** Depends on the ring component. Adds the final motivation moment.
7. **Seed script for go-live cohort.** Can run in parallel from step 1 onward; needs operations-team input for source format.

### Open product questions for the next grilling session

The next `grill-with-docs` session should resolve the remaining branches before any of the deferred roadmap items are spec'd. The list is in `CONTEXT.md` under "Open questions for the next grill-with-docs session" — covering assessment colour thresholds, today vs sessions tab, children auto-route, session lifecycle/timer/backfill, login motif, Yebo during-day, 1000 Stories group entity, and ECD day-1 random partition timing.

### Issue tracker

This PRD has not been published to an issue tracker — no tracker integration was set up at the time of writing. If a GitHub issue (or other tracker) is desired, copy this document body into an issue and apply the `ready-for-agent` label per the project's convention.

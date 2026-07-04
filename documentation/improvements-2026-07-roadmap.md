# Improvements 2026-07: Phased Implementation Roadmap

**Date:** 2026-07-03
**Source:** [`documentation/improvements-2026-07.md`](./improvements-2026-07.md) (the ranked 16-item review). Item numbers below refer to that document.
**Status:** Roadmap approved-pending-review. Phase 1 has a detailed TDD plan at `docs/superpowers/plans/2026-07-03-improvements-phase1-safety-net.md`.

## Process decision: spec first, or plan first?

Decision: **no new top-level spec.** The ranked review is already spec-grade for most items (verified `file:line` evidence, concrete fix direction, verification hints). The workflow that shipped Items 3, 4, 5 and 8 in June is the one to repeat:

1. **This roadmap** sequences the work into phases with gates.
2. **A detailed TDD plan per phase, written just-in-time** when the phase starts (per the `writing-plans` skill). Plans written months ahead go stale in this repo; ~111 commits landed in the 2.5 weeks after the June review.
3. **A short design spec only where a phase contains real design decisions.** Three are flagged: facade retirement order (item 9), sync error-classification policy (item 11a), and the shared BottomSheet + capture-chrome component APIs (item 12). Everything else goes straight to a TDD plan.
4. **Two-LLM plan review** (codex loop) on each plan before building, build-log updates during, device gates where behavior changes on-device.

## Phase overview

| Phase | Items | Theme | Effort | Planning artifact | Gate |
|-------|-------|-------|--------|-------------------|------|
| 1 | 7, 4, 3, 5 | Safety net + one-liner integrity fixes | ~1-2 days | TDD plan (written) | CI green on main; suite deflaked |
| 2 | 1, 2 | Clock-in + mastery data integrity | ~2-4 days | TDD plan, just-in-time | Device pass of both flows |
| 3 | 6a, 6b | The re-render/no-op-sync amplifier | ~1-2 days | TDD plan, just-in-time | Idle profile evidence + tests |
| 4 | 8, 10 | Read-path efficiency + local dates | ~3-5 days | TDD plan, just-in-time | Query-count regression tests |
| 5 | 9 (+6c), 11, 12 | Architecture seams | 1-2 weeks, incremental | **Three mini-specs first**, then TDD plans | Contract map current; WelaPLUS unblocked |
| 6 | 13, 14, 15 | Product polish + motivation loop | interleave | TDD plan per item | Device pass per item |
| Continuous | 16 | Hygiene sweep | opportunistic | none | n/a |

## Phase 1: Safety net + one-liner integrity fixes (items 7, 4, 3, 5)

Do first because everything after lands behind it, and nothing here has design ambiguity.

- **Deflake `LetterMasteryPanel.test.js`** (7b): root-cause the toggle race before touching CI; the suspicion is the panel blocking UI state on an awaited `refreshSyncStatus()`, which is also a real device-latency smell.
- **NetInfo unknown-reachability fix** (4): `isInternetReachable !== false` at `OfflineContext.js:141` and `:200`.
- **Session-form leave guard** (3): `beforeRemove` confirm on dirty state, `allowLeaveRef` released just before the success `navigation.replace`.
- **Covering-index migration, schema v5** (5): ~8 plain indexes on hot FK columns; local-only DDL, no Supabase migration, no contract-map change.
- **CI workflow** (7a): unit + integration on Node 20 per `.nvmrc`. Last task in the phase, after the deflake.

**Gate:** `tests.yml` green on main across unit + integration; three consecutive green full-suite runs locally.

## Phase 2: Clock-in + mastery data integrity (items 1, 2)

The two remaining data-corruption paths. Slightly larger because both fixes are extractions, not patches.

- **Item 1:** promote time tracking to a `TimeTrackingContext` (single truth, one timer, compat shim for the two call sites), belt-and-braces re-check of `getActiveTimeEntry` inside sign-in/sign-out, and a repository guard against a second open entry.
- **Item 2:** extract one shared mastery-state loader used by both `LetterMasteryPanel` and `LetterTrackerBottomSheet`; the `assessment_type` filter bug gets fixed in the shared code, not patched into the copy. Keep write timing (immediate vs deferred `pendingChanges`) as the only variation point.

**Gate:** device pass: clock in via the session-launch dialog, return Home, verify one open entry and consistent UI both directions; word-assessment-then-letter-tracker cross-check shows identical mastery in the session sheet and ChildResults.

## Phase 3: The amplifier (items 6a, 6b)

One small PR with outsized effect; do before Phase 4 so read-path measurements aren't polluted by the churn.

- Bail the 30s poll when sync-status counts are unchanged; memoize all five provider values and their API functions; stop re-subscribing NetInfo/AppState listeners on count changes.
- Gate the auto-sync trigger on records actually ready (`next_retry_at <= now`) so a backed-off record stops driving a no-op full pass every 30 seconds.

**Gate:** regression tests for the poll-bail and ready-gating; a before/after render-count or profiler capture on emulator showing the idle 30s cascade gone.

## Phase 4: Read-path efficiency + local dates (items 8, 10)

Depends on Phase 1's indexes (makes the batched queries fast) and benefits from Phase 3 (fewer spurious reloads to measure around).

- Batched `WHERE ... IN (...)` hydration in sessions/assessments repositories; aggregate `COUNT`/`GROUP BY` methods for Home and list stats; SQL-side date cutoffs; `childId` filter in `LetterMasteryPanel`; one-pass `Map` builds for the O(n²) spots; `SectionList` + bounded query for `TimeEntriesListScreen`; targeted mastery lookup in `persistLiteracySession`.
- `utils/localDate.js` + point the three storage formatters, seven display helpers, and the two live UTC bugs (TimeEntriesList day grouping, dashboardStats days-worked) at it.

**Gate:** query-count regression tests (spy on the db client, assert 2-3 queries per screen load instead of 1+2N); the two UTC bugs pinned by tests with SAST-boundary timestamps.

## Phase 5: Architecture seams (items 9 + 6c, 11, 12). Spec-first.

The three mini-specs to write when this phase starts (each 1-2 pages, `grill-with-docs` optional):

1. **Facade retirement (9 + 6c):** deletion order for the dead two-thirds, context-by-context migration order, `deviceSettings` module API over `localStateRepository`, and the re-pull decoupling decision (watermark vs sign-in/interval-only) since it lands on the same lines.
2. **Sync convergence policy (11a, then 11b-11d):** terminal-vs-long-cap decision for deterministic server errors (`PGRST204`, `42703`, `22P02`, `23502`), record-scoped dependency skipping, queue-granularity for the child-data pull, outbox bookkeeping batching + `created_at` preservation. Contract-map update is part of the definition of done.
3. **Component APIs (12):** the shared BottomSheet primitive (then convert the four Dialog pickers, full rollout per the consistency rule) and the extracted capture chrome (`AssessmentInstructions`, capture header). Includes the session-type machinery decision (promote `session_type_id` to a real column or delete the machinery).

**Sequencing constraint:** item 12 must land **before** WelaPLUS capture-Pattern implementation begins; items 9 and 11 can proceed incrementally alongside anything.

## Phase 6: Product polish (items 13, 14, 15)

- **13:** logger Error serialization + stringify guard; real GPS timeout + `canAskAgain` handling.
- **14:** motivation loop (zero-class Home hero, ring payoff navigation, staged ring colours via shared helper + tokens, `deviceTier` before any animation work).
- **15:** typography token rollout with a fail-closed size-floor guard test, plus the nav stragglers (child CRUD screens into the Children stack, shared back-button component).

**Pull-forward flag:** 14a (zero-class onboarding) is go-live blocking, not polish. If a go-live date firms up before Phase 6, pull 14a into whatever phase is active. The ClassDetail row-tap flip stays with the group-centric feature item where the build log routed it.

## Continuous: hygiene (item 16)

Dead deps (`react-hook-form`, `expo-linear-gradient`, `@testing-library/jest-native`; `jest-expo` to devDependencies), `npx expo lint` wired into CI, dev backend default flip after cutover, `normalizeLanguageKey` in `AssessmentChildSelectScreen`, Profile/Home polish cluster, `resetTestDatabase()` helper, coverage script, `.plan5` renames on touch, session-edit attendee-diff pinning test. Batch opportunistically; none blocks a phase.

## Working agreements (apply to every phase)

- Branch per phase or per item: `improvement/p<phase>-<slug>` (e.g. `improvement/p1-safety-net`).
- TDD skill loop for all code tasks; red before green; frequent commits.
- Two-LLM plan review (codex) on each phase plan before building; engage findings substantively.
- `documentation/sqlite-refactor-log.md` entry per work session for anything touching db/sync; `documentation/rls-sync-contract-map.md` whenever a synced table, payload, policy, or outbox ordering changes (Phase 5 item 11 is the only phase expected to touch it).
- Device gates recorded in the build log with date + device, per the Item 4/5 convention.
- PRD.md Development Progress checklist entry when a phase starts.

# Assessment Render-Performance Pack — Design

**Date:** 2026-07-09
**Status:** Design (awaiting Jim's spec review before writing-plans)
**Source of truth for the problem:** `documentation/zz-field-lessons-sync-review-2026-07-04.html`, Finding 5 (P1).
**Scope:** device render-performance and timer-correctness of the assessment capture flow. This is **not** a sync change; `documentation/rls-sync-contract-map.md` is not touched.

## Problem

On low-end field Android (Galaxy A03s class), the EGRA assessment capture screen lags on every tap and the countdown drifts. ZZ measured and fixed the identical design in the field (OTA 1.1.0+15). Masi's exposure grows because the WelaPLUS battery brings more and longer assessments. Masi already shipped the sibling fix for the time-tracker (`src/components/common/ElapsedTime.js`, commit `3b5d507`); this applies the same medicine to the assessment seam.

Five concrete defects, verified in the current tree:

1. **Tick-counting timer drifts.** `src/hooks/useAssessmentSession.js:59-62` runs `elapsedRef.current += 1` in a `setInterval`. When Android throttles or coalesces timer ticks under CPU pressure, the counter under-counts real elapsed time, so the child gets more than 60 seconds and the recorded `completion_time` under-reports.
2. **No background handling.** No `AppState` involvement anywhere in the capture flow. Backgrounding silently stops the tick counter (accidental "free time").
3. **No authoritative expiry.** Expiry is inferred from the drifting counter (`elapsedRef.current >= ASSESSMENT_DURATION`, `useAssessmentSession.js:62`). There is no `isExpired()` helper (grep: zero matches) and no time guard on the capture-mutation paths.
4. **Per-second whole-screen re-render.** `setTimeRemaining(...)` at `useAssessmentSession.js:61` runs inside the hook, and the hook runs inside each capture screen, so every 1 Hz tick re-renders the entire screen subtree, including the sibling `EgraLetterGrid`.
5. **Un-memoized tiles.** `src/components/assessment/EgraLetterGrid.js:15-53` renders tiles as inline `Pressable` JSX with a fresh `onPress` closure (`:23`) and fresh `style` function (`:24-32`) per tile per render. No `React.memo` anywhere. Every render repaints all ~20 tiles. ZZ measured 26 -> 1 repaints per tap after memoization.

The `completion_time` angle matters beyond UI: `elapsedSeconds` (currently the raw tick count) is written to the saved record via `buildAssessmentRecord` (`src/utils/assessmentScoring.js:55`, `completion_time: elapsedSeconds`). Fixing the clock fixes the recorded metric too.

## Decisions locked with Jim (2026-07-09)

- **Background = pause & resume.** When the app is backgrounded mid-assessment, the clock freezes and resumes on return. Rationale: a background event during an EGRA read is almost always an accidental interruption (notification, misclick, call); pausing protects an otherwise-valid read. Accepted trade-off: a mid-read pause can slightly inflate fluency versus a strictly continuous 60-second norm; the alternative (silently eating the child's seconds) is worse and more common. ZZ field-validated pause.
- **Testing = render-spy + device.** In addition to behavioral tests, add a render-count test asserting exactly one tile re-renders per tap (proves the 26 -> 1 claim in CI), plus a manual low-end device/emulator check.

## Technical choices (author's calls, recorded)

- **Clock source: monotonic `performance.now()` via an injectable clock module, not `Date.now()`.** (Revised after the Codex adversarial review, disposition R7.) The initial design used `Date.now()` for parity with `ElapsedTime.js`, but a 60-second *standardized* assessment whose elapsed feeds a recorded `completion_time` is exactly the case where wall-clock jump-immunity matters: an NTP correction or manual clock change can move `Date.now()` backward (granting extra time) or forward (early expiry), and clamping to `[0, duration]` only bounds that error, it does not prevent elapsed from reversing. `performance.now()` is monotonic and unaffected by clock changes; the explicit background pause means we never rely on its background behavior. This realigns with Finding 5's field-validated approach. The clock lives in `src/utils/monotonicClock.js` (`now()` = `performance.now()` with a `Date.now()` fallback) so it is mockable in tests. Elapsed is still clamped to `[0, ASSESSMENT_DURATION * 1000]`.
- **Expiry authority stays in the hook (ref-based), not in the display leaf.** The display leaf is cosmetic and may be stale by up to one second on resume (same property as `ElapsedTime.js`); the hard-stop must not depend on it being mounted.

## Design: four seams

### Seam A — Monotonic timekeeping in the hook (refs, zero re-render)

Replace tick-counting with timestamp accounting. New refs in `useAssessmentSession`:

- `runningRef` — intent flag: true between `startActive` and the first `stopTimer`/finish.
- `startedAtRef` — `monotonicNow()` (`performance.now()`) when the clock is actively accruing; `null` while paused, frozen, or stopped.
- `accumulatedMsRef` — milliseconds banked from earlier active segments (before pauses/freezes).

Derived helpers (both `useCallback`, stable identity):

- `getElapsedMs()` = `accumulatedMsRef + (startedAtRef != null ? monotonicNow() - startedAtRef : 0)`, clamped to `[0, ASSESSMENT_DURATION * 1000]`.
- `isExpired()` = `getElapsedMs() >= ASSESSMENT_DURATION * 1000`.

Lifecycle:

- `startActive`: `accumulatedMsRef = 0; startedAtRef = Date.now(); runningRef = true; setPhase('active')`.
- `stopTimer` (freeze precisely, e.g. before the last-attempted sheet): bank `Date.now() - startedAtRef` into `accumulatedMsRef`, set `startedAtRef = null`, `runningRef = false`, clear the expiry interval. Preserves the current "freeze the clock while the sheet is open" intent without setting `hasFinishedRef`.
- `finishAndSave`: snapshot `elapsedSeconds = min(ASSESSMENT_DURATION, round(getElapsedMs() / 1000))` **before** freezing, then freeze (as `stopTimer`) and `setPhase('finished')`.

Expiry detection: the `phase === 'active'` effect starts an interval that each second checks `isExpired()` **and** `isForegroundRef.current`, and only when both hold clears itself and fires `onTimerExpireRef.current()` (disposition R8: never finalize while backgrounded; defers to the next foreground tick). It performs no `setState` the screen observes. Only `timeRemaining` and `isPaused` state are removed from the hook; `phase` state is retained (it still drives the instructions/active/finished UI). See Public interface.

### Seam B — Background pause via AppState

A dedicated effect subscribes to `AppState` for the life of the screen. It maintains `isForegroundRef` (default `true`) on every change, then gates the clock on `runningRef`:

- Always: `isForegroundRef.current = (next === 'active')`.
- On `background`/`inactive`: if `runningRef && startedAtRef != null`, bank `monotonicNow() - startedAtRef` into `accumulatedMsRef` and set `startedAtRef = null` (pause).
- On `active`: if `runningRef && startedAtRef == null`, set `startedAtRef = monotonicNow()` (resume).

Because `runningRef` gates resume, a clock frozen by `stopTimer` (last-attempted sheet) or finish never un-freezes on foreground. The `isForegroundRef` defaults to `true` so headless/hook tests that never emit an AppState change still finalize on expiry (the RN AppState jest mock exposes `currentState` as a `jest.fn`, not a string, so the watchdog must consult this internal ref, not `AppState.currentState`). The user never sees a "PAUSED" state (pause happens while backgrounded, resume completes before the screen repaints), so no paused UI is added.

### Seam C — Isolated 1 Hz countdown leaf

New `src/components/assessment/CountdownTimer.js`, mirroring `ElapsedTime.js`:

- Props: `getElapsedMs` (stable callback), `durationSeconds = ASSESSMENT_DURATION`.
- Holds its own `now` state, ticks 1 Hz via `setInterval`, computes `remaining = max(0, durationSeconds - floor(getElapsedMs() / 1000))`, and renders the existing presentational `<AssessmentTimer timeRemaining={remaining} />`.
- Only this leaf re-renders each second. `AssessmentTimer` stays a pure presentational component (unchanged; its now-unused `isPaused` prop is left in place to minimize churn).

### Seam D — Memoized tile

Extract the inline `Pressable` from `EgraLetterGrid` into `src/components/assessment/LetterTile.js` wrapped in `React.memo`. Props are **scalars** so unchanged tiles skip re-render:

- `letter` (string), `index` (globalIndex), `state` (`true` | `false` | `undefined`, i.e. `letterStates[globalIndex]`), `isCurrent` (boolean, i.e. `globalIndex === currentIndex`), `onPress` (stable callback receiving `index`), `disabled`, `readOnly`, and sizing primitives (`width`, `height`, `baseFontSize`, `digraphFontSize`, `wordFontSize`).

The crux of 26 -> 1: the grid must pass `state={letterStates[globalIndex]}` and `isCurrent={globalIndex === currentIndex}` (scalars), **not** the whole `letterStates` object. Passing the object would re-render every tile on any change. `onPress` is the already-stable `handleToggle` (`useCallback`, Letter screen) in grid mode and `undefined` in sequential (read-only). The tile builds its own style array internally, recreated only when the tile itself renders.

The grid function still re-runs and re-`.map`s on a tap (creating ~20 lightweight element descriptors), but `React.memo` short-circuits the actual render of the ~19 unchanged tiles. Grid-level `React.memo` is intentionally **not** added: with the timer isolated, the screen re-renders only on tap/page/phase changes, all of which change grid props, so a grid-level memo would never skip. The tile is where the win is.

## Public interface changes

`useAssessmentSession` return:

- **Removed:** `timeRemaining`, `isPaused`, `setIsPaused` (the latter was already dead — never called).
- **Added:** `getElapsedMs`, `isExpired`.
- **Unchanged:** `phase`, `setPhase`, `layout`, `hasFinishedRef`, `startActive`, `stopTimer`, `finishAndSave`, `setOnTimerExpire`.

Consumers (both capture screens):

- Replace `<AssessmentTimer timeRemaining={timeRemaining} isPaused={isPaused} />` with `<CountdownTimer getElapsedMs={getElapsedMs} />`.
- Add the `isExpired()` hard-stop guard at every capture-mutation path:
  - `LetterAssessmentScreen.handleToggle` (`:43-56`): if `isExpired()`, call `handleFinish()` and return (do not record).
  - `SequentialAssessmentScreen.decide` (`:42-47`): if `isExpired()`, call `finishWith(stateRef.current)` and return.
  - `SequentialAssessmentScreen.goBack` (`:57`): if `isExpired()`, call `finishWith(stateRef.current)` and return (no corrections after time is up).
- `EgraLetterGrid` renders `LetterTile` with scalar props (Seam D). Grid public props are unchanged.

Both `handleFinish` and `finishWith` are idempotent via `hasFinishedRef`/`finishStartedRef`, so the tap-level guard and the interval-level expiry can both fire safely (belt and suspenders for a device so throttled the interval lags real time).

## Data integrity

`completion_time` (`elapsedSeconds`) changes from the raw tick count to real elapsed seconds (`round(getElapsedMs()/1000)`, capped at 60). This is strictly more accurate; no schema or sync change. Note it in `documentation/sqlite-refactor-log.md`.

## Edge cases

- **stopTimer + background (last-attempted sheet):** handled by `runningRef` gating resume (Seam B).
- **Expired tap between last tick and finish:** dropped by the `isExpired()` guard; finish is idempotent.
- **Double-tap on final item (sequential):** existing cursor-bound guard (`:45`) preserved; expiry guard is additive.
- **Wall-clock jump during active window:** with the monotonic `performance.now()` clock (R7), device clock changes (NTP/manual) cannot affect elapsed, expiry, or `completion_time`; a dedicated test asserts a `setSystemTime` jump leaves elapsed unchanged. Elapsed is still clamped to `[0, duration]`.
- **Expiry during a background transition (R8):** the watchdog only finalizes while `isForegroundRef.current` is true, so it never finalizes an assessment whose stimulus is hidden; finalization defers to the first foreground tick.
- **Resume staleness:** the leaf may show a value up to 1 second stale until its next tick after foreground; acceptable and identical to `ElapsedTime.js`.

## Testing plan

Behavioral (Jest, real timers faked + `Date.now` mocked + `AppState` mocked):

1. **Drift immunity:** advance `Date.now` by 5 s while firing only 2 interval ticks; assert remaining reflects the 5 s delta, not the tick count.
2. **isExpired hard-stop:** with elapsed >= 60 s, a `handleToggle`/`decide` records nothing and triggers finish.
3. **Background pause:** background at 10 s, advance real time 30 s, foreground; assert elapsed is still ~10 s.
4. **runningRef guard:** after `stopTimer`, a background/foreground cycle does not resume the clock.
5. **Interface stability:** `getElapsedMs`, `isExpired`, `onToggle` keep stable identity across renders; hook no longer returns `timeRemaining`.

Render-spy (Jest):

6. Render the grid with an injected render-spy (a test-only optional prop that is a no-op in production, or an equivalent module-level counter). Assert: initial mount renders N tiles; one tap that flips one tile's `state` re-renders exactly 1 tile.

Device/emulator (manual, documented as device-verified in the log):

7. On a low-end device/emulator: taps feel immediate, countdown is smooth and accurate to wall-clock, backgrounding pauses and foregrounding resumes, expiry hard-stops.

Additional tests from the Codex review (R7-R11):

8. **Clock jump-immunity (R7):** with the real monotonic clock, `startActive` then `jest.setSystemTime` a large backward/forward wall-clock jump; assert `getElapsedMs`, `isExpired`, and `completion_time` are unchanged (verified: `setSystemTime` does not move `performance.now`).
9. **Watchdog-uses-the-clock (R10):** with the clock module mocked, advance elapsed past 60 s and fire exactly one watchdog tick (no tap); assert `onTimerExpire` fires once. A regression to tick-counting would not expire on a single tick and would fail.
10. **Foreground-gated finalize (R8):** simulate `background` then advance/expire; assert the watchdog does not finalize; then `active` and assert it finalizes.
11. **Screen-level render-count (R9):** render `LetterAssessmentScreen` with the `LetterTile` spy, start, clear the spy, tap one real tile; assert exactly one tile re-renders. This guards the real `handleToggle -> handleFinish -> finishAndSave` `onPress` identity chain that the grid-only Harness test cannot.

Known flake to expect: `CreateClassScreen.test.js` times out under parallel load, passes in isolation (not a regression). Run tests under Node 20 (`PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`).

## Files touched

- `src/utils/monotonicClock.js` — new (R7); `now()` = `performance.now()` with `Date.now()` fallback; **resolves `globalThis.performance` inside `now()` on every call** (R12: caching it at import would read the real clock after `jest.useFakeTimers` swaps `global.performance`, breaking the fake-timer tests); mockable in tests.
- `src/hooks/useAssessmentSession.js` — Seams A, B (monotonic clock + `isForegroundRef`); interface change.
- `src/components/assessment/CountdownTimer.js` — new (Seam C).
- `src/components/assessment/LetterTile.js` — new (Seam D).
- `src/components/assessment/EgraLetterGrid.js` — render `LetterTile` with scalar props.
- `src/screens/assessments/LetterAssessmentScreen.js` — consume `CountdownTimer`, add `isExpired()` guard.
- `src/screens/assessments/SequentialAssessmentScreen.js` — consume `CountdownTimer`, add `isExpired()` guards.
- `src/components/assessment/AssessmentTimer.js` — unchanged (kept as pure presentational).
- Tests under `src/**/__tests__` for the above.
- `documentation/sqlite-refactor-log.md` — log the work and the `completion_time` semantics note.

## Non-goals

- No sync/RLS change; `rls-sync-contract-map.md` untouched.
- No change to scoring, letter sets, capture modes, or the results screen.
- No visible pause/resume UI.
- No grid-level `React.memo` (see Seam D rationale).

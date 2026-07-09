# Assessment Render-Performance Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate assessment-capture tap lag and countdown drift on low-end field Android by isolating the 1 Hz countdown into a self-ticking leaf, memoizing grid tiles, and replacing tick-counting with a monotonic `performance.now()` clock that pauses on background and hard-stops on expiry.

**Architecture:** Timekeeping becomes ref-based and monotonic inside `useAssessmentSession` (no per-tick screen re-render). A new `CountdownTimer` leaf self-ticks and reads `getElapsedMs()` so only it re-renders each second. Grid tiles move into a `React.memo` `LetterTile` fed scalar props. An authoritative `isExpired()` guards every capture-mutation path. Background is an explicit pause. This is not a sync change.

**Tech Stack:** React Native (Expo, Hermes) + React 18 + `@testing-library/react-native` v13 + Jest (`jest-expo` preset) + React Native Paper.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-09-assessment-render-perf-design.md` (locked decisions: background = pause & resume; testing = render-spy + device).
- Clock source is a monotonic `performance.now()` via `src/utils/monotonicClock.js` (`now()` with a `Date.now()` fallback), clamped to `[0, ASSESSMENT_DURATION * 1000]`. Revised from `Date.now()` per adversarial-review disposition R7; do NOT revert to `Date.now()` deltas for elapsed (wall-clock jumps would corrupt a standardized timer). `Date.now()`/`new Date()` remain fine for the record timestamp (`now: new Date()`).
- `ASSESSMENT_DURATION = 60` (seconds), from `src/constants/egraConstants.js`. Duration in ms is `ASSESSMENT_DURATION * 1000`.
- Tests live flat in `/__tests__/` as `*.test.js`. Run under Node 20: prefix commands with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Known flake (not a regression): `CreateClassScreen.test.js` can time out under parallel load; it passes in isolation.
- Not a sync/RLS change: do NOT touch `documentation/rls-sync-contract-map.md`, migrations, or repository sync paths.
- Authored text (code comments, commit messages, docs): no em dashes; no agent co-author trailer on commits.
- Commit style: `type(scope): message`. Stage only each task's named files.

## File Structure

- `src/utils/monotonicClock.js` (create) — `now()` = `performance.now()` (with `Date.now()` fallback); the single monotonic time source, mockable in tests (R7).
- `src/hooks/useAssessmentSession.js` (modify) — monotonic timekeeping refs, `getElapsedMs`, `isExpired`, AppState pause + `isForegroundRef`, `runningRef`-gated `startActive`/`stopTimer`; later drops `timeRemaining`/`isPaused`.
- `src/components/assessment/CountdownTimer.js` (create) — self-ticking 1 Hz leaf; renders `AssessmentTimer`.
- `src/components/assessment/LetterTile.js` (create) — `React.memo` single tile, scalar props.
- `src/components/assessment/EgraLetterGrid.js` (modify) — render `LetterTile` with scalar props.
- `src/components/assessment/AssessmentTimer.js` (unchanged) — stays a pure presentational bar+text.
- `src/screens/assessments/LetterAssessmentScreen.js` (modify) — consume `CountdownTimer`, add `isExpired()` guard.
- `src/screens/assessments/SequentialAssessmentScreen.js` (modify) — consume `CountdownTimer`, add `isExpired()` guards.
- Tests (create): `__tests__/useAssessmentSession.timer.test.js`, `__tests__/useAssessmentSession.clockJump.test.js`, `__tests__/CountdownTimer.test.js`, `__tests__/LetterTile.test.js`, `__tests__/EgraLetterGrid.renderCount.test.js`, `__tests__/LetterAssessmentScreen.expiry.test.js`, `__tests__/LetterAssessmentScreen.renderCount.test.js`, `__tests__/SequentialAssessmentScreen.expiry.test.js`, `__tests__/SequentialAssessmentScreen.renderCount.test.js`, `__tests__/LetterAssessmentScreen.renderIsolation.test.js`.
- Docs (modify): `documentation/sqlite-refactor-log.md`, and spec status line.

---

### Task 1: Hook — monotonic timekeeping, `getElapsedMs`, `isExpired`

Replace tick-counting with monotonic `performance.now()`-delta accounting (via `monotonicClock.now()`, R7). Keep `timeRemaining`/`isPaused` in the return for now (removed in Task 7) so both screens keep compiling. The display interval now derives from the monotonic clock (already drift-free) and also runs the expiry watchdog.

**Files:**
- Create: `src/utils/monotonicClock.js` (R7: mockable monotonic clock)
- Modify: `src/hooks/useAssessmentSession.js`
- Test: `__tests__/useAssessmentSession.timer.test.js`, `__tests__/useAssessmentSession.clockJump.test.js`

**Interfaces:**
- Produces: `monotonicClock.now(): number` (`performance.now()` ms with `Date.now()` fallback); `getElapsedMs(): number` (clamped ms elapsed, monotonic), `isExpired(): boolean`, `startActive(): void`, `stopTimer(): void` (freezes clock, banks elapsed, clears watchdog, sets `runningRef=false`), plus still-returned `phase`, `setPhase`, `layout`, `hasFinishedRef`, `finishAndSave`, `setOnTimerExpire`, and (transitional) `timeRemaining`, `isPaused`.
- Consumes: `ASSESSMENT_DURATION` from `src/constants/egraConstants.js`; `now` from `src/utils/monotonicClock.js`; `buildAssessmentRecord` unchanged.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/useAssessmentSession.timer.test.js`. The monotonic clock module is mocked with a mutable `mockNow` so elapsed can be controlled independently of jest timers; this is what lets the R10 test advance elapsed past the deadline while firing only a single watchdog tick.

```javascript
import { renderHook, act } from '@testing-library/react-native';

// Mockable monotonic clock (R7/R10): control elapsed independently of jest fake timers.
let mockNow = 0;
jest.mock('../src/utils/monotonicClock', () => ({ now: () => mockNow }));

import { useAssessmentSession } from '../src/hooks/useAssessmentSession';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const makeArgs = () => ({
  navigation: { addListener: jest.fn(() => jest.fn()), replace: jest.fn(), goBack: jest.fn(), dispatch: jest.fn() },
  child: { id: 'child-1' },
  letterSet: { letters: ['a', 'b'], lettersPerPage: 20, columns: 5, language: 'English' },
  attemptNumber: 1,
  assessmentType: 'letter_egra',
  captureMode: 'grid',
  isWordAssessment: false,
});

describe('useAssessmentSession monotonic timekeeping', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockNow = 0;
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ triggerBackgroundSync: jest.fn(), refreshSyncStatus: jest.fn() });
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

  test('elapsed reads the monotonic clock (immune to throttled ticks)', () => {
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });
    // Clock advances 5s with NO watchdog ticks fired (simulates Android throttling).
    mockNow = 5000;
    expect(result.current.getElapsedMs()).toBe(5000);
    expect(result.current.isExpired()).toBe(false);
  });

  test('watchdog finalizes from the clock, not a tick count (R10)', () => {
    const onExpire = jest.fn();
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.setOnTimerExpire(onExpire); result.current.startActive(); });
    // Elapsed jumps past the deadline; fire EXACTLY ONE watchdog tick. A tick-count
    // regression would need 60 ticks and would NOT expire here.
    mockNow = 60001;
    act(() => { jest.advanceTimersByTime(1000); });
    expect(result.current.isExpired()).toBe(true);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  test('elapsed is clamped to the duration ceiling', () => {
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });
    mockNow = 120000;
    expect(result.current.getElapsedMs()).toBe(60000);
  });

  test('stopTimer freezes elapsed at the banked value', () => {
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });
    mockNow = 8000;
    act(() => { result.current.stopTimer(); });
    mockNow = 30000;
    expect(result.current.getElapsedMs()).toBe(8000);
  });
});
```

Also create `__tests__/useAssessmentSession.clockJump.test.js`. This one does NOT mock the clock, so it proves the real `performance.now()`-based clock is immune to wall-clock (`Date`) changes (verified: `jest.setSystemTime` does not move `performance.now`).

```javascript
import { renderHook, act } from '@testing-library/react-native';
import { useAssessmentSession } from '../src/hooks/useAssessmentSession';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const makeArgs = () => ({
  navigation: { addListener: jest.fn(() => jest.fn()), replace: jest.fn(), goBack: jest.fn(), dispatch: jest.fn() },
  child: { id: 'child-1' },
  letterSet: { letters: ['a', 'b'], lettersPerPage: 20, columns: 5, language: 'English' },
  attemptNumber: 1, assessmentType: 'letter_egra', captureMode: 'grid', isWordAssessment: false,
});

describe('useAssessmentSession clock jump-immunity (R7)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-09T08:00:00.000Z'));
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ triggerBackgroundSync: jest.fn(), refreshSyncStatus: jest.fn() });
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

  test('a wall-clock jump does not change elapsed or expiry', () => {
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });
    act(() => { jest.advanceTimersByTime(10000); }); // advances performance.now by 10s
    const before = result.current.getElapsedMs();
    expect(before).toBe(10000);
    act(() => { jest.setSystemTime(new Date('2026-07-09T07:00:00.000Z')); }); // wall clock -1h
    expect(result.current.getElapsedMs()).toBe(before);
    act(() => { jest.setSystemTime(new Date('2026-07-09T09:00:00.000Z')); }); // wall clock +1h
    expect(result.current.getElapsedMs()).toBe(before);
    expect(result.current.isExpired()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest useAssessmentSession.timer useAssessmentSession.clockJump -c package.json`
Expected: FAIL (`src/utils/monotonicClock` cannot be resolved; `getElapsedMs`/`isExpired` are not functions).

- [ ] **Step 3a: Create the monotonic clock module**

Create `src/utils/monotonicClock.js`:

```javascript
// Monotonic time source for the assessment timer. performance.now() is immune to wall-clock
// (Date) changes - NTP corrections, manual clock changes - which matters for a standardized
// 60-second timed assessment whose elapsed feeds completion_time. Falls back to Date.now()
// only if performance.now is unavailable.
//
// IMPORTANT (R12): resolve globalThis.performance INSIDE now() on every call. Do NOT capture
// `performance` at module-eval time: jest.useFakeTimers() replaces global.performance with a
// fake, and a captured reference would keep reading the real clock (verified: captured-delta=0
// vs resolved-delta=60000 under advanceTimersByTime(60000)), silently breaking the existing
// completion_time===60 expiry test.
export function now() {
  const perf = globalThis.performance;
  return (perf && typeof perf.now === 'function') ? perf.now() : Date.now();
}
```

- [ ] **Step 3b: Rewrite the hook's timekeeping**

Replace the entire contents of `src/hooks/useAssessmentSession.js` with:

```javascript
import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { assessmentsRepository } from '../db/repositories/assessmentsRepository';
import { ASSESSMENT_DURATION } from '../constants/egraConstants';
import { buildAssessmentRecord } from '../utils/assessmentScoring';
import { spacing } from '../constants/colors';
import { now as monotonicNow } from '../utils/monotonicClock';

const DURATION_MS = ASSESSMENT_DURATION * 1000;

export function useAssessmentSession({
  navigation, child, letterSet, attemptNumber = 1, assessmentType, captureMode, isWordAssessment,
}) {
  const { user } = useAuth();
  const { triggerBackgroundSync, refreshSyncStatus } = useOffline();

  const [phase, setPhase] = useState('instructions');
  // Transitional display state; removed in the render-isolation cleanup task.
  const [timeRemaining, setTimeRemaining] = useState(ASSESSMENT_DURATION);
  const [isPaused, setIsPaused] = useState(false);

  const timerRef = useRef(null);
  const hasFinishedRef = useRef(false);
  const allowLeaveRef = useRef(false);
  const abandonedRef = useRef(false);

  // Monotonic timekeeping: monotonicNow()-delta accounting means no tick-counting and no drift.
  const runningRef = useRef(false);    // intent: clock should accrue (between startActive and stop/finish)
  const startedAtRef = useRef(null);   // monotonicNow() of the current accruing segment; null while paused/frozen/stopped
  const accumulatedMsRef = useRef(0);  // ms banked from earlier segments (before pauses/freezes)

  const onTimerExpireRef = useRef(() => {});
  const setOnTimerExpire = useCallback((fn) => { onTimerExpireRef.current = fn; }, []);

  const getElapsedMs = useCallback(() => {
    const running = startedAtRef.current != null;
    const raw = accumulatedMsRef.current + (running ? monotonicNow() - startedAtRef.current : 0);
    return Math.min(DURATION_MS, Math.max(0, raw));
  }, []);

  const isExpired = useCallback(() => getElapsedMs() >= DURATION_MS, [getElapsedMs]);

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const COLUMNS = letterSet.columns || 5;
  const ROWS = (letterSet.lettersPerPage || 20) / COLUMNS;
  const GAP = spacing.sm;
  const timerRowHeight = spacing.md * 2 + 14;
  const pageInfoHeight = 20 + spacing.xs + 8 + spacing.sm;
  const navRowHeight = 48 + spacing.md + spacing.md;
  const gridVerticalPadding = spacing.sm * 2;
  const availableHeight = screenHeight - insets.top - timerRowHeight - pageInfoHeight
    - navRowHeight - Math.max(insets.bottom, spacing.md) - gridVerticalPadding;
  const availableWidth = screenWidth - spacing.md * 2;
  const tileWidthFromColumns = (availableWidth - GAP * (COLUMNS - 1)) / COLUMNS;
  const tileHeightFromRows = (availableHeight - GAP * (ROWS - 1)) / ROWS;
  const tileWidth = Math.max(44, Math.floor(tileWidthFromColumns));
  const tileHeight = Math.max(44, Math.floor(Math.min(tileHeightFromRows, isWordAssessment ? 64 : tileWidthFromColumns)));
  const tileSize = Math.min(tileWidth, tileHeight);
  const layout = { COLUMNS, GAP, tileWidth, tileHeight, tileSize };

  const startActive = useCallback(() => {
    accumulatedMsRef.current = 0;
    startedAtRef.current = monotonicNow();
    runningRef.current = true;
    setPhase('active');
  }, []);

  // Freeze the clock precisely (parity with the original clearInterval) WITHOUT setting
  // hasFinishedRef, so a later finishAndSave can still save. Banks elapsed, stops accrual.
  const stopTimer = useCallback(() => {
    if (startedAtRef.current != null) {
      accumulatedMsRef.current += monotonicNow() - startedAtRef.current;
      startedAtRef.current = null;
    }
    runningRef.current = false;
    clearInterval(timerRef.current);
  }, []);

  // Display + expiry watchdog. Display is derived from the monotonic clock (drift-free);
  // the watchdog fires onTimerExpire authoritatively.
  useEffect(() => {
    if (phase === 'active' && !isPaused) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(Math.max(0, ASSESSMENT_DURATION - Math.floor(getElapsedMs() / 1000)));
        if (isExpired()) {
          clearInterval(timerRef.current);
          onTimerExpireRef.current();
        }
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [phase, isPaused, getElapsedMs, isExpired]);

  useEffect(() => {
    if (phase !== 'active' && phase !== 'finished') return undefined;
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowLeaveRef.current) return;
      e.preventDefault();
      Alert.alert('End Assessment?', 'Are you sure you want to leave? Your progress will be lost.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => { clearInterval(timerRef.current); abandonedRef.current = true; allowLeaveRef.current = true; navigation.dispatch(e.data.action); } },
      ]);
    });
    return unsubscribe;
  }, [navigation, phase]);

  const finishAndSave = useCallback(async ({ letterStates, finalLastIndex, correctionCount }) => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    const elapsedSeconds = Math.min(ASSESSMENT_DURATION, Math.round(getElapsedMs() / 1000));
    stopTimer();
    setPhase('finished');

    const record = buildAssessmentRecord({
      id: uuidv4(), userId: user.id, childId: child.id, assessmentType, letterSet,
      attemptNumber, captureMode, correctionCount,
      elapsedSeconds,
      finalLastIndex, letterStates, now: new Date(),
    });

    const saveThenNavigate = async () => {
      try {
        await assessmentsRepository.saveAssessment(record);
      } catch (error) {
        Alert.alert('Could not save', 'Saving the assessment failed. Please try again.', [
          { text: 'Retry', onPress: () => { saveThenNavigate(); } },
          { text: 'Discard', style: 'destructive', onPress: () => { abandonedRef.current = true; allowLeaveRef.current = true; navigation.goBack(); } },
        ]);
        return;
      }
      if (abandonedRef.current) return;
      allowLeaveRef.current = true;
      navigation.replace('AssessmentResults', { assessment: record, child, letterSet, attemptNumber, assessmentType });
      triggerBackgroundSync?.();
      refreshSyncStatus?.().catch(() => {});
    };
    await saveThenNavigate();
  }, [user, child, assessmentType, letterSet, attemptNumber, captureMode, navigation, triggerBackgroundSync, refreshSyncStatus, getElapsedMs, stopTimer]);

  return {
    phase, setPhase, timeRemaining, isPaused, setIsPaused, layout,
    hasFinishedRef, startActive, stopTimer, finishAndSave, setOnTimerExpire,
    getElapsedMs, isExpired,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest useAssessmentSession.timer useAssessmentSession.clockJump -c package.json`
Expected: PASS (timer 4 tests + clockJump 1 test).

- [ ] **Step 5: Confirm no regression across BOTH hook consumers (R11)**

The hook file was fully rewritten and is consumed by BOTH capture screens, so run its pre-existing 7-test contract suite (`__tests__/useAssessmentSession.test.js`: idempotency, retry, discard, abandon-during-save, leave-guard, and R7 `completion_time === 60` at expiry) alongside BOTH screens. The `useAssessmentSession` pattern matches the new `.timer`/`.clockJump` files and the existing contract file.

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest useAssessmentSession LetterAssessmentScreen SequentialAssessmentScreen -c package.json`
Expected: PASS (new timer + clockJump suites + existing 7 hook tests + both pre-existing screen suites). R7 stays green because `advanceTimersByTime(60000)` advances `performance.now` by 60000, so `round(60000/1000) === 60`.

- [ ] **Step 6: Commit**

```bash
git add src/utils/monotonicClock.js src/hooks/useAssessmentSession.js __tests__/useAssessmentSession.timer.test.js __tests__/useAssessmentSession.clockJump.test.js
git commit -m "perf(assessment): monotonic performance.now timekeeping with isExpired hard-stop"
```

---

### Task 2: Hook — background-as-pause via AppState

Add an AppState listener that freezes accrual on background/inactive and resumes on foreground, gated by `runningRef` so a clock frozen by `stopTimer`/finish never un-freezes.

**Files:**
- Modify: `src/hooks/useAssessmentSession.js`
- Test: `__tests__/useAssessmentSession.timer.test.js` (append)

**Interfaces:**
- Consumes: `runningRef`, `startedAtRef`, `accumulatedMsRef` from Task 1.
- Produces: no new return values; behavior only.

- [ ] **Step 1: Write the failing tests (append to the existing describe block)**

Add `import { AppState } from 'react-native';` to the top of `__tests__/useAssessmentSession.timer.test.js`, then add these four tests inside the `describe('useAssessmentSession monotonic timekeeping', ...)` block. They drive `mockNow` (the mocked clock) and a captured AppState handler:

```javascript
// add to the top imports:
import { AppState } from 'react-native';

// add inside the describe block:
  const spyAppState = () => {
    let handler;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      handler = fn;
      return { remove: jest.fn() };
    });
    return () => handler;
  };

  test('backgrounding pauses the clock and foregrounding resumes it', () => {
    const getHandler = spyAppState();
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });   // startedAt = 0
    mockNow = 10000;
    act(() => { getHandler()('background'); });       // bank 10000, pause
    mockNow = 40000;                                  // 30s "in background" must not count
    expect(result.current.getElapsedMs()).toBe(10000);
    act(() => { getHandler()('active'); });           // resume: startedAt = 40000
    mockNow = 42000;
    expect(result.current.getElapsedMs()).toBe(12000);
  });

  test('after stopTimer, a background/foreground cycle does not resume the clock', () => {
    const getHandler = spyAppState();
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });
    mockNow = 5000;
    act(() => { result.current.stopTimer(); });
    act(() => { const h = getHandler(); h('background'); h('active'); });
    mockNow = 25000;
    expect(result.current.getElapsedMs()).toBe(5000);
  });

  test('watchdog does not finalize while backgrounded, then finalizes on foreground (R8)', () => {
    const onExpire = jest.fn();
    const getHandler = spyAppState();
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.setOnTimerExpire(onExpire); result.current.startActive(); });
    mockNow = 60001;                                  // deadline reached
    act(() => { getHandler()('background'); });        // pause + isForeground false
    act(() => { jest.advanceTimersByTime(1000); });    // a tick fires but foreground is false
    expect(onExpire).not.toHaveBeenCalled();
    act(() => { getHandler()('active'); });            // isForeground true again
    act(() => { jest.advanceTimersByTime(1000); });    // now the watchdog finalizes
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  test('an AppState change before startActive is a no-op', () => {
    const getHandler = spyAppState();
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { const h = getHandler(); h('background'); h('active'); }); // runningRef false: no throw, no accrual
    act(() => { result.current.startActive(); });
    mockNow = 3000;
    expect(result.current.getElapsedMs()).toBe(3000);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest useAssessmentSession.timer -c package.json`
Expected: FAIL (the new "resume" test sees elapsed keep counting during background, and/or `AppState.addEventListener` is never called so `handler` is undefined).

- [ ] **Step 3a: Add `AppState` import and the `isForegroundRef`**

In `src/hooks/useAssessmentSession.js`, change the react-native import line to include `AppState`:

```javascript
import { Alert, AppState, useWindowDimensions } from 'react-native';
```

Add the foreground ref alongside the other timekeeping refs (immediately after `const accumulatedMsRef = useRef(0);`):

```javascript
  const isForegroundRef = useRef(true);   // R8: watchdog only finalizes while foreground; default true keeps headless tests finalizing
```

- [ ] **Step 3b: Add the AppState pause effect**

Add this effect immediately after the `stopTimer` `useCallback` (before the display/watchdog `useEffect`):

```javascript
  // Background-as-pause (R8). Track foreground on every change; freeze accrual on
  // background/inactive and resume on foreground. Clock changes are gated by runningRef so a
  // clock frozen by stopTimer/finish never un-freezes.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      isForegroundRef.current = next === 'active';
      if (!runningRef.current) return;
      if (next === 'active') {
        if (startedAtRef.current == null) startedAtRef.current = monotonicNow();
      } else if (startedAtRef.current != null) {
        accumulatedMsRef.current += monotonicNow() - startedAtRef.current;
        startedAtRef.current = null;
      }
    });
    return () => sub.remove();
  }, []);
```

- [ ] **Step 3c: Gate the watchdog finalize on foreground**

In the display/watchdog `useEffect`, change the expiry guard so it only finalizes while foreground:

```javascript
        if (isExpired() && isForegroundRef.current) {
          clearInterval(timerRef.current);
          onTimerExpireRef.current();
        }
```

- [ ] **Step 4: Run tests to verify they pass (broadened consumer gate, R11)**

Task 2 adds an always-mounted AppState lifecycle effect to the shared hook, so verify both consumers, not just the timer suite.

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest useAssessmentSession LetterAssessmentScreen SequentialAssessmentScreen -c package.json`
Expected: PASS (timer suite now 8 tests + clockJump 1 + existing 7 hook tests + both pre-existing screen suites).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAssessmentSession.js __tests__/useAssessmentSession.timer.test.js
git commit -m "perf(assessment): pause the assessment clock on background via AppState"
```

---

### Task 3: `CountdownTimer` self-ticking leaf

Create the isolated 1 Hz countdown leaf that reads `getElapsedMs()` and renders the existing `AssessmentTimer`.

**Files:**
- Create: `src/components/assessment/CountdownTimer.js`
- Test: `__tests__/CountdownTimer.test.js`

**Interfaces:**
- Consumes: `getElapsedMs` callback (from the hook), `AssessmentTimer` presentational component, `ASSESSMENT_DURATION`.
- Produces: `CountdownTimer` default export, props `{ getElapsedMs, durationSeconds? }`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/CountdownTimer.test.js`:

```javascript
import React from 'react';
import { render, act } from '@testing-library/react-native';
import CountdownTimer from '../src/components/assessment/CountdownTimer';

describe('CountdownTimer', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('shows remaining seconds from getElapsedMs and ticks down', () => {
    let elapsed = 0;
    const getElapsedMs = () => elapsed;
    const { getByText } = render(<CountdownTimer getElapsedMs={getElapsedMs} />);
    expect(getByText('60s')).toBeTruthy();
    elapsed = 5000;
    act(() => { jest.advanceTimersByTime(1000); });
    expect(getByText('55s')).toBeTruthy();
  });

  test('never shows negative remaining', () => {
    const getElapsedMs = () => 999000;
    const { getByText } = render(<CountdownTimer getElapsedMs={getElapsedMs} />);
    expect(getByText('0s')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest CountdownTimer -c package.json`
Expected: FAIL (cannot find module `CountdownTimer`).

- [ ] **Step 3: Create the component**

Create `src/components/assessment/CountdownTimer.js`:

```javascript
import React, { useEffect, useState } from 'react';
import AssessmentTimer from './AssessmentTimer';
import { ASSESSMENT_DURATION } from '../../constants/egraConstants';

/**
 * Self-ticking countdown leaf. Isolates the 1 Hz re-render to this component so the
 * capture screen and its tile grid stay still while the assessment runs. Mirrors the
 * time-tracker's ElapsedTime isolation.
 */
export default function CountdownTimer({ getElapsedMs, durationSeconds = ASSESSMENT_DURATION }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, durationSeconds - Math.floor(getElapsedMs() / 1000));
  return <AssessmentTimer timeRemaining={remaining} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest CountdownTimer -c package.json`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/assessment/CountdownTimer.js __tests__/CountdownTimer.test.js
git commit -m "perf(assessment): add self-ticking CountdownTimer leaf"
```

---

### Task 4: `React.memo` `LetterTile` + grid refactor

Extract the inline tile into a memoized `LetterTile` fed scalar props, and render it from `EgraLetterGrid`. Preserve the exact `accessibilityLabel` and styling so existing screen tests keep passing.

**Files:**
- Create: `src/components/assessment/LetterTile.js`
- Modify: `src/components/assessment/EgraLetterGrid.js`
- Test: `__tests__/LetterTile.test.js`, `__tests__/EgraLetterGrid.renderCount.test.js`

**Interfaces:**
- Produces: `LetterTile` (default + named export), props `{ letter, index, state, isCurrent, onPress, disabled, readOnly, width, height, fontSize }`. `onPress(index)` fires only when not `disabled`/`readOnly`.
- Consumes: existing `EgraLetterGrid` public props (unchanged): `{ letters, pageOffset, letterStates, onToggle, disabled, readOnly, currentIndex, tileSize, tileWidth, tileHeight, gap }`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/LetterTile.test.js`:

```javascript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import LetterTile from '../src/components/assessment/LetterTile';

describe('LetterTile', () => {
  test('is a memoized component', () => {
    expect(LetterTile.$$typeof).toBe(Symbol.for('react.memo'));
  });

  test('renders an accessible label reflecting state and fires onPress with index', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <LetterTile index={3} letter="a" state={undefined} isCurrent={false} onPress={onPress}
        disabled={false} readOnly={false} width={50} height={50} fontSize={18} />
    );
    fireEvent.press(getByLabelText('a, not marked'));
    expect(onPress).toHaveBeenCalledWith(3);
  });

  test('read-only tile does not fire onPress', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <LetterTile index={1} letter="b" state={true} isCurrent={false} onPress={onPress}
        disabled={false} readOnly width={50} height={50} fontSize={18} />
    );
    fireEvent.press(getByLabelText('b, correct'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
```

Create `__tests__/EgraLetterGrid.renderCount.test.js` (a render-count spy proves the grid passes scalar props so unchanged tiles skip):

```javascript
import React, { useCallback, useState } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../src/components/assessment/LetterTile', () => {
  const ReactLib = require('react');
  const { Pressable } = require('react-native');
  const renderSpy = jest.fn();
  const Tile = ReactLib.memo(function MockTile({ index, letter, state, onPress }) {
    renderSpy(index);
    const label = `${letter}, ${state === true ? 'correct' : state === false ? 'incorrect' : 'not marked'}`;
    return ReactLib.createElement(Pressable, {
      accessibilityLabel: label,
      onPress: () => { if (onPress) onPress(index); },
    });
  });
  return { __esModule: true, default: Tile, renderSpy };
});

import EgraLetterGrid from '../src/components/assessment/EgraLetterGrid';
import { renderSpy } from '../src/components/assessment/LetterTile';

function Harness() {
  const [letterStates, setLetterStates] = useState({});
  const onToggle = useCallback((i) => setLetterStates((prev) => ({ ...prev, [i]: true })), []);
  return (
    <EgraLetterGrid
      letters={['a', 'b', 'c', 'd', 'e']} pageOffset={0} letterStates={letterStates}
      onToggle={onToggle} disabled={false} tileSize={50} gap={8}
    />
  );
}

describe('EgraLetterGrid render isolation', () => {
  beforeEach(() => renderSpy.mockClear());

  test('mount renders every tile once', () => {
    render(<Harness />);
    expect(renderSpy).toHaveBeenCalledTimes(5);
  });

  test('tapping one tile re-renders only that tile', () => {
    const { getByLabelText } = render(<Harness />);
    renderSpy.mockClear();
    fireEvent.press(getByLabelText('c, not marked'));
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledWith(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest LetterTile EgraLetterGrid.renderCount -c package.json`
Expected: FAIL (cannot find module `LetterTile`; grid still renders inline tiles).

- [ ] **Step 3: Create `LetterTile.js`**

Create `src/components/assessment/LetterTile.js`:

```javascript
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, borderRadius } from '../../constants/colors';

function LetterTileBase({ letter, index, state, isCurrent, onPress, disabled, readOnly, width, height, fontSize }) {
  const isCorrect = state === true;
  const isIncorrect = state === false;
  const handlePress = () => { if (disabled || readOnly) return; if (onPress) onPress(index); };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.tile,
        { width, height },
        isCorrect && styles.tileCorrect,
        isIncorrect && styles.tileIncorrect,
        isCurrent && styles.tileCurrent,
        pressed && !disabled && !readOnly && styles.tilePressed,
        disabled && styles.tileDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${letter}, ${isCorrect ? 'correct' : isIncorrect ? 'incorrect' : 'not marked'}${isCurrent ? ', current' : ''}`}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        style={[
          styles.tileText,
          { fontSize },
          isCorrect && styles.tileTextCorrect,
          isIncorrect && styles.tileTextIncorrect,
        ]}
      >
        {letter}
      </Text>
    </Pressable>
  );
}

export const LetterTile = React.memo(LetterTileBase);
export default LetterTile;

const styles = StyleSheet.create({
  tile: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
  },
  tileCorrect: { backgroundColor: colors.success, borderColor: colors.success },
  tileIncorrect: { backgroundColor: colors.error, borderColor: colors.error },
  tileCurrent: { borderColor: colors.primary, borderWidth: 2 },
  tilePressed: { transform: [{ scale: 0.95 }], opacity: 0.85 },
  tileDisabled: { opacity: 0.6 },
  tileText: { color: colors.text, fontWeight: '600' },
  tileTextCorrect: { color: '#FFFFFF' },
  tileTextIncorrect: { color: '#FFFFFF' },
});
```

- [ ] **Step 4: Rewrite `EgraLetterGrid.js` to render `LetterTile`**

Replace the entire contents of `src/components/assessment/EgraLetterGrid.js` with:

```javascript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import LetterTile from './LetterTile';

export default function EgraLetterGrid({ letters, pageOffset, letterStates, onToggle, disabled, readOnly = false, currentIndex = -1, tileSize, tileWidth, tileHeight, gap }) {
  const effectiveWidth = tileWidth || tileSize;
  const effectiveHeight = tileHeight || tileSize;
  const baseFontSize = Math.max(14, Math.floor(tileSize * 0.35));
  const digraphFontSize = Math.max(12, Math.floor(tileSize * 0.28));
  const wordFontSize = Math.max(11, Math.floor(tileSize * 0.18));

  return (
    <View style={[styles.grid, { gap }]}>
      {letters.map((letter, i) => {
        const globalIndex = pageOffset + i;
        const fontSize = letter.length > 2 ? wordFontSize : letter.length === 2 ? digraphFontSize : baseFontSize;
        return (
          <LetterTile
            key={`${globalIndex}-${letter}`}
            index={globalIndex}
            letter={letter}
            state={letterStates[globalIndex]}
            isCurrent={globalIndex === currentIndex}
            onPress={readOnly ? undefined : onToggle}
            disabled={disabled}
            readOnly={readOnly}
            width={effectiveWidth}
            height={effectiveHeight}
            fontSize={fontSize}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
});
```

- [ ] **Step 5: Run tests to verify they pass (including the pre-existing grid suite)**

The `EgraLetterGrid` pattern matches BOTH the new `EgraLetterGrid.renderCount` file and the pre-existing `__tests__/egraLetterGridReadOnly.test.js` (5 tests: readOnly blocks onToggle, currentIndex marks the current tile, incorrect tile has `backgroundColor: colors.error`, etc.). The refactored `LetterTile` must keep those green (same labels, same function-style, same `tileIncorrect` background).

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest LetterTile EgraLetterGrid -c package.json`
Expected: PASS (LetterTile 3, renderCount 2, egraLetterGridReadOnly 5).

- [ ] **Step 6: Confirm no regression in the existing screen test**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest LetterAssessmentScreen.plan5 -c package.json`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/assessment/LetterTile.js src/components/assessment/EgraLetterGrid.js __tests__/LetterTile.test.js __tests__/EgraLetterGrid.renderCount.test.js
git commit -m "perf(assessment): memoize grid tiles as LetterTile with scalar props"
```

---

### Task 5: `LetterAssessmentScreen` — CountdownTimer + isExpired guard

Swap the timer for `CountdownTimer`, stop consuming `timeRemaining`/`isPaused`, and add the `isExpired()` hard-stop in `handleToggle`. Reorder so `handleFinish` is declared before `handleToggle` (a `useCallback` cannot list a `const` declared later in its dependency array).

**Files:**
- Modify: `src/screens/assessments/LetterAssessmentScreen.js`
- Test: `__tests__/LetterAssessmentScreen.expiry.test.js`, `__tests__/LetterAssessmentScreen.renderCount.test.js`

**Interfaces:**
- Consumes: `getElapsedMs`, `isExpired`, `startActive`, `stopTimer`, `finishAndSave`, `setOnTimerExpire`, `phase`, `setPhase`, `layout`, `hasFinishedRef` from the hook; `CountdownTimer` from Task 3.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/LetterAssessmentScreen.expiry.test.js`:

```javascript
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';

// R13: elapsed is driven by the monotonic clock, not Date. Mock it (setSystemTime no longer
// advances assessment time).
let mockNow = 0;
jest.mock('../src/utils/monotonicClock', () => ({ now: () => mockNow }));

import LetterAssessmentScreen from '../src/screens/assessments/LetterAssessmentScreen';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: { saveAssessment: jest.fn() },
}));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'assessment-1') }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('LetterAssessmentScreen expiry + timing', () => {
  const navigation = { addListener: jest.fn(() => jest.fn()), navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), dispatch: jest.fn() };
  const route = { params: {
    child: { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' },
    letterSet: { id: 'english-test', language: 'English', letters: ['a'], lettersPerPage: 1, columns: 1 },
    attemptNumber: 2, assessmentType: 'letter_egra',
  } };

  beforeEach(() => {
    jest.useFakeTimers();
    mockNow = 0;
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ refreshSyncStatus: jest.fn().mockResolvedValue({}), triggerBackgroundSync: jest.fn() });
    assessmentsRepository.saveAssessment.mockResolvedValue(true);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

  test('a tap after expiry records nothing AND triggers finish', async () => {
    const { getByText, getByLabelText } = render(
      <LetterAssessmentScreen navigation={navigation} route={route} />
    );
    fireEvent.press(getByText('Start Assessment'));       // startedAt = mockNow = 0
    fireEvent.press(getByLabelText('a, not marked'));    // record the only letter correct (pre-expiry)
    act(() => { mockNow = 65000; });                      // past the 60s deadline, no watchdog tick fired
    fireEvent.press(getByLabelText('a, correct'));        // an expired tap would normally untoggle (a correction)
    // "triggers finish": the guard routes to handleFinish, which saves directly (last index is correct).
    await waitFor(() => expect(assessmentsRepository.saveAssessment).toHaveBeenCalled());
    const saved = assessmentsRepository.saveAssessment.mock.calls[0][0];
    expect(saved.correct_responses).toBe(1);             // "records nothing": the expired tap did NOT untoggle
    expect(saved.correction_count).toBe(0);              // and logged no correction
  });

  test('completion_time reflects real elapsed seconds', async () => {
    const { getByText, getByLabelText } = render(
      <LetterAssessmentScreen navigation={navigation} route={route} />
    );
    fireEvent.press(getByText('Start Assessment'));
    fireEvent.press(getByLabelText('a, not marked'));    // record a correct so Finish saves directly
    act(() => { mockNow = 7000; });
    fireEvent.press(getByText('Finish'));
    await waitFor(() => expect(assessmentsRepository.saveAssessment).toHaveBeenCalled());
    expect(assessmentsRepository.saveAssessment.mock.calls[0][0].completion_time).toBe(7);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest LetterAssessmentScreen.expiry -c package.json`
Expected: FAIL on the hard-stop test. Without the `isExpired()` guard, the expired tap untoggles the letter and does not finalize, so `saveAssessment` is never called (the `waitFor` times out) and `correct_responses`/`correction_count` are wrong. (The `completion_time` test may already pass, since Task 1 wired `elapsedSeconds` from `getElapsedMs` in the hook; the guard test is the red that Task 5 turns green.)

- [ ] **Step 3: Update the destructure and timer render**

In `src/screens/assessments/LetterAssessmentScreen.js`:

Change the hook destructure (currently around line 23-25) from:

```javascript
  const {
    phase, timeRemaining, isPaused, layout, finishAndSave, setOnTimerExpire, setPhase, stopTimer, hasFinishedRef,
  } = session;
```

to:

```javascript
  const {
    phase, layout, finishAndSave, setOnTimerExpire, setPhase, stopTimer, hasFinishedRef, getElapsedMs, isExpired,
  } = session;
```

Change the import (currently line 7) from:

```javascript
import AssessmentTimer from '../../components/assessment/AssessmentTimer';
```

to:

```javascript
import CountdownTimer from '../../components/assessment/CountdownTimer';
```

Change the timer render (currently line 166-168) from:

```javascript
      <View style={styles.timerRow}>
        <AssessmentTimer timeRemaining={timeRemaining} isPaused={isPaused} />
      </View>
```

to:

```javascript
      <View style={styles.timerRow}>
        <CountdownTimer getElapsedMs={getElapsedMs} />
      </View>
```

- [ ] **Step 4: Reorder and guard the mutation path**

Move `handleFinish` above `handleToggle` and add the expiry guard to `handleToggle`. Replace the block from the `handleToggle` declaration through the `setOnTimerExpire` effect (currently lines 43-75) with:

```javascript
  const handleFinish = useCallback(() => {
    if (finishStartedRef.current) return;
    finishStartedRef.current = true;
    const lastIndex = letterSet.letters.length - 1;
    if (letterStatesRef.current[lastIndex] === true) {
      finishAndSave({
        letterStates: letterStatesRef.current,
        finalLastIndex: lastIndex,
        correctionCount: correctionCountRef.current,
      });
    } else {
      stopTimer();          // synchronous timer freeze — parity with the original clearInterval
      setPhase('finished'); // freeze the grid (disabled) before the last-attempted sheet
      setShowLastAttempted(true);
    }
  }, [finishAndSave, letterSet, setPhase, stopTimer]);

  const handleToggle = useCallback((globalIndex) => {
    if (hasFinishedRef.current) return;
    if (isExpired()) { handleFinish(); return; } // authoritative hard-stop
    setLetterStates((prev) => {
      const next = { ...prev };
      if (next[globalIndex]) {
        delete next[globalIndex];
        correctionCountRef.current += 1;
      } else {
        next[globalIndex] = true;
      }
      return next;
    });
    setLastTappedIndex((prev) => Math.max(prev, globalIndex));
  }, [hasFinishedRef, isExpired, handleFinish]);

  useEffect(() => { setOnTimerExpire(handleFinish); }, [setOnTimerExpire, handleFinish]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest LetterAssessmentScreen -c package.json`
Expected: PASS (expiry file 2 tests + plan5 file 2 tests).

- [ ] **Step 6: Add the screen-level render-count proof (R9)**

Create `__tests__/LetterAssessmentScreen.renderCount.test.js`. Unlike the Task 4 grid Harness (which supplies its own synthetic stable `useCallback`), this renders the REAL screen so it exercises the real `handleToggle -> handleFinish -> finishAndSave` dependency chain. If `handleToggle`'s identity churned, every tile would re-render and this test would fail.

```javascript
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../src/components/assessment/LetterTile', () => {
  const ReactLib = require('react');
  const { Pressable } = require('react-native');
  const renderSpy = jest.fn();
  const Tile = ReactLib.memo(function MockTile({ index, letter, state, isCurrent, onPress }) {
    renderSpy(index);
    const label = `${letter}, ${state === true ? 'correct' : state === false ? 'incorrect' : 'not marked'}${isCurrent ? ', current' : ''}`;
    return ReactLib.createElement(Pressable, { accessibilityLabel: label, onPress: () => { if (onPress) onPress(index); } });
  });
  return { __esModule: true, default: Tile, renderSpy };
});

import LetterAssessmentScreen from '../src/screens/assessments/LetterAssessmentScreen';
import { renderSpy } from '../src/components/assessment/LetterTile';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: { saveAssessment: jest.fn() },
}));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'assessment-1') }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('LetterAssessmentScreen render isolation (real onPress identity)', () => {
  const navigation = { addListener: jest.fn(() => jest.fn()), navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), dispatch: jest.fn() };
  const route = { params: {
    child: { id: 'child-1', first_name: 'A', last_name: 'B' },
    letterSet: { id: 'english-test', language: 'English', letters: ['a', 'b', 'c'], lettersPerPage: 20, columns: 5 },
    attemptNumber: 1, assessmentType: 'letter_egra',
  } };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-09T08:00:00.000Z'));
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ refreshSyncStatus: jest.fn().mockResolvedValue({}), triggerBackgroundSync: jest.fn() });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderSpy.mockClear();
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

  test('tapping one tile re-renders exactly that tile (real handleToggle identity)', () => {
    const { getByText, getByLabelText } = render(<LetterAssessmentScreen navigation={navigation} route={route} />);
    fireEvent.press(getByText('Start Assessment'));
    renderSpy.mockClear();
    fireEvent.press(getByLabelText('a, not marked'));
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledWith(0);
  });
});
```

- [ ] **Step 7: Run and verify the render-count proof passes**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest LetterAssessmentScreen -c package.json`
Expected: PASS (expiry 2 + plan5 2 + renderCount 1).

- [ ] **Step 8: Commit**

```bash
git add src/screens/assessments/LetterAssessmentScreen.js __tests__/LetterAssessmentScreen.expiry.test.js __tests__/LetterAssessmentScreen.renderCount.test.js
git commit -m "perf(assessment): isolate letter-screen timer and add isExpired hard-stop"
```

---

### Task 6: `SequentialAssessmentScreen` — CountdownTimer + isExpired guards

Swap the timer for `CountdownTimer`, stop consuming `timeRemaining`/`isPaused`, and add the `isExpired()` hard-stop to `decide` and `goBack`.

**Files:**
- Modify: `src/screens/assessments/SequentialAssessmentScreen.js`
- Test: `__tests__/SequentialAssessmentScreen.expiry.test.js`, `__tests__/SequentialAssessmentScreen.renderCount.test.js`

**Interfaces:**
- Consumes: `getElapsedMs`, `isExpired`, `finishAndSave`, `setOnTimerExpire`, `phase`, `layout`, `hasFinishedRef`, `startActive` from the hook; `finishWith` local callback (declared before `decide`/`goBack`).

**Note on the sequential isolation target:** unlike grid mode (one tap flips one tile: 26 -> 1), a sequential decision changes exactly **two** tiles: the decided tile's `state` changes AND `currentIndex` (`displayCursor`) moves off it onto the next tile, so `isCurrent` flips on two tiles (26 -> 2). Two is still the minimal set; the render-count proof below asserts exactly 2.

- [ ] **Step 1: Write the failing test**

Create `__tests__/SequentialAssessmentScreen.expiry.test.js`:

```javascript
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';

// R13: elapsed is driven by the monotonic clock, not Date. Mock it.
let mockNow = 0;
jest.mock('../src/utils/monotonicClock', () => ({ now: () => mockNow }));

import SequentialAssessmentScreen from '../src/screens/assessments/SequentialAssessmentScreen';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: { saveAssessment: jest.fn() },
}));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'assessment-1') }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('SequentialAssessmentScreen expiry', () => {
  const navigation = { addListener: jest.fn(() => jest.fn()), navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), dispatch: jest.fn() };
  const route = { params: {
    child: { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' },
    letterSet: { id: 'english-test', language: 'English', letters: ['a', 'b'], lettersPerPage: 20, columns: 5 },
    attemptNumber: 1, assessmentType: 'letter_egra', captureMode: 'sequential',
  } };

  beforeEach(() => {
    jest.useFakeTimers();
    mockNow = 0;
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ refreshSyncStatus: jest.fn().mockResolvedValue({}), triggerBackgroundSync: jest.fn() });
    assessmentsRepository.saveAssessment.mockResolvedValue(true);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

  test('a decision after expiry finalizes without recording it', async () => {
    const { getByText } = render(<SequentialAssessmentScreen navigation={navigation} route={route} />);
    fireEvent.press(getByText('Start Assessment'));       // startedAt = mockNow = 0
    act(() => { mockNow = 65000; });                      // past the deadline
    fireEvent.press(getByText('Correct'));
    await waitFor(() => expect(assessmentsRepository.saveAssessment).toHaveBeenCalled());
    expect(assessmentsRepository.saveAssessment.mock.calls[0][0].correct_responses).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest SequentialAssessmentScreen.expiry -c package.json`
Expected: FAIL (the expired "Correct" currently records and advances, so `correct_responses` is 1, and finalize is not triggered by the tap).

- [ ] **Step 3: Update the destructure and timer render**

In `src/screens/assessments/SequentialAssessmentScreen.js`:

Change the import (currently line 7) from:

```javascript
import AssessmentTimer from '../../components/assessment/AssessmentTimer';
```

to:

```javascript
import CountdownTimer from '../../components/assessment/CountdownTimer';
```

Change the hook destructure (currently line 28) from:

```javascript
  const { phase, timeRemaining, isPaused, layout, finishAndSave, setOnTimerExpire, hasFinishedRef } = session;
```

to:

```javascript
  const { phase, layout, finishAndSave, setOnTimerExpire, hasFinishedRef, getElapsedMs, isExpired } = session;
```

Change the timer render (currently line 98) from:

```javascript
      <View style={styles.timerRow}><AssessmentTimer timeRemaining={timeRemaining} isPaused={isPaused} /></View>
```

to:

```javascript
      <View style={styles.timerRow}><CountdownTimer getElapsedMs={getElapsedMs} /></View>
```

- [ ] **Step 4: Guard the mutation paths**

Replace `decide` (currently lines 42-47) with:

```javascript
  const decide = useCallback((correct) => {
    // Guard on finish-state AND the cursor bound: queued/rapid taps on the final item must
    // not push the cursor past the last index (which would over-count letters_attempted).
    if (hasFinishedRef.current || stateRef.current.cursor >= totalLetters) return;
    if (isExpired()) { finishWith(stateRef.current); return; } // authoritative hard-stop
    dispatch({ type: 'decide', correct, totalLetters });
  }, [hasFinishedRef, totalLetters, isExpired, finishWith]);
```

Replace `goBack` (currently line 57) with:

```javascript
  const goBack = useCallback(() => {
    if (isExpired()) { finishWith(stateRef.current); return; } // no corrections after time is up
    dispatch({ type: 'back' });
  }, [isExpired, finishWith]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest SequentialAssessmentScreen -c package.json`
Expected: PASS (expiry 1 test; plus the pre-existing `sequentialAssessmentScreen.test.js` still green — it renders the real `CountdownTimer` transparently and `isExpired()` is false at t=0).

- [ ] **Step 6: Add the sequential render-count proof (26 -> 2)**

Create `__tests__/SequentialAssessmentScreen.renderCount.test.js`. This characterizes the sequential isolation via the same `LetterTile` render-spy; it may already pass once Task 4's memoization is in place (the grid passes scalar props) — its job is to lock in the 26 -> 2 behavior and guard against regressions.

```javascript
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../src/components/assessment/LetterTile', () => {
  const ReactLib = require('react');
  const { Pressable } = require('react-native');
  const renderSpy = jest.fn();
  const Tile = ReactLib.memo(function MockTile({ index, letter, state, isCurrent, onPress }) {
    renderSpy(index);
    const label = `${letter}, ${state === true ? 'correct' : state === false ? 'incorrect' : 'not marked'}${isCurrent ? ', current' : ''}`;
    return ReactLib.createElement(Pressable, { accessibilityLabel: label, onPress: () => { if (onPress) onPress(index); } });
  });
  return { __esModule: true, default: Tile, renderSpy };
});

import SequentialAssessmentScreen from '../src/screens/assessments/SequentialAssessmentScreen';
import { renderSpy } from '../src/components/assessment/LetterTile';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: { saveAssessment: jest.fn() },
}));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'assessment-1') }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('SequentialAssessmentScreen render isolation', () => {
  const navigation = { addListener: jest.fn(() => jest.fn()), navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), dispatch: jest.fn() };
  const route = { params: {
    child: { id: 'child-1', first_name: 'A', last_name: 'B' },
    letterSet: { id: 'english-test', language: 'English', letters: ['a', 'b', 'c'], lettersPerPage: 20, columns: 5 },
    attemptNumber: 1, assessmentType: 'letter_egra', captureMode: 'sequential',
  } };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-09T08:00:00.000Z'));
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ refreshSyncStatus: jest.fn().mockResolvedValue({}), triggerBackgroundSync: jest.fn() });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderSpy.mockClear();
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

  test('a decision re-renders exactly two tiles (decided + next current)', () => {
    const { getByText } = render(<SequentialAssessmentScreen navigation={navigation} route={route} />);
    fireEvent.press(getByText('Start Assessment'));
    renderSpy.mockClear();
    fireEvent.press(getByText('Correct'));
    expect(renderSpy).toHaveBeenCalledTimes(2);
    expect(renderSpy.mock.calls.map((c) => c[0]).sort()).toEqual([0, 1]);
  });
});
```

- [ ] **Step 7: Run the sequential tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest SequentialAssessmentScreen -c package.json`
Expected: PASS (expiry 1, renderCount 1, pre-existing suite green).

- [ ] **Step 8: Commit**

```bash
git add src/screens/assessments/SequentialAssessmentScreen.js __tests__/SequentialAssessmentScreen.expiry.test.js __tests__/SequentialAssessmentScreen.renderCount.test.js
git commit -m "perf(assessment): isolate sequential-screen timer and add isExpired hard-stop"
```

---

### Task 7: Hook cleanup — remove `timeRemaining`/`isPaused`, prove isolation

Now that no screen consumes `timeRemaining`/`isPaused`, remove them and the per-second `setState`. The watchdog interval keeps running (expiry only). Add a grid-spy test proving the screen no longer re-renders on ticks.

**Files:**
- Modify: `src/hooks/useAssessmentSession.js`
- Test: `__tests__/LetterAssessmentScreen.renderIsolation.test.js`

**Interfaces:**
- Produces: hook return no longer includes `timeRemaining`, `isPaused`, `setIsPaused`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/LetterAssessmentScreen.renderIsolation.test.js` (spies on the un-memoized `EgraLetterGrid`; if the screen re-renders on a tick, the grid function runs):

```javascript
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, act } from '@testing-library/react-native';

jest.mock('../src/components/assessment/EgraLetterGrid', () => {
  const gridRenderSpy = jest.fn();
  const Grid = () => { gridRenderSpy(); return null; };
  return { __esModule: true, default: Grid, gridRenderSpy };
});

import LetterAssessmentScreen from '../src/screens/assessments/LetterAssessmentScreen';
import { gridRenderSpy } from '../src/components/assessment/EgraLetterGrid';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: { saveAssessment: jest.fn() },
}));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'assessment-1') }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const T0 = new Date('2026-07-09T08:00:00.000Z');

describe('LetterAssessmentScreen render isolation', () => {
  const navigation = { addListener: jest.fn(() => jest.fn()), navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), dispatch: jest.fn() };
  const route = { params: {
    child: { id: 'child-1', first_name: 'A', last_name: 'B' },
    letterSet: { id: 'english-test', language: 'English', letters: ['a', 'b', 'c'], lettersPerPage: 20, columns: 5 },
    attemptNumber: 1, assessmentType: 'letter_egra',
  } };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ refreshSyncStatus: jest.fn().mockResolvedValue({}), triggerBackgroundSync: jest.fn() });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

  test('advancing the countdown does not re-render the grid', () => {
    const { getByText } = render(<LetterAssessmentScreen navigation={navigation} route={route} />);
    fireEvent.press(getByText('Start Assessment'));
    gridRenderSpy.mockClear();
    act(() => { jest.advanceTimersByTime(3000); }); // three 1 Hz ticks
    expect(gridRenderSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest LetterAssessmentScreen.renderIsolation -c package.json`
Expected: FAIL (the hook still calls `setTimeRemaining` each tick, re-rendering the screen and the grid, so `gridRenderSpy` is called 3 times).

- [ ] **Step 3: Remove the display state and per-tick setState**

In `src/hooks/useAssessmentSession.js`:

Remove these two state lines (and the transitional comment above them):

```javascript
  // Transitional display state; removed in the render-isolation cleanup task.
  const [timeRemaining, setTimeRemaining] = useState(ASSESSMENT_DURATION);
  const [isPaused, setIsPaused] = useState(false);
```

Replace the display/watchdog effect with an expiry-only watchdog:

```javascript
  // Expiry watchdog: authoritative, ref-based, fires onTimerExpire. No setState the screen
  // renders. Only finalizes while foreground (R8) so an expiry is never committed with the
  // stimulus hidden; it defers to the first foreground tick.
  useEffect(() => {
    if (phase !== 'active') return undefined;
    timerRef.current = setInterval(() => {
      if (isExpired() && isForegroundRef.current) {
        clearInterval(timerRef.current);
        onTimerExpireRef.current();
      }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, isExpired]);
```

Change the return object from:

```javascript
  return {
    phase, setPhase, timeRemaining, isPaused, setIsPaused, layout,
    hasFinishedRef, startActive, stopTimer, finishAndSave, setOnTimerExpire,
    getElapsedMs, isExpired,
  };
```

to:

```javascript
  return {
    phase, setPhase, layout,
    hasFinishedRef, startActive, stopTimer, finishAndSave, setOnTimerExpire,
    getElapsedMs, isExpired,
  };
```

If `useState` is now unused in the file, keep it only if `phase` still uses it (it does — `phase` remains a `useState`). Leave the `useState` import in place.

- [ ] **Step 4: Run the full assessment test set to verify green**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest useAssessmentSession CountdownTimer LetterTile EgraLetterGrid LetterAssessmentScreen SequentialAssessmentScreen -c package.json`
Expected: PASS (all assessment-related suites, including the new isolation test).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAssessmentSession.js __tests__/LetterAssessmentScreen.renderIsolation.test.js
git commit -m "perf(assessment): drop per-second timeRemaining state to end the 1 Hz cascade"
```

---

### Task 8: Documentation

Log the work and the `completion_time` semantics change; flip the spec status.

**Files:**
- Modify: `documentation/sqlite-refactor-log.md`
- Modify: `docs/superpowers/specs/2026-07-09-assessment-render-perf-design.md`

- [ ] **Step 1: Add a running-log entry**

Append a dated section to `documentation/sqlite-refactor-log.md` covering: the four seams; the decision that `completion_time` now stores real elapsed seconds (`round(getElapsedMs()/1000)`, capped at 60) instead of the raw tick count (strictly more accurate, no schema/sync change); the two render-spy proofs (tile-spy: one tap → one tile; grid-spy: ticks → zero screen re-renders); and the pending manual low-end device/emulator check (taps immediate, countdown smooth and wall-clock-accurate, background pauses/resumes, expiry hard-stops).

- [ ] **Step 2: Flip the spec status line**

In `docs/superpowers/specs/2026-07-09-assessment-render-perf-design.md`, change the `**Status:**` line to `Implemented (branch feat/assessment-render-perf); pending device verification`.

- [ ] **Step 3: Run the full suite once**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test`
Expected: PASS, except the known `CreateClassScreen.test.js` parallel-load flake (re-run it in isolation to confirm: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest CreateClassScreen -c package.json`).

- [ ] **Step 4: Commit**

```bash
git add documentation/sqlite-refactor-log.md docs/superpowers/specs/2026-07-09-assessment-render-perf-design.md
git commit -m "docs(assessment): log render-perf pack and completion_time semantics"
```

---

## Self-Review

**Spec coverage:**
- Seam A (monotonic clock + isExpired): Task 1. ✓
- Seam B (AppState pause + runningRef): Task 2. ✓
- Seam C (CountdownTimer leaf): Task 3, wired in Tasks 5-6. ✓
- Seam D (React.memo LetterTile scalar props): Task 4. ✓
- isExpired guards at all three capture-mutation sites (Letter handleToggle; Sequential decide + goBack): Tasks 5-6. ✓
- Interface change (drop timeRemaining/isPaused/setIsPaused; add getElapsedMs/isExpired): Tasks 1 (add) + 7 (remove). ✓
- completion_time = real elapsed: Task 1 (impl) + Task 5 (test) + Task 8 (doc). ✓
- Testing: render-count spies (Task 4 grid tile-spy proving 26 -> 1; Task 6 sequential tile-spy proving 26 -> 2; Task 7 grid-spy proving ticks -> 0 screen re-renders), behavioral drift/expiry/pause/runningRef (Tasks 1-2), device check (Task 8 doc). Note the per-tap re-render target is mode-specific: grid = 1 tile, sequential = 2 tiles (decided + next current). ✓
- Non-goals honored: no sync/RLS/migration files touched. ✓

**Placeholder scan:** No TBD/TODO; every code and test step contains full content. ✓

**Type consistency:** `getElapsedMs`/`isExpired`/`startActive`/`stopTimer` names match across hook return (Task 1), screen consumption (Tasks 5-6), and the final return (Task 7). `LetterTile` prop names (`state`, `isCurrent`, `onPress`, `fontSize`) match between the component (Task 4), the grid (Task 4), and the mock in the render-count test (Task 4). ✓

---

## Adversarial Review Dispositions

Independent Opus adversarial review (2026-07-09), each finding re-verified against the tree before folding. Verdict: fundamentally sound, no blocker/major. Dispositions below.

- **R1 (MINOR, accepted) — Task 1 rewrites the hook but its 7-test contract file (`__tests__/useAssessmentSession.test.js`) was not run until Task 7.** A subtle rewrite regression would surface six tasks late. Verified: all 7 existing tests (idempotency, retry, discard, abandon-during-save, leave-guard, R7 `completion_time===60` at expiry) stay green under the new hook because `finishAndSave`/`beforeRemove`/catch control flow is preserved and `round(60000/1000)===60`. Fix applied: Task 1 Step 5 now runs `npx jest useAssessmentSession LetterAssessmentScreen.plan5` (the `useAssessmentSession` pattern matches both the new `.timer` file and the existing contract file).

- **R2 (MINOR, accepted) — the Letter expiry test proved "records nothing" but not the spec's "and triggers finish" half.** Fix applied: Task 5 Step 1 test now records the only letter correct pre-expiry, then taps the (now correct) tile after expiry; it asserts `saveAssessment` was called (finish triggered) and `correct_responses===1`/`correction_count===0` (the expired tap did not untoggle). Both halves covered.

- **R3 (MINOR, accepted) — the 26 -> 1 claim is grid-mode only; a sequential decision changes two tiles (decided tile `state` + `isCurrent` shifting to the next), i.e. 26 -> 2.** Verified against `sequentialAssessmentReducer.js` and `SequentialAssessmentScreen.js:108` (`currentIndex={finished ? -1 : displayCursor}`). Fix applied: added `__tests__/SequentialAssessmentScreen.renderCount.test.js` (Task 6 Step 6) asserting exactly 2 tiles re-render per decision, and corrected the self-review to state the target is mode-specific (grid 1, sequential 2).

- **R4 (INFO, accepted as designed) — after expiry, `goBack` finalizes instead of undoing, and the Back button can be enabled during watchdog tick-lag (expired but `phase` still `active`), so a reflexive Back tap at the buzzer ends the session.** This is the locked spec behavior ("no corrections after time is up", spec line ~96); it normally auto-finalizes via the watchdog within ~1s anyway. Making Back reactively disabled on expiry would require extra state and a re-render, which the isolation deliberately avoids. Kept as designed; flagged to Jim for confirmation.

- **R5 (INFO, no action) — `completion_time` moves from raw tick count to `round(getElapsedMs()/1000)` capped at 60 (strictly more accurate).** No test pins a non-60 tick value; buildAssessmentRecord and sync are untouched. Logged in Task 8.

- **R6 (self-caught during verification, accepted) — Task 4's `EgraLetterGrid.renderCount` test pattern did not match the pre-existing `egraLetterGridReadOnly.test.js`.** Fix applied: Task 4 Step 5 now runs the broader `EgraLetterGrid` pattern (covers both the new render-count suite and the existing 5-test readOnly suite), which the refactored `LetterTile` keeps green (same labels, function-style, `tileIncorrect` background).

Independent Codex (gpt-5.6-sol, xhigh) adversarial review (2026-07-09) of the R1-R6 plan. Verdict: needs-attention / no-ship. It caught two issues the first review missed (the clock and the render-count bypass). Each re-verified against the tree; dispositions below. All accepted.

- **R7 (HIGH, accepted) — `Date.now()` is a wall clock, not monotonic.** A 60-second standardized assessment whose elapsed feeds `completion_time` must be immune to wall-clock jumps (NTP/manual): `Date.now()` can move backward (extra time) or forward (early expiry), and clamping only bounds the error. This reverses my earlier `Date.now()`-for-parity call and realigns with Finding 5's `performance.now()`. Fix applied: new `src/utils/monotonicClock.js` (`now()` = `performance.now()` with `Date.now()` fallback), consumed by the hook; timekeeping tests mock it for precise control, and `__tests__/useAssessmentSession.clockJump.test.js` proves a `setSystemTime` wall-clock jump does not change elapsed. Verified against the tree: `jest.advanceTimersByTime` advances `performance.now` (so the existing R7 `completion_time===60` test stays green) while `jest.setSystemTime` does not (so the jump-immunity test is meaningful).

- **R8 (HIGH, accepted, scoped) — the watchdog could finalize without confirming the app is foreground.** The pause design already prevents *counting* background time in the common path, but the finalize path did not consult foreground state, so a queued expiry at a background transition could finalize with the stimulus hidden. Fix applied: an internal `isForegroundRef` (default `true`), maintained on every AppState change, gates the watchdog finalize (`isExpired() && isForegroundRef.current`); finalization defers to the first foreground tick. Verified the RN AppState jest mock exposes `currentState` as a `jest.fn` (not a string), which is exactly why the guard uses an internal ref, not `AppState.currentState` (that keeps the existing headless R7 expiry test green). Tests added for background-before-startActive and finalize-defers-until-foreground.

- **R9 (MEDIUM, accepted) — the grid render-count test used a synthetic stable `useCallback`, masking the real `onPress` identity risk.** The Task 4 Harness supplies its own stable `onToggle`, so it cannot catch `LetterAssessmentScreen.handleToggle` churning through its `handleFinish -> finishAndSave` dependency chain (which would re-render every tile in production). Fix applied: `__tests__/LetterAssessmentScreen.renderCount.test.js` (Task 5 Step 6) renders the REAL screen with the `LetterTile` spy, taps a real tile, and asserts exactly one tile re-renders. The Task 4 Harness test is kept (it isolates the grid); this adds the end-to-end guard.

- **R10 (MEDIUM, accepted) — the timekeeping tests did not prove the watchdog uses the clock rather than a tick count.** With `advanceTimersByTime(60000)` delivering all 60 callbacks, a regression reverting the watchdog to tick-counting would still pass. Fix applied: the mockable clock lets the R10 test set elapsed past 60 s and fire exactly one watchdog tick, asserting `onTimerExpire` fires once (a tick-count implementation would need 60 ticks and would not expire).

- **R11 (MEDIUM, accepted) — the green-between-tasks gate omitted the Sequential consumer after Tasks 1-2.** After Task 1 rewrites the shared hook and Task 2 adds an always-mounted AppState effect, the gate ran only the hook + Letter suites, so several commits could pass with a broken Sequential consumer. Fix applied: Task 1 Step 5 and Task 2 Step 4 now run `useAssessmentSession LetterAssessmentScreen SequentialAssessmentScreen` together as the shared-consumer gate.

Non-findings noted by Codex: its own `npx jest` run failed on a read-only-sandbox haste-map write (a sandbox artifact, not a plan defect), and it re-flagged the pending low-end Android device verification (already Task 8 / the device-check gate).

Second Codex re-review (gpt-5.6-sol) of the R7-R11 revision confirmed R8/R9/R10/R11 sound but found two consequences of the R7 clock change. Both re-verified against the tree (probe: captured-delta=0 vs resolved-delta=60000 under `advanceTimersByTime(60000)`) and fixed.

- **R12 (HIGH, accepted) — the clock module captured `performance` at import, defeating jest's fake clock.** `jest.useFakeTimers()` (in `beforeEach`) swaps `global.performance` for a fake AFTER the module is imported, so a captured reference keeps reading the real clock: `now()` would not advance under `advanceTimersByTime`, silently breaking the existing `completion_time===60` expiry test and the new clock-jump test. My initial probe missed this because it called `performance.now()` directly (resolving the fake at call time) rather than through a captured reference. Fix applied: `monotonicClock.now()` resolves `globalThis.performance` on every call (verified: resolved-delta=60000).

- **R13 (MEDIUM, accepted) — the screen expiry tests still used `jest.setSystemTime` to simulate elapsed.** With the monotonic clock, `setSystemTime` no longer advances assessment elapsed, so the "expired tap" and `completion_time===7` assertions would fail (elapsed stays ~0). Fix applied: both `LetterAssessmentScreen.expiry` and `SequentialAssessmentScreen.expiry` now `jest.mock` the clock with a mutable `mockNow` (set to 65000 for the hard-stop tests, 7000 for the completion-time test), matching the hook timer tests.

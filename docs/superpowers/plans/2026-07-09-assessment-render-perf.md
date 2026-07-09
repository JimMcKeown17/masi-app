# Assessment Render-Performance Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate assessment-capture tap lag and countdown drift on low-end field Android by isolating the 1 Hz countdown into a self-ticking leaf, memoizing grid tiles, and replacing tick-counting with a monotonic `Date.now()` clock that pauses on background and hard-stops on expiry.

**Architecture:** Timekeeping becomes ref-based and monotonic inside `useAssessmentSession` (no per-tick screen re-render). A new `CountdownTimer` leaf self-ticks and reads `getElapsedMs()` so only it re-renders each second. Grid tiles move into a `React.memo` `LetterTile` fed scalar props. An authoritative `isExpired()` guards every capture-mutation path. Background is an explicit pause. This is not a sync change.

**Tech Stack:** React Native (Expo, Hermes) + React 18 + `@testing-library/react-native` v13 + Jest (`jest-expo` preset) + React Native Paper.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-09-assessment-render-perf-design.md` (locked decisions: background = pause & resume; testing = render-spy + device).
- Clock source is `Date.now()` delta (parity with `src/components/common/ElapsedTime.js`), clamped to `[0, ASSESSMENT_DURATION * 1000]`. Do not use `performance.now()`.
- `ASSESSMENT_DURATION = 60` (seconds), from `src/constants/egraConstants.js`. Duration in ms is `ASSESSMENT_DURATION * 1000`.
- Tests live flat in `/__tests__/` as `*.test.js`. Run under Node 20: prefix commands with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Known flake (not a regression): `CreateClassScreen.test.js` can time out under parallel load; it passes in isolation.
- Not a sync/RLS change: do NOT touch `documentation/rls-sync-contract-map.md`, migrations, or repository sync paths.
- Authored text (code comments, commit messages, docs): no em dashes; no agent co-author trailer on commits.
- Commit style: `type(scope): message`. Stage only each task's named files.

## File Structure

- `src/hooks/useAssessmentSession.js` (modify) — monotonic timekeeping refs, `getElapsedMs`, `isExpired`, AppState pause, `runningRef`-gated `startActive`/`stopTimer`; later drops `timeRemaining`/`isPaused`.
- `src/components/assessment/CountdownTimer.js` (create) — self-ticking 1 Hz leaf; renders `AssessmentTimer`.
- `src/components/assessment/LetterTile.js` (create) — `React.memo` single tile, scalar props.
- `src/components/assessment/EgraLetterGrid.js` (modify) — render `LetterTile` with scalar props.
- `src/components/assessment/AssessmentTimer.js` (unchanged) — stays a pure presentational bar+text.
- `src/screens/assessments/LetterAssessmentScreen.js` (modify) — consume `CountdownTimer`, add `isExpired()` guard.
- `src/screens/assessments/SequentialAssessmentScreen.js` (modify) — consume `CountdownTimer`, add `isExpired()` guards.
- Tests (create): `__tests__/useAssessmentSession.timer.test.js`, `__tests__/CountdownTimer.test.js`, `__tests__/LetterTile.test.js`, `__tests__/EgraLetterGrid.renderCount.test.js`, `__tests__/LetterAssessmentScreen.expiry.test.js`, `__tests__/SequentialAssessmentScreen.expiry.test.js`, `__tests__/LetterAssessmentScreen.renderIsolation.test.js`.
- Docs (modify): `documentation/sqlite-refactor-log.md`, and spec status line.

---

### Task 1: Hook — monotonic timekeeping, `getElapsedMs`, `isExpired`

Replace tick-counting with `Date.now()`-delta accounting. Keep `timeRemaining`/`isPaused` in the return for now (removed in Task 7) so both screens keep compiling. The display interval now derives from the monotonic clock (already drift-free) and also runs the expiry watchdog.

**Files:**
- Modify: `src/hooks/useAssessmentSession.js`
- Test: `__tests__/useAssessmentSession.timer.test.js`

**Interfaces:**
- Produces: `getElapsedMs(): number` (clamped ms elapsed), `isExpired(): boolean`, `startActive(): void`, `stopTimer(): void` (freezes clock, banks elapsed, clears watchdog, sets `runningRef=false`), plus still-returned `phase`, `setPhase`, `layout`, `hasFinishedRef`, `finishAndSave`, `setOnTimerExpire`, and (transitional) `timeRemaining`, `isPaused`.
- Consumes: `ASSESSMENT_DURATION` from `src/constants/egraConstants.js`; `buildAssessmentRecord` unchanged.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/useAssessmentSession.timer.test.js`:

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

const T0 = new Date('2026-07-09T08:00:00.000Z');
const at = (s) => new Date(T0.getTime() + s * 1000);

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
    jest.setSystemTime(T0);
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ triggerBackgroundSync: jest.fn(), refreshSyncStatus: jest.fn() });
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

  test('elapsed is Date-based and immune to throttled ticks', () => {
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });
    // Wall clock advances 5s but NO interval ticks fire (simulates Android throttling).
    act(() => { jest.setSystemTime(at(5)); });
    expect(result.current.getElapsedMs()).toBe(5000);
    expect(result.current.isExpired()).toBe(false);
  });

  test('isExpired() true at duration and watchdog fires onTimerExpire once', () => {
    const onExpire = jest.fn();
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.setOnTimerExpire(onExpire); result.current.startActive(); });
    act(() => { jest.advanceTimersByTime(60000); });
    expect(result.current.isExpired()).toBe(true);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  test('elapsed is clamped to the duration ceiling', () => {
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });
    act(() => { jest.setSystemTime(at(120)); });
    expect(result.current.getElapsedMs()).toBe(60000);
  });

  test('stopTimer freezes elapsed at the banked value', () => {
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });
    act(() => { jest.setSystemTime(at(8)); });
    act(() => { result.current.stopTimer(); });
    act(() => { jest.setSystemTime(at(30)); });
    expect(result.current.getElapsedMs()).toBe(8000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest useAssessmentSession.timer -c package.json`
Expected: FAIL (`getElapsedMs`/`isExpired` are not functions).

- [ ] **Step 3: Rewrite the hook's timekeeping**

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

  // Monotonic timekeeping: Date.now()-delta accounting means no tick-counting and no drift.
  const runningRef = useRef(false);    // intent: clock should accrue (between startActive and stop/finish)
  const startedAtRef = useRef(null);   // Date.now() of the current accruing segment; null while paused/frozen/stopped
  const accumulatedMsRef = useRef(0);  // ms banked from earlier segments (before pauses/freezes)

  const onTimerExpireRef = useRef(() => {});
  const setOnTimerExpire = useCallback((fn) => { onTimerExpireRef.current = fn; }, []);

  const getElapsedMs = useCallback(() => {
    const running = startedAtRef.current != null;
    const raw = accumulatedMsRef.current + (running ? Date.now() - startedAtRef.current : 0);
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
    startedAtRef.current = Date.now();
    runningRef.current = true;
    setPhase('active');
  }, []);

  // Freeze the clock precisely (parity with the original clearInterval) WITHOUT setting
  // hasFinishedRef, so a later finishAndSave can still save. Banks elapsed, stops accrual.
  const stopTimer = useCallback(() => {
    if (startedAtRef.current != null) {
      accumulatedMsRef.current += Date.now() - startedAtRef.current;
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

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest useAssessmentSession.timer -c package.json`
Expected: PASS (4 tests).

- [ ] **Step 5: Confirm no regression in the existing screen test**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest LetterAssessmentScreen.plan5 -c package.json`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useAssessmentSession.js __tests__/useAssessmentSession.timer.test.js
git commit -m "perf(assessment): monotonic Date.now() timekeeping with isExpired hard-stop"
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

Add these two tests inside the `describe('useAssessmentSession monotonic timekeeping', ...)` block in `__tests__/useAssessmentSession.timer.test.js`, and add `AppState` to the react-native import usage by importing it at the top of the file:

```javascript
// add to the top imports:
import { AppState } from 'react-native';

// add inside the describe block:
  test('backgrounding pauses the clock and foregrounding resumes it', () => {
    let handler;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      handler = fn;
      return { remove: jest.fn() };
    });
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });
    act(() => { jest.setSystemTime(at(10)); });          // 10s elapsed
    act(() => { handler('background'); });
    act(() => { jest.setSystemTime(at(40)); });          // 30s in background: must not count
    expect(result.current.getElapsedMs()).toBe(10000);
    act(() => { handler('active'); });
    act(() => { jest.setSystemTime(at(42)); });          // 2s after resume
    expect(result.current.getElapsedMs()).toBe(12000);
  });

  test('after stopTimer, a background/foreground cycle does not resume the clock', () => {
    let handler;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      handler = fn;
      return { remove: jest.fn() };
    });
    const { result } = renderHook(() => useAssessmentSession(makeArgs()));
    act(() => { result.current.startActive(); });
    act(() => { jest.setSystemTime(at(5)); });
    act(() => { result.current.stopTimer(); });
    act(() => { handler('background'); handler('active'); });
    act(() => { jest.setSystemTime(at(25)); });
    expect(result.current.getElapsedMs()).toBe(5000);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest useAssessmentSession.timer -c package.json`
Expected: FAIL (the new "resume" test sees elapsed keep counting during background, and/or `AppState.addEventListener` is never called so `handler` is undefined).

- [ ] **Step 3: Add the AppState pause effect and import**

In `src/hooks/useAssessmentSession.js`, change the react-native import line to include `AppState`:

```javascript
import { Alert, AppState, useWindowDimensions } from 'react-native';
```

Then add this effect immediately after the `stopTimer` `useCallback` (before the display/watchdog `useEffect`):

```javascript
  // Background-as-pause. Freeze accrual on background/inactive; resume on foreground.
  // Gated by runningRef so a clock frozen by stopTimer/finish never un-freezes.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (!runningRef.current) return;
      if (next === 'active') {
        if (startedAtRef.current == null) startedAtRef.current = Date.now();
      } else if (startedAtRef.current != null) {
        accumulatedMsRef.current += Date.now() - startedAtRef.current;
        startedAtRef.current = null;
      }
    });
    return () => sub.remove();
  }, []);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest useAssessmentSession.timer -c package.json`
Expected: PASS (6 tests).

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

- [ ] **Step 5: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest LetterTile EgraLetterGrid.renderCount -c package.json`
Expected: PASS (LetterTile 3 tests, grid 2 tests).

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
- Test: `__tests__/LetterAssessmentScreen.expiry.test.js`

**Interfaces:**
- Consumes: `getElapsedMs`, `isExpired`, `startActive`, `stopTimer`, `finishAndSave`, `setOnTimerExpire`, `phase`, `setPhase`, `layout`, `hasFinishedRef` from the hook; `CountdownTimer` from Task 3.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/LetterAssessmentScreen.expiry.test.js`:

```javascript
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';
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

const T0 = new Date('2026-07-09T08:00:00.000Z');
const at = (s) => new Date(T0.getTime() + s * 1000);

describe('LetterAssessmentScreen expiry + timing', () => {
  const navigation = { addListener: jest.fn(() => jest.fn()), navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), dispatch: jest.fn() };
  const route = { params: {
    child: { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' },
    letterSet: { id: 'english-test', language: 'English', letters: ['a'], lettersPerPage: 1, columns: 1 },
    attemptNumber: 2, assessmentType: 'letter_egra',
  } };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ refreshSyncStatus: jest.fn().mockResolvedValue({}), triggerBackgroundSync: jest.fn() });
    assessmentsRepository.saveAssessment.mockResolvedValue(true);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

  test('a tap after expiry does not record the tile', () => {
    const { getByText, getByLabelText, queryByLabelText } = render(
      <LetterAssessmentScreen navigation={navigation} route={route} />
    );
    fireEvent.press(getByText('Start Assessment'));
    act(() => { jest.setSystemTime(at(65)); });          // past the 60s deadline, no watchdog tick fired
    fireEvent.press(getByLabelText('a, not marked'));
    expect(queryByLabelText('a, correct')).toBeNull();   // the expired tap did not record
  });

  test('completion_time reflects real elapsed seconds', async () => {
    const { getByText, getByLabelText } = render(
      <LetterAssessmentScreen navigation={navigation} route={route} />
    );
    fireEvent.press(getByText('Start Assessment'));
    fireEvent.press(getByLabelText('a, not marked'));    // record a correct so Finish saves directly
    act(() => { jest.setSystemTime(at(7)); });
    fireEvent.press(getByText('Finish'));
    await waitFor(() => expect(assessmentsRepository.saveAssessment).toHaveBeenCalled());
    expect(assessmentsRepository.saveAssessment.mock.calls[0][0].completion_time).toBe(7);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest LetterAssessmentScreen.expiry -c package.json`
Expected: FAIL (the expired tap currently records because there is no `isExpired()` guard; `completion_time` may not equal 7 yet only if elapsed differs — the guard test is the key red).

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

- [ ] **Step 6: Commit**

```bash
git add src/screens/assessments/LetterAssessmentScreen.js __tests__/LetterAssessmentScreen.expiry.test.js
git commit -m "perf(assessment): isolate letter-screen timer and add isExpired hard-stop"
```

---

### Task 6: `SequentialAssessmentScreen` — CountdownTimer + isExpired guards

Swap the timer for `CountdownTimer`, stop consuming `timeRemaining`/`isPaused`, and add the `isExpired()` hard-stop to `decide` and `goBack`.

**Files:**
- Modify: `src/screens/assessments/SequentialAssessmentScreen.js`
- Test: `__tests__/SequentialAssessmentScreen.expiry.test.js`

**Interfaces:**
- Consumes: `getElapsedMs`, `isExpired`, `finishAndSave`, `setOnTimerExpire`, `phase`, `layout`, `hasFinishedRef`, `startActive` from the hook; `finishWith` local callback (declared before `decide`/`goBack`).

- [ ] **Step 1: Write the failing test**

Create `__tests__/SequentialAssessmentScreen.expiry.test.js`:

```javascript
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';
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

const T0 = new Date('2026-07-09T08:00:00.000Z');
const at = (s) => new Date(T0.getTime() + s * 1000);

describe('SequentialAssessmentScreen expiry', () => {
  const navigation = { addListener: jest.fn(() => jest.fn()), navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), dispatch: jest.fn() };
  const route = { params: {
    child: { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' },
    letterSet: { id: 'english-test', language: 'English', letters: ['a', 'b'], lettersPerPage: 20, columns: 5 },
    attemptNumber: 1, assessmentType: 'letter_egra', captureMode: 'sequential',
  } };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ refreshSyncStatus: jest.fn().mockResolvedValue({}), triggerBackgroundSync: jest.fn() });
    assessmentsRepository.saveAssessment.mockResolvedValue(true);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); jest.clearAllMocks(); });

  test('a decision after expiry finalizes without recording it', async () => {
    const { getByText } = render(<SequentialAssessmentScreen navigation={navigation} route={route} />);
    fireEvent.press(getByText('Start Assessment'));
    act(() => { jest.setSystemTime(at(65)); });          // past the deadline
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
Expected: PASS (expiry 1 test; plus any existing SequentialAssessmentScreen tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/screens/assessments/SequentialAssessmentScreen.js __tests__/SequentialAssessmentScreen.expiry.test.js
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
  // Expiry watchdog: authoritative, ref-based, fires onTimerExpire. No setState the screen renders.
  useEffect(() => {
    if (phase !== 'active') return undefined;
    timerRef.current = setInterval(() => {
      if (isExpired()) {
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
- Testing: render-spy (Task 4 tile-spy, Task 7 grid-spy), behavioral drift/expiry/pause/runningRef (Tasks 1-2), device check (Task 8 doc). ✓
- Non-goals honored: no sync/RLS/migration files touched. ✓

**Placeholder scan:** No TBD/TODO; every code and test step contains full content. ✓

**Type consistency:** `getElapsedMs`/`isExpired`/`startActive`/`stopTimer` names match across hook return (Task 1), screen consumption (Tasks 5-6), and the final return (Task 7). `LetterTile` prop names (`state`, `isCurrent`, `onPress`, `fontSize`) match between the component (Task 4), the grid (Task 4), and the mock in the render-count test (Task 4). ✓

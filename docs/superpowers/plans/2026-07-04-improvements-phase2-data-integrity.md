# Improvements Phase 2: Data Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two remaining data-corruption paths from `documentation/improvements-2026-07.md`: item 2 (the session-form letter tracker silently loses assessment mastery once a child's latest assessment is a word assessment) and item 1 (two independent `useTimeTracking` instances can create overlapping/corrupted time entries).

**Architecture:** Six tasks, one branch. Tasks 1-2 extract one shared mastery-state loader (`src/utils/masteryState.js`) and fix the `assessment_type` filter bug in it, then point both consumers at it. Tasks 3-6 promote time tracking to a single-truth `TimeTrackingContext` (compat shim keeps every import path and screen test unchanged), add an atomic repository guard against a second open entry, make clock-out re-resolve the active entry, and isolate the 1Hz elapsed ticker into a leaf component. Tasks 1-2 must run in order; tasks 3-6 must run in order; the two groups are independent of each other.

**Tech Stack:** React Native (Expo) + JavaScript, Jest + React Native Testing Library, better-sqlite3-backed SQLite test engine.

## Global Constraints

- Branch off main first: `git checkout -b improvement/p2-data-integrity` (repo rule: always branch).
- Node 20 per `.nvmrc`; if the shell defaults to Node 22, prefix jest commands with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Commit messages: `type(scope): message`. Never add an agent name as co-author.
- Do not touch `documentation/rls-sync-contract-map.md`: no synced payload, RLS policy, or outbox ordering changes anywhere in this phase. The new `createOpenTimeEntry` writes the identical record shape and outbox operation `saveTimeEntry` writes today; only a local pre-insert existence check is added.
- No schema changes; no Supabase migrations.
- Never write an em dash in any authored doc, comment, or commit message. Exception: code blocks that preserve existing source comments stay byte-identical.
- CI (`tests` workflow) now runs on the PR; the phase ends with a green run.
- **Reviewer/verification note:** treat git as read-only during any concurrent review (no stash/checkout/restore of the working tree).

---

### Task 1: Shared mastery-state loader + the word-assessment regression fix

**The bug (improvements item 2):** `buildAssessmentRecord` stamps `letter_language` for both assessment types (`assessmentScoring.js:54`), and the session-form tracker picks the child's "latest assessment" filtering only on language (`src/components/session/LetterTrackerBottomSheet.js:70` and `getTrackerCount` at `:252`), while `computeAssessmentMastery` returns an empty set for non-letter types (`letterMastery.js:32`). So a newer `word_egra` assessment wipes the tracker's mastery display. `LetterMasteryPanel.js:53` already filters correctly with `(a.assessment_type || 'letter_egra') === 'letter_egra'`. Fix in ONE shared loader, not by patching the copy.

**Files:**
- Create: `src/utils/masteryState.js`
- Create: `__tests__/masteryState.test.js`
- Modify: `src/components/session/LetterTrackerBottomSheet.js` (the load effect ~lines 58-97, `masteredCount` ~line 144, `getTrackerCount` ~lines 241-280, imports)
- Modify: `__tests__/LetterTrackerBottomSheet.plan5.test.js` (add the regression test)

**Interfaces:**
- Produces: `loadMasteryState({ userId, childId, languageKey }) -> Promise<{ letterSet, pedagogicalOrder, assessmentMastered: Set<string>, latestAssessment: object|null, taughtRecords: Array }>` and `countMastered({ assessmentMastered, taughtLetters: Set, pendingChanges = {}, pedagogicalOrder }) -> number`. Task 2 consumes `loadMasteryState` exactly.
- Removes: the `getTrackerCount` export (dead code; zero production callers).
- Consumes: `assessmentsRepository.getAssessments({ userId, childId })`, `masteryRepository.getLetterMastery({ userId, childId })`, `computeAssessmentMastery`, `LETTER_SETS`/`PEDAGOGICAL_ORDERS`.

- [x] **Step 1: Write the failing regression test THROUGH THE RENDERED SHEET**

The bug's real surface is the rendered sheet (locked cells + subtitle count), and `getTrackerCount` turns out to have zero production callers (verified 2026-07-04: only its own test imports it), so the regression must render. In `__tests__/LetterTrackerBottomSheet.plan5.test.js` (keep its existing repository module mocks; add React/RTL/Paper imports and `import { LETTER_SETS } from '../src/constants/egraConstants';`), add:

```javascript
const renderSheet = (props = {}) => render(
  <PaperProvider settings={{ icon: () => null }}>
    <LetterTrackerBottomSheet
      visible
      onDismiss={jest.fn()}
      child={{ id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' }}
      userId="user-1"
      languageKey="english"
      pendingChanges={{}}
      onChangesUpdate={jest.fn()}
      {...props}
    />
  </PaperProvider>
);

  test('a newer word assessment does not wipe rendered assessment mastery', async () => {
    assessmentsRepository.getAssessments.mockResolvedValue([
      {
        id: 'a-letter',
        child_id: 'child-1',
        assessment_type: 'letter_egra',
        letter_language: 'English',
        date_assessed: '2026-07-01',
        created_at: '2026-07-01T10:00:00Z',
        last_letter_attempted: { index: 2 },
        correct_letters: [{ index: 0 }, { index: 1 }, { index: 2 }],
      },
      {
        id: 'a-word',
        child_id: 'child-1',
        assessment_type: 'word_egra',
        letter_language: 'English',
        date_assessed: '2026-07-02',
        created_at: '2026-07-02T10:00:00Z',
        last_letter_attempted: { index: 5 },
        correct_letters: [],
      },
    ]);
    masteryRepository.getLetterMastery.mockResolvedValue([]);

    // The letter at EGRA position 0 was attempted and fully correct in the
    // letter assessment; the newer word assessment must not unlock it.
    const firstEgraLetter = LETTER_SETS.english.letters[0].toLowerCase();
    const { getByLabelText } = renderSheet();

    await waitFor(() =>
      expect(getByLabelText(`${firstEgraLetter}, mastered from assessment`)).toBeTruthy(),
    );
  });
```

(The default export needs importing alongside the existing named import: `import LetterTrackerBottomSheet, { ... }` — after Step 5 removes `getTrackerCount`, the import becomes default-only.)

- [x] **Step 2: Run to verify it fails**

```bash
npx jest __tests__/LetterTrackerBottomSheet.plan5.test.js -t "word assessment" --verbose
```

Expected: FAIL — the cell renders with label `..., not mastered` because the newer word assessment wins the latest-assessment sort and `computeAssessmentMastery` returns an empty set.

- [x] **Step 3: Create the shared loader**

Create `src/utils/masteryState.js`:

```javascript
/**
 * Shared mastery-state loader for the letter tracker surfaces.
 *
 * Single source of truth for "which letters are assessment-mastered and which
 * are coach-taught" so LetterMasteryPanel (ChildResults / LetterTracker) and
 * LetterTrackerBottomSheet (session form) can never diverge. Write timing is
 * deliberately NOT here: the panel writes immediately, the sheet defers via
 * pendingChanges. Only reads and pure counting live in this module.
 */
import { LETTER_SETS, PEDAGOGICAL_ORDERS } from '../constants/egraConstants';
import { computeAssessmentMastery } from './letterMastery';
import { assessmentsRepository } from '../db/repositories/assessmentsRepository';
import { masteryRepository } from '../db/repositories/masteryRepository';

export async function loadMasteryState({ userId, childId, languageKey }) {
  const letterSet = LETTER_SETS[languageKey];
  const pedagogicalOrder = PEDAGOGICAL_ORDERS[languageKey];
  if (!letterSet || !pedagogicalOrder) {
    return {
      letterSet: null,
      pedagogicalOrder: null,
      assessmentMastered: new Set(),
      latestAssessment: null,
      taughtRecords: [],
    };
  }

  // Latest LETTER assessment for this language. Word assessments also stamp
  // letter_language, and computeAssessmentMastery returns an empty set for
  // them, so filtering by type here is what keeps a newer word assessment
  // from wiping tracker mastery.
  const allAssessments = await assessmentsRepository.getAssessments({ userId, childId });
  const childAssessments = allAssessments
    .filter(a => a.child_id === childId
      && a.letter_language === letterSet.language
      && (a.assessment_type || 'letter_egra') === 'letter_egra')
    .sort((a, b) => {
      const dateCmp = b.date_assessed.localeCompare(a.date_assessed);
      if (dateCmp !== 0) return dateCmp;
      return b.created_at.localeCompare(a.created_at);
    });
  const latestAssessment = childAssessments[0] || null;
  const assessmentMastered = computeAssessmentMastery(latestAssessment, letterSet, pedagogicalOrder);

  const allMastery = await masteryRepository.getLetterMastery({ userId, childId });
  const taughtRecords = allMastery.filter(
    r => r.child_id === childId && r.language === letterSet.language && !r._deleted
  );

  return { letterSet, pedagogicalOrder, assessmentMastered, latestAssessment, taughtRecords };
}

export function countMastered({ assessmentMastered, taughtLetters, pendingChanges = {}, pedagogicalOrder }) {
  let count = 0;
  for (const letter of pedagogicalOrder) {
    if (assessmentMastered.has(letter)) { count += 1; continue; }
    if (pendingChanges[letter] === true) { count += 1; continue; }
    if (pendingChanges[letter] === false) continue;
    if (taughtLetters.has(letter)) { count += 1; continue; }
  }
  return count;
}
```

- [x] **Step 4: Add the loader's own unit tests**

Create `__tests__/masteryState.test.js`:

```javascript
import { loadMasteryState, countMastered } from '../src/utils/masteryState';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { masteryRepository } from '../src/db/repositories/masteryRepository';

jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: { getAssessments: jest.fn() },
}));
jest.mock('../src/db/repositories/masteryRepository', () => ({
  masteryRepository: { getLetterMastery: jest.fn() },
}));

const letterAssessment = {
  id: 'a-letter',
  child_id: 'child-1',
  assessment_type: 'letter_egra',
  letter_language: 'English',
  date_assessed: '2026-07-01',
  created_at: '2026-07-01T10:00:00Z',
  last_letter_attempted: { index: 2 },
  correct_letters: [{ index: 0 }, { index: 1 }, { index: 2 }],
};
const newerWordAssessment = {
  id: 'a-word',
  child_id: 'child-1',
  assessment_type: 'word_egra',
  letter_language: 'English',
  date_assessed: '2026-07-02',
  created_at: '2026-07-02T10:00:00Z',
  last_letter_attempted: { index: 5 },
  correct_letters: [],
};

describe('loadMasteryState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    masteryRepository.getLetterMastery.mockResolvedValue([]);
  });

  test('picks the latest LETTER assessment even when a word assessment is newer', async () => {
    assessmentsRepository.getAssessments.mockResolvedValue([letterAssessment, newerWordAssessment]);
    const state = await loadMasteryState({ userId: 'user-1', childId: 'child-1', languageKey: 'english' });
    expect(state.latestAssessment.id).toBe('a-letter');
    expect(state.assessmentMastered.size).toBeGreaterThan(0);
  });

  test('legacy assessments without assessment_type still count as letter assessments', async () => {
    const legacy = { ...letterAssessment, id: 'a-legacy' };
    delete legacy.assessment_type;
    assessmentsRepository.getAssessments.mockResolvedValue([legacy]);
    const state = await loadMasteryState({ userId: 'user-1', childId: 'child-1', languageKey: 'english' });
    expect(state.latestAssessment.id).toBe('a-legacy');
  });

  test('taught records exclude soft-deleted rows and other languages', async () => {
    assessmentsRepository.getAssessments.mockResolvedValue([]);
    masteryRepository.getLetterMastery.mockResolvedValue([
      { id: 'm1', child_id: 'child-1', letter: 'a', language: 'English', _deleted: false },
      { id: 'm2', child_id: 'child-1', letter: 'b', language: 'English', _deleted: true },
      { id: 'm3', child_id: 'child-1', letter: 'c', language: 'isiXhosa', _deleted: false },
    ]);
    const state = await loadMasteryState({ userId: 'user-1', childId: 'child-1', languageKey: 'english' });
    expect(state.taughtRecords.map(r => r.id)).toEqual(['m1']);
  });

  test('unknown language key returns empty state without repository calls', async () => {
    const state = await loadMasteryState({ userId: 'user-1', childId: 'child-1', languageKey: 'klingon' });
    expect(state.assessmentMastered.size).toBe(0);
    expect(state.taughtRecords).toEqual([]);
    expect(assessmentsRepository.getAssessments).not.toHaveBeenCalled();
  });
});

describe('countMastered', () => {
  const pedagogicalOrder = ['a', 'b', 'c', 'd'];

  test('counts assessment, pending-add, and stored-taught; pending-remove wins over stored', () => {
    const count = countMastered({
      assessmentMastered: new Set(['a']),
      taughtLetters: new Set(['b', 'c']),
      pendingChanges: { c: false, d: true },
      pedagogicalOrder,
    });
    // a (assessment) + b (stored) + d (pending add); c removed by pending false
    expect(count).toBe(3);
  });
});
```

- [x] **Step 5: Point the bottom sheet at the loader**

In `src/components/session/LetterTrackerBottomSheet.js`:

1. Replace the imports of `computeAssessmentMastery`, `assessmentsRepository`, and `masteryRepository` with:

```javascript
import { loadMasteryState, countMastered } from '../../utils/masteryState';
```

(Keep the `LETTER_SETS, PEDAGOGICAL_ORDERS` import; `normalizeLanguageKey` was imported from `letterMastery` alongside `computeAssessmentMastery`; keep `normalizeLanguageKey` only if this file still references it; it does not, so the whole `letterMastery` import line goes.)

2. Replace the load effect body (currently lines 58-97) with:

```javascript
  useEffect(() => {
    if (!visible || !child) return;

    (async () => {
      setLoading(true);
      try {
        const { assessmentMastered: masteredSet, taughtRecords } = await loadMasteryState({
          userId,
          childId: child.id,
          languageKey,
        });
        setAssessmentMastered(masteredSet);
        setExistingTaught(new Set(taughtRecords.map(r => r.letter)));
      } catch (error) {
        console.error('Error loading tracker data for bottom sheet:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, child?.id, languageKey, userId]);
```

(`userId` joins the dependency list: the current code omitted it, which could leave mastery loaded for the wrong user if the user changes while the sheet stays mounted.)

3. Replace the `masteredCount` computation (currently ~line 144) with:

```javascript
  const masteredCount = pedagogicalOrder
    ? countMastered({ assessmentMastered, taughtLetters: existingTaught, pendingChanges, pedagogicalOrder })
    : 0;
```

4. **Delete the `getTrackerCount` export entirely** (currently lines 237-280, including its JSDoc). Verified 2026-07-04: it has zero production callers — the session form computes its button label from a local pending-change count (`LiteracySessionForm.js:293-296`) and nothing else imports it. Its counting semantics live on in `countMastered` (YAGNI: dead helper deleted, not rewritten).

5. **Port the plan5 test file's existing `getTrackerCount` cases to `countMastered`:** for each existing test in `__tests__/LetterTrackerBottomSheet.plan5.test.js` that asserts a count from `getTrackerCount`, add an equivalent `countMastered` case to the `countMastered` describe in `__tests__/masteryState.test.js` (same fixtures expressed as `assessmentMastered`/`taughtLetters`/`pendingChanges` inputs), then delete the old helper tests. The plan5 file keeps its repository mocks and now holds the rendered-sheet tests from Step 1.

- [x] **Step 6: Run to verify green**

```bash
npx jest __tests__/LetterTrackerBottomSheet.plan5.test.js __tests__/masteryState.test.js __tests__/LiteracySessionForm.test.js --verbose
```

Expected: PASS, including the Step 1 regression test and all pre-existing sheet/form tests.

- [x] **Step 7: Commit**

```bash
git add src/utils/masteryState.js __tests__/masteryState.test.js src/components/session/LetterTrackerBottomSheet.js __tests__/LetterTrackerBottomSheet.plan5.test.js
git commit -m "fix(mastery): shared mastery-state loader; word assessments no longer wipe tracker mastery"
```

---

### Task 2: LetterMasteryPanel reads through the shared loader

Behavior-preserving: the panel's filter was already correct; this removes the duplicate pipeline so the two surfaces cannot diverge again.

**Files:**
- Modify: `src/components/assessment/LetterMasteryPanel.js` (`loadData` at lines 43-84, imports)

**Interfaces:**
- Consumes: `loadMasteryState` from Task 1 (exact signature above). The panel's write path (`handleCellTap`) is untouched.

- [x] **Step 1: Rewrite `loadData`**

In `src/components/assessment/LetterMasteryPanel.js`, add the import:

```javascript
import { loadMasteryState } from '../../utils/masteryState';
```

Remove the now-unused imports of `computeAssessmentMastery` (keep `normalizeLanguageKey`, still used at line 32) and `assessmentsRepository` (`masteryRepository` stays: `handleCellTap` uses it). Replace `loadData` (lines 43-84) with:

```javascript
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const { assessmentMastered: masteredSet, latestAssessment, taughtRecords } = await loadMasteryState({
        userId: user.id,
        childId: child.id,
        languageKey,
      });
      setLatestAssessmentDate(latestAssessment?.date_assessed || null);
      setAssessmentMastered(masteredSet);

      const taughtMap = {};
      taughtRecords.forEach(r => { taughtMap[r.letter] = r.id; });
      setTaughtLetters(taughtMap);
    } catch (error) {
      console.error('Error loading letter tracker data:', error);
    } finally {
      setLoading(false);
    }
  }, [child.id, languageKey, user.id]);
```

- [x] **Step 2: Run the panel suite plus the loader tests**

```bash
npx jest __tests__/LetterMasteryPanel.test.js __tests__/masteryState.test.js __tests__/ChildResultsScreen.test.js --verbose
```

Expected: PASS with zero test-file changes; the panel's 4 existing behavior tests pin the rewrite.

- [x] **Step 3: Commit**

```bash
git add src/components/assessment/LetterMasteryPanel.js
git commit -m "refactor(mastery): LetterMasteryPanel reads through the shared mastery-state loader"
```

---

### Task 3: Promote time tracking to a single-truth TimeTrackingContext

**The bug (improvements item 1):** HomeScreen (`HomeScreen.js:41`) and TimeTrackingScreen (`TimeTrackingScreen.js:21`) each instantiate `useTimeTracking`, each loading `isSignedIn`/`activeEntry` only on mount (`useTimeTracking.js:33-40`). The app's own dialog flow (Home → Record Session → "Clock In Now" → clock in on TimeTracking → back) leaves Home's copy stale; `handleSignIn` guards only on the stale copy (`:140`), so a second open entry can be created. One context instance removes the dual truth. A compat shim keeps every existing import path (`../hooks/useTimeTracking`) and therefore every screen test (they all mock that module path) working unchanged.

**Files:**
- Create: `src/context/TimeTrackingContext.js`
- Modify: `src/hooks/useTimeTracking.js` (becomes a re-export shim)
- Modify: `App.js` (import + provider)
- Modify: `__tests__/useTimeTracking.plan5.test.js`, `__tests__/useTimeTracking.integration.test.js` (wrap `renderHook` in the provider; add the single-truth test)

**Interfaces:**
- Produces: `TimeTrackingProvider`, `useTimeTracking` (same return API as today: `isSignedIn, activeEntry, loadingLocation, elapsedTime, snackbarMessage, snackbarVisible, setSnackbarVisible, handleSignIn, handleSignOut, formatElapsedTime, formatTime`). Tasks 4-6 modify this context file.
- Consumes: `useAuth`, `useOffline` (so the provider must sit inside both in App.js).

- [x] **Step 1: Create the context by moving the hook body**

Create `src/context/TimeTrackingContext.js` with exactly this structure: copy the ENTIRE body of `src/hooks/useTimeTracking.js` (lines 1-236, verbatim, including all imports, `MAX_SHIFT_HOURS`/`MAX_SHIFT_MS`, and every function), then apply only these mechanical changes:

1. Change the React import line to:

```javascript
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
```

2. Fix the two context-relative import paths (this file lives in `src/context/`, the hook lived in `src/hooks/`): `'../context/AuthContext'` becomes `'./AuthContext'`, `'../context/OfflineContext'` becomes `'./OfflineContext'`.

3. Rename the exported hook function: `export function useTimeTracking() {` becomes `function useTimeTrackingState() {` (body unchanged, including its return object).

4. Append at the end of the file:

```javascript
const TimeTrackingContext = createContext(null);

export function TimeTrackingProvider({ children }) {
  const value = useTimeTrackingState();
  return (
    <TimeTrackingContext.Provider value={value}>
      {children}
    </TimeTrackingContext.Provider>
  );
}

export function useTimeTracking() {
  const context = useContext(TimeTrackingContext);
  if (!context) {
    throw new Error('useTimeTracking must be used within a TimeTrackingProvider');
  }
  return context;
}
```

- [x] **Step 2: Turn the hook file into a shim**

Replace the entire content of `src/hooks/useTimeTracking.js` with:

```javascript
// Compat shim: time tracking is a single-truth context now. Existing import
// paths (and the screen tests that mock this module path) stay valid.
export { useTimeTracking } from '../context/TimeTrackingContext';
```

- [x] **Step 3: Mount the provider in App.js**

In `App.js`, add the import:

```javascript
import { TimeTrackingProvider } from './src/context/TimeTrackingContext';
```

and wrap directly inside `<AuthProvider>` (it consumes useAuth and useOffline, both above it):

```jsx
          <OfflineProvider>
            <AuthProvider>
              <TimeTrackingProvider>
                <LookupsProvider>
                  <ChildrenProvider>
                    <ClassesProvider>
                      <AppNavigator />
                      <StatusBar style="auto" />
                    </ClassesProvider>
                  </ChildrenProvider>
                </LookupsProvider>
              </TimeTrackingProvider>
            </AuthProvider>
          </OfflineProvider>
```

- [x] **Step 4: Mock the new provider in the App root test**

`__tests__/App.plan5.test.js` mocks `AuthContext` and `OfflineContext` as provider-only pass-throughs (lines 24-30) with no `useAuth`/`useOffline`, so the REAL `TimeTrackingProvider` would crash there. Add the matching pass-through mock alongside the existing context mocks:

```javascript
jest.mock('../src/context/TimeTrackingContext', () => ({
  TimeTrackingProvider: ({ children }) => <>{children}</>,
}));
```

- [x] **Step 5: Wrap the two hook test files and add the single-truth test**

In `__tests__/useTimeTracking.plan5.test.js` and `__tests__/useTimeTracking.integration.test.js`: add

```javascript
import React from 'react';
import { TimeTrackingProvider } from '../src/context/TimeTrackingContext';

const wrapper = ({ children }) => <TimeTrackingProvider>{children}</TimeTrackingProvider>;
```

(the plan5 file has no React import today; the integration file already imports what it needs except React/provider) and change every `renderHook(() => useTimeTracking())` call to `renderHook(() => useTimeTracking(), { wrapper })`. Both files' existing AuthContext/OfflineContext module mocks satisfy the provider's dependencies.

Then add the single-truth pinning test to `__tests__/useTimeTracking.plan5.test.js` (inside the existing describe, reusing its beforeEach mocks):

```javascript
  test('two consumers under one provider share a single clock-in truth', async () => {
    timeEntriesRepository.getActiveTimeEntry.mockResolvedValue(null);
    timeEntriesRepository.saveTimeEntry.mockResolvedValue(true);
    getCurrentPosition.mockResolvedValue({ coords: { latitude: -33.9, longitude: 25.6 } });

    const { result } = renderHook(
      () => ({ home: useTimeTracking(), timeTracking: useTimeTracking() }),
      { wrapper },
    );

    // Let the mount-time loadActiveEntry consume its mocked call first, so the
    // sign-in path cannot race it for the queued mock results.
    await waitFor(() => expect(timeEntriesRepository.getActiveTimeEntry).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.timeTracking.handleSignIn();
    });

    expect(result.current.home.isSignedIn).toBe(true);
    expect(result.current.home.activeEntry).toBe(result.current.timeTracking.activeEntry);
  });
```

(Note: after Task 4 lands, `saveTimeEntry.mockResolvedValue` in this test becomes `createOpenTimeEntry.mockResolvedValue`; Task 4 owns that edit.)

- [x] **Step 6: Run the moved-truth suites plus every screen that consumes the shim**

```bash
npx jest __tests__/useTimeTracking.plan5.test.js __tests__/useTimeTracking.integration.test.js __tests__/TimeTrackingScreen.test.js __tests__/HomeScreen.test.js __tests__/sessionLaunchGuard.test.js __tests__/App.plan5.test.js --verbose
```

Expected: PASS. The screen tests mock the shim's module path, so they never see the context.

- [x] **Step 7: Run the full unit suite**

```bash
npx jest --silent
```

Expected: all green (`App.plan5.test.js` sees only the Step 4 pass-through mock, never the real provider).

- [x] **Step 8: Commit**

```bash
git add src/context/TimeTrackingContext.js src/hooks/useTimeTracking.js App.js __tests__/App.plan5.test.js __tests__/useTimeTracking.plan5.test.js __tests__/useTimeTracking.integration.test.js
git commit -m "refactor(time): promote time tracking to a single-truth TimeTrackingContext"
```

---

### Task 4: Repository guard against overlapping open time entries

Belt under the context's braces: even with one context, a crash-restart race or a future caller could double-insert. Make the invariant atomic where the write happens. `saveTimeEntry` itself stays untouched (tests and fixtures use it to build arbitrary histories); sign-in switches to a new guarded method.

**Files:**
- Modify: `src/db/repositories/timeEntriesRepository.js` (new `createOpenTimeEntry` + exported error)
- Modify: `src/context/TimeTrackingContext.js` (`handleSignIn` uses the guarded method)
- Test: `__tests__/timeEntriesRepository.test.js` (guard tests, real SQLite), `__tests__/useTimeTracking.plan5.test.js` (mock updates + conflict-path test)

**Interfaces:**
- Produces: `createOpenTimeEntry(entry, { transaction }) -> Promise<true>`, throws error with `code === 'OPEN_TIME_ENTRY_EXISTS'` when the user already has an open entry. Exported constant `OPEN_TIME_ENTRY_EXISTS = 'OPEN_TIME_ENTRY_EXISTS'`.
- Consumes: existing `normalizeForWrite`, `upsertRecord`, `shouldEnqueueOutbox`, `enqueueDomainOutbox` (identical record shape and outbox operation as `saveTimeEntry`, so the sync contract is unchanged).

- [x] **Step 1: Write the failing repository tests**

In `__tests__/timeEntriesRepository.test.js` (real-SQLite suite; follow its existing setup conventions), add:

```javascript
  test('createOpenTimeEntry rejects a second open entry for the same user', async () => {
    const first = buildEntry({ id: 'entry-1', sign_out_time: null });
    await repository.createOpenTimeEntry(first);

    const second = buildEntry({ id: 'entry-2', sign_out_time: null });
    await expect(async () => {
      await repository.createOpenTimeEntry(second);
    }).rejects.toBeTruthy();

    let thrown = null;
    try {
      await repository.createOpenTimeEntry(second);
    } catch (error) {
      thrown = error;
    }
    expect(thrown?.code).toBe('OPEN_TIME_ENTRY_EXISTS');

    const rows = await repository.getTimeEntries({ userId: first.user_id });
    expect(rows.filter(r => r.sign_out_time === null)).toHaveLength(1);
  });

  test('createOpenTimeEntry allows sign-in after the previous entry is closed', async () => {
    await repository.createOpenTimeEntry(buildEntry({ id: 'entry-1', sign_out_time: null }));
    await repository.updateTimeEntry('entry-1', { sign_out_time: '2026-07-04T15:00:00.000Z', synced: false });

    await expect(repository.createOpenTimeEntry(buildEntry({ id: 'entry-2', sign_out_time: null }))).resolves.toBe(true);
  });
```

Adapt `buildEntry`/`repository` to the file's existing helpers (it already creates entries and a repository against the test database; reuse those exact helper names, adding a `buildEntry` helper only if none exists). Known repo gotcha: `expect(...).rejects.toThrow()` misreports in multi-file runs, hence the try/catch assertion for the error code.

- [x] **Step 2: Run to verify they fail**

```bash
npx jest __tests__/timeEntriesRepository.test.js --verbose
```

Expected: FAIL with `repository.createOpenTimeEntry is not a function`.

- [x] **Step 3: Implement the guarded method**

In `src/db/repositories/timeEntriesRepository.js`, add above `createTimeEntriesRepository`:

```javascript
export const OPEN_TIME_ENTRY_EXISTS = 'OPEN_TIME_ENTRY_EXISTS';

class OpenTimeEntryExistsError extends Error {
  constructor() {
    super('An open time entry already exists for this user.');
    this.code = OPEN_TIME_ENTRY_EXISTS;
  }
}
```

and inside the factory, after `saveTimeEntry`:

```javascript
  const createOpenTimeEntry = async (entry, { transaction } = {}) => runWrite(transaction, async (txn) => {
    // Atomic open-entry invariant: the existence check and the insert share one
    // writer transaction, so two racing sign-ins cannot both pass the check.
    const open = await txn.getFirstAsync(`
      select id
      from time_entries
      where user_id = ?
        and sign_out_time is null
      limit 1
    `, entry.user_id);
    if (open) {
      throw new OpenTimeEntryExistsError();
    }

    const record = normalizeForWrite(entry);
    await upsertRecord(txn, {
      tableName: 'time_entries',
      columns: TIME_ENTRY_COLUMNS,
      booleanColumns: ['auto_clocked_out'],
      record,
    });
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'time_entries', entry.id, 'insert', record);
    }
    return true;
  });
```

Add `createOpenTimeEntry` to the returned object.

- [x] **Step 4: Run to verify green**

```bash
npx jest __tests__/timeEntriesRepository.test.js --verbose
npm run test:integration
```

Expected: PASS (the same file runs in the integration tier).

- [x] **Step 5: Wire `handleSignIn` to the guarded method**

In `src/context/TimeTrackingContext.js`, add `OPEN_TIME_ENTRY_EXISTS` to the repository import line, change `await timeEntriesRepository.saveTimeEntry(timeEntry);` to `await timeEntriesRepository.createOpenTimeEntry(timeEntry);`, and extend the catch block of `handleSignIn`:

```javascript
    } catch (error) {
      if (error?.code === OPEN_TIME_ENTRY_EXISTS) {
        await loadActiveEntry();
        showSnackbar('Already clocked in. Please clock out first.');
        return;
      }
      console.error('Error signing in:', error);
      showSnackbar('Failed to clock in. Please try again.');
    } finally {
```

Then in `__tests__/useTimeTracking.plan5.test.js`: add `createOpenTimeEntry: jest.fn()` to the repository module mock, switch tests that stub `saveTimeEntry` for sign-in to stub `createOpenTimeEntry` (including Task 3's single-truth test), and add the conflict-path test:

```javascript
  test('a conflicting open entry recovers state instead of double-clocking-in', async () => {
    timeEntriesRepository.getActiveTimeEntry
      .mockResolvedValueOnce(null) // initial mount load
      .mockResolvedValue({ id: 'existing-entry', user_id: 'user-1', sign_in_time: new Date().toISOString(), sign_out_time: null });
    getCurrentPosition.mockResolvedValue({ coords: { latitude: -33.9, longitude: 25.6 } });
    const conflict = new Error('open entry exists');
    conflict.code = 'OPEN_TIME_ENTRY_EXISTS';
    timeEntriesRepository.createOpenTimeEntry.mockRejectedValue(conflict);

    const { result } = renderHook(() => useTimeTracking(), { wrapper });

    // Wait out the mount-time load so its mockResolvedValueOnce(null) is
    // consumed before sign-in's conflict recovery re-queries.
    await waitFor(() => expect(timeEntriesRepository.getActiveTimeEntry).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.handleSignIn();
    });

    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.activeEntry?.id).toBe('existing-entry');
  });
```

- [x] **Step 6: Run both time suites**

```bash
npx jest __tests__/useTimeTracking.plan5.test.js __tests__/useTimeTracking.integration.test.js __tests__/timeEntriesRepository.test.js --verbose
```

Expected: PASS. Note the integration suite's clock-in vertical exercises the real repository through `handleSignIn`; it now goes through `createOpenTimeEntry` and must still pass unchanged (it starts from an empty table).

- [x] **Step 7: Commit**

```bash
git add src/db/repositories/timeEntriesRepository.js src/context/TimeTrackingContext.js __tests__/timeEntriesRepository.test.js __tests__/useTimeTracking.plan5.test.js
git commit -m "feat(time): repository guard prevents overlapping open time entries"
```

---

### Task 5: Clock-out re-resolves the active entry before closing

The reverse corruption path: a stale `activeEntry` (entry already closed elsewhere, or auto-clocked-out) must not have a new `sign_out_time` written onto it.

**Files:**
- Modify: `src/context/TimeTrackingContext.js` (`handleSignOut`)
- Test: `__tests__/useTimeTracking.plan5.test.js`

**Interfaces:**
- Consumes: `timeEntriesRepository.getActiveTimeEntry(userId)` (existing).

- [x] **Step 1: Write the failing test**

```javascript
  test('clock-out with no open entry resets state without writing', async () => {
    timeEntriesRepository.getActiveTimeEntry
      .mockResolvedValueOnce({ id: 'stale-entry', user_id: 'user-1', sign_in_time: new Date().toISOString(), sign_out_time: null }) // mount
      .mockResolvedValue(null); // re-resolve at clock-out: already closed elsewhere
    getCurrentPosition.mockResolvedValue({ coords: { latitude: -33.9, longitude: 25.6 } });

    const { result } = renderHook(() => useTimeTracking(), { wrapper });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    await act(async () => {
      await result.current.handleSignOut();
    });

    expect(timeEntriesRepository.updateTimeEntry).not.toHaveBeenCalled();
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.activeEntry).toBeNull();
  });
```

- [x] **Step 2: Run to verify it fails**

```bash
npx jest __tests__/useTimeTracking.plan5.test.js -t "no open entry" --verbose
```

Expected: FAIL (`updateTimeEntry` WAS called: the current code trusts the stale `activeEntry`).

- [x] **Step 3: Implement the re-resolve**

In `handleSignOut`, immediately after `setLoadingLocation(true); try {` and BEFORE the `getCurrentPosition()` call, insert:

```javascript
      // Re-resolve from the repository: the cached entry may have been closed
      // by auto-clock-out or another path. Never write a sign_out_time onto a
      // row that is no longer the open entry.
      const current = await timeEntriesRepository.getActiveTimeEntry(user.id);
      if (!current) {
        setActiveEntry(null);
        setIsSignedIn(false);
        setElapsedTime(0);
        showSnackbar('You are not clocked in.');
        return;
      }
```

and change the rest of the function to operate on `current` instead of `activeEntry`: `const signInMs = new Date(current.sign_in_time).getTime();` and `const updatedEntry = { ...current, ... }` and `await timeEntriesRepository.updateTimeEntry(current.id, updatedEntry);`.

- [x] **Step 4: Run to verify green (both time suites)**

```bash
npx jest __tests__/useTimeTracking.plan5.test.js __tests__/useTimeTracking.integration.test.js --verbose
```

Expected: PASS. (Existing clock-out tests must keep passing: they mock `getActiveTimeEntry` with the open entry, so the re-resolve returns it. If an existing test used `mockResolvedValueOnce` for the mount load only, extend it to also serve the re-resolve call.)

- [x] **Step 5: Commit**

```bash
git add src/context/TimeTrackingContext.js __tests__/useTimeTracking.plan5.test.js
git commit -m "fix(time): clock-out re-resolves the active entry before closing"
```

---

### Task 6: Isolate the 1Hz elapsed ticker; 30s auto-clockout watchdog

Today the context (previously each screen) runs `setElapsedTime` every second, re-rendering every consumer for the whole clocked-in day. Move the ticking into a leaf component; the context keeps only a low-frequency auto-clockout watchdog with no per-tick state.

**Files:**
- Create: `src/components/common/ElapsedTime.js`
- Create: `__tests__/ElapsedTime.test.js`
- Modify: `src/context/TimeTrackingContext.js` (remove elapsed state/timer; add watchdog; shrink API)
- Modify: `src/screens/main/HomeScreen.js` (~line 199), `src/screens/main/TimeTrackingScreen.js` (~line 67)

**Interfaces:**
- Produces: `<ElapsedTime signInTime style variant />` (renders a Paper `<Text>` with `Xh Ym Zs`, ticking at 1Hz internally; renders null without `signInTime`). Exports `formatElapsedTime(ms)`.
- Removes from the context API: `elapsedTime`, `formatElapsedTime` (screens stop consuming them; the screen tests mock the hook module, so extra/missing keys in their stubs are inert).

- [x] **Step 1: Write the component test**

Create `__tests__/ElapsedTime.test.js`:

```javascript
import React from 'react';
import { render, act } from '@testing-library/react-native';
import ElapsedTime, { formatElapsedTime } from '../src/components/common/ElapsedTime';

describe('ElapsedTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-04T10:00:30.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders and ticks the elapsed time from signInTime', () => {
    const { getByText } = render(<ElapsedTime signInTime="2026-07-04T10:00:00.000Z" />);
    expect(getByText('0h 0m 30s')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(getByText('0h 0m 32s')).toBeTruthy();
  });

  test('renders nothing without a signInTime', () => {
    const { toJSON } = render(<ElapsedTime signInTime={null} />);
    expect(toJSON()).toBeNull();
  });

  test('formatElapsedTime formats hours, minutes, seconds', () => {
    expect(formatElapsedTime(3723000)).toBe('1h 2m 3s');
  });
});
```

- [x] **Step 2: Run to verify it fails**

```bash
npx jest __tests__/ElapsedTime.test.js --verbose
```

Expected: FAIL (module not found).

- [x] **Step 3: Create the component**

Create `src/components/common/ElapsedTime.js`:

```javascript
import React, { useEffect, useState } from 'react';
import { Text } from 'react-native-paper';

export function formatElapsedTime(milliseconds) {
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Self-ticking elapsed-time text. Isolates the 1Hz re-render to this leaf so
 * the time-tracking context (and every screen consuming it) stays still while
 * the EA is clocked in all day.
 */
export default function ElapsedTime({ signInTime, style, variant }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!signInTime) return undefined;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [signInTime]);

  if (!signInTime) return null;

  const elapsed = Math.max(0, now - new Date(signInTime).getTime());
  return <Text variant={variant} style={style}>{formatElapsedTime(elapsed)}</Text>;
}
```

Run the Step 1 test: expected PASS.

- [x] **Step 4: Replace the two render sites**

`src/screens/main/HomeScreen.js` (~line 199): replace

```jsx
<Text style={styles.elapsedText}>{formatElapsedTime(elapsedTime)}</Text>
```

with

```jsx
<ElapsedTime signInTime={activeEntry?.sign_in_time} style={styles.elapsedText} />
```

adding `import ElapsedTime from '../../components/common/ElapsedTime';` and removing `elapsedTime`/`formatElapsedTime` from the screen's `useTimeTracking()` destructure.

`src/screens/main/TimeTrackingScreen.js` (~line 67): replace

```jsx
<Text variant="bodyMedium" style={[styles.value, styles.elapsed]}>
  {formatElapsedTime(elapsedTime)}
</Text>
```

with

```jsx
<ElapsedTime signInTime={activeEntry?.sign_in_time} variant="bodyMedium" style={[styles.value, styles.elapsed]} />
```

with the same import and destructure cleanup.

- [x] **Step 5: Replace the context's 1Hz timer with a 30s watchdog**

In `src/context/TimeTrackingContext.js`:

1. Delete the `elapsedTime` state, the `elapsedInterval` ref, `startElapsedTimer`, `stopElapsedTimer`, `formatElapsedTime`, and every `setElapsedTime(...)` call (in `autoClockOut`, `loadActiveEntry`, `handleSignOut`, and the Task 5 no-open-entry branch).
2. Replace the `[isSignedIn, activeEntry]` timer effect (and the mount effect's interval cleanup) with:

```javascript
  useEffect(() => {
    if (!isSignedIn || !activeEntry) return undefined;

    // Low-frequency watchdog: no per-tick state (the 1Hz display lives in the
    // ElapsedTime leaf component); state only changes when the 10h limit trips.
    const checkAutoClockOut = () => {
      const elapsed = Date.now() - new Date(activeEntry.sign_in_time).getTime();
      if (elapsed >= MAX_SHIFT_MS) {
        autoClockOut(activeEntry);
      }
    };

    checkAutoClockOut();
    const interval = setInterval(checkAutoClockOut, 30 * 1000);
    return () => clearInterval(interval);
  }, [isSignedIn, activeEntry]);
```

3. Remove `elapsedTime` and `formatElapsedTime` from the returned value object (`formatTime` stays: both screens render the clock-in time with it).
4. Remove `useRef` from the React import if no other ref remains in the file after the `elapsedInterval` ref is deleted.

- [x] **Step 6: Run the affected suites, then the full suite**

```bash
npx jest __tests__/ElapsedTime.test.js __tests__/useTimeTracking.plan5.test.js __tests__/useTimeTracking.integration.test.js __tests__/HomeScreen.test.js __tests__/TimeTrackingScreen.test.js --verbose
npx jest --silent
npm run test:integration
```

Expected: PASS. If any existing hook test asserts on `elapsedTime` or auto-clock-out via 1s ticks, port it to the watchdog (advance fake timers by 30s) or to `__tests__/ElapsedTime.test.js`; do not delete auto-clock-out coverage.

- [x] **Step 7: Commit**

```bash
git add src/components/common/ElapsedTime.js __tests__/ElapsedTime.test.js src/context/TimeTrackingContext.js src/screens/main/HomeScreen.js src/screens/main/TimeTrackingScreen.js __tests__/useTimeTracking.plan5.test.js __tests__/useTimeTracking.integration.test.js
git commit -m "perf(time): isolate 1Hz elapsed ticker in ElapsedTime; 30s auto-clockout watchdog"
```

---

### Task 7: Phase wrap

- [x] **Step 1: Full gates**

```bash
npx jest --silent
npm run test:integration
```

Expected: both green (Phase 1 baseline was 118 suites / 647 unit tests; this phase adds suites/tests).

- [x] **Step 2: Documentation**

Add one row to the verification table in `documentation/sqlite-refactor-log.md` (time-entries guard + mastery loader, suites green, contract map untouched). Tick this plan's checkboxes. Update the Phase 2 entry in `PRD.md` Development Progress.

- [x] **Step 3: Commit, push, PR**

```bash
git add -A documentation/sqlite-refactor-log.md docs/superpowers/plans/2026-07-04-improvements-phase2-data-integrity.md PRD.md
git commit -m "docs(p2): phase wrap — checklists, log row"
git push -u origin improvement/p2-data-integrity
```

Open a PR; CI (`tests`) must go green; per-commit reviews per the Phase 1 pattern.

**Device gate (Jim, after merge):** the roadmap's Phase 2 gate is a device pass: clock in via the Record-Session dialog flow, return Home, verify one open entry and consistent UI in both directions; then word-assessment-then-letter-tracker cross-check showing identical mastery in the session sheet and ChildResults.

---

## Self-review notes

- Spec coverage: improvements item 2 → Tasks 1-2; item 1 (context, guard, sign-out staleness, 1Hz isolation) → Tasks 3-6.
- Type consistency: `loadMasteryState`/`countMastered` signatures identical across Tasks 1-2; `createOpenTimeEntry`/`OPEN_TIME_ENTRY_EXISTS` names identical across Task 4's repo, context, and test edits; `wrapper` defined in Task 3 is reused by Tasks 4-5 tests.
- Known interaction: Task 4 Step 5 edits Task 3's single-truth test (saveTimeEntry → createOpenTimeEntry stub); called out in both tasks.
- Verified against the working tree on 2026-07-04: all consumers of the hook mock the module path (`HomeScreen.test.js:29`, `TimeTrackingScreen.test.js:11`, `sessionLaunchGuard.test.js`); `useSessionLaunchGuard` reads clock-in state from the repository (`getClockInStatusForUser`), not from hook state, so it needs no change; the hook tests contain no elapsed-time assertions; `saveTimeEntry`'s only production callers are the hook (switching to the guard) and a dead `storage.js` facade method.

## Review round 1 (Codex adversarial review, 2026-07-04) - dispositions

- **R1 (Blocker, accepted):** `App.plan5.test.js` mocks Auth/Offline contexts as provider-only pass-throughs, so the real `TimeTrackingProvider` would crash the App root test. Fixed: Task 3 Step 4 adds the matching pass-through mock; file added to the focused run and the commit.
- **R2 (Major, accepted):** the Task 4 conflict test could consume its mount-load mock in the wrong order. Fixed: both the conflict test and Task 3's single-truth test now `waitFor` the mount-time `getActiveTimeEntry` call before signing in.
- **R3 (Major, accepted and extended):** the helper-only regression did not prove the rendered sheet is fixed, and verification showed `getTrackerCount` has zero production callers. Went further than the suggested fix: the regression test now renders the sheet and asserts the locked-cell label, and `getTrackerCount` is deleted outright (YAGNI) with its counting cases ported to `countMastered` tests.
- **R4 (Minor, accepted):** `userId` added to the sheet load effect's dependency list (omission carried over from the current code).
- **R5 (Nit, accepted):** Task 6 now calls out removing the unused `useRef` import.

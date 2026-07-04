# Item 4 — Step-by-Step Capture + Extracted Capture Spine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Orchestration model (from the Item 4 handoff):** Codex builds via the `codex:codex-rescue` subagent (TDD red→green→refactor); Claude orchestrates + reviews; a Claude reviewer subagent + a Codex adversarial pass are the two-LLM cross-review; **the controller (Claude) commits** (Codex's sandbox blocks `.git`). Right-size reviews by risk: pure/trivial tasks → controller review only; schema / hook / screen refactors → full dual review. Every review finding is a **claim to verify**, not an order.
>
> **Jest command (better-sqlite3 needs Node 20):**
> `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest <focused> --testPathIgnorePatterns "/.claude/worktrees/"`
> Focused paths per task; a bare full run only at the finish-branch gate.

**Goal:** Extract Masi's inline EGRA capture spine into a reusable `useAssessmentSession` hook (proving it by refactoring `LetterAssessmentScreen` onto it), add a cursor-based "Step-by-Step" (sequential) capture screen, and add an orthogonal `capture_mode` column + per-EA device toggle defaulting to Step-by-Step — so Masi can run its own grid-vs-sequential capture-quality comparison.

**Architecture:** One field-hardened hook owns timer + phase machine + leave-guard + `finishAndSave`; interaction (grid taps vs sequential ✓/✗ cursor) stays in each screen. Both screens build the **same fat assessment record** via a shared pure `buildAssessmentRecord`, so `assessmentsRepository.saveAssessment` (which already splits the record into the normalized `assessments` row + `assessment_items` summary/detail rows and injects `programme_id`) keeps working unchanged. `capture_mode` is stamped client-side at creation from a single mode resolver, persisted as a real nullable column (local + Supabase), and synced via the existing outbox. Capture-mode preference is **device-local** (`local_state`) with `resolveCaptureMode`'s org/user layers as wired-later seams.

**Tech stack:** React Native + Expo, React Native Paper, `expo-sqlite` (local) + durable `sync_outbox`, Supabase (`masi-app-sqlite`, ref `segygjzpujphwvrubusm`), Jest + `better-sqlite3` for real-SQLite integration tests, `@testing-library/react-native` for screen/hook tests.

---

## Pre-flight (controller, before Task 1)

- [ ] **Branch off `main`** (never build on `main`):
  ```bash
  git -C /Users/jimmckeown/Development/masi-app checkout main
  git -C /Users/jimmckeown/Development/masi-app checkout -b feature/sequential-capture
  ```
- [ ] **Leave untouched / never stage** (pre-existing unrelated work per the handoff): `skills-lock.json`, `src/screens/assessments/AssessmentResultsScreen.js`, `__tests__/AssessmentResultsScreen.test.js`, `.claude/skills/*`, `.agents/skills/*`, `documentation/top-10-improvements-2026-06.md`, `documentation/zazi-izandi-feature-port-prd-2026-go-live.md`. Stage **only** each task's own files.

## Decisions locked (Jim, 2026-06-18)

1. **Preference scope = device-local + seam.** Mirror the field-tested fork: store the toggle in `local_state`; `resolveCaptureMode` carries org/user params as no-op seams for later. Default = `sequential`. No new write path to the read-only `users` table.
2. **"Try Again" entry point deferred to Item 5.** Route only the two clean entry points (`AssessmentChildSelectScreen`, `ChildAssessmentSummaryScreen`) now. `AssessmentResultsScreen.handleTryAgain` (Item 5's territory, has unrelated uncommitted edits) keeps launching the grid until Item 5 routes it — **flagged in the build-log, not silently dropped.**

## Post-review revisions (2026-06-18) — THESE OVERRIDE the task bodies below where they conflict

Two-LLM plan review (Claude `plan-reviewer` + Codex adversarial, both verified against live code) found real gaps. All verified against the fork + Masi. Each Codex dispatch must apply the relevant revision.

**R1 (Task 3 — reducer race clamp; closes Codex HIGH).** Add a reducer-level clamp so a queued second `decide` at the boundary is a no-op regardless of render timing:
```javascript
case 'decide':
  if (action.totalLetters != null && state.cursor >= action.totalLetters) return state; // race clamp
  return { ...state, cursor: state.cursor + 1, letterStates: { ...state.letterStates, [state.cursor]: action.correct === true } };
```
Add a test: from `{cursor:2,...}` two `decide`s with `totalLetters:3` → cursor reaches 3 then stays 3 (no `letterStates[3]`, no cursor 4).

**R2 (Task 10 — dispatch the bound + race test).** Port the sequential screen's `decide` as `dispatch({ type: 'decide', correct, totalLetters })`. Add a test that fires **two Correct presses on the final item in one tick** and asserts exactly one `saveAssessment` with `letters_attempted === totalLetters` and `finalLastIndex === totalLetters - 1`.

**R3 (Task 8 — restore the grid finish freeze + grid correction tracking; Claude+Codex HIGH).** Match the fork exactly. Destructure `setPhase` from the hook. Add screen-local `finishStartedRef` + `correctionCountRef`:
```javascript
const finishStartedRef = useRef(false);
const correctionCountRef = useRef(0);
// handleToggle: on an UN-tap, count a correction (fork parity → symmetric A/B data, not hardcoded 0):
//   setLetterStates(prev => { const next = {...prev}; if (next[gi]) { delete next[gi]; correctionCountRef.current += 1; } else { next[gi] = true; } return next; });
const handleFinish = useCallback(() => {
  if (finishStartedRef.current) return;
  finishStartedRef.current = true;                       // guards re-entry (hook's hasFinishedRef only guards the SAVE, deferred past the sheet)
  const lastIndex = letterSet.letters.length - 1;
  if (letterStatesRef.current[lastIndex] === true) {
    finishAndSave({ letterStates: letterStatesRef.current, finalLastIndex: lastIndex, correctionCount: correctionCountRef.current });
  } else {
    setPhase('finished');                                // FREEZE grid + stop timer (via the hook timer effect) BEFORE the sheet
    setShowLastAttempted(true);
  }
}, [finishAndSave, letterSet, setPhase]);
// confirm/cancel both pass correctionCount: correctionCountRef.current (cancel still resolves finalLastIndex = lastTappedIndexRef.current)
```

**R4 (Task 8 — reconcile the existing test; Claude MED).** Removing the inline `saveError`/"Try Again" UI breaks `__tests__/LetterAssessmentScreen.plan5.test.js:110` ("failed assessment save shows an error and lets the user retry"). Rewrite it onto the hook's flow: mock `Alert.alert`, force `assessmentsRepository.saveAssessment` to reject, assert `Alert.alert` fires with **Retry**/**Discard** and that Retry re-invokes save **without navigating away** (preserve the no-data-loss coverage); confirm the `beforeRemove` finished-phase guard still holds.

**R5 (Task 5 — buildability error; Codex HIGH).** Masi's `storage.js` has **no `LOCAL_STATE_KEYS` map** (that's the fork's convention) — it uses direct string keys + `const USER_PROFILE_KEY = 'user_profile'` (`storage.js:114`). Declare a sibling `const CAPTURE_MODE_KEY = 'assessment_capture_mode';` and use it directly: `localStateRepository.get(CAPTURE_MODE_KEY)` / `localStateRepository.set(CAPTURE_MODE_KEY, mode)`. (The Task 5 test already asserts the literal `'assessment_capture_mode'`, so it's correct.)

**R6 (Task 12 — async double-launch guard; Claude+Codex MED, fork parity).** The fork added a `launchingRef` before awaiting `resolveAssessmentRoute`. Add it to both entry points:
```javascript
const launchingRef = useRef(false);
const navigateToAssessment = async (child, letterSet) => {
  if (launchingRef.current) return;
  launchingRef.current = true;
  try {
    const { screenName, captureMode } = await resolveAssessmentRoute();
    navigation.navigate(screenName, { child, letterSet, attemptNumber: (assessmentMap[child.id]?.attemptCount || 0) + 1, assessmentType, captureMode });
  } finally { launchingRef.current = false; }
};
```

**R7 (Task 7 — make the elapsed test non-tautological; Codex MED).** Drive finish through the **timer's own expiry**, not a manual `finishAndSave`: register `setOnTimerExpire(() => finishAndSave({...}))`, `startActive()`, then `advanceTimersByTime(ASSESSMENT_DURATION * 1000)`, and assert saved `completion_time === ASSESSMENT_DURATION` (60, not 59). A manual finish after advancing would pass even with the old `DURATION - timeRemaining` formula and prove nothing.

**R8 (Task 4 — pin the push allowlist + use the real harness; Codex MED + INFO).** (a) Add a focused test that `require('../src/services/offlineSync').SERVER_COLUMNS.assessments` **includes `'capture_mode'`** (the easiest contract piece to forget has no other test). (b) Write the migration/persistence test with the real harness Codex identified: `createBetterSqliteTestDatabase()` + `runMigrations(db)` from `test-support/sqliteRepositoryTestUtils.js` (pattern: `__tests__/assessmentsRepository.test.js:13-78`). (c) The local `ADD COLUMN ... CHECK` is valid on SQLite ≥ 3.25 (expo-sqlite 16 far newer); the better-sqlite3 test proves SQL validity, and the finish-gate device pass should spot-check `sqlite_version()`.

**Confirmed sound by both reviewers (no change):** nullable/no-default `capture_mode`; `correction_count` in summary metadata (no extra column); the full local+repo+server+Supabase sync contract; the hook's failed-save leave-guard and safe post-`replace` `refreshSyncStatus`; Last-Attempted cancel = `lastTappedIndex`; all named imports/components exist.

---

## Port sources (fork `/Users/jimmckeown/Development/zazi-izandi-app`, `main` @ `c183d3e`)

| Fork file | Masi destination | Port style |
|---|---|---|
| `src/utils/sequentialAssessmentReducer.js` | `src/utils/sequentialAssessmentReducer.js` | **verbatim** (pure) |
| `src/constants/egraConstants.js` (capture block) | append to `src/constants/egraConstants.js` | **verbatim** |
| `src/utils/assessmentScoring.js` | `src/utils/assessmentScoring.js` | **adapt** (Masi record shape) |
| `src/hooks/useAssessmentSession.js` | `src/hooks/useAssessmentSession.js` | **adapt** (Masi save path) |
| `src/utils/assessmentRouting.js` | `src/utils/assessmentRouting.js` | **verbatim** |
| `src/screens/assessments/SequentialAssessmentScreen.js` | same path | **adapt** (imports) |
| `src/utils/storage.js` (capture block) | `src/utils/storage.js` | **adapt** |
| `supabase/migrations/20260603134509_assessment_capture_mode.sql` | new Masi Supabase migration | **adapt** (timestamp) |

## File structure (created / modified across all tasks)

**Create:** `src/utils/sequentialAssessmentReducer.js`, `src/utils/assessmentScoring.js`, `src/hooks/useAssessmentSession.js`, `src/utils/assessmentRouting.js`, `src/screens/assessments/SequentialAssessmentScreen.js`, `supabase/migrations/20260618120000_masi_assessments_capture_mode.sql`, plus one `__tests__/*.test.js` per task.

**Modify:** `src/constants/egraConstants.js`, `src/utils/storage.js`, `src/db/migrations.js`, `src/db/repositories/assessmentsRepository.js`, `src/services/offlineSync.js`, `src/components/assessment/EgraLetterGrid.js`, `src/screens/assessments/LetterAssessmentScreen.js`, `src/screens/assessments/AssessmentChildSelectScreen.js`, `src/screens/assessments/ChildAssessmentSummaryScreen.js`, `src/navigation/AppNavigator.js`, `src/screens/main/ProfileScreen.js`, `documentation/rls-sync-contract-map.md`, `documentation/sqlite-refactor-log.md`, `CONTEXT.md`, `documentation/build-log.md`.

**Dependency graph (build order):** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 (proving slice) → 9 → 10 → 11 → 12 → 13. Tasks 1–3 are pure and independent; 4 is the schema contract; 7 depends on 2; 8 depends on 7; 10 depends on 3+7+9; 12 depends on 6.

---

## Task 1: Capture-mode constants  *(pure · controller review)*

**Files:**
- Modify: `src/constants/egraConstants.js` (append after `ASSESSMENT_DURATION`, currently line 120)
- Test: `__tests__/captureMode.test.js`

- [ ] **Step 1: Write the failing test** — `__tests__/captureMode.test.js`

```javascript
import {
  CAPTURE_MODES, DEFAULT_CAPTURE_MODE, isValidCaptureMode, resolveCaptureMode,
} from '../src/constants/egraConstants';

describe('capture mode constants', () => {
  test('exposes grid + sequential, defaulting to sequential', () => {
    expect(CAPTURE_MODES).toEqual({ GRID: 'grid', SEQUENTIAL: 'sequential' });
    expect(DEFAULT_CAPTURE_MODE).toBe('sequential');
  });

  test('isValidCaptureMode accepts only known modes', () => {
    expect(isValidCaptureMode('grid')).toBe(true);
    expect(isValidCaptureMode('sequential')).toBe(true);
    expect(isValidCaptureMode('nope')).toBe(false);
    expect(isValidCaptureMode(undefined)).toBe(false);
    expect(isValidCaptureMode(null)).toBe(false);
  });

  test('resolveCaptureMode honours precedence org > user > device > hardcoded default', () => {
    expect(resolveCaptureMode({ orgDefault: 'grid', userPref: 'sequential', deviceFallback: 'sequential' })).toBe('grid');
    expect(resolveCaptureMode({ userPref: 'grid', deviceFallback: 'sequential' })).toBe('grid');
    expect(resolveCaptureMode({ deviceFallback: 'grid' })).toBe('grid');
    expect(resolveCaptureMode({})).toBe('sequential');
    expect(resolveCaptureMode()).toBe('sequential');
    // invalid layers are skipped, not honoured
    expect(resolveCaptureMode({ orgDefault: 'bogus', deviceFallback: 'grid' })).toBe('grid');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest captureMode --testPathIgnorePatterns "/.claude/worktrees/"` → FAIL ("CAPTURE_MODES is not exported" / undefined).

- [ ] **Step 3: Implement** — append to `src/constants/egraConstants.js` (verbatim port of fork lines 122–150):

```javascript
// --- Assessment capture modes ---
// 'grid'       : tap-correct-only grid (the original UI; untapped = incorrect/not-reached,
//                disambiguated by the LastAttemptedBottomSheet).
// 'sequential' : single cursor, explicit correct/incorrect per item, big back button,
//                no last-attempted step (every in-range item is deliberately decided).
export const CAPTURE_MODES = { GRID: 'grid', SEQUENTIAL: 'sequential' };
export const DEFAULT_CAPTURE_MODE = CAPTURE_MODES.SEQUENTIAL;

const CAPTURE_MODE_VALUES = Object.values(CAPTURE_MODES);

export function isValidCaptureMode(value) {
  return CAPTURE_MODE_VALUES.includes(value);
}

/**
 * Resolve the active capture mode by precedence (first valid layer wins):
 *   org default -> per-user preference -> device fallback -> hardcoded default.
 * "Broadest scope overrides": an org default OVERRIDES a user preference (intended —
 * orgs can mandate a mode). v1 only wires `deviceFallback` (device-local storage);
 * `orgDefault`/`userPref` are reserved seams — passing them today is a no-op unless valid.
 */
export function resolveCaptureMode({ orgDefault, userPref, deviceFallback } = {}) {
  const layers = [orgDefault, userPref, deviceFallback];
  for (const layer of layers) {
    if (isValidCaptureMode(layer)) return layer;
  }
  return DEFAULT_CAPTURE_MODE;
}
```

- [ ] **Step 4: Run test to verify it passes** — same command → PASS.
- [ ] **Step 5: Commit** — `feat(assessments): add capture-mode constants + resolver (Item 4 Task 1)`

---

## Task 2: Pure scoring + record builder  *(pure · controller review)*

**Files:**
- Create: `src/utils/assessmentScoring.js`
- Test: `__tests__/assessmentScoring.test.js`

**Why:** Hoists `computeAssessmentResult` out of `LetterAssessmentScreen` (currently inline at `LetterAssessmentScreen.js:15-44`) and adds a Masi-shaped `buildAssessmentRecord` so grid + sequential produce **byte-identical record shapes** (the foundation of a valid A/B). The record shape must match Masi's current inline save object (`LetterAssessmentScreen.js:202-225`) **plus** `capture_mode` and `correction_count`.

- [ ] **Step 1: Write the failing test** — `__tests__/assessmentScoring.test.js`

```javascript
import { computeAssessmentResult, buildAssessmentRecord } from '../src/utils/assessmentScoring';

const letterSet = { id: 'eng-1', language: 'english', letters: ['a', 'b', 'c', 'd'] };

describe('computeAssessmentResult', () => {
  test('returns zeros when nothing attempted (lastTappedIndex < 0)', () => {
    expect(computeAssessmentResult({}, -1, letterSet.letters)).toEqual({
      lettersAttempted: 0, correctResponses: 0, incorrectLetters: [], correctLetters: [], accuracy: 0,
    });
  });

  test('scores up to and including lastTappedIndex', () => {
    const r = computeAssessmentResult({ 0: true, 2: true }, 2, letterSet.letters);
    expect(r.lettersAttempted).toBe(3);
    expect(r.correctResponses).toBe(2);
    expect(r.accuracy).toBe(67); // round(2/3*100)
    expect(r.correctLetters).toEqual([{ index: 0, letter: 'a' }, { index: 2, letter: 'c' }]);
    expect(r.incorrectLetters).toEqual([{ index: 1, letter: 'b' }]);
  });
});

describe('buildAssessmentRecord', () => {
  const now = new Date('2026-06-18T09:30:00.000Z');
  const base = {
    id: 'rec-1', userId: 'u1', childId: 'c1', assessmentType: 'letter_egra',
    letterSet, attemptNumber: 2, elapsedSeconds: 60, finalLastIndex: 2,
    letterStates: { 0: true, 2: true }, now,
  };

  test('produces Masi record shape with capture_mode + correction_count', () => {
    const rec = buildAssessmentRecord({ ...base, captureMode: 'sequential', correctionCount: 3 });
    expect(rec).toMatchObject({
      id: 'rec-1', user_id: 'u1', child_id: 'c1', assessment_type: 'letter_egra',
      capture_mode: 'sequential', correction_count: 3,
      items_tested: ['a', 'b', 'c', 'd'], attempt_number: 2,
      letter_set_id: 'eng-1', letter_language: 'english', completion_time: 60,
      letters_attempted: 3, correct_responses: 2, accuracy: 67,
      last_letter_attempted: { index: 2, letter: 'c' },
      date_assessed: '2026-06-18', device_info: {}, synced: false,
    });
    expect(rec.created_at).toBe(now.toISOString());
    expect(rec.updated_at).toBe(now.toISOString());
  });

  test('correctionCount defaults to 0 (grid mode)', () => {
    const rec = buildAssessmentRecord({ ...base, captureMode: 'grid' });
    expect(rec.correction_count).toBe(0);
    expect(rec.capture_mode).toBe('grid');
  });

  test('last_letter_attempted is null when finalLastIndex < 0', () => {
    const rec = buildAssessmentRecord({ ...base, captureMode: 'grid', finalLastIndex: -1, letterStates: {} });
    expect(rec.last_letter_attempted).toBeNull();
    expect(rec.letters_attempted).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify fail** — `PATH=... npx jest assessmentScoring ...` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/utils/assessmentScoring.js`:

```javascript
// Pure scoring + record assembly shared by every assessment capture UI.
// Keeping this here (not in a screen) guarantees grid and sequential modes
// produce identically shaped records — the foundation of a valid A/B comparison.

export function computeAssessmentResult(letterStates, lastTappedIndex, letters) {
  if (lastTappedIndex < 0) {
    return { lettersAttempted: 0, correctResponses: 0, incorrectLetters: [], correctLetters: [], accuracy: 0 };
  }

  const lettersAttempted = lastTappedIndex + 1;
  const correctLetters = [];
  const incorrectLetters = [];

  for (let i = 0; i <= lastTappedIndex; i++) {
    if (letterStates[i] === true) {
      correctLetters.push({ index: i, letter: letters[i] });
    } else {
      incorrectLetters.push({ index: i, letter: letters[i] });
    }
  }

  const correctResponses = correctLetters.length;
  const accuracy = lettersAttempted > 0 ? Math.round((correctResponses / lettersAttempted) * 100) : 0;

  return { lettersAttempted, correctResponses, incorrectLetters, correctLetters, accuracy };
}

/**
 * Build the canonical saved-assessment record. Both capture screens call this so the
 * only fields that vary by mode are `capture_mode` and `correction_count`.
 *
 * Shape mirrors LetterAssessmentScreen's original inline save object exactly, plus
 * `capture_mode` and `correction_count`. `assessmentsRepository.saveAssessment` is the
 * impedance layer: it injects `programme_id`, maps date_assessed->assessment_date /
 * correct_responses->score / letters_attempted->total_items, and splits the EGRA detail
 * into the normalized `assessment_items` table. This builder does NOT replicate that —
 * it only assembles the fat object the repository already knows how to persist.
 */
export function buildAssessmentRecord({
  id, userId, childId, assessmentType, letterSet, attemptNumber,
  captureMode, correctionCount = 0, elapsedSeconds, finalLastIndex, letterStates, now,
}) {
  const result = computeAssessmentResult(letterStates, finalLastIndex, letterSet.letters);
  // date_assessed is the EA's LOCAL calendar day (matches original screen behavior),
  // intentionally distinct from created_at/updated_at which are precise UTC instants.
  const dateAssessed = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return {
    id,
    user_id: userId,
    child_id: childId,
    assessment_type: assessmentType,
    capture_mode: captureMode,
    items_tested: letterSet.letters,
    attempt_number: attemptNumber,
    letter_set_id: letterSet.id,
    letter_language: letterSet.language,
    completion_time: elapsedSeconds,
    letters_attempted: result.lettersAttempted,
    correct_responses: result.correctResponses,
    accuracy: result.accuracy,
    correct_letters: result.correctLetters,
    incorrect_letters: result.incorrectLetters,
    last_letter_attempted: finalLastIndex >= 0
      ? { index: finalLastIndex, letter: letterSet.letters[finalLastIndex] }
      : null,
    correction_count: correctionCount,
    date_assessed: dateAssessed,
    device_info: {},
    synced: false,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}
```

- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(assessments): hoist scoring + add capture-aware record builder (Item 4 Task 2)`

---

## Task 3: Sequential reducer  *(pure · controller review)*

**Files:**
- Create: `src/utils/sequentialAssessmentReducer.js` (verbatim port of fork)
- Test: `__tests__/sequentialAssessmentReducer.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { initSequentialState, sequentialReducer } from '../src/utils/sequentialAssessmentReducer';

describe('sequentialReducer', () => {
  test('initial state', () => {
    expect(initSequentialState()).toEqual({ cursor: 0, letterStates: {}, correctionCount: 0 });
  });

  test('decide advances cursor and records correctness at the OLD cursor', () => {
    const s1 = sequentialReducer(initSequentialState(), { type: 'decide', correct: true });
    expect(s1).toEqual({ cursor: 1, letterStates: { 0: true }, correctionCount: 0 });
    const s2 = sequentialReducer(s1, { type: 'decide', correct: false });
    expect(s2).toEqual({ cursor: 2, letterStates: { 0: true, 1: false }, correctionCount: 0 });
  });

  test('back decrements cursor, deletes the decision, and counts a correction', () => {
    let s = sequentialReducer(initSequentialState(), { type: 'decide', correct: true });
    s = sequentialReducer(s, { type: 'decide', correct: true }); // cursor 2
    s = sequentialReducer(s, { type: 'back' });
    expect(s).toEqual({ cursor: 1, letterStates: { 0: true }, correctionCount: 1 });
  });

  test('back at cursor 0 is a no-op (no negative cursor, no phantom correction)', () => {
    const s0 = initSequentialState();
    expect(sequentialReducer(s0, { type: 'back' })).toBe(s0);
  });

  test('unknown action returns the same state', () => {
    const s0 = initSequentialState();
    expect(sequentialReducer(s0, { type: 'noop' })).toBe(s0);
  });
});
```

- [ ] **Step 2: Run to verify fail** → FAIL (module not found).
- [ ] **Step 3: Implement** — copy fork `src/utils/sequentialAssessmentReducer.js` verbatim:

```javascript
// Pure cursor/decision state for the sequential capture UI.
// letterStates: { [index]: true|false } — true=correct, false=incorrect.
// cursor: index of the current (undecided) item. finalLastIndex = cursor - 1.
export function initSequentialState() {
  return { cursor: 0, letterStates: {}, correctionCount: 0 };
}

export function sequentialReducer(state, action) {
  switch (action.type) {
    case 'decide':
      return {
        ...state,
        cursor: state.cursor + 1,
        letterStates: { ...state.letterStates, [state.cursor]: action.correct === true },
      };
    case 'back': {
      if (state.cursor === 0) return state;
      const prev = state.cursor - 1;
      const nextStates = { ...state.letterStates };
      delete nextStates[prev];
      return { ...state, cursor: prev, letterStates: nextStates, correctionCount: state.correctionCount + 1 };
    }
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(assessments): port pure sequential capture reducer (Item 4 Task 3)`

---

## Task 4: `capture_mode` schema — the RLS/sync contract  *(schema · FULL DUAL REVIEW)*

**This is ONE atomic contract across six artifacts. Build them together; do not split the commit.**

**Files:**
- Modify: `src/db/migrations.js` (append migration `version: 4`)
- Modify: `src/db/repositories/assessmentsRepository.js` (`ASSESSMENT_COLUMNS` + `buildSummary`)
- Modify: `src/services/offlineSync.js` (assessments `SERVER_COLUMNS`, lines 195–199)
- Create: `supabase/migrations/20260618120000_masi_assessments_capture_mode.sql`
- Modify: `documentation/rls-sync-contract-map.md` (assessments row at line 71)
- Modify: `documentation/sqlite-refactor-log.md` (append) and `CONTEXT.md` (glossary entry)
- Test: `__tests__/captureModeMigration.test.js` (**real `better-sqlite3` integration**)

**Design rules (do not deviate):**
- Column is **nullable with NO DB default**. `NULL = legacy/grid pre-feature`. A `DEFAULT 'sequential'` would mislabel grid rows written by older app versions still in the field — corrupting the A/B. The client stamps the resolved mode explicitly.
- Local `CHECK (capture_mode IS NULL OR capture_mode IN ('grid','sequential'))` — defense in depth; valid on SQLite `ADD COLUMN` because existing rows get NULL and NULL passes the check.
- `correction_count` needs **no schema change** — it rides in the existing `__summary__` `assessment_items.metadata` JSON via one line in `buildSummary`.

- [ ] **Step 1: Write the failing integration test** — `__tests__/captureModeMigration.test.js`. Model it on the existing real-SQLite suites (find the pattern with `rg -l "better-sqlite3" __tests__` and mirror the DB bootstrap/migration-runner helper they use — likely `sqlitePlan1Migrations.test.js` / a test harness in `__tests__/helpers`). The behaviors to pin:

```javascript
// Pseudocode shape — adapt to the repo's real better-sqlite3 test harness.
// Use the same migration runner + repository factory the other integration suites use.
describe('capture_mode migration + persistence', () => {
  test('migration v4 adds a nullable capture_mode column to assessments', async () => {
    // after running ALL migrations on a fresh file-backed db:
    const cols = db.prepare("PRAGMA table_info('assessments')").all();
    const captureCol = cols.find((c) => c.name === 'capture_mode');
    expect(captureCol).toBeTruthy();
    expect(captureCol.notnull).toBe(0); // nullable
  });

  test('saveAssessment persists capture_mode and round-trips correction_count via summary', async () => {
    const repo = createAssessmentsRepository({ database });
    await seedActiveProgrammeAndChild(/* user u1, child c1 */);
    await repo.saveAssessment({
      id: 'a1', user_id: 'u1', child_id: 'c1', assessment_type: 'letter_egra',
      capture_mode: 'sequential', correction_count: 4,
      date_assessed: '2026-06-18', attempt_number: 1, letter_set_id: 'eng-1',
      letter_language: 'english', completion_time: 60, letters_attempted: 3,
      correct_responses: 2, accuracy: 67, correct_letters: [{ index: 0, letter: 'a' }],
      incorrect_letters: [{ index: 1, letter: 'b' }], items_tested: ['a', 'b', 'c'],
      synced: false,
    });
    const [row] = await repo.getAssessments({ userId: 'u1', childId: 'c1' });
    expect(row.capture_mode).toBe('sequential');
    expect(row.correction_count).toBe(4); // surfaced from __summary__ metadata
  });

  test('CHECK rejects an invalid capture_mode at the DB layer', async () => {
    expect(() => db.prepare(
      "insert into assessments (id,user_id,child_id,programme_id,assessment_type,assessment_date,capture_mode) values ('x','u1','c1','p1','letter_egra','2026-06-18','bogus')"
    ).run()).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify fail** — `PATH=... npx jest captureModeMigration ...` → FAIL (no `capture_mode` column / `correction_count` undefined).

- [ ] **Step 3a: Local migration** — append to the `MIGRATIONS` array in `src/db/migrations.js` (current latest is `version: 3` = `sessions_forward_prep_columns`; `CURRENT_SCHEMA_VERSION` is derived from the last element, so just append):

```javascript
{
  version: 4,
  name: 'assessments_capture_mode',
  sql: `
    alter table assessments add column capture_mode text
      check (capture_mode is null or capture_mode in ('grid', 'sequential'));
  `,
},
```

- [ ] **Step 3b: Repository** — `src/db/repositories/assessmentsRepository.js`:
  - Add `'capture_mode'` to `ASSESSMENT_COLUMNS` (after `'assessment_type'`).
  - Add one line to `buildSummary` so the sequential correction count round-trips through the `__summary__` metadata:
    ```javascript
    const buildSummary = (assessment) => ({
      attempt_number: assessment.attempt_number,
      // ...existing fields...
      device_info: assessment.device_info || {},
      correction_count: assessment.correction_count ?? 0, // <-- add
    });
    ```

- [ ] **Step 3c: Sync push allowlist** — `src/services/offlineSync.js`, assessments `SERVER_COLUMNS` (lines 195–199): add `'capture_mode'` to the array (after `'assessment_type'`). **Without this the column persists locally but never reaches Supabase.**

- [ ] **Step 3d: Supabase migration** — `supabase/migrations/20260618120000_masi_assessments_capture_mode.sql` (adapt fork `20260603134509`):

```sql
-- Capture mode for the assessment UI that produced each result.
-- Orthogonal to assessment_type (letter_egra/word_egra). NULL = legacy/grid pre-this-migration.
-- Stamped client-side at creation from the resolved mode; never re-derived from current settings.
-- Written idempotently so a re-run (or a clean rebuild) cannot fail on a duplicate constraint.

alter table public.assessments
  add column if not exists capture_mode text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessments_capture_mode_check'
  ) then
    alter table public.assessments
      add constraint assessments_capture_mode_check
      check (capture_mode is null or capture_mode in ('grid', 'sequential'));
  end if;
end $$;

create index if not exists idx_assessments_capture_mode
  on public.assessments (capture_mode);
```

- [ ] **Step 3e: Docs (same commit).**
  - `documentation/rls-sync-contract-map.md` assessments row (line 71): add `capture_mode` to the producer/payload note (it joins `SERVER_COLUMNS`); leave RLS authority and ordering unchanged (additive column, no policy change).
  - `documentation/sqlite-refactor-log.md`: append a dated entry — what changed, why nullable/no-default, the six artifacts, and the test command.
  - `CONTEXT.md` glossary: add a **"Capture mode"** entry and distinguish it from the existing **"Marking mode"**:
    > **"Capture mode"** (per-assessment, stamped at creation): which capture *mechanic* the EA used — `grid` (tap-correct-only) or `sequential` (cursor ✓/✗ Step-by-Step). Orthogonal to **marking mode** (who scores and from what) and to `assessment_type`. Resolved per-EA via `resolveCaptureMode` (device-local in v1; org/user are reserved seams) and stored on `assessments.capture_mode` (`NULL` = legacy/grid).

- [ ] **Step 4: Run to verify pass** — `PATH=... npx jest captureModeMigration assessmentsRepository --testPathIgnorePatterns "/.claude/worktrees/"` → PASS. Also re-run any existing assessments repo suite to confirm no regression.

- [ ] **Step 5: Review (FULL DUAL) then commit** — Claude reviewer (spec + RLS-contract completeness: are all six artifacts consistent? does the push allowlist match the column?) **+** Codex adversarial (attack: does an older-app write still sync? does the CHECK break inserts that omit the column? is the migration idempotent on re-run?). Engage findings, then commit: `feat(db): add nullable capture_mode column across the sync contract (Item 4 Task 4)`.

> **Backend note:** apply the Supabase migration to `masi-app-sqlite` (`segygjzpujphwvrubusm`) via the linked CLI (`npm run sqlite:staging:*` / `supabase ... --linked`), **not** the Supabase MCP (pinned to the legacy ref). `masi-app-sqlite` has no field users, so applying is safe. Heed the `SUPABASE_ACCESS_TOKEN` / interactive-shell auth gotchas in CLAUDE.md.

---

## Task 5: Device-local capture-mode persistence  *(low · controller review)*

**Files:**
- Modify: `src/utils/storage.js` (add `CAPTURE_MODE` local-state key + `getCaptureMode`/`setCaptureMode`)
- Test: `__tests__/storageCaptureMode.test.js`

**Why:** Mirrors fork `storage.js:567-577`. Masi already has the identical `local_state` key-value store (`localStateRepository.{get,set}`) and a `LOCAL_STATE_KEYS` map — confirm the exact key constant location with `rg -n "LOCAL_STATE_KEYS" src/utils/storage.js src/db/repositories/localStateRepository.js` and add `CAPTURE_MODE: 'assessment_capture_mode'`.

- [ ] **Step 1: Write the failing test** — mock `localStateRepository` (or use the real one against a test db, matching the repo's storage-test convention):

```javascript
import { storage } from '../src/utils/storage';
import { localStateRepository } from '../src/db/repositories/localStateRepository';

jest.mock('../src/db/repositories/localStateRepository');

describe('storage capture mode', () => {
  afterEach(() => jest.clearAllMocks());

  test('getCaptureMode returns stored value when valid', async () => {
    localStateRepository.get.mockResolvedValue('grid');
    expect(await storage.getCaptureMode()).toBe('grid');
  });

  test('getCaptureMode falls back to the default when unset/invalid', async () => {
    localStateRepository.get.mockResolvedValue(null);
    expect(await storage.getCaptureMode()).toBe('sequential');
    localStateRepository.get.mockResolvedValue('bogus');
    expect(await storage.getCaptureMode()).toBe('sequential');
  });

  test('setCaptureMode validates then persists', async () => {
    await storage.setCaptureMode('grid');
    expect(localStateRepository.set).toHaveBeenCalledWith('assessment_capture_mode', 'grid');
    await expect(storage.setCaptureMode('bogus')).rejects.toThrow(/invalid capture mode/i);
  });
});
```

- [ ] **Step 2: Run to verify fail** → FAIL.
- [ ] **Step 3: Implement** — add the key to `LOCAL_STATE_KEYS` and these methods to the `storage` object (adapt fork lines 567-577 to Masi's key constant + import `resolveCaptureMode, isValidCaptureMode` from `../constants/egraConstants`):

```javascript
  // Assessment capture mode (device-local; resolveCaptureMode seams cover future org/user layers)
  async getCaptureMode() {
    const stored = await localStateRepository.get(LOCAL_STATE_KEYS.CAPTURE_MODE);
    return resolveCaptureMode({ deviceFallback: stored });
  },

  async setCaptureMode(mode) {
    if (!isValidCaptureMode(mode)) {
      throw new Error(`Invalid capture mode: ${mode}`);
    }
    return await localStateRepository.set(LOCAL_STATE_KEYS.CAPTURE_MODE, mode);
  },
```

- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(assessments): device-local capture-mode preference (Item 4 Task 5)`

---

## Task 6: Mode routing  *(low · controller review)*

**Files:**
- Create: `src/utils/assessmentRouting.js` (verbatim port of fork)
- Test: `__tests__/assessmentRouting.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { resolveAssessmentRoute } from '../src/utils/assessmentRouting';
import { storage } from '../src/utils/storage';

jest.mock('../src/utils/storage');

describe('resolveAssessmentRoute', () => {
  test('sequential -> SequentialAssessment', async () => {
    storage.getCaptureMode.mockResolvedValue('sequential');
    expect(await resolveAssessmentRoute()).toEqual({ screenName: 'SequentialAssessment', captureMode: 'sequential' });
  });
  test('grid -> LetterAssessment', async () => {
    storage.getCaptureMode.mockResolvedValue('grid');
    expect(await resolveAssessmentRoute()).toEqual({ screenName: 'LetterAssessment', captureMode: 'grid' });
  });
});
```

- [ ] **Step 2: Run to verify fail** → FAIL.
- [ ] **Step 3: Implement** — copy fork `src/utils/assessmentRouting.js` verbatim:

```javascript
import { storage } from './storage';
import { CAPTURE_MODES } from '../constants/egraConstants';

/**
 * Resolve which capture screen to launch for a new assessment attempt.
 * Single owner of the capture-mode -> screen mapping: every entry point that starts an
 * assessment must route through this so the device toggle is honored everywhere. Reads the
 * mode fresh at launch time so a stale mount-loaded value can never route (or stamp) the wrong mode.
 */
export async function resolveAssessmentRoute() {
  const captureMode = await storage.getCaptureMode();
  return {
    screenName: captureMode === CAPTURE_MODES.SEQUENTIAL ? 'SequentialAssessment' : 'LetterAssessment',
    captureMode,
  };
}
```

- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(assessments): single-owner capture-mode route resolver (Item 4 Task 6)`

---

## Task 7: `useAssessmentSession` hook — the capture spine  *(HIGH risk · FULL DUAL REVIEW)*

**Files:**
- Create: `src/hooks/useAssessmentSession.js` (adapt fork `src/hooks/useAssessmentSession.js`)
- Test: `__tests__/useAssessmentSession.test.js`

**Adaptation from the fork (the ONLY deltas — keep everything else verbatim):**
- Import Masi's save path, not the fork's `storage`/`buildAssessmentRecord`:
  ```javascript
  import { assessmentsRepository } from '../db/repositories/assessmentsRepository';
  import { buildAssessmentRecord } from '../utils/assessmentScoring';
  ```
- `finishAndSave` saves via `assessmentsRepository.saveAssessment(record)` (not `storage.saveAssessment`).
- After `navigation.replace`, fire **both** `triggerBackgroundSync?.()` and `refreshSyncStatus?.().catch(() => {})` (Masi's OfflineContext exposes both; the provider stays mounted above the screen, so post-replace is safe and matches Masi's current sync-refresh behavior). Navigation is **not** delayed on the sync refresh (local-first completion).
- Everything else — `allowLeaveRef` vs `hasFinishedRef`, `elapsedRef`, the timer effect, the leave-guard attached during `active` **and** `finished`, the tile-layout math, `setOnTimerExpire`, the Retry/Discard alert — ports **verbatim** (these are the field-hardening the whole task exists to capture).

Full target file:

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

/**
 * Shared spine for an EGRA capture session: timer, phase machine, tile layout,
 * leave-guard, and finishAndSave. Interaction (grid taps vs sequential cursor) stays
 * in the screen; everything common — and the save path — lives here so both modes
 * produce identical records.
 */
export function useAssessmentSession({
  navigation, child, letterSet, attemptNumber = 1, assessmentType, captureMode, isWordAssessment,
}) {
  const { user } = useAuth();
  const { triggerBackgroundSync, refreshSyncStatus } = useOffline();

  const [phase, setPhase] = useState('instructions');
  const [timeRemaining, setTimeRemaining] = useState(ASSESSMENT_DURATION);
  const [isPaused, setIsPaused] = useState(false);

  const timerRef = useRef(null);
  const hasFinishedRef = useRef(false);
  // True only once leaving cannot lose data: the record saved (replace to results) or the
  // EA explicitly discarded a failed save. hasFinishedRef is NOT a proxy — it flips before
  // the save lands, and a failed save leaves an unsaved result the leave guard must protect.
  const allowLeaveRef = useRef(false);
  // Authoritative elapsed-seconds counter. Using this (not ASSESSMENT_DURATION - timeRemaining)
  // avoids the off-by-one at expiry, where timeRemaining is still 1 when the handler fires.
  const elapsedRef = useRef(0);

  const onTimerExpireRef = useRef(() => {});
  const setOnTimerExpire = useCallback((fn) => { onTimerExpireRef.current = fn; }, []);

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // --- Tile layout (identical math to the original grid screen) ---
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

  const startActive = useCallback(() => setPhase('active'), []);

  // --- Timer ---
  useEffect(() => {
    if (phase === 'active' && !isPaused) {
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setTimeRemaining((prev) => {
          const next = prev - 1;
          if (next <= 0) {
            clearInterval(timerRef.current);
            onTimerExpireRef.current();
            return 0;
          }
          return next;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [phase, isPaused]);

  // --- Leave guard (active AND finished: a result lives only in memory until the save lands) ---
  useEffect(() => {
    if (phase !== 'active' && phase !== 'finished') return undefined;
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowLeaveRef.current) return;
      e.preventDefault();
      Alert.alert('End Assessment?', 'Are you sure you want to leave? Your progress will be lost.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => { clearInterval(timerRef.current); allowLeaveRef.current = true; navigation.dispatch(e.data.action); } },
      ]);
    });
    return unsubscribe;
  }, [navigation, phase]);

  const finishAndSave = useCallback(async ({ letterStates, finalLastIndex, correctionCount }) => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    clearInterval(timerRef.current);
    setPhase('finished');

    const record = buildAssessmentRecord({
      id: uuidv4(), userId: user.id, childId: child.id, assessmentType, letterSet,
      attemptNumber, captureMode, correctionCount,
      elapsedSeconds: elapsedRef.current,
      finalLastIndex, letterStates, now: new Date(),
    });

    // Local-first: persist before navigating. If the local write fails (storage pressure on
    // low-end Android), do NOT strand the EA on a dead 'finished' screen — offer Retry/Discard.
    const saveThenNavigate = async () => {
      try {
        await assessmentsRepository.saveAssessment(record);
      } catch (error) {
        Alert.alert('Could not save', 'Saving the assessment failed. Please try again.', [
          { text: 'Retry', onPress: () => { saveThenNavigate(); } },
          { text: 'Discard', style: 'destructive', onPress: () => { allowLeaveRef.current = true; navigation.goBack(); } },
        ]);
        return;
      }
      // Replace, not push: leaves no dead finished capture screen for back-nav / "Try Again" to land on.
      allowLeaveRef.current = true;
      navigation.replace('AssessmentResults', { assessment: record, child, letterSet, attemptNumber, assessmentType });
      triggerBackgroundSync?.();
      refreshSyncStatus?.().catch(() => {});
    };
    await saveThenNavigate();
  }, [user, child, assessmentType, letterSet, attemptNumber, captureMode, navigation, triggerBackgroundSync, refreshSyncStatus]);

  return {
    phase, setPhase, timeRemaining, isPaused, setIsPaused, layout,
    hasFinishedRef, startActive, finishAndSave, setOnTimerExpire,
  };
}
```

- [ ] **Step 1: Write the failing test** — `__tests__/useAssessmentSession.test.js`. Mount the hook via a tiny harness (`@testing-library/react-native` `renderHook`, or a probe component), with mocked `AuthContext`, `OfflineContext`, `assessmentsRepository`, and a fake `navigation`. Use `jest.useFakeTimers()`. Pin:
  - `finishAndSave({...})` calls `assessmentsRepository.saveAssessment` **once** with a record carrying the passed `capture_mode` and `elapsedSeconds` taken from `elapsedRef` (advance fake timers 60s, assert `completion_time === 60`, not 59 — the off-by-one guard).
  - On success, `navigation.replace('AssessmentResults', …)` is called and `triggerBackgroundSync` fires.
  - Idempotency: a second `finishAndSave` call is a no-op (`hasFinishedRef`).
  - Save failure: when `saveAssessment` rejects, `Alert.alert` is invoked with Retry/Discard and `navigation.replace` is **not** called.
  - (Best-effort) leave-guard: while `phase === 'finished'` and not yet allowed to leave, a `beforeRemove` event is `preventDefault`-ed.

```javascript
// Shape — adapt to the harness convention used elsewhere in __tests__.
import { renderHook, act } from '@testing-library/react-native';
import { useAssessmentSession } from '../src/hooks/useAssessmentSession';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
// jest.mock AuthContext -> { user: { id: 'u1' } }, OfflineContext -> { triggerBackgroundSync: jest.fn(), refreshSyncStatus: jest.fn().mockResolvedValue() }
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: { saveAssessment: jest.fn().mockResolvedValue(true) },
}));

const letterSet = { id: 'eng-1', language: 'english', letters: ['a','b','c'], columns: 5, lettersPerPage: 20 };

test('finishAndSave saves with capture_mode + true elapsed, then replaces', async () => {
  jest.useFakeTimers();
  const navigation = { addListener: jest.fn(() => jest.fn()), replace: jest.fn(), dispatch: jest.fn(), goBack: jest.fn() };
  const { result } = renderHook(() => useAssessmentSession({
    navigation, child: { id: 'c1' }, letterSet, attemptNumber: 1, assessmentType: 'letter_egra',
    captureMode: 'sequential', isWordAssessment: false,
  }));
  act(() => result.current.startActive());
  act(() => { jest.advanceTimersByTime(60000); }); // elapsedRef -> 60
  await act(async () => {
    await result.current.finishAndSave({ letterStates: { 0: true }, finalLastIndex: 0, correctionCount: 2 });
  });
  expect(assessmentsRepository.saveAssessment).toHaveBeenCalledTimes(1);
  const saved = assessmentsRepository.saveAssessment.mock.calls[0][0];
  expect(saved.capture_mode).toBe('sequential');
  expect(saved.completion_time).toBe(60);
  expect(saved.correction_count).toBe(2);
  expect(navigation.replace).toHaveBeenCalledWith('AssessmentResults', expect.objectContaining({ assessment: saved }));
});
```

- [ ] **Step 2: Run to verify fail** → FAIL (module not found).
- [ ] **Step 3: Implement** the hook (above).
- [ ] **Step 4: Run to verify pass** — `PATH=... npx jest useAssessmentSession ...` → PASS.
- [ ] **Step 5: Review (FULL DUAL) then commit** — Claude reviewer (does the hook preserve every field-hardening detail? are deps arrays correct? is post-replace `refreshSyncStatus` safe?) + Codex adversarial (race: double timer-expiry; finish during a pending save; leave-guard gaps). Commit: `feat(assessments): extract field-hardened useAssessmentSession spine (Item 4 Task 7)`.

---

## Task 8: Refactor `LetterAssessmentScreen` onto the hook — the proving slice  *(HIGH risk · FULL DUAL REVIEW)*

**Files:**
- Modify: `src/screens/assessments/LetterAssessmentScreen.js` (delete inline spine, consume the hook)
- Test: `__tests__/letterAssessmentScreen.capture.test.js`

**What moves to the hook (delete from the screen):** the `phase`/`timeRemaining`/`isPaused` state, `timerRef`/`hasFinishedRef`, the timer `useEffect`, the `beforeRemove` leave-guard `useEffect`, the tile-layout math, and the entire inline `saveAssessment` (record assembly + repo call + navigate). The `computeAssessmentResult` function (lines 15-44) is **deleted** — now imported from `src/utils/assessmentScoring` (it's no longer used directly in the screen once `finishAndSave` owns scoring, but keep the import only if still referenced).

**What stays in the screen (grid interaction):** `currentPage`, `letterStates`, `lastTappedIndex`, `showLastAttempted`, the refs that mirror them for the expiry callback, `handleToggle`, page nav, the `EgraLetterGrid` render, instructions phase, `End Assessment`, and the `LastAttemptedBottomSheet`.

**Critical wiring (the subtleties):**
- Read `captureMode` from route params, defaulting to grid: `const { …, captureMode = CAPTURE_MODES.GRID } = route.params;` and pass it to the hook.
- Consume the hook: `const session = useAssessmentSession({ navigation, child, letterSet, attemptNumber, assessmentType, captureMode, isWordAssessment }); const { phase, timeRemaining, isPaused, layout, finishAndSave, setOnTimerExpire, hasFinishedRef } = session;` Use `layout.tileSize`/`tileWidth`/`tileHeight`/`GAP` for the grid.
- **`handleFinish` resolves `finalLastIndex` then delegates to `finishAndSave` with `correctionCount: 0`** (grid never corrects). The Last-Attempted "cancel" is a sentinel for "use `lastTappedIndex`", NOT save-null:
  ```javascript
  const handleFinish = useCallback(() => {
    if (hasFinishedRef.current) return;
    const lastIndex = letterSet.letters.length - 1;
    if (letterStatesRef.current[lastIndex] === true) {
      finishAndSave({ letterStates: letterStatesRef.current, finalLastIndex: lastIndex, correctionCount: 0 });
    } else {
      setShowLastAttempted(true);
    }
  }, [finishAndSave, letterSet]);

  const handleLastAttemptedConfirm = (selectedIndex) => {
    setShowLastAttempted(false);
    finishAndSave({ letterStates: letterStatesRef.current, finalLastIndex: selectedIndex, correctionCount: 0 });
  };
  const handleLastAttemptedCancel = () => {
    setShowLastAttempted(false);
    finishAndSave({ letterStates: letterStatesRef.current, finalLastIndex: lastTappedIndexRef.current, correctionCount: 0 });
  };
  ```
- **Register the timer-expiry handler once** so the hook's timer can finish the grid: `useEffect(() => { setOnTimerExpire(() => handleFinish()); }, [setOnTimerExpire, handleFinish]);`
- Start the assessment with `session.startActive()` (instructions "Start" button) instead of `setPhase('active')`.
- Grid disables on `phase === 'finished'`. `handleToggle` guards on `hasFinishedRef.current` (now the hook's ref).
- The inline `saveError`/`isSaving` retry UI is **removed** — the hook's Retry/Discard `Alert` replaces it (simpler, and the leave-guard now protects the finished phase).

- [ ] **Step 1: Write the failing test** — `__tests__/letterAssessmentScreen.capture.test.js`: render the screen (mock contexts + `assessmentsRepository.saveAssessment`), start, mark the final letter correct, tap Finish, assert `saveAssessment` was called with `capture_mode: 'grid'` and that `navigation.replace('AssessmentResults', …)` fired (proving the screen now drives the hook). If the repo's existing `LetterAssessmentScreen` test exists, extend it rather than duplicating.

- [ ] **Step 2: Run to verify fail** → FAIL.
- [ ] **Step 3: Implement** the refactor (preserve all existing styles + instructions/grid JSX; only the spine wiring changes).
- [ ] **Step 4: Run to verify pass** — `PATH=... npx jest letterAssessmentScreen ...` → PASS. Manually confirm the diff **deletes** the inline timer/guard/save and that no behavior beyond the spine moved.
- [ ] **Step 5: Review (FULL DUAL) then commit** — this is the proving slice; both reviewers check that grid behavior is **unchanged** (timer, pages, Last-Attempted confirm/cancel semantics, End Assessment) and that `capture_mode: 'grid'` now stamps. Commit: `refactor(assessments): drive LetterAssessmentScreen from useAssessmentSession (Item 4 Task 8)`.

---

## Task 9: `EgraLetterGrid` — `readOnly` + `currentIndex`  *(low-medium · controller review, additive)*

**Files:**
- Modify: `src/components/assessment/EgraLetterGrid.js`
- Test: `__tests__/egraLetterGridReadOnly.test.js`

**Why:** The sequential screen renders the grid as a **read-only cursor view** — no toggling, but a highlighted "current" tile. Today the grid only has `disabled` (which dims to 0.6 opacity, wrong for an active cursor view). Add two **backward-compatible** props (default `readOnly=false`, `currentIndex=-1`) so the existing grid usage is untouched.

- [ ] **Step 1: Write the failing test**

```javascript
import { render, fireEvent } from '@testing-library/react-native';
import EgraLetterGrid from '../src/components/assessment/EgraLetterGrid';

test('readOnly blocks onToggle but does not dim like disabled', () => {
  const onToggle = jest.fn();
  const { getByLabelText } = render(
    <EgraLetterGrid letters={['a','b']} pageOffset={0} letterStates={{}} onToggle={onToggle}
      readOnly currentIndex={1} tileSize={60} gap={8} />
  );
  fireEvent.press(getByLabelText(/^a,/));
  expect(onToggle).not.toHaveBeenCalled();
});

test('currentIndex marks exactly one tile as current (accessibility)', () => {
  const { getByLabelText } = render(
    <EgraLetterGrid letters={['a','b']} pageOffset={0} letterStates={{}} onToggle={() => {}}
      readOnly currentIndex={1} tileSize={60} gap={8} />
  );
  expect(getByLabelText(/^b,.*current/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify fail** → FAIL.
- [ ] **Step 3: Implement** — extend the prop list and tile rendering:
  - Signature: `export default function EgraLetterGrid({ letters, pageOffset, letterStates, onToggle, disabled, readOnly = false, currentIndex = -1, tileSize, tileWidth, tileHeight, gap }) {`
  - Press handler: `onPress={() => { if (disabled || readOnly) return; onToggle(globalIndex); }}`
  - Per-tile: `const isCurrent = globalIndex === currentIndex;` add `isCurrent && styles.tileCurrent` to the style array (after `isCorrect`), and extend `accessibilityLabel` → `` `${letter}, ${isCorrect ? 'correct' : 'not marked'}${isCurrent ? ', current' : ''}` ``.
  - Add a `tileCurrent` style: a 2px `colors.primary` border ring (no opacity change), e.g. `{ borderColor: colors.primary, borderWidth: 2 }`.

- [ ] **Step 4: Run to verify pass** — `PATH=... npx jest egraLetterGrid ...` → PASS. Re-run any existing grid/letter-assessment suite to confirm the defaults didn't change current behavior.
- [ ] **Step 5: Commit** — `feat(assessment): add readOnly + currentIndex to EgraLetterGrid (Item 4 Task 9)`

---

## Task 10: `SequentialAssessmentScreen`  *(medium-high · FULL DUAL REVIEW)*

**Files:**
- Create: `src/screens/assessments/SequentialAssessmentScreen.js` (adapt fork screen — imports only)
- Test: `__tests__/sequentialAssessmentScreen.test.js`

**Adaptation from the fork:** the fork screen (read in planning) ports almost verbatim. Confirm Masi import paths: `EgraLetterGrid`, `AssessmentTimer` from `../../components/assessment/…`; `useAssessmentSession` from `../../hooks/useAssessmentSession`; `initSequentialState, sequentialReducer` from `../../utils/sequentialAssessmentReducer`; `CAPTURE_MODES` from `../../constants/egraConstants`; `colors, spacing, borderRadius` from `../../constants/colors`. The grid is rendered with `readOnly currentIndex={finished ? -1 : displayCursor}` (Task 9 enables this). Keep the early-finish-from-committed-state effect, the cursor clamp, and the `decide` cursor-bound guard verbatim (they close double-tap/queued-tap races).

- [ ] **Step 1: Write the failing test** — render the screen (mock contexts + `assessmentsRepository`); start; tap **Correct** through the last item; assert `saveAssessment` called with `capture_mode: 'sequential'`, `correction_count` reflecting any **Back** taps, and `completion_time` from the hook timer. Assert **Back** is disabled at cursor 0 and decrements otherwise.
- [ ] **Step 2: Run to verify fail** → FAIL.
- [ ] **Step 3: Implement** the screen (fork port + Masi imports).
- [ ] **Step 4: Run to verify pass** — `PATH=... npx jest sequentialAssessmentScreen ...` → PASS.
- [ ] **Step 5: Review (FULL DUAL) then commit** — reviewers verify the race guards survived the port and the record matches grid mode except `capture_mode`/`correction_count`. Commit: `feat(assessments): add Step-by-Step SequentialAssessmentScreen (Item 4 Task 10)`.

---

## Task 11: Register the screen in the navigator  *(trivial · controller review)*

**Files:** Modify `src/navigation/AppNavigator.js` (insert after the `AssessmentResults` screen, ~line 262, in `MainNavigator`).

- [ ] **Step 1–3: Implement** — add, matching `LetterAssessment`'s options:
  ```jsx
  <Stack.Screen
    name="SequentialAssessment"
    component={SequentialAssessmentScreen}
    options={{ headerShown: false }}
  />
  ```
  and the import `import SequentialAssessmentScreen from '../screens/assessments/SequentialAssessmentScreen';`.
- [ ] **Step 4: Verify** — app builds; `rg -n "SequentialAssessment" src/navigation/AppNavigator.js` shows the registration. (No dedicated test; controller-verify the navigator still renders via the existing smoke/import.)
- [ ] **Step 5: Commit** — `feat(nav): register SequentialAssessment screen (Item 4 Task 11)`

---

## Task 12: Route the two clean entry points through the resolver  *(medium · controller review)*

**Files:**
- Modify: `src/screens/assessments/AssessmentChildSelectScreen.js` (`navigateToAssessment`, lines 72-79)
- Modify: `src/screens/assessments/ChildAssessmentSummaryScreen.js` (the `navigate('LetterAssessment', …)` at line 117)
- Test: `__tests__/assessmentEntryRouting.test.js`
- **Do NOT touch** `src/screens/assessments/AssessmentResultsScreen.js` (Try-Again — deferred to Item 5 per the locked decision).

**Pattern:** make the navigate async, resolve the route, pass `captureMode` so the stamped mode equals the screen that captured:
```javascript
import { resolveAssessmentRoute } from '../../utils/assessmentRouting';

const navigateToAssessment = async (child, letterSet) => {
  const { screenName, captureMode } = await resolveAssessmentRoute();
  navigation.navigate(screenName, {
    child,
    letterSet,
    attemptNumber: (assessmentMap[child.id]?.attemptCount || 0) + 1,
    assessmentType,
    captureMode,
  });
};
```
Apply the analogous change in `ChildAssessmentSummaryScreen` (preserve its existing param computation; just swap the hardcoded `'LetterAssessment'` for the resolved `screenName` and add `captureMode`).

- [ ] **Step 1: Write the failing test** — mock `resolveAssessmentRoute`; assert each screen navigates to the **resolved** `screenName` with `captureMode` in params (one case sequential, one grid).
- [ ] **Step 2: Run to verify fail** → FAIL.
- [ ] **Step 3: Implement** both screens.
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(assessments): route child-select + child-summary through capture-mode resolver (Item 4 Task 12)`

---

## Task 13: Profile capture-mode toggle  *(medium · controller review)*

**Files:**
- Modify: `src/screens/main/ProfileScreen.js` (new "Assessment" card; `SegmentedButtons` Grid / Step-by-Step)
- Test: `__tests__/profileCaptureModeToggle.test.js`

**Pattern** (mirror fork `ProfileScreen.js:29-55, 336-337`, but with `SegmentedButtons` to match Masi's existing `AssessmentRankingScreen` convention rather than a bare Switch): load the current mode on focus via `storage.getCaptureMode()`; on change call `storage.setCaptureMode(mode)` optimistically and **revert on failure**.

```jsx
// imports
import { SegmentedButtons } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { storage } from '../../utils/storage';
import { CAPTURE_MODES } from '../../constants/egraConstants';

// state
const [captureMode, setCaptureMode] = useState(CAPTURE_MODES.SEQUENTIAL);
useFocusEffect(useCallback(() => {
  let active = true;
  (async () => { const m = await storage.getCaptureMode(); if (active) setCaptureMode(m); })();
  return () => { active = false; };
}, []));

const handleChangeCaptureMode = async (mode) => {
  const previous = captureMode;
  setCaptureMode(mode);
  try { await storage.setCaptureMode(mode); }
  catch (e) { console.error('Set capture mode error:', e); setCaptureMode(previous); }
};

// in JSX — a new Card placed after Profile Information (after line 218)
<Card style={styles.card}>
  <Card.Content>
    <Text variant="titleMedium" style={styles.sectionTitle}>Assessment capture</Text>
    <Text variant="bodySmall" style={styles.helpText}>How you mark each item during an EGRA assessment.</Text>
    <SegmentedButtons
      value={captureMode}
      onValueChange={handleChangeCaptureMode}
      buttons={[
        { value: CAPTURE_MODES.GRID, label: 'Grid' },
        { value: CAPTURE_MODES.SEQUENTIAL, label: 'Step-by-Step' },
      ]}
    />
  </Card.Content>
</Card>
```

- [ ] **Step 1: Write the failing test** — mock `storage`; assert the control renders the loaded mode and that selecting "Grid" calls `storage.setCaptureMode('grid')`; assert a rejected `setCaptureMode` reverts the displayed value.
- [ ] **Step 2: Run to verify fail** → FAIL.
- [ ] **Step 3: Implement** the card (reuse existing `styles.card`; add `sectionTitle`/`helpText` only if not already present).
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(profile): per-EA assessment capture-mode toggle (Item 4 Task 13)`

---

## Finish-branch gate (controller)

- [ ] **Full suite** (Node 20, worktrees excluded): `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest --testPathIgnorePatterns "/.claude/worktrees/"` → all green (expect 95 prior suites + the new Item 4 suites).
- [ ] **Apply the Supabase migration** to `masi-app-sqlite` via the linked CLI; verify `capture_mode` exists (`npm run sqlite:staging:query -- "select column_name from information_schema.columns where table_name='assessments' and column_name='capture_mode';"`).
- [ ] **Build-log:** append the Item 4 closing entry (tasks, SHAs, reviews, the deferred Try-Again gap, the device-local + seam decision).
- [ ] **Device/preview pass owed:** the two capture screens + the Profile toggle have no on-device verification yet → `npm run sqlite:staging:ios` (or an EAS preview build) before merge. Confirm: default launches Step-by-Step, toggle flips it, both modes save + show results, capture_mode lands in Supabase.
- [ ] **`superpowers:finishing-a-development-branch`** to choose merge/PR; then `handoff` to the next session (Item 8).

## Self-review (done by the plan author)

- **Spec §4 coverage:** (1) extract spine + refactor LetterAssessmentScreen → Tasks 7–8; (2) port reducer + SequentialAssessmentScreen → Tasks 3, 10; (3) `capture_mode` column + Profile toggle + org→user→device resolution + default sequential → Tasks 1, 4, 5, 6, 12, 13. "Keep 60s timer + letter/word sets identical" → the hook reuses `ASSESSMENT_DURATION` and the same `letterSet`; no constant changes. ✓
- **Type/name consistency:** `finishAndSave({ letterStates, finalLastIndex, correctionCount })` signature is identical in the hook (Task 7), the grid screen (Task 8), and the sequential screen (Task 10). `buildAssessmentRecord` field names match `ASSESSMENT_COLUMNS` + `buildSummary` consumers. `screenName` values `'LetterAssessment'`/`'SequentialAssessment'` match the navigator registration (Task 11) and the resolver (Task 6). ✓
- **Contract completeness:** `capture_mode` touches local migration + `ASSESSMENT_COLUMNS` + `SERVER_COLUMNS` + Supabase migration + contract map + refactor log — all in Task 4's single commit. ✓
- **Known gap (disclosed, not silent):** Try-Again entry point still hardcodes `LetterAssessment` → routed in Item 5. ✓

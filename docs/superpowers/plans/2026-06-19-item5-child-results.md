# Item 5 — Child Results Workflow (per-child foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the group-agnostic per-child results foundation — extract a reusable `LetterMasteryPanel`, embed it in a renamed `ChildResultsScreen`, route "Try Again" through the capture-mode resolver, commit the parked results-hero WIP, and nest the child-workflow screens in a Children-tab stack so the bottom tab bar stays visible.

**Architecture:** A single `LetterMasteryPanel` component becomes the one source of truth for the letter-mastery grid + its immediate-write taught-record path, consumed by both a thin `LetterTrackerScreen` wrapper (Assessments-tab/rankings flow) and the new `ChildResultsScreen` (Children-tab flow). Navigation moves `ChildrenList` + `ClassDetail` + `ChildResults` into a nested `ChildrenStackNavigator` under the Children tab. No schema, sync, or RLS changes — this is screen/component/navigation work only.

**Tech Stack:** React Native (Expo), React Navigation (native-stack + bottom-tabs), React Native Paper, Jest + @testing-library/react-native. Local SQLite repositories (`masteryRepository`, `assessmentsRepository`) accessed through existing singletons.

## Global Constraints

- **Jest runs on Node 20** (better-sqlite3 ABI): prefix every jest command with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH` and pass `--testPathIgnorePatterns "/.claude/worktrees/"`.
- **Codex builds + tests; the controller commits** (Codex's sandbox blocks `.git`). Steps show `git` commands for completeness; the orchestrator runs them after re-verifying.
- **HARD RULE for the builder:** match SOURCE over this plan's assumptions. If a file doesn't match a quoted line range or structure here, STOP and report — do not improvise or widen scope.
- **Commit footer (every commit):**
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Leave untouched / never stage:** `skills-lock.json`, `.claude/skills/*`, `.agents/skills/*`, `documentation/top-10-improvements-2026-06.md`, `documentation/zazi-izandi-feature-port-prd-2026-go-live.md`. Stage only the exact files each task names.
- **Masi component dir is `src/components/assessment/` (singular).** New panel goes there, not the fork's plural `assessments/`.
- **Backwards-compat:** route-name renames are safe (navigation route names are internal to each app bundle, not persisted data or a server contract). No coordinated rollout needed.
- **Branch:** `feature/child-results` (already created off `main` @ `8c48b8d`).

---

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `src/screens/assessments/AssessmentResultsScreen.js` | A, B | Results screen; hero (WIP) + `handleTryAgain` routing |
| `__tests__/AssessmentResultsScreen.test.js` | A, B | Hero render test (WIP) + Try Again routing tests |
| `src/components/assessment/LetterMasteryPanel.js` | C (create) | One-source-of-truth mastery grid + immediate-write taught path; self-measures width |
| `__tests__/LetterMasteryPanel.test.js` | C (create) | Unit tests for the panel's load + write paths |
| `src/screens/assessments/LetterTrackerScreen.js` | C (rewrite) | Thin wrapper: child name + `<LetterMasteryPanel>` |
| `__tests__/LetterTrackerScreen.plan5.test.js` | C (verify) | Integration smoke test through the wrapper (kept) |
| `src/screens/assessments/ChildResultsScreen.js` | D (rename from ChildAssessmentSummaryScreen.js) | Per-child results; embeds the panel |
| `__tests__/ChildResultsScreen.test.js` | D (create) | Render test: assessment cards + embedded panel |
| `__tests__/assessmentEntryRouting.test.js` | D (update) | Rename import/usages ChildAssessmentSummary → ChildResults |
| `src/screens/children/ClassDetailScreen.js` | D | Chart-icon target `ChildAssessmentSummary` → `ChildResults` |
| `src/navigation/AppNavigator.js` | D, E | Rename registration (D); add `ChildrenStackNavigator`, nest 3 screens (E) |

---

## Task A: Commit the parked results-hero WIP

**Files:**
- Modify (already on disk, uncommitted): `src/screens/assessments/AssessmentResultsScreen.js`
- Test (already on disk, untracked): `__tests__/AssessmentResultsScreen.test.js`

**Interfaces:**
- Produces: a committed baseline of `AssessmentResultsScreen` whose hero shows `assessment.correct_responses` (a11y label `"Assessment main result"`) with `{accuracy}% correct` as a supporting line; test `__tests__/AssessmentResultsScreen.test.js` green.

- [ ] **Step 1: Run the existing WIP test to confirm it passes**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/AssessmentResultsScreen.test.js --testPathIgnorePatterns "/.claude/worktrees/"`
Expected: PASS — 1 test ("shows correct responses as the primary result with accuracy as supporting context").

- [ ] **Step 2: Commit (stage only these two files)**

```bash
git add src/screens/assessments/AssessmentResultsScreen.js __tests__/AssessmentResultsScreen.test.js
git commit -m "feat(item5): show raw correct count as the assessment results hero

Parked, test-backed WIP: results hero shows correct_responses (a11y label
'Assessment main result') with accuracy% demoted to a supporting line.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task B: Route "Try Again" through the capture-mode resolver

**Files:**
- Modify: `src/screens/assessments/AssessmentResultsScreen.js` (currently `handleTryAgain` at lines 33-40 hardcodes `navigation.replace('LetterAssessment', …)`)
- Test: `__tests__/AssessmentResultsScreen.test.js`

**Interfaces:**
- Consumes: `resolveAssessmentRoute()` from `src/utils/assessmentRouting.js` → `Promise<{ screenName: 'LetterAssessment' | 'SequentialAssessment', captureMode: string }>`.
- Produces: `handleTryAgain` is `async`, guarded by a `launchingRef`, and `navigation.replace(screenName, { child, letterSet, attemptNumber: attemptNumber + 1, assessmentType, captureMode })`.

- [ ] **Step 1: Write the failing tests**

In `__tests__/AssessmentResultsScreen.test.js`: add `fireEvent` and `waitFor` to the RTL import; add the resolver mock + import; make `renderScreen` return the `navigation` object; add the routing tests.

```javascript
// at top, replace the RTL import line:
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// add with the other jest.mock calls:
jest.mock('../src/utils/assessmentRouting', () => ({
  resolveAssessmentRoute: jest.fn(),
}));
import { resolveAssessmentRoute } from '../src/utils/assessmentRouting';

// change renderScreen to expose navigation:
function renderScreen() {
  const navigation = { replace: jest.fn(), navigate: jest.fn() };
  const utils = render(
    <PaperProvider>
      <AssessmentResultsScreen
        navigation={navigation}
        route={{ params: { assessment, child, letterSet, attemptNumber: 2 } }}
      />
    </PaperProvider>
  );
  return { navigation, ...utils };
}

// add inside describe('AssessmentResultsScreen', ...):
beforeEach(() => jest.clearAllMocks()); // each test.each case asserts a call count; the repo auto-clears nothing

test.each([
  ['sequential', 'SequentialAssessment'],
  ['grid', 'LetterAssessment'],
])('Try Again routes %s capture mode through the resolver', async (mode, screenName) => {
  resolveAssessmentRoute.mockResolvedValueOnce({ screenName, captureMode: mode });
  const { navigation, getByText } = renderScreen();

  fireEvent.press(getByText('Try Again'));

  await waitFor(() => {
    expect(resolveAssessmentRoute).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenCalledWith(
      screenName,
      expect.objectContaining({
        child,
        letterSet,
        attemptNumber: 3,
        assessmentType: 'letter_egra',
        captureMode: mode,
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/AssessmentResultsScreen.test.js --testPathIgnorePatterns "/.claude/worktrees/"`
Expected: the two "Try Again routes …" tests FAIL — current `handleTryAgain` calls `navigation.replace('LetterAssessment', …)` synchronously with no `captureMode` and never calls `resolveAssessmentRoute`. The WIP hero test still PASSES.

- [ ] **Step 3: Implement the resolver routing**

In `src/screens/assessments/AssessmentResultsScreen.js`:

```javascript
// line 1: add useRef
import React, { useRef } from 'react';

// add to the imports (after the AssessmentDetailGrid import):
import { resolveAssessmentRoute } from '../../utils/assessmentRouting';

// replace handleTryAgain (lines 33-40) with:
  const launchingRef = useRef(false);

  const handleTryAgain = async () => {
    if (launchingRef.current) return;
    launchingRef.current = true;
    try {
      const { screenName, captureMode } = await resolveAssessmentRoute();
      navigation.replace(screenName, {
        child,
        letterSet,
        attemptNumber: attemptNumber + 1,
        assessmentType,
        captureMode,
      });
    } finally {
      launchingRef.current = false;
    }
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/AssessmentResultsScreen.test.js --testPathIgnorePatterns "/.claude/worktrees/"`
Expected: PASS — 3 tests (hero + 2 routing).

- [ ] **Step 5: Commit**

```bash
git add src/screens/assessments/AssessmentResultsScreen.js __tests__/AssessmentResultsScreen.test.js
git commit -m "feat(item5): route Try Again through resolveAssessmentRoute

handleTryAgain now honors the capture-mode toggle (the third assessment entry
point; the two clean ones already route through the resolver). async + launchingRef.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task C: Extract `LetterMasteryPanel` (keystone)

**Files:**
- Create: `src/components/assessment/LetterMasteryPanel.js`
- Create: `__tests__/LetterMasteryPanel.test.js`
- Rewrite: `src/screens/assessments/LetterTrackerScreen.js`
- Verify (no change expected): `__tests__/LetterTrackerScreen.plan5.test.js`

**Interfaces:**
- Produces: `export default function LetterMasteryPanel({ child, classItem })` — a `<View>` (no own `ScrollView`) rendering: meta row (language badge, `"{n} / 26 letters mastered"`, optional `"Last assessed: {date}"`), retryable mutation-error text, legend, and the tappable 5-column letter grid. Loads on focus; writes taught records immediately (create / soft-delete / reactivate) via `masteryRepository`. Self-measures available width via `onLayout` with a `useWindowDimensions` fallback.
- Consumes (later tasks): `<LetterMasteryPanel child={child} classItem={classItem} />` embedded by `LetterTrackerScreen` (Task C) and `ChildResultsScreen` (Task D).

### Background — verbatim source
The panel is extracted from `src/screens/assessments/LetterTrackerScreen.js`. Move this logic **verbatim** (it carries load-bearing sync correctness), changing only what Steps below specify:
- `loadData` body (current lines 41-82) — **verbatim**, with source-exact deps `[child.id, letterSet.language, pedagogicalOrder, user.id]`. No language guard: `normalizeLanguageKey` (`letterMastery.js:70-74`) always returns a mapped key, so `letterSet` is never undefined (see R2/R3).
- `handleCellTap` body (current lines 90-173) — **verbatim**, including the re-fetch-active-record-on-untoggle and the `savedId = await saveLetterMasteryRecord(record)` / `setTaughtLetters(prev => ({ ...prev, [letter]: savedId }))` lines. These prevent duplicate-key sync errors and stale-id no-ops; do not "simplify" them.
- `getCellState` (current lines 175-179) — verbatim.
- The legend + grid JSX (current lines 219-272) — verbatim, but the grid's outer `<View style={[styles.grid, { gap: GRID_GAP }]}>` lives inside the panel's measured root `<View>`.

- [ ] **Step 1: Write the failing panel tests**

Create `__tests__/LetterMasteryPanel.test.js`:

```javascript
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import LetterMasteryPanel from '../src/components/assessment/LetterMasteryPanel';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { masteryRepository } from '../src/db/repositories/masteryRepository';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: { getAssessments: jest.fn() },
}));
jest.mock('../src/db/repositories/masteryRepository', () => ({
  masteryRepository: {
    getLetterMastery: jest.fn(),
    saveLetterMasteryRecord: jest.fn(),
    updateLetterMasteryRecord: jest.fn(),
  },
}));

describe('LetterMasteryPanel', () => {
  const refreshSyncStatus = jest.fn();
  const triggerBackgroundSync = jest.fn();
  const child = { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' };
  const classItem = { id: 'class-1', home_language: 'English' };

  beforeEach(() => {
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ refreshSyncStatus, triggerBackgroundSync });
    assessmentsRepository.getAssessments.mockResolvedValue([]);
    masteryRepository.getLetterMastery.mockResolvedValue([]);
    masteryRepository.saveLetterMasteryRecord.mockResolvedValue('saved-id-1');
    masteryRepository.updateLetterMasteryRecord.mockResolvedValue(true);
    refreshSyncStatus.mockResolvedValue({ unsyncedCount: 1 });
  });

  afterEach(() => jest.clearAllMocks());

  test('reactivates a soft-deleted record on toggle-on instead of creating a duplicate', async () => {
    masteryRepository.getLetterMastery.mockResolvedValue([
      { id: 'rec-a', child_id: 'child-1', letter: 'a', language: 'English', _deleted: true },
    ]);
    const { getByLabelText, getByText } = render(
      <LetterMasteryPanel child={child} classItem={classItem} />,
    );
    // the soft-deleted row is filtered out of the initial taught set
    await waitFor(() => expect(getByLabelText('a, not mastered')).toBeTruthy());

    fireEvent.press(getByLabelText('a, not mastered'));

    await waitFor(() => {
      expect(masteryRepository.updateLetterMasteryRecord).toHaveBeenCalledWith(
        'rec-a',
        expect.objectContaining({ _deleted: false, deleted_at: null }),
      );
    });
    expect(masteryRepository.saveLetterMasteryRecord).not.toHaveBeenCalled();
    expect(getByText('1 / 26 letters mastered')).toBeTruthy();
  });

  test('toggling a letter on then off uses the saved id and updates the mastered count', async () => {
    const { getByLabelText, getByText, queryByText } = render(
      <LetterMasteryPanel child={child} classItem={classItem} />,
    );
    await waitFor(() => expect(getByLabelText('a, not mastered')).toBeTruthy());

    fireEvent.press(getByLabelText('a, not mastered'));
    await waitFor(() => expect(getByText('1 / 26 letters mastered')).toBeTruthy());
    expect(masteryRepository.saveLetterMasteryRecord).toHaveBeenCalledTimes(1);

    // toggle off: the panel re-fetches the active record by logical key
    masteryRepository.getLetterMastery.mockResolvedValueOnce([
      { id: 'saved-id-1', child_id: 'child-1', letter: 'a', language: 'English', _deleted: false },
    ]);
    fireEvent.press(getByLabelText('a, taught by coach'));
    await waitFor(() => expect(queryByText('1 / 26 letters mastered')).toBeNull());
    expect(masteryRepository.updateLetterMasteryRecord).toHaveBeenCalledWith(
      'saved-id-1',
      expect.objectContaining({ _deleted: true }),
    );
  });

  test('failed taught-letter save keeps the cell unsaved and shows a retryable error', async () => {
    masteryRepository.saveLetterMasteryRecord.mockRejectedValueOnce(new Error('SQLite write failed'));
    const { getByLabelText, queryByText } = render(
      <LetterMasteryPanel child={child} classItem={classItem} />,
    );
    await waitFor(() => expect(getByLabelText('a, not mastered')).toBeTruthy());

    fireEvent.press(getByLabelText('a, not mastered'));

    await waitFor(() => expect(queryByText(/Letter update was not saved/i)).toBeTruthy());
    expect(queryByText('1 / 26 letters mastered')).toBeNull();
    expect(refreshSyncStatus).not.toHaveBeenCalled();
    expect(triggerBackgroundSync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/LetterMasteryPanel.test.js --testPathIgnorePatterns "/.claude/worktrees/"`
Expected: FAIL — `Cannot find module '../src/components/assessment/LetterMasteryPanel'`.

- [ ] **Step 3: Create the panel**

Create `src/components/assessment/LetterMasteryPanel.js`. Copy `loadData` (LetterTrackerScreen 41-82), `handleCellTap` (90-173), `getCellState` (175-179), and the legend+grid JSX (219-272) **verbatim**, with exactly these changes:

```javascript
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { letterStateColors } from '../../constants/letterStateColors';
import { LETTER_SETS, PEDAGOGICAL_ORDERS } from '../../constants/egraConstants';
import { computeAssessmentMastery, normalizeLanguageKey } from '../../utils/letterMastery';
import { assessmentsRepository } from '../../db/repositories/assessmentsRepository';
import { masteryRepository } from '../../db/repositories/masteryRepository';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';

const GRID_COLUMNS = 5;
const GRID_GAP = spacing.sm;
const CELL_COLORS = letterStateColors;

export default function LetterMasteryPanel({ child, classItem }) {
  const { user } = useAuth();
  const { refreshSyncStatus, triggerBackgroundSync } = useOffline();
  const { width: windowWidth } = useWindowDimensions();

  const [panelWidth, setPanelWidth] = useState(0);
  const [assessmentMastered, setAssessmentMastered] = useState(new Set());
  const [taughtLetters, setTaughtLetters] = useState({}); // { letter: recordId }
  const [loading, setLoading] = useState(true);
  const [latestAssessmentDate, setLatestAssessmentDate] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const [updatingLetter, setUpdatingLetter] = useState(null);

  const languageKey = normalizeLanguageKey(classItem?.home_language);
  const letterSet = LETTER_SETS[languageKey];
  const pedagogicalOrder = PEDAGOGICAL_ORDERS[languageKey];

  // onLayout self-measurement so the grid sizes correctly whether full-screen
  // (wrapper) or inside a padded Card (ChildResults). Fallback to window width
  // until the first layout pass (also what keeps RTL tests rendering cells).
  const effectiveWidth = panelWidth || (windowWidth - spacing.md * 2);
  const totalGapWidth = (GRID_COLUMNS - 1) * GRID_GAP;
  const tileSize = Math.floor((effectiveWidth - totalGapWidth) / GRID_COLUMNS);

  const loadData = useCallback(async () => {
    // ... VERBATIM body of LetterTrackerScreen.loadData (current lines 42-81) ...
  }, [child.id, letterSet.language, pedagogicalOrder, user.id]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ... VERBATIM handleCellTap (LetterTrackerScreen 90-173) ...
  // ... VERBATIM getCellState (LetterTrackerScreen 175-179) ...

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const languageLabel = letterSet.language;
  const allMastered = new Set([...assessmentMastered, ...Object.keys(taughtLetters)]);
  const masteredCount = allMastered.size;

  return (
    <View onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}>
      {/* Meta row (NO child name — the consumer renders that) */}
      <View style={styles.header}>
        <View style={styles.headerMeta}>
          <View style={[styles.languageBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.languageBadgeText}>{languageLabel}</Text>
          </View>
          <Text variant="bodySmall" style={styles.progressText}>
            {masteredCount} / 26 letters mastered
          </Text>
        </View>
        {latestAssessmentDate && (
          <Text variant="bodySmall" style={styles.assessmentDateText}>
            Last assessed: {latestAssessmentDate}
          </Text>
        )}
        {mutationError && (
          <Text variant="bodyMedium" style={styles.mutationErrorText}>
            {mutationError}
          </Text>
        )}
      </View>

      {/* Legend — VERBATIM from LetterTrackerScreen 219-233 */}
      {/* Letter Grid — VERBATIM from LetterTrackerScreen 236-272 */}
    </View>
  );
}
```

Move the `StyleSheet.create` block from `LetterTrackerScreen.js` (current lines 277-372) into the panel, **dropping** `container`, `content`, and `childName` (those move to the wrapper in Step 5). Keep `loadingContainer` (the panel still has a loading branch).

- [ ] **Step 4: Run the panel tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/LetterMasteryPanel.test.js --testPathIgnorePatterns "/.claude/worktrees/"`
Expected: PASS — 3 tests.

- [ ] **Step 5: Rewrite `LetterTrackerScreen` as a thin wrapper**

Replace the entire contents of `src/screens/assessments/LetterTrackerScreen.js` with:

```javascript
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import LetterMasteryPanel from '../../components/assessment/LetterMasteryPanel';

export default function LetterTrackerScreen({ route }) {
  const { child, classItem } = route.params;
  const childName = `${child.first_name} ${child.last_name}`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="titleLarge" style={styles.childName}>{childName}</Text>
      <LetterMasteryPanel child={child} classItem={classItem} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  childName: {
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
});
```

- [ ] **Step 6: Verify the existing wrapper integration test still passes unchanged**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/LetterTrackerScreen.plan5.test.js --testPathIgnorePatterns "/.claude/worktrees/"`
Expected: PASS — the wrapper renders the panel, so `'a, not mastered'`, the `Letter update was not saved` error, and `1 / 26 letters mastered` are all still present. **If it fails:** the panel is not reproducing the meta-row text or the cell a11y labels verbatim — fix the panel, do not weaken the test.

- [ ] **Step 7: Commit**

```bash
git add src/components/assessment/LetterMasteryPanel.js __tests__/LetterMasteryPanel.test.js src/screens/assessments/LetterTrackerScreen.js
git commit -m "refactor(item5): extract LetterMasteryPanel; LetterTracker is a thin wrapper

One source of truth for the mastery grid + immediate-write taught path
(create/soft-delete/reactivate with id-canonicalization preserved). Panel
self-measures width via onLayout so it embeds in a padded Card.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task D: Rename `ChildAssessmentSummary` → `ChildResults` and embed the panel

**Files:**
- Rename: `src/screens/assessments/ChildAssessmentSummaryScreen.js` → `src/screens/assessments/ChildResultsScreen.js`
- Modify: `src/navigation/AppNavigator.js` (import line 47; registration lines 285-292)
- Modify: `src/screens/children/ClassDetailScreen.js` (line 165 navigate target)
- Modify: `__tests__/assessmentEntryRouting.test.js` (import line 4; usage line 175; describe line 168)
- Create: `__tests__/ChildResultsScreen.test.js`

**Interfaces:**
- Consumes: `<LetterMasteryPanel child classItem />` from Task C.
- Produces: route name `ChildResults` (component `ChildResultsScreen`) replaces `ChildAssessmentSummary`; the standalone "Letter Tracker" nav-stub card is replaced by an embedded panel. Still routes "Run Assessment" through `resolveAssessmentRoute` (unchanged).

- [ ] **Step 1: Write the failing render test**

Create `__tests__/ChildResultsScreen.test.js`:

```javascript
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ChildResultsScreen from '../src/screens/assessments/ChildResultsScreen';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { useAuth } from '../src/context/AuthContext';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: { getAssessments: jest.fn() },
}));
jest.mock('../src/components/assessment/LetterMasteryPanel', () => {
  const { Text } = require('react-native');
  return () => <Text>MASTERY_PANEL</Text>;
});

describe('ChildResultsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    assessmentsRepository.getAssessments.mockResolvedValue([]);
  });

  test('renders assessment sections and embeds the mastery panel', async () => {
    const navigation = { navigate: jest.fn() };
    const route = {
      params: {
        child: { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' },
        classItem: { id: 'class-1', home_language: 'English' },
      },
    };
    const { getByText, queryByText } = render(
      <PaperProvider>
        <ChildResultsScreen navigation={navigation} route={route} />
      </PaperProvider>,
    );

    await waitFor(() => expect(getByText('Amahle Dlamini')).toBeTruthy());
    expect(getByText('Letter Sound')).toBeTruthy();          // assessment card retained
    expect(getByText('MASTERY_PANEL')).toBeTruthy();          // panel embedded
    expect(queryByText('View and manage letter mastery progress')).toBeNull(); // old stub gone
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/ChildResultsScreen.test.js --testPathIgnorePatterns "/.claude/worktrees/"`
Expected: FAIL — `Cannot find module '../src/screens/assessments/ChildResultsScreen'`.

- [ ] **Step 3: Rename the screen file + component**

```bash
git mv src/screens/assessments/ChildAssessmentSummaryScreen.js src/screens/assessments/ChildResultsScreen.js
```

In `src/screens/assessments/ChildResultsScreen.js`: rename the component `export default function ChildAssessmentSummaryScreen(...)` → `export default function ChildResultsScreen(...)` (line 29).

- [ ] **Step 4: Replace the Letter Tracker stub card with the embedded panel**

In `ChildResultsScreen.js`, add the import (after the `resolveAssessmentRoute` import, line 10):

```javascript
import LetterMasteryPanel from '../../components/assessment/LetterMasteryPanel';
```

Replace the stub card (current lines 150-158) with:

```javascript
      {/* Letter mastery — embedded panel (one source of truth) */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.cardTitle}>Letter Tracker</Text>
          <Text variant="bodySmall" style={styles.cardDescription}>
            Tap letters to mark them as taught
          </Text>
          <LetterMasteryPanel child={child} classItem={classItem} />
        </Card.Content>
      </Card>
```

(The now-unused `trackerCard` style at lines 243-245 may remain or be removed — removing is cleaner.)

- [ ] **Step 5: Update the route registration name (in place, on MainNavigator for now)**

In `src/navigation/AppNavigator.js`:
- Line 47: `import ChildAssessmentSummaryScreen from '../screens/assessments/ChildAssessmentSummaryScreen';` → `import ChildResultsScreen from '../screens/assessments/ChildResultsScreen';`
- Lines 285-292 registration:

```javascript
      <Stack.Screen
        name="ChildResults"
        component={ChildResultsScreen}
        options={{
          title: 'Child Results',
          headerBackTitle: 'Back',
        }}
      />
```

- [ ] **Step 6: Update the caller in `ClassDetailScreen`**

In `src/screens/children/ClassDetailScreen.js` line 165: `navigation.navigate('ChildAssessmentSummary', {` → `navigation.navigate('ChildResults', {`.

- [ ] **Step 7: Update the entry-routing test for the rename**

In `__tests__/assessmentEntryRouting.test.js`:
- Line 4: `import ChildAssessmentSummaryScreen from '../src/screens/assessments/ChildAssessmentSummaryScreen';` → `import ChildResultsScreen from '../src/screens/assessments/ChildResultsScreen';`
- Line 168 describe string: `'ChildAssessmentSummaryScreen routes %s mode through the resolver'` → `'ChildResultsScreen routes %s mode through the resolver'`
- Line 175: `<ChildAssessmentSummaryScreen` → `<ChildResultsScreen`

This test mocks `react-native-paper` with a **minimal** set (no `ActivityIndicator`), so mounting the real embedded `<LetterMasteryPanel>` would crash during its loading state. This test only cares about Run Assessment routing, not the panel — so mock the panel to null to isolate it (add with the other `jest.mock` calls):

```javascript
jest.mock('../src/components/assessment/LetterMasteryPanel', () => () => null);
```

- [ ] **Step 8: Run the affected suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/ChildResultsScreen.test.js __tests__/assessmentEntryRouting.test.js __tests__/ClassDetailScreen.test.js --testPathIgnorePatterns "/.claude/worktrees/"`
Expected: PASS — new ChildResults render test; both entry-routing cases for ChildResults + AssessmentChildSelect; ClassDetail render tests unaffected.

- [ ] **Step 9: Commit**

```bash
git add src/screens/assessments/ChildResultsScreen.js src/navigation/AppNavigator.js src/screens/children/ClassDetailScreen.js __tests__/assessmentEntryRouting.test.js __tests__/ChildResultsScreen.test.js
git commit -m "feat(item5): rename ChildAssessmentSummary to ChildResults; embed LetterMasteryPanel

Replaces the Letter Tracker nav stub with the embedded mastery panel; route
ChildAssessmentSummary -> ChildResults (caller + registration + entry test).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task E: Nest `ChildrenList` + `ClassDetail` + `ChildResults` in a Children-tab stack

**Files:**
- Modify: `src/navigation/AppNavigator.js`
- Modify: `src/screens/children/ClassDetailScreen.js` (comment-only — the now-stale `popToTop` rationale at lines 31-35; see Step 2b)

**Interfaces:**
- Consumes: `ChildrenListScreen`, `ClassDetailScreen`, `ChildResultsScreen` (all already imported).
- Produces: a `ChildrenStackNavigator` mounted as the `Children` tab's component (`headerShown: false` at the tab level); `ClassDetail` and `ChildResults` removed from `MainNavigator`. Tab bar stays visible on all three screens.

**Risk:** HIGH and **not unit-testable**. Verified via the device-verify gate (Step 4) + full-suite no-regression. **HARD RULE:** preserve the existing header treatment — the custom "Back" `headerLeft` (currently `MainNavigator` lines 133-148) and the `SyncIndicator` `headerRight` that the tab currently provides for `ChildrenList`. If the real header wiring differs from the code below, match source and report.

- [ ] **Step 1: Add a second native-stack navigator + the `ChildrenStackNavigator`**

In `src/navigation/AppNavigator.js`, after `const Tab = createBottomTabNavigator();` (line 58) add:

```javascript
const ChildrenStack = createNativeStackNavigator();
```

Add this function above `MainTabNavigator`:

```javascript
function ChildrenStackNavigator() {
  return (
    <ChildrenStack.Navigator
      screenOptions={({ navigation }) => ({
        headerLeft: navigation.canGoBack()
          ? () => (
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={{ flexDirection: 'row', alignItems: 'center', marginLeft: Platform.OS === 'ios' ? -8 : 0 }}
            >
              <Ionicons name="chevron-back" size={28} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 17 }}>Back</Text>
            </Pressable>
          )
          : undefined,
      })}
    >
      <ChildrenStack.Screen
        name="ChildrenList"
        component={ChildrenListScreen}
        options={({ navigation }) => ({
          title: 'My Children',
          headerRight: () => (
            <View style={{ marginRight: 16 }}>
              <SyncIndicator onPress={() => navigation.navigate('SyncStatus')} />
            </View>
          ),
        })}
      />
      <ChildrenStack.Screen
        name="ClassDetail"
        component={ClassDetailScreen}
        options={{ title: 'Class Details', headerBackTitle: 'Back' }}
      />
      <ChildrenStack.Screen
        name="ChildResults"
        component={ChildResultsScreen}
        options={{ title: 'Child Results', headerBackTitle: 'Back' }}
      />
    </ChildrenStack.Navigator>
  );
}
```

- [ ] **Step 2: Point the Children tab at the stack; remove the moved screens from `MainNavigator`**

In `MainTabNavigator`, replace the `Children` `Tab.Screen` (lines 111-115) with:

```javascript
      <Tab.Screen
        name="Children"
        component={ChildrenStackNavigator}
        options={{ title: 'My Children', headerShown: false }}
      />
```

In `MainNavigator`, **delete** the `ClassDetail` `Stack.Screen` (lines 195-202) and the `ChildResults` `Stack.Screen` (the block added in Task D Step 5). `EditChild`, `AddChild`, `LetterTracker`, `LetterMasteryRanking`, etc. **stay** on `MainNavigator`.

- [ ] **Step 2b: Fix the now-stale `popToTop` comment in `ClassDetailScreen`**

After nesting, `ClassDetailScreen`'s "Manage classes" `navigation.popToTop()` (line 36) pops the **Children stack** to its `ChildrenList` root (not the root stack to `MainTabs`). Behavior is preserved — `ChildrenList` stays mounted → `hasAutoRouted` intact → no re-bounce, and the tab bar now stays visible. **Code unchanged** (`popToTop()` is still correct); only update the comment at `ClassDetailScreen.js:31-35`: replace "ClassDetail sits above MainTabs (the root stack's initial route)" with "ClassDetail is a screen in the Children stack; popToTop returns to the live ChildrenList root (ref intact → no re-route)."

- [ ] **Step 3: Run the full unit suite for no regressions**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test`
Expected: GREEN — no import/render regressions (baseline 115 suites / 629 tests + this item's added tests). A failure here is almost certainly a broken import or a screen that assumed root registration.

- [ ] **Step 4: Device-verify gate (manual — required before merge)**

Build/run against the SQLite backend (`npm run sqlite:staging:ios` or an EAS `--profile preview`). Confirm:
- [ ] Tapping **My Children** keeps the bottom tab bar visible.
- [ ] Opening a class (**ClassDetail**) keeps the tab bar; the "Back" affordance returns to the list without bouncing.
- [ ] Tapping a child's chart icon opens **ChildResults** with the tab bar still visible; the embedded mastery panel renders + cell taps persist.
- [ ] **Run Assessment** from ChildResults launches the assessment (cross-navigator nav to root resolves).
- [ ] Count-aware auto-route: a single-class EA still lands directly in ClassDetail with the tab bar visible.
- [ ] The letter icon on a ClassDetail row still opens the standalone Letter Tracker. (This still **hides** the tab bar — `LetterTracker` stays on root this item by design; the row icon goes away in the deferred group item. Do NOT flag the hidden tab bar here as a regression.)
- [ ] "Manage classes" from ClassDetail returns to the class list **without re-bouncing** a single-class EA back into ClassDetail (`popToTop` now pops the Children stack to its live `ChildrenList` root; ref intact → `hasAutoRouted` preserved).

- [ ] **Step 5: Commit**

```bash
git add src/navigation/AppNavigator.js
git commit -m "feat(item5): nest ChildrenList/ClassDetail/ChildResults in a Children-tab stack

Keeps the bottom tab bar visible on the child-workflow screens (fixes the
root-stack tab-bar-hiding bug). Forward-compatible with the group-centric
item (a future GroupDetail slots into the same stack).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final gate (after all tasks)

- [ ] **Full suite (Node 20):** `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test && PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration`
  Expected: GREEN — unit = the prior baseline (115 suites / 629) **plus** Item-5 additions (new suites `LetterMasteryPanel` ~3 + `ChildResults` ~1; AssessmentResults +2 routing tests; `LetterTrackerScreen.plan5` kept as a wrapper smoke test). Treat this as "baseline + additions," not an exact number. Integration 23 suites / 145 unchanged (no integration-tier files touched).
- [ ] **Device-verify gate (Task E Step 4)** completed by Jim.
- [ ] **Append an Item 5 entry to `documentation/build-log.md`** (commits + tests + reviews).
- [ ] `superpowers:finishing-a-development-branch` → offer merge to local `main`; then `handoff` to the **group-centric capture & navigation** item.

## Review plan (per the handoff orchestration model)

- **T-A, T-B:** B is a route-resolver change → Codex adversarial build pass; A is a verify-and-commit.
- **T-C (HIGH):** Claude `plan-reviewer` + Codex adversarial cross-review (the id-reuse/soft-delete write path and the onLayout width-fallback are the load-bearing risks).
- **T-D (MED):** Codex adversarial or careful controller review (rename completeness + embed).
- **T-E (HIGH):** Claude `plan-reviewer` + Codex adversarial cross-review at plan time + the device-verify gate (not unit-testable).

This plan itself is going to a Codex adversarial review before execution.

---

## Post-review revisions (two-LLM cross-review, 2026-06-19 — all applied inline above)

Reviewed by Codex (adversarial) + a Claude reviewer. Both independently re-verified the Task-C verbatim line-ranges, the missed-caller/nav-orphan analysis, and the Task-E header/tab-bar handling as **sound**. Findings engaged as claims and verified against source before applying:

- **R1 [HIGH, Codex] — mock accumulation.** The Try-Again `test.each` asserts `resolveAssessmentRoute` called once per case, but the repo auto-clears nothing (convention is manual clearing — `assessmentEntryRouting.test.js:127`, `LetterTrackerScreen.plan5.test.js:61`). → Added `beforeEach(jest.clearAllMocks())` to Task B Step 1.
- **R2 [BUILD-BREAKER, Claude] — unreachable language fallback.** Verified `normalizeLanguageKey` (`letterMastery.js:70-74`) returns `'english'` for any non-xhosa input, so `LETTER_SETS[key]` is always defined and the `!letterSet` guard is dead code — the fallback test would fail forever. → Removed the fallback UI, its styles, the `loadData` guard line, and the test from Task C; the extraction is now a pure verbatim move.
- **R3 [MED, Claude] — loadData dep deviation.** Reverted the dep array to source-exact `[child.id, letterSet.language, pedagogicalOrder, user.id]` (a consequence of R2) so the "match source" HARD RULE won't halt the builder.
- **R4 [MED, Codex] — reactivation path uncovered.** Added a Task C panel test asserting toggle-on of a soft-deleted record calls `updateLetterMasteryRecord` (reactivate), not `saveLetterMasteryRecord` — covering the duplicate-key guard.
- **R5 [MED, Claude] — cross-navigator LetterTracker.** `navigate('LetterTracker')` from nested `ClassDetail` resolves by bubbling to root and hides the tab bar (existing, intended this item). → Noted in the Task E device-verify gate so it isn't flagged as a regression.
- **R6 [LOW, Claude] — stale popToTop comment.** Post-nesting, `popToTop()` pops the Children stack to `ChildrenList` (behavior preserved, no re-bounce). → Task E adds Step 2b (comment-only fix) + a device-verify item; `ClassDetailScreen.js` added to Task E's file list.
- **R7 [LOW, Claude] — test-count reconciliation.** Final gate now reads as "baseline + additions," not an exact number.
- **Confirmations (no change):** Codex Vectors 1/2/5 clean; Claude spec-coverage + line-ref + TDD checks clean; the `assessmentEntryRouting` paper-mock-missing-`ActivityIndicator` risk is already handled by mocking the panel to null (Task D Step 7).

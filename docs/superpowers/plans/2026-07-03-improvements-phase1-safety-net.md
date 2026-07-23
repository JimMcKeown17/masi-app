# Improvements Phase 1: Safety Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the five Phase 1 items from `documentation/archive/improvements-2026-07-roadmap.md`: deflake the release gate, fix the two one-liner field-data bugs (NetInfo reachability, session-form leave guard), add the hot-path covering indexes, and put the test suites in CI.

**Architecture:** Five independent, individually-committable tasks on one branch. Task 1 (deflake) must precede Task 5 (CI) so CI turns on green. Tasks 2-4 are order-independent. No Supabase schema, RLS, or sync-contract changes anywhere in this phase; the only DDL is a device-local SQLite migration (v5).

**Tech Stack:** React Native (Expo) + JavaScript, Jest + React Native Testing Library, better-sqlite3-backed SQLite test engine, GitHub Actions.

## Global Constraints

- Branch off main first: `git checkout -b improvement/p1-safety-net` (repo rule: always branch).
- Node 20 per `.nvmrc`. If the shell default is Node 22, prefix commands with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH` (better-sqlite3 v12 loads on 22 too, but 20 is the pinned baseline).
- Commit messages: `type(scope): message`. Never add an agent name as co-author (standing user rule).
- If stray worktrees exist under `.claude/worktrees/`, add `--testPathIgnorePatterns "\.claude/worktrees"` to full-suite jest runs (known gotcha; CI is unaffected because worktrees are untracked).
- Do not touch `documentation/rls-sync-contract-map.md`; nothing in this phase changes a synced payload, policy, or outbox ordering.
- `supabase/migrations/` gets no new file; Task 4's indexes are device-local only.
- Never write an em dash in any authored doc, comment, or commit message. Exception: code blocks that preserve existing source comments stay byte-identical, even where those comments contain one.

---

### Task 1: Deflake the LetterMasteryPanel toggle test (root cause: UI state blocked on sync-status refresh)

The failure observed 2026-07-02: full-suite run failed at `__tests__/LetterMasteryPanel.test.js` "toggling a letter on then off restores the untaught state"; `waitFor(() => expect(queryByText('1 / 26 letters mastered')).toBeNull())` timed out under parallel load, passes in isolation. Root cause to fix: `handleCellTap` awaits `refreshSyncStatus()` (a sync-status DB read) *between* the repository write and the `setTaughtLetters` UI update, so the visible state change is delayed by work the user does not care about. That is the flake under CPU contention and a real latency smell on slow devices. Fix the component ordering (state right after the write, sync-status refresh fire-and-forget), then harden the test assertion.

**Files:**
- Modify: `src/components/assessment/LetterMasteryPanel.js:92-175` (`handleCellTap`)
- Modify: `__tests__/LetterMasteryPanel.test.js` (the toggle test around line 83)

**Interfaces:**
- Consumes: `masteryRepository.updateLetterMasteryRecord(id, patch)`, `masteryRepository.saveLetterMasteryRecord(record) -> savedId`, `refreshSyncStatus()` and `triggerBackgroundSync()` from `useOffline()` (all unchanged).
- Produces: no API changes. Behavior change (intentional): a failure inside `refreshSyncStatus` no longer surfaces as "Letter update was not saved" when the mastery write itself succeeded.

- [x] **Step 1: Reproduce (best effort)**

Run the full suite up to three times:

```bash
for i in 1 2 3; do npx jest --silent 2>&1 | tail -3; done
```

Expected: at least one run fails the toggle test (it reproduced under parallel load on 2026-07-02). If it refuses to reproduce today, continue anyway; the fix removes the timing sensitivity and is behavior-preserving.

- [x] **Step 2: Reorder `handleCellTap` so UI state updates immediately after the repository write**

Replace the body of the `try` block in `handleCellTap` (`src/components/assessment/LetterMasteryPanel.js`, currently lines ~100-168) with the version below. The change in every branch is the same: repository write first, `setTaughtLetters` immediately after, then `refreshSyncStatus().catch(() => {})` + `triggerBackgroundSync?.()` as fire-and-forget signals. All comments and lookup logic are preserved.

```javascript
      if (taughtLetters[letter]) {
        // Currently green -> toggle OFF (soft-delete). Re-resolve the active row by its logical
        // key rather than trusting the cached id: that id can drift under us (deterministic-id
        // canonicalisation, or a background canonical-id adoption renaming the row), and a stale
        // id would make the update a silent no-op, leaving the letter mastered.
        const allMastery = await masteryRepository.getLetterMastery({
          userId: user.id,
          childId: child.id,
        });
        const active = allMastery.find(
          r => r.child_id === child.id && r.letter === letter && r.language === letterSet.language && !r._deleted
        );
        if (active) {
          await masteryRepository.updateLetterMasteryRecord(active.id, {
            _deleted: true,
            synced: false,
            updated_at: new Date().toISOString(),
          });
        }
        setTaughtLetters(prev => {
          const next = { ...prev };
          delete next[letter];
          return next;
        });
        if (active) {
          refreshSyncStatus().catch(() => {});
          triggerBackgroundSync?.();
        }
      } else {
        // Currently gray -> toggle ON
        // Check for existing soft-deleted record to reuse (avoids duplicate key on sync)
        const allMastery = await masteryRepository.getLetterMastery({
          userId: user.id,
          childId: child.id,
        });
        const existing = allMastery.find(
          r => r.child_id === child.id && r.letter === letter && r.language === letterSet.language && r._deleted
        );
        if (existing) {
          // Reactivate the soft-deleted record
          await masteryRepository.updateLetterMasteryRecord(existing.id, {
            _deleted: false,
            deleted_at: null,
            synced: false,
            updated_at: new Date().toISOString(),
          });
          setTaughtLetters(prev => ({ ...prev, [letter]: existing.id }));
          refreshSyncStatus().catch(() => {});
          triggerBackgroundSync?.();
        } else {
          // Create new record
          const record = {
            id: uuidv4(),
            user_id: user.id,
            child_id: child.id,
            letter,
            source: 'taught',
            language: letterSet.language,
            synced: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          // saveLetterMasteryRecord canonicalises the id (deterministic logical-key id), so
          // track the returned id — not the discarded local uuid — or toggle-off no-ops.
          const savedId = await masteryRepository.saveLetterMasteryRecord(record);
          setTaughtLetters(prev => ({ ...prev, [letter]: savedId }));
          refreshSyncStatus().catch(() => {});
          triggerBackgroundSync?.();
        }
      }
```

Note: the `setTaughtLetters` clear in the toggle-OFF branch stays outside `if (active)` on purpose (clearing a stale cached id is intentional today); only the sync signals are gated on a write having happened, exactly as before.

- [x] **Step 3: Run the panel suite; existing assertions must still pass**

```bash
npx jest __tests__/LetterMasteryPanel.test.js --verbose
```

Expected: PASS. `refreshSyncStatus` is still called (the existing call-assertions hold); the failed-save test still shows the retryable error because `saveLetterMasteryRecord` rejects before any state update.

- [x] **Step 4: Harden the flaky assertion to await the observable side effect first**

In `__tests__/LetterMasteryPanel.test.js`, in the "toggling a letter on then off" test, replace:

```javascript
    fireEvent.press(getByLabelText('a, taught by coach'));
    await waitFor(() => expect(queryByText('1 / 26 letters mastered')).toBeNull());
    expect(masteryRepository.updateLetterMasteryRecord).toHaveBeenCalledWith(
      'saved-id-1',
      expect.objectContaining({ _deleted: true }),
    );
```

with:

```javascript
    fireEvent.press(getByLabelText('a, taught by coach'));
    await waitFor(() =>
      expect(masteryRepository.updateLetterMasteryRecord).toHaveBeenCalledWith(
        'saved-id-1',
        expect.objectContaining({ _deleted: true }),
      ),
    );
    await waitFor(() => expect(queryByText('1 / 26 letters mastered')).toBeNull());
```

Then grep the file for the other `waitFor(() => expect(queryByText(...)).toBeNull())` occurrences (`grep -n "toBeNull" __tests__/LetterMasteryPanel.test.js`, 4 total) and apply the same await-the-side-effect-first pattern wherever a repository call precedes the UI assertion.

- [x] **Step 5: Add a regression test for the intentional behavior change**

The reorder means a `refreshSyncStatus` failure no longer masquerades as a failed mastery write. Pin that. In `__tests__/LetterMasteryPanel.test.js` (the file's `refreshSyncStatus`/`triggerBackgroundSync` mocks are file-scoped consts, lines 29-36), add:

```javascript
  test('a sync-status refresh failure after a successful write does not show the save error', async () => {
    refreshSyncStatus.mockRejectedValueOnce(new Error('sync status read failed'));
    const { getByLabelText, getByText, queryByText } = render(
      <LetterMasteryPanel child={child} classItem={classItem} />,
    );
    await waitFor(() => expect(getByLabelText('a, not mastered')).toBeTruthy());

    fireEvent.press(getByLabelText('a, not mastered'));

    await waitFor(() => expect(getByText('1 / 26 letters mastered')).toBeTruthy());
    expect(queryByText(/Letter update was not saved/i)).toBeNull();
  });
```

Run: `npx jest __tests__/LetterMasteryPanel.test.js -t "sync-status refresh failure" --verbose`
Expected: PASS with the Step 2 reorder in place. (Against the old code it would FAIL: the awaited refresh rejection landed in the catch block and raised the error banner even though the write succeeded.)

- [x] **Step 6: Verify with three consecutive full-suite runs**

```bash
for i in 1 2 3; do npx jest --silent || { echo "RUN $i FAILED"; break; }; done
```

Expected: three green runs, no `RUN n FAILED` line.

- [x] **Step 7: Commit**

```bash
git add src/components/assessment/LetterMasteryPanel.js __tests__/LetterMasteryPanel.test.js
git commit -m "fix(mastery): update panel state before sync-status refresh; deflake toggle test"
```

---

### Task 2: Treat NetInfo unknown reachability as online

`isInternetReachable` is `null` while NetInfo's reachability probe is pending or blocked (Android cold start, school Wi-Fi that filters the probe endpoint). `OfflineContext` currently computes `isConnected && isInternetReachable`, so `null` makes the app "offline": `syncNow` refuses and `triggerBackgroundSync` no-ops, silently blocking all sync.

**Files:**
- Modify: `src/context/OfflineContext.js:141` and `:200`
- Test: `__tests__/OfflineContext.test.js` (extend)

**Interfaces:**
- Consumes: the file's existing NetInfo mock (`addEventListener: jest.fn(() => jest.fn())`, `fetch: jest.fn(async () => (...))`) and its `renderOfflineHook()` helper.
- Produces: `isOnline` is now always a boolean (never `null`).

- [x] **Step 1: Write the failing tests**

Add inside the existing top-level `describe` in `__tests__/OfflineContext.test.js` (so it inherits the `beforeEach` fake-timer and `getSyncStatus` setup), and add the import at the top of the file:

```javascript
import NetInfo from '@react-native-community/netinfo';
```

```javascript
  describe('unknown reachability is treated as online', () => {
    test('initial fetch with isInternetReachable null leaves the app online', async () => {
      NetInfo.fetch.mockResolvedValueOnce({ isConnected: true, isInternetReachable: null });
      const { result } = await renderOfflineHook();
      await waitFor(() => expect(result.current.isOnline).toBe(true));
    });

    test('a listener event with isInternetReachable null keeps the app online', async () => {
      const { result } = await renderOfflineHook();
      const listener = NetInfo.addEventListener.mock.calls[0][0];
      act(() => {
        listener({ isConnected: true, isInternetReachable: null });
      });
      await waitFor(() => expect(result.current.isOnline).toBe(true));
    });
  });
```

- [x] **Step 2: Run to verify both fail**

```bash
npx jest __tests__/OfflineContext.test.js -t "unknown reachability" --verbose
```

Expected: FAIL twice with `expect(received).toBe(true)` where received is `null` (the raw `true && null` result reaches `setIsOnline`).

- [x] **Step 3: Fix both sites**

`src/context/OfflineContext.js:141`, in the NetInfo listener:

```javascript
      const online = Boolean(state.isConnected) && state.isInternetReachable !== false;
```

`src/context/OfflineContext.js:200`, in the initializer:

```javascript
      setIsOnline(Boolean(netInfoState.isConnected) && netInfoState.isInternetReachable !== false);
```

- [x] **Step 4: Run the whole OfflineContext suite**

```bash
npx jest __tests__/OfflineContext.test.js --verbose
```

Expected: PASS, including all pre-existing tests (they use `isInternetReachable: true`, unaffected).

- [x] **Step 5: Commit**

```bash
git add src/context/OfflineContext.js __tests__/OfflineContext.test.js
git commit -m "fix(sync): treat NetInfo unknown reachability as online so sync is not silently blocked"
```

---

### Task 3: Unsaved-changes leave guard on the session form

`LiteracySessionForm` discards up to ten fields of capture state on a back-swipe or hardware back with no confirmation; the assessment screens are guarded (`useAssessmentSession.js:73`) but the highest-traffic form is not. Mirror that hook's field-hardened pattern: `allowLeaveRef` is released only immediately before the success `navigation.replace`, so a *failed* save stays guarded.

**Files:**
- Modify: `src/screens/sessions/LiteracySessionForm.js` (imports at lines 1-2, guard block after the state declarations ~line 212, one line in `handleSubmit` ~line 306)
- Test: `__tests__/LiteracySessionForm.test.js` (extend `renderForm`, add a describe)

**Interfaces:**
- Consumes: the `navigation` prop the screen already receives (`export default function LiteracySessionForm({ navigation })`, line 190); adds usage of `navigation.addListener` and `navigation.dispatch`.
- Produces: `buildNavigation()` test helper returning `{ replace, dispatch, addListener, emitBeforeRemove }`; `renderForm(navigation?)` now returns `{ navigation, ...renderResult }`.

- [x] **Step 1: Extend the test file's navigation stub and `renderForm`**

In `__tests__/LiteracySessionForm.test.js`, add above `renderForm` (~line 48):

```javascript
const buildNavigation = () => {
  const listeners = {};
  return {
    replace: jest.fn(),
    dispatch: jest.fn(),
    addListener: jest.fn((event, callback) => {
      listeners[event] = callback;
      return jest.fn();
    }),
    emitBeforeRemove: () => {
      const event = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
      listeners.beforeRemove?.(event);
      return event;
    },
  };
};
```

Then replace `renderForm` (currently lines 48-52) with:

```javascript
const renderForm = (navigation = buildNavigation()) => {
  const screen = render(
    <PaperProvider settings={{ icon: () => null }}>
      <LiteracySessionForm navigation={navigation} />
    </PaperProvider>
  );
  return { navigation, ...screen };
};
```

Existing tests keep working: they destructure queries from the returned object, and the stub still provides `replace`.

- [x] **Step 2: Write the failing tests**

The file currently imports only `render` from RTL. Extend the imports at the top:

```javascript
import { render, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { READING_LEVELS } from '../src/constants/literacyConstants';
```

Then add:

```javascript
describe('unsaved-changes leave guard', () => {
  test('a dirty form blocks leaving and asks for confirmation', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { navigation, getByPlaceholderText } = renderForm();
    fireEvent.changeText(getByPlaceholderText('Add session notes...'), 'worked on m sounds');
    const event = navigation.emitBeforeRemove();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('choosing a session reading level alone makes the form dirty', () => {
    const { navigation, getByText } = renderForm();
    fireEvent.press(getByText('Select a level'));
    fireEvent.press(getByText(READING_LEVELS[0]));
    const event = navigation.emitBeforeRemove();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  test('a clean form leaves without prompting', () => {
    const { navigation } = renderForm();
    const event = navigation.emitBeforeRemove();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
```

(The reading-level test drives the real Portal dialog: the trigger button renders 'Select a level' when unset, and `RadioButton.Item` labels are the `READING_LEVELS` values themselves. The two RTL-driven fields plus the clean case cover the guard's wiring; the remaining dirty-predicate disjuncts are plain boolean derivations of state the form already persists, verified by reading `handleSubmit`.)

- [x] **Step 3: Run to verify the dirty-form test fails**

```bash
npx jest __tests__/LiteracySessionForm.test.js -t "leave guard" --verbose
```

Expected: "a dirty form blocks leaving" and "choosing a session reading level" both FAIL (`preventDefault` never called; no listener is registered yet). "a clean form leaves" passes trivially; that is fine, it pins the non-annoying half of the behavior.

- [x] **Step 4: Implement the guard**

`src/screens/sessions/LiteracySessionForm.js` line 1-2, extend the imports:

```javascript
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
```

After the state declarations (below `const [snackbarVisible, setSnackbarVisible] = useState(false);`, ~line 212), add:

```javascript
  // Leave guard: same field-hardened pattern as useAssessmentSession. allowLeaveRef is
  // released only right before the success replace, so a failed save stays guarded.
  // Dirty = any save-bearing field differs from its initial value (all of these reach
  // the persisted session payload in handleSubmit).
  const allowLeaveRef = useRef(false);
  const initialSessionDateRef = useRef(sessionDate);
  const isDirtyRef = useRef(false);
  isDirtyRef.current =
    selectedChildren.length > 0 ||
    selectedLetters.length > 0 ||
    sessionReadingLevel !== null ||
    Object.keys(childReadingLevels).length > 0 ||
    Object.values(letterTrackerChanges).some((changes) => Object.keys(changes || {}).length > 0) ||
    comments.trim().length > 0 ||
    sessionDate.getTime() !== initialSessionDateRef.current.getTime();

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current || !isDirtyRef.current) return;
      event.preventDefault();
      Alert.alert(
        'Discard this session?',
        'Your session details have not been saved. Leaving now will discard them.',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.dispatch(event.data.action),
          },
        ],
      );
    });
    return unsubscribe;
  }, [navigation]);
```

In `handleSubmit`, immediately above the existing `navigation.replace('SessionComplete', ...)` (~line 306), add:

```javascript
      allowLeaveRef.current = true;
```

(`navigation.replace` also fires `beforeRemove`, which is exactly why the flag must be set first.)

- [x] **Step 5: Run the file's full suite**

```bash
npx jest __tests__/LiteracySessionForm.test.js --verbose
```

Expected: PASS, including all pre-existing characterization tests.

- [x] **Step 6: Commit**

```bash
git add src/screens/sessions/LiteracySessionForm.js __tests__/LiteracySessionForm.test.js
git commit -m "feat(sessions): confirm before discarding a dirty session form"
```

---

### Task 4: Covering-index migration (schema v5)

Every index in the device schema is a partial *unique* index, which cannot serve queries that omit its `where` predicate; the hot FK lookups below are full table scans that grow all school year. Add plain covering indexes as device-local migration v5. Each indexed column set was verified against the live query in the named repository.

**Files:**
- Modify: `src/db/migrations.js` (append one migration after `version: 4`, ~line 573)
- Test: Create `__tests__/hotPathIndexes.test.js`

**Interfaces:**
- Consumes: `createBetterSqliteTestDatabase()` from `test-support/betterSqliteAdapter` and `runMigrations`/`CURRENT_SCHEMA_VERSION` from `src/db/migrations` (same setup as `__tests__/sqliteFoundation.test.js`).
- Produces: `CURRENT_SCHEMA_VERSION` becomes `5` (it is derived from the array, no constant to edit); eight index names listed below, which Phase 4's query work may reference.

- [x] **Step 1: Write the failing test**

Create `__tests__/hotPathIndexes.test.js`:

```javascript
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations, CURRENT_SCHEMA_VERSION } from '../src/db/migrations';

const EXPECTED_INDEXES = [
  'idx_session_attendees_session',      // sessionsRepository.mapSession per-session hydration
  'idx_assessment_items_assessment',    // assessmentsRepository.mapAssessment per-row summary
  'idx_assessments_programme_child',    // getAssessments: where programme_id = ? [and child_id = ?]
  'idx_sessions_programme_date',        // getSessions: where programme_id = ? order by session_date
  'idx_letter_mastery_user_child',      // getLetterMastery({ userId, childId })
  'idx_child_group_memberships_group',  // getChildrenInGroup group lookups
  'idx_sync_outbox_ready',              // getReadyRecords: where status in (...) and next_retry_at <= ?
  'idx_time_entries_user_signin',       // getActiveTimeEntry: where user_id = ? order by sign_in_time desc
];

describe('hot-path covering indexes (migration v5)', () => {
  let db;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('schema version is 5', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(5);
  });

  test('all covering indexes exist after migration', async () => {
    const rows = await db.getAllAsync("select name from sqlite_master where type = 'index'");
    const names = rows.map((row) => row.name);
    for (const index of EXPECTED_INDEXES) {
      expect(names).toContain(index);
    }
  });

  test('the session_attendees hydration probe uses its covering index', async () => {
    const plan = await db.getAllAsync(
      "explain query plan select child_id, group_id from session_attendees where session_id = 'session-1'"
    );
    expect(JSON.stringify(plan)).toContain('idx_session_attendees_session');
  });

  test('the per-child assessments lookup uses its covering index', async () => {
    const plan = await db.getAllAsync(
      "explain query plan select * from assessments where programme_id = 'p-1' and child_id = 'c-1' order by assessment_date, created_at"
    );
    expect(JSON.stringify(plan)).toContain('idx_assessments_programme_child');
  });

  test('the per-child mastery lookup uses its covering index', async () => {
    const plan = await db.getAllAsync(
      "explain query plan select * from letter_mastery where user_id = 'u-1' and child_id = 'c-1'"
    );
    expect(JSON.stringify(plan)).toContain('idx_letter_mastery_user_child');
  });
});
```

- [x] **Step 2: Run to verify it fails**

```bash
npx jest __tests__/hotPathIndexes.test.js --verbose
```

Expected: FAIL with `expect(CURRENT_SCHEMA_VERSION).toBe(5)` receiving `4`, and missing index names.

- [x] **Step 3: Append migration v5**

In `src/db/migrations.js`, after the `version: 4` block (~line 573), add:

```javascript
  {
    version: 5,
    name: 'hot_path_covering_indexes',
    sql: `
      create index if not exists idx_session_attendees_session on session_attendees(session_id);
      create index if not exists idx_assessment_items_assessment on assessment_items(assessment_id);
      create index if not exists idx_assessments_programme_child on assessments(programme_id, child_id);
      create index if not exists idx_sessions_programme_date on sessions(programme_id, session_date);
      create index if not exists idx_letter_mastery_user_child on letter_mastery(user_id, child_id);
      create index if not exists idx_child_group_memberships_group on child_group_memberships(group_id);
      create index if not exists idx_sync_outbox_ready on sync_outbox(status, next_retry_at);
      create index if not exists idx_time_entries_user_signin on time_entries(user_id, sign_in_time);
    `,
  },
```

`CURRENT_SCHEMA_VERSION` is derived from the array; nothing else to edit. Existing devices upgrade on next launch via the transactional `runMigrations` (`user_version` 4 to 5), and `if not exists` keeps it idempotent.

Deliberate scope limits (do not "improve" these during implementation): no ORDER BY suffix columns on the assessments/sessions indexes (per-child and per-day result sets are tens of rows; the in-memory sort is trivial and every extra index column taxes each capture write), and no `created_at` in the outbox index (with a range predicate on `next_retry_at` plus `IN` on `status`, SQLite cannot use one index to also satisfy `ORDER BY created_at`; the ready-set sort is unavoidable and cheap).

- [x] **Step 4: Run the new test, then both full suites (pin sweep)**

```bash
npx jest __tests__/hotPathIndexes.test.js --verbose
npx jest --silent
npm run test:integration
```

Expected: the new test PASSES, and two literal pins in `__tests__/sqliteFoundation.test.js` GO RED and need the v5 entry appended:

- ~line 163: `expect(migrations).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }]);` gains `, { version: 5 }`.
- ~line 594: the debug-dump `migrations` array gains `{ version: 5, name: 'hot_path_covering_indexes' }` after the version 4 entry.

Update both, re-run both suites, expect green. No other suite pins schema literals.

- [x] **Step 5: Log it**

Add one row to the verification table in `documentation/sqlite-refactor-log.md`: date, `migration v5 hot_path_covering_indexes`, unit + integration green, note that indexes are device-local only (no Supabase counterpart, contract map untouched).

- [x] **Step 6: Commit**

```bash
git add src/db/migrations.js __tests__/hotPathIndexes.test.js __tests__/sqliteFoundation.test.js documentation/sqlite-refactor-log.md
git commit -m "feat(db): add hot-path covering indexes (schema v5)"
```

---

### Task 5: CI workflow for unit + integration suites

No GitHub workflow runs any tests today; the schema-drift and colour guards only fire when someone remembers the local gate. Both suites are CI-friendly (unit ~19s, integration ~5s via better-sqlite3, no device or Docker). This lands last so CI's first run is green on the deflaked suite.

**Files:**
- Create: `.github/workflows/tests.yml`

**Interfaces:**
- Consumes: `npm test` (jest) and `npm run test:integration` from `package.json`; Node version from `.nvmrc`.
- Produces: a `tests` check on every PR and on pushes to main.

- [x] **Step 1: Create the workflow**

Create `.github/workflows/tests.yml`:

```yaml
name: tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: npm
      - run: npm ci
      - name: Unit suite
        run: npm test -- --silent --maxWorkers=2
      - name: Integration suite (file-backed SQLite)
        run: npm run test:integration
```

(`sqlite:staging:check` stays local-only; it needs a supabase login.)

- [x] **Step 2: Commit and push the branch**

```bash
git add .github/workflows/tests.yml
git commit -m "ci: run unit + integration suites on PRs and main"
git push -u origin improvement/p1-safety-net
```

- [x] **Step 3: Verify the run is green**

```bash
gh run list --branch improvement/p1-safety-net --limit 3
gh run watch $(gh run list --branch improvement/p1-safety-net --workflow tests --limit 1 --json databaseId --jq '.[0].databaseId')
```

Expected: the `tests` workflow completes with conclusion `success`. If `better-sqlite3` fails to build on the runner, add a `- run: npm rebuild better-sqlite3` step after `npm ci` and re-push.

- [x] **Step 4: Wrap up the phase**

Open a PR for `improvement/p1-safety-net` (repo convention; issues referenced as `(#N)` do not auto-close, so close any related issue manually after merge). Making `tests` a required status check is a repo-settings decision for Jim, not part of this plan.

---

## Self-review notes

- Spec coverage: roadmap Phase 1 lists items 7b, 7a, 4, 3, 5; Tasks 1, 5, 2, 3, 4 cover them respectively.
- Type consistency: `buildNavigation()` produces the `emitBeforeRemove` used in all Task 3 tests; `EXPECTED_INDEXES` names match the migration SQL one-for-one; `CURRENT_SCHEMA_VERSION` is derived, asserted as `5` only in the new test.
- Order dependency: only Task 1 before Task 5; noted in Architecture.

## Review round 1 (Codex adversarial review, 2026-07-04) — dispositions

- **R1 (Major, accepted):** Task 3 dirty predicate missed `sessionDate`, `sessionReadingLevel`, `childReadingLevels`, and treated empty tracker inner-objects as dirty. Fixed: full save-bearing predicate with `initialSessionDateRef`, plus a reading-level UI test. Per-field UI tests for the remaining Dialog pickers were judged low-value (pure boolean disjunction; wiring covered by two RTL-driven fields + the clean case).
- **R2 (Major, half accepted):** `idx_assessments_child` did not match `getAssessments`' real predicate (`programme_id` always present). Fixed to `idx_assessments_programme_child (programme_id, child_id)`; EXPLAIN tests added for assessments and letter_mastery. Rejected with reasoning: ORDER BY suffix columns and a `created_at` outbox index (see "Deliberate scope limits" in Task 4).
- **R3 (Minor, accepted):** `hotPathIndexes.test.js` leaked its db handle. Fixed with `afterEach(closeAsync)`, matching `sqliteFoundation.test.js`.
- **R4 (Minor, accepted):** `sqliteFoundation.test.js` pins the migration list at ~:163 and ~:594; the plan wrongly predicted a clean pass. Step 4 now names both pins with the exact updates; commit includes the file.
- **R5 (Minor, accepted):** No regression test for the intentional behavior change (refresh failure no longer masquerading as a failed write). Added as Task 1 Step 5.
- **R6 (Nit, rejected):** The em dash at the plan's Task 1 code block is a byte-identical quote of the existing source comment; rewriting it would desync the replacement block from the file. Constraint text now carries the exemption.

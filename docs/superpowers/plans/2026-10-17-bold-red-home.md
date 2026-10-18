# Bold Red Home Implementation Plan

> **For agentic workers:** this repo builds through Codex (`AGENTS.md` "When Building"; skill `codex-first`). Codex implements one task at a time; Claude reviews each task's diff and tests before the next starts, then runs `/codex:adversarial-review` on the finished branch. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark, seven-block Home with the approved Bold Red Home v2: a red hero with a sync icon, a state-aware clock row, a segmented session card, the week strip, and a blank-by-default attention area.

**Architecture:** Pure functions own the decisions (`homeAttention`, gauge geometry, goal copy), small presentational components own the drawing (`src/components/home/*`), and `TimeTrackingContext` owns the auto clock-out notice so it reaches Home the moment it is saved. One new repository method, `closeOpenTimeEntry`, makes both clock-out paths conditional on the row still being open. No schema, RLS, payload, or outbox-shape change.

**Tech Stack:** React Native 0.81 / Expo SDK 54, react-native-paper, react-native-svg 15.12.1, expo-sqlite (better-sqlite3 in integration tests), Jest 29 + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-10-17-bold-red-home-design.md` (approved after two Codex rounds). Read it before any task. Visual source: the "Home · Simplified (Red)" page of the Design Round 4 canvas, v2 block.

## Global Constraints

- Branch `feat/bold-red-home`. Commit after every task; never push without Jim.
- Run Jest with Node 20: prefix every test command with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Unit/screen tests: `npx jest <file>`. Integration tests (real SQLite) must be listed in `jest.integration.config.js` `testMatch` and run with `npm run test:integration -- <file>`.
- Colours: only existing `colors.*` tokens. `__tests__/colors.test.js` must stay unchanged and green. The one non-token value allowed is the attention-card border `rgba(34,26,27,0.12)` (decorative, local, per `documentation/design-system.md` "decorative one-off").
- Custom fonts on Android: set `fontFamily` to the weight-specific face and **never** set `fontWeight` alongside a custom family (Android silently falls back to the system font). Typography roles in Task 6 encode this.
- Font packages: `@expo-google-fonts/bricolage-grotesque@0.4.1` and `@expo-google-fonts/figtree@0.4.1` (both published 2025-09-12, exact pins), and `expo-font` via `npx expo install expo-font` (SDK-matched). Stay on npm and `package-lock.json`.
- Copy is verbatim from the spec. Curly apostrophes in user-visible strings (`’`).
- Every 44dp minimum touch target in the spec is a minimum, never a fixed height.
- Standing docs ship with the code that changes them (Task 11), per `AGENTS.md`.
- **Gate:** Task 6 (fonts) assumes Jim accepts the spec's open question 1 (Home on the new fonts, other screens later). If he chooses the whole-app switch instead, Task 6 grows; nothing else changes.

## Review Focus

1. **The morning after a forgotten clock-out.** The startup auto clock-out finishes *after* Home's first data load: the auto clock-out card must still appear, without navigation. Pinned in Task 4 (provider publishes after commit) and Task 10 (Home renders from provider state).
2. **Largest system font size.** The clock row stacks, card titles wrap, the sync badge stays readable; nothing clips. Pinned in Task 8 (badge multiplier) and Task 9 (clock row stacks when `fontScale > 1.3`).
3. **A brand-new EA with no children and no programme target.** No assessment card, the no-target gauge, the week strip of zeros, subtitle omitted when programme and school are both empty. Pinned in Task 5 and Task 10.
4. **A sync pass running while items need attention.** The attention card stays (it follows the count, not the transport state). Pinned in Task 5.
5. **Clock-out racing the 10-hour watchdog.** The automatic sign-out survives and the manual path says "You are not clocked in." Pinned in Task 4 with real SQLite.

---

### Task 1: Session History on Insights (already implemented — verify and commit)

Implemented earlier on this branch: `src/screens/main/InsightsScreen.js` gained a fourth entry, and `__tests__/InsightsScreen.test.js` pins it.

**Files:**
- Modify: `src/screens/main/InsightsScreen.js` (done)
- Test: `__tests__/InsightsScreen.test.js` (done)

- [ ] **Step 1: Run the tests**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/InsightsScreen.test.js __tests__/MainTabNavigator.test.js`
Expected: PASS (3 tests in InsightsScreen, MainTabNavigator green).

- [ ] **Step 2: Commit (only these two files; leave the unrelated `docs/superpowers/specs/2026-10-14-welaplus-release-1-design.md` modification and `design/login-screen-child.png` unstaged)**

```bash
git add src/screens/main/InsightsScreen.js __tests__/InsightsScreen.test.js
git commit -m "feat(insights): add Session History entry so history survives the Home redesign"
```

- [ ] **Step 3: Commit the spec and this plan**

```bash
git add docs/superpowers/specs/2026-10-17-bold-red-home-design.md docs/superpowers/plans/2026-10-17-bold-red-home.md
git commit -m "docs(home): Bold Red Home spec and plan"
```

---

### Task 2: `closeOpenTimeEntry` — one conditional close for both clock-out paths

**Files:**
- Modify: `src/db/repositories/timeEntriesRepository.js`
- Test: `__tests__/timeEntriesRepository.test.js` (already an integration test in `jest.integration.config.js`)

**Interfaces:**
- Produces: `timeEntriesRepository.closeOpenTimeEntry(id, closeFields, { onClosed, transaction } = {}) => Promise<boolean>`. Updates the row only while `sign_out_time is null`; enqueues the outbox mutation through the existing `enqueueTimeEntryOutbox` (keeps pending-insert coalescing); calls `await onClosed(txn, closedEntry)` inside the same transaction only when it closed the row; returns `true` if it closed the row, else `false`.

- [ ] **Step 1: Write the failing tests** (append inside the existing `describe('timeEntriesRepository', ...)`)

```js
  test('closeOpenTimeEntry closes an open row once and enqueues one mutation', async () => {
    const db = createBetterSqliteTestDatabase();
    try {
      await runMigrations(db);
      const repository = createTimeEntriesRepository({ database: db });
      await repository.saveTimeEntry(makeEntry({ id: 'time-1', synced: true, sync_status: 'synced' }));
      await db.runAsync('delete from sync_outbox');

      const first = await repository.closeOpenTimeEntry('time-1', {
        sign_out_time: '2026-05-21T18:00:00.000Z',
        sign_out_lat: null,
        sign_out_lon: null,
        auto_clocked_out: true,
      });
      const second = await repository.closeOpenTimeEntry('time-1', {
        sign_out_time: '2026-05-21T19:30:00.000Z',
        sign_out_lat: -34.2,
        sign_out_lon: 18.5,
      });

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(await repository.getTimeEntries()).toEqual([
        expect.objectContaining({
          id: 'time-1',
          sign_out_time: '2026-05-21T18:00:00.000Z',
          auto_clocked_out: true,
          sync_status: 'pending',
        }),
      ]);
      expect(await db.getAllAsync(
        "select operation from sync_outbox where table_name = 'time_entries'"
      )).toEqual([{ operation: 'update' }]);
    } finally {
      await db.closeAsync();
    }
  });

  test('closeOpenTimeEntry folds into a still-pending insert', async () => {
    const db = createBetterSqliteTestDatabase();
    try {
      await runMigrations(db);
      const repository = createTimeEntriesRepository({ database: db });
      await repository.saveTimeEntry(makeEntry({ id: 'time-1' })); // enqueues 'insert'

      await repository.closeOpenTimeEntry('time-1', { sign_out_time: '2026-05-21T12:00:00.000Z' });

      expect(await db.getAllAsync(
        "select operation from sync_outbox where table_name = 'time_entries' order by created_at"
      )).toEqual([{ operation: 'insert' }]);
    } finally {
      await db.closeAsync();
    }
  });

  test('closeOpenTimeEntry runs onClosed in the same transaction and rolls back if it throws', async () => {
    const db = createBetterSqliteTestDatabase();
    try {
      await runMigrations(db);
      const repository = createTimeEntriesRepository({ database: db });
      await repository.saveTimeEntry(makeEntry({ id: 'time-1' }));
      const seen = [];

      await expect(repository.closeOpenTimeEntry('time-1', {
        sign_out_time: '2026-05-21T12:00:00.000Z',
      }, {
        onClosed: async (txn, closed) => {
          seen.push(closed.id);
          await txn.runAsync(
            "insert into local_state (key, value, updated_at) values ('probe', '1', 'now')"
          );
          throw new Error('boom');
        },
      })).rejects.toBeDefined();

      expect(seen).toEqual(['time-1']);
      expect(await repository.getActiveTimeEntry('user-1')).toEqual(expect.objectContaining({ id: 'time-1' }));
      expect(await db.getFirstAsync("select key from local_state where key = 'probe'")).toBeNull();
    } finally {
      await db.closeAsync();
    }
  });

  test('closeOpenTimeEntry does not call onClosed when the row is already closed', async () => {
    const db = createBetterSqliteTestDatabase();
    try {
      await runMigrations(db);
      const repository = createTimeEntriesRepository({ database: db });
      await repository.saveTimeEntry(makeEntry({ id: 'time-1', sign_out_time: '2026-05-21T12:00:00.000Z' }));
      const onClosed = jest.fn();

      expect(await repository.closeOpenTimeEntry('time-1', { sign_out_time: 'x' }, { onClosed })).toBe(false);
      expect(onClosed).not.toHaveBeenCalled();
    } finally {
      await db.closeAsync();
    }
  });
```

Note: `rejects.toBeDefined()` is used deliberately; see memory "jest rejects.toThrow multi-file gotcha".

- [ ] **Step 2: Run to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- __tests__/timeEntriesRepository.test.js`
Expected: FAIL with `repository.closeOpenTimeEntry is not a function`.

- [ ] **Step 3: Implement** (add inside `createTimeEntriesRepository`, after `updateTimeEntry`, and add it to the returned object)

```js
  // Conditional close shared by manual and automatic clock-out. Updates the row
  // only while it is still open, so a stale snapshot (e.g. a manual clock-out
  // that waited on GPS while the 10-hour watchdog closed the entry) can never
  // overwrite the earlier close. onClosed runs in the same transaction, only on
  // success, so side records (the Home auto clock-out notice) commit or roll
  // back together with the close.
  const closeOpenTimeEntry = async (id, closeFields, { onClosed, transaction } = {}) => runWrite(
    transaction,
    async (txn) => {
      const existing = await txn.getFirstAsync(
        'select * from time_entries where id = ? and sign_out_time is null',
        id
      );
      if (!existing) {
        return false;
      }

      const next = normalizeForWrite({
        ...mapTimeEntry(existing),
        ...closeFields,
        id,
        updated_at: timestamp(),
        sync_status: syncStatusFromSynced(false),
        synced: false,
      });

      await upsertRecord(txn, {
        tableName: 'time_entries',
        columns: TIME_ENTRY_COLUMNS,
        booleanColumns: ['auto_clocked_out'],
        record: next,
      });
      await enqueueTimeEntryOutbox(txn, next);
      if (onClosed) {
        await onClosed(txn, next);
      }
      return true;
    }
  );
```

- [ ] **Step 4: Run to verify they pass**

Run: same as Step 2. Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/timeEntriesRepository.js __tests__/timeEntriesRepository.test.js
git commit -m "feat(time): conditional closeOpenTimeEntry for both clock-out paths"
```

---

### Task 3: `homeAttentionStore` — device-local notice and dismissal records

**Files:**
- Create: `src/constants/timeTracking.js`
- Create: `src/services/homeAttentionStore.js`
- Test: `__tests__/homeAttentionStore.integration.test.js` (add to `jest.integration.config.js` `testMatch`)

**Interfaces:**
- Produces:
  - `MAX_SHIFT_HOURS` (10) and `MAX_SHIFT_MS` from `src/constants/timeTracking.js`.
  - `AUTO_CLOCK_OUT_NOTICE_TTL_MS` (24h) from `homeAttentionStore.js`.
  - `createHomeAttentionStore({ database })` and default `homeAttentionStore` with:
    - `recordAutoClockOutNotice(txn, { entry, detectedAt }) => Promise<Notice>` where `Notice = { entryId, userId, signInTime, detectedAt, dismissedAt: null }`, stored under `home_attention.auto_clock_out.{entry.user_id}`.
    - `loadAutoClockOutNotice(userId) => Promise<Notice|null>`.
    - `dismissAutoClockOutNotice(userId, entryId, dismissedAt) => Promise<boolean>` (true only if the stored `entryId` matched).
    - `getAssessmentDismissedOn(userId) => Promise<string|null>` and `dismissAssessmentForDay(userId, localDate) => Promise<void>`, key `home_attention.assessment_due_dismissed_on.{userId}`.

- [ ] **Step 1: Create the constants file**

```js
// src/constants/timeTracking.js
// Shared by the time-tracking provider (auto clock-out) and the Home attention
// copy ("Clocked out after 10 hours"), so the number lives in one place.
export const MAX_SHIFT_HOURS = 10;
export const MAX_SHIFT_MS = MAX_SHIFT_HOURS * 60 * 60 * 1000;
```

- [ ] **Step 2: Write the failing test**

```js
// __tests__/homeAttentionStore.integration.test.js
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { runRepositoryTransaction } from '../src/db/repositories/repositoryRuntime';
import { createHomeAttentionStore } from '../src/services/homeAttentionStore';

const entry = { id: 'time-1', user_id: 'user-1', sign_in_time: '2026-10-14T06:00:00.000Z' };

describe('homeAttentionStore', () => {
  let db;
  let store;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    store = createHomeAttentionStore({ database: db });
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('records the notice under the entry owner and loads it back', async () => {
    const recorded = await runRepositoryTransaction(db, (txn) => store.recordAutoClockOutNotice(txn, {
      entry,
      detectedAt: '2026-10-15T05:30:00.000Z',
    }));

    expect(recorded).toEqual({
      entryId: 'time-1',
      userId: 'user-1',
      signInTime: '2026-10-14T06:00:00.000Z',
      detectedAt: '2026-10-15T05:30:00.000Z',
      dismissedAt: null,
    });
    expect(await store.loadAutoClockOutNotice('user-1')).toEqual(recorded);
    expect(await store.loadAutoClockOutNotice('user-2')).toBeNull();
    expect(await store.loadAutoClockOutNotice(null)).toBeNull();
  });

  test('dismiss only applies to the matching entry', async () => {
    await runRepositoryTransaction(db, (txn) => store.recordAutoClockOutNotice(txn, {
      entry: { ...entry, id: 'time-2' },
      detectedAt: '2026-10-15T05:30:00.000Z',
    }));

    expect(await store.dismissAutoClockOutNotice('user-1', 'time-1', '2026-10-15T07:00:00.000Z')).toBe(false);
    expect((await store.loadAutoClockOutNotice('user-1')).dismissedAt).toBeNull();

    expect(await store.dismissAutoClockOutNotice('user-1', 'time-2', '2026-10-15T07:00:00.000Z')).toBe(true);
    expect((await store.loadAutoClockOutNotice('user-1')).dismissedAt).toBe('2026-10-15T07:00:00.000Z');
  });

  test('assessment dismissal is stored per user as a local date', async () => {
    expect(await store.getAssessmentDismissedOn('user-1')).toBeNull();
    await store.dismissAssessmentForDay('user-1', '2026-10-17');
    expect(await store.getAssessmentDismissedOn('user-1')).toBe('2026-10-17');
    expect(await store.getAssessmentDismissedOn('user-2')).toBeNull();
  });
});
```

Add `'<rootDir>/__tests__/homeAttentionStore.integration.test.js',` to `testMatch` in `jest.integration.config.js`.

- [ ] **Step 3: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- __tests__/homeAttentionStore.integration.test.js`
Expected: FAIL with `Cannot find module '../src/services/homeAttentionStore'`.

- [ ] **Step 4: Implement**

```js
// src/services/homeAttentionStore.js
import { runRepositoryTransaction } from '../db/repositories/repositoryRuntime';
import { createLocalStateRepository } from '../db/repositories/localStateRepository';
import { decodeJson } from '../db/repositories/sqliteRepositoryUtils';

// Device-local Home attention records. Never synced. Keyed by user so one
// phone shared by two EAs keeps them apart; the auto clock-out key uses the
// time entry's own user_id so a late write can only land in its owner's slot.
export const AUTO_CLOCK_OUT_NOTICE_TTL_MS = 24 * 60 * 60 * 1000;

const autoClockOutKey = (userId) => `home_attention.auto_clock_out.${userId}`;
const assessmentDismissedKey = (userId) => `home_attention.assessment_due_dismissed_on.${userId}`;

export const createHomeAttentionStore = ({ database } = {}) => {
  const localState = createLocalStateRepository({ database });

  const recordAutoClockOutNotice = async (txn, { entry, detectedAt }) => {
    const notice = {
      entryId: entry.id,
      userId: entry.user_id,
      signInTime: entry.sign_in_time,
      detectedAt,
      dismissedAt: null,
    };
    await localState.set(autoClockOutKey(entry.user_id), notice, { transaction: txn });
    return notice;
  };

  const loadAutoClockOutNotice = async (userId) => {
    if (!userId) return null;
    return localState.get(autoClockOutKey(userId), null);
  };

  const dismissAutoClockOutNotice = (userId, entryId, dismissedAt) => runRepositoryTransaction(
    database,
    async (txn) => {
      const row = await txn.getFirstAsync(
        'select value from local_state where key = ?',
        autoClockOutKey(userId)
      );
      const current = row ? decodeJson(row.value, null) : null;
      if (!current || current.entryId !== entryId) {
        return false;
      }
      await localState.set(autoClockOutKey(userId), { ...current, dismissedAt }, { transaction: txn });
      return true;
    }
  );

  const getAssessmentDismissedOn = async (userId) => {
    if (!userId) return null;
    return localState.get(assessmentDismissedKey(userId), null);
  };

  const dismissAssessmentForDay = async (userId, localDate) => {
    await localState.set(assessmentDismissedKey(userId), localDate);
  };

  return {
    recordAutoClockOutNotice,
    loadAutoClockOutNotice,
    dismissAutoClockOutNotice,
    getAssessmentDismissedOn,
    dismissAssessmentForDay,
  };
};

export const homeAttentionStore = createHomeAttentionStore();
```

- [ ] **Step 5: Run to verify it passes**

Run: same as Step 3. Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/constants/timeTracking.js src/services/homeAttentionStore.js __tests__/homeAttentionStore.integration.test.js jest.integration.config.js
git commit -m "feat(home): device-local store for attention notices and dismissals"
```

---

### Task 4: Time tracking owns and publishes the auto clock-out notice

**Files:**
- Modify: `src/context/TimeTrackingContext.js`
- Test: `__tests__/useTimeTracking.integration.test.js` (already in `testMatch`)

**Interfaces:**
- Consumes: `closeOpenTimeEntry` (Task 2); `homeAttentionStore`, `MAX_SHIFT_HOURS`, `MAX_SHIFT_MS` (Task 3).
- Produces: `useTimeTracking()` additionally returns `autoClockOutNotice: Notice|null` and `dismissAutoClockOutNotice(entryId) => Promise<void>`.

- [ ] **Step 1: Write the failing tests** (append to `__tests__/useTimeTracking.integration.test.js`; add these imports at the top)

```js
import { createTimeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';
```

```js
const seedOpenEntry = async (signInTime) => {
  await createTimeEntriesRepository({ database: testDb }).saveTimeEntry({
    id: 'time-open',
    user_id: 'user-1',
    sign_in_time: signInTime,
    sign_in_lat: -33.9,
    sign_in_lon: 25.6,
    synced: true,
    sync_status: 'synced',
  });
};

test('startup auto clock-out records and publishes the notice with the detection time', async () => {
  const elevenHoursAgo = new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString();
  await seedOpenEntry(elevenHoursAgo);
  const before = Date.now();

  const { result } = renderHook(() => useTimeTracking(), { wrapper });

  await waitFor(() => expect(result.current.autoClockOutNotice).not.toBeNull());
  const notice = result.current.autoClockOutNotice;
  expect(notice).toEqual(expect.objectContaining({
    entryId: 'time-open',
    userId: 'user-1',
    signInTime: elevenHoursAgo,
    dismissedAt: null,
  }));
  // detectedAt is "now", not the computed sign-out time (sign-in + 10h, an hour ago).
  expect(Date.parse(notice.detectedAt)).toBeGreaterThanOrEqual(before);
  const row = await testDb.getFirstAsync("select auto_clocked_out, sign_out_time from time_entries where id = 'time-open'");
  expect(row.auto_clocked_out).toBe(1);
  expect(Date.parse(row.sign_out_time)).toBe(Date.parse(elevenHoursAgo) + 10 * 60 * 60 * 1000);
  expect(result.current.isSignedIn).toBe(false);
});

test('a manual clock-out that loses the race to the watchdog keeps the automatic close', async () => {
  const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
  await seedOpenEntry(nineHoursAgo);
  let releaseGps;
  mockGetCurrentPosition.mockImplementation(() => new Promise((resolve) => {
    releaseGps = () => resolve({ coords: { latitude: -33.9, longitude: 25.6 } });
  }));

  const { result } = renderHook(() => useTimeTracking(), { wrapper });
  await waitFor(() => expect(result.current.isSignedIn).toBe(true));

  let signOut;
  act(() => { signOut = result.current.handleSignOut(); });
  await waitFor(() => expect(releaseGps).toBeDefined());

  // The watchdog closes the entry while the manual path waits for GPS.
  await createTimeEntriesRepository({ database: testDb }).closeOpenTimeEntry('time-open', {
    sign_out_time: '2026-10-17T16:00:00.000Z',
    sign_out_lat: null,
    sign_out_lon: null,
    auto_clocked_out: true,
  });

  await act(async () => {
    releaseGps();
    await signOut;
  });

  const row = await testDb.getFirstAsync("select auto_clocked_out, sign_out_time from time_entries where id = 'time-open'");
  expect(row).toEqual({ auto_clocked_out: 1, sign_out_time: '2026-10-17T16:00:00.000Z' });
  expect(result.current.snackbarMessage).toBe('You are not clocked in.');
  expect(result.current.isSignedIn).toBe(false);
});

test('dismissing the notice clears it from provider state', async () => {
  await seedOpenEntry(new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString());
  const { result } = renderHook(() => useTimeTracking(), { wrapper });
  await waitFor(() => expect(result.current.autoClockOutNotice).not.toBeNull());

  await act(async () => {
    await result.current.dismissAutoClockOutNotice('time-open');
  });

  expect(result.current.autoClockOutNotice.dismissedAt).toEqual(expect.any(String));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration -- __tests__/useTimeTracking.integration.test.js`
Expected: FAIL (`autoClockOutNotice` undefined; manual path overwrites the automatic close).

- [ ] **Step 3: Implement** in `src/context/TimeTrackingContext.js`

1. Replace the local constants with imports:

```js
import { MAX_SHIFT_HOURS, MAX_SHIFT_MS } from '../constants/timeTracking';
import { homeAttentionStore } from '../services/homeAttentionStore';
```

and delete `const MAX_SHIFT_HOURS = 10;` and `const MAX_SHIFT_MS = ...`.

2. Add state next to the others:

```js
  const [autoClockOutNotice, setAutoClockOutNotice] = useState(null);
```

3. Replace `autoClockOut` with:

```js
  const autoClockOut = useCallback(async (entry) => {
    const signInMs = new Date(entry.sign_in_time).getTime();
    const signOutTime = new Date(signInMs + MAX_SHIFT_MS).toISOString();
    const detectedAt = new Date().toISOString();
    let notice = null;

    const closed = await timeEntriesRepository.closeOpenTimeEntry(entry.id, {
      sign_out_time: signOutTime,
      sign_out_lat: null,
      sign_out_lon: null,
      auto_clocked_out: true,
    }, {
      onClosed: async (txn, closedEntry) => {
        notice = await homeAttentionStore.recordAutoClockOutNotice(txn, {
          entry: closedEntry,
          detectedAt,
        });
      },
    });

    setActiveEntryState(null);
    setSignedInState(false);
    if (!closed) return; // already closed by another path or an earlier attempt

    if (notice && notice.userId === userRef.current?.id) {
      setAutoClockOutNotice(notice);
    }
    await refreshSyncStatus();
    triggerBackgroundSync?.();
    showSnackbar(`Auto clocked out after ${MAX_SHIFT_HOURS} hours.`);
  }, [refreshSyncStatus, triggerBackgroundSync, showSnackbar, setActiveEntryState, setSignedInState]);
```

4. Load the notice whenever the user changes (add below the existing `loadActiveEntry` effect):

```js
  useEffect(() => {
    let cancelled = false;
    const userId = user?.id || null;
    setAutoClockOutNotice(null);
    if (!userId) return undefined;
    homeAttentionStore.loadAutoClockOutNotice(userId)
      .then((notice) => {
        if (!cancelled && userRef.current?.id === userId) setAutoClockOutNotice(notice);
      })
      .catch((error) => console.error('Error loading auto clock-out notice:', error));
    return () => { cancelled = true; };
  }, [user?.id]);
```

Order matters on startup: this load can finish after `autoClockOut` published. Guard by only replacing a newer in-memory notice when the loaded one is not older:

```js
      .then((notice) => {
        if (cancelled || userRef.current?.id !== userId) return;
        setAutoClockOutNotice((current) => (
          current && notice && Date.parse(current.detectedAt) > Date.parse(notice.detectedAt)
            ? current
            : (notice || current)
        ));
      })
```

(Use this second form; it replaces the `.then` above.)

5. In `handleSignOut`, replace the `updatedEntry` / `updateTimeEntry` block with:

```js
      const closed = await timeEntriesRepository.closeOpenTimeEntry(current.id, {
        sign_out_time: signOutTime,
        sign_out_lat: latitude,
        sign_out_lon: longitude,
      });
      setActiveEntryState(null);
      setSignedInState(false);
      if (!closed) {
        showSnackbar('You are not clocked in.');
        return;
      }
      await refreshSyncStatus();
      triggerBackgroundSync?.();
      showSnackbar(`Clocked out. ${hoursWorked} hours worked.`);
```

6. Add the dismiss callback:

```js
  const dismissAutoClockOutNotice = useCallback(async (entryId) => {
    const userId = userRef.current?.id;
    if (!userId) return;
    try {
      await homeAttentionStore.dismissAutoClockOutNotice(userId, entryId, new Date().toISOString());
      const fresh = await homeAttentionStore.loadAutoClockOutNotice(userId);
      if (userRef.current?.id === userId) setAutoClockOutNotice(fresh);
    } catch (error) {
      console.error('Error dismissing auto clock-out notice:', error);
    }
  }, []);
```

7. Add `autoClockOutNotice` and `dismissAutoClockOutNotice` to the returned `useMemo` object and its dependency list.

- [ ] **Step 4: Run to verify they pass**

Run: same as Step 2. Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Run the screen tests that mock time tracking**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/HomeScreen.test.js __tests__/TimeTrackingScreen.test.js`
Expected: PASS (unchanged behaviour for them; skip the second file if it does not exist).

- [ ] **Step 6: Commit**

```bash
git add src/context/TimeTrackingContext.js __tests__/useTimeTracking.integration.test.js
git commit -m "feat(time): conditional clock-out; provider records and publishes the auto clock-out notice"
```

---

### Task 5: `deriveHomeAttentionItems` — the attention rules as a pure function

**Files:**
- Create: `src/utils/homeAttention.js`
- Test: `__tests__/homeAttention.test.js`

**Interfaces:**
- Consumes: `MAX_SHIFT_HOURS` (Task 3), `AUTO_CLOCK_OUT_NOTICE_TTL_MS` (Task 3), `toLocalDateString`, `formatDisplayDate` (`src/utils/localDate.js`).
- Produces: `deriveHomeAttentionItems({ needsAttentionCount, autoClockOut, coverage, assessmentDismissedOn, now }) => AttentionItem[]` (length 0–2) with `AttentionItem = { key, kind, tone, title, subtitle, accessibilityLabel, route, dismissible, entryId? }`; `kind ∈ 'sync_attention' | 'auto_clock_out' | 'assessment_due'`; `tone ∈ 'warning' | 'neutral'`. Also `MAX_ATTENTION_ITEMS = 2`.

- [ ] **Step 1: Write the failing tests**

```js
// __tests__/homeAttention.test.js
import { deriveHomeAttentionItems, MAX_ATTENTION_ITEMS } from '../src/utils/homeAttention';

const NOW = new Date('2026-10-15T08:00:00.000Z'); // Thu 15 Oct, 10:00 SAST

const notice = (overrides = {}) => ({
  entryId: 'time-1',
  userId: 'user-1',
  signInTime: '2026-10-14T05:30:00.000Z', // Wed in SAST
  detectedAt: '2026-10-15T06:00:00.000Z',
  dismissedAt: null,
  ...overrides,
});

const base = {
  needsAttentionCount: 0,
  autoClockOut: null,
  coverage: { assessed: 12, total: 12 },
  assessmentDismissedOn: null,
  now: NOW,
};

describe('deriveHomeAttentionItems', () => {
  test('a normal day has no items', () => {
    expect(deriveHomeAttentionItems(base)).toEqual([]);
  });

  test('sync attention uses the generic count wording and ignores transport state', () => {
    expect(deriveHomeAttentionItems({ ...base, needsAttentionCount: 1 })[0]).toEqual(expect.objectContaining({
      kind: 'sync_attention',
      tone: 'warning',
      title: '1 item needs attention',
      subtitle: 'Open sync status to sort it out',
      accessibilityLabel: '1 item needs attention. Open sync status to sort it out',
      route: 'SyncStatus',
      dismissible: false,
    }));
    expect(deriveHomeAttentionItems({ ...base, needsAttentionCount: 3 })[0].title).toBe('3 items need attention');
  });

  test('auto clock-out shows the weekday, or Today, and expires after 24 hours', () => {
    const [wed] = deriveHomeAttentionItems({ ...base, autoClockOut: notice() });
    expect(wed).toEqual(expect.objectContaining({
      kind: 'auto_clock_out',
      tone: 'warning',
      title: 'Clocked out after 10 hours',
      subtitle: 'Automatic · Wed · check hours',
      route: 'TimeEntriesList',
      dismissible: true,
      entryId: 'time-1',
    }));

    const [today] = deriveHomeAttentionItems({
      ...base,
      autoClockOut: notice({ signInTime: '2026-10-15T04:00:00.000Z' }),
    });
    expect(today.subtitle).toBe('Automatic · Today · check hours');

    const justInside = new Date(Date.parse('2026-10-15T06:00:00.000Z') + 24 * 3600 * 1000 - 1);
    const atExpiry = new Date(Date.parse('2026-10-15T06:00:00.000Z') + 24 * 3600 * 1000);
    expect(deriveHomeAttentionItems({ ...base, autoClockOut: notice(), now: justInside })).toHaveLength(1);
    expect(deriveHomeAttentionItems({ ...base, autoClockOut: notice(), now: atExpiry })).toEqual([]);
  });

  test('a dismissed auto clock-out notice does not show', () => {
    expect(deriveHomeAttentionItems({
      ...base,
      autoClockOut: notice({ dismissedAt: '2026-10-15T07:00:00.000Z' }),
    })).toEqual([]);
  });

  test('assessment due: plurals, the sub-line, and per-day dismissal', () => {
    const [one] = deriveHomeAttentionItems({ ...base, coverage: { assessed: 11, total: 12 } });
    expect(one).toEqual(expect.objectContaining({
      kind: 'assessment_due',
      tone: 'neutral',
      title: '1 child to assess',
      subtitle: '11 of 12 children assessed',
      route: 'Assessments',
      dismissible: true,
    }));
    expect(deriveHomeAttentionItems({ ...base, coverage: { assessed: 9, total: 12 } })[0].title)
      .toBe('3 children to assess');
    expect(deriveHomeAttentionItems({
      ...base, coverage: { assessed: 11, total: 12 }, assessmentDismissedOn: '2026-10-15',
    })).toEqual([]);
    expect(deriveHomeAttentionItems({
      ...base, coverage: { assessed: 11, total: 12 }, assessmentDismissedOn: '2026-10-14',
    })).toHaveLength(1);
  });

  test('no assessment card while coverage is loading or the roster is empty', () => {
    expect(deriveHomeAttentionItems({ ...base, coverage: null })).toEqual([]);
    expect(deriveHomeAttentionItems({ ...base, coverage: { assessed: 0, total: 0 } })).toEqual([]);
  });

  test('priority order and the two-item cap', () => {
    const items = deriveHomeAttentionItems({
      ...base,
      needsAttentionCount: 2,
      autoClockOut: notice(),
      coverage: { assessed: 11, total: 12 },
    });
    expect(MAX_ATTENTION_ITEMS).toBe(2);
    expect(items.map((item) => item.kind)).toEqual(['sync_attention', 'auto_clock_out']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/homeAttention.test.js`
Expected: FAIL with `Cannot find module '../src/utils/homeAttention'`.

- [ ] **Step 3: Implement**

```js
// src/utils/homeAttention.js
import { MAX_SHIFT_HOURS } from '../constants/timeTracking';
import { AUTO_CLOCK_OUT_NOTICE_TTL_MS } from '../services/homeAttentionStore';
import { formatDisplayDate, toLocalDateString } from './localDate';

// Home's attention area: blank by default, at most two cards, highest priority
// first. Every rule lives here so Home only renders what this returns.
export const MAX_ATTENTION_ITEMS = 2;

const plural = (count, singular, pluralForm) => (count === 1 ? singular : pluralForm);

const syncAttentionItem = (count) => {
  const title = `${count} ${plural(count, 'item needs', 'items need')} attention`;
  const subtitle = 'Open sync status to sort it out';
  return {
    key: 'sync_attention',
    kind: 'sync_attention',
    tone: 'warning',
    title,
    subtitle,
    accessibilityLabel: `${title}. ${subtitle}`,
    route: 'SyncStatus',
    dismissible: false,
  };
};

const autoClockOutItem = (notice, now) => {
  const sameDay = toLocalDateString(notice.signInTime) === toLocalDateString(now);
  const day = sameDay ? 'Today' : formatDisplayDate(notice.signInTime, { weekday: 'short' });
  const title = `Clocked out after ${MAX_SHIFT_HOURS} hours`;
  return {
    key: `auto_clock_out:${notice.entryId}`,
    kind: 'auto_clock_out',
    tone: 'warning',
    title,
    subtitle: `Automatic · ${day} · check hours`,
    accessibilityLabel: `Clocked out automatically after ${MAX_SHIFT_HOURS} hours, ${day}. Check your hours`,
    route: 'TimeEntriesList',
    dismissible: true,
    entryId: notice.entryId,
  };
};

const assessmentDueItem = ({ assessed, total }) => {
  const remaining = total - assessed;
  const title = `${remaining} ${plural(remaining, 'child', 'children')} to assess`;
  const subtitle = `${assessed} of ${total} children assessed`;
  return {
    key: 'assessment_due',
    kind: 'assessment_due',
    tone: 'neutral',
    title,
    subtitle,
    accessibilityLabel: `${title}. ${subtitle}. Open Assess`,
    route: 'Assessments',
    dismissible: true,
  };
};

const isNoticeVisible = (notice, now) => {
  if (!notice || notice.dismissedAt) return false;
  const age = now.getTime() - Date.parse(notice.detectedAt);
  return Number.isFinite(age) && age < AUTO_CLOCK_OUT_NOTICE_TTL_MS;
};

export function deriveHomeAttentionItems({
  needsAttentionCount = 0,
  autoClockOut = null,
  coverage = null,
  assessmentDismissedOn = null,
  now = new Date(),
} = {}) {
  const items = [];

  if (needsAttentionCount > 0) {
    items.push(syncAttentionItem(needsAttentionCount));
  }
  if (isNoticeVisible(autoClockOut, now)) {
    items.push(autoClockOutItem(autoClockOut, now));
  }
  if (
    coverage
    && coverage.total > 0
    && coverage.total - coverage.assessed > 0
    && assessmentDismissedOn !== toLocalDateString(now)
  ) {
    items.push(assessmentDueItem(coverage));
  }

  return items.slice(0, MAX_ATTENTION_ITEMS);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: same as Step 2. Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/homeAttention.js __tests__/homeAttention.test.js
git commit -m "feat(home): attention rules as a pure function"
```

---

### Task 6: Fonts and typography roles

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm/expo commands)
- Modify: `App.js`
- Modify: `src/constants/typography.js`
- Test: `__tests__/typography.test.js` (create)

**Interfaces:**
- Produces: `fontFamilies` and `typeRoles` exported from `src/constants/typography.js`:
  `typeRoles.displayXL`, `displayNumeral`, `displayM`, `textBody`, `textBodyStrong`, `textCaption`, `textLabel`, `textButton`. Each role has `fontFamily`, `fontSize`, `lineHeight`; none has `fontWeight`.

- [ ] **Step 1: Install** (confirm each version's publish date is more than 24 hours old with `npm view <pkg> time`)

```bash
npx expo install expo-font expo-splash-screen
npm install --save-exact @expo-google-fonts/bricolage-grotesque@0.4.1 @expo-google-fonts/figtree@0.4.1
```

`expo-splash-screen` is a native module: the next device test needs a fresh EAS build (Task 12),
not an over-the-air update.

- [ ] **Step 2: Write the failing test**

```js
// __tests__/typography.test.js
import { fontFamilies, typeRoles, typography } from '../src/constants/typography';

describe('typography roles', () => {
  test('every new role uses a weight-specific custom face and never sets fontWeight', () => {
    for (const [name, role] of Object.entries(typeRoles)) {
      expect({ name, family: Object.values(fontFamilies).includes(role.fontFamily) })
        .toEqual({ name, family: true });
      expect({ name, fontWeight: role.fontWeight }).toEqual({ name, fontWeight: undefined });
      expect(role.fontSize).toBeGreaterThanOrEqual(11);
      expect(role.lineHeight).toBeGreaterThanOrEqual(role.fontSize);
    }
  });

  test('the legacy roles are untouched', () => {
    expect(typography.screenTitle).toEqual(expect.objectContaining({ fontSize: 26, fontWeight: '800' }));
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/typography.test.js`
Expected: FAIL (`typeRoles` undefined).

- [ ] **Step 4: Implement** — append to `src/constants/typography.js`:

```js
// Bold Red type roles (Home first; other screens adopt them as they are
// redesigned). Android rule: a custom family is chosen per weight, so roles set
// the weight-specific face and never fontWeight (fontWeight + custom family
// makes Android fall back to the system font).
export const fontFamilies = {
  display: 'BricolageGrotesque_800ExtraBold',
  textMedium: 'Figtree_500Medium',
  textBold: 'Figtree_700Bold',
  textHeavy: 'Figtree_800ExtraBold',
};

export const typeRoles = {
  displayXL: { fontFamily: fontFamilies.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.8 },
  displayNumeral: { fontFamily: fontFamilies.display, fontSize: 48, lineHeight: 48 },
  displayM: { fontFamily: fontFamilies.display, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
  textBody: { fontFamily: fontFamilies.textMedium, fontSize: 15, lineHeight: 20 },
  textBodyStrong: { fontFamily: fontFamilies.textBold, fontSize: 15, lineHeight: 20 },
  textCaption: { fontFamily: fontFamilies.textMedium, fontSize: 13, lineHeight: 18 },
  textLabel: {
    fontFamily: fontFamilies.textHeavy, fontSize: 11, lineHeight: 14, letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  textButton: { fontFamily: fontFamilies.textHeavy, fontSize: 15, lineHeight: 20 },
};
```

- [ ] **Step 5: Load the fonts at the app root.** In `App.js`, add imports:

```js
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Figtree_500Medium, Figtree_700Bold, Figtree_800ExtraBold } from '@expo-google-fonts/figtree';

// Keep the native splash up until the fonts settle, so a cold start never shows
// an empty root. Called at module scope, before the first render.
SplashScreen.preventAutoHideAsync().catch(() => {});
```

and at the top of `export function App()` (`useEffect` is already imported from React there, or add it):

```js
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_800ExtraBold,
    Figtree_500Medium,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });
  const fontsSettled = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (!fontsSettled) return;
    // Never block the app on a failure: with fontError set, text falls back
    // to the system font.
    if (fontError) console.error('Font load failed; using system font:', fontError);
    SplashScreen.hideAsync().catch(() => {});
  }, [fontsSettled, fontError]);

  if (!fontsSettled) {
    return null; // the native splash is still showing
  }
```

- [ ] **Step 6: Run the test and the App test**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/typography.test.js __tests__/App.plan5.test.js`
Expected: PASS. If `App.plan5.test.js` renders `App`, add to that test file:

```js
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));
```

and add one test there that the splash is released when fonts fail: mock `useFonts` to return
`[false, new Error('x')]`, render `App`, and expect `hideAsync` to have been called.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json App.js src/constants/typography.js __tests__/typography.test.js __tests__/App.plan5.test.js
git commit -m "feat(type): Bricolage Grotesque + Figtree and Bold Red type roles"
```

---

### Task 7: `SegmentedSessionGauge` and shared gauge state

**Files:**
- Create: `src/utils/sessionGoalPresentation.js`
- Create: `src/components/home/sessionGaugeGeometry.js`
- Create: `src/components/home/SegmentedSessionGauge.js`
- Modify: `src/components/sessions/SessionsTodayGauge.js` (use the shared colour and label functions)
- Modify: `src/screens/main/HomeScreen.js` (remove its local `getGoalCopy`; import it)
- Test: `__tests__/sessionGaugeGeometry.test.js`, `__tests__/SegmentedSessionGauge.test.js`

**Interfaces:**
- Produces:
  - `getGaugeColor(goal) => string`, `getGaugeAccessibilityLabel(goal) => string`, `getGoalCopy(goal, isSignedIn) => { title, subtitle } | null` from `src/utils/sessionGoalPresentation.js` (`getGoalCopy` moved verbatim from `HomeScreen.js:42-75`).
  - `buildGaugeGeometry(goal) => { arcs: [{ d, color }], startDot: { color }, endDot: { color } }` and constants `GAUGE = { width: 176, height: 97, cx: 88, cy: 88, r: 79.5, stroke: 16, gapDeg: 5, maxSegments: 6 }`.
  - `<SegmentedSessionGauge goal={goal} />`.

- [ ] **Step 1: Write the failing geometry test**

```js
// __tests__/sessionGaugeGeometry.test.js
import { buildGaugeGeometry } from '../src/components/home/sessionGaugeGeometry';
import { colors } from '../src/constants/colors';

describe('buildGaugeGeometry', () => {
  test('three segments with 5 degree gaps match the canvas paths', () => {
    const g = buildGaugeGeometry({ target: 3, count: 2, ceiling: 5, state: 'below' });
    expect(g.arcs.map((arc) => arc.d)).toEqual([
      'M 8.50 88.00 A 79.5 79.5 0 0 1 44.31 21.58',
      'M 50.27 18.02 A 79.5 79.5 0 0 1 125.73 18.02',
      'M 131.69 21.58 A 79.5 79.5 0 0 1 167.50 88.00',
    ]);
    expect(g.arcs.map((arc) => arc.color)).toEqual([colors.primary, colors.primary, colors.border]);
    expect(g.startDot.color).toBe(colors.primary);
    expect(g.endDot.color).toBe(colors.border);
  });

  test('zero sessions: all track, neutral start dot', () => {
    const g = buildGaugeGeometry({ target: 3, count: 0, state: 'below' });
    expect(g.arcs.map((arc) => arc.color)).toEqual([colors.border, colors.border, colors.border]);
    expect(g.startDot.color).toBe(colors.ringNeutral);
  });

  test('one session uses ringStart', () => {
    const g = buildGaugeGeometry({ target: 3, count: 1, state: 'below' });
    expect(g.arcs[0].color).toBe(colors.ringStart);
  });

  test('met is all green, exceeded all amber', () => {
    expect(new Set(buildGaugeGeometry({ target: 3, count: 3, state: 'met' }).arcs.map((a) => a.color)))
      .toEqual(new Set([colors.success]));
    const ex = buildGaugeGeometry({ target: 3, count: 6, ceiling: 5, state: 'exceeded' });
    expect(new Set(ex.arcs.map((a) => a.color))).toEqual(new Set([colors.accent]));
    expect(ex.endDot.color).toBe(colors.accent);
  });

  test('no target is one continuous neutral arc', () => {
    const g = buildGaugeGeometry({ target: null, count: 2, state: 'no_target' });
    expect(g.arcs).toEqual([{ d: 'M 8.50 88.00 A 79.5 79.5 0 0 1 167.50 88.00', color: colors.ringNeutral }]);
    expect(g.startDot.color).toBe(colors.ringNeutral);
    expect(g.endDot.color).toBe(colors.ringNeutral);
  });

  test('targets above 6 fall back to a continuous filled arc', () => {
    const g = buildGaugeGeometry({ target: 8, count: 4, state: 'below' });
    expect(g.arcs).toHaveLength(2);
    expect(g.arcs[0]).toEqual({ d: 'M 8.50 88.00 A 79.5 79.5 0 0 1 167.50 88.00', color: colors.border });
    expect(g.arcs[1].color).toBe(colors.primary);
    expect(g.arcs[1].d).toBe('M 8.50 88.00 A 79.5 79.5 0 0 1 88.00 8.50');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/sessionGaugeGeometry.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the shared presentation module**

```js
// src/utils/sessionGoalPresentation.js
import { colors } from '../constants/colors';

// Locked R3 colour rule, shared by every session gauge.
export function getGaugeColor({ state, count }) {
  switch (state) {
    case 'met': return colors.success;
    case 'exceeded': return colors.accent;
    case 'no_target': return colors.ringNeutral;
    default:
      if (count <= 0) return colors.ringNeutral;
      if (count === 1) return colors.ringStart;
      return colors.primary;
  }
}

export function getGaugeAccessibilityLabel({ state, count, target, ceiling }) {
  switch (state) {
    case 'met': return `${count} of ${target} sessions today. Goal met.`;
    case 'exceeded': return `${count} sessions today. Above the usual maximum of ${ceiling}.`;
    case 'no_target': return `${count} sessions today.`;
    default: return `${count} of ${target} sessions today. Below target.`;
  }
}

// Moved verbatim from HomeScreen.js.
export const getGoalCopy = (goal, isSignedIn) => {
  if (!goal) return null;
  if (goal.state === 'no_target') {
    return {
      title: goal.count + ' ' + (goal.count === 1 ? 'session' : 'sessions') + ' today',
      subtitle: 'This programme has no daily target.',
    };
  }
  if (goal.count === 0) {
    return {
      title: 'No sessions yet today',
      subtitle: isSignedIn ? 'Record your first session.' : 'Clock in to start your day.',
    };
  }
  if (goal.state === 'exceeded') {
    return {
      title: goal.count + ' sessions today',
      subtitle: 'Above the usual maximum of ' + goal.ceiling + '.',
    };
  }
  if (goal.state === 'met') {
    return {
      title: goal.count + ' of ' + goal.target + ' sessions today',
      subtitle: 'Daily target reached.',
    };
  }
  const remaining = goal.target - goal.count;
  return {
    title: goal.count + ' of ' + goal.target + ' sessions today',
    subtitle: remaining === 1
      ? 'One more pair reaches your target.'
      : remaining + ' more pairs reach your target.',
  };
};
```

In `src/components/sessions/SessionsTodayGauge.js`, replace `STATE_CONFIG` usage with `getGaugeColor(goal)` and `getGaugeAccessibilityLabel(goal)` (delete `STATE_CONFIG`). In `HomeScreen.js`, delete the local `getGoalCopy` and import it from `../../utils/sessionGoalPresentation`.

- [ ] **Step 4: Implement the geometry**

```js
// src/components/home/sessionGaugeGeometry.js
import { colors } from '../../constants/colors';
import { getGaugeColor } from '../../utils/sessionGoalPresentation';

export const GAUGE = { width: 176, height: 97, cx: 88, cy: 88, r: 79.5, stroke: 16, gapDeg: 5, maxSegments: 6 };

const fmt = (n) => n.toFixed(2);
const point = (deg) => {
  const rad = (deg * Math.PI) / 180;
  return [GAUGE.cx + GAUGE.r * Math.cos(rad), GAUGE.cy - GAUGE.r * Math.sin(rad)];
};
// From the larger angle to the smaller one, i.e. left to right over the top.
const arcPath = (fromDeg, toDeg) => {
  const [x1, y1] = point(fromDeg);
  const [x2, y2] = point(toDeg);
  return `M ${fmt(x1)} ${fmt(y1)} A ${GAUGE.r} ${GAUGE.r} 0 0 1 ${fmt(x2)} ${fmt(y2)}`;
};

export function buildGaugeGeometry(goal) {
  const { state, count = 0, target } = goal;
  const color = getGaugeColor(goal);

  if (state === 'no_target' || !target) {
    return {
      arcs: [{ d: arcPath(180, 0), color: colors.ringNeutral }],
      startDot: { color: colors.ringNeutral },
      endDot: { color: colors.ringNeutral },
    };
  }

  const full = state === 'met' || state === 'exceeded';

  if (target > GAUGE.maxSegments) {
    const fraction = full ? 1 : Math.min(Math.max(count, 0) / target, 1);
    const arcs = [{ d: arcPath(180, 0), color: colors.border }];
    if (fraction > 0) arcs.push({ d: arcPath(180, 180 - 180 * fraction), color });
    return {
      arcs,
      startDot: { color: count > 0 ? color : colors.ringNeutral },
      endDot: { color: fraction >= 1 ? color : colors.border },
    };
  }

  const span = (180 - GAUGE.gapDeg * (target - 1)) / target;
  const filled = full ? target : Math.min(Math.max(count, 0), target);
  const arcs = Array.from({ length: target }, (_, i) => {
    const from = 180 - i * (span + GAUGE.gapDeg);
    return { d: arcPath(from, from - span), color: i < filled ? color : colors.border };
  });
  return {
    arcs,
    startDot: { color: filled > 0 ? arcs[0].color : colors.ringNeutral },
    endDot: { color: arcs[arcs.length - 1].color },
  };
}
```

- [ ] **Step 5: Run the geometry test** — Expected: PASS (6 tests). Fix only rounding in `fmt` if a path differs in the last digit.

- [ ] **Step 6: Write the failing component test**

```js
// __tests__/SegmentedSessionGauge.test.js
import React from 'react';
import { render } from '@testing-library/react-native';
import SegmentedSessionGauge from '../src/components/home/SegmentedSessionGauge';

describe('SegmentedSessionGauge', () => {
  test('is one accessible image with the shared label and shows the suffix below target', () => {
    const screen = render(<SegmentedSessionGauge goal={{ target: 3, count: 2, ceiling: 5, state: 'below' }} />);
    expect(screen.getByLabelText('2 of 3 sessions today. Below target.')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('/3')).toBeTruthy();
  });

  test('no suffix when exceeded or without a target', () => {
    const exceeded = render(<SegmentedSessionGauge goal={{ target: 3, count: 6, ceiling: 5, state: 'exceeded' }} />);
    expect(exceeded.queryByText('/3')).toBeNull();
    const none = render(<SegmentedSessionGauge goal={{ target: null, count: 2, state: 'no_target' }} />);
    expect(none.queryByText(/\//)).toBeNull();
  });
});
```

- [ ] **Step 7: Implement the component**

```js
// src/components/home/SegmentedSessionGauge.js
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { getGaugeAccessibilityLabel } from '../../utils/sessionGoalPresentation';
import { buildGaugeGeometry, GAUGE } from './sessionGaugeGeometry';

export default function SegmentedSessionGauge({ goal }) {
  const { arcs, startDot, endDot } = buildGaugeGeometry(goal);
  const showSuffix = goal.state === 'below' || goal.state === 'met';
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={getGaugeAccessibilityLabel(goal)}
      style={styles.wrap}
    >
      <Svg width={GAUGE.width} height={GAUGE.height} viewBox={`0 0 ${GAUGE.width} ${GAUGE.height}`}>
        {arcs.map((arc) => (
          <Path key={arc.d + arc.color} d={arc.d} stroke={arc.color} strokeWidth={GAUGE.stroke} fill="none" />
        ))}
        <Circle cx={8.5} cy={GAUGE.cy} r={GAUGE.stroke / 2} fill={startDot.color} />
        <Circle cx={GAUGE.width - 8.5} cy={GAUGE.cy} r={GAUGE.stroke / 2} fill={endDot.color} />
      </Svg>
      <View style={styles.numeralRow} pointerEvents="none">
        <Text
          maxFontSizeMultiplier={1.2}
          style={[styles.numeral, goal.count === 0 ? styles.numeralMuted : null]}
        >
          {goal.count}
        </Text>
        {showSuffix ? (
          <View style={styles.suffixAnchor}>
            <Text maxFontSizeMultiplier={1.2} style={styles.suffix}>{'/' + goal.target}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: GAUGE.width, height: GAUGE.height },
  numeralRow: {
    position: 'absolute', left: 0, right: 0, bottom: 2,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end',
  },
  numeral: { ...typeRoles.displayNumeral, color: colors.text, fontVariant: ['tabular-nums'] },
  numeralMuted: { color: colors.textSecondary },
  // Zero-width anchor: "/3" hangs off the numeral's right edge without
  // shifting the numeral off the gauge's centre line.
  suffixAnchor: { width: 0, overflow: 'visible' },
  suffix: {
    ...typeRoles.textBodyStrong, fontSize: 17, lineHeight: 22, color: colors.textSecondary,
    width: 40, marginLeft: 2, marginBottom: 4,
  },
});
```

- [ ] **Step 8: Run all affected tests**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/sessionGaugeGeometry.test.js __tests__/SegmentedSessionGauge.test.js __tests__/HomeScreen.test.js $(ls __tests__ | grep -i SessionsTodayGauge | sed 's#^#__tests__/#')`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/utils/sessionGoalPresentation.js src/components/home/ src/components/sessions/SessionsTodayGauge.js src/screens/main/HomeScreen.js __tests__/sessionGaugeGeometry.test.js __tests__/SegmentedSessionGauge.test.js
git commit -m "feat(home): segmented session gauge with the shared R3 colour rule"
```

---

### Task 8: Hero variant of `SyncIndicator`

**Files:**
- Modify: `src/components/common/SyncIndicator.js`
- Test: `__tests__/SyncIndicator.hero.test.js` (create)

**Interfaces:**
- Produces: `<SyncIndicator variant="hero" onPress={fn} />`. The default variant (stack headers) is byte-for-byte unchanged in behaviour.

- [ ] **Step 1: Write the failing test**

```js
// __tests__/SyncIndicator.hero.test.js
const mockUseOffline = jest.fn();
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }) => require('react').createElement(require('react-native').Text, null, 'icon:' + name),
}), { virtual: true });

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import SyncIndicator from '../src/components/common/SyncIndicator';

const offline = (overrides) => ({ isOnline: true, isSyncing: false, waitingCount: 0, needsAttentionCount: 0, ...overrides });

describe('SyncIndicator hero variant', () => {
  test.each([
    [offline({}), 'All saved and synced. Sync status', 'icon:cloud-done-outline', null],
    [offline({ waitingCount: 3 }), 'Saved on your phone. 3 items waiting to sync. Sync status', 'icon:cloud-upload-outline', '3'],
    [offline({ isOnline: false, waitingCount: 2 }), "Saved on your phone. 2 items will sync when you're online. Sync status", 'icon:cloud-offline-outline', '2'],
    [offline({ needsAttentionCount: 2 }), '2 items need attention. Sync status', 'icon:cloud-outline', '2'],
    [offline({ waitingCount: 140 }), 'Saved on your phone. 140 items waiting to sync. Sync status', 'icon:cloud-upload-outline', '99+'],
  ])('state %#', (state, label, icon, badge) => {
    mockUseOffline.mockReturnValue(state);
    const onPress = jest.fn();
    const screen = render(<SyncIndicator variant="hero" onPress={onPress} />);
    fireEvent.press(screen.getByLabelText(label));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText(icon)).toBeTruthy();
    if (badge) expect(screen.getByText(badge)).toBeTruthy();
  });

  test('syncing shows the rotating sync glyph and no badge', () => {
    mockUseOffline.mockReturnValue(offline({ isSyncing: true, waitingCount: 4 }));
    const screen = render(<SyncIndicator variant="hero" onPress={jest.fn()} />);
    expect(screen.getByLabelText('Syncing. Sync status')).toBeTruthy();
    expect(screen.getByText('icon:sync-outline')).toBeTruthy();
    expect(screen.queryByText('4')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx jest __tests__/SyncIndicator.hero.test.js` (with the Node 20 PATH). Expected: FAIL (labels not found).

- [ ] **Step 3: Implement.** In `SyncIndicator.js`, keep the default path as is and branch early:

```js
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
// existing imports stay

const HERO_ICONS = {
  synced: 'cloud-done-outline',
  waiting: 'cloud-upload-outline',
  offline: 'cloud-offline-outline',
  needs_attention: 'cloud-outline',
  syncing: 'sync-outline',
};

function HeroSyncIndicator({ onPress, state, view }) {
  const attention = state === 'needs_attention';
  const spin = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (mounted) setReduceMotion(Boolean(v)); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (state !== 'syncing' || reduceMotion) return undefined;
    const loop = Animated.loop(Animated.timing(spin, {
      toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true,
    }));
    loop.start();
    return () => { loop.stop(); spin.setValue(0); };
  }, [state, reduceMotion, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const badge = state === 'syncing' ? 0 : view.badgeCount;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${view.accessibilityLabel}. Sync status`}
      style={[heroStyles.disc, attention ? heroStyles.discAttention : null]}
    >
      <Animated.View style={state === 'syncing' ? { transform: [{ rotate }] } : null}>
        <Ionicons
          name={HERO_ICONS[state] || HERO_ICONS.synced}
          size={state === 'syncing' ? 22 : 24}
          color={attention ? colors.warningText : colors.onDark}
        />
      </Animated.View>
      {badge > 0 ? (
        <View style={[heroStyles.badge, attention ? heroStyles.badgeAttention : null]}>
          <RNText
            maxFontSizeMultiplier={1.2}
            style={[heroStyles.badgeText, attention ? heroStyles.badgeTextAttention : null]}
          >
            {badge > 99 ? '99+' : String(badge)}
          </RNText>
        </View>
      ) : null}
    </Pressable>
  );
}
```

At the top of the default export, after `view` is computed:

```js
  if (variant === 'hero') {
    return <HeroSyncIndicator onPress={onPress} state={state} view={view} />;
  }
```

and change the signature to `export default function SyncIndicator({ onPress, showLabel = false, dark = false, variant = 'default' })`. Add styles:

```js
const heroStyles = StyleSheet.create({
  disc: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.red700,
  },
  discAttention: { backgroundColor: colors.warningBg },
  badge: {
    position: 'absolute', top: -4, right: -4, minWidth: 20, minHeight: 20, paddingHorizontal: 5,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.red600,
  },
  badgeAttention: { backgroundColor: colors.warningText },
  badgeText: {
    ...typeRoles.textButton, fontSize: 12, lineHeight: 16, color: colors.red700, fontVariant: ['tabular-nums'],
  },
  badgeTextAttention: { color: colors.surface },
});
```

(import `typeRoles` from `../../constants/typography`).

- [ ] **Step 4: Run** the new test and `__tests__/syncStatusPresenter.test.js` plus any existing `SyncIndicator` tests (`ls __tests__ | grep -i SyncIndicator`). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/SyncIndicator.js __tests__/SyncIndicator.hero.test.js
git commit -m "feat(sync): hero icon variant of SyncIndicator for the Bold Red Home"
```

---

### Task 9: Home building blocks — clock row, week strip, attention area

**Files:**
- Modify: `src/components/common/ElapsedTime.js` (add `showSeconds`)
- Create: `src/components/home/HomeClockRow.js`
- Create: `src/components/home/WeekStrip.js`
- Create: `src/components/home/AttentionArea.js`
- Test: `__tests__/HomeClockRow.test.js`, `__tests__/WeekStrip.test.js`, `__tests__/AttentionArea.test.js`

**Interfaces:**
- Produces:
  - `formatElapsedTime(ms, { showSeconds = true } = {})`; `<ElapsedTime showSeconds={false} />`.
  - `<HomeClockRow isSignedIn loadingLocation signInTime fontScale onOpenHistory onClockIn onClockOut />`. Stacks when `fontScale > 1.3` (Home passes `useWindowDimensions().fontScale`; a prop keeps the component testable without mocking React Native internals).
  - `<WeekStrip days={getWeekSessionCounts(...)} />`.
  - `<AttentionArea items={AttentionItem[]} onOpen={(item) => void} onDismiss={(item) => void} />` — renders `null` for an empty list.

- [ ] **Step 1: Write the failing tests**

```js
// __tests__/HomeClockRow.test.js
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import HomeClockRow from '../src/components/home/HomeClockRow';

const handlers = () => ({ onOpenHistory: jest.fn(), onClockIn: jest.fn(), onClockOut: jest.fn() });

describe('HomeClockRow', () => {
  test('not clocked in: status opens history, Clock in clocks in', () => {
    const h = handlers();
    const screen = render(<HomeClockRow isSignedIn={false} loadingLocation={false} {...h} />);
    fireEvent.press(screen.getByLabelText('Not clocked in. View work history'));
    fireEvent.press(screen.getByLabelText('Clock in'));
    expect(h.onOpenHistory).toHaveBeenCalled();
    expect(h.onClockIn).toHaveBeenCalled();
  });

  test('clocked in: label says since when, Clock out clocks out', () => {
    const h = handlers();
    const screen = render(
      <HomeClockRow isSignedIn loadingLocation={false} signInTime="2026-10-15T05:52:00.000Z" {...h} />
    );
    expect(screen.getByText('On the clock')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('On the clock since 07:52. View work history'));
    fireEvent.press(screen.getByLabelText('Clock out'));
    expect(h.onClockOut).toHaveBeenCalled();
  });

  test('getting location: no action button', () => {
    const screen = render(<HomeClockRow isSignedIn={false} loadingLocation {...handlers()} />);
    expect(screen.getByText('Getting location…')).toBeTruthy();
    expect(screen.queryByLabelText('Clock in')).toBeNull();
  });

  test('stacks above font scale 1.3', () => {
    const screen = render(<HomeClockRow isSignedIn={false} loadingLocation={false} fontScale={2} {...handlers()} />);
    expect(screen.getByTestId('home-clock-row').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ flexDirection: 'column' })])
    );
  });
});
```

The clocked-in label uses the app's existing `formatDisplayTime(signInTime)`: Africa/Johannesburg, 24-hour (`hourCycle: 'h23'`), so `05:52Z` is `07:52`. Do not change the formatter.

```js
// __tests__/WeekStrip.test.js
import React from 'react';
import { render } from '@testing-library/react-native';
import WeekStrip from '../src/components/home/WeekStrip';

const days = [
  { day: 'Mon', count: 3, isToday: false, isFuture: false },
  { day: 'Tue', count: 0, isToday: false, isFuture: false },
  { day: 'Wed', count: 2, isToday: false, isFuture: false },
  { day: 'Thu', count: 2, isToday: true, isFuture: false },
  { day: 'Fri', count: 0, isToday: false, isFuture: true },
];

test('each day is one accessible element with the spec labels', () => {
  const screen = render(<WeekStrip days={days} />);
  expect(screen.getByLabelText('Monday, 3 sessions')).toBeTruthy();
  expect(screen.getByLabelText('Tuesday, 0 sessions')).toBeTruthy();
  expect(screen.getByLabelText('Thursday, today, 2 sessions')).toBeTruthy();
  expect(screen.getByLabelText('Friday, upcoming')).toBeTruthy();
  expect(screen.getByText('–')).toBeTruthy();
});

test('one session reads singular', () => {
  const screen = render(<WeekStrip days={[{ day: 'Mon', count: 1, isToday: false, isFuture: false }]} />);
  expect(screen.getByLabelText('Monday, 1 session')).toBeTruthy();
});
```

```js
// __tests__/AttentionArea.test.js
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AttentionArea from '../src/components/home/AttentionArea';

const items = [
  { key: 'auto_clock_out:time-1', kind: 'auto_clock_out', tone: 'warning', title: 'Clocked out after 10 hours',
    subtitle: 'Automatic · Wed · check hours', accessibilityLabel: 'Clocked out automatically after 10 hours, Wed. Check your hours',
    route: 'TimeEntriesList', dismissible: true, entryId: 'time-1' },
  { key: 'assessment_due', kind: 'assessment_due', tone: 'neutral', title: '1 child to assess',
    subtitle: '11 of 12 children assessed', accessibilityLabel: '1 child to assess. 11 of 12 children assessed. Open Assess',
    route: 'Assessments', dismissible: true },
];

test('renders nothing when empty', () => {
  const screen = render(<AttentionArea items={[]} onOpen={jest.fn()} onDismiss={jest.fn()} />);
  expect(screen.toJSON()).toBeNull();
});

test('cards open and dismiss independently', () => {
  const onOpen = jest.fn();
  const onDismiss = jest.fn();
  const screen = render(<AttentionArea items={items} onOpen={onOpen} onDismiss={onDismiss} />);
  expect(screen.getByLabelText('Needs your attention')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Clocked out automatically after 10 hours, Wed. Check your hours'));
  fireEvent.press(screen.getByLabelText('Dismiss: Clocked out after 10 hours'));
  expect(onOpen).toHaveBeenCalledWith(items[0]);
  expect(onDismiss).toHaveBeenCalledWith(items[0]);
});
```

- [ ] **Step 2: Run to verify they fail** — the three files, with the Node 20 PATH. Expected: FAIL (modules not found).

- [ ] **Step 3: `ElapsedTime`** — change `formatElapsedTime` and the component:

```js
export function formatElapsedTime(milliseconds, { showSeconds = true } = {}) {
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
  return showSeconds ? `${hours}h ${minutes}m ${seconds}s` : `${hours}h ${minutes}m`;
}

export default function ElapsedTime({ signInTime, style, variant, showSeconds = true, maxFontSizeMultiplier }) {
  // ...existing state/effect unchanged...
  return (
    <Text variant={variant} style={style} maxFontSizeMultiplier={maxFontSizeMultiplier}>
      {formatElapsedTime(elapsed, { showSeconds })}
    </Text>
  );
}
```

- [ ] **Step 4: `HomeClockRow`**

```js
// src/components/home/HomeClockRow.js
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ElapsedTime from '../common/ElapsedTime';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { formatDisplayTime } from '../../utils/localDate';

const STACK_FONT_SCALE = 1.3;

export default function HomeClockRow({
  isSignedIn, loadingLocation, signInTime, fontScale = 1, onOpenHistory, onClockIn, onClockOut,
}) {
  const stacked = fontScale > STACK_FONT_SCALE;

  const tile = (
    <View style={styles.tile}>
      {loadingLocation
        ? <ActivityIndicator size="small" color={colors.onDark} />
        : <Ionicons name="time-outline" size={22} color={colors.onDark} />}
      {isSignedIn && !loadingLocation ? <View style={styles.liveDot} /> : null}
    </View>
  );

  let status;
  if (loadingLocation) {
    status = (
      <View style={styles.status} accessibilityLiveRegion="polite">
        {tile}
        <Text style={styles.statusStrong}>Getting location…</Text>
      </View>
    );
  } else if (isSignedIn) {
    status = (
      <Pressable
        onPress={onOpenHistory}
        accessibilityRole="button"
        accessibilityLabel={`On the clock since ${formatDisplayTime(signInTime)}. View work history`}
        style={styles.status}
      >
        {tile}
        <View style={styles.statusCopy}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>On the clock</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.red50} />
          </View>
          <ElapsedTime signInTime={signInTime} showSeconds={false} style={styles.elapsed} />
        </View>
      </Pressable>
    );
  } else {
    status = (
      <Pressable
        onPress={onOpenHistory}
        accessibilityRole="button"
        accessibilityLabel="Not clocked in. View work history"
        style={styles.status}
      >
        {tile}
        <Text style={styles.statusStrong}>Not clocked in</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.red50} />
      </Pressable>
    );
  }

  const action = loadingLocation ? (
    <View style={[styles.actionSpacer, stacked ? styles.actionStacked : null]} />
  ) : (
    <Pressable
      onPress={isSignedIn ? onClockOut : onClockIn}
      accessibilityRole="button"
      accessibilityLabel={isSignedIn ? 'Clock out' : 'Clock in'}
      style={[
        styles.action,
        isSignedIn ? styles.actionOutline : styles.actionFilled,
        stacked ? styles.actionStacked : null,
      ]}
    >
      <Text style={[styles.actionText, isSignedIn ? styles.actionTextOutline : styles.actionTextFilled]}>
        {isSignedIn ? 'Clock out' : 'Clock in'}
      </Text>
    </Pressable>
  );

  return (
    <View testID="home-clock-row" style={[styles.row, stacked ? styles.rowStacked : styles.rowInline]}>
      {status}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64, borderRadius: 18, backgroundColor: colors.red700,
    paddingLeft: 12, paddingRight: 10, gap: 12,
  },
  rowInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', paddingVertical: 12 },
  status: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: {
    width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  liveDot: {
    position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.onDark, borderWidth: 2.5, borderColor: colors.red700,
  },
  statusCopy: { flexShrink: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  label: { ...typeRoles.textLabel, color: colors.red50 },
  elapsed: { ...typeRoles.displayM, lineHeight: 24, color: colors.onDark, fontVariant: ['tabular-nums'] },
  statusStrong: { ...typeRoles.textButton, fontSize: 17, lineHeight: 22, color: colors.onDark, flexShrink: 1 },
  action: {
    minHeight: 44, minWidth: 106, paddingHorizontal: 18, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  actionFilled: { backgroundColor: colors.surface, ...{ shadowColor: colors.red900, shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 3 } },
  actionOutline: { borderWidth: 1.5, borderColor: colors.onDark },
  actionStacked: { alignSelf: 'stretch' },
  actionSpacer: { minWidth: 106, minHeight: 44 },
  actionText: { ...typeRoles.textButton },
  actionTextFilled: { color: colors.red600 },
  actionTextOutline: { color: colors.onDark },
});
```

- [ ] **Step 5: `WeekStrip`**

```js
// src/components/home/WeekStrip.js
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

const FULL_DAY = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };

const dayLabel = ({ day, count, isToday, isFuture }) => {
  const name = FULL_DAY[day] || day;
  if (isFuture) return `${name}, upcoming`;
  const sessions = `${count} ${count === 1 ? 'session' : 'sessions'}`;
  return isToday ? `${name}, today, ${sessions}` : `${name}, ${sessions}`;
};

export default function WeekStrip({ days }) {
  return (
    <View accessibilityLabel="This week" style={styles.row}>
      {days.map((d) => {
        const done = !d.isToday && !d.isFuture && d.count > 0;
        return (
          <View key={d.day} accessible accessibilityLabel={dayLabel(d)} style={styles.column}>
            <Text style={[styles.dayLabel, d.isToday ? styles.dayLabelToday : null]}>{d.day.toUpperCase()}</Text>
            <View style={[styles.tile, done ? styles.tileDone : null, d.isToday ? styles.tileToday : null]}>
              <Text
                maxFontSizeMultiplier={1.2}
                style={[styles.count, done ? styles.countDone : null, d.isToday ? styles.countToday : null]}
              >
                {d.isFuture ? '–' : String(d.count)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  column: { flex: 1, alignItems: 'center', gap: 6 },
  dayLabel: { ...typeRoles.textLabel, color: colors.textSecondary },
  dayLabelToday: { color: colors.red600 },
  tile: { alignSelf: 'stretch', minHeight: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tileDone: { backgroundColor: colors.successBg },
  tileToday: {
    backgroundColor: colors.red600,
    shadowColor: colors.red600, shadowOpacity: 0.26, shadowRadius: 7, shadowOffset: { width: 0, height: 6 }, elevation: 3,
  },
  count: { ...typeRoles.displayM, lineHeight: 24, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  countDone: { color: colors.successText },
  countToday: { color: colors.onDark },
});
```

- [ ] **Step 6: `AttentionArea`**

```js
// src/components/home/AttentionArea.js
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

const ICONS = { sync_attention: 'cloud-outline', auto_clock_out: 'alarm-outline', assessment_due: 'clipboard-outline' };
// Decorative one-off (ink at 12%), allowed by design-system.md.
const CARD_BORDER = 'rgba(34,26,27,0.12)';

function AttentionCard({ item, onOpen, onDismiss }) {
  const warning = item.tone === 'warning';
  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => onOpen(item)}
        accessibilityRole="button"
        accessibilityLabel={item.accessibilityLabel}
        style={({ pressed }) => [styles.main, pressed ? styles.pressed : null]}
      >
        <View style={[styles.tile, warning ? styles.tileWarning : null]}>
          <Ionicons name={ICONS[item.kind]} size={22} color={warning ? colors.warningText : colors.text} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.subtitle}>{item.subtitle}</Text>
        </View>
        {!item.dismissible ? <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /> : null}
      </Pressable>
      {item.dismissible ? (
        <Pressable
          onPress={() => onDismiss(item)}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss: ${item.title}`}
          style={styles.dismiss}
        >
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function AttentionArea({ items, onOpen, onDismiss }) {
  if (!items || items.length === 0) return null;
  return (
    <View accessibilityRole="list" accessibilityLabel="Needs your attention" style={styles.area}>
      {items.map((item) => (
        <AttentionCard key={item.key} item={item} onOpen={onOpen} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  area: { gap: 8 },
  card: {
    flexDirection: 'row', alignItems: 'center', minHeight: 60, borderRadius: 18,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: CARD_BORDER, overflow: 'hidden',
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 10, paddingRight: 11 },
  pressed: { transform: [{ scale: 0.98 }], backgroundColor: 'rgba(34,26,27,0.06)' },
  tile: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  tileWarning: { backgroundColor: colors.warningBg },
  copy: { flex: 1, gap: 2 },
  title: { ...typeRoles.textBodyStrong, color: colors.text },
  subtitle: { ...typeRoles.textCaption, color: colors.textSecondary },
  dismiss: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 7: Run the three tests and `__tests__/ElapsedTime*`** (if present). Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/common/ElapsedTime.js src/components/home/HomeClockRow.js src/components/home/WeekStrip.js src/components/home/AttentionArea.js __tests__/HomeClockRow.test.js __tests__/WeekStrip.test.js __tests__/AttentionArea.test.js
git commit -m "feat(home): clock row, week strip, and attention area components"
```

---

### Task 10: Rebuild `HomeScreen`

**Files:**
- Modify: `src/screens/main/HomeScreen.js` (rewrite)
- Modify: `__tests__/HomeScreen.test.js` (rewrite the removed-section tests; keep the onboarding and stats-failure tests)

**Interfaces:**
- Consumes: everything from Tasks 3–9; `useOffline()` (`needsAttentionCount`); `useTimeTracking()` (`autoClockOutNotice`, `dismissAutoClockOutNotice`, plus the existing fields).

- [ ] **Step 1: Rewrite the tests.** In `__tests__/HomeScreen.test.js`:
  - Delete the tests `shows children the signed-in EA has not seen this week`, `shows recent sessions and opens the complete history`, `renders the locked body sections`, and rename `uses complete active-roster assessment coverage, matching the Assessments tab` to `assessment card uses complete active-roster coverage` with its assertion changed from `'1 of 2 children assessed'` to the card:

```js
    await waitFor(() => expect(screen.getByText('1 child to assess')).toBeTruthy());
    expect(screen.getByText('1 of 2 children assessed')).toBeTruthy();
```

  - Add `jest.mock('../src/services/homeAttentionStore', ...)`:

```js
const mockGetAssessmentDismissedOn = jest.fn();
const mockDismissAssessmentForDay = jest.fn();
jest.mock('../src/services/homeAttentionStore', () => ({
  AUTO_CLOCK_OUT_NOTICE_TTL_MS: 24 * 60 * 60 * 1000,
  homeAttentionStore: {
    getAssessmentDismissedOn: (...args) => mockGetAssessmentDismissedOn(...args),
    dismissAssessmentForDay: (...args) => mockDismissAssessmentForDay(...args),
  },
}));
```

  with `mockGetAssessmentDismissedOn.mockResolvedValue(null)` and `mockDismissAssessmentForDay.mockResolvedValue(undefined)` in `beforeEach`, and add `autoClockOutNotice: null, dismissAutoClockOutNotice: jest.fn()` to `defaultTimeTracking`.
  - Add these tests:

```js
  test('a normal day shows no attention area', async () => {
    mockUseChildren.mockReturnValue({ children: [{ id: 'c1', first_name: 'A' }] });
    mockGetAssessmentCountsSince.mockResolvedValue([{ child_id: 'c1', count: 1 }]);
    const screen = renderHome();
    await waitFor(() => expect(screen.getByText('2 of 3 sessions today')).toBeTruthy());
    expect(screen.queryByLabelText('Needs your attention')).toBeNull();
    expect(screen.queryByText('WHO TO SEE NEXT')).toBeNull();
    expect(screen.queryByText('RECENT')).toBeNull();
  });

  test('sync attention card opens Sync status and stays while syncing', async () => {
    mockUseOffline.mockReturnValue({
      isOnline: true, isSyncing: true, waitingCount: 0, needsAttentionCount: 2, syncStatus: { failedItems: [] },
    });
    const navigation = { navigate: jest.fn() };
    const screen = renderHome(navigation);
    fireEvent.press(await screen.findByLabelText('2 items need attention. Open sync status to sort it out'));
    expect(navigation.navigate).toHaveBeenCalledWith('SyncStatus');
  });

  test('an auto clock-out published after the first load appears without navigation', async () => {
    const screen = renderHome();
    await waitFor(() => expect(screen.getByText('2 of 3 sessions today')).toBeTruthy());
    expect(screen.queryByText('Clocked out after 10 hours')).toBeNull();

    mockUseTimeTracking.mockReturnValue({
      ...defaultTimeTracking,
      autoClockOutNotice: {
        entryId: 'time-1', userId: 'ea-1', signInTime: new Date(Date.now() - 11 * 3600e3).toISOString(),
        detectedAt: new Date().toISOString(), dismissedAt: null,
      },
    });
    screen.rerender(<PaperProvider><HomeScreen navigation={{ navigate: jest.fn() }} /></PaperProvider>);

    expect(await screen.findByText('Clocked out after 10 hours')).toBeTruthy();
  });

  test('dismissing the auto clock-out card calls the provider with its entry', async () => {
    const dismiss = jest.fn();
    mockUseTimeTracking.mockReturnValue({
      ...defaultTimeTracking,
      autoClockOutNotice: {
        entryId: 'time-9', userId: 'ea-1', signInTime: new Date().toISOString(),
        detectedAt: new Date().toISOString(), dismissedAt: null,
      },
      dismissAutoClockOutNotice: dismiss,
    });
    const screen = renderHome();
    fireEvent.press(await screen.findByLabelText('Dismiss: Clocked out after 10 hours'));
    expect(dismiss).toHaveBeenCalledWith('time-9');
  });

  test('dismissing the assessment card hides it for today', async () => {
    mockUseChildren.mockReturnValue({ children: [{ id: 'c1', first_name: 'A' }, { id: 'c2', first_name: 'B' }] });
    mockGetAssessmentCountsSince.mockResolvedValue([{ child_id: 'c1', count: 1 }]);
    const screen = renderHome();
    fireEvent.press(await screen.findByLabelText('Dismiss: 1 child to assess'));
    await waitFor(() => expect(screen.queryByText('1 child to assess')).toBeNull());
    expect(mockDismissAssessmentForDay).toHaveBeenCalledWith('ea-1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  test('returning to the foreground reloads the stats', async () => {
    const { AppState } = require('react-native');
    const listeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      listeners.push(fn);
      return { remove: jest.fn() };
    });
    renderHome();
    await waitFor(() => expect(mockGetSessionsTodayGoal).toHaveBeenCalledTimes(1));
    await act(async () => { listeners.forEach((fn) => fn('active')); });
    await waitFor(() => expect(mockGetSessionsTodayGoal).toHaveBeenCalledTimes(2));
  });

  test('omits the subtitle when there is no programme or school', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'ea-1' }, profile: { first_name: 'Alice' } });
    mockGetActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: false, programme: null });
    const screen = renderHome();
    await waitFor(() => expect(screen.getByText('Molo, Alice.')).toBeTruthy());
    expect(screen.queryByText(/ · /)).toBeNull();
  });
```

  - Update the clock tests: `'Clock In'` → `'Clock in'`, `'Clock Out'` → `'Clock out'` labels.
  - Rewrite the end of `keeps existing stats usable and clears loading when a stats read fails`: keep
    everything up to `expect(screen.queryByLabelText('Loading statistics')).toBeNull();`, then
    replace the two removed-section assertions with:

```js
    expect(screen.getByText('Couldn’t load today’s sessions')).toBeTruthy();
    expect(screen.queryByLabelText('Needs your attention')).toBeNull();
```

  - Add a test that a failed refresh keeps the previous stats:

```js
  test('a failed refresh keeps the last good stats on screen', async () => {
    const { AppState } = require('react-native');
    const listeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      listeners.push(fn);
      return { remove: jest.fn() };
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const screen = renderHome();
    await waitFor(() => expect(screen.getByText('2 of 3 sessions today')).toBeTruthy());

    mockGetSessions.mockRejectedValueOnce(new Error('busy'));
    await act(async () => { listeners.forEach((fn) => fn('active')); });

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(screen.getByText('2 of 3 sessions today')).toBeTruthy();
    consoleError.mockRestore();
  });

  test('Home owns a light status bar only while focused', async () => {
    const screen = renderHome();
    await waitFor(() => expect(mockStatusBar).toHaveBeenCalledWith(expect.objectContaining({ style: 'light' })));

    mockStatusBar.mockClear();
    mockIsFocused.mockReturnValue(false);
    screen.rerender(<PaperProvider><HomeScreen navigation={{ navigate: jest.fn() }} /></PaperProvider>);

    expect(mockStatusBar).not.toHaveBeenCalled();
  });
```

    (Declare `const mockIsFocused = jest.fn(() => true);` and `const mockStatusBar = jest.fn();` at the top
    with the other mocks, extend the `@react-navigation/native` mock with
    `useIsFocused: () => mockIsFocused()`, and reset `mockIsFocused.mockReturnValue(true)` in `beforeEach`.)

- [ ] **Step 2: Run to verify the new tests fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/HomeScreen.test.js`
Expected: FAIL on the new tests (old Home still renders the removed sections).

- [ ] **Step 3: Rewrite `src/screens/main/HomeScreen.js`**

```js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { useOffline } from '../../context/OfflineContext';
import { useTimeTracking } from '../../hooks/useTimeTracking';
import { sessionsRepository } from '../../db/repositories/sessionsRepository';
import { assessmentsRepository } from '../../db/repositories/assessmentsRepository';
import SyncIndicator from '../../components/common/SyncIndicator';
import HomeClockRow from '../../components/home/HomeClockRow';
import SegmentedSessionGauge from '../../components/home/SegmentedSessionGauge';
import WeekStrip from '../../components/home/WeekStrip';
import AttentionArea from '../../components/home/AttentionArea';
import { getSessionsTodayGoal } from '../../services/sessionsTodayGoal';
import { getActiveProgrammeGate } from '../../services/activeProgrammeGate';
import { homeAttentionStore } from '../../services/homeAttentionStore';
import { getAssessmentCoverage, getWeekSessionCounts } from '../../utils/dashboardStats';
import { deriveHomeAttentionItems } from '../../utils/homeAttention';
import { getGoalCopy } from '../../utils/sessionGoalPresentation';
import { toLocalDateString } from '../../utils/localDate';
import { colors, shadows } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SIDE = 24;
const CARD_STRADDLE = 56; // the red field ends this far below the card's top
const FAB_OVERHANG = 28; // LockedBottomTabBar recordAction marginTop
const RING = { stroke: 50, r: 236, dxFromRight: 170, cy: 40 };

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const { user, profile } = useAuth();
  const { children: childrenList } = useChildren();
  const { classBootstrapStatus, incompleteOnboardingClassId } = useClasses();
  const { needsAttentionCount = 0 } = useOffline();
  const {
    isSignedIn, activeEntry, loadingLocation, snackbarMessage, snackbarVisible, setSnackbarVisible,
    handleSignIn, handleSignOut, autoClockOutNotice, dismissAutoClockOutNotice,
  } = useTimeTracking();
  const onboardingEnteredRef = useRef(false);
  const loadSeqRef = useRef(0);

  const [weekCounts, setWeekCounts] = useState([]);
  const [coverage, setCoverage] = useState(null); // null until the first successful load
  const [sessionGoal, setSessionGoal] = useState(null);
  const [programmeName, setProgrammeName] = useState('');
  const [assessmentDismissedOn, setAssessmentDismissedOn] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  // Unchanged onboarding routing.
  useFocusEffect(
    useCallback(() => {
      const shouldEnterOnboarding = classBootstrapStatus === 'confirmed_empty'
        || classBootstrapStatus === 'unconfirmed_empty';
      if (incompleteOnboardingClassId && !onboardingEnteredRef.current) {
        onboardingEnteredRef.current = true;
        navigation.navigate('ChildOnboarding', { classId: incompleteOnboardingClassId });
      } else if (shouldEnterOnboarding && !onboardingEnteredRef.current) {
        onboardingEnteredRef.current = true;
        navigation.navigate('ClassOnboarding');
      } else if (!incompleteOnboardingClassId && !shouldEnterOnboarding) {
        onboardingEnteredRef.current = false;
      }
    }, [classBootstrapStatus, incompleteOnboardingClassId, navigation])
  );

  const loadStats = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setNow(new Date());
    setStatsLoading(true);
    try {
      const recentCutoff = toLocalDateString(new Date(Date.now() - THIRTY_DAYS_MS));
      const [assessmentCounts, dailyGoal, sessions, programmeGate, dismissedOn] = await Promise.all([
        assessmentsRepository.getAssessmentCountsSince({ userId: user.id }),
        getSessionsTodayGoal({ userId: user.id }),
        sessionsRepository.getSessions({
          userId: user.id, recordedByUserId: user.id, sinceDate: recentCutoff, order: 'desc',
        }),
        getActiveProgrammeGate({ userId: user.id }),
        homeAttentionStore.getAssessmentDismissedOn(user.id),
      ]);
      if (seq !== loadSeqRef.current) return; // a newer load superseded this one
      setWeekCounts(getWeekSessionCounts(sessions));
      setCoverage(getAssessmentCoverage(childrenList, assessmentCounts));
      setSessionGoal(dailyGoal);
      setProgrammeName(programmeGate.programme?.name || '');
      setAssessmentDismissedOn(dismissedOn);
    } catch (error) {
      console.error('Error loading Home statistics:', error);
    } finally {
      if (seq === loadSeqRef.current) setStatsLoading(false);
    }
  }, [childrenList, user.id]);

  // Load on focus (and when the roster or user changes); reload on foreground.
  useFocusEffect(
    useCallback(() => {
      loadStats();
      const sub = AppState.addEventListener('change', (next) => {
        if (next === 'active') loadStats();
      });
      return () => sub.remove();
    }, [loadStats])
  );
  // Declarative and focus-scoped: React Native's StatusBar keeps a stack, so a
  // mounted <StatusBar> wins over App.js's root <StatusBar style="auto"> and
  // unmounting on blur restores it. The imperative setter would be overwritten
  // by the next root update.
  const isFocused = useIsFocused();

  const attentionItems = useMemo(() => deriveHomeAttentionItems({
    needsAttentionCount,
    autoClockOut: autoClockOutNotice,
    coverage,
    assessmentDismissedOn,
    now,
  }), [needsAttentionCount, autoClockOutNotice, coverage, assessmentDismissedOn, now]);

  const openItem = useCallback((item) => navigation.navigate(item.route), [navigation]);
  const dismissItem = useCallback(async (item) => {
    if (item.kind === 'auto_clock_out') {
      await dismissAutoClockOutNotice(item.entryId);
    } else if (item.kind === 'assessment_due') {
      const today = toLocalDateString(new Date());
      setAssessmentDismissedOn(today);
      try {
        await homeAttentionStore.dismissAssessmentForDay(user.id, today);
      } catch (error) {
        console.error('Error dismissing assessment card:', error);
      }
    }
  }, [dismissAutoClockOutNotice, user.id]);

  const goalCopy = getGoalCopy(sessionGoal, isSignedIn);
  const subtitle = [programmeName, profile?.schoolName].filter(Boolean).join(' · ');

  return (
    <View style={styles.screen}>
      {isFocused ? <StatusBar style="light" /> : null}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: FAB_OVERHANG + 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Red above the content top so an iOS overscroll never shows the canvas. */}
        <View style={styles.overscrollRed} />
        <View style={[styles.hero, { paddingTop: insets.top + 6 }]}>
          <Svg
            width={width}
            height={RING.cy + RING.r + RING.stroke}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Circle
              cx={width + RING.dxFromRight}
              cy={RING.cy}
              r={RING.r}
              stroke={colors.red500}
              strokeWidth={RING.stroke}
              fill="none"
            />
          </Svg>

          <View style={styles.topRow}>
            <SyncIndicator variant="hero" onPress={() => navigation.navigate('SyncStatus')} />
            <Pressable
              onPress={() => navigation.navigate('Profile')}
              accessibilityRole="button"
              accessibilityLabel="Settings. Open profile"
              style={styles.heroButton}
            >
              <Ionicons name="settings-outline" size={22} color={colors.onDark} />
            </Pressable>
          </View>

          <Text accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.greeting}>
            Molo, {profile?.first_name || 'there'}.
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <View style={styles.clockWrap}>
            <HomeClockRow
              isSignedIn={isSignedIn}
              loadingLocation={loadingLocation}
              signInTime={activeEntry?.sign_in_time}
              fontScale={fontScale}
              onOpenHistory={() => navigation.navigate('TimeEntriesList')}
              onClockIn={handleSignIn}
              onClockOut={handleSignOut}
            />
          </View>
        </View>

        <View style={styles.body}>
          <View style={[styles.card, shadows.elevated]} accessibilityLabel="Today’s sessions">
            {sessionGoal && goalCopy ? (
              // Previously loaded stats stay on screen while a refresh runs or
              // if it fails; only a successful load replaces them.
              <>
                <SegmentedSessionGauge goal={sessionGoal} />
                <Text style={styles.cardTitle}>{goalCopy.title}</Text>
                <Text style={styles.cardSubtitle}>{goalCopy.subtitle}</Text>
              </>
            ) : statsLoading ? (
              <View accessible accessibilityLabel="Loading statistics" style={styles.skeleton}>
                <View style={styles.skelGauge} />
                <View style={styles.skelTitle} />
                <View style={styles.skelLine} />
              </View>
            ) : (
              <>
                <Text style={styles.cardTitle}>Couldn’t load today’s sessions</Text>
                <Text style={styles.cardSubtitle}>They’ll refresh next time you open Home.</Text>
              </>
            )}
          </View>

          <WeekStrip days={weekCounts} />

          <AttentionArea items={attentionItems} onOpen={openItem} onDismiss={dismissItem} />
        </View>
      </ScrollView>

      <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)} duration={3000}>
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  overscrollRed: { position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: colors.red600 },
  hero: {
    backgroundColor: colors.red600,
    paddingHorizontal: SIDE,
    paddingBottom: 16 + CARD_STRADDLE,
    overflow: 'hidden',
  },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  heroButton: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.red700,
  },
  greeting: { ...typeRoles.displayXL, color: colors.onDark, marginTop: 10 },
  subtitle: { ...typeRoles.textBody, color: colors.red50, marginTop: 4, maxWidth: 280 },
  clockWrap: { marginTop: 20 },
  body: { paddingHorizontal: SIDE, marginTop: -CARD_STRADDLE, gap: 20 },
  card: {
    backgroundColor: colors.surface, borderRadius: 22, alignItems: 'center',
    paddingTop: 18, paddingHorizontal: 16, paddingBottom: 16,
  },
  cardTitle: { ...typeRoles.displayM, color: colors.text, marginTop: 10, textAlign: 'center' },
  cardSubtitle: { ...typeRoles.textBody, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  skeleton: { alignItems: 'center' },
  skelGauge: { width: 176, height: 97, borderRadius: 12, backgroundColor: colors.border },
  skelTitle: { width: 200, height: 22, borderRadius: 6, marginTop: 12, backgroundColor: colors.border },
  skelLine: { width: 240, height: 16, borderRadius: 6, marginTop: 8, backgroundColor: colors.border },
});
```

Notes for the implementer:
- `getGoalCopy` returns `null` while `sessionGoal` is `null`, so the skeleton renders until the first load.
- `HomeScreen.test.js` must mock `useIsFocused` alongside its existing `useFocusEffect` mock (`useIsFocused: () => mockIsFocused()`, default `true`) and mock `expo-status-bar` so the test can see the prop: `jest.mock('expo-status-bar', () => ({ StatusBar: (props) => { mockStatusBar(props); return null; } }));`.
- Keep `Snackbar` from react-native-paper as today.

- [ ] **Step 4: Run the Home tests**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/HomeScreen.test.js`
Expected: PASS (all, including onboarding and stats-failure tests).

- [ ] **Step 5: Run the full unit suite and the integration suite**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test && PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration`
Expected: PASS. Record the counts for the build log.

- [ ] **Step 6: Commit**

```bash
git add src/screens/main/HomeScreen.js __tests__/HomeScreen.test.js
git commit -m "feat(home): Bold Red Home — red hero, clock row, session card, week strip, attention area"
```

---

### Task 11: Standing docs, build log, follow-up issue

**Files:**
- Modify: `PRD.md` §6.2
- Modify: `documentation/design-system.md`
- Modify: `documentation/build-log.md`
- Modify: `documentation/ROADMAP.md` (only if it lists a Home item this closes)

- [ ] **Step 1: Replace the PRD §6.2 bullet list** with:

```markdown
Home is the primary daily-use surface. It shows:

- identity, Programme, and school;
- sync status as an icon button whose glyph and badge carry the state (full wording on the Sync
  status screen and in the button's accessibility label);
- clocked-in or clocked-out state with elapsed time and safe actions (clock-out is conditional on
  the time entry still being open);
- the sessions-today segmented half gauge (locked R3 colour rule);
- Monday-to-Friday session activity;
- an attention area that is blank by default and shows at most two cards: items needing sync
  attention, an automatic clock-out (for 24 hours, dismissible), and children still to assess
  (dismissible until the next day);
- correct zero-class onboarding routing.

Session history is reached from Insights. "Who to see next" moves into the session flow
(separate work).
```

Keep the paragraph "All Home domain data comes from SQLite..." unchanged.

- [ ] **Step 2: Add to `documentation/design-system.md`** under "## Typography":

```markdown
**Bold Red roles (2026-10).** `typeRoles` in `src/constants/typography.js`: Bricolage Grotesque
800 for display (greeting, numerals, headings) and Figtree 500/700/800 for text, loaded at the app
root with `expo-font`. Roles set the weight-specific face and never `fontWeight` (Android falls back
to the system font if both are set). Home uses them now; other screens adopt them as they are
redesigned, and until then use the system font.
```

and under "## Open work", replace the gauge bullet with:

```markdown
- The Home session gauge is segmented (`src/components/home/SegmentedSessionGauge.js`); the colour
  rule lives in `src/utils/sessionGoalPresentation.js` and is shared with `SessionsTodayGauge`:
  `ringNeutral` at zero/no-target, `ringStart` at one session, primary red while progressing,
  success green at target, and amber above the usual ceiling.
- Home attention cards use one decorative local border, ink at 12% (`rgba(34,26,27,0.12)`).
```

- [ ] **Step 3: Append a build-log entry** to `documentation/build-log.md` following its existing entry format: what shipped (Tasks 1–10), the two Codex spec rounds and their dispositions (from the spec's Review log), the plan review, test counts from Task 10 Step 5, device-gate results from Task 12, and the accepted risks (no midnight timer; the pre-existing provider account-switch race).

- [ ] **Step 4: Ask Jim before filing** the follow-up GitHub issue for the `TimeTrackingProvider` account-switch race (spec "Out of scope"), then file it with `gh issue create` and the `needs-triage` label, and link it in the build log.

- [ ] **Step 5: Commit**

```bash
git add PRD.md documentation/design-system.md documentation/build-log.md documentation/ROADMAP.md
git commit -m "docs(home): PRD 6.2, design system, and build log for the Bold Red Home"
```

---

### Task 12: Device gate and branch review

- [ ] **Step 1: Build a preview** for iOS and Android (cloud EAS per memory "Device-testing the SQLite backend"; the sqlite backend is the default).
- [ ] **Step 2: Capture and compare against the canvas v2 boards**: normal day; morning (not clocked in); getting location; target met; above ceiling (6 sessions); no target; sync needs attention; offline with 3 waiting; two attention cards; a 360dp Android phone with two cards; the largest system font size on both platforms (all text complete, clock action and dismiss buttons each tappable, sync badges showing 1, 12, and 99+ complete).
- [ ] **Step 2b: Cold start** on both platforms: the splash stays up until the fonts are ready (no blank frame), and the status bar is light on Home and returns to dark on other tabs.
- [ ] **Step 3: Trigger a real auto clock-out** (seed an open entry older than 10 hours on a test account, then open the app): the card appears on Home without navigating, says the right weekday, dismisses, and is gone 24 hours after detection.
- [ ] **Step 4:** Record results and screenshots in the build log (Task 11 Step 3).
- [ ] **Step 5:** Run `/codex:adversarial-review --base main` on the branch; handle findings with the same likely-and-costly judgement as the spec rounds.

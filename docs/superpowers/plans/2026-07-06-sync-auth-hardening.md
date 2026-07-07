# Sync Auth Hardening Implementation Plan (issues #43, #44, #45)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three remaining P0s from the ZZ field-lessons review: sync must skip quietly when no Supabase session exists instead of quarantining the outbox via anonymous RLS denials (#43); rows quarantined by auth-loss must self-heal on auth restore, scoped to the signed-in user (#44); an offline cold start with a stale token must restore the persisted session instead of bouncing the EA to a login screen they cannot pass (#45).

**Architecture:** Seven tasks, one branch. Tasks 1-2 (#43, the gate + mid-cycle downgrade + genuine-denial marker) establish the invariant Task 3-4 (#44, the heal) depend on: after the gate ships, any NEW terminal `42501` was written with a live session and is a genuine denial. Tasks 5-6 (#45) touch only auth files and share nothing with 1-4. All three designs are ports of Zazi iZandi's field-tested fixes (OTA 1.1.0+4 and +10; ZZ references quoted per task), re-expressed against masi's structured outbox columns — masi has no ZZ-style `TERMINAL:` string grammar, and `masi-app-sqlite` has no field users, so no legacy-era migration logic is needed.

**Tech Stack:** React Native (Expo) + JavaScript, Jest + RTL, better-sqlite3 SQLite test engine, supabase-js v2 (session persisted in AsyncStorage, `persistSession: true`).

## Global Constraints

- Branch off main first: `git checkout -b fix/sync-auth-hardening` (repo rule: always branch).
- Node 20 per `.nvmrc`; prefix jest with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH` if the shell defaults to 22.
- Commit messages: `type(scope): message (#NN)` referencing the issue. Never add an agent name as co-author. Merges do not auto-close issues in this repo; the orchestrator closes #43/#44/#45 manually after merge.
- **`documentation/rls-sync-contract-map.md` MUST be updated** (Task 7): the gate, the authenticated-denial marker, and the heal are sync-contract behavior. Follow the Global Contract entry pattern PR #49 used.
- No Supabase schema changes; no local schema changes (the marker lives in the existing `last_error` text).
- The working tree contains an unrelated untracked file `docs/superpowers/plans/2026-07-04-improvements-phase3-amplifier.md` (a future phase) and a modified `skills-lock.json`; never stage either.
- Never write an em dash in any authored doc, comment, or commit message. Exception: code blocks preserving existing source comments stay byte-identical.
- **Reviewer note:** treat git as read-only during concurrent reviews (no stash/checkout/restore).
- ZZ reference code lives at `/Users/jimmckeown/Development/zazi-izandi-app` (read-only; cite, do not copy blindly — masi's outbox model is structured, ZZ's is string-grammar). The porting analysis is `documentation/zz-field-lessons-sync-review-2026-07-04.html` Findings 1 and 3.

---

### Task 1: Auth gate at the top of `syncAll` (#43 first half)

**The bug:** `syncAll` (`src/services/offlineSync.js:828`) runs regardless of auth state; `OfflineContext.syncNow` gates only on `isOnline`. With a dead refresh token the pass runs anonymously, every record 42501s, and `classifyError` (`:269-287`) marks them all terminal — ZZ's 2026-06-09 incident: a full day of an EA's work quarantined, with sign-in not recovering it.

**Files:**
- Modify: `src/services/offlineSync.js` (engine factory + `syncAll`)
- Test: Create `__tests__/offlineSyncAuthGate.test.js`

**Interfaces:**
- Produces: `createOutboxSyncEngine` accepts an injectable `getAuthSession` (defaults to `() => supabase.auth.getSession()`); a sessionless `syncAll` returns `{ success: true, skippedNoSession: true, totalSynced: 0, totalFailed: 0, failedRecords: [], tableResults: {}, preflightErrors: [], durationMs: <number> }` without touching the database, the outbox, sync meta, or the network. Task 2 reuses `getAuthSession` inside the record processor; Task 4's OfflineContext wiring relies on the skip shape.
- Consumes: `supabase` (already imported at `offlineSync.js:1`).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/offlineSyncAuthGate.test.js` on the real-SQLite pattern used by `__tests__/offlineSyncOutbox.test.js` (same `jest.mock('expo-sqlite', ...)` + `createBetterSqliteTestDatabase` + engine construction via `createOutboxSyncEngine`; mirror that file's setup verbatim, including how it seeds outbox rows and stubs the Supabase request path). ZZ's reference suite is `zazi-izandi-app/__tests__/offlineSyncAuthGate.test.js` Parts 1 and 4. Tests:

```javascript
  test('a sessionless pass skips with the structured shape and touches nothing', async () => {
    // seed one pending outbox row via the repository, as offlineSyncOutbox.test.js does
    const result = await engine.syncAll();

    expect(result).toEqual(expect.objectContaining({
      success: true,
      skippedNoSession: true,
      totalSynced: 0,
      totalFailed: 0,
      failedRecords: [],
      tableResults: {},
    }));
    // No network call was attempted (assert on the mocked supabase request path).
    // The seeded row is still status 'pending' and still ready:
    const ready = await outboxRepository.getReadyRecords();
    expect(ready).toHaveLength(1);
    // Sync meta untouched: getSyncStatus().lastSyncTime is unchanged/null.
  });

  test('a live session proceeds normally', async () => {
    // getAuthSession resolves { data: { session: { user: { id: 'user-1' } } } }
    // seed + run; assert the pass processed the row (synced or failed per the stubbed server),
    // i.e. skippedNoSession is undefined and the engine did real work.
  });
```

Write both with real assertions against the file's seeded fixtures (the comments above describe intent; the implementing engineer fills the seed/stub calls from `offlineSyncOutbox.test.js`'s existing helpers, which is why this file must mirror that suite's setup).

Construct the engine with the injectable:

```javascript
const engine = createOutboxSyncEngine({
  outboxRepository,
  stateRepository,
  getAuthSession: mockGetAuthSession,
});
```

- [ ] **Step 2: Run to verify both fail**

```bash
npx jest __tests__/offlineSyncAuthGate.test.js --verbose
```

Expected: FAIL (`skippedNoSession` undefined; the engine ignores `getAuthSession`).

- [ ] **Step 3: Implement the gate**

In `src/services/offlineSync.js`:

1. Add `getAuthSession` to the `createOutboxSyncEngine` factory options with the default:

```javascript
const createOutboxSyncEngine = ({
  outboxRepository,
  stateRepository,
  database,
  getAuthSession = () => supabase.auth.getSession(),
  ...
```

(match the factory's existing destructure style; keep all existing options).

2. At the very top of `syncAll` (before `startedAt`... place it as the first statement so a sessionless cycle does zero work — BEFORE the preflight `resetInFlight`/`repairGroupOwnershipForSync` and before any meta write):

```javascript
  const syncAll = async ({ tableName = null, force = false } = {}) => {
    // Auth gate: with no live session an upload pass would run anonymously and
    // RLS-quarantine the whole outbox as terminal (ZZ 2026-06-09 field incident).
    // getSession() can also return null while the refresh endpoint is merely
    // unreachable offline, so a null here means "skip this pass", never "sign out".
    let session = null;
    try {
      ({ data: { session } = {} } = await getAuthSession());
    } catch (error) {
      console.warn('syncAll: session check failed, skipping pass:', errorMessage(error));
    }
    if (!session) {
      console.log('Sync skipped: no auth session');
      return {
        success: true,
        skippedNoSession: true,
        totalSynced: 0,
        totalFailed: 0,
        failedRecords: [],
        tableResults: {},
        preflightErrors: [],
        durationMs: 0,
      };
    }
```

Note the deliberate choices: `success: true` (a skipped pass is not a failure; acceptance criterion 4) and NO `updateSyncMeta` write (a skipped pass must not stamp `lastSyncTime`/`lastSuccessfulSyncTime` — returning before the `try/finally` achieves that).

3. `defaultEngine` needs no change (the default covers it).

- [ ] **Step 4: Run to verify green, then the neighboring sync suites**

```bash
npx jest __tests__/offlineSyncAuthGate.test.js __tests__/offlineSyncOutbox.test.js __tests__/OfflineContext.test.js --verbose
```

Expected: the new suite PASSES. **The session stub sweep is repo-wide, not one place** (verified by review): every suite that constructs a real engine needs `getAuthSession: async () => ({ data: { session: { user: { id: 'test-user' } } } })` added to its `createOutboxSyncEngine(...)` calls — `__tests__/offlineSyncOutbox.test.js`, `__tests__/letterMasterySync.test.js`, `__tests__/bulkFinalize.test.js`, `__tests__/batchFailureSemantics.test.js`, `__tests__/childClassReassignment.test.js`, `__tests__/syncErrorGuard.test.js` (grep each for every construction site; prefer one shared const per file). Additionally `__tests__/offlineSync.pendingSessions.test.js` mocks the supabase module WITHOUT `auth.getSession` and drives the DEFAULT engine via `syncTableByName` — extend its supabase module mock with `auth: { getSession: jest.fn(async () => ({ data: { session: { user: { id: 'test-user' } } } })) }`. `OfflineContext.test.js` mocks `offlineSync` wholesale and is unaffected. Run the full unit suite after the sweep:

```bash
npx jest --silent
```

- [ ] **Step 5: Commit**

```bash
git add src/services/offlineSync.js __tests__/offlineSyncAuthGate.test.js __tests__/offlineSyncOutbox.test.js __tests__/letterMasterySync.test.js __tests__/bulkFinalize.test.js __tests__/batchFailureSemantics.test.js __tests__/childClassReassignment.test.js __tests__/syncErrorGuard.test.js __tests__/offlineSync.pendingSessions.test.js
git commit -m "feat(sync): skip sync passes when no Supabase session exists (#43)"
```

(Drop any file the sweep did not actually touch; add any additional engine-constructing suite the grep finds.)

---

### Task 2: Mid-cycle 42501 downgrade + the authenticated-denial marker (#43 second half)

**The bug:** if the session dies mid-pass, the in-flight records 42501 and quarantine terminal — but a permission denial without a live session is not trustworthy evidence. ZZ's belt: on a 42501 classified terminal, re-check the session; absent → retriable. Additionally, a 42501 that IS terminal (session live) gets a marker in `last_error` so Task 3's heal can tell genuine denials from auth-loss quarantines forever after.

**Files:**
- Modify: `src/services/offlineSync.js` (the classification call site at ~`:694`)
- Test: `__tests__/offlineSyncAuthGate.test.js` (extend)

**Interfaces:**
- Produces: exported constant `AUTHENTICATED_DENIAL_MARKER = '42501-authenticated:'`. Terminal 42501 rows written with a live session have `last_error` starting with that marker. Task 3's heal predicate keys on its ABSENCE.
- Consumes: `getAuthSession` from Task 1 (available in the engine closure).

- [ ] **Step 1: Write the failing tests**

In `__tests__/offlineSyncAuthGate.test.js`, using the same engine/fixtures:

```javascript
  test('a 42501 after the session vanished mid-cycle is retriable, not terminal', async () => {
    // getAuthSession: first call (top-of-pass gate) returns a session, every
    // later call returns null. The stubbed server responds 42501 to the upsert.
    // Run syncAll, then read the outbox row:
    //   status === 'failed' (not 'terminal'), next_retry_at set, last_error does
    //   NOT start with '42501-authenticated:'.
  });

  test('a 42501 with a live session stays terminal and carries the authenticated marker', async () => {
    // getAuthSession always returns a session; server responds 42501.
    //   status === 'terminal', last_error starts with '42501-authenticated:'.
  });
```

Fill both against the suite's real fixtures (server-response stubbing exactly as `offlineSyncOutbox.test.js` stubs error responses for its terminal-classification tests — reuse those helpers).

Add a third test for the BATCH path (review finding: batched failures degrade to per-record fallback through the same classification site — `offlineSync.js:797-799` falls back to `processRecord` — but pin it):

```javascript
  test('batched 42501s flow through the same downgrade/marker logic per row', async () => {
    // Seed two assessment_items outbox rows (a BATCHABLE_UPSERT_TABLES member).
    // Stub the batch upsert AND the per-row fallback upserts to return 42501.
    // With a live session throughout: both rows end terminal, both last_error
    // values start with '42501-authenticated:'.
  });
```

- [ ] **Step 2: Run to verify both fail**

```bash
npx jest __tests__/offlineSyncAuthGate.test.js -t "42501" --verbose
```

Expected: FAIL (today both cases go terminal, no marker).

- [ ] **Step 3: Implement**

In `src/services/offlineSync.js`:

1. Export the marker near `classifyError`:

```javascript
// Stamped onto last_error when a 42501 is quarantined WITH a live session.
// Post-gate, that means a genuine RLS denial; the auth-restore heal
// (syncRescue.requeueTerminalRlsFailures) must never touch marked rows.
export const AUTHENTICATED_DENIAL_MARKER = '42501-authenticated:';
```

2. At the classification call site (currently `:694`), replace:

```javascript
      const classification = classifyError(serverResult.error, config);
      const reason = errorMessage(serverResult.error);
```

with:

```javascript
      const classification = classifyError(serverResult.error, config);
      let reason = errorMessage(serverResult.error);

      if (serverResult.error?.code === '42501' && classification.terminal) {
        let liveSession = null;
        try {
          ({ data: { session: liveSession } = {} } = await getAuthSession());
        } catch (_) { /* treat as no session: downgrade below */ }
        if (!liveSession) {
          // A permission denial without a live session is not trustworthy
          // evidence; retry after auth restore instead of quarantining.
          classification.terminal = false;
        } else {
          reason = `${AUTHENTICATED_DENIAL_MARKER} ${reason}`;
        }
      }
```

(The existing `if (classification.terminal)` / retriable branches below need no change; they consume the mutated `classification` and `reason`.)

- [ ] **Step 4: Run green + integration**

```bash
npx jest __tests__/offlineSyncAuthGate.test.js __tests__/offlineSyncOutbox.test.js --verbose
npm run test:integration
```

- [ ] **Step 5: Commit**

```bash
git add src/services/offlineSync.js __tests__/offlineSyncAuthGate.test.js
git commit -m "feat(sync): downgrade mid-cycle 42501 to retriable; mark authenticated denials (#43)"
```

---

### Task 3: `requeueTerminalRlsFailures` inside the sync engine (#44 core)

**The design (ZZ's OTA 1.1.0+4 hotfix, adapted):** heal candidates are terminal outbox rows whose `last_error` shows an RLS denial WITHOUT Task 2's authenticated marker. Each candidate heals only if the signed-in user owns the record (per-table owner resolution; parent lookups for child rows; outbox-payload fallback for hard-deletes). The requeue AND the domain-row `sync_status` reset happen in ONE transaction — review finding: PR #49's pending-local-wins pull guard deliberately excludes terminal rows, so a healed outbox row whose domain row still says `terminal` would be exposed to pull-clobber before its re-sync. The implementation lives in `src/services/offlineSync.js` (NOT a separate module): the engine factory already owns the injected `outboxRepository`, the `database` closure, `setDomainSyncResult`, and `getConfig`, and tests construct engines with injected repositories exactly like every other sync suite.

**Files:**
- Modify: `src/services/offlineSync.js` (module-level helpers + engine method + default-engine export)
- Modify: `src/db/repositories/syncOutboxRepository.js` (add `getTerminalRecords` + `requeueTerminalRows`)
- Test: Create `__tests__/requeueTerminalRlsFailures.test.js` (real SQLite, engine-injected repositories)

**Interfaces:**
- Produces: engine method + module export `requeueTerminalRlsFailures(userId) -> Promise<number>`; repository methods `getTerminalRecords()` (toOutboxRecord shape, payload decoded) and `requeueTerminalRows(ids, { transaction }) -> count` (transaction-composable: `status='pending', retry_count=0, next_retry_at=null, last_error=null`).
- Consumes: `AUTHENTICATED_DENIAL_MARKER` (same module, Task 2); `setDomainSyncResult`/`getConfig`/`runRepositoryTransaction`/`resolveDatabase` (already in `offlineSync.js`).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/requeueTerminalRlsFailures.test.js` on the real-SQLite engine pattern (mirror `offlineSyncOutbox.test.js`: `createBetterSqliteTestDatabase`, repositories created with `{ database: db }`, engine via `createOutboxSyncEngine({ outboxRepository, stateRepository, database: db, getAuthSession: liveTestSession })` — the injected-database discipline is what makes these tests real). Seed domain rows through the domain repositories and outbox terminal states via `markTerminalFailure` with crafted `last_error` strings. Cover, minimum:

1. Heals an unmarked RLS-terminal row owned by the user: a `children` row `created_by: 'user-1'`, outbox terminal with `last_error: 'new row violates row-level security policy for table "children"'` → `engine.requeueTerminalRlsFailures('user-1')` returns 1; outbox row `pending` with `retry_count` 0 and null `next_retry_at`/`last_error`; **the domain row's `sync_status` is `pending`** (the same-transaction reset).
2. Never heals a marked genuine denial (`last_error` starting `'42501-authenticated:'`) → returns 0, stays terminal, domain row untouched.
3. Never heals another user's records (`created_by: 'user-2'`).
4. Parent lookup: an `assessment_items` terminal row heals via parent `assessments.user_id === 'user-1'`; an orphan item (parent deleted) stays terminal.
5. Hard-delete payload fallback: a `classes` `hard_delete` outbox row with no local row but `payload.created_by === 'user-1'` heals (no domain reset attempted for hard-deletes).
6. Non-RLS terminal rows (e.g. `last_error: 'insert or update on table ... violates foreign key constraint'`) are never candidates.
7. Idempotency: calling twice returns `1` then `0`.
8. `class_grouping_state` heals via its class: a row with null completed/reopened user columns but whose `classes.created_by === 'user-1'` (through `class_id`) heals.

- [ ] **Step 2: Run to verify red**

```bash
npx jest __tests__/requeueTerminalRlsFailures.test.js --verbose
```

Expected: FAIL (`getTerminalRecords`/`requeueTerminalRlsFailures` are not functions).

- [ ] **Step 3: Implement the repository methods**

In `src/db/repositories/syncOutboxRepository.js` add (and export from the returned object):

```javascript
  const getTerminalRecords = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(`
      select *
      from sync_outbox
      where status = 'terminal'
      order by created_at, table_name, record_id
    `);
    return rows.map(toOutboxRecord);
  };

  const requeueTerminalRows = async (ids, { transaction } = {}) => {
    if (!ids || ids.length === 0) return 0;
    return runWrite(transaction, async (txn) => {
      let count = 0;
      for (const id of ids) {
        const result = await txn.runAsync(`
          update sync_outbox
          set status = 'pending',
              retry_count = 0,
              next_retry_at = null,
              last_error = null,
              updated_at = ?
          where id = ?
            and status = 'terminal'
        `, timestamp(), id);
        count += result?.changes || 0;
      }
      return count;
    });
  };
```

- [ ] **Step 4: Implement the heal in `offlineSync.js`**

Module-level helpers (near `AUTHENTICATED_DENIAL_MARKER`):

```javascript
const RLS_ERROR_SIGNATURE = /row-level security|42501/i;

const isHealableRlsError = (record) => {
  const err = record?.last_error;
  if (typeof err !== 'string') return false;
  if (err.startsWith(AUTHENTICATED_DENIAL_MARKER)) return false;
  return RLS_ERROR_SIGNATURE.test(err);
};

// Owner-candidate resolution per synced table. `row` is the local domain row
// (null for hard-deletes whose row is gone); `payload` the outbox snapshot.
// created_by is the schema-true owner on created tables; staff_id/legacy keys
// exist ONLY as payload input fallbacks (repositories normalize them away).
const directOwner = (...columns) => async ({ row, payload }) => (
  columns.map((column) => row?.[column] ?? payload?.[column]).filter(Boolean)
);

const viaParentOwner = (parentTable, foreignKey, parentOwnerColumn) => async ({ db, row, payload }) => {
  const parentId = row?.[foreignKey] ?? payload?.[foreignKey];
  if (!parentId) return [];
  const parent = await db.getFirstAsync(`select * from ${parentTable} where id = ?`, parentId);
  if (!parent) return [];
  return [parent[parentOwnerColumn]].filter(Boolean);
};

const combineOwners = (...resolvers) => async (context) => {
  const owners = [];
  for (const resolver of resolvers) {
    owners.push(...await resolver(context));
  }
  return owners;
};

const OWNER_RESOLVERS = {
  time_entries: directOwner('user_id'),
  classes: directOwner('created_by', 'staff_id'),
  children: directOwner('created_by'),
  child_ea_assignments: directOwner('user_id', 'created_by'),
  child_programme_enrollments: directOwner('created_by'),
  child_class_memberships: directOwner('created_by'),
  class_ea_assignments: directOwner('ea_user_id', 'created_by'),
  grouping_versions: directOwner('created_by', 'accepted_by_user_id', 'archived_by_user_id'),
  class_grouping_state: combineOwners(
    directOwner('class_list_completed_by_user_id', 'class_list_reopened_by_user_id'),
    viaParentOwner('classes', 'class_id', 'created_by'),
  ),
  groups: directOwner('created_by', 'staff_id'),
  group_ea_assignments: directOwner('ea_user_id', 'created_by'),
  child_group_memberships: directOwner('created_by'),
  sessions: directOwner('user_id'),
  session_attendees: viaParentOwner('sessions', 'session_id', 'user_id'),
  assessments: directOwner('user_id'),
  assessment_items: viaParentOwner('assessments', 'assessment_id', 'user_id'),
  letter_mastery: directOwner('user_id'),
};

const genericOwnerResolver = directOwner('user_id', 'created_by', 'staff_id', 'ea_user_id');
```

(Verify every column against the schema in `src/db/migrations.js` while implementing; the review already confirmed `class_grouping_state` has no `created_by` — hence the class fallback — and that `classes`/`groups` carry `created_by` in schema with `staff_id` as payload-only input.)

Engine method (inside `createOutboxSyncEngine`, alongside `retryFailedItem`):

```javascript
  /**
   * Auth-restore heal for RLS-quarantined rows (#44, port of ZZ OTA 1.1.0+4).
   * Unmarked RLS terminals are auth-loss collateral; marked ones
   * (AUTHENTICATED_DENIAL_MARKER, written post-gate with a live session) are
   * genuine denials and are never healed. The outbox requeue and the domain
   * sync_status reset share one transaction so the pending-local-wins pull
   * guard protects the row immediately (terminal rows are outside that guard).
   */
  const requeueTerminalRlsFailures = async (userId) => {
    if (!userId) return 0;
    const db = await resolveDatabase(database);
    const candidates = (await outboxRepository.getTerminalRecords()).filter(isHealableRlsError);
    if (candidates.length === 0) return 0;

    const heals = [];
    for (const record of candidates) {
      const resolver = OWNER_RESOLVERS[record.table_name] || genericOwnerResolver;
      const row = await db.getFirstAsync(
        `select * from ${record.table_name} where id = ?`, record.record_id
      ).catch(() => null);
      const owners = await resolver({ db, row, payload: record.payload });
      if (owners.length === 0) {
        console.warn(`syncRescue: skipping ${record.table_name} ${record.record_id} (no owner field)`);
        continue;
      }
      if (!owners.includes(userId)) {
        console.warn(`syncRescue: skipping ${record.table_name} ${record.record_id} (owner mismatch)`);
        continue;
      }
      heals.push(record);
    }
    if (heals.length === 0) return 0;

    let count = 0;
    await runRepositoryTransaction(database, async (txn) => {
      count = await outboxRepository.requeueTerminalRows(heals.map((record) => record.id), { transaction: txn });
      for (const record of heals) {
        if (record.operation === 'hard_delete') continue;
        const config = getConfig(record.table_name);
        if (config) {
          await setDomainSyncResult(txn, config.tableName, record.record_id, {
            syncStatus: 'pending',
            lastSyncError: null,
          });
        }
      }
    });
    console.log(`syncRescue: requeued ${count} RLS-quarantined outbox rows for ${userId}`);
    return count;
  };
```

Add `requeueTerminalRlsFailures` to the engine's returned object and export the default binding next to the other exports:

```javascript
export const requeueTerminalRlsFailures = (userId) => defaultEngine.requeueTerminalRlsFailures(userId);
```

- [ ] **Step 5: Run green + integration**

```bash
npx jest __tests__/requeueTerminalRlsFailures.test.js --verbose
npm run test:integration
```

- [ ] **Step 6: Commit**

```bash
git add src/services/offlineSync.js src/db/repositories/syncOutboxRepository.js __tests__/requeueTerminalRlsFailures.test.js
git commit -m "feat(sync): auth-restore heal for RLS-quarantined outbox rows (#44)"
```

---

### Task 4: Auth-event wiring in OfflineContext (#44 trigger)

**Files:**
- Modify: `src/context/OfflineContext.js` (new effect; import `supabase` from `../services/supabaseClient` and `requeueTerminalRlsFailures` from `../services/offlineSync`)
- Test: `__tests__/OfflineContext.test.js` (extend)

**Interfaces:**
- Produces: on `SIGNED_IN`, `TOKEN_REFRESHED`, or `INITIAL_SESSION`-with-session, the heal runs for the signed-in user and a background sync is triggered. `SIGNED_OUT` and `INITIAL_SESSION`-without-session do nothing (a null INITIAL_SESSION belongs to AuthContext's cold-start gate, Task 6).

- [ ] **Step 1: Write the failing tests**

In `__tests__/OfflineContext.test.js` (add `requeueTerminalRlsFailures: jest.fn(async () => 0)` to the EXISTING `../src/services/offlineSync` module mock at the top of the file, and add a supabase-client mock — the file has none today (verified), so add `jest.mock('../src/services/supabaseClient', () => ({ supabase: { auth: { onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })) } } }));` and capture the callback):

```javascript
  describe('auth-restore heal wiring', () => {
    const emitAuthEvent = (event, session) => {
      const callback = supabase.auth.onAuthStateChange.mock.calls[0][0];
      return act(async () => { await callback(event, session); });
    };

    test.each([
      ['SIGNED_IN'],
      ['TOKEN_REFRESHED'],
      ['INITIAL_SESSION'],
    ])('%s with a session heals then schedules a sync', async (event) => {
      await renderOfflineHook();
      await emitAuthEvent(event, { user: { id: 'user-1' } });
      expect(requeueTerminalRlsFailures).toHaveBeenCalledWith('user-1');
      await act(async () => { jest.advanceTimersByTime(1500); });
      expect(syncAll).toHaveBeenCalled();
    });

    test('SIGNED_OUT and a null INITIAL_SESSION do not heal', async () => {
      await renderOfflineHook();
      await emitAuthEvent('SIGNED_OUT', null);
      await emitAuthEvent('INITIAL_SESSION', null);
      expect(requeueTerminalRlsFailures).not.toHaveBeenCalled();
    });
  });
```

(Adapt `syncAll` assertions to the file's existing debounce conventions; note Task 1's gate means the triggered `syncAll` is the module mock here, unaffected.)

- [ ] **Step 2: Run red, then implement**

Add to `src/context/OfflineContext.js` (imports: `supabase` from `../services/supabaseClient`; extend the existing `../services/offlineSync` import with `requeueTerminalRlsFailures`), a new effect after the AppState effect:

```javascript
  /**
   * Auth-restore heal: rows RLS-quarantined while the session was dead requeue
   * when a real session returns (#44). Idempotent (healed rows leave the
   * candidate set) and user-scoped, so firing on every restore event is safe.
   * A null INITIAL_SESSION is AuthContext's cold-start concern, not ours.
   */
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const shouldHeal = event === 'SIGNED_IN'
        || event === 'TOKEN_REFRESHED'
        || (event === 'INITIAL_SESSION' && Boolean(session));
      if (!shouldHeal) return;
      const userId = session?.user?.id ?? null;
      if (!userId) return;
      try {
        await requeueTerminalRlsFailures(userId);
      } catch (error) {
        console.error('Auth-restore requeue failed:', error);
      }
      triggerBackgroundSyncRef.current();
    });
    return () => subscription.unsubscribe();
  }, []);
```

- [ ] **Step 3: Run green**

```bash
npx jest __tests__/OfflineContext.test.js --verbose
```

- [ ] **Step 4: Commit**

```bash
git add src/context/OfflineContext.js __tests__/OfflineContext.test.js
git commit -m "feat(sync): requeue RLS-quarantined rows on auth restore (#44)"
```

---

### Task 5: `persistedAuthSession` service (#45 foundation)

**Files:**
- Create: `src/services/persistedAuthSession.js`
- Test: Create `__tests__/persistedAuthSession.test.js`

**Interfaces:**
- Produces: `getAuthStorageKey()`, `readPersistedSession() -> session|null` (only sessions with `refresh_token` and `user.id`; handles auth-js's split `${key}-user` record; null on absent/malformed/any throw), `clearPersistedSession()` (removes the key, `-code-verifier`, `-user`). Port of ZZ's `src/services/persistedAuthSession.js` (73 lines) — adapt imports to masi (`supabase` from `./supabaseClient`, AsyncStorage) and keep the logic identical: prefer `supabase.auth.storageKey`, else derive `sb-<projectRef>-auth-token` from the client URL, else `'supabase.auth.token'`.

- [ ] **Step 1: Port the tests first**

Create `__tests__/persistedAuthSession.test.js` mirroring ZZ's 5-test suite (`zazi-izandi-app/__tests__/persistedAuthSession.test.js`): reads a session that a real `createClient()` persisted (pins the genuine auth-js storage format — follow ZZ's `_saveSession` technique; if masi's supabase-js version differs, write the session JSON in the documented v2 shape instead and note it); null on absent, malformed JSON, and non-refreshable (no refresh_token) sessions; merges split `${key}-user` records; `clearPersistedSession` removes all three keys. Mock AsyncStorage per masi's jest setup (it already mocks AsyncStorage globally; verify and reuse).

- [ ] **Step 2: Red, then port the module, then green**

```bash
npx jest __tests__/persistedAuthSession.test.js --verbose
```

Port ZZ's file with masi imports. IMPORTANT masi check: the storage key must resolve for the ACTIVE backend project ref (`segygjzpujphwvrubusm` in the sqlite-staging config) — `supabase.auth.storageKey` handles this automatically when supabase-js exposes it; the URL-derivation fallback must parse masi's `resolveSupabaseProjectConfig` URL. Add one test asserting the derived key contains the ref parsed from the mocked client URL.

- [ ] **Step 3: Commit**

```bash
git add src/services/persistedAuthSession.js __tests__/persistedAuthSession.test.js
git commit -m "feat(auth): persisted-session reader for offline cold-start restore (#45)"
```

---

### Task 6: AuthContext cold-start gate + echo-proof sign-out (#45)

**The bug:** on a cold start whose INITIAL_SESSION arrives null (stale access token, offline), `AuthContext` commits signed-out immediately — the 15s grace period only arms when `currentUserIdRef.current` is set, which never happens on a cold start (`AuthContext.js:70-82`). The EA is bounced to a login they cannot pass offline. ZZ measured the trigger at ~58.5 min token age; their fix is OTA 1.1.0+10.

**Files:**
- Modify: `src/context/AuthContext.js`
- Test: Create `__tests__/authColdStartRestore.test.js`

**Interfaces:**
- Produces: cold-start null-session events route through `resolveColdStartGate` (restore from persisted session, `session` stays null until `TOKEN_REFRESHED`); genuine `SIGNED_OUT` still clears (correlated against persisted storage: auth-js clears storage BEFORE emitting a genuine SIGNED_OUT, so a surviving persisted session for the current user marks the event as a stale echo); `signOut()` is local-first (clear profile + persisted session + state synchronously, then fire-and-forget `supabase.auth.signOut({ scope: 'local' })`).
- Consumes: Task 5's `readPersistedSession`/`clearPersistedSession`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/authColdStartRestore.test.js`, adapting ZZ's `__tests__/AuthContext.test.js` suite to masi (mock `../src/services/supabaseClient` capturing the `onAuthStateChange` callback; mock `../src/services/persistedAuthSession`; mock `storage`, `pullReferenceData` via the offlineSync module mock, and `enqueueSupabaseRequest`; render a probe exposing `loading|user?.id|session` through `useAuth`). Port these cases, keeping ZZ's names where they apply:

1. `INITIAL_SESSION(null)` with a persisted session (expired token, valid refresh_token) → signed in as the persisted user, `session` null, no `clearUserProfile` call. Double-fire the event: idempotent (single restore).
2. No persisted session → stays signed out (current behavior preserved).
3. Genuine `SIGNED_OUT` (persisted session absent when the event arrives) → clears state.
4. Stale `SIGNED_OUT` echo (persisted session for the current user still present) → ignored, user stays signed in.
5. `signOut()` with the network sign-out hanging forever → resolves `{ error: null }`, state cleared, `clearPersistedSession` called.
6. After local sign-out, a stale `TOKEN_REFRESHED` with the old user does NOT resurrect the session; a real `SIGNED_IN` as another user works, and a late `SIGNED_OUT` echo does not clobber it.
7. `TOKEN_REFRESHED` after an offline restore flips `session` from null to live.
8. The 15s grace period still applies to a non-SIGNED_OUT null event while a user is active (pin existing behavior: 14999ms still signed in, 15000ms signed out).

- [ ] **Step 2: Run red, then implement**

In `src/context/AuthContext.js`:

1. Imports: `readPersistedSession, clearPersistedSession` from `../services/persistedAuthSession`. New ref: `const localSignOutCommittedRef = useRef(false);`.
2. Add above the auth-listener effect:

```javascript
  const restoreOfflineSession = (persistedSession, reason) => {
    clearPendingSignOutTimeout();
    currentUserIdRef.current = persistedSession.user.id;
    setSession(null); // token is not network-fresh; TOKEN_REFRESHED heals it
    setLoading(true);
    scheduleAuthenticatedStartup(persistedSession.user);
    console.log(`[Auth] Restored persisted offline session (${reason})`);
  };

  const resolveColdStartGate = async (reason) => {
    if (localSignOutCommittedRef.current) {
      commitSignedOutState(`${reason}-after-local-sign-out`);
      return;
    }
    const persistedSession = await readPersistedSession();
    const persistedUserId = persistedSession?.user?.id ?? null;
    if (persistedUserId && persistedUserId === currentUserIdRef.current) {
      setLoading(false); // double-fire: already restored
      return;
    }
    if (persistedUserId && !currentUserIdRef.current) {
      restoreOfflineSession(persistedSession, reason);
      return;
    }
    commitSignedOutState(reason);
  };
```

(`scheduleAuthenticatedStartup` already tolerates offline: its `pullReferenceData` is try/caught and `loadUserProfile` serves the local profile first; `hydrateAuthenticatedUser`'s finally sets `setUser(authUser)` + `setLoading(false)`, completing the restore.)

3. In the `onAuthStateChange` handler, rewire the null-session paths. FIRST make the callback async (review finding: masi's listener is synchronous today at `AuthContext.js:48` while the replacement awaits `readPersistedSession`): `supabase.auth.onAuthStateChange((event, nextSession) => {` becomes `supabase.auth.onAuthStateChange(async (event, nextSession) => {`. The `nextSession?.user` branch gains a first line `localSignOutCommittedRef.current = false;` ONLY when `event === 'SIGNED_IN'` (any other event after a local sign-out returns early: add `if (localSignOutCommittedRef.current && event !== 'SIGNED_IN') return;` at the top of that branch). Then replace the tail of the handler (the grace-period block and the final `commitSignedOutState`) with:

```javascript
      if (event === 'SIGNED_OUT') {
        if (manualSignOutInProgressRef.current) {
          manualSignOutInProgressRef.current = false;
          commitSignedOutState('manual-sign-out');
          return;
        }
        // auth-js clears persisted storage BEFORE emitting a genuine SIGNED_OUT.
        // A surviving persisted session for the current user means this event is
        // a stale echo (e.g. a delayed server sign-out after a re-login) — ignore.
        const persisted = await readPersistedSession();
        if (persisted?.user?.id && persisted.user.id === currentUserIdRef.current) {
          console.warn('[Auth] Ignoring stale SIGNED_OUT; a valid session for the current user persists');
          return;
        }
        localSignOutCommittedRef.current = true;
        await storage.clearUserProfile();
        await clearPersistedSession();
        commitSignedOutState('signed-out');
        return;
      }

      // Non-SIGNED_OUT null-session event.
      if (currentUserIdRef.current && !pendingSignOutTimeoutRef.current) {
        // ...keep the existing 15s grace-period block byte-identical...
        return;
      }

      // Cold start: no active user in this JS session. Restore from the
      // persisted session instead of bouncing an offline EA to login (#45).
      resolveColdStartGate(`${event}-no-active-user`);
```

(Preserve the existing grace-period block's body exactly; only its surrounding routing changes.)

4. Make `signOut` local-first:

```javascript
  const signOut = async () => {
    manualSignOutInProgressRef.current = true;
    clearPendingSignOutTimeout();
    invalidateProfileLoads();
    localSignOutCommittedRef.current = true;
    setSession(null);
    setUser(null);
    setProfile(null);
    setLoading(false);
    try {
      await storage.clearUserProfile();
      await clearPersistedSession();
    } catch (error) {
      console.error('Sign out local cleanup error:', error);
    }
    // Best-effort server sign-out OFF the critical path; its delayed SIGNED_OUT
    // echo is neutralised by the persisted-session correlation above.
    supabase.auth.signOut({ scope: 'local' }).catch((error) => {
      console.warn('[Auth] Background Supabase sign-out failed:', error?.message);
    });
    manualSignOutInProgressRef.current = false;
    return { error: null };
  };
```

Check `signOut` callers (`grep -rn "signOut" src/screens`) for anyone depending on the old thrown/error contract; ProfileScreen's handler must still behave (it now always gets `{ error: null }` — acceptable and matches the local-first contract; note it in the commit body if a caller branch dies).

- [ ] **Step 3: Run green + the full suites**

```bash
npx jest __tests__/authColdStartRestore.test.js __tests__/OfflineContext.test.js --verbose
npx jest --silent
npm run test:integration
```

(The pre-existing auth-adjacent suites — HomeScreen, App.plan5, sessionLaunchGuard — must stay green; they mock `useAuth`/AuthProvider and are unaffected structurally.)

- [ ] **Step 4: Commit**

```bash
git add src/context/AuthContext.js __tests__/authColdStartRestore.test.js
git commit -m "fix(auth): offline cold start restores the persisted session; echo-proof local-first sign-out (#45)"
```

---

### Task 7: Contract map + phase wrap

- [ ] **Step 1: Update `documentation/rls-sync-contract-map.md`**

Add a Global Contract entry (follow the numbering/format PR #49 established with Global Contract 8) covering: (a) sync passes are auth-gated (sessionless pass = structured skip, no outbox/meta mutation); (b) terminal `42501` written with a live session carries `42501-authenticated:` in `last_error` and is never auto-healed; (c) unmarked RLS-terminal rows are requeued on auth restore, scoped to the signed-in user via per-table owner resolution (list the resolver table). Reference issues #43/#44.

- [ ] **Step 2: Full gates + docs**

```bash
npx jest --silent
npm run test:integration
```

One row in `documentation/sqlite-refactor-log.md`; tick all plan checkboxes; PRD.md Development Progress entry ("Sync auth hardening (#43-45)" with per-task commits).

- [ ] **Step 3: Commit and hand off**

```bash
git add documentation/rls-sync-contract-map.md documentation/sqlite-refactor-log.md docs/superpowers/plans/2026-07-06-sync-auth-hardening.md PRD.md
git commit -m "docs(sync-auth): contract map global entry, log row, checklists (#43 #44 #45)"
```

Do NOT push or open a PR; the orchestrator handles push, PR, CI, and closing issues #43/#44/#45 after merge.

**Device gate (Jim, after merge):** airplane-mode cold start >1h after last open → lands on Home signed in with local data; capture works; reconnect → sync drains and session refreshes. Sign out offline → login screen; sign back in online → any quarantined dev rows requeue and sync.

---

## Self-review notes

- Spec coverage: #43 acceptance criteria 1/4/5 → Task 1, criterion 2 → Task 2, criterion 3 → Task 4's trigger test; #44 criteria → Tasks 3 (predicate, scoping, idempotency, marker exclusion) and 4 (events, end-to-end via heal+trigger); #45 criteria → Tasks 5-6 (cold start, genuine SIGNED_OUT, refresh-heal, offline local-first sign-out + echo, double-fire idempotency).
- Type consistency: `getAuthSession` (Tasks 1-2), `AUTHENTICATED_DENIAL_MARKER` (Tasks 2-3), `requeueTerminalRlsFailures(userId)` (Tasks 3-4), `readPersistedSession`/`clearPersistedSession` (Tasks 5-6) — names identical at every use site.
- Honest uncertainty flagged inline: owner-resolver columns (Task 3 verify-while-implementing note) and ZZ's `_saveSession` test technique on masi's supabase-js 2.100.1 (review verified `auth.storageKey` and `_saveSession` exist).
- Order: 1→2→3→4 strict (#44 depends on #43's marker); 5→6 strict; the two groups share no files except `OfflineContext.test.js` mocks (Task 4) — keep groups sequential anyway (one Codex thread).

## Review round 1 (Codex adversarial review, 2026-07-07) - dispositions

- **R1 (Blocker, accepted):** the standalone `syncRescue` module used the singleton `syncOutboxRepository`, ignoring the injected test database. Fixed by making the move-into-`offlineSync.js` the primary design: the heal is an engine method over the injected `outboxRepository` + `database` closure, tested through engine construction like every other sync suite.
- **R2 (Major, accepted):** the heal must reset the domain row's `sync_status` in the same transaction — PR #49's pending-local-wins guard excludes terminal rows, so a healed outbox row with a stale terminal domain row was exposed to pull-clobber. Task 3 now requeues and `setDomainSyncResult`s in one transaction; test 1 pins it.
- **R3 (Major, accepted):** the `getAuthSession` stub sweep spans seven engine-constructing suites plus `offlineSync.pendingSessions.test.js`'s supabase module mock, not "one place". Task 1 Step 4 lists them all; the commit list is expanded.
- **R4 (Major, accepted):** `class_grouping_state` has no `created_by`; its resolver now combines the completed/reopened user columns with a class-parent lookup (`classes.created_by` via `class_id`), plus a pinning test.
- **R5 (Major, accepted):** masi's auth listener is synchronous; Task 6 now explicitly makes the callback async before the awaited persisted-session reads.
- **R6 (Minor, accepted):** `classes`/`groups` `staff_id` is a payload-input fallback, not a schema column; resolvers order `created_by` first and the comment says so.
- **R7 (Minor, accepted):** added a batched-42501 regression test to Task 2 (the batch path degrades to the per-record fallback through the single classification site, but the behavior is now pinned).
- **Verified clean by the review:** skip-shape consumers (OfflineContext/SyncStatusScreen/TimeEntriesListScreen), the meta-write-only-in-finally claim, no import cycles, `triggerBackgroundSyncRef` exists, no conflicting supabase mock in OfflineContext tests, `supabase.auth.storageKey` resolves to the sqlite-backend ref on supabase-js 2.100.1, `scheduleAuthenticatedStartup` offline tolerance, and `signOut` caller contracts (ProfileScreen ignores the return value).

# Sync-Status Trust UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sync status tell field staff the truth in a reassuring voice: work is safe on the phone, a retriable backlog is calm ("Saved on your phone · 3 waiting to sync"), only terminal failures read as actionable ("2 items need attention"), and "Last Synced" stops lying ("Never") when the only failures are retriable.

**Architecture:** A count split in `syncOutboxRepository.getSyncStatus` (waiting vs needs-attention vs backed-off, computed as one atomic snapshot), a new pure presenter module (`syncStatusPresenter`) that owns the state machine AND the copy, a `result.success` semantics change in the sync engine (success = no terminal + no preflight), and five UI surfaces re-voiced: header `SyncIndicator`, `SyncStatusScreen`, `OfflineContext` (exposure), the Home banner (extracted into `SyncStatusBanner`), and the work-history pull-to-refresh snackbar. No DB columns, no migrations, no sync-contract change.

**Tech Stack:** React Native (Expo, Hermes) + React 19.1 + `@testing-library/react-native` v13 + Jest (`jest-expo` preset) + better-sqlite3 test adapter for real-engine tests + React Native Paper.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-09-sync-status-trust-ux-design.md` (locked decisions: trust voice = "Saved on your phone"; waiting counts as a successful sync; count-only for waiting, itemize terminal).
- **The copy is the deliverable.** The exact strings live in `src/utils/syncStatusPresenter.js` (Task 2) and are pinned by unit tests. Never paraphrase them in any surface; consume the presenter.
- `result.success === (totalTerminal === 0 && preflightErrors.length === 0)` is the target semantic (spec Seam E). `lastSuccessfulSyncTime` stamps whenever that holds.
- Back-compat: `getSyncStatus` keeps producing `unsyncedCount`, `failedCount`, `failedItems`, `breakdown`, `inFlightCount` unchanged; UI stops consuming the conflated ones.
- Not a sync-contract change: do NOT touch `documentation/rls-sync-contract-map.md`, migrations, RLS policies, payload columns, or outbox ordering. DO log the `result.success` behavioral change in `documentation/sqlite-refactor-log.md` (Task 9).
- Tests live flat in `/__tests__/` as `*.test.js`. Run under Node 20: prefix commands with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Known flake (not a regression): `CreateClassScreen.test.js` can time out under parallel load; it passes in isolation.
- Authored text (code comments, commit messages, docs, UI copy): no em dashes; no agent co-author trailer on commits.
- Commit style: `type(scope): message`. Stage ONLY each task's named files (the working tree carries pre-existing unrelated modifications and untracked dirs; never `git add` them).
- Baseline (main, both green under Node 20): unit 139 suites / 779 tests; integration 24 suites / 182 tests.

## Design deviations locked during planning (verified against the tree)

- **D1 — palette tokens.** The spec says waiting/offline read "calm/blue (`colors.primary`)" and needs-attention reads "amber (`colors.emphasis`)". In this theme (`src/constants/colors.js:40-56`) `primary` and `emphasis` are BOTH brand red `RED[500]`, and there is no blue. The tokens that carry the spec's *intent* are: waiting/offline = `colors.info` (muted `#76696B`, calm), needs_attention = `colors.warning` (amber `#B26A00`), synced = `colors.success`, syncing spinner = `colors.primary` (unchanged from today). Do not use `colors.primary`/`colors.emphasis` for waiting/attention states.
- **D2 — sixth surface: the Home banner.** `src/screens/main/HomeScreen.js:89-117` renders a sync banner from `unsyncedCount` + `failedItems.length` with red "{N} items failed to sync" copy for retriable backoffs (the exact Finding 6 defect; the spec's files-touched list missed it). Per the consistency-full-rollout rule it is in scope: Task 7 extracts it into `src/components/common/SyncStatusBanner.js` driven by the presenter. Consequence of the spec's own edge-case decision: offline with a drained outbox now shows NO banner (previously a gray "Offline" band); the Network Status card on SyncStatusScreen still shows Offline.
- **D3 — presenter gains a third function.** `describeWaitingDetail({ waitingCount, backedOffCount, nextRetryAt })` produces SyncStatusScreen's count-only waiting line and the "Next attempt around {time}" hint. The spec named only `deriveSyncState`/`describeSyncState`, but its principle is "the copy lives in one testable place"; the waiting-section strings are copy.
- **D4 — dependency-skip no longer flips `result.success`.** The skip branch (`src/services/offlineSync.js:1248`) currently sets `result.success = false` when a dependent table is skipped. Under the Seam E formula, a skip after a *retriable* failure must leave success true (nothing terminal, nothing preflight; the rows stay pending); a skip after a *terminal* failure leaves success already false via that record. FOUR existing tests pin the old semantics on retriable failures and are updated in place as part of the feature (Task 3 Step 3d): `__tests__/offlineSyncOutbox.test.js:1888` ("skips dependent rows..."), `:2053` (retriable network failure with backoff metadata, in the retry-scheduling test), `:1757` ("keeps child EA archive pending..." — its 42501 is an evidence-pending retriable DOWNGRADE, not terminal; misclassified by all three static audits and caught by the build gate, R9), and `__tests__/offlineSyncAuthGate.test.js:237-241` ("a 42501 after the session vanished mid-cycle is retriable, not terminal" — the downgraded 42501 leaves a retriable `failed` row, so the pass is now successful; found by adversarial review R4). All other `success === false` assertions in the suite were audited and stay unchanged because they are terminal or preflight fixtures: `syncErrorGuard.test.js:531,597` (preflight); `offlineSyncOutbox.test.js:1406` (23503 terminal), `:1584` (missing payload), `:1611` (unknown table), `:1954` (23503/42501 terminal), `:2018` (23505 duplicate), `:2091` (ARCHIVE_REQUIRED); `offlineSyncAuthGate.test.js:270-274` and `:309-313` (live-session 42501s, terminal with the authenticated marker).
- **D5 — `skippedNoSession` result shape.** The auth-gate early return (`offlineSync.js:1157-1167`) gains `totalTerminal: 0, totalRetriable: 0` so every `syncAll` result carries the same fields.

## File Structure

- `src/db/repositories/syncOutboxRepository.js` (modify) — Seam A: `waitingCount`/`needsAttentionCount`/`backedOffCount`/`nextRetryAt`/`needsAttentionItems`; `toFailedItem` gains `nextRetryAt`/`retryCount`.
- `src/utils/syncStatusPresenter.js` (create) — Seam B: `deriveSyncState`, `describeSyncState`, `describeWaitingDetail`; the single home of the trust copy.
- `src/services/offlineSync.js` (modify) — Seam E: `result.success` semantics, `totalTerminal`/`totalRetriable`, skip branch no longer flips success.
- `src/context/OfflineContext.js` (modify) — Seam C dependency: expose `waitingCount`/`needsAttentionCount`/`nextRetryAt`.
- `src/components/common/SyncIndicator.js` (modify) — Seam C: presenter-driven header indicator.
- `src/screens/main/SyncStatusScreen.js` (modify) — Seam D: summary card, count-only waiting, itemized Needs Attention.
- `src/components/common/SyncStatusBanner.js` (create) — Seam F (D2): presenter-driven Home banner.
- `src/screens/main/HomeScreen.js` (modify) — Seam F: swap inline banner for `SyncStatusBanner`.
- `src/screens/main/TimeEntriesListScreen.js` (modify) — Seam G (R6): trust-voice pull-to-refresh snackbars.
- Tests: `__tests__/syncOutboxRepository.test.js` (append), `__tests__/syncStatusPresenter.test.js` (create), `__tests__/offlineSyncResultSemantics.test.js` (create), `__tests__/offlineSyncOutbox.test.js` (update 2 assertions), `__tests__/offlineSyncAuthGate.test.js` (update 1 assertion, R4), `__tests__/OfflineContext.test.js` (append + mock shape), `__tests__/syncIndicator.test.js` (create), `__tests__/syncStatusScreen.test.js` (rewrite), `__tests__/syncStatusBanner.test.js` (create), `__tests__/HomeScreen.test.js` (mock shape only), `__tests__/TimeEntriesListScreen.syncVoice.test.js` (create).
- Docs (modify): `documentation/sqlite-refactor-log.md`, spec status line.

---

### Task 1: Seam A — count split in `syncOutboxRepository.getSyncStatus`

Split retriable-vs-terminal in the summary the repository already produces. `waitingCount` = pending + failed + in_flight (everything still owed except terminal; R5 — a row stranded `in_flight` by a killed pass must not read as synced), `needsAttentionCount` = terminal, `backedOffCount`/`nextRetryAt` from failed rows with a future `next_retry_at`, `needsAttentionItems` = the terminal subset of `failedItems`. `toFailedItem` gains `nextRetryAt` and `retryCount`. The whole summary is computed from ONE `select *` snapshot (R1): the previous multi-query shape could interleave with a sync pass and return counts that contradict the itemized lists.

**Files:**
- Modify: `src/db/repositories/syncOutboxRepository.js:18-25` (`toFailedItem`), `:219-255` (`getSyncStatus`)
- Test: `__tests__/syncOutboxRepository.test.js` (append two tests)

**Interfaces:**
- Consumes: existing `sync_outbox` schema (`status IN ('pending','in_flight','failed','terminal')`, `next_retry_at`, `retry_count`); `timestamp()` already imported in the file.
- Produces: `getSyncStatus()` additionally returns `{ waitingCount: number, needsAttentionCount: number, backedOffCount: number, nextRetryAt: string|null, needsAttentionItems: FailedItem[] }`; `waitingCount = unsyncedCount + inFlightCount` (R5 supersedes the spec's "equals today's unsyncedCount"). `FailedItem` additionally carries `{ nextRetryAt: string|null, retryCount: number }`. Existing fields unchanged. Tasks 4/6 rely on these exact names.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('SQLite sync outbox repository', ...)` block of `__tests__/syncOutboxRepository.test.js`:

```javascript
  test('getSyncStatus splits waiting, backed-off, and needs-attention counts in one snapshot', async () => {
    await outbox.enqueue({ tableName: 'children', recordId: 'pending-1', operation: 'insert', payload: { id: 'pending-1' } });
    await outbox.enqueue({ tableName: 'sessions', recordId: 'ready-failed-1', operation: 'insert', payload: { id: 'ready-failed-1' } });
    await outbox.enqueue({ tableName: 'sessions', recordId: 'backed-off-1', operation: 'insert', payload: { id: 'backed-off-1' } });
    await outbox.enqueue({ tableName: 'assessments', recordId: 'terminal-1', operation: 'insert', payload: { id: 'terminal-1' } });
    await outbox.enqueue({ tableName: 'groups', recordId: 'stranded-1', operation: 'insert', payload: { id: 'stranded-1' } });

    // next_retry_at null means "ready now" (still waiting, not backed off).
    await outbox.markRetriableFailure('sessions:ready-failed-1:insert', { errorMessage: 'network down' });
    await outbox.markRetriableFailure('sessions:backed-off-1:insert', {
      errorMessage: 'server busy',
      nextRetryAt: '2099-01-01T00:00:00.000Z',
    });
    await outbox.markTerminalFailure('assessments:terminal-1:insert', { errorMessage: 'RLS denied' });
    // A row stranded in_flight by a killed pass is still owed (R5): it counts as waiting.
    await outbox.markInFlight(['groups:stranded-1:insert']);

    const status = await outbox.getSyncStatus();

    expect(status.waitingCount).toBe(4);        // pending + both retriable-failed + stranded in_flight
    expect(status.needsAttentionCount).toBe(1); // terminal only
    expect(status.backedOffCount).toBe(1);      // failed with a future next_retry_at
    expect(status.nextRetryAt).toBe('2099-01-01T00:00:00.000Z');

    // Back-compat fields unchanged.
    expect(status.unsyncedCount).toBe(3);       // in_flight still excluded here, as before
    expect(status.failedCount).toBe(3);         // failed(2) + terminal(1), conflated as before
    expect(status.inFlightCount).toBe(1);

    // Itemized terminal rows only, now carrying retry metadata.
    expect(status.needsAttentionItems).toEqual([
      expect.objectContaining({
        table: 'assessments',
        id: 'terminal-1',
        terminal: true,
        nextRetryAt: null,
        retryCount: 0,
      }),
    ]);
    const backedOffItem = status.failedItems.find((item) => item.id === 'backed-off-1');
    expect(backedOffItem).toEqual(expect.objectContaining({
      nextRetryAt: '2099-01-01T00:00:00.000Z',
      retryCount: 1,
    }));
  });

  test('getSyncStatus on an empty outbox reports zero split counts and no nextRetryAt', async () => {
    const status = await outbox.getSyncStatus();
    expect(status).toEqual(expect.objectContaining({
      waitingCount: 0,
      needsAttentionCount: 0,
      backedOffCount: 0,
      nextRetryAt: null,
      needsAttentionItems: [],
    }));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest syncOutboxRepository -c package.json`
Expected: FAIL — `status.waitingCount` is `undefined`.

- [ ] **Step 3: Implement the split**

In `src/db/repositories/syncOutboxRepository.js`, replace `toFailedItem` (lines 18-25) with:

```javascript
const toFailedItem = (row) => ({
  table: row.table_name,
  id: row.record_id,
  operation: row.operation,
  reason: row.last_error || 'Sync failed',
  failedAt: row.updated_at,
  terminal: row.status === 'terminal',
  nextRetryAt: row.next_retry_at || null,
  retryCount: row.retry_count || 0,
});
```

Replace `getSyncStatus` (lines 219-255) with:

```javascript
  const getSyncStatus = async () => {
    const db = await resolveDatabase(database);
    // ONE statement = one snapshot (R1): counts and itemized lists must never disagree.
    // Separate queries can interleave with a sync pass finalizing rows, yielding e.g.
    // needsAttentionCount 1 with an empty needsAttentionItems. The outbox is a small,
    // bounded backlog, so loading it whole is cheap.
    const rows = await db.getAllAsync('select * from sync_outbox');
    const now = timestamp();

    const breakdown = {};
    let unsyncedCount = 0;
    let failedCount = 0;
    let inFlightCount = 0;
    let needsAttentionCount = 0;
    let backedOffCount = 0;
    let nextRetryAt = null;

    for (const row of rows) {
      if (!(row.table_name in breakdown)) {
        breakdown[row.table_name] = 0;
      }

      if (row.status === 'pending' || row.status === 'failed') {
        breakdown[row.table_name] += 1;
        unsyncedCount += 1;
      }
      if (row.status === 'failed' || row.status === 'terminal') {
        failedCount += 1;
      }
      if (row.status === 'in_flight') {
        inFlightCount += 1;
      }
      if (row.status === 'terminal') {
        needsAttentionCount += 1;
      }
      // Backed-off subset of waiting: retriable failures whose next attempt is in the
      // future. ISO-8601 UTC strings compare correctly as text.
      if (row.status === 'failed' && row.next_retry_at && row.next_retry_at > now) {
        backedOffCount += 1;
        if (!nextRetryAt || row.next_retry_at < nextRetryAt) {
          nextRetryAt = row.next_retry_at;
        }
      }
    }

    // Same ordering as getFailedItems (failed first, then updated_at, table, record).
    const failedItems = rows
      .filter((row) => row.status === 'failed' || row.status === 'terminal')
      .sort((a, b) => (
        ((a.status === 'failed' ? 0 : 1) - (b.status === 'failed' ? 0 : 1))
        || (a.updated_at || '').localeCompare(b.updated_at || '')
        || a.table_name.localeCompare(b.table_name)
        || a.record_id.localeCompare(b.record_id)
      ))
      .map(toFailedItem);

    return {
      unsyncedCount,
      failedCount,
      inFlightCount,
      // Everything still owed except terminal (R5): a row stranded in_flight by a killed
      // pass must read as waiting, not as synced. resetInFlight only runs at the start of
      // the NEXT pass, which never comes while offline.
      waitingCount: unsyncedCount + inFlightCount,
      needsAttentionCount,
      backedOffCount,
      nextRetryAt,
      breakdown,
      failedItems,
      needsAttentionItems: failedItems.filter((item) => item.terminal),
    };
  };
```

(`getFailedItems` itself is unchanged and stays exported for other callers; `getSyncStatus` simply no longer calls it, deriving the same list from its own snapshot.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest syncOutboxRepository -c package.json`
Expected: PASS (existing suite + 2 new tests). The pre-existing `getFailedItems`/`getSyncStatus` tests must stay green (the new `toFailedItem` fields are additive).

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/syncOutboxRepository.js __tests__/syncOutboxRepository.test.js
git commit -m "feat(sync-status): split waiting vs needs-attention counts in outbox status"
```

---

### Task 2: Seam B — `syncStatusPresenter` (the trust voice lives here)

New pure module: the five-state machine and every field-facing string. No React, no I/O; unit-tested against exact strings.

**Files:**
- Create: `src/utils/syncStatusPresenter.js`
- Test: `__tests__/syncStatusPresenter.test.js`

**Interfaces:**
- Consumes: `colors` from `src/constants/colors` (D1 tokens only: `info`, `warning`, `success`, `primary`).
- Produces (Tasks 5/6/7 consume these exact signatures):
  - `deriveSyncState({ isOnline, isSyncing, waitingCount, needsAttentionCount }) → 'syncing'|'needs_attention'|'offline'|'waiting'|'synced'`
  - `describeSyncState(state, { waitingCount, needsAttentionCount }) → { icon: string|null, color, backgroundColor, message, badgeCount, accessibilityLabel }`
  - `describeWaitingDetail({ waitingCount, backedOffCount, nextRetryAt }) → { title, detail: string|null } | null`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/syncStatusPresenter.test.js`:

```javascript
import { deriveSyncState, describeSyncState, describeWaitingDetail } from '../src/utils/syncStatusPresenter';
import { colors } from '../src/constants/colors';

describe('deriveSyncState priority', () => {
  const base = { isOnline: true, isSyncing: false, waitingCount: 0, needsAttentionCount: 0 };

  test('all quiet reads synced', () => {
    expect(deriveSyncState(base)).toBe('synced');
  });

  test('waiting items read waiting', () => {
    expect(deriveSyncState({ ...base, waitingCount: 3 })).toBe('waiting');
  });

  test('offline with waiting items reads offline', () => {
    expect(deriveSyncState({ ...base, isOnline: false, waitingCount: 3 })).toBe('offline');
  });

  test('terminal items read needs_attention', () => {
    expect(deriveSyncState({ ...base, needsAttentionCount: 1 })).toBe('needs_attention');
  });

  test('syncing wins over everything', () => {
    expect(deriveSyncState({ ...base, isSyncing: true, waitingCount: 5, needsAttentionCount: 2 })).toBe('syncing');
  });

  test('terminal wins over waiting (never hidden behind a calm state)', () => {
    expect(deriveSyncState({ ...base, waitingCount: 5, needsAttentionCount: 1 })).toBe('needs_attention');
  });

  test('terminal surfaces even offline', () => {
    expect(deriveSyncState({ ...base, isOnline: false, waitingCount: 2, needsAttentionCount: 1 })).toBe('needs_attention');
  });

  test('offline with a drained outbox is synced, not a problem', () => {
    expect(deriveSyncState({ ...base, isOnline: false })).toBe('synced');
  });

  test('undefined counts are treated as zero', () => {
    expect(deriveSyncState({ isOnline: true, isSyncing: false })).toBe('synced');
  });
});

describe('describeSyncState copy (the trust voice is the deliverable; exact strings)', () => {
  test('synced', () => {
    expect(describeSyncState('synced', {})).toEqual({
      icon: 'checkmark-circle-outline',
      color: colors.success,
      backgroundColor: colors.success + '20',
      message: 'All saved and synced',
      badgeCount: 0,
      accessibilityLabel: 'All saved and synced',
    });
  });

  test('waiting plural', () => {
    expect(describeSyncState('waiting', { waitingCount: 3 })).toEqual({
      icon: 'cloud-upload-outline',
      color: colors.info,
      backgroundColor: colors.info + '20',
      message: 'Saved on your phone · 3 waiting to sync',
      badgeCount: 3,
      accessibilityLabel: 'Saved on your phone. 3 items waiting to sync',
    });
  });

  test('waiting singular', () => {
    const view = describeSyncState('waiting', { waitingCount: 1 });
    expect(view.message).toBe('Saved on your phone · 1 waiting to sync');
    expect(view.accessibilityLabel).toBe('Saved on your phone. 1 item waiting to sync');
  });

  test('offline keeps the reassurance and the calm palette', () => {
    const view = describeSyncState('offline', { waitingCount: 2 });
    expect(view.message).toBe("Saved on your phone · 2 will sync when you're online");
    expect(view.accessibilityLabel).toBe("Saved on your phone. 2 items will sync when you're online");
    expect(view.icon).toBe('cloud-offline-outline');
    expect(view.color).toBe(colors.info);
    expect(view.badgeCount).toBe(2);
  });

  test('needs_attention plural is amber and actionable', () => {
    expect(describeSyncState('needs_attention', { needsAttentionCount: 2 })).toEqual({
      icon: 'alert-circle-outline',
      color: colors.warning,
      backgroundColor: colors.warning + '20',
      message: '2 items need attention',
      badgeCount: 2,
      accessibilityLabel: '2 items need attention',
    });
  });

  test('needs_attention singular', () => {
    expect(describeSyncState('needs_attention', { needsAttentionCount: 1 }).message).toBe('1 item needs attention');
  });

  test('badge shows the actionable count, not the waiting count, in needs_attention', () => {
    expect(describeSyncState('needs_attention', { waitingCount: 9, needsAttentionCount: 2 }).badgeCount).toBe(2);
  });

  test('syncing', () => {
    const view = describeSyncState('syncing', {});
    expect(view.message).toBe('Syncing…');
    expect(view.icon).toBeNull();
    expect(view.badgeCount).toBe(0);
    expect(view.accessibilityLabel).toBe('Syncing');
  });
});

describe('describeWaitingDetail', () => {
  test('null when nothing is waiting', () => {
    expect(describeWaitingDetail({ waitingCount: 0 })).toBeNull();
  });

  test('count-only line with no retry hint when nothing is backed off', () => {
    expect(describeWaitingDetail({ waitingCount: 3 })).toEqual({
      title: '3 items saved on your phone, waiting to sync',
      detail: null,
    });
  });

  test('singular title', () => {
    expect(describeWaitingDetail({ waitingCount: 1 }).title).toBe('1 item saved on your phone, waiting to sync');
  });

  test('backed-off rows add the next-attempt hint', () => {
    const nextRetryAt = '2026-07-10T12:30:00.000Z';
    // Locale-proof: compute the expected rendering with the same formatter.
    const expected = new Date(nextRetryAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    expect(describeWaitingDetail({ waitingCount: 2, backedOffCount: 1, nextRetryAt }).detail)
      .toBe(`Next attempt around ${expected}`);
  });

  test('a backed-off count without a timestamp yields no hint', () => {
    expect(describeWaitingDetail({ waitingCount: 2, backedOffCount: 1, nextRetryAt: null }).detail).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest syncStatusPresenter -c package.json`
Expected: FAIL — cannot find module `../src/utils/syncStatusPresenter`.

- [ ] **Step 3: Create the presenter**

Create `src/utils/syncStatusPresenter.js`:

```javascript
import { colors } from '../constants/colors';

// Sync-status trust presenter (ZZ Finding 6). The state machine AND the field-facing copy
// live here so every surface (Home banner, header indicator, sync screen) tells the same
// story: locally-saved work is safe ("Saved on your phone"), a retriable backlog is calm,
// and only terminal failures read as actionable. Palette note: this theme has no blue;
// "calm" is colors.info (muted) and "actionable" is colors.warning (amber). Do not use
// colors.primary/colors.emphasis here (both are brand red).

export const deriveSyncState = ({
  isOnline,
  isSyncing,
  waitingCount = 0,
  needsAttentionCount = 0,
} = {}) => {
  if (isSyncing) return 'syncing';
  if (needsAttentionCount > 0) return 'needs_attention';
  if (!isOnline && waitingCount > 0) return 'offline';
  if (waitingCount > 0) return 'waiting';
  return 'synced';
};

const plural = (count, singular, pluralForm) => (count === 1 ? singular : pluralForm);

export const describeSyncState = (state, { waitingCount = 0, needsAttentionCount = 0 } = {}) => {
  switch (state) {
    case 'syncing':
      return {
        icon: null,
        color: colors.primary,
        backgroundColor: colors.info + '20',
        message: 'Syncing…',
        badgeCount: 0,
        accessibilityLabel: 'Syncing',
      };
    case 'needs_attention': {
      const message = `${needsAttentionCount} ${plural(needsAttentionCount, 'item needs', 'items need')} attention`;
      return {
        icon: 'alert-circle-outline',
        color: colors.warning,
        backgroundColor: colors.warning + '20',
        message,
        badgeCount: needsAttentionCount,
        accessibilityLabel: message,
      };
    }
    case 'offline':
      return {
        icon: 'cloud-offline-outline',
        color: colors.info,
        backgroundColor: colors.info + '20',
        message: `Saved on your phone · ${waitingCount} will sync when you're online`,
        badgeCount: waitingCount,
        accessibilityLabel: `Saved on your phone. ${waitingCount} ${plural(waitingCount, 'item', 'items')} will sync when you're online`,
      };
    case 'waiting':
      return {
        icon: 'cloud-upload-outline',
        color: colors.info,
        backgroundColor: colors.info + '20',
        message: `Saved on your phone · ${waitingCount} waiting to sync`,
        badgeCount: waitingCount,
        accessibilityLabel: `Saved on your phone. ${waitingCount} ${plural(waitingCount, 'item', 'items')} waiting to sync`,
      };
    case 'synced':
    default:
      return {
        icon: 'checkmark-circle-outline',
        color: colors.success,
        backgroundColor: colors.success + '20',
        message: 'All saved and synced',
        badgeCount: 0,
        accessibilityLabel: 'All saved and synced',
      };
  }
};

export const describeWaitingDetail = ({ waitingCount = 0, backedOffCount = 0, nextRetryAt = null } = {}) => {
  if (waitingCount <= 0) return null;
  const title = `${waitingCount} ${plural(waitingCount, 'item', 'items')} saved on your phone, waiting to sync`;
  let detail = null;
  if (backedOffCount > 0 && nextRetryAt) {
    const time = new Date(nextRetryAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    detail = `Next attempt around ${time}`;
  }
  return { title, detail };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest syncStatusPresenter -c package.json`
Expected: PASS (22 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/syncStatusPresenter.js __tests__/syncStatusPresenter.test.js
git commit -m "feat(sync-status): add syncStatusPresenter with trust-voice states and copy"
```

---

### Task 3: Seam E — `result.success` = no terminal + no preflight

The engine already classifies per-record failures (`recordResult.terminal`); `applyRecordResult` just ignores the flag. Make `success` track terminal/preflight only, add `totalTerminal`/`totalRetriable`, stop the dependency-skip branch from flipping success (D4), and update the two existing tests that pinned the old semantics.

**Files:**
- Modify: `src/services/offlineSync.js:1157-1167` (skippedNoSession shape), `:1170-1178` (result init), `:1181-1198` (`applyRecordResult`), `:1237-1251` (skip branch)
- Test: `__tests__/offlineSyncResultSemantics.test.js` (create), `__tests__/offlineSyncOutbox.test.js:1888` and `:2053` (update in place)

**Interfaces:**
- Consumes: `recordResult.terminal` (already produced by `processRecord`/`processBatch`/the loop's catch on every failure path); `createSyncStateRepository({ database }).getSyncMeta()` for meta assertions.
- Produces: `syncAll` result gains `totalTerminal: number`, `totalRetriable: number`; `result.success` semantics = `totalTerminal === 0 && preflightErrors.length === 0`. `lastSuccessfulSyncTime` stamping (existing `finally` block, unchanged code) now follows the new semantics.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/offlineSyncResultSemantics.test.js`:

```javascript
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({ supabase: {} }));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import { createOutboxSyncEngine } from '../src/services/offlineSync';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createSyncStateRepository } from '../src/db/repositories/syncStateRepository';

const liveTestSession = async () => ({ data: { session: { user: { id: 'test-user' } } } });

const createSupabaseMock = ({ upsertResults = {} } = {}) => {
  const supabaseClient = {
    from: jest.fn((tableName) => ({
      upsert: jest.fn(async () => upsertResults[tableName] || { error: null }),
      delete: jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) })),
    })),
    rpc: jest.fn(async () => ({ data: true, error: null })),
  };
  return { supabaseClient };
};

describe('syncAll result.success semantics (trust UX, Finding 6)', () => {
  let db;
  let outbox;
  let stateRepository;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    outbox = createSyncOutboxRepository({ database: db });
    stateRepository = createSyncStateRepository({ database: db });
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  // A bare child (no class_id) has no pending FK/grant evidence, so a 42501 on it is a
  // genuine terminal denial while a code-less error stays retriable.
  const seedChild = async (id) => {
    await db.runAsync(
      "insert into children (id, first_name, last_name, sync_status) values (?, 'Amahle', 'Dlamini', 'pending')",
      id,
    );
    await outbox.enqueue({
      tableName: 'children',
      recordId: id,
      operation: 'insert',
      payload: { id, first_name: 'Amahle', last_name: 'Dlamini' },
    });
  };

  test('a retriable failure leaves the pass successful and stamps lastSuccessfulSyncTime', async () => {
    await seedChild('child-wait');
    const { supabaseClient } = createSupabaseMock({
      upsertResults: { children: { error: { message: 'network down' } } },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(result.totalRetriable).toBe(1);
    expect(result.totalTerminal).toBe(0);
    expect(result.totalFailed).toBe(1);
    // The record is still owed: retriable-failed in the outbox, not terminal.
    expect((await outbox.getById('children:child-wait:insert')).status).toBe('failed');

    const meta = await stateRepository.getSyncMeta();
    expect(meta.lastSyncTime).toBeTruthy();
    expect(meta.lastSuccessfulSyncTime).toBe(meta.lastSyncTime);
  });

  test('a terminal failure flips success false and does not stamp lastSuccessfulSyncTime', async () => {
    await seedChild('child-stuck');
    const { supabaseClient } = createSupabaseMock({
      upsertResults: { children: { error: { code: '42501', message: 'row-level security' } } },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(false);
    expect(result.totalTerminal).toBe(1);
    expect(result.totalRetriable).toBe(0);
    expect((await outbox.getById('children:child-stuck:insert')).status).toBe('terminal');

    const meta = await stateRepository.getSyncMeta();
    expect(meta.lastSyncTime).toBeTruthy();
    expect(meta.lastSuccessfulSyncTime).toBeNull();
  });

  test('a preflight error flips success false even when every record is fine', async () => {
    await seedChild('child-fine');
    const { supabaseClient } = createSupabaseMock();
    const failingOutbox = {
      ...outbox,
      resetInFlight: jest.fn(async () => { throw new Error('disk I/O error'); }),
    };
    const engine = createOutboxSyncEngine({
      getAuthSession: liveTestSession,
      database: db,
      supabaseClient,
      outboxRepository: failingOutbox,
    });

    const result = await engine.syncAll();

    expect(result.success).toBe(false);
    expect(result.preflightErrors.some((entry) => entry.step === 'resetInFlight')).toBe(true);

    const meta = await stateRepository.getSyncMeta();
    expect(meta.lastSuccessfulSyncTime).toBeNull();
  });

  test('a retriable failure plus skipped dependents still counts as a successful pass', async () => {
    await seedChild('child-wait');
    await db.runAsync(
      "insert into child_ea_assignments (id, user_id, child_id, sync_status) values ('assignment-1', 'user-1', 'child-wait', 'pending')",
    );
    await outbox.enqueue({
      tableName: 'child_ea_assignments',
      recordId: 'assignment-1',
      operation: 'insert',
      payload: { id: 'assignment-1', user_id: 'user-1', child_id: 'child-wait' },
    });
    const { supabaseClient } = createSupabaseMock({
      upsertResults: { children: { error: { message: 'network down' } } },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.tableResults.child_ea_assignments).toEqual(expect.objectContaining({
      skipped: true,
      skippedDependency: 'children',
    }));
    expect(result.success).toBe(true);
    const meta = await stateRepository.getSyncMeta();
    expect(meta.lastSuccessfulSyncTime).toBe(meta.lastSyncTime);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest offlineSyncResultSemantics -c package.json`
Expected: FAIL — retriable test sees `result.success === false` and `totalRetriable` undefined; the preflight and terminal tests may already pass (they pin unchanged behavior plus the new counters).

- [ ] **Step 3a: Result shape**

In `src/services/offlineSync.js`, add the two counters to the `skippedNoSession` early return (lines 1157-1167):

```javascript
      return {
        success: true,
        skippedNoSession: true,
        totalSynced: 0,
        totalFailed: 0,
        totalTerminal: 0,
        totalRetriable: 0,
        failedRecords: [],
        tableResults: {},
        preflightErrors: [],
        durationMs: 0,
      };
```

And to the result init (lines 1170-1178):

```javascript
    const result = {
      success: true,
      totalSynced: 0,
      totalFailed: 0,
      totalTerminal: 0,
      totalRetriable: 0,
      failedRecords: [],
      tableResults: {},
      preflightErrors: [],
      durationMs: 0,
    };
```

- [ ] **Step 3b: `applyRecordResult` honors the terminal flag**

Replace the body of `applyRecordResult` (lines 1181-1198) with:

```javascript
    const applyRecordResult = (outboxRecord, config, recordResult) => {
      const tableKey = config?.tableName || outboxRecord.table_name;
      if (!result.tableResults[tableKey]) {
        result.tableResults[tableKey] = { success: true, synced: 0, failed: 0 };
      }

      if (recordResult.success) {
        result.totalSynced += 1;
        result.tableResults[tableKey].synced += 1;
      } else {
        // Trust semantics (Finding 6): only a terminal record makes the pass unsuccessful.
        // A retriable/backed-off record is safe on the device and will retry; it must not
        // read like a broken sync (it used to hold "Last Synced" at Never indefinitely).
        if (recordResult.terminal) {
          result.success = false;
          result.totalTerminal += 1;
        } else {
          result.totalRetriable += 1;
        }
        result.totalFailed += 1;
        result.tableResults[tableKey].success = false;
        result.tableResults[tableKey].failed += 1;
        result.failedRecords.push(recordResult.failedRecord);
        failedTables.add(tableKey);
      }
    };
```

- [ ] **Step 3c: Dependency skips no longer flip the pass (D4)**

In the skip branch (lines 1237-1251), delete the line `result.success = false;` so the branch reads:

```javascript
        if (skippedDependency) {
          const tableResult = result.tableResults[outboxRecord.table_name] || {
            success: false,
            synced: 0,
            failed: 0,
            skipped: true,
            skippedDependency,
          };
          tableResult.skipped = true;
          tableResult.skippedDependency = skippedDependency;
          result.tableResults[outboxRecord.table_name] = tableResult;
          // Skipped rows stay pending for the next pass. Whether this pass "succeeded" is
          // decided by the blocking failure itself: terminal already flipped success in
          // applyRecordResult; a retriable block leaves the pass successful.
          failedTables.add(outboxRecord.table_name);
          continue;
        }
```

- [ ] **Step 3d: Update the two tests that pinned the old semantics (D4 audit)**

In `__tests__/offlineSyncOutbox.test.js`, test `'skips dependent rows when a parent table fails in the same sync cycle'` (line 1888): replace `expect(result.success).toBe(false);` with:

```javascript
    // Finding 6 semantics: a retriable parent failure with skipped dependents is still a
    // successful pass (nothing terminal, nothing preflight); the work simply waits.
    expect(result.success).toBe(true);
    expect(result.totalRetriable).toBe(1);
    expect(result.totalTerminal).toBe(0);
```

In the retry-scheduling test that asserts backoff metadata for a retriable classes failure (line 2053): replace `expect(result.success).toBe(false);` with:

```javascript
      // Finding 6 semantics: a backed-off retriable failure no longer flips the pass.
      expect(result.success).toBe(true);
      expect(result.totalRetriable).toBe(1);
```

In `__tests__/offlineSyncAuthGate.test.js`, test `'a 42501 after the session vanished mid-cycle is retriable, not terminal'` (lines 237-241; R4): the downgraded 42501 leaves a retriable `failed` row, so replace the result assertion with:

```javascript
    expect(result).toEqual(expect.objectContaining({
      // Finding 6 semantics: the downgraded (retriable) 42501 leaves the pass successful.
      success: true,
      totalSynced: 0,
      totalFailed: 1,
      totalRetriable: 1,
      totalTerminal: 0,
    }));
```

(The other two `success: false` assertions in that file, lines 270-274 and 309-313, are live-session terminal 42501s and stay unchanged.)

In `__tests__/offlineSyncOutbox.test.js`, test `'keeps child EA archive pending when relationship cleanup fails'` (line 1757; R9, found by the Step 4 gate): the 42501 on `child_group_memberships` is DOWNGRADED to retriable because the child's `child_ea_assignments` grant row is still locally pending (`computeEvidencePending` returns true), so replace `expect(result.success).toBe(false);` with:

```javascript
    // Finding 6 semantics: this RLS denial is downgraded to retriable (its grant evidence
    // is still pending locally), so the pass itself is successful.
    expect(result.success).toBe(true);
    expect(result.totalRetriable).toBe(1);
    expect(result.totalTerminal).toBe(0);
```

Change NOTHING else in any of the four tests: the outbox/domain-row assertions (`status: 'failed'`, backoff timestamps, marker checks, skip bookkeeping, call ordering) still pin the retry machinery.

- [ ] **Step 4: Run the full engine surface to verify**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest offlineSync syncErrorGuard forceStopReopenOutbox letterMasterySync -c package.json`
Expected: PASS. The `offlineSync` pattern covers the new semantics suite plus `offlineSyncOutbox`, `offlineSyncAuthGate` (whose session-vanished test now asserts the new semantics per Step 3d), `offlineSync.pendingSessions`, `offlineSync.stripping`; `syncErrorGuard`'s preflight tests (`:531`, `:597`) stay green unchanged (preflight still flips success).

- [ ] **Step 5: Commit**

```bash
git add src/services/offlineSync.js __tests__/offlineSyncResultSemantics.test.js __tests__/offlineSyncOutbox.test.js __tests__/offlineSyncAuthGate.test.js
git commit -m "feat(sync): success means no terminal and no preflight failures"
```

---

### Task 4: Seam C dependency — `OfflineContext` exposes the split counts

Derive `waitingCount`/`needsAttentionCount`/`nextRetryAt` from the `syncStatus` state the provider already holds. No new fetches, no listener changes.

**Files:**
- Modify: `src/context/OfflineContext.js` (createContext defaults at lines 9-19; derived values + `value` at lines 248-258)
- Test: `__tests__/OfflineContext.test.js` (append one test; extend the base mock shape)

**Interfaces:**
- Consumes: `getSyncStatus()` result fields from Task 1 (`waitingCount`, `needsAttentionCount`, `nextRetryAt`).
- Produces: `useOffline()` additionally returns `{ waitingCount: number, needsAttentionCount: number, nextRetryAt: string|null }`. Tasks 5/6/7 consume these. (`backedOffCount`/`needsAttentionItems` are read via `syncStatus` directly.)

- [ ] **Step 1: Write the failing test**

In `__tests__/OfflineContext.test.js`, first extend the `beforeEach` base mock (lines 46-53) so the mocked status mirrors the real repository shape:

```javascript
    getSyncStatus.mockResolvedValue({
      unsyncedCount: 0,
      inFlightCount: 0,
      waitingCount: 0,
      needsAttentionCount: 0,
      backedOffCount: 0,
      nextRetryAt: null,
      failedItems: [],
      needsAttentionItems: [],
      breakdown: {},
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });
```

Then append inside the top-level `describe` block:

```javascript
  test('exposes waitingCount, needsAttentionCount, and nextRetryAt from sync status', async () => {
    const { result } = await renderOfflineHook();
    getSyncStatus.mockResolvedValueOnce({
      unsyncedCount: 3,
      inFlightCount: 0,
      waitingCount: 3,
      needsAttentionCount: 2,
      backedOffCount: 1,
      nextRetryAt: '2099-01-01T00:00:00.000Z',
      failedItems: [],
      needsAttentionItems: [],
      breakdown: {},
      lastSyncTime: null,
      lastSuccessfulSyncTime: null,
    });
    syncAll.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      await result.current.refreshSyncStatus();
    });

    expect(result.current.waitingCount).toBe(3);
    expect(result.current.needsAttentionCount).toBe(2);
    expect(result.current.nextRetryAt).toBe('2099-01-01T00:00:00.000Z');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest OfflineContext -c package.json`
Expected: FAIL — `result.current.waitingCount` is `undefined`.

- [ ] **Step 3: Expose the fields**

In `src/context/OfflineContext.js`, add to the `createContext` defaults (after `inFlightCount: 0,`):

```javascript
  waitingCount: 0,
  needsAttentionCount: 0,
  nextRetryAt: null,
```

Immediately before `const value = {` (line 248), derive from the held status (fallbacks keep older mocked shapes safe):

```javascript
  const waitingCount = syncStatus.waitingCount ?? unsyncedCount;
  const needsAttentionCount = syncStatus.needsAttentionCount ?? 0;
  const nextRetryAt = syncStatus.nextRetryAt ?? null;
```

And add `waitingCount, needsAttentionCount, nextRetryAt,` to the `value` object (after `inFlightCount,`).

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest OfflineContext -c package.json`
Expected: PASS (existing suite + 1 new test).

- [ ] **Step 5: Commit**

```bash
git add src/context/OfflineContext.js __tests__/OfflineContext.test.js
git commit -m "feat(sync-status): expose waiting and needs-attention counts from OfflineContext"
```

---

### Task 5: Seam C — `SyncIndicator` consumes the presenter

Kill the ad-hoc `unsyncedCount`-only state machine. Regression fixed here: a terminal-only backlog showed the green all-synced check (terminal is excluded from `unsyncedCount`); it now shows the amber alert with the actionable count.

**Files:**
- Modify: `src/components/common/SyncIndicator.js`
- Test: `__tests__/syncIndicator.test.js` (create)

**Interfaces:**
- Consumes: `useOffline()` → `isOnline`, `isSyncing`, `waitingCount`, `needsAttentionCount` (Task 4); `deriveSyncState`/`describeSyncState` (Task 2).
- Produces: same component API (`{ onPress }`); accessibility label becomes `` `Open sync status, ${view.accessibilityLabel}` ``.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/syncIndicator.test.js`:

```javascript
const mockIconCalls = [];
jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props) => {
    mockIconCalls.push(props);
    return null;
  },
}), { virtual: true });

import { render } from '@testing-library/react-native';
import SyncIndicator from '../src/components/common/SyncIndicator';
import { colors } from '../src/constants/colors';

const mockUseOffline = jest.fn();
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));

const offline = (overrides = {}) => ({
  isOnline: true,
  isSyncing: false,
  waitingCount: 0,
  needsAttentionCount: 0,
  ...overrides,
});

beforeEach(() => { mockIconCalls.length = 0; });
afterEach(() => jest.clearAllMocks());

test('terminal-only backlog shows the amber alert with the actionable count (regression: was a green check)', () => {
  mockUseOffline.mockReturnValue(offline({ needsAttentionCount: 2 }));
  const { getByLabelText, getByText } = render(<SyncIndicator onPress={() => {}} />);
  expect(getByLabelText('Open sync status, 2 items need attention')).toBeTruthy();
  expect(getByText('2')).toBeTruthy();
  expect(mockIconCalls[mockIconCalls.length - 1]).toEqual(expect.objectContaining({
    name: 'alert-circle-outline',
    color: colors.warning,
  }));
});

test('waiting items render the calm cloud with the waiting count', () => {
  mockUseOffline.mockReturnValue(offline({ waitingCount: 3 }));
  const { getByLabelText, getByText } = render(<SyncIndicator onPress={() => {}} />);
  expect(getByLabelText('Open sync status, Saved on your phone. 3 items waiting to sync')).toBeTruthy();
  expect(getByText('3')).toBeTruthy();
  expect(mockIconCalls[mockIconCalls.length - 1]).toEqual(expect.objectContaining({
    name: 'cloud-upload-outline',
    color: colors.info,
  }));
});

test('offline with waiting items reads reassuring, not alarming', () => {
  mockUseOffline.mockReturnValue(offline({ isOnline: false, waitingCount: 1 }));
  const { getByLabelText } = render(<SyncIndicator onPress={() => {}} />);
  expect(getByLabelText("Open sync status, Saved on your phone. 1 item will sync when you're online")).toBeTruthy();
  expect(mockIconCalls[mockIconCalls.length - 1]).toEqual(expect.objectContaining({
    name: 'cloud-offline-outline',
    color: colors.info,
  }));
});

test('offline with a drained outbox still shows the green check', () => {
  mockUseOffline.mockReturnValue(offline({ isOnline: false }));
  const { getByLabelText } = render(<SyncIndicator onPress={() => {}} />);
  expect(getByLabelText('Open sync status, All saved and synced')).toBeTruthy();
  expect(mockIconCalls[mockIconCalls.length - 1]).toEqual(expect.objectContaining({
    name: 'checkmark-circle-outline',
    color: colors.success,
  }));
});

test('syncing shows the spinner and suppresses the badge', () => {
  mockUseOffline.mockReturnValue(offline({ isSyncing: true, waitingCount: 5 }));
  const { getByLabelText, queryByText } = render(<SyncIndicator onPress={() => {}} />);
  expect(getByLabelText('Open sync status, Syncing')).toBeTruthy();
  expect(mockIconCalls).toHaveLength(0);
  expect(queryByText('5')).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest syncIndicator -c package.json`
Expected: FAIL — the terminal-only test finds the green check ('All saved and synced' label) instead of the amber alert; waiting tests find the old yellow copy.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/components/common/SyncIndicator.js` with:

```javascript
import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Badge, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../../context/OfflineContext';
import { spacing } from '../../constants/colors';
import { deriveSyncState, describeSyncState } from '../../utils/syncStatusPresenter';

/**
 * Header sync indicator, driven by the shared syncStatusPresenter:
 * - Green check: everything saved and synced (including offline with a drained outbox)
 * - Calm cloud: work saved on the phone, waiting to sync (online or offline)
 * - Amber alert: terminal items that need attention (never hidden behind green)
 * - Spinner: a sync pass is running
 */
export default function SyncIndicator({ onPress }) {
  const { isOnline, isSyncing, waitingCount, needsAttentionCount } = useOffline();

  const state = deriveSyncState({ isOnline, isSyncing, waitingCount, needsAttentionCount });
  const view = describeSyncState(state, { waitingCount, needsAttentionCount });

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.container, { backgroundColor: view.backgroundColor }]}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Open sync status, ${view.accessibilityLabel}`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {state === 'syncing' ? (
        <ActivityIndicator size={20} color={view.color} />
      ) : (
        <Ionicons name={view.icon} size={20} color={view.color} />
      )}

      {view.badgeCount > 0 && (
        <Badge style={[styles.badge, { backgroundColor: view.color }]} size={16}>
          {view.badgeCount > 99 ? '99+' : view.badgeCount}
        </Badge>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    minWidth: 40,
    height: 32,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    fontSize: 10,
    fontWeight: 'bold',
  },
});
```

(The presenter returns `badgeCount: 0` for `syncing`, so the old `!isSyncing` badge guard is preserved by data. The badge now uses the state color: amber for attention, muted for waiting, instead of unconditional brand red.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest syncIndicator -c package.json`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/common/SyncIndicator.js __tests__/syncIndicator.test.js
git commit -m "feat(sync-status): drive SyncIndicator from the trust presenter (amber on terminal)"
```

---

### Task 6: Seam D — `SyncStatusScreen` trust layout

Summary card speaks the presenter's message; waiting is a count-only calm line (per-table breakdown list removed per spec); the itemized list is Needs Attention only (terminal rows, per-row Retry, disabled offline with reconnect framing). Network/Last Synced/Sync Now cards unchanged.

**Files:**
- Modify: `src/screens/main/SyncStatusScreen.js` (full replacement below)
- Test: `__tests__/syncStatusScreen.test.js` (full replacement; the two old tests' *intent* — never claim all-synced while terminal items exist — is preserved with the new copy)

**Interfaces:**
- Consumes: `useOffline()` → `isOnline`, `isSyncing`, `syncStatus`, `syncNow`, `refreshSyncStatus`, `waitingCount`, `needsAttentionCount` (Task 4); `syncStatus.needsAttentionItems`/`backedOffCount`/`nextRetryAt` (Task 1); all three presenter functions (Task 2); `retryFailedItem` (unchanged).
- Produces: screen only; no new exports.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `__tests__/syncStatusScreen.test.js` with:

```javascript
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SyncStatusScreen from '../src/screens/main/SyncStatusScreen';
import { retryFailedItem } from '../src/services/offlineSync';

jest.mock('../src/services/offlineSync', () => ({ retryFailedItem: jest.fn() }));

const mockUseOffline = jest.fn();
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));

const offline = ({ syncStatus = {}, ...overrides } = {}) => ({
  isOnline: true,
  isSyncing: false,
  waitingCount: 0,
  needsAttentionCount: 0,
  syncNow: jest.fn(),
  refreshSyncStatus: jest.fn(),
  syncStatus,
  ...overrides,
});

const terminalItem = (overrides = {}) => ({
  table: 'assessment_items',
  id: 'abc12345ff',
  operation: 'insert',
  reason: 'RLS policy',
  failedAt: null,
  terminal: true,
  nextRetryAt: null,
  retryCount: 3,
  ...overrides,
});

const metrics = { frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(
  <SafeAreaProvider initialMetrics={metrics}><SyncStatusScreen /></SafeAreaProvider>
);

afterEach(() => jest.clearAllMocks());

test('terminal-only backlog reads needs-attention and itemizes with Retry (regression: never claims all synced)', () => {
  mockUseOffline.mockReturnValue(offline({
    needsAttentionCount: 1,
    syncStatus: { needsAttentionItems: [terminalItem()] },
  }));
  const { queryByText, getByText } = renderScreen();
  expect(queryByText('All saved and synced')).toBeNull();
  expect(getByText('1 item needs attention')).toBeTruthy();
  expect(getByText('RLS policy')).toBeTruthy();
  expect(getByText('Retry')).toBeTruthy();
});

test('waiting backlog reads calm and count-only: no itemized rows, no Retry', () => {
  mockUseOffline.mockReturnValue(offline({
    waitingCount: 3,
    syncStatus: { backedOffCount: 1, nextRetryAt: '2099-01-01T10:00:00.000Z' },
  }));
  const { getByText, queryByText } = renderScreen();
  expect(getByText('Saved on your phone · 3 waiting to sync')).toBeTruthy();
  expect(getByText('3 items saved on your phone, waiting to sync')).toBeTruthy();
  expect(getByText(/^Next attempt around /)).toBeTruthy();
  expect(queryByText('Retry')).toBeNull();
});

test('terminal plus waiting shows the needs-attention summary AND the waiting count', () => {
  mockUseOffline.mockReturnValue(offline({
    waitingCount: 2,
    needsAttentionCount: 1,
    syncStatus: { needsAttentionItems: [terminalItem({ table: 'sessions', id: 'deadbeef99' })] },
  }));
  const { getByText } = renderScreen();
  expect(getByText('1 item needs attention')).toBeTruthy();
  expect(getByText('2 items saved on your phone, waiting to sync')).toBeTruthy();
});

test('clean state claims all saved and synced', () => {
  mockUseOffline.mockReturnValue(offline());
  expect(renderScreen().getByText('All saved and synced')).toBeTruthy();
});

test('offline with terminal items shows reconnect framing and an inert Retry', () => {
  mockUseOffline.mockReturnValue(offline({
    isOnline: false,
    needsAttentionCount: 1,
    syncStatus: { needsAttentionItems: [terminalItem({ table: 'sessions', id: 'deadbeef99' })] },
  }));
  const { getByText } = renderScreen();
  expect(getByText('Reconnect to retry these items.')).toBeTruthy();
  fireEvent.press(getByText('Retry'));
  expect(retryFailedItem).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest syncStatusScreen -c package.json`
Expected: FAIL — the screen still renders 'Everything is up to date.' and the old failed-items copy.

- [ ] **Step 3: Rewrite the screen**

Replace the entire contents of `src/screens/main/SyncStatusScreen.js` with:

```javascript
import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Card, Text, Button, Snackbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../../context/OfflineContext';
import { retryFailedItem } from '../../services/offlineSync';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { deriveSyncState, describeSyncState, describeWaitingDetail } from '../../utils/syncStatusPresenter';

const TABLE_DISPLAY_NAMES = {
  TIME_ENTRIES: 'Time Entries',
  SESSIONS: 'Sessions',
  CHILDREN: 'Children',
  STAFF_CHILDREN: 'Staff Assignments',
  GROUPS: 'Groups',
  CHILDREN_GROUPS: 'Group Memberships',
};

/**
 * Format a timestamp for the "Last Synced" card.
 * Today → "Today at 2:30 PM"
 * Other → "Jan 30 at 9:15 AM"
 * Null  → "Never"
 */
const formatSyncTime = (isoString) => {
  if (!isoString) return 'Never';

  const date = new Date(isoString);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isToday) {
    return `Today at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dateStr} at ${timeStr}`;
};

export default function SyncStatusScreen() {
  const {
    isOnline, isSyncing, syncStatus, syncNow, refreshSyncStatus,
    waitingCount, needsAttentionCount,
  } = useOffline();
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const needsAttentionItems = syncStatus.needsAttentionItems || [];
  const backedOffCount = syncStatus.backedOffCount || 0;
  const nextRetryAt = syncStatus.nextRetryAt || null;
  const lastSyncTime = syncStatus.lastSyncTime || null;
  const lastSuccessfulSyncTime = syncStatus.lastSuccessfulSyncTime || null;

  const state = deriveSyncState({ isOnline, isSyncing, waitingCount, needsAttentionCount });
  const summary = describeSyncState(state, { waitingCount, needsAttentionCount });
  const waitingDetail = describeWaitingDetail({ waitingCount, backedOffCount, nextRetryAt });

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const handleRetry = async (table, id) => {
    if (!isOnline) return;
    const displayName = TABLE_DISPLAY_NAMES[table] || table;
    showSnackbar(`Retrying ${displayName}...`);
    await retryFailedItem(table, id);
    await refreshSyncStatus();
    await syncNow({ force: true });
  };

  return (
    <View style={styles.outerContainer}>
      <ScrollView style={styles.container}>
        {/* Summary: the same voice as the Home banner and the header indicator */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.summaryRow}>
              {summary.icon && (
                <Ionicons name={summary.icon} size={22} color={summary.color} style={styles.summaryIcon} />
              )}
              <Text variant="titleMedium" style={[styles.summaryText, { color: summary.color }]}>
                {summary.message}
              </Text>
            </View>
            {waitingDetail && (
              <>
                <Text variant="bodyMedium" style={styles.waitingText}>
                  {waitingDetail.title}
                </Text>
                {waitingDetail.detail && (
                  <Text variant="bodySmall" style={styles.waitingHint}>
                    {waitingDetail.detail}
                  </Text>
                )}
              </>
            )}
          </Card.Content>
        </Card>

        {/* Network Status */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Network Status</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, isOnline ? styles.badgeOnline : styles.badgeOffline]}>
                <Text style={[styles.badgeText, isOnline ? styles.badgeTextOnline : styles.badgeTextOffline]}>
                  {isOnline ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Last Synced */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Last Synced</Text>
            <Text variant="bodyMedium" style={styles.syncTimeText}>
              {formatSyncTime(lastSuccessfulSyncTime)}
            </Text>
            {lastSyncTime && lastSyncTime !== lastSuccessfulSyncTime && (
              <Text variant="bodySmall" style={styles.lastAttemptText}>
                Last attempt: {formatSyncTime(lastSyncTime)}
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Sync Now Button */}
        <Button
          mode="contained"
          onPress={() => syncNow({ force: true })}
          disabled={!isOnline || isSyncing}
          loading={isSyncing}
          style={styles.syncButton}
        >
          Sync Now
        </Button>

        {/* Needs Attention: the only itemized list; terminal rows with per-row Retry */}
        {needsAttentionItems.length > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>Needs Attention</Text>
              {!isOnline && (
                <Text variant="bodySmall" style={styles.reconnectHint}>
                  Reconnect to retry these items.
                </Text>
              )}
              {needsAttentionItems.map((item) => (
                <Card key={`${item.table}_${item.id}`} style={styles.failedItemCard}>
                  <Card.Content>
                    <Text variant="bodyLarge" style={styles.failedItemTable}>
                      {TABLE_DISPLAY_NAMES[item.table] || item.table}
                    </Text>
                    <Text variant="bodySmall" style={styles.failedItemId}>
                      ID: {item.id.substring(0, 8)}...
                    </Text>
                    <Text variant="bodySmall" style={styles.failedItemReason}>
                      {item.reason}
                    </Text>
                    <Text variant="bodySmall" style={styles.failedItemTime}>
                      Failed: {formatSyncTime(item.failedAt)}
                    </Text>
                    <Button
                      mode="outlined"
                      onPress={() => handleRetry(item.table, item.id)}
                      style={styles.retryButton}
                      compact
                      disabled={!isOnline}
                    >
                      Retry
                    </Button>
                  </Card.Content>
                </Card>
              ))}
            </Card.Content>
          </Card>
        )}
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  card: {
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    ...shadows.card,
  },
  sectionTitle: {
    color: colors.primary,
    marginBottom: spacing.sm,
  },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryIcon: {
    marginRight: spacing.sm,
  },
  summaryText: {
    flex: 1,
  },
  waitingText: {
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  waitingHint: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },

  // Network badge
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  badgeOnline: {
    backgroundColor: colors.successBg,
  },
  badgeOffline: {
    backgroundColor: colors.warningBg,
  },
  badgeText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  badgeTextOnline: {
    color: colors.success,
  },
  badgeTextOffline: {
    color: colors.warningText,
  },

  // Last synced
  syncTimeText: {
    color: colors.textSecondary,
  },
  lastAttemptText: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },

  // Sync Now button
  syncButton: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },

  // Needs Attention
  reconnectHint: {
    color: colors.warningText,
    marginBottom: spacing.sm,
  },
  failedItemCard: {
    backgroundColor: colors.cardBackground,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  failedItemTable: {
    color: colors.text,
    fontWeight: 'bold',
  },
  failedItemId: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  failedItemReason: {
    color: colors.error,
    marginTop: spacing.xs,
  },
  failedItemTime: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  retryButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
});
```

(Removed: the per-table "Unsynced Items" breakdown card and the `List` import, per spec Seam D count-only. `handleRetry` gains an `isOnline` guard as belt-and-braces alongside the disabled button.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest syncStatusScreen -c package.json`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/screens/main/SyncStatusScreen.js __tests__/syncStatusScreen.test.js
git commit -m "feat(sync-status): trust-voice SyncStatusScreen with count-only waiting and itemized needs-attention"
```

---

### Task 7: Seam F (D2) — `SyncStatusBanner` replaces the Home banner

Extract the inline Home banner into a presenter-driven component. Fixes: retriable backoffs no longer paint a red "{N} items failed to sync" band; terminal shows amber "needs attention"; offline-with-work keeps the reassurance copy. HomeScreen drops its `useOffline` consumption entirely (the banner was its only use).

**Files:**
- Create: `src/components/common/SyncStatusBanner.js`
- Modify: `src/screens/main/HomeScreen.js` (remove lines 28, 89-117, the banner JSX at 153-168, and the `syncBanner`/`bannerIcon`/`bannerText` styles at 393-405; render the new component)
- Test: `__tests__/syncStatusBanner.test.js` (create), `__tests__/HomeScreen.test.js` (extend the useOffline mock shape)

**Interfaces:**
- Consumes: `useOffline()` → `isOnline`, `waitingCount`, `needsAttentionCount`; presenter (Task 2).
- Produces: `SyncStatusBanner` default export, props `{ onPress }`; renders `null` when the state is `synced`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/syncStatusBanner.test.js`:

```javascript
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

import { render, fireEvent } from '@testing-library/react-native';
import SyncStatusBanner from '../src/components/common/SyncStatusBanner';

const mockUseOffline = jest.fn();
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));

const offline = (overrides = {}) => ({
  isOnline: true,
  waitingCount: 0,
  needsAttentionCount: 0,
  ...overrides,
});

afterEach(() => jest.clearAllMocks());

test('renders nothing when everything is synced', () => {
  mockUseOffline.mockReturnValue(offline());
  expect(render(<SyncStatusBanner onPress={() => {}} />).toJSON()).toBeNull();
});

test('renders nothing when offline with a drained outbox (Network card still says Offline)', () => {
  mockUseOffline.mockReturnValue(offline({ isOnline: false }));
  expect(render(<SyncStatusBanner onPress={() => {}} />).toJSON()).toBeNull();
});

test('waiting backlog reads reassuring, not failed (regression: was amber "waiting" / red "failed")', () => {
  mockUseOffline.mockReturnValue(offline({ waitingCount: 3 }));
  const { getByText, queryByText } = render(<SyncStatusBanner onPress={() => {}} />);
  expect(getByText('Saved on your phone · 3 waiting to sync')).toBeTruthy();
  expect(queryByText(/failed to sync/i)).toBeNull();
});

test('terminal backlog reads needs-attention, and wins over waiting', () => {
  mockUseOffline.mockReturnValue(offline({ waitingCount: 3, needsAttentionCount: 2 }));
  const { getByText } = render(<SyncStatusBanner onPress={() => {}} />);
  expect(getByText('2 items need attention')).toBeTruthy();
});

test('offline with waiting work keeps the reassurance copy', () => {
  mockUseOffline.mockReturnValue(offline({ isOnline: false, waitingCount: 2 }));
  const { getByText } = render(<SyncStatusBanner onPress={() => {}} />);
  expect(getByText("Saved on your phone · 2 will sync when you're online")).toBeTruthy();
});

test('press opens sync status', () => {
  const onPress = jest.fn();
  mockUseOffline.mockReturnValue(offline({ waitingCount: 1 }));
  const { getByLabelText } = render(<SyncStatusBanner onPress={onPress} />);
  fireEvent.press(getByLabelText('Open sync status, Saved on your phone. 1 item waiting to sync'));
  expect(onPress).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest syncStatusBanner -c package.json`
Expected: FAIL — cannot find module `SyncStatusBanner`.

- [ ] **Step 3a: Create the component**

Create `src/components/common/SyncStatusBanner.js`:

```javascript
import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../../context/OfflineContext';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { deriveSyncState, describeSyncState } from '../../utils/syncStatusPresenter';

// Banner chrome per state. The presenter owns the copy and the state; this owns the
// Home-surface treatment. Every pair is WCAG AA for normal text (R2, ratios verified):
// warningText on warningBg 6.40:1, white on info 5.25:1, text on disabled 7.38:1.
// (The obvious "solid amber with white text" fails at 4.24:1; do not revert to it.)
const BANNER_STYLES = {
  needs_attention: { backgroundColor: colors.warningBg, contentColor: colors.warningText },
  offline: { backgroundColor: colors.disabled, contentColor: colors.text },
  waiting: { backgroundColor: colors.info, contentColor: '#FFFFFF' },
};

export default function SyncStatusBanner({ onPress }) {
  const { isOnline, waitingCount, needsAttentionCount } = useOffline();

  // isSyncing is deliberately not consumed: a running pass is header-indicator feedback;
  // the banner reports the underlying backlog without flickering through "Syncing".
  const state = deriveSyncState({ isOnline, isSyncing: false, waitingCount, needsAttentionCount });
  if (state === 'synced') return null;

  const view = describeSyncState(state, { waitingCount, needsAttentionCount });
  const chrome = BANNER_STYLES[state];

  return (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: chrome.backgroundColor }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Open sync status, ${view.accessibilityLabel}`}
    >
      <Ionicons name={view.icon} size={18} color={chrome.contentColor} style={styles.icon} />
      <Text variant="bodySmall" style={[styles.text, { color: chrome.contentColor }]}>
        {view.message}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={chrome.contentColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  icon: {
    marginRight: spacing.sm,
  },
  text: {
    flex: 1,
  },
});
```

- [ ] **Step 3b: Swap it into HomeScreen**

In `src/screens/main/HomeScreen.js`:

1. Delete line 28 (`const { isOnline, unsyncedCount, syncStatus } = useOffline();`) and the now-unused `useOffline` import. (The banner was HomeScreen's only `useOffline` consumption; verify with a search in the file before removing the import.)
2. Delete the banner config block (lines 89-117, from `// Sync banner config (unchanged from original)` through `const banner = bannerConfig[bannerVariant];`).
3. Replace the banner JSX (lines 153-168, the `{showBanner && (<TouchableOpacity ...>...</TouchableOpacity>)}` block) with:

```javascript
          {/* ── Sync Banner ── */}
          <SyncStatusBanner onPress={() => navigation.navigate('SyncStatus')} />
```

4. Add the import alongside the other component imports:

```javascript
import SyncStatusBanner from '../../components/common/SyncStatusBanner';
```

5. Delete the `syncBanner`, `bannerIcon`, and `bannerText` entries from the StyleSheet (lines 393-405).
6. If `TouchableOpacity` or `Ionicons` are now unused in HomeScreen, remove them from the imports; if they are still used elsewhere in the file, leave them.

- [ ] **Step 3c: Keep `HomeScreen.test.js` honest**

In `__tests__/HomeScreen.test.js`, extend the `mockUseOffline.mockReturnValue({ ... })` (around line 78) with the new context fields so the mock mirrors the real shape:

```javascript
      waitingCount: 0,
      needsAttentionCount: 0,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest syncStatusBanner HomeScreen -c package.json`
Expected: PASS (6 new banner tests + the pre-existing HomeScreen suite unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/components/common/SyncStatusBanner.js src/screens/main/HomeScreen.js __tests__/syncStatusBanner.test.js __tests__/HomeScreen.test.js
git commit -m "feat(sync-status): Home banner speaks the trust voice via SyncStatusBanner"
```

---

### Task 8: Seam G (R6) — `TimeEntriesListScreen` pull-to-refresh snackbar speaks the trust voice

Adversarial review found a seventh surface: the pull-to-refresh handler (`TimeEntriesListScreen.js:92-94`) shows `"${totalFailed} entries failed — will retry"` whenever `totalFailed > 0`, painting purely retriable backlogs as failures (and using an em dash). Re-voice it with the Task 3 counters THROUGH the presenter (R7): the counters are pass-level (syncNow syncs ALL tables), so the copy must say "items", never "entries" — the old copy could call a failed child record a time entry — and the strings must not be hand-built outside `syncStatusPresenter`. The synced-count snackbar stays local copy (the presenter is status-based, not result-based) but is corrected to "item(s)" for the same reason.

**Files:**
- Modify: `src/screens/main/TimeEntriesListScreen.js:88-95` (snackbar messages) and the main `ScrollView` (add `testID`)
- Test: `__tests__/TimeEntriesListScreen.syncVoice.test.js` (create)

**Interfaces:**
- Consumes: `syncNow()` result fields `totalSynced`, `totalTerminal`, `totalRetriable` (Task 3); `describeSyncState` (Task 2).
- Produces: screen only; no new exports.

- [ ] **Step 1: Write the failing test**

Create `__tests__/TimeEntriesListScreen.syncVoice.test.js` (harness mirrors the existing `TimeEntriesListScreen.plan5.test.js`):

```javascript
import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TimeEntriesListScreen from '../src/screens/main/TimeEntriesListScreen';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';
import { timeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('../src/db/repositories/timeEntriesRepository', () => ({
  timeEntriesRepository: { getTimeEntries: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const entry = {
  id: 'entry-1',
  user_id: 'user-1',
  sign_in_time: '2026-05-21T08:00:00.000Z',
  sign_out_time: '2026-05-21T11:00:00.000Z',
  synced: false,
};

const renderScreen = () => render(
  <SafeAreaProvider><TimeEntriesListScreen /></SafeAreaProvider>
);

const pullToRefresh = async (getByTestId) => {
  await act(async () => {
    await getByTestId('time-entries-scroll').props.refreshControl.props.onRefresh();
  });
};

describe('TimeEntriesListScreen sync-voice snackbars', () => {
  const mockSync = (result) => {
    useOffline.mockReturnValue({
      isOnline: true,
      syncNow: jest.fn(async () => result),
      refreshSyncStatus: jest.fn(),
    });
  };

  beforeEach(() => {
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    timeEntriesRepository.getTimeEntries.mockResolvedValue([entry]);
  });

  afterEach(() => jest.clearAllMocks());

  test('a retriable-only backlog shows the presenter waiting message, never "failed" or "entries"', async () => {
    mockSync({ success: true, totalSynced: 0, totalFailed: 2, totalTerminal: 0, totalRetriable: 2 });
    const { getByTestId, getByText, queryByText } = renderScreen();
    await waitFor(() => expect(getByText('Work History')).toBeTruthy());

    await pullToRefresh(getByTestId);

    // Exact presenter copy: the counts are pass-level (all tables), so no "entries" claim.
    expect(getByText('Saved on your phone · 2 waiting to sync')).toBeTruthy();
    expect(queryByText(/failed/i)).toBeNull();
  });

  test('terminal failures show the presenter needs-attention message', async () => {
    mockSync({ success: false, totalSynced: 0, totalFailed: 1, totalTerminal: 1, totalRetriable: 0 });
    const { getByTestId, getByText } = renderScreen();
    await waitFor(() => expect(getByText('Work History')).toBeTruthy());

    await pullToRefresh(getByTestId);

    expect(getByText('1 item needs attention')).toBeTruthy();
  });

  test('synced count says items, not entries (counts are pass-level)', async () => {
    mockSync({ success: true, totalSynced: 3, totalFailed: 0, totalTerminal: 0, totalRetriable: 0 });
    const { getByTestId, getByText } = renderScreen();
    await waitFor(() => expect(getByText('Work History')).toBeTruthy());

    await pullToRefresh(getByTestId);

    expect(getByText('3 items synced')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest TimeEntriesListScreen.syncVoice -c package.json`
Expected: FAIL — no element with testID `time-entries-scroll`; after adding it, the old copy renders "2 entries failed — will retry".

- [ ] **Step 3: Re-voice the handler and add the testID**

In `src/screens/main/TimeEntriesListScreen.js`, add the presenter import alongside the other src imports:

```javascript
import { describeSyncState } from '../../utils/syncStatusPresenter';
```

Then replace the two message blocks inside `onRefresh` (lines 88-94):

```javascript
        if (syncResult.totalSynced > 0) {
          // Pass-level count (syncNow uploads every table), so "items", not "entries".
          showSnackbar(`${syncResult.totalSynced} ${syncResult.totalSynced === 1 ? 'item' : 'items'} synced`);
        }

        // Trust voice (Finding 6): retriable items are safe and waiting, not "failed";
        // only terminal items are called out. The presenter owns the wording.
        if (syncResult.totalTerminal > 0) {
          showSnackbar(describeSyncState('needs_attention', { needsAttentionCount: syncResult.totalTerminal }).message);
        } else if (syncResult.totalRetriable > 0) {
          showSnackbar(describeSyncState('waiting', { waitingCount: syncResult.totalRetriable }).message);
        }
```

And add the testID to the MAIN list `ScrollView` (line 185, the one under the non-empty return; leave the empty-state ScrollView alone):

```javascript
      <ScrollView
        style={styles.container}
        testID="time-entries-scroll"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
```

- [ ] **Step 4: Run tests to verify they pass (including the pre-existing suite)**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest TimeEntriesListScreen -c package.json`
Expected: PASS (3 new tests + the pre-existing `TimeEntriesListScreen.plan5` test unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/screens/main/TimeEntriesListScreen.js __tests__/TimeEntriesListScreen.syncVoice.test.js
git commit -m "feat(sync-status): trust-voice pull-to-refresh snackbars on work history"
```

---

### Task 9: Docs + full gates

**Files:**
- Modify: `documentation/sqlite-refactor-log.md` (append entry), `docs/superpowers/specs/2026-07-09-sync-status-trust-ux-design.md` (status line only)

**Interfaces:** none (docs).

- [ ] **Step 1: Log the behavioral change**

Append to `documentation/sqlite-refactor-log.md` (follow the file's existing entry format and date it with the actual build date):

```markdown
## 2026-07-XX — Sync-status trust UX (ZZ Finding 6)

- BEHAVIORAL CHANGE: `syncAll` `result.success` now means "no terminal failures and no
  preflight errors". Retriable/backed-off records and dependency skips behind a retriable
  failure no longer flip it, so `lastSuccessfulSyncTime` stamps on such passes and
  "Last Synced" stops reading "Never" on devices with a chronically-backed-off item.
  Terminal records and preflight errors still flip it. New result counters:
  `totalTerminal`, `totalRetriable` (`totalFailed` unchanged, still the sum).
- `syncOutboxRepository.getSyncStatus` gained `waitingCount` (= pending+failed+in_flight;
  stranded in_flight rows are still owed and must not read as synced, review R5),
  `needsAttentionCount` (= terminal), `backedOffCount`/`nextRetryAt` (failed rows with a
  future retry), and `needsAttentionItems` (terminal subset, itemized). The whole summary
  is now computed from ONE select-* snapshot so counts can never contradict the itemized
  lists (review R1). Conflated `unsyncedCount`/`failedCount`/`failedItems` kept for
  back-compat but no longer drive UI.
- New `src/utils/syncStatusPresenter.js` owns the five-state machine
  (syncing > needs_attention > offline > waiting > synced) and ALL field-facing copy
  ("Saved on your phone · N waiting to sync" / "N items need attention"), unit-tested
  against exact strings. Consumed by SyncIndicator, SyncStatusScreen, the new
  SyncStatusBanner (extracted from HomeScreen's inline banner, which previously painted
  retriable backoffs as red "failed to sync"), and TimeEntriesListScreen's pull-to-refresh
  snackbars (previously "N entries failed" for retriable items).
- Palette note: theme has no blue and `emphasis` === `primary` === brand red, so calm =
  `colors.info` (muted), actionable = `colors.warning` (amber), per plan disposition D1.
  Banner chrome uses AA-verified pairs (warningText/warningBg 6.40:1, white/info 5.25:1,
  text/disabled 7.38:1); solid amber with white text fails AA at 4.24:1 (review R2).
- Updated-in-place tests that pinned the old semantics: `offlineSyncOutbox.test.js`
  ("skips dependent rows...", retriable retry-scheduling test) and
  `offlineSyncAuthGate.test.js` (session-vanished downgraded 42501, review R4). Not a
  sync-contract change: RLS/payloads/ordering untouched; `rls-sync-contract-map.md`
  deliberately not updated.
```

- [ ] **Step 2: Flip the spec status**

In `docs/superpowers/specs/2026-07-09-sync-status-trust-ux-design.md`, change the `**Status:**` line to:

```markdown
**Status:** Implemented (plan: docs/superpowers/plans/2026-07-09-sync-status-trust-ux.md)
```

- [ ] **Step 3: Run the full unit suite**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test`
Expected: PASS. Baseline was 139 suites / 779 tests; this plan adds 5 new suites and ~45 tests. If `CreateClassScreen.test.js` times out, rerun it in isolation before judging.

- [ ] **Step 4: Run the integration suite**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration`
Expected: PASS (baseline 24 suites / 182 tests; unchanged by this plan, run to prove no engine regression leaked into the file-backed suites).

- [ ] **Step 5: Commit**

```bash
git add documentation/sqlite-refactor-log.md docs/superpowers/specs/2026-07-09-sync-status-trust-ux-design.md
git commit -m "docs(sync-status): log Finding 6 trust-UX semantics change"
```

---

## Adversarial Review Dispositions

Two independent reviews of the same plan baseline (2026-07-10): Codex `gpt-5.6-sol` (findings F1-F3) and an Opus subagent (findings O1-O3). Every finding was verified against the tree (contrast ratios by runnable probe; test assertions by reading the fixtures) before acceptance. All six accepted; fixes applied inline above.

- **R1 (Codex F1, major — ACCEPTED): `getSyncStatus` was not a coherent snapshot.** Grouped-count query + separate backed-off query + `getFailedItems()` could interleave with a sync pass, yielding `needsAttentionCount: 1` with empty `needsAttentionItems` (summary says "1 item needs attention", screen shows no list). Fix: Task 1 computes everything from ONE `select * from sync_outbox` statement with JS aggregation, replicating `getFailedItems`' ordering.
- **R2 (Codex F2, minor — ACCEPTED, extended): banner contrast fails WCAG AA.** Verified by probe: white on `colors.warning` `#B26A00` = 4.24:1 (< 4.5). While rebuilding, the old offline treatment (white on `colors.disabled`) measured 2.31:1 — worse. Fix: Task 7 `BANNER_STYLES` uses AA-verified pairs: needs_attention = `warningText` on `warningBg` (6.40:1), offline = `colors.text` on `disabled` (7.38:1), waiting = white on `info` (5.25:1).
- **R3 (Codex F3, minor — ACCEPTED): plan said React 18; tree is React 19.1.0** (`package.json:41`). Tech Stack corrected.
- **R4 (Opus O1, blocker — ACCEPTED): D4's audit missed `offlineSyncAuthGate.test.js:237-241`.** The session-vanished downgraded 42501 ends as a retriable `failed` row, so its `objectContaining({ success: false })` breaks under the new semantics at Task 3's own gate. Fix: Task 3 Step 3d updates it to `success: true, totalRetriable: 1, totalTerminal: 0`; D4 re-audited to enumerate ALL `success: false` sites including `:270-274`/`:309-313` (terminal, unchanged) and `offlineSyncOutbox.test.js:1406` (terminal, unchanged). Lesson recorded: the original audit grepped `success).toBe(false)` and assumed the `success: false` object-literal hits were mocks without reading them.
- **R5 (Opus O2, major — ACCEPTED): stranded `in_flight` rows read as green.** `waitingCount` (= old `unsyncedCount`) excluded `in_flight`; after a hard-kill mid-sync, a device shows "All saved and synced" while un-uploaded rows exist — permanently while offline, since `resetInFlight` only runs at the start of the next pass and `triggerBackgroundSync` early-returns offline (`OfflineContext.js:118`; state proven reachable by `OfflineContext.test.js:277`). Fix: Task 1 defines `waitingCount = pending + failed + in_flight` (everything owed except terminal), superseding the spec's "equals today's unsyncedCount". During an active pass `isSyncing` masks it as `syncing`, so no flicker.
- **R6 (Opus O3, minor — ACCEPTED): seventh surface.** `TimeEntriesListScreen.js:92-94` shows "N entries failed — will retry" (em dash included) for any `totalFailed > 0`, including purely retriable backlogs. Per the consistency-full-rollout rule, brought into scope as Task 8 using the Task 3 counters.

Notable no-findings (both reviewers, independently): the D4 dependency-skip semantics change is safe for every current consumer; `syncAll().success` is consumed only by the `lastSuccessfulSyncTime` gate; `lastSyncResult` has no readers; the engine test fixtures classify as the plan claims (code-less error retriable; bare-child 42501 terminal; injected `resetInFlight` throw = preflight); the new tests' mock-hoisting, RNTL queries, and SQL string-comparison mechanics are sound.

**Pass 2** (Codex `gpt-5.6-sol` re-review of the revised plan, findings G1-G3; all about the newly-added Task 8, everything else re-verified clean including the R1/R5 rework, the in-flight fixture values, and the authGate assertion shape):

- **R7 (G1 + G2, major — ACCEPTED): Task 8's hand-built snackbar strings both mislabeled global counters as "entries" and duplicated copy outside the presenter.** `syncNow` uploads every table, so `totalRetriable`/`totalTerminal` can count child or assessment records; "2 entries saved on your phone" would falsely identify them as work-history entries, and the hand-built strings would drift from future presenter copy changes. One fix for both: the snackbar consumes `describeSyncState('needs_attention'|'waiting', ...)` messages verbatim ("N items need attention" / "Saved on your phone · N waiting to sync"); the synced-count snackbar stays local (the presenter is status-based, not result-based) but says "item(s)".
- **R8 (G3, minor — ACCEPTED): the Global Constraints still pointed the docs log at "Task 8" after the renumbering.** Corrected to Task 9.

**Build phase** (found empirically by Task 3's Step 4 gate, not by any of the three static audits):

- **R9 (build finding, major — ACCEPTED): a FOURTH old-semantics assertion existed at `offlineSyncOutbox.test.js:1757`** ("keeps child EA archive pending when relationship cleanup fails"). Both plan reviews and the original D4 audit classified it as a terminal 42501; it is actually a retriable *downgrade* — the child's `child_ea_assignments` grant row is still locally pending, so `computeEvidencePending` returns true and `classifyError` yields `terminal: false`. Under the new semantics the pass is successful (`totalRetriable: 1`). Codex correctly halted at the red gate rather than editing beyond its authorization; the plan was amended (Task 3 Step 3d fourth block) and the fix applied. Lesson: a 42501 fixture's terminal-vs-retriable classification depends on the seeded evidence graph, not the error code — only running the gate settles it.

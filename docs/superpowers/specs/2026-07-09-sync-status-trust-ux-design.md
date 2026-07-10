# Sync-Status Trust UX — Design

**Date:** 2026-07-09
**Status:** Design (awaiting Jim's spec review before writing-plans)
**Source of truth for the problem:** `documentation/zz-field-lessons-sync-review-2026-07-04.html`, Finding 6 (P1, ZZ F2, "trust-destroying").
**Scope:** how sync status is *communicated* to field staff. This is not a change to the sync engine's retry/backoff policy, RLS, synced write payloads, migrations, or outbox ordering, so `documentation/rls-sync-contract-map.md` is not touched.

## Problem

ZZ field data: one stuck table poisoned the overall success flag, so EAs concluded "the app never syncs" even while records uploaded cleanly in the same cycle. The narrative did the reputational damage. Masi has the same defect and an adjacent inconsistency:

1. **`result.success` conflates retriable with terminal.** `src/services/offlineSync.js:1187-1197` (`applyRecordResult`) sets `result.success = false` on *any* non-success record, ignoring the `recordResult.terminal` flag it already carries. A single item backed off waiting for signal drags the whole pass's `success` to false exactly like a genuine terminal failure. `result.success` gates `lastSuccessfulSyncTime` (`offlineSync.js:1309-1312`), so a device with one chronically-backed-off item can read **"Last Synced: Never"** forever.
2. **The summary conflates the counts.** `syncOutboxRepository.getSyncStatus` (`src/db/repositories/syncOutboxRepository.js:219-255`) returns `failedCount = count(status='failed') + count(status='terminal')` — retriable and terminal in one number — and `unsyncedCount = pending + failed` (excludes terminal). There is no separate retriable-vs-terminal count.
3. **The two surfaces disagree.** The Home `SyncIndicator` (`src/components/common/SyncIndicator.js:38`) is driven only by `unsyncedCount`, which *excludes* terminal. So a terminal-only backlog shows the **green all-synced checkmark on Home** while `SyncStatusScreen` shows a red "failed" banner about the same outbox.
4. **No "waiting for signal" vs "needs attention" language exists.** Every failed item in `SyncStatusScreen` renders identically with a Retry button (`src/screens/main/SyncStatusScreen.js:153-185`), ignoring the per-row `terminal` flag and `next_retry_at`, so "will auto-retry soon" is indistinguishable from "genuinely stuck."

Good news from the recon: the data already distinguishes retriable from terminal (`sync_outbox.status IN ('pending','in_flight','failed','terminal')` + `next_retry_at`), and `toFailedItem` already carries a `terminal` boolean. **No new DB columns or migrations are needed.** This is a summary-plumbing + presentation change.

## Decisions locked with Jim (2026-07-09)

- **Trust voice: "Saved on your phone."** The reassurance-first framing:
  - All synced: `✓ All saved and synced`
  - Waiting (online): `☁ Saved on your phone · {N} waiting to sync`
  - Offline (waiting): `☁ Saved on your phone · {N} will sync when you're online`
  - Needs attention: `⚠ {N} item{s} need attention`
  - Syncing: `⟳ Syncing…`
- **Waiting counts as a successful sync.** `result.success` becomes "no terminal failures and no preflight errors"; retriable/backed-off items still waiting do NOT flip it. So `lastSuccessfulSyncTime` stamps whenever a pass had no terminal/preflight problems (fixing "Last Synced: Never"). Terminal failures still mean not-fully-successful.
- **Count-only for waiting; itemize terminal.** Retriable/backed-off items show as a calm count (with an optional "next attempt around HH:MM"); only terminal "needs attention" items get an itemized list with per-row Retry.

## Design: four seams

### Seam A — Split the counts (`syncOutboxRepository`)

`getSyncStatus` gains a retriable-vs-terminal split (existing fields kept for back-compat; consumers migrate to the new ones):

- `waitingCount` = `count(status IN ('pending','failed'))` — retriable; safe on device, will upload. (Equals today's `unsyncedCount`.)
- `needsAttentionCount` = `count(status='terminal')` — genuinely stuck.
- `backedOffCount` = `count(status='failed' AND next_retry_at > now)` — subset of waiting, for "next attempt" copy.
- `nextRetryAt` = `MIN(next_retry_at)` among backed-off rows, or `null`.
- `inFlightCount` — unchanged (transient during a pass).
- `needsAttentionItems` — the terminal rows, itemized (replaces the UI's use of the mixed `failedItems`). Keep `failedItems`/`unsyncedCount`/`failedCount` for back-compat but stop using the conflated ones in the UI.

`toFailedItem` (`syncOutboxRepository.js:18-25`) gains `nextRetryAt` (`row.next_retry_at`) and `retryCount` (`row.retry_count`) so the presenter can compute retry timing. The single `GROUP BY table_name, status` query already returns everything except `next_retry_at`; add a small aggregate for `backedOffCount`/`nextRetryAt` (a second cheap query filtered to `status='failed' AND next_retry_at > now`).

### Seam B — The presenter (new pure module)

New `src/utils/syncStatusPresenter.js` centralizes the state machine AND the copy (so the trust voice lives in one testable place):

- `deriveSyncState({ isOnline, isSyncing, waitingCount, needsAttentionCount }) → 'syncing' | 'needs_attention' | 'offline' | 'waiting' | 'synced'`. Priority (first match wins): `isSyncing → syncing`; `needsAttentionCount > 0 → needs_attention` (terminal always surfaces — never hidden behind green); `!isOnline && waitingCount > 0 → offline`; `waitingCount > 0 → waiting`; else `synced`.
- `describeSyncState(state, { waitingCount, needsAttentionCount, nextRetryAt }) → { icon, color, message, badgeCount, accessibilityLabel }` — the "Saved on your phone" copy, correct singular/plural, and the visual config. Visual language flowing from the framing: waiting/offline read **calm/blue** (`colors.primary`, cloud icons), needs_attention reads **amber/actionable** (`colors.emphasis`, alert icon), synced is **green** (`colors.success`), syncing is the spinner. `badgeCount` = `needsAttentionCount` in `needs_attention`, else `waitingCount`.

This is the deliverable: the copy is data, unit-tested against the exact strings.

### Seam C — Home `SyncIndicator`

Consume the presenter instead of the ad-hoc `unsyncedCount`-only state machine. Requires `OfflineContext` to expose `waitingCount` and `needsAttentionCount` (from `syncStatus`). Result: a terminal-only backlog now shows the amber alert icon (not green), waiting reads calm/blue (not the current alarming yellow), and the badge shows the actionable count in `needs_attention`.

### Seam D — `SyncStatusScreen`

- **Summary card:** `describeSyncState(...)` message ("Saved on your phone · 3 waiting to sync" / "2 items need attention"), replacing the current three-way banner.
- **Waiting section (count-only):** a calm line — "N items saved on your phone, waiting to sync" plus, when `backedOffCount > 0` and `nextRetryAt`, "Next attempt around {HH:MM}." No itemized list, no scary framing.
- **Needs Attention section (itemized):** only when `needsAttentionCount > 0`. The terminal `needsAttentionItems` with reason + `Failed: {time}` + per-row Retry (retry meaningful only when online). This is the sole place the itemized list and Retry appear.
- **Sync Now / Last Synced / Network cards:** kept. Last Synced is now honest (Seam E).

### Seam E — `result.success` semantics (`offlineSync`)

- `applyRecordResult` (`offlineSync.js:1187-1197`) inspects `recordResult.terminal`: increment a new `result.totalTerminal` for terminal records and `result.totalRetriable` for retriable ones; `result.totalFailed` (all non-success) retained for back-compat. Set `result.success = false` **only** for a terminal record (retriable failures leave it true).
- Preflight failures (`offlineSync.js:1210, 1221, 1248, 1304`) still set `success = false` (they are not retriable-per-record and represent a pass that could not run correctly).
- Net: `result.success === (totalTerminal === 0 && preflightErrors.length === 0)`. `lastSuccessfulSyncTime` (`offlineSync.js:1309-1312`) therefore stamps whenever a pass had no terminal/preflight problems, even with retriable items waiting.
- Verify no other consumer depends on the old `result.success` meaning (recon: it only gates `lastSuccessfulSyncTime`; confirm in tests during the build).

## Public interface changes

- `syncOutboxRepository.getSyncStatus()` return: adds `waitingCount`, `needsAttentionCount`, `backedOffCount`, `nextRetryAt`, `needsAttentionItems`; `toFailedItem` adds `nextRetryAt`, `retryCount`. Existing fields kept.
- `OfflineContext` value: adds `waitingCount`, `needsAttentionCount` (and `nextRetryAt`) derived from `syncStatus`.
- `offlineSync` `syncAll` result: adds `totalTerminal`, `totalRetriable`; `result.success` semantics change (terminal/preflight only).
- New module `src/utils/syncStatusPresenter.js` (`deriveSyncState`, `describeSyncState`).

## Edge cases

- **Terminal + waiting simultaneously:** state = `needs_attention` (priority); the screen shows both the needs-attention list and the waiting count.
- **Terminal + offline:** state = `needs_attention` (terminal surfaces regardless of connectivity); Retry disabled offline with "reconnect to retry" framing.
- **Offline + nothing waiting + no terminal:** `synced` (green) — being offline with a fully-drained outbox is not a problem.
- **In-flight during a pass:** transient; `syncing` state covers it; between passes `resetInFlight` returns them to `pending` (counted as waiting).
- **Chronically-backed-off retriable item:** stays `waiting` (reassuring) indefinitely — see Non-goals.

## Testing plan

Pure/presenter (Jest, no RN):
1. `deriveSyncState` priority: each of the 5 states, plus the combos (terminal+waiting → needs_attention; syncing overrides all; offline+waiting → offline; terminal+offline → needs_attention; offline+empty → synced).
2. `describeSyncState` copy: pin the exact "Saved on your phone" strings and singular/plural ("1 item"/"3 items", "1 waiting"/"3 waiting"), badgeCount selection, and the amber-for-terminal / blue-for-waiting visual config.

Repository (real better-sqlite3 engine):
3. `getSyncStatus` split: seed pending + backed-off `failed` (next_retry_at > now) + ready `failed` + terminal rows; assert `waitingCount`, `needsAttentionCount`, `backedOffCount`, `nextRetryAt`, and `needsAttentionItems` (terminal only, with `nextRetryAt`/`retryCount` on items).

Engine (real-engine integration):
4. `result.success` stays true when the only failures are retriable/backed-off, and `lastSuccessfulSyncTime` stamps; flips false on a terminal failure or a preflight error; `totalTerminal`/`totalRetriable` counts correct.

Component/screen (@testing-library/react-native):
5. `SyncIndicator`: terminal-only backlog renders the amber alert icon + needsAttentionCount badge (regression for the green-check bug); waiting renders calm/blue + waitingCount badge; syncing renders the spinner; synced renders green.
6. `SyncStatusScreen`: waiting shows a count-only calm line (no per-item Retry); terminal shows the itemized needs-attention list with Retry; summary shows the correct "Saved on your phone" message.

Run under Node 20 (`PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`). Known flake: `CreateClassScreen.test.js` under parallel load (passes in isolation).

## Files touched

- `src/db/repositories/syncOutboxRepository.js` — count split + `toFailedItem` fields (Seam A).
- `src/utils/syncStatusPresenter.js` — new (Seam B).
- `src/components/common/SyncIndicator.js` — consume presenter (Seam C).
- `src/screens/main/SyncStatusScreen.js` — reassuring summary, count-only waiting, itemized terminal (Seam D).
- `src/context/OfflineContext.js` — expose `waitingCount`/`needsAttentionCount`/`nextRetryAt` (Seam C dependency).
- `src/services/offlineSync.js` — `result.success` semantics + `totalTerminal`/`totalRetriable` (Seam E).
- Tests for each of the above.
- `documentation/sqlite-refactor-log.md` — log the `result.success` semantics change (behavioral) and the UX split.

## Non-goals

- No change to retry/backoff policy, no max-retry → terminal promotion. Finding 6 is about *messaging*. A retriable item that genuinely never resolves stays `waiting` forever; surfacing "waiting a long time" as its own escalation state is a **possible follow-up**, explicitly out of scope here (YAGNI — would require a policy decision on how long is "too long").
- No new DB columns/migrations (data already present).
- No RLS / synced-payload / outbox-ordering change; `rls-sync-contract-map.md` untouched.
- No change to what triggers a sync (NetInfo/foreground/interval), only how status is summarized and shown.

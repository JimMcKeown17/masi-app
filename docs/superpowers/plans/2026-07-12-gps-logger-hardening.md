# Sprint 1: GPS Timeout + Logger Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two field-reliability defects from `documentation/codebase-audit-2026-07-12.md` (findings #5 and #12, both item 13 of `documentation/improvements-2026-07.md`):

1. The advertised "10s GPS timeout" does not exist. `getCurrentPosition` passes `timeInterval` to `Location.getCurrentPositionAsync` (`src/services/locationService.js:98-101`), which is a watch-mode spacing option, not a timeout. On weak GPS the promise hangs forever, wedging clock-in and clock-out (`TimeTrackingContext` awaits it before writing). The permission prompt also recurses without checking `canAskAgain`, producing an alert loop on permanently-denied Android.
2. The logger destroys Error payloads and can itself throw. `logger.addLog` (`src/utils/logger.js:67`) serializes objects with bare `JSON.stringify`: an `Error`'s non-enumerable properties vanish (crash exports read `App crashed: {}`), and a circular argument throws synchronously inside the intercepted `console.log/error/warn`.

**Architecture:** Three tasks, one branch (`fix/gps-logger-hardening`). Tasks 1-2 touch `locationService.js` only; Task 3 touches `logger.js` only. No context, sync, schema, or contract-map changes.

**Scope constraint (decided, do not revisit in this plan):** `time_entries.sign_in_lat/lon` are NOT NULL in both SQLite (`src/db/migrations.js:442-443`) and the server schema, so clock-in cannot proceed with null coordinates without a two-sided schema change. That relaxation is deferred as a product decision. This plan fixes the *hang* (bounded wait, clear error, recoverable UI) and adds a last-known-position fallback that resolves most indoor cases with real coordinates. `TimeTrackingContext` behavior is unchanged: on a location error it still shows the snackbar and returns.

**Tech Stack:** React Native (Expo) + JavaScript, Jest, expo-location mocked per existing conventions (check `jest.setup.js` for an existing expo-location mock before writing your own).

## Codex plan review dispositions (2026-07-12, R7-R9) — BINDING

A second-model adversarial review (gpt-5.6-sol) verified this plan against today's tree. All findings accepted. **Where a disposition conflicts with task text below, the disposition wins.**

- **R7 (fake-timer choreography, Task 1):** `getCurrentPosition` awaits the services check and permission request BEFORE scheduling the timeout, and the timeout callback itself awaits `getLastKnownPositionAsync`, so a bare `advanceTimersByTime` can fire before the timer exists and cannot drain the timer-plus-microtask chain. Amendment: start the call and keep the promise in a variable; `await waitFor`/flush microtasks until `Location.getCurrentPositionAsync` has been called; then `await jest.advanceTimersByTimeAsync(10000)`; then await and assert the stored result. Structure the RED run the same way so it fails promptly instead of hanging on today's never-resolving promise.
- **R8 (alert-test choreography, Task 2):** `Alert.alert` fires only after the awaited permission request resolves, and button handlers are async. Amendment for both permission tests: call `requestLocationPermission()` keeping the outer promise; flush until `Alert.alert` has been called; capture the button and `await` its `onPress()`; then await and assert the outer result.
- **R9 (fallback contract pinning, Task 1):** also assert `getLastKnownPositionAsync` was called with `{ maxAge: 900000 }` (expo-location defaults maxAge to unrestricted when omitted); add a test where the last-known lookup THROWS (same timeout-error result as the null case); assert the fallback result passes the last-known position's `timestamp` through, matching the live-fix shape.
- Review-confirmed facts: installed expo-location 19.0.8 exports `getLastKnownPositionAsync`; `jest.setup.js` has no expo-location mock to collide with; `TimeTrackingContext` needs no changes (both clock paths already surface the error and return before writing); NOT NULL applies to sign-in coordinates only (sign-out lat/lon are nullable), which does not change this plan's scope.

## Global Constraints

- Branch off main first: `git checkout -b fix/gps-logger-hardening`.
- Node 20 per `.nvmrc`; prefix jest commands with `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH` if the shell defaults to 22.
- Commit messages: `type(scope): message`. Never add an agent name or co-author line.
- Public API shapes are frozen: `getCurrentPosition` keeps returning `{ coords, timestamp?, error }`; `requestLocationPermission` keeps returning boolean; logger keeps its class API and export format.
- Never write an em dash in any authored doc, comment, or commit message.
- Reviewer note: treat git as read-only during concurrent reviews (no stash/checkout/restore).

---

### Task 1: A real GPS timeout with last-known-position fallback

**Files:**
- Modify: `src/services/locationService.js` (`getCurrentPosition`)
- Create: `__tests__/locationService.test.js`

**Behavior contract:**
- `Location.getCurrentPositionAsync` is raced against a real 10-second timer (use the existing `LOCATION_TIMEOUT` constant; drop the misused `timeInterval` option, keep `accuracy`).
- On timeout, try `Location.getLastKnownPositionAsync({ maxAge: 15 * 60 * 1000 })` (a cached fix up to 15 minutes old is fine for school-vicinity verification). If it returns a position, resolve with its coords exactly like a live fix. If it returns null or throws, resolve with the existing `E_LOCATION_TIMEOUT`-style error message (`'GPS timeout. Please move to an area with better GPS signal (outdoors or near a window) and try again.'`) and `coords: null`.
- The timeout timer must be cleaned up when the live fix wins (no dangling timer). Use fake timers in tests.
- A live fix that resolves before the timer behaves exactly as today.

- [x] **Step 1: Write the failing tests**

Create `__tests__/locationService.test.js`. Mock `expo-location` (module-level `jest.mock`) with controllable `requestForegroundPermissionsAsync`, `hasServicesEnabledAsync`, `getCurrentPositionAsync`, `getLastKnownPositionAsync`, and an `Accuracy` object; mock `react-native`'s `Alert.alert`. Baseline: permission granted, services enabled. Tests, using `jest.useFakeTimers()`:

1. `resolves with coords when the live fix arrives in time`: `getCurrentPositionAsync` resolves immediately with a position; expect coords passthrough, `error: null`, and `getLastKnownPositionAsync` NOT called.
2. `falls back to the last known position when the live fix hangs`: `getCurrentPositionAsync` returns a never-resolving promise; `getLastKnownPositionAsync` resolves with a position. Call `getCurrentPosition()`, advance timers by 10000, await the result. Expect the last-known coords and `error: null`.
3. `returns the timeout error when the live fix hangs and no last-known position exists`: same hang, `getLastKnownPositionAsync` resolves null. Expect `coords: null` and an error message matching `/GPS timeout/`.
4. `does not leave a pending timer after a fast fix`: after test 1 resolves, `jest.getTimerCount()` is 0 (or advance timers and assert no unhandled rejection/state change).

Run to verify they fail (today the promise never resolves in tests 2-3; jest will time out the awaited result, so assert via a resolved flag after `advanceTimersByTime` rather than awaiting an un-settled promise directly; structure the test as: start the call, advance timers, then await).

- [x] **Step 2: Implement**

In `getCurrentPosition`, replace the `getCurrentPositionAsync` call with a race:

```javascript
    const position = await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(async () => {
        if (settled) return;
        settled = true;
        try {
          const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
          if (lastKnown) {
            resolve(lastKnown);
            return;
          }
        } catch {}
        reject({ code: 'E_LOCATION_TIMEOUT' });
      }, LOCATION_TIMEOUT);

      Location.getCurrentPositionAsync({ accuracy: LOCATION_ACCURACY })
        .then((result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
    });
```

with `const LAST_KNOWN_MAX_AGE_MS = 15 * 60 * 1000;` next to the other constants. The existing catch block already maps `E_LOCATION_TIMEOUT` to the right message; no change there.

- [x] **Step 3: Run to verify green**

```bash
npx jest __tests__/locationService.test.js --verbose
```

- [x] **Step 4: Commit**

```bash
git add src/services/locationService.js __tests__/locationService.test.js
git commit -m "fix(location): real 10s GPS timeout with last-known-position fallback"
```

---

### Task 2: Stop the permission alert loop; deep-link to settings when permanently denied

**Files:**
- Modify: `src/services/locationService.js` (`requestLocationPermission`)
- Test: extend `__tests__/locationService.test.js`

**Behavior contract:**
- `requestForegroundPermissionsAsync` already returns `canAskAgain`. When `status !== 'granted'` and `canAskAgain === false`, do NOT recurse. Show one alert explaining that location is disabled for the app, with buttons `Open Settings` (calls `Linking.openSettings()`, resolves false) and `Cancel` (resolves false).
- When `canAskAgain !== false`, keep today's re-prompt behavior exactly.

- [x] **Step 1: Write the failing tests**

1. `permanently denied permission does not re-prompt and offers settings`: mock `requestForegroundPermissionsAsync` to resolve `{ status: 'denied', canAskAgain: false }` every call; mock `Linking.openSettings` (spy on `react-native` Linking). Call `requestLocationPermission()`, trigger the alert's `Open Settings` button (capture `Alert.alert` mock args and invoke the button's `onPress`). Expect: resolves false, `requestForegroundPermissionsAsync` called exactly once, `Linking.openSettings` called once.
2. `deniable permission still re-prompts`: first call resolves `{ status: 'denied', canAskAgain: true }`, second resolves `{ status: 'granted' }`. Trigger `Enable Location`. Expect final result true and two permission requests (pins today's behavior).

- [x] **Step 2: Implement, run, commit**

```bash
npx jest __tests__/locationService.test.js --verbose
git add src/services/locationService.js __tests__/locationService.test.js
git commit -m "fix(location): stop the permission alert loop when canAskAgain is false"
```

---

### Task 3: Logger survives Errors and circular values

**Files:**
- Modify: `src/utils/logger.js` (`addLog`)
- Create: `__tests__/logger.test.js`

**Behavior contract:**
- An `Error` argument serializes as `Name: message` plus its stack (e.g. `` `${error.name}: ${error.message}\n${error.stack}` `` or equivalent single-string form that contains both message and stack).
- Any other object serializes via `JSON.stringify` wrapped in try/catch; on throw (circular refs), the entry becomes `[unserializable: <constructor name or typeof>]` and `addLog` itself never throws.
- `null` keeps serializing as the string `null` (note `typeof null === 'object'`; do not let the Error branch or a `.constructor` read crash on it).
- Everything else (strings, numbers, ordering, timestamp/level shape, flush/prune behavior) is unchanged.

- [x] **Step 1: Write the failing tests**

Create `__tests__/logger.test.js` testing the exported `logger` instance directly (call `logger.addLog('ERROR', [...])` and inspect `logger.buffer`; do not call `init()`, so no console interception or timers are involved; reset `logger.buffer = []` in `beforeEach`):

1. `preserves Error message and stack`: `addLog('ERROR', ['App crashed:', new Error('boom')])`; expect the buffered message to contain `'boom'` and `'Error'` and a stack frame marker (`'at '`).
2. `never throws on circular objects`: build `const a = {}; a.self = a;`; expect `() => logger.addLog('LOG', [a])` not to throw and the message to contain `'[unserializable'`.
3. `null still logs as "null"`: `addLog('LOG', [null])`; message is `'null'`.
4. `plain objects unchanged`: `addLog('LOG', [{ a: 1 }])`; message is `'{"a":1}'`.

Run to verify tests 1-2 fail today (1: message is `'App crashed: {}'`; 2: throws).

- [x] **Step 2: Implement**

Replace the `addLog` mapper with a `serializeArg(a)` helper: `Error` instances (or objects with `name`/`message`/`stack` duck-typing via `a instanceof Error`) get the message+stack form; other non-null objects get try/catch `JSON.stringify` with the `[unserializable: ...]` fallback; everything else `String(a)`.

- [x] **Step 3: Run to verify green, then run the debug-export suite if one exists**

```bash
npx jest __tests__/logger.test.js --verbose
npx jest --silent
```

- [x] **Step 4: Commit**

```bash
git add src/utils/logger.js __tests__/logger.test.js
git commit -m "fix(logger): preserve Error payloads and never throw on unserializable args"
```

---

### Task 4: Wrap

- [x] **Step 1: Full gates**

```bash
npx jest --silent
npm run test:integration
```

- [x] **Step 2: Documentation**

One row in `documentation/sqlite-refactor-log.md` (GPS timeout + last-known fallback + canAskAgain + logger serialization; suite counts). Tick all plan checkboxes.

- [x] **Step 3: Commit**

```bash
git add documentation/sqlite-refactor-log.md docs/superpowers/plans/2026-07-12-gps-logger-hardening.md
git commit -m "docs(sprint1): gps/logger hardening wrap — checklists, log row"
```

Do NOT push or open a PR; the orchestrator handles push, PR, and CI verification.

**Device gate (Jim, after merge):** clock in indoors/airplane-GPS: button must recover within ~10s with either a location (last-known) or a clear snackbar, never a stuck spinner. Deny location permanently on Android, tap clock-in: one settings-alert, no loop. Trigger a crash (dev): Export Logs shows the real error message and stack.

## Self-review notes

- Finding #5 (audit): hang fixed by the race; wedged clock-out fixed by the same path; permission loop fixed by Task 2. The NOT NULL coordinate columns make null-coordinate clock-in out of scope; last-known fallback covers most indoor cases with real data.
- Finding #12 (audit): both failure modes (Error destruction, circular throw) pinned by tests before the fix.
- No changes to TimeTrackingContext, useSessionLaunchGuard, schema, sync, or RLS. The contract map stays untouched.

# Auth Session Resilience Update (Android Focus)

Date: 2026-04-24
Scope: `src/services/supabaseClient.js`, `src/context/AuthContext.js`

## Why this change was made

Field testers reported unexpected sign-outs on Android. The app is offline-first and used in real-world field conditions (intermittent data, app backgrounding, device variability), so strict immediate logout behavior creates user friction.

This update intentionally shifts auth handling to be more UX-tolerant:

- Treat brief auth/session drops as recoverable.
- Keep users in-app unless sign-out is explicit or persistent.
- Improve observability so we can identify real root causes from exported logs.

## What changed

## 1) React Native AppState integration for Supabase auth refresh

File: `src/services/supabaseClient.js`

### Change

- Added `processLock` to Supabase auth config.
- Added `AppState` listener:
  - app `active` -> `supabase.auth.startAutoRefresh()`
  - app not active -> `supabase.auth.stopAutoRefresh()`
- On startup, if app is already active, auto-refresh starts immediately.

### Why

In React Native (non-browser), auth libraries do not always have reliable built-in focus/visibility signals. Explicit AppState wiring is the recommended pattern so refresh behavior matches foreground/background lifecycle.

`processLock` helps serialize auth refresh operations and reduces race-condition risk around token refresh in multi-event situations.

### Risk surface area

Low risk, high upside:

- This does not grant new permissions or expose secrets.
- It mainly improves timing/coordination of existing token refresh behavior.
- Worst-case effect is refresh timing differences, not destructive data changes.

## 2) Auth state logging + graceful sign-out window

File: `src/context/AuthContext.js`

### Change

- Added structured auth logs:
  - Initial session load (`INITIAL_SESSION`)
  - Every auth event from `onAuthStateChange`
  - Whether each event includes an active session
- Added a 15-second grace period (`AUTH_SIGN_OUT_GRACE_PERIOD_MS = 15000`) before forcing logout when:
  - an event has `session === null`
  - user was previously logged in
  - sign-out was not manually initiated in-app
- Preserved immediate logout for explicit manual sign-out from profile.

### Why

Before this change, any null session event immediately set `user = null`, which sent users to login right away. In unstable network/lifecycle transitions, that is often too aggressive.

The grace period allows transient auth blips to self-heal while keeping the user experience smooth.

## Behavior before vs after

Before:

- Any null session event -> immediate logout UX.

After:

- Manual sign-out -> immediate logout (unchanged).
- Non-manual null session event -> wait 15 seconds.
  - If session recovers in that window, user stays signed in.
  - If still null after 15s, logout proceeds.

## UX-first policy this implements

This aligns with a nonprofit field-app operating model:

- Prioritize continuity of use for staff in the field.
- Avoid kicking users out unless clearly necessary.
- Accept a slightly more permissive auth posture in exchange for reduced disruption.

## How to read the new logs

These logs are available through existing log export:

- `[Auth] INITIAL_SESSION hasSession=true|false`
- `[Auth] Event=<EVENT_NAME> hasSession=true|false`
- `[Auth] <EVENT_NAME> with empty session, waiting 15000ms before logout`
- `[Auth] Cleared local auth state (<reason>)`

Example interpretation:

- `Event=TOKEN_REFRESHED hasSession=true` -> healthy refresh flow.
- `Event=SIGNED_OUT hasSession=false` followed by grace wait -> non-manual sign-out path triggered.
- `Cleared local auth state (manual-sign-out)` -> expected user action.
- `Cleared local auth state (<event>-grace-timeout)` -> session did not recover within tolerance window.

## Tuning knobs (if needed later)

- `AUTH_SIGN_OUT_GRACE_PERIOD_MS` (currently 15s)
  - Increase for more tolerance.
  - Decrease for stricter enforcement.

Possible future enhancement:

- Add event-specific grace windows (for example, longer for network-related transitions, shorter for explicit security events).

## Operator checklist (support triage)

Use this when a tester reports "I got signed out."

### 1) Capture the incident basics first

- User email (or staff identifier)
- Device model + Android version
- App version + build number (from Profile screen)
- Approximate local time of sign-out
- What they were doing just before sign-out:
  - App opened from background?
  - App reopened after being closed?
  - Network changed (mobile data/Wi-Fi/offline)?
  - Password changed recently?
  - Logged in on another device recently?

### 2) Ask for log export in the same session

- Ask user to open Profile -> Debug & Support -> Share Logs.
- Save the log file with a consistent name:
  - `auth-signout-<email-or-user>-<date>.txt`

### 3) Scan auth log lines in time order

Look for these lines:

- `[Auth] INITIAL_SESSION hasSession=...`
- `[Auth] Event=... hasSession=...`
- `[Auth] ... waiting 15000ms before logout`
- `[Auth] Cleared local auth state (...)`

### 4) Classify by signature

#### A) Explicit/manual sign-out

Pattern:

- `Cleared local auth state (manual-sign-out)`

Interpretation:

- User or UI flow triggered sign-out intentionally.

Action:

- Confirm whether sign-out button was pressed.
- If user denies it, flag as possible accidental tap UX issue.

#### B) Transient auth drop recovered (no real sign-out)

Pattern:

- `Event=<X> hasSession=false`
- followed by grace-wait log
- then later `Event=... hasSession=true` without `Cleared local auth state (...)`

Interpretation:

- Temporary auth/session interruption recovered within grace window.

Action:

- No urgent fix needed; monitor frequency by device/network.

#### C) Persistent auth loss after grace period

Pattern:

- grace-wait log appears
- then `Cleared local auth state (<event>-grace-timeout)`

Interpretation:

- Session did not recover in 15s. This is a real forced logout path.

Action:

- Check Supabase Auth session controls:
  - Time-box user sessions
  - Inactivity timeout
  - Single session per user
- Check whether user logged in on another device near that time.

#### D) App start with no persisted session

Pattern:

- `INITIAL_SESSION hasSession=false`
- `Cleared local auth state (initial-session-null)`

Interpretation:

- No valid local session was available at startup.

Action:

- Ask whether app data was cleared, app reinstalled, or device "cleaner" tools were used.
- If common across users, investigate storage persistence on affected Android devices.

### 5) Cross-check Supabase project settings (admin)

In Supabase dashboard, review Auth -> Sessions:

- Is `Single session per user` enabled?
- Is `Inactivity timeout` set aggressively?
- Is `Time-box user sessions` short?

For this app's UX-first policy, prefer less aggressive values.

### 6) Escalation bundle for engineering

When escalating, include:

- Incident basics from step 1
- Log file
- Classification (A/B/C/D)
- Supabase session settings snapshot at time of incident
- Whether issue reproduced on second attempt

This avoids guesswork and gives engineering enough context for root-cause analysis.

## Verification notes

Local tests were run after this update. Existing failures are unrelated to auth changes:

- `__tests__/groupHelpers.test.js` reports `nextGroupNumber is not a function`.

No linter issues were introduced in modified auth files.


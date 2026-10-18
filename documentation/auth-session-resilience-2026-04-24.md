# Auth Session Resilience (Android Focus)

**Standing behavior doc.** Describes the present. Originally written 2026-04-24; the behavior section
and operator checklist were **updated 2026-10-18** for local-first cold start and the current
signed-in EA handle. Historical log examples below are labelled separately from current behavior.

Scope: `src/services/supabaseClient.js`, `src/context/AuthContext.js`,
`src/context/SignedInEAContext.js`, `src/context/OfflineContext.js`

## Why this exists

Field testers reported unexpected sign-outs on Android. The app is offline-first and used in real
field conditions (intermittent data, backgrounding, device variability), so a strict "any null session
means log out" policy creates friction and can strand an EA at a login screen with no connectivity.

The policy is deliberately UX-tolerant: keep the user in-app unless sign-out is explicit or genuinely
persistent, and log enough to root-cause the rest from an exported log file.

## Current behavior

Four distinct paths. The important thing to understand is that **`SIGNED_OUT` is not graced** — the
15-second grace period applies only to *other* null-session events.

| Trigger | Behavior |
|---|---|
| **Manual sign-out** (Profile → Sign Out) | Revokes session admission and closes the signed-in EA handle, then clears React user state and persisted local auth before starting the background Supabase sign-out request. Per-EA cached data stays in that EA's file. The internal reason is `manual-sign-out`; it is not emitted as a clearing log line. The diagnostic gap is tracked in `ROADMAP.md`. |
| **`SIGNED_OUT` event** | Checks persisted auth first. If a refreshable persisted session exists **for the same user**, the event is treated as stale and **ignored entirely**. Otherwise closes the handle, clears persisted auth and commits immediately with reason `signed-out`. Non-retryable refresh failure removes the stored session, so revocation still signs the EA out. |
| **Provider mount** (cold start) | After subscribing, immediately runs the persisted-session gate with reason `mount-persisted`, without waiting for `INITIAL_SESSION` or any other supabase-js event. This path is **open-only**: a refreshable saved session opens that EA's local handle; an empty read changes nothing, including session-storage admission. With no saved session, the signed-out/login decision stays with the SDK's null `INITIAL_SESSION`. An explicit sign-in or sign-out already in progress takes precedence. A late same-user `INITIAL_SESSION` keeps the open handle; a late null initial event re-reads persistence through the unchanged event-driven gate (`initial-session`) and keeps the restored EA when the saved session remains. |
| **Any other event with an empty session** | With an active user, waits `AUTH_SIGN_OUT_GRACE_PERIOD_MS` (15s). If the session recovers in that window the user stays signed in; otherwise commits with reason `<EVENT>-grace-timeout`. Without an active user, consults the persisted-session gate. |

Two supporting behaviors:

- **`processLock` + AppState wiring** (`supabaseClient.js`): auto-refresh starts on `active` and stops
  when backgrounded. React Native has no reliable browser-style visibility signal, so this is wired
  explicitly. `processLock` serializes refresh operations and reduces token-refresh races.
- **Credentials wake consumers after a local-only open.** If the handle opened without usable
  credentials, the first same-user session event with an access token (including `TOKEN_REFRESHED`
  or `INITIAL_SESSION`) wakes both providers through the shared `subscribeToFirstCredentials`
  rule: SignedInEA runs its existing coalesced profile/reference refresh, and OfflineContext calls
  `requestDomainPull('credentials')` to wake ChildrenContext and ClassesContext through the existing
  staleness check and `domainPullNonce`. ClassesContext's existing load effect also reloads and
  republishes school options on that nonce. The rule checks `getLatestAuthSession()` at subscription
  time, defers work until AuthContext has installed credentials, and runs at most once per handle;
  later routine token refreshes do not repeat these pulls. OfflineContext still heals terminal RLS
  failures and schedules sync on same-user `INITIAL_SESSION`, `SIGNED_IN` and `TOKEN_REFRESHED`
  sessions. Neither path reopens the handle.

The Galaxy A03s preview build 12 reproduction exposed a lost `INITIAL_SESSION`: after the first
offline refresh attempt, the auto-refresh ticker holds the auth lock for another offline refresh.
Initial delivery waits only the 5 s `lockAcquireTimeout`; an unhandled
`ProcessLockAcquireTimeoutError` in auth-js 2.100.1's fire-and-forget subscription task prevents the
event from arriving. Subscribing before the ticker restored delivery in the control experiment but
still took about 51 s. Reading local persistence at mount removes that network dependency.
An empty mount read is not evidence of sign-out: auth-js removes a split session's `-user`
companion before writing the merged session. Revoking admission in that gap would reject the
SDK's merged write. The open-only mount leaves that migration and its later event intact.

## How to read the logs

Available via Profile → Debug & Support → Share Logs. Current `AuthContext` does not emit event,
restore, grace-wait or clearing-reason lines. It does log `[Auth] Background Supabase sign-out failed`
when background cleanup fails. The following examples belong to older builds; use them only when
present, and do not infer a failed restore from their absence:

```
[Auth] Event=<EVENT_NAME> hasSession=true|false
[Auth] Restored persisted offline session (<reason>)
[Auth] Ignoring stale SIGNED_OUT; a valid session for the current user persists
[Auth] <EVENT> with empty session, waiting 15000ms before logout
[Auth] Cleared local auth state (<reason>)
[Auth] Background Supabase sign-out failed
```

Current internal reasons include `mount-persisted`, `initial-session`, `manual-sign-out`,
`signed-out`, `<EVENT>-grace-timeout`, and `<EVENT>-no-active-user`. These are code-path labels,
not guaranteed support-log messages. Neither an `INITIAL_SESSION` line nor a restore line is
required for a healthy offline start.

## Operator checklist (support triage)

Use when a tester reports "I got signed out."

**1. Capture the basics.** User email; device model + Android version; app version/build (Profile
screen); approximate local time; and what they were doing — reopened from background? cold start after
a force-quit? network changed? password changed? signed in on another device?

**2. Get the log export in the same session** (Profile → Debug & Support → Share Logs). Save as
`auth-signout-<user>-<date>.txt`.

**3. Find any `[Auth]` lines in time order**, then classify using the reported behavior as well.
The literal lines in A–D and G are historical examples, not required output from current builds:

### A) Possible explicit sign-out
The manual path clears local auth directly. Older builds may record
`Cleared local auth state (signed-out)`; current builds have no distinct clearing-reason line.
Correlate timestamps with user actions. The log cannot currently prove a manual tap by itself.

### B) `SIGNED_OUT` committed
`Cleared local auth state (signed-out)`
→ Supabase emitted `SIGNED_OUT` **and** persisted auth did not vouch for the session. This can follow
manual sign-out or a genuine server-side/credential-level sign-out. Use surrounding timestamps and
user report, then check the Supabase Auth controls in step 4 when manual action is not established.

### C) Transient drop that recovered (not a sign-out)
`<EVENT> with empty session, waiting 15000ms before logout`, later followed by
`Event=... hasSession=true` and **no** `Cleared local auth state` line.
→ Worked as designed. No fix needed; track frequency by device/network to spot a bad device cohort.

### D) Transient drop that did not recover
Grace-wait line, then `Cleared local auth state (<EVENT>-grace-timeout)`.
→ The session never came back within 15s. This is a real forced logout. Check Supabase session
settings (step 4).

### E) Cold start with no persisted session
The `mount-persisted` gate finds no refreshable saved session and leaves startup undecided.
The SDK's null `INITIAL_SESSION` rechecks persistence and opens login if it is still empty; with
no saved session the SDK has no network refresh to wait for. Older logs may show
`Event=INITIAL_SESSION hasSession=false` followed by a clearing line, but current builds do not
emit those lines. Ask whether app data was cleared, the app reinstalled, or a device
"cleaner"/battery-optimiser tool ran. If this is common across
users, investigate storage persistence on the affected Android builds.

### F) Healthy offline restore (not a bug — confirm and close)
The `mount-persisted` gate reads the saved session and opens that EA's local handle, even if
`INITIAL_SESSION` never arrives. Confirm that the EA can open their local data offline. Older
builds may log `Restored persisted offline session (...)`; current builds need not emit it.
A late same-user or null `INITIAL_SESSION` must neither reopen the handle nor sign the EA out
while that session remains saved. If the EA is still stuck on "Preparing your offline data",
capture the build and timestamps; absent auth events alone no longer explain a blocked gate.

### G) Stale event, correctly ignored
`Ignoring stale SIGNED_OUT; a valid session for the current user persists`
→ Supabase emitted a spurious `SIGNED_OUT`; the app refused it. Not a sign-out. Frequent occurrences
are worth reporting to engineering as a Supabase client-behavior signal.

**4. Cross-check Supabase project settings (admin).** Auth → Sessions: is `Single session per user`
on? Is `Inactivity timeout` aggressive? Is `Time-box user sessions` short? This app's UX-first policy
prefers permissive values.

**5. Escalation bundle:** incident basics, the log file, your A–G classification, a snapshot of the
Supabase session settings at the time, and whether it reproduced.

## Tuning knobs

`AUTH_SIGN_OUT_GRACE_PERIOD_MS` (`AuthContext.js:10`, currently 15000). Raise for more tolerance,
lower for stricter enforcement. Note it does **not** affect `SIGNED_OUT` or manual sign-out, both of
which are immediate by design.

Possible future enhancement: event-specific grace windows (longer for network transitions, shorter for
explicit security events).

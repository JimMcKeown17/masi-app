# Auth Session Resilience (Android Focus)

**Standing behavior doc.** Describes the present. Originally written 2026-04-24; the behavior section
and operator checklist were **rewritten 2026-07-13** after an audit found they described a code path
that no longer exists (the old checklist told support to grep for a log string the app never emits).

Scope: `src/services/supabaseClient.js`, `src/context/AuthContext.js`

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
| **Manual sign-out** (Profile → Sign Out) | Immediately clears React user state, cached profile, and persisted local auth before starting the Supabase sign-out request. The current path does **not** reliably emit a distinct `manual-sign-out` clearing reason; this diagnostic gap is tracked in `ROADMAP.md`. |
| **`SIGNED_OUT` event** | Checks persisted auth first. If a refreshable persisted session exists **for the same user**, the event is treated as stale and **ignored entirely**. Otherwise clears the profile cache + persisted session and commits immediately with reason `signed-out`. |
| **`INITIAL_SESSION` with no active user** (cold start) | Consults persisted auth. Persisted session present and no current user → **restores it offline** rather than bouncing to login. No persisted session → commits with reason `INITIAL_SESSION-no-active-user`. |
| **Any other event with an empty session** | Waits `AUTH_SIGN_OUT_GRACE_PERIOD_MS` (15s). If the session recovers in that window the user stays signed in; otherwise commits with reason `<EVENT>-grace-timeout`. |

Two supporting behaviors:

- **`processLock` + AppState wiring** (`supabaseClient.js`): auto-refresh starts on `active` and stops
  when backgrounded. React Native has no reliable browser-style visibility signal, so this is wired
  explicitly. `processLock` serializes refresh operations and reduces token-refresh races.
- **`TOKEN_REFRESHED` for the already-current user short-circuits** — it does not re-run authenticated
  startup hydration.

## How to read the logs

Available via Profile → Debug & Support → Share Logs. The auth subsystem emits these lines:

```
[Auth] Event=<EVENT_NAME> hasSession=true|false
[Auth] Restored persisted offline session (<reason>)
[Auth] Ignoring stale SIGNED_OUT; a valid session for the current user persists
[Auth] <EVENT> with empty session, waiting 15000ms before logout
[Auth] Cleared local auth state (<reason>)
[Auth] Background Supabase sign-out failed
```

`<reason>` is `signed-out`, `<EVENT>-grace-timeout`, `<EVENT>-no-active-user`, or
`<EVENT>-no-active-user-after-local-sign-out`. A future implementation may restore an explicit
`manual-sign-out` reason, but operators must not rely on it today.

> There is no `initial-session-null` reason. A pre-2026-07 version of this document told operators to
> look for one. If you are working from an older copy, discard it.

## Operator checklist (support triage)

Use when a tester reports "I got signed out."

**1. Capture the basics.** User email; device model + Android version; app version/build (Profile
screen); approximate local time; and what they were doing — reopened from background? cold start after
a force-quit? network changed? password changed? signed in on another device?

**2. Get the log export in the same session** (Profile → Debug & Support → Share Logs). Save as
`auth-signout-<user>-<date>.txt`.

**3. Find the `[Auth]` lines in time order**, then classify:

### A) Possible explicit sign-out
The current manual path clears local state directly and may be followed by
`Cleared local auth state (signed-out)` or no distinct clearing-reason line. Correlate the timestamp
with user actions. The log cannot currently prove a manual tap by itself.

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
`Event=INITIAL_SESSION hasSession=false` then `Cleared local auth state (INITIAL_SESSION-no-active-user)`.
→ No valid local session at startup. Ask whether app data was cleared, the app reinstalled, or a
device "cleaner"/battery-optimiser tool ran. If this is common across users, investigate storage
persistence on the affected Android builds.

### F) Healthy offline restore (not a bug — confirm and close)
`Event=INITIAL_SESSION hasSession=false` then `Restored persisted offline session (...)`.
→ The app came back offline and correctly restored the session instead of bouncing to login. If the
user still reports being signed out, the problem is elsewhere; keep reading the log.

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

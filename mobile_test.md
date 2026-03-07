# Masi App Internal Mobile Test Plan

## Purpose
Validate core workflows on iOS and Android with a small internal team before app store submission and broader field rollout.

This plan is focused on existing features:
- Login/logout and data persistence
- Time tracking sign in/out online and offline
- Literacy session create/submit/history online and offline
- Child creation with fake data and fake results

## Success Gates

### Gate 1: Internal Readiness (5-6 staff)
All items below must pass before moving to live pilot:
- No Critical bugs open
- No High bugs open in auth, time tracking, sessions, children, or sync
- 100% pass on required test cases in this document
- At least one full online-to-offline-to-online cycle completed per tester
- Evidence collected for all failed tests (logs, database export, screenshot)

### Gate 2: Live Pilot Readiness (10-20 field staff)
All items below must pass before broader rollout:
- Internal Readiness gate passed for at least 5 consecutive days of testing
- Pilot onboarding checklist complete (accounts, device list, support contact flow)
- Crash/blocker rate acceptable for field use
- Data integrity verified (no silent loss, no cross-user leakage)

## Team, Devices, and Test Window

## Test Team
- 5-6 internal testers minimum
- Include at least:
  - 2 iOS users
  - 2 Android users
  - 1 person with weaker/unstable connectivity conditions

## Device Matrix
Track each tester in a matrix:
- Name
- Platform (`iOS` or `Android`)
- Device model
- OS version
- App build version
- Network condition used (`Wi-Fi`, `Cellular`, `Offline/Airplane Mode`)

## Test Window
- Suggested duration: 7-10 business days
- Daily usage target: each tester performs all required scenarios at least once per day

## Pre-Test Setup
- Create test staff accounts for all internal testers
- Confirm each tester can install the same app build
- Confirm each tester can access Profile export actions:
  - `Profile -> Share Logs`
  - `Profile -> Share Database`
- Use fake children names and fake session data only during internal testing
- Assign one test coordinator to receive bug reports and test artifacts

## Severity Definitions
- Critical: Data loss, security/privacy leak, app unusable for core workflow
- High: Core workflow fails or sync is unreliable enough to block field use
- Medium: Workflow works but has incorrect behavior, confusing status, or repeatable friction
- Low: Minor UI issue or non-blocking behavior

## Evidence Required for Any Failed Test
- Screenshot or screen recording
- Timestamp and tester name
- Platform, OS version, app build
- Repro steps
- `Profile -> Share Logs` file
- `Profile -> Share Database` file (for data/sync issues)

## Required Test Scenarios

## Suite A: Authentication and Persistence

### A1. Login Success
Steps:
1. Open app with active internet
2. Login with valid credentials
3. Navigate Home, My Children, Sessions, Profile
Expected:
- Login succeeds
- User lands in authenticated area
- No unexpected error banner

### A2. Logout and Re-Login
Steps:
1. Login
2. Logout from Profile
3. Login again
Expected:
- Logout succeeds immediately
- Re-login succeeds
- App remains stable across repeated login/logout cycles

### A3. App Restart Persistence
Steps:
1. Login
2. Force close app
3. Reopen app
Expected:
- Session persistence behaves as intended
- No data disappearance in children/session history that was previously saved

### A4. Account Switch on Same Device
Steps:
1. Login as User A and create test data
2. Logout
3. Login as User B while offline and then online
Expected:
- No User A private data appears for User B
- No cross-user leakage in cached views

## Suite B: Time Tracking (Online and Offline)

### B1. Online Sign In and Sign Out
Steps:
1. Ensure internet on
2. Sign in from Home
3. Wait 2-5 minutes
4. Sign out
Expected:
- Sign in/out both succeed
- Times and elapsed status update correctly
- Entry appears in work history

### B2. Offline Sign In and Sign Out
Steps:
1. Turn on Airplane Mode
2. Sign in, wait, sign out
3. Confirm local history entry appears
4. Re-enable network
Expected:
- Action works offline without crash
- Record appears as pending unsynced while offline
- Record syncs successfully after reconnect

### B3. Permission Denied Flow
Steps:
1. Deny location permission
2. Attempt sign in
Expected:
- App blocks sign in with clear message
- No partial/broken time entry created

### B4. Duplicate Tap / Double Action Protection
Steps:
1. Rapidly tap sign in button multiple times
2. Repeat for sign out
Expected:
- Exactly one active entry at a time
- No duplicate time rows created

## Suite C: Literacy Sessions (Online and Offline)

### C1. Create and Submit Session Online
Steps:
1. Ensure internet on
2. Open Literacy session form
3. Select children (or group), complete required fields, submit
4. Open Session History
Expected:
- Submit succeeds
- New session appears in history
- Stored data reflects selected children and entered details

### C2. Create and Submit Session Offline
Steps:
1. Turn on Airplane Mode
2. Complete and submit session
3. Verify session appears in history as local/pending
4. Restore network
Expected:
- Submit works offline
- Session syncs after reconnect
- No duplicate or missing record after sync

### C3. App Kill During Offline Queue
Steps:
1. Create session offline
2. Force close app before reconnect
3. Reopen app still offline
4. Reconnect network
Expected:
- Unsynced session still exists after reopen
- Sync completes when network returns

## Suite D: Child Management with Fake Data

### D1. Add Fake Child Online
Steps:
1. Ensure internet on
2. Add new fake child
3. Confirm child appears in list/details
Expected:
- Save succeeds
- Child available for session selection

### D2. Add Fake Child Offline Then Sync
Steps:
1. Go offline
2. Add fake child
3. Confirm local list includes child
4. Reconnect network
Expected:
- Child remains visible locally
- Sync succeeds after reconnect

### D3. Child Usability in Session Flow
Steps:
1. Use newly added fake child in a Literacy session
2. Submit session
Expected:
- Child is selectable in session form
- Session submission and history link correctly

### D4. Delete/Removal Reliability Check
Steps:
1. Delete a fake child or remove from group
2. Reopen app and refresh after reconnect
Expected:
- Deletion/removal state remains consistent
- No reappearing records after sync/reload

## High-Risk Regression Checks (Must Run Daily)
- Offline to online sync parity for:
  - `time_entries`
  - `sessions`
  - `children`
  - `groups` and `children_groups`
- No cross-user local data leakage on shared devices
- Sync status reflects reality (pending/failed/success)
- No silent data loss after app restart or reconnect

## Daily Execution Cadence
- Each tester runs Suites A-D once per day
- Coordinator reviews all failures same day
- Bugs triaged by severity and assigned owner
- Fixes retested with the exact failing scenario before closure

## Bug Report Template
Use this exact format:

- Title:
- Severity: (`Critical` | `High` | `Medium` | `Low`)
- Tester:
- Date/Time:
- Platform/Device/OS:
- App Build:
- Network State:
- Scenario ID: (example: `B2`)
- Steps to Reproduce:
- Expected Result:
- Actual Result:
- Attachments:
  - Screenshot/Video
  - Logs export file
  - Database export file

## Exit Criteria for Internal Phase
Internal phase is complete only when:
- All required scenarios in Suites A-D pass on both iOS and Android
- No Critical or High issues remain open
- Offline/online transitions pass for all core workflows
- At least 5 testers complete full checklist on at least 3 separate days

## Controlled Live Pilot (10-20 Field Staff)
After internal phase passes:
1. Move from fake children to real assigned children for pilot users
2. Start with 10-20 field staff in controlled rollout
3. Monitor daily:
   - Failed sync count
   - Support tickets
   - Data integrity issues
4. Keep fast rollback path:
   - Pause new users
   - Continue fixing and retesting on internal cohort if Critical/High issues appear

## After Pilot Stabilization: Next Build Priorities
Proceed in this sequence after pilot stability:
1. Build session forms for other programs
2. Build assessment tools and test internally
3. Build dashboard stats and badges on Home

## Ownership
- Test Coordinator: owns schedule, matrix, and triage queue
- Internal Testers: execute daily scenarios and submit evidence
- Engineering: fix defects, retest with same scenario IDs, close only with proof


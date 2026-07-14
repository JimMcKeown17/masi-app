# Plan 6 Android Emulator Validation - 2026-05-22

This folder contains redacted evidence from the deeper Plan 6 Android emulator pass against the clean-slate `masi-app-sqlite` backend.

## Result

Passed for the core SQLite/outbox path.

Covered:

- fresh Expo Go launch and sign-in against SQLite staging
- first authenticated data hydration
- offline restart with cached local data
- offline assessment write
- offline session write
- force-stop/reopen while offline with pending outbox rows
- reconnect and sync
- Supabase row-count verification for the synced rows
- support export warning and Android share flow
- redacted logcat review for SQLite/database-lock/fatal errors

Observed sync result:

- total synced: 6
- total failed: 0
- sessions: 1
- session_attendees: 1
- assessments: 1
- assessment_items: 3

Supabase verification found the same new-row counts in the staging backend.

## Limitations

- Clock-in/out did not complete on the emulator because Expo Location returned current-location unavailable even after emulator location injection. Test time tracking on a physical device.
- This pass did not manually create a new child or group. Those write paths have automated coverage, but physical-device exploratory testing should include them if time allows.
- The support export share flow opened a native Android share target. Gmail intercepted with its own onboarding/setup screens, so this pass proves the app generated and launched the share flow, while export content shape remains covered by automated tests.

## Evidence

Key artifacts:

- `offline-assessment-saved.png`
- `offline-session-final.png`
- `offline-reopen-pending.png`
- `reconnected-sync.png`
- `support-export-dialog.png`
- `support-export-share-sheet.png`
- `logcat-redacted.txt`

All XML/log artifacts in this folder have the staging test email and Supabase public values redacted.

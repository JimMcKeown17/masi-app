# Interim field rules: removing children, classes and groups (November 2026)

**Status:** in force from 2026-11-04 until the fixes below are live. Each rule says what lifts it.
**2026-11-05:** the server batch (plan step R1) is applied to `masi-app-sqlite`; the two-phone
check on installed 1.5.0 (#157) is still open. The lifecycle app update is in `1.5.0+4` and every
later update; `1.5.0+5` (Wrap up cards, #169) is live. A phone has it only when
[its receipt says so](#how-to-tell-a-phone-has-the-app-update).
**Why:** the 1.5.0 pilot builds can strand recorded work when a child, class or group is removed,
or when Head Office changes who teaches whom while a phone is offline. The bug records are
MA-BUG-20261104-001 to -021 in [`docs/bugs/`](../docs/bugs/README.md); the fix plan is
[`docs/superpowers/plans/2026-11-04-lifecycle-safety.md`](../docs/superpowers/plans/2026-11-04-lifecycle-safety.md).
These rules avoid the actions that cause it until the server fix and the app update land.

## For EAs (read out at training)

Until your coordinator tells you your app has the update:

- **Don't use Delete child, Delete class, or "No class".** If a child stops coming, moves class, or
  leaves the school, tell your coordinator.
- **Open the app on Wi-Fi at the end of each day** so everything you saved uploads.
- **Keep your phone's automatic date and time switched on.**
- **After an app update:** open the app, close it fully, open it again on Wi-Fi, then go to
  Profile → Support tools → **Send diagnostics**.

## For Head Office and coordinators

1. **Before you change who teaches a child, class or group, end an EA's delivery, or switch an EA's
   programme**, the EA's phone must have uploaded everything:
   1. the EA opens the app on Wi-Fi and lets it finish syncing;
   2. the EA taps Profile → Support tools → Send diagnostics;
   3. support confirms the receipt shows **0 waiting**, and that every "needs attention" item appears
      in that EA's receipts on the server (`npm run bugs:incidents`). A "needs attention" banner on
      the phone is fine when this holds. Do **not** wait for "All saved and synced": a refused item
      keeps the banner until the app update, and waiting for it would block you for weeks;
   4. then make the change with the Head Office lifecycle script (`npm run ho:handover`,
      `ho:end-delivery`, `ho:reopen`; see the
      [runbook](./ea-access-runbook.md#head-office-lifecycle-changes-handover-end-delivery-reopen)).
      It ends the old row before opening the new one, never sets an end before its start, and never
      bumps `row_version`. Its first use on the live database needs Jim's go-ahead.

   *Lifted for an EA once the "held on the day" server rule is live and verified (plan step R1) **and**
   that EA's phone has the app update ([how to tell](#how-to-tell-a-phone-has-the-app-update)).* After
   that, queued work lands whatever order things upload in. Do not keep this rule beyond that: making
   changes wait on uploads is how Zazi's problems started.
2. **Don't reopen anything** (clear an end date or un-archive) for an EA whose diagnostics show a refused
   archive, and don't ask that EA to pull to refresh. Their phone would re-send the old archive and end
   it again. *Lifted per phone when its diagnostics show the app update
   ([how to tell](#how-to-tell-a-phone-has-the-app-update); plan step G1).*
3. **Off-boarding is suspend only:** `npm run ea:suspend`. Never delete a login (Auth user) or a
   `public.users` row: that deletes the EA's sessions, assessments, ticks and assignments
   (MA-BUG-20261104-008). If a suspended EA still has unsent work: `npm run ea:restore`, let the phone
   upload, then suspend again. *Permanent: a suspended login cannot upload.*
4. **Don't switch on the 2027 academic year** until the "held on the day" rule is live
   (MA-BUG-20261104-004).
5. **Group seeds:** leave `grouping_version_id` empty until the app update ships
   (MA-BUG-20261104-016).

## For support (daily during the retest)

- Run the `/bug-sync` sweep. Look for `upload_terminal` receipts on `session_attendees`,
  `letter_mastery`, `skill_mastery`, `sessions` and the lifecycle tables, and for `upload_backlog_stale`.
  The sweep also runs the daily lifecycle check (`scripts/lifecycle-invariants.sql`).
- Before telling any EA to tap Sync now or pull to refresh after a Head Office change, check their
  receipts for refused archive or restore rows (rule 2).
- Each new pattern becomes an MA-BUG record.

## How to tell a phone has the app update

The lifecycle app update is in `1.5.0+4` and every later update.

1. The EA opens the app on Wi-Fi, closes it fully, and opens it again on Wi-Fi. A phone downloads an
   update while it runs and starts it on the next cold start.
2. Profile → **App release** must show Release `1.5.0+4` or later (`1.5.0+5`, `1.5.0+6`, …).
3. The EA taps Profile → Support tools → **Send diagnostics**. In that receipt
   (`npm run bugs:incidents`), `observed.update.otaRelease` must be 4 or more;
   `observed.application.releaseLabel` shows the same release as text (`1.5.0+4`).

These do **not** count: a lower number (`1.5.0+2`) or `1.5.0+?`; and a phone with no App release
card (Profile ends with the old `Version 1.5.0 (Build N) · Backend …` footer), whose receipt has no
`otaRelease`. No card means the store build's own bundle, the first lifecycle update (group
`8addaae6`, counted as `1.5.0+1`), or group `9542a163` (a bare `eas update` from `main` that lacks
the lifecycle app update). A phone that does not pass is cold-started on Wi-Fi again to pick up the
current update, then sends diagnostics again.

## When each rule lifts

| Rule | Lifted by | How you know |
| --- | --- | --- |
| EA: no Delete child / Delete class / No class | App update (plan steps O1, O2, G1) | That phone's Send diagnostics receipt shows Release `1.5.0+4` or later ([how to tell](#how-to-tell-a-phone-has-the-app-update)) |
| Head Office: upload everything first | "Held on the day" server rule (plan step R1) **and** the app update on that EA's phone | Build log records R1 applied and the two-phone check passed, and the phone's receipt shows Release `1.5.0+4` or later |
| No reopen / no pull to refresh after a refused archive | App update on that phone | The phone's receipt shows Release `1.5.0+4` or later |
| Suspend-only off-boarding | Permanent | — |
| No 2027 year | "Held on the day" server rule | As for R1 |
| Group seeds without a grouping version | App update (plan step O2) | Every pilot phone's receipt shows Release `1.5.0+4` or later |

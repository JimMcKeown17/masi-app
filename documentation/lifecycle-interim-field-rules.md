# Interim field rules: removing children, classes and groups (November 2026)

**Status:** in force from 2026-11-04 until the fixes below are live. Each rule says what lifts it.
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
   1. the EA opens the app on Wi-Fi;
   2. Sync status reads "All saved and synced";
   3. the EA taps Profile → Support tools → Send diagnostics;
   4. support confirms the receipt shows **0 waiting**, and that every "needs attention" item has its
      own receipt on the server (`npm run bugs:incidents`);
   5. then make the change: end the old row before adding the new one, never set an end before its
      start, and never bump `row_version` on an end.

   *Lifted when the "held on the day" server rule is live and verified (plan step R1).* After that,
   queued work lands whatever order things upload in. Do not keep this rule beyond that: making changes
   wait on uploads is how Zazi's problems started.
2. **Don't reopen anything** (clear an end date or un-archive) for an EA whose diagnostics show a refused
   archive, and don't ask that EA to pull to refresh. Their phone would re-send the old archive and end
   it again. *Lifted per phone when its diagnostics show the app update (plan step G1).*
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
- Before telling any EA to tap Sync now or pull to refresh after a Head Office change, check their
  receipts for refused archive or restore rows (rule 2).
- Each new pattern becomes an MA-BUG record.

## When each rule lifts

| Rule | Lifted by | How you know |
| --- | --- | --- |
| EA: no Delete child / Delete class / No class | App update (plan steps O1, O2, G1) | That phone's Send diagnostics receipt shows the new `updateId` |
| Head Office: upload everything first | "Held on the day" server rule (plan step R1) | Build log records R1 applied and the two-phone check passed |
| No reopen / no pull to refresh after a refused archive | App update on that phone | The phone's receipt shows the new `updateId` |
| Suspend-only off-boarding | Permanent | — |
| No 2027 year | "Held on the day" server rule | As for R1 |
| Group seeds without a grouping version | App update (plan step O2) | Every pilot phone shows the new `updateId` |

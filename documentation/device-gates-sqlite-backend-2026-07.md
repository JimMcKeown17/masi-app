# Device Gates: SQLite Backend (Sprints 1 to 4)

**For:** Jim, on a real device (ideally one low-end Android plus one iPhone).
**Why:** Sprints 1 to 4 rewrote the local storage layer, the pull path, and the sync scheduler. Everything is green in tests, but tests cannot model two SQLite connections, a real network, a real GPS chip, or a force-quit. This is the list that turns "tests pass" into "it works."
**Time:** about 45 minutes for the core list, plus one two-device scenario.

## Setup

1. Build from current `main` with the EAS **preview** profile. That targets the `masi-app-sqlite` backend (`segygjzpujphwvrubusm`). A plain `npm start` also targets it now, but a real build is what field staff will run.
2. **Start from a fresh install** (delete the app first). The local database must be clean, because the deterministic-id deploy gate assumes no pre-fix rows.
3. Sign in as a test EA who has at least one class, several children, and one group.
4. Keep Profile > Export Logs handy. If anything below misbehaves, export the logs before doing anything else.

---

## A. Startup and auth

- [ ] **A1. Cold start online.** Kill the app, reopen. You reach Home without a long spinner, and your roster is there.
- [ ] **A2. Cold start offline (the one that used to hang).** Turn on airplane mode, force-quit, reopen. You should reach Home **immediately** with cached data, not sit on a startup spinner. *(Sprint 2B: user is published before the reference-data pull.)*
- [ ] **A3. Weak-signal start.** If you can find one bar of signal or a captive-portal wifi, cold start there. Same expectation: Home appears, the network catches up in the background.
- [ ] **A4. Sign out, sign in as a second EA.** The second EA sees only their own roster. No leakage.

## B. Time tracking and GPS

- [ ] **B1. Clock in indoors** (concrete building, poor GPS). The button must **not** spin forever. Within about 10 seconds it either records a location or records the entry **without** a location. *(Sprint 1: the "10s GPS timeout" previously did not exist.)*
- [ ] **B2. Clock out** in the same conditions. Same expectation. The shift must close.
- [ ] **B3. Deny location permission permanently**, then clock in. You should get a path to Settings, not a repeating alert loop.
- [ ] **B4. Clock in via Home > Record Session > "Clock In Now"**, then go back to Home. Home must show you as clocked in, and there must be exactly one open entry.

## C. Session capture (the highest-traffic flow)

- [ ] **C1. Capture a full session** with a real roster: select children, letters, type a comment, save. It should feel responsive, and the completion screen should appear **immediately** on save. *(Sprint 3: navigate-on-commit.)*
- [ ] **C2. Capture a session offline.** Airplane mode, capture, save. It saves locally and shows as waiting to sync.
- [ ] **C3. Force-quit with unsynced work.** After C2, force-quit the app, reopen (still offline). The session is still there, still pending.
- [ ] **C4. Reconnect.** Turn the network back on. The session syncs without you doing anything. "Last Synced" updates.
- [ ] **C5. Leave guard.** Start a session, select a child, then swipe back. You should be warned about unsaved changes.
- [ ] **C6. Current reading level survives the real lifecycle.** Open a literacy session and confirm a child's previously saved level is pre-filled. Change it, save while offline, force-quit, reopen, and start another session for the same child: the new value must still be selected. Reconnect and sync, then confirm the child update leaves the outbox and the same level appears on Edit Child and Child Results. The completed session must retain its own per-child snapshot even after the current child level changes again.

## D. Assessment capture

- [ ] **D1. Run a full 60-letter EGRA.** Taps must feel instant, the countdown must be smooth and wall-clock accurate, and the timer must hard-stop at expiry.
- [ ] **D2. Background mid-assessment** (switch apps for 20 seconds), come back. The clock pauses and resumes rather than running down.
- [ ] **D3. Attempt number.** Assess the same child twice in a row, quickly, tapping the child immediately without waiting. The second assessment must be recorded as attempt 2, not attempt 1. *(Sprint 3: attempt number resolved at launch.)*
- [ ] **D4. Capture mode still persists.** Profile > switch capture mode (grid vs sequential), leave Profile, launch an assessment. It uses the mode you chose. *(Sprint 4A: this moved to a new deviceSettings module.)*

## E. Dates (South Africa is UTC+2, so the bug window is 00:00 to 01:59)

- [ ] **E1.** Set the device clock to about 00:30, clock in, and check Work History. The entry must appear under **today**, not yesterday. Set the clock back afterwards.
- [ ] **E2.** Home "days worked this month" counts that entry in the current month.

## F. Sync status and trust

- [ ] **F1.** With pending work, Home and the Sync Status screen say "waiting to sync," calmly. Not red, not "failed."
- [ ] **F2.** Force "Sync Now." It syncs, including anything backed off.
- [ ] **F3.** Idle behavior. Leave the app open and idle for a few minutes with nothing pending. It should feel still. No repeated spinner flicker, no battery burn. *(Sprint 1: the 30-second amplifier.)*

## G. Head-office changes and the reconcile gate (the important new one)

This is the scenario Sprint 4B exists for. There is no head-office UI yet, so you play head office with SQL against the SQLite backend. Run these in your own terminal (the CLI needs your keychain login). Get the ids first:

```bash
npm run sqlite:staging:query -- "select u.id as ea_id, c.id as class_id, c.name from users u join class_ea_assignments cea on cea.ea_user_id = u.id and cea.unassigned_at is null join classes c on c.id = cea.class_id where u.email = 'YOUR_TEST_EA@masinyusane.org';"
```

- [ ] **G1. The killer test.** End the EA's class assignment:
  ```bash
  npm run sqlite:staging:query -- "update class_ea_assignments set unassigned_at = now() where ea_user_id = 'EA_ID' and class_id = 'CLASS_ID' and unassigned_at is null;"
  ```
  On the device: pull to refresh. The class disappears. Now **force-quit, reopen in airplane mode**. The class must **stay gone**. Before this sprint it came back.

- [ ] **G2. It arrives without you asking.** Undo G1 (set `unassigned_at` back to `null`), let the device pull, confirm the class is back. Now end it again, and instead of pulling to refresh, just **background the app and reopen it** (or wait for a reconnect). Within the staleness window the roster updates on its own. *(Sprint 4B: pull on foreground and reconnect.)*

- [ ] **G3. The subtle one.** Pick a child and end **only** their programme enrollment:
  ```bash
  npm run sqlite:staging:query -- "update child_programme_enrollments set ended_at = now() where child_id = 'CHILD_ID' and programme_id = 'PROG_ID' and ended_at is null;"
  ```
  The child leaves the roster on the device. Then check the server: the EA's `child_ea_assignments` row for that child must **still be active**. My first design would have killed it permanently. Undo by setting `ended_at` back to `null`; the child returns.

- [ ] **G4. Group handover.** `update group_ea_assignments set unassigned_at = now() where ea_user_id = 'EA_ID' and group_id = 'GROUP_ID' and unassigned_at is null;` The group leaves the EA's list, and the `groups` row itself is **not** archived on the server.

- [ ] **G5. Offline work wins.** Go offline, edit a child's name, and while still offline have "head office" (SQL) change something about that same child. Reconnect. **Your offline edit must survive** and sync. The device must not show the stale server value.

## H. Two-device handover (do this one last)

- [ ] **H1.** EA A signs in on the device, captures a session **offline**, then signs out without ever connecting.
- [ ] **H2.** EA B signs in on the same device **with connectivity** and syncs. B's work syncs. A's pending session must **not** be pushed under B's account and must **not** land in "Needs Attention."
- [ ] **H3.** A signs back in on that device with connectivity. A's session now syncs cleanly. *(Sprint 2A: outbox ownership. Without this fix, A's data was stranded and needed support to recover.)*

## M. Zero-class bootstrap and duplicate safety

Use two test EAs: one with Head Office-seeded data and one with no class assignment.

- [ ] **M1. Seeded EA is never diverted.** Sign in as the seeded EA online, open Home, then open My Children. Both show the seeded class/roster and neither opens onboarding.
- [ ] **M2. Confirmed zero enters automatically.** Sign in online as the zero-class EA. After the backend class check completes, Home automatically opens Setup Your Programme. Repeat from My Children.
- [ ] **M3. Offline zero cannot silently create duplicates.** Fresh-install or clear the test EA's local data, make the backend unreachable, then sign in with a valid cached session. The onboarding screen must explain that Head Office data could exist and must not navigate to Create Class until **Create locally anyway** is pressed.
- [ ] **M4. Retry can recover seeded data.** From the M3 warning, restore connectivity and choose Retry Backend Check after seeding a class for that EA. Onboarding closes and the seeded class appears; no local duplicate is created.
- [ ] **M5. Missing programme is not mistaken for an empty roster.** An EA without an active programme assignment sees the Head Office assignment message and cannot create a local class under an undefined programme.
- [ ] **M6. Class creation enters child setup.** Create a class from onboarding. The app opens Add Your Children for that exact class and says `STEP 2 OF 2`. It does not offer or promise a group step.
- [ ] **M7. Zero children cannot escape.** With no child added, Finish Setup is disabled. Try the Android hardware back button and the iOS back gesture. The route stays open and explains that at least one child is required.
- [ ] **M8. Force-quit resumes the requirement.** Create the class, add no child, force-quit, and reopen. Home resumes Add Your Children for the same class. Repeat by opening My Children. The app must not mistake the existing zero-child class for completed onboarding.
- [ ] **M9. Child entry loops and under-10 stays explicit.** Add one child and save. The app returns to Add Your Children, shows `1 child added`, offers Add Another Child, and keeps the warning. Finish Setup asks for explicit confirmation while the count is 1 through 9.
- [ ] **M10. Ten removes the warning, not the add path.** Add the tenth child. The warning becomes Recommended roster reached, Add Another Child remains available, and Finish Setup exits directly without a confirmation dialog.

## N. Sentry and local support evidence

Run these only after the preview EAS environment contains the Sentry DSN, organization, project, and
sensitive auth token.

- [ ] **N1. Build symbols upload.** The EAS preview build log shows a successful Sentry source-map upload. A build with a failed upload does not pass this gate.
  - 2026-07-21 Android preview build `6b0fef99-5796-4502-b2e8-df62272acb53` passed: the Gradle log records `Uploaded files to Sentry` for release `org.masinyusane.masi@1.3.0+4`, distribution 4, with a source-map upload report and Debug ID.
  - 2026-07-21 iOS preview build `83f42fbf-6403-4c41-b010-365da178ff89` finished successfully, but the inspected EAS and Xcode logs did not expose an equivalent successful source-map upload line. Keep N1 open until iOS upload or symbolication is proved.
- [ ] **N2. Handled-error symbolication.** On the physical device, Profile -> Debug & Support -> Test Crash Reporting. Sentry receives `Masi observability test error` with `observability_test=true`, a readable source-mapped application frame, the correct preview/production environment, current route/internal user UUID, installed build, device/OS, Expo Update, backend project, and SQLite schema.
- [ ] **N3. Offline event delivery.** Repeat N2 in airplane mode, then restore connectivity. The event arrives after reconnect instead of being lost.
- [ ] **N4. Non-crashing sync failure.** Using only disposable staging data, exercise a known retriable or terminal outbox failure. The app remains usable and Sentry receives the structured sync issue with table/operation/error code, counts, online state, last attempt, and last successful sync. Confirm repeated 30-second status polls do not create duplicate issues.
- [ ] **N5. Reconcile breaker.** Trigger a disposable mass-end circuit breaker. Confirm the device still requires attention and Sentry receives one `sync_state=reconcile_breaker` issue with scope/candidate/end counts.
- [ ] **N6. Local evidence remains independent.** Export Logs and Export Database. Both identify the same installed build, device, Expo Update, backend, and SQLite schema. The log contains recent console entries even if Sentry was unreachable.
- [ ] **N7. Telemetry privacy.** Inspect the N2 event in Sentry. It contains no staff email or profile name, child data, screenshot, view-hierarchy attachment, Session Replay, or arbitrary local console-log breadcrumb. Repeat after navigating through a child and session screen before sending the test event.

## O. Versioned startup repair

- [ ] **O1. Upgrade repair runs once without delaying normal use.** Install this build over an existing SQLite tester build, cold-start online, and confirm Home remains usable and pending work syncs. Force-quit and reopen twice more. Export Logs: it contains one `Startup repair: advanced to v1 (group_ownership_cutover)` entry from the first upgraded launch, not one per launch or sync pass. If the test database contained one of the historical stale group-ownership rows, confirm its group, assignment, and membership outbox work drains after the upgrade.

## P. Outbox queue stability and batch claim

- [ ] **P1. Repeated offline edits keep their original place.** In airplane mode, edit Child A, then edit Child B, then edit Child A again. Export the database and inspect the pending child operations: there is one row for Child A containing the latest payload, Child A's `created_at` remains earlier than Child B's, and Child A's `updated_at` is later. Reconnect and confirm both rows drain without a failure or duplicate.
- [ ] **P2. Full assessment item batch drains cleanly.** Complete a 60-letter assessment offline, reconnect, and sync. The parent assessment and every item leave the outbox, no item remains `in_flight`, and Sync Status shows no failed or needs-attention assessment item. This is the physical-device check for the set-based batch claim; automated real-SQLite tests enforce one UPDATE plus one SELECT and all CAS recovery paths.

## Q. Weak-network request queue fairness

- [ ] **Q1. Pull does not starve pending push work.** Create one pending record offline, reconnect on a deliberately weak or throttled connection, and immediately foreground the app so child and class pulls begin. Press Sync Now while the roster refresh is still working. The pending record should drain between pull requests rather than waiting for every roster, enrollment, class, group, and membership request to finish. Home and the roster remain usable throughout.
- [ ] **Q2. User switch overtakes the old roster workflow.** On a weak connection, begin a roster refresh as EA A, sign out, and sign in as EA B. EA B's auth/profile work must not wait for the whole EA A domain pull. When the old pull eventually returns, no EA A class, child, or group may appear under EA B.

## R. SQLite bootstrap recovery

- [ ] **R1. Normal cold start remains clean.** Force-quit a preview build that already has pending offline work, reopen it, and confirm the short `Preparing your offline data` state transitions to the app without a blank frame, provider error, or lost pending row.
- [ ] **R2. Preserve evidence if a real bootstrap failure occurs.** Do not deliberately corrupt or delete a field database. If the recovery screen appears naturally, confirm it says saved work was not deleted, record the support code, use Share Error Logs before retrying, and verify the shared file contains the SQLite bootstrap error plus the installed build/device/backend context.
- [ ] **R3. Retry is non-destructive.** From a naturally occurring or controlled QA bootstrap failure, press Try Again after the underlying transient condition is gone. The app opens without reinstalling, and previously saved/pending work remains present. Automated tests inject the first-attempt failure; device testing must not manufacture it by damaging a real database.

---

## If something fails

1. Profile > **Export Logs** immediately, before doing anything else.
2. Profile > **Export Database** (this is a real support package: schema version, table counts, sync status, failed rows, backend identity).
3. Send me both, plus which gate number failed and what you saw. Do not re-run the flow first, since the second run can mask the state that caused it.

## Known deploy gates (before field staff get a build)

- [x] **`letter_mastery` — was already clean.** Verified 2026-07-14: all 13 rows carry current-formula deterministic (v5) ids. Nothing to do.
- [x] **Pre-fix ids in the four active-pair tables — fixed 2026-07-14.** 26 rows re-keyed to their correct deterministic ids (`child_ea_assignments` 9, `child_programme_enrollments` 9, `class_ea_assignments` 1, `group_ea_assignments` 7). Row counts preserved; the test EA's fixture (9 children, 1 class, 7 groups) is intact. Re-verified: 0 mismatches across all five tables.
- [ ] Field devices must start from a fresh install, not an upgrade over an old local database.

> **⚠️ This gate's original wording was wrong, and the correction matters.** It said to clean
> *"random-id"* rows. Three tables did hold v4 random ids — but all 7 `group_ea_assignments` rows held
> perfectly valid **v5 deterministic** ids generated by a **superseded formula**
> (`group_id, ea_user_id, programme_id`; the current `groupEaAssignmentDomainId` keys on `group_id`
> alone). A cleanup filtering on "random ids" would have skipped every one of them and left the
> collision live.
>
> **The only sound test is: does the stored id equal what today's code would compute for this row's
> logical key?** Not "is the id random?". With a deterministic-id scheme the *derivation* is part of
> the data contract, so changing it strands every row written under the old rule — and those rows
> still look correct. Re-run the diff (recompute `uuid_generate_v5` in SQL and compare) any time an
> id derivation changes.

---

# Design Foundation Gates (added 2026-07-13, after the component sprint)

Run these alongside the list above. They cover the shared BottomSheet, the ten converted pickers, the extracted capture chrome, and the roster virtualization.

## I. The roster (the performance fix, audit #8)

- [ ] **I1. The one that matters.** On a LOW-END Android, open session capture with a real roster (ideally 40+ children). Scroll the child list. It must scroll smoothly, and the form should feel responsive from the moment it opens. Before this sprint the entire roster was laid out at once.
- [ ] **I2. Typing.** Type a comment in the session form. Each keystroke must appear instantly, and the comment field must NOT lose focus mid-word. (Automated tests prove the re-render cascade is dead; only a device proves the scrolling.)
- [ ] **I3. Selection.** Tap children on and off. Selection must feel immediate even near the bottom of a long roster.
- [ ] **I4. Class-roster child actions.** In Class Details, tap the body of a child's row: Child Results opens and the bottom tab bar remains visible. Go back, tap the letter icon: Letter Tracker opens. Go back, tap the pencil: Edit Child opens. Tapping either nested icon must not also trigger the row's Child Results action.

## J. Every converted picker (all ten now slide up as bottom sheets)

Open each one, confirm it looks like a sheet, has the same options, and produces the same result:

- [ ] **J1.** Create Class: school, grade, home language. (School still has a visible Cancel.)
- [ ] **J2.** Edit Class: school, grade, home language. Changing the school must still update the school NAME shown on the class.
- [ ] **J3.** Edit Child: the class picker. It should show "No classes available. Create a class first." if you have no classes.
- [ ] **J4.** Session form: the session reading level, and a per-child reading level. The per-child one must apply to the child you opened it for.
- [ ] **J5.** Assessments: the language picker. This one is deliberately TWO-STEP (tap a language, then press Start), because tapping it launches a 60-second timed assessment.

## K. The one dialog that deliberately survived

- [ ] **K1.** Without clocking in, tap Record Session. You should still get the "Clock In First?" prompt as a DIALOG (not a sheet), offering Clock In Now, Continue Anyway, or dismiss. That is intentional: it is a decision, not a picker.

## L. Assessment capture chrome

- [ ] **L1.** Start a letter assessment: the instructions screen, timer, and page dots must look unchanged.
- [ ] **L2.** Start a sequential assessment: same, and its header says "Grid N of M" where the letter one says "Page N of M".
- [ ] **L3.** Press "End Assessment" in each mode: the confirmation must read "End the assessment now and record current results?" with Cancel and End.
- [ ] **L4.** Watch the countdown for 10 seconds. It must tick smoothly without the screen flickering (the timer re-renders only itself).

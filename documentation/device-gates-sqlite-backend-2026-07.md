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

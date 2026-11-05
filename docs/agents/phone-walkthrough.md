# Phone walkthrough: driving the Masi app on the connected Android phone

Shared reference for the `phone-health-check` and `phone-design-review` skills. It covers claiming
the shared phone, the rules for driving it with `npm run -s device:phone --`, the route through each
workflow, and where each workflow's evidence lands. Learned on the Galaxy A03s (serial
`R9WWA0G3H8R`, Android 13, 720x1600, density 280) on 2026-11-05.

## The phone is shared

Masi and Zazi sessions, and Jim by hand, all use the same phone. A tap sent while another app is in
front lands in that app.

1. `ListAgents`, then `SendMessage` every live `masi-app-*` and `zazi-izandi-app-*` session (and any
   session whose name suggests device work): "I'm taking the A03 for about N minutes for a Masi
   walkthrough; reply if you're using it." Wait for replies, or 2 minutes. Without those tools, ask
   Jim whether the phone is free.
2. `phone state`, then watch it for 30 seconds. The focused app must stay put.
3. Anything unexpected on screen (a lesson in progress, a sheet, another app, airplane mode, a
   density override) is someone's test state. Ask its owner or Jim before discarding it.

The phone is claimed when nobody has replied that they are using it and the screen has been still for
30 seconds. When you finish, leave Masi on Home and message the same sessions that the phone is free.
If another app comes to the front mid-run (`FOREGROUND`, exit 3), stop, find out who, and wait for
their "done" message before touching the phone again.

## Accounts and data

- Run as a **test EA** only. `test@masinyusane.org` ("Test", literacy) is the default. Passwords are in
  the main checkout's `.env.local` (`TEST_USER_PASSWORD`, `TEST_USER_B_PASSWORD`). Type them with
  `type --stdin` and never echo them. `device:server-check` warns if the EA is not flagged
  `is_test_account`; the reporting dashboard relies on that flag to exclude walkthrough data.
- The staging backend (`segygjzpujphwvrubusm`) carries field data from November 2026. Every record a
  walkthrough creates belongs to the test EA. A created child is First name `Smoke`, Last name
  `Run<HHMM>` (the phone's time), and is removed in the same run. Sessions and assessments stay on the
  test EA as history.
- Never run SQL that writes. `device:server-check` and `scripts/read-support-incidents.cjs` are the
  read-only views.
- Leave the clock state as you found it: if the EA was clocked in at the start, end clocked in.

## Driving rules

`phone` below means `npm run -s device:phone --` (for example `npm run -s device:phone -- tap
'Children tab'`), run from the repository root; `--help` lists the commands and exit codes. zsh does
not split a command stored in a variable, so use the npm form or a shell function, never
`P="node …"; $P`. The tool refuses input while another app is in front (`FOREGROUND`, exit 3) and
taps the topmost match. Screenshots go to the run that `start-run` marked `device-runs/CURRENT`, so
nothing needs exporting between shell calls. The rules below are the ones the tool can't enforce.

- **Screenshot after every navigating tap** and read it. A screen dump can lag behind the screen (a
  sheet that is still sliding in is missing from it), so the screenshot is the truth.
- **Map a form with `fields` before focusing anything.** Once a text field has focus, its blinking
  cursor makes each dump take about 30 seconds. Fill the form with `tapxy` + `type` +
  `hide-keyboard`, check every value on a screenshot, then press the save button with `tapxy` too.
  The Samsung keyboard has added stray characters to typed text before. A field can keep its cursor
  after `hide-keyboard`; that is normal.
- **Stop on the first failure.** Chain steps with `&&`, never `;`. A failed lookup followed by a
  `type` puts text in the wrong field.
- **Labels are accessibility descriptions, often long.** Tap by a part that is unique on screen:
  `tap 'Mr Zulu'` for the class row "1A, Aaron Gqadu, Grade 1, Mr Zulu, …". A short word like
  `Record` or `Send` also matches hidden tab text or longer rows. Use the full label below, or
  `--exact`.
- **Tab bar:** `Home tab`, `Children tab`, `Record a session`, `Insights tab`, `Assess tab`.
- Bottom sheets often repeat the label of the page button underneath ("Discard lesson", "Keep
  teaching"). `tap` picks the last match, which is the sheet's.
- `OFFSCREEN` means the node exists below the fold. `NOT_FOUND` can also mean it is below the fold
  (long screens such as Profile leave far-away rows out of the dump). Use `scroll-to <label>`, then
  `scroll down --small` if the row you need is still cut off; a full `scroll` can overshoot.
- `--no-settle` belongs to input commands (`tap`, `tapxy`, `key`, `scroll`), not `shot`.
- `normalize` prints `WOULD <command>` for each change it would make, or `OK Already normalized`.
- Android Back on a lesson opens "Leave this lesson?". **Leave lesson** keeps the draft.
- The phone's clock is SAST (UTC+2); server timestamps are UTC. Between 00:00 and 02:00 SAST the
  app's day (and `session_date`) is a day ahead of the UTC date in `--since`. That is expected.

## Workflow routes

Labels are exact on-screen text or accessibility labels (`tap` matches either).

| # | Workflow | Route | Done on screen | Evidence (`device:server-check` section) |
| --- | --- | --- | --- | --- |
| W1 | Release and identity | Home greeting `Molo, <name>.` → `Open profile`: the email is at the top → `scroll-to 'APP RELEASE'` + `scroll down --small` | Email of a test EA; Release, Build, Channel, Update, Source, Backend `sqlite-staging` / `segygjzpujphwvrubusm` | `ea` (no `WARNING`) |
| W2 | Sync status | Home → `Sync status` (header cloud) | `All saved and synced`, Network `Online` | bundle `sync_outbox: 0` (W8) |
| W3 | Clock out / in | Home → `Clock out` (no confirm) → `Clock in` → `Getting location…` → `On the clock since HH:MM`. If you found it clocked out, clock in, then out | Home clock row | `time_entries`: the closed and the new row, location status `fix` or a no-location status |
| W4 | Add, edit, remove a child | `Children tab` → `tap 'Mr Zulu'` (class 1A, Aaron Gqadu) → `Add child` → `fields`, then First/Last Name, Age, `Female` → `Add child`; then `Edit Smoke Run<HHMM>` → change Age → `Save changes`; then `Edit Smoke …` → `scroll-to 'Delete child'` → sheet `Remove Smoke?` → `Remove child` | `CHILDREN (n)` goes up, `Age N` updates, the child is gone | `children`: the child with the edited age, `archived_at` set, 0/0/0 active links. The server keeps only the final state; the screen proves the add and edit |
| W5 | Literacy lesson | `Record a session` → `Who are you teaching?` → `Start lesson` → maybe `Which class is this lesson for?` (pick one) → tap a letter (`tap 'o, not selected'`) and a blend (`tap 'mo, not ticked'`) → `Wrap up →` → mark one child's letter (`tap '<letter>, not mastered' --nth 0`) → `Save session` | `Session captured.` with children, letters and a reading level → `Done` | `sessions`: state `completed`, attendees = children; `letter_mastery`: the marked letter, `confirmed` true |
| W6 | Letter Sounds | `Assess tab` → `Letter Sounds, 60-second` → `Select <full child name>` → `tap 'Start' --exact --no-settle`, then mark with `tapxy --no-settle` and take the screenshot afterwards (the clock is running). On the A03: Correct `188 1248`, Incorrect `531 1248`, End test `360 1459`, the sheet's End test `360 1340` | `Assessment Complete`: score, Attempted / Correct / Incorrect match your marks | `assessments`: `letter_sounds`, score = correct, `stopped_reason` `ea_ended`, `item_count` = `total_items`, `correct_count` = score |
| W7 | History | `Assess tab` → `View history`; `Insights tab` → `Open Session history` | The W5 session and W6 assessment are listed, `Synced` | none |
| W8 | Send diagnostics | `Open profile` → `Support tools` → `scroll-to 'Send diagnostics'` → `tap 'Send diagnostics' --exact` → `tap 'Send' --exact` | Sheet closes (the toast may be gone by the screenshot) | `support incidents`: a `diagnostics_sent` receipt within seconds; then the bundle checks below |

The Record button resumes an unfinished lesson directly. If Home shows `Lesson in progress` that is not
yours, it is someone's test state (see "The phone is shared").

## Server check

```
node scripts/device/server-check.cjs --ea test@masinyusane.org --since "$(node -p "require('./device-runs/CURRENT/run.json').startedAtUtc")"
```

Run it from the main checkout, which has `.env.local`. Known flags on the Test EA, recorded and not
caused by a run: `empty_active_groups` for groups `bf42db50…` and `f1c57ce4…` (see
`docs/bugs/` for the record). Any other FLAG is new.

## Diagnostics bundle checks (W8)

```
node scripts/read-support-incidents.cjs --kind diagnostics_sent --actor <email> --since <W8 start>
node scripts/read-support-incidents.cjs --fetch <handle>
```

Run these from the main checkout too. The reader prints the matching condition first; ignore any
other conditions it lists. The bundle lands under the gitignored
`docs/bugs/user-submissions-bundles/<handle>/`. It passes when:

- `runtime.application.releaseLabel`, `runtime.update.id` and `runtime.backend.projectId` match W1;
- `supportExport.tableCounts.sync_outbox` is 0, `supportExport.failedOutboxRows` is empty, and
  `lesson_drafts` is 0 (unless you left a draft on purpose);
- `logs` has no `ERROR` and no `WARN` timestamped inside the run window. Logs are newest first and go
  back hours; warnings from before the run belong to earlier work:

```
node -e 'const b=require(process.argv[1]); const since=process.argv[2]; for (const l of b.logs) if (l.level!=="LOG" && l.timestamp>=since) console.log(l.timestamp,l.level,l.message.slice(0,200))' <bundle.json> <startedAtUtc>
```

## Finding existing bug records

`git grep -il '<keyword>' origin/main -- docs/bugs/records` (fetch first). Search for the screen and
the symptom, for example `git grep -il 'back stack\|Assessment Complete' origin/main -- docs/bugs`.

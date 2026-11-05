# Phone walkthrough: driving the Masi app on the connected Android phone

Shared reference for the `phone-health-check` and `phone-design-review` skills. It covers claiming
the shared phone, the rules for driving it with `npm run device:phone`, the route through each
workflow, and where each workflow's evidence lands. Learned on the Galaxy A03s (serial
`R9WWA0G3H8R`, Android 13, 720x1600, density 280) on 2026-11-05.

## The phone is shared

Masi and Zazi sessions, and Jim by hand, all use the same phone. A tap sent while another app is in
front lands in that app.

1. `ListAgents`, then `SendMessage` every live `masi-app-*` and `zazi-izandi-app-*` session (and any
   session whose name suggests device work): "I'm taking the A03 for about N minutes for a Masi
   walkthrough; reply if you're using it." Wait for replies, or 2 minutes.
2. `phone state` (see Driving rules), then watch it for 30 seconds. The focused app must stay put.
3. Anything unexpected on screen (a lesson in progress, a sheet, another app, airplane mode, a
   density override) is someone's test state. Ask its owner or Jim before discarding it.

The phone is claimed when nobody has replied that they are using it and the screen has been still for
30 seconds. When you finish, leave Masi on Home and message the same sessions that the phone is free.
If another app comes to the front mid-run (`FOREGROUND` exit), stop, find out who, and wait for their
"done" message before touching the phone again.

## Accounts and data

- Run as a **test EA** only. `test@masinyusane.org` ("Test", literacy) is the default. Passwords are in
  the main checkout's `.env.local` (`TEST_USER_PASSWORD`, `TEST_USER_B_PASSWORD`). Type them with
  `type --stdin` and never echo them. `device:server-check` warns if the EA is not flagged
  `is_test_account`; the reporting dashboard relies on that flag to exclude walkthrough data.
- The staging backend (`segygjzpujphwvrubusm`) carries field data from November 2026. Every record a
  walkthrough creates belongs to the test EA. Name created children `Smoke <HHMM>` and remove them in
  the same run. Sessions and assessments stay on the test EA as history.
- Never run SQL that writes. `device:server-check` and `scripts/read-support-incidents.cjs` are the
  read-only views.

## Driving rules

`phone` below means `npm run -s device:phone --` (for example `npm run -s device:phone -- tap
'Children tab'`); `--help` lists the commands and exit codes. zsh does not split a command stored in a
variable, so use the npm form or a shell function, never `P="node …"; $P`. The tool refuses input
while another app is in front (`FOREGROUND`, exit 3) and taps the topmost match. The rules below are
the ones it can't enforce by itself.

- **Screenshot after every navigating tap** and read it. A screen dump can lag behind the screen (a
  sheet that is still sliding in is missing from it), so the screenshot is the truth.
- **Map a form with `fields` before focusing anything.** Once a text field has focus, its blinking
  cursor makes each dump take about 30 seconds. Fill a form with `tapxy` + `type` + `hide-keyboard`,
  then check every value on a screenshot before saving. The Samsung keyboard has added stray
  characters to typed text before.
- **Stop on the first failure.** Chain steps with `&&`, never `;`. A failed lookup followed by a
  `type` puts text in the wrong field.
- **Timed tests (Letter Sounds and the other 60-second tests) keep the screen busy.** Take one
  screenshot after Start to learn the button positions, then mark with `tapxy --no-settle`.
- Bottom sheets often repeat the label of the page button underneath ("Discard lesson", "Keep
  teaching"). `tap` picks the last match, which is the sheet's.
- `OFFSCREEN` means the node exists below the fold. `NOT_FOUND` can also mean it is below the fold
  (long screens such as Profile leave far-away rows out of the dump). Use `scroll-to <label>`; a full
  `scroll` can overshoot a short list.
- Android Back on a lesson opens "Leave this lesson?". **Leave lesson** keeps the draft.
- The app's clock is SAST (UTC+2). Server timestamps are UTC.

## Workflow routes

Labels are exact on-screen text or accessibility labels (`tap` matches either). The run date and
times come from `start-run`.

| # | Workflow | Route | Done on screen | Evidence (`device:server-check` section) |
| --- | --- | --- | --- | --- |
| W1 | Release and identity | Home → `Open profile` → scroll to APP RELEASE | Release, Build, Channel, Update, Source, Backend `sqlite-staging` / `segygjzpujphwvrubusm`, email of a test EA | `ea` (no `WARNING`) |
| W2 | Sync status | Home → `Sync status` (header cloud) | `All saved and synced`, Network `Online` | bundle `sync_outbox: 0` (W8) |
| W3 | Clock out / in | Home → `Clock out` (no confirm) → `Clock in` → `Getting location…` → `On the clock since HH:MM` | Home clock row | `time_entries`: closed row + new open row, location status `fix` or a no-location status |
| W4 | Add, edit, remove a child | `Children tab` → a class → `Add child` → First/Last Name, Age, Female/Male → `Add child`; then `Edit <name>` → change Age → `Save changes`; then `Edit <name>` → `scroll-to Delete child` → sheet `Remove <first>?` → `Remove child` | Class list count goes up, `Age N` updates, child gone | `children`: row with 1/1/1 active links after add, new age after edit, `archived_at` set and 0/0/0 links after remove |
| W5 | Literacy lesson | `Record a session` → `Who are you teaching?` → `Start lesson` (or a group row) → maybe `Which class is this lesson for?` → tick letters / a blend → `Wrap up →` → tap a letter under one child → `Save session` | `Session captured.` with children, letters, reading level → `Done` | `sessions`: state `completed`, attendees = children; `letter_mastery`: the ticked letter, `confirmed` true |
| W6 | Letter Sounds | `Assess tab` → `Letter Sounds, 60-second` → `Select <child>` → `Start` → `Correct`/`Incorrect` × 10 → `End test` → sheet `End test` | `Assessment Complete`: score, Attempted / Correct / Incorrect match your marks | `assessments`: `letter_sounds`, score = correct, `stopped_reason` `ea_ended`, items = total_items, correct items = score |
| W7 | History | `Assess tab` → `View history`; `Insights tab` → `Open Session history` | The W5 session and W6 assessment are listed, `Synced` | none |
| W8 | Send diagnostics | `Open profile` → `Support tools` → `scroll-to Send diagnostics` → `Send` | Sheet closes (the toast may be gone by the screenshot) | `support incidents`: a `diagnostics_sent` receipt within seconds; then the bundle checks below |

The Record button resumes an unfinished lesson directly. If Home shows `Lesson in progress` that is not
yours, it is someone's test state (see "The phone is shared").

## Diagnostics bundle checks (W8)

```
node scripts/read-support-incidents.cjs --kind diagnostics_sent --actor <email> --since <W8 start>
node scripts/read-support-incidents.cjs --fetch <handle>
```

Run these from the main checkout (it has `.env.local`). The bundle lands under the gitignored
`docs/bugs/user-submissions-bundles/<handle>/`. It passes when:

- `runtime.application.releaseLabel`, `runtime.update.id` and `runtime.backend.projectId` match W1;
- `supportExport.tableCounts.sync_outbox` is 0, `supportExport.failedOutboxRows` is empty, and
  `lesson_drafts` is 0 (unless you left a draft on purpose);
- `logs` (newest first, going back hours) has no `ERROR` and no new `WARN` timestamped inside the
  run window. Warnings from before the run belong to earlier work.

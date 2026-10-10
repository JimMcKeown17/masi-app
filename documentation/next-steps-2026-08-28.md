# Masi app — what to do next, in plain English

**Written 2026-08-28.** This is the plain-language plan. It comes from four technical reviews
done on 2026-08-27 (listed at the bottom). It does not replace `ROADMAP.md`, which stays the
detailed list of open work; this page says the same things in everyday words and in order.

## The goal in one sentence

Before real staff trust the Masi app with real work, make sure that one ordinary bad day in the
field — a lost signal, a dead battery, a new phone, a denied permission — cannot silently lose,
duplicate, or leak an EA's work, and that we can see and fix it when something does go wrong.

## Where we are today

- Nobody is capturing sessions right now. A counts-only check of the old backend on 2026-09-23
  found no new sessions since 26 August, **but someone is still clocking in and out through an old
  app build** (four clock-ins since 22 September). Staff want to start soon. This is the cheapest possible
  moment to fix deep things, because no real data is on any phone yet.
- **Updated 2026-10-08:** we are in Step 2, at its device-testing stage. The phone now downloads
  past **sessions** (built on `feat/cap-004-session-history-hydration`, PR #60; server change
  applied 2026-09-26). On 2026-10-08 a new iPhone and a Galaxy A03s both downloaded all 20 practice
  sessions; the remaining device checks (offline, force-stop, second phone, slow-phone
  responsiveness) are next. Past **assessments** still do not download (Step 3).
- The server's rule about *who may see whose past sessions* is the one we decided (2026-08-29),
  applied on 2026-09-04. The matching rule for assessments moves with Step 3.
- A 2026-10-08 review of Zazi's last month of sync work
  ([`zazi-sync-lessons-for-masi-2026-10-08.md`](./zazi-sync-lessons-for-masi-2026-10-08.md))
  added checks to Steps 2, 3, 4, 6 and 7 and a short list of "before the pilot" items below. Its
  headline: on a cheap Android phone, **saving** downloaded data costs far more than downloading
  it, so a 20-session practice account cannot prove "history within a minute" for a real EA.
- The same day, a Codex review of those additions found a real gap in what is built: a history
  download that stops partway is not picked up again when the app comes back to the foreground
  within 15 minutes. That is fixed before the remaining device checks. A wider three-month look at
  Zazi (Part 2 of the same memo) added the "upload contract" and "field bug reports" work below,
  plus two new decisions for Jim (Step 0b).
- The new backend moved to a paid Supabase plan on 2026-09-23 so it can no longer fall asleep
  after a week without use. It had fallen asleep twice (found on 2026-09-04 and 2026-09-23).
- The test database on the new backend holds 5 accounts, 25 sessions and 31 assessments of
  practice data.

## The order of work

Each step says what it is, why it comes where it does, and how we know it is done.

### Step 0 — Jim answers the open questions (done 2026-09-21 to 2026-09-23)

All of the questions are answered. The records live in `CONTEXT.md` and ADR-0005's 2026-09-21
follow-up.

1. **Settled 2026-08-29:** when an EA may see a past session, they see the **whole session** (every
   child in it, including other children's notes). A session is one delivery event; the parent JSON
   already contains child-keyed facts, so showing a partial attendee list would not be a real privacy
   boundary.
2. **Settled 2026-09-21:** "this year's assessments for a child in my class" means **any class the
   child was in during this academic year**. After a mid-year move, both the old-class and the
   new-class EA see that year's assessments.
3. **Settled 2026-09-21/23:** a child's **letter mastery** is "what the child knows today", not this
   year's history. It is visible to the EA who recorded it and to whoever delivers to the child
   **now**, with no year limit. The child's current EA may update or correct it, whoever recorded
   it.
4. **Settled 2026-09-21/23:** correcting an answer is an **edit until the assessment is submitted,
   and locked after**. EAs may add assessments and answers but never change or delete them; a later
   correction is a new attempt.
5. **Settled 2026-09-23:** an EA who *used to* deliver to a child keeps seeing that child's past
   sessions after a handover. This is already how the live rule behaves.

The three smaller ones are also answered (2026-09-23): yes, a read-only, counts-only look at the
old backend; wipe the practice data after Step 3 passes (with Jim's yes at the time); and call the
next version **1.4.0**.

Also settled on 2026-09-23: the first pilot is **Literacy-only**. The Numeracy and 1000 Stories
session forms are finalized in parallel (see "Alongside Steps 2–4" below); Yebo waits.

### Step 0b — Two new decisions (raised and decided 2026-10-08)

1. **When two EAs correct the same child's letter, the most recently *made* correction wins**
   (Jim, 2026-10-08). The server keeps the correction made later, so a phone that was offline
   for a week cannot undo a fresher correction by the child's other EA.
2. **One database per EA** (Jim, 2026-10-08). Deleting a borrowing EA's data from the phone
   (once all of it has uploaded and it has not been used for **30 days**) waits until after the
   pilot (Jim, 2026-10-09). Before widening, revisit it for privacy: staff use their own phones,
   so another EA's roster stays on the phone. Data that has not uploaded is never deleted. The decision record is written through `grill-with-docs` with the
   upload-contract design. Background: Today every EA who signs in on a phone
   shares one database, and the app filters by owner. One database per EA makes "the second EA
   sees nothing of the first" true automatically. Recommended; changing it after launch means
   moving data on live phones. Jim's field facts (2026-10-08): EAs use their own phones, and the
   usual sharing is one EA borrowing another's phone for a day or two. That makes "the borrower's
   children's details left on someone else's personal phone" the real risk. With one database per
   EA, the borrower's file can be deleted once everything in it has uploaded.

### Step 1 — Finish the "who can see what" fix

**Status (2026-10-08):** the session half is done (applied 2026-09-04). The assessment half — the
"any class the child was in this year" rule from question 2 — moves with Step 3, which needs it.

**What:** tighten the server rule so past sessions are visible only to the EA who ran them or an
EA who delivers (or delivered) to a child in them; add the same kind of rule for assessments,
limited to this school year.

**Why first:** everything downloaded in Steps 2 and 3 is copied onto phones permanently. If the
rule is wrong, we copy the wrong people's history onto the wrong phones.

**Done when:** the fix is merged, applied to the real backend, and a test proves each kind of
person — owner, current deliverer, past deliverer, class-only teacher, group-only editor, a
stranger, someone whose access was removed, last year's data — sees exactly what they should.

### Step 2 — Download past sessions onto the phone

**What:** on login, the phone fetches the EA's past sessions and who attended them, in pages, with
a time limit on each request, and shows them in History.

**Why now:** this is the "new phone / reinstall / second phone" problem. It is also the first
place we prove the download rules (paging, time limits, never delete local work because the
server did not mention it).

**Done when:** an EA logs in on a brand-new phone and sees their real history within a minute, on
both iPhone and a cheap Android; killing the app mid-download or going offline mid-download never
leaves a half-state; nothing that is not theirs appears.

**Added 2026-10-08 from Zazi's field evidence:**

- "Within a minute" must be measured on the cheap Android with a **realistic account** — a test EA
  carrying roughly a full year of sessions — not only the 20-session practice EA. Zazi's busiest
  account took five minutes on the same phone model, almost all of it spent saving, not
  downloading.
- While history is downloading, save a session and start the next one on the cheap Android. Each
  should feel instant (about a second). If either waits behind the download, fix the save cost
  before Step 3 copies the pattern.
- Read the phone's own log for the run: the `[SessionHistory]` lines should show how long the run
  took, split into waiting on the server and saving on the phone, and how far it got, so a slow
  phone can be diagnosed from an exported log.
- **Fix first (found by the Codex review):** after going offline or closing the app mid-download,
  the download must carry on as soon as the app is back in the foreground and online. Today it
  waits up to 15 minutes, or until the EA pulls to refresh.
- Open the app for about five seconds at a time on a slow connection. Each short open must save
  some history for good, so the first download eventually finishes. A full first page currently
  needs about six seconds on a slow connection.

### Step 3 — Download past assessments the same way

**What:** the same for assessments and their individual answers, plus each child's letter
mastery ("what the child knows"). This step also locks submitted assessments on the server and
turns letter mastery into one current record per child that the child's current EA can correct.

**Why after sessions:** assessments are bigger (up to 61 answers each; 900 already in the practice
data) and depend on questions 2–4 above.

**Before building it (added 2026-10-08):**

- The server must stamp the "last changed" time on assessments, answers, and letter mastery when
  they are **created**, not only when they change. Today only sessions do this. Without it, a phone
  with a wrong clock can hide a new assessment from every other phone's download.
- Make each downloaded page cheap to save (check what is already on the phone in one go, and skip
  rows that have not changed). Assessments carry up to 61 answers each, so the session approach as
  built today would be slower here.
- Upload an assessment and its answers to the server as one piece, all or nothing. Today they go up
  as separate rows, so the server could briefly hold an assessment with only some of its answers,
  which a report would read as a real low score.

**Done when:** same test as Step 2 (including the realistic-account timing on the cheap Android),
plus a correction to an answer behaves the way question 4 decided.

### Alongside Steps 2–4 — Numeracy and 1000 Stories session forms

**What:** finalize and build the session forms for Numeracy and 1000 Stories. Today only Literacy
has a form, so EAs in those programmes cannot record a session at all.

**Why in parallel, not first:** the first pilot is Literacy-only, so these forms do not block it. Jim
wants them finalized now so every programme can move forward. The work needs Jim's requirements
first; the earlier numeracy comparison draft was lost and must be redone.

**Done when:** each form's requirements are written down and agreed, and the form saves, uploads
and shows in History like a Literacy session. Yebo's form waits until later.

### Step 4 — Give support a trail

**What:** when the app gets stuck (a session that will not upload, a download that never
finishes), it records one durable note: what is stuck, since when, which app version and backend,
and what a support person may do about it. No child names or notes in the record. Every stuck
state has a named person who can see it and a safe button to press.

**Why alongside Steps 2–3:** Zazi learned that a stuck state nobody can see is a trap. Sentry
tells us something crashed; it does not tell us which EA's session is stuck on which version.

**Design rules learned from Zazi (added 2026-10-08):**

- One record per **cause**, not per report. When the same problem is reported again with newer
  details (a later "last seen" time, a newer app version), it updates the existing record instead
  of being rejected or duplicated. Zazi's server rejected exactly this case.
- Each record has a size cap and a fixed list of allowed fields, so it is easy to prove no child
  data can slip in.
- It records which over-the-air update was actually running, not only the app's version number.
  Zazi found the version number alone did not prove which code was on the phone.
- Every upload failure is stored as one of a few named kinds (retry later, waiting for something
  else to upload first, needs support, permanent), each with a named owner and a written procedure.
  Today Masi keeps only a free-text error message.

**The field bug feedback loop (added 2026-10-08).** This is what lets Zazi improve quickly: the
phone itself reports when it is stuck, and a `/bug-sync` sweep turns those reports into a bug list.
Masi gets a pilot-sized version:

- Each phone sends a small report to the server when work is genuinely stuck (an upload that
  failed for good or needs support, a safety stop, a download that keeps failing), but never for
  an ordinary retry. Most of Zazi's early reports were noise from upstream bugs.
- A `/bug-sync` skill sweeps the reports, matches them against a bug list in the repository, and
  checks the server before believing any report. A report is a lead, not proof.
- The phone's export (logs plus database) stays essential. In Zazi, reports said who and where;
  the exports said what went wrong.

**Done when:** force-kill the app in the middle of a stuck state; on reopening there is exactly
one record, with the right version and backend, and a support action that clears it. A sweep
finds that record and files it.

### Step 5 — Fix the field policies that are currently silent

These are decisions plus small code changes. Zazi hit every one of them.

- **Location.** Today, if an EA denies location or GPS times out indoors, the app quietly refuses
  to clock them in. Change to: clock them in anyway, leave the coordinates blank, note why, and
  flag it for review.
- **Android backup.** Turn off Android's automatic backup for the app, so a reinstall cannot
  restore an old, stale database.
- **Ten-hour auto clock-out.** Keep it on the phone as today; make the staff report say "still
  open" honestly rather than inventing a clock-out time.
- **Unfinished forms.** Today, leaving a session or assessment half-done and killing the app loses
  it. Either Jim accepts that for the pilot (after seeing it happen once on a real phone) or we
  build the saved-draft feature — not a quick hack beside it.

**Done when:** each policy is written in `PRD.md` and tested on both phone types.

### Step 6 — Secrets, accounts and reference data

- Search the whole Git history (not just today's files) for passwords, keys and staff details.
  Rotate anything found. The build log records an older tool that once printed a shared password;
  we have no record that it was rotated.
- Make sure every school and picker value an EA needs exists **before** their first login.
- Create each pilot account and prove it by actually logging in as them and reading what the app
  reads — an account row in the database is not proof.
- Mark every test and demo account as a test account when it is created, and keep marked accounts
  out of every report. Zazi's unmarked demo accounts showed up as real EAs on a live staff page.
- **Make removing someone's access actually work.** Today, marking a staff member inactive changes
  nothing: they can still sign in, upload, and read history. Write down the steps to remove a
  person (block the login, mark them inactive, end their assignments), how long an already-open
  app may keep working (Zazi accepts up to an hour), and test it on a signed-in phone.

**Done when:** the scan is clean or every hit is rotated; every pilot account has logged in once.

### Step 7 — Break it on purpose

One week of deliberately doing the bad things, on a real iPhone and a real cheap Android:

- submit a session twice; kill the app during submit; lose the network after the server accepted
  but before the phone heard back — expect exactly one session on the server, every time;
- switch accounts on the same phone — expect no trace of the first EA's work visible to the second;
- install an **older** app build over a **newer** database — expect it to stop safely, not corrupt;
- start the app on a slow phone with a slow network — expect "loading", never a false "you have no
  children";
- leave a clock-in open across the ten-hour mark with the app dead — expect the chosen policy.
- sign in on the cheap Android as the heaviest pilot-sized account, then clock in and close the
  app after a few seconds, several times — expect the download to pick up where it stopped, never
  restart from the beginning (Zazi: five of twenty EAs never finished a first download this way);
- save, start, and clock in while a download is *saving* (proved from the phone's log, not
  guessed) — expect each to take under two seconds;
- tap Submit twice quickly — expect exactly one session;
- make an upload hang (a stalled network) — expect the app to give up on it, keep downloading and
  uploading everything else, and retry it safely later;
- remove a test EA's access while their app is open — expect it to stop working within the
  agreed window;
- switch the server's sync switch off and back on (see below) — expect the phone to keep working
  and its data to stay intact.

**Done when:** every case passes on both phones with the exact build we intend to ship.

### Before the pilot — fleet controls (added 2026-10-08)

These come from Zazi, which had to add each one to phones already in the field. They are cheap
before any EA has the app and awkward after.

- **A server-side switch for syncing.** A small server table says which accounts use a sync
  feature, so a canary is "add one account", the whole fleet is "add everyone", and rollback is
  "delete the row" — no app update needed. The same place can hold how often phones check in.
- **A time limit on every request, uploads included**, enforced by the shared request line
  itself. Today one stuck upload or download can block every later request, and even history's
  own time limit does not free the line.
- **Spread out when phones check in**, including on a fresh open, so a whole school day of phones
  does not hit the server in the same minute.
- **Any "this is stuck" message measures lack of progress, never just elapsed time.** Zazi's fixed
  90-second limit told EAs a download had failed while it was still working.
- **Tests that pin what may start a download and how often**, so one change cannot make every save
  trigger a full re-download (Zazi shipped exactly that and a session Start took 23 seconds).
- **Check the server's size.** Zazi measured a 2-core database struggling somewhere between 1,000
  and 3,000 EAs on full downloads. The pilot is far smaller, but the size should be chosen, not
  inherited; the dashboard showed the smallest size after the September restore.

### Step 8 — Small pilot

Literacy EAs only, on fresh phones, for two weeks. Size: Jim is setting it with the team
(between 5 and 20 as of 2026-09-23); whatever the number, every pilot EA must be someone Jim or a
named supporter can phone directly. Daily: look at every EA, not
just the ones who complained; a quiet phone is "unknown", not "fine". Rule for the pilot: before
anyone reinstalls, signs out, or clears storage, export the phone's logs and database first.

**Stop the pilot on:** a session or assessment missing from the server; one EA seeing another's
work; a duplicated session; a stuck state nobody can clear.

### Step 9 — Widen

Only after the pilot loop is routine: a daily "who is active / who needs help" report where every
expected EA appears exactly once, and a recorded two-week window with no repeats of the pilot's
problems.

### Before the pilot — the upload contract (added 2026-10-08)

Zazi rebuilt its upload path in July and August after an audit of code almost identical to
Masi's. The rebuild cost about 4,700 lines and most of its August bugs. It also mostly protects
against a risk Masi does not have (one phone overtaking itself), while still leaving Masi's real
risk (two people editing the same record) as "last arrival wins". Masi takes a smaller set:

- an assessment and its answers reach the server together or not at all (Step 3);
- a change made from an out-of-date copy of a child, class or group is refused and shown to the
  EA, instead of silently overwriting someone else's newer change;
- Submit cannot create two sessions from a double tap;
- an older app version refuses to touch a database written by a newer one;
- Android's automatic backup excludes the database. Zazi saw a restored phone replay work the
  server had already accepted.

## Things we will deliberately not do

- Copy Zazi's code, tables, or its learner-removal machinery into Masi. We copy the *lessons* and
  the *tests*, not the code. This includes Zazi's October repairs for data already on its phones
  (old-download fallbacks, rebuild-skipping fingerprints, grouping recovery): Masi starts clean and
  should prevent those problems by construction instead.
- Build a shared code library for both apps yet. That happens only after both apps ship the same
  thing twice.
- Add a server-side auto clock-out, a quick draft-saving hack, or a one-size-fits-all sync
  protocol before a real need shows up in Masi.

## Timing

Masi currently has no time booked. The honest plan: land the Zazi field-support work first, then
give Masi a named block of two to three weeks for Steps 0–7, then the pilot. Tell Masi staff the
gate ("after these checks pass"), not a date.

## Where the technical detail lives

| Question | Document |
|---|---|
| What is still open, in detail | [`ROADMAP.md`](./ROADMAP.md) |
| Product decisions waiting on Jim | [`open-decisions-backlog.md`](./open-decisions-backlog.md) |
| What the live backend actually looks like | [`pre-live-gate0-audit-2026-08-27.md`](./pre-live-gate0-audit-2026-08-27.md) |
| What Masi should and should not take from Zazi | [`masi-zazi-portfolio-audit-2026-08-27.md`](./masi-zazi-portfolio-audit-2026-08-27.md) |
| The safety rules both apps follow | [`field-app-portfolio-invariants.md`](./field-app-portfolio-invariants.md) |
| Zazi's month of field failures, lesson by lesson | [`zazi-field-lessons-for-masi-go-live-2026-08-27.md`](./zazi-field-lessons-for-masi-go-live-2026-08-27.md) |
| Zazi's September–October sync, download-speed and support work, and what Masi takes from it | [`zazi-sync-lessons-for-masi-2026-10-08.md`](./zazi-sync-lessons-for-masi-2026-10-08.md) |
| The written-and-tested permissions fix | merged to `main` on 2026-08-29 (`b3ba977`) and applied to the hosted backend on 2026-09-04 |

# Masi app — what to do next, in plain English

**Written 2026-08-28.** This is the plain-language plan. It comes from four technical reviews
done on 2026-08-27 (listed at the bottom). It does not replace `ROADMAP.md`, which stays the
detailed list of open work; this page says the same things in everyday words and in order.

## The goal in one sentence

Before real staff trust the Masi app with real work, make sure that one ordinary bad day in the
field — a lost signal, a dead battery, a new phone, a denied permission — cannot silently lose,
duplicate, or leak an EA's work, and that we can see and fix it when something does go wrong.

## Where we are today

- Nobody is using the app right now. Staff want to start soon. This is the cheapest possible
  moment to fix deep things, because no real data is on any phone yet.
- The app **uploads** work to the server but never **downloads** past work back. A new phone
  starts empty even though the server has everything.
- The server's rule about *who may see whose past sessions* is looser than we decided. Harmless
  today (nothing downloads); dangerous the moment downloading starts.
- A fix for that rule is written, committed, and tested on a throwaway PostgreSQL database. Jim
  chose the complete-session boundary on 2026-08-29. The source is part of `main`; on 2026-09-04
  the migrations were applied to the real backend and passed the hosted authorization gate. No
  phone downloads history yet.
- The test database on the new backend holds 5 accounts, 25 sessions and 31 assessments of
  practice data.

## The order of work

Each step says what it is, why it comes where it does, and how we know it is done.

### Step 0 — Jim answers the remaining four questions

The session-aggregate question is settled; the assessment half of Step 1 still depends on the
remaining assessment decisions. Suggested answers are in brackets.

1. **Settled 2026-08-29:** when an EA may see a past session, they see the **whole session** (every
   child in it, including other children's notes). A session is one delivery event; the parent JSON
   already contains child-keyed facts, so showing a partial attendee list would not be a real privacy
   boundary.
2. "This year's assessments for a child in my class" — does that mean the class the child is in
   **now**, **any** class they were in this year, or the class they were in **on the day** of the
   assessment? *(Any class this year — simplest to check and explain.)*
3. Is a child's letter-mastery record part of "this year's history", or is it just "what the child
   can do today"? *(What the child can do today.)*
4. If an EA corrects an answer in an assessment, is that an **edit** or a **new attempt**?
   *(Edit until the assessment is submitted; locked after.)*
5. Confirm: an EA who *used to* deliver to a child keeps seeing that child's past sessions after a
   handover. *(Yes — an incoming EA needs the history.)*

Three smaller ones can wait a week but should not be forgotten: may we peek (read-only, counts
only) at the old backend to confirm nothing important is there; do we wipe the practice data
before the first real account; and do we call the next version 1.4.0 to mark the switch to the
new backend. *(Yes; wipe after Step 3 passes; yes.)*

### Step 1 — Finish the "who can see what" fix

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

### Step 3 — Download past assessments the same way

**What:** the same for assessments and their individual answers.

**Why after sessions:** assessments are bigger (up to 61 answers each; 900 already in the practice
data) and depend on questions 2–4 above.

**Done when:** same test as Step 2, plus a correction to an answer behaves the way question 4
decided.

### Step 4 — Give support a trail

**What:** when the app gets stuck (a session that will not upload, a download that never
finishes), it records one durable note: what is stuck, since when, which app version and backend,
and what a support person may do about it. No child names or notes in the record. Every stuck
state has a named person who can see it and a safe button to press.

**Why alongside Steps 2–3:** Zazi learned that a stuck state nobody can see is a trap. Sentry
tells us something crashed; it does not tell us which EA's session is stuck on which version.

**Done when:** force-kill the app in the middle of a stuck state; on reopening there is exactly
one record, with the right version and backend, and a support action that clears it.

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

**Done when:** every case passes on both phones with the exact build we intend to ship.

### Step 8 — Small pilot

About five EAs Jim can phone directly, on fresh phones, for two weeks. Daily: look at every EA, not
just the ones who complained; a quiet phone is "unknown", not "fine". Rule for the pilot: before
anyone reinstalls, signs out, or clears storage, export the phone's logs and database first.

**Stop the pilot on:** a session or assessment missing from the server; one EA seeing another's
work; a duplicated session; a stuck state nobody can clear.

### Step 9 — Widen

Only after the pilot loop is routine: a daily "who is active / who needs help" report where every
expected EA appears exactly once, and a recorded two-week window with no repeats of the pilot's
problems.

## Things we will deliberately not do

- Copy Zazi's code, tables, or its learner-removal machinery into Masi. We copy the *lessons* and
  the *tests*, not the code.
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
| The written-and-tested permissions fix | merged to `main` on 2026-08-29 (`b3ba977`); not yet applied to the hosted backend |

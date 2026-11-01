# Numeracy: Number tracker, lesson plan and curriculum

**Status:** approved by Jim, 2026-10-31. His answers to the builder check and the check-solution review are applied.
**Workstreams:** (a) curriculum, (b) capture screens, (c) lesson suggestions. EGMA, workstream (d), has its
own spec, [the maths assessment design](2026-10-31-egma-maths-assessment-design.md), which lives on branch
`feat/egma-maths-assessment` and is not yet on main. This document consumes its `{skill, band}` item tags (§7).
**Mockups:** the brainstorm screens are in `.superpowers/brainstorm/27627-1793441603/content/` in the main
checkout, which is gitignored. The images are not committed; this text is the contract.

## 1. Why

Masi and a partner maths organisation are building a numeracy intervention modelled on Masi Literacy and
Zazi iZandi: Teach at the Right Level, with EAs teaching small fixed groups. The partner's current Grade 1
curriculum is school-style. Every week has a fixed number range ("Numbers 1 to 5"), and the class moves
on whether or not the children have learnt it. Masi's approach moves a child on only once they've shown
they can do it.

The app has to let an EA:

1. see, for each child, which maths steps they can do;
2. tick a step when they see a child do it;
3. get a suggested lesson for their group that teaches the next steps, in a sensible order;
4. teach that lesson from the app's instructions.

Jim's mastery rule (2026-10-31) is the same as for letters. A step counts as known when **EGMA shows
it, or the EA ticks it**: "if an EA sees a child is able to add totals to 5, they mark it on their
tracker in the app."

## 2. Goals, non-goals, anti-goals

**Goals**

- A **Number tracker** for each child: one row per skill, one tile per step, one tap to tick, in the same
  style as the letter tracker.
- A **numeracy lesson flow** in Record, in place of "Session forms for Numeracy are coming soon": choose
  group → lesson plan → teach → Wrap up → save.
- **Lesson suggestions** for each group, worked out separately for each skill, that respect the order
  rules and give every skill regular turns.
- **Mixed lessons** (a warm-up and two activities), the partner's style. The planner takes the
  number of activities as an input, so a *focused* shape (a warm-up and one activity) needs no planner
  rewrite later. This release has no setting that chooses between them (§6.4).
- A **curriculum content file** that holds every step's "how to teach it" and "tick when" text, plus the
  order. The partner can then change the wording without code changes.
- A first draft of every step's content, built from the partner's activities, for the partner to edit
  (Appendix A).

**Non-goals (this release)**

- Recording *how* a child worked something out (counting all, counting on, or just knowing it) on the
  tracker. Jim (2026-10-31): "keep the counter as simple as possible." EGMA records method on its own
  items (§7.3); the tracker doesn't.
- Suggestions to move a child to another group. CONTEXT.md says grouping is done by the office for now.
- A heat map of the whole group's progress (Zazi has one: `groupLetterProgress.js`). It would be a good
  next step, but it isn't needed to teach.
- Numeracy rows in Insights and the dashboards. The data model has to support them (§8.2), but no
  screens are built.
- Translating the curriculum content. The first edition is English, which is the language of the app's
  screens (my call; §12).
- An in-app editor for the curriculum.
- **A lesson-shape setting**, and so any field comparison of mixed and focused lessons. Jim agreed on
  2026-10-31 to leave it out until a comparison is actually scheduled (§6.4).
- Zazi iZandi.

**Anti-goals (failure even if it works)**

- **Teaching jargon on EA screens.** No "counting on", "subitising", "number bonds", "rung", "ladder" or
  "band". The EA sees *skill* (Add) and *step* (up to 10), with real sums as examples. (Jim, 2026-10-31.)
- **Ticks that mean nothing.** If two EAs would tick the same step for very different children, the
  tracker is useless. Every step has a fixed three-item check (§4.3).
- **Suggesting work a child can't start yet**, for example 7 + 3 for a child who can't count 10 counters.
- **Touching the literacy mastery contract.** `letter_mastery`, `set_letter_mastery` and their sync
  passed hardened review. Numeracy uses a parallel table (§8.1).

## 3. Words

These terms are for this document and CONTEXT.md. The **EA sees** column is the screen copy.

| Term | Meaning | EA sees |
|---|---|---|
| **Maths skill** | One of the ten things the tracker follows (§4.1). | "Add", "Compare" |
| **Step** | One number size within a skill. Steps include the ones below them: "up to 10" also covers 1–5. | "up to 10", "5s to 50" |
| **Step key** | The stable id of a step, `<skill>.<size>`, for example `add.10` or `skip_count.5s`. A key's meaning never changes; a changed meaning gets a new key. | never shown |
| **Known step** | A step that EGMA shows, that the EA ticked, or that sits below a known step in the same skill (§5.2). | a green or amber tile |
| **Tick** | An EA's confirmation that a child can do a step. | "Tick" |
| **Lesson shape** | *Mixed* (warm-up + 2 activities) or *focused* (warm-up + 1). Every lesson is mixed in this release. | "20 min lesson" |
| **Curriculum edition** | One frozen version of the curriculum content file (§4.4). | never shown |

"Band" belongs to the EGMA spec (`{skill, band}` on assessment items). A step corresponds to a band
through the mapping in §7.2. The two words are not interchangeable.

## 4. The curriculum

### 4.1 Skills and steps

| Skill key | EA sees | What it means | Steps |
|---|---|---|---|
| `finger_flash` | Finger flash | Say how many fingers are shown, without counting | 5, 10 |
| `count` | Count | Count out that many counters | 5, 10, 20 |
| `read_numbers` | Read numbers | Say the number on a card | 5, 10, 20, 50, 100 |
| `compare` | Compare | Which is more, which is less, or the same | 5, 10, 20, 50, 100 |
| `before_after` | Before & after | The number before, after or between; put numbers in order | 5, 10, 20, 50, 100 |
| `add` | Add | Add two numbers | 5, 10, 15, 20 |
| `subtract` | Take away | Take one number from another | 5, 10, 15, 20 |
| `number_pairs` | Number pairs | Pairs that make 5; pairs that make 10 | 5, 10 |
| `count_aloud` | Count aloud | Say the numbers in order, without objects | 10, 20, 50, 100 |
| `skip_count` | Skip count | Count in 2s, 5s or 10s | 2s to 20, 5s to 50, 10s to 100 |

That gives 37 steps. The first eight skills are the main grid. `count_aloud` and `skip_count` are listed
separately under "Counting", as on the mockup.

Why the sizes differ: add and take away follow CAPS Grade 1's term-by-term calculating ranges
(5 → 10 → 15 → 20), which also matches Jim's "11–15" example. Reading, comparing and before/after run
ahead to 100, as CAPS counting does (prior art: `.superpowers/numeracy/recon-priorart.md`).

### 4.2 The order: three rules

Jim and the partner agreed these (2026-10-31; the partner still to confirm):

1. **Within a skill, go step by step.** `add.10` needs `add.5`.
2. **Count or read the numbers before working with them.** Add, take away, compare and number pairs at
   size N need `count.N` where Count has that step, and `read_numbers.N` above 20. Before & after at
   size N needs `read_numbers.N`. `add.15` and `subtract.15` need `count.20`.
3. **Take away and number pairs come after adding, at the same size.** `subtract.N` and
   `number_pairs.N` need `add.N`. `number_pairs.5` also needs `finger_flash.5`.
4. **Count aloud before skip counting** (my call, filling a gap in the three rules): `skip_count.2s`
   needs `count_aloud.20`, `skip_count.5s` needs `count_aloud.50`, and `skip_count.10s` needs
   `count_aloud.100`. Without this rule, counting in 2s would be a starting step and could be
   suggested as a brand-new group's first warm-up.

These steps have nothing before them: `finger_flash.5`, `count.5`, `read_numbers.5` and
`count_aloud.10`.

The content file stores the **expanded** list of `comes_after` keys for each step, worked out from the
rules, so the partner can override any single arrow. The verify script (§4.4) checks that every key
exists and that there are no cycles.

### 4.3 What each step holds

For each step, the content file holds:

- `goal`: one plain sentence ("Children add two small numbers, up to 5.").
- `activities`: 2–3 activities, each with a name, minutes (4–8), numbered plain instructions, what's
  needed, and a source (`partner` with a week and session reference, `adapted`, or `new`). **Each
  activity fills one card's time.** A mixed-lesson card shows one of the step's activities, a focused
  card shows two, and a warm-up card shows one 5-minute activity. The app takes them in turn across
  lessons: the activity this group has done least recently comes first, so repeat lessons on the
  same step vary. This replaces the partner's "session 2 repeats session 1" by design. Steps in the
  warm-up pool must have at least one activity of 5 minutes or less. Partner text may be reworded to
  meet the plain-words rule, and is then marked `adapted` (my call).
- `tick_when`: one setup line, **exactly three** things to ask one child on their own, the expected
  answers, and the rule "All 3 right? Tick it." The three items sit near the top of the step's range,
  so ticking "up to 10" proves more than "up to 5".
- `comes_after`: the expanded step keys (§4.2).
- `note_for_partner`: a review note. The app never shows it.

The EA sees `goal` and `activities` on **How to teach it** (§6.3), and `tick_when` on the tracker's
step sheet and at the top of Wrap up (§6.5). Pairing "how to teach it" with "when to tick it" is what
lets the tick stay a plain tick and still mean the same thing for every EA.

### 4.4 The content file

- Location: `content/numeracy-curriculum/`, a sibling of `content/egra/` and the EGMA pack's
  `content/egma/`. It holds a JSON file per edition, `index.js` / `index.d.ts`, and a `verify.cjs` that
  `npm run test:content` runs.
- **Editions.** `2026.1-draft` until the partner signs off. The first frozen edition is `2026.1`. A frozen
  edition is never edited in place, which is the same rule as the EGRA pack (see the memory about never
  editing the EGRA pack in place). A wording fix gets a new edition. A changed step meaning gets a new
  **step key**.
- **The verify script checks:** step keys are unique and well formed; every skill's steps are in size
  order; every `comes_after` key exists, with no cycles; the starting steps are exactly the four in
  §4.2; every step has exactly three tick items with expected answers; the arithmetic in the expected
  answers is correct for `add`, `subtract` and `number_pairs`; every tick item's numbers are within
  the step's size; and **no EA-facing field contains a banned word** (counting on, count all,
  subitise, number bonds, rung, ladder, band, strategy, and the others in §2). The banned-word check
  also covers the partner's later edits, so the plain-words anti-goal doesn't rely on someone
  reviewing every change. How tick items are parsed for the range and arithmetic checks (structured
  fields or extracting numbers from the text) is the builder's call.
- **Which edition the app uses.** One programme-wide edition is bundled with the app (my call). Letters
  needed an edition per class because isiXhosa, English and Afrikaans classes teach different orders.
  Maths has no language order, so a per-class edition would add a column and a server rule for no
  benefit. If two editions ever need to run side by side, add `classes.numeracy_curriculum_edition`
  then, following `class_letter_order_edition`.
- **Delivery.** The content ships in the app bundle. A content-only change ships as an OTA update on the
  preview channel, with no native build.
- **How the partner edits it** (Jim agreed, 2026-10-31). The JSON file is the source. Masi puts the
  readable version (Appendix A) into a Google Doc, and the partner edits it there with suggestions and
  comments. Masi copies the accepted changes into the JSON and runs the verify script; then the
  readable version is regenerated from the JSON for the next round. There is no Doc-to-JSON converter:
  a handful of review rounds don't justify one. If the rounds become frequent, revisit this.

## 5. Child knowledge

### 5.1 Sources

A step is known for a child when any of these is true:

1. **EGMA evidence**, worked out live from saved maths results and never stored as a tick (§7.3).
2. **An EA tick** (`skill_mastery.confirmed = true`, §8.1).
3. **It's implied**: a higher step in the same skill is known through 1 or 2.

EGMA evidence wins: an EGMA-known step is locked on the tracker, as assessment letters are.

### 5.2 Why implied steps

Steps include the ones below them. If a child can add up to 10, they can add up to 5. Without this rule,
an EA who ticks only `add.10` would leave `add.5` "not known", and the lesson suggestion would send that
child back to step one. Implied steps are **worked out when needed and never written**, so unticking
`add.10` brings `add.5` back to its own state. On the tracker an implied tile shows green with a small
"↑" mark, and tapping it explains: "Known because 'up to 10' is ticked." It can't be unticked on its own.

### 5.3 Scope

Ticks belong to the child, as letter confirmations do: they count from any EA and in any programme.
EGMA evidence is bounded to the active academic year and programme, using the same reader bounds as
letter evidence (`getQuestionResults` → `resolveActiveProgrammeId`).

## 6. Screens

All copy below is draft EA copy. The plain-words rule in §2 applies to every string.

### 6.1 Who sees this

Numeracy EAs, as decided by the EGMA branch's `programmeSubject(programme) === 'maths'` helper. That
helper is the only place programme codes are compared (§10, dependency 1). Literacy EAs see no
change.

### 6.2 Number tracker (one child)

Opened from the child's row in a class (the slot where literacy EAs have the letter tracker icon, which
the EGMA branch hides for maths), and from the Wrap up row (§6.5).

- Header: the child's name, and "Number tracker · 15 / 37 steps".
- A legend in the existing tracker colours (`letterStateColors`, renamed or aliased so it's no longer
  letter-specific): amber = **Assessment** (EGMA, locked), green = **Ticked**, white = **Not yet**. The
  next suggested step for this child has a dashed red outline.
- **Compact rows** (Jim's pick, 2026-10-31): one card per skill with the skill name, a grey hint word
  ("up to…", "totals to…") and one tile per step, labelled with its size (5 / 10 / 20 …). Tiles keep
  their columns across rows where sizes match, so the screen reads like a grid. The "Counting" section
  sits below the main eight skills.
- **Tapping a tile ticks or unticks it immediately**, as `LetterMasteryPanel` does. Amber and implied
  tiles don't toggle; tapping them explains why.
- **Tapping the skill name (ⓘ)** opens a step sheet for that skill: every step in full wording, with its
  state, who ticked it and when, and the **Tick when** box for the child's next step ("Ask Lwazi on their
  own: 2 + 2 · 3 + 1 · 4 + 1. All 3 right? Tick it.") with a **Tick** button.
- It must fit a 360 dp wide phone with no sideways scrolling. Five tiles at about 44 dp, with gaps, fit
  in a 296 dp content width.

### 6.3 Lesson plan

Record → **Who are you teaching?**. This reuses `LessonPickerScreen`'s structure: the **Up next** card
ranked by `rankGroups` (pure recency, unchanged). Its "next letters" line becomes "Next: Add up to 10 ·
Count up to 20", from the numeracy plan over the group's roster.

The lesson screen has:

- Attendance chips (the same component as literacy).
- A header: "Group 3 · 20 min lesson".
- A **Warm-up** card (5 min) and two **Activity** cards (7 + 8 min). Each
  shows the skill, the step ("Count objects · up to 10"), why it was picked ("5 of 6 are ready") and the
  children who need extra help ("Sipho and Ayanda are still on up to 5").
- Tapping a card opens **How to teach it**: the step's `goal`, its numbered activities and what's
  needed, from the content file.
- **Swap** on each card lists every step the group could do now (§9.2), and the EA can pick one.
- Then **Wrap up →**.

### 6.4 Lesson shape

Every lesson in this release is **mixed**. Jim's lean (2026-10-31) was 2–3 activities, and that's
also the partner's style. Jim wants to compare mixed and focused lessons in the field eventually,
but agreed on 2026-10-31 to leave out the setting until a comparison is actually scheduled.
Nobody can run one before the partner signs off the content and numeracy EAs exist.

When a comparison is scheduled, design the setting then, with these lessons in hand:

- **Store it per EA**, not per group. EAs make their own groups on the phone, so a per-group setting
  would put every newly made group on the default and quietly mix up the two arms of the comparison.
- **Assign by EA or by school**, never group by group within one EA's caseload, because an EA teaching
  both shapes blends them.
- **Measure** steps gained per child per week (from ticks and evidence) alongside EGMA gains.

The planner already takes the number of activities as an input, and the screens draw however many
cards the plan holds. So the later change is a setting plus one line in the planner input.

### 6.5 Wrap up

This mirrors `LessonWrapUpScreen`:

- Heading: "Who can do these without help?" Under it: "Teaching it today doesn't count."
- A **Tick when** strip for each step taught today, which can be collapsed: "Count up to 10: ask for 8,
  then 10, then 9 counters."
- One row per present child, with a chip for each step taught today: "Flash to 5", "Count to 10", "Add to
  5". A chip that EGMA already shows is amber and fixed. A chip for a step the child already has is
  shown ticked.
- As with letters, chips only **add** ticks. Unticking is done on the child's tracker sheet ("N / 37 ›"
  on the row).
- No "None of these yet" chip and no `tracker_check` field: no screen would read them (check-solution
  review; Jim agreed 2026-10-31).
- Every change is held in the draft until **Save lesson**. Save writes the session, its attendees and
  every tick in **one SQLite transaction** (§8.3).

## 7. EGMA as evidence

### 7.1 What the EGMA branch provides

Every maths assessment item has `metadata.skill` and `metadata.band` (the smallest of 5, 10, 20, 50,
100 and 1000 at or above the item's largest number). Items the child never reached have
`metadata.reached: false`. Counters items also have `metadata.strategy`. Ignore results whose
`question_version` ends in `-draft`. (EGMA spec §8.1–8.2.)

### 7.2 Mapping EGMA tags to steps

| Step | Counts EGMA items tagged |
|---|---|
| `finger_flash.N` | `quick_see`, band N |
| `count.N` | `count_out`, band N |
| `read_numbers.N` | `read_numbers`, band N |
| `compare.N` | `compare_numbers`, band N |
| `before_after.N` (5, 10, 20) | `number_neighbours`, band N |
| `add.5`, `add.10` | `add_objects`, band N (the counters Question, which checks how the child got the answer) |
| `add.20` | `add`, band 20 (Core Addition 1 and 2) |
| `subtract.5`, `subtract.10` | `subtract_objects`, band N |
| `subtract.20` | `subtract`, band 20 (Core Subtraction 1 and 2) |
| `number_pairs.N` | `number_bonds`, band N |
| `count_aloud.N` | `count_aloud`, band N |
| `add.15`, `subtract.15`, `before_after.50/100`, `skip_count.*` | none: ticks only |

`add.15` and `subtract.15` have no EGMA band, because EGMA's bands jump from 10 to 20. Band-20 items
count toward `add.20` only. Because of the implied rule (§5.2), that also makes `add.15` known.

Core addition and subtraction feed only the "up to 20" steps. Their timed items record no per-item
method, so letting them feed `add.5` or `add.10` would bypass the counters Question's
"didn't count everything from 1" check (§7.3).

The mapping is a constant in the evidence reader module (my call, per the check-solution review). The
partner never edits it, so it doesn't belong in the content file, and keeping it in code avoids checks
that span both content files. A unit test checks every mapped skill key against the EGMA pack's skill
list.

### 7.3 The evidence rule

This is the EGMA spec's recommendation (§8.3), adopted. Where two Questions feed one step (for
example `read_numbers` from both Read numbers and Read big numbers), each source Question is judged on
its own, and **the step is shown if any source Question shows it** (my call). Within one source
Question, **the newest eligible result that reached an item mapped to that step decides**. The step counts as shown only if every reached
mapped item in that result was correct. For `add_objects` and `subtract_objects` items, a correct answer
counts only when `metadata.strategy` is `count_on` or `known`, not `count_all`. This strictness stays
inside the evidence; the EA never sees the word. A step that no result has reached has no evidence. A
newer wrong answer takes evidence away, as with letters.

## 8. Data

### 8.1 `skill_mastery`: a parallel table, not `letter_mastery`

`letter_mastery` can't hold a step key. A CHECK limits `letter` to one lowercase character, the language
is a two-letter code, and `set_letter_mastery` rejects anything else (recon: `.superpowers/numeracy/recon-tracker.md`
§6.2). The options were to generalise `letter_mastery` into one shared table now, or add a parallel
table with the same proven pattern. **Parallel** (my call, recommended by the research): the literacy
contract just passed hardened review and November's field retest starts on it. Unifying the two later
is a roadmap item. This is hard to reverse, so it gets an ADR (§11).

The shape copies `letter_mastery` with `(letter, language)` replaced by `step_key`:

- **Phone (SQLite, new migration):** `skill_mastery(id, child_id, step_key, confirmed, changed_at,
  correction_id, changed_by, programme_id NULL, sync columns, server_changed_at, server_correction_id)`,
  `UNIQUE (child_id, step_key)`, with `step_key` checked as `^[a-z_]+\.[0-9a-z]+$`. The id is a UUIDv5 of
  `('skill_mastery', child_id, step_key)` in a new namespace.
- **Server:** `public.skill_mastery` and an append-only `public.skill_mastery_corrections`;
  `private.skill_mastery_id()`; RLS identical to `letter_mastery` (no direct DML; SELECT by the writer
  or current deliverer); and `public.set_skill_mastery(p_correction_id, p_child_id, p_step_key,
  p_confirmed, p_changed_at)` with the same receipt, replay check, `(changed_at, correction_id)` winner
  and `applied` / `superseded` / `acknowledged` results. There's also a `get_skill_mastery_page` history
  pull behind a new `history_pull_rollout` switch.
- **Repository:** `skillMasteryRepository`, modelled on `masteryRepository`. It takes repositories from
  the signed-in EA handle. It validates `step_key` against the bundled edition's step keys and requires
  active delivery. It writes one outbox slot per row, applies the acknowledgement atomically with the
  outbox delete, and merges history pages.
- The server does **not** check `step_key` against the curriculum. An old phone must still be able to
  send ticks for keys a newer edition has retired. The phone checks keys; the server checks shape only.

### 8.2 The session record

`sessions.activities.numeracy` follows the PRD's "JSON, not new columns" convention:

```json
{
  "curriculum_edition": "2026.1-draft",
  "plan": { "engine_version": 1, "suggested": [{ "slot": "warm_up", "step_key": "finger_flash.5", "activity": "Finger flash" }, …], "reasons": {…} },
  "taught": [
    { "slot": "warm_up",  "step_key": "finger_flash.5", "activity": "Finger flash" },
    { "slot": "activity", "step_key": "count.10",       "activity": "How many in my pile?" },
    { "slot": "activity", "step_key": "add.5",          "activity": "Hide and add" }
  ]
}
```

- `taught` feeds the "last taught" ranking (§9.3) and the activity rotation (§4.3). It also separates
  "taught add, and nobody got it" from "never taught add". Activities are named by `name` within a step
  (builder's call: add stable activity ids to the content file if names prove too fragile across
  editions).
- Whether the EA swapped a card isn't stored; compare `plan.suggested` with `taught` (check-solution
  review; Jim agreed 2026-10-31).
- `curriculum_edition` says which content edition's wording the EA saw. Step keys carry the meaning,
  so ticks don't depend on it.

### 8.3 Save

Numeracy save mirrors `lessonSave.js`. In one SQLite transaction it:

1. checks the active programme and the right to deliver to each child;
2. writes the session and attendees;
3. calls `setSkillMastery` once for each pending tick, skipping any tick older than one already owed;
4. discards the draft.

The local draft reuses `lesson_drafts` (one slot per EA file; an EA has one active programme). Its
`plan`, `ticks` and `tracker_changes` JSON hold the numeracy shapes. The draft's `programme_id` tells a
reader which shape the JSON has. If the plan finds the generic columns too literacy-shaped, a separate
`numeracy_lesson_drafts` table is acceptable; that's the builder's call.

## 9. Lesson suggestions

A pure function, `planNumeracyLesson(input) → plan`, covered by tests the same way as
`computeLessonPlan`.

### 9.1 Inputs

The present children; each child's known steps (§5); the curriculum edition (skills, steps,
`comes_after`, activities); the group's numeracy sessions this year in this programme (their `taught`
lists); the number of activity cards (2 in this release); and completeness flags for history, ticks
and evidence, as with letters.

### 9.2 The group's step in each skill

- **Group-known step:** use letters' `isLetterGroupMastered(covered, present)`, renamed for general use.
  With fewer than 3 present, everyone must know it. Otherwise ≥ 80%, or all but one. A child with no data
  counts as knowing nothing (Masi's rule).
- **A skill's group step** is the first step in size order that isn't group-known. A skill with every
  step group-known is finished.
- **A skill is ready** when every `comes_after` key of its group step is group-known.
- **On a first lesson** no special rule is needed. With no data, every group step is the skill's first
  step, and only the four starting steps are ready.

### 9.3 Picking the cards

- **Warm-up pool:** `finger_flash`, `count_aloud`, `skip_count` (quick, oral, no materials). **Activity
  pool:** the other seven skills.
- Rank the ready skills in each pool by **when this group last had them** (from `taught`). Skills never
  taught come first; ties go to curriculum order.
- Take the top warm-up skill, plus the top two activity skills (the activity-card count). For each
  card, pick the step's activity this group has done least recently (§4.3).
- If a pool runs dry: with no ready warm-up skill, the warm-up becomes a review of a known step from the
  same pool; with no ready activity skills, show "This group knows every step that's ready. Use Swap to
  choose a step." Never suggest a step that isn't ready.
- **For each card**, list the present children who don't yet know the card's previous step
  ("still on up to 5") under "need extra help". Children who already know the card's step appear as "can
  help a partner". This matches the partner's pairs.
- **Why "last taught" rather than "weakest first":** it gives every skill regular turns. "Weakest first"
  can trap a group on the one skill it finds hardest. (Jim agreed, 2026-10-31.)

### 9.4 Freezing

As with letters, the plan freezes on the first tick and is saved with the session (`engine_version: 1`).
It is recomputed only on its own day, and only when the inputs become more complete. Back-dated
lessons save `plan: null, plan_reason: 'past_date'`.

## 10. Dependencies and order of work

1. **The EGMA branch** (`feat/egma-maths-assessment`; as of 2026-10-31 not yet pushed and with no
   PR). It carries `programmeSubject`, the maths-only screen set, the "coming soon" Record branch that
   numeracy capture replaces, and the EGMA pack whose tags feed evidence (§7). Tracks A–C below don't
   touch any of that and can start now. **Track D (screens) builds on main after the EGMA branch
   merges.** If EGMA stalls, split its host gating into its own PR first; don't stack numeracy on an
   unpushed branch.
2. **Partner sign-off on content.** Numeracy is **not** part of November's field retest (Jim,
   2026-10-31). The app can ship `2026.1-draft` to the test tracks, and Masi tries it out in
   **December**. Field EAs get numeracy only after the partner signs off and `2026.1` is frozen.
   The EGMA spec's precondition still applies: check that no field EA holds an active `numeracy`
   assignment before any staging migration.
3. **EGMA freeze before December** (Jim, 2026-10-31). The EGMA form stays `-draft` while it is
   tested in development, and is frozen to `masi-egma-en-2026-1` / `masi_maths@2026.1` before the
   December trial, so trial EGMA results count as evidence on the tracker (§7.1). Until then the
   tracker shows EA ticks only. The freeze waits on partner review of the questions, a timed pass
   with the printed Number Cards, and Jim's go.

What can run in parallel once this document is approved:

| Track | Depends on |
|---|---|
| A. Curriculum content: partner review of Appendix A, then freezing the edition, plus the verify script | nothing |
| B. Data: `skill_mastery` phone migration, server migration, RPC, RLS, history pull, contract map | nothing |
| C. Planner: `planNumeracyLesson` and the evidence reader, as pure functions with tests | the content file's shape (draft is fine) |
| D. Screens: Number tracker, lesson plan, How to teach it, Wrap up, save | B's repository interface, C's plan shape, dependency 1 merged |

## 11. Documents this changes (same branch as the code)

- `CONTEXT.md`: **Maths skill**, **Step**, **Number tracker**, **Lesson shape**, **Known step**
  (including implied), and the numeracy lesson flow.
- `documentation/rls-sync-contract-map.md`: `skill_mastery` operation and table rows, the history page,
  and the mastery-input completeness rule for numeracy.
- `docs/adr/`: an ADR for "numeracy ticks in a parallel `skill_mastery` table". The number comes after
  EGMA's 0012.
- `PRD.md`, `documentation/ROADMAP.md` (adding "unify mastery tables", "group heat map" and "lesson-shape
  comparison: per-EA setting, design when scheduled"), and
  `documentation/build-log.md`.

## 12. Claude's calls (Jim to check)

1. **37 steps across ten skills** (§4.1), including Finger flash and the two Counting skills, with add and
   take away using 5 / 10 / 15 / 20.
2. **Implied steps** (§5.2): a known higher step makes lower steps in the same skill known, without
   writing a tick.
3. **One programme-wide curriculum edition** (§4.4), not one per class.
4. **English-only content** in the first edition.
5. **A parallel `skill_mastery` table** (§8.1), with unification as a roadmap item.
6. **Warm-up and activity pools** (§9.3): the warm-up comes from Finger flash, Count aloud or Skip count.
7. **Wrap up chips only add ticks**, as with letters; unticking is on the tracker.
8. **No regrouping suggestions** in this release.
9. **A fourth order rule**: count aloud before skip counting (§4.2).
10. **One activity per card, taken in turn across lessons** (§4.3).
11. **Evidence from two Questions**: a step is shown if any of its source Questions shows it; Core
    addition and subtraction feed only "up to 20" (§7.2–7.3).
12. **A banned-word check in the verify script** (§4.4).

## 13. Testing

- Content: `verify.cjs` against deliberately broken fixtures (a cycle, a missing key, wrong arithmetic,
  a tick item out of range, two tick items instead of three).
- Planner: table tests for each rule in §9, including a first lesson, a split group, an all-known pool,
  out-of-order ticks with implied steps, groups smaller than 3, and activity rotation across repeat
  lessons on the same step.
- Evidence: the newest result that reached the step decides; a newer wrong answer removes evidence;
  `count_all`-only counters answers don't count; draft question versions are ignored; unreached items
  are ignored.
- Data: real SQLite (`better-sqlite3`) integration tests for the migration, the repository's outbox,
  acknowledgement and history merge, and the one-transaction save. Server pgTAP or SQL tests for
  `set_skill_mastery` that copy the `set_letter_mastery` suite.
- Screens: behaviour tests through the public screens (tick, untick, locked tiles, implied explanation,
  swap, Wrap up save), and an A03s device gate at default text size covering all four screens.
- Planner: the activity-card count is an input. One test with a count of 1 proves the later focused
  shape needs no planner change.

## Appendix A: Draft step content

All 37 steps are drafted:

- `docs/numeracy/curriculum-draft-2026.1.md`: the readable version, for the partner to review.
- `content/numeracy-curriculum/curriculum-2026.1-draft.json`: the same content, structured: the `2026.1-draft` content file (§4.4). It moved here from `docs/numeracy/` when Track A was built.

How they were made: one writer per skill, working from the partner's weeks 1–4; then a reviewer per
skill checking the maths, plain words, faithfulness to the partner and practicality; then one
consistency pass across all skills. A script then checked them: 37 steps; `comes_after` matching the
four rules (Skip count corrected to rule 4); three tick items on every step; every activity 4–8
minutes; and no banned words. All 75 tick answers were also checked for correct arithmetic and for
staying within the step's range. Of the 108 activities, 12 are the partner's used as written, 91
are partner activities adapted, and 5 are new. Each step ends with a note asking the partner
specific questions.

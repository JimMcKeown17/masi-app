# Lesson plan: suggested group, letters, blends and early reader

Status: **draft for Jim's review. Not approved for build.**

- Written 2026-10-20 on branch `feat/lesson-plan`, from `origin/main` `97e088c` (Bold Red 1–7 merged).
- Source conversation: Jim and Claude, 2026-10-19/20, with mockups (flow shape, entry point, book
  reader) shown in a browser companion.
- Related work this design leans on:
  - Zazi's Integrated spec, rev 3.3:
    `zz-integrated-pilot/documentation/plans/2026-10-18-integrated-programme-variant-spec.md` (§4–§5
    are the closest model; its A/B experiment machinery does not apply here).
  - The early reader books project: `early-reader-books/docs/superpowers/specs/2026-10-18-early-reader-books-design.md`.
  - Masi's group-first workflow spec: `documentation/group-session-workflow.md`. This design **is**
    the group-first capture that spec describes, so its prerequisites and non-goals apply.

## 0. Plain-English summary

Masi already teaches letters, blending and reading in the same session from day one (`CONTEXT.md`,
"Letters and blending are taught simultaneously in Masi"). What the app lacks is the advice: which
group to see, which letters to teach, which blends to practise and which early reader to read. It
also records nothing about blends or books.

This design adds that. When an EA taps **+ Record**:

1. The app shows **Who are you teaching?**, with one suggested group ("Up next") on top.
2. The EA opens a **Lesson screen** for that group and keeps it open for the whole session. It shows
   today's letters, blends at the group's reading level, and a book. The EA ticks each one as it is
   done. The plan and the record are the same card.
3. **Wrap up** asks who now knows today's letters without help, updates reading levels, and saves.

The pace is set **only by letter mastery**. Blends and books follow the letters; they never hold a
group back or move it forward.

All content (letter order, words, blends, books) comes from **one content pack per language**,
produced by the early reader books project. The app has no language-specific code. isiXhosa,
English and Afrikaans work identically; a language simply has no blends or books until its pack is
published.

Books exist in print first. The app also carries each book's text so an EA can read it on the phone
when the printed copy is missing. Picture pages come later, book by book.

---

## 1. Decisions Jim made (2026-10-19/20)

| # | Decision |
| --- | --- |
| J1 | The isiXhosa letter order becomes the early readers' order, `o m l a │ k u │ e n │ i t │ s d │ f b │ y c │ z p │ q w │ v g │ x h │ j r`. It is the new default everywhere in the app. |
| J2 | Fixing the letter-mastery download is a priority. It is its own piece of work (§9, track B1). |
| J3 | Record the group on the session, but compute the advice from each child's own history. Pairs are fluid; a child's history follows the child. |
| J4 | The EA is offered a suggested group when starting a session, plus letters, blends and a book. |
| J5 | Letters: the first two letters in the language's order that the group has not mastered. For a pair, "mastered" means **both** children know it (tracker mark or assessment). The first session suggests all four step-1 letters. |
| J6 | Blends come from the word bank, using only letters up to the end of the current step. They are **not** Zazi's bank: Zazi's lists assume every letter is known. |
| J7 | Blend length follows the reading level (2-letter, 3-letter, 4-letter, words). Default to the **lower** of the children's levels, with a "show higher level" option when one child is ahead. |
| J8 | Every session records the letters focused, the blends done and the book(s) read. |
| J9 | Books are printed first. Some books are also stored in the app for when the printed copy is missing. |
| J10 | All three languages (isiXhosa, English, Afrikaans) get letters, blends and books, identically. Each has its own letter order; English and Afrikaans are not treated as the same. isiXhosa content is first. |
| J11 | Race to field testing. No fixed date. |
| J12 | Three pieces run in parallel: mastery download (B1), content per language (books project), and this feature. |
| J13 | Flow shape **B**: one Lesson screen kept open while teaching, then Wrap up. Not Zazi's three steps, not one long form. |
| J14 | Entry point **A**: Home stays as built. "+ Record" opens "Who are you teaching?" with the suggested group on top. This keeps the 2026-10-15 decision to take "Who to see next" off Home. |
| J15 | In-app books: **text pages now, picture pages later** (per book, once its art is approved). |
| J16 | About 6 suggested blends (the blending block is ~15 minutes). Approved as part of the Lesson-screen playback. |
| J17 | Only native-speaker-approved words reach EAs in field builds; test builds may use unreviewed candidates. Approved as part of the word-bank playback. |

---

## 2. Calls Claude made (Jim to check while reading)

These are marked **(my call)** where they appear below.

| # | Call | Why |
| --- | --- | --- |
| C1 | The plan is computed from the children **present**, and recomputed when attendance changes until the EA ticks something. | An absent partner should not set today's level. Jim agreed blends follow the present child. |
| C2 | "Up next" = the group whose present-day members were seen least recently, skipping groups already taught today; ties go to fewest sessions this week. | Fair turns. Shown on the entry-point mockup and accepted. |
| C3 | Unlocked letters = every letter in steps 1..*k* (where *k* is the step of the last suggested letter) **plus** letters the group has already mastered. Letters the EA adds today do not change suggestions. | Jim's "up to the end of the step" rule, plus letters the children already know (out-of-order knowledge is real knowledge). Not re-ranking while the EA ticks keeps the screen stable. |
| C4 | Blend tiers by letter count: Cannot blend, Not set and 2 Letter Blends → 2-letter items; 3 → 3; 4 → 4; Word, Sentence and Paragraph Reading → words of 5+ letters. A tier with fewer than 6 items is topped up from the nearest lower tier. | Matches the reading ladder's own labels. |
| C5 | 2-letter items are **syllables** (*ma*, *lo*) supplied per step by the content pack; 3-letter and longer items are words from the approved word bank. | The bank holds whole words; the books design already defines per-step blends. |
| C6 | One book is suggested: the highest-step readable book that no present child read in their last 5 sessions, else the least recently read. | Rereading is good practice; variety still matters. |
| C7 | One lesson in progress per EA at a time. It survives app close, force-quit and upgrade. | Masi sessions last ~55 minutes; today's form is lost if left. Zazi's single-key bug shows why a second start must be refused, not overwritten. |
| C8 | ECD classes get the same Lesson screen **without** the book row. | `CONTEXT.md`: ECD sessions have no pair-reading block. |
| C9 | When every letter is known, the letters row says "All letters known" and blends and books use everything unlocked. Sound steps (isiXhosa *th*, *ph* …) and the move to Level 8+ are out of scope for v1. | Few groups reach 26 letters during early testing; both need their own pedagogy decision. |
| C10 | A language without a published pack still uses the Lesson screen: the EA picks letters from that language's alphabet, and the blends and book rows say no content is available yet. English gets an interim letters-only pack built from today's English order; Afrikaans gets none until its pack exists. | One code path for every language, as J10 requires. |
| C11 | `session_reading_level` keeps being written, as the tier the blends were practised at. | Session History and teaching-quality analytics read it today. |
| C12 | Production builds load only **release** packs; preview builds also load **preview** packs (which may contain unreviewed words). | Enforces J17 without a second code path. |

---

## 3. What exists today (verified on `origin/main` `97e088c`)

| Need | Masi today |
| --- | --- |
| Letter suggestion engine | None. |
| Letter order | Four orders disagree: `LETTER_ORDER` (`src/constants/literacyConstants.js:4`, used by the session letter grid and the Session complete receipt), `PEDAGOGICAL_ORDERS` (`src/constants/egraConstants.js:119`, used by the tracker and mastery counts), Zazi's, and the books'. |
| Language key | `normalizeLanguageKey` (`src/utils/letterMastery.js:70`) maps anything that is not isiXhosa to `english`, so an Afrikaans class silently gets English. |
| Letter mastery | Union of assessment evidence and EA confirmation (`src/utils/masteryState.js`). Read per EA and never downloaded (ROADMAP §1, "Letter mastery as current state"). |
| Reading level | `children.reading_level` (current, synced) plus `activities.child_reading_levels` and `activities.session_reading_level` snapshots. Ladder: `READING_LEVELS` (`literacyConstants.js:11-19`). |
| Word bank, blends, books | None in the app. |
| Session capture | One long Bold Red form (`src/screens/sessions/LiteracySessionForm.js`), child-first, submit-and-go, no draft. Validation requires at least one letter (`src/utils/literacySessionValidation.js:4`; issue #54). |
| Group on a session | `sessions.group_id` exists locally and on the server, but the form sends no group and two RESTRICTIVE policies pin it to NULL on the server (`supabase/migrations/20260529214500_masi_sessions_forward_prep_columns.sql:36-47`). |
| Session history on the phone | Pulled for the EA's own sessions and every session attended by a child the EA has delivered to (`src/services/sessionHistoryPull.js`), so each child's history is available on the phone. |

---

## 4. The rules

### 4.1 One content pack per language

All teaching content is data. The app reads one immutable JSON file per language and version, for
example `isixhosa-v1`, bundled in the app (so OTA updates deliver it). Old versions stay bundled
while any draft or saved session references them.

The pack is **produced by the early reader books project**, never edited by hand in the app repo.
Its shape builds on Zazi's §4.1 sequence file, with the additions Masi needs:

```jsonc
{
  "id": "isixhosa-v1",
  "language": "isixhosa",            // matches normalizeLanguageKey output
  "channel": "release",              // release | preview (C12)
  "sound_inventory": ["a","b", "...", "th","ph","kh","ny","hl","bh","nc","dl","ty","sh","tsh"],
  "letter_steps": [
    { "step": 1, "new_letters": ["o","m","l","a"],
      "blends": ["mo","ma","lo","la"] },          // 2-letter syllables (C5)
    { "step": 2, "new_letters": ["k","u"], "blends": ["ku","mu","lu","ka","ko"] }
    // … every letter step
  ],
  "sound_steps": [ { "step": 13, "new_sounds": ["th"] } ],   // carried, unused in v1 (C9)
  "words": [                                                  // the approved word bank
    { "text": "molo", "syllables": "mo-lo", "sounds": ["m","o","l","o"], "step": 1 },
    { "text": "umama", "syllables": "u-ma-ma", "sounds": ["u","m","a","m","a"], "step": 2 }
  ],
  "books": {
    "xh-int-v1-r01": {
      "title": "Molo, Lolo!", "step": 1, "retired": false,
      "tricky_words": [],
      "speakers": { "malo": { "name": "Malo", "colour": "red" },
                    "lolo": { "name": "Lolo", "colour": "blue" } },
      "pages": [ { "lines": [ { "speaker": "malo", "text": "Molo, Lolo!" } ] } ]
    }
  }
}
```

Rules:

- **The app never invents words.** Every word, syllable and book comes from the pack.
- **Decodability is checked with the books project's own checker.** Copy `checker/core/*.js` and
  `checker/vectors/decodability-v1.json` from `early-reader-books` into the app unchanged, and run the
  vectors in Jest. Check once that Hermes supports `String.prototype.normalize` and `\p{L}` (the
  checker's README asks for this).
- **A pack lint runs in Jest** (adapted from Zazi §4.2): letter steps are a permutation of the
  language's letters, every word and book token is decodable at its declared step or is a listed
  tricky word, every book id is unique, and every speaker in a page is declared.
- **Unknown or missing pack** → the C10 fallback. Never crash.
- **Speakers are kept** so the in-app reader can colour each line by character (the books design
  currently drops speakers from the app file; §13 asks for them).

### 4.2 Letter order

- There is **one teaching order per language**, read from that language's pack
  (`letter_steps[].new_letters`, concatenated).
- A single resolver, `getTeachingOrder(languageKey)`, replaces direct reads of `LETTER_ORDER` and
  `PEDAGOGICAL_ORDERS` in the tracker sheet and panel, the session letter grid, the Session complete
  receipt sort, and the engine. Mastery counts that only test membership (e.g. `dashboardStats.js`)
  do not need the order.
- isiXhosa switches to the books' order (J1). English uses the interim English pack until its real
  order is set (C10). Afrikaans gets its own order with its pack.
- `normalizeLanguageKey` returns `afrikaans` for Afrikaans classes and `null` for unknown ones, never
  `english` by default. Mastery rows for Afrikaans then carry the Afrikaans language value.
- `letter_mastery` rows do not depend on order, so no data migration is needed. PRD §6.8 and
  `teaching-quality-analytics.md` are updated to name the pack as the single source.
- EGRA assessment forms keep their own fixed item order. Assessment evidence is unchanged.

### 4.3 Which group is "Up next"

The list shows the EA's active groups in their active programme, with current members.

- **Last seen** for a group = the most recent session date on which any current member was present,
  across all sessions on the phone.
- **Up next** = the group with the oldest "last seen", skipping groups taught today. Never-seen
  groups come first. Ties: fewest sessions this week, then group display number (C2).
- Each row shows the children's names, last seen ("Today ✓", a weekday, or a date) and the next
  letters.
- This is advice. The EA can choose any group.

### 4.4 Letters

Computed over the children present (C1). "Knows a letter" uses the existing union of assessment
evidence and EA confirmation.

- **Group-mastered** (Zazi's `isLetterGroupMastered`, `groupLetterMastery.js:30-37`, with every
  present child counted, so a child with no data counts as knowing nothing):
  - fewer than 3 children: **all** of them know it (so both children in a pair);
  - 3 or more: at least 80% know it, or at most one child does not.
- **Suggested letters** = the first two letters in the teaching order that are not group-mastered.
  Letters mastered out of order are skipped.
- **First session** = none of the present children has any saved lesson-plan session, and no step-1
  letter is group-mastered. Then suggest all of step 1 (four letters, so words are possible on day
  one).
- **All letters known** = nothing left to suggest (C9).
- **Review letters** = the unlocked letters (§4.5) minus today's suggested letters, in teaching order.

### 4.5 Unlocked letters

`unlocked = letters in steps 1..k ∪ group-mastered letters` (C3), where *k* is the step that
contains the last suggested letter. On the first session *k* = 1. When all letters are known, every
letter step is unlocked.

Blends and books are filtered by **sound set**, not step number: an item is usable when every one of
its sounds (from the pack's `sounds`, tokenised longest-match by the vendored checker) is unlocked.
In v1 only single-letter sounds can be unlocked, so words containing a multi-letter sound such as
*th* wait for the sound steps (C9).

### 4.6 Blends

- **Tier.** Each present child's current reading level maps to a tier (C4). The default tier is the
  **lowest** among the present children (J7). If another present child is at a higher tier, a
  "Show 3-letter (Lulu is ahead)" control switches the suggestions to that tier.
- **Pool.** Items in the tier whose sounds are all unlocked: the steps' syllables for the 2-letter
  tier, otherwise approved words of that letter count (letters counted after normalising, so
  hyphens do not count).
- **Six suggestions** (J16), ranked:
  1. items containing today's suggested letters;
  2. items no present child practised in their last 3 sessions;
  3. a rotation that shifts by one position per local day per group (the seed Zazi's
     `blendingAdvice.js` uses), so the list changes day to day.
- **"+ more"** opens every item in the pool for the chosen tier, ticked items first.
- A tier with fewer than six items is topped up from the nearest lower tier (C4).

### 4.7 Book

- **Readable** = every token of every page, excluding the book's tricky words, uses unlocked sounds.
  Retired books are never suggested.
- **Suggested book** = the readable book with the highest step that no present child read in their
  last 5 sessions; otherwise the readable book read longest ago (C6).
- **"Other book"** lists every non-retired book in the language, easiest first, with tags: Suggested,
  "Read Mon" (any present child), and "Uses letters not learned yet" for books that are not
  readable. Any book can be chosen.

### 4.8 Reasons and empty states

The engine returns exactly one reason, which the Lesson screen explains in plain words:

| Reason | When | Letters row |
| --- | --- | --- |
| `first_session` | §4.4 | the four step-1 letters |
| `ok` | normal | two letters |
| `all_letters_known` | nothing left | "All letters known" |
| `no_pack` | the language has no published pack | "Choose the letters you teach" (whole alphabet) |
| `no_children` | everyone marked absent | nothing; Save is blocked |

---

## 5. Screens

All screens use the Bold Red components that merged in #81–#87: `StepHeader`, `SelectableRow`,
`LetterToggleGrid`/`LetterToggleTile`, `StickyActionFooter`, `RequirementSummary`, `ChildProgressBlock`,
`ConfirmSheet` and the shared `BottomSheet`. Bottom sheets, not dialogs. Copy is for low-training EAs:
short, concrete, no workflow states.

### 5.1 Who are you teaching?

Opened by "+ Record" for Core Literacy EAs.

- Red header, title "Who are you teaching?".
- **Up next** card: children's names (large), "Not seen since Mon · letters k u", and a
  **Start lesson** button.
- **Other groups**: one row per group with names, last seen and next letters. Tapping a row opens
  its Lesson screen.
- **No groups**: an empty state explaining that groups are set up by Head Office (see open question
  Q1).
- If a lesson is already in progress, "+ Record" goes straight back to it instead (C7).

### 5.2 Lesson screen

One scrolling screen, kept open for the whole session.

- **Header**: children's names, grade, language, last seen.
- **Who's here**: one chip per child, all present by default; tap to mark absent. "+ Add a child"
  adds a child from another group for today only (an attendance difference, never a membership
  change).
- **1 · Letters · 15 min**: the suggested letters as tiles, **not** pre-ticked, plus "+" for any other
  letter. Review letters as text below.
- **2 · Blending · 15 min · 2-letter**: six suggested items as tiles, not pre-ticked, shown with
  syllable hyphens when the pack has them (*ma-ma*). "+ more" opens the pool sheet. "Show 3-letter
  (Lulu is ahead)" when §4.6 applies.
- **3 · Pair reading · 5 min**: the suggested book with a cover tile, a **Read** tick, **Open in app**
  and **Other book**. Hidden for ECD classes (C8).
- **Footer**: "Wrap up →".
- The plan is recomputed when attendance changes, until the EA ticks anything (C1). After that it is
  fixed for this lesson.
- Every change is saved to the local lesson draft (§7.2).

### 5.3 Wrap up

- Heading: "Who knows **k u** without help?" with "Teaching it today doesn't count." (today's letters
  are the letters the EA ticked; if none were ticked, this section is skipped).
- Per present child: one chip per ticked letter (assessment-mastered letters show locked), a
  "No one new yet" button, the child's reading-level pill (opens the existing ladder sheet), and
  "7/26 ›" opening the full `LetterTrackerBottomSheet` in the language's teaching order.
- **Date**: today by default; a past date can be chosen (the only way to log a past lesson, as today).
- Notes (optional).
- **Save session**. Never blocked except when no child is present. If letters, blends and book are
  all empty, a one-step confirm asks "Save without letters, blends or a book?" (capture and flag;
  this also closes issue #54).

### 5.4 In-app reader (text pages)

- Opened from **Open in app** or from a book in "Other book".
- One page per screen, large type, each line in a speech bubble in its speaker's colour with the
  speaker's name underneath. Back and Next buttons, page dots, and a close ✕.
- Reading in the app ticks the book as read with `how: 'app'` (printed is the default).
- Picture pages are a later phase (§8): the same screen shows a book's pictures once its pages have
  been downloaded, and text otherwise.

### 5.5 Elsewhere

- **Home**: unchanged, except the attention area shows "Lesson in progress · Amahle & Lulu · Resume"
  while a draft exists.
- **Session complete**: the receipt adds Blends and Book.
- **Session History**: each card adds the number of blends and the book title.

---

## 6. What gets saved

Everything new goes inside `sessions.activities`, which the server passes through untouched
(`CONTEXT.md`: programme-specific session data lives in `activities`). No new synced table.

```jsonc
{
  // existing keys, same meaning
  "letters_focused": ["k"],                         // may now be empty (closes #54)
  "session_reading_level": "2 Letter Blends",       // the tier the blends were practised at (C11)
  "child_reading_levels": { "<child_id>": "3 Letter Blends" },
  "comments": "…",

  // new
  "lesson": {
    "version": 1,
    "pack_id": "isixhosa-v1",
    "language": "isixhosa",
    "plan": {                                       // frozen when the plan is fixed (§5.2), never recomputed on retry
      "engine_version": 1,
      "reason": "ok",
      "capture_mode": "live",                       // live | past_date
      "present_child_ids": ["…","…"],
      "known_letters": ["o","m","l","a"],
      "suggested_letters": ["k","u"],
      "review_letters": ["o","m","l","a"],
      "unlocked_letters": ["o","m","l","a","k","u"],
      "blend_tier": "2 Letter Blends",
      "suggested_blends": ["ku","mu","lu","ka","ko","mo"],
      "suggested_book": "xh-int-v1-r03",
      "up_next_group_id": "…"                       // what the picker suggested, even if the EA chose another
    },
    "blends_done": ["ku","mu"],                     // pack item texts
    "books_read": [ { "id": "xh-int-v1-r03", "how": "printed" } ],
    "tracker_check": "marked"                       // marked | none | null (skipped)
  }
}
```

- `lesson` is a nested key, so it never collides with 1000 Stories' top-level `books_read` count.
- Tracker marks and reading-level changes are written as today (`letter_mastery` rows and
  `children.reading_level`) in the same SQLite transaction as the session and its outbox row.
- `sessions.group_id` carries the chosen group once track B2 lands (§7.1).

---

## 7. Data and sync

### 7.1 Group on the session (track B2)

The session must carry the group (J3), and `group-session-workflow.md` forbids writing a local
`group_id` that the server then discards. So the full contract ships before or with the Lesson
screen:

- the workflow spec's prerequisites 2 and 3 (collision-proof group identity; server authorization
  for a non-null `sessions.group_id`, replacing the two RESTRICTIVE pins in the same migration), and
  prerequisite 1 if the slice relies on any membership-mediated grant;
- `group_id` added to `SESSION_COLUMNS` and `SERVER_COLUMNS`, removed from `INTENTIONALLY_UNSYNCED`;
  `sessions → groups` in `TABLE_DEPENDENCIES` and `PARENT_FK_COLUMNS`; the history pull maps the
  group foreign key the way it already maps attendees;
- `session_attendees.group_id` rules decided in the same slice (the session's group for members; for
  a child added from another group, the slice decides);
- the column stays **nullable**: older builds keep sending none.

Its own plan, following `rls-sync-contract-map.md`, with real-SQLite and disposable-Postgres RLS tests.

### 7.2 Lesson drafts (local only)

- A local SQLite table holds the in-progress lesson (group, attendance, plan, ticks, tracker and
  reading-level edits, notes). It is not synced and lives in the EA's own database (ADR-0008).
- One draft per EA at a time (C7). Starting another group while one exists asks to finish or
  discard the first.
- A draft is created on the first change, not when the screen opens.
- Save runs one transaction: session row, attendee rows, mastery and reading-level writes, outbox
  rows, and deleting the draft. A failed save keeps the draft and the same session id.
- The draft survives force-quit, process death, offline restart and an app upgrade (local migrations
  stay additive).

### 7.3 Inputs the engine needs, and where they come from

| Input | Source |
| --- | --- |
| Group list and members | `groups`, `child_group_memberships`, `group_ea_assignments` (already pulled) |
| Language | the class's `home_language` via `normalizeLanguageKey` |
| Letter mastery per child | `masteryState` union; **complete only after track B1** (download + re-key) |
| Reading level per child | `children.reading_level` |
| Each child's past lessons | `session_attendees` + `sessions.activities` (already pulled) |
| Content | the bundled pack |

The engine is a **pure module**: it receives these as plain data and returns the plan. It never reads
SQLite or React state, so it is tested with vectors and can later be ported to the server unchanged.

---

## 8. Not in v1

- Picture pages in the in-app reader (J15 later phase; needs approved art and a download-once store).
- Sound steps after the 26 letters, and the Level 8+ transition (C9).
- Any server report on plan versus what was taught (the data is captured from day one).
- A session timer (not needed: no clock in Masi's session).
- Editing a saved session.
- Other programmes (Numeracy, 1000 Stories). The engine is literacy-specific; the group picker and
  draft are written so other programmes can reuse them later.

---

## 9. Build order

Three tracks run in parallel (J12). Implementation goes through Codex (`gpt-5.6-sol`) per
`AGENTS.md`; Claude reviews each diff and runs the tests.

| Slice | What | Depends on | Ships as |
| --- | --- | --- | --- |
| **A1** Content pack contract | Vendored checker + vectors; pack loader and registry; pack lint; fixture packs (isiXhosa preview from the books repo's candidates, interim English letters-only, a small Afrikaans test fixture) | — | inert |
| **A2** Letter order + language key | `getTeachingOrder`; isiXhosa switches to the books' order in the tracker, letter grid and receipt; Afrikaans stops falling back to English | A1 | visible: new isiXhosa order |
| **A3** Engine | Pure `lessonPlan` module: up next, letters, unlocked set, blends, book, reasons; TDD vectors | A1 | inert |
| **B1** Mastery as current state | ROADMAP §1: re-key, D1, mastery download, cross-EA assessment read | — (own plan) | gate for field testing |
| **B2** Group on the session | §7.1 | — (own plan) | gate for the Lesson screen release |
| **C1** Lesson draft | §7.2 local table, resume, Home attention card | — | inert until C3 |
| **C2–C3** Picker, Lesson screen, Wrap up, save path | §5.1–5.3, §6; replaces `LiteracySessionForm` for Core Literacy | A2, A3, C1, B2 | the feature |
| **C4** In-app reader + Other book | §5.4, §4.7 | A1 | with C3 |
| **C5** History and receipt | §5.5 | C3 | with C3 |
| **D** Content | Real packs for isiXhosa, then English and Afrikaans (books project) | books project | data swap, no code |

Critical path to field testing: **B1, B2 and approved isiXhosa content**, not the engine.

---

## 10. Testing and gates

- **TDD** with the repo's `tdd` skill, red-green-refactor in vertical slices.
- **Engine vectors** (JSON): first session; pair with one child absent; out-of-order mastery;
  all letters known; unlocked set per state; tier mapping and "show higher" for each ladder level;
  top-up of a thin tier; book choice with recency; retired book; no pack; Afrikaans key.
- **Checker vectors** from the books project run unchanged.
- **Real SQLite** (`better-sqlite3`) for the draft table, the save transaction and force-quit
  recovery; **disposable Postgres** RLS tests for `sessions.group_id` (B2).
- **Screen tests** through the public screen interface: tick/untick, absent child recomputes the plan,
  plan frozen after first tick, confirm-on-empty save, resume after restart.
- **Device gates**: Galaxy A03s (360dp) and an iPhone, at 1.0x and 1.3x text; low-end performance of
  the picker and Lesson screen with a full roster.
- `npm test`, `npm run test:integration` and `npm run test:release` before any shared build.
- Codex adversarial review of each slice's diff.

---

## 11. Docs to update in the same branches

- `CONTEXT.md`: new terms (Lesson plan, Content pack, Up next, Blend tier, Early reader); the
  single teaching order; capture is group-first.
- `PRD.md` §6.8 (letter order) and the capture section.
- `documentation/group-session-workflow.md`: mark as realised by this design; record the settled
  product decisions (no timer; attendance toggled in capture; past dates via the Wrap up date).
- `documentation/open-decisions-backlog.md`, `documentation/ROADMAP.md`, `documentation/build-log.md`.
- `documentation/rls-sync-contract-map.md` for B2.
- `documentation/teaching-quality-analytics.md` (canonical order, new `lesson` keys).
- An ADR for "one teaching order per language, from the content pack" and for "advice from children,
  record with the group" (via `grill-with-docs`).

---

## 12. Left to the builder

- File and module layout (suggestion: `src/lessonPlan/` holding the engine, pack registry and
  vendored checker).
- The draft table's exact columns and the session id lifecycle, within §7.2.
- Component breakdown of the Lesson screen and sheets, within the Bold Red system.
- Exact copy beyond what is quoted here, following `design-system.md` and the ux-copy rules.
- How the rotation seed is computed, as long as it is stable per group per local day.

---

## 13. Asks of the early reader books project

The app needs these in the pack before field testing:

1. A release step that emits `<language>-v<N>.json` in the §4.1 shape, `release` and `preview`
   channels.
2. **Speakers kept** on every line, with a colour per character, for the in-app reader.
3. The **full approved word bank** with syllables and sounds, not only ~12 words per step, so
   "+ more" has enough items.
4. Per-step 2-letter syllables (already in its design).
5. A `retired` flag per book.
6. English and Afrikaans packs, with their own orders. English needs the pack format extended for
   letter patterns (*sh*, *ee*, *a_e*); the app contract is written in sounds so that extension adds
   fields rather than breaking them.
7. Later: page images per book for the picture-page phase, and a neutral or per-programme edition
   field for cover branding (the current cover reads "Zazi iZandi · Masinyusane").

---

## 14. Open questions

*(To be filled from the builder check before Jim's review.)*

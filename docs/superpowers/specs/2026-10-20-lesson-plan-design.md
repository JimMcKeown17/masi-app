# Lesson plan: suggested group, letters, blends and early reader

Status: **approved by Jim, 2026-10-20 (rev 1).** Rev 2, the same day, aligns this design with the
assessment-results design, which merged while this one was in review (§0.1). Jim to confirm rev 2.
Plans: `docs/superpowers/plans/2026-10-20-lesson-plan-*.md`.

- Written 2026-10-20 on branch `feat/lesson-plan`, from `origin/main` `97e088c` (Bold Red 1–7 merged).
- Source conversation: Jim and Claude, 2026-10-19/20, with mockups (flow shape, entry point, book
  reader) shown in a browser companion.
- Mockups shown to Jim: `docs/superpowers/specs/assets/2026-10-20-lesson-plan/` (flow shape,
  entry point, book reader). Jim chose B, A and C respectively.
- Related work this design leans on:
  - Zazi's Integrated spec, rev 4.1, approved for build (Stage A) on 2026-10-19:
    `zz-integrated-pilot/documentation/plans/2026-10-18-integrated-programme-variant-spec.md` (§4–§5
    are the closest model; its A/B experiment machinery does not apply here).
  - The early reader books project: `early-reader-books/docs/superpowers/specs/2026-10-18-early-reader-books-design.md`.
  - Masi's group-first workflow spec: `documentation/group-session-workflow.md`. This design builds
    the group-first capture that spec describes. §7.1 says which of its prerequisites this needs, and
    §7.4 reconciles three of its locked rules.

## 0. Plain-English summary

Masi already teaches letters, blending and reading in the same session from day one (`CONTEXT.md`,
"Letters and blending are taught simultaneously in Masi"). What the app lacks is the advice: which
group to see, which letters to teach, which blends to practise and which early reader to read. It
records the reading level a session practised, but not which blends or books were used.

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

### 0.1 Revision 2: aligned with assessment results (2026-10-20)

The assessment-results design ("AR": `docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md`)
merged as #89 and its Plan 1 as #90 while this design was in review. Jim approved both the same day.
AR already designs most of this design's track B1 and settles how languages are stored, so rev 2
follows it:

- **Languages are stored as two-letter codes** (`en`, `xh`, `zu`; AR §6.1), not labels. Afrikaans
  becomes `af`. Every language key in this design (packs, drafts, the engine) is that code, resolved
  by `languageCodeForHomeLanguage` (`src/utils/assessmentRegistry.js`).
- **The letter test is one shared card.** #90 made Grid A (`letter_sounds@2026.2`, six rows of ten,
  mixed case) the letter test for English and isiXhosa. Its 60 letters are exactly Zazi's
  `afrikaans_60_v2`, which is the same printed card. So J20 is met by an `af` copy of Grid A (C20),
  and rev 1's open question about paper sheets is answered: Jim supplied Grid A as Masi's card
  (AR §6.1 status update).
- **Track B1 is AR Plans 2–3.** #90 already built B1-0 (server stamps) and the all-or-nothing
  assessment upload with immutability. AR Plan 2 re-keys mastery with "latest correction wins" and
  returns the winner to the phone. AR Plan 3 downloads assessments, runs and mastery, including the
  class arm of ADR-0005 with history-reference children, so control children are covered (rev 1 had
  deferred them). §7.6 now lists only what the lesson plan asks of those plans.
- **Track AF shrinks** to adding `af` to that model (§7.5). #90 already stopped Afrikaans classes
  being treated as English: their language resolves to `null`, the assessment picker asks for
  English or isiXhosa, and the tracker shows an empty state.
- **isiXhosa also gets an interim letters-only pack** (C10). The isiXhosa test pack built from
  candidate words is preview-only (J17), so without it a pilot build would have no isiXhosa order.
- Line numbers in §3–§7 were checked on `97e088c`; #90 moved some. The plans cite current lines.

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
| J18 | When an EA has no groups, or some children are in none, the picker offers **+ Make a group** (pick the children, done) and lists ungrouped children under "Not in a group yet" with **Put in a group**. Every lesson belongs to a group, and the old Record form retires. One-on-one tutoring is a later question (§8). |
| J19 | Words on Masi's assessments may appear in blends and books. *umama* is too common to avoid, automaticity is part of what is measured, and children are assessed three times a year. The app must not encourage explicit teaching to the test. Assessment words rotate, so the word bank never depends on the assessment word list. |
| J20 | Afrikaans classes are assessed on a copy of Zazi's Afrikaans letter sheet for now, and every Afrikaans gap in the app is fixed (track AF, §9). |
| J21 | Track B1 is AR Plans 2–3, written and built in this workstream, with the lesson plan's asks (§7.6). (rev 2) |
| J22 | The isiXhosa test-pack script may use `yaml@2.8.2` as an exact-pinned devDependency; it is already in `package-lock.json` through Expo tooling. (rev 2) |
| J23 | A child in one of an EA's groups is always one of that EA's own children (a direct child assignment). There are no group-only children. (rev 2) |
| J24 | "We should only be reviewing letters that are known, though if it's the first level, it's harmless to learn and review at the same time." (2026-10-23) |

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
| C7 | One lesson in progress per EA at a time. It survives app close, force-quit and upgrade. | Masi sessions last ~55 minutes; today's form is lost on discard, process death or force-quit. Zazi's single active-session key let a second group overwrite an unfinished session (ZZ-BUG-20260922-001, `documentation/ROADMAP.md:487-490`), so a second start is refused, not overwritten. |
| C8 | A lesson whose class (C18) has grade `ECD` gets the same Lesson screen **without** the book row. | `CONTEXT.md`: ECD sessions have no pair-reading block. The class grade is the signal, because the database still holds one literacy programme row for R–3 and ECD. |
| C9 | When every letter is known, the letters row says "All letters known" and blends and books use everything unlocked. Sound steps (isiXhosa *th*, *ph* …) and the move to Level 8+ are out of scope for v1. | Few groups reach 26 letters during early testing; both need their own pedagogy decision. |
| C10 | A language without a published pack still uses the Lesson screen; the blends and book rows say no content is available yet. Until its real pack is released, **each language gets an interim letters-only release pack**: isiXhosa with the books' order (J1), English with today's tracker order (`ENGLISH_PEDAGOGICAL_ORDER`, `a m s t │ n i │ …`), and Afrikaans with Zazi's provisional `AFRIKAANS_PEDAGOGICAL_ORDER` (`a s m e │ k i │ …`, Zazi `origin/main` `src/constants/egraConstants.js:262`). In each, the first four letters are step 1, then pairs. If no pack loads at all, the EA picks letters from the language's 26 letters (§4.2) and nothing is suggested. | One code path for every language, as J10 requires. English EAs see no change in order until the real one lands; Afrikaans EAs get letter advice from the first build instead of none. The isiXhosa test pack from candidate words is preview-only (J17), so a release build needs the interim isiXhosa pack to have the J1 order at all (rev 2). |
| C11 | `session_reading_level` keeps being written, now **derived from the blends ticked**: the highest tier among them, each item counted by its own letter count (2 → "2 Letter Blends", 3 → "3 Letter Blends", 4 → "4 Letter Blends", 5+ → "Word Reading"), so top-up items count at their own tier. No blends ticked → `null`. The suggested tier and the tier on screen at save are stored separately in `lesson` (§6). | Session History and teaching-quality analytics read it today, and Session History already hides an empty value (`SessionHistoryScreen.js:141`). Deriving it means it can never name a tier nobody practised. Because the default tier is the lowest present child's, the "session pitched above a child" check (`teaching-quality-analytics.md`) now mostly fires when the EA chose "show higher". |
| C13 | Only present children are saved as attendees, as today. A member marked absent is not written. | Absence can be derived from the session's group and its membership history. Writing `absent` rows would change every count that reads attendees today (history cards, receipt, hydration). |
| C14 | A plan belongs to the day it was made. The draft keeps its lesson date (the day it started) and the plan records `made_on`. At save, the plan is kept when the lesson date equals `made_on`, however late the save: a Monday lesson finished on Wednesday keeps Monday's date and plan. It becomes `plan: null` with reason `past_date` only when the dates differ, because the EA changed the date or is logging a past lesson. An unfrozen plan is recomputed only on its own day. | Zazi rev 4.1's rule: mastery on a past date cannot be rebuilt, so advice computed later is not evidence of what was advised then. Advice frozen on the day itself is evidence, and a late save must not throw it away. |
| C15 | Masi reads the **same** catalogue file the books project produces for Zazi (`integrated-sequence-<lang>-v<N>.json`), with Masi's extra needs added as new fields that Zazi ignores. | One emitter, one checker, one set of printed books for both programmes. The vendored checker lints the shared shape unchanged. |
| C16 | B2 (group on the session) covers only what a non-null `sessions.group_id` needs (§7.1). Collision-proof grouping versions and display numbers stay deferred, as `rls-sync-contract-map.md:180, 501-503` already plans. | This feature creates no new kind of group write; EAs can already make "Group N" today. Pulling regrouping work forward would put it on the critical path for no benefit here. |
| C17 | "+ Record" keeps today's gates (active programme, then the clock-in sheet, `src/hooks/useSessionLaunchGuard.js:36-63`) and today's routing by job title (`SessionFormScreen.js:22`). The Lesson flow replaces `LiteracySessionForm` behind that route. | Moving routing to programme delivery mode is separate open work (`CONTEXT.md`); mixing it in widens the slice. |
| C12 | Every build loads only **release** packs. **Preview** packs (which may contain unreviewed words) load only when an explicit developer setting is on, and a build check refuses that setting in pilot and production artifacts. | Enforces J17. The EAS channel cannot be used: the `pilot` profile ships store builds on the `preview` channel (`eas.json:34-48`). |
| C18 | Each lesson has one **class**, fixed when its draft starts and stored in the draft: the group's `class_id` if set; else the one class all the group's current members share; else (members in different classes, rare for pairs) the EA picks the class once on the Lesson screen before suggestions show. The class gives the language (`home_language`), the ECD check (C8) and `sessions.class_id`. Who is present, and children added for the day, never change it; a child added from another class is taught, and their tracker marks saved, in the lesson's language, because letter sounds differ by language and the evidence belongs to the language taught. Groups this feature creates (J18) record the class when their children share one. | Today's form takes the class from whichever child was picked first (`LiteracySessionForm.js:308`), and "Group N" groups are created without a class (`GroupPickerBottomSheet.js:150`), so the language would otherwise depend on tap order. |
| C19 | B2's server check accepts a session's group when the EA **holds or has held** an assignment to that group in the session's programme (any `group_ea_assignments` row, ended or not), not only an active one. | A lesson records something that already happened. Deleting a group ends its assignment and queues that end at sync rank 6, ahead of sessions (`groupsRepository.js:435-481`, `offlineSync.js:301-310`), so an active-only check would refuse a lesson saved offline before the group was deleted, or before Head Office ended the assignment. Session reads already use historical grants this way (`private.can_read_session`), and the one-row-per-group assignment id keeps the ended row as evidence. |
| C20 | The Afrikaans letter test is `letter_sounds@2026.2.af`: Grid A's rows (`GRID_A_ROWS`) and stop rule, the card #90 made the letter test for English and isiXhosa, with its own item-set id (AR §6.1: an id is provenance). Zazi's older `afrikaans_60` is never used. | Grid A's 60 letters are exactly Zazi's active `afrikaans_60_v2` (Zazi `src/constants/egraConstants.js:68-102`), one printed card Zazi used for all three languages in its January and June 2026 rounds. So this is J20's "copy of Zazi's Afrikaans sheet", and Afrikaans children read the same card as everyone else. The only Afrikaans-shaped sheet (`afrikaans_60`) was a provisional guess that was never approved. (rev 2: AR's item-set ids replace Zazi's form ids.) |
| C21 | The Afrikaans word test is `word_reading@2026.1.af`: the 50 words of Zazi's provisional `afrikaans_words_50`, in Zazi's order, in the same shape and with the same "placeholder list" content status as the English and isiXhosa word tests. | Today an Afrikaans class can only pick the English or isiXhosa word list. A provisional Afrikaans list is better than either; a reviewed list later becomes a new version. (rev 2) |
| C22 | WelaPLUS is not offered to Afrikaans classes until its battery has Afrikaans (it is `en`/`xh` only, `battery/wela_plus_full.ts:49`); the launch shows "Not available in Afrikaans yet". Recorded as a requirement on the WelaPLUS Release 1 work, not built here. | Otherwise its Questions' `language === 'xh' ? XH : EN` would silently give Afrikaans children the English battery. |
| C23 | **One letter-evidence rule**, shared by the mastery loader (`masteryState.js`), the dashboards (`dashboardStats.js`) and the engine's inputs. It is AR §10.3–10.4: evidence from the stored items of the child's letter results the phone may read, from any EA, plus confirmations read with no `user_id` or programme filter. Since #113 (Jim, 2026-10-27) each letter takes its status from the newest result that reached it, so a letter a newer chart does not ask or the child does not reach keeps its earlier evidence; the engine's `loadKnownLetters` follows the same rule (2026-10-28). This design adds one thing: **the letter results must be from the current academic year.** | Letter knowledge belongs to the child. AR Plan 3 downloads the current year only, so without the year bound a phone that kept last year's results and a fresh phone would disagree. Cost: early in a new year, before the baseline assessment, only EA confirmations count. (rev 2: AR now owns the rest of this rule.) |

---

## 3. What exists today (verified on `origin/main` `97e088c`; rev 2 updates the rows #90 changed)

| Need | Masi today |
| --- | --- |
| Letter suggestion engine | None. |
| Letter order | Three different orders: `LETTER_ORDER` (`src/constants/literacyConstants.js:4`, used by the session letter grid and the Session complete receipt sort), `PEDAGOGICAL_ORDERS` (since #90 in `src/utils/assessmentRegistry.js`, keyed `en`/`xh`, built from `egraConstants.js`; read by the tracker, the mastery loader and the dashboards), and the books' order. |
| Language key | Since #90, `languageCodeForHomeLanguage` (`src/utils/assessmentRegistry.js`) returns `en`, `xh`, `zu` or `null`, never English by default. An Afrikaans class gets `null`: the assessment picker asks for English or isiXhosa, and the tracker shows an empty state. Before #90 it was treated as English everywhere. |
| Letter mastery | Union of assessment evidence and EA confirmation (`src/utils/masteryState.js`). Since #90 evidence comes from the stored items of the latest letter result, from any EA (since #113, per letter: the newest result that reached it). Confirmations are still read per EA and programme and stored with labels (`English`, `isiXhosa`) until AR Plan 2; nothing is downloaded until AR Plan 3. |
| Reading level | `children.reading_level` (current, synced) plus `activities.child_reading_levels` and `activities.session_reading_level` snapshots. Ladder: `READING_LEVELS` (`literacyConstants.js:11-19`). |
| Word bank, blends, books | None in the app. |
| Session capture | One long Bold Red form (`src/screens/sessions/LiteracySessionForm.js`), submit-and-go, no draft. Its child picker has a Groups mode that expands a group into its children (`src/components/children/ChildSelector.js`); the group itself is not kept. Leaving asks to discard; the form is lost on discard, process death or force-quit. Validation requires at least one letter (`src/utils/literacySessionValidation.js:4`; issue #54). |
| Group on a session | `sessions.group_id` exists locally and on the server, but the form sends `group_ids: []`, the repository and payload allowlist leave the column out, and two RESTRICTIVE policies pin it (with `state = 'completed'`) on the server (`supabase/migrations/20260529214500_masi_sessions_forward_prep_columns.sql:36-47`). An attendee-level path already exists: `saveSession` writes `session_attendees.group_id = group_ids[0]` (`src/db/repositories/sessionsRepository.js:233`), that column is synced, and the server's attendee policy does not check it. |
| Session history on the phone | Pulled for the EA's own sessions and sessions attended by a child the EA has delivered to (`src/services/sessionHistoryPull.js`), for the active programme and the current academic year only, with a status that says whether the walk finished. So a child's current-year history is available once the pull completes; until then it may be partial (§7.3). |

---

## 4. The rules

### 4.1 One content pack per language

All teaching content is data. The app reads one immutable JSON file per language and version,
bundled in the app (so OTA updates deliver it). Old **release** versions stay bundled while any draft or saved
session references them.

**It is the same file the books project releases for Zazi** (C15): `integrated-sequence-<lang>-v<N>.json`,
in the shape of Zazi's spec §4.1 (`release <lang> v<N>`, books design §5.8). Masi adds what it needs
as **new fields**, which Zazi's app ignores. It is produced by the books project, never edited by hand
in the app repo.

```jsonc
{
  // ── shared with Zazi (books design §5.8; Zazi spec §4.1) ──
  "id": "isixhosa-integrated-v1",
  "language": "isixhosa",                 // the shared file's name (Zazi's key); Masi maps it to its code, xh
  "sound_inventory": ["a","b", "...", "th","ph","kh","ny","hl","bh","nc","dl","ty","sh","tsh"],
  "letter_steps": [
    { "step": 1, "new_letters": ["o","m","l","a"],
      "blends": ["mo","ma","lo","la"],                 // 2-letter syllables (C5)
      "words": ["mo-lo","la-la","ma-ma"],              // ~12 headline words for the step
      "readers": ["xh-int-v1-r01","xh-int-v1-r02"] },
    { "step": 2, "new_letters": ["k","u"], "blends": ["ku","mu","lu","ka","ko"], "words": ["u-ma-ma"], "readers": [] }
    // … every letter step
  ],
  "sound_steps": [ { "step": 13, "new_sounds": ["th"], "words": [], "readers": [] } ],  // unused in v1 (C9)
  "readers": {
    "xh-int-v1-r01": { "title": "Molo, Lolo!", "step": 1, "tricky_words": [],
                       "pages": ["Molo, Lolo!", "Mmm.", "Lolo! Molo!", "Mmm… lala.", "Molo, Malo!"] }
  },

  // ── added for Masi ──
  "channel": "release",                   // release | preview (C12)
  "word_bank": [                          // the FULL approved bank, not only the headline words
    { "text": "molo", "syllables": "mo-lo", "step": 1 },
    { "text": "umama", "syllables": "u-ma-ma", "step": 2 }
  ],
  "reader_details": {                     // per reader: who says each line, for the in-app reader
    "xh-int-v1-r01": {
      "retired": false,
      "speakers": { "malo": { "name": "Malo", "colour": "red" },
                    "lolo": { "name": "Lolo", "colour": "blue" } },
      "page_lines": [ [ { "speaker": "malo", "text": "Molo, Lolo!" } ], [ { "speaker": "lolo", "text": "Mmm." } ] ]
    }
  }
}
```

Rules:

- **The app never invents words.** Every word, syllable and book comes from the pack.
- **Decodability uses the books project's own checker, unchanged.** Copy `checker/core/*.js` and
  `checker/vectors/decodability-v1.json` as `early-reader-books/checker/README.md` directs (into
  `src/utils/decodability/` and `src/constants/contracts/`), pin the vector `version`, and run both
  the vector cases and the `lint_cases` loops in Jest. Check once that Hermes supports
  `String.prototype.normalize` and `\p{L}` (the checker's README asks for this).
- **The shared part is linted by the vendored `lintSequence`** with no changes. A small Masi lint adds:
  every `word_bank` entry decodes at its `step`; every `reader_details` id exists in `readers`; the
  `page_lines` texts joined with `\n` equal that reader's `pages` (so the coloured view and the
  shared text never drift); every speaker used is declared.
- **Unknown or missing pack** → the C10 fallback. Never crash.
- **Sounds come from the checker**, not from the file: the app tokenises each word longest-match
  against `sound_inventory`, exactly as the lint does.

### 4.2 Letter order

- There is **one teaching order per language**, read from that language's pack
  (`letter_steps[].new_letters`, concatenated).
- A single resolver, `getTeachingOrder(languageCode)`, replaces direct reads of `LETTER_ORDER` and
  `PEDAGOGICAL_ORDERS`: the shared tracker loader (`masteryState.js`, so the tracker sheet and
  panel), the session letter grid, the Session complete receipt sort (its route params carry no
  language today, `sessionCompleteView.js`, so the language is added), and the engine.
  Mastery counts that only test membership (e.g. `dashboardStats.js`) do not need the order.
- isiXhosa switches to the books' order (J1). English and Afrikaans use their interim packs until
  their real orders are set (C10).
- `languageCodeForHomeLanguage` returns `af` for Afrikaans classes once AF lands, and `null` for
  unknown ones, never English by default.
- **The language entry is AR's registry.** #90 already separated the tracker from the letter
  sheets: the tracker and mastery use `PEDAGOGICAL_ORDERS[code]` and `LANGUAGE_LABELS[code]` in
  `src/utils/assessmentRegistry.js`, evidence comes from stored result items, and a `null` language
  gives an empty state instead of a crash. That registry is the fixed, pack-independent entry per
  language this design needs (code, label, 26 letters). AF adds `af` to it (§7.5). The tracker,
  mastery reads and writes, and the manual letter picker use it, so they work even when no pack
  loads. A pack (real or interim) adds only the teaching order and the content:
  - EA confirmations are read and written for every language in that registry;
  - assessment evidence is added only where a letter item set exists for that language;
  - mastery counts (`dashboardStats.js` and the "n/26" displays) use the language's own 26 letters.
- **Existing mislabelled rows are not migrated.** Afrikaans confirmations written before #90 carry
  `'English'`. `masi-app-sqlite` has no field users and its practice data is wiped before AR's
  rollout (AR §13), so they go with that wipe rather than being relabelled (relabelling could not
  tell them from genuine English evidence).
- Tests: an Afrikaans class saves and reloads tracker marks with its interim pack, and with no pack
  loaded at all (the registry alone).
- `letter_mastery` rows do not depend on order, so changing the isiXhosa order needs no data
  migration. PRD §6.8 and `teaching-quality-analytics.md` are updated to name the pack as the single
  source.
- Letter item sets keep their own card order (AR §6.1), and assessment evidence for English and
  isiXhosa is unchanged. `languageCodeForHomeLanguage` also chooses which item set a child gets;
  Afrikaans classes get `letter_sounds@2026.2.af` once AF lands (C20).

### 4.3 Which group is "Up next"

The list shows the EA's active groups in their active programme, with current members.

- **Last seen** for a group = the most recent session date on which any current member was present,
  within the history window (§7.3).
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
- **First session** = the history is complete (§7.3), none of the present children has a saved
  lesson-plan session this academic year, and the group-mastered letters do not cover step 1. Then
  suggest **every step-1 letter not yet group-mastered** (usually four, so words are possible on day
  one). This is Zazi rev 4.1's rule: a group that already knows `l` gets `o m a`, not just `o m`. When
  all of step 1 is known, the normal two-letter rule applies.
- **All letters known** = nothing left to suggest (C9).
- **Review letters** = the letters the group knows, plus the step-1 letters, minus today's suggested letters, in teaching order (J24). Letters beyond step 1 are reviewed only once known.

### 4.5 Unlocked letters

`unlocked = letters in steps 1..k ∪ group-mastered letters` (C3), where *k* is the step that
contains the last suggested letter. On the first session *k* = 1. When all letters are known, every
letter step is unlocked.

Blends and books are filtered by **sound set**, not step number: an item is usable when every one of
its sounds (tokenised longest-match against `sound_inventory` by the vendored checker) is unlocked.
In v1 only single-letter sounds can be unlocked, so words containing a multi-letter sound such as
*th* wait for the sound steps (C9).

### 4.6 Blends

- **Tier.** Each present child's current reading level maps to a tier (C4). The default tier is the
  **lowest** among the present children (J7). If another present child is at a higher tier, a
  "Show 3-letter (Lulu is ahead)" control switches the suggestions to that tier.
- **Pool.** Items in the tier whose sounds are all unlocked: the steps' `blends` (syllables) for the
  2-letter tier, otherwise `word_bank` entries of that letter count (letters counted after
  normalising, so hyphens do not count).
- **Six suggestions** (J16), ranked:
  1. items containing today's suggested letters;
  2. items no present child practised in their last 3 sessions;
  3. a rotation that shifts by one position per local day per group (the seed Zazi's
     `blendingAdvice.js` uses), so the list changes day to day.
- **"+ more"** opens every item in the pool for the chosen tier, ticked items first.
- A tier with fewer than six items is topped up from the nearest lower tier (C4).
- **Assessment words are ordinary words** (J19). The engine never reads the assessment word lists:
  no filter, no boost, no label. Rotating an assessment's words never touches the word bank or the
  packs.

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
| `first_session` | §4.4 | the step-1 letters not yet known (usually four) |
| `ok` | normal | two letters |
| `all_letters_known` | nothing left | "All letters known" |
| `no_pack` | no pack loads for the language (all three have at least an interim pack, C10) | "Choose the letters you teach" (the language's alphabet, §4.2) |
| `no_children` | everyone marked absent | nothing; Save is blocked |

---

## 5. Screens

All screens use the Bold Red components that merged in #81–#87: `StepHeader`, `SelectableRow`,
`LetterToggleGrid`/`LetterToggleTile`, `StickyActionFooter`, `RequirementSummary`, `ChildProgressBlock`,
`ConfirmSheet` and the shared `BottomSheet`. Bottom sheets, not dialogs. Copy is for low-training EAs:
short, concrete, no workflow states. `LetterToggleTile` is a fixed square (at most 56px, text capped at
1.2x) built for one letter, so blends such as *u-ma-ma* need a new, wider tile in the same style.

### 5.1 Who are you teaching?

Opened by "+ Record", after today's gates (active programme, then the clock-in sheet) and today's
job-title routing (C17).

- Red header, title "Who are you teaching?".
- **Up next** card: children's names (large), "Not seen since Mon · letters k u", and a
  **Start lesson** button.
- **Other groups**: one row per group with names, last seen and next letters. Tapping a row opens
  its Lesson screen.
- **No groups, or children in no group** (J18): a **+ Make a group** row (pick the children, done;
  it uses today's group creation and records the class when the children share one, C18), and a
  "Not in a group yet" list with **Put in a group** on each child. An EA with no groups sees only
  these.
- If a lesson is already in progress, "+ Record" goes straight back to it after the same gates (C7).

### 5.2 Lesson screen

One scrolling screen, kept open for the whole session.

- **Header**: children's names, grade, language, last seen. The class and language come from C18;
  when the group's children are in different classes, the header asks for the class once, before
  suggestions show.
- **Who's here**: one chip per child, all present by default; tap to mark absent. "+ Add a child"
  adds a child from another group for today only (an attendance difference, never a membership
  change).
- **1 · Letters · 15 min**: the suggested letters as tiles, **not** pre-ticked, plus "+" for any other
  letter. Review letters as text below.
- **2 · Blending · 15 min · 2-letter**: six suggested items as (wide) tiles, not pre-ticked, shown with
  syllable hyphens when the pack has them (*ma-ma*). "+ more" opens the pool sheet. "Show 3-letter
  (Lulu is ahead)" when §4.6 applies.
- **3 · Pair reading · 5 min**: the suggested book with a cover tile, a **Read** tick, **Open in app**
  and **Other book**. Hidden for ECD classes (C8).
- **Footer**: "Wrap up →".
- The plan is recomputed when attendance changes, until the EA ticks anything (C1), and only on the
  lesson's own date (C14). After that it is fixed for this lesson.
- Every change is saved to the local lesson draft (§7.2).

### 5.3 Wrap up

- Heading: "Who knows **k u** without help?" with "Teaching it today doesn't count." (today's letters
  are the letters the EA ticked; if none were ticked, this section is skipped).
- Per present child: one chip per ticked letter (assessment-mastered letters show locked), a
  "No one new yet" button, the child's reading-level pill (opens the existing ladder sheet), and
  "7/26 ›" opening the full `LetterTrackerBottomSheet` in the language's teaching order.
- **Date**: the lesson's date: today for a new lesson, the day it started for a resumed one (shown
  as "Started Mon 19 Oct"). A past date can be chosen (the only way to log a past lesson, as today);
  changing the date drops the plan (C14).
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
  while a draft exists. That is a new item kind with the **highest** priority, inside the existing
  limit of two items (`src/utils/homeAttention.js:7`); it opens the Lesson screen with the draft's
  parameters (today `openItem` navigates by route name only, `HomeScreen.js:133`).
- **Session complete**: the receipt adds Blends and Book, and sorts letters in the lesson's language
  order.
- **Session History**: each card adds the number of blends and the book title.

---

## 6. What gets saved

Everything new goes inside `sessions.activities`, which the server passes through untouched
(`CONTEXT.md`: programme-specific session data lives in `activities`). No new synced table.

```jsonc
{
  // existing keys, same meaning
  "letters_focused": ["k"],                         // may now be empty (closes #54)
  "session_reading_level": "2 Letter Blends",       // highest tier among the blends ticked; null if none (C11)
  "child_reading_levels": { "<child_id>": "3 Letter Blends" },
  "comments": "…",

  // new
  "lesson": {
    "version": 1,
    "pack_id": "isixhosa-integrated-v1",
    "language": "xh",
    "plan": {                                       // frozen when the plan is fixed (§5.2), never recomputed on retry;
                                                    // null when the lesson date differs from made_on (C14),
                                                    // with "plan_reason": "past_date"
      "engine_version": 1,
      "made_on": "2026-10-19",
      "reason": "ok",
      "history_complete": true,
      "mastery_complete": true,                     // B1's completeness rule (§7.6)
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
    "blend_tier_shown": "2 Letter Blends",          // the tier on screen at save ("show higher" changes it)
    "blends_done": ["ku","mu"],                     // pack item texts
    "books_read": [ { "id": "xh-int-v1-r03", "how": "printed" } ],
    "tracker_check": "marked"                       // marked | none | null (skipped)
  }
}
```

- `lesson` is a nested key, so it never collides with 1000 Stories' top-level `books_read` count.
- Attendees: only present children are written, as today (C13). `sessions.state` stays
  `'completed'`; drafts live in their own local table (§7.2), not in `sessions.state`.
- Tracker marks and reading-level changes are written as today (`letter_mastery` rows and
  `children.reading_level`) in the same SQLite transaction as the session and its outbox row.
- `sessions.group_id` carries the chosen group once track B2 lands (§7.1).
- `sessions.class_id` is the lesson's class (C18), not the first child's class as today.

---

## 7. Data and sync

### 7.1 Group on the session (track B2)

The session must carry the group (J3), and `group-session-workflow.md` forbids writing a local
`group_id` that the server then discards. So the full contract ships before or with the Lesson
screen:

- the workflow spec's prerequisite 3: server authorization for a non-null `sessions.group_id`
  (the EA holds or **has held** an assignment to that group in that programme, C19), replacing the two
  RESTRICTIVE pins in the same migration **while keeping their `state = 'completed'` guard**;
- prerequisite 1 is largely built: `GRANT_SUBJECTS` already has `membershipMediatedChild` entries
  (`src/services/offlineSync.js:256-287`), so the ROADMAP tripwire is stale. It has **no `sessions`
  entry**, so this slice adds group-grant evidence for a session's group (otherwise a session whose
  only valid grant is a pending group assignment can be marked terminal). That evidence follows C19:
  an owed insert of the EA's assignment to that group counts **even when the local assignment has
  since ended**. Today's check requires `unassigned_at is null` (`src/services/offlineSync.js:425-430`).
  Other tables keep active-only evidence;
- prerequisite 2 (collision-proof grouping versions and display numbers) stays deferred (C16);
- `group_id` added to `SESSION_COLUMNS` and `SERVER_COLUMNS`, removed from `INTENTIONALLY_UNSYNCED`;
  `sessions → groups` in `TABLE_DEPENDENCIES` and `PARENT_FK_COLUMNS`;
- **the history pull keeps a session's group id even when that group is not on the phone.** Do
  **not** copy the attendee mapping: `saveHistoryPage` turns an attendee's group into `null` when the
  group row is missing locally (`src/db/repositories/sessionsRepository.js:255-258, 298-303`), and the
  roster pull only fetches groups currently assigned to this EA (`src/services/preloadedChildData.js:327-337`).
  After a handover, a new phone legitimately holds a child's old sessions without their group. B2
  defines a historical group reference that keeps the id without granting roster or edit access
  (the local `sessions.group_id → groups` foreign key from migration v3 is part of that decision).
  Test: a fresh phone whose EA never held the historical group keeps the session's group id;
- `session_attendees.group_id`: the session's group for every attendee, including a child added
  from another group for the day (their own membership is unchanged, and the session's group says
  which block they joined). The server's attendee policy gains the same historical group check.
  Its existing child check (`current_user_can_write_for_child`, active access) is unchanged: a
  child reachable only through a deleted group was already refused before this feature, and Core
  Literacy children normally have a direct assignment;
- **deleting a group never strands a saved lesson.** Test: save a lesson offline, delete its group,
  reconnect; the session and attendees upload with the group id. Repeat with the family
  half-uploaded (session sent, attendees pending) and with Head Office ending the assignment while
  the phone is offline. Repeat once more with the assignment's own insert failing and backing off
  over several sync passes: the lesson converges with no manual retry. If grouping work later lets a
  group change EA, the old holder's ended
  assignment must survive (today there is one row per group, `groupEaAssignmentDomainId`), or this
  check moves to a history table;
- the column stays **nullable**: older builds keep sending none.

Its own plan, following `rls-sync-contract-map.md`, with real-SQLite and disposable-Postgres RLS tests.

### 7.2 Lesson drafts (local only)

- A local SQLite table holds the in-progress lesson (group, attendance, plan, ticks, tracker and
  reading-level edits, notes). It is not synced and lives in the EA's own database (ADR-0008).
- One draft per EA at a time (C7). Starting another group while one exists asks to finish or
  discard the first.
- A draft is created on the first change, not when the screen opens.
- **The draft keeps its lesson context**: class (C18), language, pack id and lesson date (the day it
  started). Resuming on a later day changes none of them (C14).
- **Tracker marks keep the time they were made.** A draft can be resumed days later, and under the
  D1 rule (ROADMAP §1, "the most recently *made* correction wins") the correction time decides
  conflicts. So each pending mark or unmark is stored in the draft with the time the EA tapped it
  **and the language it was made in**. Both are carried unchanged into the mastery write and every
  retry; nothing re-derives the language at save. AR Plan 2's `setLetterMastery` takes the tap time
  as its correction time (§7.6, ask 1). Today's helper stamps
  all marks with the submit time (`src/services/literacySessionPersistence.js:96-135`); the new save
  path must not. Test: a Monday draft saved on Wednesday does not overwrite another EA's Tuesday
  correction.
- **Reading levels: a snapshot is not an edit.** The draft stores only the reading levels the EA
  actually changed. At save:
  - `children.reading_level` is written **only** for children whose level the EA changed;
  - `activities.child_reading_levels` records each present child's level as it stands at save time
    (the current level, or the EA's change).

  Today's form pre-fills every child's level and writes any value that differs from the database
  (`LiteracySessionForm.js:270-279`, `literacySessionPersistence.js:56-70`). Copied into a durable
  draft, that would let a stale draft overwrite a newer level pulled from another phone. Test: saving
  an untouched old draft leaves a newer pulled reading level in place.
- Save runs one transaction: session row, attendee rows, mastery and reading-level writes, outbox
  rows, and deleting the draft. A failed save keeps the draft and the same session id.
- The forward-prep `sessions.state` values (`in_progress`, `paused`, `discarded`) stay unused: a
  draft never becomes a `sessions` row until it is saved as `completed`.
- The draft survives force-quit, process death, offline restart and an app upgrade (local migrations
  stay additive).

### 7.3 Inputs the engine needs, and where they come from

| Input | Source |
| --- | --- |
| Group list and members | `groups`, `child_group_memberships`, `group_ea_assignments` (already pulled) |
| Class, language, grade | the lesson's class (C18): its `home_language` via `languageCodeForHomeLanguage`, and its grade for C8 |
| Letter mastery per child | `masteryState` union (C23). **Complete only after AR Plans 2–3**, which deliver both halves: EA confirmations (re-key, D1, download) **and** other EAs' letter results with their items (`masteryState` reads local SQLite only, and no assessment pull exists yet). Completeness: §7.6 |
| Reading level per child | `children.reading_level` |
| Each child's past lessons | `session_attendees` + `sessions.activities` (already pulled) |
| How complete that history is | the session-history pull state, read through the predicate below |
| Content | the bundled pack |

The engine is a **pure module**: it receives these as plain data and returns the plan. It never reads
SQLite or React state, so it is tested with vectors and can later be ported to the server unchanged.

**History windows.** The session history pull is scoped to the active programme and bounded to the
current academic year (`src/services/sessionHistoryPull.js:84-101`). So every history rule ("last
seen", "first session", "last 3 sessions", "last 5 sessions") uses only that programme's sessions in
the current academic year, ordered by `session_date` then `created_at`, counted per child. A phone
that kept older sessions ignores them, so a fresh phone and an old phone give the same advice.

**Complete history** is checked per lesson, when the plan is computed. It is not the Sync screen's
"Up to date" label, which ignores the year and the children covered
(`src/utils/syncStatusPresenter.js:106-114`). History is complete only when the stored
session-history state for the active programme:
- has finished a walk with no failure since;
- has the current academic year's `windowStart` (a walk from last year does not count; the pull
  resets its state only when it next runs, `sessionHistoryPull.js:98`); and
- covered every present child (each is in the walk's covered set, `rescanChildIds`).

A child the walk cannot cover (the known gap below) keeps history incomplete for any lesson they
attend. Tests: year rollover before the next pull; a child newly assigned between walks.

**Incomplete history.** When history is not complete (fresh install, interrupted pull, new year,
new child), "no lessons on record" may simply mean "not downloaded yet". Then:
- `first_session` is never inferred from missing history (only from complete history);
- Up next and recency still run on what the phone has, and the picker and Lesson screen show a small
  note: "Still downloading past lessons. Suggestions may repeat."
- nothing is blocked.

The same kind of note, "Still downloading what children know. Suggestions may repeat.", shows while
mastery inputs are incomplete (§7.6). Letters are still suggested from what the phone has, and the
plan records `mastery_complete: false`.

**Not a gap (J23):** the history pull's delivery arm follows `child_ea_assignments`
(`supabase/migrations/20260925120000_session_history_family_delta.sql:110-115`), not group
assignment. That covers every group member, because a child in an EA's group is always one of that
EA's own children. B2 records this as an invariant in the contract map, so a future Head Office
seed that breaks it is caught in review.

### 7.4 Reconciling `group-session-workflow.md`

Three of its locked rules read differently here; this design keeps their intent:

- *"The latest letters shown for a group come from that group's latest literacy session."* Group
  Detail's "latest letters" display is not part of this design and keeps that rule. The picker's
  "next letters" is advice computed from the children (J3), not a record of what was taught.
- *"Every session carries a `group_id` uniformly"* and `CONTEXT.md`'s "planned NOT NULL": every
  session from a new build carries a group. The server column stays nullable only so installed older
  builds keep working.
- *"The group-first shell is driven by programme delivery mode, not job title."* v1 keeps today's
  job-title routing behind "+ Record" (C17); moving to delivery mode remains separate work.

The workflow doc is updated in the same branch to say so.

### 7.5 Afrikaans support (track AF)

EAs can choose Afrikaans when they create a class (`src/screens/children/CreateClassScreen.js`).
Before #90 the app treated it as English everywhere. #90 stopped that: `languageCodeForHomeLanguage`
returns `null` for Afrikaans, so the assessment picker asks for English or isiXhosa and the tracker
shows an empty state. AF makes Afrikaans a supported language in AR's model, as one slice.
(Rev 2 replaces rev 1's port of Zazi's language key and letter forms, which #90 made unnecessary.)

- **The language entry**, in `src/utils/assessmentRegistry.js`:
  - `languageCodeForHomeLanguage` returns `af` for `afrikaans` (trimmed, any case);
  - `LANGUAGE_LABELS.af = 'Afrikaans'`;
  - `PEDAGOGICAL_ORDERS.af` = Zazi's provisional `AFRIKAANS_PEDAGOGICAL_ORDER`, copied exactly
    and frozen (C10).

  Callers already handle `null`, and keep doing so for unknown languages.
- **Content, copied exactly and frozen:**
  - `letter_sounds@2026.2.af`: `GRID_A_ROWS` with the same stop rule (C20);
  - `word_reading@2026.1.af`: the 50 words of Zazi's `afrikaans_words_50` (C21);
  - both in `CURRENT_ITEM_SETS`, each with a content-status entry: Grid A's typeface note for
    letters, and "placeholder list" for words.

  AR's rule applies: a published item set is never edited, and a change is a new version.
- **Each tracker change keeps the language it was made in.**
  - Today the old form takes one language from the first selected child and applies it to every
    pending change at save (`LiteracySessionForm.js`, `trackerLanguageCode`;
    `literacySessionPersistence.js`).
  - Once Afrikaans is supported, a session that mixes an Afrikaans and an English class could
    relabel marks.
  - AF records `{ mastered, languageCode, madeAt }` for each pending change when it is tapped, and
    saves the language unchanged. `madeAt` is recorded now. It becomes the correction time once
    AR Plan 2 accepts one (§7.6, ask 1). The lesson draft uses the same shape (§7.2).
  - Test: mark letters in an Afrikaans child's tracker, then change which child is selected first,
    and save. The marks stay Afrikaans.
- **No silent drops.** A pending change whose language has no registry entry fails the save
  loudly. Today `literacySessionPersistence.js` skips it silently when `PEDAGOGICAL_ORDERS` has no
  entry.
- **Confirmations stored before AR Plan 2** use the label `Afrikaans`, as `English` and `isiXhosa`
  do today. AR Plan 2's re-key maps labels to codes, and must include `Afrikaans → af` (§7.6, ask 2).
- **WelaPLUS** stays English and isiXhosa (C22). Its host (WelaPLUS Plan 3) shows "Not available
  in Afrikaans yet" for an Afrikaans class. This is recorded on that work, not built here.
- **Stored data.** No migration. Results taken before #90 go with AR's practice-data wipe (AR §13).
- **Tests.**
  - Language resolution for every spelling, and `null` for unknown and missing.
  - Item-set validation over the new sets.
  - An Afrikaans class starts the Afrikaans letter and word tests without asking.
  - Real-SQLite Afrikaans tracker save and reload.
  - A class with no language still asks for one, and the tracker still shows its empty state.
- **Device check.**
  - Figtree renders ê, ë and ô, which the real Afrikaans pack will use.
  - Capital I and lower-case l are told apart on the letter test. Grid A has both; this is
    already a content-status note for English and isiXhosa.
- **Not copied:** Zazi's Afrikaans blend bank and vectors. The app never invents words (§4.1), so
  the blend bank goes to the books project as a source for the Afrikaans pack.

### 7.6 Mastery inputs (track B1): the assessment-results Plans 2–3

The engine needs every child's letter evidence and confirmations on the phone, whoever recorded
them. AR is the approved design for that, so this design no longer specifies it. (Rev 1's B1-0 to
B1-5 are replaced.)

| What B1 needed | Where it is |
| --- | --- |
| Server-stamped `updated_at` on insert (rev 1's B1-0) | AR §8.4, built in #90 |
| All-or-nothing assessment upload; submitted results immutable | AR §8.1–8.5, built in #90 |
| One confirmation per child, letter and language; the latest correction wins; the winner returned to the phone | AR Plan 2 (§10.1–10.2) |
| Confirmations read with no `user_id` or programme filter | AR Plan 2 (§10.3) |
| Other EAs' letter results downloaded with their items, and confirmations downloaded | AR Plan 3 (§11), including ADR-0005's class arm and history-reference children |
| Completeness and re-walks | AR Plan 3 (§11.3, §11.5) |

**What the lesson plan asks of AR Plans 2–3.** Each ask is small:

1. **Plan 2: a caller-supplied correction time.**
   - `setLetterMastery` stamps `changed_at = now` (AR §10.2).
   - A lesson draft can be saved days after its marks were made (§7.2), and D1 orders by when a
     correction was *made*.
   - So `setLetterMastery` accepts an optional `changedAt`, the tap time. It is never later than
     now on the phone, and the server clamps it as AR already specifies.
   - The old form's tracker passes `madeAt` too (§7.5).
   - Test: a Monday mark saved on Wednesday loses to another EA's Tuesday correction.
2. **Plan 2: map `Afrikaans` to `af`** in the hosted and local re-key, alongside `English` and
   `isiXhosa`.
3. **Plan 3: a per-child completeness answer.**
   - AR's Sync status says whether all walks are complete. The engine needs the answer for the
     children in one lesson.
   - `masteryInputsComplete({ childIds })` is true when the assessment walk and the mastery walk
     have each finished with no failure since, the assessment walk is in the current academic
     year, and every one of those children is covered. This is the same rule as §7.3.
   - A child in a class the EA holds no class assignment for is never covered by the assessment
     walk (AR §11.1 gives delivery-only EAs no assessment reads), so it stays incomplete. Core
     Literacy EAs normally hold their classes.
4. **Plan 2 or 3: C23's year bound.** The letter result used as evidence is the latest one from
   the current academic year.
5. **Plan 3: Zazi's operational lessons that AR does not already have.** AR §11.3 already has the
   deadline, the run budget, failure memory, completeness and re-walks. These are missing:
   - a server switch per EA, to turn a download off without a new build;
   - trigger-budget tests that name every caller of the pull and how often it runs
     (ZZ-BUG-20261004-001: a caller that ran on every save silently became a full re-download);
   - an A03s gate that starts a lesson mid-download (with today's form until the Lesson screen
     exists).

   With skip-unchanged rows and prepared statements, Zazi's first download for a busy account
   went from 300.8 s to 46.0 s on a Galaxy A03s. AR's insert-or-ignore families already get most
   of that gain.

---

## 8. Not in v1

- Picture pages in the in-app reader (J15 later phase; needs approved art and a download-once store).
- Sound steps after the 26 letters, and the Level 8+ transition (C9).
- Any server report on plan versus what was taught (the data is captured from day one).
- A session timer (not needed: no clock in Masi's session).
- Editing a saved session.
- One-on-one tutoring as its own mode (J18). A group of one child already works with these rules.
- Other programmes (Numeracy, 1000 Stories). The engine is literacy-specific; the group picker and
  draft are written so other programmes can reuse them later.

---

## 9. Build order

Three tracks run in parallel (J12). Implementation goes through Codex (`gpt-5.6-sol`) per
`AGENTS.md`; Claude reviews each diff and runs the tests.

| Slice | What | Depends on | Ships as |
| --- | --- | --- | --- |
| **AF** Afrikaans support | §7.5, in one slice | — | visible: Afrikaans classes get the Afrikaans letter and word tests, order and tracker |
| **A1** Content pack contract | Vendored checker + vectors (as its README directs); pack loader and registry; Masi lint on top of the shared lint; interim letters-only release packs for isiXhosa, English and Afrikaans (C10); an isiXhosa preview test pack made by a script from the books repo's candidates | — | inert |
| **A2** Letter order | `getTeachingOrder` reads every order from packs (real or interim); isiXhosa switches to the books' order in the tracker, letter grid and receipt | A1, AF | visible: new isiXhosa order |
| **A3** Engine | Pure `lessonPlan` module: up next, letters, unlocked set, blends, book, reasons; TDD vectors | A1 | inert |
| **B1** Mastery inputs complete | AR Plans 2–3, with the lesson plan's asks (§7.6). #90 already built the server stamps and the all-or-nothing upload. AR §13 owns the rollout (practice-data wipe, hosted migration, fresh install), which replaces rev 1's cutover text. Fresh-device test: another EA's letter result alone supplies a child's mastered letters | — (AR's own plans) | gate for field testing |
| **B2** Group on the session | §7.1 | — (own plan) | gate for the Lesson screen release |
| **C1** Lesson draft | §7.2 local table, resume, Home attention card | — | inert until C3 |
| **C2–C3** Picker, Lesson screen, Wrap up, save path | §5.1–5.3, §6; replaces `LiteracySessionForm` behind today's route (C17) | A2, A3, C1, B2 | the feature |
| **C4** In-app reader + Other book | §5.4, §4.7 | A1 | with C3 |
| **C5** History and receipt | §5.5 | C3 | with C3 |
| **D** Content | Real packs for isiXhosa, then English and Afrikaans (books project) | books project | data swap, no code |

Critical path to field testing: **AR Plans 2–3 (B1), B2, and approved isiXhosa content released in
the shared file**, not the engine. AF is small and ships before any pilot device is provisioned, so
Afrikaans classes are assessed and tracked in Afrikaans from the first pilot build.

---

## 10. Testing and gates

- **TDD** with the repo's `tdd` skill, red-green-refactor in vertical slices.
- **Engine vectors** (JSON): first session; pair with one child absent; out-of-order mastery;
  all letters known; unlocked set per state; tier mapping and "show higher" for each ladder level;
  top-up of a thin tier; book choice with recency; retired book; no pack; Afrikaans key; a
  classless group, a mixed-class group and a child added from another class (C18); history complete
  vs last year's window vs an uncovered child (§7.3); `session_reading_level` for no blends, top-up
  items only, mixed tiers and "show higher" (C11); a Monday draft saved on Wednesday keeps its plan,
  and a changed date drops it (C14).
- **Checker vectors** from the books project run unchanged.
- **Real SQLite** (`better-sqlite3`) for the draft table, the save transaction and force-quit
  recovery; **disposable Postgres** RLS tests for `sessions.group_id` (B2), including save offline → delete the
  group → reconnect (§7.1).
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
- `documentation/open-decisions-backlog.md`, `documentation/ROADMAP.md` (including the stale
  `GRANT_SUBJECTS` tripwire), `documentation/build-log.md`.
- `documentation/rls-sync-contract-map.md` for B2 (AR Plans 2–3 update their own rows). Also fix its
  CAP-004 note that SQLite is shared by every EA; ADR-0008 made it per EA.
- For AF:
  - the item sets' content-status entries (`src/assessment-questions/itemsets/contentStatus.ts`),
    with provenance (Grid A = Zazi's `afrikaans_60_v2`; words from Zazi's provisional
    `afrikaans_words_50`). `documentation/egra_letter_sets.md` is a pointer to the item-set files
    since #90 (AR §16);
  - `documentation/assessment-score-bands-config.md`: Afrikaans uses the `'*'` row, whose cut-offs
    were set for other languages;
  - `PRD.md` §6.7;
  - `documentation/ROADMAP.md`'s word-list item: three languages, not two;
  - the WelaPLUS Release 1 / Plan 3 docs: C22's "Not available in Afrikaans yet".
- `documentation/teaching-quality-analytics.md` (canonical order, new `lesson` keys; Check 2 skips
  sessions whose `session_reading_level` is null, meaning no blending was recorded).
- An ADR for "one teaching order per language, from the content pack" and for "advice from children,
  record with the group" (via `grill-with-docs`).

---

## 12. Left to the builder

- File and module layout for the engine and pack registry (suggestion: `src/lessonPlan/`). The
  vendored checker's location is fixed by its README.
- The draft table's exact columns and the session id lifecycle, within §7.2.
- Component breakdown of the Lesson screen and sheets, within the Bold Red system.
- Exact copy beyond what is quoted here, following `design-system.md` and the ux-copy rules.
- How the rotation seed is computed, as long as it is stable per group per local day.

---

## 13. Asks of the early reader books project

The app needs these in the pack before field testing:

1. The planned release step (`release <lang> v<N>`, books design §5.8), plus the Masi fields of
   §4.1 (`channel`, `word_bank`, `reader_details`), which Zazi's app ignores.
2. **Speakers and a colour per character** in `reader_details`, for the in-app reader (the shared
   `pages` drop them).
3. The **full approved word bank** with syllables, not only the ~12 headline words per step, so
   "+ more" has enough items.
4. Per-step 2-letter syllables (already in its design).
5. A `retired` flag per book.
6. **Text before art.** Today the release gathers only `art-approved` books. The app's text pages
   need a book as soon as its language is approved, so the release needs a text-ready status (or the
   app's file includes language-approved books whose art is still pending).
7. A `preview` file built from candidate words, for developer builds only (C12).
8. English and Afrikaans packs, with their own orders. Letters and **contiguous** multi-letter
   sounds (*sh*, *ch*, *ee*, *oo*) work with today's checker. **Split patterns such as English *a_e*
   do not**: the checker matches contiguous strings only (`checker/core/sounds.js:43-47`), so with
   *a_e* in the inventory it still reads *make* as m-a-k-e at the letters' step. Supporting split
   patterns needs a new, versioned checker (and new vectors) in both repos. Until then, English and
   Afrikaans packs use letters and contiguous sounds only, and the app's sound unlocking (§4.5)
   stays single-letter in v1.
9. Later: page images per book for the picture-page phase, and a neutral or per-programme edition
   field for cover branding (the current cover reads "Zazi iZandi · Masinyusane").

---

## 14. Open questions

None open. Jim answered rev 1's Q1–Q3 (J18–J20) and rev 2's three questions (J21–J23) on
2026-10-20.

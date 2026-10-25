# Assessment capture style: one clean, spaced look for every Question

**Date:** 2026-10-21
**Status:** Approved by Jim 2026-10-21
**Status note (2026-10-25):** The marking parts of this spec (the §2 non-goal on marking, §3.1–3.2, the §6 toggle and last-attempted patterns, the free-toggle tile rule and the frozen `Result` output) are amended by `2026-10-25-step-by-step-capture-design.md`. Every Question except the Story Writing rubric moves to step-by-step marking. The look, paging and spacing decisions here still stand.
**Branch:** `design/assessment-capture-style` (from `main` at f27b347, after PR #90)
**Mockups (approved):** `design/mockups-2026-10-assessment-capture/` (see its README)
**Amends:** `2026-10-19-assessment-results-and-letter-test-design.md` (grid rows) and
`2026-10-14-welaplus-release-1-design.md` (D1, the Q1 and Q6 rows, §9.1). See §9.

## 1. Why

Jim tested the new step-by-step letter test and word test on an iPhone (iOS build 15). He called
the styling "a huge styling downgrade". The screens are "squished together black and white, which
is terrible UX". He wants the clean, spaced, properly coloured version back for **every**
assessment Question, including the WelaPLUS Questions that ship next.

What went wrong:

- PR #90 moved capture into the Question package (`src/assessment-questions/`) and deleted the old
  capture stack (commit 094c9e1). The old stack had rounded, separated tiles, coloured marks, pages
  and a timer bar. The package ported the behaviour, with tests, but not the look. No test pinned
  the look, so nothing failed when it was lost.
- The flush, one-row-per-card-row grid was a deliberate spec rule ("rows never re-wrap"). On a
  360 dp phone a 10-letter card row gives cells about 27 dp wide. On the word test the rows wrap
  raggedly and run off the screen.
- The other nine WelaPLUS Questions are prototype shells. Their intros, confirm screens, Finish and
  Skip controls are unstyled `Text` and `Pressable` elements. They show three different "selected"
  looks, and no Question sets a font.

The reference is the Zazi iZandi app's test screen (Jim's "Before" screenshots, `zazi-izandi-app`
`main`). Masi's deleted stack had the same layout in Masi tokens.

## 2. Goals, non-goals, anti-goals

**Goals**

1. Every one of the 11 Questions renders with one shared visual system:
   - rounded, separated tiles;
   - solid colour for marks;
   - an ink outline on the current item;
   - one button language;
   - one font for test content (§5).
2. The letter test and the word test match the approved mockups at 360 dp (A03) and on the iPhone.
3. Long tests page by whole card rows (§4). Nothing runs off the screen, and tiles are large.
4. The style is structural: shared primitives in the package, which every Question uses. A guard
   test makes it hard for a Question to bring back its own ad-hoc styling.
5. Every Question can be seen on a device before the WelaPLUS host screen exists (§7).

**Non-goals**

- No change to marking behaviour, scoring, the stop rule, timing, result shapes, persistence or
  upload. Saved data is unchanged.
- No redesign of Home or the other tabs, the results screens, or history. Only the capture screens
  and their sheets are in scope.
- No WelaPLUS battery host screen. That is Plan 3. This work supplies the look it will use.
- No reprint or re-layout of the printed cards. Jim is open to cards that match the phone later
  ("screens stacked", for example words in 2 columns × 20 rows). That is a separate decision and a
  new content version.

**Anti-goals (a failure even if it works)**

- Any capture screen still reads as a flush black-and-white table.
- Red means anything other than "incorrect" on a capture screen. The only exception is the End
  control, which is a destructive action.
- Capital I and lowercase l look the same.
- A Question restyled by copying style blocks, rather than by using the shared primitives.
- A behaviour change slipped in under "presentation". The frozen modules in §6 change only where §6
  allows.

## 3. The look (decided)

### 3.1 Colour: option C, "Masi palette, ink accent"

All values come from package tokens (`src/assessment-questions/theme/tokens.ts`; colour literals are
allowed only there, enforced by `rawHexGuard`).

| Element | Token | Value |
|---|---|---|
| Screen background | `canvas` | `#F8F5F4` |
| Tile, not yet marked | `surface` fill, 1 px `line` border | `#FFFFFF` / `#ECE5E4` |
| Tile, correct | solid `marked` fill and border, white text | `#2E7D27` (white text ≈ 5.15:1) |
| Tile, incorrect | solid `error` fill and border, white text | `#B3261E` (≈ 6.54:1) |
| Tile, current | white tile, **3 px `ink` outline**. The current tile is always unmarked: Back clears the previous decision (frozen `stepByStep` behaviour), so it becomes current with no fill. Every *other* tile keeps its mark's fill, so after Back the EA still sees everything marked so far. Today only the current tile is highlighted, and that is the fix. | `#221A1B` |
| Tile, not reached (results views, last-attempted sheet) | `notReached` text on `surface` | `#B3A8A8` |
| Correct button | `marked` fill, white label, ✓ icon | |
| Incorrect button | `error` fill, white label, ✕ icon | |
| Back | outlined, 1.5 px `ink` border, `ink` label, ← icon, full width | |
| End | centred text control in `primaryPressed`; opens the existing End sheet | `#C81F3E` |
| Timer bar fill | `marked` while more than 10 s remain; `warning` (amber) for the last 10 s | |
| Page dots | active `ink`, inactive `line`-tint | |

The old Zazi/Masi green `#3FA535` with white text fails contrast (3.16:1) and must not return.

Token housekeeping, done as part of this work:

- Add `warning` (`#B26A00`, the host's amber) and a `tile` radius token.
- The tokens header claims the tokens mirror the host. Either correct `primary` (`#E72D4D`, the
  host's red500; white small text on it fails 4.5:1) or document why the package differs. Use
  `primaryPressed` wherever white text sits on red.

### 3.2 Screen layout, top to bottom (letter and word tests)

1. **Host header (slim).** Close (✕), the test name, and "child · language" in caption size. This
   is owned by `StandaloneTestScreen.js` (and later by the battery host). It stays under the
   design-system guard.
2. **Timer row.** A rounded bar (about 12–14 dp, track `line`) plus a seconds label such as "57s"
   (`tabular-nums`). It is shown only for timed Questions.
3. **Page label and dots**, for example **"Card rows 1–2 · page 1 of 3"**, with one dot per page.
   It is shown only when there is more than one page.
4. **Tile grid.** Centred in the space left between the page label and the action area. Gaps of
   about 10 dp, tile radius about 10 dp.
5. **Action area.** A white panel with a 1 px `line` top border, pinned to the bottom with a
   safe-area inset. Use the Android 3-button-navigation allowance that `feat/bold-red-polish` found
   (`insets.bottom + 11`) if it is on `main` when this is built. It contains:
   - Correct ✓ and Incorrect ✕ side by side (pill, at least 52 dp high);
   - then ← Back at full width;
   - then the End control, centred.

The "0 / 60" counter is removed. The intro (instructions + Start), the stop card and the End sheet
keep their behaviour and copy, and are restyled onto the shared primitives. They stay bottom sheets
or overlays, not native dialogs.

**Copy (builder note).** The mockups show "End Assessment". Keep Masi's current copy, **"End test"**,
and its sentence case. Many tests pin these strings: `Start`, `Finish`, `Yes, finish`,
`Skip question`, `End test`, `Back`, `Undo last mark`, `Save result`. Change copy only on purpose.

### 3.3 Sizes at 360 dp (the A03; reference only)

- Letters: 5 columns. Tiles about 58 dp wide and about 60 dp high, letter about 30 sp.
- Words: 2 columns. Tiles about 160 × 58 dp, word about 21 sp.
- Long words (`ibhulukhwe`) must fit without truncation. A per-tile shrink-to-fit with a floor is
  acceptable; ellipsis is not.

The builder derives exact sizes so that a full page fits without scrolling on the A03 (360 × ~740 dp
usable) and on the iPhone. A page must never scroll.

**OS text size (my call).**
- Page capacities stay fixed (20 letters, 10 words), so pagination never depends on device
  settings.
- Item text in tiles caps its accessibility scaling with `maxFontSizeMultiplier` (about 1.2) and
  shrinks to fit inside the tile.
- Controls and labels follow the app's existing scaling behaviour.
- Check one large-text setting at the device gate.

## 4. Paging: each page shows whole card rows (decided)

This supersedes "the phone's marking grid is that sheet, row for row" and "rows never re-wrap"
(§9). The goal behind those rules, that the EA never loses their place against the child's card,
is kept in a different way:

- **A page holds whole card rows.** A card row is never split across pages, unless a single card row
  alone is larger than a page's capacity. Then it spans pages in order, and each of those pages is
  labelled with that card row.
- **Re-flow within a page.** Each Question type has a column count and a page capacity:
  - letters: 5 columns, 20 items per page;
  - words: 2 columns, 10 items per page.

  Pack as many whole card rows as fit within the capacity.
- **Letters break at card rows.** Each card row starts a new display row, and a thin divider marks
  where the next card row begins. Grid A (6 × 10) gives 3 pages of 2 card rows. The 2026.1 cards
  (5 × 12) give one card row per page (5, 5, 2 tiles). The future isiZulu card (11 × 10) gives 6
  pages.
- **Words flow continuously within a page** (as in Zazi). A 5-word card row does not divide by 2,
  so "indlu" (end of row 1) sits beside "isikolo" (start of row 2). There is no divider.
  `word_reading@2026.1` (10 × 5) gives 5 pages of 2 card rows. `wela_plus_read_words` (rows
  7,7,7,7,7,5) gives one card row per page.
- **The page label names the card rows** on screen ("Card rows 1–2", or "Card row 3" for a single
  row).
- **Step-by-step Questions:** the page follows the cursor. Marking the last item on a page moves to
  the next page. Back from the first item on a page returns to the previous page, with the previous
  item current. A stop or the end of the card leaves the current page in place.
- **Free-toggle paged Questions** (WelaPLUS Q6): this is the builder's call. The EA moves between
  pages with page controls (previous and next, as `SecondaryButton`s beside the dots). A horizontal
  swipe may be added. The timer keeps running across pages.
- **Paging is display-only.** It is a pure function of the item set's rows plus the Question's
  column count and capacity. `metadata.row` on saved items still records the card row. Results,
  last-attempted positions and the stop rule are unaffected.
- **No new item-set field.** Column count and capacity live in the Question's code. An optional
  item-set override can be added later, if a card ever needs one.

Sentence, passage, dictation and CVC Questions do not page. They use the wrap or grouped layouts in
§6.

## 5. Typeface: Andika for test content, Figtree for controls (decided)

- **Test content in all 11 Questions** uses **Andika Regular**. That covers every letter, word,
  sentence word, passage word, CVC letter and EA prompt card shown on a capture screen.
  - Andika is SIL's literacy face. It draws a serifed capital `I`, a plain `l`, and single-storey
    `a` and `g`, like the printed Grid A card.
  - Jim chose it from the mockups ("is that andika?", then yes). It is the regular weight, as shown,
    not bold.
- **Controls and labels** on every capture screen use the app's UI face, **Figtree**: buttons,
  timer, page label, intro text, sheets and headings. There are no system-font fallbacks in normal
  running, so every Question uses the same two faces.
  - Jim confirmed this split on 2026-10-21: "restyle all questions in same font" means Andika for
    everything the child reads and Figtree for everything the EA operates, on all 11 Questions.
- **Dependency:** `@expo-google-fonts/andika` 0.4.1.
  - Same publisher and version line as the installed Figtree and Bricolage packages.
  - Published 2025-09-11, which satisfies the minimum-age rule. Licence MIT + OFL-1.1.
  - Only the one weight is imported, adding about 0.7 MB to the app.
  - Install it with npm (repo policy).
- **Wiring across the OSS boundary.**
  - The package must not import `expo-font` or host code.
  - The host loads Andika in `App.js`'s `useFonts` and passes the family names to the package
    through a small theme provider in `src/assessment-questions/theme/`. Do not place it under a
    `context/` directory: the boundary check forbids that path segment.
  - With no provider, the package falls back to the system font, so it stays usable as OSS.
- **The Android rule.** Never set `fontWeight` together with a custom `fontFamily`; Android then
  falls back to Roboto. Choose the weight through the family name. Add a guard test.
- **Closing `contentStatus.ts`.** The `typeface` entries for `letter_sounds@2026.2.{en,xh}` close
  only after a device check shows `I` and `l` distinguishable at tile size on the A03 and the
  iPhone. Card row 3 and card row 5 of Grid A contain `I`; card row 1 contains `l`.
- **Card recreation.** The designer recreating the printed card should use Andika too, so phone and
  card draw the same glyphs. This is a note for the content owner, not build work.

## 6. Shared primitives and how each Question uses them

The primitives live in the package and use tokens and the theme only. Names are indicative; the
builder may refine them.

| Primitive | Responsibility |
|---|---|
| `MarkTile` | One tile. States: idle, current, correct, incorrect, not reached. Variants: letter, word, prompt card (EA-facing text plus an optional gloss), picture. Keep accessibility labels such as "⟨text⟩, correct, current". |
| `ItemGrid` | Lays out tiles. **Paged mode** uses a pure `paginate(rows, {columns, capacity, breakAtCardRow})` that returns pages with their card-row range. **Wrap mode** is for sentences and passages; **grouped mode** is for CVC words and numbered sentences. |
| `PageIndicator` | "Card rows a–b · page n of N" plus dots. |
| `ProgressTimer` | Bar plus seconds label. It **wraps** the memoised `Countdown` leaf so ticks never re-render the grid. |
| `ActionBar` | Decision layout: ✓/✕ pair, full-width Back, End. Toggle layout: Finish (primary), Skip question, End where the Question has one. Icons are inline `react-native-svg` paths (already a dependency, and allowed by the boundary). |
| `PrimaryButton` / `SecondaryButton` / `TextLink` | The one button language: pill, at least 52 dp, Figtree. |
| `QuestionIntro` | Instructions card plus Start. Replaces the nine bare intros and the sequential intro. |
| `ConfirmSheet` | Bottom sheet for "n items unmarked — finish anyway?" and the End confirmation. |
| `ScoreChip` / `RubricRow` | Rubric scores 1–4. Selected = ink fill with white text (not red). |
| `FullScreenSheet` | Story re-read, rubric anchors, picture enlarge. |

The existing `StopCard`, `LastAttemptedSheet`, `SkipReasonPicker` and `MissingItemSet` move onto
these primitives without changing behaviour or copy.

| Question | Pattern | Layout |
|---|---|---|
| LetterSounds (standalone + WelaPLUS Q1) | timed, step-by-step, stop rule | the mockup exactly; paged 5 × 20, break at card rows |
| ReadWords, sequential (standalone word test) | timed, step-by-step | the mockup exactly; paged 2 × 10, continuous |
| ReadWords, grid (WelaPLUS Q6) | timed, free toggle, last-attempted | paged 2 × 10 with page controls; ProgressTimer **made visible** (it has a deadline today but shows no timer; Jim approved 2026-10-21) |
| ReadPassage (Q8) | timed, free toggle in running text | wrap mode of word tiles by paragraph; ProgressTimer **made visible**, same reason (Jim approved 2026-10-21) |
| ReadSentences (Q7) | untimed, per-word toggle | grouped by sentence, wrap mode |
| WriteSentencesFromDictation (Q10) | paper-marked, per-word toggle | grouped by numbered sentence, wrap mode |
| WriteCvcs (Q9) | paper-marked, per-letter toggle | grouped by word, letter tiles |
| ListenFirstSound | per-item toggle, EA reads aloud | prompt-card tiles, one column |
| ListenPhonemeBlend | per-item toggle | prompt-card tiles with the "(word)" gloss |
| ListenAndAnswerStory | story, then comprehension toggle | QuestionIntro shows the story; prompt-card tiles with accepted answers as gloss; re-read in a FullScreenSheet |
| LetterWritingFromPictures | paper-marked grid toggle | `MarkTile` picture variant. No new assets: item sets keep `source: null`, so the tile shows today's text prompt (picture name → expected letter). It shows the image only if a future content version supplies one. The builder chooses columns that keep tiles at least 44 dp at 360 dp (today's 6 columns may need to become paged or fewer columns) |
| StoryWritingRubric | rubric 1–4 × 4 | RubricRow cards with ScoreChips and a running total |
| NullQuestion | auto-complete | none |

In free-toggle Questions a tile has two states, marked correct (solid `marked`) and not marked
(white). They have no current outline and no incorrect fill, unless the Question already records
incorrect.

`childReadingFontScale` is applied inconsistently today, and its provider is never mounted (the
WelaPLUS spec's §9 says to remove it). The builder either removes it or applies it uniformly, and
records which in the build log.

### Frozen behaviour

These must not change behaviour:

- `progress/stepByStep.ts`
- the stop rule, plus the stop-card copy in `CONTEXT.md`
- `progress/clock.ts`
- `applyProgress.ts`
- the `Countdown` tick and its isolation (the `SequentialCapture.renderCount` test must still pass)
- every Question's `Result` output
- timing refs and phase transitions

**Allowed changes to `SequentialCapture.tsx`:**

- the layout, which is the main target;
- deriving the page from the cursor;
- removing the row auto-scroll.

**Allowed changes to `Countdown`:**

- its label format ("57s");
- its styling.

The tests that pin today's presentation are updated on purpose: `Countdown.test`,
`LetterSoundsQuestion` and `ReadWordsQuestion.stepByStep`. The contract test (`runContractTest`)
must stay green for all 11 Questions.

### Guarding the style

Add a package test that fails when a file under `questions/` styles a tappable item or button
itself. Examples: it defines `backgroundColor` or `borderRadius` for a `Pressable`, or renders a
`Pressable` with a bare `Text` label rather than a shared primitive. The builder picks the exact
rule. The aim is that a new Question cannot ship a flat, unstyled screen without the test noticing.

## 7. Seeing every Question on a device (decided)

The battery host does not exist yet, so add a **Question gallery**:

- It is reachable only in development builds, never in production.
- It renders each of the 11 Questions with its `testFixtures` item set inside the same slim header
  and safe-area frame a host would use.
- It is the device-gate entry point for the nine WelaPLUS Questions, and is reusable by Plan 3.
- Jim approved building it in this tranche (2026-10-21).

The builder decides how it is reached, for example a dev-only Profile row or a deep link. It must be
impossible to reach from a production build.

## 8. Verification

- **Unit and integration tests:**
  - `paginate` against every shipped row shape: 2026.1 letters 5 × 12; Grid A 6 × 10;
    `word_reading` 10 × 5; `wela_plus_read_words` 7,7,7,7,7,5.
  - A synthetic 11 × 10 card (isiZulu), plus the Afrikaans sets if they have landed.
  - Page-follows-cursor, including Back across a page boundary.
  - The font guard.
  - The style guard.
  - The render-count test.
  - All Question contract tests.
- **Device gate (pixel-level),** on the A03 at 360 dp (`wm density 320`) and the iPhone:
  - **Standalone tests:** the letter test and the word test against the approved mockups. Check:
    - earlier marks stay visible after Back, and the item Back returns to is unmarked and outlined;
    - Back crosses a page edge;
    - stop at 10 wrong in a row;
    - End, by sheet;
    - the timer runs out;
    - Android 3-button navigation does not cover the actions.
  - **Gallery:** all nine WelaPLUS Questions.
  - **Font:** `I` and `l` are visibly different (closes `contentStatus` typeface).
  - **Evidence:** screenshots in the build log.

## 9. Docs that change in the same branch

- `2026-10-19-assessment-results-and-letter-test-design.md`: a dated status note amending `:46`,
  `:196-197` and the §6.2 Grid row to the paging rule in §4, and the typeface outcome.
- `2026-10-14-welaplus-release-1-design.md`: a dated amendment to D1 (`:38`), the Q1 row (`:323`,
  "no 20-per-page pagination"), the Q6 row (`:327`) and §9.1 (`:600-602`). The rows on the card stay
  a contract; the phone pages whole card rows.
- `documentation/design-system.md`: a new "Assessment capture" section covering:
  - package tokens;
  - tile states;
  - paging;
  - timer;
  - action area;
  - fonts;
  - the gallery.
- `src/assessment-questions/itemsets/contentStatus.ts`: close the `typeface` entries after the device
  check.
- `documentation/ROADMAP.md` §8 (the capture-chrome and Plan 3 conformance items), `build-log.md`,
  and `LEARNING.md` (why the look was lost, and the paging and font decisions).
- `CONTEXT.md`: add **Card row** and **Page** under Item set. A page is a display grouping of whole
  card rows, and never the unit of meaning.
- The Plan 3 mockup README on `design/welaplus-plan-3-screens`: the Q1 frame is superseded, and open
  question 1 (the 12-column phone grid) is answered by §4. Do this when that branch is next touched.

## 10. Sequencing and process

- Merge `feat/bold-red-polish` first if it is ready. It changes the Android footer inset and the
  same `design-system.md` region.
- Land this before the Afrikaans lesson-plan slice. That slice edits `StandaloneTestScreen.js` and
  adds `af` row shapes.
- Codex builds and Claude reviews (repo rule). Use TDD for `paginate`, the guards and page-follows-
  cursor. Run the Codex adversarial review per pass. Bottom sheets, not dialogs. No co-author
  trailer on commits.

## 11. Left to the builder

- Exact tile sizes, gaps and type sizes within §3.3. The mockups are the reference.
- Primitive names and file layout inside the package.
- How the gallery is reached in development builds.
- The exact rule in the style guard.
- Whether `childReadingFontScale` is removed or applied uniformly.
- Page controls and swipe for free-toggle paged Questions.
- Columns for LetterWritingFromPictures.

## 12. Calls made in this document (Jim to check)

These were not explicitly decided in the brainstorm:

1. **"End test" stays.** The mockup says "End Assessment".
2. **Amber for the last 10 seconds** of the timer, not red. Red means incorrect.
3. **Rubric selection is ink, not red.**
4. **Back shows the returned-to item unmarked.** Back clears that decision (frozen behaviour), so
   the tile shows the ink outline with no fill; every earlier tile keeps its mark (§3.1).
5. **OS text size is capped** (§3.3): item text grows to about 1.2× then shrinks to fit; page
   capacities never change.
6. **No new picture assets for Q5.** Tiles keep the text prompt until content supplies images (§6).

Decided by Jim after the builder check (2026-10-21), recorded here for traceability:

- The font split in §5 (Andika for test content, Figtree for controls, on all 11 Questions).
- The dev-only Question gallery (§7) is built in this tranche.
- Q6 and Q8 show a visible timer (§6).

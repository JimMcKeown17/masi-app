# One Set of Reading Content and WelaPLUS Skip Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WelaPLUS, Full EGRA and the quick tests read letters, words, a story and story comprehension from one shared item set per language, and a new WelaPLUS version skips the reading and writing Questions once a child gets a whole first row wrong, with a card that tells the EA why.

**Architecture:** One builder module turns the DBE/SMRS pack forms into shared item sets (`question_version` `2026.3`), consumed by a new WelaPLUS Battery (`wela_plus_full@2026.1`), a new multi-language Full EGRA Battery (`egra@2026.1`) and the quick-test registry. The pure Battery evaluator gains one first-row skip rule per Battery; the host derives row labels and the one-off skip card from saved results. Old versions stay registered and unchanged.

**Tech Stack:** React Native (Expo), TypeScript package under `src/assessment-questions/`, JavaScript host screens, Jest + RNTL, real-SQLite integration tests, Supabase CLI migrations.

**Spec:** `docs/superpowers/specs/2026-10-26-egra-content-and-skip-rules-design.md` (approved by Jim 2026-10-26). Read it first.

## Global Constraints

- Content comes only from `content/egra/egra-assessments.json` through `content/egra/index.js`. Never edit, dedupe, reorder or lowercase it.
- Shared forms: xh letters `dbe-egra-xh-hl-3-v1`, reading `dbe-egra-xh-hl-1-v1`; en letters `dbe-egra-en-hl-3-v1`, reading `dbe-egra-en-hl-1-v1`; af letters `dbe-egra-af-hl-3-v1`, reading `dbe-egra-af-hl-1-v1`; zu letters and reading `smrs-egra-zu-1-v1`.
- Shared `question_version` is `'2026.3'` for `letter_sounds`, `word_reading`, `oral_reading` and `reading_comprehension`; `item_set_id` is `` `${code}@2026.3.${language}` ``. Never reuse `2026.1`, `2026.2` or a form id.
- New Battery identities: `wela_plus_full@2026.1` (languages `['en', 'xh']`) and `egra@2026.1` (languages `['xh', 'en', 'af', 'zu']`, no `fixedLanguage`).
- Stop rule for shared letters and words: `{ kind: 'first_row_all_wrong', first_row_length: <the form's columns> }`. Timers 60 s.
- The `reading_comprehension` Question title is **"Story comprehension"** everywhere, including the 13 old EGRA forms.
- Automatic skips save `stopped_reason: 'skipped_prerequisite_unmet'`. No new reason, column, table or server contract change.
- Saved results and old versions (`wela_plus_full@2024.1`, the 13 `egra@<form id>` Batteries, `letter_sounds@2026.1/2026.2`, `word_reading@2026.1`, `-masi60` sets) stay registered and behave exactly as today, apart from the Story comprehension title and skip-row labels.
- npm only; no new dependencies. Bottom sheets, not dialogs. Bold Red tokens only (raw-hex guard). Copy never uses a pronoun for the child.
- Tests run on Node 20: prefix `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`. Gates: `npx jest --silent`, `npm run test:types`, `npm run test:integration`, `npm run test:content`.
- **Every task ends with `npx jest --silent` and `npm run test:types` green.** A task that changes a contract (a field, a title, a label, what is current) updates every existing assertion on it in that same task. Each task's "Existing tests to update" list names the ones known today; the full run catches the rest.
- Old item sets resolve only by their own exact version. Shared sets resolve only for `question_version === '2026.3'`.
- One instruction text per shared Question and language, from `sharedInstructionsFor` (Task 1), used word for word by WelaPLUS 2026.1, Full EGRA 2026.1 and the quick tests.
- Docs ship in this branch (Task 9). Never run raw `supabase` from the repo root; staging work uses `scripts/sqlite-staging.cjs` and needs Jim's go to push.

## Review Focus

1. **The app dies around the skips.** Killed after Q1 saves and before any skip saves, after some skips save, or after all skips save but before the card appears. On reopening, each missing skip saves once, the card shows, and no `QUESTION_ALREADY_DECIDED` error reaches the EA. (Task 7, the three `card survives …` tests.)
2. **A first row finished wrong exactly as the timer ends.** Q1 saved with `stopped_reason: 'timer'` and all 10 first-row items reached and wrong is a trigger. A row with 9 reached wrong and 1 not reached is not. (Task 2, `trigger reads marks, not the stop reason`.)
3. **Old versions get no skip rule and keep their own content.** A `wela_plus_full@2024.1` run whose Q1 first row is all wrong produces no automatic skips. An old EGRA form keeps only its story rule. Every old question still resolves to exactly the item set it resolves to today, never a 2026.3 set. (Task 2, `batteries without skipRule never first-row skip`; Task 1, `old questions resolve only their own sets`.)
4. **Letter writing with later letters right.** Q5's first 6 all wrong and letters 7–26 right is still a trigger. Q5 with one of the first 6 unmarked is not. (Task 2, `letter writing first row`.)
5. **An isiZulu child.** WelaPLUS shows "Not available in isiZulu yet"; Full EGRA and both quick tests start in isiZulu, with 5-word rows and the 110-letter chart; letter mastery for isiZulu stays empty without throwing. (Tasks 4, 5.)

---

### Task 1: Shared reading item sets

**Files:**
- Create: `src/assessment-questions/egra/sharedReading.ts`
- Modify: `src/assessment-questions/egra/adapter.ts` (extract the four set builders), `src/assessment-questions/egra/index.ts` (exports), `src/assessment-questions/battery/bundledItemSets.ts` (lookup order below)
- Test: `src/assessment-questions/egra/__tests__/adapterBaseline.test.ts` (+ its committed snapshot), `src/assessment-questions/egra/__tests__/sharedReading.test.ts`

**Interfaces:**
- Produces:
  - `SHARED_READING_VERSION = '2026.3'`
  - `SHARED_READING_FORMS: Record<'xh' | 'en' | 'af' | 'zu', { letters: string; reading: string }>` (values from Global Constraints)
  - `sharedItemSetFor(questionCode: string, questionVersion: string, language: string): (ItemSet & { source_form_id: string }) | null` for the four codes. Returns `null` unless `questionVersion === SHARED_READING_VERSION`.
  - `sharedInstructionsFor(questionCode: string, language: string): string | null`. The one instruction text for each shared Question:
    - `letter_sounds`: `Hand the child Reading Card side A. ` + `timedInstructions('letter sounds', <letters form>.letters)`
    - `word_reading`: `Hand the child Reading Card side B. ` + `timedInstructions('words', <reading form>.words)`
    - `oral_reading`: `` `Hand the child Reading Card side C. Ask the child to read the story aloud. ${markingSentence('word')} The test stops by itself when the time is up.` ``
    - `reading_comprehension`: `` `Ask the story questions. Use the answer guide to decide. ${markingSentence('question')}` ``
  - `bundledItemSetFor(code, version, language)` order: exact `BUNDLED_ITEM_SETS` key, then `sharedItemSetFor` (exact version only), then `egraItemSetFor`.
  - `SHARED_READING_SETS` (frozen map `code → language → set`, built once at load)
  - From `adapter.ts`: `buildLetterSet(form, version, extension?)`, `buildWordSet(form, version)`, `buildPassageSet(form, version)`, `buildComprehensionSet(form, version)`, each returning today's shapes. `adaptEgraForm` uses them, so its output is byte-identical.
  - `timedInstructions(noun: 'letter sounds' | 'words', section: EgraGrid): string` (exported; today's text).

- [ ] **Step 0: Capture the old adapter output before touching it.** Write `adapterBaseline.test.ts`: for each of the 13 forms, `expect(sha256(JSON.stringify({ itemSets, battery: { ...battery, questions: battery.questions.map(({ title, ...q }) => q) } }))).toMatchSnapshot(form.id)` (Node `crypto`). Run it on the unmodified adapter to write the snapshot. Commit test and snapshot on their own: `test(egra): baseline of the 13 adapted forms`. From here on, run it with `--ci` and never `-u`; titles are excluded because Task 4 renames Q4.
- [ ] **Step 1: Write the failing tests.**
  - `shared sets copy the pack exactly`: for each language and code, `item_set_id === \`${code}@2026.3.${lang}\``, `question_version === '2026.3'`, and `source_form_id` matches `SHARED_READING_FORMS`. Letters `rows.flat()` equals the letters form's `letters.items.map(i => i.text)`. Words equal the reading form's words. The passage word count equals today's `adaptEgraForm(readingForm).itemSets.oral_reading.words.length`. Questions equal the reading form's `comprehension.questions` texts.
  - `shared shapes`: xh/en/af letters are 10 rows of 10 and zu 11 rows of 10; `stop_rule` is `{ kind: 'first_row_all_wrong', first_row_length: 10 }`. Words `row_lengths` are `Array(10).fill(8)` for xh/en/af and `Array(10).fill(5)` for zu; word `stop_rule.first_row_length` is 8, or 5 for zu.
  - `no Masi extension in shared letters`: no shared letters set has more letters than its source form.
  - `bundled lookup finds shared sets`: `bundledItemSetFor('word_reading', '2026.3', 'zu')` is the shared zu set; `('letter_sounds', '2026.3', 'st')` and `('letter_sounds', '2026.9', 'xh')` return `null`.
  - `old questions resolve only their own sets`: every question of `WELA_PLUS_FULL_2024_1` (en, xh) and of the 13 EGRA Batteries resolves to a set whose `question_version` equals the question's version, and whose `item_set_id` equals the one captured from `bundledItemSetFor` before the change (write the expected ids into the test). `bundledItemSetFor('letter_sounds', '2026.2', l)` and `('word_reading', '2026.1', l)` for en/xh/af return today's sets; `('letter_sounds', '2026.1', 'af')` returns what it returns today.
  - `one instruction text per shared Question`: the exact strings above for xh `letter_sounds` and zu `word_reading`; every letters/words text ends with `` ` Practice first (not scored): ${practiceItems.join(', ')}` `` from its own form when the form has practice items. Each set's scored items equal its source section's items exactly, in count and order, with no practice positions added. A practice prompt may also appear as a scored item when the printed grid contains it (en letters `m`, `y`; af words `pot`, `jas`; xh words `utata`), so never filter by text.
- [ ] **Step 2:** `npx jest src/assessment-questions/egra/__tests__/sharedReading.test.ts`. It should fail because the module doesn't exist.
- [ ] **Step 3:** Implement. Build the sets with the extracted builders and version `'2026.3'`. Attach `source_form_id`. Fail loudly (TypeError) if a configured form id is missing from the pack.
- [ ] **Step 4:** Run `npx jest src/assessment-questions/egra --ci`, then `npx jest --silent` and `npm run test:types`. All should pass, with the baseline snapshot unchanged.
- [ ] **Step 5:** Commit: `feat(egra): shared 2026.3 reading item sets from the pack`.

### Task 2: First-row skip rule in the Battery evaluator

**Files:**
- Create: `src/assessment-questions/battery/skipRules.ts`
- Modify: `src/assessment-questions/types/BatteryConfig.ts`, `src/assessment-questions/battery/evaluateBatteryState.ts`, `src/assessment-questions/index.ts` (exports)
- Test: `src/assessment-questions/battery/__tests__/skipRules.test.ts`
- Existing tests to update: every exact assertion on `autoSkips` or the whole `BatteryState`, known today in `battery/__tests__/evaluateBatteryState.test.ts`, `egra/__tests__/adapter.test.ts:126` and `:144` (add `trigger: null`), `__tests__/batteryRun.test.js` and `__tests__/BatteryOverviewScreen.test.js`.

**Interfaces:**
- Produces (types in `BatteryConfig.ts`):
  - `FirstRowTrigger { question_code: string; first_row_length: number }`
  - `SkipRule { triggers: FirstRowTrigger[]; skips: string[] }`
  - `BatteryConfig.skipRule?: SkipRule`
  - `DecidedItem { position: number; is_correct: boolean; metadata?: Record<string, unknown> }`
  - `DecidedResult.items?: DecidedItem[]`
  - `BatteryState.autoSkips: Array<{ question_code: string; reason: 'skipped_prerequisite_unmet'; trigger: string | null }>`
  - `BatteryState.firedTrigger: string | null` (the earliest fired trigger, whether or not its skips are saved yet)
- Produces (in `skipRules.ts`):
  - `firstRowWrong(result: DecidedResult, length: number): boolean`
  - `firedTrigger(battery: BatteryConfig, decided: DecidedResult[]): string | null`. Returns the earliest trigger in Battery order.
  - `skipCauseFor(battery, decided, questionCode): { kind: 'first_row'; trigger: string } | { kind: 'prerequisite'; depends_on: string } | null`
- Rules:
  - `firstRowWrong` is true only when the result is not `skipped_*` and every position `0..length-1` has an item with `metadata.reached === true` and `is_correct === false`.
  - A fired trigger auto-skips every undecided code in `skips` that comes after the trigger in Battery order.
  - Prerequisite rules then apply as today, and only to codes the first-row rule did not already skip. Their `trigger` is `null`.

- [ ] **Step 1: Write the failing table-driven tests.** Use a fixture Battery shaped like WelaPLUS 2026.1, with triggers `letter_sounds` 10, `wela_plus_letter_writing` 6 and `word_reading` 8. `skips` covers the Q6–Q12 codes. Q9 has a prerequisite on `oral_reading` with `minScore` 1. Cases:
  - **Q1 trigger:**
    - `Q1 first row wrong skips Q6–Q12 with trigger letter_sounds; Q2–Q5 stay undecided and next is Q2`.
    - `Q1 ended by End before the row is complete: no skip` (7 reached wrong, 3 not reached, `ea_ended`).
    - `Q1 skipped by hand: no skip` (`skipped_child_refused`, `items: []`).
  - **Timer edge:** `trigger reads marks, not the stop reason`. A `timer` result with 10 reached wrong is a trigger; 9 reached wrong plus 1 not reached is not.
  - **Q5 (`letter writing first row`):**
    - first 6 wrong and 7–26 right fires;
    - first 6 wrong with position 3 unreached does not fire;
    - Q1 already fired and Q5 also wrong: `firedTrigger` is `letter_sounds`, and `skipCauseFor(…, 'word_reading')` names `letter_sounds`.
  - **Q6:** `Q6 first row wrong skips Q7–Q12; eligibleToFinalize after those skips are saved`.
  - **Q9 and the story rule:**
    - `Q9 after a story with 0 correct: prerequisite skip with trigger null`.
    - `Q9 after the story was skipped by hand: prerequisite skip`.
    - `Q9 inside a trigger range is labelled by the trigger, not the prerequisite`.
  - **Old Batteries:** `batteries without skipRule never first-row skip`. Use the real `WELA_PLUS_FULL_2024_1` with a Q1 first row all wrong, and one real old EGRA Battery.
  - **Saved skips:** `skipCauseFor on already-saved skips re-derives the same cause after resume`.
- [ ] **Step 2:** Run it. It should fail.
- [ ] **Step 3:** Implement `skipRules.ts` and wire it into `evaluateBatteryState`. The evaluator stays pure, with no host imports.
- [ ] **Step 4:** Run the battery tests, then `npx jest --silent` and `npm run test:types`. All should pass.
- [ ] **Step 5:** Commit: `feat(battery): first-row skip rule; earliest trigger owns the skips`.

### Task 3: WelaPLUS 2026.1

**Files:**
- Create: `src/assessment-questions/battery/wela_plus_full_2026_1.ts`
- Modify:
  - `src/assessment-questions/battery/wela_plus_full.ts`: export the unchanged 2024.1 `BatteryQuestion` objects for reuse, with no change to their content.
  - `src/assessment-questions/battery/registry.ts`: register both versions.
  - `src/assessment-questions/types/BatteryConfig.ts`: `Materials.side` adds `'D'`; `BatteryConfig.readingCard?: string`.
  - `src/utils/batteryRun.js` (`materialsLine`).
- Test: `src/assessment-questions/battery/__tests__/wela_plus_full_2026_1.test.ts`; extend `__tests__/batteryRun.test.js`

**Interfaces:**
- Consumes: Task 1 `sharedItemSetFor`, `sharedInstructionsFor`, `SHARED_READING_FORMS`; Task 2 `SkipRule`.
- Produces: `WELA_PLUS_FULL_2026_1: BatteryConfig`. Its fields:
  - `battery_code: 'wela_plus_full'`, `battery_version: '2026.1'`
  - `title: 'WelaPLUS'`, `aboutMinutes: 32`
  - `languages: ['en', 'xh']`
  - `readingCard: 'Reading Card 2026.3'`
  - `prerequisites: { reading_comprehension: { depends_on: 'oral_reading', minScore: 1, on_unmet_reason: 'skipped_prerequisite_unmet' } }`
  - `skipRule`:
    - triggers: `letter_sounds` 10, `wela_plus_letter_writing` 6, `word_reading` 8;
    - skips: `word_reading`, `wela_plus_read_sentences`, `oral_reading`, `reading_comprehension`, `wela_plus_write_cvcs`, `wela_plus_write_sentences_dictation`, `wela_plus_story_writing`.
- Questions in this order, as spec §4.1:

| # | Title | Code@version | Materials |
|---|---|---|---|
| 1 | Letter sounds | `letter_sounds@2026.3` | durationSec 60; reading_card side A |
| 2 | Listen to a story | 2024.1 object | — |
| 3 | First sounds | 2024.1 object | — |
| 4 | Blending sounds | 2024.1 object | — |
| 5 | Letter writing | 2024.1 object | writing_sheet |
| 6 | Reading words | `word_reading@2026.3` | durationSec 60; reading_card side B |
| 7 | Reading sentences | 2024.1 code, materials changed | reading_card side D |
| 8 | Reading a story | `oral_reading@2026.3` | durationSec 60; reading_card side C |
| 9 | Story comprehension | `reading_comprehension@2026.3` | none |
| 10 | Writing words | 2024.1 object | — |
| 11 | Writing sentences | 2024.1 object | — |
| 12 | Story writing | 2024.1 object | — |

- Instructions, `en` and `xh` (English text in both, like 2024.1):
  - **Q1, Q6, Q8, Q9:** `{ en: sharedInstructionsFor(code, 'en'), xh: sharedInstructionsFor(code, 'xh') }`.
  - **Q7:** the 2024.1 text with "side B" changed to "side D".
- `materialsLine`:
  - For a `reading_card` question in a Battery with `readingCard`, the footer is `` `${battery.readingCard} · ${LANG} · side ${side}` ``.
  - Every other case keeps today's `` `${title} ${battery_version} · …` ``.

- [ ] **Step 1: Write the failing tests.**
  - The question table: titles, codes, versions, sides and durations in order.
  - Every question resolves an item set in en and xh through `bundledItemSetFor`.
  - Each trigger's `first_row_length` equals its item set's first row in both languages (letters `rows[0].length`, words `row_lengths[0]`, Q5 6).
  - Every `skips` code comes after `wela_plus_letter_writing` in Battery order.
  - `batteryFor('wela_plus_full', '2026.1')` and `batteryFor('wela_plus_full', '2024.1')` both resolve.
  - `materialsLine` gives `Reading Card 2026.3 · XH · side A` for 2026.1 Q1 and still `WelaPLUS 2024.1 · XH · side A` for 2024.1 Q1.
- [ ] **Step 2:** Run. Fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `registry.test.ts`, `wela_plus_full.test.ts`, the new test and `batteryRun.test.js`, then `npx jest --silent` and types. All should pass.
- [ ] **Step 5:** Commit: `feat(wela): WelaPLUS 2026.1 on the shared reading content with skip rules`.

### Task 4: Full EGRA 2026.1 and the Assessments card

**Files:**
- Create: `src/assessment-questions/egra/fullEgra.ts`
- Modify:
  - `src/assessment-questions/egra/adapter.ts`: Q4 title becomes "Story comprehension".
  - `src/assessment-questions/battery/registry.ts`
  - `src/screens/main/AssessmentsScreen.js`
- Delete: `src/components/assessments/EgraFormPickerSheet.js`, plus its tests and the picker tests in `__tests__/AssessmentsScreen.test.js` (lines 48–110 today)
- Test: `src/assessment-questions/egra/__tests__/fullEgra.test.ts`; update `__tests__/AssessmentsScreen.test.js` and `__tests__/AssessmentChildSelectScreen.battery.test.js`
- Existing tests to update: `egra/__tests__/adapter.test.ts:38` and `__tests__/BatteryRunSummaryScreen.test.js:29` (`Story questions` → `Story comprehension`).

**Interfaces:**
- Consumes: Task 1 sets and `sharedInstructionsFor`.
- Produces: `FULL_EGRA_2026_1: BatteryConfig`. Its fields:
  - `battery_code: 'egra'`, `battery_version: '2026.1'`, `title: 'Full EGRA'`, `aboutMinutes: 6`
  - `languages: ['xh', 'en', 'af', 'zu']`, no `fixedLanguage`
  - the same `prerequisites` as the old forms
  - no `skipRule`
  - `readingCard: 'Reading Card 2026.3'`
- Questions:
  - Letter sounds (side A, 60 s)
  - Familiar words (side B, 60 s)
  - Reading a story (side C, 60 s)
  - Story comprehension
- Instructions: `{ xh, en, af, zu }`, each `sharedInstructionsFor(code, language)`.
- Card copy: title `Full EGRA`; description `` `All 4 Questions · isiXhosa, English, Afrikaans or isiZulu · about 6 min` ``.
- Start calls `navigateToRun('AssessmentChildSelect', { batteryCode: 'egra', batteryVersion: '2026.1' })`.

- [ ] **Step 1: Write the failing tests.**
  - `fullEgra.test.ts`:
    - every question resolves an item set for all four languages;
    - zu words have rows of 5;
    - Q4 title is `Story comprehension`;
    - all 13 old Batteries still resolve, and their Q4 title is also `Story comprehension`.
  - `AssessmentsScreen.test.js`:
    - the card shows the new description;
    - Start navigates once with `egra@2026.1`;
    - no picker is rendered;
    - an unfinished old-form run still lists and resumes, as in the existing test at line 545.
  - `AssessmentChildSelectScreen.battery.test.js`:
    - with `egra@2026.1`, a zu-class child starts in `zu` with no sheet;
    - a child with no class language gets the language sheet offering the four;
    - a child whose `home_language` is `Sesotho` shows `Not available in Sesotho yet` and cannot start (the note falls back to the class's own language name);
    - with `wela_plus_full@2026.1`, a zu-class child shows `Not available in isiZulu yet`.
- [ ] **Step 2:** Run. Fail.
- [ ] **Step 3:** Implement and delete the picker.
- [ ] **Step 4:** Run the touched tests and `npx jest --silent`. All should pass.
- [ ] **Step 5:** Commit: `feat(egra): one Full EGRA in four languages; no form picker`.

### Task 5: Quick tests on the shared content

**Files:**
- Modify: `src/assessment-questions/itemsets/current.ts`, `src/utils/assessmentRegistry.js` (`STANDALONE_TESTS` instructions), `src/screens/assessments/StandaloneTestScreen.js` (passes `definition.instructions[languageCode]`)
- Test: update `src/assessment-questions/battery/__tests__/registry.test.ts` (replace `the Word Reading quick test keeps word_reading@2026.1 with no stop rule`), `__tests__/assessmentRegistry.test.js`, `__tests__/StandaloneTestScreen.test.js`; add a zu case to `__tests__/masteryState.test.js`
- Existing tests to update: `egra/__tests__/defaults.test.ts:7–13` (new identities, four languages). Every other test that reads `CURRENT_ITEM_SETS` (today: `itemSetResolution`, `clockJump`, `letterTestContent`, `itemSetIntegrity`, `wela_plus_full`, `LetterSoundsQuestion`, `ReadWordsQuestion.stepByStep`, `masteryState`, `readers.mixedResults`, `QuestionGalleryScreen`, `AssessmentDetailGrid`, `assessmentsRepository.questionResults`). Rule: a test about a component, reader or repository keeps its old fixture by reading the old set explicitly (`bundledItemSetFor('letter_sounds', '2026.2', lang)` or `('word_reading', '2026.1', lang)`), so it still tests what it tested. A test about what is current moves to 2026.3.

**Interfaces:**
- Consumes: Task 1 `SHARED_READING_SETS`, `sharedInstructionsFor`.
- Produces:
  - `CURRENT_ITEM_SETS.letter_sounds` and `.word_reading` hold `{ xh, en, af, zu }`, the shared 2026.3 sets.
  - `STANDALONE_TESTS[i].instructions` becomes `{ xh, en, af, zu }`, each `sharedInstructionsFor(code, language)`. The old numbered steps go. The Question gallery already reads per-language instructions.

- [ ] **Step 1: Write the failing tests.**
  - The quick tests resolve 2026.3 sets with first-row stop rules for all four languages.
  - `StandaloneTestScreen` passes the child's-language text: for `zu` Word Reading the Question receives `sharedInstructionsFor('word_reading', 'zu')`, which names side B and the zu practice words.
  - A zu-class child can start both quick tests.
  - `loadMasteryState({ languageCode: 'zu', … })` returns an empty mastered set and `pedagogicalOrder: null` without reading results.
- [ ] **Step 2:** Run. Fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the touched tests, then `npx jest --silent` and types. Pass.
- [ ] **Step 5:** Commit: `feat(quick-tests): Letter Sounds and Word Reading use the shared content`.

### Task 6: Skip-row labels

**Files:**
- Modify: `src/utils/batteryRun.js` (`buildRunView` passes `items` to the evaluator; labels)
- Test: `__tests__/batteryRun.test.js`
- Existing tests to update: `__tests__/BatteryOverviewScreen.test.js:46` (an old EGRA story-questions skip now reads `Skipped · No story words read`). `batteryRun.test.js:85` stays `Skipped · Not reached` (a 2024.1 row with no cause).

**Interfaces:**
- Consumes: Task 2 `skipCauseFor`, `autoSkips[].trigger`, `firedTrigger`.
- Produces:
  - `buildRunView(...)` also returns `firedTrigger` (passed through from the evaluator).
  - Each row gains `skipCause: { kind: 'first_row'; trigger: string } | { kind: 'prerequisite'; depends_on: string } | null`, from `skipCauseFor` for saved `skipped_prerequisite_unmet` rows, `null` otherwise. The label is derived from it.
- Produces: `TRIGGER_LABELS = { letter_sounds: 'Letters first row wrong', wela_plus_letter_writing: 'Letter writing first row wrong', word_reading: 'Words first row wrong' }`.
- Label rules for a saved `skipped_prerequisite_unmet` row:
  - **First-row cause:** `Skipped · ${TRIGGER_LABELS[trigger]}`.
  - **Prerequisite cause with `depends_on: 'oral_reading'`:** `Skipped · No story words read`.
  - **Anything else:** `Skipped · Not reached`.
  - EA reasons are unchanged.
- The summary screen uses the same rows, so it needs no change.

- [ ] **Step 1: Write the failing tests.**
  - One 2026.1 run per trigger, with the rows showing the right label.
  - An old EGRA run's comprehension skip reads `No story words read`.
  - A manual skip keeps its EA reason label.
- [ ] **Step 2:** Run. Fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, then `npx jest --silent`. Pass.
- [ ] **Step 5:** Commit: `feat(run): skipped rows say why`.

### Task 7: The skip card

**Files:**
- Create: `src/components/assessments/SkipNoticeSheet.js`, `src/utils/skipNoticeSeen.js`
- Modify:
  - `src/utils/batteryRun.js`: add `skipNoticeFor`.
  - `src/screens/assessments/battery/BatteryOverviewScreen.js`: show the card after an auto-skip batch.
- Test: `__tests__/SkipNoticeSheet.test.js`, `__tests__/batteryRun.test.js`, `__tests__/BatteryOverviewScreen.test.js`

**Interfaces:**
- Consumes: Task 2 `autoSkips[].trigger`; Task 6 rows.
- Produces:
  - `skipNoticeFor({ battery, view, firstName }): { trigger, title, body, stillToDo: string[], skipped: string[] } | null`. Worked out from saved results only.
    - `skipped` is the titles of `view.rows` with `skipCause.kind === 'first_row'` and `skipCause.trigger === view.firedTrigger` (Task 6). No other input is needed, and nothing is parsed from labels.
    - It returns `null` when `view.firedTrigger` is null or `skipped` is empty.
    - `stillToDo` is the titles of rows still `next`/`not_started`.
    - `body` is the table text, then a space, then `Carry on with the next Question.` when `stillToDo` is non-empty, otherwise `Tap Review and finalize to finish.`
  - `skipNoticeSeen.js`: `hasSeenSkipNotice(runId): boolean`, `markSkipNoticeSeen(runId): void`, `resetSkipNoticeSeen(): void` (tests only). A module-level `Set`, never persisted: after an app restart an unfinished run shows the card once more (spec §4.3).
  - `SkipNoticeSheet({ visible, title, body, stillToDo, skipped, onDismiss })`:
    - built on `BottomSheet` with `panelRole="alertdialog"`;
    - two short lists headed `Still to do` (omitted when empty) and `Skipped`;
    - one primary `BrandButton` labelled `Got it` that calls `onDismiss`.
- Copy (spec §4.3, `{name}` = child first name):

| Trigger | Title | Body |
|---|---|---|
| `letter_sounds` | `No reading or writing today` | `{name} got every letter in the first row wrong. So {name} won't be asked to read or write words, sentences or a story. This is normal.` |
| `wela_plus_letter_writing` | `No reading or writing today` | `{name} got every letter in the first row of the Writing Sheet wrong. So {name} won't be asked to read or write words, sentences or a story. This is normal.` |
| `word_reading` | `No more reading or writing today` | `{name} got every word in the first row wrong. So {name} won't be asked to read sentences or a story, or to write. This is normal.` |

- Overview wiring:
  - The auto-skip batch is unchanged.
  - Whenever the overview publishes a view of a writable run, it sets `skipNotice` from `skipNoticeFor` unless `hasSeenSkipNotice(run.id)`. This covers a fresh trigger, a resume before the skips saved, and a resume after they saved but before the card appeared.
  - `Got it` calls `markSkipNoticeSeen(run.id)` and hides the sheet. Blur hides it without marking it seen.
  - Never shown for a read-only run, and never when the only skips are prerequisite skips.

- [ ] **Step 1: Write the failing tests.**
  - `skipNoticeFor` returns the exact copy for each trigger; a Q1 trigger with Q2–Q5 undecided ends `Carry on with the next Question.`; a Q5 trigger with Q1–Q4 decided ends `Tap Review and finalize to finish.` and has an empty `stillToDo`; `null` when only prerequisite skips exist. These tests build `view` with the real `buildRunView` from saved results (never a hand-made view), including one run that mixes a manual skip, a prerequisite skip and first-row skips; only the first-row rows are listed.
  - The sheet renders both lists and calls `onDismiss` on `Got it`.
  - Overview: after Q1 saves with a wrong first row, rows 6–12 show the skip labels, the card shows once, and `Got it` closes it. Re-focusing does not show it again.
  - Overview after a Q6 trigger: the footer button is `Review and finalize`.
  - Each test calls `resetSkipNoticeSeen()` in `beforeEach`.
  - `card survives a restart before the skips save`: Q1 is saved, then the overview mounts fresh with no skips saved. The 7 skips save once and the card shows.
  - `card survives a restart after some skips save`: Q1 and 3 of the 7 skips are saved. On mount the other 4 save once, with no `QUESTION_ALREADY_DECIDED` shown, and the card lists all 7.
  - `card survives a restart after all skips save`: Q1 and all 7 skips are saved. On mount nothing saves and the card shows.
  - After `Got it`, a second mount in the same session shows no card and makes no saves. After `resetSkipNoticeSeen()` (a restart) it shows once more.
  - The first view load fails after the skips save: the screen shows today's load error, and the next successful load shows the card.
- [ ] **Step 2:** Run. Fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the overview, summary and question screen tests, then `npx jest --silent` and types. All should pass.
- [ ] **Step 5:** Commit: `feat(run): skip card tells the EA why reading and writing stop`.

### Task 8: Programme default and an end-to-end run

**Files:**
- Create:
  - `supabase/migrations/<UTC timestamp>_welaplus_2026_1_default.sql`, containing `update public.programmes set default_battery_code = 'wela_plus_full', default_battery_version = '2026.1' where code = 'literacy';`
  - `__tests__/welaPlus2026Run.integration.test.js`
- Test: the integration test above (real SQLite, `jest.integration.config.js`).

**Interfaces:**
- Consumes: Tasks 2–7.

- [ ] **Step 1: Write the failing integration test.** Use the real repositories, like `egraRun.integration.test.js`.
  - Start a `wela_plus_full@2026.1` run in `xh`.
  - Save a Q1 result whose first row is all wrong.
  - Apply `buildRunView(...).autoSkips` through `skippedResult` + `saveQuestionResult`.
  - Save Q2–Q5.
  - Then:
    - assert all 12 codes are decided and `finalizeRun(id, { questionCodes })` succeeds;
    - stored skipped rows have `skipped_prerequisite_unmet` and zero items;
    - the Q1 items keep `metadata.reached`.
  - Repeat with a Q6 trigger.
- [ ] **Step 2:** Run with `npm run test:integration -- welaPlus2026Run`. It should fail until the wiring is right.
- [ ] **Step 3:** Write the migration. Do not apply it. Applying to staging is a step in Task 10, after Jim's go.
- [ ] **Step 4:** Run `npm run test:integration` (whole suite). Pass.
- [ ] **Step 5:** Commit: `feat(wela): literacy programme defaults to WelaPLUS 2026.1 (migration)`.

### Task 9: Documents

**Files:**
- Modify:
  - `documentation/ROADMAP.md` §7–8
  - `documentation/welaplus-printout-pack.md`
  - `CONTEXT.md`
  - `documentation/design-system.md` (SkipNoticeSheet)
  - `docs/superpowers/specs/2026-10-14-welaplus-release-1-design.md` (dated note at the top)
  - `documentation/build-log.md`

- [ ] **Step 1: ROADMAP.**
  - Replace the two follow-on specs with a built line pointing at the spec.
  - Add the deferred items from spec §2:
    - the skip switch (Head Office default and lock, EA Profile toggle, website admin screen);
    - Full EGRA skip rules;
    - revisiting early endings;
    - comparable and per-grade forms.
  - Remove the 60-letter Grade 1 card printing item.
- [ ] **Step 2: Printout pack.** The new Reading Card per language:
  - side A letters (10 × 10; 11 × 10 for isiZulu);
  - side B words (rows of 8; 5 for isiZulu);
  - side C story;
  - side D WelaPLUS sentences;
  - footers `Reading Card 2026.3 · <LANG> · side <X>`;
  - Writing Sheet and Picture Cards footers `WelaPLUS 2026.1 · <LANG> · …`.
  - It supersedes Grid A 6 × 10 and the 5 × 8 Side B. Cards are printed after the app is finished.
- [ ] **Step 3:** CONTEXT terms: **skip rule**, **first row all wrong**, **Reading Card 2026.3**. Add the design-system entry for SkipNoticeSheet, and the Release 1 note ("auto-skip added by the 2026-10-26 spec").
- [ ] **Step 4:** Build-log rows for each task's evidence.
- [ ] **Step 5:** Commit: `docs: shared reading content, WelaPLUS 2026.1 and skip rules`.

### Task 10: Device gate (controller)

- [ ] **Step 1:** Run the full gates: `npx jest --silent`, `npm run test:types`, `npm run test:integration`, `npm run test:content`. Then a whole-branch Codex adversarial review (`gpt-6-astra`).
- [ ] **Step 2:** With Jim's go, apply the migration to staging through the helper. Confirm `project_ref=segygjzpujphwvrubusm`.
- [ ] **Step 3:** EAS Android preview build. A03 at 360dp:
  - WelaPLUS 2026.1 xh with a Q1 trigger: card, labels, finalize;
  - en with a Q6 trigger;
  - a Q5 trigger;
  - a clean run with all 12 Questions;
  - Full EGRA in zu and af;
  - both quick tests in zu;
  - a resumed run after force-quit.
- [ ] **Step 4:** Read the stored rows on staging (read-only query): 2026.3 versions, `skipped_prerequisite_unmet` rows, and the run language.
- [ ] **Step 5:** Log the evidence in the build log. Merging waits for Jim's go.

# WelaPLUS Plan 3: Host Run Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An EA in a programme whose default battery is WelaPLUS can start a run for a child, administer
all 11 Questions in order, skip one with a reason, resume an unfinished run, finalize or abandon it, and
open any run from History.

**Architecture:** The data layer already exists (#90: `battery_runs`, `saveQuestionResult`,
`batteryRunsRepository`, `save_battery_run`). This plan adds three things:
- a small package surface: a battery registry, Question titles, bundled item sets and a
  skipped-result builder;
- three repository rules: one unfinished run per child, a run guard on the save path, and a
  finalize completeness check;
- the host screens.

All run-state logic lives in one pure view model (`buildRunView`). The screens render it and
make no decisions of their own. The host is generic over batteries (AR §12): nothing outside the
battery definition names WelaPLUS, Q5 or a Question code.

**Tech Stack:** React Native / Expo SDK 54, React Navigation native stack, expo-sqlite (real SQLite
in tests via `test-support/expoSQLiteMock`), Jest + React Native Testing Library, TypeScript for
`src/assessment-questions/`.

**Spec:**
- `docs/superpowers/specs/2026-10-14-welaplus-release-1-design.md`: §5, §8 and §10. Read its
  2026-10-23 status note first, because it amends §5 and §5.4.
- `docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md`: §7.1–7.2,
  §9.2, §11.4 and §12. This spec supersedes the Release 1 spec's §7.
- Lesson-plan spec C22: `docs/superpowers/specs/2026-10-20-lesson-plan-design.md:133`.
- Approved mockups: `.superpowers/brainstorm/17567-1792732800/content/run-flow.html`, 8 frames
  (gitignored; ask the controller for a PNG if absent).

## Global Constraints

- Bottom sheets, never dialogs: use `BottomSheet`, `SelectSheet` and `ConfirmSheet` from
  `src/components/common/`.
- Bold Red tokens only: `colors`/`spacing`/`borderRadius` from `src/constants/colors.js`,
  `typeRoles` from `src/constants/typography.js`. No raw hex in host files.
- The host must not name a Question code, `'wela_plus_full'` or `'WelaPLUS'` outside the battery
  definition. It reads titles, materials, languages and order from the `BatteryConfig`.
- `src/assessment-questions/` stays free of host imports. The boundary test in
  `src/assessment-questions/boundary/` must stay green.
- Language gating reads `battery.languages`. It never hardcodes `'af'` (C22, spec status note).
- Run code: the first 30 bits of the UUID, written in the Crockford base-32 alphabet
  `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, 6 characters, shown as `XXX-XXX`.
- AppNavigator: only add routes (`BatteryOverview`, `BatteryQuestion`, `BatteryRunSummary`). A
  parallel branch, `feat/lesson-flow`, edits that file. Do not touch `HomeScreen.js`.
- npm only. No new dependencies.
- Tests run on Node 20: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest <path>`.
- For rejection assertions use try/catch with `error.code`, not `rejects.toThrow` (it misreports
  in multi-file runs).
- Docs ship in the same branch as the code that changes them (AGENTS.md anti-drift rule).

## Review Focus

1. **Double tap on Start / Resume / Start next.** It must not create two runs or push two
   Question screens. The `launchingRef` guard and the repository's `UNFINISHED_RUN_EXISTS` are the
   two nets. Tests: Task 3 (repository) and Task 5 (screen).
2. **The EA leaves a Question mid-capture** (✕, hardware Back, swipe). This shows a discard sheet,
   writes nothing, and the Question stays undecided on the overview. Test: Task 8.
3. **A save refused because the run is no longer writable** (abandoned meanwhile, or the
   Question already decided). This shows "This run is closed", with no retry loop and no lost
   navigation. Tests: Task 3 (codes) and Task 8 (screen).
4. **The child is no longer in the EA's list** when the run is resumed. The overview opens
   read-only with "This child is no longer assigned to you — you can abandon this run." and only
   Abandon. Test: Task 7.
5. **A run started on another phone** (`started_here = 0`), opened from History. It shows the
   read-only summary, with no Finalize, no checklist and no Abandon. Test: Task 9.

---

### Task 1: Package battery surface

**Files:**
- Create: `src/assessment-questions/battery/registry.ts`
- Create: `src/assessment-questions/battery/bundledItemSets.ts`
- Create: `src/assessment-questions/battery/skippedResult.ts`
- Modify: `src/assessment-questions/types/BatteryConfig.ts`
- Modify: `src/assessment-questions/battery/wela_plus_full.ts`
- Modify: `src/assessment-questions/index.ts`
- Test: `src/assessment-questions/battery/__tests__/registry.test.ts`

**Interfaces:**
- Produces:
  - `BatteryConfig.title: string` and `BatteryConfig.aboutMinutes: number` (30 for WelaPLUS 2024.1).
  - `BatteryQuestion.title: string`. This is required, and every battery Question has one.
  - `batteryFor(code: string | null | undefined, version: string | null | undefined): BatteryConfig | null`
  - `bundledItemSetFor(questionCode: string, language: string): ItemSetMeta | null`
  - `skippedResult(question: BatteryQuestion, language: string, reason: StoppedReason): Result`.
    It throws `TypeError` when the reason does not start with `skipped_`, or when no bundled
    item set exists.
  - All of these are exported from `src/assessment-questions/index.ts`, along with the
    `ItemSetMeta` type.

- [ ] **Step 1: Write the failing tests** in `registry.test.ts`:

```ts
test('batteryFor resolves only an exact code and version', () => {
  expect(batteryFor('wela_plus_full', '2024.1')).toBe(WELA_PLUS_FULL_2024_1);
  expect(batteryFor('wela_plus_full', '2099.1')).toBeNull();
  expect(batteryFor(null, null)).toBeNull();
});
test('WelaPLUS 2024.1 titles every Question in battery order', () => {
  expect(WELA_PLUS_FULL_2024_1.title).toBe('WelaPLUS');
  expect(WELA_PLUS_FULL_2024_1.aboutMinutes).toBe(30);
  expect(WELA_PLUS_FULL_2024_1.questions.map(q => q.title)).toEqual([
    'Letter sounds', 'Listen to a story', 'First sounds', 'Blending sounds', 'Letter writing',
    'Reading words', 'Reading sentences', 'Reading a story', 'Writing words',
    'Writing sentences', 'Story writing',
  ]);
});
test.each(WELA_PLUS_FULL_2024_1.languages.flatMap(lang =>
  WELA_PLUS_FULL_2024_1.questions.map(q => [q.question_code, lang] as const)))(
  'bundled item set for %s/%s matches the battery Question', (code, lang) => {
    const q = WELA_PLUS_FULL_2024_1.questions.find(x => x.question_code === code)!;
    const set = bundledItemSetFor(code, lang)!;
    expect(set).toMatchObject({ question_code: code, question_version: q.question_version, language: lang });
  });
test('skippedResult builds a valid zero-item result', () => {
  const q = WELA_PLUS_FULL_2024_1.questions[5];
  const r = skippedResult(q, 'xh', 'skipped_tired');
  expect(r).toMatchObject({ question_code: q.question_code, question_version: q.question_version,
    item_set_id: bundledItemSetFor(q.question_code, 'xh')!.item_set_id, language: 'xh',
    duration_ms: 0, stopped_reason: 'skipped_tired', items: [],
    derived: { total_correct: 0, total_attempted: 0, percent: 0, last_attempted_position: null } });
  expect(validateResult(r).valid).toBe(true);
});
test('skippedResult refuses a non-skip reason and an unknown language', () => {
  const q = WELA_PLUS_FULL_2024_1.questions[0];
  expect(() => skippedResult(q, 'xh', 'completed')).toThrow(TypeError);
  expect(() => skippedResult(q, 'af', 'skipped_other')).toThrow(TypeError);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `npx jest src/assessment-questions/battery/__tests__/registry.test.ts`
  - Expected: FAIL. `batteryFor` and the others are not exported yet.

- [ ] **Step 3: Implement the package surface**
  - `bundledItemSets.ts` maps each battery `question_code` to the same `{en, xh}` constants its
    component passes to `resolveItemSet`.
  - Q1 `letter_sounds` uses `LETTER_SOUNDS_2026_2_EN/XH`.
  - Only list what a component bundles, so no `af` entries. A later Afrikaans battery adds them.
  - `registry.ts` holds a `const BATTERIES = [WELA_PLUS_FULL_2024_1]`.

- [ ] **Step 4: Run the package suite and type check**
  - Run: `npx jest src/assessment-questions && npm run test:types`
  - Expected: PASS, including the boundary test and the existing `wela_plus_full.test.ts`.

- [ ] **Step 5: Commit** with the message `feat(battery): registry, Question titles, bundled item sets, skippedResult`.

### Task 2: Run code and run view model

**Files:**
- Create: `src/utils/batteryRun.js`
- Test: `__tests__/batteryRun.test.js`

**Interfaces:**
- Consumes: from Task 1, `evaluateBatteryState`, `MANUAL_SKIP_REASONS` and the `BatteryConfig`
  titles. It also consumes run results in the `getRunWithResults(id).results` shape: rows with
  `question_code`, `stopped_reason`, `score`, `total_items` and a parsed `derived`.
- Produces:
  - `runCode(uuid: string): string`, for example `'KWY-2M4'`.
  - `buildRunView(battery, run): RunView`. Here `run` is
    `{ id, status, started_here, language, results }` and the return value is:

```js
// RunView
{
  code, decidedCount, totalCount, eligibleToFinalize,
  next: BatteryQuestion | null,            // evaluator's nextQuestion
  autoSkips: [{ question_code, reason }],  // evaluator passthrough
  writable: run.status === 'in_progress' && run.started_here === 1,
  writingSheetReminder: boolean,           // next is the battery's FIRST materials.item==='writing_sheet' Question
  hasWritingSheet: boolean,                // any Question uses the writing sheet
  rows: [{ number, question, state: 'done'|'skipped'|'next'|'not_started',
           detail /* 'Done' | 'Skipped · Child tired' | 'Next · Writing Sheet' | 'Not started · 1 min' | 'Not started' */,
           scoreText /* '34 / 60' | null */ }],
}
```

- `materialsLine(question, language, battery)` returns either `null` (oral) or
  `{ item: 'Reading Card', side: 'side B' | null, footer }`. The footer rule matches approved
  frame 5, and the printed footers in Task 10 use the same string:
  `<battery.title> <battery_version> · <LANGUAGE CODE, upper case> · <side ? 'side X' : item>`.
  Examples: `WelaPLUS 2024.1 · XH · side B` and `WelaPLUS 2024.1 · EN · Writing Sheet`.
- `formatRunStart(iso: string, now: Date): string` returns `'Today 09:12'` on the same local
  day, and otherwise `'Tue 14:05'` (short weekday, 24-hour clock). Tasks 4, 5 and 9 use it.

- [ ] **Step 1: Write the failing tests:**

```js
test.each([
  ['00000000-0000-4000-8000-000000000000', '000-000'],
  ['ffffffff-ffff-4fff-bfff-ffffffffffff', 'ZZZ-ZZZ'],
  ['9f3c2a10-5b7e-4c1d-8e2f-0123456789ab', 'KWY-2M4'],
  ['A3E1B7C4-0D2F-4A6B-9C8D-7E6F5A4B3C2D', 'MFG-VFH'],
])('runCode(%s) = %s', (id, code) => expect(runCode(id)).toBe(code));
test('runCode never emits I, L, O or U', () => { /* 500 uuid() samples */ });
test('fresh run: Q1 is next, nothing decided, no reminder', ...);         // rows[0].state==='next', decidedCount 0
test('done row shows score / max using derived.max when present', ...);    // Q11 result derived.max 16 -> '9 / 16'; Q1 total_items 60 -> '34 / 60'
test('skipped row uses the package label', ...);                           // skipped_tired -> 'Skipped · Child tired', scoreText null
test('writing-sheet reminder only before the first writing-sheet Question', ...); // Q1-4 decided -> true; Q1-5 decided -> false
test('not-started timed Question says the minutes', ...);                  // Q6 -> 'Not started · 1 min'
test('all decided -> eligibleToFinalize, next null', ...);
test('pulled or terminal run is not writable', ...);                       // started_here 0 or status 'completed'
test('materialsLine: oral null; card with side; sheet without side', ...); // Q2 -> null; Q6 xh -> footer 'WelaPLUS 2024.1 · XH · side B'; Q5 -> { item:'Writing Sheet', side:null, footer:'WelaPLUS 2024.1 · EN · Writing Sheet' }
test('formatRunStart: same local day -> "Today 09:12"; earlier -> "Tue 14:05"', ...);
```

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `npx jest __tests__/batteryRun.test.js`
  - Expected: FAIL. The module does not exist yet.

- [ ] **Step 3: Implement `src/utils/batteryRun.js`**
  - `buildRunView` feeds `results` into `evaluateBatteryState` as
    `{question_code, stopped_reason, score}`.
  - The skip label for `skipped_prerequisite_unmet` is `'Not reached'`.
  - Material labels: `reading_card` → `Reading Card`, `picture_cards` → `Picture Cards`,
    `writing_sheet` → `Writing Sheet`.

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `npx jest __tests__/batteryRun.test.js`
  - Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(battery): run code and pure run view model`.

### Task 3: Repository run rules

**Files:**
- Modify: `src/db/repositories/batteryRunsRepository.js`
- Modify: `src/db/repositories/assessmentsRepository.js:124-189` (`saveQuestionResult`)
- Modify: `documentation/rls-sync-contract-map.md`, the `battery_runs` / `assessments` producer
  rows
- Test: `__tests__/batteryRunsRepository.test.js` (extend; real SQLite)

**Interfaces:**
- Produces:
  - `startRun({ ..., abandonRunId = null })`. Within its single transaction:
    - When `abandonRunId` is set, it first abandons that run, under the same checks as
      `abandonRun`, and that run must belong to this child.
    - It then throws `error.code = 'UNFINISHED_RUN_EXISTS'`, with `error.runId`, if an
      `in_progress`, `started_here = 1` run exists for the same `(user_id, child_id, programme_id)`.
  - `finalizeRun(id, { questionCodes })`. It throws `error.code = 'RUN_INCOMPLETE'` unless every
    code has an `assessments` row for this run. Calling it without `questionCodes` throws
    `TypeError`. `abandonRun(id)` is unchanged.
  - `getUnfinishedRunsForUser(userId)` rows gain `question_count` (number), counted like
    `getRunsForUser`.
  - `saveQuestionResult({ batteryRunId })`. When `batteryRunId` is set, it runs inside the write
    transaction **before** the duplicate checks and throws `error.code = 'RUN_NOT_WRITABLE'`
    unless the run exists with `started_here = 1`, `status = 'in_progress'`, the same
    `child_id`, the same `user_id`, and the same `programme_id` as the resolved programme.
  - Existing codes are unchanged: `ASSESSMENT_ALREADY_SAVED` and `QUESTION_ALREADY_DECIDED`.

- [ ] **Step 1: Write the failing real-SQLite tests** in `batteryRunsRepository.test.js`:

```js
test('a second unfinished run for the same child is refused with the existing run id', ...);
// const first = await start(); try { await start(); } catch (e) { expect(e.code).toBe('UNFINISHED_RUN_EXISTS'); expect(e.runId).toBe(first.id) }
// a different child and a terminal run do not block; outbox holds exactly one battery_runs row after the refusal
test('startRun with abandonRunId abandons and starts atomically', ...);
// both rows' outbox payloads present; old status 'abandoned', new 'in_progress'
test('startRun with abandonRunId rolls both back when the insert fails', ...);
// inject outbox failure as the existing "fails atomically" test does; old run still in_progress
test('abandonRunId for another child is refused and nothing changes', ...);
test('finalizeRun refuses an incomplete run and finalizes a complete one', ...);
// save 2 skipped results via saveQuestionResult; finalizeRun(id,{questionCodes:[a,b,c]}) -> RUN_INCOMPLETE; with [a,b] -> completed
test('getUnfinishedRunsForUser counts decided Questions', ...);
test.each([
  ['abandoned run', 'status'], ['completed run', 'status'], ['pulled run', 'started_here'],
  ['another child', 'child'], ['missing run', 'missing'],
])('saveQuestionResult refuses a %s with RUN_NOT_WRITABLE and writes nothing', ...);
// assert no assessments, assessment_items or assessments outbox rows were written
```

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `npx jest __tests__/batteryRunsRepository.test.js`
  - Expected: the new tests FAIL and the existing tests pass.

- [ ] **Step 3: Implement the three rules**
  - Keep each rule's check inside the existing write transaction, so that two quick taps cannot
    both pass it.
  - Update the contract map's producer notes for `battery_runs` (one unfinished run, atomic
    replace) and `assessments` (the run guard).

- [ ] **Step 4: Run the repository tests and the full suite**
  - Run: `npx jest __tests__/batteryRunsRepository.test.js __tests__/assessmentsRepository.test.js __tests__/assessmentsRepository.questionResults.test.js && npm test`
  - Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(battery): one unfinished run per child, run guard on save, finalize completeness`.

### Task 4: Assessments tab (frame 1)

**Files:**
- Modify: `src/screens/main/AssessmentsScreen.js`
- Test: `__tests__/AssessmentsScreen.test.js` (extend)

**Interfaces:**
- Consumes:
  - `batteryFor` (Task 1) and `runCode` (Task 2);
  - `repositories.batteryRuns.getUnfinishedRunsForUser` (Task 3);
  - `programmeGate.programme.default_battery_code` / `default_battery_version`.
- Produces navigation:
  - `navigate('AssessmentChildSelect', { batteryCode, batteryVersion })` for **Start a run**;
  - `navigate('BatteryOverview', { runId })` for an unfinished row;
  - the existing `{ testCode }` for the quick rows.

- [ ] **Step 1: Write the failing tests:**

```js
test('no battery on the programme: no WelaPLUS card, quick rows still shown', ...);
test('unknown battery code/version: no card', ...);
test('battery card: title, "All 11 Questions in one run · English or isiXhosa · about 30 min", Start a run navigates with code+version', ...);
test('unfinished runs listed under the card with "4 of 11 done · Tue 14:05 · KWY-2M4", tap opens overview', ...);
test('no unfinished runs: the "Unfinished runs" header is absent', ...);
test('quick assessments are compact rows titled from STANDALONE_TESTS and still navigate with testCode', ...);
```

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `npx jest __tests__/AssessmentsScreen.test.js`
  - Expected: the new tests FAIL.

- [ ] **Step 3: Implement frame 1**
  - The card is a `SurfaceCard` with a primary `BrandButton`, "Start a run".
  - "Unfinished runs" is a `SectionHeader` plus a `ListGroup` of `ListRow`, with an `Avatar` of
    the initials as `lead`.
  - "Quick assessments" is a `SectionHeader` plus a `ListGroup` of `ListRow`, using the subtitle
    copy already in the file.
  - The language line comes from the battery's `languages` mapped through `LANGUAGE_LABELS` and
    joined with " or ".
  - "about 30 min" comes from `battery.aboutMinutes` (Task 1).
  - Format the start time with `formatRunStart` (Task 2).
  - Children's names come from `useChildren()`. A run whose child is missing shows "Child no
    longer assigned".
  - Reload on focus, as the existing stats do.
  - The tab becomes scrollable (a `ScrollView` with `useScrollBottomPadding`).

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `npx jest __tests__/AssessmentsScreen.test.js __tests__/assessmentEntryRouting.test.js`
  - Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(assess-tab): WelaPLUS card, unfinished runs, quick assessments`.

### Task 5: Child select in battery mode (frames 2–3)

**Files:**
- Modify: `src/screens/assessments/AssessmentChildSelectScreen.js`
- Test: `__tests__/AssessmentChildSelectScreen.battery.test.js` (new)

**Interfaces:**
- Consumes:
  - route params `{ batteryCode, batteryVersion }`. Battery mode applies when they are present;
    otherwise the screen keeps its existing `{ testCode }` behaviour, unchanged;
  - `batteryFor`, `runCode`, `startRun({ abandonRunId })`, `getUnfinishedRunsForUser`, and
    `UNFINISHED_RUN_EXISTS`.
- Produces: `navigation.replace('BatteryOverview', { runId })` after a successful start or
  resume.

- [ ] **Step 1: Write the failing tests:**

```js
test('header subtitle reads "WelaPLUS run · the language comes from the child\'s class"', ...);
test('ECD and Grade R children are offered', ...);
test('class language outside battery.languages: row disabled, "Not available in Afrikaans yet", no start', ...);
test('class language isiZulu: "Not available in isiZulu yet"', ...);
test('class language not set: picker lists only English and isiXhosa; confirm starts the run in the picked language', ...);
test('class xh: tap starts run with language xh, classId, battery code+version, then replaces to BatteryOverview', ...);
test('child with an unfinished run shows "Unfinished 4/11" and opens the sheet instead of starting', ...);
test('sheet: Resume replaces to that run; "Abandon it and start new" calls startRun with abandonRunId; Cancel closes', ...);
test('sheet copy: "Lwazi has an unfinished run", "Started Tue 14:05 · 4 of 11 Questions done · run KWY-2M4", warning names the saved count', ...);
test('double tap on a child starts exactly one run', ...);
test('UNFINISHED_RUN_EXISTS from the repository (race) opens the sheet for that run rather than an error', ...);
test('test mode (testCode) is unchanged', ...); // keep AssessmentChildSelectScreen.languagePicker.test.js green
```

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `npx jest __tests__/AssessmentChildSelectScreen.battery.test.js`
  - Expected: FAIL.

- [ ] **Step 3: Implement frames 2 and 3**
  - Each row shows `Avatar` initials, the name, and a subtitle `<grade> · <language label>` (or
    "class language not set").
  - The trailing element is a `StatusBadge`:
    - `tone="warning"`, `Unfinished n/11`, for a child with an unfinished run;
    - a muted caption for an unavailable language.
  - Disabled rows are announced with `accessibilityState={{ disabled: true }}` and do not
    navigate.
  - The unfinished-run sheet is a `BottomSheet` containing:
    - a primary "Resume run";
    - an amber `InlineNote tone="warning"`, "Starting new closes the old run as abandoned. Its n
      saved Questions stay in <first name>'s history.";
    - a `BrandButton variant="warning"`, "Abandon it and start new";
    - a tertiary "Cancel".
  - The run id comes from `uuid()`.
  - Generalise the existing `launchingRef` and reset it on focus.

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `npx jest __tests__/AssessmentChildSelectScreen.battery.test.js __tests__/AssessmentChildSelectScreen.languagePicker.test.js`
  - Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(battery): child select battery mode with C22 language gate and unfinished-run sheet`.

### Task 6: Extract the guarded save from StandaloneTestScreen

**Files:**
- Create: `src/hooks/useGuardedQuestionSave.js`
- Modify: `src/screens/assessments/StandaloneTestScreen.js`
- Test: `__tests__/StandaloneTestScreen.test.js`. It must pass **unchanged**, which proves this is
  a pure refactor.

**Interfaces:**
- Produces:
  `useGuardedQuestionSave({ navigation, persist: (result) => Promise<void>, onSaved: () => void, fatalCodes = [] })`,
  which returns
  `{ onStart, onComplete, result, saveError, fatalError, retry, leaveSheet: { visible, hasResult, onConfirm, onCancel } }`.
  - `persist` rejecting with an `error.code` in `fatalCodes` sets `fatalError` to that code
    instead of `saveError`, and releases the leave guard.
  - `onSaved` runs after the leave guard has released. This replaces the current
    `pendingNavigation` effect, which must stay after `usePreventRemove`.

- [ ] **Step 1: Add one hook test** in `__tests__/useGuardedQuestionSave.test.js`, through a tiny
  host component. A `persist` that rejects with `{code:'RUN_NOT_WRITABLE'}`, where
  `fatalCodes:['RUN_NOT_WRITABLE']`, sets `fatalError` to `'RUN_NOT_WRITABLE'`, leaves
  `saveError` false, and lets `goBack` leave without the discard sheet.
- [ ] **Step 2: Run it and confirm it fails**
  - Run: `npx jest __tests__/useGuardedQuestionSave.test.js`
  - Expected: FAIL.
- [ ] **Step 3: Move the guard state, effects and callbacks into the hook**
  - Make `StandaloneTestScreen` use the hook, with the same copy and the same navigation to
    `AssessmentResults`.
- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `npx jest __tests__/useGuardedQuestionSave.test.js __tests__/StandaloneTestScreen.test.js __tests__/AssessmentResultsScreen.test.js`
  - Expected: PASS, with `StandaloneTestScreen.test.js` byte-identical to `main`.
- [ ] **Step 5: Commit** with the message `refactor(assess): extract useGuardedQuestionSave from StandaloneTestScreen`.

### Task 7: Battery overview (frames 4 and 6)

**Files:**
- Create: `src/screens/assessments/battery/BatteryOverviewScreen.js`
- Modify: `src/navigation/AppNavigator.js` (add the `BatteryOverview` route only; header title is
  the child's name, set by the screen)
- Test: `__tests__/BatteryOverviewScreen.test.js` (new)

**Interfaces:**
- Consumes:
  - `buildRunView`, `runCode`, `skippedResult`, `batteryFor`;
  - `getRunWithResults`, `saveQuestionResult`, `abandonRun`;
  - `MANUAL_SKIP_REASONS`.
- Produces navigation:
  - `navigate('BatteryQuestion', { runId, questionCode })`;
  - `navigate('BatteryRunSummary', { runId })` when the run is eligible ("Review and
    finalize"), or when it is terminal (replace on focus);
  - `goBack()` after abandon.

- [ ] **Step 1: Write the failing tests:**

```js
test('header line "WelaPLUS · isiXhosa · 4 of 11 decided" and the run code badge', ...);
test('rows: done shows score / max and a success badge; skipped shows reason; next highlighted with ⋯; later rows Not started', ...);
test('only the next Question is startable: footer "Start Letter writing" navigates with that code; tapping a later row does nothing', ...);
test('writing-sheet reminder shows before the first writing-sheet Question and names the run code and child', ...);
test('⋯ opens "Skip Reading words?" with the five package reasons; confirm disabled until a reason is picked', ...);
test('confirming a skip saves skippedResult with batteryRunId and refreshes the row', ...);
test('a skip of a Question that is no longer undecided (QUESTION_ALREADY_DECIDED) refreshes without an error toast', ...);
test('all decided: footer becomes "Review and finalize" and opens BatteryRunSummary', ...);
test('Abandon run asks via ConfirmSheet, then abandons and goes back', ...);
test('autoSkips from the evaluator are saved once as skipped_prerequisite_unmet (test battery with a gate)', ...);
test('child no longer in useChildren: read-only note and only Abandon', ...);         // Review Focus 4
test('pulled or terminal run: replaces to BatteryRunSummary', ...);
test('reloads on focus after returning from a Question', ...);
test('double tap on Start next pushes one screen', ...);                               // Review Focus 1
```

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `npx jest __tests__/BatteryOverviewScreen.test.js`
  - Expected: FAIL.

- [ ] **Step 3: Implement frames 4 and 6**
  - Rows use `ListGroup`/`ListRow` with a number lead.
  - The next row's background is `colors.red50`.
  - Badges: done is `StatusBadge tone="success"` with `scoreText`; skipped is `tone="neutral"`
    "Skipped".
  - The reminder is an `InlineNote tone="warning"`: "Next is <title>. Write run code <code> and
    <first name>'s name on the Writing Sheet before you hand it over."
  - The skip picker is a `SelectSheet` with:
    - `title` "Skip <title>?";
    - `subtitle` "It is saved as skipped with your reason. You can't undo a skip in this run.";
    - `confirmLabel` "Skip Question" and `cancelLabel` "Cancel".
  - The footer has a primary `BrandButton size="lg"` plus a tertiary "Abandon run".
  - The auto-skip persistence runs once per load, behind a ref.

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `npx jest __tests__/BatteryOverviewScreen.test.js __tests__/AppNavigator.headers.test.js`
  - Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(battery): run overview with skip, reminder, abandon`.

### Task 8: Battery Question host (frame 5)

**Files:**
- Create: `src/screens/assessments/battery/BatteryQuestionScreen.js`
- Create: `src/components/assessments/MaterialsBlock.js`
- Modify: `src/navigation/AppNavigator.js` (add the `BatteryQuestion` route only;
  `headerShown: false`)
- Test: `__tests__/BatteryQuestionScreen.test.js` (new). Mock `questionComponentFor`, as
  `StandaloneTestScreen.test.js` mocks the components.

**Interfaces:**
- Consumes:
  - `questionComponentFor`, `batteryFor`, `materialsLine`, `runCode`;
  - `useGuardedQuestionSave({ fatalCodes: ['RUN_NOT_WRITABLE', 'QUESTION_ALREADY_DECIDED'] })`;
  - `saveQuestionResult({ assessmentId, result, childId, userId, batteryRunId, captureMode: result.derived.capture_mode ?? null })`.
- Produces: `goBack()` to the overview after a save, and a call to `triggerBackgroundSync()`.

- [ ] **Step 1: Write the failing tests:**

```js
test('TestFrame title "6 · Reading words", subtitle "Lwazi Mbeki · isiXhosa · KWY-2M4"', ...);
test('passes language, instructions[language], durationSec, childName, allowSkip and extraProps to the component', ...);
test('materials block "Hand Lwazi" / "Reading Card · side B" / "Footer: WelaPLUS 2024.1 · XH · side B" until onStart, then hidden', ...);
test('oral Question shows "No materials, oral"', ...);
test('onComplete saves once with batteryRunId and goes back to the overview', ...);
test('in-Question skip result is saved through the same path', ...);
test('leaving mid-capture shows the discard sheet and saves nothing', ...);              // Review Focus 2
test('save failure shows "Couldn\'t save — try again" and retry saves the same result', ...);
test('RUN_NOT_WRITABLE shows "This run is closed" with "Back to run", no retry', ...);   // Review Focus 3
test('opening a Question that is already decided or not next renders the closed state, not the component', ...);
```

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `npx jest __tests__/BatteryQuestionScreen.test.js`
  - Expected: FAIL.

- [ ] **Step 3: Implement frame 5**
  - `MaterialsBlock` uses `colors.heroDark`/`onDark`/`onDarkMuted`, with:
    - an eyebrow "HAND <FIRST NAME>";
    - an item line `<item> · <side>`;
    - a footer line "Footer: <footer>".
  - The closed state is a `BottomSheet`, "This run is closed", with body "This answer can't be
    saved because the run is no longer open." and a footer "Back to run".
  - On mount, check with `buildRunView` that `questionCode === view.next?.question_code` and that
    `view.writable`.

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `npx jest __tests__/BatteryQuestionScreen.test.js __tests__/StandaloneTestScreen.test.js`
  - Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(battery): Question host with materials block`.

### Task 9: Run summary, finalize, and history rows (frames 7–8)

**Files:**
- Create: `src/screens/assessments/battery/BatteryRunSummaryScreen.js`
- Create: `src/components/assessments/ChecklistRow.js`
- Modify: `src/screens/assessments/AssessmentHistoryScreen.js:120-170` (run rows)
- Modify: `src/navigation/AppNavigator.js` (add the `BatteryRunSummary` route only, title
  "Review run")
- Test: `__tests__/BatteryRunSummaryScreen.test.js` (new); `__tests__/AssessmentHistoryScreen.plan5.test.js` (extend)

**Interfaces:**
- Consumes: `buildRunView`, `runCode`, `finalizeRun(id, { questionCodes })`, and
  `getRunWithResults`.
- Produces:
  - `ChecklistRow({ label, checked, onToggle })`. It is 48dp minimum, with
    `accessibilityRole="checkbox"` and `accessibilityState={{ checked }}`. Its box is
    `borderRadius.sm`, `colors.fieldEdge` border, and `colors.primary` fill when checked.

- [ ] **Step 1: Write the failing tests:**

```js
test('eligible run: child name, run code, "WelaPLUS · isiXhosa · 11 of 11 decided", first four rows and "Show all 11" expands', ...);
test('one checklist row "Write run code KWY-2M4 and Lwazi\'s name on the Writing Sheet"; Finalize disabled with "Tick the box to finalize" until ticked', ...);
test('battery without a writing-sheet Question: no checklist, Finalize enabled', ...);
test('Finalize calls finalizeRun with every battery question_code, then shows the read-only summary with a "Finalized" badge', ...);
test('RUN_INCOMPLETE on finalize returns to the overview', ...);
test('completed / abandoned run: read-only, status badge, no checklist, no Finalize', ...);
test('pulled run (started_here 0): read-only with "Started on another phone"', ...);      // Review Focus 5
test('history: run row is a button "WelaPLUS · 22 Oct · 11/11" with Finalized/Open/Abandoned badge and opens BatteryRunSummary', ...);
test('history: standalone rows unchanged', ...);
```

- [ ] **Step 2: Run the tests and confirm they fail**
  - Run: `npx jest __tests__/BatteryRunSummaryScreen.test.js __tests__/AssessmentHistoryScreen.plan5.test.js`
  - Expected: FAIL.

- [ ] **Step 3: Implement frames 7 and 8**
  - Badge tones: Finalized → `success`, Open → `warning`, Abandoned → `neutral`.
  - The history row title is the battery title from `batteryFor(run.battery_code,
    run.battery_version)?.title`, falling back to the `battery_code`.

- [ ] **Step 4: Run the tests and confirm they pass**
  - Run: `npx jest __tests__/BatteryRunSummaryScreen.test.js __tests__/AssessmentHistoryScreen.plan5.test.js && npm test`
  - Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(battery): run summary with finalize checklist; history rows open runs`.

### Task 10: Docs and printout pack brief

**Files:**
- Create: `documentation/welaplus-printout-pack.md`. This is the designer's brief: Release 1
  spec §9, updated with the following changes.
  - **Side A** is Grid A, 6 × 10 (the shared EN/XH/AF letter grid), not 5 × 12.
  - Content type is **Andika Regular**.
  - The **Writing Sheet** header keeps the boxed Run code field.
  - The **Q6/Q8 card** layout matches the phone's paging rule (spec 2026-10-22 status note).
  - Every printed footer uses Task 2's footer rule exactly (`WelaPLUS 2024.1 · XH · side B`,
    `WelaPLUS 2024.1 · EN · Writing Sheet`, `WelaPLUS 2024.1 · EN · Picture Cards`), so the
    card and the app never drift.
  - The only EA tick in the app is the run-code tick (no filing tick).
- Modify: `documentation/design-system.md`. Add `ChecklistRow` and `MaterialsBlock` to the
  component inventory, with when-to-use guidance.
- Modify: `documentation/ROADMAP.md`. Mark the WelaPLUS host as built and pending the device
  gate, and list what remains (device gate, printout production).
- Modify: `CONTEXT.md`. Add a "Run code" glossary entry if the term is missing.
- Modify: `documentation/build-log.md`. Add a Plan 3 entry with the suite counts and review
  findings.
- Modify: `docs/superpowers/specs/2026-10-14-welaplus-release-1-design.md`. Add a dated status
  note pointing at the printout brief and recording that §9.1's Side A row is superseded.

- [ ] **Step 1: Write the docs.**
- [ ] **Step 2: Verify that no standing doc still claims two finalize ticks or 5 × 12**
  - Run: `git grep -n "File the sheet for Head Office\|5 rows × 12" -- documentation CONTEXT.md PRD.md`
  - Expected: no hits outside `documentation/archive/` and dated historical notes.
- [ ] **Step 3: Commit** with the message `docs(welaplus): Plan 3 host docs and printout pack brief`.

### Task 11: Device gate (controller, not Codex)

These steps run on a sqlite-staging build. Jim signs in on each device himself.

- [ ] **On the Galaxy A03s at 360dp:**
  - Run a full EN run and a full XH run.
  - Skip from ⋯, and skip from inside a Question.
  - Leave mid-Question. Expect the discard sheet; the Question stays undecided.
  - Force-quit mid-Question. Expect a restart of that Question.
  - Resume from the tab, and use the child-select sheet's Abandon and start new.
  - Finalize, with the tick required first.
  - Open the run from History.
  - Go offline for a whole run, then come back online and sync.
  - Check pixel fit of frames 1–8 against the mockups.
- [ ] **On the iPhone, on Jim's current EAS build:** check frames 1, 4, 5 and 7 for the safe area,
  home indicator and VoiceOver on `ChecklistRow`.
- [ ] **Verify the rows in staging** with the `sqlite-staging-sql` skill:
  - one `battery_runs` row with `status = 'completed'`;
  - 11 `assessments` rows with that `battery_run_id`;
  - `assessment_purpose = 'progress_check'`.
- [ ] **Record the results** in the build-log Verification Register.

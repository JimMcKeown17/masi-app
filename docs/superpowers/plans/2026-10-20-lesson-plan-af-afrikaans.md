# Lesson plan AF: Afrikaans support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afrikaans becomes a supported language in the assessment-results model. An Afrikaans class takes the Afrikaans letter and word tests without being asked, has an Afrikaans letter tracker, and every tracker mark is saved in the language it was made in.

**Architecture:** Three small changes, each with its own tests. (1) A pending tracker change carries the language and time of its tap, and an invalid change fails the save before anything is written. (2) `af` joins the language registry (`src/utils/assessmentRegistry.js`), using Zazi's provisional Afrikaans order. (3) Two `af` item sets join `CURRENT_ITEM_SETS`. Every reader of the registry and the item sets already resolves by language code and handles `null`. So once the registry and item sets have `af`, the picker, tracker, panel, dashboards and standalone test pick it up without code changes ("Readers checked" below).

**Tech Stack:** React Native 0.81 / Expo SDK 54, JavaScript app, TypeScript package (`src/assessment-questions/`, `npm run test:types`), expo-sqlite (better-sqlite3 in tests), Jest 29 + @testing-library/react-native 13.

**Spec:** `docs/superpowers/specs/2026-10-20-lesson-plan-design.md` rev 2 (`2bb103a`). This plan covers: §7.5 whole; C10 (the Afrikaans order only); C20; C21; C22 as a recorded requirement; the AF bullets of §11; and §4.2's "registry alone" save-and-reload test. The "with its interim pack" half of that test belongs to A2. Read with AR (`docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md`) §6.1 and §10.1.

**Build path:** Codex (gpt-5.6-sol) builds each task; Claude reviews the diff and runs the tests (AGENTS.md). Codex usually cannot run git commit in its sandbox, so the orchestrator runs the commit steps.

**Refreshed:** 2026-10-20 against origin/main f27b347 (#90) and spec rev 2 (2bb103a).

## Global Constraints

- **One slice, one PR** (spec §7.5 "as one slice"; §9 "ships before any pilot device is provisioned"). Tasks 1–3 land together and no build is made from an intermediate commit. Each task still ends green.
- **Language code `af`, label `Afrikaans`.**
  - `languageCodeForHomeLanguage` returns `'af'` for `afrikaans` (trimmed, any case).
  - It returns `null` for unknown or missing text, never English.
  - `LANGUAGE_LABELS.af = 'Afrikaans'`.
- **Content is copied exactly from Zazi `origin/main` `f0c9ee49`** (read 2026-10-20) and frozen:
  - `AFRIKAANS_PEDAGOGICAL_ORDER` (`src/constants/egraConstants.js:261-266`);
  - the 50 words of `AFRIKAANS_WORD_SET` / `afrikaans_words_50` (`:187-200`), in order;
  - Grid A's rows, which equal Zazi's `afrikaans_60_v2` (`:68-75`, `:95-102`).
  - Not copied: Zazi's `afrikaans_60`, its Afrikaans blend bank, its vectors.
- **Item-set ids:** `letter_sounds@2026.2.af` (rows `GRID_A_ROWS`, stop rule `{ kind: 'consecutive_wrong', stop_at: 10 }`) and `word_reading@2026.1.af` (`row_lengths` ten 5s, no `stop_rule`). A published item set is never edited; a change is a new version (AR §6.1).
- **WelaPLUS stays English and isiXhosa** (C22). `WELA_PLUS_FULL_2024_1.languages` stays `['en', 'xh']`. The host requirement is recorded in docs only (Task 3).
- **Confirmations keep storing labels** (`LANGUAGE_LABELS[code]`) until AR Plan 2 re-keys them to codes.
- **Correction time is unchanged.** Mastery writes keep the save time (`nowIso`). `madeAt` is recorded and carried through to the save untouched, but not written. AR Plan 2's `setLetterMastery` will take it (spec §7.6 ask 1).
- **No schema, RLS, payload, outbox or migration change.**
  - Local SQLite stays at v15, so the `user_version` 15 pins (`__tests__/rowVersionLocal.test.js:50,137`, `__tests__/outboxOwnerMigration.test.js:19`) are not touched.
  - The server already accepts `af`: `assessmentFamilyPayload.js:86` and `supabase/migrations/20261021120000_assessment_results_contract.sql:193` check `^[a-z]{2}$`, and `letter_mastery.language` is free text.
- **No data migration.** Afrikaans rows labelled `English` from before #90 go with AR §13's practice-data wipe (spec §4.2).
- **Tests run under Node 20.** Prefix every command with `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH"`.
  - Unit and real-SQLite files: `npx jest <path>`. The default test handle and `createMigratedDatabase` are better-sqlite3.
  - Files listed in `jest.integration.config.js` also run with `npm run test:integration -- <path>`.
  - Package types: `npm run test:types`.
  - Assert rejections with `try/catch`, not `rejects.toThrow`.
- **TDD per `.agents/skills/tdd`.** Write the failing test first and test through public interfaces. Use real SQLite for saves, reloads and outbox rows.
- **The handle rule.** Production code reaches SQLite only through the signed-in EA handle. `persistLiteracySession` keeps its `createXRepository({ database })` pattern.
- **No new dependency.** The Zazi and early-reader-books repos are read-only.
- **Docs ship in the same branch** (AGENTS.md anti-drift rule). Each task updates the docs its change makes true.

## Review Focus

1. **The first selected child changes after letters were marked.** This bug exists today for English and isiXhosa, and Afrikaans widens it. The marks keep the language of the tracker they were tapped in. Reopening that child's tracker shows them in that language, not the new first child's. Undoing every pending mark in that open tracker and tapping another letter still records the tracker's language, never the new first child's. Tests: Task 1 (real SQLite, through the form: both the reopen case and the undo-everything case), and the Afrikaans row in Task 2.
2. **A pending change that is malformed or has no tracker language.** Examples: the old boolean shape `{ a: true }`, a stored label `'English'` in place of a code, `'zu'` (a label but no tracker order), a missing `madeAt`, or a letter outside the order. The whole save is refused and nothing is written, never silently skipped. Test: Task 1 (`literacySessionPersistence.test.js`).
3. **A class whose `home_language` is spelled oddly or is unknown.** `' afrikaans '` and `'AFRIKAANS'` give `af`. `'Afrikaans and English'`, `'af'`, `''` and `null` give `null`, so the EA is asked, and the tracker keeps its empty state. Tests: Task 2 (registry table), Task 3 (picker).
4. **An Afrikaans child who also has English-labelled confirmations or a newer English result.** The Afrikaans tracker, panel and ranking ignore them. Tests: Task 2 (real-SQLite loader, panel, ranking).
5. **A language with item sets but no battery.** `af` never reaches WelaPLUS content. `LetterSoundsQuestion` with `language="af"` and no item set shows the missing-card state, not English. The battery's languages stay `en`/`xh`, and the battery-equals-standalone test runs over the battery's languages only. Test: Task 3.

## Readers checked (no code change needed)

Each reader resolves by code and handles a missing entry, so `af` works once Tasks 2–3 add it:

- **Assessment entry.**
  - `AssessmentChildSelectScreen.js:33-34, 86-97` builds the picker from `Object.keys(CURRENT_ITEM_SETS[testCode])` with `LANGUAGE_LABELS`. An Afrikaans class starts directly.
  - `ChildResultsScreen.js:40-49`.
  - `StandaloneTestScreen.js:29, 125` (the item set and the header label).
- **Tracker and panel.**
  - `masteryState.js:13-38`.
  - `LetterMasteryPanel.js:32-35`.
  - `LetterTrackerBottomSheet.js:44`.
- **Dashboards.** `dashboardStats.js:187-237` uses `total = pedOrder.length`.
- **"n/26" displays.** `LetterMasteryPanel.js:183` and `LetterTrackerBottomSheet.js:153` are literal `26`. Every tracker order has exactly 26 letters, which Task 2 pins with a test.
- **Score bands.** `scoreBands.js:16-23, 53-57` has only `'*'` rows, so `af` falls to `'*'`. This gets a doc note only.
- **Language labels in history.** `AssessmentHistoryScreen.js:142` and `AssessmentDetailScreen.js:73` show `LANGUAGE_LABELS[code]`.
- **Package Questions.** `LetterSoundsQuestion/index.tsx:24-25` and `ReadWordsQuestion/index.tsx:84-89` keep bundled defaults for `en`/`xh` only, the battery's languages. The standalone host always passes the item set. **(plan call)** These are left unchanged, so the battery path never gets an Afrikaans default (C22).
- **Dead code in `egraConstants.js`.** `LETTER_SETS`, `WORD_SETS`, its own `PEDAGOGICAL_ORDERS` (keyed `english`/`isixhosa`), `getLetterSetById` and `getItemSetById` (`:37, :72, :88-102`) have had no importers since #90. **(plan call)** AF adds only `AFRIKAANS_PEDAGOGICAL_ORDER` and leaves them alone; removing them is separate cleanup.
- **Class creation.** `options.js:3` `HOME_LANGUAGES` already offers `Afrikaans`.

---

### Before Task 1: preflight (orchestrator, no commit)

- [ ] **Step 1: Branch.** Create a worktree on `feat/lesson-plan-af`.
  - Base it on `origin/main` once the lesson-plan design branch (`feat/lesson-plan`: spec and plans) has merged.
  - Until then, base it on `feat/lesson-plan`, so the spec this plan cites is on the branch.
  - Run `npm ci` (a fresh worktree has no `node_modules`).
- [ ] **Step 2: Baseline.** Run `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest` and `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npm run test:integration`. Expected: PASS. Record the suite and test counts for the build log.

---

### Task 1: Each tracker change keeps the language and time of its tap

Today the session form takes one language from the first selected child (`LiteracySessionForm.js:304-310`) and applies it to every pending change at save (`literacySessionPersistence.js:29-31`). It also returns silently when that language has no order (`:75-77`). So marks made while an isiXhosa child was first are saved as English if that child is deselected and reselected before Submit. This task fixes that for English and isiXhosa now. Task 2 extends the same test to Afrikaans.

**(plan call)** This task goes first so that no commit has Afrikaans in the registry while the old save path can still relabel marks.

**Files:**
- Modify: `src/utils/masteryState.js:40-48` (`countMastered`), plus two new exports below it
- Modify: `src/components/session/LetterTrackerBottomSheet.js:21-28` (prop docs), `:67-77` (`getCellState`), `:79-107` (`handleCellTap`), `:122` (`added`)
- Modify: `src/screens/sessions/LiteracySessionForm.js`: imports `:16-21`; comment `:146`; `getTrackerChangeCount` `:312-316`; the persist call `:357-363`; the sheet's `languageCode` `:456`
- Modify: `src/services/literacySessionPersistence.js:1, 17-31, 38-46, 75-77, 87-144`
- Modify (docs):
  - `documentation/rls-sync-contract-map.md:879` (`letter_mastery` row);
  - `CONTEXT.md:113` (Letter mastery).
- Test:
  - `__tests__/LetterTrackerBottomSheet.test.js`
  - `__tests__/masteryState.test.js:103-126`
  - `__tests__/literacySessionPersistence.test.js`
  - `__tests__/completionPathBudget.test.js:116-126`
  - `__tests__/foreignKeyEnforcement.test.js:62-82`
  - `__tests__/LiteracySessionForm.test.js`
  - `__tests__/LiteracySessionForm.submit.test.js`

**Interfaces:**
- Consumes: `PEDAGOGICAL_ORDERS`, `LANGUAGE_LABELS` (`src/utils/assessmentRegistry.js`).
- Produces (the sheet's shape; the lesson draft, C1, uses the same shape):
  - **Pending tracker change** `{ mastered: boolean, languageCode: string, madeAt: string /* ISO tap time */ }`.
    - The form holds `letterTrackerChanges: { [childId]: { [letter]: PendingTrackerChange } }`.
    - The sheet's `pendingChanges` and `onChangesUpdate(changes)` carry one child's `{ [letter]: PendingTrackerChange }`.
  - `countMastered({ assessmentMastered, taughtLetters, pendingChanges = {}, pedagogicalOrder }) → number` reads `pendingChanges[letter]?.mastered` (true counts, false removes). The signature is unchanged.
  - `pendingChangesLanguageCode(pendingChanges) → string | null` (`masteryState.js`): the `languageCode` of the first entry of `Object.values(pendingChanges ?? {})`, or `null` when there is none.
  - `assertTrackerChanges(changesByChild) → void` (`masteryState.js`; the lesson save path reuses it).
    - It throws an `Error` with `code = 'TRACKER_CHANGE_INVALID'` and the message `Letter tracker change for child ⟨childId⟩, letter ⟨letter⟩ is malformed or has no tracker language (⟨String(languageCode)⟩)`.
    - **(plan call)** A change is valid only when it is a non-null object; `typeof mastered === 'boolean'`; `PEDAGOGICAL_ORDERS` has `languageCode` as an own key; that order includes `letter`; and `madeAt` is a string with a finite `Date.parse`.
  - `LetterTrackerBottomSheet`: the toggle rule is unchanged. A new entry is `{ mastered, languageCode: <the languageCode prop>, madeAt: new Date().toISOString() }`, stamped at the tap.
  - `LiteracySessionForm`:
    - `trackerLanguageCode` (first selected child's class) stays, as the default.
    - **(plan call)** The sheet's language is fixed **when the EA opens it**: `pendingChangesLanguageCode(letterTrackerChanges[child.id]) ?? trackerLanguageCode`, held in form state with the open child (`trackerSheet = { childId, languageCode }`) and passed to the sheet unchanged until it closes. Emptying the pending map while the sheet is open (undoing every mark) never changes it, so the next tap is stamped in the same language (Codex AF round 1). A child's pending marks therefore always share one language and are shown in it.
    - `getTrackerChangeCount` counts entries with `mastered === true`.
  - `persistLiteracySession({ handle, database = handle, session, letterTrackerChanges = {}, nowIso, idFactory }) → Promise<true>`:
    - `trackerLanguageCode` is removed.
    - Before `runRepositoryTransaction`, it filters the changes to attendees (the filter moves up from `:43-46`) and calls `assertTrackerChanges` on them.
    - Each change is written with `LANGUAGE_LABELS[change.languageCode]`.
    - Timestamps stay `nowIso`.
    - The silent return at `:75-77` goes; the function returns early only when there are no attendee changes.

- [ ] **Step 1: Write the failing tests.**
  - `__tests__/LetterTrackerBottomSheet.test.js`:
    - Add `const NOW = '2026-10-20T08:15:00.000Z';`, `const change = (mastered, languageCode = 'en', madeAt = '2026-10-19T08:00:00.000Z') => ({ mastered, languageCode, madeAt });` and `afterEach(() => jest.useRealTimers())`.
    - The first test passes `pendingChanges: { e: change(true), s: change(false) }`, and its assertions are unchanged.
    - The toggle table (`:82-93`) runs under `jest.useFakeTimers(); jest.setSystemTime(new Date(NOW));`, with these rows:

```js
['a, taught by coach', {}, { a: change(false, 'en', NOW) }],
['e, taught, added this session', { e: change(true) }, {}],
['s, not mastered', { s: change(false) }, {}],
['e, not mastered', {}, { e: change(true, 'en', NOW) }],
```

  - `__tests__/masteryState.test.js` (`countMastered` block):
    - Define the same `change` helper there.
    - Rewrite both pending maps as `{ c: change(false), d: change(true) }` (expect 3) and `{ m: change(true), s: change(false) }` (expect 2).
    - Add `pendingChangesLanguageCode({ a: change(true, 'xh') })` → `'xh'`, and `pendingChangesLanguageCode({})` and `pendingChangesLanguageCode(undefined)` → `null`.
  - `__tests__/literacySessionPersistence.test.js`:
    - Drop every `trackerLanguageCode: 'en'`. Write each change as `{ mastered, languageCode: 'en', madeAt: MADE_AT }` with `const MADE_AT = '2026-05-20T08:00:00.000Z'`. Every existing assertion stays.
    - In the non-attendee test (`:170-172`), give the removed child `{ a: { mastered: true, languageCode: null, madeAt: MADE_AT } }`. The save still succeeds and writes no mastery row (validation covers attendees only).
    - Add:

```js
test('saves each tracker change with the language it was made in, stamped with the save time', async () => {
  // seed 'child-1' and 'child-2' in class-1 as the non-attendee test does, then delete from sync_outbox
  await persistLiteracySession({ database: db,
    session: { id: 'session-mixed', user_id: 'user-1', programme_id: 'programme-a', session_date: '2026-05-21',
      children_ids: ['child-1', 'child-2'], activities: { letters_focused: ['a'] }, synced: false },
    letterTrackerChanges: { 'child-1': { a: { mastered: true, languageCode: 'xh', madeAt: MADE_AT } },
      'child-2': { m: { mastered: true, languageCode: 'en', madeAt: MADE_AT } } },
    nowIso: '2026-05-21T09:30:00.000Z', idFactory: () => 'unused-id' });
  expect(await db.getAllAsync('select child_id, letter, language, created_at from letter_mastery order by child_id'))
    .toEqual([{ child_id: 'child-1', letter: 'a', language: 'isiXhosa', created_at: '2026-05-21T09:30:00.000Z' },
      { child_id: 'child-2', letter: 'm', language: 'English', created_at: '2026-05-21T09:30:00.000Z' }]);
});

test.each([
  ['a code with no tracker order', { a: { mastered: true, languageCode: 'zu', madeAt: MADE_AT } }],
  ['a stored label instead of a code', { a: { mastered: true, languageCode: 'English', madeAt: MADE_AT } }],
  ['a missing language', { a: { mastered: true, madeAt: MADE_AT } }],
  ['the old boolean shape', { a: true }],
  ['a missing tap time', { a: { mastered: true, languageCode: 'en' } }],
  ['a letter outside the order', { ch: { mastered: true, languageCode: 'en', madeAt: MADE_AT } }],
  ['a non-boolean mastered', { a: { mastered: 'yes', languageCode: 'en', madeAt: MADE_AT } }],
])('refuses the whole save for %s and writes nothing', async (_, changes) => {
  // seed 'child-1', then delete from sync_outbox
  let error;
  try {
    await persistLiteracySession({ database: db,
      session: { id: 'session-refused', user_id: 'user-1', programme_id: 'programme-a', session_date: '2026-05-21',
        children_ids: ['child-1'], activities: { letters_focused: ['a'] }, synced: false },
      letterTrackerChanges: { 'child-1': changes }, nowIso: '2026-05-21T09:30:00.000Z', idFactory: () => 'unused-id' });
  } catch (caught) { error = caught; }
  expect(error?.code).toBe('TRACKER_CHANGE_INVALID');
  expect(await db.getAllAsync('select id from sessions')).toEqual([]);
  expect(await db.getAllAsync('select id from letter_mastery')).toEqual([]);
  expect(await db.getAllAsync('select id from sync_outbox')).toEqual([]);
});
```

  - `__tests__/completionPathBudget.test.js:116-126` and `__tests__/foreignKeyEnforcement.test.js:62-82`: drop `trackerLanguageCode` and use the new shape with `languageCode: 'en'`. The query budget and FK assertions are unchanged; validation adds no SQL.
  - `__tests__/LiteracySessionForm.test.js` (mocked persistence), add:

```js
test('tracker changes reach the save with their own language and tap time, and no session-wide language', async () => {
  const screen = renderForm();
  fireEvent.press(screen.getByText('Amahle Dlamini'));
  fireEvent.press(screen.getByLabelText('Amahle Dlamini, letter tracker, Update'));
  fireEvent.press(await screen.findByLabelText('a, not mastered'));
  fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByLabelText('Amahle Dlamini, letter tracker, 1 new')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('A, not selected'));
  fireEvent.press(screen.getByText('Select a level'));
  fireEvent.press(screen.getByText(READING_LEVELS[0]));
  fireEvent.press(screen.getByText('Submit session'));
  await waitFor(() => expect(mockPersistLiteracySession).toHaveBeenCalledTimes(1));
  const args = mockPersistLiteracySession.mock.calls[0][0];
  expect(args).not.toHaveProperty('trackerLanguageCode');
  const tapped = args.letterTrackerChanges['child-1'].a;
  expect(tapped).toEqual({ mastered: true, languageCode: 'en', madeAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/) });
  expect(Date.parse(tapped.madeAt)).toBeLessThanOrEqual(Date.parse(args.nowIso));
});
```

  - `__tests__/LiteracySessionForm.submit.test.js`, which runs on real SQLite through the real sheet and persistence:
    - Make the context mocks read `mockClasses` and `mockChildren`, reset in `beforeEach` to `[mockClass]` and `[mockChild]`, so existing tests are unchanged.
    - Import `loadMasteryState` from `../src/utils/masteryState`.
    - Add the test below. Task 2 adds an `['Afrikaans', 'Afrikaans', 'af']` row to it.

```js
const SECOND_CLASS = { id: 'class-2', name: 'Grade 1B', home_language: 'English' };
const SECOND_CHILD = { id: '55555555-5555-4555-8555-555555555555', first_name: 'Ben', last_name: 'Smith', class_id: 'class-2' };

test.each([['isiXhosa', 'isiXhosa', 'xh']])(
  'marks made in a %s tracker keep that language after the first selected child changes', async (homeLanguage, label, code) => {
    mockClass.home_language = homeLanguage;
    mockClasses = [mockClass, SECOND_CLASS];
    mockChildren = [mockChild, SECOND_CHILD];
    await handle.withTransaction(tx => tx.runAsync(
      'insert into children (id, first_name, last_name, created_by) values (?, ?, ?, ?)', SECOND_CHILD.id, 'Ben', 'Smith', EA));
    await handle.repositories.mastery.saveLetterMasteryRecord({
      id: 'stored-k', user_id: EA, child_id: mockChild.id, letter: 'k', language: label, source: 'taught' });
    const screen = renderForm();
    fireEvent.press(screen.getByLabelText('Amahle Dlamini, Grade 1A'));
    fireEvent.press(screen.getByLabelText('Ben Smith, Grade 1B'));
    fireEvent.press(screen.getByLabelText('Amahle Dlamini, letter tracker, Update'));
    expect(await screen.findByLabelText('k, taught by coach')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('a, not mastered'));
    fireEvent.press(screen.getByLabelText('m, not mastered'));
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    fireEvent.press(screen.getByLabelText('Amahle Dlamini, Grade 1A')); // deselect: Ben (English) is now first
    fireEvent.press(screen.getByLabelText('Amahle Dlamini, Grade 1A')); // reselect after Ben
    fireEvent.press(screen.getByLabelText('Amahle Dlamini, letter tracker, 2 new'));
    expect(await screen.findByLabelText('k, taught by coach')).toBeTruthy(); // still her class language, not English
    expect(screen.getByLabelText('a, taught, added this session')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    fireEvent.press(screen.getByLabelText('A, not selected'));
    fireEvent.press(screen.getByText('Select a level'));
    fireEvent.press(screen.getByText(READING_LEVELS[0]));
    fireEvent.press(screen.getByText('Submit session'));
    await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));
    const reader = await handle.getReader();
    expect(await reader.getAllAsync(
      'select letter, language from letter_mastery where child_id = ? and deleted_at is null order by letter', mockChild.id))
      .toEqual(['a', 'k', 'm'].map(letter => ({ letter, language: label })));
    const reloaded = await loadMasteryState({
      repositories: handle.repositories, userId: EA, childId: mockChild.id, languageCode: code });
    expect(reloaded.taughtRecords.map(r => r.letter).sort()).toEqual(['a', 'k', 'm']); // reloads in its own tracker
  });

  // Same setup as the test above (Amahle in her class language with a seeded taught 'k'; Ben in English).
  test('undoing every pending mark in an open tracker keeps that tracker\'s language', async () => {
    // select Amahle, then Ben; open Amahle's tracker; mark 'a'; Done; deselect and reselect Amahle (Ben is first)
    fireEvent.press(screen.getByLabelText('Amahle Dlamini, letter tracker, 1 new'));
    expect(await screen.findByLabelText('k, taught by coach')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('a, taught, added this session')); // undo: her pending map is now {}
    expect(screen.getByLabelText('k, taught by coach')).toBeTruthy(); // the open sheet did not switch to English
    fireEvent.press(screen.getByLabelText('e, not mastered'));
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    // pick a letter and a level, submit, wait for completion (as above)
    const reader = await handle.getReader();
    expect(await reader.getAllAsync(
      'select letter, language from letter_mastery where child_id = ? and deleted_at is null order by letter', mockChild.id))
      .toEqual(['e', 'k'].map(letter => ({ letter, language: label })));
    expect(await reader.getFirstAsync(
      "select count(*) as n from letter_mastery where child_id = ? and language = 'English'", mockChild.id))
      .toEqual({ n: 0 });
    const outbox = await reader.getAllAsync("select payload from sync_outbox where table_name = 'letter_mastery'");
    expect(outbox.map(row => JSON.parse(row.payload).language)).toEqual([label]);
  });
```
  The last assertion reads `sync_outbox.payload`, the record JSON that `enqueueDomainOutbox` stores for `letter_mastery` (`masteryRepository.js:50-61`).

- [ ] **Step 2: Run the tests to verify they fail.** Run `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest __tests__/LetterTrackerBottomSheet.test.js __tests__/masteryState.test.js __tests__/literacySessionPersistence.test.js __tests__/LiteracySessionForm.test.js __tests__/LiteracySessionForm.submit.test.js`. Expected: FAIL. The sheet emits booleans, `pendingChangesLanguageCode` is not a function, the refusal rows save, and the mixed-class marks are saved as `English`.
- [ ] **Step 3: Implement** per the Interfaces block in `masteryState.js`, the sheet, the form and `literacySessionPersistence.js`. Update the sheet's prop docs (`:25-27`) and the form's state comment (`:146`) to the new shape.
- [ ] **Step 4: Update the docs this task makes true.**
  - `documentation/rls-sync-contract-map.md:879` (`letter_mastery`):
    - Append to the operation-notes cell: "**Session-form producer (`persistLiteracySession`):** each pending tracker change carries the language code it was tapped in (`{ mastered, languageCode, madeAt }`) and is written with that language's label (`LANGUAGE_LABELS[code]`) until Assessment Results Plan 2 re-keys to codes. Nothing re-derives the language at save. A change whose code has no tracker order, or that is malformed, fails the whole save before the transaction. `madeAt` is carried, not written; timestamps stay the save time until Plan 2 accepts a correction time."
    - Add `literacySessionPersistence.test.js` to the tests cell.
  - `CONTEXT.md:113`: after "Plan 1 confirmations still store language labels (…), while Question results use codes.", add "A confirmation made in the session tracker keeps the language of the tracker it was tapped in; saving never re-derives it."
- [ ] **Step 5: Run the tests to verify they pass.**
  - Run the five files from Step 2, then `__tests__/LetterTrackerBottomSheet.plan5.test.js __tests__/completionPathBudget.test.js __tests__/foreignKeyEnforcement.test.js __tests__/ChildSelector.renderCount.test.js`.
  - Then run `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npm run test:integration -- __tests__/LiteracySessionForm.submit.test.js __tests__/foreignKeyEnforcement.test.js`, then the full unit suite.
  - Expected: PASS. `grep -rn "trackerLanguageCode" src __tests__` matches only `LiteracySessionForm.js`'s first-child default and the new `not.toHaveProperty('trackerLanguageCode')` assertion.
- [ ] **Step 6: Commit**

```bash
git add src/utils/masteryState.js src/components/session/LetterTrackerBottomSheet.js src/screens/sessions/LiteracySessionForm.js \
  src/services/literacySessionPersistence.js documentation/rls-sync-contract-map.md CONTEXT.md \
  __tests__/LetterTrackerBottomSheet.test.js __tests__/masteryState.test.js __tests__/literacySessionPersistence.test.js \
  __tests__/completionPathBudget.test.js __tests__/foreignKeyEnforcement.test.js __tests__/LiteracySessionForm.test.js \
  __tests__/LiteracySessionForm.submit.test.js
git commit -m "fix(tracker): each pending change keeps the language and time of its tap; invalid changes fail the save"
```

---

### Task 2: Afrikaans in the language registry (tracker, mastery, dashboards)

**Files:**
- Modify: `src/constants/egraConstants.js`: add `AFRIKAANS_PEDAGOGICAL_ORDER` after `ISIXHOSA_PEDAGOGICAL_ORDER` (`:82-86`)
- Modify: `src/utils/assessmentRegistry.js:1, 5, 7-17, 19-22`
- Modify: `src/components/session/LetterTrackerBottomSheet.js:25` (prop doc: `'en', 'xh', 'af', 'zu' or null`)
- Modify (docs):
  - `CONTEXT.md:113`;
  - `documentation/egra_letter_sets.md:33-42`;
  - `docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md`, after `:640-643` (§10.1 Migrations).
- Test:
  - `__tests__/assessmentRegistry.test.js`
  - `__tests__/masteryState.test.js`
  - `__tests__/LetterTrackerBottomSheet.test.js`
  - `__tests__/LetterMasteryPanel.test.js:82`
  - `__tests__/dashboardStats.letterMastery.test.js:80`
  - `__tests__/LetterMasteryRankingScreen.test.js:84`
  - `__tests__/LiteracySessionForm.submit.test.js:314` and Task 1's test

**Interfaces:**
- Consumes: Task 1's pending-change shape.
- Produces:
  - `AFRIKAANS_PEDAGOGICAL_ORDER` (`egraConstants.js`) is `Object.freeze(['a','s','m','e','k','i','r','o','n','t','d','l','p','u','b','g','h','v','w','y','f','j','c','z','x','q'])`. Its comment says it is Zazi's provisional order, pending the official Afrikaans sequence, and cites Zazi `f0c9ee49` `src/constants/egraConstants.js:261-266`.
  - A1's Afrikaans interim pack must equal this order, and A2 may assert that it does.
  - `languageCodeForHomeLanguage`: a new `case 'afrikaans': return 'af';`.
  - `LANGUAGE_LABELS = { en: 'English', xh: 'isiXhosa', zu: 'isiZulu', af: 'Afrikaans' }`.
  - `PEDAGOGICAL_ORDERS = { en, xh, af: AFRIKAANS_PEDAGOGICAL_ORDER }`.
  - **(plan call)** `af` is appended last in each map.

- [ ] **Step 1: Write the failing tests.**
  - `__tests__/assessmentRegistry.test.js`:
    - In the mapping table (`:5-13`), replace `['Afrikaans', null]` with `['Afrikaans', 'af'], [' afrikaans ', 'af'], ['AFRIKAANS', 'af']`, and add `['Afrikaans and English', null], ['af', null]`.
    - `LANGUAGE_LABELS` now equals `{ en: 'English', xh: 'isiXhosa', zu: 'isiZulu', af: 'Afrikaans' }`.
    - The `PEDAGOGICAL_ORDERS` literal (`:51-54`) gains `af` with the 26 letters above.
    - Add:

```js
import { HOME_LANGUAGES } from '../src/constants/options';

test('every tracker order is a–z once, has a stored label, and the Afrikaans order is frozen', () => {
  for (const [code, order] of Object.entries(registry.PEDAGOGICAL_ORDERS)) {
    expect([...order].sort().join('')).toBe('abcdefghijklmnopqrstuvwxyz');
    expect(typeof registry.LANGUAGE_LABELS[code]).toBe('string');
  }
  expect(Object.isFrozen(registry.PEDAGOGICAL_ORDERS.af)).toBe(true);
});
test('every class language an EA can choose has a tracker language', () => {
  const codes = HOME_LANGUAGES.map(registry.languageCodeForHomeLanguage);
  expect(codes).toEqual(['xh', 'en', 'af']);
  for (const code of codes) expect(registry.PEDAGOGICAL_ORDERS[code]).toHaveLength(26);
});
```

  - `__tests__/masteryState.test.js` (real SQLite, `createFamilySyncFixture`), add:

```js
test('an Afrikaans child reads Afrikaans results and confirmations only', async () => {
  const af = await f.save(4, { result: questionResult(4, {
    question_version: '2026.2', item_set_id: 'letter_sounds@2026.2.af', language: 'af',
    items: ['l', 'a', 'm', 'E'].map((prompt, position) => ({
      position, item_key: String(position), prompt, is_correct: position !== 1, metadata: { row: 0, reached: true } })),
  }) });
  const en = await f.save(1, { result: questionResult(1, {
    items: [{ position: 0, item_key: '0', prompt: 'z', is_correct: true, metadata: { reached: true } }] }) });
  await f.db.runAsync("update assessments set assessment_date = '2099-01-01' where id = ?", en.id);
  await confirm('k', 'Afrikaans');
  await confirm('s', 'English');
  const state = await load('af');
  expect(state.pedagogicalOrder).toEqual(['a','s','m','e','k','i','r','o','n','t','d','l','p','u','b','g','h','v','w','y','f','j','c','z','x','q']);
  expect(state.latestAssessment.id).toBe(af.id);
  expect(state.assessmentMastered).toEqual(new Set(['l', 'm', 'e']));
  expect(state.taughtRecords.map(r => [r.letter, r.language])).toEqual([['k', 'Afrikaans']]);
  expect(countMastered({ ...state, taughtLetters: new Set(state.taughtRecords.map(r => r.letter)) })).toBe(4);
});
```

  - `__tests__/LetterTrackerBottomSheet.test.js` (import `PEDAGOGICAL_ORDERS` from `../src/utils/assessmentRegistry`), add:

```js
test('an Afrikaans tracker shows the Afrikaans order and confirmations and stamps af on new marks', async () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date(NOW));
  masteryRepository.getLetterMastery.mockResolvedValue([{ ...stored('a'), language: 'Afrikaans' }, stored('s')]);
  const onChangesUpdate = jest.fn();
  const screen = renderSheet({ languageCode: 'af', onChangesUpdate });
  expect(await screen.findByLabelText('a, taught by coach')).toBeTruthy();
  expect(screen.getByLabelText('s, not mastered')).toBeTruthy();
  expect(screen.getAllByText(/^[a-z]$/).map(node => node.props.children)).toEqual(PEDAGOGICAL_ORDERS.af);
  expect(screen.getByText('Amahle Dlamini · 1/26 letters')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('m, not mastered'));
  expect(onChangesUpdate).toHaveBeenCalledWith({ m: { mastered: true, languageCode: 'af', madeAt: NOW } });
});
```

  - `__tests__/LetterMasteryPanel.test.js`: change `:82`'s list to `[null, 'isiZulu']`, then add:

```js
test('an Afrikaans class shows Afrikaans confirmations only and saves new marks as Afrikaans', async () => {
  masteryRepository.getLetterMastery.mockResolvedValue([
    { id: 'rec-a', child_id: child.id, letter: 'a', language: 'Afrikaans', _deleted: false },
    { id: 'rec-s', child_id: child.id, letter: 's', language: 'English', _deleted: false },
  ]);
  const screen = render(<LetterMasteryPanel child={child} classItem={{ id: 'class-af', home_language: 'Afrikaans' }} />);
  expect(await screen.findByLabelText('a, taught by coach')).toBeTruthy();
  expect(assessmentsRepository.latestLetterResult).toHaveBeenCalledWith({ userId: 'user-1', childId: child.id, language: 'af' });
  expect(screen.getByLabelText('s, not mastered')).toBeTruthy();
  expect(screen.getByText('1 / 26 letters mastered')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('m, not mastered'));
  await waitFor(() => expect(masteryRepository.saveLetterMasteryRecord).toHaveBeenCalledWith(
    expect.objectContaining({ letter: 'm', language: 'Afrikaans' })));
});
```

  - `__tests__/dashboardStats.letterMastery.test.js`: drop `'Afrikaans'` from `:80`'s list, then add:

```js
test('an Afrikaans child counts Afrikaans results and confirmations only, out of 26', () => {
  const afClass = { id: child.class_id, home_language: 'Afrikaans' };
  const afResult = result({ language: 'af', items: [item('L', true), item('a', true), item('m', false)] });
  const newerEnglish = result({ id: 'assessment-2', language: 'en', assessment_date: '2026-10-21', items: [item('z', true)] });
  const confirmations = [{ child_id: child.id, language: 'Afrikaans', letter: 'k' }, { child_id: child.id, language: 'English', letter: 's' }];
  expect(getLetterMasteryRanking([child], [afResult, newerEnglish], confirmations, [afClass]))
    .toEqual([{ child, masteredCount: 3, total: 26, percent: 12 }]);
});
```

  - `__tests__/LetterMasteryRankingScreen.test.js:84`: the list becomes `[null, undefined, 'isiZulu']`.
  - `__tests__/LiteracySessionForm.submit.test.js`: change `:314`'s list to `[null, 'isiZulu']`, and add the row `['Afrikaans', 'Afrikaans', 'af']` to Task 1's `test.each`. This is the spec §7.5 test, and §4.2's "registry alone" save-and-reload.
- [ ] **Step 2: Run the tests to verify they fail.** Run `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest __tests__/assessmentRegistry.test.js __tests__/masteryState.test.js __tests__/LetterTrackerBottomSheet.test.js __tests__/LetterMasteryPanel.test.js __tests__/dashboardStats.letterMastery.test.js __tests__/LiteracySessionForm.submit.test.js`. Expected: FAIL. `'Afrikaans'` maps to `null`, and the Afrikaans states are empty.
- [ ] **Step 3: Implement** per the Interfaces block (`egraConstants.js`, `assessmentRegistry.js`, the sheet's prop doc).
- [ ] **Step 4: Update the docs this task makes true.**
  - `CONTEXT.md:113`: the stored labels become (`English`, `isiXhosa`, `Afrikaans`, `isiZulu`).
  - `documentation/egra_letter_sets.md:38-39`: add "**Afrikaans (provisional, Zazi's order pending the official Afrikaans sequence):** a, s, m, e, k, i, r, o, n, t, d, l, p, u, b, g, h, v, w, y, f, j, c, z, x, q", and note that the lesson plan's interim Afrikaans pack uses the same order (spec C10).
  - AR spec, after `:643` (§10.1 Migrations), add a dated blockquote: "> **Status update — ⟨date⟩ (lesson-plan AF):** Afrikaans is a supported language (`af`). Plan 1 confirmations for it are stored as `Afrikaans`, so the hosted and local re-key must also map `Afrikaans` to `af` (lesson-plan spec §7.6, ask 2)."
- [ ] **Step 5: Run the tests to verify they pass.** Run the Step 2 files plus `__tests__/LetterMasteryRankingScreen.test.js __tests__/LetterTrackerBottomSheet.plan5.test.js __tests__/LetterTrackerScreen.plan5.test.js`. Then run `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npm run test:integration -- __tests__/LiteracySessionForm.submit.test.js`, then the full unit suite. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add src/constants/egraConstants.js src/utils/assessmentRegistry.js src/components/session/LetterTrackerBottomSheet.js \
  CONTEXT.md documentation/egra_letter_sets.md docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md \
  __tests__/assessmentRegistry.test.js __tests__/masteryState.test.js __tests__/LetterTrackerBottomSheet.test.js \
  __tests__/LetterMasteryPanel.test.js __tests__/dashboardStats.letterMastery.test.js __tests__/LetterMasteryRankingScreen.test.js \
  __tests__/LiteracySessionForm.submit.test.js
git commit -m "feat(af): Afrikaans in the language registry, with Zazi's provisional tracker order"
```

---

### Task 3: Afrikaans letter and word tests

**Files:**
- Create: `src/assessment-questions/itemsets/letter_sounds@2026.2.af.ts`, `src/assessment-questions/itemsets/word_reading@2026.1.af.ts`
- Modify:
  - `src/assessment-questions/itemsets/current.ts:1-9`;
  - `src/assessment-questions/itemsets/index.ts:5-8`;
  - `src/assessment-questions/index.ts:15-23`;
  - `src/assessment-questions/itemsets/contentStatus.ts:7-10`.
- Modify (docs):
  - `documentation/egra_letter_sets.md:10-22`;
  - `documentation/assessment-score-bands-config.md:24, 55-57`;
  - `PRD.md:282-283`;
  - `documentation/ROADMAP.md:754`, plus §8 "Integration and contract work" (after `:779-780`);
  - `docs/superpowers/specs/2026-10-14-welaplus-release-1-design.md:3-8` (status block);
  - `CONTEXT.md:133`;
  - AR spec after `:205-206` (§6.1 "Language codes").
- Test:
  - `src/assessment-questions/__tests__/letterTestContent.test.ts`
  - `src/assessment-questions/__tests__/itemSetIntegrity.test.tsx`
  - `src/assessment-questions/__tests__/itemSetResolution.test.tsx`
  - `__tests__/assessmentRegistry.test.js:39-47`
  - `__tests__/AssessmentChildSelectScreen.languagePicker.test.js:141-182`
  - `__tests__/assessmentEntryRouting.test.js:150-158`
  - `__tests__/StandaloneTestScreen.test.js:91-96, 275`

**Interfaces:**
- Consumes: Task 2's `LANGUAGE_LABELS.af` and `languageCodeForHomeLanguage`.
- Produces:
  - **(plan call)** Each set is declared with its type and then frozen by statement (`Object.freeze(X)`), so the declared type is kept. Wrapping the literal in `Object.freeze(...)` would widen `stop_rule.kind` and turn `words` into a readonly array, which `npm run test:types` rejects.
  - `LETTER_SOUNDS_2026_2_AF: LetterSoundsItemSet = { item_set_id: 'letter_sounds@2026.2.af', question_code: 'letter_sounds', question_version: '2026.2', language: 'af', rows: GRID_A_ROWS, stop_rule: { kind: 'consecutive_wrong', stop_at: 10 } }`, then frozen. A header comment gives the provenance: the same card as Zazi's `afrikaans_60_v2`, per spec C20.
  - `WORD_READING_2026_1_AF: ItemSet<ReadWordsItemSet> = { item_set_id: 'word_reading@2026.1.af', question_code: 'word_reading', question_version: '2026.1', language: 'af', row_lengths: [5,5,5,5,5,5,5,5,5,5], words }`, then frozen.
    - `words: ReadWordsPrompt[]` holds the 50 words below `.map((word, index) => ({ item_key: String(index), word }))`.
    - `words` and each entry are frozen the same way (`words.forEach(Object.freeze); Object.freeze(words);`).
    - It has no `stop_rule` key. A header comment says the list is Zazi's provisional, unreviewed `afrikaans_words_50`, per spec C21.
  - `CURRENT_ITEM_SETS = { letter_sounds: { en, xh, af }, word_reading: { en, xh, af } }`.
  - Both new sets are exported from `itemsets/index.ts` and `src/assessment-questions/index.ts`.
  - `CONTENT_PENDING` gains, after the matching `xh` entries:
    - `{ item_set_id: 'letter_sounds@2026.2.af', field: 'typeface', note: 'Grid A letters supplied; the same 60 letters as the Zazi afrikaans_60_v2 card. The app must render capital I and lowercase l distinguishably (the card uses a serifed capital I); pending the test-screen redesign. A designer will recreate the printed card from these rows.' }`
    - `{ item_set_id: 'word_reading@2026.1.af', field: 'words', note: 'Placeholder word lists — replace with real EGRA word lists. Provisional, unreviewed list copied from Zazi afrikaans_words_50.' }`
  - The words, in order: `die en is in op nie ek jy sy hy ons dit was het kan man kat mat sit pot bal vis bed rok son maan boom boek huis muis koei skool water appel lekker mamma pappa baba hond bok tafel stoel deur venster kamer tuin brood melk eier vrug`.

- [ ] **Step 1: Write the failing tests.**
  - `src/assessment-questions/__tests__/letterTestContent.test.ts`. **(plan call)** Separate the standalone languages from the battery's, so a language with no battery is checked as content but never against the battery:
    - `const LANGUAGES = ['en', 'xh', 'af'] as const;` and `const BATTERY_LANGUAGES = ['en', 'xh'] as const;`.
    - Add `af` to `WORDS`, with the 50 words above.
    - Move "the battery Q1 uses the same Question code and version" out of `describe.each(LANGUAGES)` into `test.each(BATTERY_LANGUAGES)`, and loop `BATTERY_LANGUAGES` in "battery Q1 uses the exact new instructions" (`:116-122`).
    - Add `test('the battery languages are exactly en and xh; af is a standalone-only language', () => { expect(WELA_PLUS_FULL_2024_1.languages).toEqual([...BATTERY_LANGUAGES]); expect(WELA_PLUS_FULL_2024_1.languages).not.toContain('af'); })`.
    - At `:63` the supported list becomes `['en', 'xh', 'zu', 'af']`.
    - `:80-85` now checks that `en`, `xh` and `af` share one rows object (`toBe`) and cover 26 letters case-insensitively.
    - `:103-114` key lists become `['en', 'xh', 'af']`, and it adds `expect(Package.LETTER_SOUNDS_2026_2_AF).toBe(CURRENT_ITEM_SETS.letter_sounds.af)` and `expect(Package.WORD_READING_2026_1_AF).toBe(CURRENT_ITEM_SETS.word_reading.af)`.
    - Add `test('the Afrikaans sets are frozen', …)`: `Object.isFrozen` on both sets, on the word array, and on every word entry.
  - `src/assessment-questions/__tests__/itemSetIntegrity.test.tsx`:
    - `:11` → `toHaveLength(28)`; `:14` → `['en', 'xh', 'af']`.
    - The max-score table gains `['LETTER_SOUNDS_2026_2_AF', count.letters, 60], ['WORD_READING_2026_1_AF', count.words, 50]`.
    - Card layouts gain `expect(S.LETTER_SOUNDS_2026_2_AF.rows).toBe(S.LETTER_SOUNDS_2026_2_EN.rows)`.
    - The `CONTENT_PENDING` literal (`:97-107`) gains the two entries above, in that position.
  - `src/assessment-questions/__tests__/itemSetResolution.test.tsx` (import `CURRENT_ITEM_SETS` from `'../index'`), add:

```tsx
test('the battery path has no Afrikaans default: LetterSoundsQuestion without an item set shows the missing card', () => {
  const onComplete = jest.fn();
  const { getByText } = render(<LetterSoundsQuestion language="af" onComplete={onComplete} />);
  expect(getByText('This test has no card for this language yet.')).toBeTruthy();
  expect(onComplete).not.toHaveBeenCalled();
});
test('the Afrikaans cards the host passes render: Grid A from l, the word card from die', () => {
  const letters = render(<LetterSoundsQuestion language="af" itemSet={CURRENT_ITEM_SETS.letter_sounds.af} onComplete={jest.fn()} />);
  fireEvent.press(letters.getByText('Start'));
  expect(letters.getByLabelText('l, current')).toBeTruthy();
  expect(letters.getByTestId('letter-row-5')).toBeTruthy();
  const words = render(<ReadWordsQuestion language="af" itemSet={CURRENT_ITEM_SETS.word_reading.af} captureMode="sequential" onComplete={jest.fn()} />);
  fireEvent.press(words.getByText('Start'));
  expect(words.getByLabelText('die, current')).toBeTruthy();
});
```

  - `__tests__/assessmentRegistry.test.js`:
    - `:40`'s loop becomes `['en', 'xh', 'af']`.
    - Task 2's HOME_LANGUAGES test also expects `CURRENT_ITEM_SETS.letter_sounds[code]` and `CURRENT_ITEM_SETS.word_reading[code]` for every code.
  - `__tests__/AssessmentChildSelectScreen.languagePicker.test.js`:
    - Remove the `['Afrikaans', 'class-1']` row (`:142`).
    - `:157` options become `[{ key: 'en', label: 'English' }, { key: 'xh', label: 'isiXhosa' }, { key: 'af', label: 'Afrikaans' }]`.
    - `:176` labels become `['English', 'isiXhosa', 'Afrikaans']`.
    - Add:

```js
test.each(['letter_sounds', 'word_reading'])('an Afrikaans class starts %s in Afrikaans without asking', async (testCode) => {
  mockUseClasses.mockReturnValue({ classes: [{ id: 'class-1', name: 'Grade 1A', home_language: 'Afrikaans' }] });
  const navigation = { navigate: jest.fn() };
  const screen = render(<PaperProvider settings={{ icon: () => null }}><AssessmentChildSelectScreen
    navigation={navigation} route={{ params: { testCode } }} /></PaperProvider>);
  await screen.findByText('Amahle Dlamini');
  fireEvent.press(screen.getByText('Amahle Dlamini'));
  expect(navigation.navigate).toHaveBeenCalledWith('StandaloneTest', { testCode, child: mockUseChildren().children[0], languageCode: 'af' });
  expect(screen.queryByLabelText('Dismiss assessment language picker')).toBeNull();
});
```

  - `__tests__/assessmentEntryRouting.test.js`:
    - `:154`'s `'Afrikaans'` becomes `'isiZulu'`.
    - Add `test.each(['letter_sounds', 'word_reading'])('child results launches %s for an Afrikaans class in af', …)` in the style of `:136-148`, with `classItem: { ...classItem, home_language: 'Afrikaans' }`. It expects `navigate('StandaloneTest', { testCode, child, languageCode: 'af' })`.
  - `__tests__/StandaloneTestScreen.test.js`:
    - The host table (`:91-96`) gains `['letter_sounds', 'af', 'LetterSoundsQuestion'], ['word_reading', 'af', 'ReadWordsQuestion']`.
    - Add `expect(renderHost(makeNavigation(), { ...params, languageCode: 'af' }).getByText('Amahle Dlamini · Afrikaans')).toBeTruthy()`.
    - `:275` becomes `[null, 'zu']`.
- [ ] **Step 2: Run the tests to verify they fail.** Run `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest src/assessment-questions/__tests__ __tests__/assessmentRegistry.test.js __tests__/AssessmentChildSelectScreen.languagePicker.test.js __tests__/assessmentEntryRouting.test.js __tests__/StandaloneTestScreen.test.js`. Expected: FAIL. `CURRENT_ITEM_SETS.letter_sounds.af` is undefined, and an Afrikaans class still gets the picker.
- [ ] **Step 3: Implement** the two item-set files, `current.ts`, both `index.ts` export lists and `contentStatus.ts`, per the Interfaces block. Copy the words with `git -C /Users/jimmckeown/Development/zazi-izandi-app show f0c9ee49:src/constants/egraConstants.js`, character for character.
- [ ] **Step 4: Update the docs this task makes true.**
  - `documentation/egra_letter_sets.md:10-22`:
    - Letter Sounds now has `letter_sounds@2026.2.af` too, sharing the same frozen Grid A rows. Its 60 letters equal Zazi's `afrikaans_60_v2`, the one card Zazi printed for all three languages in January and June 2026. Zazi's `afrikaans_60` is not used.
    - Word Reading has `word_reading@2026.1.af`: Zazi's provisional, diacritic-free, unreviewed `afrikaans_words_50`.
    - WelaPLUS Q1 stays `en`/`xh`.
  - `documentation/assessment-score-bands-config.md`:
    - `:24`: the `language` key is the result's two-letter code (`en`, `xh`, `af`, …) or `*`. **(plan call)** This also fixes the stale `english`/`isixhosa` examples.
    - `:55-57`: the raw score is out of the 60-letter Grid A card (`letter_sounds@2026.2.*`). Afrikaans uses the `'*'` rows, whose cut-offs were set for other languages, so treat Afrikaans bands as provisional until pedagogy confirms.
  - `PRD.md:282-283` (§6.7):
    - The language comes from the class's `home_language` (English `en`, isiXhosa `xh`, Afrikaans `af`). When it is missing or unsupported, the EA picks from the languages that have an item set, with nothing preselected and never English by default.
    - **(plan call)** Replace the stale "Support grid and sequential EGRA capture modes" with "Step-by-step capture only; the stop rule comes from the item set". #90 retired grid mode (AR §3.1 A).
  - `documentation/ROADMAP.md:754`: "Replace placeholder EGRA word lists with authoritative English, isiXhosa and Afrikaans content (Afrikaans: `word_reading@2026.1.af` holds Zazi's provisional, unreviewed list; a reviewed list becomes a new version)."
  - `documentation/ROADMAP.md` §8 "Integration and contract work", a new checkbox: "WelaPLUS host (Plan 3): do not offer WelaPLUS to an Afrikaans class until the battery has Afrikaans (`battery/wela_plus_full.ts:49` lists `en`, `xh`). Start shows 'Not available in Afrikaans yet', and the WelaPLUS language picker lists only the battery's languages (lesson-plan spec C22)."
  - WelaPLUS Release 1 spec, a dated note at the end of the status block (`:3-8`) with the same requirement. **(plan call)** The rationale is corrected for #90: the package no longer falls back to English (`MissingItemSet`). Without the requirement, an Afrikaans run would show a missing card on every Question and have no instructions, rather than silently using English.
  - `CONTEXT.md:133`: "Languages use `en`, `xh`, `af` and `zu`" (item sets exist for `en`, `xh` and `af`; WelaPLUS for `en` and `xh`).
  - AR spec after `:205-206`, a dated blockquote: "> **Status update — ⟨date⟩ (lesson-plan AF):** `af` (Afrikaans) joins the codes, with `letter_sounds@2026.2.af` (Grid A) and `word_reading@2026.1.af` in `CURRENT_ITEM_SETS`. The WelaPLUS battery stays `en`/`xh`."
- [ ] **Step 5: Run the tests to verify they pass.**
  - Run the Step 2 command, then `__tests__/ChildResultsScreen.test.js __tests__/AssessmentsScreen.test.js __tests__/designSystemGuard.test.js`.
  - Then run `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npm run test:types`.
  - Then the full unit suite and `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npm run test:integration`.
  - Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add src/assessment-questions/itemsets/letter_sounds@2026.2.af.ts src/assessment-questions/itemsets/word_reading@2026.1.af.ts \
  src/assessment-questions/itemsets/current.ts src/assessment-questions/itemsets/index.ts src/assessment-questions/index.ts \
  src/assessment-questions/itemsets/contentStatus.ts src/assessment-questions/__tests__/letterTestContent.test.ts \
  src/assessment-questions/__tests__/itemSetIntegrity.test.tsx src/assessment-questions/__tests__/itemSetResolution.test.tsx \
  __tests__/assessmentRegistry.test.js __tests__/AssessmentChildSelectScreen.languagePicker.test.js \
  __tests__/assessmentEntryRouting.test.js __tests__/StandaloneTestScreen.test.js \
  documentation/egra_letter_sets.md documentation/assessment-score-bands-config.md PRD.md documentation/ROADMAP.md CONTEXT.md \
  docs/superpowers/specs/2026-10-14-welaplus-release-1-design.md docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md
git commit -m "feat(af): Afrikaans letter (Grid A) and word tests; WelaPLUS stays English and isiXhosa"
```

---

### Task 4: Release gate (orchestrator; each external step needs Jim's yes at the time)

**Files:**
- Modify: `documentation/build-log.md`:
  - a Verification Register subsection, after the last `### 2026-10-20 — Assessment Results Plan 1 …` subsection and before `## Decision Register`;
  - a Decision Register row at its end;
  - Bug and Gap rows at its end, if any.
  - Other lesson-plan branches append to the same registers. On a conflict, union-resolve in commit order.

- [ ] **Step 1: Suites.** Run `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npm run test:release` (unit, integration, types, staging check). Expected: PASS. Record the suite and test counts against the preflight baseline.
- [ ] **Step 2: Review.** Run `/codex:adversarial-review` on the branch against its base. Fix the findings worth fixing, in at most two rounds, and record each finding and how it was handled.
- [ ] **Step 3: Jim's yes, then EAS preview builds** (Android and iOS), using the `expo-deployment` skill's cloud path.
- [ ] **Step 4: Device gate** (spec §7.5 device check, plus the visible behaviour).
  - Devices: the Galaxy A03s at 360 dp (`wm density 320`) and an iPhone, each at text size 1.0x and 1.3x.
  - Take a screenshot for each row. Use a test class with Language Afrikaans and one child.

| Check | Pass when |
|---|---|
| Afrikaans letter test | Assessments → Letter Sounds → the child starts with no picker. The header reads "⟨child⟩ · Afrikaans", the first row is `l a m E p n L s o e`, and the test stops after 10 wrong in a row. |
| Afrikaans word test | Word Reading starts with no picker, and the first row is `die en is in op`. |
| Capital I vs lower-case l | Capture grid: row 1 tile 1 (`l`), row 1 tile 7 (`L`), row 3 tile 4 (`I`) and row 5 tile 6 (`I`). Then the same tiles in the saved result's detail grid. A person not told which is which reads each correctly. On failure: add a Bug and Gap row; it does **not** block AF (orchestrator call, 2026-10-20). The same card is already live for English and isiXhosa, `contentStatus.ts` already records the typeface need, and the fix belongs to the test-screen redesign. Tracker tiles are always lower case (`LetterToggleTile.js:32`), so the tracker is not affected. |
| Figtree ê ë ô | Type `Ênê Ëlô ôë` as a test child's first name. On the children list and the session child selector, every glyph renders in Figtree, matching its neighbours' weight and width, with no box and no fallback face. Delete the test child afterwards. |
| Afrikaans tracker | Record a session for the child. The tracker shows `a s m e k i r o n t …`; mark two letters and save. Child results → Letter tracker shows both letters taught and `2 / 26 letters mastered`. After sync, a read-only query through the `sqlite-staging-sql` helper shows both rows with `language = 'Afrikaans'`. Confirm `project_ref=segygjzpujphwvrubusm` before running it. |
| No-language class | A child whose class has no language gets the picker listing English, isiXhosa and Afrikaans, none ticked; Start does nothing until one is tapped. The tracker shows "No letter set for this class language." with no clipping at 360 dp and 1.3x. |

- [ ] **Step 5: Build log.**
  - A Verification subsection: what shipped, every command with its counts, the review rounds, and each device row's result.
  - One Decision Register row listing this plan's **(plan call)** items, each with a revisit trigger: AR Plan 2 lands; the real Afrikaans pack lands (A2); WelaPLUS gains Afrikaans.
- [ ] **Step 6: PR.** Open the PR ("lands as one slice", spec §7.5). Keep issue-closing keywords out of commit messages and the PR body unless intended. Ask Jim before merging.

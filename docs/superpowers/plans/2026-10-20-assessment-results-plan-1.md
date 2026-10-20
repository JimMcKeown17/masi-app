# Assessment Results — Plan 1: Results and Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every assessment result, whether a standalone letter or word test or a WelaPLUS
Question, is stored in one shape and uploaded as a complete family through one server call. The
standalone letter test becomes the package's data-driven `LetterSoundsQuestion`, with
step-by-step marking and a clean stop at 10 wrong in a row. Mastery evidence is read from stored
items.

**Architecture:**
- **Package (`src/assessment-questions/`).** It gains a pure step-by-step reducer with the stop
  rule. Item sets carry their own `question_code`, rows and stop rule. There is no English
  fallback.
- **Phone.** It saves a package `Result` with `saveQuestionResult`, enqueuing **one** outbox row
  per family whose payload holds the parent and all items. A new dispatch branch sends that row
  through `submit_assessment` and acknowledges parent plus items in one SQLite transaction.
- **Server.** The new `submit_assessment` and `save_battery_run` functions are the only EA write
  path; direct writes are revoked. Every reader moves to one typed accessor that selects by test
  (`question_code`), not by battery.

**Tech Stack:**
- Expo / React Native, JavaScript app and TypeScript package;
- SQLite (expo-sqlite; `better-sqlite3` in tests);
- Supabase Postgres 17 (plpgsql) with PostgREST via supabase-js;
- Jest.

**Spec:** `docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md`. Read
§§5–9, 10.4, 12, 13, 14 (Plan 1 row) and 15 before starting. This plan implements the Plan 1 row
of §14 only. Mastery confirmations (§10.1–10.3) and the history pull (§11) are Plans 2 and 3.

## Global Constraints

**Preconditions and branch**
- **Precondition:** PR #88 (`content/welaplus-answers`) is merged to `main`. Task 0 checks this.
  This plan edits package files as they are after #88.
- **Branch:** `feat/assessment-results` in a new worktree off `main`, after the design branch
  (spec + this plan) is merged or rebased onto it.

**Commands**
- Node 20 for every jest, tsc and harness command: prefix
  `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- **Backend:** `masi-app-sqlite` (`segygjzpujphwvrubusm`) only. Never touch legacy
  `jcqrlwetutnpuchjoyyd`.
- **Never** run raw `supabase` CLI from the repo root, and never source `.env.local`. Use the
  isolated `sqlite:staging:*` helper (skill `sqlite-staging-sql`).

**Approvals**
- The hosted migration, the practice-data wipe and EAS builds need Jim's explicit yes at the
  time. The controller (Claude) does these, never the implementer.
- The disposable PostgreSQL harness runs on a throwaway PG17 at port **55432**, run by the
  controller. The Codex sandbox cannot reach TCP Postgres; implementers write harness cases, and
  the controller runs them.

**Git**
- No co-author trailer on commits. No bare `git stash`.

**Values copied from the spec**
- Language codes are `en`, `xh` and `zu`, everywhere new. They never fall back to English.
- `question_code`: `letter_sounds` for the letter test (both entry points) and `word_reading` for
  the standalone word test.
- Item set id is `${question_code}@${question_version}.${language}`. The interim version is
  `2026.1`.
- Stop rule data: `{ kind: 'consecutive_wrong', stop_at: 10 }`. There is no warning, no switch-off
  and no resume.
- Stop card copy: title `⟨Child⟩ got 10 in a row wrong. The test has stopped.`, primary
  `Save result`, secondary `Undo last mark`. The component receives the child's display name
  through a new optional `childName` prop. If none is given, the title starts `The child`.
- `stopped_reason` for a stop is `stop_rule`, from the existing 10-value set.
- Error codes:
  - `MA001`: family or run identity mismatch;
  - `MA002`: conflicting terminal run status;
  - `22023`: malformed payload;
  - `23505`: duplicate `(battery_run_id, question_code)`;
  - `42501`: no authority.
- `assessment_purpose = 'progress_check'` and `assessment_window_id = null` for all new rows (D8).
- UI: bottom sheets, not dialogs. Use Bold Red tokens and the shared components from
  `documentation/design-system.md`.

## Checkpoints

Each task ends green: its own tests, then the full jest suite and `npm run test:types`.
- **Between Task 9 and Task 12 the app is not releasable.** The old capture screens still call
  `saveAssessment`, whose per-row outbox rows the new dispatch no longer sends. No build is made
  before Task 14.
- **One reviewable branch.** Tasks 8–12 land on one branch and are reviewed as one cutover.
  Within it:
  - Task 9 updates the existing sync tests for the per-row assessment path;
  - Task 11 deletes the old APIs together with their last callers.

## Review Focus

1. **A class whose `home_language` is null or unknown** (e.g. "Afrikaans"). The EA gets the
   language picker listing only `en`/`xh`; the app never starts an English card silently. Test:
   Task 11.
2. **A fast double tap on the tenth Incorrect, or on Save result.** One stop card, one saved
   result, one outbox row. Tests: Task 2 (reducer ignores decisions while stopped) and Task 11
   (screen saves once).
3. **A test phone upgraded from schema v14 with unsynced old-format assessments in its outbox.**
   v15 clears them. The app opens, sync runs with no `MISSING_OUTBOX_PAYLOAD`, unknown-table or
   terminal rows, and the build log records the clear. Test: Task 7.
4. **Thirty families queued offline while the child's delivery assignment is still pending
   upload.** Families wait (retry), are never quarantined, and drain in one Sync once the
   assignment lands. Test: Task 9.
5. **Save fails (for example, SQLite busy) after the EA taps Save result.** The result stays in
   memory, the EA sees "Couldn't save — try again", and the retry uses the same assessment id.
   Test: Task 11.

---

### Task 0: Preconditions

- [ ] **Step 1:** `gh pr view 88 --json state -q .state` must print `MERGED`. If not, stop and
  tell the controller.
- [ ] **Step 2:** Create the build worktree:
  `git worktree add -b feat/assessment-results .claude/worktrees/assessment-results origin/main`.
  Bring in the spec and this plan (merge or cherry-pick the `design/assessment-slice` commits).
- [ ] **Step 3:** Baseline. Run
  `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest 2>&1 | tail -5` and
  `npm run test:types`, and record the counts in the task report. Expected: all green.

---

### Task 1: Package — item sets name their own Question; no English fallback

Every component currently hard-codes its `question_code` and falls back to the English set for
any language other than `xh`.

**Files:**
- Create: `src/assessment-questions/itemsets/resolveItemSet.ts`
- Create: `src/assessment-questions/progress/MissingItemSet.tsx`
- Modify: every `src/assessment-questions/questions/*/index.tsx` except `NullQuestion`, for
  `resolveItemSet` and the emitted `question_code`.
- Test: `src/assessment-questions/__tests__/itemSetResolution.test.tsx`

**Interfaces:**
- Produces:

  ```ts
  resolveItemSet<T extends ItemSetMeta>(
    language: string,
    override: unknown,
    bundled: Partial<Record<string, T>>,
    isValid: (v: unknown) => v is T,
  ): T | null
  ```

  It returns `override` when `isValid(override)`; otherwise `bundled[language] ?? null`. It
  **never** substitutes another language.
- Produces: `<MissingItemSet language={string} />`, a full-screen error state reading
  *"This test has no card for this language yet."* It calls no callback.
- Produces: every component emits `result.question_code = itemSet.question_code` and
  `question_version = itemSet.question_version`.

- [ ] **Step 1: Write the failing tests.** For each of the 11 components, render with
  `language: 'zu'` and no `itemSet`. Assert:
  - the `MissingItemSet` text is shown;
  - `onComplete` is not called.

  Then render `ReadWordsQuestion` with an override item set whose `question_code` is
  `'word_reading'`, complete it, and assert `result.question_code === 'word_reading'`.
- [ ] **Step 2:** Run
  `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest src/assessment-questions/__tests__/itemSetResolution.test.tsx`.
  Expected: FAIL (English rendered; code `wela_plus_read_words`).
- [ ] **Step 3:** Implement `resolveItemSet` and `MissingItemSet`, and switch every component to
  them, with bundled maps keyed `en`/`xh`. Replace each hard-coded `question_code` literal with
  the item set's.
- [ ] **Step 4:** Run the whole package suite:
  `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest src/assessment-questions`. Expected:
  PASS. Update any existing test that asserted the English fallback, and say which in the
  report.
- [ ] **Step 5:** Commit: `feat(assessment-questions): item sets name their Question; no English fallback`.

---

### Task 2: Package — step-by-step reducer with the stop rule

**Files:**
- Create: `src/assessment-questions/progress/stepByStep.ts`
- Test: `src/assessment-questions/progress/__tests__/stepByStep.test.ts`

**Interfaces:**
- Produces:

  ```ts
  type StopRule = { kind: 'consecutive_wrong'; stop_at: number };
  type StepState = {
    cursor: number;                         // index of the next undecided item
    decisions: Record<number, boolean>;     // dense over 0..cursor-1; true = correct
    correctionCount: number;
    stopped: boolean;                       // stop card showing
    maxConsecutiveWrong: number;
  };
  type StepAction =
    | { type: 'decide'; correct: boolean }
    | { type: 'back' }
    | { type: 'undoStop' };
  initStepState(): StepState
  stepReducer(state: StepState, action: StepAction, ctx: { totalItems: number; stopRule: StopRule | null }): StepState
  consecutiveWrong(decisions: Record<number, boolean>, cursor: number): number
  ```

- The algorithm is Zazi's `consecutiveIncorrect` (`zazi-izandi-app/src/utils/assessmentStopRule.js`),
  without its floor, warning or ceiling. Count back from `cursor - 1` while the decision is
  `false`.

- [ ] **Step 1: Write the failing tests** (all against a 60-item card, `stopRule = { kind:
  'consecutive_wrong', stop_at: 10 }`):
  - `stops at exactly 10`: nine `decide false` leave `stopped === false`; the tenth sets
    `stopped === true` and `cursor === 10`.
  - `a correct answer resets the run`: 9 false, 1 true, 9 false → `stopped === false`;
    `maxConsecutiveWrong === 9`.
  - `the run crosses rows`: a row length is irrelevant, so items 8–17 wrong stop at cursor 18.
  - `decisions are ignored while stopped`: after the stop, `decide` and `back` return the same
    state object.
  - `undoStop clears the tenth mark`: `cursor === 9`, `decisions[9]` is undefined,
    `stopped === false`, and `correctionCount` goes up by 1.
  - `back clears the previous decision`: `cursor - 1` and `correctionCount + 1`, and nothing
    happens at cursor 0.
  - `no stop rule`: with `stopRule: null`, 20 false decisions never stop.
  - `cursor never passes totalItems`.
- [ ] **Step 2:** Run
  `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest src/assessment-questions/progress/__tests__/stepByStep.test.ts`.
  Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `stepByStep.ts` as pure functions.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(assessment-questions): step-by-step reducer with consecutive-wrong stop rule`.

---

### Task 3: Package — the letter test as versioned data

**Files:**
- Create: `src/assessment-questions/itemsets/letter_sounds@2026.1.en.ts`, `letter_sounds@2026.1.xh.ts`
- Create: `src/assessment-questions/itemsets/current.ts`
- Create: `src/assessment-questions/itemsets/word_reading@2026.1.en.ts`, `word_reading@2026.1.xh.ts`
- Modify: `src/assessment-questions/questions/LetterSoundsQuestion/types.ts`
- Modify: `src/assessment-questions/battery/wela_plus_full.ts`, `itemsets/contentStatus.ts`,
  `itemsets/index.ts`, `index.ts` (exports)
- Delete: `itemsets/wela_plus_letter_sounds.en.ts`, `itemsets/wela_plus_letter_sounds.xh.ts`
- Test: `src/assessment-questions/__tests__/letterTestContent.test.ts`; update
  `battery/__tests__/wela_plus_full.test.ts` and `__tests__/itemSetIntegrity.test.tsx`

**Interfaces:**
- Produces, in `LetterSoundsQuestion/types.ts`:

  ```ts
  LetterSoundsItemSet = ItemSetMeta & { rows: string[][]; stop_rule: StopRule | null }
  ```

  `columns` and `letters` are removed. `StopRule` comes from Task 2.
- Produces, in `itemsets/current.ts`:

  ```ts
  CURRENT_ITEM_SETS = {
    letter_sounds: { en: LETTER_SOUNDS_2026_1_EN, xh: LETTER_SOUNDS_2026_1_XH },
    word_reading:  { en: WORD_READING_2026_1_EN,  xh: WORD_READING_2026_1_XH },
  } as const
  ```

  Both are exported from the package `index.ts`.
- Produces: `ReadWordsItemSet` sets for `word_reading`. Each set has the 50 placeholder words of
  today's `src/constants/egraConstants.js` (`ENGLISH_WORD_SET` / `ISIXHOSA_WORD_SET`, same order),
  `row_lengths: [5,5,5,5,5,5,5,5,5,5]`, and `item_key` set to the word's index as a string.

**Content values**
- **Letter sets.** `2026.1` letters are the current `wela_plus_letter_sounds` 2024 lists,
  unchanged in order, split into **5 rows of 12**.
- **Letter stop rule.** Both letter sets use `stop_rule: { kind: 'consecutive_wrong', stop_at: 10 }`.
- **Battery Q1.** It becomes `{ question_code: 'letter_sounds', question_version: '2026.1', … }`.
  Its instruction text becomes:
  `Hand the child Reading Card side A. Point to each letter and ask the child for its sound. Mark each letter Correct or Incorrect. The test stops by itself after 10 wrong in a row. Otherwise STOP at 1 minute.`
- **`CONTENT_PENDING` gains two entries:**
  - `letter_sounds@2026.1.en`, field `rows`:
    `Masi team to supply the mixed-case single-letter list and card layout (rows of 10 or fewer; a typeface where I and l differ).`
  - `letter_sounds@2026.1.xh`: the same text.
- **Word-set entries:** `word_reading@2026.1.en` and `word_reading@2026.1.xh`, field `words`:
  `Placeholder word lists — replace with real EGRA word lists.`

- [ ] **Step 1: Write the failing tests** in `letterTestContent.test.ts`. For every set in
  `CURRENT_ITEM_SETS.letter_sounds`:
  - every item matches `/^\p{L}$/u`;
  - no row is empty;
  - `item_set_id === \`${question_code}@${question_version}.${language}\``;
  - the language is one of `en`/`xh`/`zu`.

  `same version` test: for each language, the battery's Q1 `question_code`/`question_version`
  equals `CURRENT_ITEM_SETS.letter_sounds[lang]`'s. `isiXhosa interim content`:
  `rows.flat().join('')` equals the 2024 XH list.
- [ ] **Step 2:** Run the test. Expected: FAIL.
- [ ] **Step 3:** Create the files. Update the battery, content status and exports, and delete
  the two old letter sets. Fix imports.
- [ ] **Step 4:** Run
  `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest src/assessment-questions && npm run test:types`.
  Expected: PASS. `LetterSoundsQuestion` will not compile against the new type until Task 4; do
  Tasks 3 and 4 in one commit if needed.
- [ ] **Step 5:** Commit: `feat(assessment-questions): letter test content as versioned rows with a stop rule`.

---

### Task 4: Package — `LetterSoundsQuestion` is step-by-step with the stop card

**Files:**
- Modify: `src/assessment-questions/questions/LetterSoundsQuestion/index.tsx`
- Modify: `src/assessment-questions/types/QuestionProps.ts`
- Modify: `src/assessment-questions/contractTest/validateResult.ts`
- Create: `src/assessment-questions/progress/StopCard.tsx`
- Test: `questions/LetterSoundsQuestion/__tests__/LetterSoundsQuestion.test.tsx` (rewrite) and
  `__tests__/validateResult.test.ts`

**Interfaces:**
- Consumes: `stepReducer` from Task 2; `LetterSoundsItemSet` from Task 3; `resolveItemSet` from
  Task 1.
- Produces: `QuestionProps` gains `childName?: string` and `allowSkip?: boolean` (default
  `true`).
- Produces: the emitted `Result` per spec §6.2:
  - one item per card position,
    `{ position, item_key: letter, prompt: letter, is_correct, metadata: { row, reached } }`;
  - `derived` includes `total_correct`, `total_attempted`, `percent`, `last_attempted_position`
    (= `cursor - 1`, or `null` when skipped), `was_timed`, `tracks_progress`,
    `capture_mode: 'sequential'`, `correction_count` and `max_consecutive_wrong`.

**Behaviour**
- **Screen layout.** The grid shows one visual row per `rows[i]`, with the current letter
  highlighted. The current row scrolls into view.
- **Buttons.** `Correct`, `Incorrect` and `Back` sit under the grid; reuse the sizes of today's
  `SequentialAssessmentScreen`.
- **Timer.** It starts on the first transition to active, from `durationSec`.
  - Expiry ends with `timer`.
  - End asks for confirmation in a bottom sheet and ends with `ea_ended`.
  - Finishing every letter ends with `completed`.
  - **The reading time freezes at the stop.** When `stopped` becomes true, record the stop time;
    `duration_ms` is measured to it, not to Save. This keeps #88's frozen-time behaviour.
- **Stop card.** When `state.stopped`, show `StopCard` with the exact copy from Global
  Constraints.
  - `Save result` emits `stopped_reason: 'stop_rule'`.
  - `Undo last mark` dispatches `undoStop` and resumes the timer from the frozen time. The paused
    interval is not counted.
- **Skip.** Shown only when `allowSkip`.
- **Removed.** The last-attempted sheet is no longer used by this component.

- [ ] **Step 1: Write the failing tests**, with the jest fake timers the package already uses:
  - 10 consecutive Incorrect taps show the stop card text, and `onComplete` has not been called.
    Save emits a result:
    - `stopped_reason === 'stop_rule'`;
    - `derived.last_attempted_position === 9`;
    - 60 items, of which items 10–59 have `metadata.reached === false`;
    - `metadata.row` is right for items 0, 11, 12 and 59;
    - `duration_ms` equals the time at the tenth tap, even after advancing timers 30 s before
      Save.
  - Undo then a Correct tap continues, and the final `derived.correction_count === 1`.
  - Two Incorrect taps fired in the same tick at item 9 give one stop card, and the next item
    stays undecided.
  - `allowSkip={false}` hides the skip control.
  - `childName="Lwazi"` shows `Lwazi got 10 in a row wrong. The test has stopped.`
- [ ] **Step 2: Add a validator rule test.** A `stop_rule` result whose last
  `item_set.stop_rule.stop_at` reached items are not all wrong fails validation.
  `validateResult` gains an optional second parameter, `{ stopAt?: number }`.
- [ ] **Step 3:** Run both test files. Expected: FAIL.
- [ ] **Step 4:** Implement it.
- [ ] **Step 5:** Run the package suite and `npm run test:types`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(assessment-questions): step-by-step letter test with clean stop at 10`.

---

### Task 5: Package — `ReadWordsQuestion` gains step-by-step mode

**Files:**
- Modify: `src/assessment-questions/questions/ReadWordsQuestion/index.tsx`
- Test: `questions/ReadWordsQuestion/__tests__/ReadWordsQuestion.stepByStep.test.tsx`

**Interfaces:**
- Produces: a new prop `captureMode?: 'grid' | 'sequential'`, default `'grid'`, so WelaPLUS Q6
  is unchanged.
- In `'sequential'` mode it uses `stepReducer` with `stopRule: item set's stop_rule ?? null`.
  `ReadWordsItemSet` gains an optional `stop_rule`. Rows follow `row_lengths`.
- The emitted items and `derived` match Task 4's shape, with words in place of letters and
  `item_key` from the item set.

- [ ] **Step 1: Write the failing tests:**
  - in sequential mode with `CURRENT_ITEM_SETS.word_reading.en`, 50 Correct taps end with
    `completed`, 50 items, `question_code: 'word_reading'`;
  - 20 Incorrect taps never stop, because `stop_rule` is null;
  - grid mode is unchanged: the existing tests still pass.
- [ ] **Step 2:** Run the test. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run the package suite. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(assessment-questions): step-by-step mode for ReadWordsQuestion`.

---

### Task 6: Supabase migration and PostgreSQL harness

**Files:**
- Create: `supabase/migrations/20261021120000_assessment_results_contract.sql`
- Create: `scripts/assessment-results-postgres-harness.cjs`
- Modify: `package.json` (add `verify:assessment-results:postgres`) and
  `.github/workflows/tests.yml` (a step like the support-incident one)

**Interfaces:**
- **`public.submit_assessment(p_assessment jsonb, p_items jsonb) returns text`** returns
  `'inserted'` or `'already_present'`, exactly per spec §8.1 steps 1–7.
  - It confirms an existing id **before** checking authority.
  - It catches `unique_violation` on `assessments_pkey` and falls through to confirmation.
  - A `(battery_run_id, question_code)` violation re-raises `23505`.
  - Item positions are unique, non-negative integers, and may have gaps.
  - The array length must equal `total_items`.
  - A missing item `metadata` is rejected (the phone normalises it to `{}`).
- **`public.save_battery_run(p_run jsonb) returns text`** returns `'inserted'`, `'updated'` or
  `'unchanged'`, per §8.2: forward-only status, `MA001` on identity mismatch, and `MA002` on a
  conflicting terminal status. It falls through on primary-key `unique_violation`.
- Both functions follow `report_mobile_support_incident`:
  - `security definer`, `set search_path = ''`;
  - `revoke all … from public, anon, authenticated, authenticator, service_role`, then
    `grant execute … to authenticated`;
  - session-level `SET lock_timeout`/`statement_timeout` with `RESET` at the end of the file.
- Custom codes: `raise exception using errcode = 'MA001'` and `'MA002'`.

**Migration contents, in this order**
1. **`assessments` columns:** `question_code text`, `question_version text`, `item_set_id text`,
   `language text`, `stopped_reason text` with a CHECK on the 10 package values or null,
   `duration_ms integer`, `derived jsonb not null default '{}'`, and `battery_run_id uuid`.
2. **`battery_runs` table:** columns per spec §7.1, server FKs to `children`, `programmes`,
   `classes`, `auth.users` and `assessment_windows`. It has a purpose/window CHECK matching
   `assessments_window_purpose_chk`, a status CHECK, and
   `completed_at is not null` iff `status = 'completed'`. Then the FK
   `assessments.battery_run_id → battery_runs(id) on delete restrict`, and the partial unique
   index `(battery_run_id, question_code) where battery_run_id is not null`.
3. **`programmes` columns:** `default_battery_code text` and `default_battery_version text`, with
   a both-or-neither CHECK. The data statement sets Core Literacy R–3 to `wela_plus_full` /
   `2024.1`. The controller confirms the programme's identifying column and value in a read-only
   preflight before Task 6 is merged, and the implementer leaves a `-- PREFLIGHT:` placeholder
   comment.
4. **Server-stamped `updated_at`.** Recreate the `updated_at` triggers as `before insert or update`
   using `private.set_updated_at()` on `assessments`, `assessment_items`, `battery_runs` and
   `letter_mastery`.
5. **The two functions.**
6. **Authorization.**
   - `revoke insert, update, delete on public.assessments, public.assessment_items from authenticated`.
   - Drop the policies `assessments_insert_active_assignment`,
     `assessments_update_active_assignment`, `assessments_delete_active_assignment` and
     `assessment_items_{insert,update,delete}_own_active_assessment`.
   - `battery_runs`:
     - `alter table public.battery_runs enable row level security`;
     - `revoke all on public.battery_runs from anon, authenticated`, then
       `grant select … to authenticated`;
     - a SELECT policy copying `assessments_select_assigned_child_history`'s predicate.
   - **`private.child_has_delete_blocking_history`** also counts `battery_runs` rows.

**Harness cases.** Copy the structure of `scripts/upload-contract-postgres-harness.cjs`: the
`assertDisposableAdminTarget`, `runPsql`, `asActor` and `expectSqlState` helpers, and replaying
every migration. Every case from spec §15's `submit_assessment` and `save_battery_run` lists:

- complete insert;
- replay → `already_present`;
- commit, then revoke the child assignment, then replay → `already_present`;
- mismatched replay → `MA001`;
- sparse positions accepted, duplicate positions → `22023`;
- items shorter than `total_items` → `22023`, with nothing stored;
- unauthorized child → `42501`;
- no programme assignment → `42501`;
- another EA's run → `42501`;
- a run whose child differs → `42501`;
- a Question after its run completed → accepted;
- a duplicate run Question with a different id → `23505`;
- direct INSERT, UPDATE and DELETE on both tables, and on `battery_runs`, as `authenticated` →
  `42501`;
- another EA with no relation to the child selects zero `battery_runs` rows. RLS must be on;
- `delete_child_if_no_history` refuses a child that has only a zero-Question run;
- `updated_at` equals the transaction's `now()` on insert, even when the payload carries an old
  time;
- run insert, forward update, stale `in_progress` after `completed` → `unchanged`;
- conflicting terminal → `MA002`;
- finalize after assignment revocation → `updated`;
- run identity mismatch → `MA001`.

**Overlapping-retry case.** Two `psql` connections run the same `submit_assessment` call
concurrently, with the first holding its transaction open via `pg_sleep`. Both return success,
and exactly one parent and n items exist. The same case runs for `save_battery_run`.

- [ ] **Step 1:** Write the harness with all cases.
- [ ] **Step 2:** Controller runs
  `HISTORY_RLS_ADMIN_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres HISTORY_RLS_DATABASE_NAME=masi_history_rls_assessment_results HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE PGTZ=UTC PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run verify:assessment-results:postgres`.
  Expected: FAIL in an executed SQL assertion, because the functions are missing. A guard error
  is not RED. The database name must keep the `masi_history_rls_` prefix the shared guard
  requires; use the same name in CI.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** Controller re-runs the new harness, then **all five existing harnesses**
  (`verify:*:postgres`) against the same disposable server. Expected: every harness prints its
  pass JSON, and none regresses.
- [ ] **Step 5:** Commit: `feat(supabase): submit_assessment and save_battery_run as the only EA write path`.

---

### Task 7: SQLite schema v15

**Files:**
- Modify: `src/db/migrations.js` (append version 15, `'assessment_results'`)
- Modify: `src/db/repositories/referenceDataRepository.js` (programmes columns)
- Modify: `src/db/repositories/childrenRepository.js` (`deleteIfNoHistory` also checks
  `battery_runs`)
- Test: `__tests__/migrations.assessmentResults.test.js` (`better-sqlite3`, following
  `__tests__/captureModeMigration.test.js`)

**Migration contents**
1. **Clear the old format.**
   - `delete from sync_outbox where table_name in ('assessments','assessment_items')`.
   - `delete from assessment_items`, then `delete from assessments`.
   - Practice data only (spec §13).
2. **`assessments` columns:** `question_code text`, `question_version text`, `item_set_id text`,
   `language text`, `stopped_reason text`, `duration_ms integer`,
   `derived text not null default '{}'`, and `battery_run_id text references battery_runs(id) on delete restrict`.
3. **`battery_runs` table:** the columns from spec §7.1 plus `LOCAL_SYNC_COLUMNS` and
   `started_here integer not null default 0 check (started_here in (0,1))`.
   - `class_id` is a plain `text` column, **not** a foreign key.
   - `child_id` references `children(id) on delete cascade`, and `programme_id` references
     `programmes(id)`.
4. **Indexes.**
   - Unique `idx_assessments_run_question on assessments(battery_run_id, question_code) where battery_run_id is not null`.
   - `idx_battery_runs_user_status on battery_runs(user_id, status)`.
5. **`programmes` columns:** `default_battery_code` and `default_battery_version`.

Also add both columns to `REFERENCE_TABLES.programmes.columns` in
`src/db/repositories/referenceDataRepository.js`. Its explicit allowlist would otherwise drop them
on every reference pull.

SQLite cannot add a column with a foreign key to an existing table in every form, so use
`alter table … add column battery_run_id text references battery_runs(id)`. If expo-sqlite
rejects that, rebuild `assessments` (the table is empty after step 1) and say so in the report.

- [ ] **Step 1: Write the failing tests:**
  - a v14 database with one old assessment, its items and three outbox rows migrates to v15
    with all of them gone and other tables' outbox rows kept;
  - `PRAGMA foreign_key_check` is empty;
  - the partial unique index rejects a second `(run, question)` row;
  - `battery_runs.class_id` accepts an id with no `classes` row;
  - `deleteIfNoHistory` refuses a child with only an unsynced, zero-Question run, and the child,
    run and outbox row remain;
  - `CURRENT_SCHEMA_VERSION === 15`;
  - `replaceFromServer` for `programmes`, with `default_battery_code: 'wela_plus_full'` and
    `default_battery_version: '2024.1'`, reads both values back.
- [ ] **Step 2:** Run the test. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `npx jest __tests__/migrations` and the schema-guard tests (grep for
  `CURRENT_SCHEMA_VERSION` in `__tests__`). Expected: PASS.
- [ ] **Step 5:** Commit: `feat(db): schema v15 for question results and battery runs`.

---

### Task 8: Repositories — save and read results; battery runs

**Files:**
- Modify: `src/db/repositories/assessmentsRepository.js`
- Create: `src/db/repositories/batteryRunsRepository.js`
- Create: `src/utils/assessmentRegistry.js`, holding `LETTER_EVIDENCE_CODES` only. Task 10 adds
  the rest.
- Create: `src/services/assessmentFamilyPayload.js`, holding `assertSubmitShape` only. Task 9
  adds `toSubmitArgs`. (wire it wherever repositories are
  assembled; grep `createAssessmentsRepository(`)
- Test: `__tests__/assessmentsRepository.questionResults.test.js` and
  `__tests__/batteryRunsRepository.test.js` (`better-sqlite3`)

**Interfaces:**
- **`saveQuestionResult({ assessmentId, result, childId, userId, batteryRunId = null, captureMode = null, transaction })`**
  returns `Promise<{ id: string }>`.
  - Calls `validateResult(result)` and throws on failure.
  - Resolves the programme (`resolveProgrammeId`; the hard gate is unchanged).
  - Writes the assessment with:
    - `assessment_type = question_code`;
    - `score = derived.ea_rubric_total ?? derived.total_correct ?? 0`. Q11 emits `total_correct: 0`
      and its real score in `ea_rubric_total` (`StoryWritingRubricQuestion/index.tsx:216-222`),
      so the rubric total must come first;
    - `total_items = items.length`;
    - `derived` JSON;
    - `assessment_date` = local date;
    - `created_at`/`updated_at` = now.
  - Writes items exactly as emitted, with `metadata ?? {}` and ids from `assessmentItemDomainId`.
  - Enqueues **one** outbox row:
    `enqueueDomainOutbox(txn, 'assessments', id, 'insert', { ...assessmentColumns, items })`.
    - The payload stays **flat**: the parent's columns at the top level, plus an `items` array.
    - This keeps existing code working unchanged. Reference-ID repair
      (`referenceDataRepository.retargetOutboxPayloadReferences`, which rewrites
      `payload.programme_id`) and `dependenciesForRecord` (which reads `payload.battery_run_id`)
      both read top-level fields.
    - The same holds for the run payload.
  - **Throws `ASSESSMENT_ALREADY_SAVED`** if the id exists, and
    **`QUESTION_ALREADY_DECIDED`** if `(batteryRunId, question_code)` exists.
  - `assessmentId` is required, because `result` carries no id. The screen creates it once per
    presentation, so a retry keeps the same id.
- **`getQuestionResults({ userId, programmeId, childId, childIds, questionCodes, language, sinceDate, recordedByUserId, includeSkipped = false, order = 'asc' })`**
  returns `Promise<QuestionResult[]>`, where
  `QuestionResult = { ...assessmentRow, derived: object, items: ItemRow[] }` and items are
  ordered by position. It is programme-scoped and does not filter on `battery_run_id`. Skipped
  results are those whose `stopped_reason` starts with `skipped_`.
- **`getLetterResults(args)`** is `getQuestionResults({ ...args, questionCodes: LETTER_EVIDENCE_CODES })`,
  with `LETTER_EVIDENCE_CODES = ['letter_sounds']` exported from
  `src/utils/assessmentRegistry.js` (created here).
- **`latestLetterResult({ userId, childId, language })`** returns `Promise<QuestionResult|null>`:
  the most recent non-skipped letter result with at least one `metadata.reached !== false` item,
  ordered by `assessment_date desc, created_at desc`.
- **`countResults({ userId, childId, questionCode })`** returns `Promise<number>` and replaces
  `countAssessments`.
- **`batteryRunsRepository`:**
  - `startRun({ id, userId, childId, classId, batteryCode, batteryVersion, language })` sets
    `started_here = 1`;
  - `finalizeRun(id)` and `abandonRun(id)` refuse when `started_here = 0`;
  - `getUnfinishedRunForChild({ userId, childId })`, `getUnfinishedRunsForUser(userId)` and
    `getRunWithResults(id)`.
  - Each write coalesces into the single outbox row `battery_runs:<id>:insert` until it is
    acknowledged. After that, it uses `battery_runs:<id>:update`. Both carry the full run header
    as payload.
- **Old APIs stay for now.** `saveAssessment`, `countAssessments` and the summary-row reads are
  deleted in Task 11, together with their last callers and their tests.

- [ ] **Step 1: Write the failing tests** (`better-sqlite3`, using the repository test helpers):
  - a real `LetterSoundsQuestion`-shaped result saves 1 assessment, 60 items and exactly one
    outbox row. The outbox payload's `items.length === 60`, and the assessment and items are
    `pending`;
  - saving the same id twice throws `ASSESSMENT_ALREADY_SAVED`, and nothing changes;
  - a second result for the same run and Question throws `QUESTION_ALREADY_DECIDED`;
  - a skipped result (0 items) saves with `total_items === 0`;
  - **a round trip for every package component.** Build each component's result through
    `runContractTest` fixtures, save it, and assert that the outbox payload passes
    `assertSubmitShape(payload)`. That is a JS mirror of the RPC's shape checks, exported from
    `src/services/assessmentFamilyPayload.js` (created here). It covers a partly scored Q11 (sparse
    positions) and a Listen-and-answer result (metadata defaulted);
  - a partly scored Q11 with `ea_rubric_total: 12` stores `score === 12` in SQLite and in the
    outbox payload;
  - `getLetterResults` returns a standalone result and a battery Q1 result, and excludes a
    `word_reading` result;
  - `latestLetterResult` skips a newer skipped Q1;
  - `finalizeRun` on a `started_here = 0` run throws.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(db): saveQuestionResult, result accessors and battery runs repository`.

---

### Task 9: Sync — one family, one call, one acknowledgement

**Files:**
- Modify: `src/services/assessmentFamilyPayload.js` (adds `toSubmitArgs`)
- Modify: `src/services/offlineSync.js`
- Modify: `src/db/repositories/referenceDataRepository.js` (`battery_runs` programme retarget)
- Test: `__tests__/assessmentFamilySync.test.js` (real SQLite plus a stubbed supabase client, in
  the style of `__tests__/batchFailureSemantics.test.js`) and
  `__tests__/assessmentFamilyRpcError.test.js` (a real `PostgrestClient` with stubbed `fetch`, in
  the style of `__tests__/rowVersionRefusal.test.js`)

**Interfaces:**
- **`toSubmitArgs(payload)`** returns `{ p_assessment, p_items }`. It splits the flat payload,
  applies `SERVER_COLUMNS.assessments` and `SERVER_COLUMNS.assessment_items`, and drops
  `updated_at`. **`assertSubmitShape(payload)`** throws `TypeError` on anything
  `submit_assessment` would reject with `22023`. Both live in
  `src/services/assessmentFamilyPayload.js`, which **Task 8 creates** with `assertSubmitShape`.
  Task 9 adds `toSubmitArgs`.
- **`runServerOperation`** gains branches before the generic upsert:
  - **`assessments` insert:**
    `supabaseClient.rpc('submit_assessment', { p_assessment, p_items })`. `'inserted'` and
    `'already_present'` mean success.
  - **`battery_runs` insert or update:** `supabaseClient.rpc('save_battery_run', { p_run })`.
    `'inserted'`, `'updated'` and `'unchanged'` mean success.
- **`applyAcknowledgedPayload`** for `assessments`: in the same finalize transaction, run
  `update assessment_items set sync_status = 'synced', last_sync_error = null where assessment_id = ?`.
- **Tables**
  - `PUSH_ORDER`: insert `'battery_runs'` before `'assessments'` and remove `'assessment_items'`.
  - `TABLE_DEPENDENCIES`: `battery_runs: ['children']`; `assessments: ['children', 'battery_runs']`.
    Remove `assessment_items`.
  - `dependenciesForRecord`: for `assessments` with no `payload.battery_run_id`, delete
    `battery_runs`, following the existing optional-parent pattern for `class_id`/`group_id`.
  - `PARENT_FK_COLUMNS`: `battery_runs: { children: 'child_id' }`;
    `assessments: { children: 'child_id', battery_runs: 'battery_run_id' }`. The class is not a
    local FK.
  - `GRANT_SUBJECTS.battery_runs` mirrors `GRANT_SUBJECTS.assessments`.
  - Remove `assessment_items` from `BATCHABLE_UPSERT_TABLES`.
  - `SERVER_COLUMNS`: add the new `assessments` columns and a `battery_runs` list. Drop
    `items_tested` from the payload.
- **`classifyError`**
  - `MA001`, `MA002` and `22023` are terminal.
  - `28000` is retriable.
  - Existing `42501`/`23503` evidence logic is unchanged.
- **`buildSyncPayload`** for `assessments` delegates to `toSubmitArgs`. It never sends
  `updated_at`; the server stamps it.
- **Reference repair.** In `referenceDataRepository.js`, add
  `{ tableName: 'battery_runs', column: 'programme_id' }` to `programmes.foreignKeyRetargets`.

- [ ] **Step 1: Write the failing tests:**
  - one family of 61 items results in one `rpc('submit_assessment')` call, with `p_items.length === 61`;
  - after success, outbox empty, parent and all items `synced` (one transaction: inject a
    failure after the outbox delete and assert both roll back);
  - **`already_present`** is success;
  - **`MA001`** makes the parent `terminal` and keeps the items unsynced;
  - **1,050 queued rows of other tables plus 3 families:** every family is sent whole within the
    passes, and no request carries a partial `p_items`;
  - **30 families plus a pending `child_ea_assignments` row** whose first upload fails:
    - the families stay `pending`, not terminal;
    - after the assignment succeeds, one `syncAll()` drains them all (Review Focus 4);
  - **a run plus 2 Questions:** the run is sent before the Questions;
  - **`unchanged`** is success;
  - **`MA002`** is terminal;
  - in `assessmentFamilyRpcError.test.js`, a PostgREST error body `{code:'MA001'}` reaches
    `classifyError` as terminal;
  - **reference repair:** a queued family and a queued run whose `programme_id` is replaced by
    the canonical server id (`replaceFromServer` with a conflicting programme row) upload with
    the new id;
  - **optional run:** a failed (`failed` or `terminal`) battery run blocks only the families
    whose `battery_run_id` is that run. A standalone family (`battery_run_id: null`) in the same
    pass uploads.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run `npx jest __tests__/assessmentFamily* __tests__/offlineSync* __tests__/batch*`
  and then the full suite. Expected: PASS. List any changed expectation in existing sync tests,
  with the reason.
- [ ] **Step 5:** Commit: `feat(sync): assessment family uploads through submit_assessment as one unit`.

---

### Task 10: Languages, test registry, and mastery evidence from stored items

**Files:**
- Create: `src/utils/assessmentRegistry.js`
- Modify:
  - `src/utils/letterMastery.js`, `src/utils/masteryState.js`, and `src/utils/dashboardStats.js`
    (`getLetterMasteryRanking`);
  - `src/components/assessment/LetterMasteryPanel.js`;
  - the session tracker: `LetterTrackerBottomSheet.js` (grep for its path) and
    `LiteracySessionForm.js`. Today the form derives `'english'`/`'isixhosa'` at lines ~304–308
    and passes it to the tracker and persistence; it moves to `languageCodeForHomeLanguage`;
  - `src/services/literacySessionPersistence.js`. It resolves `LETTER_SETS[trackerLanguageKey]`
    today, and moves to `PEDAGOGICAL_ORDERS[code]` with `LANGUAGE_LABELS[code]` for the stored
    confirmation.
- Test: `__tests__/assessmentRegistry.test.js` and `__tests__/letterMastery.storedItems.test.js`;
  update `__tests__/masteryState.test.js` and `__tests__/LetterMasteryPanel.test.js`

**Interfaces:**
- **`assessmentRegistry.js` exports:**
  - `languageCodeForHomeLanguage(text)` returns `'en' | 'xh' | 'zu' | null`. It
    case-insensitively matches `english`, `xhosa`/`isixhosa` and `zulu`/`isizulu`, and returns
    `null` otherwise.
  - `LANGUAGE_LABELS = { en: 'English', xh: 'isiXhosa', zu: 'isiZulu' }`.
  - `LETTER_EVIDENCE_CODES = ['letter_sounds']`.
  - `PEDAGOGICAL_ORDERS` re-keyed `en`/`xh`, with the values from `egraConstants.js`.
  - `STANDALONE_TESTS`, which is
    `[{ code: 'letter_sounds', title: 'Letter Sounds', durationSec: 60, component: 'LetterSoundsQuestion' }, { code: 'word_reading', title: 'Word Reading', durationSec: 60, component: 'ReadWordsQuestion' }]`.
    Item sets come from the package's `CURRENT_ITEM_SETS[code][lang]`.
- **`computeAssessmentMastery(result, pedagogicalOrder)`** returns `Set<string>` of lowercase
  letters, per spec §10.4. It reads only `result.items` (`prompt`, `is_correct`,
  `metadata.reached`), with letters case-folded. It has **no** letter-set parameter.
- **`loadMasteryState({ repositories, userId, childId, languageCode })`** uses
  `latestLetterResult`.
- **Confirmations in Plan 1.** `letter_mastery.language` still stores labels until Plan 2. Read
  and write confirmations with `LANGUAGE_LABELS[code]`. This is the only place labels are used,
  and it has a `// Plan 2 re-keys letter_mastery to codes` comment.

- [ ] **Step 1: Write the failing tests:**
  - `languageCodeForHomeLanguage`: `'isiXhosa'` → `xh`, `'English'` → `en`, `'isiZulu'` → `zu`,
    and `'Afrikaans'`, `''` and `null` → `null`;
  - mastery:
    - `A` correct and `a` correct → `a` mastered;
    - `A` correct and `a` wrong → not mastered;
    - an unreached `b` → not mastered;
    - a letter outside the order is ignored;
    - a result whose rows are reordered gives the same answer, because positions are not read;
  - `loadMasteryState` takes evidence from a battery Q1 result written by another user id, and
    unions it with a confirmation stored under label `isiXhosa`;
  - **session flow** (extend `__tests__/LiteracySessionForm.submit.test.js`): an isiXhosa class
    shows a stored letter result's mastered letters in the tracker, and submitting a new
    confirmation persists `language: 'isiXhosa'` (the Plan 1 label).
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement it, and move all three mastery readers to it.
- [ ] **Step 4:** Run the mastery, panel and tracker tests plus the full suite. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(mastery): evidence from stored letter results; language codes`.

---

### Task 11: The standalone test host; delete the old capture stack

**Files:**
- Create: `src/screens/assessments/StandaloneTestScreen.js`
- Modify:
  - `src/navigation/AppNavigator.js`: replace the routes `LetterAssessment` and
    `SequentialAssessment` with `StandaloneTest`;
  - `src/screens/main/AssessmentsScreen.js`: cards from `STANDALONE_TESTS`, with the copy
    "60-second letter sound test" and "60-second word reading test";
  - `src/screens/assessments/AssessmentChildSelectScreen.js`;
  - `src/screens/assessments/ChildResultsScreen.js`;
  - `src/screens/assessments/AssessmentResultsScreen.js`;
  - `src/screens/main/ProfileScreen.js`: remove the capture-mode toggle.
- Delete:
  - `LetterAssessmentScreen.js` and `SequentialAssessmentScreen.js`;
  - `src/hooks/useAssessmentSession.js`;
  - the components `EgraLetterGrid.js`, `LetterTile.js`, `CaptureHeader.js`,
    `LastAttemptedBottomSheet.js`, `EndAssessmentButton.js` and `AssessmentTimer.js`, where no
    remaining import exists. Grep each before deleting.
  - `src/utils/sequentialAssessmentReducer.js` and `src/utils/assessmentRouting.js`;
  - `src/utils/assessmentScoring.js`'s `buildAssessmentRecord`/`computeAssessmentResult`;
  - the `CAPTURE_MODES` usage and the `deviceSettings` capture-mode functions;
  - their tests (the `LetterAssessmentScreen.*`, `SequentialAssessmentScreen.*`,
    `EgraLetterGrid.*`, `captureMode.*` and `assessmentRouting` tests).
- Test: `__tests__/StandaloneTestScreen.test.js`; update
  `AssessmentChildSelectScreen.languagePicker.test.js`, `ChildResultsScreen.test.js` and
  `AssessmentResultsScreen.test.js`

**Interfaces:**
- **Route params:** `StandaloneTest` takes `{ testCode: 'letter_sounds' | 'word_reading', child, languageCode }`.
- **What the screen does:**
  - Creates `assessmentId = uuid()` once, in a ref.
  - Renders the package component with:
    - `itemSet = CURRENT_ITEM_SETS[testCode][languageCode]`;
    - `durationSec`;
    - `language = languageCode`;
    - `childName` = the child's display name;
    - `allowSkip={false}`;
    - `captureMode="sequential"` for words.
  - On `onComplete`, calls `saveQuestionResult({ assessmentId, result, childId, userId, captureMode: 'sequential' })`.
- **Saving and failure.**
  - On success, `navigation.replace('AssessmentResults', { assessmentId, testCode, child, languageCode })`,
    then trigger background sync.
  - On failure, it keeps the result in state and shows a bottom sheet:
    *"Couldn't save — try again"*, with **Try again**, which re-calls with the same id.
  - A second `onComplete` or double tap while saving is ignored.
- **Leaving early.** Leaving before `onComplete` asks for confirmation in a bottom sheet (today's
  "End Assessment?" behaviour) and discards the result.
- **Results screen.** `AssessmentResultsScreen` reads the saved result with
  `getQuestionResults({ … })` by id. It shows the raw score as the hero (`score` of
  `total_items`), with "Stopped: 10 in a row wrong" when `stopped_reason === 'stop_rule'`. **Try
  again** replaces the route with a new `StandaloneTest`.
- **Child select.**
  - `AssessmentChildSelectScreen` uses `languageCodeForHomeLanguage(childClass?.home_language)`.
  - When the result is `null`, or no item set exists for that language, it opens the existing
    `SelectSheet`, listing only languages with an item set for that test.
  - It sorts children with `getQuestionResults` by `testCode`.

- [ ] **Step 1: Write the failing tests:**
  - **`StandaloneTestScreen`** (mock the package component to call `onComplete` with a fixture
    result):
    - one `saveQuestionResult` call per completion, even when `onComplete` fires twice;
    - a save rejection shows the retry sheet, and the retry uses the same `assessmentId`
      (Review Focus 5);
    - success replaces the route to `AssessmentResults`.
  - **Child select:**
    - a class with `home_language: 'Afrikaans'` opens the picker with options exactly
      `['English', 'isiXhosa']`, and never navigates directly (Review Focus 1);
    - an `isiXhosa` class navigates with `languageCode: 'xh'`.
  - **Results screen:** a `stop_rule` result shows `Stopped: 10 in a row wrong` and `9 / 60` for
    9 correct.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the screen and update the entry screens. Then delete the old stack
  and its tests. `/usr/bin/grep -rn "LetterAssessment\|SequentialAssessment\|useAssessmentSession\|resolveAssessmentRoute\|getCaptureMode" src __tests__`
  must return nothing.
- [ ] **Step 4:** Run the full suite and `npm run test:types`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(assessments): standalone tests host the package components; remove the old capture stack`.

---

### Task 12: Readers — history, detail, rankings and counts

**Files:**
- Modify:
  - `src/screens/assessments/AssessmentHistoryScreen.js` and `AssessmentDetailScreen.js`;
  - `src/components/assessment/AssessmentDetailGrid.js`;
  - `src/utils/dashboardStats.js` (`getLetterAssessmentRanking`, `getWordAssessmentRanking`,
    `getAssessmentsTabStats`, `getChildrenTabStats`, `getAssessmentCoverage`);
  - `src/utils/assessmentHistoryMap.js`;
  - `src/screens/insights/AssessmentRankingScreen.js`;
  - `src/screens/main/HomeScreen.js` and `src/screens/main/ChildrenListScreen.js`;
  - `src/db/repositories/assessmentsRepository.js` (`getAssessmentCountsSince`).
- Test: update `__tests__/AssessmentHistoryScreen.plan5.test.js`,
  `__tests__/AssessmentRankingScreen.test.js`, `__tests__/assessmentHistoryMap.test.js`,
  `__tests__/HomeScreen.test.js`, `__tests__/ChildrenListScreen.test.js` and the
  `dashboardStats.*` tests. Create `__tests__/readers.mixedResults.test.js`.

**Behaviour (spec §9.2–9.3)**
- **History.** It lists the EA's own results: standalone ones open Detail, and battery runs show
  one read-only row (`WelaPLUS · ⟨status⟩ · ⟨n⟩ Questions`). Battery Questions never open
  Detail.
- **Detail grid.** It renders from `items`, grouped by `metadata.row`. Words without a row use
  `row_lengths` from the stored `item_set_id`'s set, or wrap if it is missing. There are no
  hard-coded columns.
- **Rankings.** Raw `score` against `total_items`, with the band
  `getScoreBand({ toolCode: question_code, grade, language, rawScore: score })`. Grade comes from
  the `child_class_memberships` row whose `enrolled_at`–`exited_at` window contains
  `assessment_date`, falling back to the current class.
- **"Assessed" counts.** Home's children-to-assess count, Children's "Unassessed" count and the
  Assessments tab's "% Assessed" and "Total" all mean *has a non-skipped letter result with
  `assessment_date` in the active academic year*. "Avg Accuracy" becomes **"Avg score"**: the
  mean of each child's latest letter score.

- [ ] **Step 1: Write the failing test** `readers.mixedResults.test.js`. Seed real SQLite with:
  - one standalone letter result (child A);
  - one battery run with Q1 and Q6 (child B);
  - one battery run whose only Question is a skipped Q1 (child C);
  - one `word_reading` result (child D).

  Then assert:
  - the letter ranking contains A and B and excludes C and D;
  - the Assessments-tab Total is 2;
  - Home coverage counts A and B as assessed, and not C or D;
  - History renders four rows: A's result, B's run row, C's run row and D's result;
  - the Detail grid for A renders 5 rows of 12.
- [ ] **Step 2:** Run the test. Expected: FAIL.
- [ ] **Step 3:** Implement it, moving every reader to `getQuestionResults`, `getLetterResults`
  or `latestLetterResult`. Then run
  `/usr/bin/grep -rn "letter_egra\|word_egra\|letter_language\|correct_letters\|last_letter_attempted" src`.
  It must return nothing outside the comments in `migrations.js`.
- [ ] **Step 4:** Run the full suite and `npm run test:types`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(assessments): readers select results by test, across standalone and battery`.

---

### Task 13: Docs, in the same branch

**Files:**
- `documentation/rls-sync-contract-map.md`:
  - new or rewritten rows for `assessments`, `assessment_items` and `battery_runs` (producer,
    `submit_assessment`/`save_battery_run`, SELECT, ordering, identity, conflict, "no pull yet");
  - a short "server-owned change timestamps" note;
  - the outbox family rule.
- `CONTEXT.md`:
  - "Assessment Question" example becomes "Letter Sounds";
  - Letter mastery evidence now includes WelaPLUS Q1, case-folded and read from stored items;
  - Capture mode: step-by-step is the only mechanic for the letter and word tests;
  - add **Stop rule**, **Letter result** and **Item set**.
- New ADR: `docs/adr/0009-assessment-results-one-write-call-complete-families.md`, as spec §16
  describes.
- `docs/superpowers/specs/2026-10-14-welaplus-release-1-design.md`: a dated status note pointing
  §7, D4 (Q1) and D10 to the new spec, plus the Q1 code `letter_sounds`.
- `documentation/ROADMAP.md`:
  - §1: mark the U2, ADR-0007 enforcement and server-stamp items done for upload, with a pointer;
  - pull items stay open (Plan 3);
  - §8: WelaPLUS Plan 2 done in part, with a pointer.
- `documentation/egra_letter_sets.md`: replace the body with a pointer to
  `src/assessment-questions/itemsets/` and the content-status entries. Keep the pedagogical
  orders section.
- `documentation/build-log.md`: a row per task with the commands and their results, plus the v15
  clear.

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** Run `npm test -- __tests__/docs` if a docs guard exists (grep for one).
  Otherwise check links with `/usr/bin/grep -o "\](\.\./[^)]*)"` on the edited files and confirm
  each path exists.
- [ ] **Step 3:** Commit: `docs: assessment results contract, ADR-0009, roadmap and context`.

---

### Task 14: Release gates (controller, each with Jim's yes at the time)

- [ ] **Step 1:** Run the full jest suite, `npm run test:types`, and all six PostgreSQL harnesses
  on the disposable server. Record the counts in the build log.
- [ ] **Step 2:** Run Codex adversarial review on the branch
  (`--cwd <worktree> --base origin/main`). Fix the findings worth fixing, at most two rounds.
- [ ] **Step 3: Jim's yes.** Do the read-only preflight on `masi-app-sqlite`:
  - record counts of `assessments`, `assessment_items` and `letter_mastery`;
  - confirm the Core Literacy R–3 programme row.

  **Wipe** practice `assessment_items`, then `assessments`, through the isolated helper.
  `letter_mastery` stays until Plan 2.
- [ ] **Step 4: Jim's yes.** Apply the migration with `npm run sqlite:staging:push` through the
  helper, and verify:
  - the functions exist;
  - `has_table_privilege('authenticated','public.assessments','INSERT')` is false;
  - `updated_at` is stamped on a test insert done inside a rolled-back transaction.
- [ ] **Step 5: Jim's yes.** Make EAS preview builds (Android and iOS). Install them on the
  Galaxy A03s and the iPhone, with test phones synced first.
- [ ] **Step 6: Device gate**, from spec §14, Plan 1 row. Run each on the A03 at 360 dp, with
  screenshots:
  - **Standalone letter test (isiXhosa):** 10 wrong in a row gives the stop card. Undo, continue
    and finish; the server holds one family with 60 items.
  - **Word test:** run to completion.
  - **Offline:** queue 30 families, toggle airplane mode mid-upload, and confirm the server holds
    only complete families (count items per assessment).
  - **Mastery:** the new result shows in the child tracker, the session-form tracker and the
    mastery ranking.
  - **The letter grid** against the printed 2024 card, row for row.
  - On the iPhone, repeat the letter test and the mastery check.
- [ ] **Step 7:** Build log rows for the gates. Open the PR, and ask Jim before merging.

# Numeracy Track D: Number Tracker, Lesson Plan, How to Teach It and Wrap Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The numeracy screens. A numeracy EA gets a Number tracker for each child and a lesson flow in
Record: choose a group, see the lesson plan, open How to teach it, Wrap up, save. The save writes the
session, its attendees and every tick in one SQLite transaction.

**Architecture:** The pieces sit in four layers.
- **Pure helpers in `src/numeracy/`** sit beside Track C's planner, under the same purity guard: card
  readiness, the activity pick, Swap options, "still on", and the stored-plan wrapper.
- **`src/numeracyLesson/`** holds the loaders, copy and draft transitions. These read repositories or
  content, so they live outside the guard.
- **The save service** is `src/services/numeracyLessonSave.js`, a copy of `lessonSave.js`.
- **Screens and components** are `src/screens/numeracy/` and `src/components/numeracy/`.

The draft reuses `lesson_drafts` and its controller. One local-only column, `kind`, tells the two
draft shapes apart (SQLite v22). The session record is `sessions.activities.numeracy` JSON, so there
is no server change.

**Tech Stack:** React Native (Expo), JavaScript, SQLite through the signed-in EA handle, Jest on Node
20 (`jest-expo`, real `better-sqlite3` for integration suites). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-numeracy-tracker-and-lessons-design.md`. The relevant
sections are §3 words, §5 child knowledge, §6 screens, §8.2 session record, §8.3 save, §9.3–9.4
cards and freezing, §10 order, §11 docs and §13 testing. Read it with this plan. Read Track C's plan
(`2026-10-31-numeracy-c-planner-evidence.md`) for the `Plan` shape.

**Branch:** `feat/numeracy-screens`, off `origin/main`.

**Who builds:** Codex builds each task (`--model gpt-6.1-sol --effort high`). Claude reviews the diff
and reruns the tests before the next task. Codex's sandbox usually cannot commit, so the orchestrator
runs each commit step.

**Releasable only as a whole.** Never build from a mid-branch commit. Numeracy is **not** in the
November literacy retest. It goes to the test tracks for Masi's December trial, and to field EAs only
after the partner signs off and `2026.1` is frozen (§10). Literacy behaviour must not change: every
literacy suite passes unmodified unless a task names the change.

## Before you start (orchestrator, Task 0)

- [ ] `git fetch origin && git switch -c feat/numeracy-screens origin/main`.
- [ ] Confirm what this plan depends on:
  - Track B is merged: `git log origin/main --oneline | grep '(#140)'` shows one line.
  - `src/db/migrations.js` ends at version 21 (`skill_mastery`).
  - `grep -n "skillMasteryCompletenessByChild\|skillMastery:" src/session/handleServices.js` shows both.
  - Tracks A and C are on main: `git log origin/main --oneline | grep -E '\(#13[89]\)'` shows two lines.
  - No open PR adds SQLite v22: `gh pr list --search "migrations.js" --state open`. If one does,
    renumber Task 1's migration and tell Jim.
  - If #140 has not merged, stop. Do not stack this branch on it.
- [ ] In a fresh worktree run `npm ci`.
- [ ] Record the baseline: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand`
  and `npm run test:integration`, with their suite and test counts, for the build log.
- [ ] Every Jest command below needs the Node 20 prefix. Every new real-SQLite suite must be added to
  `jest.integration.config.js` `testMatch` (an explicit list) in the task that creates it.

## Calls this plan makes (Jim to check)

These are Claude's calls. They are listed again in the PR body.

| # | Call | Why |
|---|---|---|
| P1 | **Claude's call:** a local-only `lesson_drafts.kind` column (`'literacy'` \| `'numeracy'`, SQLite v22) tells the draft shapes apart. The spec's alternatives were `programme_id` or a separate `numeracy_lesson_drafts` table. | See "Persisted state check" below. |
| P2 | **Claude's call:** the numeracy plan freezes on the first **Swap** or on **Wrap up →**, whichever comes first. | Numeracy has no "taught" ticks on the lesson screen. These are the two moments the taught list stops being the suggestion. |
| P3 | **Claude's call:** the group's history is its numeracy sessions by `sessions.group_id` this year in this programme. Literacy's member-attendance rule is not used. | §9.1 says "the group's numeracy sessions". Pulled sessions keep `group_id` (v18). |
| P4 | **Claude's call:** "still on". For each child who needs help: if they're missing an earlier step in the card's own skill, show their first unknown step in that skill ("still on up to 5"). Otherwise take the first missing earlier step and show the first unknown step in *its* skill, with the skill name ("still on Count objects up to 10"). | Review note 2. The spec's example is only the same-skill case. |
| P5 | **Claude's call:** a child in both lists is shown only under "need help". Display "can help" = `canHelp − needHelp`. | Review note 1. |
| P6 | **Claude's call:** the "next step" is per skill: the first step the child doesn't know. It gets the dashed red outline only when the child is ready for it. The step sheet's **Tick when** box shows it either way. | The spec says "the Tick when box for the child's next step" inside one skill's sheet, so "next" is per skill. Outlining only ready steps keeps the grid calm. |
| P7 | **Claude's call:** the header shows the sum of the chosen activities' minutes ("Group 3 · 18 min lesson"). Each card shows its own activity's minutes. | Real activities run 4–8 minutes, so "7 + 8" and a fixed "20 min" aren't guaranteed. |
| P8 | **Claude's call:** How to teach it is a pushed screen, not a sheet. It shows the step's goal and the card's chosen activity only: numbered steps and what's needed. | The EA reads it for 7 minutes while teaching. §4.3: "a mixed-lesson card shows one of the step's activities". |
| P9 | **Claude's call:** "who ticked it" reads "Ticked by you · 3 Nov" or "Ticked by another EA · 3 Nov". | A row carries only the `changed_by` id, and the phone has no staff name table. |
| P10 | **Claude's call:** implied steps count toward "15 / 37 steps". | They are known (§3 Known step). |
| P11 | **Claude's call:** the numeracy Record branch keys on `isMaths === true` alone, not on the job title. While the subject is loading, the spinner stays. | ADR 0012. The subject comes from the programme. |
| P12 | **Claude's call:** if a literacy draft is still open when a numeracy EA opens Record (left from before a programme change), the picker shows a note and a **Discard it** button. That draft can't be saved now (`PROGRAMME_NOT_ACTIVE`). Discard opens the draft in the controller first, so it works after a cold start and on a corrupt draft. | Otherwise the one slot blocks numeracy for good. |
| P13 | **Claude's call:** Wrap up has no "save without…" confirmation, and the save button says **Save lesson** (§6.5). | The taught cards are recorded automatically, and ticks are optional. |
| P14 | **Claude's call:** a tick for a step key the bundled curriculum no longer has is skipped at save and counted as kept back. It never throws. | A draft can span an OTA content update. A retired key means a changed meaning (§4.4). |
| P15 | **Claude's call:** Session complete gains a **Taught** receipt row (step titles). The literacy receipt is unchanged. | The spec says nothing about the numeracy completion view. |
| P16 | **Claude's call:** the leave/discard/stack-cleanup logic is extracted from `LessonScreen` into `useLessonExitGuard`, so both lesson screens share one navigation implementation. `LessonFlowNavigation.test.js` passes unmodified. | Keeps one copy of subtle, tested navigation fixes. |

### Persisted state check (check-solution)

**The only new persisted element is `lesson_drafts.kind`** (SQLite v22, local only, additive,
`not null default 'literacy'`).

- **What the user sees change.**
  - A numeracy lesson in progress resumes into the numeracy screens, from Home and from Record.
  - A leftover literacy draft is recognised and can be discarded (P12).
  - Without a discriminator, a numeracy draft opens the literacy Lesson screen and fails its validator.
- **Deletion test: what breaks if it's removed?**
  - Telling the shapes apart by `programme_id` needs a `programmes` lookup inside the repository's
    validator. During a first sign-in that row may not have downloaded yet (MA-BUG-20261031-002).
  - Telling them apart by JSON contents is ambiguous: a brand-new draft of either kind has empty
    tracker changes.
  - A separate table would allow two lessons in progress at once, and would double the Home, picker
    and controller branching.
- **No other new state.**
  - The session record is JSON in the existing `sessions.activities` (spec §8.2, PRD "JSON, not new
    columns").
  - Ticks use Track B's `skill_mastery`.
  - No server migration, so the staging precondition in spec §10 doesn't apply to this branch.

## Global Constraints

**Copy**
- Exact copy from spec §6, verbatim, where this plan quotes it:
  - "Number tracker · {n} / {total} steps"
  - "Known because '{step label}' is ticked."
  - "Who can do these without help?" and "Teaching it today doesn't count."
  - "This group knows every step that's ready. Use Swap to choose a step."
  - "{r} of {p} are ready"
  - "can help a partner"
  - "All 3 right? Tick it." (from content)
  - **Save lesson**, **Wrap up →**, **Who are you teaching?**
- Any other new copy goes to Jim for a wording pass in the PR.
- Plain words on every EA string (spec §2). No "counting on", "count all", "subitise", "number
  bond(s)", "rung", "ladder", "band" or "strategy". Task 4's static test enforces this over the new
  directories.
- Number sentences in copy ("2 + 2") keep their spaces as ` `, so a sum never breaks across
  lines (MA-BUG-20261101-005).
- `note_for_partner`, `source` and `source_ref` are never shown (§4.3).

**Data access**
- Data goes through `useSignedInEA()` repositories and services only. A service may build
  repositories from an explicit `handle`, as `lessonSave.js:26-30` does.
- `handle.withTransaction` is not re-entrant: pass `transaction` down.
- The one writer of a numeracy draft is `services.lessonDraft`, the existing controller, unchanged.
- Domain rows and their outbox rows are written in one transaction. Ticks go through
  `repositories.skillMastery.setSkillMastery` only.
- No server change, no Supabase migration, no new synced table. The local schema change is v22 only.

**Saved shapes**
- Saved `sessions.activities.numeracy` uses the spec §8.2 keys: `curriculum_edition`, `plan`,
  `taught`, plus `plan_reason: 'past_date'` from §9.4. Task 3 fixes the exact shape.
- Tap times are `new Date().toISOString()` when tapped, unchanged through retries.
- The session id is the draft's `session_id`, reused across save attempts.

**Gating**
- Numeracy entry points show only when `useActiveProgrammeSubject().isMaths === true`. A `null` or
  loading subject shows neither tracker icon (ADR 0012).
- **Showing is not capturing.** `isMaths` can come from the per-EA cache after a failed programme
  read (`useActiveProgrammeSubject.js:11-14,31-36`), so it decides only what is shown. Every numeracy
  write needs a programme confirmed as maths by a fresh read:
  - `confirmNumeracyProgramme` (Task 2) runs before the picker lists groups (Task 9), before a new
    draft opens (Task 8), and when the Number tracker panel loads (Task 7);
  - the draft and every tick carry that confirmed `programmeId`, never one resolved later;
  - the save checks inside its transaction that the draft's programme is a maths programme
    (`PROGRAMME_NOT_NUMERACY`, Task 5).
- Reuse `NoActiveProgrammeNotice` and `useSessionLaunchGuard` unchanged; #80 owns the first-sign-in fix.

**UI**
- Bold Red components and tokens only (`documentation/design-system.md`).
- Bottom sheets only: no `Alert.alert`, `Modal` or Paper `Dialog`.
- Tiles are at least 44 dp. The tracker fits a 360 dp phone with no sideways scrolling.

**Static guards that must stay green**
- `productionBindingStatic`, `sharedClientStatic`, `moduleStateAllowlist`, `lessonPlanEnginePurity`
  (now also covering the new `src/numeracy/` files), `historyPullTriggerBudget` (no
  `assessmentHistory` text in `src/components/` or `src/hooks/` except the one page-observer hook),
  `designSystemGuard`, `keyboardAvoidingImports`, `screenTimerAudit`, `domainTextInputAudit`,
  `AppNavigator.headers`.

**Performance on the A03s**
- Picker rows < 500 ms after focus.
- Tile tap to redraw < 300 ms.
- The planner runs once per input change, not per render.

**Process**
- `Refs #N`, never `Closes #N`.
- Standing docs ship in this branch (Task 13).
- Device and EAS steps need Jim's go.

## Review Focus

1. **A child in both "need help" and "can help"** (knows `add.10` but not `count.10`). The child is
   listed once, under need help, with "still on Count objects up to 10".
   Tests: Task 3 `'a child who needs help is never listed as able to help'`, Task 10
   `'need help and can help lines never name the same child'`.
2. **A tick the save must keep back.** A newer correction is already owed for that step, or
   `setSkillMastery` returns `null`. The save succeeds, the tick is not written, and no error shows.
   Tests: Task 5 `'a tap older than the owed correction time is skipped'` and
   `'a null setSkillMastery result counts as kept back, not an error'`.
3. **A literacy draft in the slot when a numeracy EA opens Record** (programme changed). The EA sees
   the discard note, never the literacy Lesson screen, and can start numeracy after discarding.
   Test: Task 9 `'a leftover literacy draft offers Discard it, then the numeracy picker'`.
4. **A lesson resumed the next morning, or back-dated on Wrap up.** The frozen cards stay. The plan
   saves as `null` with `plan_reason: 'past_date'`, and `taught` is still saved.
   Tests: Task 8 `'a frozen plan never recomputes'`, Task 5 `'a back-dated lesson saves plan null with
   past_date and keeps taught'`.
5. **A sync pass or history page lands while the tracker sheet holds pending changes.** The deferred
   sheet does not re-read, and the immediate panel does.
   Tests: Task 11 `'the wrap-up tracker sheet ignores sync refreshes'`, Task 7 `'a skill_mastery sync
   result refreshes the panel'`.
6. **Cached maths after a move to literacy.** The screens may still show numeracy for a moment, but
   nothing is written under the literacy programme: the picker lists no groups, the lesson opens no
   draft, the panel is read-only, and the save refuses `PROGRAMME_NOT_NUMERACY`.
   Tests: Task 2 `'confirmNumeracyProgramme ignores cached maths after a move to literacy'`, Task 5
   `'a numeracy draft on a literacy programme refuses the save'`, Task 7 `'cached maths after a move
   to literacy gives a read-only grid'`, Task 9 `'cached maths after a move to literacy lists no
   groups'`.
7. **Maths data lands while a lesson is open.** An unfrozen plan updates; a frozen one keeps its cards.
   Tests: Task 8 `'a history page landing while mounted refreshes an unfrozen plan'` and `'… on a
   frozen plan keeps cards and refreshes readiness'`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/db/migrations.js` (modify) | v22 `lesson_drafts_kind`. |
| `src/db/repositories/lessonDraftsRepository.js` (modify) | `kind` input; numeracy shape validation; `kind` on `LessonDraftCorruptError`. |
| `src/utils/lessonDraftRoutes.js` (create) | `lessonRouteForDraft`. |
| `src/utils/assessmentRegistry.js` (modify) | `MATHS_EVIDENCE_CODES`. |
| `src/db/repositories/assessmentsRepository.js` (modify) | `getMathsEvidenceResults`. |
| `src/services/pullCoverage.js`, `src/session/handleServices.js` (modify) | `assessmentCompletenessByChild` (assessment cursor only). |
| `src/numeracyLesson/inputs/numeracyInputs.js` (create) | Known steps, completeness, group history, planner input. |
| `src/numeracy/cards.js` (create), `src/numeracy/planLesson.js` (modify) | `cardReadiness`, `pickNumeracyActivity`, `swapOptions`, `firstUnknownStep`, `stillOnStep`, `cardHelpLists`. |
| `src/numeracy/planRecord.js` (create) | Stored-plan wrapper, supersession, saved plan. |
| `src/numeracyLesson/copy.js` (create) | Every numeracy EA string built from content. |
| `content/numeracy-curriculum/bannedWords.cjs` (create), `verify.cjs` (modify) | One banned-word list for content and screens. |
| `src/numeracyLesson/numeracyDraftState.js` (create) | Pure numeracy draft transitions. |
| `src/numeracyLesson/trackerChanges.js` (create) | Pending tick rules for the chips and the sheet. |
| `src/numeracyLesson/numeracyRecord.js` (create) | `buildNumeracySessionRecord`. |
| `src/services/numeracyLessonSave.js` (create) | The one-transaction save. |
| `src/numeracyLesson/trackerModel.js` (create) | Tile states, counts, next steps for one child. |
| `src/constants/masteryStateColors.js` (create) | Alias of `letterStateColors` for both trackers. |
| `src/components/numeracy/StepTile.js`, `SkillRow.js`, `NumberTrackerGrid.js`, `StepSheet.js` (create) | Tracker presentation. |
| `src/components/numeracy/NumberTrackerPanel.js` (create) | Immediate mode (class row). |
| `src/components/numeracy/NumberTrackerSheet.js` (create) | Deferred mode (Wrap up). |
| `src/hooks/useMasterySyncRefresh.js` (create), `useLetterMasterySyncRefresh.js` (modify) | Table-named refresh; literacy wrapper. |
| `src/screens/numeracy/NumberTrackerScreen.js` (create) | Route `NumberTracker`. |
| `src/hooks/useNumeracyLessonDraft.js` (create) | Draft, plan, freeze and Swap for the numeracy lesson. |
| `src/numeracyLesson/inputs/numeracyPicker.js` (create) | "Next: …" per group. |
| `src/screens/lessons/LessonPickerScreen.js`, `src/lessonPlan/inputs/lessonInputs.js`, `src/utils/lessonDates.js` (modify) | `kind` prop, routing by draft kind, `nextSteps` detail. |
| `src/screens/sessions/SessionFormScreen.js` (modify) | Numeracy branch. |
| `src/hooks/useLessonExitGuard.js` (create), `src/screens/lessons/LessonScreen.js` (modify) | Shared leave guard. |
| `src/screens/numeracy/NumeracyLessonScreen.js`, `HowToTeachScreen.js` (create); `src/components/numeracy/LessonCard.js`, `SwapSheet.js` (create) | Lesson plan and How to teach it. |
| `src/screens/numeracy/NumeracyWrapUpScreen.js` (create); `src/components/numeracy/WrapUpStepRow.js`, `TickWhenStrip.js` (create) | Wrap up. |
| `src/utils/sessionCompleteView.js` (modify) | `buildNumeracyCompleteParams`, Taught receipt row. |
| `src/navigation/AppNavigator.js` (modify) | Routes `NumberTracker`, `NumeracyLesson`, `HowToTeach`, `NumeracyWrapUp`. |
| `src/utils/homeAttention.js`, `src/screens/main/HomeScreen.js` (modify) | Lesson in progress by kind. |
| `src/screens/children/ClassDetailScreen.js`, `src/components/children/ClassChildRow.js` (modify) | Number tracker entry. |
| `test-support/legacyHandleMocks.js` (modify) | Add `skillMastery: 'skillMasteryRepository'`. |

Shared shapes (JSDoc at the top of the module that owns each):

```js
/** NumeracyDraft = lesson_drafts row with kind 'numeracy', language_code null, pack_id null,
 *    plan: StoredNumeracyPlan | null,
 *    ticks: { taught: TaughtCard[] | null },            // null = "the plan's cards"
 *    tracker_changes: { [childId]: { [stepKey]: { mastered: boolean, madeAt: ISO } } },
 *    reading_level_changes: {}
 *  TaughtCard = { slot: 'warm_up'|'activity', step_key: string, activity: string }
 *  StoredNumeracyPlan = Plan (Track C) & { curriculum_edition, made_on: 'YYYY-MM-DD',
 *    present_child_ids: string[], complete: { history, ticks, evidence } } */
```

---

### Task 1: Draft kind (SQLite v22) and routing by kind

**Files:**
- Modify: `src/db/migrations.js` (append after v21); `src/db/repositories/lessonDraftsRepository.js:8-50,85-134,162-172,178-198`
- Create: `src/utils/lessonDraftRoutes.js`
- Test: `__tests__/lessonDraftsKind.test.js` (real SQLite; add to `jest.integration.config.js`)

**Interfaces:**
- Consumes: `STEP_KEY_PATTERN` from `src/db/repositories/skillMasteryRepository.js` (Track B).
- Produces:
  - Migration `{ version: 22, name: 'lesson_drafts_kind', sql: "alter table lesson_drafts add column kind text not null default 'literacy' check (kind in ('literacy', 'numeracy'));" }`.
  - `LESSON_DRAFT_KINDS = Object.freeze(['literacy', 'numeracy'])` exported from the repository.
  - `create(input)` accepts `kind` (default `'literacy'`). Rows returned by `getActive`, `create` and
    `update` carry `kind`. `kind` is fixed after create (`checkFixedContext` raises
    `LessonDraftContextError('kind')`).
  - `LessonDraftCorruptError(draftId, fields, kind)` with `.kind`, read from the plain column.
  - `lessonRouteForDraft(draft: { kind?: string } | null): 'Lesson' | 'NumeracyLesson'`. Anything
    other than `'numeracy'` gives `'Lesson'`.
- Numeracy shape rules (`kind === 'numeracy'`):
  - `language_code` and `pack_id` are `null`, and `class_id` is null or a string.
  - `ticks` is exactly `{ taught }`, where `taught` is `null` or an array of
    `{ slot ∈ {'warm_up','activity'}, step_key: STEP_KEY_PATTERN, activity: non-empty string }`.
  - `tracker_changes[childId][stepKey]` has `stepKey` matching `STEP_KEY_PATTERN`, `mastered`
    boolean, `madeAt` ISO, and no `languageCode`.
  - `reading_level_changes` deep-equals `{}`.
  - `plan` is null or a plain object.
- Literacy rules are unchanged.

- [ ] **Step 1: Write the failing tests**

```js
test('v22 adds kind with literacy as the default for existing drafts')        // migrate a v21 file holding a draft; row.kind === 'literacy'
test('the database refuses a kind outside literacy and numeracy')            // raw insert kind 'maths' throws CHECK
test('a numeracy draft round-trips with step-key tracker changes')           // create({ kind:'numeracy', ticks:{taught:null}, tracker_changes:{c1:{'add.5':{mastered:true, madeAt}}} })
test('a numeracy draft refuses literacy ticks and a language code')          // ticks.letters → TypeError 'Invalid lesson draft ticks'; language_code 'en' → TypeError
test('a numeracy draft refuses a bad step key or a languageCode on a mark')   // 'Add.5' and { languageCode:'en' } → TypeError
test('kind cannot change after create')                                       // update(id,{kind:'literacy'}) → LessonDraftContextError field 'kind'
test('the one-slot rule spans both kinds')                                     // literacy draft open → create numeracy throws LessonDraftExistsError
test('a corrupt numeracy draft reports its kind')                              // raw-corrupt ticks JSON → LessonDraftCorruptError.kind === 'numeracy'
test('lessonRouteForDraft sends each kind to its own screen')                  // numeracy → 'NumeracyLesson'; literacy, null, {} → 'Lesson'
```

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/lessonDraftsKind.test.js`
Expected: FAIL. `kind` is undefined, and `lessonDraftRoutes` is not found.

- [ ] **Step 3: Implement the migration, the validator branch and `lessonRouteForDraft`**

- Split `validateDraft` into shared checks (ids, date, notes, plan, attendance, `validateJson`) plus
  `validateLiteracyShape(draft)` (today's ticks / tracker / level checks, moved verbatim) and
  `validateNumeracyShape(draft)`.
- Grep the suites for hard-coded schema versions (`grep -rn "CURRENT_SCHEMA_VERSION).toBe\|version: 21" __tests__`)
  and update only assertions that pin the latest version.

- [ ] **Step 4: Run them, plus the literacy draft suites, unmodified**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/lessonDraftsKind.test.js __tests__/lessonDraftsRepository.test.js __tests__/lessonDraftsDurability.test.js __tests__/lessonDraftsMigration.test.js __tests__/lessonDraftController.test.js __tests__/sqliteFoundation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/db/migrations.js src/db/repositories/lessonDraftsRepository.js src/utils/lessonDraftRoutes.js __tests__/lessonDraftsKind.test.js jest.integration.config.js && git commit -m "feat(numeracy): lesson drafts carry a kind so numeracy drafts have their own shape"`

---

### Task 2: Numeracy inputs: evidence reader, completeness, history, planner input

**Files:**
- Modify: `src/utils/assessmentRegistry.js`; `src/db/repositories/assessmentsRepository.js` (after `getLetterEvidenceResults`); `src/db/repositories/domainRepositoryUtils.js` (add `getProgrammeById`); `src/services/pullCoverage.js:91-116`; `src/session/handleServices.js` (the `assessmentHistory` block); `test-support/legacyHandleMocks.js:8`
- Create: `src/numeracyLesson/inputs/numeracyInputs.js`, `src/services/numeracyProgramme.js`
- Test: `__tests__/numeracyInputs.test.js` (real SQLite; integration list), `__tests__/pullCoverage.test.js` (add cases)

**Interfaces:**
- Consumes:
  - `getCurriculum()` (Track A).
  - `computeStepEvidence` and `knownStepsForChild` (Track C).
  - `repositories.skillMastery.getSkillMastery({ childIds })` and
    `services.assessmentHistory.skillMasteryCompletenessByChild({ childIds })` (Track B).
  - `loadLessonBase` (literacy, unchanged).
- Produces:
  - `MATHS_EVIDENCE_CODES: readonly string[]`: distinct question codes across `egmaCatalog.assessments`
    (`content/egma`), frozen.
  - `assessments.getMathsEvidenceResults({ userId, programmeId?, childIds, academicYear? }) → Promise<QuestionResult[]>`.
    It copies `getLetterEvidenceResults`: year bounds `starts_on..ends_on`, active-programme scoping
    through `getQuestionResults`, and `MATHS_EVIDENCE_CODES`.
  - `assessmentCompletenessByChild({ database, userId, programmeId?, childIds, academicYear? }) → Promise<Record<childId, boolean>>`
    in `pullCoverage.js`. This is the assessment half of `masteryCompletenessByChild`:
    `assessmentHistoryScope` cursor with `windowStart = year.starts_on`, plus `readAssessmentScope`.
    `masteryCompletenessByChild` is refactored to call it, with its behaviour and tests unchanged.
  - The handle service `services.assessmentHistory.assessmentCompletenessByChild({ childIds, programmeId, academicYear })`.
  - `getProgrammeById(db, programmeId) → Promise<{ id, code } | null>` in `domainRepositoryUtils.js`
    (`select id, code from programmes where id = ?`). It takes a reader or a transaction.
  - `confirmNumeracyProgramme({ handle, userId }) → Promise<string | null>` in
    `src/services/numeracyProgramme.js`. It calls `getActiveProgrammeGate` afresh (never the cache)
    and returns `gate.programme.id` only when `isMathsProgramme(gate.programme)`; otherwise `null`.
    A read error rejects, so the caller shows its existing retry. It never calls
    `rememberProgrammeSubject`, so it cannot change what other screens show.
  - In `src/numeracyLesson/inputs/numeracyInputs.js`:
    - `loadKnownSteps({ repositories, userId, childIds, curriculum, programmeId?, academicYear? }) → Promise<Map<childId, Map<stepKey, KnownState>>>`.
      Every requested id gets an entry. Ticks are grouped by `child_id`. Evidence comes from
      `computeStepEvidence` over that child's maths results.
    - `loadNumeracyCompleteness({ services, childIds, programmeId, academicYear }) → Promise<{ ticks: Record<id, boolean>, evidence: Record<id, boolean> }>`.
      `ticks` comes from `skillMasteryCompletenessByChild` (**review note 5**); `evidence` from
      `assessmentCompletenessByChild`.
    - `numeracyHistoryForGroup(sessions, groupId) → Array<{ date, createdAt, id, taught }>` (P3).
      Sessions with `group_id === groupId` and an array `activities.numeracy.taught`, mapped
      `{ date: session_date, createdAt: created_at, id, taught }`.
    - `loadNumeracyLessonInputs({ handle, repositories, services, base, groupId, participantChildIds, curriculum }) → Promise<{ knownByChild, completeByChild: { ticks, evidence }, history }>`.
      Completeness is read **before** known steps (coverage before evidence, as `lessonInputs.js:180`).
    - `numeracyPlanInput({ base, loaded, presentChildIds, lessonDate, curriculum }) → PlannerInput`
      (Track C input). `activityCardCount: 2`. Each `complete` flag is `.every` over the distinct
      present ids. `history` uses `base.sessionHistoryCoveredChildIds`.

- [ ] **Step 1: Write the failing tests** (seed with `seedCoreData`, a numeracy programme and assignment, two children, assessments with items carrying `metadata`)

```js
test('MATHS_EVIDENCE_CODES is every EGMA question code once')                  // equals the 17 codes of masi-egma-en-2026-1-draft, no duplicates
test('maths evidence results stay inside the academic year and programme')     // result dated before year.starts_on and one in another programme are absent
test('confirmNumeracyProgramme returns the id only for an active maths programme') // numeracy assignment → id; literacy assignment → null; none → null
test('confirmNumeracyProgramme ignores cached maths after a move to literacy')  // rememberProgrammeSubject(handle, numeracy); end it, assign literacy → null
test('a draft EGMA result loads but gives no known step')                        // question_version '…-draft' → loadKnownSteps(...).get(c1) is an empty Map
test('a final-version result and a tick combine with implied steps')            // non-draft read_numbers band 10 all right + tick add.10 → read_numbers.5 implied, read_numbers.10 assessment, add.5 implied, add.10 ticked
test('a child with no rows still gets an empty map')                             // childIds [c1,c3]; c3 nothing → has('c3') && size 0
test('assessment completeness ignores the letter cursor')                        // complete assessment cursor, no letter cursor → true; masteryCompletenessByChild → false
test('numeracy completeness reads ticks from skill mastery coverage')            // spy skillMasteryCompletenessByChild → its map is returned as .ticks
test('group history keeps only this group\'s numeracy sessions')                 // session other group_id, literacy-only session, numeracy session → one entry with taught
test('planner input marks history incomplete when one present child is uncovered') // complete.history false; ticks/evidence from .every
```

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyInputs.test.js __tests__/pullCoverage.test.js`
Expected: FAIL. `numeracyInputs` is not found, and `assessmentCompletenessByChild` is undefined.

- [ ] **Step 3: Implement the reader, the completeness helper, the service and the loaders**

Also add `skillMastery: 'skillMasteryRepository'` to `legacyHandleMocks` modules, so suites using
the fallback handle see the repository.

- [ ] **Step 4: Run them, plus the guards**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyInputs.test.js __tests__/pullCoverage.test.js __tests__/handleServices.test.js __tests__/historyPullTriggerBudget.test.js __tests__/productionBindingStatic.test.js __tests__/letterEvidenceYear.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/utils/assessmentRegistry.js src/db/repositories/assessmentsRepository.js src/db/repositories/domainRepositoryUtils.js src/services/numeracyProgramme.js src/services/pullCoverage.js src/session/handleServices.js src/numeracyLesson/inputs/numeracyInputs.js test-support/legacyHandleMocks.js __tests__/numeracyInputs.test.js __tests__/pullCoverage.test.js jest.integration.config.js && git commit -m "feat(numeracy): load known steps, completeness and group history for lessons"`

---

### Task 3: Pure card helpers and the stored plan

**Files:**
- Create: `src/numeracy/cards.js`, `src/numeracy/planRecord.js`
- Modify: `src/numeracy/planLesson.js` (use `cardReadiness` and `pickNumeracyActivity` inside `makeCard`; behaviour unchanged)
- Test: `__tests__/numeracyCards.test.js`, `__tests__/numeracyPlanRecord.test.js`

**Interfaces:**
- Consumes: `childKnows`, `childReadyFor`, `curriculumStepKeys`, `groupStepState` (Track C);
  `isGroupMastered`. The files import only `src/numeracy/` and `src/utils/groupMastery` (purity guard).
- Produces, from `src/numeracy/cards.js`:
  - `cardReadiness({ curriculum, presentChildIds, knownByChild, stepKey }) → { readyCount, presentCount, needHelp: string[], canHelp: string[] }`.
    Same rules as Track C's `makeCard`: distinct present ids in order.
  - `pickNumeracyActivity({ curriculum, history, lessonDate, stepKey, slot }) → string`.
    Track C's `pickActivity`, moved: least recently done first, `minutes <= 5` for `warm_up` when
    available.
  - `cardHelpLists(card) → { needHelp: string[], canHelp: string[] }`. Here `canHelp` excludes every
    `needHelp` id (**review note 1**, P5).
  - `firstUnknownStep({ curriculum, known: Map<stepKey, KnownState> | undefined, skillKey }) → stepKey | null`.
    The first step by size that isn't in `known`; `null` when the skill is finished.
  - `stillOnStep({ curriculum, knownByChild, childId, stepKey }) → stepKey | null` (**review note 2**, P4).
    `null` when the child is ready. Otherwise: if a missing `comes_after` key is in the card's skill,
    `firstUnknownStep` of that skill; else `firstUnknownStep` of the skill of the first missing
    `comes_after` key in curriculum order.
  - `swapOptions({ curriculum, presentChildIds, knownByChild, slot, takenStepKeys }) → Array<{ step_key, review: boolean }>`.
    The group's ready steps (`groupStepState().readySteps`) in skills of that `slot`, minus
    `takenStepKeys`, in curriculum order. If that is empty, return review steps: for each skill of that
    slot, the highest group-known step that `isGroupMastered(ready, present)` allows, with
    `review: true` (the planner's warm-up review rule, extended to activity skills; Open question 5).
- Produces, from `src/numeracy/planRecord.js`:
  - `storeNumeracyPlan({ plan, curriculumEdition, lessonDate, presentChildIds, complete }) → StoredNumeracyPlan`.
  - `isNumeracyPlanSuperseded(stored, complete) → boolean`. True when every flag is
    `now || !stored` and at least one flag is `now && !stored` (literacy's rule over three flags).
  - `savedNumeracyPlan({ stored, lessonDate }) → { plan: SavedPlan | null, plan_reason: 'past_date' | null }`,
    where `SavedPlan = { engine_version, suggested: TaughtCard[], reasons: { reason, made_on, complete, cards: [{ slot, step_key, ready_count, present_count }] } }`.
    It returns `past_date` when `lessonDate !== stored.made_on`.

- [ ] **Step 1: Write the failing tests** (fixture: `buildNumeracyCurriculumFixture()`, maps of `'ticked'`)

```js
test('cardReadiness matches the planner\'s card for the same step')            // for each card of a planNumeracyLesson result: fields equal cardReadiness(stepKey)
test('a child who needs help is never listed as able to help')                 // c1 knows add.10 not count.10, card add.10 → needHelp ['c1'], cardHelpLists canHelp excludes 'c1'
test('still on, same skill: the first unknown step in that skill')             // card add.15, c2 knows count.20 only → stillOnStep 'add.5'
test('still on, other skill: the first unknown step of the missing skill')     // card add.10, c1 knows add.5 and count.5 → 'count.10'
test('still on is null for a ready child')                                       // c3 knows add.5, count.10 → null
test('firstUnknownStep skips implied and assessment steps and ends at null')     // known add.5 implied, add.10 ticked → 'add.15'; all four → null
test('swap options are the ready steps of the card\'s slot, minus taken ones')  // first lesson, slot 'activity', taken ['count.5'] → [{step_key:'read_numbers.5', review:false}]
test('swap options fall back to review steps when nothing is ready')            // 3 children know all 37 → activity options are the highest step of each activity skill, review true
test('the planner is unchanged by the refactor')                                 // re-run: npx jest __tests__/numeracyPlanLesson.test.js stays green (command in Step 4)
test('a stored plan carries made_on, present ids, edition and completeness')    // storeNumeracyPlan(...) toMatchObject
test('supersession needs as complete on all three and more on one')             // stored {t,f,t}: now {t,t,t} → true; {t,t,f} → false; same → false
test('a back-dated save drops the plan with past_date')                          // savedNumeracyPlan lessonDate ≠ made_on → { plan: null, plan_reason: 'past_date' }
test('a same-day save keeps the suggestion and reasons')                         // suggested = cards' {slot, step_key, activity}; reasons.cards ready_count/present_count
```

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyCards.test.js __tests__/numeracyPlanRecord.test.js`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement both modules and refactor `makeCard`/`pickActivity` onto them**

`planLesson.js` keeps its exports and its output. `history` filtering and the recency comparator
(`date`, `createdAt`, `id`) move into `cards.js` with `pickNumeracyActivity`.

- [ ] **Step 4: Run them, plus Track C's suites and the purity guard**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyCards.test.js __tests__/numeracyPlanRecord.test.js __tests__/numeracyPlanLesson.test.js __tests__/numeracyGroupSteps.test.js __tests__/numeracyRealContent.test.js __tests__/lessonPlanEnginePurity.test.js`
Expected: PASS, with no Track C test changed.

- [ ] **Step 5: Commit**

`git add src/numeracy/cards.js src/numeracy/planRecord.js src/numeracy/planLesson.js __tests__/numeracyCards.test.js __tests__/numeracyPlanRecord.test.js && git commit -m "feat(numeracy): card readiness, still-on step, swap options and the stored plan"`

---

### Task 4: Numeracy copy and the plain-words guard

**Files:**
- Create: `src/numeracyLesson/copy.js`, `content/numeracy-curriculum/bannedWords.cjs`
- Modify: `content/numeracy-curriculum/verify.cjs:26-27` (import the list)
- Test: `__tests__/numeracyCopy.test.js`, `__tests__/numeracyCopyPlainWords.test.js` (static; `global.__MASI_NO_DEFAULT_HANDLE__ = true`)

**Interfaces:**
- Consumes: `getStep` and `getCurriculum` (Track A); `formatNameList` (`src/utils/childNames.js`).
- Produces: `BANNED_WORDS: RegExp[]` (`module.exports = { BANNED_WORDS }`). In `copy.js`, all taking
  the curriculum explicitly:
  - `stepTitle(curriculum, stepKey) → string`: `'{skill.label} · {step.label}'`, e.g. "Count objects · up to 10".
  - `stepPhrase(curriculum, stepKey) → string`: `'{skill.label} {step.label}'`, e.g. "Add up to 10" (Open question 4).
  - `nextLine(curriculum, stepKeys) → string | null`: `'Next: ' + phrases.join(' · ')`; `null` when empty.
  - `chipLabel(curriculum, stepKey) → string`, from the frozen `CHIP_WORDS` (Open question 2):
    - `{ finger_flash: 'Flash', count: 'Count', read_numbers: 'Read', compare: 'Compare', before_after: 'Before/after', add: 'Add', subtract: 'Take away', number_pairs: 'Pairs', count_aloud: 'Say', skip_count: 'Skip' }`;
    - the chip reads `'{word} to {size}'`, with two exceptions: `skip_count` reads
      `'Skip {step.label}'` ("Skip 2s to 20") and `number_pairs` reads `'Make {size}'` ("Make 5");
    - an unknown skill falls back to `stepPhrase`.
  - `readyLine({ readyCount, presentCount }) → '{r} of {p} are ready'` (`'1 of 1 is ready'`).
  - `needHelpLine({ curriculum, cardStepKey, stillOn: Array<{ name, stepKey }> }) → string | null`.
    Children are grouped by step: "Sipho and Ayanda are still on up to 5". A same-skill step uses
    the step label; another skill's step uses `stepPhrase`. Groups are joined with `' · '`.
  - `canHelpLine(names) → '{names} can help a partner' | null`.
  - `lessonHeader({ groupNumber, minutes }) → 'Group {n} · {m} min lesson'` (P7).
  - `tickWhenLines(curriculum, stepKey) → { setup, items: Array<{ ask, expected }>, rule }`.
  - `stripSummary(curriculum, stepKey) → '{stepPhrase}: {ask 1} · {ask 2} · {ask 3}'` (Open question 3).
  - `keepSumsTogether(text) → string`. Inside a number sentence (`/\d+(?: [+−\-=] \d+)+/`), spaces
    become ` `. Every builder above passes its content text through it.
  - `numeracySaveErrorMessage(error, names) → string`. Literacy's codes; `CHANGES_NOT_WRITABLE` →
    "You can't update {names}'s steps any more."; `PROGRAMME_NOT_NUMERACY` → "This is a numeracy
    lesson, but your programme has changed. Discard it to start again." (Jim's wording pass).
  - `PROGRAMME_CHANGED_NOTE = "Your programme has changed. Go back and open it again."`, shown by the
    picker, lesson and tracker panel when `confirmNumeracyProgramme` returns `null`.

- [ ] **Step 1: Write the failing tests**

```js
test('step titles and phrases come from the content labels')                     // 'count.10' → 'Count objects · up to 10' / 'Count objects up to 10'
test('chip labels are short and every bundled skill has a chip word')            // add.5 'Add to 5', finger_flash.5 'Flash to 5', skip_count.2s 'Skip 2s to 20', number_pairs.10 'Make 10'; every getCurriculum() skill key in CHIP_WORDS
test('need-help lines group children by the step they are still on')             // [{Sipho,add.5},{Ayanda,add.5},{Lwazi,count.10}] card add.10 → 'Sipho and Ayanda are still on up to 5 · Lwazi is still on Count objects up to 10'
test('ready line wording')                                                        // (5,6) '5 of 6 are ready'; (1,1) '1 of 1 is ready'
test('sums never break across lines')                                             // keepSumsTogether('Ask: 2 + 2 · 3 + 1') contains '2 + 2' and '3 + 1', keeps ' · '
test('tick-when lines carry setup, three asks with answers, and the rule')       // add.5 → items.length 3, rule 'All 3 right? Tick it.'
test('a save error names the children whose steps cannot change')                // CHANGES_NOT_WRITABLE, ['Sipho'] → "You can't update Sipho's steps any more."
```

The static suite `numeracyCopyPlainWords.test.js` reads every `.js` file under
`src/numeracyLesson/`, `src/components/numeracy/` and `src/screens/numeracy/`. It strips comments,
then requires no string literal or JSX text to match any `BANNED_WORDS` pattern. It also checks that
`verify.cjs` and the static suite import the same `BANNED_WORDS` object.

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyCopy.test.js __tests__/numeracyCopyPlainWords.test.js`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `copy.js` and move the banned list into `bannedWords.cjs`**

- [ ] **Step 4: Run them, plus the content verifier**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyCopy.test.js __tests__/numeracyCopyPlainWords.test.js && npm run test:content`
Expected: PASS; `test:content` exits 0.

- [ ] **Step 5: Commit**

`git add src/numeracyLesson/copy.js content/numeracy-curriculum/bannedWords.cjs content/numeracy-curriculum/verify.cjs __tests__/numeracyCopy.test.js __tests__/numeracyCopyPlainWords.test.js && git commit -m "feat(numeracy): EA copy built from content, with one plain-words list for content and screens"`

---

### Task 5: Draft transitions, the session record and the one-transaction save

**Files:**
- Create: `src/numeracyLesson/numeracyDraftState.js`, `src/numeracyLesson/trackerChanges.js`, `src/numeracyLesson/numeracyRecord.js`, `src/services/numeracyLessonSave.js`
- Modify: `__tests__/historyPullTriggerBudget.test.js:29` (add `numeracyLessonSave` to the "never starts history" regex)
- Test: `__tests__/numeracyDraftState.test.js`, `__tests__/numeracyLessonSave.test.js` (real SQLite plus the sync engine, modelled on `lessonSave.test.js`; integration list)

**Interfaces:**
- Consumes:
  - `storeNumeracyPlan` and `savedNumeracyPlan` (Task 3).
  - `LessonSaveError` (`src/services/lessonSave.js`, reused so codes and messages match).
  - Track B: `setSkillMastery` and `getSkillCorrectionTimes`.
  - `compareServerTimestamps`, `hasActiveProgrammeAssignment`, `getProgrammeById` (Task 2), `isMathsProgramme`, `presentChildIds`.
  - `getCurriculum`, `CURRENT_EDITION`.
- Produces, from `numeracyDraftState.js` (pure; shared attendance, date and notes transitions are
  re-exported from `lessonDraftState.js`):
  - `newNumeracyDraftInput({ group, members, programmeId, classId, lessonDate }) → input`, with
    `kind: 'numeracy'`, `ticks: { taught: null }`, `tracker_changes: {}`, `reading_level_changes: {}`,
    and `language_code`/`pack_id` null.
  - `taughtCards(draft) → TaughtCard[]`: `draft.ticks.taught ?? draft.plan.cards.map(({slot, step_key, activity}) => …)`.
  - `swapCard(draft, index, { step_key, activity }, { plan, nowIso }) → patch`. Replaces card `index`
    in `taughtCards`. On first use it freezes: `plan`, `plan_fixed_at: nowIso` (P2).
  - `freezeForWrapUp(draft, { plan, nowIso }) → patch`. Freezes if not frozen, and sets
    `ticks.taught = taughtCards(...)`.
  - `setStepChanges(draft, childId, changes) → patch`. Replaces the child's map; an empty map removes
    the child.
  - `clearChildStepChanges(draft, childId) → patch`.
- Produces, from `trackerChanges.js`:
  - `toggleStepChange({ storedConfirmed: boolean, locked: boolean, pending, stepKey, nowIso }) → pending`.
    The sheet rules, from `LetterTrackerBottomSheet.js:82-118`: untick stored → `{mastered:false}`;
    untick a new tick → delete; re-tick an untick → delete; new → `{mastered:true}`. A locked step
    (assessment or implied) is unchanged.
  - `toggleChipChange({ known: boolean, pending, stepKey, nowIso }) → pending`. Chips only add: a
    pending entry → delete; known with no pending → unchanged; otherwise `{mastered:true, madeAt}`.
- Produces, from `numeracyRecord.js`:
  - `buildNumeracySessionRecord({ draft, userId, sessionTypeFields, nowIso, curriculumEdition }) → { session, stepChanges }`.
    - `session.activities` is exactly
      `{ numeracy: { curriculum_edition, plan, ...(plan_reason ? { plan_reason } : {}), taught } }`.
      `plan` and `plan_reason` come from `savedNumeracyPlan`; `taught` from `taughtCards`.
    - The other session fields match `buildLessonRecord` (`id: draft.session_id`, `group_id`,
      `class_id`, `session_date: lesson_date`, `children_ids`, `notes`, `...sessionTypeFields`).
    - `stepChanges` holds present children only.
- Produces, from `numeracyLessonSave.js`:
  - `saveNumeracyLesson({ handle, draft, sessionTypeFields, nowIso? }) → Promise<{ sessionId, keptBack: number }>`.
  - Inside one `handle.withTransaction`, in this order (spec §8.3):
    1. Checks before the transaction: `NO_CHILDREN` and `NO_PLAN`, then `assertStepChanges` (shape:
       boolean `mastered`, ISO `madeAt`).
    2. `PROGRAMME_NOT_ACTIVE`, then `PROGRAMME_NOT_NUMERACY` when
       `!isMathsProgramme(await getProgrammeById(transaction, draft.programme_id))`. Both run on the
       transaction, so a programme change cannot slip in between the check and the writes.
    3. `getWriteAuthority`: `CHILD_NOT_WRITABLE` (attend), `CHANGES_NOT_WRITABLE` (deliver with
       changes).
    4. `saveSession`, with its group error mapped to `GROUP_MISSING`.
    5. `getSkillCorrectionTimes({ childIds, transaction })`. Skip a change when
       `compareServerTimestamps(change.madeAt, times[childId]?.[stepKey]) === -1`, or when its key is
       not in the bundled curriculum (P14). Otherwise call
       `setSkillMastery({ childId, stepKey, confirmed: change.mastered, changedAt: change.madeAt, programmeId: draft.programme_id, transaction })`.
       A `null` return counts as kept back (**review note 3**). Every skip counts toward `keptBack`.
    6. `lessonDrafts.discard` → `ALREADY_SAVED` when it removes nothing.
  - The save never starts a history pull.

- [ ] **Step 1: Write the failing tests**

```js
// numeracyDraftState.test.js (pure)
test('a new numeracy draft input has the numeracy shape')                       // kind 'numeracy', ticks {taught:null}
test('the first swap freezes the plan and replaces only that card')             // plan_fixed_at set; taught[1] swapped; taught[0], [2] from plan
test('a later swap keeps the first freeze time')                                // plan_fixed_at unchanged
test('wrap up freezes and fixes taught from the plan')                           // freezeForWrapUp → taught equals plan cards' {slot, step_key, activity}
test('chips only add; the sheet adds and removes')                               // toggleChipChange known → same object; toggleStepChange stored → {mastered:false}; again → removed
// numeracyLessonSave.test.js (real SQLite)
test('saves the session, attendees, every tick and discards the draft in one transaction') // sessions 1 row (activities.numeracy shape exact), session_attendees 2, skill_mastery 2 pending, outbox 1 session + 2 attendees + 2 skill_mastery, lesson_drafts 0
test('a failure on the last tick writes nothing')                                // spy writer.runAsync throws on the 2nd skill_mastery upsert → no session, no attendees, draft still there
test('a tap older than the owed correction time is skipped')                    // queue a newer skill_mastery outbox payload for c1 add.5 first → that change skipped, keptBack 1, other ticks written
test('a null setSkillMastery result counts as kept back, not an error')         // jest.spyOn(repo,'setSkillMastery').mockResolvedValueOnce(null) via createSkillMasteryRepository spy → resolves, keptBack 1
test('a back-dated lesson saves plan null with past_date and keeps taught')      // lesson_date ≠ plan.made_on → numeracy.plan null, plan_reason 'past_date', taught 3 items
test('a tick for a retired step key is kept back')                               // tracker change 'add.30' → keptBack 1, no throw
test('a child the EA no longer delivers to blocks a save with their ticks')      // end child_ea_assignment → LessonSaveError CHANGES_NOT_WRITABLE, childIds [c2] (try/catch, not rejects.toThrow)
test('an inactive programme refuses the save')                                   // end staff assignment → PROGRAMME_NOT_ACTIVE
test('a numeracy draft on a literacy programme refuses the save')               // active literacy assignment; draft.programme_id = that literacy id → PROGRAMME_NOT_NUMERACY; no session, no skill_mastery, draft kept
test('a second save of the same draft reports ALREADY_SAVED')                    // two saves → second code ALREADY_SAVED; one session row
test('the saved ticks sync through set_skill_mastery')                           // run the sync engine with the test server; tableResults.skill_mastery present; rows synced
```

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyDraftState.test.js __tests__/numeracyLessonSave.test.js`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the four modules**

The save copies `lessonSave.js` step for step, without the reading-level loop.

- [ ] **Step 4: Run them, plus the guards and literacy save suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numeracyDraftState.test.js __tests__/numeracyLessonSave.test.js __tests__/lessonSave.test.js __tests__/historyPullTriggerBudget.test.js __tests__/productionBindingStatic.test.js __tests__/moduleStateAllowlist.test.js __tests__/foreignKeyEnforcement.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/numeracyLesson/numeracyDraftState.js src/numeracyLesson/trackerChanges.js src/numeracyLesson/numeracyRecord.js src/services/numeracyLessonSave.js __tests__/numeracyDraftState.test.js __tests__/numeracyLessonSave.test.js __tests__/historyPullTriggerBudget.test.js jest.integration.config.js && git commit -m "feat(numeracy): save a numeracy lesson and its ticks in one transaction"`

---

### Task 6: Tracker model and presentation (tiles, rows, step sheet)

**Files:**
- Create: `src/numeracyLesson/trackerModel.js`, `src/constants/masteryStateColors.js`, `src/components/numeracy/StepTile.js`, `SkillRow.js`, `NumberTrackerGrid.js`, `StepSheet.js`
- Test: `__tests__/numberTrackerModel.test.js`, `__tests__/NumberTrackerGrid.test.js`, `__tests__/StepSheet.test.js`

**Interfaces:**
- Consumes:
  - `firstUnknownStep`, `childReadyFor`, `curriculumStepKeys`, `knownStepsForChild` (pending
    changes are applied as ticks before deriving implied).
  - `copy.js` (Task 4).
  - `BottomSheet`, `BrandButton`, `SectionHeader`, `typeRoles` and tokens.
- Produces:
  - `masteryStateColors` = `letterStateColors` (an alias; Open question 1).
  - `buildTrackerModel({ curriculum, ticks, evidence, pending = {}, userId }) → { knownCount, total, sections: [{ key: 'main'|'counting', title: null|'Counting', rows: SkillRowModel[] }] }`.
    - `SkillRowModel = { skillKey, label, hint, nextStepKey, tiles: TileModel[] }`.
    - `TileModel = { stepKey, sizeLabel, column, state: 'assessment'|'ticked'|'implied'|'not_yet', next: boolean, pending: boolean, tickedBy: 'you'|'another'|null, tickedOn: 'YYYY-MM-DD'|null }`.
    - `column` comes from the size, against the shared columns `[5, 10, 15, 20, 50, 100]` so tiles of
      equal size line up (`number_pairs` and `finger_flash` use 5 and 10; `skip_count` uses its
      size).
    - `next` is true for the row's `nextStepKey` only when the child is ready for it (P6).
    - `knownCount` counts every known state, implied included (P10).
  - `StepTile({ tile, onPress, size = 44 })`. Tones:
    - assessment uses `masteryStateColors.assessment` plus a lock;
    - ticked uses `.taught`;
    - implied uses `.taught` plus a small "↑";
    - not yet uses `.default`;
    - `next` adds a dashed `colors.primary` border.
    - The accessibility label is "{skill} {step label}, {Ticked|Assessment|Known|Not yet}".
  - `SkillRow({ row, onPressTile, onPressSkill })`: the skill name with an ⓘ (`onPressSkill`), the
    grey hint and the tile strip.
  - `NumberTrackerGrid({ model, onPressTile, onPressSkill, readOnly })`: the legend (Ticked /
    Assessment / Not yet), the main section, then "Counting".
  - `StepSheet({ visible, onDismiss, curriculum, row, childFirstName, onTick, readOnly })`:
    - lists every step of the skill in full wording ("Count objects up to 10") with its state and
      "Ticked by you · 3 Nov" (P9);
    - then a **Tick when** box for `row.nextStepKey`: "Ask {name} on their own:", three ask/answer
      lines and the rule;
    - then a **Tick** button calling `onTick(nextStepKey)`;
    - with no next step (skill finished) there is no box; `readOnly` hides the button.

- [ ] **Step 1: Write the failing tests**

```js
test('header count and sections follow the curriculum')                         // knownCount, total 37, counting section rows ['count_aloud','skip_count']
test('equal sizes share a column across rows')                                  // count.10.column === add.10.column === read_numbers.10.column
test('implied tiles come from a higher tick and pending changes apply first')    // pending {add.10:{mastered:true}} → add.5 implied, add.10 ticked pending
test('only a ready next step gets the dashed outline')                           // child knows nothing: count row nextStepKey 'count.5', next true; add row nextStepKey 'add.5' (comes_after count.5), next false; after a count.5 tick, add.5 next true
test('ticked-by reads you or another EA')                                        // changed_by === userId → 'you', else 'another'
test('the grid fits a 360 dp phone')                                             // render at width 360 (renderWithProviders insets); widest row's tiles*44 + gaps <= 296
test('tapping the skill name opens the step sheet with Tick when')               // press 'Add, steps' ⓘ → 'Ask Lwazi on their own:' and 'All 3 right? Tick it.'
test('the Tick button ticks the next step')                                      // onTick called with 'add.10'
test('a finished skill shows no Tick when box')                                  // all add known → no 'Tick when'
```

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numberTrackerModel.test.js __tests__/NumberTrackerGrid.test.js __tests__/StepSheet.test.js`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the model, the alias and the components**

`StepTile` is modelled on `LetterToggleTile`, but does not lowercase its label and does not add a new
colour token.

- [ ] **Step 4: Run them, plus the design guards**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/numberTrackerModel.test.js __tests__/NumberTrackerGrid.test.js __tests__/StepSheet.test.js __tests__/designSystemGuard.test.js __tests__/numeracyCopyPlainWords.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/numeracyLesson/trackerModel.js src/constants/masteryStateColors.js src/components/numeracy/StepTile.js src/components/numeracy/SkillRow.js src/components/numeracy/NumberTrackerGrid.js src/components/numeracy/StepSheet.js __tests__/numberTrackerModel.test.js __tests__/NumberTrackerGrid.test.js __tests__/StepSheet.test.js && git commit -m "feat(numeracy): Number tracker grid, tiles and step sheet"`

---

### Task 7: Number tracker screen (immediate taps), refresh and the class-row entry

**Files:**
- Create: `src/hooks/useMasterySyncRefresh.js`, `src/components/numeracy/NumberTrackerPanel.js`, `src/screens/numeracy/NumberTrackerScreen.js`
- Modify: `src/hooks/useLetterMasterySyncRefresh.js` (becomes `useMasterySyncRefresh('letter_mastery', onRefresh)`); `__tests__/historyPullTriggerBudget.test.js:33` (the page-observer exception moves to `src/hooks/useMasterySyncRefresh.js`); `src/navigation/AppNavigator.js` (route `NumberTracker`, title 'Number tracker'); `__tests__/AppNavigator.headers.test.js`; `src/components/children/ClassChildRow.js:12,44`; `src/screens/children/ClassDetailScreen.js:20-22,98`
- Test: `__tests__/NumberTrackerPanel.test.js` (real SQLite; integration list), `__tests__/useMasterySyncRefresh.test.js`, `__tests__/ClassDetailScreen.test.js` (add cases)

**Interfaces:**
- Consumes:
  - The panel needs the raw tick rows for "who ticked it", so it does not use `loadKnownSteps`. It reads
    `repositories.skillMastery.getSkillMastery({ childId })` and
    `repositories.assessments.getMathsEvidenceResults({ userId, childIds: [childId] })` directly, then
    `computeStepEvidence`.
  - `buildTrackerModel`, `NumberTrackerGrid`, `StepSheet` (Task 6).
  - `confirmNumeracyProgramme` (Task 2) and `PROGRAMME_CHANGED_NOTE` (Task 4).
- Produces:
  - `useMasterySyncRefresh(tableName: 'letter_mastery'|'skill_mastery', onRefresh)`. It refreshes on
    `lastSyncResult.tableResults[tableName]` and on every assessment-history `pageVersion` change
    (**review note 4**). `useLetterMasterySyncRefresh(onRefresh)` keeps its behaviour.
  - `NumberTrackerPanel({ child, isDelivery = true })`. It copies `LetterMasteryPanel`'s concurrency
    skeleton exactly: a `loadGeneration` ref, a `writeInFlight` ref, `useFocusEffect` load, and a
    background reload in `finally`. A tap calls
    `setSkillMastery({ childId, stepKey, confirmed: !ticked })`, then `refreshSyncStatus()` and
    `triggerBackgroundSync?.()`. Its load also calls `confirmNumeracyProgramme`, and every tap passes
    that `programmeId` (Track B otherwise stamps whatever programme is active at write time,
    `skillMasteryRepository.js:146`). With `null`, the grid is read-only and shows
    `PROGRAMME_CHANGED_NOTE`. Taps behave as follows:
    - a `null` or kept-back result shows no error and reloads (review note 3);
    - an assessment tile tap shows the inline note "EGMA shows this step, so it stays ticked.";
    - an implied tile tap shows "Known because '{higher step label}' is ticked.";
    - a failure shows "Step update was not saved. Please try again.";
    - `!isDelivery` gives the read-only grid with no Tick button.
  - `NumberTrackerScreen({ route: { params: { child } } })`. The header is the child's name, then
    "Number tracker · {n} / {total} steps". It derives `isDelivery` from `useChildren()`, as
    `LetterTrackerScreen` does.
  - `ClassChildRow` gets a new optional prop `onPressNumberTracker`. Its icon is `numeric`, and its
    label is "Number tracker for {name}".
  - `ClassDetailScreen` passes `onPressNumberTracker` only when `maths === true && !subjectLoading`
    (not the loading-as-maths alias).

- [ ] **Step 1: Write the failing tests**

```js
test('tapping a not-yet tile ticks it at once and writes one outbox slot')      // skill_mastery row confirmed 1 pending; sync_outbox 1 'skill_mastery'
test('tapping a ticked tile unticks it')                                         // confirmed 0
test('an assessment tile does not toggle and explains why')                      // non-draft EGMA fixture; press → note text; no row written
test('an implied tile does not toggle and explains which tick implies it')       // tick add.10, press add.5 → "Known because 'up to 10' is ticked."
test('a kept-back tap shows no error')                                           // spy setSkillMastery → null; no 'Step update was not saved'; reload happened
test('a read started before a tap never overwrites the tap')                     // port LetterMasteryPanel's 'read/tap ordering with real SQLite' cases
test('a skill_mastery sync result refreshes the panel')                          // mockOffline.lastSyncResult = { tableResults: { skill_mastery: {...} } } → reload
test('a letter_mastery-only sync result does not refresh the number panel')      // no reload
test('a non-delivery child is read-only')                                        // isDelivery false → tiles disabled, no Tick button
test('a tap stamps the confirmed numeracy programme')                            // skill_mastery.programme_id = the numeracy programme id
test('cached maths after a move to literacy gives a read-only grid')            // rememberProgrammeSubject(numeracy), reassign literacy → note shown, press writes nothing
test('the class row shows the Number tracker only for a confirmed numeracy EA')  // ClassDetailScreen: isMaths true → 'Number tracker for Lwazi'; loading → neither icon; reading → letter icon only
test('the letter tracker still refreshes on letter_mastery')                     // useMasterySyncRefresh.test.js: wrapper unchanged behaviour
```

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/NumberTrackerPanel.test.js __tests__/useMasterySyncRefresh.test.js __tests__/ClassDetailScreen.test.js`
Expected: FAIL. `NumberTrackerPanel` is not found, and the class row has no Number tracker.

- [ ] **Step 3: Implement the hook, the panel, the screen, the route and the class entry**

- [ ] **Step 4: Run them, plus literacy tracker suites and guards, unmodified**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/NumberTrackerPanel.test.js __tests__/useMasterySyncRefresh.test.js __tests__/ClassDetailScreen.test.js __tests__/LetterMasteryPanel.test.js __tests__/LetterTrackerScreen.plan5.test.js __tests__/historyPullTriggerBudget.test.js __tests__/AppNavigator.headers.test.js __tests__/designSystemGuard.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/hooks/useMasterySyncRefresh.js src/hooks/useLetterMasterySyncRefresh.js src/components/numeracy/NumberTrackerPanel.js src/screens/numeracy/NumberTrackerScreen.js src/navigation/AppNavigator.js src/components/children/ClassChildRow.js src/screens/children/ClassDetailScreen.js __tests__/NumberTrackerPanel.test.js __tests__/useMasterySyncRefresh.test.js __tests__/ClassDetailScreen.test.js __tests__/historyPullTriggerBudget.test.js __tests__/AppNavigator.headers.test.js jest.integration.config.js && git commit -m "feat(numeracy): Number tracker screen with immediate ticks, opened from the class row"`

---

### Task 8: `useNumeracyLessonDraft`

**Files:**
- Create: `src/hooks/useNumeracyLessonDraft.js`
- Test: `__tests__/useNumeracyLessonDraft.test.js` (real SQLite default handle; fake date only)

**Interfaces:**
- Consumes:
  - `services.lessonDraft` (unchanged controller).
  - `loadLessonBase`, `isPlanRecomputable`, `resolveLessonClass` (literacy, unchanged).
  - `loadNumeracyLessonInputs` and `numeracyPlanInput` (Task 2).
  - `planNumeracyLesson`, `storeNumeracyPlan`, `isNumeracyPlanSuperseded` (Tasks 3 and C).
  - `newNumeracyDraftInput`, `swapCard`, `freezeForWrapUp`, `taughtCards` (Task 5).
  - `getCurriculum`, `CURRENT_EDITION`.
- The hook never names `assessmentHistory`. Completeness comes through Task 2's loader
  (`historyPullTriggerBudget`).
- Produces: `useNumeracyLessonDraft({ draftId?, start?: { groupId, upNextGroupId, programmeId } }) → { status, draft, plan, cards, knownByChild, curriculum, base, inputError, error, apply, swap, ensureDraft, beginSave, endSave, discard, retry }`.
  - `plan`: `StoredNumeracyPlan | null`.
  - `cards`: `Array<TaughtCard & { minutes, readiness: cardReadiness(...), help: cardHelpLists(...), stillOn: Array<{ childId, stepKey }> }>`.
    These come from `taughtCards(draft-or-plan)`, recomputed live from current attendance even when
    frozen.
  - `swap(index, stepKey)`. Picks the activity with `pickNumeracyActivity` (slot of that card), then
    applies `swapCard` with the current plan and `nowIso`.
  - `ensureDraft()`. Applies `freezeForWrapUp`, then calls `controller.ensureDraft()`.
  - Opening alone creates no draft. Like literacy, the plan is folded into the first change, and a
    first change after midnight re-dates the draft (`datedOnFirstChange`).
  - **Programme binding (Global Constraints, "Showing is not capturing").** A `start` carries the
    `programmeId` the picker confirmed. Before `controller.open({ start })` the hook calls
    `confirmNumeracyProgramme` again; `null` or a different id opens nothing and gives
    `status: 'wrong_programme'` (the screen shows `PROGRAMME_CHANGED_NOTE`). `loadLessonBase` gets
    that `programmeId` explicitly, and `newNumeracyDraftInput` stamps it.
  - **Maths history refresh.** The input loader reruns when maths data lands while the screen is
    mounted. The hook calls `useMasterySyncRefresh('skill_mastery', bumpInputs)` (Task 7, the one
    allowed page observer, so this file still never names `assessmentHistory`). `bumpInputs`
    increments a counter that is part of the loader's key, beside group, participants and retry.
    The recompute rule then decides: an unfrozen plan picks up more complete inputs, and a frozen
    plan keeps its cards while readiness lines use the new `knownByChild`. The Wrap up tracker sheet
    keeps its own once-per-open snapshot (Task 11), so a reload never re-reads under pending marks.
  - Recompute rule: the plan is recomputed only if
    `!draft.plan || (isPlanRecomputable({ lessonDate, today, frozen: !!plan_fixed_at }) && (present ids changed || isNumeracyPlanSuperseded(stored, complete)))`.
  - The planner runs once per input change. It is memoised on the JSON keys of present ids, inputs
    and the stored plan.

- [ ] **Step 1: Write the failing tests**

```js
test('opening a group shows a plan without creating a draft')                   // lesson_drafts count 0; plan.cards.length 3 on a first lesson
test('the first swap creates the draft, freezes the plan and changes that card') // draft.kind 'numeracy'; plan_fixed_at set; cards[1].step_key swapped
test('wrap up freezes the plan and fixes taught')                                // ensureDraft → ticks.taught length 3
test('a frozen plan never recomputes')                                           // freeze, then add a tick for a present child in SQLite and bump inputs → plan unchanged
test('an unfrozen plan recomputes when a child is marked absent')                // toggleAbsent → present_child_ids updated, plan recomputed once (spy planNumeracyLesson calls === 2)
test('an unfrozen plan recomputes when inputs become more complete, never less') // through the real store notification above, not a hand-set flag; true → false keeps
test('a history page landing while mounted refreshes an unfrozen plan')         // complete.ticks false; seed skill_mastery coverage + bump the real assessment-history store pageVersion → planNumeracyLesson reruns, plan superseded
test('a history page landing on a frozen plan keeps cards and refreshes readiness') // freeze; seed a tick for c2 on card 0 + bump pageVersion → step_key same, readiness.readyCount +1
test('a start whose programme is no longer maths opens nothing')                // start.programmeId numeracy; reassign literacy → status 'wrong_programme', lesson_drafts 0
test('readiness lines follow today\'s attendance on a frozen plan')              // freeze, mark c2 absent → cards[0].readiness.presentCount drops, step_key same
test('the plan is computed once per input change')                               // spy planNumeracyLesson: unrelated rerenders add no calls
```

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/useNumeracyLessonDraft.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the hook**

Copy `useLessonDraft`'s base, open and recompute effects. Replace the class/language/pack and
participant code with Task 2's loader. The class id comes from `resolveLessonClass` (for
`sessions.class_id`); the language and pack stay null.

- [ ] **Step 4: Run them, plus the history guard**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/useNumeracyLessonDraft.test.js __tests__/historyPullTriggerBudget.test.js __tests__/useLessonDraft.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/hooks/useNumeracyLessonDraft.js __tests__/useNumeracyLessonDraft.test.js && git commit -m "feat(numeracy): lesson draft hook with plan freezing and swap"`

---

### Task 9: Record → "Who are you teaching?" for numeracy

**Files:**
- Create: `src/numeracyLesson/inputs/numeracyPicker.js`
- Modify:
  - `src/screens/sessions/SessionFormScreen.js:28-37`
  - `src/screens/lessons/LessonPickerScreen.js:39-128` (new `kind` prop, default `'literacy'`)
  - `src/lessonPlan/inputs/lessonInputs.js:106-109` (`loadPickerRanking` returns `{ draftId, draftKind }`)
  - `src/utils/lessonDates.js:31-33` (`lessonRowDetail(seen, letters, { needsAppUpdate, nextSteps })`)
  - `src/components/lessons/UpNextCard.js:18`, `GroupLessonRow.js:10` (pass `row.nextSteps`)
  - `__tests__/SessionFormProgrammeSwitch.test.js:21-65`. Its three real-hook tests assert the
    coming-soon text this task deletes, so they are rewritten, not dropped (see Step 1).
- Test: `__tests__/LessonPickerScreen.numeracy.test.js` (real SQLite; integration list), `__tests__/SessionFormScreen.test.js` (add cases), `__tests__/SessionFormProgrammeSwitch.test.js` (rewritten), `__tests__/lessonDates.test.js` (add case)

**Interfaces:**
- Consumes:
  - `rankGroups` (unchanged; recency only).
  - `loadNumeracyLessonInputs`, `numeracyPlanInput` (Task 2).
  - `planNumeracyLesson`, `nextLine`, `stepPhrase` (Task 4).
  - `lessonRouteForDraft` (Task 1).
  - `ConfirmSheet`, `InlineNote`, `BrandButton`.
- Produces:
  - `loadNumeracyPickerNext({ handle, repositories, services, base, ranking, curriculum }) → Promise<{ nextByGroup: Record<groupId, string[]>, historyComplete: boolean }>`.
    For each group, it plans over all members as present (history by `group_id`), and gives the
    `stepPhrase` of each activity card in card order.
  - `lessonRowDetail` with `nextSteps` gives `[seen, 'Next: ' + nextSteps.join(' · ')]`. Literacy calls
    are unchanged.
  - `LessonPickerScreen({ navigation, kind = 'literacy' })` behaves as follows:
    - it routes an existing draft with `navigation.replace(lessonRouteForDraft(draft), { draftId })`,
      and a corrupt draft by `error.kind`;
    - `kind === 'numeracy'` first calls `confirmNumeracyProgramme`. With `null` it shows
      `PROGRAMME_CHANGED_NOTE` and no group rows. Otherwise it runs `loadNumeracyPickerNext` (with
      that `programmeId` in `loadLessonBase`) in place of `loadPickerLetters`, and starts with
      `navigate('NumeracyLesson', { groupId, upNextGroupId, programmeId })`;
    - **P12:** in the numeracy picker, a draft of kind `'literacy'` shows the `InlineNote` "An older
      reading lesson is still open. It can't be saved now." with **Discard it**. That opens a
      `ConfirmSheet` (title "Discard the reading lesson?", confirm "Discard"). On confirm it calls
      `await services.lessonDraft.open({ draftId })`, then `services.lessonDraft.discard()`, then
      reloads the picker. The `open` is required: after a cold start the picker has only read
      `lessonDrafts.getActive()`, and `discard()` takes its target from the controller's open
      draft (`lessonDraftController.js:180-190`), so a bare `discard()` deletes nothing. `open` also
      attaches a corrupt draft (`status: 'corrupt'`, `existingDraftId`), which `discard()` then
      removes. The controller stays the only writer.
  - `SessionFormScreen`:
    - `isMaths === true` gives `<LessonPickerScreen kind="numeracy" />`;
    - a literacy coach who isn't maths keeps the literacy picker;
    - every other role keeps "coming soon";
    - the "Session forms for Numeracy are coming soon" copy is deleted.

- [ ] **Step 1: Write the failing tests**

```js
test('a numeracy EA sees Who are you teaching with Up next and a Next line')    // 'Next: Count objects up to 5 · Read numbers up to 5' on a first lesson
test('starting a group opens the numeracy lesson')                               // routeNames() ends with 'NumeracyLesson'
test('an open numeracy draft reopens the numeracy lesson')                       // replace → 'NumeracyLesson' with draftId
test('a leftover literacy draft offers Discard it, then the numeracy picker')   // draft seeded straight into SQLite, fresh controller (cold start); Discard → ConfirmSheet → lesson_drafts 0, Up next visible
test('a leftover corrupt draft can be discarded the same way')                  // bad JSON row, fresh controller → Discard → lesson_drafts 0
test('cached maths after a move to literacy lists no groups')                   // real hook: rememberProgrammeSubject(numeracy), reassign literacy, fail the gate read in SessionFormScreen → numeracy picker shows the note; no 'NumeracyLesson' route
test('a literacy coach still gets the literacy picker and Lesson route')        // SessionFormScreen: literacy unchanged; existing literacy draft → 'Lesson'
test('the numeracy coming-soon text is gone')                                    // queryByText(/coming soon/) null for isMaths
test('picker rows are ready within budget')                                      // 6 groups × 6 children: loadNumeracyPickerNext resolves < 500 ms under jest real timers (logged, soft)
```

`SessionFormProgrammeSwitch.test.js` keeps its real hook, its reassignment and its failed-read
scenarios. The picker stub renders its `kind` as the text `picker:{kind}`. Each
`'Session forms for Numeracy are coming soon.'` assertion becomes `picker:numeracy`, and each
"picker never mounts" assertion becomes "the literacy picker (`picker:literacy`) never mounts" for a
maths EA, and the reverse for a reading EA.

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/LessonPickerScreen.numeracy.test.js __tests__/SessionFormScreen.test.js __tests__/SessionFormProgrammeSwitch.test.js __tests__/lessonDates.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the loader, the picker `kind`, the routing and the Record branch**

- [ ] **Step 4: Run them, plus literacy picker suites (unmodified apart from `SessionFormProgrammeSwitch`)**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/LessonPickerScreen.numeracy.test.js __tests__/SessionFormScreen.test.js __tests__/SessionFormProgrammeSwitch.test.js __tests__/LessonPickerScreen.test.js __tests__/LessonFlowNavigation.test.js __tests__/lessonInputs.test.js __tests__/lessonDates.test.js __tests__/numeracyCopyPlainWords.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/numeracyLesson/inputs/numeracyPicker.js src/screens/sessions/SessionFormScreen.js src/screens/lessons/LessonPickerScreen.js src/lessonPlan/inputs/lessonInputs.js src/utils/lessonDates.js src/components/lessons/UpNextCard.js src/components/lessons/GroupLessonRow.js __tests__/LessonPickerScreen.numeracy.test.js __tests__/SessionFormScreen.test.js __tests__/SessionFormProgrammeSwitch.test.js __tests__/lessonDates.test.js jest.integration.config.js && git commit -m "feat(numeracy): Record opens the numeracy group picker"`

---

### Task 10: Lesson plan screen, Swap and How to teach it

**Files:**
- Create: `src/hooks/useLessonExitGuard.js`, `src/screens/numeracy/NumeracyLessonScreen.js`, `src/screens/numeracy/HowToTeachScreen.js`, `src/components/numeracy/LessonCard.js`, `src/components/numeracy/SwapSheet.js`
- Modify: `src/screens/lessons/LessonScreen.js:46-74,125-129,189-192` (use the guard; behaviour unchanged); `src/navigation/AppNavigator.js` (routes `NumeracyLesson` title `''`, `HowToTeach` title 'How to teach it'); `__tests__/AppNavigator.headers.test.js`
- Test: `__tests__/NumeracyLessonScreen.test.js` (real SQLite; integration list), `__tests__/HowToTeachScreen.test.js`

**Interfaces:**
- Consumes:
  - `useNumeracyLessonDraft` (Task 8).
  - `swapOptions` (Task 3).
  - `copy.js` (Task 4).
  - `AttendanceChips`, `AddChildSheet`, `ConfirmSheet`, `StickyActionFooter`, `BrandButton`,
    `groupNumber`, `formatNameList`.
- Produces:
  - `useLessonExitGuard({ navigation, route, status, restartRoute, restartParams }) → { leaveAction, setLeaveAction, requestExit(kind: 'back'|'restart') }`.
    It moves `LessonScreen`'s `usePreventRemove`, `SessionForm` stack cleanup and `pendingExit`
    effects verbatim. `restartRoute` is `'Lesson'` or `'NumeracyLesson'`.
  - `LessonCard({ card, curriculum, names, onOpen, onSwap })`. It shows:
    - the slot label (**Warm-up** or **Activity**) and "{minutes} min";
    - `stepTitle`;
    - `readyLine`;
    - `needHelpLine` (only when `help.needHelp` is non-empty) and `canHelpLine` (from
      `help.canHelp`);
    - a **Swap** link.
  - `SwapSheet({ visible, onDismiss, options, currentStepKey, curriculum, readinessFor, onPick })`.
    It is a `BottomSheet` of `SelectableRow variant="radio"`. Each row shows `stepTitle` with
    `readyLine` as its subtitle. Review options read "Practise again".
  - `NumeracyLessonScreen` (route `NumeracyLesson`, params `{ draftId } | { groupId, upNextGroupId, programmeId }`):
    - the title is the children's names, as in literacy;
    - "Who's here" `AttendanceChips` plus "+ Add a child";
    - `lessonHeader`;
    - the warning "Still downloading what children know. Suggestions may repeat." when
      `plan.reason === 'incomplete_inputs'`;
    - the cards;
    - when there are zero activity cards, "This group knows every step that's ready. Use Swap to choose
      a step." with a **Choose a step** button. It opens `SwapSheet` for a new activity slot and
      appends the card (Open question 5);
    - footer **Wrap up →** calls `ensureDraft()`, then `navigate('NumeracyWrapUp', { draftId })`;
    - discard and leave sheets with literacy's copy.
  - `HowToTeachScreen` (route `HowToTeach`, params `{ stepKey, activity }`):
    - the goal, the activity name with "{minutes} min", the numbered `how` steps, and "You need:
      {needs}", each passed through `keepSumsTogether`;
    - never `note_for_partner`, `source` or `source_ref`;
    - an unknown key or activity shows "This step isn't in this version of the app." (P8).

- [ ] **Step 1: Write the failing tests**

```js
test('a first lesson shows a warm-up and two activity cards with ready lines')  // 'Warm-up', 2× 'Activity', 'Finger flash · up to 5', '3 of 3 are ready'
test('the header shows the group number and total minutes')                      // 'Group 1 · {sum} min lesson'
test('need help and can help lines never name the same child')                   // seed c1 add.10 ticked, count.10 unknown → c1 only in 'still on' line
test('need help names the step each child is still on')                          // 'Sipho and Ayanda are still on up to 5'
test('Swap lists the ready steps and replaces the card')                         // press Swap on card 2 → options; pick → card title changes; draft created & frozen
test('a group with no ready activity sees the note and can choose a step')       // all known → note text; Choose a step → review option → card appended
test('tapping a card opens How to teach it for that step and activity')          // routeNames ends 'HowToTeach'; params { stepKey, activity }
test('How to teach it shows goal, numbered steps and needs, never the partner note') // real content add.5: goal text, '1.' … , 'You need:'; queryByText(note_for_partner) null
test('Wrap up freezes the plan and opens Wrap up')                               // routeNames ends 'NumeracyWrapUp'; plan_fixed_at set
test('leaving asks to keep or discard, as literacy does')                        // back → 'Leave this lesson?' sheet; discard → back to start
```

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/NumeracyLessonScreen.test.js __tests__/HowToTeachScreen.test.js`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the guard extraction first, run `LessonFlowNavigation.test.js` and `LessonScreen.test.js` unmodified, then build the numeracy screens**

- [ ] **Step 4: Run them, plus literacy lesson suites and guards**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/NumeracyLessonScreen.test.js __tests__/HowToTeachScreen.test.js __tests__/LessonScreen.test.js __tests__/LessonFlowNavigation.test.js __tests__/AppNavigator.headers.test.js __tests__/designSystemGuard.test.js __tests__/screenTimerAudit.test.js __tests__/numeracyCopyPlainWords.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/hooks/useLessonExitGuard.js src/screens/lessons/LessonScreen.js src/screens/numeracy/NumeracyLessonScreen.js src/screens/numeracy/HowToTeachScreen.js src/components/numeracy/LessonCard.js src/components/numeracy/SwapSheet.js src/navigation/AppNavigator.js __tests__/NumeracyLessonScreen.test.js __tests__/HowToTeachScreen.test.js __tests__/AppNavigator.headers.test.js jest.integration.config.js && git commit -m "feat(numeracy): lesson plan screen with swap and How to teach it"`

---

### Task 11: Wrap up, the deferred tracker sheet and Session complete

**Files:**
- Create: `src/screens/numeracy/NumeracyWrapUpScreen.js`, `src/components/numeracy/WrapUpStepRow.js`, `src/components/numeracy/TickWhenStrip.js`, `src/components/numeracy/NumberTrackerSheet.js`
- Modify: `src/utils/sessionCompleteView.js:11-47`; `src/navigation/AppNavigator.js` (route `NumeracyWrapUp`, title 'Wrap up'); `__tests__/AppNavigator.headers.test.js`; `__tests__/domainTextInputAudit.test.js` (pin the numeracy notes field)
- Test: `__tests__/NumeracyWrapUpScreen.test.js`, `__tests__/NumeracyWrapUp.save.test.js` (real SQLite; both on the integration list), `__tests__/NumberTrackerSheet.test.js`, `__tests__/sessionCompleteView.test.js` (add cases)

**Interfaces:**
- Consumes:
  - `useNumeracyLessonDraft` (`draftId` only).
  - `saveNumeracyLesson` (Task 5).
  - `toggleChipChange`, `toggleStepChange`, `setStepChanges`, `clearChildStepChanges`, `taughtCards`.
  - `buildTrackerModel`, `NumberTrackerGrid`, `StepSheet` (Task 6).
  - `chipLabel`, `stripSummary`, `tickWhenLines`, `numeracySaveErrorMessage` (Task 4).
  - `loadKnownSteps` (Task 2), for each present delivery child.
  - `buildSessionTypeFields`.
  - Literacy Wrap up's date sheet and notes field, copied exactly (MA-BUG-20261031-001/-20261030-001
    keyboard handling).
- Produces:
  - `TickWhenStrip({ curriculum, stepKey, initiallyOpen = false })`. Collapsed, it shows
    `stripSummary`. Open, it shows `tickWhenLines`.
  - `WrapUpStepRow({ child, steps, known, pending, isDelivery, onToggle, onOpenTracker, knownCount, total })`.
    - There is one chip per distinct taught step (`chipLabel`).
    - Chip states: an EGMA step is amber/locked and fixed; a known step is ticked and fixed; a pending
      add is ticked and removable; otherwise not yet.
    - The row has a "{n} / {total} ›" button.
    - A non-delivery child shows "Steps can't be updated for this child".
  - `NumberTrackerSheet({ visible, onDismiss, child, curriculum, userId, pendingChanges, onChangesUpdate })`.
    It loads stored state once per open, applies `toggleStepChange`, and never subscribes to the sync
    refresh. Its footer is "Done".
  - `NumeracyWrapUpScreen` (route `NumeracyWrapUp`, params `{ draftId }`):
    - the heading "Who can do these without help?", with "Teaching it today doesn't count." under it;
    - a `TickWhenStrip` per distinct taught step;
    - a row per present child;
    - "Add notes" as in literacy;
    - the footer **Save lesson**.
    - Save follows literacy's choreography: ref guard, `beginSave`, save, `endSave`,
      `refreshFromCache`, `replace('SessionComplete', …)`, then sync triggers. Back is blocked while
      saving. "Clear their changes" covers `CHANGES_NOT_WRITABLE`.
  - `buildNumeracyCompleteParams({ selectedChildren, taught, curriculum, sessionDateKey }) → { childCount, childNames, steps: string[], sessionDate }`,
    where `steps` are distinct `stepTitle`s in taught order.
  - `buildReceiptRows` adds `{ key: 'steps', label: 'Taught', value: steps.join(' · ') }` when `steps`
    is non-empty. Literacy params never carry `steps`.

- [ ] **Step 1: Write the failing tests**

```js
test('Wrap up shows the heading, a strip per taught step and a row per present child') // exact heading copy; strips = distinct taught steps; absent child has no row
test('a chip adds a tick to the draft, a second tap removes it')                // tracker_changes c1 add.5 {mastered:true}; tap again → removed
test('a chip EGMA already shows is fixed, and a known step shows ticked')       // non-draft evidence fixture; pressing does nothing; tracker_changes unchanged
test('the row opens the tracker sheet where a stored tick can be unticked')     // '3 / 37 ›' → sheet; untick count.5 → {mastered:false}; Done → draft holds it
test('the wrap-up tracker sheet ignores sync refreshes')                         // set lastSyncResult.tableResults.skill_mastery while open → no re-read (getSkillMastery calls stay 1)
test('Save lesson writes everything and opens Session complete with Taught')   // NumeracyWrapUp.save: sessions 1, skill_mastery rows, draft gone; 'Taught' row text
test('Back is blocked while saving')                                             // hold the save; goBack → still on NumeracyWrapUp
test('a refused child can have their changes cleared, then save')                // CHANGES_NOT_WRITABLE → 'Clear their changes' → save succeeds
test('a back-dated Wrap up saves the plan as past_date')                         // date sheet pick yesterday → saved numeracy.plan null, plan_reason 'past_date'
test('literacy Session complete receipt is unchanged')                           // sessionCompleteView: literacy params → same rows as before
```

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/NumeracyWrapUpScreen.test.js __tests__/NumeracyWrapUp.save.test.js __tests__/NumberTrackerSheet.test.js __tests__/sessionCompleteView.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the strip, row, sheet, screen, route and receipt row**

- [ ] **Step 4: Run them, plus literacy Wrap up suites and guards, unmodified**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/NumeracyWrapUpScreen.test.js __tests__/NumeracyWrapUp.save.test.js __tests__/NumberTrackerSheet.test.js __tests__/sessionCompleteView.test.js __tests__/LessonWrapUpScreen.test.js __tests__/LessonWrapUp.save.test.js __tests__/LetterTrackerBottomSheet.test.js __tests__/domainTextInputAudit.test.js __tests__/keyboardAvoidingImports.test.js __tests__/designSystemGuard.test.js __tests__/numeracyCopyPlainWords.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/screens/numeracy/NumeracyWrapUpScreen.js src/components/numeracy/WrapUpStepRow.js src/components/numeracy/TickWhenStrip.js src/components/numeracy/NumberTrackerSheet.js src/utils/sessionCompleteView.js src/navigation/AppNavigator.js __tests__/NumeracyWrapUpScreen.test.js __tests__/NumeracyWrapUp.save.test.js __tests__/NumberTrackerSheet.test.js __tests__/sessionCompleteView.test.js __tests__/AppNavigator.headers.test.js __tests__/domainTextInputAudit.test.js jest.integration.config.js && git commit -m "feat(numeracy): Wrap up with tick-when strips, step chips and Save lesson"`

---

### Task 12: Home: a numeracy lesson in progress

**Files:**
- Modify: `src/utils/homeAttention.js:14-36`; `src/screens/main/HomeScreen.js:160-170`
- Test: `__tests__/homeAttention.test.js`, `__tests__/HomeScreen.test.js` (add cases; already on the integration list)

**Interfaces:**
- Consumes: `lessonRouteForDraft` (Task 1); `LessonDraftCorruptError.kind`.
- Produces:
  - `lessonInProgressFromDraft(draft, children)` adds `route: lessonRouteForDraft(draft)`.
  - `lessonInProgressItem` uses `route` (default `'Lesson'`).
  - On Home, the card shows only when `subjectReady` and the draft kind matches the subject
    (`'numeracy'` when `isMaths`, else `'literacy'`). A corrupt draft is matched by `error.kind`.
  - The literacy rule is unchanged: a literacy EA with a literacy draft sees the same card as today.

- [ ] **Step 1: Write the failing tests**

```js
test('a numeracy EA with a numeracy draft sees Lesson in progress and resumes the numeracy lesson') // route 'NumeracyLesson'
test('a numeracy EA never sees a leftover literacy draft on Home')              // isMaths, kind literacy → no card
test('a literacy EA with a literacy draft sees the same card as before')        // route 'Lesson', copy unchanged
test('no card shows before the subject is known')                                // subjectReady false → none
```

- [ ] **Step 2: Run them and see them fail**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/homeAttention.test.js __tests__/HomeScreen.test.js`
Expected: FAIL on the numeracy cases.

- [ ] **Step 3: Implement the route and the kind-matched card**

- [ ] **Step 4: Run them**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/homeAttention.test.js __tests__/HomeScreen.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/utils/homeAttention.js src/screens/main/HomeScreen.js __tests__/homeAttention.test.js __tests__/HomeScreen.test.js && git commit -m "feat(numeracy): Home resumes a numeracy lesson in progress"`

---

### Task 13: Docs, branch gate, Codex review and device check W (Claude; device and EAS steps need Jim's go)

**Files:**
- Modify: `CONTEXT.md`, `PRD.md`, `documentation/rls-sync-contract-map.md`, `documentation/design-system.md`, `documentation/device-gates-sqlite-backend-2026-07.md`, `documentation/build-log.md`, `documentation/LEARNING.md`, `documentation/ROADMAP.md` (only if a follow-up is left open)

- [ ] **Step 1: Standing docs (spec §11, net of Track B)**

- `CONTEXT.md`:
  - add **Number tracker** (one child's skills and steps; immediate ticks; locked EGMA steps;
    implied steps) and **Lesson shape** (mixed only in this release; "20 min lesson" is the EA
    phrase, the header shows the activity total);
  - add the numeracy lesson flow (Record → group → lesson plan → How to teach it → Wrap up → Save
    lesson; plan freezes on the first Swap or Wrap up).
- `PRD.md`: the numeracy lesson flow and the `activities.numeracy` record.
- `documentation/rls-sync-contract-map.md`:
  - the `sessions.activities.numeracy` producer shape;
  - `lesson_drafts.kind` (local only, v22) in the table list;
  - `assessmentCompletenessByChild` as the numeracy evidence completeness input;
  - replace "(numeracy capture screens are Track D)" with the shipped screens and the save order.
- `documentation/design-system.md`: a "Numeracy components" table (`StepTile`, `SkillRow`,
  `NumberTrackerGrid`, `StepSheet`, `NumberTrackerPanel`, `NumberTrackerSheet`, `LessonCard`,
  `SwapSheet`, `TickWhenStrip`, `WrapUpStepRow`), with one-line contracts and a link to gate §W.
  Also add `masteryStateColors`.
- `documentation/LEARNING.md`: a section on why `lesson_drafts.kind` beat inferring the shape, and on
  "need help" versus "can help" overlap.

- [ ] **Step 2: Full gates**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --runInBand && npm run test:integration && npm run test:content && npm run test:types`
Expected: exit 0, with suite and test counts noted against the Task 0 baseline. No literacy test file
changed except those named in Tasks 1–12.

- [ ] **Step 3: Whole-branch Codex adversarial review**

Run `/codex:adversarial-review --model gpt-6-astra --base origin/main`. Engage each finding, fix,
and rerun until no new substantive finding. Stop at the round cap for rare timing races, and record
them as known risks in the build log.

- [ ] **Step 4: Device check W (needs Jim's yes for the EAS builds and for the staging test data)**

- **Builds:** EAS Android **preview** and iOS preview from the branch head.
- **Staging data (Jim's go):** a numeracy test EA on `masi-app-sqlite` (confirm
  `project_ref=segygjzpujphwvrubusm`), with an active `numeracy` assignment, one class, six children
  and one group.
- **Devices:** Galaxy A03s at 360 dp (`wm density 320`), at **default text size**, with no
  screen-reader checks; plus one iPhone.
- **Before checking:** fresh install, wait for the first sync to finish.
- Add `## W. Numeracy screens (Track D, 2026-11)` to the gate doc: an intro, a status line, and a
  `| Gate | Check | Builds needed | Result |` table.
- **W1. Record:**
  - "Who are you teaching?" shows Up next with a "Next: …" line;
  - no literacy text anywhere (no letters, no reading level, no letter tracker icon).
- **W2. Lesson plan:**
  - "Group N · M min lesson", a Warm-up and two Activity cards, "N of M are ready";
  - after ticking two children back on the tracker, "still on …" names them and they are not in
    "can help";
  - nothing is clipped at 360 dp.
- **W3. How to teach it:** opens from a card; the goal, numbered steps and needs are readable while
  scrolling; sums don't break across lines; Back returns to the same plan.
- **W4. Swap and resume:**
  - Swap a card;
  - leave with Keep, reopen from Home's "Lesson in progress": same cards;
  - force-quit and reopen: same.
- **W5. Wrap up:**
  - strips collapse and open;
  - chips tick and untick a new tick;
  - "N / 37 ›" opens the sheet, where untick a stored tick, then Done;
  - **Save lesson** in airplane mode gives Session complete with a Taught row;
  - back online, sync clears;
  - a staging read-only query shows the session's `activities.numeracy` keys exactly as Task 5 and
    the `skill_mastery` rows.
- **W6. Number tracker:**
  - opened from the class row;
  - five tiles fit with no sideways scroll;
  - a tap ticks and unticks at once (< 300 ms by eye on the A03s);
  - an implied tile explains itself;
  - the ⓘ step sheet shows Tick when and the Tick button;
  - an offline tick syncs later.
- **W7. Literacy EA unchanged:** letter tracker icon, the literacy lesson flow, and Home's lesson
  card all behave as before.
- **W8. Timing:** picker rows < 500 ms after focus on the A03s (Share logs timing line).
- **iPhone:** W1–W6 spot check, with keyboard behaviour on the Wrap up notes field.
- **Not checkable yet:** amber (Assessment) tiles. EGMA results stay `-draft` until the freeze before
  December (§10.3), so they're covered by Jest fixtures only. Add a gate row "W9 after EGMA freeze:
  assessment tiles lock".
- Record the results in gate §W and in the build log. A failure gets an MA-BUG record (`/bug-user`)
  before any fix.

- [ ] **Step 5: Build log, then the PR (merge waits for Jim)**

File the literacy follow-up from "Self-review notes" as a GitHub issue (letter-mastery completeness
that lands while a literacy lesson is open never reaches its supersession rule), labelled
`needs-triage`, and link it from the PR body.

- Append Verification Register rows: each task's suites, the full gates, review rounds, device W rows
  and the deferred W9.
- Commit:
  `git add CONTEXT.md PRD.md documentation/ && git commit -m "docs(numeracy): Track D screens, contract map, design system, gates and build log"`.
- Open the PR with P1–P16 and the open questions listed, `Refs` only.

---

## Open questions for Jim

Each one is a place where the spec, as written, conflicts with the code or content as it is today.
The plan builds the "Claude's call" answer so work isn't blocked, and each is a one-place change if
Jim picks differently.

1. **Assessment colour.**
   - The spec says amber = Assessment, "in the existing tracker colours (`letterStateColors`)". But
     the existing assessment swatch is a light **green** tint (`successBg` / `successBorder`), not
     amber.
   - Claude's call: keep the existing swatch through a `masteryStateColors` alias, so both trackers
     match.
   - Amber would be `warningBg` / `warningEdge` / `warningText`. That is one constant, and would
     change the letter tracker too unless the two diverge on purpose.
2. **Chip words aren't in the content.**
   - The spec's "Flash to 5 / Count to 10 / Add to 5" can't be read from `curriculum-2026.1-draft.json`.
   - Claude's call: a `CHIP_WORDS` constant in `copy.js` (Task 4), with a test that every skill has
     one.
   - Alternative: add a `short` field per skill to the content file, so the partner owns it. That is
     a Track A schema and verify change.
3. **The tick-when strip wording.**
   - The spec's "Count up to 10: ask for 8, then 10, then 9 counters." is a hand-written summary.
     The content stores `{ setup, ask[3], expected[3], rule }`.
   - Claude's call: the strip reads "{skill} {step}: {ask 1} · {ask 2} · {ask 3}" collapsed, and the
     full setup and answers open.
   - Alternative: a `tick_when.summary` content field.
4. **Picker and card labels.**
   - The spec's picker example says "Count up to 20" but its card example says "Count objects · up
     to 10"; the content label is "Count objects".
   - Claude's call: always use the content label ("Next: Add up to 10 · Count objects up to 20").
5. **"Use Swap to choose a step" when there is no card to swap.**
   - With no ready activity step the plan has zero activity cards, so there's no Swap button.
   - Claude's call: show a **Choose a step** button that adds an activity card from review steps (the
     highest group-known step per activity skill that enough children are ready for), labelled
     "Practise again".

## Self-review notes

- **Spec coverage:**
  - §6.1 → Tasks 7, 9, 12.
  - §6.2 → Tasks 6, 7, 11.
  - §6.3 → Tasks 9, 10.
  - §6.4 → `activityCardCount: 2` in Task 2.
  - §6.5 → Task 11.
  - §8.2 → Tasks 3, 5.
  - §8.3 → Tasks 1, 5.
  - §9.3 help lists → Tasks 3, 10.
  - §9.4 → Tasks 3, 5, 8.
  - §11 → Task 13.
  - §13 screens → Tasks 7, 10, 11 and device check W.
- **Review notes:**
  - 1 → Task 3 `cardHelpLists`, Task 10.
  - 2 → Task 3 `stillOnStep`, `firstUnknownStep`.
  - 3 → Task 5 save, Task 7 panel.
  - 4 → Task 7 `useMasterySyncRefresh`.
  - 5 → Task 2 `loadNumeracyCompleteness`.
- **Not in this plan:** Insights and dashboards (spec non-goal), a lesson-shape setting (non-goal),
  the EGMA freeze (a separate Jim-gated change).
- **Literacy follow-up found in review (not fixed here; literacy must not change):** `useLessonDraft`
  reloads its participant inputs only on lesson identity, participants or retry
  (`useLessonDraft.js:112-132`), so letter-mastery completeness that lands while a literacy lesson
  is open does not reach its supersession rule. Task 13 files a GitHub issue for it; numeracy
  avoids the gap through Task 8's history refresh.
- **Literacy picker under cached maths:** literacy capture never relies on the shared cache (reading
  is confirmed per screen), so the programme-binding work is numeracy-only.

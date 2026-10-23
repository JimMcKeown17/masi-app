# Lesson flow (lesson-plan C2–C3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, Codex builds each task (`--model gpt-6.1-sol --effort high`) and Claude reviews the diff, reruns the tests and commits (`AGENTS.md`).

**Goal:** "+ Record" opens **Who are you teaching?**, then a **Lesson screen** kept open while teaching, then **Wrap up**, which saves one session for the group in one transaction. This replaces today's long Record form.

**Architecture:** The suggestion engine (`src/lessonPlan/engine/`, wave 1) stays pure. A new input layer (`src/lessonPlan/inputs/`) reads the phone's roster, mastery, history and completeness into engine inputs. A pure draft-state module and one hook drive the Lesson screen, with the local `lesson_drafts` row (wave 1) as the durable copy. A new save service writes the session, attendees, tracker marks, reading-level changes and outbox rows, and deletes the draft, in one SQLite transaction.

**Tech Stack:** React Native 0.81 (Expo 54, Fabric, Hermes), expo-sqlite / better-sqlite3 in tests, Jest + React Native Testing Library, Bold Red components.

**Spec:** `docs/superpowers/specs/2026-10-20-lesson-plan-design.md` (§4.3–4.8 rules, §5.1–5.3 screens, §5.5 Home, §6 saved data, §7.2 drafts, §7.3 inputs; C1, C2, C7, C8, C11, C13, C14, C17, C18, J5, J7, J16, J18). Mockups: `docs/superpowers/specs/assets/2026-10-20-lesson-plan/` (flow shape B, entry point A).

---

## Before you start

- [ ] **Branch from current `main`** and confirm three things are there:
  - wave 1 (`git log --oneline | grep '(#91)'`);
  - the assessment capture redesign: `grep -n "content: 'Andika_400Regular'" src/constants/typography.js` prints one line. Only Task 8 needs this reading font: Tasks 1–7 may be built first, then the branch is rebased onto `main` once the redesign merges and **before** Task 8 starts;
  - `src/db/migrations.js` ends at version 18 (`lesson_drafts` is 17).
- [ ] Run every test command with Node 20: prefix `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH"` (better-sqlite3 is built for Node 20).
- [ ] Real-SQLite suites you add must also be listed in `jest.integration.config.js` `testMatch` (an explicit list). `npm run test:integration` runs `--runInBand`.
- [ ] The branch is releasable only as a whole: Task 6 navigates to `Lesson` before Task 7 registers it, and Home's card (Task 10) must ship in the same bundle as the `Lesson` route (wave-1 C1 rollback rule). Never make a build from a mid-branch commit.

**Separate plans, written next:**

| Plan | What | Relation to this one |
| --- | --- | --- |
| Letter order (A2) | `getTeachingOrder(languageCode)`; the tracker, letter grid and receipt use the pack order; isiXhosa switches to J1 | Independent. Until it merges, the Wrap-up tracker sheet shows the old isiXhosa order while the Lesson screen shows J1. Fine for test builds; both must merge before a field build. |
| In-app reader (C4) | Text pages, **Open in app**, **Other book** | Adds two links to this plan's book row. |
| Lesson receipt and history (C5) | Blends and book on Session complete and history cards; receipt in the lesson's letter order | Reads the `lesson` object this plan saves and the `languageCode` param it passes. |

## Calls this plan makes (Jim to check)

The spec leaves these to the builder (§12) or is silent. Each is marked **(plan call)** where it applies.

| # | Call | Why |
| --- | --- | --- |
| P1 | The picker keeps the standard white stack header, titled "Who are you teaching?", with the Close button. | Every stack screen in the app uses it; the mockup's red band was rough. Keeps C17's route and gates unchanged. |
| P2 | **Wrap up is its own screen.** Back returns to the Lesson screen. | Matches flow B; gives Wrap up its own Save footer and back behaviour. |
| P3 | The draft is created on the first change on the Lesson screen, or when the EA taps **Wrap up →**, whichever comes first. Opening a lesson writes nothing. | Spec §7.2 ("created on the first change"); Wrap up needs a draft to edit. |
| P4 | Leaving the Lesson screen (Close, Back, Android back, iOS swipe) **asks first** once a draft exists: "Leave this lesson?" / "It's saved on this phone. You can finish it later from Home." / **Leave lesson** / **Keep teaching** (Jim, 2026-10-22). Leaving keeps the lesson; Home shows **Lesson in progress · Resume**. Deleting it is a separate **Discard lesson** action at the bottom of the Lesson screen, behind its own confirm. No warning before the first change (nothing to keep), after a save, or after a discard. **Device fix 2026-10-23:** once the lesson is kept, leaving goes back to the screen before the picker; before the first change Back still returns to the picker. | Guards against a stray back-swipe mid-session. The copy says the lesson is kept, because it is. |
| P5 | Home's **Resume** opens the lesson directly, without the clock-in check. "+ Record" still runs both gates first. | The clock-in nudge already ran when the lesson started; asking again on every resume would nag. |
| P6 | A class with **no language** set: the Lesson screen asks once, "Which language is this lesson in?" (English, isiXhosa, Afrikaans), and stores it in the draft. An **isiZulu** class gets no letter suggestions or tracker (there is no isiZulu letter order yet) but can still be saved. | Matches the assessment picker, which asks when a class has no language. The draft repository already allows setting the language once. |
| P7 | **Make a group** lists only children who are in no group. The group is named "Group N" (next number) and records the children's class when they share one. **Put in a group** adds an ungrouped child to an existing group or a new one. | Nothing else stops a child being in two groups (the rule is UI-only, `groupsRepository.addChildToGroup` has no check), so offering grouped children would double-book them. |
| P8 | "No one new yet" is per child. `lesson.tracker_check` is `marked` if any present child got a tracker change, else `none` if every present child got "No one new yet", else `null`. | Spec §6 has one value per lesson and §5.3 a button per child. |
| P9 | Last seen reads "Today ✓", a weekday ("Mon") within the last 6 days, "Not seen yet" when never seen, else a short date ("Mon 12 Oct"). **Device fix 2026-10-23:** the Lesson header reads "not seen yet", "seen today" or "last seen Mon". | Spec §4.3 lists the forms but no threshold. |
| P10 | The old Record form, its child picker and its validation are deleted in this plan, and their tests retired or retargeted. | J18: "the old Record form retires". Nothing else imports them. |
| P11 | Release builds carry letters-only packs, so blends and books show "No blends for {Language} yet" / "No books for {Language} yet". Device checks of blends and books use **preview-content** builds (Android and iOS). | `CURRENT_PACK_IDS.release` are the three interim letters-only packs; only the isiXhosa preview pack has blends and a reader. |
| P12 | Session complete keeps its current params and gains `languageCode`. Blend and book receipt rows come with the receipt plan. | Keeps this plan's diff to the capture flow. |

## Global Constraints

- **Copy, exactly as the spec writes it:** "Who are you teaching?", "Up next", "Start lesson", "Other groups", "+ Make a group", "Not in a group yet", "Put in a group", "Who's here", "+ Add a child", "1 · Letters · 15 min", "2 · Blending · 15 min · {tier}", "3 · Pair reading · 5 min", "Wrap up →", "Who knows {letters} without help?", "Teaching it today doesn't count.", "No one new yet", "Save session", "Save without letters, blends or a book?", "Still downloading past lessons. Suggestions may repeat.", "Still downloading what children know. Suggestions may repeat.", "All letters known", "Choose the letters you teach", "Lesson in progress". Tier labels on screen: `2 Letter Blends` → "2-letter", `3 Letter Blends` → "3-letter", `4 Letter Blends` → "4-letter", `Word Reading` → "words". New copy not quoted here follows `documentation/design-system.md` and is listed in the PR for Jim's wording pass.
- **Bold Red only:** `StepHeader`, `SelectableRow`, `LetterToggleGrid`/`LetterToggleTile`, `StickyActionFooter` (a sibling after the list), `ConfirmSheet`, `BottomSheet`, `SelectSheet`, `ListRow`/`ListGroup`, `BrandButton`, `InlineNote`, `EmptyState`, `TextField`, `MonthCalendar`. **Bottom sheets only**: no `Alert.alert`, `Modal` or Paper `Dialog` in new code. `designSystemGuard.test.js` passes with `BOARD_RATCHET` still empty: tokens and `typeRoles` only, no raw hex, no `fontWeight`, no numeric `fontSize`/`lineHeight`/`letterSpacing`.
- **Data access through the signed-in EA only:** repositories and services come from `useSignedInEA()` or an explicit handle (`productionBindingStatic.test.js`). `handle.withTransaction` is not re-entrant: pass the `transaction` facade down; only `lessonDrafts.discard` accepts one. **Only the draft controller (Task 5) and `saveLesson` (inside its transaction) write `lesson_drafts`**; screens never call `create`/`update`/`discard` directly.
- **Static guards:** engine files stay pure (`lessonPlanEnginePurity.test.js`), so all I/O lives outside `src/lessonPlan/engine/`. No file under `src/components/` or `src/hooks/` may mention the identifier `assessmentHistory` (`historyPullTriggerBudget.test.js`); completeness reads live in `src/lessonPlan/inputs/`. No new module-scope `let`/`Map`/`Set` in `src/services`, `src/db`, `src/session` (`moduleStateAllowlist.test.js`).
- **No server change, no local migration, no new synced table.** Everything new is in `sessions.activities.lesson` (spec §6) and the existing `lesson_drafts` row. Two extra keys live inside `ticks` (the repository keeps extra keys): `ticks.noOneNew: string[]` (child ids) and `ticks.blendTierShown: string|null`.
- **Saved shape = spec §6, key for key.** `activities.lesson.plan_reason` is written only when it is `'past_date'` (omit the key otherwise). `letters_focused` may be `[]`; `session_reading_level` may be `null` (C11).
- **Tracker marks** keep the tap time (`madeAt`, exactly `Date#toISOString()`) and the lesson's language (`draft.language_code`), unchanged through every retry. Reading levels are written only for children the EA changed (spec §7.2).
- **Sessions are insert-only.** The session id is `draft.session_id` for every attempt; never mint a new one.
- **Performance (A3 hand-off, device-checked in Task 12):** picker rows within 500 ms of opening; an attendance toggle redraws within 300 ms on the Galaxy A03s with the isiXhosa preview pack. Each engine function runs at most once per input change (memoise on pack id, present ids and plan).

## Review Focus

Failure modes the spec implies that are easy to miss. Each has a test in the task named.

1. **Slow draft writes across two screens** (A03s): ticks on the Lesson screen, an edit on Wrap up, Back, more ticks, then Save, all in quick succession, must persist every change in order, with no stale copy overwriting a newer one and no second draft row. One controller per EA serialises every write, and Save drains it first. Tests: Task 5 "cross-screen edits persist in order" and "save waits for queued edits".
2. **A resumed lesson whose group is no longer on the phone** (archived groups are fine; a group row that is gone is not): Save shows "This group is no longer on this phone. Discard this lesson to start again." and writes nothing; Discard works. Tests: Task 4 `GROUP_MISSING`, Task 9 screen test.
3. **A lesson left open past midnight, or resumed days later:** the plan is not recomputed, the lesson keeps its date ("Started Mon 19 Oct"), and saving keeps Monday's plan. Tests: Task 5 "a different day never recomputes", Task 9 "resumed lesson shows its start date".
4. **A child on a resumed lesson whose access has changed** (handed over, class or group ended): the phone checks the same three kinds of access the server checks. A child the EA can no longer record at all (no direct, class or group access) must be removed from the lesson; a child the EA can record but no longer delivers to keeps their attendance and reading-level change, but their tracker marks must be cleared (the server takes those only from the child's own EA). A lesson for a programme the EA has left is refused the same way. Save checks both **inside** its transaction, refuses with the draft kept, and the screens offer the one-tap fix. Names come from SQLite, not the roster in memory. Tests: Task 4 `CHILD_NOT_WRITABLE` and `CHANGES_NOT_WRITABLE`, including a revocation committed between the screen check and Save; Task 7 and Task 9 fixes.
5. **A full roster on the A03s with the preview pack:** the engine runs once per change, not once per render, and reads do not grow per child. Tests: Task 2 statement-count test, Tasks 6 and 7 engine call counts; Task 12 measures on device.

**Plan review (Codex `gpt-6-astra`, 2026-10-22):** round 1, 2 high + 4 medium (cross-screen draft writes, handed-over children, participant source, per-language letters, backdated tier, read budget); round 2, 3 high + 2 medium (controller attach and failure barrier, in-transaction authority, server access rules, newer synced corrections); round 3, 2 high + 1 medium (terminal corrections, programme assignment, reading-level rule); round 4, 1 high (a refused correction's outbox payload). All folded in. Review stopped there: round 4 was a single narrow case in the same area, and the built code gets its own adversarial review in Task 12.

**Known risk, not changed here:** if a child's grant ends after the session row uploads but before its attendee rows do, those attendee rows are refused (existing sync behaviour for every family; `rls-sync-contract-map.md`). This plan narrows the window to upload time; it does not add server authorization for ended grants.

---

## File map

| File | Responsibility |
| --- | --- |
| `src/services/pullCoverage.js` (modify) | Per-child history and mastery completeness, one cursor read each |
| `src/session/handleServices.js` (modify) | Expose both on the handle |
| `src/lessonPlan/inputs/knownLetters.js` (new) | Batched known letters per child for one language |
| `src/lessonPlan/inputs/lessonInputs.js` (new) | Lesson base (today, year, programme, sessions), picker model, `LessonInput` |
| `src/utils/groupHelpers.js` (modify) | `groupNumber`, `ungroupedChildren`, `sharedClassId` |
| `src/db/repositories/groupsRepository.js` (modify) | `createGroupWithMembers` in one transaction |
| `src/context/ChildrenContext.js` (modify) | `makeGroup(childIds)` |
| `src/lessonPlan/lessonRecord.js` (new) | Pure: draft → session row and `activities` |
| `src/services/lessonSave.js` (new) | One-transaction save, draft deleted inside it |
| `src/db/repositories/childrenRepository.js` (modify) | `getChildrenByIds` for lesson participants, history references included |
| `src/lessonPlan/lessonDraftState.js` (new) | Pure draft transitions and freeze rules |
| `src/services/lessonDraftController.js` (new) | One per signed-in EA: the only writer of the draft; serialised writes, subscribers, save hand-off |
| `src/hooks/useLessonDraft.js` (new) | Subscribes a screen to the controller; plan and choices for that screen |
| `src/utils/lessonDates.js` (new) | `lastSeenLabel`, `startedLabel` |
| `src/screens/lessons/LessonPickerScreen.js` (new) | Who are you teaching? |
| `src/screens/lessons/LessonScreen.js` (new) | Lesson screen |
| `src/screens/lessons/LessonWrapUpScreen.js` (new) | Wrap up and Save |
| `src/components/lessons/*` (new) | `UpNextCard`, `GroupLessonRow`, `MakeGroupSheet`, `PutInGroupSheet`, `AttendanceChips`, `AddChildSheet`, `LessonLettersSection`, `OtherLetterSheet`, `BlendTile`, `LessonBlendSection`, `BlendPoolSheet`, `LessonBookSection`, `WrapUpChildRow`, `LessonChoiceSheet` (class or language pick), `InProgressSheet` |
| `src/screens/sessions/SessionFormScreen.js` (modify) | Render `LessonPickerScreen` for literacy coaches |
| `src/navigation/AppNavigator.js` (modify) | Retitle `SessionForm`; register `Lesson`, `LessonWrapUp` |
| `src/screens/main/HomeScreen.js` (modify) | Lesson in progress card |
| `src/constants/typography.js` (modify) | `typeRoles.lessonItem` on `fontFamilies.content` |
| `src/constants/literacyConstants.js` (modify) | Export `READING_LEVEL_OPTIONS` |
| Deleted (Task 11) | `src/screens/sessions/LiteracySessionForm.js`, `src/components/children/ChildSelector.js`, `src/utils/literacySessionValidation.js`, `src/services/literacySessionPersistence.js`, and any helper left with no importer |

---

### Task 1: Completeness for a set of children

**Files:**
- Modify: `src/services/pullCoverage.js`, `src/session/handleServices.js:126-132`
- Test: `__tests__/pullCoverage.test.js`, `__tests__/handleServices.test.js`

**Interfaces:**
- Produces:
  - `sessionHistoryCompletenessByChild({ database, userId, programmeId, childIds, academicYearStart }) -> Promise<Record<string, boolean>>`: one `getPullState` read; each child's value equals `isCoverageWalkComplete(cursor, { childIds: [id], windowStart })`. Missing user, programme or year gives `false` for every child.
  - `masteryCompletenessByChild({ database, userId, programmeId, childIds }) -> Promise<Record<string, boolean>>`: the walk-level checks of `isMasteryInputsComplete` once, the two scope reads once, then per child.
  - `handle.services.sessionHistory.completenessByChild({ childIds, programmeId })` and `handle.services.assessmentHistory.masteryCompletenessByChild({ childIds, programmeId })`, bound to `handle.userId` (a passed `userId` is ignored, as `masteryInputsComplete` does). `programmeId` defaults to the active programme.

- [ ] **Step 1: Write the failing tests.** In `pullCoverage.test.js`, reuse the real-walk fixtures (`runSessionHistoryPull`, `seedCoreData`, `addDeliveryChild`, `createHistoryServer`):

```js
test('per-child history answers match the single-child predicate', async () => {
  // walk complete for c1, c2; c3 newly assigned after the walk
  const byChild = await sessionHistoryCompletenessByChild({ database: db, userId: 'user-1', childIds: ['c1', 'c2', 'c3'] });
  expect(byChild).toEqual({ c1: true, c2: true, c3: false });
  for (const id of ['c1', 'c2', 'c3']) {
    expect(byChild[id]).toBe(await isSessionHistoryComplete({ database: db, userId: 'user-1', childIds: [id] }));
  }
});
test('last year\'s window and a failure since both answer false for every child', ...);
test('reads the session cursor once for any number of children', ...); // spy on createSyncStateRepository().getPullState: 1 call for 30 children
test('per-child mastery answers match isMasteryInputsComplete, including a child in an unheld class', ...);
```

In `handleServices.test.js`, copy the `masteryInputsComplete` test at :65-90 for both accessors: reads only the captured handle and EA, makes no request, a stale handle rejects with `StaleActorError`, and an explicit `programmeId` is honoured.

- [ ] **Step 2:** Run `npx jest __tests__/pullCoverage.test.js __tests__/handleServices.test.js`. Expected: FAIL, "sessionHistoryCompletenessByChild is not a function".
- [ ] **Step 3:** Implement both functions in `pullCoverage.js` and the two accessors in `handleServices.js` (beside `:126` and `:130`).
- [ ] **Step 4:** Rerun Step 2. Expected: PASS. Then `npx jest __tests__/historyPullTriggerBudget.test.js __tests__/moduleStateAllowlist.test.js`: PASS.
- [ ] **Step 5: Commit** `feat(lesson): per-child history and mastery completeness on the handle`.

---

### Task 2: Lesson inputs from the phone

**Files:**
- Create: `src/lessonPlan/inputs/knownLetters.js`, `src/lessonPlan/inputs/lessonInputs.js`
- Modify: `src/utils/groupHelpers.js` (export helpers), `src/db/repositories/childrenRepository.js` (`getChildrenByIds`)
- Test: `__tests__/lessonInputs.test.js` (real SQLite; add to `jest.integration.config.js`), `__tests__/lessonInputsShape.test.js` (unit), `__tests__/groupHelpers.test.js`

**Interfaces:**
- Consumes: Task 1 accessors; engine `rankGroups`, `resolveLessonClass`; `getPack`, `getPackById`, `isPreviewContentEnabled`; `PEDAGOGICAL_ORDERS`, `languageCodeForHomeLanguage`; `pickLatestLetterResult`, `computeAssessmentMastery`.
- Produces:
  - `groupNumber(group) -> number|null` (`display_number`, else N from "Group N", else null); `ungroupedChildren({ children, childrenGroups }) -> child[]`; `sharedClassId(children) -> string|null` (the one class all share, else null). In `groupHelpers.js`.
  - `children.getChildrenByIds(ids) -> Promise<Record<string, { id, first_name, last_name, reading_level, class_id, history_reference, hidden_at }>>` (new in `childrenRepository.js`, chunked like `getChildNamesByIds`, history references included): the source of lesson participants' names, classes and **current** reading levels. The in-memory roster is used only to offer children to add.
  - `loadKnownLetters({ repositories, userId, childIds, languageCode }) -> Promise<Record<string, string[]>>`: lower-case letters known from the latest current-year letter result **union** confirmed tracker marks, in `PEDAGOGICAL_ORDERS[languageCode]` order, **for that one language**. Two batched repository calls for any number of children, `assessments.getLetterEvidenceResults({ userId, childIds })` and `mastery.getLetterMastery({ childIds, language })`, and no per-child loop. A language with no order (`zu`, `null`) gives `[]` per child and no calls.
  - `loadLessonBase({ handle, repositories, today, programmeId? }) -> Promise<{ today, academicYearStart, programmeId, sessions } | { missing: 'programme'|'academic_year' }>`: `sessions = repositories.sessions.getSessions({ userId: handle.userId, programmeId, sinceDate: academicYearStart })` (no `recordedByUserId`: other EAs' sessions for these children count).
  - `loadPickerModel({ handle, repositories, services, base, groups, getChildrenInGroup, children, childrenGroups }) -> Promise<PickerModel>`, where `PickerModel = { upNextGroupId, rows: PickerRow[], ungrouped: child[], historyComplete: boolean }` and `PickerRow = { groupId, name, number, dotColor, members: [{ id, firstName }], classId, languageCode, isEcd, lastSeenOn, taughtToday, nextLetters, lettersReason }` in `rankGroups` order. Classes come from `repositories.classes.getClasses()` **unscoped** (a child's class may not be one the EA holds). `historyComplete` is false if any member of any group is incomplete.
  - `shapePickerModel({...plain data}) -> PickerModel`: the pure half of the above, for unit tests.
  - `loadLessonInput({ handle, repositories, services, base, lesson }) -> Promise<LessonInput>`, where `lesson = { groupId, upNextGroupId, languageCode, packId, isEcd, presentChildIds }`; each present child's `readingLevel` comes from `children.getChildrenByIds` at load time (never the roster in memory, which is stale after an offline save).
  - Picker letters per language: `rankGroups` takes one `children` map, but a child can be in groups of two languages. Call `rankGroups` once over all groups for the **order** (ranking ignores known letters), then once per language over that language's groups with that language's `children` map, and take each row's `nextLetters`/`lettersReason` from its own language's call. No engine change. Pack: `getPackById(packId, { allowPreview: isPreviewContentEnabled() })` when `packId` is set, else `getPack(languageCode, sameOptions)`. `alphabet = PEDAGOGICAL_ORDERS[languageCode] ?? null`. Each present child gets `knownLetters`, `historyComplete`, `masteryComplete` from Task 1 and `loadKnownLetters`.

- [ ] **Step 1: Write the failing tests.** `lessonInputs.test.js` seeds the roster with the raw-SQL seed from `__tests__/contextRowShape.test.js:41-118` (children, assignments, enrolments, class memberships, groups, group assignments, memberships) and sets `classes.home_language`:

```js
test('known letters come from the current-year result and confirmations', ...);
// assert loadKnownLetters(...) toEqual({ c1: ['o','m','l','a'], c2: ['o','m'] })
test('reads do not grow with the number of children', ...);
// counting adapter: the statement count for 2 children equals the count for 20 (same fixture shape)
test('isZulu or no language gives no letters and no reads', ...);
test('a child in an English group and an isiXhosa group gets each group\'s own letters', ...);
// different confirmed letters per language; each picker row's nextLetters equals the plan its Lesson screen computes
test('participants come from SQLite, including a handed-over child and a fresh reading level saved offline', ...);
test('engine sessions include another EA\'s session for my child and my pending lesson, not another programme or last year', ...);
test('picker rows follow rankGroups order; a never-seen group is Up next; a group taught today is not', ...);
test('a child in a class the EA does not hold still resolves its class and language', ...);
test('a mixed-class group has classId null and no letters until the class is chosen', ...);
```

`lessonInputsShape.test.js` covers `shapePickerModel` with plain data: dot colour = index in `[...groups].sort(compareGroups)`, `number` from `groupNumber`, "Group 10" after "Group 2". `groupHelpers.test.js` adds `groupNumber`, `ungroupedChildren` (a removed membership counts as ungrouped), `sharedClassId`.

- [ ] **Step 2:** Run `npx jest __tests__/lessonInputsShape.test.js __tests__/groupHelpers.test.js` and `npm run test:integration -- __tests__/lessonInputs.test.js`. Expected: FAIL, missing modules.
- [ ] **Step 3:** Implement, including `getChildrenByIds` (add a case to `__tests__/childrenRepository.test.js` or the nearest existing children-repository suite).
- [ ] **Step 4:** Rerun Step 2 plus `npx jest __tests__/lessonPlanEnginePurity.test.js __tests__/productionBindingStatic.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(lesson): read lesson inputs from the phone`.

---

### Task 3: Make a group, put a child in a group

**Files:**
- Modify: `src/db/repositories/groupsRepository.js` (inside `createGroupsRepository`), `src/context/ChildrenContext.js`
- Test: `__tests__/groupsRepository.test.js`, `__tests__/ChildrenContext.test.js`

**Interfaces:**
- Consumes: `groupNumber`, `sharedClassId`, `nextGroupNumber` (Task 2, existing).
- Produces:
  - `groups.createGroupWithMembers({ group: { id, name, class_id, created_by }, childIds, joinedAt }) -> Promise<true>`: one `runRepositoryTransaction(database, ...)` calling `saveGroup(group, { transaction })` then `addChildToGroup({ id: uuidv4(), child_id, group_id, created_by }, { transaction })` per child. Throws if any child already has an active membership in one of this EA's groups (the UI rule, now enforced here).
  - `useChildren().makeGroup(childIds) -> Promise<{ success: true, group } | { success: false, error }>`: name `Group ${nextGroupNumber(groups)}`, `class_id = sharedClassId(children of childIds)`, then `refreshFromCache()` and `refreshSyncStatus()`. **Put in a group** reuses the existing `addChildToGroup(childId, groupId)` (the child is ungrouped, so no removal).

- [ ] **Step 1: Write the failing tests** (copy the shape of `groupsRepository.test.js:308`):

```js
test('a new group, its assignment and its members commit together with outbox rows in push order', ...);
// groups insert, group_ea_assignments insert, one child_group_memberships insert per child
test('the shared class is recorded; children in different classes give class_id null', ...);
test('a failure on the second member rolls back the group and the first member', ...); // trigger abort on child_group_memberships insert
test('a child already in another of my groups is refused and nothing is written', ...);
```

`ChildrenContext.test.js`: `makeGroup(['c1','c2'])` calls the repository with `name: 'Group 3'` when Groups 1 and 2 exist, then republishes `groups` and `childrenGroups` from SQLite.
- [ ] **Step 2:** Run `npm run test:integration -- __tests__/groupsRepository.test.js` and `npx jest __tests__/ChildrenContext.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Rerun Step 2 plus `npm run test:integration -- __tests__/sessionGroupSync.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(groups): make a group with its children in one transaction`.

---

### Task 4: Saving a lesson

**Files:**
- Create: `src/lessonPlan/lessonRecord.js`, `src/services/lessonSave.js`
- Modify: `src/db/repositories/childrenRepository.js` (`getWriteAuthority`), `src/db/repositories/masteryRepository.js` (`getCorrectionTimes`), `src/db/repositories/domainRepositoryUtils.js` (`hasActiveProgrammeAssignment`)
- Test: `__tests__/lessonRecord.test.js` (unit), `__tests__/lessonSave.test.js` (real SQLite; add to integration config), `__tests__/completionPathBudget.test.js`, `__tests__/foreignKeyEnforcement.test.js`

**Interfaces:**
- Consumes: `planForSave`, `deriveSessionReadingLevel` (engine); `presentChildIds` (drafts repository); `buildSessionTypeFields`.
- Produces:
  - `buildLessonRecord({ draft, userId, currentLevels, sessionTypeFields, nowIso }) -> { session, trackerChanges, readingLevelChanges }` (pure). `session = { id: draft.session_id, user_id: userId, programme_id, group_id, class_id, session_date: draft.lesson_date, children_ids: presentChildIds(draft.attendance), activities, notes: draft.notes ?? '', ...sessionTypeFields, synced: false, created_at: nowIso, updated_at: nowIso }`. `activities = { letters_focused: ticks.letters, session_reading_level: deriveSessionReadingLevel(ticks.blends), child_reading_levels: { [presentId]: readingLevelChanges[id] ?? currentLevels[id] ?? null }, comments: draft.notes ?? '', lesson: { version: 1, pack_id, language: draft.language_code, plan, [plan_reason], blend_tier_shown, blends_done: ticks.blends, books_read: ticks.books, tracker_check } }`. `blend_tier_shown = ticks.blendTierShown ?? draft.plan.blend_tier ?? null` is resolved from the **draft's** plan **before** `{ plan, plan_reason } = planForSave({ plan: draft.plan, lessonDate: draft.lesson_date })`, so a backdated lesson keeps the tier that was on screen. `trackerChanges` and `readingLevelChanges` are limited to present children. `tracker_check` per P8.
  - `children.getWriteAuthority({ userId, childIds, transaction }) -> Promise<Record<string, { attend: boolean, deliver: boolean, level: boolean }>>` (new in `childrenRepository.js`, one batched read, accepts the transaction facade). It mirrors the server exactly, using local rows:
    - `attend` = `private.current_user_can_write_for_child` (`supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:483-516`): an active `child_ea_assignments` row, **or** an active `class_ea_assignments` row joined to an active `child_class_memberships` row, **or** an active `group_ea_assignments` row joined to an active `child_group_memberships` row. The attendee INSERT policy uses it.
    - `deliver` = `private.current_user_delivers_to_child` (`20261021160000_letter_mastery_current_state.sql:22-34`): an active `child_ea_assignments` row. `set_letter_mastery` requires it, so tracker changes need it.
    - `level` = `children.created_by = userId` **or** `attend`: the effective children UPDATE policy (`20260521144901…:672-682`, which replaces the earlier definition at :129), so reading-level changes need it.
  - `hasActiveProgrammeAssignment(db, userId, programmeId) -> Promise<boolean>` (new in `src/db/repositories/domainRepositoryUtils.js`, beside `getActiveProgrammeAssignment`; called with the transaction facade as `db`): an active local `staff_programme_assignments` row (`ended_at is null`) for exactly that programme. The server's `sessions_insert_active_programme` policy requires it (`20260521120147_masi_rls_advisor_cleanup.sql:361-371`).
  - `mastery.getCorrectionTimes({ childIds, language, transaction }) -> Promise<Record<string, Record<string, string>>>` (new in `masteryRepository.js`): per child and letter, the **later** of the stored row's `changed_at` (terminal rows included) and the `changed_at` in that row's `letter_mastery` outbox payload, whatever the outbox status (terminal included). A history pull can restore a refused correction's row to the server's older value while its terminal outbox payload keeps the newer correction (`masteryRepository.js:217-257`); that payload must still win. For ordering only; `getLetterMastery` keeps excluding terminal rows for display.
  - `saveLesson({ handle, draft, sessionTypeFields, nowIso = new Date().toISOString() }) -> Promise<{ sessionId }>`. `draft` must be the controller's drained snapshot (Task 5), never a screen's copy. Throws `LessonSaveError` with `code`:
    - before the transaction: `NO_CHILDREN`; `NO_PLAN` (`draft.plan === null`; the controller never lets a draft reach Save without one);
    - **first thing inside the transaction, through the facade, before any write**: `PROGRAMME_NOT_ACTIVE` (the EA's assignment to `draft.programme_id` has ended; never substitute the current programme); `CHILD_NOT_WRITABLE` with `childIds` (a present child whose `attend` is false); `CHANGES_NOT_WRITABLE` with `childIds` (a present child with tracker changes and `deliver` false, or with a reading-level change and `level` false). Checking inside the transaction closes the gap between the screens' check and the writer lock;
    - later in the transaction: `GROUP_MISSING` (wraps `saveSession`'s "must reference a group on this phone"), `ALREADY_SAVED` (`discard` resolved `false`).

    Inside **one** `handle.withTransaction(txn => ...)`: the authority check; read `reading_level` for the present children; `buildLessonRecord`; `sessions.saveSession(session, { transaction })`; `children.updateChild` only for `readingLevelChanges` whose value differs from the stored one; one batched `mastery.getCorrectionTimes({ childIds, language, transaction })`, then **skip** any tracker change whose `madeAt` is older than the stored row's `changed_at`, whatever its sync status, terminal included (so a newer refused correction and its retry payload stay as they are) (a newer correction already on the phone, including another EA's pulled one, wins, as the server would decide); `mastery.setLetterMastery({ childId, letter, language: change.languageCode, confirmed: change.mastered, changedAt: change.madeAt, programmeId: draft.programme_id, transaction })` for the rest; `lessonDrafts.discard(draft.id, { transaction })` last.

- [ ] **Step 1: Write the failing tests.** `lessonRecord.test.js` (pure):

```js
test('activities match spec §6 key for key', () => {
  const { session } = buildLessonRecord({ draft: mondayDraft, userId: 'ea', currentLevels: { c1: '2 Letter Blends', c2: '3 Letter Blends' }, sessionTypeFields: { session_type_id: 'st' }, nowIso: WED });
  expect(Object.keys(session.activities.lesson)).toEqual(['version','pack_id','language','plan','blend_tier_shown','blends_done','books_read','tracker_check']);
  expect(session.session_date).toBe('2026-10-19');
  expect(session.activities.lesson.plan.made_on).toBe('2026-10-19');
});
test('a changed date drops the plan with plan_reason past_date', ...);
test('a backdated lesson keeps the default tier that was on screen', ...);      // blend_tier_shown === draft.plan.blend_tier, plan null
test('a backdated lesson keeps an explicitly chosen higher tier', ...);
test('only present children are attendees and get levels, marks and reading-level changes', ...);
test('no letters and no blends: letters_focused [] and session_reading_level null', ...);
test('session_reading_level is the highest tier among blends ticked, top-up items at their own tier', ...);
test('tracker_check: marked, none (every present child "No one new yet"), null', ...);
```

`lessonSave.test.js` (copy `literacySessionPersistence.test.js`'s setup):

```js
test('session, attendees with the group id, class id, marks and outbox commit, and the draft is gone', ...);
test('a failed save keeps the draft and its session id; the retry inserts once with that id', ...); // trigger abort on sync_outbox insert, then drop it and retry
test('an untouched old draft leaves a newer pulled reading level alone and snapshots it', ...);
test('a Monday mark saved on Wednesday keeps its tap time when nothing newer is stored', ...);
test('no present children: NO_CHILDREN and nothing written', ...);
test('group row gone from the phone: GROUP_MISSING, nothing written, draft kept', ...);
test('an archived group still takes the lesson', ...);
test('a present child with no direct, class or group access: CHILD_NOT_WRITABLE, nothing written, draft kept', ...);
test('direct assignment ended but class access remains: attendance saves; marks for them give CHANGES_NOT_WRITABLE', ...);
test('the same child with marks and level change cleared: the lesson saves with them as an attendee', ...);
test('access removed after the screen check but before the writer lock: Save rolls back, draft kept', ...);
// real handle: hold a roster transaction, let a pre-check read the old grants, commit the removal, then save
test('a newer pulled correction (synced) beats an older draft mark; a newer unsent one too', ...);
// assert local letter_mastery value and loadKnownLetters before any sync
test('a newer terminal correction and its outbox payload are unchanged after saving an older draft mark', ...);
test('T0 accepted, T1 draft mark, T2 refused, a pull restores T0: saving the draft leaves T2\'s payload and terminal status unchanged', ...);
test('getWriteAuthority matches the server rules for each of the three grant kinds and ended rows', ...);
test('direct assignment ended, class or group access remains: a reading-level change still saves', ...);
test('an old-programme draft whose staff assignment ended: PROGRAMME_NOT_ACTIVE, nothing written, draft kept', ...);
test('discard finds no draft: ALREADY_SAVED and nothing written', ...);
```

Add a `saveLesson` case to `completionPathBudget.test.js` (10 attendees, group set: the existing 22 writes + 1 group read + the draft delete; one keyed read per mark) and retarget `foreignKeyEnforcement.test.js`'s positive capture flow to `saveLesson`.
- [ ] **Step 2:** Run `npx jest __tests__/lessonRecord.test.js` and `npm run test:integration -- __tests__/lessonSave.test.js __tests__/completionPathBudget.test.js __tests__/foreignKeyEnforcement.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. Build the repositories inside `saveLesson` from the factories with `database: handle`, as `persistLiteracySession` does.
- [ ] **Step 4:** Rerun Step 2 plus `npm run test:integration -- __tests__/sessionGroupSync.test.js __tests__/sessionsRepository.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(lesson): save a lesson in one transaction and delete its draft`.

---

### Task 5: Lesson draft state and the draft controller

**Files:**
- Create: `src/lessonPlan/lessonDraftState.js`, `src/services/lessonDraftController.js`, `src/hooks/useLessonDraft.js`
- Modify: `src/session/handleServices.js` (create one controller per handle, `handle.services.lessonDraft`)
- Test: `__tests__/lessonDraftState.test.js` (unit), `__tests__/lessonDraftController.test.js` (real SQLite with a delaying adapter; add to integration config), `__tests__/useLessonDraft.test.js` (renderHook on the default real test handle), `__tests__/handleServices.test.js` (service key list)

**Why a controller:** the Lesson screen and Wrap up both edit the same draft, and `lessonDrafts.update` replaces whole JSON fields with no revision check (`lessonDraftsRepository.js:206-218`). A queue per screen lets one screen write a stale copy over the other's newer edit. So exactly one object per signed-in EA writes the draft, and both screens and Save go through it.

**Interfaces:**
- Consumes: Task 2 `loadLessonBase`, `loadLessonInput`; engine `computeLessonPlan`, `computeLessonChoices`, `isPlanRecomputable`, `resolveLessonClass`; `lessonDrafts` repository and its errors.
- Produces:
  - Pure, in `lessonDraftState.js`: `newLessonDraftInput({ group, members, programmeId, classId, languageCode, packId, lessonDate }) -> createInput`, with `programmeId = group.programme_id ?? base.programmeId` and `lessonDate = useProgrammeTodayKey()` at start; and transitions `(draft, ...args) -> patch`: `toggleAbsent(draft, childId)`, `addChildForToday(draft, childId)`, `removeChildForToday(draft, childId)`, `toggleTick(draft, kind /* 'letters'|'blends' */, value, { plan, nowIso })`, `toggleBookRead(draft, bookId, { plan, nowIso })`, `setBlendTierShown(draft, tier)`, `setTrackerChanges(draft, childId, changes)` (replaces that child's map with the tracker sheet's whole pending map, which drops undone letters; an empty map removes the child's entry), `toggleNoOneNew(draft, childId)` (clears that child's marks for today's letters), `setReadingLevel(draft, childId, level, currentLevel)` (equal to the current level removes the change), `setLessonDate(draft, dateKey)`, `setNotes(draft, text)`, `clearChildChanges(draft, childId)` (removes that child's tracker changes, reading-level change and No one new yet), `chooseClass(draft, { classId, languageCode, packId, plan })`, `chooseLanguage(draft, { languageCode, packId, plan })`, `setPlan(draft, plan)`. A first tick of a letter, blend or book adds `{ plan, plan_fixed_at: nowIso }` to its patch when `plan_fixed_at` is null.
  - `createLessonDraftController({ repositories, onClose }) -> controller` (state in the closure, never module scope), built once per handle in `createHandleServices` and exposed as `handle.services.lessonDraft`. It registers `handle.onClose` to dispose itself: pending work is dropped, waiting callers reject with `StaleActorError`, and nothing is written after close. Its rules:
    - **One queue for everything.** `open`, `create`, every edit, `discard` and the save hand-off run in order on one queue. A **generation** number increases on every identity change (opening another draft, create, discard, clear, close); any load or write that settles under an older generation is ignored.
    - **The controller is the authority while it holds a draft.** It keeps `persisted` (the last successfully written row) and a list of **pending transitions**. What subscribers see is `persisted` with the pending transitions applied in order.
    - `open({ draftId } | { start: {...} })`: if it already holds that draft (or that unsaved start), it **attaches**: it returns the current view and never reloads from SQLite, so a second screen can never publish an older copy. Otherwise it loads (or holds the unsaved start in memory). Opening writes nothing.
    - `apply(transition, ...args) -> Promise<Draft>`: records the transition with its arguments (tap times are taken at apply time), publishes the new view at once, and queues one write. Each write computes its patch **at write time** from `persisted`, so it never builds on another write's unconfirmed result. The first write of an unsaved draft is a `create` with the patch folded in. On failure the transition is dropped, the rest still apply against `persisted`, the view is republished, and `error` is set ("Couldn't save your last change.").
    - `subscribe(listener) -> unsubscribe`; `getSnapshot() -> { status, draft, error, existingDraftId }`.
    - `ensureDraft() -> Promise<Draft>` (creates the unsaved draft, for **Wrap up →**).
    - `beginSave() -> Promise<Draft>`: stops new `apply` calls (they reject with `LessonDraftBusyError`) and waits for the queue. If **any** transition queued before it failed, it rejects with `LessonDraftWriteError`, reopens edits and keeps the draft, so the EA sees what was lost before saving. Otherwise it resolves `persisted`. `endSave({ saved })`: `saved: true` clears the controller; otherwise reopens edits.
    - `discard() -> Promise<void>`: queued after pending writes; `lessonDrafts.discard(id)`, then clears.
    - `status`: `'empty' | 'loading' | 'unsaved' | 'ready' | 'corrupt' | 'exists' | 'missing' | 'saving' | 'closed'`. `LessonDraftExistsError` on create gives `'exists'` with `existingDraftId`; `LessonDraftCorruptError` gives `'corrupt'` with the id.
  - `useLessonDraft({ draftId, start }) -> { status, draft, plan, choices, lessonInput, needs: null|'class'|'language', apply, ensureDraft, beginSave, endSave, discard, error }`: subscribes to `handle.services.lessonDraft` (both screens see the same draft), loads inputs with Task 2, and computes `plan`/`choices` memoised on `(pack id, present ids, plan)`. It recomputes the plan, and applies `setPlan`, only while `isPlanRecomputable({ lessonDate: draft.lesson_date, today, frozen: !!draft.plan_fixed_at })` and the present children changed. `needs` is `'class'` for a mixed-class group with no class chosen and `'language'` for a class with no language (P6); `chooseClass`/`chooseLanguage` store the plan in the same patch, and ticks and `ensureDraft()` are refused while `needs` is set, so a draft never reaches Save without a plan.

- [ ] **Step 1: Write the failing tests.** `lessonDraftState.test.js` (pure, one test per transition, plus):

```js
test('the first tick freezes the plan; later ticks do not touch it', ...);
test('marking a child absent never changes membership or added children', ...);
test('No one new yet clears that child\'s marks for today\'s letters, and a later mark clears No one new yet', ...);
test('choosing the current level removes the reading-level change', ...);
```

`lessonDraftController.test.js` (real SQLite; wrap the database so every `runAsync` waits on a test-controlled promise, to model a slow A03s):

```js
test('opening a new lesson writes nothing', ...);              // lesson_drafts count stays 0
test('the first change creates the draft', ...);
test('rapid changes persist in order', ...);                   // 10 applies without awaiting; one row holding all 10
test('cross-screen edits persist in order', ...);              // Lesson ticks, Wrap-up noOneNew, Lesson tick again, all queued while writes are held; final row has all of them
test('a second screen opening the draft while a write is held attaches and sees the pending edits', ...);
test('a load that settles after discard or after the handle closes changes nothing', ...);
test('save waits for queued edits and refuses new ones', ...); // beginSave resolves only after held writes land; apply during saving rejects LessonDraftBusyError
test('a failed write drops only that change; later queued changes still land', ...);
test('an edit that fails after Save is pressed stops the save: no session, no attendees, draft kept', ...);
test('a failed save reopens edits; a successful save clears the controller', ...);
test('after the handle closes, apply and beginSave reject and nothing is written', ...);
test('a corrupt draft gives corrupt and discard deletes it', ...);
test('a second start while a draft exists gives exists with its id', ...);
```

`useLessonDraft.test.js`:

```js
test('attendance before the first tick recomputes the plan; after it, it does not', ...);
test('a different day never recomputes, frozen or not', ...);  // jest.setSystemTime
test('a mixed-class group needs a class; choosing stores class, language, pack and plan', ...);
test('a class with no language needs a language (P6)', ...);
test('engine functions run once per change', ...);             // jest.spyOn on the engine module
test('two mounted hook instances on one draft see the same draft, including a held edit', ...);
```

- [ ] **Step 2:** Run `npx jest __tests__/lessonDraftState.test.js __tests__/useLessonDraft.test.js` and `npm run test:integration -- __tests__/lessonDraftController.test.js __tests__/handleServices.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Rerun Step 2 plus `npx jest __tests__/historyPullTriggerBudget.test.js __tests__/productionBindingStatic.test.js __tests__/moduleStateAllowlist.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(lesson): one draft controller per EA and the lesson hook`.

---

### Task 6: Who are you teaching?

**Files:**
- Create: `src/screens/lessons/LessonPickerScreen.js`, `src/components/lessons/UpNextCard.js`, `GroupLessonRow.js`, `MakeGroupSheet.js`, `PutInGroupSheet.js`, `src/utils/lessonDates.js`
- Modify: `src/screens/sessions/SessionFormScreen.js:22-24`, `src/navigation/AppNavigator.js:236-243`
- Test: `__tests__/LessonPickerScreen.test.js`, `__tests__/lessonDates.test.js`, `__tests__/SessionFormScreen.test.js`, `__tests__/task5AuthRaces.test.js` (mock path), `__tests__/AppNavigator.headers.test.js`

**Interfaces:**
- Consumes: Task 2 `loadLessonBase`, `loadPickerModel`; Task 3 `makeGroup`, `addChildToGroup`; `lessonDrafts.getActive`.
- Produces:
  - `lastSeenLabel(lastSeenOn, today) -> string` (P9) and `startedLabel(lessonDate, today) -> string|null` ("Started Mon 19 Oct", or null for today) in `lessonDates.js`, using `formatSessionDate` / `WEEKDAY_SHORT`-style names from `sessionDateFormat.js`.
  - Navigation: `navigate('Lesson', { groupId, upNextGroupId })` from a row or **Start lesson**; `replace('Lesson', { draftId })` when a draft exists.
  - `SessionForm` options become `{ title: 'Who are you teaching?', headerLeftIcon: 'close' }` (P1).

Screen behaviour (spec §5.1):
- On focus, read `lessonDrafts.getActive()`. A draft, or `LessonDraftCorruptError` (use its `draftId`), replaces this screen with `Lesson` (C7).
- **Up next** card: children's names (large); "Not seen since {lastSeenLabel} · letters {nextLetters joined by spaces}" (or "Not seen yet · letters …"); **Start lesson**.
- **Other groups**: one `GroupLessonRow` per remaining row: names, last seen, next letters, group dot. "Today ✓" rows stay tappable.
- **+ Make a group** row opens `MakeGroupSheet` (multi-select of ungrouped children with `SelectableRow variant="checkbox"`, **Done** calls `makeGroup`, disabled until one is chosen). **Not in a group yet** lists ungrouped children, each with **Put in a group**, which opens `PutInGroupSheet` (existing groups with their names, plus "New group"). Both sheets show failures with `InlineNote`, never `Alert`.
- An EA with no groups sees only the make-a-group row and the ungrouped list. An EA with no children sees `EmptyState` ("No children yet", "Add children to a class to start lessons.").
- "Still downloading past lessons. Suggestions may repeat." shows above the list when `historyComplete` is false.
- Reloads when `useSessionHistoryStatus()` `pageVersion`/`runVersion` change (copy `SessionHistoryScreen.js:44,95`).

- [ ] **Step 1: Write the failing tests.** `lessonDates.test.js`: today, yesterday's weekday, 6 days ago, 7 days ago, never. `LessonPickerScreen.test.js` (render through `renderInTestStack` with `Lesson` stub routes and mocked `useChildren`; default real handle):

```js
test('Up next shows the top-ranked group with its letters and Start lesson opens it', ...);
// expect(screen.routeNames()).toEqual([...,'Lesson']); params { groupId: 'g2', upNextGroupId: 'g2' }
test('other groups follow the ranking; a group taught today reads Today ✓', ...);
test('a lesson in progress replaces the picker with that lesson', ...);
test('a corrupt draft still opens the Lesson route with its id', ...);
test('Make a group lists only ungrouped children and creates the group', ...);
test('Put in a group adds the child to the chosen group', ...);
test('incomplete history shows the downloading note', ...);
test('the picker computes the ranking once per load', ...);       // spy on rankGroups
test('no groups: only Make a group and the ungrouped list', ...);
```

`SessionFormScreen.test.js` and `task5AuthRaces.test.js`: mock `../src/screens/lessons/LessonPickerScreen` instead of the old form; a literacy coach sees the picker; other roles still see "coming soon". `AppNavigator.headers.test.js`: the `SessionForm` options pin becomes `{ title: 'Who are you teaching?', headerLeftIcon: 'close' }`.
- [ ] **Step 2:** Run `npx jest __tests__/lessonDates.test.js __tests__/LessonPickerScreen.test.js __tests__/SessionFormScreen.test.js __tests__/AppNavigator.headers.test.js` and `npm run test:integration -- __tests__/task5AuthRaces.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Rerun Step 2 plus `npx jest __tests__/designSystemGuard.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(lesson): Who are you teaching? behind + Record`.

---

### Task 7: Lesson screen: header, who's here, letters

**Files:**
- Create: `src/screens/lessons/LessonScreen.js`, `src/components/lessons/AttendanceChips.js`, `AddChildSheet.js`, `LessonLettersSection.js`, `OtherLetterSheet.js`, `LessonChoiceSheet.js`, `InProgressSheet.js`
- Modify: `src/navigation/AppNavigator.js` (register `Lesson`: `{ title: '', headerLeftIcon: 'back' }`; the screen sets the title to the children's names with `navigation.setOptions`)
- Test: `__tests__/LessonScreen.test.js`, `__tests__/AppNavigator.headers.test.js`

**Interfaces:**
- Consumes: Task 5 `useLessonDraft`; Task 6 `lastSeenLabel`.
- Produces: route `Lesson` with params `{ draftId }` or `{ groupId, upNextGroupId }`; `navigate('LessonWrapUp', { draftId })` from the footer (after `ensureDraft()`).

Screen behaviour (spec §5.2):
- **Header** (in the scroll, under the stack title): "Gr {grade} · {Language} · last seen {label}". `needs_class`: `LessonChoiceSheet` asks "Which class is this lesson for?" with the group's classes, before suggestions show (C18). `needs_language`: the same sheet asks "Which language is this lesson in?" (P6).
- **Who's here**: one `AttendanceChips` chip per child, present by default, tap to mark absent ("{name}, here" / "{name}, absent"). Names come from `children.getChildrenByIds`. A child whose `getWriteAuthority(...).attend` is false shows "No longer one of your children" and **Remove from lesson** (marks them absent), so Save rarely meets `CHILD_NOT_WRITABLE`; Save still rechecks inside its transaction. **+ Add a child** opens `AddChildSheet`: roster children not in this lesson; a pick adds them for today.
- **1 · Letters · 15 min**: suggested letters as `LetterToggleTile`s, **not** pre-ticked; letters ticked from elsewhere appear after them; **+** opens `OtherLetterSheet` (a `LetterToggleGrid` of `choices.letterChoices`). "Review: {review letters}" below. Reasons: `first_session` adds "First lesson: start with these letters."; `all_letters_known` shows "All letters known"; `no_pack` shows "Choose the letters you teach" and the grid inline; `no_children` shows "Mark at least one child as here." An isiZulu lesson shows "No isiZulu letters yet." (P6).
- "Still downloading past lessons…" / "Still downloading what children know…" notes when `plan.history_complete` / `plan.mastery_complete` is false.
- **Discard lesson** (tertiary, bottom of the scroll) opens `ConfirmSheet` "Discard this lesson?" / "Its ticks and notes will be deleted." / **Discard lesson** / **Keep lesson** (P4). Shown only once a draft exists.
- `corrupt`: `EmptyState` "This lesson can't be opened" with **Discard lesson**. `exists`: `InProgressSheet` "You have a lesson in progress" with **Go to that lesson** (replace with its `draftId`) and **Discard it and start this one**. `missing` (draft id no longer stored): go back.
- **Leave warning (P4):** `usePreventRemove(guard, ...)` with `guard = status === 'ready'` (a stored draft exists and is not being saved, discarded or closed; `'unsaved'` means no change yet, so nothing to keep). It stores the blocked action and opens `ConfirmSheet` "Leave this lesson?" / "It's saved on this phone. You can finish it later from Home." / **Leave lesson** (`confirmVariant="secondary"`) / **Keep teaching**; **Leave lesson** dispatches the stored action. Pushing `LessonWrapUp` does not trigger it (nothing is removed). A successful save clears the controller **before** Wrap up replaces itself with Session complete, so Session complete's `popTo('MainTabs')` removes the Lesson screen without the sheet (the old form's effect-order rule, `LiteracySessionForm.js:241-254`). Every change goes through `apply`.

- [ ] **Step 1: Write the failing tests** (`renderInTestStack` with routes `[Home stub, Lesson, LessonWrapUp stub]`, default real handle, seeded group and pack fixture via the real `getPack`):

```js
test('header shows grade, language and last seen; the title is the children\'s names', ...);
test('suggested letters are not pre-ticked; ticking one stores it and freezes the plan', ...);
test('marking a child absent before any tick changes the suggestions', ...);
test('after a tick, marking a child absent keeps the plan', ...);
test('+ Add a child adds a roster child for today only', ...);  // membership rows unchanged
test('a handed-over child can be removed from the lesson', ...); // resumed draft; child's assignment ended; Remove marks them absent
test('a mixed-class group asks for the class before suggestions', ...);
test('a class with no language asks for the language', ...);
test('Discard lesson asks first, then deletes the draft and goes back', ...);
test('leaving after a change asks first; Keep teaching stays; Leave lesson leaves and keeps the draft', ...); // header Close and Android back (BackHandler) both
test('leaving before any change asks nothing', ...);
test('going to Wrap up and back never asks', ...);
test('after a save, Done on Session complete returns Home without the leave sheet', ...);
test('after Discard lesson, no leave sheet', ...);
test('a corrupt draft shows the cannot-open state with Discard', ...);
test('an existing draft on a new start offers Go to that lesson', ...);
test('one engine evaluation per attendance change', ...);
test('at 1.3x text the header and chips wrap without clipping', ...); // useWindowDimensions fontScale 1.3
```

`AppNavigator.headers.test.js`: add `Lesson` to the visible-header table.
- [ ] **Step 2:** Run `npx jest __tests__/LessonScreen.test.js __tests__/AppNavigator.headers.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Rerun Step 2 plus `npx jest __tests__/designSystemGuard.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(lesson): Lesson screen with attendance and letters`.

---

### Task 8: Lesson screen: blending and pair reading

**Files:**
- Create: `src/components/lessons/BlendTile.js`, `LessonBlendSection.js`, `BlendPoolSheet.js`, `LessonBookSection.js`
- Modify: `src/screens/lessons/LessonScreen.js`, `src/constants/typography.js` (add `typeRoles.lessonItem = { fontFamily: fontFamilies.content, fontSize: 20, lineHeight: 26, letterSpacing: 0 }`), `documentation/design-system.md` (role table and Forms section)
- Test: `__tests__/BlendTile.test.js`, `__tests__/LessonScreen.test.js`, `__tests__/typography.test.js`

**Interfaces:**
- Consumes: `choices.tiers`, `choices.books`, `choices.contentAvailable` from `useLessonDraft`.
- Produces: `BlendTile({ text, display, tone: 'rest'|'selected', onPress, accessibilityLabel })`: min height 56, width grows with its text and wraps at 1.3x, `typeRoles.lessonItem`, `maxFontSizeMultiplier={1.3}`, the `LetterToggleTile` press and colour rules. Spoken label "{text without hyphens}, ticked|not ticked".

Screen behaviour (spec §5.2, §4.6, §4.7):
- **2 · Blending · 15 min · {tier}**: `tiers[0].suggested` as `BlendTile`s showing `display` (syllable hyphens), not pre-ticked. **+ more** opens `BlendPoolSheet` with `pool`, ticked items first. When `tiers.length > 1`: "Show {tier} ({names} is|are ahead)" switches to that tier and stores `ticks.blendTierShown`. `contentAvailable.blends` false: "No blends for {Language} yet." (P11).
- **3 · Pair reading · 5 min**: the suggested book (title, "Step {n}") with a **Read** tick that stores `{ id, how: 'printed' }`. Hidden when the class grade is `ECD` (C8). `contentAvailable.books` false: "No books for {Language} yet." **Open in app** and **Other book** come with the in-app reader plan.
- Footer: `StickyActionFooter` with **Wrap up →**, disabled while the class or language is being chosen.

- [ ] **Step 1: Write the failing tests.** `BlendTile.test.js` (copy `LetterToggleTile`/`LetterToggleGrid` tests): tones, wrapping at 1.3x, spoken label without hyphens, reduced motion. `LessonScreen.test.js` (preview pack via `jest.mock('expo-updates', () => ({ channel: null }))` and the preview flag, as `contentDiagnostics.test.js:1-3`):

```js
test('six suggested blends show with hyphens and are not pre-ticked', ...);
test('ticking a blend from + more stores its pack text', ...);
test('Show 3-letter switches tiers and stores blendTierShown', ...);
test('the Read tick stores the book as printed', ...);
test('an ECD class has no pair-reading section', ...);
test('a letters-only release pack says no blends and no books yet', ...);
test('Wrap up creates the draft if needed and opens Wrap up', ...);
```

`typography.test.js`: pin `lessonItem` (family `Andika_400Regular`, 20/26).
- [ ] **Step 2:** Run `npx jest __tests__/BlendTile.test.js __tests__/LessonScreen.test.js __tests__/typography.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Rerun Step 2 plus `npx jest __tests__/designSystemGuard.test.js __tests__/colors.test.js`. Expected: PASS, with no new colour token.
- [ ] **Step 5: Commit** `feat(lesson): blending and pair reading on the Lesson screen`.

---

### Task 9: Wrap up and save

**Files:**
- Create: `src/screens/lessons/LessonWrapUpScreen.js`, `src/components/lessons/WrapUpChildRow.js`
- Modify: `src/navigation/AppNavigator.js` (register `LessonWrapUp`: `{ title: 'Wrap up', headerLeftIcon: 'back' }`), `src/constants/literacyConstants.js` (export `READING_LEVEL_OPTIONS`), `__tests__/domainTextInputAudit.test.js` (point at the Wrap-up notes field)
- Test: `__tests__/LessonWrapUpScreen.test.js` (unit), `__tests__/LessonWrapUp.save.test.js` (real handle; add to integration config), `__tests__/AppNavigator.headers.test.js`

**Interfaces:**
- Consumes: Task 4 `saveLesson`, `LessonSaveError`; Task 5 `useLessonDraft`; `loadMasteryState`; `LetterTrackerBottomSheet`; `countMastered`; `buildSessionCompleteParams`; `buildSessionTypeFields` with `useLookupsContext().jobTitles`.
- Produces: the save sequence `snapshot = await beginSave()` → `saveLesson({ handle, draft: snapshot, sessionTypeFields })` → `endSave({ saved })`; on success `refreshFromCache()` from `useChildren()` (so the next lesson sees today's reading-level changes, even offline), then `navigation.replace('SessionComplete', { ...buildSessionCompleteParams({ selectedChildren: presentChildren, selectedLetters: snapshot.ticks.letters, sessionReadingLevel, sessionDateKey: snapshot.lesson_date }), languageCode: snapshot.language_code })` (P12), then `triggerBackgroundSync?.()` and `refreshSyncStatus()` from `useOffline()`.

Screen behaviour (spec §5.3):
- "Who knows **{ticked letters}** without help?" and "Teaching it today doesn't count." Skipped when no letter was ticked.
- For each present child, `getWriteAuthority` decides what Wrap up offers: `deliver` false hides the letter chips, No one new yet and the tracker opener ("Letters can't be updated for this child"); `level` false hides the reading-level pill. Attendance still saves.
- Per present child, `WrapUpChildRow`: one chip per ticked letter (locked and unpressable when assessment-mastered; shown as already known when confirmed before); a tap records `{ mastered: true, languageCode: draft.language_code, madeAt: new Date().toISOString() }`, a second tap removes it; **No one new yet**; the reading-level pill (current level or the EA's change; opens a `SelectSheet` of `READING_LEVEL_OPTIONS`); "{n}/26 ›" opens `LetterTrackerBottomSheet` with `languageCode: draft.language_code` and that child's `tracker_changes` (hidden when the lesson's language has no letter order, such as isiZulu). Marks from the chips and the sheet share `tracker_changes`.
- **Date**: `SelectField` showing "Today" or `startedLabel` ("Started Mon 19 Oct"); the sheet is `MonthCalendar` (no future dates). A change calls `setLessonDate`.
- **Notes (optional)**: `TextField multiline` with placeholder "Add session notes…" and `{...NO_TEXT_SUGGESTIONS}`.
- **Save session** in `StickyActionFooter hideOnKeyboard`. Disabled only when no child is present ("Mark at least one child as here."). With no letters, blends or book ticked, a `ConfirmSheet` (`confirmVariant="primary"`) asks "Save without letters, blends or a book?" / **Save session** / **Go back**. A second press while saving does nothing (ref guard).
- Errors, in an assertive `InlineNote` above the button, draft and session id kept: `GROUP_MISSING` → "This group is no longer on this phone. Discard this lesson to start again."; `CHILD_NOT_WRITABLE` → "{names} {is|are} no longer one of your children. Go back and remove them from the lesson."; `CHANGES_NOT_WRITABLE` → "You can't update {names}'s letters or reading level any more." with **Clear their changes** (removes only the changes that check refused: tracker changes when `deliver` is false, the reading-level change when `level` is false); `PROGRAMME_NOT_ACTIVE` → "This lesson is for a programme you're no longer assigned to. Discard it to start again."; `LessonDraftWriteError` → "Couldn't save your last change. Check the lesson and press Save again."; `ALREADY_SAVED` → "This lesson was already saved." and a **Done** button to Home; anything else → "Couldn't save the lesson. Try again."

- [ ] **Step 1: Write the failing tests.** `LessonWrapUpScreen.test.js`:

```js
test('the heading names the ticked letters; no ticked letters skips the section', ...);
test('a chip records a mark in the lesson language with the tap time', ...);
test('an assessment-mastered letter is locked', ...);
test('No one new yet clears the child\'s chips', ...);
test('the tracker sheet opens in the lesson language with the child\'s marks', ...);
test('a reading level back to the current one removes the change', ...);
test('resumed lesson shows its start date', ...);              // 'Started Mon 19 Oct'
test('empty lesson asks before saving', ...);
test('no child present disables Save with the reason', ...);
test('a double press saves once', ...);
```

`LessonWrapUp.save.test.js` (copy `LiteracySessionForm.submit.test.js`'s real handle and `SignedInEAContext.Provider` setup):

```js
test('Save writes one session for the group and opens Session complete with the language', ...);
test('a failed save keeps the draft; the retry saves with the same session id', ...); // jest.spyOn(writer, 'runAsync') throwing on attendees
test('group gone from the phone shows the discard message and keeps the draft', ...);
test('an edit made just before Save is in the saved session', ...);   // held write, then Save: beginSave drains it first
test('CHANGES_NOT_WRITABLE offers Clear their changes, and the save then succeeds', ...);
test('after an offline save, the next lesson sees the new reading level', ...);
```

- [ ] **Step 2:** Run `npx jest __tests__/LessonWrapUpScreen.test.js __tests__/AppNavigator.headers.test.js __tests__/domainTextInputAudit.test.js` and `npm run test:integration -- __tests__/LessonWrapUp.save.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Rerun Step 2 plus `npx jest __tests__/designSystemGuard.test.js __tests__/screenTimerAudit.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(lesson): Wrap up saves the lesson`.

---

### Task 10: Home: Lesson in progress

**Files:**
- Modify: `src/screens/main/HomeScreen.js:38-136`
- Delete: the static guard at `__tests__/homeAttention.test.js:54-57` and its now-unused `fs`/`path` imports
- Test: `__tests__/HomeScreen.test.js`, `__tests__/homeAttention.test.js`

**Interfaces:**
- Consumes: `lessonDrafts.getActive`, `lessonInProgressFromDraft`, `deriveHomeAttentionItems({ lessonInProgress })` (all built in wave 1).

Do exactly the wave-1 hand-off (`docs/superpowers/plans/2026-10-20-lesson-plan-c1-lesson-draft.md`, Task 5 hand-off; line numbers there are stale, verify against the code):
- Take `lessonDrafts` from `repositories`; keep `lessonDraft` state. Inside `loadStats`, read `getActive()` **isolated** from the stats `Promise.all`: its failure never sets `statsFailed`, a stats failure never clears the card, apply only when `seq === loadSeqRef.current`, ignore `StaleActorError`, otherwise `console.error('Error loading lesson in progress:', error)` and keep the previous value. Add `lessonDrafts` to the `loadStats` deps.
- `LessonDraftCorruptError`: pass `{ draftId: error.draftId, childNames: [] }` directly.
- Pass `lessonInProgress` into `deriveHomeAttentionItems`; add `lessonDraft` and `childrenList` to that memo's deps.
- `openItem`: `item.params ? navigation.navigate(item.route, item.params) : navigation.navigate(item.route)` (keeps the arity-exact `SyncStatus` test).
- Resume opens the lesson directly (P5).

- [ ] **Step 1: Write the failing tests** in `HomeScreen.test.js`:

```js
test('a lesson in progress is the first card and resumes with its draft id', ...); // navigate('Lesson', { draftId })
test('a failed draft read leaves the stats and other cards alone', ...);
test('a stats failure keeps the lesson card', ...);
test('a draft read that settles after the stats still shows the card', ...);   // deferred promise
test('a corrupt draft still shows Resume', ...);
test('the sync card still navigates with no params', ...);
```

- [ ] **Step 2:** Run `npx jest __tests__/HomeScreen.test.js __tests__/homeAttention.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement and delete the guard.
- [ ] **Step 4:** Rerun Step 2. Expected: PASS.
- [ ] **Step 5: Commit** `feat(home): Lesson in progress resumes the lesson`.

---

### Task 11: Retire the old Record form

**Files:**
- Delete: `src/screens/sessions/LiteracySessionForm.js`, `src/components/children/ChildSelector.js`, `src/utils/literacySessionValidation.js`, `src/services/literacySessionPersistence.js`, and any module whose only importer was one of these (check with `grep -rn` before deleting each; keep anything else imports)
- Delete tests: `__tests__/LiteracySessionForm.test.js`, `__tests__/LiteracySessionForm.submit.test.js`, `__tests__/ChildSelector.renderCount.test.js`, `__tests__/literacySessionValidation.test.js`, `__tests__/literacySessionPersistence.test.js` (its cases are covered by `lessonSave.test.js`; move any that are not)
- Modify: `jest.integration.config.js` (drop deleted suites), `__tests__/historyPullTriggerBudget.test.js` (replace the `literacySessionPersistence.js` path with `lessonSave.js`), `__tests__/moduleStateAllowlist.test.js` if it lists a deleted file

- [ ] **Step 1:** Before deleting, list each old test's invariants and confirm a new test covers it: one session per double press (Task 9); failed save keeps the id (Tasks 4, 9); marks keep language and tap time (Tasks 4, 9); the midnight date rule (Tasks 5, 9); 1.3x layout (Tasks 7, 9); no Snackbar (`designSystemGuard`). Add any missing case to the new suites first.
- [ ] **Step 2:** Delete the files; run `grep -rn "LiteracySessionForm\|ChildSelector\|literacySessionPersistence\|literacySessionValidation" src __tests__ test-support jest*.js`. Expected: no matches except build-log or docs.
- [ ] **Step 3:** Run the full gate: `npm test -- --silent`, `npm run test:integration`, `npm run test:types`. Expected: all pass.
- [ ] **Step 4: Commit** `refactor(sessions): retire the old Record form`.

---

### Task 12: Docs, review and device check

**Files:**
- Modify: `CONTEXT.md` (Lesson, Lesson screen, Wrap up, Up next, Lesson in progress; capture is group-first; the C1 "inert until C3" line at ~:287), `PRD.md` (capture section), `documentation/group-session-workflow.md` (realised by this design; settled decisions: no timer, attendance toggled in capture, past dates via the Wrap-up date; fix the stale "group-first UI remains later work" and "inert until C3" lines), `documentation/rls-sync-contract-map.md` (the lesson save as the producer of `sessions.group_id`, `sessions.class_id` and `activities.lesson`; the draft deleted in the save transaction; changed-only reading levels replacing the literacy-submission row at ~:1629; `createGroupWithMembers`; `children.getWriteAuthority` as the local mirror of `private.current_user_can_write_for_child`, `private.current_user_delivers_to_child` and the children UPDATE policy, and `hasActiveProgrammeAssignment` as the mirror of `sessions_insert_active_programme`, so a change to any of those server rules must change the mirror too; the Home attention paragraph at ~:1680 says `lesson_in_progress` comes from `lesson_drafts`, has no `local_state` key, is first and not dismissible; correct `lesson_drafts` = v17 and `sessions_group_history_reference` = v18), `documentation/design-system.md` (new components, `lessonItem`), `documentation/teaching-quality-analytics.md` (the `lesson` keys; Check 2 skips a null `session_reading_level`), `documentation/open-decisions-backlog.md` (P1–P12), `documentation/ROADMAP.md` (close the C7 resume item at ~:526-531; lesson flow status), `documentation/build-log.md`, `documentation/device-gates-sqlite-backend-2026-07.md` (new section V below).

- [ ] **Step 1:** Update the docs above in this branch (AGENTS.md anti-drift rule). Spec §11 also asks for an ADR, "advice from the children, record with the group": draft it with Jim through `grill-with-docs` before the PR merges.
- [ ] **Step 2:** Codex adversarial review of the whole branch (`--model gpt-6-astra`, `--base origin/main`), focus: the save transaction and draft lifecycle, plan freeze and date rules, the picker's inputs and completeness, and static-guard compliance. Fix and rerun until a round brings no new substantive finding.
- [ ] **Step 3: Device check V (needs Jim's yes for the EAS builds).** Builds: `preview` (letters only) and `preview-content` (isiXhosa blends and a reader) for Android and iOS, from this branch. On the Galaxy A03s (360 dp: `wm density 320`) and an iPhone, at 1.0x and 1.3x text:
  - V1 picker: Up next, other groups, last seen, "Today ✓" after a lesson; rows within 500 ms (screen recording).
  - V2 Make a group and Put in a group; the new group's class; both upload.
  - V3 Lesson screen: attendance toggles within 300 ms; ticks freeze the plan; Add a child; mixed-class and no-language asks; ECD hides pair reading; the leave warning on Close, Android back and the iOS swipe (the native swipe is not covered by Jest).
  - V4 Blends and book on the preview-content build; "No blends/books yet" on `preview`.
  - V5 Wrap up: chips, locked letters, tracker sheet in the lesson language, reading levels, date, notes, empty-lesson confirm.
  - V6 Save offline, then online: one session with the group, attendees, marks; server rows match.
  - V7 Durability: force-quit mid-lesson, airplane-mode relaunch: Home shows "Lesson in progress · {names} · Resume" first, chevron and no ✕; TalkBack/VoiceOver read "Lesson in progress with Amahle and Lulu. Resume"; ticks are back. A lesson started yesterday resumes with "Started {day}" and saves with its date.
  - V8 "+ Record" with a lesson in progress opens it after the gates.
  - Record results in `device-gates-sqlite-backend-2026-07.md` §V and the build log.
- [ ] **Step 4: Commit** `docs: lesson flow (C2–C3)`, then open the PR with the plan calls P1–P12 listed for Jim.

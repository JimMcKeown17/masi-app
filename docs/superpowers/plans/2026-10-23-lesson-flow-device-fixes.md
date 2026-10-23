# Lesson flow device fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, Codex builds (`--model gpt-6.1-sol --effort high`) and Claude reviews the diff, reruns the tests and commits (`AGENTS.md`).

**Goal:** Fix the five bugs and the polish items that the Galaxy A03s run of device section V found on
the lesson flow (build-log "2026-10-23 — Lesson flow device run, Galaxy A03s"), and apply Jim's
answer on Review letters, so that V1 and V3 pass on the next builds.

**Architecture:** No new screens, data or server work. The engine gains a pure pack index that its
callers cache per pack; the lesson hook loads its inputs once per set of participants and derives
the present children synchronously; the Lesson screen takes the picker out of the back history once
the lesson is real; the picker draws its rows before the slower letter reads finish.

**Tech Stack:** React Native 0.81 (Expo 54, Hermes), React Navigation 7 native stack, expo-sqlite /
better-sqlite3 in tests, Jest + React Native Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-20-lesson-plan-design.md` (§4.4 review letters, §4.5,
§5.1–5.3, §7.3 engine purity). Lesson flow plan: `docs/superpowers/plans/2026-10-22-lesson-plan-c2-c3-lesson-flow.md`
(P4 leave warning, P9 last seen). Evidence: `documentation/build-log.md` (A03 run section) and
`documentation/device-gates-sqlite-backend-2026-07.md` §V.

## Before you start

- [ ] Work on `feat/lesson-flow` (draft PR #97). `git status` is clean; HEAD is at or after `10d5751`.
- [ ] Run tests with Node 20: prefix `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH"`.
- [ ] New real-SQLite suites go in `jest.integration.config.js` `testMatch` (an explicit list).

## Global Constraints

- **Static guards stay green:** `lessonPlanEnginePurity.test.js` (no module-level `let`/`Map`/`Set`/`WeakMap`, no clock, no I/O in `src/lessonPlan/engine/`); `designSystemGuard.test.js` (tokens and `typeRoles` only); `productionBindingStatic.test.js` (data only through the signed-in EA handle); `moduleStateAllowlist.test.js` (no new module state in `src/services`, `src/db`, `src/session`); `historyPullTriggerBudget.test.js` (no `assessmentHistory` identifier under `src/components/` or `src/hooks/`).
- **No server change, no migration, no new synced table, no new dependency.**
- **Copy:** unchanged except where a task quotes new copy. New copy goes in the PR's wording list.
- **Jim's Review rule (J24, 2026-10-23):** "We should only be reviewing letters that are known, though if it's the first level, it's harmless to learn and review at the same time."
- **Budgets the device run will check:** picker rows within 500 ms of the screen appearing (V1); attendance redraw within 300 ms with no blank (V3). Both on the Galaxy A03s, build `preview-content`.

## Review Focus

1. **Adding a child for today mid-lesson** while the new child's facts load: no blank, and no tick may freeze a plan that leaves out the added child.
2. **Leaving with the warning from each exit** (header Back, Android back, iOS swipe) on a lesson started from the picker lands on the screen the EA came from before the picker, never on the picker and never back in the lesson. Before the first change, Back still returns to the picker.
3. **A resumed draft whose stored plan predates J24** (engine_version 1) keeps its stored review letters; only new plans use the new rule.
4. **The supplied pack index belongs to a different pack** (pack id or object mismatch): the engine must ignore it and index the pack itself, never mix content.
5. **The picker's letters arrive after an EA has already tapped a row:** the tap starts the lesson normally; the late result must not navigate, re-rank or reset anything.

Each line has its test in the owning task below.

---

### Task 1: Review lists only known letters, plus step 1 (J24)

**Files:**
- Modify: `src/lessonPlan/engine/letters.js` (the `review` value in the final return, lines 115–128)
- Modify: `src/lessonPlan/engine/constants.js` (`ENGINE_VERSION = 2`)
- Modify: `src/lessonPlan/engine/vectors/*.vectors.json` (expected `review`/`review_letters` and `engine_version` of computed plans; frozen input plans keep `engine_version: 1`)
- Modify: `docs/superpowers/specs/2026-10-20-lesson-plan-design.md` (§4.4 Review letters line; add J24 under J23; C3 rationale unchanged; the §6 example stays valid)
- Test: `__tests__/lessonPlanEngine.vectors.test.js` (existing harness), plus the new vectors below

**Interfaces:** `planLetters(...)` keeps its signature and return shape. Only `review` changes:
`review = order.filter(letter => (knownSet.has(letter) || stepOneLetters.includes(letter)) && !suggestedSet.has(letter))`.
`unlocked` is unchanged (C3: blends and books still use the whole step).

- [ ] **Step 1: Add failing vectors** to `letters.vectors.json`, on the isiXhosa interim order `o m l a │ k u │ e n │ …`:
  - `review_excludes_unknown_step_letters`: not a first session; group knows `m l a`; suggested `o k`; expect `review: ["m","l","a"]` (today it is `m l a u`) and `unlocked: ["o","m","l","a","k","u"]`.
  - `review_keeps_step_one_while_learning`: not a first session; group knows nothing; suggested `o m`; expect `review: ["l","a"]` (step-1 letters may be reviewed while they are learnt).
  - `review_keeps_known_letters_beyond_the_step`: group knows `m l a e` (out of order); suggested `o k`; expect `review: ["m","l","a","e"]`.
  - `first_session_review`: first session, group knows `l`; suggested `o m a`; expect `review: ["l"]`.
- [ ] **Step 2:** Run `npx jest __tests__/lessonPlanEngine.vectors.test.js`. Expect the new vectors to fail on `review`.
- [ ] **Step 3:** Implement the `review` line above and bump `ENGINE_VERSION` to 2. Update the existing vectors' expected `review` values and computed plans' `engine_version` (only where the new rule differs; list each changed vector in the commit body).
- [ ] **Step 4:** Add a test in `__tests__/useLessonDraft.test.js`: a resumed draft whose stored plan has `engine_version: 1` and `review_letters: ["m","l","a","u"]`, frozen (`plan_fixed_at` set), renders and saves those stored review letters unchanged.
- [ ] **Step 5:** Spec: §4.4 becomes "**Review letters** = the letters the group knows, plus the step-1 letters, minus today's suggested letters, in teaching order (J24). Letters beyond step 1 are reviewed only once known." Add the J24 row with Jim's quote.
- [ ] **Step 6:** Run the engine suites (`npx jest lessonPlanEngine lessonInputs useLessonDraft`). All pass. Commit `fix(lesson): review only known letters, plus step 1 (J24)`.

### Task 2: Index each content pack once (D3)

**Files:**
- Create: `src/lessonPlan/engine/packIndex.js` (pure)
- Modify: `src/lessonPlan/engine/lessonPlan.js` (`evaluateLesson` uses an index), `blends.js` (`blendChoices` takes the index instead of `pack` + `soundsFor`), `books.js` (`bookChoices` takes the index's reader sounds), `index.js` (export `indexPack`; typedef `LessonInput.packIndex`)
- Create: `src/lessonPlan/inputs/packIndexCache.js` (module-level `WeakMap` keyed by the frozen pack object; allowed: outside the engine and outside the `moduleStateAllowlist` directories)
- Modify: `src/lessonPlan/inputs/lessonInputs.js` (`loadLessonInput` sets `packIndex`)
- Test: `__tests__/lessonPlanPackIndex.test.js`, `__tests__/lessonPlanEngine.vectors.test.js`, `__tests__/lessonPlanEngine.realPacks.test.js`

**Interfaces:**
- `indexPack(pack: object) → PackIndex`, where `PackIndex = { pack, blendTiers: BlendItem[][] /* one array per BLEND_TIERS entry, in blendItems' current order */, blendByNormalized: Map<string, BlendItem>, readers: { [readerId]: { tricky: Set<string>, tokens: { token: string, sounds: string[]|null }[] } } }` and each `BlendItem` gains `normalized: string` and `sounds: string[]|null` (precomputed with `soundsOf`). `BlendItem`'s public fields `{ text, display, tier }` are unchanged in engine output.
- `evaluateLesson` uses `input.packIndex` only when `input.packIndex?.pack === pack` (the resolved `usablePack`); otherwise it calls `indexPack(pack)`. Output is identical either way.
- `packIndexFor(pack: object|null) → PackIndex|null` in `packIndexCache.js`; the same pack object always returns the same index object.

- [ ] **Step 1: Failing tests** in `lessonPlanPackIndex.test.js`:
  - `packIndexFor returns one index per pack`: `packIndexFor(p) === packIndexFor(p)`; `packIndexFor(null) === null`.
  - `the engine uses a supplied index`: build an index for the preview pack, replace its `blendTiers[0]` with a single sentinel item `{ text: 'olo', display: 'o-lo', tier: '2 Letter Blends', normalized: 'olo', sounds: ['o','l','o'] }`; `computeLessonChoices` with that index shows the sentinel in tier 0's pool (proves no re-index).
  - `a mismatched index is ignored` (Review Focus 4): an index built for the English interim pack, passed with the isiXhosa preview pack, gives output deep-equal to no index.
- [ ] **Step 2:** Make `lessonPlanEngine.vectors.test.js` and `realPacks.test.js` run every case twice, with and without `packIndex: indexPack(pack)`, and assert equal output.
- [ ] **Step 3:** Run them; expect failures (no `indexPack`, no `packIndexFor`).
- [ ] **Step 4:** Implement. `blendItems` moves into `indexPack`. `blendChoices` filters `index.blendTiers` by `item.sounds` against `unlocked`, and buckets by `item.sounds` and `item.normalized`; the frozen-plan catalogue reads `index.blendByNormalized`. `bookChoices` reads `index.readers[id]`. No call to `soundsOf`, `normalizeToken` or `tokenizeText` remains on the per-evaluation path for pack content.
- [ ] **Step 5:** Add one assertion to `lessonInputs.test.js`: `loadLessonInput(...)` returns `packIndex === packIndexFor(pack)`.
- [ ] **Step 6:** Measure in Node and record in the commit body: median of 20 runs of `computeLessonPlan` + `computeLessonChoices` on the preview pack with 3 present children, before (≈ 37 ms on Jim's Mac) and after. Expect at least a 10× drop. Do not commit a timing assertion.
- [ ] **Step 7:** Run the engine, purity and inputs suites. Commit `perf(lesson): index each content pack once`.

### Task 3: Attendance changes never blank the lesson (D2, D4)

**Files:**
- Modify: `src/lessonPlan/inputs/lessonInputs.js` (`loadLessonInput` takes `participantChildIds`; returns `participants: ChildInput[]` instead of `presentChildren`)
- Create: `presentLessonInput(input, presentIds) → LessonInput` in `lessonInputs.js` (pure: `{ ...input, presentChildren: presentIds.map(id => byId.get(id)).filter(Boolean) }`, screen order)
- Modify: `src/hooks/useLessonDraft.js`
- Modify: `src/utils/lessonDates.js` (new `lessonHeaderSeenLabel`)
- Modify: `src/screens/lessons/LessonScreen.js` (header text; loading indicator; Wrap up disabled while pending)
- Test: `__tests__/useLessonDraft.test.js`, `__tests__/LessonScreen.test.js`, `__tests__/lessonDates.test.js`, `__tests__/lessonInputs.test.js`

**Behaviour:**
- The hook's load key uses **all participants** (`draft.attendance.childIds`: members plus added, present or absent), not the present children. Marking a child absent or present changes no key and reads nothing: `lessonInput` is derived in a `useMemo` from the loaded input and the present ids, in the same render as the chip.
- Adding a child changes the participant set, so the hook reloads. While that load is in flight the hook reports `inputPending: true` and returns the **last settled** `lessonInput`, `plan` and `choices` (no blank); it must not recompute or persist a plan from the stale input; `assertPlan` throws "Lesson suggestions are still loading."; the screen disables ticks' writes by that throw and disables **Wrap up →**. When the load lands the plan recomputes with the added child (if the plan is not frozen).
- First open (no settled input yet): the plan area shows one centred `ActivityIndicator` where the sections will appear, and the header shows grade and language without the last-seen part.
- Header copy, from `lessonHeaderSeenLabel(lastSeenOn, today)`: `null` → "not seen yet"; today → "seen today"; within 6 days → "last seen Mon"; older → "last seen Mon 12 Oct" (the picker's short date). The header is `Gr 2 · isiXhosa · last seen Mon`, joined with the non-breaking separator from Task 6.

- [ ] **Step 1: Failing tests:**
  - `useLessonDraft`: toggling a child absent and present keeps `lessonInput`, `plan` and `choices` non-null in every render (assert across a render log) and calls `loadLessonInput` exactly once.
  - `useLessonDraft` (Review Focus 1): add a child with `loadLessonInput` held on a deferred promise; during the hold `inputPending === true`, `plan`/`choices` equal the previous ones, `apply(toggleTick, …)` rejects with "Lesson suggestions are still loading." and writes nothing; after resolve the plan's `present_child_ids` includes the added child.
  - `LessonScreen`: while the first load is pending, an `ActivityIndicator` is shown and no text containing "seen" renders; after load the header reads `Gr 1 · isiXhosa · not seen yet` for a never-taught group and `… · seen today` for one taught today.
  - `lessonDates`: the four `lessonHeaderSeenLabel` forms above.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement. Keep the plan memo's existing rules (recompute only before the first tick, on the lesson's own day). Keep `chooseClass`/`chooseLanguage` loading with the new `participantChildIds` argument.
- [ ] **Step 4:** Run `useLessonDraft`, `LessonScreen`, `lessonDates`, `lessonInputs`, `LessonWrapUp*` suites (unit and integration). Commit `fix(lesson): attendance changes redraw at once; header last seen`.

### Task 4: Leaving a kept lesson goes back to where the EA started (D1)

**Files:**
- Modify: `src/screens/lessons/LessonScreen.js`
- Test: `__tests__/LessonFlowNavigation.test.js` (new; real `@react-navigation/native` container and the app's native-stack navigator setup as `AppNavigator.headers.test.js` mounts it, or a minimal native stack with the real `SessionForm`, `Lesson` and a stand-in `MainTabs`)

**Behaviour:** Once the lesson has a draft (`status === 'ready'`) and the route directly below `Lesson`
is the picker (`SessionForm`), the Lesson screen removes that route from the stack with one
`navigation.dispatch(state => CommonActions.reset({ ...state, routes, index }))`, keeping every other
route and key. The Lesson route stays focused with no animation. Before the first change, nothing is
removed and Back returns to the picker. The picker's focus-effect redirect (`LessonPickerScreen.js:54`)
stays for fresh opens (+ Record with a lesson in progress, V8).

- [ ] **Step 1: Failing tests** (Review Focus 2), each starting at `MainTabs` → `SessionForm` (picker) → tap a group → `Lesson`:
  - tick a letter (draft created) → header back → "Leave lesson" → `MainTabs` is focused, the stack is `[MainTabs]`, and the draft still exists.
  - same with a hardware back event (`BackHandler`) → same result.
  - no change → header back → the picker is focused, no leave warning shown.
  - tick → Discard lesson → confirm → `MainTabs` focused, no draft.
  - Home's Resume (`Lesson` with `draftId`) → Leave → `MainTabs`.
- [ ] **Step 2:** Run; expect the first two to fail by landing back in `Lesson` (the device bug).
- [ ] **Step 3:** Implement in a `useEffect` on `status`. Only remove a route named `SessionForm` that sits directly below this `Lesson` route.
- [ ] **Step 4:** Run the new suite and `LessonScreen`, `LessonPickerScreen`, `sessionCompleteNavigation` suites. Commit `fix(lesson): leaving a kept lesson returns to where the EA started`.

### Task 5: The picker shows its rows first (D5)

**Files:**
- Modify: `src/lessonPlan/inputs/lessonInputs.js` (split `loadPickerModel` into `loadPickerRanking` and `loadPickerLetters`)
- Modify: `src/services/pullCoverage.js` (`masteryCompletenessByChild` and `sessionHistoryCompletenessByChild` accept an already-read `academicYear`/`academicYearStart`, as `sessionHistoryCompletenessByChild` already does)
- Modify: `src/session/handleServices.js` (pass them through)
- Modify: `src/screens/lessons/LessonPickerScreen.js`, `src/components/lessons/GroupLessonRow.js`, `src/components/lessons/UpNextCard.js`
- Test: `__tests__/lessonInputs.test.js` (integration), `__tests__/LessonPickerScreen.test.js`

**Behaviour:**
- `loadPickerRanking({ handle, repositories, base, groups, getChildrenInGroup, children, childrenGroups })` needs only the draft check and `loadLessonBase` (programme, year, sessions) plus in-memory groups and members; it returns rows with names, dot, last seen, taught today and up next, and `nextLetters: null` (not loaded).
- `loadPickerLetters({ handle, repositories, services, base, ranking })` reads children, classes, both completeness answers and known letters, and returns `{ lettersByGroup, historyComplete }`. Programme and year are read once per picker load and passed down; no service re-reads them.
- The screen renders rows as soon as the ranking lands. Each row's detail shows last seen alone until its letters land, then `Mon · letters o m`. Ranking and up next never change when letters arrive (they do not depend on letters).
- A row tap before letters land starts the lesson normally; the late letters result is dropped once the screen has blurred (Review Focus 5).
- The "Still downloading past lessons" note appears only after the letters result (it depends on completeness).

- [ ] **Step 1: Failing tests:**
  - integration: on a seeded fixture (8 groups, 25 children, 3 letter assessments of 60 items each per child, 80 sessions this year), count SQL statements through the handle's reader for `loadPickerRanking` and assert ≤ 6; assert `getActiveProgrammeId`/`getActiveAcademicYear` each run once across ranking + letters.
  - screen: with `loadPickerLetters` held on a deferred promise, rows and Up next render with last seen and no letters; resolving adds `· letters o`; the row order is unchanged.
  - screen (Review Focus 5): tap a row while letters are held, resolve after blur; `navigate` was called once and nothing else happens.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement. Keep `shapePickerModel` working for existing callers or update them.
- [ ] **Step 4:** Run the picker and inputs suites (unit and integration). Commit `perf(lesson): picker rows before letters`.

### Task 6: Polish from the device run

**Files:** `src/components/lessons/WrapUpChildRow.js`, `AddChildSheet.js`, `MakeGroupSheet.js`, `PutInGroupSheet.js`, `LessonBlendSection.js`, `LessonLettersSection.js`, `LessonBookSection.js`, `src/screens/lessons/LessonPickerScreen.js`, `LessonScreen.js`, `LessonWrapUpScreen.js`, `src/components/forms/SelectableRow.js`, `src/utils/lessonDates.js`, `src/utils/childNames.js`; tests beside each.

- [ ] **"No one new yet"** uses `ToggleChip` (`accessibilityRole="checkbox"`, `checked` state) instead of switching `BrandButton` variants. Test: pressing it sets `accessibilityState.checked` true and shows the checkmark.
- [ ] **Children are told apart.** Add a child, Make a group and the picker's "Not in a group yet" list show the full name (`first_name last_name`, trimmed) as the title and the class name as the subtitle when known. Add `formatChildName(child)` to `src/utils/childNames.js` and use it in all three.
- [ ] **Put in a group** lists each group by its children's first names joined with " & " (the picker's naming), with the group's dot as `lead`; a group with no visible members falls back to its name. Rows are sorted as the picker sorts groups (`compareGroups`).
- [ ] **Locale order for names.** All four child/group lists above sort with `compareChildNames(a, b)` (`localeCompare` with `sensitivity: 'base'`) in `childNames.js`. Test: "Ênê" sorts before "Xola" and after "Aviwe".
- [ ] **Wrap up heading** sets the letters apart: "Who knows " + letters in a nested `Text` using `typeRoles` weight and `colors.primary` + " without help?". The accessible label stays the plain sentence.
- [ ] **Separators never dangle.** `joinDetail(parts)` in `lessonDates.js` joins with `" · "` (no-break space before the dot). Use it for the three section headings, the picker row detail (`lessonRowDetail`), the Up next detail and the Lesson header. Test: output contains no `" ·"` with an ordinary space before the dot.
- [ ] **Divider insets.** `SelectableRow`'s divider starts at 16 when there is no `lead` and 68 with one (as `ListRow` does). Test: `row-divider` style `left` is 16 without `lead`.
- [ ] **Dot colours** (not a change): the colour is the group's identity across the app (index in `compareGroups` order, six colours), so two groups more than six apart share one. Record this as a known limit in the build log; do not change it.
- [ ] Run the touched suites and `designSystemGuard`. Commit `fix(lesson): polish from the A03 run`.

### Task 7: Docs and full gates

- [ ] `documentation/build-log.md`: a section "2026-10-2x — Lesson flow device fixes" with each bug's fix, the Node timings from Task 2, the statement counts from Task 5, test totals, and the dot-colour known limit.
- [ ] `docs/superpowers/plans/2026-10-22-lesson-plan-c2-c3-lesson-flow.md` P4: add "Leaving goes back to the screen before the picker (device fix 2026-10-23)". P9: add the header wording.
- [ ] `documentation/LEARNING.md`: a short section on why the picker bounced (a screen that redirects on focus sitting under the screen it redirects to) and why keying a load on present children blanked the lesson.
- [ ] Full gates: `npm test`, `npm run test:integration`, `npm run test:types`. Record totals in the build log. Commit `docs(lesson): device fixes`.

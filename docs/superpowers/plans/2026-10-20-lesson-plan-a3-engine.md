# Lesson Plan A3: Pure Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `src/lessonPlan/engine/`, a pure module that turns plain data about a group, its children and a content pack into the lesson advice of spec §4.3–§4.8 (Up next, letters, unlocked set, blends, book, one reason) and the save-time rules C11 and C14, proven by JSON vectors.

**Architecture:** A functional core with no I/O. Callers pass `today`, the children present, the phone's session rows and a content pack. The engine returns the spec §6 `lesson.plan` object and, separately, the choices the Lesson screen shows. Sounds come from A1's vendored decodability checker, so the app and the books project tokenise identically. Vectors live beside the engine as JSON files and run through one Jest runner, so a later server port can reuse them unchanged. Nothing user-visible ships: the wave-2 Lesson flow (C3) consumes the contract below.

**Tech Stack:** Plain JavaScript (Hermes-safe; no `Intl`, no clock), A1's `src/utils/decodability/` (a copy of early-reader-books `checker/core/`), `READING_LEVELS` from `src/constants/literacyConstants.js:11-19`, Jest 29 via jest-expo, `@babel/parser` + `@babel/traverse` for the static purity guard (already used by `__tests__/productionBindingStatic.test.js`).

**Spec:** `docs/superpowers/specs/2026-10-20-lesson-plan-design.md`, rev 2 (§4.2's no-pack fallback, §4.3–§4.8, §6, §7.3, §7.6 ask 3, §10; calls C1–C6, C8, C9, C11, C14, C18, C23 at the engine boundary). Cross-plan names come from the cross-plan sheet (rev 2), section `a3-engine`.

**Build path:** Codex (gpt-5.6-sol) builds each task; Claude reviews the diff and runs the tests (AGENTS.md). Codex usually cannot run git commit in its sandbox, so the orchestrator runs the commit steps.

**Refreshed:** 2026-10-20 against origin/main f27b347 (#90) and spec rev 2 (2bb103a).

**Codex round 1:** folded in 2026-10-20 (a frozen plan keeps its default tier, six blends and Suggested book while browse lists refresh; the 2-letter tier admits only two-letter items; non-prefix unlocked-content vectors).

## Global Constraints

- Branch `feat/lesson-plan-a3-engine` from `main`. Commit after every task; never push without Jim. What each task needs from A1 (`docs/superpowers/plans/2026-10-20-lesson-plan-a1-content-packs.md`), merged first or stacked under this branch:
  - Tasks 1–4: nothing from other plans.
  - Tasks 5–7: A1 Task 1 (the vendored checker). `src/utils/decodability/index.js` exports `normalizeToken`, `tokenizeText`, `splitSounds`, `analyzeToken` and `isDecodableAt`.
  - Task 8: also A1 Task 3 (the `getPack(languageCode, options)` registry and the interim letters-only release packs `isixhosa-interim-letters-v1`, `english-interim-letters-v1` and `afrikaans-interim-letters-v1`) and A1 Task 5 (the preview pack `isixhosa-candidates-preview-v1`).
- **Pure module** (spec §7.3: "It never reads SQLite or React state"). Engine files import only other engine files, `src/utils/decodability`, and `src/constants/literacyConstants`. No React, React Native, Expo, SQLite, handle, repository, service or context import. No `Date.now()`, `Date()`, zero-argument `new Date()`, `Math.random`, `performance.now`, `console`, `require` or dynamic `import`. No module-level `let`/`var` and no module-level `Map`/`Set`/`WeakMap`. `today` is always an input. Task 1's static guard enforces all of this. (The repo's `__tests__/moduleStateAllowlist.test.js` scans only `src/services`, `src/db` and `src/session`, so it does not cover the engine.)
- **Languages are codes** (spec §0.1, rev 2). Inputs carry `languageCode`: `'xh'`, `'en'` or `'af'`, and in practice also `'zu'` (no pack, no tracker order) and `null` (unknown, or Afrikaans before AF lands; #90's `languageCodeForHomeLanguage`, `src/utils/assessmentRegistry.js:7-17`). A pack's own `language` field keeps the shared file's name (`isixhosa`, `english`, `afrikaans`; spec §4.1), so the engine compares the two through `PACK_LANGUAGE_BY_CODE` (Task 1). Never default a missing language to English, and never use another language's pack.
- **Letter evidence stays outside the engine** (C23). The engine receives each child's known letters. It never reads letter results, their items, confirmations or academic years. See "Building the inputs" below.
- **The engine never reads the assessment word lists** (J19): no filter, no boost, no label. The import allowlist above keeps them out: the item sets in `src/assessment-questions/itemsets/` (since #90; `word_reading@2026.1.xh.ts:11` lists `umama`) and `src/constants/egraConstants.js`.
- **The app never invents words** (spec §4.1): every syllable, word and book the engine returns comes from the pack it was given.
- **Exact values from the spec:** two suggested letters (J5); six blend suggestions (J16); "last 3 sessions" for blends and "last 5 sessions" for books (§4.6, C6); group mastery (§4.4): fewer than 3 children present → all must know the letter; 3 or more → at least 80% know it, or at most one child does not; engine version `1` (§6). Blend tier labels are the reading-ladder labels exactly: `2 Letter Blends`, `3 Letter Blends`, `4 Letter Blends`, `Word Reading` (C4, C11).
- **No user-visible copy.** Reasons and tags are codes; the Lesson screen (C3) owns the words.
- **No schema, RLS, payload, outbox or sync change.** `documentation/rls-sync-contract-map.md` is not touched. No real-SQLite or Postgres tests are needed: the engine has no I/O. A3 adds no local migration, so the `user_version: 15` pins (`__tests__/rowVersionLocal.test.js:50,137`, `__tests__/outboxOwnerMigration.test.js:19`) are left to the plans that add one.
- **Never edit the vendored checker** in `src/utils/decodability/` (its README, rule 4).
- **Dependencies:** none new. Stay on npm.
- **Tests run under Node 20.** Prefix every command with `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH"`. Unit tests: `npx jest <file>`.
- **TDD per `.agents/skills/tdd`.** Each task adds its vector cases one at a time, red then green, through the public functions only. The vectors are the tests.
- **Codex cannot `git commit`.** Each task's last step lists the files and message; the orchestrator runs it after reviewing the diff and rerunning the task's tests. End every commit message with the session's attribution trailer.
- Standing docs ship in this branch (Task 8), per `AGENTS.md`'s anti-drift rule.

## Review Focus

1. **Letters-only or partial packs.** A1's interim release packs for all three languages (isiXhosa too, since rev 2) ship in the first build with no `blends`, `words`, `readers`, `word_bank` or `reader_details`, and a pack may list its steps out of order. The engine sorts steps by `step`, treats every missing array or map as empty, and never throws. Pinned in Task 1 (case R1, reversed steps), Task 6 (B15) and Task 7 (K10).
2. **A class with no usable language.** Since #90, `languageCodeForHomeLanguage` returns `null` for a missing or unknown language and for Afrikaans until AF lands, and `'zu'` has a code but no pack and no tracker order. The engine gives `no_pack`, never borrows a pack for another language, never falls back to English, and offers `alphabet ?? []` as the letter choices. Pinned in Task 1 (R6, R7) and Task 6 (B16).
3. **A session dated after `today`** (another phone with a wrong clock) or before the academic year. It must not make a group "Today ✓", move "last seen" forward, or end a first session. Pinned in Task 2 (F6, F8) and Task 3 (G11, G12).
4. **Malformed or mixed-case history from other phones and older builds.** A `lesson` object without `blends_done`, a non-object `lesson`, `blends_done` in capitals, and `books_read` entries that are `null`, have no `id`, or name a book this pack does not have. These are matched after normalising or ignored, never thrown on. Pinned in Task 2 (R4, R5), Task 6 (B6) and Task 7 (K11).
5. **A child whose inputs are missing, oddly cased or repeated, or a session listed twice.** A group member absent from `children` counts as knowing nothing with incomplete history. Known letters in capitals (an older build's confirmation, or a caller that skips the loader) are lower-cased. A child listed twice as present, or the same session row twice (a local row plus a pulled copy), counts once in mastery, recency and week counts. Pinned in Task 1 (R2, R3) and Task 3 (G13, G17).
6. **A frozen plan meets refreshed inputs.** After the first tick, a pull can change reading levels or bring in blend and book history, and a draft can be resumed on a later day. The default tier, the six suggested blends and the Suggested book stay the plan's. Only the browse lists refresh: "+ more", "Show higher", and the Read tags in "Other book" ("Uses letters not learned yet" follows the frozen letters). Pinned in Task 6 (Z1–Z3) and Task 7 (K12, K13).
7. **Content beyond the step prefix, and a pack that skipped A1's lint.** Unlocked content is a sound set, not a step range (§4.5): a letter mastered out of order makes later steps' blends, words and books usable. A three-letter item in a step's `blends`, which A1's `step_blend_length` rejects, never enters the 2-letter tier. Pinned in Task 6 (N1, B17) and Task 7 (N2).

---

## Engine contract (every task includes this section)

### Types

These are JSDoc typedefs in `src/lessonPlan/engine/index.js`. The input shapes are the contract the wave-2 Lesson flow (C3) builds.

```js
/** @typedef {'2 Letter Blends'|'3 Letter Blends'|'4 Letter Blends'|'Word Reading'} BlendTier */
/** @typedef {'first_session'|'ok'|'all_letters_known'|'no_pack'|'no_children'} PlanReason */

/** @typedef {Object} ChildInput
 * @property {string} id
 * @property {string|null} readingLevel     children.reading_level (a READING_LEVELS label); null = Not set
 * @property {string[]} knownLetters        C23, in the LESSON's language: assessment evidence ∪ EA confirmation, computed by the caller (see "Building the inputs"). Lower-cased by the engine.
 * @property {boolean} historyComplete      §7.3 predicate for this one child: the C1 lesson-draft plan's isSessionHistoryComplete({ ..., childIds: [id] }). Anything but true = incomplete.
 * @property {boolean} masteryComplete      §7.6 ask 3 for this one child: AR Plan 3's masteryInputsComplete({ childIds: [id] }). false until AR Plan 3 lands.
 */

/** @typedef {Object} SessionRecord        Exactly a sessionsRepository.getSessions() row (src/db/repositories/sessionsRepository.js:70-96, 125-156); extra keys are ignored.
 * @property {string} id
 * @property {string} programme_id
 * @property {string} session_date         'YYYY-MM-DD'
 * @property {string} created_at           ISO timestamp
 * @property {string[]} children_ids       attendees (present only, C13)
 * @property {Object|null} activities      activities.lesson (an object) marks a lesson-plan session; the engine reads lesson.blends_done (string[]) and lesson.books_read ([{ id, how }])
 */

/** @typedef {Object} LessonInput
 * @property {string} today                'YYYY-MM-DD', SAST: toLocalDateString(new Date()) (src/utils/localDate.js:16). Becomes plan.made_on and the rotation day.
 * @property {string} academicYearStart    'YYYY-MM-DD': getActiveAcademicYear(db).starts_on (src/db/repositories/domainRepositoryUtils.js:261)
 * @property {string} programmeId          the EA's active programme
 * @property {string} groupId              the lesson's group (rotation seed)
 * @property {string|null} upNextGroupId   rankGroups().upNextGroupId when the picker opened
 * @property {string|null} languageCode    the lesson class's language code (C18): languageCodeForHomeLanguage(class.home_language), 'xh' | 'en' | 'af' (after AF) | 'zu' | null. null = unknown; never defaulted to 'en'.
 * @property {Object|null} pack            spec §4.1 pack: A1's getPack(languageCode, options), or getPackById(draft.pack_id, options) for a resumed draft; null → no_pack
 * @property {string[]|null} alphabet      the language's 26 letters for the manual letter picker: PEDAGOGICAL_ORDERS[languageCode] (src/utils/assessmentRegistry.js:19-22; 'af' arrives with AF), else null. Used only when there is no usable pack.
 * @property {boolean} isEcd               the lesson class's grade === 'ECD' (C8; classes.grade, GRADES in src/constants/options.js:1)
 * @property {ChildInput[]} presentChildren   present only (C1), in screen order, including children added for the day
 * @property {SessionRecord[]} sessions    the phone's sessions; the engine applies the §7.3 window itself
 */

/** Plan = spec §6 lesson.plan, keys in exactly this order:
 *  engine_version (1), made_on, reason, history_complete, mastery_complete, present_child_ids,
 *  known_letters, suggested_letters, review_letters, unlocked_letters,
 *  blend_tier (BlendTier|null), suggested_blends (string[], at most 6), suggested_book (string|null),
 *  up_next_group_id */

/** @typedef {{ text: string, display: string, tier: BlendTier }} BlendItem   text = pack item text (what blends_done stores); display = word_bank syllables, else text; tier = by the item's own letter count */
/** @typedef {{ tier: BlendTier, childIds: string[], suggested: BlendItem[], pool: BlendItem[] }} TierChoice   LessonChoices.tiers[0] is the default tier; later entries are higher tiers ("show higher"), ascending */
/** @typedef {{ id: string, title: string, step: number, readable: boolean, suggested: boolean, lastReadOn: string|null }} BookChoice */
/** @typedef {{ letterChoices: string[], tiers: TierChoice[], books: BookChoice[], contentAvailable: { blends: boolean, books: boolean } }} LessonChoices */

/** @typedef {{ id: string, name: string, displayNumber: number|null, memberIds: string[], languageCode: string|null, pack: Object|null }} GroupInput */
/** @typedef {{ today: string, academicYearStart: string, programmeId: string, groups: GroupInput[], children: Object<string, ChildInput>, sessions: SessionRecord[] }} RankGroupsInput */
/** @typedef {{ groupId: string, lastSeenOn: string|null, taughtToday: boolean, sessionsThisWeek: number, nextLetters: string[], lettersReason: PlanReason }} GroupRow */
```

### Public API (`src/lessonPlan/engine/index.js`, built up task by task)

| Export | Task | Signature |
| --- | --- | --- |
| `computeLessonPlan` | 1 | `(input: LessonInput) → Plan` |
| `teachingOrderFromPack` | 1 | `(pack) → string[]` (`letter_steps` sorted by `step`, `new_letters` concatenated; `[]` for a missing pack) |
| `ENGINE_VERSION`, `PLAN_REASONS`, `SUGGESTED_LETTER_COUNT`, `BLEND_SUGGESTION_COUNT`, `BLEND_RECENT_SESSIONS`, `BOOK_RECENT_SESSIONS` | 1 | `1`, the five reasons, `2`, `6`, `3`, `5` |
| `PACK_LANGUAGE_BY_CODE` | 1 | frozen `{ xh: 'isixhosa', en: 'english', af: 'afrikaans' }`: the pack `language` name for each code (plan call; not on the sheet). It mirrors A1's loader mapping, and Task 8 asserts the two agree. |
| `rankGroups` | 3 | `(input: RankGroupsInput) → { upNextGroupId: string\|null, rows: GroupRow[] }` |
| `planForSave` | 4 | `({ plan, lessonDate }) → { plan: Plan, plan_reason: null } \| { plan: null, plan_reason: 'past_date' }`; throws `TypeError('planForSave needs a plan')` when `plan` is missing |
| `isPlanRecomputable` | 4 | `({ lessonDate, today, frozen }) → boolean` (`!frozen && lessonDate === today`) |
| `resolveLessonClass` | 4 | `({ groupClassId: string\|null, memberClassIds: (string\|null)[] }) → { classId: string\|null, choices: string[] }` |
| `BLEND_TIERS` | 5 | frozen `READING_LEVELS.slice(1, 5)` |
| `blendTierForReadingLevel` | 5 | `(level: string\|null) → BlendTier` |
| `deriveSessionReadingLevel` | 5 | `(blendsDone: string[]) → BlendTier\|null`. Rev 1 of the sheet wrote `(blendsDone, pack)`. There is no `pack` argument, because a letter count after the vendored `normalizeToken` does not depend on the pack (C11: "each item counted by its own letter count"). |
| `computeLessonChoices` | 6 | `(input: LessonInput, options?: { plan?: Plan }) → LessonChoices`. Given a frozen `plan`, the letters, the default tier, its six suggestions and the Suggested book come from the plan; only the browse lists use refreshed inputs (shared Frozen plan rule; Tasks 6–7). |

### Shared rules (one definition each; tasks implement them where named)

- **Window** (§7.3; Task 2, `history.js`). Drop repeated session ids (first wins). Keep rows with `programme_id === programmeId` and `academicYearStart <= session_date <= today`. A child's sessions are the windowed rows whose `children_ids` include the child, newest first by `session_date`, then `created_at`, then `id` (descending, plain string comparison).
- **Lesson-plan session** (§4.4): `activities.lesson` is a non-null, non-array object. Old-form sessions still count as sessions for "last seen" and for "last 3 / last 5 sessions"; they just carry no blends or books.
- **Usable pack:** all three hold:
  - the pack is not null;
  - `languageCode` is an own key of `PACK_LANGUAGE_BY_CODE` (`Object.prototype.hasOwnProperty.call`, so `null`, `'zu'` and `'toString'` all fail) and `pack.language === PACK_LANGUAGE_BY_CODE[languageCode]`;
  - its teaching order is not empty.

  Anything else is `no_pack` (never crash, §4.1). Under `no_pack`, the letters come from `alphabet ?? []`.
- **Present children:** repeated ids are collapsed (first wins). Known letters are lower-cased.
- **Reason precedence:** `no_children` → `no_pack` → `first_session` → `all_letters_known` / `ok`.
- **Letter counts and sounds** (Tasks 5–7, `sounds.js`): `letterCount(text) = [...normalizeToken(String(text ?? ''))].length` (code points, after the checker's normalisation, so hyphens do not count). `soundsOf(text, pack) = splitSounds(normalizeToken(text), pack.sound_inventory ?? [])`. An item or token is usable when `soundsOf` is non-null and non-empty and every sound is in the unlocked set. In v1 only single letters can be unlocked, so any multi-letter sound (`th`) keeps an item out (§4.5, C9).
- **Never mutate inputs.** A1 deep-freezes bundled packs, so sort copies (`[...steps].sort(...)`), never the arrays you were given. The runner deep-freezes every fixture and input, so a mutation fails the vectors.
- **Tokenise once.** `computeLessonPlan` and `computeLessonChoices` share one internal `evaluateLesson(input, plan = null)`. It tokenises each pack item and page at most once per call (a function-local `Map`), and both public functions read from its result, so they agree by construction.
- **Frozen plan** (C1, C14, §5.2: "After that it is fixed for this lesson"; Tasks 6–7). `computeLessonChoices(input, { plan })` keeps the plan's advice and refreshes only what the EA browses.
  - Always from the plan: `reason`, `suggested_letters`, `unlocked_letters`, and `made_on` as the rotation day. `input.today` still bounds the history window.
  - When `plan.blend_tier` is a `BLEND_TIERS` label (every plan made with a usable pack and children present), the plan's advice wins over refreshed reading levels and history:
    - `tiers[0].tier` is `plan.blend_tier`, even when no present child is at that tier any more;
    - `tiers[0].suggested` is `plan.suggested_blends`, in plan order. Each text becomes the pack's `BlendItem` for it, matched by normalised text across the four tiers' item lists (before the unlocked filter). A text the pack does not hold is dropped, so nothing is invented (it cannot happen with the draft's own `pack_id`);
    - the one book with `suggested: true` is `plan.suggested_book`, and none when it is `null`.
  - Refreshed from `input` (children, reading levels, history):
    - `tiers[0].pool` ("+ more"): the frozen suggestions first, then the rest of that tier's ranked pool in ranked order. Pool membership depends only on the tier, the unlocked letters and the pack, so the frozen suggestions are always in it and `suggested` stays `pool.slice(0, suggested.length)`;
    - the later tiers ("Show higher"): one per present-child tier strictly above `tiers[0].tier`, ascending, each ranked as without a plan. A lower tier is not offered;
    - `childIds`: `tiers[0]` names the present children at or below its tier, and each later entry the children at its tier. Without a frozen tier, `tiers[0]` is the lowest tier, so this is the same rule;
    - the books list ("Other book"): `readable` from the frozen unlocked letters, `lastReadOn` from refreshed history.
  - When `plan.blend_tier` is `null` (a plan made with no children or no pack, or the partial plans in Task 6's vectors), the tiers and the Suggested book are computed as without a plan, from the plan's letters.
  - With no usable pack, or no present children, `tiers` and `books` are `[]` whatever the plan says.
  - So `computeLessonChoices(input, { plan: computeLessonPlan(input) })` always equals `computeLessonChoices(input)` (the agreement check, Task 6 Step 6).

### Building the inputs (wave 2's job, recorded here so the contract is complete)

A3 builds none of this. The wave-2 Lesson flow (`c2-c3-lesson-flow`, written "C3" in prose below) builds each input through the signed-in EA handle, then calls the engine.

- **`knownLetters` (C23).** For each child, call the shared mastery loader in the lesson's `languageCode`: `loadMasteryState({ repositories, userId, childId, languageCode })` (`src/utils/masteryState.js:13-38`). Known = `assessmentMastered` ∪ the confirmed letters among `taughtRecords`.
  - This is AR §10.3–10.4: evidence from the stored items of the child's latest letter result, from any EA (`computeAssessmentMastery`, `src/utils/letterMastery.js`), plus EA confirmations.
  - Rev 2's one addition, the current-academic-year bound on that letter result, is §7.6 ask 4. It lands inside the loader with AR Plan 2 or 3, alongside Plan 2's confirmation re-key.
  - Neither change touches the engine, which never sees results, items or years. C23 names three readers of one rule: the mastery loader, the dashboards (`dashboardStats.js`) and the engine's inputs. Calling the loader that the tracker sheet and panel use, rather than re-deriving evidence, is what keeps the engine on that rule.
- **`historyComplete`.** `isSessionHistoryComplete({ database, userId, programmeId, childIds: [id], academicYearStart })` from `src/services/pullCoverage.js` (the C1 lesson-draft plan).
- **`masteryComplete`.** AR Plan 3's `masteryInputsComplete({ childIds: [id] })` (spec §7.6 ask 3). Pass `false` for every child until AR Plan 3 lands. The plan then records `mastery_complete: false`, and the screen shows "Still downloading what children know" (§7.3).
- **`languageCode`, `alphabet`, `pack`.** These come from one place per lesson, never mixed (Codex A3 round 2):
  - **A new lesson (no draft yet):** `languageCode` from the lesson class's `home_language` through `languageCodeForHomeLanguage`, and `pack` from `getPack(languageCode, { allowPreview: isPreviewContentEnabled() })`.
  - **A draft (resumed or in progress):** `languageCode = draft.language_code` and `pack = getPackById(draft.pack_id, { allowPreview: isPreviewContentEnabled() })`, the context fixed when the draft started (spec §7.2, C18). The class's current `home_language` is **not** read again, so a Head Office correction to the class mid-lesson cannot pair a new language with the pinned pack.
  - In both cases `alphabet` is `PEDAGOGICAL_ORDERS[languageCode] ?? null`, the registry's 26 letters that §4.2 names as the no-pack fallback (plan call; A2 may route this through `getTeachingOrder`), and `knownLetters` are loaded in that same `languageCode`. `activities.lesson.language` (§6) is that code.
  - C3 regression (carried into its plan): start a draft for an English class, change the class's `home_language` to Afrikaans, resume. The advice, the tracker language and the saved `lesson.language` stay English.
- **`academicYearStart`.** The active academic year's `starts_on` (`getActiveAcademicYear`, `src/db/repositories/domainRepositoryUtils.js:261`).

### Notes for the wave-2 Lesson flow (C3) and A2

- Build `sessions` with `repositories.sessions.getSessions({ userId, programmeId, sinceDate: academicYearStart })` (`src/db/repositories/sessionsRepository.js:125-156`). `sinceDate` is only an optimisation; the engine windows again.
- Fill `GroupInput.displayNumber` from `groups.display_number`, else the N of a `Group N` name (`NUMBERED_GROUP`, `src/utils/groupHelpers.js:12`), else `null`. Pass each group's own `languageCode` and `pack`, resolved through `resolveLessonClass` (C18). Pass `pack: null` while a mixed-class group's class is undecided.
- Call `isPlanRecomputable` before recomputing (C1, C14). The C1 lesson draft stores only the plan (an opaque `plan` field). Whenever it returns `false` (the plan froze, or the draft is resumed on a later day, frozen or not):
  - call `computeLessonChoices(input, { plan })` with the stored plan;
  - build `presentChildren` for `plan.present_child_ids`.

  Then the letters, the default tier, its six suggested blends and the Suggested book are the plan's, even if a pull changes what the children know, their reading levels or their history mid-lesson, and when a draft is resumed on a later day. "+ more", "Show higher" and "Other book" (with its Read tags) follow the frozen letters but refresh their ranking, their tiers and their tags (the shared Frozen plan rule).
- At save: merge `planForSave({ plan, lessonDate })` into `activities.lesson`, and write `session_reading_level: deriveSessionReadingLevel(blendsDone)` (C11).
- Pass to `resolveLessonClass` only the group's current members' class ids; children added for the day never change the class (C18). When `choices` is empty and `classId` is null, offer the EA's own classes.
- The "Show 3-letter (Lulu is ahead)" control: `tiers[0]` is the default tier, and each later entry is a higher tier and names the children at it. With pairs there are at most two. After the plan freezes, `tiers[0]` stays the plan's tier even when its `childIds` is empty (every present child has moved up), and it stays selectable.
- Letters the EA adds today are not an engine input, so they cannot change suggestions (C3).
- A2's `getTeachingOrder` should reuse `teachingOrderFromPack` (or A1's equivalent, if A1 ships one first) rather than re-deriving the order.

### Vector format (Task 1 creates it; later tasks only add files and cases)

- Directory `src/lessonPlan/engine/vectors/`. `packs.json` holds the fixture packs: `{ "version": 1, "note": "...", "packs": { name: Pack } }`. Each `*.vectors.json` file is `{ "version": 1, "defaults": { [fn]: Object }, "cases": Case[] }`.
- `Case = { name, spec, fn, input?, options?, args?, expect?, exact?, view?, throws? }`. `input` is shallow-merged over `defaults[fn]` and passed as the first argument, with `options` (when present) as the second. `args` (an array) calls the function positionally instead. Any `pack` value (top level, or on each `groups[]` entry) names a fixture pack, or is `null`; an unknown name fails the run.
- Matching: `exact: true`, or a non-object `expect`, uses `toEqual`. Otherwise `toMatchObject`, so a case asserts only the keys it lists, while arrays must match in full. `view: "summary"` (for `computeLessonChoices`) compares against `{ tiers: [{ tier, childIds, suggested: texts, pool: texts }], books: [{ id, readable, suggested, lastReadOn }], contentAvailable, letterChoices }`. `throws` is a message substring.
- Every `computeLessonPlan` result must have exactly the §6 keys, in §6 order.

**Notation used in the case tables below** (the JSON spells each out in full):

- `kid(A, o m l a)` is `{ "id": "A", "readingLevel": null, "knownLetters": ["o","m","l","a"], "historyComplete": true, "masteryComplete": true }`. `kid(A, —)` has no known letters. A suffix sets the reading level: `@C` `Cannot blend`, `@2`, `@3`, `@4` `N Letter Blends`, `@W` `Word Reading`, `@P` `Paragraph Reading`. `!hist` and `!mast` set that flag to `false`.
- `S(s1, 03-02, A, lesson)` is `{ "id": "s1", "programme_id": "p-lit", "session_date": "2026-03-02", "created_at": "2026-03-02T08:00:00.000Z", "children_ids": ["A"], "activities": { "letters_focused": [], "lesson": { "version": 1, "blends_done": [], "books_read": [] } } }`.
  - `lesson[kum]` fills `blends_done`; `books[r04]` fills `books_read` with `{ "id": "xh-mini-r04", "how": "printed" }`.
  - `old` means `"activities": { "letters_focused": ["o"] }`, with no `lesson` key.
  - `prog p-num` overrides `programme_id`.
  - Dates without a year are in 2026. `r01` means `xh-mini-r01`.
- "both `o m l a@3`" means `kid(A, o m l a, @3)` and `kid(B, o m l a, @3)`.
- `a–z` is the 26-letter alphabet. `XH26` is `o m l a k u e n i t s d f b y c z p q w v g x h j r` (J1).
- Because `toMatchObject` compares arrays in full, an expected `rows`, `tiers` or `books` array lists every entry in order. The tables name only the fields each case asserts on those entries.

---

## File map

| File | Responsibility | Task |
| --- | --- | --- |
| `src/lessonPlan/engine/index.js` | public exports and typedefs | 1 (grows) |
| `src/lessonPlan/engine/constants.js` | engine version, reasons, counts, `BLEND_TIERS` | 1, 5 |
| `src/lessonPlan/engine/letters.js` | teaching order, group mastery, letters rule, unlocked and review sets | 1, 2 |
| `src/lessonPlan/engine/history.js` | window, per-child ordering, lesson-plan detection, blends and books read | 2, 6, 7 |
| `src/lessonPlan/engine/groups.js` | `rankGroups` | 3 |
| `src/lessonPlan/engine/lessonPlan.js` | `computeLessonPlan`, `computeLessonChoices`, `evaluateLesson`, `planForSave`, `isPlanRecomputable` | 1, 4, 6, 7 |
| `src/lessonPlan/engine/lessonClass.js` | `resolveLessonClass` (C18) | 4 |
| `src/lessonPlan/engine/sounds.js` | `letterCount`, `soundsOf` over the vendored checker | 5 |
| `src/lessonPlan/engine/blends.js` | tiers, C11, rotation, pool ranking, top-up | 5, 6 |
| `src/lessonPlan/engine/books.js` | catalogue, readability, C6 choice, tags | 7 |
| `src/lessonPlan/engine/vectors/*.json` | fixture packs and vector cases | 1–7 |
| `__tests__/lessonPlanEngine.vectors.test.js` | the single vector runner | 1, 6 |
| `__tests__/lessonPlanEnginePurity.test.js` | static purity guard | 1 |
| `__tests__/lessonPlanEngine.realPacks.test.js` | smoke against A1's bundled packs, with the checker as oracle | 8 |
| `CONTEXT.md`, `documentation/LEARNING.md`, `documentation/build-log.md` | docs | 8 |

---

### Before Task 1: preflight (orchestrator, no commit)

- [ ] **Step 1: Branch and install.** Create `feat/lesson-plan-a3-engine` from `main` (stack on A1's branch if A1 is not merged and Task 5 is near). If the worktree has no `node_modules`, run `npm ci`.
- [ ] **Step 2: Baseline.** Run `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest`. Expected: PASS. Record the suite and test counts for the build log.
- [ ] **Step 3: A1 check.**
  - Before Task 5: `src/utils/decodability/index.js` exists with the five exports above, and A1's `__tests__/decodability.test.js` passes.
  - Before Task 8: `getPack` from `src/lessonPlan/packs` takes codes and returns the three interim release packs (`getPack('xh')`, `getPack('en')`, `getPack('af')`), and `getPack('xh', { allowPreview: true }).id === 'isixhosa-candidates-preview-v1'`. If A1 shipped different names, stop and reconcile them against the cross-plan sheet before writing Task 8.

---

### Task 1: Vector runner, purity guard and the letters rule

**Files:**
- Create: `src/lessonPlan/engine/index.js`, `constants.js`, `letters.js`, `lessonPlan.js`
- Create: `src/lessonPlan/engine/vectors/packs.json`, `src/lessonPlan/engine/vectors/letters.vectors.json`
- Test: `__tests__/lessonPlanEngine.vectors.test.js`, `__tests__/lessonPlanEnginePurity.test.js`

**Interfaces:**
- Consumes: nothing from other tasks. Types and rules come from the Engine contract.
- Produces:
  - `computeLessonPlan(input: LessonInput) → Plan`. Every §6 key is present. Until Tasks 6–7, `blend_tier: null`, `suggested_blends: []`, `suggested_book: null`.
  - `teachingOrderFromPack(pack) → string[]`.
  - The constants listed in the API table, including `PACK_LANGUAGE_BY_CODE` in `constants.js`.
  - Internal (`letters.js`):
    - `isLetterGroupMastered(covered: number, present: number) → boolean`;
    - `usablePack({ pack, languageCode }) → Pack|null` (the shared Usable pack rule);
    - `planLetters({ languageCode, pack, alphabet, children, childSessions }) → { reason, order, known, suggested, review, unlocked, historyComplete, masteryComplete }`.
    - `childSessions` is `(childId) → SessionRecord[]`; Task 2 starts using it.
  - The vector format and the runner that later tasks extend.

- [ ] **Step 1: Write `packs.json` exactly as below.** It is synthetic test data in the spec §4.1 shape. Its words and books are fixtures, not reviewed vocabulary. Every later expectation depends on these exact contents and orders.

```json
{
  "version": 1,
  "note": "Synthetic fixtures in the spec §4.1 shape (lesson plan engine vectors). Not reviewed vocabulary.",
  "packs": {
    "xh-mini": {
      "id": "xh-mini-v1", "language": "isixhosa", "channel": "release",
      "sound_inventory": ["a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z","th","ph","kh","ny","hl","bh","nc","dl","ty","sh","tsh"],
      "letter_steps": [
        { "step": 1, "new_letters": ["o","m","l","a"], "blends": ["mo","ma","lo","la"], "words": ["mo-lo","ma-ma","la-la"], "readers": ["xh-mini-r01","xh-mini-r02"] },
        { "step": 2, "new_letters": ["k","u"], "blends": ["ku","ka","ko","mu","lu","ma"], "words": ["u-ma-ma"], "readers": ["xh-mini-r03","xh-mini-r05"] },
        { "step": 3, "new_letters": ["e","n"], "blends": ["me","le","ke","ne","na","no","nu"], "words": ["na-lo"], "readers": ["xh-mini-r04"] },
        { "step": 4, "new_letters": ["i","t"] }, { "step": 5, "new_letters": ["s","d"] }, { "step": 6, "new_letters": ["f","b"] },
        { "step": 7, "new_letters": ["y","c"] }, { "step": 8, "new_letters": ["z","p"] }, { "step": 9, "new_letters": ["q","w"] },
        { "step": 10, "new_letters": ["v","g"] }, { "step": 11, "new_letters": ["x","h"] }, { "step": 12, "new_letters": ["j","r"] }
      ],
      "sound_steps": [ { "step": 13, "new_sounds": ["th"], "words": [], "readers": [] } ],
      "readers": {
        "xh-mini-r01": { "title": "Molo, Lolo!", "step": 1, "tricky_words": [], "pages": ["Molo, Lolo!", "Mmm.", "Lolo! Molo!", "Mmm… lala.", "Molo, Malo!"] },
        "xh-mini-r02": { "title": "Mama", "step": 1, "tricky_words": [], "pages": ["Mama", "Molo, Mama", "Lala, Mama"] },
        "xh-mini-r03": { "title": "Umama", "step": 2, "tricky_words": [], "pages": ["Umama", "Kulo umama", "Umama ulala"] },
        "xh-mini-r04": { "title": "Nalo", "step": 3, "tricky_words": ["ewe"], "pages": ["Nalo", "Nalo umama", "Ewe, nalo"] },
        "xh-mini-r05": { "title": "Kulala", "step": 2, "tricky_words": [], "pages": ["Kulala", "Umama ulala"] }
      },
      "word_bank": [
        { "text": "lam", "syllables": "lam", "step": 1 }, { "text": "ala", "syllables": "a-la", "step": 1 },
        { "text": "alo", "syllables": "a-lo", "step": 1 }, { "text": "molo", "syllables": "mo-lo", "step": 1 },
        { "text": "mama", "syllables": "ma-ma", "step": 1 }, { "text": "lala", "syllables": "la-la", "step": 1 },
        { "text": "oomama", "syllables": "o-o-ma-ma", "step": 1 }, { "text": "kum", "syllables": "kum", "step": 2 },
        { "text": "oku", "syllables": "o-ku", "step": 2 }, { "text": "kulo", "syllables": "ku-lo", "step": 2 },
        { "text": "lula", "syllables": "lu-la", "step": 2 }, { "text": "umama", "syllables": "u-ma-ma", "step": 2 },
        { "text": "kulala", "syllables": "ku-la-la", "step": 2 }, { "text": "mna", "syllables": "mna", "step": 3 },
        { "text": "nalo", "syllables": "na-lo", "step": 3 }, { "text": "onke", "syllables": "o-nke", "step": 3 },
        { "text": "mamela", "syllables": "ma-me-la", "step": 3 }, { "text": "thula", "syllables": "thu-la", "step": 13 }
      ],
      "reader_details": { "xh-mini-r05": { "retired": true } }
    },
    "xh-letters-reversed": {
      "id": "xh-letters-reversed-v1", "language": "isixhosa", "channel": "release",
      "sound_inventory": ["a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z"],
      "letter_steps": [
        { "step": 12, "new_letters": ["j","r"] }, { "step": 11, "new_letters": ["x","h"] }, { "step": 10, "new_letters": ["v","g"] },
        { "step": 9, "new_letters": ["q","w"] }, { "step": 8, "new_letters": ["z","p"] }, { "step": 7, "new_letters": ["y","c"] },
        { "step": 6, "new_letters": ["f","b"] }, { "step": 5, "new_letters": ["s","d"] }, { "step": 4, "new_letters": ["i","t"] },
        { "step": 3, "new_letters": ["e","n"] }, { "step": 2, "new_letters": ["k","u"] }, { "step": 1, "new_letters": ["o","m","l","a"] }
      ]
    },
    "xh-long-blend": {
      "id": "xh-long-blend-v1", "language": "isixhosa", "channel": "release",
      "sound_inventory": ["a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z"],
      "letter_steps": [
        { "step": 1, "new_letters": ["o","m","l","a"], "blends": ["mo","ma","lam","lo","la"] },
        { "step": 2, "new_letters": ["k","u"] }
      ]
    },
    "en-interim": {
      "id": "english-interim-v1", "language": "english", "channel": "release",
      "sound_inventory": ["a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z"],
      "letter_steps": [
        { "step": 1, "new_letters": ["a","m","s","t"] }, { "step": 2, "new_letters": ["n","i"] }, { "step": 3, "new_letters": ["p","c"] },
        { "step": 4, "new_letters": ["f","d"] }, { "step": 5, "new_letters": ["h","o"] }, { "step": 6, "new_letters": ["r","b"] },
        { "step": 7, "new_letters": ["l","k"] }, { "step": 8, "new_letters": ["e","g"] }, { "step": 9, "new_letters": ["w","v"] },
        { "step": 10, "new_letters": ["u","j"] }, { "step": 11, "new_letters": ["y","z"] }, { "step": 12, "new_letters": ["q","x"] }
      ],
      "sound_steps": []
    },
    "af-interim": {
      "id": "afrikaans-interim-v1", "language": "afrikaans", "channel": "release",
      "sound_inventory": ["a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z"],
      "letter_steps": [
        { "step": 1, "new_letters": ["a","s","m","e"] }, { "step": 2, "new_letters": ["k","i"] }, { "step": 3, "new_letters": ["r","o"] },
        { "step": 4, "new_letters": ["n","t"] }, { "step": 5, "new_letters": ["d","l"] }, { "step": 6, "new_letters": ["p","u"] },
        { "step": 7, "new_letters": ["b","g"] }, { "step": 8, "new_letters": ["h","v"] }, { "step": 9, "new_letters": ["w","y"] },
        { "step": 10, "new_letters": ["f","j"] }, { "step": 11, "new_letters": ["c","z"] }, { "step": 12, "new_letters": ["x","q"] }
      ],
      "sound_steps": []
    }
  }
}
```

The fixtures keep the shared file's `language` names (`isixhosa`, `english`, `afrikaans`; spec §4.1), while vector inputs use codes. The interim fixtures follow C10: English is `ENGLISH_PEDAGOGICAL_ORDER` (`src/constants/egraConstants.js:76-80`, served as `PEDAGOGICAL_ORDERS.en` by `src/utils/assessmentRegistry.js:19-22` since #90), and Afrikaans is Zazi's provisional order (Zazi `origin/main` `src/constants/egraConstants.js:262`). Each takes four letters for step 1, then pairs. `xh-letters-reversed` is a letters-only isiXhosa pack in the J1 order, like A1's interim isiXhosa release pack (rev 2), with its steps listed backwards. `xh-long-blend` is deliberately invalid: `lam` is a three-letter item in step 1's `blends` that decodes at step 1, so the shared lint accepts it and A1's `step_blend_length` rejects it. It stands for a pack that reached the engine without A1's lint (Task 6, B17).

- [ ] **Step 2: Write the runner.**

```js
// __tests__/lessonPlanEngine.vectors.test.js
import fs from 'fs';
import path from 'path';
import * as engine from '../src/lessonPlan/engine';

const DIR = path.resolve(__dirname, '../src/lessonPlan/engine/vectors');
const deepFreeze = (value) => {                       // A1 deep-freezes real packs; the engine must never mutate inputs
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};
const { version: packsVersion, packs } = deepFreeze(require(path.join(DIR, 'packs.json')));
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith('.vectors.json')).sort();
const PLAN_KEYS = ['engine_version', 'made_on', 'reason', 'history_complete', 'mastery_complete',
  'present_child_ids', 'known_letters', 'suggested_letters', 'review_letters', 'unlocked_letters',
  'blend_tier', 'suggested_blends', 'suggested_book', 'up_next_group_id'];

const packFor = (name) => {
  if (name === null) return null;
  if (!Object.prototype.hasOwnProperty.call(packs, name)) throw new Error(`Unknown fixture pack "${name}"`);
  return packs[name];
};
const resolveInput = (input) => {
  const out = { ...input };
  if ('pack' in out) out.pack = packFor(out.pack);
  if (Array.isArray(out.groups)) out.groups = out.groups.map((g) => ('pack' in g ? { ...g, pack: packFor(g.pack) } : g));
  return out;
};
const inputFor = (file, c) => deepFreeze(resolveInput({ ...(file.defaults?.[c.fn] ?? {}), ...(c.input ?? {}) }));
const call = (file, c) => {
  const fn = engine[c.fn];
  if (typeof fn !== 'function') throw new Error(`${c.fn} is not exported by the engine`);
  const copy = (value) => deepFreeze(JSON.parse(JSON.stringify(value)));
  if (c.args) return fn(...copy(c.args));
  return c.options ? fn(inputFor(file, c), copy(c.options)) : fn(inputFor(file, c));
};
const summary = (choices) => ({
  tiers: choices.tiers.map((t) => ({ tier: t.tier, childIds: t.childIds, suggested: t.suggested.map((i) => i.text), pool: t.pool.map((i) => i.text) })),
  books: choices.books.map(({ id, readable, suggested, lastReadOn }) => ({ id, readable, suggested, lastReadOn })),
  contentAvailable: choices.contentAvailable,
  letterChoices: choices.letterChoices,
});

test('fixture packs pin the engine version', () => {
  expect(packsVersion).toBe(engine.ENGINE_VERSION);
});

describe.each(FILES)('%s', (name) => {
  const file = require(path.join(DIR, name));
  test('pins the engine version', () => expect(file.version).toBe(engine.ENGINE_VERSION));
  test.each(file.cases.map((c) => [c.name, c]))('%s', (_, c) => {
    expect(typeof c.spec).toBe('string');
    if (c.throws) { expect(() => call(file, c)).toThrow(c.throws); return; }
    let result = call(file, c);
    if (c.fn === 'computeLessonPlan') expect(Object.keys(result)).toEqual(PLAN_KEYS);
    if (c.view === 'summary') result = summary(result);
    if (c.exact || typeof c.expect !== 'object' || c.expect === null) expect(result).toEqual(c.expect);
    else expect(result).toMatchObject(c.expect);
  });
});
```

- [ ] **Step 3: Write the purity guard**, with a self-test, so the guard cannot pass vacuously.

```js
// __tests__/lessonPlanEnginePurity.test.js
import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.join(ROOT, 'src/lessonPlan/engine');
const ALLOWED = new Set(['src/utils/decodability', 'src/constants/literacyConstants']);
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const f = path.join(dir, e.name);
  return e.isDirectory() ? files(f) : f.endsWith('.js') ? [f] : [];
});
const target = (file, source) => path.relative(ROOT, path.resolve(path.dirname(file), source))
  .replace(/\\/g, '/').replace(/\/index\.js$/, '').replace(/\.js$/, '');
const isMember = (node, obj, prop) => node?.type === 'MemberExpression'
  && node.object.name === obj && node.property.name === prop;

const auditEngineSource = (source, file) => {
  const violations = [];
  const fail = (node, why) => violations.push(`${path.relative(ROOT, file)}:${node.loc.start.line}: ${why}`);
  const checkImport = (node, source) => {
    if (!source.startsWith('.')) return fail(node, `package import ${source}`);
    const t = target(file, source);
    if (!t.startsWith('src/lessonPlan/engine/') && !ALLOWED.has(t)) fail(node, `import ${t}`);
  };
  traverse(parse(source, { sourceType: 'module' }), {
    ImportDeclaration({ node }) { checkImport(node, node.source.value); },
    ExportNamedDeclaration({ node }) { if (node.source) checkImport(node, node.source.value); },
    ExportAllDeclaration({ node }) { checkImport(node, node.source.value); },
    CallExpression({ node }) {
      const { callee } = node;
      if (callee.type === 'Import' || callee.name === 'require') fail(node, 'dynamic import or require');
      if (callee.name === 'Date' || isMember(callee, 'Date', 'now') || isMember(callee, 'performance', 'now')) fail(node, 'clock read');
      if (isMember(callee, 'Math', 'random')) fail(node, 'randomness');
      if (callee.type === 'MemberExpression' && callee.object.name === 'console') fail(node, 'console');
    },
    NewExpression({ node }) {
      if (node.callee.name === 'Date' && node.arguments.length === 0) fail(node, 'clock read: new Date()');
    },
    VariableDeclarator(p) {
      const mutableBinding = ['let', 'var'].includes(p.parent.kind);
      const mutableCollection = p.node.init?.type === 'NewExpression' && ['Map', 'Set', 'WeakMap'].includes(p.node.init.callee.name);
      if ((mutableBinding || mutableCollection) && p.scope.path.isProgram()) fail(p.node, 'module-level mutable state');
    },
  });
  return violations;
};

test('the guard catches each kind of impurity', () => {
  const bad = "import React from 'react';\nimport { x } from '../../db/client';\nlet n = 0;\nconst cache = new Map();\n"
    + 'export const f = () => [Date.now(), new Date(), Math.random(), Date(), console.log(1)];';
  expect(auditEngineSource(bad, path.join(ENGINE, 'bad.js'))).toHaveLength(9);
});

test('the guard allows date arithmetic on input strings', () => {
  const good = "import { READING_LEVELS } from '../../constants/literacyConstants';\n"
    + "export const day = (d) => [Date.parse(`${d}T00:00:00Z`), new Date(Date.UTC(2026, 9, 19)).getUTCDay(), READING_LEVELS];";
  expect(auditEngineSource(good, path.join(ENGINE, 'good.js'))).toEqual([]);
});

test('engine files are pure (spec §7.3)', () => {
  const violations = files(ENGINE).flatMap((f) => auditEngineSource(fs.readFileSync(f, 'utf8'), f));
  expect(violations).toEqual([]);
});
```

- [ ] **Step 4: Write the first case (tracer bullet)** in `letters.vectors.json`, with `defaults.computeLessonPlan` = `{ "today": "2026-10-19", "academicYearStart": "2026-01-14", "programmeId": "p-lit", "groupId": "g1", "upNextGroupId": "g1", "languageCode": "xh", "pack": "xh-mini", "alphabet": a–z, "isEcd": false, "presentChildren": [], "sessions": [] }`:

```json
{ "name": "pair, both present: the next two unmastered letters", "spec": "§4.4, J5", "fn": "computeLessonPlan",
  "input": { "presentChildren": [
    { "id": "A", "readingLevel": null, "knownLetters": ["o","m","l","a"], "historyComplete": true, "masteryComplete": true },
    { "id": "B", "readingLevel": null, "knownLetters": ["o","m","l","a","k"], "historyComplete": true, "masteryComplete": true } ] },
  "expect": { "reason": "ok", "present_child_ids": ["A","B"], "known_letters": ["o","m","l","a"],
    "suggested_letters": ["k","u"], "review_letters": ["o","m","l","a"], "unlocked_letters": ["o","m","l","a","k","u"] } }
```

- [ ] **Step 5: Run to verify it fails.**
`PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest __tests__/lessonPlanEngine.vectors.test.js __tests__/lessonPlanEnginePurity.test.js`
Expected: FAIL. The vectors cannot resolve `../src/lessonPlan/engine`. The purity guard's two self-tests pass, and its scan fails on the missing directory.

- [ ] **Step 6: Implement the letters rule** in `letters.js` and `computeLessonPlan` in `lessonPlan.js`:
  - `isLetterGroupMastered(covered, present)`:
    - `present <= 0` → false;
    - `present < 3` → `covered === present`;
    - otherwise `5 * covered >= 4 * present || present - covered <= 1`. Integer arithmetic, so no float edge at exactly 80%.
  - Usable pack per the shared rule, through `PACK_LANGUAGE_BY_CODE`.
  - Known (group-mastered) letters = the teaching order filtered by `isLetterGroupMastered`, counting each present child; a child with no data knows nothing. Under `no_pack`, filter `alphabet ?? []` instead.
  - Suggested = the first `SUGGESTED_LETTER_COUNT` teaching-order letters that are not group-mastered. Letters mastered out of order are skipped.
  - `k` = the step of the last suggested letter. With nothing left: `all_letters_known`, every step unlocked.
  - Unlocked (C3) = teaching-order letters whose step ≤ k, plus group-mastered letters, in teaching order.
  - Review = unlocked minus suggested, in teaching order.
  - `history_complete` / `mastery_complete` = every present child's flag `=== true`.
  - `no_children` and `no_pack` give empty `suggested_letters`, `review_letters` and `unlocked_letters`. `known_letters` is `[]` for `no_children`.
  - Export through `index.js`.
- [ ] **Step 7: Run to verify it passes.** Same command. Expected: PASS.
- [ ] **Step 8: Add the remaining cases one at a time**, running the runner after each (red, then green, then the next case). Every case uses `fn: "computeLessonPlan"`. The table lists only the keys each case asserts.

| Name | Spec | Input (`presentChildren` unless stated) | Expect |
| --- | --- | --- | --- |
| partner absent: the plan follows the child present | C1 | `kid(B, o m l a k)` | ok; present `[B]`; known `o m l a k`; suggested `u e`; review `o m l a k n`; unlocked `o m l a k u e n` |
| out-of-order mastery is skipped and stays unlocked | §4.4, C3 | both `o m l a t` | known `o m l a t`; suggested `k u`; review `o m l a t`; unlocked `o m l a k u t` |
| a child with no data counts as knowing nothing | §4.4 | `kid(A, o m l a k u, !hist)`, `kid(C, —, !hist)` | ok; known `[]`; suggested `o m`; review `l a`; unlocked `o m l a` |
| three children: one may lag | §4.4 | A, B `o m l a k`; C `o m l a` | known `o m l a k`; suggested `u e` |
| five children: 80% or at most one behind | §4.4 | A, B, C `o m l a k u`; D `o m l a k`; E `o m l a` | known `o m l a k`; suggested `u e` |
| all letters known | C9, §4.8 | both `a–z` | `all_letters_known`; suggested `[]`; known, unlocked and review all `XH26` |
| one letter left: one suggestion | §4.4 | A `a–z` minus `r`; B `a–z` | ok; suggested `r`; unlocked `XH26`; review `XH26` without `r` |
| no pack: nothing suggested, known letters in the given alphabet's order | C10, §4.8 | `pack: null`; both `o m l a` | `no_pack`; known `a l m o`; suggested, review, unlocked `[]` |
| Afrikaans code uses the Afrikaans interim order | §10, C10 | `languageCode: af`, `pack: af-interim`; both `a s m e` | ok; known `a s m e`; suggested `k i`; review `a s m e`; unlocked `a s m e k i` |
| a pack for another language counts as no pack | §4.1 | `languageCode: af`, `pack: xh-mini`; `kid(A, o m l a)` | `no_pack`; known `a l m o` |
| English interim order | C10 | `languageCode: en`, `pack: en-interim`; both `a m s t` | suggested `n i`; unlocked `a m s t n i` |
| R6 a class with no language never borrows a pack | Review Focus 2, §4.2 | `languageCode: null`, `pack: xh-mini`, `alphabet: null`; `kid(A, o m l a)` | `no_pack`; known `[]`; suggested, review, unlocked `[]` |
| R7 isiZulu has a code but no pack | Review Focus 2 | `languageCode: zu`, `pack: xh-mini`, `alphabet: null`; `kid(A, o m l a)` | `no_pack`; known `[]` |
| everyone absent: no_children | C1, §4.8 | `presentChildren: []` | **exact** `{ engine_version: 1, made_on: "2026-10-19", reason: "no_children", history_complete: true, mastery_complete: true, present_child_ids: [], known_letters: [], suggested_letters: [], review_letters: [], unlocked_letters: [], blend_tier: null, suggested_blends: [], suggested_book: null, up_next_group_id: "g1" }` |
| mastery still downloading: suggestions run, the plan records it | §7.3, §7.6 | `kid(A, o m l a, !mast)`, `kid(B, o m l a k)` | `mastery_complete: false`; `history_complete: true`; suggested `k u` |
| plan envelope | §6 | first case's children; `today: 2026-10-21`, `upNextGroupId: g2` | `engine_version: 1`; `made_on: 2026-10-21`; `up_next_group_id: g2` |
| R1 letter steps listed out of order are read by step number | Review Focus 1 | `pack: xh-letters-reversed`; `kid(A, o m l a)`, `kid(B, o m l a k)` | suggested `k u`; unlocked `o m l a k u` |
| R2 known letters are compared lower-case | Review Focus 5 | `kid(A, O M L A)`, `kid(B, o m l a)` | known `o m l a`; suggested `k u` |
| R3 a child listed twice counts once | Review Focus 5 | `kid(A, o m l a)` twice | present `[A]`; suggested `k u` |

- [ ] **Step 9: Run both test files.** Same command as Step 5. Expected: PASS (all cases and the three guard tests).
- [ ] **Step 10: Commit.**

```bash
git add src/lessonPlan/engine __tests__/lessonPlanEngine.vectors.test.js __tests__/lessonPlanEnginePurity.test.js
git commit -m "feat(lesson-plan): pure engine letters rule with JSON vectors and purity guard"
```

---

### Task 2: First session and the history window

**Files:**
- Create: `src/lessonPlan/engine/history.js`, `src/lessonPlan/engine/vectors/first-session.vectors.json`
- Modify: `src/lessonPlan/engine/letters.js` (`planLetters`), `src/lessonPlan/engine/lessonPlan.js`

**Interfaces:**
- Consumes: Task 1's `planLetters`, `computeLessonPlan`, vector format.
- Produces (internal, `history.js`):
  - `windowSessions(sessions, { programmeId, academicYearStart, today }) → SessionRecord[]`;
  - `sessionsByChild(windowed) → (childId) → SessionRecord[]` (newest first, per the Window rule);
  - `isLessonPlanSession(session) → boolean`.
  - `planLetters` now applies the first-session rule. Task 3 and Task 6 consume all three helpers.

- [ ] **Step 1: Write the first case** in `first-session.vectors.json`, with the same `defaults.computeLessonPlan` as Task 1: "first session: every step-1 letter not yet known" (§4.4, J5). Input `kid(A, —)`, `kid(B, —)`. Expect `first_session`; suggested `o m l a`; review `[]`; unlocked `o m l a`; known `[]`; `history_complete: true`.
- [ ] **Step 2: Run to verify it fails.**
`PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest __tests__/lessonPlanEngine.vectors.test.js -t "first-session"`
Expected: FAIL. Today's rule gives `ok` and `o m`.
- [ ] **Step 3: Implement.** Build `history.js` per the shared Window and Lesson-plan session rules. `computeLessonPlan` windows `input.sessions` once and passes `childSessions` to `planLetters`. First session (§4.4) applies when all three hold:
  - every present child's `historyComplete === true`;
  - no present child has a lesson-plan session in the window;
  - some step-1 letter is not group-mastered.

  Then suggested = every step-1 letter not group-mastered, in teaching order, and `k = 1`. Never infer a first session from incomplete history (§7.3).
- [ ] **Step 4: Run to verify it passes.** Same command. Expected: PASS.
- [ ] **Step 5: Add the remaining cases one at a time** (red, green, next):

| Name | Spec | Input | Expect |
| --- | --- | --- | --- |
| first session with l already known suggests o m a | §4.4 (Zazi rev 4.1 §4.3) | both `l` | `first_session`; suggested `o m a`; review `l`; unlocked `o m l a`; known `l` |
| step 1 already known: the normal rule | §4.4 | both `o m l a` | ok; suggested `k u` |
| a lesson-plan session this year ends the first session | §4.4 | both `—`; `S(s1, 03-02, A, lesson)` | ok; suggested `o m`; review `l a`; unlocked `o m l a` |
| an old-form session is not a lesson-plan session | §4.4 | both `—`; `S(s1, 03-02, A, old)` | `first_session` |
| F6 last year's lesson-plan session is ignored | §7.3, Review Focus 3 | both `—`; `S(s1, 2025-10-01, A, lesson)` | `first_session` |
| another programme's lesson-plan session is ignored | §7.3 | both `—`; `S(s1, 03-02, A, lesson, prog p-num)` | `first_session` |
| F8 a session dated after today is ignored | Review Focus 3 | both `—`; `S(s1, 10-20, A, lesson)` (today 10-19) | `first_session` |
| an uncovered child keeps history incomplete: no first session | §7.3 | `kid(A, —)`, `kid(B, —, !hist)` | ok; `history_complete: false`; suggested `o m` |
| a child added for the day counts like any present child | C18 | `kid(A, —)`, `kid(X, o m l a)`; `S(s1, 10-01, X, lesson)` | ok; present `[A, X]`; known `[]`; suggested `o m` |
| R4 a lesson object without blends still marks a lesson-plan session | Review Focus 4 | both `—`; `S(s1, 03-02, A)` with `"lesson": { "version": 1 }` | ok; suggested `o m` |
| R5 a non-object lesson value is not a lesson-plan session | Review Focus 4 | both `—`; `S(s1, 03-02, A)` with `"lesson": "x"` | `first_session` |

The three §10 history cases ("history complete vs last year's window vs an uncovered child") are pinned here from the engine's side: complete history allows `first_session`, and an incomplete child blocks it. The engine also drops last year's rows itself. The completeness predicate (year rollover before the next pull; a child assigned between walks) is the C1 lesson-draft plan's `isSessionHistoryComplete` (over `isCoverageWalkComplete`) and is tested there.

- [ ] **Step 6: Run** `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest __tests__/lessonPlanEngine.vectors.test.js __tests__/lessonPlanEnginePurity.test.js`. Expected: PASS, including every Task 1 case.
- [ ] **Step 7: Commit.**

```bash
git add src/lessonPlan/engine
git commit -m "feat(lesson-plan): first-session rule and the academic-year history window"
```

---

### Task 3: Up next (`rankGroups`)

**Files:**
- Create: `src/lessonPlan/engine/groups.js`, `src/lessonPlan/engine/vectors/groups.vectors.json`
- Modify: `src/lessonPlan/engine/index.js`

**Interfaces:**
- Consumes: Task 2's `windowSessions`, `sessionsByChild`; Task 1's `planLetters`, `usablePack`.
- Produces: `rankGroups(input: RankGroupsInput) → { upNextGroupId: string|null, rows: GroupRow[] }` (§4.3, C2). C3's picker renders `rows`; C3 passes `upNextGroupId` into `LessonInput`.

Rules (all on the windowed sessions):
- `lastSeenOn` = the latest `session_date` of a session attended by any current member (a deduplicated `memberIds`). It counts sessions of other groups the member joined.
- `taughtToday` = `lastSeenOn === today`.
- `sessionsThisWeek` = the member-attended sessions dated Monday-of-`today` through `today`. Monday comes from the UTC weekday of `Date.parse(today + 'T00:00:00Z')`, with no clock read.
- `nextLetters` / `lettersReason` = `planLetters` over every current member as present, with the group's own `languageCode` and `pack` (and `alphabet: null`: a row shows no letters without a usable pack). A member missing from `children` is `{ id, readingLevel: null, knownLetters: [], historyComplete: false, masteryComplete: false }`.
- Row order (one comparator):
  1. eligible rows (at least one member and not taught today) before the rest;
  2. never seen before seen;
  3. older `lastSeenOn` first;
  4. fewer `sessionsThisWeek` first;
  5. lower `displayNumber` first (null last);
  6. `name`, then `id` (plain string comparison).
- `upNextGroupId` = the first row's id when that row is eligible, else `null`.

- [ ] **Step 1: Write the first case.** Set `defaults.rankGroups` = `{ "today": "2026-10-21", "academicYearStart": "2026-01-14", "programmeId": "p-lit", "children": { c1…c7, c9: kid(cN, o m l a) }, "groups": [G(g1, 1, c1 c2), G(g2, 2, c3 c4), G(g3, 3, c5 c6)], "sessions": [] }`. Here `G(g1, 1, c1 c2)` = `{ "id": "g1", "name": "Group 1", "displayNumber": 1, "memberIds": ["c1","c2"], "languageCode": "xh", "pack": "xh-mini" }`, and sessions are `S(…, lesson)`. Write case "a never-seen group comes first" (§4.3) with `S(a, 10-19, c1 c2)`, `S(b, 10-20, c3 c4)`. Expect `upNextGroupId: g3`; rows `[{ groupId: g3, lastSeenOn: null }, { groupId: g1, lastSeenOn: "2026-10-19" }, { groupId: g2, lastSeenOn: "2026-10-20" }]`.
- [ ] **Step 2: Run to verify it fails.**
`PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest __tests__/lessonPlanEngine.vectors.test.js -t "groups"`
Expected: FAIL ("rankGroups is not exported by the engine").
- [ ] **Step 3: Implement `rankGroups`** per the rules above; export it.
- [ ] **Step 4: Run to verify it passes.** Same command. Expected: PASS.
- [ ] **Step 5: Add the remaining cases one at a time.** "g1, g2" means `groups: [G(g1…), G(g2…)]`.

| Name | Spec | Input | Expect |
| --- | --- | --- | --- |
| the oldest last seen is up next | §4.3 | `S(a,10-16,c1 c2)`, `S(b,10-19,c3 c4)`, `S(c,10-20,c5 c6)` | up next `g1`; row ids `g1 g2 g3` |
| a group taught today is skipped and listed last | §4.3 | g1, g2; `S(a,10-21,c1 c2)`, `S(b,10-20,c3 c4)` | up next `g2`; rows `[{g2, taughtToday: false}, {g1, lastSeenOn: "2026-10-21", taughtToday: true}]` |
| last seen counts any current member, even in another group's lesson | §4.3, C2 | `S(a,10-15,c1 c2)`, `S(b,10-20,c3 c4 c1)`, `S(c,10-19,c5 c6)` | up next `g3`; row ids `g3 g1 g2`; g1 `lastSeenOn: "2026-10-20"` |
| a former member's sessions do not count | §4.3 | g1, g2; `S(a,10-15,c1 c2)`, `S(b,10-19,c3 c4)`, `S(c,10-20,c9)` | up next `g1`; row ids `g1 g2`; g1 `lastSeenOn: "2026-10-15"` |
| tie on last seen: fewest sessions this week | C2 | g1, g2; `S(a,10-19,c1 c2)`, `S(b,10-20,c1 c2)`, `S(c,10-20,c3 c4)` | up next `g2`; rows `[{g2, sessionsThisWeek: 1}, {g1, sessionsThisWeek: 2}]` |
| the week starts on Monday | C2 | g1, g2; `S(a,10-16,c1 c2)`, `S(b,10-20,c1 c2)`, `S(c,10-19,c3 c4)`, `S(d,10-20,c3 c4)` | up next `g1`; row ids `g1 g2`; g1 week `1`; g2 week `2` |
| full tie: lower group number first | C2 | groups `G(g10, 10, c1 c2)`, `G(g2, 2, c3 c4)` | up next `g2`; row ids `g2 g10` |
| every group taught today: no up next | §4.3 | g1, g2; `S(a,10-21,c1 c2)`, `S(b,10-21,c3 c4)` | `upNextGroupId: null`; row ids `g1 g2`, both `taughtToday: true` |
| a group with no current members is never up next | §4.3 | `G(g1,1,c1 c2)`, `G(g5,5,—)`; `S(a,10-20,c1 c2)` | up next `g1`; rows `[{g1}, {g5, lastSeenOn: null, nextLetters: [], lettersReason: "no_children"}]` |
| G11 last year's sessions do not count as seen | §7.3, Review Focus 3 | g1, g2; `S(a,2025-11-01,c1 c2)`, `S(b,10-20,c3 c4)` | up next `g1`; row ids `g1 g2`; g1 `lastSeenOn: null` |
| G12 a session dated after today is ignored | Review Focus 3 | g1, g2; `S(a,10-15,c1 c2)`, `S(b,10-22,c1 c2)`, `S(c,10-19,c3 c4)` | up next `g1`; row ids `g1 g2`; g1 `lastSeenOn: "2026-10-15"`, `sessionsThisWeek: 0` |
| G13 the same session listed twice counts once | Review Focus 5 | g1, g2; `S(a,10-20,c1 c2)` twice, `S(b,10-19,c3 c4)`, `S(c,10-20,c3 c4)` | up next `g1`; row ids `g1 g2`; g1 week `1`; g2 week `2` |
| rows carry the next letters for all current members | §4.3 | `children` with c2 `o m l a k`; groups `[g1]` | rows `[{groupId: g1, nextLetters: ["k","u"], lettersReason: "ok"}]` |
| a new group's row shows the step-1 letters | §4.4 | `children: { c1: kid(c1, —), c2: kid(c2, —) }`; groups `[g1]` | `nextLetters: ["o","m","l","a"]`, `lettersReason: "first_session"` |
| a group without a pack shows no letters | C10 | groups `[G(g1,1,c1 c2) with pack null]` | `nextLetters: []`, `lettersReason: "no_pack"` |
| G17 a member missing from children knows nothing and has incomplete history | Review Focus 5 | `children: {}`; groups `[g1]` | `nextLetters: ["o","m"]`, `lettersReason: "ok"` |
| no group numbers: name order | C2 | groups `{id gB, name "Bulelani", displayNumber null, [c1]}`, `{id gA, name "Amahle", displayNumber null, [c3]}` | up next `gA`; row ids `gA gB` |

- [ ] **Step 6: Run** the vectors and purity guard (Task 2, Step 6 command). Expected: PASS.
- [ ] **Step 7: Commit.**

```bash
git add src/lessonPlan/engine
git commit -m "feat(lesson-plan): rankGroups for Up next"
```

---

### Task 4: Save-time and lesson-context rules (C14, C1, C18)

**Files:**
- Create: `src/lessonPlan/engine/lessonClass.js`, `src/lessonPlan/engine/vectors/lesson-context.vectors.json`
- Modify: `src/lessonPlan/engine/lessonPlan.js`, `src/lessonPlan/engine/index.js`

**Interfaces:**
- Consumes: the `Plan` type.
- Produces: `planForSave`, `isPlanRecomputable`, `resolveLessonClass` (signatures in the API table).
  - `resolveLessonClass` rules:
    - a non-null `groupClassId` wins;
    - otherwise drop null member classes and de-duplicate in first-seen order;
    - exactly one class left → `{ classId, choices: [] }`;
    - otherwise `{ classId: null, choices }`.

- [ ] **Step 1: Write the first case:** "a plan is kept when the lesson date is the day it was made, however late the save" (C14). `fn: planForSave`; input `{ plan: { engine_version: 1, made_on: "2026-10-19", reason: "ok" }, lessonDate: "2026-10-19" }`; **exact** `{ plan: { engine_version: 1, made_on: "2026-10-19", reason: "ok" }, plan_reason: null }`. A Monday lesson saved on Wednesday still has lesson date Monday, so `today` is deliberately not an input.
- [ ] **Step 2: Run to verify it fails.**
`PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest __tests__/lessonPlanEngine.vectors.test.js -t "lesson-context"`
Expected: FAIL ("planForSave is not exported by the engine").
- [ ] **Step 3: Implement** `planForSave` and `isPlanRecomputable` in `lessonPlan.js`, and `resolveLessonClass` in `lessonClass.js`; export them.
- [ ] **Step 4: Run to verify it passes.** Expected: PASS.
- [ ] **Step 5: Add the remaining cases one at a time.** A row without a function name uses the one named in the row above it.

| Name | Spec | `fn` and input | Expect |
| --- | --- | --- | --- |
| a changed lesson date drops the plan | C14 | `planForSave`; same plan, `lessonDate: "2026-10-16"` | **exact** `{ plan: null, plan_reason: "past_date" }` |
| a missing plan is a programming error | C14 | `planForSave`; `{ plan: null, lessonDate: "2026-10-19" }` | `throws: "planForSave needs a plan"` |
| an unfrozen plan on its own day may be recomputed | C1 | `isPlanRecomputable`; `{ lessonDate: "2026-10-19", today: "2026-10-19", frozen: false }` | `true` |
| a plan is fixed after the first tick | C1 | same with `frozen: true` | `false` |
| a draft resumed on a later day keeps its plan | C14 | `{ lessonDate: "2026-10-19", today: "2026-10-21", frozen: false }` | `false` |
| the group's class wins | C18 | `resolveLessonClass`; `{ groupClassId: "cA", memberClassIds: ["cB","cB"] }` | **exact** `{ classId: "cA", choices: [] }` |
| a classless group takes the class its members share | C18 | `{ groupClassId: null, memberClassIds: ["cA","cA"] }` | **exact** `{ classId: "cA", choices: [] }` |
| a mixed-class group asks once | C18 | `{ groupClassId: null, memberClassIds: ["cA","cB"] }` | **exact** `{ classId: null, choices: ["cA","cB"] }` |
| a member with no class does not block the shared class | C18 | `{ groupClassId: null, memberClassIds: ["cA", null] }` | **exact** `{ classId: "cA", choices: [] }` |
| no member has a class | C18 | `{ groupClassId: null, memberClassIds: [null] }` | **exact** `{ classId: null, choices: [] }` |
| member classes are de-duplicated in first-seen order | C18 | `{ groupClassId: null, memberClassIds: ["cB","cA","cB"] }` | **exact** `{ classId: null, choices: ["cB","cA"] }` |

- [ ] **Step 6: Run** the vectors and purity guard. Expected: PASS.
- [ ] **Step 7: Commit.**

```bash
git add src/lessonPlan/engine
git commit -m "feat(lesson-plan): planForSave, isPlanRecomputable and resolveLessonClass"
```

---

### Task 5: Blend tiers and the session reading level (C4, C11) — needs A1's vendored checker

**Files:**
- Create: `src/lessonPlan/engine/sounds.js`, `src/lessonPlan/engine/blends.js`, `src/lessonPlan/engine/vectors/tiers.vectors.json`
- Modify: `src/lessonPlan/engine/constants.js` (`BLEND_TIERS`), `src/lessonPlan/engine/index.js`

**Interfaces:**
- Consumes: A1's `normalizeToken` and `splitSounds` from `src/utils/decodability`; `READING_LEVELS` (`src/constants/literacyConstants.js:11-19`).
- Produces:
  - `BLEND_TIERS`;
  - `blendTierForReadingLevel(level) → BlendTier`;
  - `deriveSessionReadingLevel(blendsDone) → BlendTier|null`.
  - Internal: `tierForLetterCount(n) → BlendTier` (n ≤ 2 → `2 Letter Blends`; 3; 4; ≥ 5 → `Word Reading`); `letterCount(text)` and `soundsOf(text, pack)` in `sounds.js`.
  - Mapping (C4):
    - `Cannot blend`, `null`, `2 Letter Blends`, and any unknown string → `2 Letter Blends`;
    - `3 Letter Blends` → 3; `4 Letter Blends` → 4;
    - `Word Reading`, `Sentence Reading`, `Paragraph Reading` → `Word Reading`.
  - `deriveSessionReadingLevel` (C11): the highest tier among the items, each counted by its own letter count. Items with letter count 0 are ignored. A non-array input or no counted item → `null`.

- [ ] **Step 1: Write the first case:** "Cannot blend practises 2-letter items" (C4). `fn: blendTierForReadingLevel`, `args: ["Cannot blend"]`, `expect: "2 Letter Blends"`.
- [ ] **Step 2: Run to verify it fails.**
`PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest __tests__/lessonPlanEngine.vectors.test.js -t "tiers"`
Expected: FAIL (not exported).
- [ ] **Step 3: Implement** `sounds.js` and the tier functions in `blends.js`; export them.
- [ ] **Step 4: Run to verify it passes.** Expected: PASS.
- [ ] **Step 5: Add the remaining cases one at a time.** Every case uses `args`. A call without a function name uses the one named in the row above it.

| Name | Spec | Call | Expect |
| --- | --- | --- | --- |
| Not set practises 2-letter items | C4 | `blendTierForReadingLevel(null)` | `2 Letter Blends` |
| 2 Letter Blends stays 2-letter | C4 | `("2 Letter Blends")` | `2 Letter Blends` |
| 3 Letter Blends practises 3-letter items | C4 | `("3 Letter Blends")` | `3 Letter Blends` |
| 4 Letter Blends practises 4-letter items | C4 | `("4 Letter Blends")` | `4 Letter Blends` |
| Word Reading practises words | C4 | `("Word Reading")` | `Word Reading` |
| Sentence Reading practises words | C4 | `("Sentence Reading")` | `Word Reading` |
| Paragraph Reading practises words | C4 | `("Paragraph Reading")` | `Word Reading` |
| an unknown level counts as Not set | C4 | `("Advanced")` | `2 Letter Blends` |
| no blends ticked: no session reading level | C11 | `deriveSessionReadingLevel([])` | `null` |
| top-up items only count at their own tier | C11 | `(["mo","la"])` | `2 Letter Blends` |
| mixed tiers: the highest | C11 | `(["ma","lam","mama"])` | `4 Letter Blends` |
| show higher: a ticked word sets Word Reading | C11 | `(["umama"])` | `Word Reading` |
| hyphens do not count as letters | C11 | `(["u-ma-ma"])` | `Word Reading` |
| a 3-letter word sets 3 Letter Blends | C11 | `(["lam"])` | `3 Letter Blends` |
| a non-array is no reading level | C11 | `("x")` | `null` |
| empty items are ignored | C11 | `(["", "-"])` | `null` |

- [ ] **Step 6: Run** the vectors and purity guard. Expected: PASS.
- [ ] **Step 7: Commit.**

```bash
git add src/lessonPlan/engine
git commit -m "feat(lesson-plan): blend tiers and the derived session reading level"
```

---

### Task 6: Blends and `computeLessonChoices` (§4.5, §4.6) — needs A1's vendored checker

**Files:**
- Create: `src/lessonPlan/engine/vectors/blends.vectors.json`
- Modify: `src/lessonPlan/engine/blends.js`, `src/lessonPlan/engine/history.js` (`lessonBlends`), `src/lessonPlan/engine/lessonPlan.js` (`evaluateLesson`, `computeLessonChoices`, blend fields of the plan), `src/lessonPlan/engine/index.js`
- Test: `__tests__/lessonPlanEngine.vectors.test.js` (add the plan/choices agreement check)

**Interfaces:**
- Consumes:
  - Task 2's `windowSessions`, `sessionsByChild`, `isLessonPlanSession`;
  - Task 5's `soundsOf`, `letterCount`, `tierForLetterCount`, `blendTierForReadingLevel`, `BLEND_TIERS`.
- Produces:
  - `computeLessonChoices(input) → LessonChoices`:
    - `letterChoices` = the teaching order, or `alphabet ?? []` when there is no usable pack;
    - `tiers` = `[]` for `no_children` and `no_pack`, otherwise one `TierChoice` per distinct present-child tier, ascending, with `childIds` in `presentChildren` order;
    - `books: []` and `contentAvailable.books: false` until Task 7;
    - `contentAvailable.blends` = the **usable** pack has any step `blends` or any `word_bank` entry (`false` under `no_pack`, whatever pack was passed; plan call).
  - `plan.blend_tier = tiers[0]?.tier ?? null` and `plan.suggested_blends = tiers[0].suggested` texts.
  - **Frozen-plan anchor:** `computeLessonChoices(input, { plan })` implements the shared Frozen plan rule for blends. Task 7 adds its book part.
    - It takes `reason`, `suggested_letters`, `unlocked_letters` and `made_on` (as the rotation day) from the plan, instead of recomputing them.
    - When `plan.blend_tier` is a `BLEND_TIERS` label, `tiers[0]` is that tier with `plan.suggested_blends` as its suggestions. Its pool, the higher tiers and every `childIds` are refreshed from `input`.
    - Children, reading levels, history and the pack still come from `input`.
    - With no usable pack, or no present children, `tiers` and `books` are `[]` whatever the plan says.
    - So `computeLessonChoices(input, { plan: computeLessonPlan(input) })` always equals `computeLessonChoices(input)`.
  - Internal:
    - `lessonBlends(session) → string[]` (normalised `blends_done`, `[]` when not an array);
    - `rotationOffset(groupId, today, count) → number`.

Pool and ranking (§4.6, C4, C5; not determined by the signatures):

```js
// Items of one tier, in pack order, first occurrence of each normalised text wins:
//   2 Letter Blends → every letter_steps[].blends item with letterCount(text) === 2 (steps in step order, then list order); display = text
//                     (C5: syllables. A1's step_blend_length rejects any other length in a linted pack; the engine re-checks it,
//                      so a pack that skipped the lint cannot offer a longer item at this tier. Such an item is in no tier:
//                      3/4/Word read only the word bank.)
//   3/4/Word        → word_bank entries whose letterCount maps to that tier (3, 4, ≥5); display = syllables || text
// Keep items whose sounds are all unlocked (shared rule). Then:
const rotationOffset = (groupId, today, count) => {             // Zazi blendingAdvice.js suggestionOffset, day from the SAST key
  let hash = 0;
  for (const ch of String(groupId)) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
  const day = Date.parse(`${today}T00:00:00Z`) / 86400000;
  const offset = ((hash + day) % count + count) % count;
  return Number.isFinite(offset) ? offset : 0;
};
// rotated = usable[(offset + i) % n] for i in 0..n-1
// ranked  = concat of four buckets taken from `rotated` in order (no reliance on sort stability):
//   [contains a suggested letter & not recent] [contains & recent] [no suggested letter & not recent] [no & recent]
//   "recent" = normalised text in blends_done of any present child's last BLEND_RECENT_SESSIONS (3) sessions
// TierChoice.pool = ranked(tier); while pool.length < 6, append ranked(next lower tier) (nearest first, whole tiers)
// TierChoice.suggested = pool.slice(0, BLEND_SUGGESTION_COUNT)
// Frozen plan whose blend_tier is a BLEND_TIERS label (shared Frozen plan rule):
//   tiers[0]  = { tier: plan.blend_tier, childIds: present children at or below it,
//                 suggested: plan.suggested_blends as BlendItems, pool: suggested, then pool(tier) without them }
//   tiers[1…] = one per present-child tier above plan.blend_tier, ascending, built as above
```

- [ ] **Step 1: Write the first case** in `blends.vectors.json` (`defaults.computeLessonChoices` and `defaults.computeLessonPlan` both equal Task 1's defaults): "2-letter tier on a first session: unlocked syllables only" (C5, §4.5). `fn: computeLessonChoices`, `view: summary`; input `kid(A, —)`, `kid(B, —, @C)`. Expect `tiers: [{ tier: "2 Letter Blends", childIds: ["A","B"], suggested: ["la","mo","ma","lo"], pool: ["la","mo","ma","lo"] }]`.
- [ ] **Step 2: Run to verify it fails.**
`PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest __tests__/lessonPlanEngine.vectors.test.js -t "blends"`
Expected: FAIL (not exported).
- [ ] **Step 3: Implement** `evaluateLesson`, `computeLessonChoices` (with the frozen-plan anchor) and the plan's blend fields per the block above. Tokenise once (shared rule).
- [ ] **Step 4: Run to verify it passes.** Expected: PASS.
- [ ] **Step 5: Add the remaining cases one at a time** (`view: summary` unless the row says otherwise).

  Rows Z1–Z3 freeze `P`, the plan `computeLessonPlan` returns on 2026-10-19 for `kid(A, o m l a, @2)`, `kid(B, o m l a k, @3)` with no sessions (Task 7's "the full §6 plan" case), and then change one input. The JSON writes `P` out in full: `{ "engine_version": 1, "made_on": "2026-10-19", "reason": "ok", "history_complete": true, "mastery_complete": true, "present_child_ids": ["A","B"], "known_letters": ["o","m","l","a"], "suggested_letters": ["k","u"], "review_letters": ["o","m","l","a"], "unlocked_letters": ["o","m","l","a","k","u"], "blend_tier": "2 Letter Blends", "suggested_blends": ["ku","ka","ko","mu","lu","lo"], "suggested_book": "xh-mini-r03", "up_next_group_id": "g1" }`. Unchanged, `P` gives exactly the "show higher" tiers. These rows assert only `tiers`, so Task 7's books leave them green.

| Name | Spec | Input | Expect |
| --- | --- | --- | --- |
| a thin 3-letter tier is topped up from 2-letter | C4 | both `—@3` | tiers `[{ tier: "3 Letter Blends", childIds: [A,B], suggested: alo lam ala la mo ma, pool: alo lam ala la mo ma lo }]` |
| items with today's letters come first | §4.6 rank 1 | both `o m l a@3` | suggested `kum oku alo lam ala ku`; pool `kum oku alo lam ala ku ka ko mu lu lo la mo ma` |
| an item a present child practised in their last 3 sessions drops behind | §4.6 rank 2 | as above + `S(s1,10-16,A,lesson[kum])` | suggested `oku kum alo lam ala ku` |
| practised four sessions ago is not recent | §4.6 | as above but `S(s1,10-12,A,lesson[kum])`, `S(s2,10-13,A,lesson)`, `S(s3,10-14,A,lesson)`, `S(s4,10-15,A,lesson)` | suggested `kum oku alo lam ala ku` |
| B6 recent items match after normalising | Review Focus 4 | both `o m l a@3` + `S(s1,10-16,A,lesson[KUM])` | suggested `oku kum alo lam ala ku` |
| the rotation moves one place per day | §4.6 rank 3 | both `—`; `today: 2026-10-20` | suggested `mo ma lo la` (the first case, on 10-19, gave `la mo ma lo`) |
| the rotation differs per group | §4.6 rank 3 | both `—`; `groupId: g2` | suggested `mo ma lo la` |
| a word with a multi-letter sound waits for the sound steps | §4.5, C9 | `kid(A, a–z, @W)`, `kid(B, a–z, @P)` | tiers `[{ tier: "Word Reading", childIds: [A,B], suggested: mamela oomama umama kulala nalo onke, pool: mamela oomama umama kulala nalo onke molo mama lala kulo lula }]` (no `thula`) |
| show higher: one tier per present child's level | J7 | `kid(A, o m l a, @2)`, `kid(B, o m l a, @3)` | tiers `[{ tier: 2 Letter Blends, childIds: [A], suggested: ku ka ko mu lu lo, pool: ku ka ko mu lu lo la mo ma }, { tier: 3 Letter Blends, childIds: [B], suggested: kum oku alo lam ala ku, pool: kum oku alo lam ala ku ka ko mu lu lo la mo ma }]` (step 2's repeated `ma` appears once) |
| the default tier is the lowest present child's | J7 | same; `fn: computeLessonPlan` | `blend_tier: "2 Letter Blends"`; `suggested_blends: ku ka ko mu lu lo` |
| a Word-tier child on a first session cascades down two tiers | C4 | `kid(A, —, @W)` | suggested `oomama lala molo mama alo lam`; pool `oomama lala molo mama alo lam ala` |
| items carry display syllables and their own tier | §5.2, C11 | `kid(A, —, @3)`; full view (no `view`) | `tiers[0].pool` = `alo/a-lo/3`, `lam/lam/3`, `ala/a-la/3`, `la/la/2`, `mo/mo/2`, `ma/ma/2`, `lo/lo/2` as `{ text, display, tier }` (tiers by full label) |
| B15 a letters-only interim pack has no blend content | C10, Review Focus 1 | `languageCode: en`, `pack: en-interim`; `kid(A, a m s t)` | tiers `[{ tier: 2 Letter Blends, childIds: [A], suggested: [], pool: [] }]`; `contentAvailable: { blends: false, books: false }` |
| no pack: no tiers, the alphabet to choose from | C10, §4.8 | `languageCode: af`, `pack: null`; `kid(A, a)` | tiers `[]`; `letterChoices` `a–z`; `contentAvailable: { blends: false, books: false }` |
| B16 no language: no tiers and nothing to choose, never another language's pack | Review Focus 2, §4.2 | `languageCode: null`, `pack: xh-mini`, `alphabet: null`; `kid(A, a)` | tiers `[]`; `books: []`; `letterChoices: []`; `contentAvailable: { blends: false, books: false }` (Task 7 must keep this green: `xh-mini` has readers) |
| no children: no tiers | §4.8 | `presentChildren: []` | tiers `[]`; `letterChoices` `XH26` |
| letter choices follow the teaching order | §4.2, §5.2 | `kid(A, —)` | `letterChoices` `XH26` |
| after the plan freezes, choices follow the frozen letters | C1 | `today: 2026-10-21`; `kid(A, o m l a k u e n, @2)`, `kid(B, o m l a k, @3)`; `options: { plan: { engine_version: 1, made_on: "2026-10-19", reason: "ok", suggested_letters: ["k","u"], unlocked_letters: ["o","m","l","a","k","u"] } }` | tiers exactly as in "show higher" above (`ku ka ko mu lu lo` / `kum oku alo lam ala ku`, same pools). Without the plan, A's newer letters would give `u e`. The plan has no blend fields, so the Frozen plan rule's `null` branch builds the tiers from the frozen letters |
| a frozen plan without a usable pack gives no tiers | C1, §4.1 | `pack: null`; `kid(A, o m l a)`; `options: { plan: { made_on: "2026-10-19", reason: "ok", suggested_letters: ["k","u"], unlocked_letters: ["o","m","l","a","k","u"] } }` | tiers `[]`; `letterChoices` `a–z` |
| Z1 a frozen plan keeps its tier after the reading levels change | C1, J7, Review Focus 6 | `kid(A, o m l a, @3)`, `kid(B, o m l a k, @3)`; `options: { plan: P }` | tiers `[{ tier: 2 Letter Blends, childIds: [], suggested: ku ka ko mu lu lo, pool: ku ka ko mu lu lo la mo ma }, { tier: 3 Letter Blends, childIds: [A,B], suggested: kum oku alo lam ala ku, pool: kum oku alo lam ala ku ka ko mu lu lo la mo ma }]`. No present child is at 2-letter any more, but it stays the default and selectable. Without the frozen tier, A's new level would make 3-letter the only tier |
| Z2 a frozen plan keeps its six blends after new blend history arrives | C1, §4.6 rank 2, Review Focus 6 | `kid(A, o m l a, @2)`, `kid(B, o m l a k, @3)`; `S(s1,10-16,A,lesson[ku ka])`; `options: { plan: P }` | tiers `[{ tier: 2 Letter Blends, childIds: [A], suggested: ku ka ko mu lu lo, pool: ku ka ko mu lu lo la mo ma }, { tier: 3 Letter Blends, childIds: [B], suggested: kum oku alo lam ala ko, pool: kum oku alo lam ala ko mu lu ku ka lo la mo ma }]`. Re-ranked, the default tier would suggest `ko mu lu ku ka lo`; the higher tier is a browse list and does re-rank |
| Z3 a draft resumed on a later day keeps its frozen blends | C1, C14, Review Focus 6 | `today: 2026-10-21`; `kid(A, o m l a, @2)`, `kid(B, o m l a k, @3)`; `S(s1,10-20,B,lesson[ko mu])` (another EA's lesson, pulled; it is inside the window only because today is now 10-21); `options: { plan: P }` | tiers `[{ tier: 2 Letter Blends, childIds: [A], suggested: ku ka ko mu lu lo, pool: ku ka ko mu lu lo la mo ma }, { tier: 3 Letter Blends, childIds: [B], suggested: kum oku alo lam ala ku, pool: kum oku alo lam ala ku ka lu ko mu lo la mo ma }]`. Re-ranked, the default tier would suggest `ku ka lu ko mu lo` |
| N1 a letter mastered out of order unlocks later steps' blends and words (sound set, not step) | §4.5, C3, Review Focus 7 | `kid(A, o m l a n, @2)`, `kid(B, o m l a n, @3)`, `kid(C, o m l a n, @4)` | tiers `[{ tier: 2 Letter Blends, childIds: [A], suggested: nu ku ka ko mu lu, pool: nu ku ka ko mu lu mo ma lo la na no }, { tier: 3 Letter Blends, childIds: [B], suggested: kum oku mna lam ala alo, pool: kum oku mna lam ala alo }, { tier: 4 Letter Blends, childIds: [C], suggested: kulo lula nalo molo mama lala, pool: kulo lula nalo molo mama lala }]`. Suggested letters are `k u` (step 2), yet step 3's `na no nu`, `mna` and `nalo` are in, because `n` is known. `e` stays locked, so `ne` and `onke` are out |
| B17 a three-letter item in a step's blends never enters the 2-letter tier | §4.6, C5, Review Focus 7 | `pack: xh-long-blend`; `kid(A, —, @C)`, `kid(B, —)` | tiers `[{ tier: 2 Letter Blends, childIds: [A,B], suggested: la mo ma lo, pool: la mo ma lo }]`: the first case's list, with no `lam`. A pool without the length check gives `lam lo la mo ma` |

J19 is visible here: `umama` is on Masi's own isiXhosa word test (`src/assessment-questions/itemsets/word_reading@2026.1.xh.ts:11`, since #90), `umama` and `lala` are outcome-test words in the books project's word bank (`languages/xh/wordbank.csv`, `outcome_tests` = `grid-b-v2`), and both are suggested like any other word.

- [ ] **Step 6: Add the agreement check to the runner** (it covers every `computeLessonPlan` case in every file, so later tasks keep it honest):

```js
const PLAN_CASES = FILES.flatMap((name) => {
  const file = require(path.join(DIR, name));
  return file.cases.filter((c) => c.fn === 'computeLessonPlan' && !c.throws).map((c) => [`${name}: ${c.name}`, file, c]);
});
test.each(PLAN_CASES)('plan and choices agree: %s', (_, file, c) => {
  const input = inputFor(file, c);
  const plan = engine.computeLessonPlan(input);
  const choices = engine.computeLessonChoices(input);
  expect(plan.blend_tier).toBe(choices.tiers[0]?.tier ?? null);
  expect(plan.suggested_blends).toEqual((choices.tiers[0]?.suggested ?? []).map((i) => i.text));
  expect(plan.suggested_blends.length).toBeLessThanOrEqual(engine.BLEND_SUGGESTION_COUNT);
  expect(choices.books.filter((b) => b.suggested).map((b) => b.id)).toEqual(plan.suggested_book ? [plan.suggested_book] : []);
  expect(engine.computeLessonChoices(input, { plan })).toEqual(choices);          // the frozen-plan anchor is the identity on its own plan
});
```

- [ ] **Step 7: Run** the vectors and purity guard. Expected: PASS, including every earlier case and every agreement row.
- [ ] **Step 8: Commit.**

```bash
git add src/lessonPlan/engine __tests__/lessonPlanEngine.vectors.test.js
git commit -m "feat(lesson-plan): blend pool, ranking, rotation, top-up and computeLessonChoices"
```

---

### Task 7: The book (§4.7, C6, C8) — needs A1's vendored checker

**Files:**
- Create: `src/lessonPlan/engine/books.js`, `src/lessonPlan/engine/vectors/books.vectors.json`
- Modify: `src/lessonPlan/engine/history.js` (`lessonBookIds`), `src/lessonPlan/engine/lessonPlan.js` (books, `suggested_book`, `contentAvailable.books`)

**Interfaces:**
- Consumes: Task 6's `evaluateLesson`; Task 5's `soundsOf`; A1's `tokenizeText`, `normalizeToken`.
- Produces:
  - `LessonChoices.books`, `contentAvailable.books` (the usable pack has any non-retired reader; `false` under `no_pack`) and `plan.suggested_book`.
  - Internal:
    - `lessonBookIds(session) → string[]` (ids from `books_read`, skipping `null` entries and entries without an id);
    - `bookCatalogue(pack) → string[]`;
    - `isReadable(pack, readerId, unlockedSet) → boolean`.

Rules:
- **Catalogue ("easiest first").** Every reader in `pack.readers` that is not retired (`reader_details[id].retired === true`). Order by `step`, then by position in its step's `readers` list (an unlisted id goes last), then by id. Retired books are never listed or suggested.
- **Readable.** Every token of every page (`tokenizeText`) that is not a tricky word (normalised `tricky_words`) uses only unlocked sounds.
- **Recent.** A book id in `books_read` of any present child's last `BOOK_RECENT_SESSIONS` (5) sessions.
- **`lastReadOn`.** The latest windowed `session_date` on which any present child read the book (whole window).
- **Suggested.** The readable book with the highest step that is not recent; ties go to catalogue order. If every readable book is recent, take the one whose latest read is oldest (by `session_date`, `created_at`, `id`); ties go to the higher step, then catalogue order. No readable book → `null`.
- **Frozen plan** (the shared Frozen plan rule): when `plan.blend_tier` is a `BLEND_TIERS` label, the Suggested tag goes to `plan.suggested_book` (to no book when it is `null`), whatever refreshed history says. The list itself, `readable` and `lastReadOn` still come from the catalogue, the frozen unlocked letters and refreshed history.
- **ECD (C8):** `books: []` and `suggested_book: null`. `no_pack` and `no_children` give the same.

- [ ] **Step 1: Write the first case.** In `books.vectors.json`, set `defaults.computeLessonChoices` and `defaults.computeLessonPlan` to Task 1's defaults with `presentChildren: [kid(A, o m l a k u), kid(B, o m l a k u)]`, so `e n` are suggested and steps 1–3 are unlocked. The case is "the highest-step readable book no one read recently" (C6). `fn: computeLessonChoices`, `view: summary`. Expect books `[{ id: xh-mini-r01, readable: true, suggested: false, lastReadOn: null }, { r02, true, false, null }, { r03, true, false, null }, { r04, true, true, null }]`. `r04` is readable because its tricky word `ewe` is excluded; `r05` is retired and absent.
- [ ] **Step 2: Run to verify it fails.**
`PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest __tests__/lessonPlanEngine.vectors.test.js -t "books"`
Expected: FAIL (`books` is `[]`).
- [ ] **Step 3: Implement** `books.js` and wire it into `evaluateLesson`, including the Frozen plan rule's Suggested tag.
- [ ] **Step 4: Run to verify it passes.** Expected: PASS.
- [ ] **Step 5: Add the remaining cases one at a time.** Each uses `view: summary`. Books are written `id readable suggested lastReadOn`, and a non-empty `books` array lists the four non-retired books in catalogue order (`r01 r02 r03 r04`). Entries a row does not show are `T F null`, as in the first case.

  Rows K12 and K13 freeze `P7`, the plan `computeLessonPlan` returns for this file's defaults (the first case's children on 2026-10-19, no sessions). The JSON writes it out in full: `{ "engine_version": 1, "made_on": "2026-10-19", "reason": "ok", "history_complete": true, "mastery_complete": true, "present_child_ids": ["A","B"], "known_letters": ["o","m","l","a","k","u"], "suggested_letters": ["e","n"], "review_letters": ["o","m","l","a","k","u"], "unlocked_letters": ["o","m","l","a","k","u","e","n"], "blend_tier": "2 Letter Blends", "suggested_blends": ["me","le","ke","ne","na","no"], "suggested_book": "xh-mini-r04", "up_next_group_id": "g1" }`. Unchanged, `P7` gives the first case's books.

| Name | Spec | Input | Expect |
| --- | --- | --- | --- |
| a book read in a present child's last 5 sessions is skipped | C6 | `S(s1,10-16,A,books[r04])` | `r03 T T null`; `r04 T F 2026-10-16` |
| read six sessions ago is not recent | C6 | A: `S(s1,10-09,books[r04])`, then `s2`–`s6` on 10-12…10-16 with `lesson` | `r04 T T 2026-10-09` |
| everything readable read recently: the one read longest ago | C6 | `S(s1,10-12,A,books[r01])`, `S(s2,10-13,B,books[r02])`, `S(s3,10-14,A,books[r03])`, `S(s4,10-15,B,books[r04])` | `r01 T T 2026-10-12`, `r02 T F 2026-10-13`, `r03 T F 2026-10-14`, `r04 T F 2026-10-15` |
| a retired book is never suggested or listed | §4.7 | both `o m l a`; `S(s1,10-12,A,books[r01])`, `S(s2,10-13,A,books[r02])`, `S(s3,10-14,A,books[r03])` | `r01 T T 2026-10-12`, `r02 T F 2026-10-13`, `r03 T F 2026-10-14`, `r04 F F null` (no `r05`) |
| first session: step-1 books readable, later ones tagged | §4.7 | both `—` | `r01 T T null`, `r02 T F null`, `r03 F F null`, `r04 F F null` |
| the Read tag date comes from the window | §4.7 | both `—`; `S(s1,03-02,A,books[r02])` | `r01 T T null`, `r02 T F 2026-03-02`, `r03 F F null`, `r04 F F null` |
| ECD lessons have no book row | C8 | `isEcd: true` | `books: []` |
| ECD plans suggest no book | C8 | `isEcd: true`; `fn: computeLessonPlan` | `suggested_book: null`; `suggested_letters: ["e","n"]` |
| K10 a letters-only pack has no books | C10, Review Focus 1 | `languageCode: en`, `pack: en-interim`; `kid(A, a m s t)` | `books: []`; `contentAvailable: { blends: false, books: false }` |
| K11 malformed reading records are ignored | Review Focus 4 | `S(s1,10-16,A)` with `books_read: [null, {"how":"app"}, {"id":"xh-other-r09","how":"printed"}]` | same as the first case: `r04` suggested, every `lastReadOn` null |
| K12 a frozen Suggested book survives a pull showing it was read recently | C1, C6, Review Focus 6 | `S(s1,10-16,A,books[r04])`; `options: { plan: P7 }` | `r04 T T 2026-10-16` (and `r03 T F null`). Without the plan, the same input is the case "a book read in a present child's last 5 sessions is skipped", which gives `r03 T T`; the Read date still refreshes |
| K13 a draft resumed on a later day keeps its Suggested book | C1, C14, Review Focus 6 | `today: 2026-10-21`; `S(s1,10-20,B,books[r04])` (another EA's lesson, pulled); `options: { plan: P7 }` | `r04 T T 2026-10-20`. Re-chosen, `r03` would take the tag |
| N2 a letter mastered out of order makes a later step's book readable | §4.5, §4.7, Review Focus 7 | both `o m l a n` | `r04 T T null`. Suggested letters are `k u`, so step 3 is not unlocked, but every non-tricky token of `r04` uses `n a l o u m` (its one `e` word, `ewe`, is tricky) |
| the full §6 plan | §6 | `fn: computeLessonPlan`; `kid(A, o m l a, @2)`, `kid(B, o m l a k, @3)` | **exact** `{ engine_version: 1, made_on: "2026-10-19", reason: "ok", history_complete: true, mastery_complete: true, present_child_ids: ["A","B"], known_letters: ["o","m","l","a"], suggested_letters: ["k","u"], review_letters: ["o","m","l","a"], unlocked_letters: ["o","m","l","a","k","u"], blend_tier: "2 Letter Blends", suggested_blends: ["ku","ka","ko","mu","lu","lo"], suggested_book: "xh-mini-r03", up_next_group_id: "g1" }` |

- [ ] **Step 6: Run** the vectors and purity guard. Expected: PASS, including every agreement row.
- [ ] **Step 7: Commit.**

```bash
git add src/lessonPlan/engine
git commit -m "feat(lesson-plan): book choice, readability and the Other book list"
```

---

### Task 8: Real-pack smoke, docs and hand-off gate — needs A1's loader and packs

**Files:**
- Create: `__tests__/lessonPlanEngine.realPacks.test.js`
- Modify: `CONTEXT.md` (`### Work capture`, after **Letters focused**), `documentation/LEARNING.md` (append a section), `documentation/build-log.md` (append rows to its registers)

**Interfaces:**
- Consumes:
  - A1's `getPack(languageCode, { allowPreview })` from `src/lessonPlan/packs` (codes, per the cross-plan sheet);
  - A1's `isDecodableAt(raw, k, seq)`, `analyzeToken(raw, seq)` and `tokenizeText(text)` from `src/utils/decodability`;
  - every engine export, including `PACK_LANGUAGE_BY_CODE`.
- Produces: no new names. This task proves the contract against the real bundled packs, with the books project's own checker as an independent oracle, and proves that the engine's code-to-pack-language map agrees with A1's loader.

- [ ] **Step 1: Write the smoke tests.**
  - `pack` is the preview test pack: `getPack('xh', { allowPreview: true })`, id `isixhosa-candidates-preview-v1`.
  - The letters-only cases use the release packs: `getPack(languageCode)`.
  - Children are two `ChildInput`s with complete flags, `today: '2026-10-19'`, `academicYearStart: '2026-01-14'`, no sessions.

```js
test('isiXhosa first session: the J1 step-1 letters, every suggestion decodable at step 1', () => {
  const plan = engine.computeLessonPlan(input({ known: [] }));
  expect(plan.reason).toBe('first_session');
  expect(plan.suggested_letters).toEqual(['o', 'm', 'l', 'a']);
  for (const item of plan.suggested_blends) expect(isDecodableAt(item, 1, pack)).toBe(true);
  if (plan.suggested_book) expect(nonTrickyTokens(pack, plan.suggested_book).every((t) => isDecodableAt(t, 1, pack))).toBe(true);
});
test('isiXhosa mid-course: steps 1-3 known → i t, every suggestion decodable at step 4', () => {
  const known = engine.teachingOrderFromPack(pack).slice(0, 8);            // o m l a k u e n
  const plan = engine.computeLessonPlan(input({ known }));
  expect(plan.suggested_letters).toEqual(['i', 't']);
  for (const item of plan.suggested_blends) expect(isDecodableAt(item, 4, pack)).toBe(true);
  for (const tier of engine.computeLessonChoices(input({ known, level: 'Word Reading' })).tiers)
    for (const item of tier.pool) expect(isDecodableAt(item.text, 4, pack)).toBe(true);
});
test('isiXhosa all letters known: nothing needs a sound step', () => {
  const known = engine.teachingOrderFromPack(pack);
  const plan = engine.computeLessonPlan(input({ known }));
  expect(plan.reason).toBe('all_letters_known');
  for (const tier of engine.computeLessonChoices(input({ known, level: 'Word Reading' })).tiers)
    for (const item of tier.pool) expect(analyzeToken(item.text, pack).step).toBeLessThanOrEqual(12);
});
test.each([['xh', ['o', 'm', 'l', 'a']], ['en', ['a', 'm', 's', 't']], ['af', ['a', 's', 'm', 'e']]])(
  '%s release pack (interim, letters only): step-1 letters, no blend or book content', (languageCode, step1) => {
    const release = { languageCode, pack: getPack(languageCode), known: [] };
    const plan = engine.computeLessonPlan(input(release));
    expect(plan.reason).toBe('first_session');
    expect(plan.suggested_letters).toEqual(step1);
    expect(plan.suggested_blends).toEqual([]);
    expect(plan.suggested_book).toBeNull();
    expect(engine.computeLessonChoices(input(release)).contentAvailable).toEqual({ blends: false, books: false });
  });
test.each(Object.entries(engine.PACK_LANGUAGE_BY_CODE))(
  "the engine's %s matches the language of A1's release and preview packs", (languageCode, packLanguage) => {
    expect(getPack(languageCode)?.language).toBe(packLanguage);
    expect(getPack(languageCode, { allowPreview: true })?.language).toBe(packLanguage);
  });
```

The test file has two small helpers:
- `input({ languageCode = 'xh', pack: p = pack, known, level = null })` builds the `LessonInput`, with `alphabet: null` (every pack here is usable).
- `nonTrickyTokens(pack, id)` returns `tokenizeText` of every page, minus the normalised `tricky_words`.

- [ ] **Step 2: Run to verify.**
`PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest __tests__/lessonPlanEngine.realPacks.test.js --verbose`
Expected: PASS. If one fails, the engine and the checker disagree (an engine bug), or A1's pack breaks the §4.1 shape (raise it with A1). Never loosen the assertion. Record each test's time from `--verbose` for the build log.
- [ ] **Step 3: Update `CONTEXT.md`.** Add three terms under `### Work capture`, after **Letters focused**, in the file's existing glossary style:
  - **Lesson plan**: the advice for one session with one group. It is computed from the children present and gives letters (two, or every unknown step-1 letter on a first session), blends at a blend tier, and one early reader. It is advice, not a record: what was taught is still recorded as letters focused, blends done and books read. Saved as `activities.lesson.plan`, it belongs to the day it was made (C14). _Avoid_: calling the session record itself a "lesson plan".
  - **Up next**: the group suggested first when the EA starts a session. It is the group whose current members were seen least recently (never-seen groups first), skipping groups seen today; ties go to the fewest sessions this week, then the lower group number. The EA may choose any group.
  - **Blend tier**: the length of blending items a child practises, from their reading level. Cannot blend and Not set give 2-letter; 3 and 4 Letter Blends give 3- and 4-letter; Word, Sentence and Paragraph Reading give words. Labels are the ladder's own (`2 Letter Blends`, `3 Letter Blends`, `4 Letter Blends`, `Word Reading`). A lesson defaults to the lowest present child's tier.
- [ ] **Step 4: Append a `LEARNING.md` section**, "A pure engine with JSON vectors (lesson plan, October 2026)", written for a junior developer. It explains:
  - why `today` is an input, not a clock read (C14 evidence, deterministic tests);
  - why the engine re-applies the academic-year window itself (a fresh phone and an old phone give the same advice, §7.3);
  - why the engine takes known letters as an input instead of reading letter results (C23's rule has one owner, the shared mastery loader, so AR Plans 2–3 can change evidence and confirmations without touching the engine);
  - why the vectors are JSON beside the engine (a later server port runs the same cases);
  - why the real-pack smoke uses the books project's checker as an independent oracle.
- [ ] **Step 5: Append dated rows to the build log's three registers**, as its "Where to append" rule says (`documentation/build-log.md:6-8`; plan call: rows, not a free-standing `###` entry). Prefix each row "Lesson plan A3:".
  - **Verification Register:** every command run in this plan with its result, including the baseline counts and the real-pack timings.
  - **Decision Register:** this plan's calls (see the plan's Engine contract and task rules), including `PACK_LANGUAGE_BY_CODE`, the dropped `pack` argument of `deriveSessionReadingLevel`, the Frozen plan rule (what stays the plan's and what refreshes), and the 2-letter tier's own length check behind A1's `step_blend_length`.
  - **Bug And Gap Register**, four rows:
    - the §7.3 completeness predicate is tested in the C1 lesson-draft plan, not here;
    - C23's current-year bound and AR Plan 2's confirmation re-key arrive with AR Plans 2–3 (§7.6 asks 2–4), and `masteryInputsComplete` with AR Plan 3 (ask 3). Until then, wave 2's `knownLetters` follow today's `loadMasteryState`, and every plan records `mastery_complete: false`;
    - `documentation/teaching-quality-analytics.md` (Check 2 skips a null `session_reading_level`) is updated with C3's save path, when the derived value starts being written;
    - the on-device cost check is carried into C3's device gate (Step 8).
- [ ] **Step 6: Run the full gates.**
`PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npx jest` → PASS.
`PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" npm run test:integration` → PASS (unchanged; this slice adds no SQLite code).
`PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" git diff --check` → no output.
Record the counts in the build log.
- [ ] **Step 7: Adversarial review.** Run `/codex:adversarial-review` on the branch diff against `main` (spec §10). Fix confirmed findings with a new vector first (red, then green), and rerun the review until a round finds nothing new of substance. Record each round in the build log.
- [ ] **Step 8: Device gate (none in A3; criterion handed to C3).** A3 ships no screen, so there is nothing to check on a device in this slice. Record this criterion in the build log for C3's device gate, which runs on a Galaxy A03s (360dp) and an iPhone at 1.0x and 1.3x text. In a release build with the isiXhosa test pack and a full roster (6 pairs):
  - "Who are you teaching?" shows Up next and every row's next letters within 500 ms of the screen opening;
  - toggling a child absent on the Lesson screen shows the recomputed letters and blends within 300 ms, with no dropped frames while scrolling.
- [ ] **Step 9: Commit.**

```bash
git add __tests__/lessonPlanEngine.realPacks.test.js CONTEXT.md documentation/LEARNING.md documentation/build-log.md
git commit -m "test(lesson-plan): real-pack smoke for the engine; docs and build log"
```

---

## Spec coverage (A3 slice)

| Spec item | Task |
| --- | --- |
| §4.3 Up next, C2 | 3 |
| §4.4 letters, group mastery, first session, review letters | 1, 2 |
| §4.5 unlocked letters and sound-set filtering (beyond the step prefix), C3 | 1, 6, 7 |
| §4.6 blends, tiers, ranking, rotation, top-up, J16, J19, C4, C5 (2-letter items only) | 5, 6 |
| §4.7 book, readable, retired, Other book tags, C6 | 7 |
| §4.8 the five reasons | 1, 2 |
| §6 `lesson.plan` shape, `engine_version` | 1, 7 |
| §7.3 inputs, windows, completeness flags (engine side) | 2, 3 |
| §4.2 no-pack fallback to the language's 26 letters; a `null` language never becomes English (rev 2, #90) | 1, 6 |
| §7.6 ask 3 `mastery_complete` from per-child `masteryComplete` (AR Plan 3 supplies it) | 1; the source is recorded in "Building the inputs" |
| C23 at the engine boundary: `knownLetters` is an input; the rule lives in the shared loader and AR Plans 2–3 | Engine contract; 8 (build-log gap) |
| C1 present children, recompute rule; frozen advice (tier, six blends, Suggested book) after the first tick | 1, 4, 6, 7 |
| C8 ECD (input flag) | 7 |
| C9 all letters known, sound steps out of scope | 1, 6 |
| C10 interim letters-only packs for all three languages (isiXhosa added in rev 2) | 1, 6, 7, 8 |
| C11 `deriveSessionReadingLevel` | 5 |
| C14 `planForSave`; a draft resumed on a later day keeps its frozen advice | 4, 6, 7 |
| C18 class resolution and added children (§10 vectors) | 2, 4 |
| §10 engine vectors, one runner | 1–7 |
| §11 docs for this slice (`CONTEXT.md` terms, build log) | 8 |

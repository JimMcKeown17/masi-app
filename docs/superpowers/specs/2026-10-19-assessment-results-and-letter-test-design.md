# Assessment results, one letter test, and WelaPLUS data — Design

**Date:** 2026-10-19
**Status:** Draft for Jim's review. Jim asked for the design without a question round
("I think you can just design", 2026-10-19). Section 3 lists the two decisions only Jim can make,
plus the calls I made that he should check.
**Covers:**
- ROADMAP §1 P0 item 5 remainder (the assessment slice);
- WelaPLUS Release 1 Plan 2 (data foundation);
- Jim's 2026-10-19 letter-test decisions;
- room for new assessment types.

**Supersedes:**
- WelaPLUS Release 1 spec (`2026-10-14-welaplus-release-1-design.md`): §7 (all of it), §8's
  sync bullets, D4 for Question 1, and D10;
- ROADMAP §1's per-table wording for the assessment family (replaced by section 8 here).

**Depends on:** PR #88 (WelaPLUS content answers) merged first.

---

## 1. Why

Four pieces of work touch the same tables, so they are designed together.

1. **The assessment slice.** An assessment and its answers upload as separate rows today, so the
   server can hold an assessment with only some of its answers, which reads as a real low score.
   Hosted RLS still lets an EA edit or delete a submitted assessment, which ADR-0007 forbids. A
   new phone shows no assessment history, because nothing pulls it.
2. **WelaPLUS data.** The battery needs `battery_runs` and per-Question columns on `assessments`.
   The 2026-10-14 spec planned them against a sync layer that has since been rebuilt.
3. **One letter test.** Jim decided on 2026-10-19 that the standalone EGRA letter assessment and
   WelaPLUS Question 1 are the same test. Its letters must be data that is easy to replace and
   reorder, single letters in mixed case, with a row stop rule. The child reads a printed card,
   and a WelaPLUS Q1 result counts as a letter assessment.
4. **New assessment types later.** The government isiZulu EGRA (letters, words, passage,
   comprehension) is the known next one. Adding it should be content plus, at most, one new
   component. It should need no server, sync, or storage change.

**How the test runs today (Jim, 2026-10-19).** The child reads letters from a printed sheet. The
EA marks an identical sheet with a pencil, then goes straight to the next Question. Finished
sheets go on a pile and the next child starts. The app replaces the pencil sheet: the phone's
marking grid is that sheet, row for row. Nobody reviews results mid-battery, so saving and
uploading must be invisible and must never lose or half-save a result.

## 2. Decisions this design rests on

| Source | Decision |
|---|---|
| ADR-0007 (2026-09-21) | A submitted assessment and its answers never change. A correction is a new attempt; the latest attempt is canonical. |
| ADR-0005 follow-up 1 (2026-09-21) | An EA with an active class assignment reads a child's current-year assessments if the child was in that class at any point this academic year. |
| ADR-0005 follow-up 2 + CONTEXT (2026-09-23, 2026-10-08) | Letter mastery is current state: one record per child, letter and language. It is readable by its last writer and by current deliverers, and current deliverers may change it. When two changes conflict, the later correction time wins, and a future time counts as the server's `now()`. |
| WelaPLUS spec D1, D2, D3, D5, D6, D8, D9 | Kept as written. D4 (soft stop rules) is reversed for Question 1 only. D10 is delivered by this design. |
| Jim, 2026-10-19 | The letter test decisions in §1 item 3. Any future assessment type must be addable. |
| Jim, 2026-09-23 | Practice data on `masi-app-sqlite` is wiped. This design moves the wipe to before rollout (section 13; please confirm). |

## 3. For Jim

### 3.1 Two decisions only you can make

**A. How the EA marks letters on the phone.** The row stop rule needs the app to know that every
letter in a row was wrong. Today's "tap the correct letters" grid cannot tell *wrong* from *not
reached yet*, so it cannot apply the rule. Two mechanics can:

- **Tap only the wrong letters, like crossing them out in pencil** (recommended). It mirrors the
  sheet EAs mark today and the international EGRA convention. It needs fewer taps at a letter a
  second. One mechanic serves every reading Question, in both the battery and the standalone
  tests. The package's word and passage components already support it. When time runs out or
  the EA ends, the EA taps the last letter the child reached, as they bracket it on paper.
- **Step-by-step: a tick or a cross for every letter** (today's default). It gives explicit
  evidence for every letter, but it is a different habit from pencil marking and needs a tap per
  letter. Keeping it means building a step-by-step mode into the package's letter and word
  components.

If you choose the first, the step-by-step mode and the device capture-mode setting are retired
for these tests. There is no field data on the new backend, so the grid-versus-step-by-step
comparison loses nothing.

**B. Wipe the practice assessments before rollout, not after.** Results are stored in a new shape
(section 7). Practice rows in the old shape would need conversion code that we would then throw
away. You already decided to wipe them after the slice. Wiping them just before the new build
goes onto test phones lets us skip that code entirely. Nothing in the field is affected.

### 3.2 Calls I made (please check while reading)

1. Letter content is **bundled, versioned data files**, not a synced table. Cards must be printed
   anyway, so an app release per letter change is not the bottleneck, and files are typed,
   reviewed and tested (6.1).
2. **Until your team supplies the new mixed-case lists, both entry points use the 2024 WelaPLUS
   Q1 cards:** isiXhosa and English, 5 rows of 12, lowercase. They are already printed. The
   English 60-letter EGRA list with digraphs is retired (6.1).
3. **For mastery, A and a are the same letter.** The tracker stays 26 letters per language
   (10.4).
4. **The standalone word reading test moves to the package's word component too,** so the old
   capture screens and the old result format can be deleted. Its placeholder word lists stay
   placeholders (6.4).
5. **The Home "children to assess" count and the Assessments tab stats count letter-sound
   results.** These now come from the standalone test or WelaPLUS Q1. Today they count any
   assessment, including word tests (9.3).
6. **A standalone test is not a battery run.** Its result has no `battery_run_id` (7.1).
7. **WelaPLUS runs are pulled to other devices with their Questions,** and the owning EA can
   resume an unfinished run on a new phone. This closes the WelaPLUS spec's "device-local
   unfinished runs" risk at little cost (11.4).
8. **`battery_runs` is not row-versioned.** Its status only moves forward, so a late, stale write
   is ignored instead of refused (8.2).
9. **HQ calibration never edits an EA row.** `hq_rubric_total` is dropped from the WelaPLUS
   columns, per ADR-0007 (7.1).

---

## 4. Goals, non-goals, anti-goals

**Goals**

- Every assessment result, whether a standalone test or a battery Question, is stored in one
  shape. It is written through one save on the phone and one write call on the server, as a
  complete set of answers or not at all.
- One letter-sound test, defined by versioned content data, serves both entry points. Its result
  feeds letter results and letter mastery wherever it came from.
- Submitted results cannot be edited or deleted by an EA, enforced on the server.
- A new phone, a reinstall, or a second EA in the class sees the assessment history, WelaPLUS
  runs, and letter mastery they are allowed to read.
- Letter mastery is one current record per child, letter and language, and conflicting changes
  resolve by correction time.
- Adding an assessment type needs no change to the server, the upload path, the pull, or storage.

**Non-goals**

- The WelaPLUS host screens (WelaPLUS Plan 3, after Bold Red).
- The isiZulu EGRA itself, a comprehension component, and practice items.
- Whole-class roster access for control children (the group-centred workstream).
- Draft persistence for an unfinished Question (accepted loss for the pilot, 2026-10-17).
- Window tagging (D8) and HQ calibration.
- A synced content table.

**Anti-goals.** Any of these would make the work a failure even if it technically ran:

- a partially uploaded result that reads as a real score;
- a letter list change that silently re-scores old results;
- a WelaPLUS Q1 that does not count toward mastery;
- an unknown language silently getting the English card;
- an offline phone undoing a newer mastery correction;
- a new assessment type that needs a migration.

---

## 5. The model in one picture

```
Test definition (bundled data)          Stored facts (SQLite ⇄ Supabase)
──────────────────────────────          ──────────────────────────────────────────────
Item set  letter_sounds@2026.1.xh  ──►  assessments  (one per Question result)
  rows, stop rule, language               question_code, question_version, item_set_id,
Battery   wela_plus_full@2024.1           language, stopped_reason, duration_ms, score,
  Q1 = letter_sounds@<same version>       total_items, derived, battery_run_id?
Standalone test registry                    └── assessment_items (exactly one per card position)
  letter_sounds, word_reading                   position, item_key, prompt, is_correct,
                                                metadata {row, reached}
                                         battery_runs (one per WelaPLUS run)
                                         letter_mastery (one per child × letter × language)
```

- **Letter results** are assessments with `question_code = 'letter_sounds'`, wherever they came
  from.
- **Letter mastery** is the union of two sources:
  - evidence from the child's most recent letter result the EA may read;
  - the stored EA confirmation.

---

## 6. One letter test

### 6.1 Content as versioned data

**Item set shape** (replaces `LetterSoundsItemSet { letters; columns }`):

```ts
type LetterSoundsItemSet = ItemSetMeta & {      // item_set_id, question_code, question_version, language
  rows: string[][];                             // exactly as printed, top to bottom, left to right
  stop_rule: { kind: 'row_all_wrong'; rows: 'any' | 'first' } | null;
};
```

**Rules**

- **Rows are the source of truth.** The phone grid renders these rows and nothing else, and every
  result item records its row. Rows may differ in length.
- **Validation.** It runs in the package and in a unit test over every bundled set:
  - every item is one letter: a single Unicode letter, either case;
  - no row is empty;
  - `item_set_id` equals `${question_code}@${question_version}.${language}`;
  - `language` is a two-letter code (see the next bullet).
- **Language codes.** `en`, `xh`, `zu`, everywhere: item sets, `assessments.language`, and
  `letter_mastery.language`. The display labels "English" and "isiXhosa" are no longer stored.
- **Ids and versions.** `question_code` is `letter_sounds` for both entry points, so a result is
  a letter result regardless of where it was taken. Each language has its own file:
  `itemsets/letter_sounds@<version>.<lang>.ts`.
- **Changing letters or their order.** Add a new version file and point the registry at it. Old
  versions stay in the repo for printing and reference. History never needs them, because each
  stored item carries its letter and row (section 7).
- **One registry line per language** names the current version:
  `CURRENT_ITEM_SETS.letter_sounds = { en: …, xh: … }`. The WelaPLUS battery's Q1 entry
  references `letter_sounds` and that same version. A package test fails if the two ever differ,
  so "identical" is enforced, not remembered.
- **Interim content (call 2).** Version `2026.1` holds the 2024 WelaPLUS Q1 lists as five rows of
  twelve, lowercase, with `stop_rule: { kind: 'row_all_wrong', rows: 'any' }`. The isiXhosa list
  is already identical to today's EGRA list. `contentStatus.ts` gets one entry per language:
  "Masi team to supply the mixed-case single-letter list and card layout." When the lists
  arrive, they become `2026.2`, a content-only change.
- **Content guidance for the team** (recorded in the content-status entry):
  - single letters in mixed case;
  - rows as printed;
  - keep rows short enough to tap on a 360 dp phone (ten or fewer per row is comfortable);
  - use a typeface where capital I and lowercase l look different, and use the same face in
    the app.

  The isiZulu EGRA card shows how easily I and l are confused.

### 6.2 Component behaviour (`LetterSoundsQuestion`)

| Behaviour | Rule |
|---|---|
| Question code | Taken from the item set (`ItemSetMeta.question_code`), never hard-coded. This applies to every component in the package. |
| Language | The host passes the item set. If there is no set for the requested language, the component renders an error state and never falls back to English. This also applies to every component. |
| Grid | One visual row per item-set row. Long cards scroll vertically, and rows never re-wrap. |
| Marking | Per decision A. The recommended mechanic is **tap a letter to mark it wrong**, tap again to clear it, with a `tap_wrong` polarity like `ReadWordsQuestion`. |
| Timer | `durationSec` from the test definition (60 for both entry points). Reading time freezes at the deadline, at End, or at the stop rule (#88 behaviour). |
| Stop rule | When every letter in a row covered by `stop_rule` is marked wrong, the timer pauses and a bottom sheet opens: **"Whole row wrong — stop the test"**, with **Stop test** (primary) and **Keep going** (for a mis-tap). Stop ends the test with `stopped_reason = 'stop_rule'` and the last attempted letter at the end of that row. Keep going resumes the timer. |
| Last attempted | At the timer or at End, the EA taps the last letter the child reached (today's last-attempted sheet, row-aware). Letters after it are not reached. |
| Result | Each item is `{ position, item_key: letter, prompt: letter, is_correct, metadata: { row, reached } }`. There is one item per card position, including not-reached ones (`reached: false`, `is_correct: false`). `derived` keeps `total_correct`, `total_attempted`, `percent`, `last_attempted_position`, `was_timed` and `tracks_progress`. |
| Validator | `contractTest/validateResult` gains one rule: `stop_rule` requires the last attempted row to have zero correct. |

With step-by-step marking (the other answer to A), the same stop rule fires when the last letter
of a row gets a cross and the whole row is crosses. The table is otherwise unchanged.

### 6.3 Where the letter test runs

- **Standalone.** The Assessments tab card "Letter Sounds" opens child select. Its language comes
  from the class `home_language`, with a picker fallback (D6). The picker lists only languages
  that have an item set. The test then hosts `LetterSoundsQuestion` with the current item set and
  saves with `saveQuestionResult` (7.2). The "Try again" and results screens keep working against
  the new result.
- **WelaPLUS Question 1.** Same component, same item set, saved with the run's `battery_run_id`.
  The battery instruction copy "STOP immediately if the child gets an entire row wrong" becomes
  enforced behaviour. This reverses D4 for Q1 only; other Questions' stop rules stay soft.

### 6.4 Word reading (call 4)

- The standalone word test hosts `ReadWordsQuestion` with `question_code = 'word_reading'`, which
  matches the score-band tool code. Its item set holds the existing 50 placeholder words with
  explicit `row_lengths`, and the content-status entry stays "placeholder lists".
- Marking follows decision A. There is no stop rule, as today.
- The old capture stack is then deleted:
  - `LetterAssessmentScreen` and `SequentialAssessmentScreen`;
  - `useAssessmentSession` and `EgraLetterGrid`;
  - the sequential reducer and `buildAssessmentRecord`;
  - the `__summary__` row.
- With answer B to decision A (step-by-step), `ReadWordsQuestion` also needs the step-by-step
  mode.

---

## 7. Storing a result on the phone

### 7.1 Shape

**`assessments`**: new columns, SQLite and Supabase, all nullable at the database level:

| Column | Value |
|---|---|
| `question_code` | From the result, for example `letter_sounds`. Required by the write call for new rows. |
| `question_version`, `item_set_id` | From the result. |
| `language` | `en` / `xh` / `zu`. |
| `stopped_reason` | One of the package's 10 values, with a CHECK. |
| `duration_ms` | Frozen reading time; null when untimed or skipped. |
| `derived` | jsonb (text locally) holding the result's `derived` object, including Question-specific extras such as words per minute or the Q11 rubric total. |
| `battery_run_id` | FK to `battery_runs`; null for standalone tests. |

**Existing columns, new meaning**

- `assessment_type = question_code`. The column is NOT NULL and kept for compatibility. Readers
  stop using it.
- `score = derived.total_correct`, or the rubric total for Q11.
- `total_items` is the number of item rows, which is the card size. The write call checks it as
  the completeness count.
- `capture_mode` is set per decision A: `grid` for tap-wrong marking, or the mode used.
- `items_tested` is no longer written.
- `assessment_purpose = 'progress_check'` and `assessment_window_id = null` (D8).

**Partial unique index** on `(battery_run_id, question_code) where battery_run_id is not null`,
in both databases.

**Dropped from the WelaPLUS plan**

- `ea_rubric_total` moves into `derived`.
- `hq_rubric_total` is dropped (call 9).
- The EGRA `question_code` backfill is moot after the wipe.

**`assessment_items`**: exactly the result's items. There is no `__summary__` row. Attempt
numbers are no longer stored: a screen that shows "Attempt 3" counts the child's earlier results
for that test when it reads them. A client-computed attempt number was never unique across
devices anyway.

**Item identity is unchanged** (ADR-0007, D9): `assessmentItemDomainId(assessment_id, position,
correct|incorrect)`. Every new item has a position.

**`battery_runs`**: per the WelaPLUS PRD §2, with D8's purpose and window columns:

- `id`, `battery_code`, `battery_version`, `child_id`, `user_id`, `programme_id`, `class_id`;
- `assessment_purpose`, `assessment_window_id`;
- `language`, `started_at`, `completed_at`;
- `status` ∈ `in_progress`/`completed`/`abandoned`, `notes`, timestamps;
- the local sync columns.

**`programmes`**: `default_battery_code` and `default_battery_version`, both-or-neither, set for
Core Literacy R–3 by a data statement after a read-only preflight. Both columns are added to the
reference-data pull.

### 7.2 Saving

`assessmentsRepository.saveQuestionResult({ result, childId, batteryRunId = null, captureMode })`:

- **Inputs and defaults.** It validates the result with the package's `validateResult`, resolves
  the programme (hard gate, unchanged), and stamps `assessment_date` (local date) and
  `created_at`.
- **One transaction.** It writes the assessment row, every item row, and **one** outbox row,
  `assessments:<id>:insert`. Items get no outbox rows of their own (8.5).
- **Refuses an id that already exists.** Real-SQLite test, per ADR-0007.
- **Refuses a second result for the same run and Question.** Pre-check plus the local partial
  unique index.
- **A skipped Question** is a result with zero items, `stopped_reason = skipped_*`, and
  `total_items = 0`. It goes through the same save.
- **Replaces two old paths.** `saveAssessment` and the WelaPLUS spec's `saveSkippedQuestion` both
  become this one path.

`batteryRunsRepository`: `startRun`, `finalizeRun`, `abandonRun`, `getUnfinishedRunForChild`,
`getUnfinishedRunsForUser` and `getRunWithResults`, as in the WelaPLUS spec. Each write updates
the run and coalesces into the run's single outbox row in one transaction.

---

## 8. Uploading: the server contract

### 8.1 `submit_assessment`: the only way an EA inserts an assessment

```
public.submit_assessment(p_assessment jsonb, p_items jsonb) returns text   -- 'inserted' | 'already_present'
```

The function is `security definer`, with `set search_path = ''`. It is granted to
`authenticated` only, with `public` and `anon` revoked, following the
`report_mobile_support_incident` pattern.

**Every check runs in one statement transaction**, so the result lands all-or-nothing.

1. **Caller.** `auth.uid()` must be present (else `28000`), and `p_assessment.user_id` must equal
   it (else `42501`).
2. **Shape** (else `22023`):
   - required fields are present;
   - `question_code` is non-empty;
   - `language` matches `^[a-z]{2}$`;
   - `stopped_reason` is in the CHECK set;
   - `p_items` is an array whose length equals `total_items`;
   - every item has the parent's id, a unique position from 0 to n−1, a non-empty `item_key`, a
     boolean `is_correct`, and an object `metadata`.
3. **Authority.** These are the same checks today's INSERT policy makes, now inside the function:
   - `private.current_user_can_write_for_child(child_id)`;
   - an active `staff_programme_assignments` row for `programme_id`.

   Either failing raises `42501`.
4. **Run link.** If `battery_run_id` is set, the run must exist, belong to the caller, and have
   the same `child_id` and `programme_id` (else `42501`). There is no status condition: a Question
   may arrive after its run is finalized (WelaPLUS spec §7.3 principle, kept).
5. **Insert or confirm.**
   - **A new id:** insert the parent and all items, with server timestamps.
   - **The id already exists:** compare it with the incoming payload.
     - The stored item-id set and the parent's identity columns (`user_id`, `child_id`,
       `programme_id`, `battery_run_id`, `question_code`, `item_set_id`) match → return
       `already_present`. This is a lost-acknowledgement retry.
     - Anything else raises `MA001` (family mismatch).
   - **A different id for an already-decided `(battery_run_id, question_code)`** raises `23505`.
6. **The function reads only known columns from the JSON.** It is the payload allowlist on the
   server side.

**The function does not check:** that the score agrees with the items, any question-specific
rule, or that the `question_code` is known. It is type-agnostic by design (section 12).

### 8.2 `save_battery_run`: the only way an EA writes a run

```
public.save_battery_run(p_run jsonb) returns text   -- 'inserted' | 'updated' | 'unchanged'
```

**A new run.** Insert it after the same caller, authority and programme checks as 8.1, plus
"the class belongs to the child's current class membership" if `class_id` is set.

**An existing run.**
- It must be owned by the caller and its identity columns must match. These are `user_id`,
  `child_id`, `programme_id`, `class_id`, `battery_code`, `battery_version`, `language` and
  `started_at`. A mismatch raises `MA001`.
- Ownership is the only authority needed after insert. An EA whose assignment was revoked can
  still finalize or abandon their own run.

**Status only moves forward:** `in_progress` → `completed` or `abandoned`.
- An incoming status that is equal or older returns `unchanged`. Examples:
  - a replay;
  - an `in_progress` write that commits late, after the run was completed.

  This is why the table needs no row version (call 8).
- A different terminal status, or a different `completed_at` on a terminal run, raises `MA002`
  (conflict). One device cannot produce this, so it is classified terminal.

**What this replaces.** The WelaPLUS spec's upsert, UPDATE-by-id, lifecycle trigger, and
"unknown-outcome recovery" read-back all collapse into this one call. A retried insert of a run
that already landed never meets an INSERT policy, because the function checks whether the run
exists first.

### 8.3 Grants, RLS, and immutability

- **Assessments and items.** Revoke `insert, update, delete` on `assessments` and
  `assessment_items` from `authenticated`, and drop the EA INSERT, UPDATE and DELETE policies.
  This is ADR-0007 enforced, with the write function as the exclusive insert boundary. Service
  role and Head Office tooling are unaffected.
- **Runs.** `battery_runs` gets SELECT only for `authenticated` and no direct writes.
- **SELECT predicates** change in the pull plan (section 11). Until then the existing SELECT
  policies stay, and `battery_runs` SELECT copies the assessments policy.

### 8.4 Server-stamped timestamps

- **Triggers.** `before insert or update` triggers set `updated_at = now()` on `assessments`,
  `assessment_items`, `battery_runs` and `letter_mastery`. This is Z1, the same function the
  session family uses.
- **One timestamp per family.** The write functions insert a parent and its items in one
  statement transaction, so the family shares one `now()`.
- **Late items cannot happen.** Direct item inserts are revoked and families are immutable. The
  ROADMAP's "late item re-surfaces its parent" proof therefore becomes a harness case proving
  that a direct item insert is denied.
- **Audit result.** The phone stops sending `updated_at` for these tables. The write functions
  ignore it, and section 11's pull uses the server value. The client audit the ROADMAP asks for
  is one test: nothing reads a phone-sent `updated_at` back as a server time.

### 8.5 The outbox: one row per family

**Enqueue.** An assessment family is one outbox row on table `assessments`, op `insert`. A run is
one outbox row on table `battery_runs`, coalescing to its latest state.

**Dispatch**
- **Assessment family.** The engine reads the parent and all its items from SQLite at send time,
  applies the `SERVER_COLUMNS` allowlist, and calls `submit_assessment`.
- **Run.** The engine calls `save_battery_run`.
- **What goes away.** Batching, the 100-record batch limit, and the per-row fallback no longer
  apply to this family. The 1,000-row ready limit cannot split a family, because a family is one
  row.

**Order and evidence**
- `PUSH_ORDER` puts `battery_runs` before `assessments`.
- `PARENT_FK_COLUMNS.assessments` gains `battery_run_id → battery_runs`.
- `PARENT_FK_COLUMNS.battery_runs` holds `child_id → children` and `class_id → classes`.
- `GRANT_SUBJECTS.battery_runs` mirrors `assessments`.
- `computeEvidencePending` then keeps a family waiting, not quarantined, while its child,
  assignment or run is still pending. `assessment_items` leaves `PUSH_ORDER`, `TABLE_DEPENDENCIES`
  and `BATCHABLE_UPSERT_TABLES`.

**Acknowledgement.** In **one** SQLite transaction, delete the outbox row (with the existing CAS
on `updated_at` and `in_flight`) and mark the parent and every item `synced`. `inserted`,
`already_present`, `updated` and `unchanged` are all success.

**Error classes**

| Error | Outcome |
|---|---|
| `42501` / `23503` with pending evidence | Retry. |
| `42501` / `23503` without pending evidence | Terminal (needs attention), as today. |
| `MA001`, `MA002`, `22023`, `23505` | Terminal. |
| `28000` | Retry after the session is restored. |
| Network or timeout | Retry with backoff. |

**Legacy guard.** The `LEGACY_PROGRAMME_ID` guard stays.

**Out of scope.** Row versions (`VERSIONED_TABLES`) do not apply to these tables.

---

## 9. Reading results on the phone

### 9.1 One accessor

`assessmentsRepository.getQuestionResults({ childId?, childIds?, questionCodes?, language?,
sinceDate?, recordedByUserId?, includeSkipped = false, order })`:

- returns typed results: the row, `derived` parsed, and items ordered by position;
- scopes to the active programme;
- **does not** exclude battery rows. Readers select by test, not by where the test was taken.

This replaces the WelaPLUS spec's `includeBatteryRuns` choke point. With a single letter test, that
choke point would have hidden Q1 from every letter reader.

**Two helpers**

- `getLetterResults(...)`: `questionCodes = ['letter_sounds']` (the `LETTER_EVIDENCE_CODES`
  registry).
- `latestLetterResult(childId, language)`: the most recent non-skipped letter result with at
  least one reached item, by `assessment_date` then `created_at`.

**Every `letter_egra` / `word_egra` filter moves to these:**

- `dashboardStats.js`: `getLetterAssessmentRanking`, `getWordAssessmentRanking`,
  `getLetterMasteryRanking` and `getAssessmentsTabStats`;
- `masteryState.js` and `letterMastery.js`;
- `assessmentHistoryMap.js`;
- `ChildResultsScreen` and `AssessmentChildSelectScreen`;
- `countAssessments`.

`normalizeLanguageKey` is replaced by `languageCodeForHomeLanguage(text) → 'en' | 'xh' | 'zu' |
null`. Null means "ask", never English.

### 9.2 Screens

**History.** `AssessmentHistoryScreen` lists:
- standalone results, one row each, opening the detail screen;
- WelaPLUS runs, one row per run, opening the run summary. This arrives with WelaPLUS Plan 3;
  until then, a run shows as a read-only row with its status and Question count.

Battery Questions never open the standalone detail screen.

**Detail.** `AssessmentDetailScreen` and `AssessmentDetailGrid` render from the stored items, using
each item's `metadata.row`. The hard-coded 5 or 2 columns, `items_tested`, and the item-set
lookup by id all go.

**Rankings and bands**
- Rankings use the raw score, per ADR-0003. The band `toolCode` is the `question_code`; it is
  already `letter_sounds` and `word_reading` in `scoreBands.js`.
- The maximum is `total_items`, not a hard-coded 60 or 50.
- Grade comes from the class membership at `assessment_date`, which fixes the drift noted in
  research.

### 9.3 Counts (call 5)

- **"Assessed"** in Home's "children to assess", Children's "Unassessed", and the Assessments tab
  "% Assessed" / "Total" now means **has a letter result this academic year**.
- **"Avg score"** replaces "Avg Accuracy" and averages the latest letter result's raw score. It no
  longer mixes letters and words.

---

## 10. Letter mastery

### 10.1 The record

**`letter_mastery`** is re-keyed in both databases.

**Columns**
- `id` = `uuidv5(child_id, letter, language)`;
- `child_id`, `letter` (lowercase, one letter), `language` (`en`/`xh`/`zu`);
- `confirmed` boolean;
- `changed_at`: the correction time, from the phone, clamped by the server;
- `changed_by`: the last writer;
- `programme_id`: the last writer's programme, kept as context, not identity;
- `created_at`, `updated_at` (server-stamped);
- the local sync columns.

**Constraints**
- Unique on `(child_id, letter, language)`.
- `source`, `mastered_at`, `deleted_at` and `user_id` go.
- Un-confirming sets `confirmed = false`. The row stays as the record of that correction, which
  is what lets an older offline confirm lose to it.

**Migrations**
- **Hosted:** dedupe existing rows to the latest per key, map `English`/`isiXhosa` to `en`/`xh`,
  then swap the index. It must succeed on whatever practice data exists, even though the wipe
  will remove it.
- **Local:** the same transform, into a rebuilt table.

### 10.2 Writing: `set_letter_mastery`

```
public.set_letter_mastery(p_child_id uuid, p_letter text, p_language text,
                          p_confirmed boolean, p_changed_at timestamptz) returns text  -- 'applied' | 'superseded'
```

**Authority.** The caller must currently deliver to the child, meaning an active
`child_ea_assignments` row; otherwise `42501`. Class-only assessors and former deliverers cannot
write.

**Ordering rule (D1).** The effective time is `least(p_changed_at, now())`. The function runs:

```sql
insert … on conflict (child_id, letter, language) do update
  set confirmed, changed_at, changed_by, programme_id
  where excluded.changed_at > letter_mastery.changed_at
```

- A newer correction applies (`applied`).
- An older or equal one changes nothing (`superseded`), which counts as success.
- A lost-acknowledgement retry is therefore harmless.
- The natural key resolves inside the one statement. That makes Zazi's ZZ-BUG-20260813-006 race
  (two inserts for the same key) the regression case: the second insert becomes a conflict
  update, not a crash.

**Direct writes.** Direct INSERT, UPDATE and DELETE on `letter_mastery` are revoked. This closes
Ruling 11 for the table: a late, stale write cannot overwrite a newer correction, because of the
`where` clause.

**On the phone**
- One outbox row per record id carries the latest local state (`confirmed`, `changed_at`).
- Toggling on, off, on while offline coalesces into one call.
- `LetterMasteryPanel` and the session-form tracker write through
  `masteryRepository.setLetterMastery({ childId, letter, language, confirmed })`. It stamps
  `changed_at = now` and `changed_by`.
- The insert, update, archive and reactivate branches go away.

### 10.3 Reading

- **SELECT RLS:** `changed_by = auth.uid()`, or an active `child_ea_assignments` row for the
  child. There is no year bound.
- **Locally:** `getLetterMastery({ childId | childIds, language })`. It has no `user_id` filter
  and no programme filter.

### 10.4 Assessment evidence

**Rule.** It is computed from **stored items** of `latestLetterResult(child, language)`, never
from the current item set. A letter is mastered by evidence when:
- it has at least one reached occurrence, and
- every reached occurrence is correct, comparing letters case-folded (call 3).

**Which letters count.** Only letters in the language's 26-letter pedagogical order. Anything
else is ignored.

**Whose results.** Results from any EA the phone may read count, which closes the ROADMAP's
"only the EA's own" gap.

**Display.** Mastered = evidence ∪ confirmed records, unchanged. The tracker still shows evidence
cells as locked.

`computeAssessmentMastery(result, pedagogicalOrder)` takes the result and no letter set. Once
letters are versioned data, reading positions against the current constant would re-score
history.

---

## 11. History pull: assessments, runs, mastery

### 11.1 Who may read an assessment or run

`private.can_read_assessment(user_id, child_id, assessment_date)` is true when either arm holds:

**Owner arm:** `user_id = auth.uid()`.

**Class arm:** the caller has an active `class_ea_assignments` row on a class, and all of these
hold:
- the child had a `child_class_memberships` row in that class in the active academic year
  (`academic_years.is_active`), exited or not;
- `assessment_date` falls inside that year.

This is ADR-0005 follow-up 1 exactly.

**What it does not grant:**
- delivery assignments alone;
- historical delivery;
- `created_by`.

Programme is a partition key (pull parameter), not a grant.

**Where it applies.**
- New SELECT policies on `assessments` and `battery_runs` use it. Items follow their parent.
- `letter_mastery` uses 10.3.
- The old `current_user_can_read_child` policies are dropped for these tables.

### 11.2 Server calls

Each call copies the CAP-004 shape: `stable security definer`, input guards, two arms each
ordered and limited before the merge, and an `(updated_at, id)` keyset with server-side overlap.

**`get_assessment_history_page(p_programme_id, p_page_size, p_after_updated_at, p_after_id,
p_overlap_seconds)`**
- Returns assessment parents in scope.
- The year comes from the server, because it is part of authorization.
- The owner arm uses the same year bound so the pull stays a current-year pull.

**`get_assessment_items(p_assessment_ids uuid[])`**
- Re-checks authorization per id.
- Returns every item of each requested family. A family is never paged.

**`get_battery_runs(p_run_ids uuid[])`** returns the runs referenced by a page.

**Child identity.** Each page call returns an identity projection (first, last and preferred
name) for every child on the page. The phone creates a history reference child for any child it
does not already hold, as CAP-004 does. That child carries identity only; it is never roster,
assessment scope, or write authority (CONTEXT).

**`get_letter_mastery_page(p_after_updated_at, p_after_id, p_page_size, p_overlap_seconds)`**
- Returns records for children the caller currently delivers to, including `confirmed = false`
  rows.
- It is not programme-scoped.

### 11.3 Applying a page on the phone

**Assessments, runs and items: one transaction per page, cursor included.**
- Immutable families make this cheap: insert-or-ignore by id, with one batched existence lookup
  per page and prepared statements. There is no row comparison (Z2).
- A family arrives complete or the page fails.
- Runs are applied before assessments, and children before both.
- A local pending row with the same id is left alone; it is the same immutable fact.
- Absence never deletes.

**Mastery**
- A server row replaces the local row unless the local row is pending with a later
  `changed_at`. In that case the local row wins until its upload, and the server's rule settles
  it.

**Completeness and re-walks.** These copy `sessionHistoryPull`:
- deadline from enqueue;
- run budget checked between pages;
- `lastFailureAt` failure memory;
- completeness only after an exhausted, error-free walk;
- re-walk when the set of active class assignments (assessments) or delivery assignments
  (mastery) changes;
- the jittered weekly backstop. It catches class membership changes the phone cannot see.

**Page size.** Tuned so the first durable commit lands within 3 s on a throttled Galaxy A03s.
Start at 50 parents.

### 11.4 Runs on another device (call 7)

- A pulled `in_progress` run the caller owns can be resumed. Its decided Questions are the pulled
  results, and the partial unique index prevents a duplicate.
- Another EA's run is read-only.

### 11.5 Status

- The Sync status "History" row covers sessions, assessments and mastery.
- It reads "Up to date" only when all three walks are complete. Otherwise it shows the oldest
  incomplete one.

---

## 12. Adding a new assessment type

Using the government isiZulu EGRA as the worked example:

| Need | Where it goes | Server / sync / storage change |
|---|---|---|
| Letter subtask (110 letters, 11×10, first-row stop) | `letter_sounds@<v>.zu` item set with `stop_rule.rows = 'first'`. It is a letter result, so it feeds mastery. Adding `zu` also needs the isiZulu 26-letter order. | None |
| Familiar words (50, 10×5, first-row stop) | A `ReadWordsQuestion` item set. It needs the same `stop_rule` field added to the word component. | None |
| Passage (43 words on 13 printed lines) | A `ReadPassageQuestion` item set. It needs `line_lengths`, so the first-line rule mirrors the card. | None |
| Comprehension (5 questions, three states, gated by how far the child read) | A new component, with a "not asked" item state (`metadata.asked = false`) and a per-question `requires_position` fed from the passage result. | None |
| Practice items, consent, Grade R | Practice: an optional unscored item-set field. Consent: `skipped_child_refused`. Grade R: a child attribute, outside the package. | None |
| "EGRA Full (isiZulu)" | A battery definition, run by the WelaPLUS Plan 3 host. That host is generic over batteries. | None |

The test of this design is the right-hand column. `submit_assessment`, the outbox family row,
the pull, and the reader accessor know nothing about question types.

---

## 13. Rollout and data

The order runs per plan, each step with Jim's yes at the time:

1. Test phones sync completely.
2. Practice assessments, items and mastery rows on `masi-app-sqlite` are wiped (decision B), with
   counts recorded first.
3. The hosted migration is applied through the isolated helper.
4. The new build is installed.

**SQLite migration.** It takes the next free versions. Plan 1 is likely v15.
- It **clears** local `assessments`, `assessment_items` and their outbox rows.
- It converts `letter_mastery` per 10.1.

This is dev and test data only. There are no field users on this backend, and the build log
records the clear.

**`supabase/migrations`.** One file per plan. Each file:
- uses session-level `SET` and `RESET` for timeouts;
- passes every disposable-PostgreSQL harness, not just its own.

---

## 14. Delivery: three plans, in order

| Plan | Contents | Hosted apply | Ends with |
|---|---|---|---|
| **1. Results and upload** | Migration: 7.1 columns, `battery_runs`, `programmes` columns, 8.1–8.4. SQLite version: 7.1, plus clearing. Package and app: 6.1–6.4 (content as data, component changes, standalone letter and word tests, old stack deleted). Phone: 7.2, 8.5, section 9. Docs. | Yes | A03 device gate: standalone letter test with stop rule, word test, offline queue of 30 families, airplane toggled mid-upload, server holds only complete families. |
| **2. Letter mastery** | Section 10: migration, SQLite version, `set_letter_mastery`, the repository and both write surfaces, evidence from stored items. | Yes | Two-phone correction-order gate: an offline older confirm loses to a newer un-confirm. |
| **3. History pull** | Section 11: predicate, SELECT policies, page RPCs, page apply, triggers, status. The ROADMAP §1 history checklist and device gates. | Yes | New-phone, reinstall, and second-EA gates on iPhone and the A03; the ROADMAP CAP-004-style gates for assessments. |

**Then WelaPLUS Plan 3** (host screens), after Bold Red. Bold Red changes only screens, so it
does not block Plans 1–3. If Bold Red's assessment screens are restyled before Plan 1 lands, Plan
1 restyles its new standalone host to match.

**Why this order**
- Plan 1 fixes the shape everything else reads.
- Mastery (Plan 2) needs results stored with their letters.
- The pull (Plan 3) needs both, and its predicate tightens read scope, which is easiest to prove
  last.

Per `AGENTS.md`: Codex implements each task, and Claude reviews the diff and tests.

---

## 15. Testing and verification

**Package** (jest)
- Item-set validation over every bundled set.
- The battery-and-standalone same-version test.
- The stop-rule sheet: fire, Stop, and Keep going.
- Validator rule `stop_rule` ⇒ last attempted row all wrong.
- An unknown language renders the error state.
- Every component's `question_code` comes from its item set.

**Real SQLite** (`better-sqlite3`)
- `saveQuestionResult`:
  - a duplicate id is refused;
  - a duplicate run Question is refused;
  - a skipped result saves;
  - the family plus one outbox row land in one transaction.
- Family acknowledgement in one transaction.
- The mastery re-key migration, with coalescing and ordering.
- Page apply: idempotent replay, pending-local preserved, history reference child created, and a
  page with 50 families of 61 items each.

**Disposable PostgreSQL harness:** new `assessment-results-postgres-harness.cjs`; all harnesses
rerun.

**`submit_assessment` cases**
- complete insert;
- replay returns `already_present`;
- mismatched replay raises `MA001`;
- a short items array raises `22023`, and nothing lands;
- unauthorized child;
- no programme assignment;
- another EA's run;
- a run with a different child;
- a Question after its run completed is accepted;
- a duplicate run Question raises `23505`;
- direct INSERT, UPDATE and DELETE on both tables are denied.

**`save_battery_run` cases**
- insert;
- forward transition;
- stale `in_progress` after completed returns `unchanged`;
- conflicting terminal raises `MA002`;
- finalize after the assignment is revoked succeeds;
- identity mismatch.

**`set_letter_mastery` cases**
- newer applies;
- older is superseded;
- a future time is clamped;
- the concurrent same-key insert race;
- a non-deliverer is denied.

**Read predicate cases** (the six-actor matrix plus):
- the old-class EA after a mid-year move;
- last year's assessment hidden;
- an exited membership still counts;
- a delivery-only EA without a class assignment is denied.

**Timestamps:** server-stamped `updated_at` on insert for all four tables.

**Device gates:** per plan (section 14). Pixel checks of the letter grid against the printed card
at 360 dp and on iPhone.

## 16. Docs that change in the same branches

- `documentation/rls-sync-contract-map.md`: four tables, with their producer, write call, SELECT,
  ordering, identity, conflict and pull rules. Server-owned change timestamps are recorded
  separately from local outbox times.
- `CONTEXT.md`:
  - "Assessment Question" example becomes "Letter Sounds";
  - Letter mastery evidence now includes WelaPLUS Q1, with case folding;
  - Capture mode, per decision A;
  - add **Letter result** and **Item set**.
- **New ADR-0009:** "Assessment results are written through one type-agnostic call, as complete
  families". It covers the exclusive write boundary, the single result shape, and selection by
  test, not by battery.
- **WelaPLUS Release 1 spec:** a dated status note pointing §7, D4 (Q1) and D10 here, plus the
  renamed Q1 code.
- `documentation/ROADMAP.md` §1 and §8 point here.
- `documentation/egra_letter_sets.md` becomes a pointer to the item-set files.
- The build log, per plan.

## 17. Left to the builder

- Exact SQL, file names and function bodies.
- Page sizes within the 3 s first-commit target.
- How the stop-rule sheet and the row-aware last-attempted sheet look, within the design system
  (bottom sheets, Bold Red tokens).
- How `derived` is typed per Question.
- Index choices for the new predicates (expect `assessments(programme_id, updated_at, id)` and a
  membership index on `(class_id, academic_year_id, child_id)`).
- The split of each plan into tasks.

## 18. Risks

- **Card and app drift.** Rows are data and the card is printed from the same file. The version
  string goes in the card footer, and a test pins battery Q1 = standalone.
- **Interim content.** Until the new lists arrive, the test is lowercase only. The format is
  ready, and the swap is one file per language.
- **Tap targets.** Rows of 12 at 360 dp are tight. The device gate checks it, and content guidance
  asks for 10 or fewer.
- **Class-membership changes the phone cannot see** reach it only through the weekly re-walk. This
  is accepted, as for sessions.
- **A history reference child created by the assessment pull is not assessable.** This is
  correct until the class roster exists, but an EA may ask why a co-EA's child appears in history
  and not in child select.
- **Scope.** Plan 1 is large: storage, upload and the capture stack. It is one plan because
  splitting would ship an intermediate format that readers would have to handle twice.

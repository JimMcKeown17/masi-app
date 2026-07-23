# Assessment Capture + Screen Performance Audit — 2026-07-12

## Summary table

| # | Finding | Severity | Score | Likelihood | Confidence | Effort |
|---|---|---:|---:|---|---|---|
| 1 | Assessment and session reads still execute unbounded `N+1` query storms | P1 | 8 | common | Confirmed | M |
| 2 | Session child selection disables effective virtualization and rerenders the full roster | P1 | 7 | common | Confirmed | M |
| 3 | Assessment launch can race history loading and stamp the wrong attempt number | P2 | 6 | occasional | Confirmed | S |
| 4 | Force-quit or process death loses the entire in-progress assessment | P2 | 6 | occasional | Confirmed | M |
| 5 | Completion paths perform many sequential SQLite operations and session navigation waits for sync-status work | P2 | 5 | occasional | Suspected | M |

No P0 was confirmed. The render-perf pack materially fixed the timed-tap hot path. The remaining highest-confidence performance problem is screen-opening query volume, not per-tap SQLite work.

## Findings

### 1. Assessment and session reads still execute unbounded `N+1` query storms

- Evidence:

  - `src/db/repositories/assessmentsRepository.js:73-80` runs one `assessment_items` summary query inside `mapAssessment`.
  - `src/db/repositories/assessmentsRepository.js:110-118` loads every matching assessment and then awaits `mapAssessment` sequentially for every row.
  - `src/db/repositories/sessionsRepository.js:68-74` performs one attendee query per session.
  - `src/db/repositories/sessionsRepository.js:105-119` loads all programme sessions, with no date bound, and hydrates them sequentially.
  - `src/db/repositories/domainRepositoryUtils.js:147-158` adds one active-programme lookup to each repository call.
  - `src/screens/main/HomeScreen.js:65-82` hydrates all time entries, sessions, and assessments merely to calculate aggregate dashboard statistics.
  - `src/screens/assessments/AssessmentHistoryScreen.js:34-45,59-64` loads all assessments and applies its 30-day cutoff in JavaScript.
  - `src/screens/sessions/SessionHistoryScreen.js:37-51,69-73` does the same for sessions.
  - `src/screens/assessments/AssessmentChildSelectScreen.js:37-51` loads all assessment details to display latest status and attempt counts.
  - `documentation/archive/improvements-2026-07.md:133-148` and `documentation/archive/improvements-2026-07-roadmap.md:58-65` describe this work as still pending. That claim remains accurate.

  Query count:

  - An assessment screen costs `A + 2` SQLite queries: one programme lookup, one assessment query, then one summary query per assessment.
  - With 60 assigned children and one prior assessment each, opening My Children, Assessments, or child selection costs 62 queries.
  - With both letter and word results for every child, it costs 122 queries.
  - A session screen costs `S + 2`.
  - Home costs approximately `A + S + 5`: one time-entry query plus both repository paths. With 60 assessments and 300 historical sessions, that is approximately 365 SQLite queries per focus.

- Failure scenario: An EA with a school-year history taps Assessments or Home on a low-end Android phone. The screen spinner remains visible while hundreds of sequential native SQLite calls execute. Assessment child selection is usable late, encouraging repeated taps or immediate selection before its history data is ready.

- Fix sketch: Batch summaries and attendees with a single `WHERE ... IN (...)` query, or use joins. Add bounded and aggregate repository APIs for Home and history screens, pushing date cutoffs and `COUNT`/`GROUP BY` into SQL. Pin each screen to a 2 to 3 query regression test.

### 2. Session child selection disables effective virtualization and rerenders the full roster

- Evidence:

  - `src/screens/sessions/LiteracySessionForm.js:354-398` places the child selector inside the form’s outer `ScrollView`.
  - `src/components/children/ChildSelector.js:99-124` nests a same-direction `FlatList` inside it and sets `scrollEnabled={false}`. With no bounded height, the list expands with the roster instead of providing a meaningful virtualization window.
  - `src/components/children/ChildSelector.js:102-117` creates `renderItem` inline and builds every visible `List.Item`, including a `classes.find(...)` and fresh press callback.
  - `src/screens/sessions/LiteracySessionForm.js:439-445` updates parent state on every comment keystroke.
  - `src/screens/sessions/LiteracySessionForm.js:463-513` also maps the complete selected-child collection twice for progress controls.
  - Neither `ChildSelector` nor its rows are memoized, and `handleChildrenChange` is recreated by the parent.

- Failure scenario: An EA with 60 children opens session capture. The form lays out the complete child roster inside a much larger `ScrollView`. Selecting a child, choosing a letter, opening a menu, or typing comments rerenders the form and roster. On a low-end Android phone this can cause delayed selection feedback, dropped-looking taps, keyboard jank, and slow scrolling.

- Fix sketch: Give child selection its own bounded, genuinely scrolling `FlatList`, or make the whole form a `SectionList` with child rows as a virtualized section. Extract a memoized child row, stabilize `renderItem`/callbacks, and use a class-name map instead of `classes.find` per row.

### 3. Assessment launch can race history loading and stamp the wrong attempt number

- Evidence:

  - `src/screens/assessments/AssessmentChildSelectScreen.js:31-53` starts history loading asynchronously but has no loading or readiness state.
  - `src/screens/assessments/AssessmentChildSelectScreen.js:74-85` calculates the attempt as `(assessmentMap[child.id]?.attemptCount || 0) + 1`.
  - `src/screens/assessments/AssessmentChildSelectScreen.js:139-161` renders the selectable roster immediately while that load is pending.
  - `src/screens/assessments/ChildResultsScreen.js:34-35,63-85` has the same asynchronous preload.
  - `src/screens/assessments/ChildResultsScreen.js:40-57` also defaults an unresolved count to zero.
  - `src/screens/assessments/ChildResultsScreen.js:93-145` temporarily renders “Not yet assessed” and an active Run Assessment button before history resolves.
  - The slow preload is amplified by Finding 1 and by `AssessmentChildSelectScreen.js:40-48`, where attempt counting performs a full `filter` inside the loop, producing `O(A²)` work.

- Failure scenario: A child already has three attempts. On a slow phone, the EA taps the child before the history preload completes. The new result is saved as attempt 1 instead of attempt 4. The actual taps and score survive, but longitudinal attempt metadata becomes unreliable.

- Fix sketch: Resolve the next attempt number inside the launch action through a targeted repository aggregate such as `COUNT(*) WHERE child_id=? AND assessment_type=?`. Do not derive authoritative write metadata from an optional screen preload. A loading gate would help the UI, but the launch-time query is the stronger root fix.

### 4. Force-quit or process death loses the entire in-progress assessment

- Evidence:

  - Grid capture exists only in React state and refs: `src/screens/assessments/LetterAssessmentScreen.js:28-39`.
  - Sequential capture exists only in `useReducer` state and a ref: `src/screens/assessments/SequentialAssessmentScreen.js:19-21`.
  - `src/hooks/useAssessmentSession.js:83-98` pauses and resumes only the in-memory clock during AppState changes.
  - `src/hooks/useAssessmentSession.js:114-123` explicitly warns that leaving loses progress, but this navigation guard cannot protect against OS process death.
  - Persistence starts only at completion: `src/hooks/useAssessmentSession.js:127-157`.
  - The WelaPLUS briefing explicitly locks “No mid-Question resume. Restart on force-quit” at `docs/agent-context/wela-assessment-component-build.md:60-65`, so the in-flight battery design would retain this behavior unless reconsidered.

- Failure scenario: During a 60-second assessment, a phone call backgrounds the app. The clock correctly pauses. Android then kills the process because the phone is memory-constrained. On reopening, the EA returns to normal navigation with no draft or recovery prompt; every recorded tap from that assessment is gone.

- Fix sketch: Persist a small local-only draft at bounded checkpoints, not on every tap. Store child/question identity, capture mode, item state, cursor, accumulated active time, and last update time. On entry, offer Resume or Discard. A lightweight checkpoint every few decisions or on AppState background avoids adding synchronous SQLite work to each tap.

### 5. Completion paths perform many sequential SQLite operations and session navigation waits for sync-status work

- Evidence:

  - `src/db/repositories/assessmentsRepository.js:121-205` correctly uses one transaction, but writes every item and its outbox row through sequential awaited operations at lines 188-201.
  - A fully attempted 60-item EGRA result contains 61 item rows including `__summary__`. With the parent and outbox, this is approximately 125 SQL statements before commit, including programme resolution.
  - `src/db/repositories/sessionsRepository.js:122-165` similarly writes each attendee and outbox row sequentially.
  - `src/services/literacySessionPersistence.js:28-108` keeps the writer transaction open while loading the full user/programme mastery table at lines 44-48, then performs nested child/letter loops with linear `find` scans at lines 50-105.
  - `src/screens/sessions/LiteracySessionForm.js:332-345` waits for persistence and then also awaits `refreshSyncStatus()` before navigating.
  - `src/context/OfflineContext.js:48-59` shows that refresh loads sync status before returning.
  - `src/db/repositories/syncOutboxRepository.js:221-275` loads and processes the complete outbox snapshot.

- Failure scenario: An EA finishes a high-item-count assessment or submits a session after months of mastery/outbox accumulation. The capture UI disables promptly, but the screen appears stuck before results/completion navigation. Repeated attempts are prevented, but the delay looks like a failed tap and erodes trust.

- Fix sketch: Preserve the current transaction boundary but batch or prepare repeated assessment-item, attendee, and outbox inserts. Replace the full mastery preload with targeted logical-key queries. After the session transaction commits, navigate immediately and run sync-status refresh as non-blocking follow-up.

## Verified fixed

- All seven render-perf implementation commits are present on `main`: `92dd0b6`, `ed5c808`, `9d8fc97`, `c0d5838`, `fd9e449`, `390a911`, and `4dce293`; documentation landed in `e4a8898`, merged by `e6fb33c`.
- Timed capture performs no per-tap SQLite write, sync call, or context update. Grid taps update only `letterStates` and `lastTappedIndex` at `LetterAssessmentScreen.js:60-74`. Sequential decisions dispatch only the pure reducer at `SequentialAssessmentScreen.js:42-48`.
- A tap still reruns the parent screen and maps the current page, approximately 20 lightweight element descriptors, but tile rendering is isolated:
  - Stable tile key: `EgraLetterGrid.js:18-30`.
  - Scalar state/current props: `EgraLetterGrid.js:22-23`.
  - Memoized tile: `LetterTile.js:6-44`.
  - Grid mode changes one tile; sequential mode changes the decided and next-current tiles.
- `pageLetters` is recreated with `slice()` on each parent render (`LetterAssessmentScreen.js:107-108`, `SequentialAssessmentScreen.js:72-75`), but this does not defeat `LetterTile` memoization. Grid-level memoization would not avoid tap renders because grid props genuinely change.
- The 1 Hz display update is isolated to `CountdownTimer.js:10-19`. Its interval cleans up at line 15.
- The expiry watchdog uses monotonic elapsed time and cleans up at `useAssessmentSession.js:100-112`. The AppState listener cleans up at lines 86-98. No timer continues after unmount.
- Expired taps are hard-stopped before state mutation:
  - Grid: `LetterAssessmentScreen.js:60-74`.
  - Sequential decisions and corrections: `SequentialAssessmentScreen.js:42-61`.
- Save atomicity is correct:
  - Assessment parent, items, and all corresponding outbox entries share one transaction through `assessmentsRepository.js:121-205` and `repositoryRuntime.js:17-24`.
  - Session, attendees, mastery changes, and outbox entries share one transaction through `literacySessionPersistence.js:28-108`.
  - Production transactions use `BEGIN IMMEDIATE`, commit, and rollback at `src/db/client.js:114-134`.
- Assessment-derived mastery is intentionally not another write in the assessment transaction. It is computed from the latest saved assessment on read at `masteryState.js:28-45` and `letterMastery.js:4-6`.
- Capture navigation occurs only after the local transaction succeeds. Assessment save failure offers Retry or explicit Discard at `useAssessmentSession.js:141-157`; session failure stays on the guarded form at `LiteracySessionForm.js:332-350`.
- Assessment child selection and both history screens use `FlatList` with stable ID keys. Their missing `getItemLayout` is not itself a confirmed field defect because row/card heights vary and virtualization remains active.
- Results, detail, and mastery grids use `ScrollView` or direct maps only for bounded collections of roughly 2, 26, or 60 items. They are not long-list findings.

## Docs-vs-code drift

- The render-perf plan’s task checkboxes remain unchecked throughout `docs/superpowers/plans/2026-07-09-assessment-render-perf.md`, but every implementation task landed and the spec status correctly says implemented at `docs/superpowers/specs/2026-07-09-assessment-render-perf-design.md:1-6`.
- `documentation/archive/improvements-2026-07.md:143` says `LetterMasteryPanel` loads all assessments for the user and filters to one child. That specific claim is stale: the panel now calls the shared loader with `childId` at `LetterMasteryPanel.js:43-51`, and `masteryState.js:32` passes the filter into the repository.
- The broader Item 8 claims about assessment/session hydration, unbounded history loads, `AssessmentChildSelectScreen`’s quadratic counting, and full mastery prefetch remain accurate.
- The WelaPLUS briefing correctly states that no source code has yet been integrated at `docs/agent-context/wela-assessment-component-build.md:197-204`. No unbuilt Question component was audited. The main forward risk is that its explicit no-mid-Question-resume decision perpetuates Finding 4.

## Open questions

- The required low-end Android physical-device gate is still pending. This audit confirms render/query structure, but cannot quantify frame time or the 125-statement completion delay without profiling on representative hardware.
- Does reporting treat `attempt_number` as authoritative longitudinal metadata? If yes, Finding 3 deserves priority despite its modest code change.
- Before WelaPLUS integration, should “restart on force-quit” remain acceptable for longer Questions? The existing EGRA loss window is 60 seconds; future untimed writing and comprehension Questions can lose substantially more work.
- The WelaPLUS host integration should inherit explicit performance contracts: no per-item persistence on the capture thread, isolated timer state, memoized item rows, and bounded draft checkpointing.

No tests were run, as required by the read-only audit constraint.


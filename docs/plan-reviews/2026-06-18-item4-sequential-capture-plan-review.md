# Plan Review: Item 4 Sequential Capture

Reviewed: 2026-06-18  
Plan: `docs/superpowers/plans/2026-06-18-item4-sequential-capture.md`

## Findings

### High: The grid refactor drops the finish-state guard before the Last Attempted sheet

The Task 8 wiring opens `LastAttemptedBottomSheet` without first stopping/freezing the session:

- Plan: `handleFinish` only calls `finishAndSave` when the final letter is marked; otherwise it only runs `setShowLastAttempted(true)` (`docs/superpowers/plans/2026-06-18-item4-sequential-capture.md:828`).
- Current Masi screen clears the timer, sets `hasFinishedRef`, and moves to `phase = 'finished'` before showing the sheet (`src/screens/assessments/LetterAssessmentScreen.js:164`).
- The fork source the plan cites has an extra `finishStartedRef` and explicitly `setPhase('finished')` before showing the sheet (`/Users/jimmckeown/Development/zazi-izandi-app/src/screens/assessments/LetterAssessmentScreen.js:54`).

Impact: on manual finish where the final item was not marked, the timer can continue behind the sheet, the grid can remain interactive, and a timer-expiry/manual-finish race can re-enter the finish flow before a save starts. This violates the plan's own "grid behavior is unchanged" requirement.

Recommendation: port the fork's guard exactly: keep a screen-level `finishStartedRef`, destructure `setPhase`, set `phase` to `finished` before opening Last Attempted, and test the non-final-letter finish path. The test should assert timer stops/freezes, grid is disabled, repeated Finish/timer expiry does not open duplicate flows, and save still uses the selected/cancelled final index.

### High: Grid `correction_count` is hardcoded to zero, biasing the comparison metric

The plan says `correction_count` is one of the only fields that varies by mode, but Task 8 always passes `correctionCount: 0` for grid (`docs/superpowers/plans/2026-06-18-item4-sequential-capture.md:826`). The forked grid screen tracks corrections when an EA toggles a previously marked tile off (`/Users/jimmckeown/Development/zazi-izandi-app/src/screens/assessments/LetterAssessmentScreen.js:26`, `/Users/jimmckeown/Development/zazi-izandi-app/src/screens/assessments/LetterAssessmentScreen.js:47`).

Impact: if `correction_count` is used in the grid-vs-sequential quality comparison, grid corrections will be undercounted as zero by construction while sequential Back taps are counted. That makes the A/B data misleading.

Recommendation: either track grid corrections with the fork's `correctionCountRef` and pass it to `finishAndSave`, or explicitly remove `correction_count` from comparison claims. Add a screen test that marks a tile, untaps it, finishes, and asserts the saved grid row has `correction_count: 1`.

### Medium: Async route resolution needs a pending guard at both entry points

Task 12 changes the two assessment launch paths to await `resolveAssessmentRoute()` (`docs/superpowers/plans/2026-06-18-item4-sequential-capture.md:948`), but it does not add a re-entrancy guard or disabled/loading state. The current entry points are direct `onPress` handlers (`src/screens/assessments/AssessmentChildSelectScreen.js:110`, `src/screens/assessments/ChildAssessmentSummaryScreen.js:110`), so a rapid double tap can start two async resolves and fire duplicate navigations.

Impact: duplicate capture screens or duplicate attempts are possible, especially on low-end devices where the local-state read is not instantaneous.

Recommendation: add a local `isResolvingAssessmentRoute` state/ref in both screens, disable the pressed row/button/dialog Start while pending, and cover it with a test where `storage.getCaptureMode()` is deferred and two presses only navigate once.

### Medium: Existing LetterAssessmentScreen tests will fail or lose coverage after the retry UI removal

Task 8 removes the inline `saveError` / `Try Again` UI and replaces it with an Alert (`docs/superpowers/plans/2026-06-18-item4-sequential-capture.md:850`). The existing `__tests__/LetterAssessmentScreen.plan5.test.js` still asserts the visible error text, visible "Try Again" button, and `navigation.navigate` retry behavior (`__tests__/LetterAssessmentScreen.plan5.test.js:110`).

Impact: the finish-branch full Jest gate will fail unless this test is updated. If the test is deleted instead, the important failed-save retry/discard behavior loses coverage.

Recommendation: make Task 8 explicitly update `__tests__/LetterAssessmentScreen.plan5.test.js` rather than adding only a new happy-path test. Preserve coverage for failed local save, Alert Retry, Alert Discard, and `beforeRemove` protection while the result exists only in memory.

### Medium: Task 4 does not prove `capture_mode` reaches the Supabase payload

Task 4 correctly calls out that `SERVER_COLUMNS.assessments` must include `capture_mode` or the field will persist locally but never sync (`docs/superpowers/plans/2026-06-18-item4-sequential-capture.md:453`). The proposed Task 4 tests only cover local migration/repository round-trip and the SQLite CHECK constraint (`docs/superpowers/plans/2026-06-18-item4-sequential-capture.md:387`).

Impact: the most likely sync-contract regression, forgetting the push allowlist, is not directly covered.

Recommendation: add an `offlineSync`/outbox payload test that saves an assessment with `capture_mode`, processes or builds the assessment push payload, and asserts the Supabase upsert payload includes `capture_mode` while local-only fields remain stripped.

### Low: The storage task references a `LOCAL_STATE_KEYS` map that does not exist in Masi

Task 5 says Masi already has an identical `LOCAL_STATE_KEYS` map (`docs/superpowers/plans/2026-06-18-item4-sequential-capture.md:501`), but `src/utils/storage.js` currently uses direct local-state key strings plus `USER_PROFILE_KEY`; there is no `LOCAL_STATE_KEYS` symbol.

Impact: small implementation friction and possible churn if an agent creates a broad key map just to satisfy the plan.

Recommendation: either introduce a narrow `const CAPTURE_MODE_KEY = 'assessment_capture_mode'` near `USER_PROFILE_KEY`, or intentionally add a `LOCAL_STATE_KEYS` object as a small cleanup. Update the plan so the implementer is not looking for a nonexistent pattern.

## Checks That Look Sound

- The nullable/no-default `capture_mode` design is correct for old rows and avoids backfilling unknown capture mechanics as sequential.
- Keeping `capture_mode` on `assessments` and `correction_count` in the summary metadata is compatible with the existing normalized `assessments` + `assessment_items` split.
- Deferring `AssessmentResultsScreen.handleTryAgain` is at least disclosed, but it should remain a prominent rollout caveat because it sends a default-sequential EA back to grid until Item 5 lands.

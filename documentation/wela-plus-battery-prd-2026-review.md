# Review: WelaPLUS Battery PRD

Reviewed plan: `documentation/wela-plus-battery-prd-2026.md`

Review date: 2026-05-29

Verdict: the PRD is strong on product vocabulary, component boundaries, and the three-level Battery Run model. I would not hand it to implementation unchanged. The migration/RLS/sync handoff has several concrete gaps that will either fail against the current SQLite/Supabase app or leave the HQ calibration path underspecified.

## Reviewed against

- `CONTEXT.md`
- `docs/agent-context/wela-assessment-component-build.md`
- `documentation/learning/assessment_battery_architecture.md`
- `documentation/rls-sync-contract-map.md`
- `src/db/migrations.js`
- `src/db/repositories/assessmentsRepository.js`
- `src/services/offlineSync.js`
- `supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql`
- `supabase/migrations/20260525231506_masi_rls_contract_cleanup.sql`
- `supabase/migrations/20260526151352_creator_select_upsert_visibility.sql`
- Current `package.json` and `app.config.js`

## Strengths

- The Question / Battery / Run / Window vocabulary matches the updated domain glossary and avoids the old "field assessment" versus "in-app assessment" ambiguity.
- Keeping Question components pure and host-agnostic is the right OSS boundary. The package should not know child, EA, programme, SQLite, Supabase, or photo-sync details.
- The parent `battery_runs` table is the right shape for "one EA administering one Battery to one child" and avoids reconstructing a Run from eleven unrelated `assessments` rows.
- Photo compression, wifi-default upload, and a separate photo lane are the right field-device instincts.
- Q11's hybrid-normalized ADR is a defensible direction, provided the item identity and HQ write-path issues below are fixed.

## Critical findings

### 1. New WelaPLUS `assessments` rows still have to satisfy existing required columns

The PRD adds `question_code`, `question_version`, `item_set_id`, and `stopped_reason`, but the current local/server `assessments` table still requires `assessment_type` and `assessment_date`. It also has the `assessment_purpose` / `assessment_window_id` constraint from the SQLite refactor.

Current local schema:
- `assessment_type text not null`
- `assessment_date text not null`
- official windows require `assessment_purpose = 'official_window'` and `assessment_window_id is not null`

PRD references:
- `documentation/wela-plus-battery-prd-2026.md:85-90`
- `documentation/wela-plus-battery-prd-2026.md:597-622`

Fix needed:
- Specify the complete row mapping for every Question result.
- Recommended: write `assessment_type = question_code` for compatibility, set `assessment_date` from the Run start/completion date, and copy `assessment_window_id` plus `assessment_purpose` from the parent Run onto each child `assessments` row.
- Add local and server migration tests proving WelaPLUS rows satisfy the existing NOT NULL and CHECK constraints.

### 2. Skipped and auto-skipped Questions do not have a durable storage shape yet

The PRD says skipped Questions count as "decided" and that prerequisite-unmet Questions are auto-skipped, but there is no separate `battery_run_question_states` table. The only place to store a skip reason is `assessments.stopped_reason`.

PRD references:
- `documentation/wela-plus-battery-prd-2026.md:136-138`
- `documentation/wela-plus-battery-prd-2026.md:599-612`

Fix needed:
- State explicitly that every skipped Question creates an `assessments` row with `question_code`, `stopped_reason`, no item rows, and clear score semantics.
- Define whether skipped rows use `score = NULL` or `score = 0`, and whether `total_items = NULL` or `0`.
- Add repository tests for manual skip and prerequisite auto-skip.

### 3. The EGRA backfill will miss current mobile-created rows

The PRD's backfill joins through `assessment_tool_id`, but current `LetterAssessmentScreen` saves `assessment_type` and does not set `assessment_tool_id`. That means many current EGRA rows can remain with `question_code = NULL`.

Evidence:
- `src/screens/assessments/LetterAssessmentScreen.js:202-207` writes `assessment_type` but no `assessment_tool_id`.
- `documentation/wela-plus-battery-prd-2026.md:710-728` only backfills via `assessment_tool_id`.
- Tests and fixtures show existing codes such as `letter_egra`, `letter_sounds`, and `egra_letter_sounds`, while the PRD text also names `egra_letter_sound`.

Fix needed:
- Choose one canonical legacy Question code.
- Backfill with a fallback from `assessment_type` when `assessment_tool_id` is NULL.
- Include known legacy variants in the mapping.
- Add a test fixture for a mobile-created EGRA row with no `assessment_tool_id`.

### 4. Q11 EA and HQ `assessment_items` will collide under the current deterministic item-id strategy

The PRD says Q11 has four EA rows plus four HQ rows with the same dimension codes and `is_correct = false`. The current item ID helper uses `assessmentId`, `position` or `itemKey`, and `isCorrect`. It does not include `metadata.scorer`.

Evidence:
- `src/db/repositories/domainRepositoryUtils.js:22-36`
- `documentation/wela-plus-battery-prd-2026.md:366-373`

Why this matters:
- EA row `meaning_making`, position 1, `is_correct = false` and HQ row `meaning_making`, position 1, `is_correct = false` can produce the same deterministic ID if the current helper is reused.
- A later HQ row could overwrite or fail instead of existing as the additional row the ADR requires.

Fix needed:
- Make Q11 item identity include scorer, for example `item_key = 'ea:meaning_making'` and `item_key = 'hq:meaning_making'`, or add scorer to a new generic deterministic ID input.
- Document the exact item key / ID convention in the PRD and ADR.
- Add a test proving a fully calibrated Q11 result has 8 distinct `assessment_items` rows.

### 5. `battery_runs` RLS is too weak as sketched

The sketched policy only checks `user_id = auth.uid()`. That lets an authenticated EA create a Run for any `child_id` / `programme_id` they can guess. Existing assessment writes require active child access plus active programme assignment; the new parent table should not be weaker.

PRD reference:
- `documentation/wela-plus-battery-prd-2026.md:653-695`

Existing contract:
- `documentation/rls-sync-contract-map.md:22-28`
- `documentation/rls-sync-contract-map.md:71-72`

Fix needed:
- `battery_runs` INSERT and UPDATE should require:
  - `user_id = auth.uid()`
  - active write access to `child_id`
  - active `staff_programme_assignments` row for `programme_id`
- SELECT needs direct owner visibility for upsert plus child-history visibility for legitimate readback.
- Add `battery_runs` to the RLS contract map, `PUSH_ORDER`, dependencies, server column allowlist, producer guards, and migration/static tests.

### 6. `battery_run_artifacts` and Storage need stronger integrity rules

The PRD says artifact rows sync before photo files and Storage policies validate by path, but the table sketch does not constrain `storage_path` to match `battery_run_id` / `artifact_id`. A malicious or buggy client could point an artifact row at another object's path.

PRD references:
- `documentation/wela-plus-battery-prd-2026.md:217-236`
- `documentation/wela-plus-battery-prd-2026.md:575-595`
- `documentation/wela-plus-battery-prd-2026.md:690-692`

Fix needed:
- Add a CHECK or trigger so `storage_path` matches `battery-run-photos/{battery_run_id}/{id}.jpg`.
- Storage RLS should parse the Run ID from `storage.objects.name` and verify ownership/access through `battery_runs`.
- Artifact INSERT should require access through a writable Run, not just any visible Run.
- Add tests or SQL assertions for path integrity and Storage policy shape.

### 7. The HQ calibration write path is not defined

The PRD says the future HQ NextJS dashboard writes `hq_rubric_total` and four HQ `assessment_items` rows. Current RLS for `assessments` UPDATE and `assessment_items` INSERT is EA-owner/active-child-write scoped. Head Office will not satisfy that as an authenticated mobile-style user.

Evidence:
- `supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:998-1051`
- `supabase/migrations/20260525231506_masi_rls_contract_cleanup.sql:123-146`
- `documentation/wela-plus-battery-prd-2026.md:366-373`

Fix needed:
- Decide now whether the HQ dashboard writes through a service-role backend, an RPC, or a dedicated HQ role/policy.
- If service-role: document that the NextJS API layer owns programme authorization because RLS is bypassed.
- If authenticated/RLS: add the required policies or RPC contract before relying on the calibration columns.

### 8. The result-to-storage contract is incomplete

The OSS result shape includes `language`, `duration_ms`, `items`, and `derived`. The migration section does not say where `duration_ms`, `derived`, per-Question max values, or per-Question language live. Current `assessmentsRepository.saveAssessment` is EGRA-specific and writes a `__summary__` item row with EGRA-only fields.

Evidence:
- `documentation/wela-plus-battery-prd-2026.md:108-123`
- `src/db/repositories/assessmentsRepository.js:56-69`
- `src/db/repositories/assessmentsRepository.js:119-199`

Fix needed:
- Add a precise "OSS result to Masi rows" section.
- Either add generic columns such as `duration_ms` and `language`, or explicitly store them in a generic summary metadata row.
- Do not reuse the current EGRA summary shape for WelaPLUS without refactoring it.
- Add a new generic repository method such as `saveQuestionResult` or a `batteryRunsRepository` instead of stretching `saveAssessment` in its current EGRA-specific form.

## High-priority gaps

### 9. Timed sequential Questions need an attempted / not-reached signal

The "tap correct, blank wrong" UI model is simple, but for timed sequential Questions it conflates three states: correct, attempted-wrong, and not reached. Existing EGRA solved this with a last-attempted flow. WelaPLUS Q1, Q6, and Q8 need the same data clarity if reports use attempted counts, error patterns, or words-correct-per-minute.

PRD references:
- `documentation/wela-plus-battery-prd-2026.md:127-129`
- `documentation/wela-plus-battery-prd-2026.md:140-147`
- `documentation/wela-plus-battery-prd-2026.md:161-170`

Fix needed:
- Add `last_attempted_position` to `derived` or item metadata for timed/sequential Questions.
- Define whether unattempted items are omitted, stored with `metadata.attempted = false`, or stored as false with a separate last-attempted marker.
- Keep raw correct count as the primary stat; do not let percent-correct over attempted/not-attempted ambiguity drive reporting.

### 10. Photo sync needs a concrete local queue/state model

The PRD says there is a separate low-priority photo lane, but does not define the local state that lane operates on. The Settings row also depends on counting pending local photo files.

Evidence:
- `documentation/wela-plus-battery-prd-2026.md:217-236`
- `documentation/wela-plus-battery-prd-2026.md:787-807`
- Current `package.json` has `expo-file-system`, but not `expo-image-picker`, `expo-image-manipulator`, or `expo-network`.
- The app already has `@react-native-community/netinfo`, so the implementation should choose NetInfo versus Expo Network deliberately.
- `app.config.js` currently has location permissions only; no camera permission strings.

Fix needed:
- Define local-only fields or a separate `photo_upload_queue`: local path, compressed size, upload status, retry count, last error, next retry time, uploaded_at, and one-shot cellular override handling.
- Add camera permission config for iOS and Android.
- Add support export/debug dump coverage for failed or pending photo uploads.
- Add tests for wifi-only, remote cellular override, one-shot cellular override, retry, and delete-after-upload.

### 11. `battery_run_artifacts.question_code` has contradictory nullability

The PRD says the column is nullable in the schema summary, but later says every row carries a non-null `question_code`, and the SQL uses `text not null`. The architecture explainer also still says nullable.

Evidence:
- `documentation/wela-plus-battery-prd-2026.md:88`
- `documentation/wela-plus-battery-prd-2026.md:211`
- `documentation/wela-plus-battery-prd-2026.md:580-585`
- `documentation/learning/assessment_battery_architecture.md` still describes nullable whole-sheet photos.

Fix needed:
- Make it non-null everywhere if per-Question photos are the locked decision.
- Update the architecture explainer at the same time as the PRD.

### 12. `programmes.default_battery_code` needs local reference-data handling and maybe version pinning

Adding `default_battery_code` to Postgres is not enough. Programmes are pulled reference data, and the local `programmes` column allowlist does not include this field today.

Evidence:
- `src/db/repositories/referenceDataRepository.js:55-83`
- `documentation/wela-plus-battery-prd-2026.md:623-630`

Fix needed:
- Add `default_battery_code` to local SQLite `programmes`.
- Add it to `referenceDataRepository` columns so it actually reaches devices.
- Decide whether the default also needs `default_battery_version`. If the installed app package always resolves the latest compatible version, say that explicitly; otherwise programme admins cannot pin a Battery version.

### 13. One-result-per-Question-per-Run needs an idempotency rule

Within a Run, the intended model is one `assessments` row per Question. The PRD does not specify a uniqueness constraint or deterministic assessment ID. Without one, retry/restart bugs can create duplicate Question rows in the same Run.

Fix needed:
- Add a partial unique index on `(battery_run_id, question_code)` where `battery_run_id is not null`, or use deterministic IDs per `(battery_run_id, question_code)`.
- If a Question can be re-run inside the same Run, define the replacement/archive semantics instead.

### 14. The stopped-reason enum is inconsistent across sections

The result shape omits `stop_rule`, while the SQL CHECK includes it. The user story mentions "tired" but the enum has no `skipped_tired`.

Evidence:
- `documentation/wela-plus-battery-prd-2026.md:117-119`
- `documentation/wela-plus-battery-prd-2026.md:42`
- `documentation/wela-plus-battery-prd-2026.md:605-610`

Fix needed:
- Use one enum list everywhere.
- Recommended additions/clarifications: `stop_rule`, `skipped_tired`, and a documented mapping for age/not-age-appropriate.

## Medium-priority improvements

### 15. "All additive, no risk" is too confident for RLS/sync work

The schema changes are additive, but RLS, outbox ordering, server-column allowlists, local migrations, and reference-data pull changes can still break live sync. The PRD should say "additive schema, but high-risk sync/RLS integration" rather than "None - additive" for the RLS rows.

PRD reference:
- `documentation/wela-plus-battery-prd-2026.md:527-536`

### 16. The app is currently not configured like a tablet-first app

The PRD says the target is mostly tablets. Current Expo config is portrait-only and `ios.supportsTablet = false`.

Evidence:
- `app.config.js:10-28`
- `documentation/wela-plus-battery-prd-2026.md:424`

Fix needed:
- Clarify whether "mostly tablets" means Android tablets only.
- If iPad support matters, update the app config and test responsive layouts on iPad/tablet dimensions.

### 17. OSS package setup should specify package manager, peer dependencies, and release safety

The repo guidance prefers pnpm with `minimumReleaseAge: 1440` where practical. The current Masi app remains npm/package-lock, but the new OSS repo can start clean.

Fix needed:
- Specify pnpm for the new OSS package unless there is a reason not to.
- Define peer dependencies (`react`, `react-native`, probably `react-native-paper` if components depend on it).
- Separate code license and content license in CI/release checks, not just README prose.
- Make leadership sign-off a hard gate for public content release, but not for private Masi app integration with placeholder/private content.

### 18. Field-test success criteria should be more explicit

"Review the first 50 Runs" is useful, but the PRD should define what would cause widen, hold, or rollback.

Fix needed:
- Define minimum acceptable sync success rate, photo upload success/legibility threshold, no-terminal-outbox tolerance, and Q11 photo-quality decision criteria.

## Suggested Claude action list

1. Patch the PRD before implementation starts. Do not rely on the current "design complete" wording.
2. Add a concrete "Masi storage mapping" subsection for `battery_runs`, per-Question `assessments`, `assessment_items`, skips, Q11 HQ rows, and photo artifacts.
3. Tighten the migration section with exact RLS policy intent, grants, Storage policy shape, local SQLite mirror fields, reference-data updates, and sync-engine updates.
4. Update `documentation/learning/assessment_battery_architecture.md` for the `question_code NOT NULL` artifact decision and any finalized skip/result mapping.
5. Add migration/static tests before writing app UI.
6. Add repository/outbox integration tests before writing the Question flow UI.

## Bottom line

The direction is correct, but the implementation handoff is not yet safe. The plan needs one more pass focused on storage, RLS, sync, and idempotency before Claude starts writing migrations or app code.

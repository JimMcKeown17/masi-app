# Adversarial plan review: classifyError hardening (#48)

Issue source: `gh issue view 48` was attempted first but could not connect to `api.github.com` in this sandbox. I fetched the issue through the installed GitHub connector and verified the acceptance criteria from there. Local source inspection was read-only except for this review file.

## Findings

R1. Blocker - FK-parent-only evidence is not safe for 42501 assignment-grant races. Verdict: flawed.

Evidence:
- The plan deliberately excludes sibling assignment grant evidence and says `child_group_memberships` requiring an active assignment is out of scope: [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:9](../superpowers/plans/2026-07-08-classifyerror-hardening.md:9), [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:701](../superpowers/plans/2026-07-08-classifyerror-hardening.md:701).
- The current policies do not authorize these writes from FK parents alone. `child_group_memberships` insert/update/delete require both `current_user_can_write_for_child(child_id)` and `current_user_can_write_for_group(group_id)`: [supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:899](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:899), [supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:908](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:908), [supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:920](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:920).
- `current_user_can_write_for_child` is granted by active `child_ea_assignments`, or by active class/group assignments through `child_class_memberships` or `child_group_memberships`: [supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:483](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:483).
- `current_user_can_write_for_group` is granted by `groups.created_by` or active `group_ea_assignments`: [supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:420](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:420).
- The same pattern affects `child_programme_enrollments` ([supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:697](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:697)), `child_class_memberships` ([supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:862](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:862)), `session_attendees` ([supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:965](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:965)), `assessments` ([supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:998](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:998)), `assessment_items` ([supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:1040](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:1040)), `letter_mastery` ([supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:1088](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:1088)), `grouping_versions` ([supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:814](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:814)), and `class_grouping_state` ([supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:838](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:838)).
- The local producers create exactly these sibling assignment rows in the same write graph. New children enqueue `children`, then `child_ea_assignments`, then child relationship rows: [src/db/repositories/childrenRepository.js:115](../../src/db/repositories/childrenRepository.js:115), [src/db/repositories/childrenRepository.js:121](../../src/db/repositories/childrenRepository.js:121), [src/db/repositories/childrenRepository.js:145](../../src/db/repositories/childrenRepository.js:145), [src/db/repositories/childrenRepository.js:169](../../src/db/repositories/childrenRepository.js:169). New groups enqueue `groups` plus missing `group_ea_assignments`: [src/db/repositories/groupsRepository.js:144](../../src/db/repositories/groupsRepository.js:144), [src/db/repositories/groupsRepository.js:167](../../src/db/repositories/groupsRepository.js:167).

Recommended change:
Do not defer assignment-grant evidence wholesale to #47. For #48, add local 42501 evidence for the RLS grant rows that are already part of the current outbox graph. At minimum, check pending `child_ea_assignments` by `child_id`, pending `class_ea_assignments` by `class_id`, and pending `group_ea_assignments` by `group_id` for the tables above. Keep FK-parent evidence for `23503`; use an additional RLS-grant-evidence map for `42501` so the concepts stay separate.

R2. Should-fix - Excluding terminal parents creates an automatic orphan gap with #44 healing. Verdict: needs-change.

Evidence:
- The plan defines pending evidence as only `pending`, `failed`, or `in_flight`, and explicitly excludes terminal parents: [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:350](../superpowers/plans/2026-07-08-classifyerror-hardening.md:350), [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:404](../superpowers/plans/2026-07-08-classifyerror-hardening.md:404).
- #44 can requeue unmarked RLS-terminal rows back to pending: `requeueTerminalRlsFailures` filters terminal rows through `isHealableRlsError` and calls `requeueTerminalRows`: [src/services/offlineSync.js:1105](../../src/services/offlineSync.js:1105), [src/services/offlineSync.js:1131](../../src/services/offlineSync.js:1131). The tests prove this for owned child rows and owned assessment item rows: [__tests__/requeueTerminalRlsFailures.test.js:106](../../__tests__/requeueTerminalRlsFailures.test.js:106), [__tests__/requeueTerminalRlsFailures.test.js:187](../../__tests__/requeueTerminalRlsFailures.test.js:187).
- Marked 42501 denials are deliberately never healed because `isHealableRlsError` rejects errors starting with `AUTHENTICATED_DENIAL_MARKER`: [src/services/offlineSync.js:292](../../src/services/offlineSync.js:292), [src/services/offlineSync.js:296](../../src/services/offlineSync.js:296). The test locks this in: [__tests__/requeueTerminalRlsFailures.test.js:138](../../__tests__/requeueTerminalRlsFailures.test.js:138).
- Normal sync excludes terminal rows; only force includes them: [src/db/repositories/syncOutboxRepository.js:69](../../src/db/repositories/syncOutboxRepository.js:69). `syncAll` passes `includeTerminal: force`: [src/services/offlineSync.js:990](../../src/services/offlineSync.js:990).

Failure mode:
If a parent is terminal but healable, the child sees no pending parent and a live-session 42501 is stamped as authenticated terminal. Later #44 heals and syncs the parent, but the child remains terminal forever under auto-sync because the marker makes #44 skip it and normal sync never includes terminal rows. Force Sync Now can rescue it, but that is a manual escape hatch, not automatic healing.

Recommended change:
Treat terminal parents that are locally healable RLS terminals as unresolved evidence, or make #44 also requeue terminal descendants whose parent just healed. Do not count marked authenticated denials or non-RLS terminals as pending evidence.

R3. Nice-to-have - The #43 no-session composition is sound, but the plan should test all four combinations explicitly. Verdict: sound with coverage gaps.

Evidence:
- Current loop classifies first, then only enters the no-session/marker branch for terminal 42501s: [src/services/offlineSync.js:761](../../src/services/offlineSync.js:761), [src/services/offlineSync.js:764](../../src/services/offlineSync.js:764).
- If no live session remains, it downgrades to retriable and does not stamp the marker: [src/services/offlineSync.js:765](../../src/services/offlineSync.js:765), [src/services/offlineSync.js:769](../../src/services/offlineSync.js:769). Existing test: [__tests__/offlineSyncAuthGate.test.js:216](../../__tests__/offlineSyncAuthGate.test.js:216).
- If a live session exists, it stamps `AUTHENTICATED_DENIAL_MARKER`: [src/services/offlineSync.js:773](../../src/services/offlineSync.js:773). Existing test: [__tests__/offlineSyncAuthGate.test.js:251](../../__tests__/offlineSyncAuthGate.test.js:251).
- With the plan's `classification.terminal === false` for parent-pending 42501s, the branch is skipped: [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:508](../superpowers/plans/2026-07-08-classifyerror-hardening.md:508), [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:568](../superpowers/plans/2026-07-08-classifyerror-hardening.md:568).

Expected matrix:
- Live session plus parent pending: retriable, no marker.
- Live session plus no pending parent: terminal, marker.
- No session plus parent pending: retriable, no marker.
- No session plus no pending parent: retriable, no marker.

Recommended change:
Add focused tests for the two new parent-pending cases and assert both status and `last_error` prefix. The existing live/no-parent and no-session/no-parent tests already cover half the matrix. This finding depends on R2: terminal-but-healable parent must not be treated as "no pending parent".

R4. Should-fix - `PARENT_FK_COLUMNS` is partly correct but misses pushed grouping-version FKs and relies on a stale guard. Verdict: needs-change.

Evidence that is sound:
- `children.class_id` is real and pushed: [src/services/offlineSync.js:80](../../src/services/offlineSync.js:80), [supabase/migrations/20260521115412_masi_clean_base_schema.sql:107](../../supabase/migrations/20260521115412_masi_clean_base_schema.sql:107), [src/db/migrations.js:249](../../src/db/migrations.js:249).
- `child_class_memberships.class_id` is a real FK to `classes`; the active unique index being on `(child_id, academic_year_id)` does not remove the class FK: [supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:112](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:112), [supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:236](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:236).
- `class_grouping_state.active_grouping_version_id` is a real FK to `grouping_versions`: [supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:95](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:95), [src/db/migrations.js:346](../../src/db/migrations.js:346).

Evidence that is flawed:
- The plan's map has `groups: { classes: 'class_id' }` only: [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:285](../superpowers/plans/2026-07-08-classifyerror-hardening.md:285). But `groups.grouping_version_id` is pushed and locally enforced as an FK to `grouping_versions`: [src/services/offlineSync.js:112](../../src/services/offlineSync.js:112), [src/db/migrations.js:381](../../src/db/migrations.js:381), [supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:139](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:139).
- The plan's map has `child_group_memberships` only to children and groups: [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:287](../superpowers/plans/2026-07-08-classifyerror-hardening.md:287). But `child_group_memberships.grouping_version_id` is pushed and is a local/Supabase FK: [src/services/offlineSync.js:121](../../src/services/offlineSync.js:121), [src/db/migrations.js:420](../../src/db/migrations.js:420), [supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:146](../../supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:146). The repository populates it from the group when adding a child to a group: [src/db/repositories/groupsRepository.js:199](../../src/db/repositories/groupsRepository.js:199), [src/db/repositories/groupsRepository.js:213](../../src/db/repositories/groupsRepository.js:213).
- The proposed drift guard only compares `PARENT_FK_COLUMNS` to `TABLE_DEPENDENCIES`: [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:314](../superpowers/plans/2026-07-08-classifyerror-hardening.md:314). But `TABLE_DEPENDENCIES` itself lacks these grouping-version edges: [src/services/offlineSync.js:170](../../src/services/offlineSync.js:170).

Recommended change:
Add `groups -> grouping_versions` via `grouping_version_id` and `child_group_memberships -> grouping_versions` via `grouping_version_id`, with null values skipped. Update `TABLE_DEPENDENCIES` or add a separate schema/payload guard that verifies pushed local-domain FKs, not just the current dependency map.

R5. Blocker - Task 4 Step 6's fallback test does not exercise parent-pending classification. Verdict: flawed.

Evidence:
- The plan notes that a successful parent is deleted before the child is classified, then suggests making the parent fail retriably in the same pass: [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:626](../superpowers/plans/2026-07-08-classifyerror-hardening.md:626).
- `finalizeSuccess` really deletes the synced outbox row: [src/services/offlineSync.js:521](../../src/services/offlineSync.js:521).
- But if a parent table fails in the same pass, `applyRecordResult` adds the table to `failedTables`: [src/services/offlineSync.js:946](../../src/services/offlineSync.js:946), [src/services/offlineSync.js:961](../../src/services/offlineSync.js:961). The main loop then skips dependents whose dependency table failed: [src/services/offlineSync.js:997](../../src/services/offlineSync.js:997), [src/services/offlineSync.js:1000](../../src/services/offlineSync.js:1000).
- `assessment_items` depends on `assessments`: [src/services/offlineSync.js:183](../../src/services/offlineSync.js:183). So making `assessments` fail in the same pass skips the item before it is sent to the server. It never receives the 42501 and never runs `classifyError`.
- The proposed test also does not verify the acceptance criterion that the row succeeds on a later pass once the parent syncs: [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:580](../superpowers/plans/2026-07-08-classifyerror-hardening.md:580), [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:734](../superpowers/plans/2026-07-08-classifyerror-hardening.md:734).

Recommended change:
Use a setup where the parent outbox row exists but is not processed in the same pass. Two sound options:

1. Seed parent `assessments` outbox as pending, then call `engine.syncAll({ tableName: 'assessment_items' })` or `engine.syncTableByName('assessment_items')`. The parent stays in `sync_outbox`, the child reaches the server, and `hasPendingRecord` sees the parent.
2. Seed the parent as `failed` with a future `next_retry_at`, leave the child ready, and run a normal pass. `getReadyRecords` excludes the parent but `hasPendingRecord` still counts it.

Then add a second pass: make the parent succeed, make the child succeed, and use `force: true` or clear the child's backoff so AC2 proves "retryable now, succeeds later once the parent syncs."

R6. Nice-to-have - Retry/cycle risk is acceptable with the current proposed shape, but add guards and observability. Verdict: sound with safeguards.

Evidence:
- The proposed `computeParentEvidencePending` is a flat point-query over derived parent pairs, not recursive graph traversal: [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:531](../superpowers/plans/2026-07-08-classifyerror-hardening.md:531).
- Current `TABLE_DEPENDENCIES` has no same-table edge: [src/services/offlineSync.js:170](../../src/services/offlineSync.js:170). The proposed parent map also has no same-table edge: [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:277](../superpowers/plans/2026-07-08-classifyerror-hardening.md:277).
- Retriable failures are backed off, capped at 15 minutes: [src/services/offlineSync.js:260](../../src/services/offlineSync.js:260). So a permanently failing parent can keep a child retriable, but it should not create a tight retry storm.

Recommended change:
Add a drift test that no parent-evidence edge points to the same table. Also make retriable child failures include enough local reason text to see which parent or grant evidence kept them retrying. A child waiting on a genuinely pending parent is better than premature terminal quarantine, but it must be visible in support logs.

R7. Nice-to-have - `last_error` and #44 heal matching are safe for the proposed 23514 reason. Verdict: sound.

Evidence:
- #44 heals only when `last_error` matches `/row-level security|42501/i` and does not start with `AUTHENTICATED_DENIAL_MARKER`: [src/services/offlineSync.js:292](../../src/services/offlineSync.js:292), [src/services/offlineSync.js:294](../../src/services/offlineSync.js:294), [src/services/offlineSync.js:296](../../src/services/offlineSync.js:296).
- The proposed 23514 reason is `Immutable identity columns rejected the update (23514)`, which does not contain `42501` or `row-level security`: [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:496](../superpowers/plans/2026-07-08-classifyerror-hardening.md:496).
- The marker still remains the prefix for live-session 42501s because the existing block prepends `AUTHENTICATED_DENIAL_MARKER` to the current reason: [src/services/offlineSync.js:773](../../src/services/offlineSync.js:773).

Recommended change:
Keep this as-is. Add one assertion in the new 23514 integration test that `last_error` does not match `/42501|row-level security/i` if you want a cheap regression guard.

R8. Should-fix - Additional implementation and test issues will cause churn or false confidence. Verdict: needs-change.

Evidence:
- The Task 4 assessment seed snippets are not executable against the real SQLite schema. Local `assessments` requires `user_id`, `programme_id`, `assessment_type`, and `assessment_date`: [src/db/migrations.js:482](../../src/db/migrations.js:482). The snippet inserts `created_by`, which is not an assessment column, and omits the required columns: [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:586](../superpowers/plans/2026-07-08-classifyerror-hardening.md:586), [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:610](../superpowers/plans/2026-07-08-classifyerror-hardening.md:610).
- The Task 3 test calls `markTerminalFailure(id, 'boom')`, but the repository signature is `markTerminalFailure(id, { errorMessage })`: [docs/superpowers/plans/2026-07-08-classifyerror-hardening.md:381](../superpowers/plans/2026-07-08-classifyerror-hardening.md:381), [src/db/repositories/syncOutboxRepository.js:172](../../src/db/repositories/syncOutboxRepository.js:172).
- Archive payloads often contain only `id` plus the archive timestamp, not parent FK columns. Examples: `children` archive: [src/db/repositories/childrenRepository.js:484](../../src/db/repositories/childrenRepository.js:484), relationship archives: [src/db/repositories/childrenRepository.js:501](../../src/db/repositories/childrenRepository.js:501), group archives: [src/db/repositories/groupsRepository.js:272](../../src/db/repositories/groupsRepository.js:272), group relationship archives: [src/db/repositories/groupsRepository.js:289](../../src/db/repositories/groupsRepository.js:289). A payload-only `parentEvidenceForRecord` therefore returns no parent evidence for many update/archive failures even though the local domain row still has the FK columns.

Recommended change:
Fix the test snippets to use real schema-required columns and repository signatures. For parent evidence, either document that #48 only covers insert/full-payload records, or better, have `computeParentEvidencePending` resolve missing FK values from the local domain row before falling back to "no evidence." That still uses local state only and prevents archive/update false terminals.

Overall verdict: build-with-fixes. Part 1 is sound. Part 2 needs fixes before implementation: include assignment-grant evidence for 42501, handle terminal-but-healable parents, repair the parent-pending integration test, and update the FK map for grouping-version parents.

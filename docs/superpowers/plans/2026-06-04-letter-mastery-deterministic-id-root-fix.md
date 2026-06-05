# letter_mastery Deterministic Push-Id Root Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `letter_mastery` **server push** carry a deterministic logical-key id so insert-by-id is idempotent and the duplicate-key (23505) sync failure is impossible — and remove the runtime "adoption" reconciliation **after** legacy staging rows are cleaned and the new build is the only active writer.

**Architecture:** A `letter_mastery` row's identity is its logical key (`user_id, child_id, programme_id, letter, language, source`). New rows are minted with a deterministic id (`letterMasteryDomainId`); `buildSyncPayload` maps *every* push to that id (so pre-fix random-id rows on OTA-updated devices also push canonically — exactly the pattern `session_attendees`/`assessment_items` already use). Local `record_id` may remain device-local for pre-fix rows; only the **push identity** is canonical. Prevention replaces reconciliation, which is only safe once no legacy/old-build random-id rows can collide — hence the mandatory cleanup + rollout gates below.

**Tech Stack:** React Native (Expo) + SQLite (better-sqlite3 in tests) + durable `sync_outbox` + Supabase (`masi-app-sqlite`, ref `segygjzpujphwvrubusm`). Jest. Branch: `fix/letter-mastery-sync-idempotency`.

---

## Background — why pivot from adoption (and its limits)

The reported bug: a `letter_mastery` insert sticks forever on `idx_letter_mastery_unique_active` (23505) because the row carries a fresh random id while the server already holds the same logical key under a different id. Root cause: **id ≠ identity** — random surrogate ids for a logical-key-unique, push-only table.

We first built **runtime adoption** (on 23505, look up the server's id, adopt it, rename the local PK, reconcile the outbox). Four Codex passes each found a *new* concurrency edge in that same code (orphaned archive, cached-id staleness, tombstone non-collision, transient-lookup misclassification, in-flight race) — the "every fix reveals new coupling" signal: adoption mutates ids + outbox mid-sync, outside the engine's optimistic-concurrency guards.

**Decision (user, 2026-06-04):** prefer prevention (deterministic ids — the codebase's existing pattern for the other logical-key tables) over reconciliation. Adoption's runtime self-healing is only worth its complexity when data is precious and client versions are uncontrolled — the opposite of this controlled field test (disposable `letter_mastery` test data, ~one device per EA).

**The catch (Codex plan review, 2026-06-04):** prevention only fully fixes the root cause **if** legacy random-id server rows are removed **and** no old build can recreate them. Those are therefore **mandatory release gates**, not caveats.

---

## Mandatory constraints (release gates)

1. **Staging cleanup before shipping the adoption-removed build.** A deterministic push still 23505-collides with a pre-existing random-id active row for the same key. Legacy `letter_mastery` rows on `masi-app-sqlite` MUST be cleaned (Task 0) before the new build is distributed. Verified by a zero-conflict preflight.
2. **No active old writer.** With multiple app versions possibly in the wild (AGENTS.md), an old build can re-create a random-id server row that the new build then collides with and **cannot self-heal** (adoption is gone). The rollout MUST ensure every field device that writes `letter_mastery` runs the new (deterministic) build — see OPEN DECISION 3.

If either gate cannot be guaranteed, do NOT remove adoption yet — choose the two-phase rollout (OPEN DECISION 3, option ii).

---

## OPEN DECISIONS (resolve before executing)

1. **Cleanup mechanism** (Task 0): **(a) DELETE** legacy `letter_mastery` rows on staging (recommended — disposable test data; simplest); (b) canonicalize ids via `uuid_generate_v5` matching the JS namespace (preserves data; fiddly); (c) user clears manually. Destructive + AGENTS.md blocks the agent from feeding the CLI credentials → **the user runs the preflight + delete** (agent supplies exact SQL).
2. **Local pre-fix rows:** **(a) document** that local ids may stay random and all *pushes* canonicalize (recommended — matches `session_attendees`/`assessment_items`); or (b) add a one-time **local SQLite migration** canonicalizing existing `letter_mastery` ids + their outbox rows to deterministic (true "identity everywhere"; more surgery). Note: a clean reinstall (clean-slate cutover) has no pre-fix local rows; only OTA-updated devices do.
3. **Rollout / adoption-removal timing:** **(i) controlled one-shot** — clean staging, force every field device onto the new build, ship with adoption removed (recommended for a small controlled test; small risk window between cleanup and force-update); or **(ii) two-phase** — ship deterministic+mapping while *keeping* adoption as the safety net, then remove adoption in a follow-up once all old builds are confirmed gone (safest; two releases).

---

## What stays vs. changes

**Keep (already on this branch — correct, edge-free):** `letterMasteryDomainId`; deterministic id at creation + `saveLetterMasteryRecord` returning it; `enqueueMasteryWrite` coalescing (the #35 ordering fix, id-strategy-independent); `LetterTrackerScreen` toggle-off by logical key (defensive; harmless); `literacySessionPersistence` storing the returned id; `masteryRepository.test.js` + `literacySessionPersistence.test.js`.

**Add:** `buildSyncPayload` deterministic-id mapping for `letter_mastery`.

**Remove (only under OPEN DECISION 3):** the adoption subsystem in `offlineSync.js` (`LETTER_MASTERY_LOGICAL_KEY`, `fetchLetterMasteryCanonicalId`, `adoptLetterMasteryCanonicalId`, both `processRecord` hooks) and its four tests.

---

## Task 0: Staging cleanup release gate (coordinated — OPEN DECISIONS 1 & 3)

**Files:** none (operational). Blocks shipping Tasks 1–2.

- [ ] **Step 1: Confirm decisions 1 & 3 with the user.**
- [ ] **Step 2: Preflight count** (user runs against `masi-app-sqlite`): `select count(*) as total, count(*) filter (where deleted_at is null) as active from letter_mastery;` and the non-canonical breakdown the user wants. Record the numbers.
- [ ] **Step 3: Cleanup** (decision 1a): user runs the scoped `delete from letter_mastery ...` (agent supplies exact SQL once scope is chosen).
- [ ] **Step 4: Verify zero conflicts:** re-run the preflight → expect 0 active legacy rows for keys the new build will write.
- [ ] **Step 5: Rollout commitment** (decision 3): confirm the controlled one-shot force-update plan, or switch to two-phase (keep adoption — skip Task 2).

> If decision 3 = two-phase (ii): execute Tasks 1, 3 (mapping test only), 4; **skip Task 2** (keep adoption). Schedule adoption removal as a follow-up once old builds are retired.

---

## Task 1: Map `letter_mastery` pushes to the deterministic id in `buildSyncPayload`

**Files:**
- Modify: `src/services/offlineSync.js` (import `letterMasteryDomainId`; add a block in `buildSyncPayload` near the `session_attendees`/`assessment_items` id blocks)
- Test: `__tests__/letterMasterySync.test.js`

- [ ] **Step 1: Write the failing test** — a row stored under a *random* local id pushes to the server under the deterministic id.

```js
test('a letter_mastery push is mapped to its deterministic logical-key id', async () => {
  const RANDOM_LOCAL_ID = '11111111-1111-1111-1111-111111111111';
  const db = await createMigratedDatabase(runMigrations);
  await seedCoreData(db);
  await seedChild(db);
  await insertMastery(db, RANDOM_LOCAL_ID);
  await createSyncOutboxRepository({ database: db }).enqueue({
    tableName: 'letter_mastery', recordId: RANDOM_LOCAL_ID, operation: 'insert',
    payload: {
      id: RANDOM_LOCAL_ID, ...LOGICAL_KEY,
      mastered_at: '2026-05-21T08:00:00.000Z', deleted_at: null,
      created_at: '2026-05-21T08:00:00.000Z', updated_at: '2026-05-21T08:00:00.000Z',
    },
  });

  const serverDb = await createMigratedDatabase(runMigrations);
  await seedCoreData(serverDb);
  await seedChild(serverDb);
  const { supabaseClient } = createServerBackedSupabase(serverDb);
  const engine = createOutboxSyncEngine({ database: db, supabaseClient });

  const result = await engine.syncAll();

  expect(result.failedRecords).toEqual([]);
  const expectedId = letterMasteryDomainId({
    userId: LOGICAL_KEY.user_id, childId: LOGICAL_KEY.child_id, programmeId: LOGICAL_KEY.programme_id,
    letter: LOGICAL_KEY.letter, language: LOGICAL_KEY.language, source: LOGICAL_KEY.source,
  });
  expect(await serverDb.getAllAsync('select id from letter_mastery')).toEqual([{ id: expectedId }]);
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx jest __tests__/letterMasterySync.test.js -t "mapped to its deterministic"` → server row has the random id.
- [ ] **Step 3: Implement** — import `letterMasteryDomainId`, then in `buildSyncPayload`, beside the `session_attendees`/`assessment_items` blocks:

```js
if (tableName === 'letter_mastery' && payload.id) {
  payload.id = letterMasteryDomainId({
    userId: payload.user_id,
    childId: payload.child_id,
    programmeId: payload.programme_id,
    letter: payload.letter,
    language: payload.language,
    source: payload.source || 'taught',
  });
}
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(sync): map letter_mastery pushes to the deterministic logical-key id"`

---

## Task 2: Remove the adoption subsystem (ONLY if OPEN DECISION 3 = one-shot, after Task 0)

**Files:** Modify `src/services/offlineSync.js`.

- [ ] **Step 1: Delete both `processRecord` adoption hooks** — the `letter_mastery` deleted-insert proactive block (before `runServerOperation`) and the `serverResult.error?.code === '23505'` block (after the success check).
- [ ] **Step 2: Delete the helpers** — `adoptLetterMasteryCanonicalId`, `fetchLetterMasteryCanonicalId`, `LETTER_MASTERY_LOGICAL_KEY`. Keep the `letterMasteryDomainId` import (used by Task 1).
- [ ] **Step 3: Run full suite** — the four adoption tests in `letterMasterySyncRepair.test.js` FAIL (removed behavior); fixed in Task 3. Everything else passes.
- [ ] **Step 4: Commit** — `git commit -m "refactor(sync): remove letter_mastery runtime adoption (deterministic push ids + legacy cleanup supersede it)"`

---

## Task 3: Rework the sync tests

**Files:** rename `__tests__/letterMasterySyncRepair.test.js` → `__tests__/letterMasterySync.test.js`.

- [ ] **Step 1: `git mv`** the file.
- [ ] **Step 2: Remove the 4 adoption tests** (`"...heals by adopting..."`, `"...no visible canonical row stays terminal"`, `"untaught-offline archives a prior active server row..."`, `"a failed canonical re-push keeps the tombstone retryable"`). Keep `"a letter taught then untaught offline syncs as exited..."` (coalescing) and the Task 1 mapping test. Update the describe title.
- [ ] **Step 3: Add the constraint-codifying test** — proves *why* Task 0 cleanup is mandatory (a deterministic push collides with a pre-existing random-id active row):

```js
test('REGRESSION GUARD: a deterministic push 23505-collides with a legacy random-id active row (why Task 0 cleanup is required)', async () => {
  const RANDOM_LOCAL_ID = '22222222-2222-2222-2222-222222222222';
  const LEGACY_SERVER_ID = 'ff17e146-9493-4476-9d26-5731101ab6b9';
  const db = await createMigratedDatabase(runMigrations);
  await seedCoreData(db); await seedChild(db);
  await insertMastery(db, RANDOM_LOCAL_ID);
  await createSyncOutboxRepository({ database: db }).enqueue({
    tableName: 'letter_mastery', recordId: RANDOM_LOCAL_ID, operation: 'insert',
    payload: { id: RANDOM_LOCAL_ID, ...LOGICAL_KEY, mastered_at: '2026-05-21T08:00:00.000Z', deleted_at: null, created_at: '2026-05-21T08:00:00.000Z', updated_at: '2026-05-21T08:00:00.000Z' },
  });
  const serverDb = await createMigratedDatabase(runMigrations);
  await seedCoreData(serverDb); await seedChild(serverDb);
  await insertMastery(serverDb, LEGACY_SERVER_ID); // legacy random-id active row NOT cleaned
  const { supabaseClient } = createServerBackedSupabase(serverDb);
  const engine = createOutboxSyncEngine({ database: db, supabaseClient });

  const result = await engine.syncAll();
  // Documents the constraint: without cleanup, the push fails (no adoption to save it).
  expect(result.failedRecords).toEqual([
    expect.objectContaining({ table: 'letter_mastery', reason: expect.stringMatching(/unique constraint/i) }),
  ]);
});
```

- [ ] **Step 4: Add the post-cleanup happy path** — same setup but the legacy row is absent (cleaned): the deterministic push succeeds; a second teach of the same key is idempotent (no 23505). (Re-uses the Task 1 mapping test plus a second `syncAll` to assert idempotency.)
- [ ] **Step 5: Run** `npx jest __tests__/letterMasterySync.test.js` → PASS.
- [ ] **Step 6: Commit** — `git commit -m "test(sync): deterministic mapping + coalescing + cleanup-constraint guard; drop adoption tests"`

---

## Task 4: Documentation

**Files:** `documentation/rls-sync-contract-map.md`, `documentation/sqlite-refactor-log.md`.

- [ ] **Step 1: Rewrite the `letter_mastery` contract row** — deterministic logical-key id at creation + `buildSyncPayload` maps every push to it; coalescing for unsynced soft-deletes; insert-by-id idempotent → no 23505 reconciliation. State the **mandatory constraints**: legacy staging rows cleaned (date/count), and the rollout guarantees no old random-id writer. Note the local `record_id`-may-stay-random reality (push identity is canonical). Tests: `letterMasterySync.test.js`.
- [ ] **Step 2: Append a refactor-log entry** (2026-06-04): the pivot, the 4-pass adoption rationale, the cleanup + rollout gates, the constraint-guard test.
- [ ] **Step 3: Commit** — `git commit -m "docs(sync): letter_mastery deterministic push-id model + cleanup/rollout gates"`

---

## Task 5: Verify + adversarial review

- [ ] **Step 1:** `npx jest --testPathIgnorePatterns '/node_modules/' '/\.claude/worktrees/'` → green.
- [ ] **Step 2:** `npm run test:integration` → green.
- [ ] **Step 3:** Manual field verification (post Task 0 cleanup, on a new build): teach a *previously-taught* letter → confirm it syncs (no Failed Item); untaught → confirm server reflects it.
- [ ] **Step 4:** `codex review --uncommitted`; triage with the user. Expectation: adoption-edge findings are gone (subsystem removed); net-simpler diff.
- [ ] **Step 5:** `git diff --check`; confirm only intended files changed.

---

## Self-Review

- **Spec coverage:** deterministic push id ✓ T1; cleanup gate ✓ T0; remove adoption ✓ T2 (gated); tests incl. constraint guard ✓ T3; docs + mandatory constraints ✓ T4; rollout decision ✓ OPEN DECISION 3; local-data decision ✓ OPEN DECISION 2.
- **Codex plan-review findings addressed:** sequencing → Task 0 gate; overstated goal → reworded to "server push id"; mixed-version → mandatory constraint + rollout decision + two-phase fallback; "server already has random row" → T3 constraint-guard test.
- **Placeholders:** none — mapping code shown; removals reference verified symbols; tests use existing helpers (`seedChild`, `insertMastery`, `LOGICAL_KEY`, `createServerBackedSupabase`).

# Lesson Plan B2: Group on the Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A saved session carries its group to the server on the session and on every attendee; the
server accepts it when the group belongs to the session's programme and the EA holds or has held an
assignment to that group; a phone keeps a session's group id even when it does not have that group;
and a session whose upload response was lost still lands in ordinary sync passes.

**Architecture:** One server migration replaces the two forward-prep pins with RESTRICTIVE policies
that keep `state = 'completed'` and accept a non-null group only through
`private.current_user_has_held_group_assignment` (the group's own `groups.programme_id` equals the
session's, and the EA has any `group_ea_assignments` row for it, ended or not); the attendee table
gets the same group check. On the phone, a local migration rebuilds `sessions` without its
`group_id → groups` foreign key, so a pulled session keeps its group id as a historical reference
with no `groups` row. `saveSession` writes the group on the session and every attendee and the
payload carries it. The sync engine orders a session after its group, treats an owed insert of the
EA's assignment to that group as retry evidence even after that assignment has ended, and sends a
session insert as insert-or-ignore by id, so a retry after a lost response never needs UPDATE rights.

**Tech Stack:** Expo/React Native, expo-sqlite (better-sqlite3 in tests), Jest (jest-expo),
Supabase PostgreSQL 17 + PostgREST, disposable PostgreSQL harness scripts.

**Spec:** `docs/superpowers/specs/2026-10-20-lesson-plan-design.md` (rev 1 approved 2026-10-20; rev 2,
commit `2bb103a`, aligns it with the assessment-results design and leaves §7.1 unchanged). This
plan builds §7.1 whole, C16 and C19, and the §11 B2 docs (contract map, the stale `GRANT_SUBJECTS`
tripwire in ROADMAP). Cross-plan names: `/private/tmp/claude-501/-Users-jimmckeown-Development-masi-app--claude-worktrees-lesson-plan/36171b2a-306d-4208-b8fe-8ac9b20c40e8/scratchpad/plan-interfaces.md`.

**Build path:** Codex (gpt-5.6-sol) builds each task; Claude reviews the diff and runs the tests (AGENTS.md). Codex usually cannot run git commit in its sandbox, so the orchestrator runs the commit steps.

**Refreshed:** 2026-10-20 against origin/main f27b347 (#90) and spec rev 2 (2bb103a).

**Codex round 1:** folded in 2026-10-20 (a session retried after a lost response could go terminal; new Task 6 sends session inserts as insert-or-ignore and is a release prerequisite; the C19 helper now reads the group's own programme instead of trusting `group_ea_assignments.programme_id`).

## Global Constraints

- **C19, the server rule:** the session's group is accepted when "the EA **holds or has held** an
  assignment to that group in the session's programme (any `group_ea_assignments` row, ended or
  not)". Keep the `state = 'completed'` guard. `session_attendees.group_id` gets the same check.
  `private.current_user_can_write_for_child` is unchanged.
- **Programme provenance (Codex round 1):** "in the session's programme" is read from the group's
  own `groups.programme_id`, never from `group_ea_assignments.programme_id`. The assignment insert
  policy `group_ea_assignments_insert_self` checks group ownership and an active staff assignment to
  the supplied programme separately and never compares that programme with the group's
  (`supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:778-795`), so an EA can write
  an ended assignment row that names the wrong programme.
- **Release prerequisite (Codex round 1):** a session retried after a lost response converges in
  ordinary passes, with no terminal row and no manual retry (Task 6). B2 does not merge, and the
  lesson release (C3) does not ship, without it.
- **Client evidence (C19):** "an owed insert of the EA's assignment to that group counts **even when
  the local assignment has since ended**". Every other existing grant keeps active-only evidence.
- **Nullable:** `sessions.group_id` and `session_attendees.group_id` stay nullable on the server and
  the phone; "older builds keep sending none".
- **C16:** collision-proof grouping versions and display numbers stay deferred
  (`documentation/rls-sync-contract-map.md:180, 600-602`). No new kind of group write.
- **History pull:** keeps a session's group id when the group is not on the phone. "Do **not** copy
  the attendee mapping": attendee `group_id` keeps today's null-when-missing behaviour.
- **The historical group reference grants nothing:** no `groups` row, no assignment, no roster or
  picker entry, no upload.
- **Server DDL:** one new file under `supabase/migrations/`, named so it sorts after every existing
  migration (today the newest is `20261021120000_assessment_results_contract.sql`, already applied
  to hosted). Session-level `SET lock_timeout = '10s'; SET statement_timeout = '60s';` first and both
  `RESET` last; never `SET LOCAL`. Hosted target is `masi-app-sqlite` (`segygjzpujphwvrubusm`) only,
  never `jcqrlwetutnpuchjoyyd`, and only in Task 8 with Jim's yes.
- **Handle rule (ADR-0008):** production code reaches SQLite and the server only through the
  signed-in EA handle. This plan adds no repository singleton and no shared-client data call.
- **Tests:** prefix every command with `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH"`.
  Unit: `npx jest <path>`. Real SQLite: `npm run test:integration -- <path>` (new files join the
  `jest.integration.config.js` `testMatch` list). Use try/catch for rejection assertions, not
  `expect(...).rejects.toThrow()` (it misreports in multi-file runs).
- **PostgreSQL harnesses:** the controller runs them (Codex's sandbox cannot open TCP to
  PostgreSQL). Implementers write harness code and report it as unrun. There are six today
  (`verify:history-authorization`, `verify:upload-contract`, `verify:organisation-label`,
  `verify:support-incident`, `verify:assessment-results`, `verify:ea-access`, each `:postgres`);
  B2 adds the seventh.
- **SQLite schema version:** main is at 15 (`assessment_results`). B2's local migration takes the
  **next free version at build time**: 16 if B2 lands before C1's `lesson_drafts`, otherwise 17.
  Its tests find it by name (`sessions_group_history_reference`) and compare with
  `CURRENT_SCHEMA_VERSION`, never a literal. Never renumber a merged migration. The literal
  `user_version: 15` pins switch to `CURRENT_SCHEMA_VERSION` (C1 makes the identical edits; identical
  edits merge cleanly).
- **Parallel-branch conflicts:** the build log's appended register rows and the migration ledger in
  `__tests__/sqliteFoundation.test.js:632-648` conflict when C1 also appends; resolve by keeping
  both rows, in version or commit order. Never `git stash`.

## Review Focus

1. **A phone upgrading in place keeps every session, attendee, queued upload, index and the
   attendee cascade** through the `sessions` table rebuild. Pinned by Task 2's
   `upgrade keeps sessions, attendees, queued uploads, indexes and the attendee cascade`.
2. **A pulled session whose group is not on the phone grants nothing**: no group, assignment, picker
   entry, repair or upload appears. Pinned by Task 3's
   `keeping a session's group creates no group, assignment, roster entry or upload`.
3. **Uploads queued before the update, and lessons with no group, still go through.** Pinned by
   Task 4's `a session queued before the update, without group_id, uploads unchanged` and Task 1's
   harness cases `session-group-null` and `attendee-group-null`.
4. **A lesson for a deleted group still saves; one for a group missing from the phone or from
   another programme fails at save, not hours later as needs-attention.** Pinned by Task 4's three
   guard tests.
5. **A failed group insert holds back only that group's lessons, and only for one pass.** Pinned by
   Task 5's `the group's own insert fails once: its lesson waits in that pass and lands in the next`
   and `sessions without a group are not held back by an unrelated failed group`.
6. **A session whose upload response was lost lands in ordinary passes** (release prerequisite).
   Its retry is insert-or-ignore, needs no UPDATE rights, and still passes the INSERT checks.
   Pinned by Task 6's `a session whose response was lost is retried before its attendees, and the
   family lands in ordinary passes`, and by the harness cases `session-insert-retry-before-attendees`
   and `session-insert-retry-still-checks-the-row`.
7. **The server takes a session group's programme from the group, not from an assignment row the
   EA can write.** Pinned by Task 1's harness case `session-group-forged-assignment-programme`.

## Key decision: the historical group reference (plan call)

The phone keeps a session's group id by **rebuilding the local `sessions` table without the
`group_id → groups` foreign key** (migration v3, `src/db/migrations.js:571`). It does not create a
history-reference `groups` row like CAP-004's `children.history_reference`. #90 does not change this
decision; it adds a precedent for it.

- The FK is enforced at runtime, so writing an unknown group id fails the whole history page
  (`saveHistoryPage`, `src/db/repositories/sessionsRepository.js:263-323`, runs one transaction per
  page). The FK has to go, or a row has to exist.
- A reference `groups` row needs a `name` (NOT NULL) that the history RPC does not return, and every
  group reader and writer would have to learn to skip it. Those include `getGroups()` without a
  user (`src/db/repositories/groupsRepository.js:251`), `archiveGroup`, `updateGroup`, `saveGroup`'s
  upgrade path, pull reconcile and `repairGroupOwnershipForSync`, which creates assignments. Each one
  is a way to grant roster or edit access by accident. A dangling id on `sessions` grants nothing,
  because nothing reads it as a roster.
- A child reference row was needed because `session_attendees.child_id` is NOT NULL with an FK,
  and history shows the child's name. Nothing shows a session's group name and the column is
  nullable, so the id alone is enough.
- **Precedent from #90:** the assessment-results design made `battery_runs.class_id` "a plain
  column, not a foreign key" for the same reason: "A new phone can pull an owned run whose class it
  no longer holds ... The server keeps its foreign key" (AR spec §7.1,
  `docs/superpowers/specs/2026-10-19-assessment-results-and-letter-test-design.md:348-352`;
  `src/db/migrations.js:759`).
- The FK's job for local writes moves to a repository guard in `saveSession` (Task 4). The server
  keeps its own FK (`sessions.group_id uuid references public.groups(id) on delete set null`,
  `supabase/migrations/20260529214500_masi_sessions_forward_prep_columns.sql:14-15`).
- `class_id` and `programme_id` keep their FKs. `session_attendees.group_id` keeps its FK and its
  null-when-missing history mapping, as the spec says.
- Cost: one table rebuild using the documented SQLite procedure (create, copy, drop, rename,
  re-index, with FKs off), as v11 already does for `time_entries` (`src/db/migrations.js:644-682`).

---

### Task 1: Server — authorize a session's group by held assignment (C19)

**Files:**
- Create: `supabase/migrations/20261021140000_session_group_authorization.sql` (plan call: it sorts
  after `20261021120000_assessment_results_contract.sql`, the newest file on `main` and already on
  hosted; if any migration on `main` or applied to hosted sorts after it at build time, give it a
  later timestamp and update the name in Task 4's `INTENTIONALLY_UNSYNCED` message and Task 8,
  because `db push` expects new files to sort last)
- Create: `__tests__/sessionGroupAuthorizationMigration.test.js` (static SQL checks, style of
  `__tests__/uploadContractRowVersionMigration.test.js`)
- Create: `scripts/session-group-postgres-harness.cjs` (imports `MIGRATIONS_DIR`,
  `assertDisposableAdminTarget`, `bootstrapSql`, `buildDatabaseUrl`, `expectSqlState`, `runPsql`
  from `scripts/history-authorization-postgres-harness.cjs`; copies the `asActor`, `returnedIds`,
  `upsertSql` and `updateByIdSql` shapes from `scripts/upload-contract-postgres-harness.cjs:85-106`;
  fixture in the style of `scripts/assessment-results-postgres-harness.cjs:43-67`; database name
  `${HISTORY_RLS_DATABASE_NAME}_session_group`; drops it in `finally`)
- Modify: `package.json` (add `"verify:session-group:postgres": "node scripts/session-group-postgres-harness.cjs"`
  after `verify:ea-access:postgres`, line 26)
- Modify: `.github/workflows/tests.yml` (a step "Session group PostgreSQL harness (B2)" after the
  "EA access suspension PostgreSQL harness" step, `:69-75`, and before "Integration suite", with the
  same env as that step: `PGTZ: UTC` and the three `HISTORY_RLS_*` values)
- Modify: `documentation/rls-sync-contract-map.md` (new section, Step 7)

**Interfaces:**
- Produces: `private.current_user_has_held_group_assignment(p_group_id uuid, p_programme_id uuid) returns boolean`
  (`language sql stable security definer set search_path = ''`; EXECUTE revoked from `public, anon`,
  granted to `authenticated`). True when the group's own `groups.programme_id` is `p_programme_id`
  **and** the caller has any `group_ea_assignments` row for that group, ended or not. It never reads
  `group_ea_assignments.programme_id` (Global Constraints, programme provenance).
- Produces policies, all `as restrictive ... to authenticated`:
  `sessions_state_completed_group_held_insert`, `sessions_state_completed_group_held_update`,
  `session_attendees_group_held_insert`, `session_attendees_group_held_update`.
- Removes: `sessions_forward_prep_pin_defaults_insert`, `sessions_forward_prep_pin_defaults_update`
  (`supabase/migrations/20260529214500_masi_sessions_forward_prep_columns.sql:36-47`).
- Produces: `npm run verify:session-group:postgres`; the harness exports `{ fixtureSql, runSessionGroupCases }`.

- [ ] **Step 1: Write the failing static test.** `sessionGroupAuthorizationMigration.test.js` finds
  the newest file matching `/session_group_authorization/` (reading `.sql` names as
  `__tests__/sessionsForwardPrepSupabaseMigration.test.js:7-20` does) and asserts:
  - it sorts after `20261021120000_assessment_results_contract.sql` (not "is last": later
    migrations will follow it);
  - after removing `--` comments and collapsing whitespace, the file starts with
    `SET lock_timeout = '10s'; SET statement_timeout = '60s';` and ends with
    `RESET statement_timeout; RESET lock_timeout;` (case-insensitive); it has no `SET LOCAL`;
  - `create or replace function private.current_user_has_held_group_assignment(p_group_id uuid, p_programme_id uuid)`
    with `security definer` and `set search_path = ''`; the function body contains
    `g.programme_id = p_programme_id` and `gea.ea_user_id = (select auth.uid())`, and contains
    **neither** `gea.programme_id` nor `unassigned_at`;
  - `revoke execute on function private.current_user_has_held_group_assignment(uuid, uuid) from public, anon`
    and `grant execute ... to authenticated`;
  - each of the four policy names appears in `create policy <name>` followed by `as restrictive`;
    both `sessions_*` policies contain `state = 'completed'`; the two `*_update` policies contain
    `using (true)`;
  - `drop policy if exists sessions_forward_prep_pin_defaults_insert` and `..._update` both occur
    **after** the last `create policy` (index comparison), so the database is never without a guard;
  - the file contains no `create or replace function private.current_user_can_write_for_child`.
- [ ] **Step 2: Run it.** `npx jest __tests__/sessionGroupAuthorizationMigration.test.js` → FAIL (no file).
- [ ] **Step 3: Write the harness.** Fixture (as `postgres`, AR-harness style): auth users and
  `public.users` for `HEAD_OFFICE`, `EA_A`, `EA_B` (`organization_id 'a111879f-d066-47c9-95a1-bed2a400319a'`);
  active literacy `staff_programme_assignments` for `EA_A` and `EA_B`; one class; child `C` with an
  active direct `child_ea_assignments` row for `EA_A` and an **ended** one for `EA_B`; child `D` with
  no assignment to `EA_A` (and `EA_A` holds no class assignment, so `D` is not writable through a
  class); group `G1` (literacy, created by Head Office) with an active assignment for `EA_A` and an
  active membership for `C`; group `G3` (numeracy) whose only assignment is `EA_A`'s, in programme
  numeracy; group `G_UNHELD` (literacy) with no assignment for `EA_A`; group `G5` (numeracy,
  `created_by = EA_A`, so `EA_A` owns it) with no assignment. Programmes come from the seed
  (`(SELECT id FROM public.programmes WHERE code = 'literacy')`, and `'numeracy'`). Every case runs in
  its own rolled-back transaction through `asActor`, with setup run as `postgres`. Cases (label →
  expected):
  - `session-group-held-active`: `EA_A` upserts a literacy session with `group_id = G1` → one id.
  - `session-group-held-ended`: setup ends `EA_A`'s `G1` assignment (Head Office) → one id.
  - `session-group-delete-sequence`: as `EA_A`, in the phone's order: archive `G1` by id, archive
    `C`'s `G1` membership by id, end the `G1` assignment by id (each returns exactly one id), then
    upsert the session with `G1` and its attendee `C` with `G1` → both accepted.
  - `session-group-never-held`: `EA_B` upserts a session with `G1` → `42501`.
  - `session-group-other-programme`: `EA_A` upserts a literacy session with `G3` → `42501`.
  - `session-group-forged-assignment-programme` (Codex round 1): three transactions, each as `EA_A`
    and each starting with the same forged row,
    `INSERT INTO public.group_ea_assignments (id, group_id, ea_user_id, programme_id, created_by, unassigned_at) VALUES (<new id>, G5, EA_A, <literacy id>, EA_A, pg_catalog.now()) RETURNING id`
    (an ended literacy assignment for a numeracy group):
    (a) that insert alone → one id. This pins the policy gap: `group_ea_assignments_insert_self`
    accepts it, and being ended it escapes the one-active-row index
    (`idx_group_ea_assignments_active_unique`, `20260521144901_masi_zazi_alignment_schema.sql:228-230`);
    (b) the forged row, then a literacy session with `group_id = G5` → `42501`;
    (c) setup inserts `EA_A`'s literacy session `S_PLAIN` with no group; the forged row, then
    attendee `C` on `S_PLAIN` with `group_id = G5` → `42501`.
    (a) makes (b) and (c) non-vacuous: the refusal must come from the session or attendee write,
    because the forged insert on its own succeeds.
  - `session-group-unheld`: `EA_A` with `G_UNHELD` → `42501`.
  - `session-group-null`: `EA_A` upserts a session without `group_id` (older build) → one id.
  - `session-state-guard-kept`: `state = 'in_progress'` → `42501`, both with no group and with `G1`.
  - `session-upsert-conflict-after-end`: setup inserts `EA_A`'s session with `G1` plus attendee `C`,
    then ends the assignment; `EA_A` upserts the same session again (the merge shape older builds
    send; B2's phone sends insert-or-ignore, Task 6) → one row, `group_id` still `G1`. This proves
    upsert SELECT visibility and the UPDATE checks.
  - `session-update-to-unheld-group`: setup inserts `EA_A`'s session with `G1` plus attendee `C`
    (so the permissive UPDATE's USING passes and the refusal comes from the new WITH CHECK);
    `EA_A` updates its `group_id` to `G_UNHELD` → `42501`.
  - `attendee-group-held-after-end` (the half-uploaded family): setup inserts the session with `G1`
    and ends the assignment; `EA_A` upserts attendee `C` with `G1` → accepted.
  - `attendee-group-unheld`: attendee `C` with `G_UNHELD` → `42501`.
  - `attendee-group-null`: attendee `C` with no group → accepted.
  - `attendee-child-check-unchanged`: attendee `D` with `G1` → `42501` (the child check still applies).
  - `session-before-own-assignment`: `EA_A` inserts group `G4` (literacy, `created_by = EA_A`) and
    then a session with `G4` → `42501`. In a second transaction: `G4`, then `EA_A`'s own
    `group_ea_assignments` row for `G4`, then the session → accepted. This is why the phone needs
    the evidence that Task 5 adds.
  - `history-page-returns-group-to-never-holder`: setup inserts `EA_A`'s session with `G1`
    (session_date `2026-10-19`) and attendee `C`; as `EA_B`,
    `select id, group_id from public.get_delivery_history_page(<literacy id>, DATE '2026-01-01', 200, null, null, 0)`
    returns that session with `group_id = G1` (signature:
    `supabase/migrations/20260925120000_session_history_family_delta.sql:54-62`).
  - `helper-execute-grants`: `has_function_privilege` is `t` for `authenticated` and `f` for `anon`
    and `public`; calling it as `anon` → `42501`. (Functions get PUBLIC EXECUTE by default, so this
    case fails without the revoke.)
  - `pins-replaced`: `pg_policies` has no `sessions_forward_prep_pin_defaults_%`, and the four new
    policies have `permissive = 'RESTRICTIVE'`.

  Task 6 adds the lost-response retry cases to this harness.

  `main()` follows `scripts/assessment-results-postgres-harness.cjs:533-566`: drop and create the
  database, bootstrap, the same Supabase-style public default privileges, apply every `.sql` file in
  `MIGRATIONS_DIR` in sorted order, load the fixture, run the cases, and print a JSON summary of the
  passed labels. Applying whatever files exist (rather than reading the B2 file by name) keeps the
  Step 6 RED run meaningful.
- [ ] **Step 4: Write the migration.** Header comment: what C19 means, and that the live permissive
  UPDATE policy is `sessions_update_active_assignment_after_attendee`, not `sessions_update_own` as
  the forward-prep comment says (that policy was dropped in `20260521140331`). Then the helper:

  ```sql
  select exists (
    select 1
    from public.groups g
    join public.group_ea_assignments gea on gea.group_id = g.id
    where g.id = p_group_id
      and g.programme_id = p_programme_id
      and gea.ea_user_id = (select auth.uid())
  );
  ```

  The programme comes from the group (`groups.programme_id` is NOT NULL,
  `supabase/migrations/20260521115412_masi_clean_base_schema.sql:157`), not from the assignment
  row, which the EA can write with any programme it has access to (Global Constraints). As a
  definer function it sees archived groups and ended assignments.

  Then the four policies. `drop policy if exists` comes before each `create`, and the two pins are
  dropped last:
  - sessions, insert, `with check`, and update, `using (true) with check`:
    `state = 'completed' and (group_id is null or (select private.current_user_has_held_group_assignment(group_id, programme_id)))`;
  - session_attendees, the same pair:
    `group_id is null or (select private.current_user_has_held_group_assignment(group_id, (select s.programme_id from public.sessions s where s.id = session_attendees.session_id)))`.
  Upsert SELECT visibility needs no change: the session's direct `user_id = auth.uid()` arm
  (`20260828004500_history_session_authorization_scope.sql:53-61`) and `can_read_session_attendee`
  already cover both upserts. FK checks bypass RLS, so an archived group the EA can no longer see
  does not block the reference. Do not require `attendee.group_id` to equal `sessions.group_id` on
  the server (plan call: the phone writes them equal, Task 4).
- [ ] **Step 5: Run the static test.** → PASS. Report the harness as unrun.
- [ ] **Step 6 (controller): run the harness.** With the migration moved aside, run
  `npm run -s verify:session-group:postgres` with `PGTZ=UTC` and the `HISTORY_RLS_*` env from
  `documentation/rls-sync-contract-map.md` ("Disposable PostgreSQL history-authorization verifier",
  `:649`). The accepted-group cases must fail on the pins. With the migration in place every case
  passes. Then run the other six `verify:*:postgres` harnesses → all pass. History-authorization,
  upload-contract and assessment-results apply every migration, so they now run on top of B2's
  policies; organisation-label, support-incident and ea-access stop at their own migration and are
  run to show nothing else regressed.
- [ ] **Step 7: Contract map.** Add a top-level section `## Session group authorization (B2)` after
  "Assessment results: one complete family per write" and before `## Row versions (upload contract)`
  (`:383`) (plan call: #90 set the precedent of one top-level section per write contract; the
  "Pre-Live History Authorization" section is about reads). It covers: the C19 rule and helper; that
  the helper takes the programme from `groups.programme_id` and why (`group_ea_assignments_insert_self`
  does not tie the assignment's programme to the group's; harness case
  `session-group-forged-assignment-programme`); the four restrictive policies and the dropped pins; the kept `state` guard; that
  `current_user_can_write_for_child` is unchanged; upsert visibility unchanged; the one-row-per-group
  caveat ("if grouping work later lets a group change EA, the old holder's ended assignment must
  survive (today there is one row per group, `groupEaAssignmentDomainId`), or this check moves to a
  history table"); the harness name; "not yet applied to hosted". Later tasks add the phone half to
  the same section.
- [ ] **Step 8: Commit** `feat(server): authorize a session's group by held assignment (C19)`.

### Task 2: Phone schema — `sessions.group_id` becomes a historical reference

**Files:**
- Modify: `src/db/migrations.js` (append `{ version: N, name: 'sessions_group_history_reference', sql }`
  after v15, which ends at `:797`; `N` is the next free version, 16 unless C1's `lesson_drafts` has
  merged first, see Global Constraints)
- Create: `__tests__/sessionGroupHistoryReferenceMigration.test.js` (real better-sqlite3, style of
  `__tests__/timeEntryLocationMigration.test.js`); add it to `jest.integration.config.js`
- Modify: version pins, each importing `CURRENT_SCHEMA_VERSION` from `../src/db/migrations` where it
  does not already:
  - `__tests__/timeEntryLocationMigration.test.js:28`, `__tests__/rowVersionLocal.test.js:50,137`,
    `__tests__/outboxOwnerMigration.test.js:19`: `{ user_version: 15 }` → `{ user_version: CURRENT_SCHEMA_VERSION }`;
  - `__tests__/migrations.assessmentResults.test.js:108`: the same change (it runs every migration
    from v14);
  - `__tests__/migrations.assessmentResults.test.js:115-117`: rename `CURRENT_SCHEMA_VERSION is 15`
    to `assessment_results is local schema version 15` and assert
    `MIGRATIONS.find(({ name }) => name === 'assessment_results').version` is `15` (plan call: keeps
    #90's intent without blocking later migrations; C1 must make the identical edit);
  - `__tests__/sqliteFoundation.test.js:142` (`toBe(15)` → `toBe(N)`, the deliberate tripwire) and
    the migration ledger at `:632-648` (append `{ version: N, name: 'sessions_group_history_reference' }`)
- Modify: `__tests__/hotPathIndexes.test.js:16` (comment: "group lookups"; the FK is gone)
- Modify: `documentation/LEARNING.md`, `documentation/build-log.md` (Steps 5-6)

**Interfaces:**
- Produces: local `sessions` keeps every column and the `programme_id` and `class_id` FKs; its
  `group_id` has no FK; the indexes `idx_sessions_programme_date`, `idx_sessions_class_id` and
  `idx_sessions_group_id` are recreated with their v5/v9 definitions. `CURRENT_SCHEMA_VERSION` = N.

- [ ] **Step 1: Write the failing tests.** At module scope,
  `const V = MIGRATIONS.find(({ name }) => name === 'sessions_group_history_reference')?.version`.
  `beforeEach`: `createBetterSqliteTestDatabase()`, execute every `MIGRATIONS` entry with
  `version < V`, `PRAGMA user_version = V - 1`, `seedCoreData(db)`. Insert child `child-1`, group
  `group-1` (programme-a), session `s-1` (`group_id 'group-1'`, attendee `child-1`) and `s-2` (no
  group). Add a pending `sync_outbox` row for `s-2` with `owner_user_id 'user-1'`.
  - `the migration is registered after assessment_results`: `V` is defined and greater than
    `MIGRATIONS.find(({ name }) => name === 'assessment_results').version`. (Plan call: no
    "is newest" assertion, so the test stays true whichever of B2 and C1 merges second.)
  - `upgrade keeps sessions, attendees, queued uploads, indexes and the attendee cascade`: snapshot
    the rows of `sessions`, `session_attendees` and `sync_outbox`; the `sqlite_master` index rows
    for `tbl_name = 'sessions'` (`name`, plus `sql` with whitespace collapsed); and
    `pragma foreign_key_list(session_attendees)`. Run `runMigrations`. Expect `user_version` =
    `CURRENT_SCHEMA_VERSION`, `schema_migrations` has `{ version: V, name: 'sessions_group_history_reference' }`,
    every snapshot equal, `pragma foreign_key_check` = `[]` and `pragma foreign_keys` = 1. Then
    `delete from sessions where id = 's-1'` leaves zero attendees for `s-1`.
  - `sessions.group_id no longer requires a group on this phone`: after migrating, insert a session
    with `group_id 'group-not-on-phone'` → succeeds. The sorted `table` values of
    `pragma foreign_key_list(sessions)` are `['classes', 'programmes']`.
  - `class and programme references and the state check still hold`: each of `class_id
    'class-missing'`, `programme_id 'programme-missing'` and `state 'bogus'` → the error message
    matches `/FOREIGN KEY constraint failed/`, `/FOREIGN KEY constraint failed/` and
    `/CHECK constraint failed/` (try/catch).
  - `a second run changes nothing`: `runMigrations` again → same `user_version`, same rows.
- [ ] **Step 2: Run** `npm run test:integration -- __tests__/sessionGroupHistoryReferenceMigration.test.js` → FAIL.
- [ ] **Step 3: Implement migration N.** It follows the v11 pattern (`src/db/migrations.js:644-682`):
  - `create table sessions_new` with v1's `sessions` columns and FKs (`src/db/migrations.js:463-476`,
    including `${LOCAL_SYNC_COLUMNS}`), then `group_id text` with **no** `references`, then
    `state text not null default 'completed' check (state in ('completed', 'in_progress', 'paused', 'discarded'))`;
  - `insert into sessions_new (<explicit 16-column list>) select <same list> from sessions`;
  - `drop table sessions`, then `alter table sessions_new rename to sessions` (this order; renaming
    the old table first would repoint `session_attendees`' FK, `:480`, at the old table);
  - recreate the three indexes, copying each statement from v5/v9 (`:591`, `:624-629`).
  The runner already turns FKs off around pending migrations (so the drop does not cascade) and runs
  each one in a transaction (`runMigrationsNow`, `src/db/migrations.js:835-872`). Nothing else references `sessions`:
  v15's `battery_runs` has no session FK and no trigger or view names the table. Update the pins
  listed under **Files**.
- [ ] **Step 4: Run** the new suite, then `npx jest __tests__/sqliteFoundation.test.js __tests__/hotPathIndexes.test.js __tests__/sessionsForwardPrepMigration.test.js __tests__/foreignKeyEnforcement.test.js __tests__/timeEntryLocationMigration.test.js __tests__/rowVersionLocal.test.js __tests__/outboxOwnerMigration.test.js __tests__/migrations.assessmentResults.test.js`
  and `npm run test:integration` → PASS.
- [ ] **Step 5: LEARNING.md.** A short chapter, "A foreign key states the present; a session's
  group is history". It covers why a pulled session can name a group the phone will never hold
  (handover, deletion, assignment-scoped roster pull at `src/services/preloadedChildData.js:327-337`),
  why a reference row was rejected (the access surfaces above), the matching `battery_runs.class_id`
  call in #90, and how the guard replaces the FK for local writes.
- [ ] **Step 6: Build log.** Add a Decision Register row (`documentation/build-log.md:1069`):
  "Historical group reference: rebuild local `sessions` without the group FK (v N); rejected a
  history-reference `groups` row". Give the reasons and the revisit trigger ("a screen needs a
  session's group name offline").
- [ ] **Step 7: Commit** `feat(db): sessions.group_id is a historical reference (local schema N)`.

### Task 3: History pull keeps the session's group

**Files:**
- Modify: `src/db/repositories/sessionsRepository.js` (`SESSION_COLUMNS` at `:17-32` gains
  `'group_id'` after `'class_id'`; a one-line comment in `saveHistoryPage` (`:263-323`) at the
  attendee mapping (`:302`): the session keeps its group id, the attendee mapping stays
  null-when-missing)
- Modify: `__tests__/sessionsHistoryPage.test.js` (flip `:154-161`, add one test)
- Modify: `__tests__/sessionHistoryPull.test.js` (one test)
- Modify: `documentation/rls-sync-contract-map.md`, `CONTEXT.md` (Step 5)

**Interfaces:**
- Consumes: Task 2 (no FK on `sessions.group_id`).
- Produces: `saveHistoryPage` stores `session.group_id` verbatim (the RPC returns `setof
  public.sessions`, so `group_id` is already in each parent row). `getSessions(...)` results carry
  `group_id` (already mapped from `select *`). `group_ids` (derived from attendees, `:81`) is
  unchanged.

- [ ] **Step 1: Write the failing tests.**
  - In `sessionsHistoryPage.test.js`, rename `server fields outside SESSION_COLUMNS are dropped
    without failing persistence` (`:154-161`) to `a session keeps its group id when the group is not
    on this phone; other server-only fields are dropped`. It expects
    `{ group_id: 'group-not-on-phone', state: 'completed' }`.
  - Add `keeping a session's group creates no group, assignment, roster entry or upload`.
    `saveHistoryPage` with `serverSession({ group_id: 'group-not-on-phone' })` and
    `serverAttendee({ group_id: 'group-not-on-phone' })` (helpers at `:11-25`). Expect: the
    attendee's `group_id` is `null`; `groups`, `group_ea_assignments` and `sync_outbox` counts are
    all `0`; `createGroupsRepository({ database: db }).getGroups({ userId: 'user-1', programmeId: 'programme-a' })`
    and `.getGroups()` both return `[]`. After `await repairGroupOwnershipForSync({ database: db })`
    the `group_ea_assignments` count is still `0`.
    `(await repo.getSessions({ programmeId: 'programme-a' }))[0].group_id` is `'group-not-on-phone'`.
  - In `sessionHistoryPull.test.js`, add `a fresh phone whose EA never held the session's group
    keeps the group id`. `fakeServer` (`:26-58`) returns `parent(1, { user_id: 'user-9', group_id: uuid(900) })`
    with one attendee whose `group_id` is `uuid(900)` (attendee shape as at `:90-95`).
    `runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) })` resolves
    `{ status: 'complete', pages: 1 }`; `sessions.group_id` is `uuid(900)`; the attendee's
    `group_id` is `null`; the `groups` count is `0`.
- [ ] **Step 2: Run** `npm run test:integration -- __tests__/sessionsHistoryPage.test.js __tests__/sessionHistoryPull.test.js` → FAIL.
- [ ] **Step 3: Implement.** Add `'group_id'` to `SESSION_COLUMNS` and add the comment.
- [ ] **Step 4: Run** both suites, then `npm run test:integration -- __tests__/syncContractCompleteness.test.js`
  → PASS. `group_id` stays in `INTENTIONALLY_UNSYNCED` until Task 4.
- [ ] **Step 5: Docs.**
  - Contract map, "Session history hydration (CAP-004)" (`:759`): add a bullet,
    "**Historical group reference (B2).** A pulled session keeps `group_id` even when the group is
    not on the phone; there is no `groups` row, and nothing reads it as roster, picker, edit or
    assignment authority. Attendee `group_id` stays null when the group is missing." Fix
    `:761-763` (spec §11): "One `sync_state` row per EA and Programme in that EA's own database file
    (ADR-0008)", replacing "because SQLite is shared by every EA who signs in on the phone". C1's
    Step 9 makes the same fix; skip it if C1 has merged it. In the Table Contract Map `sessions` row
    (`:874`), add "a pulled `group_id` is kept even when absent locally" next to the inbound
    `class_id` sentence. Add the phone half to the B2 section from Task 1.
  - `CONTEXT.md` Relationships (`:190-198`): "A **Session** records its **Group** as history. A
    phone may hold a session whose group it does not have (after a handover or a deleted group);
    that reference grants no roster, edit or assignment access." (plan call) Leave the **Session**
    definition's "planned NOT NULL" (`:102`) unchanged: spec §7.4 rewords it once new builds always
    send a group (C2/C3), and B2's build still sends `null`.
- [ ] **Step 6: Commit** `feat(history): pulled sessions keep their group id without the group`.

### Task 4: Save and upload the group on the session and every attendee

**Files:**
- Modify: `src/db/repositories/sessionsRepository.js` (`saveSession`, `:204-249`; attendee group at `:233`)
- Modify: `src/services/syncServerColumns.js` (`SERVER_COLUMNS.sessions` at `:69-72`; #90 moved
  `SERVER_COLUMNS` here, and `offlineSync.js:1-3` re-exports it)
- Modify: `src/services/offlineSync.js` (`INTENTIONALLY_UNSYNCED` at `:58-66`; keep its `assessments`
  entry; update the comment at `:55-57`)
- Modify: `__tests__/sessionsRepository.test.js`, `__tests__/syncContractCompleteness.test.js:37-41`
- Create: `test-support/sessionGroupServer.js`
- Create: `__tests__/sessionGroupSync.test.js`; add it to `jest.integration.config.js`
- Modify: `documentation/rls-sync-contract-map.md`, `documentation/group-session-workflow.md` (Step 9)

**Interfaces:**
- Consumes: Task 3 (`SESSION_COLUMNS` has `group_id`).
- Produces (the cross-plan name): `saveSession(session, { transaction } = {}) → Promise<true>`.
  - `session.group_id?: string | null` is written to `sessions.group_id` and to **every**
    attendee's `session_attendees.group_id`, including a child added from another group (their
    memberships are not touched). Missing means `null`, set explicitly on the record so the payload
    carries `group_id: null`. `session.group_ids` is no longer read (plan call; its only producer
    sends `[]`, `src/screens/sessions/LiteracySessionForm.js:338`).
  - Guard, only for a write that will be enqueued (`shouldEnqueueOutbox(record)`) and a non-null
    group, checked before anything is written. If no `groups` row has that id, throw
    `new Error('sessions.group_id must reference a group on this phone')`. If the group's
    `programme_id` differs from the resolved session programme, throw
    `new Error('sessions.group_id must belong to the session programme')`. An archived (deleted)
    group is allowed, so a lesson finished after its group was deleted still saves.
  - `updateSession` has no production caller (the only `saveSession` caller is
    `src/services/literacySessionPersistence.js:56`). Re-saving a pulled session whose group is
    absent would be refused, which matches spec §8 (editing a saved session is not in v1). Task 6
    deletes `updateSession`.
- Produces: `SERVER_COLUMNS.sessions` includes `'group_id'`. `INTENTIONALLY_UNSYNCED.sessions` is
  `{ state: 'Forward-prep; server RLS keeps state = completed (migration 20261021140000_session_group_authorization).' }`.
  `mapSession`'s `group_ids` is unchanged.
- Produces: `createSessionGroupServer({ actorId = 'user-1', initialRows = {}, failGroupInserts = 0, failGroupAssignmentInserts = 0 } = {}) → { supabaseClient, rows, calls, endAssignment(groupId) }`
  in `test-support/sessionGroupServer.js`. Build it on `createSupabaseMock` (`test-support/supabaseSyncMock.js`)
  with function-valued `upsertResults` and `updateResults`, as `test-support/statefulMembershipServer.js`
  wraps it; `calls` is the mock's own list (`{ type, tableName, payload, options }`). It is a
  stateful fake that models only the FK and the C19 rule; the real policies are proved by Task 1's
  harness. Rules:
  - `rows` is `{ [table]: Map<id, row> }`, with a Map (empty unless seeded) for every table the fake
    serves, seeded from `initialRows` (`{ [table]: row[] }`; seed
    every server row a lifecycle update will target, e.g. memberships, or the update goes
    `ARCHIVE_NOT_APPLIED`);
  - `upsert` (single or array) stores rows. It honours `ignoreDuplicates` (insert-or-ignore) for
    `group_ea_assignments`. The `fail*` counters make the next N `groups` / `group_ea_assignments`
    upsert calls return the codeless `{ error: { message: 'Network request failed' } }`;
  - a `sessions` or `session_attendees` row whose `group_id` is not in `rows.groups` returns
    `{ error: { code: '23503', ... } }`. A non-null group whose stored `groups` row has a different
    `programme_id` from the session's, or for which no `group_ea_assignments` row has (`group_id`,
    `ea_user_id = actorId`), ended or not, returns
    `{ error: { code: '42501', message: 'new row violates row-level security policy for table "<table>"' } }`
    (the server helper's rule; the assignment's own `programme_id` is not read). An attendee's
    programme is its stored session's. An array call is all-or-nothing;
  - `update(patch).eq('id', id).select('id')` merges into an existing row and returns `[{ id }]`,
    or `[]` when absent;
  - every other table accepts writes; `rpc` keeps the mock's `{ data: true, error: null }` (the
    support-incident drain);
  - `endAssignment(groupId)` stamps `unassigned_at` on the server row (Head Office).

- [ ] **Step 1: Write the failing repository tests** in `sessionsRepository.test.js`. Seed with
  `seedCoreData`: children `child-1` and `child-2`; groups `group-1` and `group-2` (programme-a,
  class-1) and `group-numeracy` (programme-b); `child-2`'s active membership in `group-2`.
  - `a group session stores its group on the session and every attendee, including a child from
    another group`: `saveSession({ id: 'session-group', user_id: 'user-1', programme_id:
    'programme-a', session_date: '2026-10-19', group_id: 'group-1', children_ids: ['child-1',
    'child-2'], synced: false })` →
    ```js
    expect(await db.getFirstAsync("select group_id from sessions where id = 'session-group'")).toEqual({ group_id: 'group-1' });
    expect(await db.getAllAsync('select child_id, group_id from session_attendees order by child_id'))
      .toEqual([{ child_id: 'child-1', group_id: 'group-1' }, { child_id: 'child-2', group_id: 'group-1' }]);
    expect(await db.getAllAsync("select group_id, removed_at from child_group_memberships where child_id = 'child-2'"))
      .toEqual([{ group_id: 'group-2', removed_at: null }]);
    ```
    and the three outbox payloads (one `sessions`, two `session_attendees`) all have `group_id: 'group-1'`.
  - `a session without group_id stores null, and group_ids is no longer read`: the same save with
    `group_ids: ['group-1']` and no `group_id` → session and both attendees have `group_id` `null`,
    and the `sessions` outbox payload has `group_id: null`.
  - `a group that is not on this phone is refused before anything is written`: `group_id:
    'group-missing'` → the error message is exactly `sessions.group_id must reference a group on
    this phone`; `sessions`, `session_attendees` and `sync_outbox` counts are all `0`.
  - `a group from another programme is refused`: `group_id: 'group-numeracy'` → the error message is
    `sessions.group_id must belong to the session programme`; nothing is written.
  - `a deleted group still takes its lesson`: `createGroupsRepository({ database: db }).archiveGroup('group-1')`,
    then save with `group-1` → stored with `group_id 'group-1'`.
- [ ] **Step 2: Run** `npm run test:integration -- __tests__/sessionsRepository.test.js` → FAIL.
- [ ] **Step 3: Implement `saveSession`** per the Interfaces block. Keep its transaction shape and
  outbox order.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Write the failing sync scenarios** in `sessionGroupSync.test.js`. Real SQLite
  (`createMigratedDatabase(runMigrations)`, which binds actor `user-1`, + `seedCoreData`) and
  `createOutboxSyncEngine({ enqueueRequest: (task) => task(), getAuthSession: liveTestSession,
  database: db, supabaseClient: server.supabaseClient })`, as in `__tests__/offlineSyncOutbox.test.js:39-41, 242`.
  Shared seed (local rows `synced`, mirrored in the fake's `initialRows`): `child-1` and `child-2`
  with active direct assignments to `user-1`; `group-1` (programme-a, class-1); its assignment
  (`id: groupEaAssignmentDomainId({ groupId: 'group-1' })`, `ea_user_id 'user-1'`, programme-a);
  `child-1`'s membership. The lesson is
  `saveSession({ id: 'lesson-1', user_id: 'user-1', programme_id: 'programme-a', class_id: 'class-1', session_date: '2026-10-19', group_id: 'group-1', children_ids: ['child-1', 'child-2'], synced: false })`.
  Every test uses only `syncAll()` (or `syncAll({ tableName })` where stated), never
  `{ force: true }`. The first three tests each assert: the server's `lesson-1` row has
  `group_id 'group-1'`; both server attendee rows have `group_id 'group-1'`; local `sessions` and
  `session_attendees` rows are `synced`; `sync_outbox` is empty; no row was ever `terminal`.
  - `save offline, delete the group, reconnect: the session and attendees upload with the group id`:
    save, then `createGroupsRepository({ database: db }).deleteGroup('group-1')`, then one
    `syncAll()`. Also expect the server's `group-1` to have `archived_at` set and its assignment
    `unassigned_at` set.
  - `half-uploaded family: the session was sent, the group is deleted, the attendees still upload
    with the group id`: save; `syncAll({ tableName: 'sessions' })` (session acknowledged, attendees
    pending); `deleteGroup('group-1')`; `syncAll()`.
  - `Head Office ended the assignment while the phone was offline: the lesson still uploads with
    its group`: save; `server.endAssignment('group-1')`; `syncAll()`.
  - `a session queued before the update, without group_id, uploads unchanged`: no lesson; insert a
    local `pending` session row `old-1` and enqueue its `insert` through
    `createSyncOutboxRepository({ database: db }).enqueue({ tableName, recordId, operation, payload })`
    with a payload that has **no** `group_id` key (as a pre-B2 build queued it); `syncAll()` → the
    `sessions` call's payload has no `group_id` property, the server row has no group, and the
    outbox is empty.
- [ ] **Step 6: Run** `npm run test:integration -- __tests__/sessionGroupSync.test.js` → FAIL: the
  payload strips `group_id`, so the server rows have no group.
- [ ] **Step 7: Implement** the `SERVER_COLUMNS` / `INTENTIONALLY_UNSYNCED` change, and update
  `syncContractCompleteness.test.js:37-41` to `sessions.group_id is synced and sessions.state stays
  intentionally unsynced`: `expect(SERVER_COLUMNS.sessions).toContain('group_id')`,
  `INTENTIONALLY_UNSYNCED.sessions.group_id` undefined, `.state` truthy.
- [ ] **Step 8: Run** `npm run test:integration -- __tests__/sessionGroupSync.test.js __tests__/syncContractCompleteness.test.js`
  and `npx jest __tests__/syncContractServerSchema.test.js __tests__/offlineSync.stripping.test.js __tests__/offlineSync.pendingSessions.test.js __tests__/literacySessionPersistence.test.js`
  → PASS.
- [ ] **Step 9: Docs.**
  - Contract map: rewrite the `sessions` and `session_attendees` rows of the Table Contract Map
    (`:874-875`). Producer: `saveSession` with `group_id`, the guard, every attendee equal to the
    session group. Payload: `group_id` is in `SERVER_COLUMNS` (`syncServerColumns.js`). RLS: the B2
    restrictive checks. Ordering: "after `groups` when `group_id` exists". Tests: the new suites.
    Replace the forward-prep note (`:930-934`) with the current state: `group_id` is active end to
    end; `state` stays pinned to `'completed'` by the B2 restrictive policies and stays in
    `INTENTIONALLY_UNSYNCED`.
  - `documentation/group-session-workflow.md`: lines 10-13 no longer say the payload strips
    `group_id`; they say it is synced and server-authorized (B2). Under Prerequisites
    (`:42-57`), mark 1, 3 and 4 as done for the session group, naming this plan, and mark 2 as
    deferred by the lesson-plan spec's C16. Leave the product sections to the C2/C3 plan.
- [ ] **Step 10: Commit** `feat(sessions): save and upload the session's group on every attendee`.

### Task 5: Sync engine — wait for the group, and count an owed assignment insert

**Files:**
- Modify: `src/services/offlineSync.js` (`TABLE_DEPENDENCIES` `:91-107` (sessions at `:102`),
  `PARENT_FK_COLUMNS` `:141-157` (sessions at `:152`), the `GRANT_SUBJECTS` comment and object
  `:159-209`, `dependenciesForRecord` `:280-306`, `computeEvidencePending` `:397-442`, a new helper
  beside `hasPendingActiveAssignment` `:345-355`)
- Modify: `__tests__/sessionGroupSync.test.js`, `__tests__/classifyErrorHardening.test.js:74-108`
- Modify: `documentation/rls-sync-contract-map.md`, `documentation/ROADMAP.md` (Step 5)

**Interfaces:**
- Consumes: `createSessionGroupServer` (Task 4); outbox records carry `owner_user_id` (the
  signed-in EA, never derived from content).
- Produces:
  - `TABLE_DEPENDENCIES.sessions = ['classes', 'groups']` and
    `PARENT_FK_COLUMNS.sessions = { classes: 'class_id', groups: 'group_id' }`;
  - `dependenciesForRecord` drops `classes` from a session with no `class_id` and `groups` from a
    session with no `group_id`, independently. Today's combined clause for `groups`/`sessions`
    (`:293-296`) returns early, which would leave `groups` on a classless session, and a dependency
    with no resolvable id blocks on **any** failed group (`findBlockingDependency`'s fallback,
    `:1620-1626`). Keep the `groups` table's own behaviour (drop `classes` only) and the other
    clauses unchanged, including #90's `assessments`/`battery_runs` clause (`:301-303`);
  - new `GRANT_SUBJECTS` entry shape `{ heldGroupAssignment: 'group_id' }`, on `sessions` (its only
    entry) and appended to `session_attendees` (`:191-194`); no other table gets it. Document the
    shape in the comment block beside the other two;
  - `hasOwedHeldGroupAssignmentInsert(database, groupId, eaUserId) → Promise<boolean>`, which
    ignores `unassigned_at`, filters by EA, and excludes terminal rows:

    ```sql
    select 1 as present
    from sync_outbox o
    join group_ea_assignments gea on gea.id = o.record_id
    where o.table_name = 'group_ea_assignments' and o.operation = 'insert'
      and o.status in ('pending', 'failed', 'in_flight')
      and gea.group_id = ? and gea.ea_user_id = ?
    limit 1
    ```

    `computeEvidencePending` calls it with the field resolver's `group_id` and
    `outboxRecord.owner_user_id`, only when `includeGrant` is true. `ARCHIVE_PUSH_ORDER` (`:219-230`)
    is unchanged: a deleted group still ends its assignment at rank 6, ahead of sessions, and C19
    makes that order harmless.

- [ ] **Step 1: Write the failing tests** in `sessionGroupSync.test.js`.
  - Evidence, through `_testComputeEvidencePending({ database: db, outboxRepository, outboxRecord,
    includeGrant: true })` (`offlineSync.js:444`). Records are `{ table_name, record_id,
    owner_user_id: 'user-1', payload }`. The assignment rows are inserted directly; their insert is
    enqueued through `createSyncOutboxRepository({ database: db }).enqueue(...)`, with statuses set
    by `update sync_outbox`. No `groups` outbox row exists in these tests, so the FK edge cannot
    supply the evidence:
    - `a session's group grant counts an owed assignment insert even after the local assignment
      ended`: `group-1` assignment with `unassigned_at` set and its `insert` row `failed`; a
      `sessions` record with `group_id 'group-1'` → `true`;
    - `an acknowledged assignment insert with only its archive owed is not evidence`: no `insert`
      row, a pending `group_ea_assignments:<id>:lifecycle` archive → `false`;
    - `a terminal assignment insert is not evidence` → `false`;
    - `another EA's owed assignment insert is not evidence`: the assignment's `ea_user_id` is
      `'user-2'` → `false`;
    - `attendees use the same held-group evidence`: the same ended assignment with its insert owed;
      a `session_attendees` record with `group_id 'group-1'` whose parent session and child are
      acknowledged (no outbox rows) and whose child's direct assignment is `synced` → `true`;
    - `other tables keep active-only evidence`: a `child_group_memberships` record for `group-1`,
      with the ended assignment's insert owed and every other grant synced → `false`.
  - Scenarios, with the Task 4 seed and the same end-state assertions (for each test's own group),
    plus "no row was `terminal` after any pass". Between passes, advance the clock with
    `jest.useFakeTimers(); jest.setSystemTime(t)` (as `__tests__/childrenRepository.test.js:64-71`
    does) by 16 minutes, past the 15-minute backoff cap (`offlineSync.js:446`):
    - `the assignment's own insert fails over three passes after the group is deleted; the lesson
      converges with no manual retry`: offline, `saveGroup({ id: 'group-new', name: 'Group 2',
      programme_id: 'programme-a', class_id: 'class-1', created_by: 'user-1', synced: false })`
      (which queues the group and its assignment), `addChildToGroup({ child_id: 'child-1',
      group_id: 'group-new', synced: false })`, save the lesson with `group-new`,
      `deleteGroup('group-new')`; the server has `failGroupAssignmentInserts: 3`. After at most 6
      passes the outbox is empty and the server lesson has `group_id 'group-new'`. After every pass
      the lesson's outbox row is `pending` or `failed`, never `terminal`, and after at least one pass
      it is `failed` with `last_error` matching `/row-level security/` (the fake's `42501` message;
      `errorMessage` stores the message, `offlineSync.js:620-622`), proving the held-group evidence,
      not only ordering, carried it. Expected shape: pass 1 holds the lesson back (the group's archive waits for the
      group's insert and blocks its dependents for that pass); passes 2-4 send it and get `42501`
      while the assignment insert fails; pass 5 lands it; pass 6 sends the assignment's archive;
    - `the group's own insert fails once: its lesson waits in that pass and lands in the next`:
      `group-new` created offline, lesson saved, `failGroupInserts: 1`. Pass 1 makes **no**
      `sessions` call and leaves the lesson's row `pending` with `retry_count` `0`; pass 2 converges;
    - `sessions without a group are not held back by an unrelated failed group` (characterization,
      passes before and after; it guards the `dependenciesForRecord` change): a `group-other`
      insert fails once, and two sessions with no group, one with `class_id 'class-1'` and one with
      no class, both upload in pass 1.
  - `classifyErrorHardening.test.js`: the shape guard (`:74-89`) accepts
    `{ heldGroupAssignment: 'group_id' }` only on `sessions` and `session_attendees`; in the
    mapping test (`:91-108`) add
    `expect(GRANT_SUBJECTS.sessions).toEqual([{ heldGroupAssignment: 'group_id' }])` and
    `expect(GRANT_SUBJECTS.session_attendees).toEqual(expect.arrayContaining([{ heldGroupAssignment: 'group_id' }]))`.
- [ ] **Step 2: Run** `npm run test:integration -- __tests__/sessionGroupSync.test.js` and
  `npx jest __tests__/classifyErrorHardening.test.js` → FAIL. The backoff scenario fails with the
  lesson `terminal` after pass 1 (`42501`, no group edge and no held-group evidence); the
  group-insert scenario fails with `23503` → `terminal`.
- [ ] **Step 3: Implement** per the Interfaces block.
- [ ] **Step 4: Run** both, then `npx jest offlineSync syncOutboxRepository syncErrorGuard
  deterministicErrorBudget` and `npm run test:integration` → PASS.
- [ ] **Step 5: Docs.**
  - Contract map: Global Contract 10 (`:178`), the Error Classification `42501` and
    `UPDATE_NOT_APPLIED` rows (`:553`, `:555`) and its Known limitations (`:561-569`). Session and
    attendee `42501`s also count an owed `insert` of the EA's assignment to that group, ended or
    not, filtered to the signed-in EA (unlike `hasPendingActiveAssignment`, which the limitation at
    `:568` describes); every other grant stays active-only. Same-pass dependency gating
    (`:357-363`): sessions now wait for their own group. Add `syncServerColumns.js`'s session row,
    the B2 migration, the harness, `test-support/sessionGroupServer.js` and the new suites to
    "Source Files to Review Together" (`:960`).
  - ROADMAP: tick the tripwire at `documentation/ROADMAP.md:577-579` with a dated note.
    Membership-mediated evidence already existed (`GRANT_SUBJECTS` `membershipMediatedChild`), and
    B2 added held-group evidence for sessions and attendees. Annotate the next tripwire (`:580-581`):
    the lesson plan's C16 keeps it deferred and adds no new group write (plan call).
- [ ] **Step 6: Commit** `feat(sync): sessions wait for their group; an owed assignment insert is retry evidence`.

### Task 6: Sync engine — a session's retried insert needs no UPDATE rights (release prerequisite)

**Why (Codex round 1, finding 1; pre-existing, fixed here).** When the server commits a session but
its response is lost, the engine marks the session `failed` and holds its attendees back for that
pass only (`findBlockingDependency` reads this pass's `failedRecordsByTable`,
`src/services/offlineSync.js:1539-1629`). The first retry delay is 5 s (`BASE_RETRY_DELAY`, `:34`),
so by the next pass the parent is usually due again and, by push order, runs before its attendees.
It goes as a merge upsert. The server row exists, so PostgreSQL takes the UPDATE path, and
`sessions_update_active_assignment_after_attendee` refuses it, because its USING clause needs a
landed attendee (`private.has_active_session_attendee_assignment`,
`supabase/migrations/20260521144901_masi_zazi_alignment_schema.sql:561-575, 933-950`). Nothing is
owed locally, so `computeEvidencePending` finds no evidence and `processRecord` marks the session
`terminal` (`offlineSync.js:1196-1251`). Ordinary passes skip terminal rows
(`src/db/repositories/syncOutboxRepository.js:89-116`), so the attendees then land while the
session's terminal row waits for a manual Sync Now. That breaks the no-manual-retry promise
(spec §7.1).

**Fix: send a session insert as insert-or-ignore by id**, as the immutable assignment inserts already
are (`offlineSync.js:825-833`; AGENTS.md "Immutable Assignment Inserts"). Checked against the code:
- **Only inserts.** The phone queues a session only as `insert` (`sessionsRepository.js:223`), and
  `updateSession` (`:325-342`, no production caller) re-saves through `saveSession`, so it queues
  `insert` too. No producer emits `update`, `archive` or `hard_delete` for `sessions`. Once inserts
  are ignored on conflict, an `updateSession` edit of an acknowledged session would be marked
  `synced` on the phone and silently dropped by the server, leaving the two copies different. This
  task therefore deletes `updateSession` (plan call; spec §8 puts editing a saved session out of v1).
- **No version fencing to break.** `sessions` is not in `VERSIONED_TABLES`
  (`src/db/repositories/rowVersion.js:1-13`), has no `enforce_row_version` trigger
  (`supabase/migrations/20261018180000_upload_contract_row_version.sql:47-100`), and the upload
  contract leaves it out of scope (`docs/superpowers/specs/2026-10-18-upload-contract-design.md:46-48`).
  `isStampedOperation` is false for it, so no `row_version` is sent, `MV001` cannot arise, and
  `applyAcknowledgedPayload` returns early.
- **INSERT checks still apply; UPDATE checks are never reached.** PostgreSQL applies INSERT
  `WITH CHECK` to the proposed row before it looks for a conflict (`offlineSync.js:248-252`;
  contract map "Acknowledged edit", proved by S1). A retry therefore still needs
  `sessions_insert_active_programme` (`20260521120147_masi_rls_advisor_cleanup.sql:361-372`) and
  B2's restrictive insert policy, and never needs an UPDATE policy. `DO NOTHING` never changes a
  stored session, so real content changes stay behind the UPDATE policies.
- **SELECT visibility.** The session SELECT policy's direct `user_id = auth.uid()` arm
  (`20260828004500_history_session_authorization_scope.sql:53-60`) makes the writer's own row
  visible whatever the conflict check needs. Assignment inserts already use the same PostgREST call
  (`Prefer: resolution=ignore-duplicates`) against this server.
- **Acknowledgement.** As for assignment inserts, a call with no error is acknowledged
  (`finalizeSuccess`). The id is the phone's own UUID and the proposed row passed
  `user_id = auth.uid()`, so a conflicting row is this EA's committed insert. No read-back is added:
  an ignore-duplicates call returns only the rows it inserted, so a read-back cannot tell "already
  there" from "absent".
- **`session_attendees` has no matching hazard** and keeps its batched merge upsert. Its UPDATE
  policy (`session_attendees_update_own_session_active_assignment`,
  `20260521144901_masi_zazi_alignment_schema.sql:979-989`) asks for the same owned session and child
  authority as its INSERT policy (`:966-977`). B2's attendee UPDATE check accepts an ended
  assignment, and `can_read_session_attendee` follows the owner arm. So a retried attendee passes
  whenever its first insert would (harness case `attendee-merge-retry-after-commit`).
- A session already `terminal` from this bug before the update clears with Sync Now, which includes
  terminal rows. The `masi-app-sqlite` backend has no field users yet.

**Files:**
- Modify: `src/services/offlineSync.js` (a new `INSERT_OR_IGNORE_TABLES` after `BATCHABLE_UPSERT_TABLES`,
  `:232-241`; the `ignoreDuplicates` conditions in `runServerOperation`, `:830-832`, and
  `runBatchServerOperation`, `:847-849`)
- Modify: `src/db/repositories/sessionsRepository.js` (delete `updateSession`, `:325-342`, and its
  entry in the returned object, `:356`)
- Modify: `__tests__/sessionsRepository.test.js` (replace `editing a %s session resets and queues its
  parent and rewritten attendees`, `:13-58`)
- Modify: `test-support/sessionGroupServer.js`, `__tests__/sessionGroupSync.test.js`
- Modify: `scripts/session-group-postgres-harness.cjs` (four cases)
- Modify: `documentation/rls-sync-contract-map.md`, `documentation/LEARNING.md`,
  `documentation/build-log.md` (Step 7)

**Interfaces:**
- Consumes: `createSessionGroupServer` (Task 4); Task 5's `GRANT_SUBJECTS.sessions`.
- Produces: module-private
  `const INSERT_OR_IGNORE_TABLES = new Set([...IMMUTABLE_ASSIGNMENT_TABLES, 'sessions'])`, with a
  comment giving both reasons (assignment identity triggers; a session's UPDATE policy needs a
  landed attendee, so a retry must never take the UPDATE path). `runServerOperation` sends
  `ignoreDuplicates: outboxRecord.operation === 'insert' && INSERT_OR_IGNORE_TABLES.has(config.tableName)`;
  `runBatchServerOperation` sends
  `INSERT_OR_IGNORE_TABLES.has(config.tableName) && outboxRecords.every((record) => record.operation === 'insert')`.
  `IMMUTABLE_ASSIGNMENT_TABLES` keeps its other uses (the `23514` classifier `:471`, `canBatchRecord`
  `:1084`, `isStampedOperation`). `sessions` stays out of `BATCHABLE_UPSERT_TABLES`.
- Removes: `sessionsRepository.updateSession`. `saveSession` is unchanged here.
- Produces (extends Task 4's fake): `createSessionGroupServer(...)` also returns
  `loseNextResponse(tableName, id)`. New rules:
  - `loseNextResponse(tableName, id)`: the next upsert in that table that carries that id commits as
    usual, then throws `new Error('Network request failed: response lost after commit')` (the shape
    of `test-support/statefulMembershipServer.js:61, 67`);
  - the FK and C19 checks run on every proposed `sessions` and `session_attendees` row first, even
    one that will be ignored (PostgreSQL's order);
  - `ignoreDuplicates` applies on every table: a proposed row whose id is stored leaves the stored
    row unchanged and returns `{ error: null }`;
  - a merge upsert (no `ignoreDuplicates`) of a stored `sessions` row returns
    `{ error: { code: '42501', message: 'new row violates row-level security policy (USING expression) for table "sessions"' } }`
    unless `rows.session_attendees` holds a row whose `session_id` is that id. This is the
    `sessions_update_active_assignment_after_attendee` USING clause; the fake models only whether an
    attendee is present.

- [ ] **Step 1: Write the failing tests.**
  - In `sessionGroupSync.test.js`, with the Task 4 seed and the same engine wiring:

    ```js
    test('a session whose response was lost is retried before its attendees, and the family lands in ordinary passes', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-20T08:00:00.000Z'));
      await createSessionsRepository({ database: db }).saveSession(LESSON); // the Task 4 lesson, group-1
      server.loseNextResponse('sessions', 'lesson-1');
      const terminalCount = async () => (
        await db.getFirstAsync("select count(*) as count from sync_outbox where status = 'terminal'")
      ).count;

      await engine.syncAll(); // pass 1: committed on the server, response lost
      expect(server.rows.sessions.has('lesson-1')).toBe(true);
      expect(await db.getFirstAsync("select status, retry_count from sync_outbox where table_name = 'sessions'"))
        .toEqual({ status: 'failed', retry_count: 1 });
      expect(await db.getAllAsync("select status, retry_count from sync_outbox where table_name = 'session_attendees'"))
        .toEqual([{ status: 'pending', retry_count: 0 }, { status: 'pending', retry_count: 0 }]);
      expect(server.rows.session_attendees.size).toBe(0);
      expect(await terminalCount()).toBe(0);

      jest.setSystemTime(new Date('2026-10-20T08:16:00.000Z')); // the parent is due before its attendees
      await engine.syncAll(); // pass 2
      expect(await terminalCount()).toBe(0);
      expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
      expect(server.rows.sessions.get('lesson-1').group_id).toBe('group-1');
      expect([...server.rows.session_attendees.values()]
        .map(({ child_id, group_id }) => ({ child_id, group_id }))
        .sort((a, b) => a.child_id.localeCompare(b.child_id)))
        .toEqual([{ child_id: 'child-1', group_id: 'group-1' }, { child_id: 'child-2', group_id: 'group-1' }]);
      expect(await db.getAllAsync(
        "select sync_status from sessions where id = 'lesson-1' union all select sync_status from session_attendees where session_id = 'lesson-1'",
      )).toEqual([{ sync_status: 'synced' }, { sync_status: 'synced' }, { sync_status: 'synced' }]);
      const sessionCalls = server.calls.filter((call) => call.tableName === 'sessions');
      expect(sessionCalls).toHaveLength(2);
      for (const call of sessionCalls) {
        expect(call.options).toEqual(expect.objectContaining({ onConflict: 'id', ignoreDuplicates: true }));
      }
    });
    ```

    `afterEach` restores real timers. `LESSON` is the Task 4 `saveSession` argument, and `engine` is
    the Task 4 `createOutboxSyncEngine` call.
  - In `sessionsRepository.test.js`, replace the `editing a %s session ...` test (`:13-58`) with:

    ```js
    test('sessions are insert-only on this phone: the repository has no edit method', async () => {
      const db = await createMigratedDatabase(runMigrations);
      try {
        // Session inserts are insert-or-ignore (B2 Task 6): the server would ignore a re-saved edit
        // of an acknowledged session. Saved-session editing must add an `update` operation.
        expect(createSessionsRepository({ database: db }).updateSession).toBeUndefined();
      } finally {
        await db.closeAsync();
      }
    });
    ```
  - Extend `test-support/sessionGroupServer.js` per the Interfaces block. Task 4's and Task 5's
    scenarios never re-send a stored session, so the new merge rule leaves them unchanged.
- [ ] **Step 2: Run** `npm run test:integration -- __tests__/sessionGroupSync.test.js __tests__/sessionsRepository.test.js`
  → FAIL. Pass 2's `sessions` call carries `ignoreDuplicates: false`. The fake answers `42501`
  because `lesson-1` has no stored attendee, nothing is owed, and the lesson's row goes `terminal`
  with `last_error` matching `/row-level security/` (`terminalCount()` is `1`). The repository test
  fails because `updateSession` exists.
- [ ] **Step 3: Implement** per the Interfaces block: add `INSERT_OR_IGNORE_TABLES`, switch both
  conditions to it, and delete `updateSession`.
- [ ] **Step 4: Run** the Step 2 command, then
  `npx jest offlineSync syncOutboxRepository rowVersionSend activePairDomainIds` and
  `npm run test:integration` → PASS. `__tests__/offlineSync.pendingSessions.test.js:78` asserts
  `expect.objectContaining({ onConflict: 'id' })`, so the added `ignoreDuplicates: true` does not
  break it.
- [ ] **Step 5: Harness cases** in `scripts/session-group-postgres-harness.cjs`. Add the shape of
  PostgREST's `Prefer: resolution=ignore-duplicates` (precedent:
  `scripts/upload-contract-postgres-harness.cjs:369-379`):

  ```js
  // PostgREST's upsert with Prefer: resolution=ignore-duplicates (supabase-js ignoreDuplicates: true).
  const insertOrIgnoreSql = (table, columns, values) => `
  INSERT INTO public.${table} (${columns.join(', ')})
  VALUES (${values.join(', ')})
  ON CONFLICT (id) DO NOTHING RETURNING id;
  `;
  ```

  Cases (label → expected), each in its own rolled-back transaction, with setup as `postgres`:
  - `session-insert-retry-before-attendees`: setup inserts `EA_A`'s literacy session `S_RETRY`
    with `group_id = G1` and **no** attendees, then ends `EA_A`'s `G1` assignment (the deleted-group
    case). `EA_A` re-sends the same row with `insertOrIgnoreSql`, then runs
    `SELECT id || '|' || group_id FROM public.sessions WHERE id = 'S_RETRY'` → no error, and
    `returnedIds` is exactly `['<S_RETRY>|<G1>']`: the insert returned no id, so the row was ignored.
  - `session-insert-retry-still-checks-the-row`: the same setup without ending the assignment.
    `EA_A` re-sends `S_RETRY` with `insertOrIgnoreSql` but `group_id = G_UNHELD` → `42501`. INSERT
    `WITH CHECK` runs on the proposed row before the conflict, so the retry path keeps C19.
  - `session-merge-retry-before-attendees` (why the phone stopped sending a merge for sessions;
    older builds still send it): the same setup. `EA_A` re-sends `S_RETRY` with `upsertSql` →
    `42501`, from the USING clause of `sessions_update_active_assignment_after_attendee`.
  - `attendee-merge-retry-after-commit` (why attendees keep their merge upsert): setup inserts
    `EA_A`'s session with `G1` and attendee `C` with `G1`, then ends the `G1` assignment. `EA_A`
    re-sends attendee `C` with `upsertSql(..., true)` → one id.
- [ ] **Step 6 (controller): run** `npm run -s verify:session-group:postgres` (env as in Task 1
  Step 6) → every case passes, including these four. If `session-insert-retry-still-checks-the-row`
  succeeds instead, stop and report it rather than editing the case. The retry would still be safe,
  because nothing is written, but the contract map's INSERT `WITH CHECK` claim would need correcting.
- [ ] **Step 7: Docs.**
  - Contract map:
    - Operation Semantics (`documentation/rls-sync-contract-map.md:185-199`): add a row after
      "Immutable assignment insert push". Operation: "Session insert push". Tables: `sessions` when
      `operation === 'insert'` (its only operation). Server call:
      `upsert(payload, { onConflict: 'id', ignoreDuplicates: true })`, one row at a time (sessions do
      not batch). RLS implication: "A retry after a lost response needs only INSERT authority. The
      merge upsert's UPDATE path met `sessions_update_active_assignment_after_attendee`, which needs
      a landed attendee, and went terminal when the parent was retried first (B2, Codex round 1).
      INSERT `WITH CHECK` still runs on the ignored row; `DO NOTHING` never changes a stored session.
      No error acknowledges, as for assignment inserts. `session_attendees` keeps its merge upsert,
      because its UPDATE policy asks for no more than its INSERT policy."
    - Replace the "**Local session edits.**" paragraph (`:335-339`) with "**Sessions are
      insert-only (B2).** `saveSession` is the only session producer, and it queues `insert`. B2
      deleted the unused `updateSession`, because the server would now ignore its re-saved edit.
      Saved-session editing (spec §8; the upload contract's Out list) must add an `update` operation
      sent as UPDATE by id with a row version, never a re-sent insert."
    - Table Contract Map `sessions` row (as Task 4 Step 9 rewrote it): its operation reads
      "Outbound insert-or-ignore by id (B2)".
    - The B2 section: a "Retry after a lost response" bullet naming this task's test and the four
      harness cases.
  - `documentation/LEARNING.md`: a short chapter, "Retrying an insert must not ask for edit
    rights". It covers the lost response; why the merge upsert reached an UPDATE policy that needs
    an attendee; why insert-or-ignore is safe for an insert-only table and still runs the INSERT
    checks; why `updateSession` had to go; and why attendees differ.
  - `documentation/build-log.md`: a Decision Register row (`:1069`): "Session inserts are
    insert-or-ignore by id; `updateSession` deleted". Give the reasons above and the revisit trigger
    ("saved-session editing ships"). Also a Bug and Gap Register row (`:1227`): the pre-existing gap
    (since `20260521140331_masi_rls_review_fixes.sql:89`), found by Codex round 1 of this plan, with
    its cause, its fix in this task, and the tests that pin it.
- [ ] **Step 8: Commit** `fix(sync): a session's retried insert needs no update rights`.

### Task 7: Branch gates and records

**Files:**
- Modify: `documentation/build-log.md`, `documentation/ROADMAP.md`, `documentation/rls-sync-contract-map.md`

- [ ] **Step 1:** `npm test` and `npm run test:integration` → all pass. Record suite and test counts.
- [ ] **Step 2 (controller):** all seven `verify:*:postgres` harnesses (history-authorization,
  upload-contract, organisation-label, support-incident, assessment-results, ea-access,
  session-group) → pass. Record each result, the Task 1 Step 6 RED observation and the Task 6 Step 6
  result.
- [ ] **Step 3:** run a Codex adversarial review of the branch (`--base origin/main`). Engage each
  finding; fix and re-run until approved, or until the remaining findings are rare and recorded as
  accepted risks.
- [ ] **Step 4: Records.**
  - Build log Verification Register (`documentation/build-log.md:39`) rows for every command above.
    The lost-response session gap is fixed in Task 6 and recorded there, so it gets no ROADMAP item.
  - ROADMAP §4 (`:651-669`): note that item 3's session-group contract (`:658`) is built (B2), with
    the hosted apply still pending.
  - Contract map invariant, in the B2 section: the history pull's delivery arm follows
    `child_ea_assignments` (`supabase/migrations/20260925120000_session_history_family_delta.sql:110-115`).
    That covers every group member, because a child in an EA's group is always one of that EA's own
    children (spec J23, Jim 2026-10-20). App-made groups take their members from the delivery
    roster; a Head Office seed must give every group member a direct assignment to the group's EA,
    and a seed that breaks this needs a contract change first.
- [ ] **Step 5: Commit** `docs: B2 session group — gates, gaps and roadmap`.

### Task 8: Hosted apply and device gate (Jim approves before running)

Nothing in this task runs without Jim's explicit yes at the time. Only the SQLite project:
`segygjzpujphwvrubusm`. Use the `sqlite-staging-sql` skill's helper; never run raw Supabase CLI from
the repo root.

- [ ] **Step 1: Read-only preflight.** `npm run sqlite:staging:migrations` prints
  `project_ref=segygjzpujphwvrubusm` and lists `20261021140000_session_group_authorization.sql` as
  pending (`20261021120000_assessment_results_contract.sql` is already applied). If any other file is
  pending, stop and ask Jim. `npm run sqlite:staging:dry-run` names only that file.
- [ ] **Step 2: Apply (Jim's yes).** `npm run sqlite:staging:push`; a re-run dry run reports up to date.
- [ ] **Step 3: Read-only verification** via `npm run sqlite:staging:query -- "<sql>"`:
  - `pg_policies` shows the four B2 policies as RESTRICTIVE and no `sessions_forward_prep_pin_defaults_%`;
  - `has_function_privilege` for the helper is `t` for `authenticated` and `f` for `anon`.
- [ ] **Step 4: Rollback-only actor probe (Jim's yes).** Use the skill's non-interactive psql
  fallback. In one `BEGIN ... ROLLBACK` as a staging tester EA: a session with a group the EA holds
  is accepted; re-sending that session as `INSERT ... ON CONFLICT (id) DO NOTHING` before any
  attendee gives no error (Task 6); one with a group the EA never held gives `42501` (inside a
  savepoint). Afterwards a count shows zero residue.
- [ ] **Step 5: Device gate**, on a Galaxy A03s (360dp) and an iPhone, with an EAS preview build of
  this branch (sqlite backend). B2 changes no screen, so the 1.0x/1.3x text checks do not apply
  (plan call).
  - **G1, upgrade in place.** On the current main preview build (schema 15, or 16 if C1 shipped
    first), as tester EA A, record one session online and one offline (pending). Install the B2
    build over it. Pass: Home opens with no update or error screen; Profile → Export Database shows
    the branch's `CURRENT_SCHEMA_VERSION` and the same `sessions` and `session_attendees` counts as
    before; after reconnecting, the Sync screen shows nothing waiting and nothing needing attention.
  - **G2, fresh phone, group not on the phone.** Fixture on staging (disposable data, Jim's yes):
    EA A's session with group `G` (assigned only to A), attended by child `C`. EA B holds an active
    direct assignment to `C`, has never held `G`, and holds no groups. Fresh install, sign in as B.
    Pass: past lessons finish downloading with no failure on the Sync screen; the session-count
    ranking counts that session for `C`; Export Database shows `sessions` ≥ 1 and `groups` = 0.
  - Record both platforms' results in the build log Verification Register. Rollout note: the hosted
    migration must be applied before any build that writes a group (the C3 Lesson release). B2's
    own build sends only `group_id: null`, which the old pins also accept. Task 6 is client-only and
    uses the existing INSERT policies, so it needs no server step. It is a release prerequisite and
    reaches the lesson release because C2–C3 depend on B2.
- [ ] **Step 6: Commit** `docs: B2 hosted apply and device gate results`.

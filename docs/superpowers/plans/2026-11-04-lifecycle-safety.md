# Lifecycle safety: removing children, classes and groups must never strand recorded work

**Status:** approved by Jim 2026-11-04 (plan and all ten decisions). Active plan; executable work is
tracked as GitHub issues linked from the MA-BUG records.
**Bugs:** MA-BUG-20261104-001 … -021 ([registry](../../bugs/README.md)); evidence in
`docs/bugs/evidence/MA-BUG-20261104-001/` (executed disposable-Postgres and real-SQLite reproductions).
**Interim rules until this lands:** [`documentation/lifecycle-interim-field-rules.md`](../../../documentation/lifecycle-interim-field-rules.md).
**Decision record:** ADR-0014 (written in the server branch, step A1).

## Why

Zazi iZandi's hardest stuck-work bugs came from one root cause: the server authorized each upload by
the EA's access **at upload time**. Offline lag turned archives, handovers and removals into permanent
refusals. Zazi's fixes added waiting (drain-before-revoke, parent holds, receipt binding), and each wait
needed its own way out. Masi has the same root cause in a smaller form. Executed reproductions show it:
a Delete child after an offline lesson uploads the session with zero attendees and strands the tick.

## Principles (binding; ADR-0014 records them)

1. **History is a fact authorized by what was held when the work happened.** Attendance, sessions,
   Battery Runs, assessments and letter/skill ticks land when the EA held the child and the programme on
   the work's SAST day, which may not be later than the server's today. This extends the existing
   `private.user_held_grant_on`. Lifecycle ends and history then commute: push order is only an
   optimisation. There is no drain, no outbox-wide history gate, and no binding between an archive and
   the uploads before it.
2. **The evidence behind (1) cannot shrink, move or vanish.** An EA write may set an end once; the
   server keeps it in `[start, now()]` and never lets an EA clear or move it. Head Office SQL and
   SECURITY DEFINER functions keep full control. Nothing holding history or authority evidence can be
   hard-deleted or cascade-wiped.
3. **The server decides archive-versus-archive conflicts** at execution time, over its own data, with
   one shared "does anyone else still hold this?" predicate. The phone states intent; it never decides
   a global effect from its partial copy.
4. **Absorb, don't refuse.** A migration reaches every installed 1.5.0 phone at once. A server change
   may only relax a rule, or turn a refusal into a result the 1.5.0 client (`f002e08`) already
   acknowledges: a one-row archive ack, `true` from `delete_child_if_no_history`, or an RPC literal
   its parsers accept. It never adds a SQLSTATE, a refusal or a unique constraint for a shipped wire
   shape. 1.5.0 retries unknown codes forever and treats 23505 as terminal. A CI gate enforces this.
5. **Every non-success has exactly one exit, and nothing leaves a phone before the office holds its
   copy.** Refused lifecycle and edit rows resolve to server truth. Refused history stays replayable,
   so a server fix heals it on routine Sync now. A row leaves the phone only after the server holds a
   delivered `upload_terminal` receipt of its exact current revision, untruncated (O1 item 2).
6. **Remove more than we add** (~9 added, ~25 removed), and verify at real seams, then in the field.

## Decisions (Jim, 2026-11-04: all recommendations accepted)

| # | Decision |
| --- | --- |
| D1 | A letter/skill tick counts when the EA held a **direct** delivery assignment on the SAST day of the tick (time clamped to server now). The existing (changed_at, correction_id) order decides conflicts, so a late tick can only fill letters the successor never touched. Stamp the programme the EA held then. CONTEXT.md changes "current deliverer" to "an EA who delivered to the child when the correction was made". The former deliverer becomes `changed_by` and can read that row again; accepted. |
| D2 | Drop the active-academic-year requirement from held-at-time authority. Keep `day <= SAST today` plus the interval overlap. The year is a reporting dimension. |
| D3 | Delete child when someone else still holds the child means **leave**: end only the caller's own grants. Archive for everyone only when the caller was the last holder. |
| D4 | An EA archives a class for everyone only if they **created it and are its only holder**. Otherwise Delete class means leave. |
| D5 | EAs never un-end or restore. Only Head Office reopens, through the script. |
| D6 | Reverse the MV001 forced override. A refused stale edit is kept in its delivered receipt, the outbox row is dropped, and the server wins. |
| D7 | After a programme switch, accept work dated inside the old `staff_programme_assignments` interval, stamped with that programme. |
| D8 | EAs get an exit from Needs attention ("The office has a copy — remove from this phone"), only after the row's receipt is delivered. |
| D9 | Head Office lifecycle work in November goes through a 3-command dry-run script (handover, end-delivery, reopen). Off-boarding is suspend-only. |
| D10 | Before EAs record real lessons: the server batch is applied and verified (R1), the interim rules are briefed, the H1 script and daily check exist, and **the app update (O1 and O2) is on every pilot phone**, confirmed by its `updateId`. O2 is needed for Delete child (critic B2); O1 is the only exit for rows the server cannot acknowledge (review finding 2). *Tightened 2026-11-05 by Codex review round 2: Jim's original D10 let the rest of the OTA slip into week 1.* O1's Needs attention polish, beyond the receipt rule and forced-pass change, may still slip. |

## Corrections adopted from the adversarial critique (2026-11-04)

- **B1:** the Delete child RPC never hard-deletes (S3). An always-true hard delete could run before a
  queued lesson for that child and turn it into a 23503/42501 refusal: ordering would matter again.
- **B2 (verified in code):** on embedded 1.5.0, `archiveChild` ends **every** open class membership and
  enrollment for the child (`childrenRepository.js:950-972`). Class memberships are not per-programme,
  and `getMyChildren` needs an open membership. So one EA's Delete child hides the child from other EAs
  (MA-BUG-20261104-014). The server cannot absorb this because it looks like a class move on the wire.
  So: the O2 Delete-child path is a hard gate before real lessons, and the EA rule holds per phone.
- **B3:** a pull-to-refresh replays refused archives (forced pass). So there is no heal sweep and no
  Head Office reopen for a phone whose receipts show refused archive/restore rows, until it runs O1.
- S2 does not depend on S1 (S2 alone adds no forced passes). They ship in one batch, but S2 may go
  first if S1/S3/S4 slip.
- The off-boarding precondition is "0 waiting, and every needs-attention row has its receipt on the
  server", not "0 needing attention". The stricter wording blocks Head Office forever before O1, which
  is Zazi's drain trap in human form.
- The mastery as-of check uses SAST-day bounds (as `user_held_grant_on` does), not raw timestamps.
- The daily check adds "live groups whose class is archived". The live-schema preflight is done (below).
- Cut for November: O1's full plain-words family grouping. Ship the display-name fix plus the exit;
  grouping comes later.

## Corrections adopted from the Codex adversarial review, round 1 (gpt-6-astra, 2026-11-05)

Verdict: needs-attention (4 high, 3 medium). It confirmed three pieces are sound:
- S4 distinguishes sessions' DO NOTHING uploads from attendees' merge upserts.
- S1's `current_user` test separates direct EA writes from SECURITY DEFINER execution.
- S3's no-hard-delete boolean contract preserves the 1.5.0 interface.

Each finding and its resolution:

1. **[high] A sent receipt did not prove the office holds the complete current payload.** Envelopes over
   56 KB truncate the wire payload, and a later refused edit can share an already-sent repeat key.
   **Adopted:** the exact-revision gate in O1 item 2.
2. **[high] S1 cannot acknowledge rows that existing UPDATE policies hide.** RLS USING filters before
   the trigger runs, so the class-only and ended-group exits in L1 still return 0 rows.
   - **Adopted:** the plan no longer claims those acks. On embedded 1.5.0 they stay
     `ARCHIVE_NOT_APPLIED`, and O1 clears them under the same receipt rule.
   - **Declined:** a "former holder" no-op UPDATE arm. It would copy nine tables' authority predicates
     into a second form, and it needs SELECT visibility too. The O1/O2 OTA, a gate before real
     lessons, closes this on every pilot phone.
3. **[high] The programme helper's `day <= today` bound would refuse fast-clock uploads 1.5.0 lands
   today.** **Adopted:** an open programme assignment is accepted with no date bound, as now. Only
   the historical arm is bounded (S2 item 3).
4. **[high] Locking the child row does not serialize Head Office grants that reach the child through a
   class or group.** **Adopted:** one lock order, children → classes → groups (ids ascending). Every
   EA archive decision (S1 children/classes, S3) and every H1 grant change takes it, and the holder
   check re-runs after the locks are held.
5. **[medium] O2's unsent relationship INSERTs could re-create grants after removal.** **Adopted:** the
   Delete child op waits for the child's relationship family INSERTs. Writing ends into those INSERTs
   was tried first and rejected in round 2 (finding 2); see O2 item 2.
6. **[medium] Handover to a former holder repeats the deterministic-id no-op.** **Adopted:** handover
   reopens an existing successor row in place (H1).
7. **[medium] The rule sheet still required "All saved and synced", which a Needs attention item
   blocks.** **Adopted:** the condition is now "0 waiting, and every needs-attention item appears in
   the EA's receipts".
8. **Next steps.** The frozen 1.5.0 corpus is validated against the `f002e08` producer, not
   regenerated from current code; the OTA has its own expectations. Existing never-held and
   non-overlapping-interval denial cases stay.

## Corrections adopted from the Codex adversarial review, round 2 (gpt-6-astra, 2026-11-05)

Verdict: needs-attention (2 high, 1 medium). It confirmed the unbounded open-programme arm and the
identity-preserving successor reopen.

1. **[high] The receipt rule reconstructed delivery proof.** `freeze` stores the **bounded**
   envelope in `report_snapshot`, and `markSent` clears it while keeping the unbounded `payload`
   (`supportIncidents.js:69-75`, `supportIncidentRepository.js:152-155`). So "sent with no unsent
   changes" did not mean the office holds the full payload.
   **Adopted:** `markSent` persists delivery proof in the existing `local_state` table (O1 item 2).
2. **[high] Writing ends into still-owed relationship INSERTs removes the authority needed to upload the
   rest.** An ended `child_ea_assignments` INSERT leaves the enrollment and membership INSERTs, and
   class-scoped Battery Runs, with no open path, so they hit 42501.
   **Adopted instead:** the children `hard_delete` waits for the child's own still-owed relationship
   INSERTs, extending the existing retained-insert gate from the child row to its relationship
   family. This is same-record-family ordering, which ADR-0014 permits. History never waits. A
   refused relationship insert leaves through O1's exit, so the wait is bounded. No coalescing.
3. **[medium] D10 let O1 slip although declining the former-holder arm relies on it.**
   **Adopted:** D10 now requires O1 and O2 on every pilot phone before real lessons. The interim sheet
   lifts the per-phone rules on that phone's `updateId`.

## Live staging preflight (P0, done 2026-11-05 ~01:10Z, read-only)

`masi-app-sqlite` (`segygjzpujphwvrubusm`): migrations identical to `supabase/migrations/` through
`20261104132732`. The database TimeZone is UTC. The fingerprints of every public/private function,
policy and trigger (185 objects) match a disposable PG17 loaded from the files; the only extra object is
the Supabase platform `public.rls_auto_enable()`. **No drift: the migration files are authoritative for
this batch.**
- 9 authenticated DELETE grants and policies: `child_class_memberships`, `child_group_memberships`,
  `child_programme_enrollments`, `class_grouping_state`, `classes`, `grouping_versions`,
  `session_attendees`, `sessions`, `time_entries`.
- Authenticated UPDATE on `sessions` and `session_attendees`.
- CASCADE into history or evidence from `auth.users`, `public.users`, `children`, `classes`, `groups`
  (full list in `docs/bugs/evidence/MA-BUG-20261104-001/` … see the S4 step).
- Lifecycle-table triggers are `<t>_enforce_row_version`, `<t>_prevent_identity_change`,
  `<t>_set_updated_at`, plus `classes_letter_order_edition` and `groups_prevent_programme_change`.
  A guard named `<t>_zz_lifecycle_guard` fires last.
- No other authenticated client writes these tables. Django reads through the read-only
  `masi_reporting_reader`; the dashboard web app has no app-table writes.

## Steps

Each step lists the bugs it closes. **Server steps S4, S1, S2 and S3 ship in one branch with A1 and T1**
(`feat/lifecycle-safety-server`). Migration timestamps come after `20261104132732`, in this order:
`20261105120000_remove_destructive_capabilities`, `20261105120100_lifecycle_end_guard`,
`20261105120200_held_at_time_history_authority`, `20261105120300_child_removal_actor_scoped`.
Additive, idempotent SQL. Never `RAISE` a new SQLSTATE from a path a 1.5.0 request can reach.

### T1: frozen 1.5.0 compatibility gate and lifecycle harness (red first)

- New `scripts/lifecycle-compat-postgres-harness.cjs`, run as `npm run verify:lifecycle-compat:postgres`
  and wired into `.github/workflows/tests.yml` next to the other PG harness jobs (PGTZ=UTC). Reuse
  `scripts/history-authorization-postgres-harness.cjs` (`bootstrapSql`, `runPsql`,
  `assertDisposableAdminTarget`, `buildDatabaseUrl`, `MIGRATIONS_DIR`). Each case runs in
  BEGIN…ROLLBACK. Translate PostgREST requests the way the repros did:
  - upsert = `INSERT … ON CONFLICT DO UPDATE` or `DO NOTHING` (insert-or-ignore tables);
  - PATCH = `UPDATE … RETURNING id` under `SET LOCAL ROLE authenticated` + `request.jwt.claims`;
  - RPC by named args.
- **Dispositions from the real old client:** commit a fixture generated once from `f002e08`'s own
  `_testClassifyError` (f002e08 `src/services/offlineSync.js:1889`) plus its ack rules:
  - archive/restore need exactly one returned id;
  - `hard_delete` needs `data === true`;
  - `save_battery_run` accepts `inserted/updated/unchanged`;
  - `submit_assessment` accepts `inserted/already_present`;
  - mastery accepts `applied/superseded/acknowledged`.
  Generate it in a throwaway `git worktree` at `f002e08` (Node 20). Commit the generator and the
  fixture under `scripts/fixtures/lifecycle-compat/`. The harness fails when any 1.5.0 request's
  disposition gets worse: synced→terminal, or any→retry-forever (unknown code).
- **Wire corpus (frozen 1.5.0 producer):**
  - Commit the recorded wire requests from
    `docs/bugs/evidence/MA-BUG-20261104-001/repro-client-archive-chain/wire-*.json`, plus the S/L
    scenario SQL as cases.
  - Validate the corpus **once** against the 1.5.0 producer: re-run the C1/C2/C3 chain in a
    throwaway `f002e08` worktree (Node 20) and confirm the same request sequence. Record any
    difference, which is expected only where f002e08 has no `skill_mastery`.
  - Commit the corpus as frozen. No test ties it to the current engine, because the OTA
    deliberately changes these requests. OTA behaviour has its own tests (O1, O2, G1).
- **Post-fix expectations (red before S1–S4):**
  - **History lands:** S1, S1b, S2, S3, S7, C1, C2, C3a–c (attendees and mastery). S4, S4b, S5b:
    session, run and assessment land after a programme switch, and mastery is stamped with the held
    programme. S5: the attendee replay acks. S6b: lands (D2).
  - **Ends stay put:**
    - L1 cases where the EA still reaches the row: a redundant exit returns 1 row and Head
      Office's end is unchanged. Cases where RLS USING hides the row (L1 class-only and
      group-only paths, ended class or group assignment) still return **0 rows**. Assert that
      as the documented embedded-1.5.0 residual (review finding 2), not as a fix.
    - L2a: no overwrite. L2b and L2d: restore/un-end return 1 row as no-ops, and
      `current_user_can_write_for_child` stays false.
    - L3: no 23514 for EA or Head Office ends.
  - **Archives:**
    - E1a: a class archive replay is a no-op while EA_B holds the class.
    - E5: the class stays live and EA_B's grants are intact.
    - A children merge-upsert replay after an archive keeps `archived_at`.
  - **Delete child:** E2: the RPC returns true and the child ends archived (sole holder) or left
    (another holder). The RPC never deletes a children row.
  - **Destructive capabilities:**
    - L6c: EA DELETE is denied (42501 from the missing grant; no 1.5.0 producer exists).
    - L6b: deleting a `public.users`/`auth.users` row with history fails under RESTRICT.
    - Sessions insert-or-ignore (first send and replay) succeeds with authenticated UPDATE revoked.
  - **Other:**
    - The Head Office group handover (fresh-id successor row) converges for a 1.5.0 bare-id archive.
    - Trigger order is pinned (guard after `_enforce_row_version` and `_prevent_identity_change`).
  - **Compatibility and safety cases from review round 1:**
    - `class-current-future-preserved` stays green, and new cases cover a session first-send and
      replay, an assessment and a Battery Run dated in the phone's future, all under an open
      programme assignment. They must still land.
    - The existing never-held-child and non-overlapping-interval denial cases stay denied.
    - Two overlapping-transaction cases, using two concurrent psql sessions and a held lock:
      - S3 Delete child against an H1 class or group handover granting a new holder;
      - a class archive against a new class holder.
      Each must end with the new holder keeping the child or class.
- **Two catalog assertions:** no authenticated DELETE grant or policy on any public table; no
  `ON DELETE CASCADE` from `users`/`children`/`classes`/`groups` into history or authority-evidence
  tables (allowlist: `auth.users→public.users`, `sessions→session_attendees`, and
  Supabase's own `auth.*` tables).
- **Existing pins that assert today's bugs change in the same branch:**
  - `scripts/assessment-results-postgres-harness.cjs` (~526-527 `class-outside-active-year`,
    `class-no-active-year`, and any `class-no-open-programme` case D7 flips);
  - any history-authorization, letter-/skill-mastery or session-group harness case asserting
    present-tense refusal.
  Change each to the decided behaviour and say why in the commit.

### S4: remove destructive capabilities (MA-BUG-008, -009)

- (a) `REVOKE DELETE … FROM authenticated` and drop the 9 DELETE policies listed in the preflight.
  This mirrors what `20261021140000` did for groups.
- (b) `REVOKE UPDATE ON public.sessions FROM authenticated`. Drop
  `sessions_update_active_assignment_after_attendee` and the RESTRICTIVE
  `sessions_state_completed_group_held_update` (if present). Sessions have only an `insert` producer,
  sent insert-or-ignore. `touch_session_family` is SECURITY DEFINER. **Keep** UPDATE on
  `session_attendees`, which the merge upsert needs.
- (c) Re-create as `ON DELETE RESTRICT` (`NOT VALID`, then `VALIDATE`):
  - `public.users` → sessions, assessments, time_entries, child/class/group EA assignments,
    staff_programme_assignments;
  - `children` → session_attendees, assessments, letter_mastery, letter_mastery_corrections,
    child_ea_assignments, enrollments, class and group memberships;
  - `classes` → class_ea_assignments, grouping_versions, class_grouping_state;
  - `groups` → child_group_memberships, group_ea_assignments;
  - `auth.users` → mobile_support_incidents, private.ea_access_events,
    private.history_pull_rollout.
  Keep `auth.users → public.users` CASCADE so never-used test accounts still delete. Keep
  `SET NULL` audit columns as they are.
- Fix the cleanup in `scripts/createTesters.js` (~207, 226, 245) and in the staging probes
  (`assessment-history-http-probe.cjs`, `rls-visibility-probe.cjs`) to delete history explicitly,
  service role, children first. Otherwise their teardown fails under RESTRICT.

### S1: lifecycle end guard (MA-BUG-006, -007, -011 server part, -013 server part)

Implement one SECURITY INVOKER plpgsql function `private.guard_lifecycle_row()` (`set search_path = ''`),
configured per table through `TG_ARGV`: end column, start column, and the "keep with end" columns. It
assigns through `jsonb_populate_record(NEW, …)`.

**Attachments.** Attach it as `<table>_zz_lifecycle_guard`:
- BEFORE INSERT OR UPDATE on the six interval tables:
  - `child_ea_assignments.unassigned_at` (+ `handover_reason`)
  - `class_ea_assignments.unassigned_at` (+ `handover_reason`)
  - `group_ea_assignments.unassigned_at` (+ `handover_reason`)
  - `child_programme_enrollments.ended_at`
  - `child_class_memberships.exited_at`
  - `child_group_memberships.removed_at`
- BEFORE UPDATE on `children`, `classes` and `groups` (`archived_at` + `archived_by_user_id`,
  `archive_reason`).

Verify the start-column names in the schema.

**Rules:**
1. **Any writer:** when the end is not null, end := greatest(end, start). The 23514 CHECKs stay as
   invariants and can no longer fire from skew.
2. **Only when `current_user = 'authenticated'`** (a direct PostgREST EA write):
   - (a) UPDATE with OLD end set: NEW keeps OLD's end and its keep-with-end columns (no clear, no
     move). This turns these into one-row no-ops: stale and redundant archives, the group restore,
     EA un-ends, and merge-upsert replays (ON CONFLICT DO UPDATE fires BEFORE UPDATE).
   - (b) A first end (INSERT with end, or UPDATE from NULL): end := greatest(least(end, now()), start).
   - (c) A first `archived_at` on children, classes or groups applies only when the caller currently
     holds the entity AND `private.other_active_holder(<table>, id, auth.uid())` is false. Classes
     additionally need `created_by = auth.uid()` (D4). Otherwise `archived_at` stays NULL, which
     means "leave". When the archive applies, set `archived_by_user_id := auth.uid()`.
3. **Always** `RETURN NEW`. Never return NULL, never RAISE.

**`private.other_active_holder(p_table text, p_id uuid, p_actor uuid) returns boolean`.** SECURITY
DEFINER, `set search_path = ''`, EXECUTE granted to authenticated. Shared with S3:
- **children:** another user's active direct `child_ea_assignments`; OR another user's active
  `class_ea_assignments` on a class where the child has an open class membership; OR the same for
  group assignment plus open group membership. These mirror the three arms of
  `current_user_can_write_for_child`.
- **classes:** another active `class_ea_assignments` row.
- **groups:** another active `group_ea_assignments` row.

**"Caller currently holds"**: children via `current_user_can_write_for_child`; classes and groups via
an active assignment row.

**Lock protocol** (review finding 4). `other_active_holder` takes `p_lock boolean`. With `p_lock`, it
first locks with `FOR UPDATE`, ids ascending:
- for children: the rows of the classes and groups the child has open memberships in (the child row
  is already locked by the UPDATE or by S3);
- for classes: the class row, already locked by the UPDATE.

It then evaluates the predicate. Under READ COMMITTED each query sees what committed before it, so
the check after the locks is current. The global order is **children → classes → groups**. S1's
archive rule (2c) and S3 call it with `p_lock = true`, and H1 takes the same locks in the same order
before inserting or reopening any assignment. A deadlock (40P01) is only a retry for 1.5.0 (an unknown
code retries) and the consistent order should prevent it; T1 pins the order.

**Residual from review finding 2.** Rows that the existing UPDATE policies hide still return 0 rows:
for example a class-only or group-only membership exit after Head Office removed that path, or after
the EA's class or group assignment ended. RLS filters them before the trigger runs, so they stay
`ARCHIVE_NOT_APPLIED` on embedded 1.5.0, and O1 clears them. This plan adds no "former holder" UPDATE
arm.

Accepted residuals, recorded in ADR-0014:
- Starts stay EA-writable through merge-upsert. This is bounded, because held-at-time intersects with
  immutable assignment starts.
- A "leave" or kept-OLD write still returns a one-row ack, and the phone converges at the next pull.
- An entity archive that lands in a later pass than its own assignment end degrades to "leave"; the
  daily check lists it.

### S2: held-on-the-day history authority (MA-BUG-001, -002, -003, -004, -005)

These are pure relaxations: the same SQLSTATEs and result shapes.
1. `private.user_held_grant_on(p_child, p_day)`: drop the active-year clause (D2). Keep
   `p_day <= SAST today` and the interval overlap.
2. **Attendees.** New `private.can_record_session_attendee(p_session_id uuid, p_child_id uuid)`:
   SECURITY DEFINER, EXECUTE granted to authenticated. True when the parent session has
   `user_id = auth.uid()` AND (`current_user_can_write_for_child(child)` OR
   `user_held_grant_on(child, session_date)`).
   - Re-create **both** the attendee INSERT policy (WITH CHECK) and the UPDATE policy (USING and
     WITH CHECK) on it. Postgres checks the INSERT policy against the proposed row *before* conflict
     detection, so a replay is refused at INSERT first (S5 shows this even for insert-or-ignore).
     The merge upsert then also needs the UPDATE arm.
   - Drop `private.can_modify_session_attendee` once unused. Its effective definition is
     `20260521144901:578-592`, which calls `current_user_can_write_for_child`; the
     `20260521142324` version is superseded.
   - Leave the RESTRICTIVE held-group policies (`20261021140000`) unchanged.
3. **Programme as-of (D7).** New `private.user_held_programme_on(p_programme_id uuid, p_day date)`:
   SECURITY DEFINER, EXECUTE granted to authenticated. True when either:
   - `auth.uid()` has an **open** `staff_programme_assignments` row for the programme, with **no date
     bound**: exactly today's rule, so a fast-clock phone keeps landing (review finding 3); or
   - an ended row's interval covers the SAST day and `p_day <= SAST today`.

   Use it in place of "ended_at is null" in:
   - `sessions_insert_active_programme` (`session_date`);
   - `submit_assessment` (`assessment_date`);
   - `save_battery_run` (SAST date of `started_at`).
4. **`save_battery_run` class check:** a membership that overlaps the `started_at` SAST day, not the
   exact instant.
5. **Mastery (D1)** in `set_letter_mastery` and `set_skill_mastery`:
   - Accept a new correction when the caller delivers now OR held a direct `child_ea_assignments`
     interval overlapping the SAST day of `effective_at = least(p_changed_at, now())`.
   - Replay-first behaviour, (changed_at, correction_id) ordering and return shapes are unchanged.
   - Stamp `programme_id` with the caller's programme on that day, falling back to the open one.
   - Visibility follows the existing `changed_by` arm.

Phones holding terminal 42501 history rows re-send them on the next forced pass and land, with no app
release.

### S3: Delete child decided by the server, actor-scoped (MA-BUG-012, -001 part, -014 server part)

Rewrite `private.delete_child_if_no_history` (`20260712202409`). The public signature
`public.delete_child_if_no_history(uuid) → boolean` stays byte-identical, and there is **no hard-delete
branch**:
- A missing child → `true`.
- Otherwise lock the child row `FOR UPDATE`, then call `other_active_holder('children', id, caller,
  p_lock => true)`, which locks the child's classes and groups in the global order (see S1). Every
  decision below uses state read after those locks.
- If the caller neither holds the child now nor created it:
  - if the caller ever held a direct assignment, or the child is already archived → `true` with no
    change;
  - otherwise raise 42501, as today.
- Otherwise:
  - End the caller's active `child_ea_assignments` and their open memberships in groups the caller
    holds, at server `now()`.
  - If `private.other_active_holder('children', id, caller)` is false: also end open enrollments and
    class memberships, then archive the child (`archived_by_user_id = caller`,
    `archive_reason = 'removed_by_ea'`).
  - Return `true`. Never return NULL. Never touch other EAs' rows; this fixes the over-reach in
    `20260712202409`.
- `child_group_memberships.removal_reason` does not exist yet (CONTEXT.md:553 / ADR-0005). When it is
  added, this path must stamp it; ADR-0014 notes this.
- Existing `ARCHIVE_REQUIRED` terminal rows clear on the next forced pass, because 1.5.0 treats `true`
  as success.

### A1: ADR-0014 and standing docs (same branch)

- `docs/adr/0014-history-authorized-by-what-was-held-when-it-happened.md`: principles 1–6, decisions
  D1–D10, the accepted residuals, and a half-page table of what each Head Office script command closes
  and opens.
- **CONTEXT.md:** the mastery writer rule (D1); Delete child and Delete class semantics (D3, D4);
  "Held at the time" as a term; the interim exception to :497 (D9).
- **`documentation/rls-sync-contract-map.md`:**
  - global contract 6: ordering is an optimisation;
  - the forced-terminal contract (:212, :991, :1091-1093), updated in the O1 branch;
  - :1092 programme denial (D7);
  - remove the Head Office row_version-bump rule (:924-934);
  - Item 11: the group handover note;
  - the attendee, session, mastery and RPC rows;
  - `ARCHIVE_REQUIRED` retired.
- **DEPLOYMENT.md:** the "absorb, don't refuse" rule; fix the stale :113.
- **Also:** a LEARNING.md narrative and a build-log entry.

### R1: apply to staging and prove it on 1.5.0 phones (Jim's go-ahead required)

1. Run `npm run sqlite:staging:dry-run`, then `npm run sqlite:staging:push`; confirm
   `project_ref=segygjzpujphwvrubusm`.
2. Read back the staging catalog: re-run the preflight fingerprint diff, and re-run the staging probes.
3. **Two-phone gate on installed 1.5.0** (A03s + a second phone; default text size):
   - EA A records an offline lesson + tick → Delete child → Sync. The server holds the session, every
     attendee and the tick; Needs attention is empty.
   - E2: Delete child after a handover stops looping.
   - E5: EA B keeps a shared class after A's Delete class.
   - A class-path or other-programme co-held child is **not** expected to survive on embedded 1.5.0
     (B2); that is checked in G1.
4. **Heal only phones whose receipts show no refused archive/restore rows (B3).**
5. Log it in `documentation/build-log.md`.

### H1: Head Office script, runbook and daily check (MA-BUG-010, -017; supports all)

**Runbook** section in `documentation/ea-access-runbook.md`:
- End rows only through the script; never bump `row_version` on ends.
- Never DELETE children, classes, groups, auth users or `public.users`.
- Off-boarding: Send diagnostics → 0 waiting and every needs-attention row has a receipt →
  `ea:suspend` → hand over.
- Reopen = clear the end in place on the deterministic row.
- Child and class handover, in one transaction (review finding 6):
  1. take the locks in the global order (children → classes → groups);
  2. end the predecessor;
  3. if the successor's deterministic row **already exists** (a former holder), reopen it in place by
     clearing its end, keeping its immutable identity and start, and print the gap;
  4. otherwise insert the successor's deterministic row;
  5. read back both rows.
- A **group** handover inserts the successor's `group_ea_assignments` row with a fresh id, because
  id = f(group_id) and `ea_user_id` is immutable. The same lock-and-read-back steps apply.
- Tests: A→B→A child and class handovers, a group handover, and a retry after a lost response.
- No reopen for a phone with refused archive receipts until O1 (B3).

**`scripts/ho-lifecycle.cjs`**, in the `ea-access.cjs` pattern:
- dry run by default, `--apply`, exact email match, `--reason`, `--operator`;
- pinned to `segygjzpujphwvrubusm`, read-back after apply, Node 20;
- commands `handover`, `end-delivery`, `reopen`, run as postgres, with no new server functions.

**`scripts/lifecycle-invariants.sql`**, run daily in `/bug-sync`, read-only. It lists:
- archived children, classes or groups with active grants;
- live groups whose class is archived;
- unarchived children and classes with no active holder;
- unarchived delivery children with no open membership in a non-archived class;
- duplicate active (child_id, group_id) memberships;
- `upload_terminal` receipts by table and code;
- suspended EAs with backlog.

### O1: OTA, stuck items resolve and get an exit (MA-BUG-011, -018, -019, -020, -021)

JS only, under runtimeVersion 1.5.0: no local SQLite migration and no new op type.
1. **Forced passes** (Sync now, Retry, pull-to-refresh, sign-out):
   - mean "ignore backoff" for pending rows;
   - re-send terminal rows only for idempotent history (inserts, insert-or-ignore, merge-upsert
     inserts, history RPCs) and for children `hard_delete`;
   - never re-send terminal archive, restore or update rows (this ends the MV001 override, D6);
   - stop counting them as FK blockers.
2. **Leaving the phone: the exact-revision delivered-receipt rule** (review finding 1). A terminal
   outbox row R may leave the phone only when its `upload_terminal` incident row in
   `support_incident_queue` meets all of these:
   - (a) `status = 'sent'` and `has_unsent_changes = 0`;
   - (b) a **delivery proof** for that incident's current `report_generation` exists in
     `local_state` (key `delivered_receipt:<incident id>`), written by `markSent`. It is recorded from
     the **bounded `report_snapshot` that was actually accepted** in the same transaction, before
     `markSent` clears it. The proof holds `{ report_generation, outboxId, outboxUpdatedAt,
     wireDigest, cut }`, where `cut` is true if any `*Truncated` marker or `wirePayloadError` was
     present;
   - (c) the proof matches R: same outbox id, `outboxUpdatedAt` equal to R's current `updated_at`,
     `wireDigest` equal to the digest of `buildSyncPayload` of R's current row, and `cut = false`.

   A sent incident without a proof, such as one sent before the OTA, is re-sent once through the
   existing `promote` path, which produces a proof. Proof keys are deleted with their outbox row or
   incident.

   The check and the delete run in one SQLite transaction. If any condition fails, the row stays and
   the card says what to do. Typically: "Connect to the internet so the office gets a copy." For an
   oversized row: "Send diagnostics, then contact support."

   No new table or column is needed. Tests:
   - an oversized payload, truncated on send (no exit), including the round-2 case where the delivery
     metadata shrinks after the truncated send, so a re-bound would pass uncut;
   - a pre-OTA sent incident without a proof (re-sent once, then exit);
   - a second refused edit reusing an already-sent repeat key (no exit until re-sent);
   - a payload changed after send (no exit);
   - a happy path (exit, then gone).
   - Lifecycle and edit refusals then clear automatically, and the pull converges them.
   - History rows offer the EA the exit: "The office has a copy — remove from this phone"
     (`syncOutboxRepository.deleteRecord`). Before delivery the screen says "Connect to the internet
     so the office gets a copy."
3. **Needs attention:** fix the display names (`SyncStatusScreen.js:27-34`), and make the Home card
   dismissible once its items are cleared. Family grouping is deferred.
4. **Sign-out sheet:** separates "waiting to upload" from "needs attention".
5. **Hardening** (MA-BUG-021):
   - The claim (`markInFlightAndGet`) overwrites `terminal` with `in_flight`. It also bumps the domain
     `row_version` and flips the domain `sync_status`. A forced-in terminal row must therefore keep
     a record that it was terminal, so that a deferral or throw restores `terminal` rather than
     `pending`.
   - `markReadyMany` never demotes terminal rows.
   - The claim and `findBlockingDependency` move inside the per-row try.
   - A `processBatch` claim throw degrades without moving terminal rows to `failed`.
6. Lower `upload_backlog_stale` to 24 h for November.
7. Rewrite `rowVersionSend.test.js:365-391`, `offlineSyncOutbox.test.js:218-223` and the contract map
   rows in the same branch.

### O2: OTA, remove orphan-making UI; Delete child via the server (MA-BUG-013, -014, -015, -016)

1. Remove "No class" (`EditChildScreen.js` ~331-337).
2. **Delete child** always enqueues the existing children `hard_delete` op. Its 1.5.0 executor already
   calls the RPC and requires `true`.
   - Locally: a child with no local history is deleted as today, and a never-sent local insert is
     purged with no op.
   - A child with local history is archived locally, and **only this EA's own** relationship rows end
     locally, with no per-relationship archive rows.
   - **Do not** write ends into still-owed relationship INSERTs (review round 2, finding 2). Instead,
     extend the retained-insert gate in `findBlockingDependency` (`offlineSync.js` ~1548-1558; owned
     by this slice). The children `hard_delete` also waits while any still-owed INSERT exists for the
     child's own relationship rows: `child_ea_assignments`, `child_programme_enrollments`,
     `child_class_memberships` and `child_group_memberships` with this `child_id`. Those rows then
     land open, with the authority the rest of the family and the queued history need. The RPC then
     ends them server-side (actor-scoped). This answers review round 1 finding 5 (no open grant
     after an acknowledged removal) without stranding anything. History is never gated.
   - Test: an all-offline chain (create child → record a lesson, a tick, a class-scoped Battery Run
     and an assessment → Delete child → sync, including a failed first pass). Assert that all
     history and relationship evidence are delivered with no terminal rows, that the `hard_delete`
     ran last, and that no active grant or membership survives after the RPC's (faked) server ends.
     G1 replays this chain's wire requests into Postgres with the server batch.
   - Keep the pending-hard-delete pull filter.
   - Confirm copy: "Remove Thandi? Lessons and ticks you saved will still upload. If no other EA
     teaches Thandi, Thandi also leaves the class."
   - **Hard gate before real lessons (D10).**
3. `archiveClass` stops exiting delivery children's class memberships and nulling `class_id`. The
   copy says "Leave class" when the class is shared (D4).
4. Delete the `group_ea_assignments` restore producer (`groupsRepository.js` ~93-157, the
   `startupRepairs.js` caller, `groupEaAssignmentsRepository.js` ~117-135).
5. `removeChildFromGroup` merges or drops a still-owed membership insert (E4). The active unique
   index is on (`child_id`, `grouping_version_id`), so a move to a sibling group in the same version
   collides too. After that, seeds may carry `grouping_version_id`.

### G1: OTA gate, publish, per-phone uptake

1. The T1 chains are green on the O1/O2 code. Re-freeze the T1 disposition fixture for the OTA commit
   too, since two JS bundles will coexist. Replay O2's all-offline chain wire requests into Postgres
   with the server batch: no terminal rows, and no active grant after removal.
2. **Two-phone device gate:** A03s + iPhone, default text size.
   - The C1 chain on the OTA.
   - A class-path or other-programme co-held child survives the other EA's Delete child.
   - A sole holder's Delete child archives the child.
   - A shared class survives Delete class.
   - "No class" is gone.
   - A refused row shows the plain-words card, and the exit appears only after delivery.
   - A refused lifecycle row clears itself.
   - Sync now after a Head Office reopen does not re-archive.
3. Publish to preview (Jim's go-ahead). Confirm each pilot phone's `updateId` from its Send diagnostics
   receipt before it records real lessons, then lift that phone's interim EA rules.

### V1: field verification during the retest

- Daily `/bug-sync` sweep in week 1, then weekly. It covers `upload_terminal` by table and code,
  `upload_backlog_stale`, and the invariant query.
- A lifecycle MA-BUG record reaches `FIELD_VERIFIED` only after two weeks with no recurrence on phones
  whose receipts show the fixing `updateId`.

## Not doing (and why)

| Not doing | Why |
| --- | --- |
| Client push reorder, an outbox-wide history-first gate, drains, receipt binding | C5a/C5d show they don't hold across passes; Zazi's machinery. |
| A lifecycle command family or new outbox op type | Violates the sync_outbox CHECK and forces a local migration. |
| Fresh-id interval rows as a general rule | Breaks deterministic ids (except group handover). |
| A server cascade keyed on `archived_at`, or empty-class guards | — |
| New SQLSTATEs, unique indexes or a minimum-version gate | — |
| Stored late/flag columns, or a start clamp | — |
| Heal-all, phone resets, or automatic replay of receipts | — |
| Replacing the sync engine | — |
| Deleting `ARCHIVE_TABLE_DEPENDENCIES` or the hard_delete gate and pull filter | — |

Deferred items and their revival conditions go in `docs/deferred/` (step L1).

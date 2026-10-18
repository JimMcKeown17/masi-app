# Upload Contract — Design

**Date:** 2026-10-18
**Status:** Draft for Codex adversarial review
**Branch:** `docs/upload-contract-spec` (from `main` `7d545b6`)
**Roadmap:** priority item 5, §2 "Upload contract (before pilot)", and the §2 "Server-side ten-hour
clock-out" item. This spec closes Plan 3's Ruling 11 for every table in scope.
**Evidence:** `documentation/zazi-sync-lessons-for-masi-2026-10-08.md` (U1–U7, Part 2); the
2026-10-18 re-check of the 17 October draft against `main` (fact checks, three adversarial lenses
with a skeptic per finding, and a `check-solution` pass).

## Why

A phone upload can time out after 30 seconds while the server still applies it. Signing out
mid-upload aborts it the same way. Today the phone then retries blindly. An identical retry is
harmless. A late *older* write is not: Codex reproduced a closed time entry being reopened on the
server by a late open-entry write while the phone showed it synced (2026-10-08, round 2). The same
shape can undo any EA edit that is followed by a second edit of the same record.

Most of U1 is already built. Plan 2 put every server request through the signed-in EA's data client
with a 30-second deadline and a sign-out abort, so a hung upload no longer blocks the queue. What
remains is the case this spec owns: **an upload whose outcome is uncertain, overtaken by a newer
one.**

## Decisions locked with Jim

| Date | Decision |
|---|---|
| 2026-10-17 | Pilot scope: once records are loaded, only the owning EA edits them. EAs never co-edit the same children. Head Office will occasionally edit later, so nothing here may preclude it. |
| 2026-10-17 | Approach 1: a per-record version number, enforced on the server. Not "latest edit time wins", not per-edit receipts. |
| 2026-10-17 | The server closes shifts open for more than ten hours. Designed in this spec. |
| 2026-10-18 | Time entries use a forward-only shift rule instead of a version number. |
| 2026-10-18 | An honest clock-out at or before the ten-hour mark replaces the server's auto-close. Any clock-out after ten hours is recorded as the ten-hour auto-close. |
| 2026-10-18 | Letter-mastery ordering ("most recently made correction wins", D1) is built with the letter-mastery re-key in the assessment slice, and is a pilot gate. Not in this spec. |

## Scope

**In:**
1. A `row_version` rule on 11 server tables (§1).
2. The phone stamping `row_version` at send time, carrying it to the server, storing it on download,
   and handling a refusal (§2).
3. The server ten-hour clock-out and a forward-only rule for `time_entries` (§3).
4. Tests, device gates and rollout (§4).

**Out, with owners:**
- `sessions`, `session_attendees`: insert-only today (`sessionsRepository.js:223,244`;
  `updateSession` has no caller). Version them when saved-session editing ships, together with the
  removed-attendee fix (ROADMAP §2 "Removed session attendees").
- `assessments`, `assessment_items`: immutable after submit (ADR-0007); the all-or-nothing bundle and
  immutability belong to the assessment-history slice.
- `letter_mastery`: D1, with the mastery re-key (decision above). Until then Ruling 11 stays open for
  mastery toggles, and the contract map says so.
- Head Office editing EA records: the base-version branch in "Later" below.
- Stale-edit rejection between two writers (U3): not needed while each record has one writer. The
  "Later" section shows how it is added without rework.

## 1. Server: the version rule

### Tables

`row_version bigint not null default 1` is added to these 11 tables, each of which the phone updates
after creating it:

| Group | Tables |
|---|---|
| Roster | `children`, `classes`, `groups` |
| Assignments | `child_ea_assignments`, `class_ea_assignments`, `group_ea_assignments` |
| Memberships | `child_programme_enrollments`, `child_class_memberships`, `child_group_memberships` |
| Grouping | `grouping_versions`, `class_grouping_state` |

Existing rows take the default 1. There is no backfill.

### Rule

One shared function, `private.enforce_row_version()`, runs `BEFORE UPDATE` on each of the 11 tables
through a trigger named `<table>_enforce_row_version`:

- If `NEW.row_version < OLD.row_version`, raise SQLSTATE **`MV001`** with message `stale_version`.
  `MV001` is a new implementation-defined code (class `MV`, first character in I–Z). It must not be
  `23514`, which `classifyError` reads as an identity violation on the assignment tables
  (`offlineSync.js:536-548`), or any code in `DETERMINISTIC_ERROR_CODES` (`offlineSync.js:528`).
  PostgREST passes an unknown SQLSTATE through as `code`; the harness proves the phone sees `MV001`.
- Otherwise return `NEW` unchanged. Never return `NULL`: the phone acknowledges an update by the
  returned row id (`update(...).select('id')`), and an empty result is the terminal
  `UPDATE_NOT_APPLIED` / `ARCHIVE_NOT_APPLIED` / `RESTORE_NOT_APPLIED`
  (`offlineSync.js:553-567,777-791,806-822`).

**Ties are accepted.** An update that does not mention `row_version` keeps the stored value, so
`NEW = OLD` and it passes. That covers every writer that does not bump: FK `ON DELETE SET NULL`
actions, the off-outbox `exited_at` update in `reconcileChildClassMembership`
(`offlineSync.js:686-708`), Studio edits, and a build that predates this spec. None needs an
exemption. A higher version passes, which is the normal case.

**Coverage.** The rule applies wherever a write reaches the update path: update by id,
archive/restore, and single or batched upserts that conflict. In a batch, one refused row fails the
whole request, and the engine already falls back to per-record sends for that batch
(`processBatchFallback`, `offlineSync.js:1276-1365`), so the other rows still go.

**Not covered, deliberately:**
- The immutable assignment inserts are `ON CONFLICT DO NOTHING` (`offlineSync.js:318-322,834-836,851-853`).
  They never reach `BEFORE UPDATE` and cannot overwrite anything, so they need no fence.
- The children hard delete goes through `delete_child_if_no_history` (`offlineSync.js:743-760`). A
  late insert re-creating a hard-deleted child is an accepted risk (below).

### What this guarantees

For each of the 11 tables, the server applies one phone's writes to a record in the order the phone
**sent** them. A request that arrives after a later-sent request for the same record is refused. The
phone stopped waiting for that request when it timed out or the EA signed out, so the refusal goes
nowhere and changes nothing. That closes Ruling 11 for these tables.

Getting the send order right stays with the existing same-record rules (`findBlockingDependency`,
`offlineSync.js:1510-1540`): an owed insert goes before its own update or lifecycle change, and
lifecycle slots are collapsed. This spec does not change them.

## 2. Phone: the version goes up when the upload is sent

### Stamping point

The version is stamped in `updateInFlight` (`syncOutboxRepository.js:170-177`), the one statement
that both `markInFlight` (single sends, `offlineSync.js:1136`) and `markInFlightAndGet` (batches,
`offlineSync.js:1338`) run. In that same SQLite transaction, for each claimed outbox row whose table
is one of the 11 and whose operation is `insert`, `update`, `archive` or `restore`:

1. `update <table> set row_version = row_version + 1 where id = <record_id> returning row_version`;
2. write that value into the outbox payload as `row_version` (`json_set`).

`hard_delete` is skipped, and so is a row whose local record no longer exists.

**Why at send time, not when the change is queued:**
- One record can have more than one outbox slot (`syncOutboxRepository.js:33-35`), and the engine
  sends by push rank and creation time, not by version (`offlineSync.js:289-300,1065-1072`). Group
  reactivation, for example, queues the restore before the re-queued insert
  (`groupsRepository.js:139-146`). Versions stamped at queue time could therefore go out
  lower-after-higher and be refused with no other writer involved. Stamped at send time, they follow
  the real send order by construction.
- A retry after an uncertain outcome always carries a higher number than the attempt it replaces, so
  if the original lands late it is the one refused.
- The payload rewrite paths (`referenceDataRepository.retargetOutboxPayloadReferences`,
  `groupsRepository.writeOutboxPayload`) and coalescing stop mattering, because the version is
  written last, at claim.
- Skipped numbers (a send that never reached the server) are harmless: the rule only compares.
- `insertOutboxRecord` does not change.

**Only two places write `row_version` locally:** the stamping point and the download save. Local
edits never set it. A local-write upsert keeps the stored value on conflict, so a stale in-memory
object cannot move it backwards.

### Carrying it to the server (`offlineSync.js`)

- Add `row_version` to `SERVER_COLUMNS` for the 11 tables (`offlineSync.js:63-143`), so
  `buildSyncPayload` keeps it.
- Always include `row_version` in the archive/restore patch for those tables. Today the patch keeps
  only `ARCHIVE_SERVER_COLUMNS` (`offlineSync.js:336-348,768-775`), which would drop it.
- Never add `row_version` to `UPDATE_PATCH_EXCLUDED_COLUMNS`.

### Local schema

Migration 14 in `src/db/migrations.js` (today `CURRENT_SCHEMA_VERSION` is 13,
`migrations.js:696-721`) adds `row_version integer not null default 1` to the 11 local tables. The
local column lists that `sqliteRepositoryUtils` uses to drop unknown keys
(`sqliteRepositoryUtils.js:62-86,145-151`) gain `row_version` for those tables. A phone-created row
therefore uploads first at version 2.

### Downloads

- Pulls already `select('*')`, so a pulled row carries the server's `row_version`, and the download
  save stores it.
- **Pull guard.** `serverPullWouldClobberPendingLocal` (`domainRepositoryUtils.js:165-172`) keeps
  today's rule (skip a pulled row when the local row is `pending` or `failed`) and adds one: **when
  the local row is `synced`, skip a pulled row whose `row_version` is lower than the local row's.**
  A `terminal` local row is never protected this way, so it still converges to the server's copy.
  This fixes a real rollback. On
  reconnect a pull and an upload run interleaved (`OfflineContext.js:295-298`;
  `ChildrenContext.js:348,387-396`). A pull that read the server before the upload was acknowledged
  would otherwise overwrite the just-synced row with the older content and the older version, and
  the next edit would then be refused as stale.
- An equal or higher pulled version still overwrites a `synced` row, so an edit made in Studio (a
  tie) still reaches the phone. A `terminal` row is still overwritten, as today, so it converges.
- `grouping_versions` and `class_grouping_state` are never pulled. Their local version reflects only
  this phone's sends. See the reinstall risk below.

### Refusals

Add an explicit `classifyError` branch: `MV001` is **terminal**, not retried, and shows as
needs-attention with the reason "Server has a newer version of this record". Without the branch an
unknown code falls to the retriable default (`offlineSync.js:569-570`) and retries for ever.

In the pilot this should only happen when this phone's version is behind the server's, which only
the reinstall risk below can cause. A terminal refusal is never "marked synced": the pull then
brings the server's row down, because terminal rows are overwritable.

## 3. Server ten-hour clock-out

### The job

`private.close_overdue_time_entries()` closes every `time_entries` row with `sign_out_time is null`
and `sign_in_time < now() - interval '10 hours'`:

- `sign_out_time = sign_in_time + interval '10 hours'`;
- `auto_clocked_out = true`;
- `sign_out_lat`, `sign_out_lon` and `sign_out_location_status` left NULL, exactly as the phone's
  own close does (`TimeTrackingContext.js:50-61`), which keeps the location CHECKs satisfied
  (`20261015120000_time_entry_location_optional.sql:4-35`).

Running it twice changes nothing. `EXECUTE` is revoked from `public`, `anon`, `authenticated` and
`service_role`; it runs as the job owner.

**Schedule.** In the same migration, a guarded block schedules it every 15 minutes under the fixed
job name `masi_close_overdue_time_entries`, and only runs if `pg_cron` is available
(`pg_available_extensions`) and `current_database() = 'postgres'`. CI's plain PostgreSQL 17
(`.github/workflows/tests.yml:11-13`) and the disposable harnesses, which replay every migration
(`history-authorization-postgres-harness.cjs:820-829`; `upload-contract-postgres-harness.cjs:292-301`),
skip the block and call the function directly. Before the hosted apply, a read-only query confirms
`pg_cron` is available on `masi-app-sqlite` and shows which schema Supabase installs it in.

### Forward-only rule for time entries

A `BEFORE UPDATE` trigger on `public.time_entries`, `time_entries_forward_only`, applies when the
writer is the row's owner (`auth.uid() = OLD.user_id`). The job, `service_role` and later Head Office
tools pass through untouched. It never raises and always returns a row, so the phone's exact
acknowledgement still works. Only the `sign_out_*` and `auto_clocked_out` columns are affected:

| Stored row | Incoming write | Result |
|---|---|---|
| Open | Close at or before `sign_in + 10 h` | Applied as sent |
| Open | Close later than `sign_in + 10 h` | Stored as the ten-hour auto-close: `sign_in + 10 h`, `auto_clocked_out = true`, sign-out location NULL |
| Open | Still open (a retry of the clock-in) | No change |
| Closed by auto-close | Close at or before the stored auto time | The earlier, honest close replaces the auto-close |
| Closed by auto-close | Anything else, including "open" | Stored row kept |
| Closed manually | Anything else, including "open" | Stored row kept |

Effects:
- a late open-entry write can never reopen a shift, which is the original bug;
- the phone's own ten-hour close lands as an identical write;
- an offline 16:00 clock-out replaces the server's 17:00 auto-close;
- the job's result does not depend on whether it ran before or after the phone's write.

`time_entries` is in `UPDATE_BY_ID_TABLES` (`offlineSync.js:353`), so a close is an update by id with
exact acknowledgement. The open entry is created through the batched upsert, whose conflict path is
the same `BEFORE UPDATE`.

### Phone

- The phone keeps its own ten-hour close (`autoClockOut`, on load and on the 30-second watchdog,
  `TimeTrackingContext.js:50-145`), so the screen is right while offline.
- `handleSignOut` (`TimeTrackingContext.js:238-255`) today stamps `new Date()` with no cap. When ten
  hours have already passed it calls the auto-close instead, so a live phone never sends a close
  later than ten hours. The server rule covers a phone whose watchdog did not run.
- No download of time entries and no "adopt the server's row" path are needed. The forward-only rule
  never refuses, so the phone's own record and the server's agree.

## 4. Testing and rollout

### Reproduce first

Codex first writes the failing case: a closed time entry reopened by a late open-entry write
against the current migrations. It must fail before the fix and pass after.

### Disposable PostgreSQL (extend `scripts/upload-contract-postgres-harness.cjs`)

Version rule, on a representative table from each group:
- a lower version is refused with `MV001` on update by id, single upsert, batched upsert (one
  refused row fails the batch), archive and restore;
- a tie (no `row_version` in the write) is accepted and acknowledged as exactly one row;
- a higher version is applied;
- "S1 lands after S2": S2 at v3 applied, then S1 at v2 refused, and the row holds S2.

Writes that must not break:
- the insert-or-ignore assignment inserts;
- deleting a user or class whose FKs are `ON DELETE SET NULL`;
- the `child_class_memberships` exit update.

Time entries:
- every row of the forward-only table above;
- the job closes only overdue rows, and running it twice is harmless;
- `anon` and `authenticated` cannot execute the job.

The migration uses session-level `SET` / `RESET`, not `SET LOCAL`, because the Supabase CLI applies
migrations outside a transaction block.

### Phone (real SQLite and engine tests)

- The stamp happens at claim, for single and batched sends, and only for the 11 tables and the four
  operations.
- The outgoing request carries `row_version` for insert, batch upsert, update by id, archive and
  restore.
- Pull guard: acknowledge v5, then persist a pulled v4, and the row stays at v5 and the next send
  carries v6. A pulled v6 does overwrite. A `terminal` local row at v7 is overwritten by a pulled v4.
- `MV001` is classified terminal.
- A manual clock-out after ten hours is recorded as the ten-hour auto-close.
- Migration 14 adds the column to all 11 tables with default 1.

### Device (Galaxy A03s)

- **D3, rewritten.** Clock in, choose "Stay clocked in and sign out", and leave the phone off. Within
  15 minutes after the ten hours the server row is closed at `sign_in + 10 h` with
  `auto_clocked_out = true` (read-only query through the `sqlite-staging-sql` helper). When the EA
  signs back in, the phone's own close runs, its upload is accepted with no needs-attention, and the
  server row is unchanged.
- **D2.** Sign out during an upload of an edited child, then sign back in. The server holds the
  newest edit and nothing needs attention.

### Rollout order

1. Drain the queues on the test phones still on builds 13 and 14, or reinstall them.
2. Apply the one server migration to `masi-app-sqlite` only, with Jim's explicit yes at the time.
   The server goes first: a new build against an unmigrated server would get `PGRST204` for the
   unknown column.
3. Install the new build.

A build from before this spec keeps working against the migrated server, because it sends no
version and ties are accepted.

### Documentation in the same branch

- `documentation/rls-sync-contract-map.md`: the 11 versioned tables, the stamping point, the pull
  guard, `MV001`, the time-entry rule and the job; re-point the letter-mastery ordering limitation
  (line 310) to D1 in the mastery re-key.
- `documentation/ROADMAP.md`: U1, Ruling 11, the server clock-out and D3.
- `documentation/build-log.md`: verification rows.

## Accepted risks

- **`class_grouping_state` after a reinstall.** The row has a fixed id and is never pulled, so a
  reinstalled phone's version starts behind the server's and its next regroup is refused with a
  needs-attention card. Each forced Sync Now resends one number higher, so it clears after a few
  taps. Revive when a grouping pull lands, or if a pilot reinstall happens.
- **A late insert re-creating a hard-deleted child.** Revive if Head Office deletes children.
- **`groups` archive is ranked ahead of `groups` update** (`offlineSync.js:289-292` vs `:155`).
  Latent: `updateGroup` has no screen caller. Noted in the contract map. Revive if a group-rename
  screen ships.

## Later (not built now)

- **Head Office edits of EA records.** A version only the phone counts up cannot detect a second
  writer. Before Head Office edits EA records: the phone sends the server version it last downloaded
  as a base, the trigger gains one branch (refuse when the base is behind the stored version), and
  Head Office writes bump `row_version`. This is additive to the column and trigger built here.
  Revive when Head Office editing is scheduled.
- **Server-stamped `updated_at` on insert for every table.** Nothing in this spec reads it. Revive
  with delta pulls (ROADMAP §3).
- **Versioning sessions and attendees.** Revive with saved-session editing.

## Rejected

- **Comparing content on an equal version.** Unnecessary once versions are stamped at send time, and
  a "no change" branch that returned NULL would have turned harmless replays into terminal cards.
- **A rule that waits for every lower-version slot.** Unnecessary with send-time stamps, and it
  would deadlock against the owed-insert rule.
- **A cap on version jumps.** Send-time versions skip numbers legitimately.
- **Exemptions by trigger depth or role.** Ties are accepted, so none is needed.
- **A pull/sync mutex.** The version check in the pull guard removes the cause.
- **Backfilling old outbox payloads in migration 14.** Drain the test phones instead.
- **Zazi-style per-install generations and mutation receipts** (U4, U7). Masi's risk is one phone's
  late write, which the send-time version closes in far less code.

## Existing drift noticed, out of scope

- Archive payloads drop `archived_by_user_id` and `archive_reason` (`groupsRepository.js:436-447`).
- The finalize check works at millisecond resolution (`offlineSync.js:894-904`).
- RLS still lets EAs update assessments; this belongs to the ADR-0007 slice.

## Review log

| Round | Reviewer | Result |
|---|---|---|
| 0 | Re-check of the 2026-10-17 draft against `main` `7d545b6` (fact checks, three adversarial lenses with a skeptic per finding, `check-solution`) | Rewrote the draft: send-time stamping; sessions/attendees and time entries out of versioning; a forward-only time-entry rule; the pull guard; terminal `MV001`; the guarded `pg_cron` block. Jim approved the three resulting decisions on 2026-10-18. |

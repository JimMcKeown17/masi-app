---
status: accepted
date: 2026-11-05
---

# History is authorized by what was held when it happened

## Context

Zazi iZandi's hardest stuck-work bugs came from archives, handovers and removals. The server judged
each upload by the EA's access **at upload time**, so a phone that recorded a lesson offline and then
removed the child, or that Head Office moved while it was offline, got permanent refusals. Zazi
answered with waiting: finish uploading before access ends, hold uploads behind their parents, bind
archives to the uploads before them. Each wait needed an exit, each exit needed recovery rules, and
some states cleared only with a phone reset.

Masi had the same root cause in a smaller form. We reproduced it on 2026-11-04, in disposable
PostgreSQL 17 and through the production sync engine on real SQLite (MA-BUG-20261104-001 to -021).
For example, Delete child after an offline lesson uploaded the session with no attendees and lost
the tick. Reordering uploads on the phone did not hold across backoff passes. The fix belongs on the
server, and installed 1.5.0 phones must benefit from it without an app update.

Plan: [`2026-11-04-lifecycle-safety.md`](../superpowers/plans/2026-11-04-lifecycle-safety.md).

## Decision

1. **History is authorized by what was held when the work happened.** Attendance, sessions, Battery
   Runs, assessments and letter/skill ticks are accepted when the EA held the child and the programme
   on the work's SAST day, and that day is not later than the server's today. A tick needs a direct
   delivery assignment on that day. The academic year is a reporting label, not a permission.
   Lateness is derived from server `created_at`; it is never stored as a flag.
2. **Upload order is only an optimisation.** Masi never makes one write wait on another for
   authority. There is no drain before an access change, no outbox-wide history gate, and no binding
   between an archive and the uploads before it. The unit of ordering is a record and its exact
   foreign-key family. Masi never authorizes a write by "any" or "all" current members of a group.
3. **Ends are written once.** An EA write may set an assignment, enrollment or membership end, or an
   entity archive, once. The server bounds it to `[start, now()]` and never lets an EA clear or move
   it. Only Head Office reopens, through the operator script, which runs as a privileged role. `archived_at`
   is a label: write authority comes from intervals, never from `archived_at`.
4. **The server decides archive-versus-archive conflicts.** An EA's Delete child or Delete class means
   "leave" while someone else still holds the child or class. Someone holds a class when they teach
   it or hold one of its children, directly or through a group of the class. Only the last holder archives for
   everyone, and for a class only if they created it. One shared definer predicate answers "does
   anyone else hold this?" for both the guard trigger and the Delete child function. The phone never
   decides a global effect from its partial copy.
5. **Nothing holding history or authority evidence is hard-deleted or cascade-wiped.** EAs hold no
   DELETE rights. History foreign keys are `ON DELETE RESTRICT`. Off-boarding is suspension, never
   deletion.
6. **Absorb, don't refuse.** A migration reaches every installed app version at once. A server change
   may relax a rule, or turn a refusal into a result the oldest supported client already
   acknowledges: a one-row archive ack, `true` from `delete_child_if_no_history`, or an RPC literal
   its parsers accept. It never adds a SQLSTATE, a refusal or a unique constraint for a shipped wire
   shape. A CI harness replays the 1.5.0 client's wire shapes through that client's own error
   classifier.
7. **EA-callable SECURITY DEFINER functions that write lifecycle columns encode rules 3 and 4
   themselves**, because the guard trigger exempts definer roles.
8. **Deterministic ids stay the identity of assignments and memberships.** A reopen clears the end in
   place. The one exception is a group handover: the successor's `group_ea_assignments` row gets a fresh
   id, because the id is derived from the group and `ea_user_id` is immutable.
9. **Every non-success has one exit, and nothing leaves a phone before the office holds its copy.**
   Refused lifecycle and edit rows resolve to server truth. Refused history stays replayable, so a
   server fix heals it on the next Sync now. An EA may remove a refused row only after its
   `upload_terminal` receipt is delivered.

## Consequences

- Removing a child, a handover, a programme switch and a year rollover no longer invalidate queued
  work, so most of Zazi's lifecycle machinery has no reason to exist in Masi.
- A stale or redundant archive from an old phone gets a one-row success that changed nothing. The phone
  converges at its next download. We accept this silent success for 1.5.0.
- Held-at-time authority trusts phone-stamped work dates inside intervals the EA really held. A raw
  client could backdate inside such a window. This is bounded by the server's today and auditable
  from `created_at`.
- **Starts are written once as well.** An EA UPDATE keeps an interval's start, so moving a start
  can neither move a kept end nor shrink an interval another EA's late history relies on
  (independent review, 2026-11-05). Assignment starts were already immutable; enrolment and
  membership starts now are too, for EA writes. The write is still a one-row acknowledgement.
- An entity archive that reaches the server after its own assignment end degrades to "leave" with no
  holder. The daily invariant check lists unheld live children and classes.
- A former deliverer's late tick can fill a letter the successor never touched. The
  `(changed_at, correction_id)` order still lets the successor's newer correction win. The former
  deliverer becomes `changed_by` and can read that row again.
- `child_group_memberships.removal_reason` does not exist yet (ADR-0005). When it is added, the
  server's Delete child path must stamp it.
- Head Office no longer bumps `row_version` on lifecycle ends; the guard protects them instead.
  A bump still turns the phone's stale archive into a terminal `MV001`, because the row-version
  trigger fires before the guard; that is today's behaviour, not a new refusal.
- On embedded 1.5.0, an exit the existing UPDATE policies hide from the EA still returns 0 rows
  (`ARCHIVE_NOT_APPLIED`): a class-only or group-only membership exit after Head Office removed
  that path, or after the EA's class or group assignment ended. RLS filters the row before the
  guard runs. We add no "former holder" UPDATE arm; the O1 OTA clears these rows under the
  delivered-receipt rule.
- A Head Office reopen while a phone still holds a queued archive lets that archive apply again
  when the phone is the sole holder. Head Office therefore reopens nothing for a phone whose
  receipts show refused archive or restore rows until it runs O1.
- Because a 1.5.0 `group_ea_assignments` restore is now absorbed (D5), a membership insert that phone
  sends next, for a group whose assignment Head Office ended with no successor, goes from synced
  to a terminal `42501`. We accept it under D5: O1's exit releases the row once its receipt is
  delivered, and the Head Office script has no group-end-without-successor command. The
  compatibility harness lists it as its one documented exception.
- Delete child locks the child row (`FOR UPDATE`) and then the child's classes and groups. A
  concurrent attendee insert for the same child takes the child row's key-share lock for its
  foreign key after the group's, so the two can deadlock (`40P01`). 1.5.0 retries unknown codes,
  so this is a transient retry, not a refusal; we keep `FOR UPDATE` rather than weaken the lock.
- A support receipt and an access event reference the auth user with `ON DELETE RESTRICT`, so an
  account that reported a problem cannot be deleted by deleting its auth user. Off-boarding is
  suspension.
- A future feature that adds a lifecycle write must add its cases to the lifecycle compatibility
  harness.

### Field decisions (Jim, 2026-11-04)

| # | Decision |
| --- | --- |
| D1 | A tick counts when the EA held a direct delivery assignment on the tick's SAST day (time clamped to server now); it is stamped with the programme held that day. |
| D2 | The academic year is not part of held-at-time authority; `day <= SAST today` and the interval overlap remain. |
| D3 | Delete child while someone else holds the child means leave; only the last holder archives. |
| D4 | An EA archives a class for everyone only if they created it and are its only holder. |
| D5 | EAs never un-end or restore; only Head Office reopens, through the script. |
| D6 | A refused stale edit is kept in its delivered receipt and the server wins (the O1 OTA). |
| D7 | After a programme switch, work dated inside the old programme assignment lands, stamped with that programme. |
| D8 | EAs get an exit from Needs attention only after the row's receipt is delivered. |
| D9 | Head Office lifecycle work goes through a dry-run script (handover, end-delivery, reopen); off-boarding is suspend-only. |
| D10 | Before EAs record real lessons: the server batch is applied and verified, and the O1/O2 app update is on every pilot phone. |

### Where it lives

- Server batch: `supabase/migrations/20261105120000_remove_destructive_capabilities.sql` (rule 5),
  `20261105120100_lifecycle_end_guard.sql` (rules 3, 4; `private.guard_lifecycle_row`,
  `private.other_active_holder`), `20261105120200_held_at_time_history_authority.sql` (rule 1),
  `20261105120300_child_removal_actor_scoped.sql` (rules 4, 7).
- Gate (rule 6): `npm run verify:lifecycle-compat:postgres`
  (`scripts/lifecycle-compat-postgres-harness.cjs`), judged by
  `scripts/fixtures/lifecycle-compat/dispositions-1.5.0.json`, which is generated from the 1.5.0
  client's own classifier and acknowledgement rules.
- Contract: `documentation/rls-sync-contract-map.md`, "Lifecycle safety".

### What each Head Office script command closes and opens

| Command | Closes (sets end at server now) | Opens (inserts or clears end) |
| --- | --- | --- |
| `handover` (child) | Old EA's `child_ea_assignments` | Successor's deterministic `child_ea_assignments` row (insert, or clear its end) |
| `handover` (class) | Old EA's `class_ea_assignments`; their delivery rows for the class's children when the successor delivers | Successor's deterministic class and delivery rows |
| `handover` (group) | Old EA's `group_ea_assignments` | Successor's `group_ea_assignments` with a **fresh id** |
| `end-delivery` | The EA's `child_ea_assignments` for the named children | — |
| `reopen` | — | Clears the end in place on the EA's deterministic row and prints the gap |

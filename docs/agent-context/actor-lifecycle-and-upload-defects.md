# Briefing: actor lifecycle and three confirmed upload defects

**Written 2026-10-10** for whichever session next runs CAP-004 device testing or touches uploads,
sign-out, or account switching. The three defects below are confirmed in source and **not fixed**.
The fix is designed but not built:
[`docs/superpowers/specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md`](../superpowers/specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md)
(walked through with Jim; four Codex adversarial review rounds; Jim's simplifications in §11). Spec
section numbers below refer to that file.

## What you will see in device testing

### 1. Edits to Head Office-created records never upload, and Sync Status says "all synced"

- **Most common trigger:** submitting a Literacy session that changes a child's reading level.
  The submit updates the child row (`src/services/literacySessionPersistence.js:54-68`). Editing a
  child (Edit Child screen) or a class (Edit Class screen) triggers it too.
- **Phone half:** the outbox owner is derived from the record's `created_by`
  (`src/db/repositories/outboxOwnership.js`), so a Head Office-created child's edit is owned by Head
  Office. The owner-scoped upload query never selects it, and `getSyncStatus` filters it out of the
  counts (`src/db/repositories/syncOutboxRepository.js:281-283`). The phone shows nothing pending.
- **Server half:** even with the right owner, every edit is sent as an upsert
  (`src/services/offlineSync.js:704-728`), and PostgreSQL checks the INSERT policy
  (`created_by = auth.uid()`) on every upsert row, including rows that already exist. The server
  would refuse the edit with `42501`.
- **How to confirm:** after the edit, query the server row (through the `sqlite-staging-sql` skill)
  and compare `reading_level` or the edited field. Do not rely on the Sync Status screen.
- **Fix (designed):** owner stamped from the signed-in EA (§6.1), and edits sent as UPDATE by id
  with an exact acknowledgement (§6.5).

### 2. A queued upload can run under the next EA's sign-in

The session is checked when a request is queued, not when it is sent
(`src/services/offlineSync.js:976`), and the request queue is shared across the whole process
(`src/services/supabaseRequestQueue.js`). Sign out as EA A with uploads queued, then sign in as
EA B: A's queued request can go out with B's token. **Fix (designed):** one SQLite file per EA, a
per-EA data client fenced at every request, and a per-EA queue (§4, §5).

### 3. Reactivating a group assignment silently does nothing on the server

`src/db/repositories/groupsRepository.js:111-129` reactivates an archived `group_ea_assignments`
row by enqueuing `insert`, which is sent with `ignoreDuplicates`. The server keeps the row archived
while the phone records success. **Fix (designed):** send it as a lifecycle update with an exact
acknowledgement (§6.5b).

## Rules for now

- **Do not patch these ad hoc** on `feat/cap-004-session-history-hydration` or elsewhere. The
  owner, upsert, and fencing fixes interlock, and the spec's first task is a server proof (S1) in
  the migration-replay harness before any app code changes.
- In device testing, a missing edit to a Head Office-created child or class is **this known
  defect**, not a CAP-004 history problem. Record it in the build log as reproduced, with the
  record id and build, and move on.
- Avoid switching accounts on a test phone that has unsent work until the fix lands, unless the
  test is specifically reproducing defect 2.

## Where things stand

- Spec and review history: the file linked above. Build-log rows dated 2026-10-09 (Verification,
  Decision, and Bug And Gap registers).
- Branch: `docs/zazi-foundations-review-20261008` (pushed 2026-10-10; no PR yet). It must be
  rebased onto PR #60 before merging; resolve `documentation/build-log.md` by keeping both sides'
  rows in commit order.
- Next steps: Jim reviews the spec, then an implementation plan is written (`writing-plans`), then
  Codex builds it test-first, starting with S1.
- Deferred by Jim on 2026-10-09: deleting other EAs' files (revisit before Step 9 Widen, for
  privacy on staff-owned phones) and the sign-out drain (removed; sign-out aborts immediately and
  idempotent uploads re-send).

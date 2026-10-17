---
status: accepted
date: 2026-10-17
---

# One local database per EA, reached only through the signed-in EA handle

Staff use their own phones, and two EAs can sign in on the same phone in one day. Until now the app
kept one shared SQLite file, `masi.db`, plus one shared Supabase client and request queue. Two live
defects followed from that sharing: an EA's edit of a Head Office-created row was queued under the
row's creator and never uploaded (the outbox owner was derived from `created_by`), and an upload
queued by one EA could run on the shared client after a different EA had signed in.

Jim decided on 2026-10-08 that each EA gets their own file, `masi-<userId>.db`, and on 2026-10-09
chose Approach A: one **signed-in EA handle** owns that file, an epoch fence, a per-handle data
client and request queue, and the outbox owner. Production code reaches SQLite and the server only
through a handle; there is no ambient database. Isolation becomes structural, so a future timer,
provider or pull inherits it instead of having to remember it.

## Considered options

- **B: switch the filename and add edge checks**, passing `actorUserId` at about 45 call sites.
  Smallest change, but isolation stays the job of every future author, and one missed check leaks
  one EA's data into another's file or account.
- **C: port Zazi iZandi's installation coordinator.** Built for migrating legacy installs that Masi
  does not have; Masi is pre-live with no field data on the SQLite backend.
- **A: one signed-in EA handle** (chosen).

## Decision

- **Storage.** Each EA's domain tables, `sync_outbox`, `sync_state`, `local_state` and their copy of
  reference data live in `masi-<userId>.db`. AsyncStorage keeps only device-level state: the
  Supabase auth session, `deviceSettings` (including capture mode, `masi:device:captureMode`), and
  app logs. The file records its owner (`local_state.file_owner_user_id`) and refuses to open for
  anyone else. The shared legacy `masi.db` is never opened as an EA's file, renamed or uploaded from.
- **Revocation before disposal.** Sign-out revokes the handle at once: its epoch advances, new work
  is refused with `StaleActorError`, outstanding requests abort, and the login screen can render.
  Physical disposal happens afterwards on each connection's serial native queue (tolerant
  `ROLLBACK`, best-effort `last_active_at`, both closes attempted). Only a reopen of the same file
  waits for that disposal; another EA's sign-in never does.
- **Fencing.** Every server request goes through the handle's data client, which re-checks the
  handle, the queued task and the session at send time. Each consumer is bound to its handle through
  `useSignedInEA()`; the signed-in tree remounts by `userId:epoch`. Static tests forbid ambient
  database access, shared-client data calls and unlisted module-level state.
- **Ownership.** The outbox owner is the signed-in EA, stamped from the connection's actor at one
  choke point; a local trigger refuses an ownerless row. An integrity scan at open and before every
  pass quarantines rows stamped with another EA (`foreign_owner`) and adopts legacy ownerless rows
  for the file owner.
- **Deletion is deferred.** No code deletes another EA's file. The rule decided on 2026-10-08 still
  applies when it is built: delete another EA's file, with its `-wal` and `-shm` companions, only
  when it has nothing unsent and has been idle for more than 30 days, and never the signed-in EA's
  file or a file that cannot be read. `last_active_at` is written at every sign-out so the rule has
  its input from day one.

## Consequences

- When two EAs share a phone, each one's first sign-in downloads their own reference data and
  history. CAP-004's faster history download keeps this acceptable.
- Another EA's roster, including children's names, stays on a shared phone until deletion is built.
  The app never shows it, but it is on the disk. **Revisit before next-steps Step 9 (Widen), or
  sooner if storage becomes a concern**, against POPIA's principle of not keeping personal
  information longer than necessary.
- Native close under load (device check D7) and the sign-out questions, left-behind report and
  incident envelope (Plan 3) are not covered by this decision's implementation and remain gates.
- **Field-release prerequisite (ruling 11):** abort-on-sign-out means an upload the server accepted
  just before sign-out can be re-sent when the EA returns. Identical replay is proven harmless; the
  ordering of an uncertain older write against a newer one is owned by the upload-contract spec and
  must be closed before field release.
- The contract lives in `documentation/rls-sync-contract-map.md` ("Signed-in EA handle"); the spec is
  `docs/superpowers/specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md`.

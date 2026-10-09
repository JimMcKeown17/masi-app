# Design Spec: Actor Lifecycle and Mutation Ownership

**Status:** design walked through with Jim section by section on 2026-10-09 (brainstorming); every
section approved. Awaiting Jim's review of this written spec, then a Codex adversarial review, then
an implementation plan. Companion decision record: an ADR for one database per EA, to be created
through `grill-with-docs`.

**Owner of build:** Codex, through the plugin, task by task from the implementation plan that
follows this spec. Claude specifies, reviews the diff and tests, and verifies.

**Inputs:** [`documentation/zazi-sync-lessons-for-masi-2026-10-08.md`](../../../documentation/zazi-sync-lessons-for-masi-2026-10-08.md)
(Part 2, decision D2, and the "Codex round 2" section that found both live defects);
`documentation/ROADMAP.md` priority 5.

## 1. Problem

Masi keeps every EA's domain data, outbox, and sync cursors in one SQLite file (`masi.db`), opened
once at app start before anyone is signed in. EAs bring their own phones, and two EAs sharing one
phone for a day or two is common. Two confirmed defects follow from today's design:

1. **Live defect 1, wrong outbox owner.** `enqueueDomainOutbox`
   (`src/db/repositories/domainRepositoryUtils.js:105`) derives `owner_user_id` from the record's
   content through `OWNER_RESOLVERS` (`src/db/repositories/outboxOwnership.js`), for example
   `children: directOwner('created_by')`. An EA's edit to a child that Head Office created is owned
   by Head Office, so the owner-scoped upload query never picks it up and the edit never reaches the
   server. About 45 call sites rely on this resolution. The auth-restore heal
   (`requeueTerminalRlsFailures`, `src/services/offlineSync.js:1563`) asks the same wrong question
   and skips such rows as "owner mismatch".
2. **Live defect 2, upload under the next EA's session.** The sync engine checks the session when it
   queues a server request (`getMatchingPassSession`, `src/services/offlineSync.js:976`), not when
   the queued task runs (`src/services/supabaseRequestQueue.js` is a bare serial promise chain). A
   task queued under EA A can execute on the shared Supabase client after EA B has signed in.

There is also a structural gap: `OfflineProvider` sits above `AuthProvider` (`App.js:128-140`), so
the sync engine starts, repairs, and reads the outbox before any actor is known.

## 2. Decisions locked with Jim

| Decision | Choice | Date |
|---|---|---|
| Local storage | One SQLite file per EA, `masi-<userId>.db`. Another EA's file is deleted only when it has nothing unsent **and** has been idle for 30 days | 2026-10-08 |
| Letter-mastery conflicts (input to the upload-contract spec, recorded here for completeness) | The most recently *made* correction wins | 2026-10-08 |
| Removing an EA's data | Automatic only (the 30-day rule); no manual removal screen | 2026-10-09 |
| Unsent work at sign-out | Warn, allow, track: a warning with "Try uploading now" or "Sign out anyway", plus a privacy-safe support report while the work stays unsent | 2026-10-09 |
| Still clocked in at sign-out | Ask: "Clock out now" or "Stay clocked in and sign out" | 2026-10-09 |
| Architecture | Approach A: one signed-in EA handle that owns the file, an epoch fence, and the outbox owner | 2026-10-09 |

Rejected approaches: B (filename switch plus edge checks and passing `actorUserId` at about 45 call
sites; leaves isolation to each future author) and C (a full port of Zazi's installation
coordinator; built for a problem Masi does not have, because Masi is pre-live with no legacy data).

## 3. Domain language

- **Signed-in EA handle**: the single object that represents "who is working on this phone right
  now". It holds `{ userId, epoch, db }` and is the only way production code reaches a domain
  database.
- **Epoch**: a number the handle advances at every sign-out. Work stamped with an older epoch is
  stale and is refused.
- **Stale work**: any task, request, transaction, or timer that began under an earlier epoch.
- **Unsent**: an outbox row whose status is `pending`, `failed`, `in_flight`, or `terminal`.
  `terminal` counts because the server does not have that work.
- **Left-behind work**: unsent rows in an EA's file while a different EA is signed in on the phone.
- **Mutation owner**: the EA who made the change. Never derived from the record's content.

`CONTEXT.md` gains "Signed-in EA handle", "Unsent", and "Left-behind work" in the same branch.

## 4. Storage lifecycle

### 4.1 What lives where

| Store | Scope | Contents |
|---|---|---|
| `masi-<userId>.db` | per EA | All domain tables, `sync_outbox`, `sync_state`, `local_state`, and that EA's copy of reference data |
| AsyncStorage | device | Supabase auth session, `deviceSettings`, app logs, the per-install id (§7.4) |
| Nothing open | signed out | No domain database is open; the login screen reads none |

### 4.2 Opening

- `DatabaseBootstrapGate` stops calling `initializeDatabase()`. It becomes a check that the SQLite
  engine loads.
- A new module, the signed-in EA handle, opens `masi-<userId>.db` after a fresh sign-in succeeds or
  when a persisted session is restored (`restoreOfflineSession`, `src/context/AuthContext.js:46`;
  works offline). It runs migrations on the writer, opens the `query_only` reader, applies the
  existing PRAGMAs (WAL, `busy_timeout`, foreign keys), and only then publishes the handle.
- `src/db/client.js` loses its module-level writer, reader, and `databaseQueue`. Each handle owns
  its own pair of connections and its own serial write queue. `withTransaction` and `getDatabase`
  become methods reached through the current handle.
- `withTransaction` keeps its existing non-re-entrant contract and its ROLLBACK-failure disposal.

### 4.3 Closing

At sign-out, after the questions in §7.1, the handle:

1. Advances the epoch, so new work is refused.
2. Waits up to the drain bound (§5.3) for in-flight work.
3. Writes `last_active_at` into the file's `local_state`.
4. Closes both connections.

The file stays on the phone.

### 4.4 Discovering files

There is no separate registry. At each sign-in the handle lists the SQLite directory for
`masi-*.db` and, for each file belonging to another EA, opens it read-only to read its unsent count
and `last_active_at`. The file system is the only source of truth, so there is nothing to drift.

### 4.5 Adopting the existing `masi.db`

Only test phones carry one (Masi is pre-live). On the first launch of this build:

- If a persisted session exists and no `masi-<thatUserId>.db` exists, rename `masi.db` and its
  `-wal`/`-shm` companions to `masi-<thatUserId>.db`. Outbox rows with a null owner are assigned to
  that EA. Rows owned by another EA are left as they are; the §6.3 tripwire surfaces them.
- Otherwise leave `masi.db` in place. It follows the §7.3 rule (deleted only with nothing unsent and
  30 days idle).

There is no other legacy path.

### 4.6 Accepted cost

When two EAs share a phone, each one's first sign-in downloads their own reference data and
history. CAP-004's faster history download is what keeps this acceptable.

## 5. Fencing

### 5.1 Remount the signed-in tree by key

`OfflineProvider`, `TimeTrackingProvider`, `LookupsProvider`, `ChildrenProvider`,
`ClassesProvider`, and `MainNavigator` move inside one wrapper rendered only when a handle exists:

```jsx
<AuthProvider>
  {handle
    ? <SignedInEA key={`${handle.userId}:${handle.epoch}`} handle={handle}> …providers… </SignedInEA>
    : <AuthNavigator />}
</AuthProvider>
```

A change of key unmounts every provider, ref, interval, and listener from the previous EA.
`LoginScreen` and `AuthContext` do not use `useOffline` (checked 2026-10-09), so the signed-out
branch needs no database. `AuthContext`'s post-sign-in work (`loadUserProfile` and
`pullReferenceData`, `AuthContext.js:161-166`) moves inside the signed-in tree so it runs only after
the file is open. While the handle opens, the signed-in tree shows "loading", never an empty state.

`OfflineContext`'s hand-maintained `currentUserIdRef` guard is removed once the handle supplies the
actor.

### 5.2 Check the actor at the doors

Remounting does not cancel promises that are already running. Every unit of work therefore captures
`{ userId, epoch }` from the handle when it starts. That actor is checked again at three doors.

Each handle also has a state: `open`, `draining` (from sign-out until the §5.3 drain ends), or
`closed`. When the network door lets a request through, it issues a **finalize token** bound to that
handle and that request. The token is the only thing that admits a transaction while the handle is
draining.

| Door | Location | Check | If stale |
|---|---|---|---|
| Network | the queued task inside the Supabase request queue, immediately before the request is sent | the handle is `open`, the epoch is current, **and** the Supabase client's in-memory session user equals the actor's `userId` | throw `StaleActorError`; send nothing |
| Transaction admission | `runRepositoryTransaction` / handle `withTransaction` | the handle is `open` with the current epoch, **or** it is `draining` and the transaction carries a finalize token for a request already sent | throw `StaleActorError` |
| Commit | immediately before `COMMIT` | the same rule, re-checked | `ROLLBACK`, throw `StaleActorError` |

The network door is the direct fix for live defect 2. With one file per EA, a stale write can only
reach its own EA's file, so the two transaction doors are a second layer of protection.
`StaleActorError` is logged once and is never retried or treated as a sync failure.

The Supabase session user is read from a value the handle keeps current from
`onAuthStateChange`. The door does not call `getSession()`, because a second auth-lock contender
causes Android startup contention (`AuthContext.js:61-63`).

### 5.3 Sign-out drain

When the epoch advances, the handle becomes `draining`. Requests already sent (past the network
door) get up to a **drain bound of 10 seconds** to return and record their result in their own EA's
file, using their finalize tokens. No other work is admitted. When the drain ends, the handle becomes
`closed` and its connections close. Anything unfinished at the
bound stays unsent in that EA's file. It uploads again the next time that EA signs in, and that is
safe today because uploads are upserts by deterministic id.

The 10 s value is provisional and is set by device measurement D4 (§9.3).

**Dependency on the upload-contract spec:** once that spec adds base-version checks, a re-sent
mutation the server already applied must be recognised as already applied, not treated as a
conflict. The upload-contract spec must state how its uncertain-outcome recovery covers mutations
left by a sign-out drain.

### 5.4 Rejected: one Supabase client per EA

This would make session mix-ups impossible by construction, but Supabase's auth storage and refresh
lock assume a single client, and Masi already sees Android lock contention with one. The epoch
check gives nearly all of the benefit.

## 6. Mutation ownership

### 6.1 Owner equals the actor, stamped at one choke point

`enqueueDomainOutbox` takes the owner from the transaction's handle actor. The
`{ ownerRow, ownerUserId }` options and the `resolvePrimaryOwner` call are removed. The explicit
`ownerUserId: record.user_id` arguments in the assessments, sessions, and letter-mastery
repositories are removed too, leaving a single source of truth. None of the roughly 45 call sites
otherwise change. Tests that inject a raw database pass an explicit actor through the test helper.

### 6.2 A missing owner fails closed

- JavaScript: `insertOutboxRecord` throws when there is no actor.
- SQLite: a migration adds
  `create trigger sync_outbox_owner_required before insert on sync_outbox when new.owner_user_id is null begin select raise(abort, 'sync_outbox.owner_user_id is required'); end;`.
  A trigger is chosen over a table rebuild with `NOT NULL` because it gives the same guarantee
  without rebuilding the outbox's indexes.
- The four null-owner wildcards in `src/db/repositories/syncOutboxRepository.js` (around lines 88,
  118, 170, and 283) become a plain `owner_user_id = ?`.

### 6.3 Owner tripwire at upload

Before sending, the sync engine checks that the outbox row's owner equals the handle's actor. If
not, the row is marked needs-attention, is not retried, and one incident (§7.4, kind
`foreign_owner_in_file`) is reported. With one file per EA this should never fire; if it does, the
isolation design has failed and we need to know.

### 6.4 Rescue heal uses the stamped owner

`requeueTerminalRlsFailures` compares `record.owner_user_id === userId` instead of calling
`resolveRecordOwners`. `src/db/repositories/outboxOwnership.js` then has no users and is deleted,
with its tests.

### 6.5 Server precondition (verified first)

Fixing the owner only helps if the server accepts the upload. Two server behaviours make that
expected:

- `children_update_active_assignment_or_creator`
  (`supabase/migrations/20260521120147_masi_rls_advisor_cleanup.sql`) allows an EA with an active
  assignment to update a child someone else created.
- Postgres applies INSERT `WITH CHECK` on `INSERT … ON CONFLICT DO UPDATE` only to rows inserted
  through the insert path.

Both are unverified for the app's exact upload path. Test S1 (§9.2) proves them, for `children` and
for every Head Office-created table an EA can edit (`classes`, `groups`, and the membership tables),
before any app code is written. If S1 fails, the defect also needs an RLS change, and the work
returns to Jim before building.

## 7. Sign-out and clean-up

### 7.1 Sign-out questions, in order

Each question is a bottom sheet, not a dialog.

1. **Still clocked in.** "You're still clocked in." Options: **Clock out now** (the normal
   clock-out, including location), **Stay clocked in and sign out**, **Cancel**.
2. **Unsent work.** Shown when the unsent count is above zero after step 1 (clocking out creates
   an unsent time entry, so this question must come second). The sheet reads: "N items haven't
   uploaded yet. If you sign out, they'll upload next time you sign in on this phone." Options:
   - **Try uploading now** runs a forced sync with visible progress. If the count reaches zero,
     sign-out continues without asking again; otherwise the sheet updates the count. When the phone
     is offline the button is disabled and labelled "No connection".
   - **Sign out anyway**.
   - **Cancel**.
3. The §4.3 close sequence.

Sign-outs not started by the EA (the server ending the session) skip the questions. The file still
closes through §4.3.

"Stay clocked in" leaves the time entry open until that EA next signs in on this phone, possibly
days later. The existing on-phone ten-hour auto clock-out then runs, and the Step 5 policy (the
staff report says "still open") applies. A server-side auto clock-out remains out of scope.

Copy is provisional and gets a wording pass with Jim.

### 7.2 What counts as unsent

Status `pending`, `failed`, `in_flight`, or `terminal`. The sign-out warning, the 30-day deletion
rule, and the left-behind report all use this one definition, through one repository function.

### 7.3 Thirty-day deletion

At each sign-in, during §4.4 discovery, another EA's file (and its `-wal` and `-shm` companions) is
deleted only when **both** hold:

- it has zero unsent rows;
- its `last_active_at` (falling back to the file's modification time) is more than 30 days old.

A file is never deleted if it is the signed-in EA's own file, or if it fails to open or read; when
in doubt, keep it. Each deletion writes one app-log line (user id, idle days, file size). No UI.

### 7.4 Left-behind report and the minimal incident envelope

When §4.4 discovery finds another EA's file with unsent rows, the signed-in EA's session reports
one incident of kind `left_behind_unsent_work`:

- **Payload:** `{ strandedUserId, unsentByTable: { <table>: count }, oldestUnsentAgeHours,
  appVersion, buildNumber, updateId, backend, installId }`.
- **Excluded:** child ids, names, notes, or any record payload.
- **Repeat key:** `strandedUserId + installId + oldest unsent outbox row id`. The same situation
  reports once.

This spec builds the **minimal incident envelope**, Zazi's proven shape, as the first two incident
kinds (`left_behind_unsent_work` and `foreign_owner_in_file`):

- **Server:** a migration creates a table readable only by `service_role`, and a `SECURITY DEFINER`
  RPC `report_mobile_support_incident` for authenticated callers. The RPC validates the kind against
  an allowlist and the payload size against a limit (8 KB), and is idempotent on a hash of
  `(reporter, kind, repeat key)`.
- **Phone:** a small local queue in the signed-in EA's file (at most 200 rows, each at most 8 KB)
  drained by the sync engine through the network door.
- **`installId`:** a random UUID kept in AsyncStorage, created on first launch.

The `/bug-sync` sweep, further incident kinds, and support actions belong to Step 4's own spec,
which extends this envelope rather than replacing it.

### 7.5 Not doing

- No manual "remove this EA's data" screen (Jim, 2026-10-09).
- No upload of EA A's work while EA B is signed in; that needs A's credentials and is exactly the
  defect this spec closes.

**Known gap:** if EA A never signs in on that phone again, their unsent work stays there. The
report is how support finds out; the remedy is a call asking A to sign in once on that phone.

## 8. Sequencing

1. **S1 server precondition** (§6.5): half a day, as a gate.
2. Handle module, per-EA file lifecycle, `client.js` refactor, adoption (§4) with T1, T2, T11.
3. Signed-in tree remount and the three doors (§5) with T3, T4, T5, T14.
4. Ownership (§6) with T6–T9. Lands with or after step 2, because the owner comes from the handle.
5. Incident envelope (§7.4) with S2 and T12, then the sign-out questions and 30-day deletion
   (§7.1–7.3) with T10 and T13.
6. Device checks D1–D5 with the build intended to ship. Hosted migration apply and S3 need Jim's
   explicit yes.

Estimated 5–7 days of Codex implementation plus review. The largest pieces are the remount (§5.1)
and the incident envelope.

## 9. Testing

Built test-first through the repository TDD skill, in vertical slices. SQLite behaviour (triggers,
WAL companions, connection close, file deletion) uses real SQLite through better-sqlite3.

### 9.1 Unit and integration (`npm test`, `npm run test:integration`)

| # | Behaviour |
|---|---|
| T1 | Sign-in as A opens `masi-A.db`; sign-in as B opens `masi-B.db`; signed out, no domain file is open and the login screen reads none |
| T2 | Offline restore of a saved session opens the right file; data screens show loading, never "no children" |
| T3 | Live defect 2: A queues an upload, A signs out, B signs in, A's queued task runs; nothing is sent and the task fails with `StaleActorError` |
| T4 | A transaction admitted under epoch N with sign-out before `COMMIT` is rolled back, unless it carries a finalize token for a request already sent; a token-less write while draining is refused |
| T5 | An in-flight upload records its result within the drain bound; past the bound the row stays unsent in A's file and uploads after A signs in again |
| T6 | Live defect 1: an EA edits a Head Office-created child; the outbox owner is the EA and the upload query returns the row |
| T7 | Inserting an outbox row with no actor throws in JavaScript; the trigger aborts a raw null insert |
| T8 | Tripwire: an outbox row owned by X in Y's file becomes needs-attention, is not retried, and reports one incident |
| T9 | Rescue heal requeues an RLS-quarantined row by its stamped owner, including Head Office-created records |
| T10 | Deletion only when zero unsent (terminal counts) and idle over 30 days; removes `-wal`/`-shm`; never deletes the current EA's file or an unreadable file |
| T11 | Adoption of `masi.db`: renamed for the persisted EA; null owners assigned; foreign-owned rows trip the tripwire |
| T12 | Left-behind report sent once per repeat key; a deny-list test proves the payload holds no child ids, names, or notes |
| T13 | Sign-out order: the clock-out sheet comes before the unsent sheet; "Clock out now" increases the unsent count shown next |
| T14 | After a key change, no timer, interval, or listener from the previous EA's tree remains |

### 9.2 Server

| # | Behaviour |
|---|---|
| S1 | In the migration-replay Postgres harness: an assigned EA's upsert of a Head Office-created `children` row succeeds, and an unassigned EA's fails; the same holds for `classes`, `groups`, and the EA-editable membership tables |
| S2 | Incident RPC: anonymous callers refused; authenticated caller accepted; duplicate payload recorded once; unknown kind and oversize payload refused; only `service_role` reads the table |
| S3 | After a hosted apply (Jim's yes), `npm run rls:probe` repeats S1 against `segygjzpujphwvrubusm` with real test accounts |

### 9.3 Device (an iPhone and the Galaxy A03s, using the build intended to ship)

| # | Check |
|---|---|
| D1 | A and B share a phone: A works offline, signs out with "Sign out anyway"; B signs in and works; A signs back in. A's work uploads, B never sees A's children, and the left-behind incident is on the server |
| D2 | Sign-out during an upload on a throttled network: no request under B's session; A's work arrives exactly once later |
| D3 | "Stay clocked in and sign out", sign back in after more than ten hours: the auto clock-out runs and the report shows "still open" |
| D4 | Measure sign-out to file closed on the A03s; this sets the §5.3 drain bound |
| D5 | Cold start with the file opened after sign-in, compared with today's build |

These cover next-steps Step 7's "switch accounts on the same phone" case and the sign-out half of
Codex round 2's live defect 2.

## 10. Documentation in the same branch

- `documentation/rls-sync-contract-map.md`: the owner rule, the doors, the incident table and RPC.
- `CONTEXT.md`: the §3 terms.
- `documentation/ROADMAP.md` priority 5: mark what this delivers.
- `documentation/build-log.md`: decisions, verification, and device results.
- ADR for one database per EA with 30-day deletion, through `grill-with-docs`.

## 11. Out of scope (owned by the upload-contract spec)

Uncertain-outcome recovery, same-record ordering, base versions and `stale_base`, the assessment
bundle as the exclusive insertion boundary, queue-level deadlines, and duplicate-proof submit. This
spec's §5.3 drain states the one dependency it places on that work.

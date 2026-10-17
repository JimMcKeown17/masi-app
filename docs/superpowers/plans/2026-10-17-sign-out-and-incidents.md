# Sign-out Questions and Support Incidents Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An EA who signs out is asked about an open shift and unsent work first, and support learns when one EA's unsent work is left behind on a phone that another EA is now using.

**Architecture:** A server table readable only by `service_role` plus a `SECURITY DEFINER` RPC form the minimal incident envelope. Each EA's own SQLite file holds a small incident queue, which the sync engine drains through the signed-in EA handle's data client. Incidents come from three producers:
- sign-in file discovery, which reads other EAs' files and the legacy `masi.db` read-only;
- the existing outbox integrity scan;
- nothing else.

The sign-out questions are two bottom sheets, wired into Profile → Sign Out. They are driven by a small hook that takes its dependencies as arguments.

**Tech Stack:** Expo / React Native 0.81, expo-sqlite 16 (better-sqlite3 in tests), expo-file-system 19 (`expo-file-system/next`), Supabase (PostgreSQL 17), Jest with jest-expo and @testing-library/react-native.

**Spec:** [`docs/superpowers/specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md`](../specs/2026-10-09-actor-lifecycle-and-mutation-ownership-design.md):
- §4.4 discovery
- §4.5 legacy incident
- §7.1 sign-out questions
- §7.2 unsent
- §7.4 left-behind report and minimal incident envelope
- §9 tests T8 (incident half), T10, T11 (incident half), T12, T13, S2

Plan 2 (`docs/superpowers/plans/2026-10-14-signed-in-ea-handle.md`) is merged. Its ledger deferred `foreign_owner_in_file` to this plan.

## Global Constraints

- Node 20 for every jest/harness run: prefix `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Stay on npm. Add no dependencies; `uuid`, `expo-file-system`, `expo-sqlite` and `@react-native-async-storage/async-storage` are already installed.
- Commits have no co-author trailer.
- Never touch the legacy backend `jcqrlwetutnpuchjoyyd`.
- Hosted migration apply needs Jim's explicit yes and is not part of any task.
- Each question is a bottom sheet (`src/components/common/BottomSheet.js`), never a dialog or `Alert` (spec §7.1).
- Unsent means outbox status `pending`, `failed`, `in_flight`, or `terminal`, through one function (spec §7.2).
- Incident kinds are exactly `left_behind_unsent_work`, `foreign_owner_in_file` and `legacy_shared_file_unsent` (spec §7.4).
- An incident payload never contains child ids, names, notes, or any record payload (spec §7.4).
- Incident payload limit: 8 KB (8192 bytes of UTF-8 JSON). Local queue limit: 200 rows (spec §7.4).
- `installId` is a random UUID in AsyncStorage under `masi:device:installId` (spec §4.1, §7.4).
- Nothing deletes a domain file, including another EA's file or the legacy `masi.db` (spec §7.3, T10).
- Sign-outs not started by the EA (server-ended session, grace timeout) skip the questions (spec §7.1).
- The `supabase` CLI runs migrations outside a transaction block, so a migration uses session `SET`/`RESET`, never `SET LOCAL`.
- TDD: write the failing test first, see it fail for the stated reason, then implement.
- Update `documentation/build-log.md` (and `documentation/rls-sync-contract-map.md` where a synced or server table changes) in the same task as the code.

## Review Focus

1. **An EA signs out while offline with unsent work.** "Try uploading now" is disabled and labelled "No connection"; "Sign out anyway" still signs out. Pinned in Task 6.
2. **Clock-out from the sheet does not complete** (location Settings detour, or a write error). The EA is not signed out; the sheet stays, with an inline message, and they can try again or choose another option. Pinned in Task 6.
3. **Another EA's file cannot be read** (corrupt, locked, or missing `sync_outbox`). Sign-in is unaffected, the bad file produces no incident and no crash, and readable files are still reported. Pinned in Task 5.
4. **The incident RPC is unreachable, or the EA signs out mid-drain.** Queued incidents stay pending and send on a later pass, even when the domain outbox is empty. A stale handle's drain never sends under the next EA's session. Pinned in Tasks 3 and 5.
5. **The same stranded situation is seen at many sign-ins.** It is queued and sent once. A new situation for the same EA is reported again: a different oldest unsent row, or the same outbox id recreated after an upload. Pinned in Task 5.
6. **The EA cancels while the clock-out or upload is still running.** They stay signed in, and no sheet reopens. Pinned in Task 6.
7. **An EA signs out, and the next EA signs in, while discovery is still reading a file.** Discovery opens nothing more, and the next open of a file it was reading waits for that read. Pinned in Task 5.
8. **The unsent count cannot be read** (storage needs recovery). Sign-out is still possible, explicitly; a failed count never reads as zero. Pinned in Task 6.

---

## Rulings this plan makes (record each in the SDD ledger)

1. **Idempotency key.** The server dedupes on a unique `(reporter_id, kind, repeat_key)` constraint instead of a stored hash. The semantics are identical (spec: "idempotent on a hash of (reporter, kind, repeat key)") with no `pgcrypto` dependency.
2. **Repeat keys are opaque digests; server repeat key = `installId + ':' + local repeat key`.**
   - An outbox id is `${table}:${recordId}:${operation}` (`syncOutboxRepository.js` `outboxRecordId`), so it contains a child or session id. A raw outbox id must never reach the server, and must never sit in the queue either.
   - The local repeat key is `incidentRepeatKey(...parts)`: a UUIDv5 over the parts joined with `\u0000`, under a fixed Masi incident namespace (`uuid` v5 is already used on device by `deterministicDomainId`). It is deterministic, so dedupe still works, and one-way, so it reveals nothing.
   - Parts per kind:
     - `left_behind_unsent_work`: `[strandedUserId, oldestUnsentOutboxId, oldestUnsentCreatedAt]`
     - `legacy_shared_file_unsent`: `['legacy', oldestUnsentOutboxId, oldestUnsentCreatedAt]`
     - `foreign_owner_in_file`: `['foreign', ...sortedForeignOutboxIds]`
   - **Why `created_at` is in the left-behind key:** outbox ids are deterministic per record and operation, not per mutation. After an upload deletes the row, a later edit to the same child recreates the same id. The upsert keeps `created_at` on conflict (`insertOutboxRecord` `preserveOnConflictColumns`), so the pair is stable across retries of one episode and changes when the work was acknowledged and recreated.
   - **Why the whole foreign set:** the scan re-finds every foreign row each pass. A set that grows while its smallest id stays present is a new situation, so the key covers all ids.
   - This realises the spec's `strandedUserId + installId + oldest unsent outbox row id`, with the episode timestamp added and the result hashed so T12 holds for the key as well as the payload.
   - `installId` is added at send time, so SQLite transactions never read AsyncStorage.
3. **Envelope metadata is added at send time.** `appVersion`, `buildNumber`, `updateId`, `backend` and `installId` are merged into the payload by the drain. Queued rows hold only the kind-specific counts.
4. **`foreign_owner_in_file` payload** (the spec names the kind, not the shape): `{ foreignTotal, foreignByTable }`.
5. **Discovery does not read `last_active_at`.** It only matters to the deferred deletion rule (§7.3), and the payload does not carry it. Revive when deletion is built.
6. **Discovery runs detached after the handle is published, bound to that handle and to the file fence.**
   - It never delays sign-in. It runs in the handle registry (`src/session/`), which the production-binding static test already treats as privileged.
   - Before each file it checks that its handle is still open and current; after a sign-out it opens nothing more.
   - Each read of another file runs through `readUnderFileFence(fileName, task)` in `signedInHandle.js`. The read starts only after that file's pending disposal, and it joins the file's entry in the existing `disposals` map, so a same-file `requestOpen` waits for it exactly as it waits for a disposal. A failed disposal stays failed.
   - The handle exposes `handle.discovery`: a promise that settles (never rejects) when discovery has queued its incidents. OfflineContext refreshes sync status when it settles, which schedules an upload (ruling 7).
   - Closing a read-only connection may checkpoint that file's WAL and remove its `-wal`/`-shm` sidecars. That is ordinary SQLite behaviour: committed data moves into the main file and nothing is lost. T10's "never deleted" is about the database file and its rows, which test 8 pins.
7. **Draining and scheduling.**
   - The drain runs at the end of a full `syncAll` pass (not `syncTableByName`), and only with a live session. A failed drain never changes the pass's `success`.
   - A `22023` rejection marks the row `rejected` (never retried). Any other failure leaves it pending with `next_attempt_at` backed off on the outbox's curve (`min(5 s × 3^attempts, 15 min)`), and stops the drain for this pass.
   - Incidents are upload work. `getSyncStatus` reports `incidentReadyCount` (pending and due). OfflineContext treats it like `readyCount` everywhere it decides whether to schedule a pass: status refresh, reconnect, foreground and background. This happens through one `hasUploadWork()` helper; there is no new scheduler. A failed incident is retried by the existing 30-second status refresh once its backoff passes.
   - `incidentReadyCount` is never shown to the EA and never counts as unsent work. It only decides whether a pass runs.
8. **Retention.** When the queue reaches 200 rows, the oldest `sent`/`rejected` rows are deleted to make room. If all 200 are `pending`, the new incident is dropped and logged (`{ queued: false, reason: 'full' }`).
9. **Each sign-out attempt has a generation.**
   - `start` begins a new attempt. Cancel, backdrop dismissal, Android Back (all reach `cancel` through `BottomSheet.onDismiss`) and unmount end it.
   - Every continuation after an `await` (clock-out, upload, unsent count) checks that its attempt is still current before it changes a sheet or signs out. A cancelled attempt can never sign the EA out later.
   - Cancelling does not abort an upload or clock-out already in progress. It only stops the flow from acting on the result.
   - A failed unsent count is never treated as zero. The EA sees "Couldn't check for work that hasn't uploaded." with Try again, Sign out anyway and Cancel, so manual sign-out never depends on SQLite being healthy.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261017120000_mobile_support_incidents.sql` (new) | Server table and RPC (envelope) |
| `scripts/support-incident-postgres-harness.cjs` (new) | S2 against a disposable PostgreSQL |
| `src/db/migrations.js` (modify) | Local migration v13 `support_incident_queue` |
| `src/db/repositories/syncOutboxRepository.js` (modify) | `readUnsentSummary(db)`, the one unsent definition; `countUnsent` uses it; the integrity scan queues `foreign_owner_in_file` |
| `src/db/repositories/supportIncidentRepository.js` (new) | Local queue: enqueue (dedupe, size, cap), list due, count due, mark sent/rejected/failed with backoff; `enqueueSupportIncident(txn, …)` for callers already in a transaction; `incidentRepeatKey(...parts)` |
| `src/services/installId.js` (new) | Device-level install id |
| `src/services/supportIncidents.js` (new) | Envelope builder and `drainSupportIncidents` |
| `src/services/offlineSync.js` (modify) | Engine accepts `supportIncidentRepository`; drain at the end of `syncAll`; `getSyncStatus` reports `incidentReadyCount` |
| `src/context/OfflineContext.js` (modify) | `hasUploadWork()` includes due incidents; refresh status when `handle.discovery` settles |
| `src/session/handleServices.js` (modify) | Registers the repository and passes it to the engine |
| `src/session/fileDiscovery.js` (new) | List database files, read others read-only, turn results into incidents, queue them |
| `src/session/signedInHandle.js` (modify) | Run discovery detached after publish (injectable `discover`), exposed as `handle.discovery`; `readUnderFileFence` |
| `src/context/TimeTrackingContext.js` (modify) | `handleSignOut` (clock-out) returns `true` only when the entry closed |
| `src/hooks/useSignOutFlow.js` (new) | Sign-out question state machine (dependencies injected) |
| `src/components/profile/SignOutSheets.js` (new) | The two bottom sheets (presentational) |
| `src/screens/main/ProfileScreen.js` (modify) | Sign Out button starts the flow |
| `.github/workflows/tests.yml`, `package.json` (modify) | S2 harness in CI |
| Docs (modify) | `CONTEXT.md`, `documentation/rls-sync-contract-map.md`, `documentation/ROADMAP.md`, `documentation/build-log.md`, `documentation/LEARNING.md`, `docs/adr/0008-one-local-database-per-ea.md` |

---

### Task 1: Server incident envelope and S2 harness

**Files:**
- Create: `supabase/migrations/20261017120000_mobile_support_incidents.sql`
- Create: `scripts/support-incident-postgres-harness.cjs`
- Modify: `package.json` (script `verify:support-incident:postgres`)
- Modify: `.github/workflows/tests.yml` (new step after the organisation-label step, same env as the other harness steps)
- Modify: `documentation/rls-sync-contract-map.md`: add a `mobile_support_incidents` row to the Table Contract Map
- Modify: `documentation/build-log.md`: a Verification Register row

**Interfaces:**
- Produces: RPC `public.report_mobile_support_incident(p_kind text, p_repeat_key text, p_payload jsonb) returns boolean`.
  - `true` means newly recorded; `false` means a duplicate.
  - Error codes:
    - `28000`: no `auth.uid()`.
    - `22023`: unknown kind; blank or >512-char repeat key; non-object payload; payload >8192 bytes.
    - `42501`: anon (no EXECUTE).

- [ ] **Step 1: Write the harness (the failing test).**
  - Model it on `scripts/organisation-label-postgres-harness.cjs`:
    - reuse `assertDisposableAdminTarget`, `bootstrapSql`, `buildDatabaseUrl`, `runPsql` and `expectSqlState` from `./history-authorization-postgres-harness.cjs`;
    - name the database `${HISTORY_RLS_DATABASE_NAME}_incident`;
    - install the same Supabase-style default privileges control first (`installDefaultPrivileges` pattern, its own control table name);
    - apply every migration `< '20261017120000_mobile_support_incidents.sql'`, then this migration wrapped in `BEGIN;…COMMIT;` (the CLI's implicit transaction).
  - Fixtures:
    - `auth.users` ids `13000000-0000-0000-0000-000000000001` (EA A) and `…0002` (EA B);
    - matching `public.users` rows with `school_id` and `organization_id = 'a111879f-d066-47c9-95a1-bed2a400319a'`, as in the organisation harness fixture.
  - Run each case as the `authenticated` role with the actor's claim, the way the organisation harness does:
    ```sql
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '<actor>';
    ```
  - Case keys and expectations (print one JSON summary line like the other harnesses):

| key | SQL (as role) | expect |
|---|---|---|
| `anon-execute-refused` | anon: `select public.report_mobile_support_incident('left_behind_unsent_work','k1','{}')` | SQLSTATE `42501` |
| `no-subject-refused` | authenticated, empty `sub` | `28000` |
| `accepted` | A: kind `left_behind_unsent_work`, key `i1:u1:o1`, payload `{"strandedUserId":"u1","unsentByTable":{"children":2}}` | returns `t`; one row |
| `duplicate-recorded-once` | A: same call again | returns `f`; still one row |
| `other-reporter-separate` | B: same kind and key | returns `t`; two rows total |
| `unknown-kind-refused` | A: kind `child_names` | `22023` |
| `blank-key-refused` | A: key `''` | `22023` |
| `long-key-refused` | A: key of 513 `x` | `22023` |
| `non-object-refused` | A: payload `'[1,2]'` | `22023` |
| `oversize-refused` | A: payload `jsonb_build_object('p', repeat('x', 8200))` | `22023` |
| `authenticated-select-refused` | authenticated: `select * from public.mobile_support_incidents` | `42501` |
| `anon-select-refused` | anon: same | `42501` |
| `authenticated-no-table-grants` | `has_table_privilege('authenticated','public.mobile_support_incidents', p)` for SELECT, INSERT, UPDATE, DELETE | all `f` |
| `service-role-select-only` | `has_table_privilege('service_role', …)`: SELECT `t`; INSERT/UPDATE/DELETE `f` | as stated |
| `service-role-reads` | `SET LOCAL ROLE service_role; select count(*) …` | `2` |
| `stored-reporter` | service_role: `select reporter_id from … where repeat_key='i1:u1:o1' order by reporter_id` | A then B |

- [ ] **Step 2: Run it and watch it fail.**
  - First start a disposable PostgreSQL 17 if none is running on 55432:
    ```
    initdb -D <scratch>/pg/data -U postgres --auth=trust
    pg_ctl -D <scratch>/pg/data -o "-p 55432 -k ''" start
    ```
  - Run:
    ```
    PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH PGTZ=UTC HISTORY_RLS_ADMIN_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres HISTORY_RLS_DATABASE_NAME=masi_history_rls_ci HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE npm run -s verify:support-incident:postgres
    ```
  - Expected: FAIL, because the migration file does not exist (the explicit apply step reads it).

- [ ] **Step 3: Write the migration.**

```sql
-- Minimal support-incident envelope (actor-lifecycle spec §7.4; Zazi iZandi's proven shape).
-- Phones report counts-only incidents through one SECURITY DEFINER RPC; only service_role
-- reads them. Session-level bounds: the Supabase CLI runs this outside a transaction block,
-- so SET LOCAL would be a no-op (25P01).
SET lock_timeout = '10s';
SET statement_timeout = '60s';

create table public.mobile_support_incidents (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent'
  )),
  repeat_key text not null check (pg_catalog.length(repeat_key) between 1 and 512),
  payload jsonb not null check (pg_catalog.jsonb_typeof(payload) = 'object'),
  received_at timestamptz not null default now(),
  -- Idempotency: the same reporter, kind and repeat key is recorded once.
  constraint mobile_support_incidents_once unique (reporter_id, kind, repeat_key)
);

alter table public.mobile_support_incidents enable row level security;
revoke all on table public.mobile_support_incidents
  from public, anon, authenticated, authenticator, service_role;
grant select on table public.mobile_support_incidents to service_role;

create or replace function public.report_mobile_support_incident(
  p_kind text,
  p_repeat_key text,
  p_payload jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_inserted integer;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_kind is null or p_kind not in (
    'left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent'
  ) then
    raise exception 'Unknown incident kind' using errcode = '22023';
  end if;
  if p_repeat_key is null or pg_catalog.length(p_repeat_key) not between 1 and 512 then
    raise exception 'Repeat key must be 1-512 characters' using errcode = '22023';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Incident payload must be a JSON object' using errcode = '22023';
  end if;
  if pg_catalog.octet_length(p_payload::text) > 8192 then
    raise exception 'Incident payload exceeds 8192 bytes' using errcode = '22023';
  end if;

  insert into public.mobile_support_incidents (reporter_id, kind, repeat_key, payload)
  values (v_actor_id, p_kind, p_repeat_key, p_payload)
  on conflict on constraint mobile_support_incidents_once do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.report_mobile_support_incident(text, text, jsonb)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.report_mobile_support_incident(text, text, jsonb) to authenticated;

RESET statement_timeout;
RESET lock_timeout;
```

- [ ] **Step 4: Run the harness and watch it pass.**
  - Command: same as Step 2. Expected: one JSON line with every key `"passed"` and exit 0.
  - Then run the other three harnesses (`verify:history-authorization:postgres`, `verify:upload-contract:postgres`, `verify:organisation-label:postgres`). Expected: all pass. The new migration sorts last, so their replays include it.

- [ ] **Step 5: Wire CI and docs.**
  - `package.json`: `"verify:support-incident:postgres": "node scripts/support-incident-postgres-harness.cjs"`.
  - `tests.yml`: a step named `Support-incident PostgreSQL harness (S2)` with the same three env vars as the upload-contract step.
  - Contract map row:
    - `mobile_support_incidents`: server-only; written only by `report_mobile_support_incident`;
    - allowlisted kinds; ≤8192-byte object payload; unique `(reporter_id, kind, repeat_key)`;
    - RLS on with no policies; `service_role` SELECT only; `authenticated` EXECUTE on the RPC only;
    - "Hosted apply pending (needs Jim's yes)";
    - tests: `support-incident-postgres-harness.cjs`.
  - Build-log row with the harness result line counts.

- [ ] **Step 6: Commit.**
```bash
git add supabase/migrations/20261017120000_mobile_support_incidents.sql scripts/support-incident-postgres-harness.cjs package.json .github/workflows/tests.yml documentation/rls-sync-contract-map.md documentation/build-log.md
git commit -m "feat(incidents): server support-incident envelope and S2 harness"
```

---

### Task 2: Local incident queue and the one unsent definition

**Files:**
- Modify: `src/db/migrations.js`: append v13
- Modify: `src/db/repositories/syncOutboxRepository.js`: export `UNSENT_STATUSES` and `readUnsentSummary`; `countUnsent` uses it
- Create: `src/db/repositories/supportIncidentRepository.js`
- Modify: `src/session/handleServices.js`: `repositories.supportIncidents`
- Test: `__tests__/supportIncidentRepository.test.js` (new; real SQLite through `test-support/expoSQLiteRealEngine`, set up as in `__tests__/outboxIntegrityScan.test.js`)
- Test: `__tests__/unsentSummary.test.js` (new)

**Interfaces:**
- Produces from `syncOutboxRepository.js`:
  - `export const UNSENT_STATUSES = ['pending', 'failed', 'in_flight', 'terminal'];`
  - `export const readUnsentSummary = async (db) => ({ total, byTable, oldestId, oldestCreatedAt })`. `byTable` is `{ [table_name]: count }`. `oldestId` and `oldestCreatedAt` are `null` when total is 0. It works on any connection with a `sync_outbox` table: a handle facade, a reader, or a raw read-only connection.
  - `countUnsent()` keeps returning `{ total, byTable }`; it may also return the two `oldest*` fields.
- Produces from `supportIncidentRepository.js`:
  - `export const SUPPORT_INCIDENT_KINDS = ['left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent'];`
  - `export const MAX_QUEUED_INCIDENTS = 200;`
  - `export const MAX_INCIDENT_PAYLOAD_BYTES = 8192;`
  - `export const incidentRepeatKey = (...parts) => string`: a UUIDv5 of `parts.map(String).join('\u0000')` under `INCIDENT_KEY_NAMESPACE` (ruling 2). Every producer builds its repeat key with it; no producer passes a raw outbox id.
  - `export const enqueueSupportIncident = async (txn, { kind, repeatKey, payload }) => ({ queued: boolean, reason?: 'duplicate' | 'full' | 'too_large' })`. The caller supplies the open transaction facade.
  - `export const createSupportIncidentRepository = ({ database } = {}) => ({ enqueue, listPending, countDue, markSent, markRejected, markAttemptFailed })`. There is **no** singleton export; the production-binding static test forbids one.
    - `enqueue({ kind, repeatKey, payload }, { transaction } = {})`: same result as `enqueueSupportIncident`.
    - `listPending({ limit = 20, now = timestamp() } = {}) → [{ id, kind, repeatKey, payload /* parsed object */, attempts }]`: pending rows that are due (`next_attempt_at` is null or `<= now`), oldest first.
    - `countDue({ now = timestamp() } = {}) → number`: the same filter, counted.
    - `markSent(id)`, `markRejected(id, errorMessage)`, `markAttemptFailed(id, errorMessage, { now } = {})`. The last increments `attempts`, stays `pending`, and sets `next_attempt_at = now + min(5000 × 3^attemptsBefore, 900000) ms`.

- [ ] **Step 1: Write the failing tests.**

`__tests__/unsentSummary.test.js`:
```js
global.__MASI_NO_DEFAULT_HANDLE__ = true;
import * as sqlite from '../test-support/expoSQLiteRealEngine';
import { runMigrations } from '../src/db/migrations';
import { readUnsentSummary, UNSENT_STATUSES } from '../src/db/repositories/syncOutboxRepository';

const A = '11111111-1111-4111-8111-111111111111';
let db;
const row = (id, table, status, createdAt) => db.runAsync(
  `insert into sync_outbox (id, table_name, record_id, operation, status, owner_user_id, created_at, updated_at)
   values (?, ?, ?, 'insert', ?, ?, ?, ?)`, id, table, `r-${id}`, status, A, createdAt, createdAt);

beforeEach(async () => {
  await sqlite.__resetMockDatabases();
  db = await sqlite.openDatabaseAsync(`masi-${A}.db`);
  await runMigrations(db);
});
afterEach(() => sqlite.__resetMockDatabases());

test('unsent is pending, failed, in_flight and terminal; synced rows are excluded', async () => {
  expect(UNSENT_STATUSES).toEqual(['pending', 'failed', 'in_flight', 'terminal']);
  await row('o2', 'children', 'pending', '2026-10-02T00:00:00.000Z');
  await row('o1', 'children', 'terminal', '2026-10-01T00:00:00.000Z');
  await row('o3', 'time_entries', 'in_flight', '2026-10-03T00:00:00.000Z');
  await row('o4', 'sessions', 'failed', '2026-10-04T00:00:00.000Z');
  expect(await readUnsentSummary(db)).toEqual({
    total: 4, byTable: { children: 2, time_entries: 1, sessions: 1 },
    oldestId: 'o1', oldestCreatedAt: '2026-10-01T00:00:00.000Z',
  });
});

test('an empty outbox reports zero and no oldest row', async () => {
  expect(await readUnsentSummary(db)).toEqual({ total: 0, byTable: {}, oldestId: null, oldestCreatedAt: null });
});
```
  - Check the real `sync_outbox` columns in `src/db/migrations.js` (v1 plus later alters). If the insert above misses a NOT NULL column, add it with a fixed value.
  - A note on sync status: `sync_outbox` status has no `synced` value. Synced rows are deleted on success, so "excluded" means the four statuses are the whole set.

`__tests__/supportIncidentRepository.test.js` (same setup, then `createSupportIncidentRepository({ database: db })`; with a raw connection the repository runs its writes in `runRepositoryTransaction(db, …)`, exactly as `createSyncOutboxRepository({ database: db })` does in `outboxIntegrityScan.test.js`):
```js
test('enqueue stores a pending incident once per kind and repeat key', async () => {
  const repo = createSupportIncidentRepository({ database: db });
  const incident = { kind: 'left_behind_unsent_work', repeatKey: 'u1:o1', payload: { unsentByTable: { children: 1 } } };
  expect(await repo.enqueue(incident)).toEqual({ queued: true });
  expect(await repo.enqueue(incident)).toEqual({ queued: false, reason: 'duplicate' });
  const pending = await repo.listPending();
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({ kind: 'left_behind_unsent_work', repeatKey: 'u1:o1', payload: incident.payload, attempts: 0 });
});

test('unknown kinds are refused by the table check', async () => {
  const repo = createSupportIncidentRepository({ database: db });
  await expect(repo.enqueue({ kind: 'child_names', repeatKey: 'k', payload: {} })).rejects.toBeTruthy();
});

test('a payload over 8192 UTF-8 bytes is not queued', async () => {
  const repo = createSupportIncidentRepository({ database: db });
  const result = await repo.enqueue({ kind: 'foreign_owner_in_file', repeatKey: 'big', payload: { p: 'é'.repeat(4100) } });
  expect(result).toEqual({ queued: false, reason: 'too_large' });
});

test('at 200 rows the oldest sent rows make room; 200 pending rows refuse a new one', async () => {
  const repo = createSupportIncidentRepository({ database: db });
  for (let i = 0; i < 200; i += 1) {
    await repo.enqueue({ kind: 'left_behind_unsent_work', repeatKey: `k${String(i).padStart(3, '0')}`, payload: {} });
  }
  expect(await repo.enqueue({ kind: 'left_behind_unsent_work', repeatKey: 'overflow', payload: {} }))
    .toEqual({ queued: false, reason: 'full' });
  const [first] = await repo.listPending({ limit: 1 });
  await repo.markSent(first.id);
  expect(await repo.enqueue({ kind: 'left_behind_unsent_work', repeatKey: 'overflow', payload: {} }))
    .toEqual({ queued: true });
  const count = await db.getFirstAsync('select count(*) as n from support_incident_queue');
  expect(count.n).toBe(200);
});

test('markAttemptFailed backs the row off; markRejected and markSent remove it from pending', async () => {
  const repo = createSupportIncidentRepository({ database: db });
  await repo.enqueue({ kind: 'left_behind_unsent_work', repeatKey: 'a', payload: {} });
  await repo.enqueue({ kind: 'left_behind_unsent_work', repeatKey: 'b', payload: {} });
  const [a, b] = await repo.listPending();
  const failedAt = '2026-10-17T10:00:00.000Z';
  await repo.markAttemptFailed(a.id, 'Network request failed', { now: failedAt });
  await repo.markRejected(b.id, '22023');
  // Backed off for 5 s after the first failure: not due at +4 s, due at +5 s.
  expect(await repo.listPending({ now: '2026-10-17T10:00:04.000Z' })).toEqual([]);
  expect(await repo.countDue({ now: '2026-10-17T10:00:04.000Z' })).toBe(0);
  const due = await repo.listPending({ now: '2026-10-17T10:00:05.000Z' });
  expect(due.map((row) => row.id)).toEqual([a.id]);
  expect(due[0].attempts).toBe(1);
  expect(await repo.countDue({ now: '2026-10-17T10:00:05.000Z' })).toBe(1);
  // The second failure backs off 15 s (5 s × 3).
  await repo.markAttemptFailed(a.id, 'Network request failed', { now: '2026-10-17T10:00:05.000Z' });
  expect(await repo.countDue({ now: '2026-10-17T10:00:19.000Z' })).toBe(0);
  expect(await repo.countDue({ now: '2026-10-17T10:00:20.000Z' })).toBe(1);
});

test('incidentRepeatKey is deterministic, opaque, and sensitive to every part', () => {
  const key = incidentRepeatKey('u1', 'children:c-secret-child-id:update', '2026-10-15T00:00:00.000Z');
  expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(key).toBe(incidentRepeatKey('u1', 'children:c-secret-child-id:update', '2026-10-15T00:00:00.000Z'));
  expect(key).not.toContain('c-secret-child-id');
  expect(key).not.toBe(incidentRepeatKey('u1', 'children:c-secret-child-id:update', '2026-10-16T00:00:00.000Z'));
  // Part boundaries matter: ('ab', 'c') and ('a', 'bc') are different situations.
  expect(incidentRepeatKey('ab', 'c')).not.toBe(incidentRepeatKey('a', 'bc'));
});
```
  - In `__tests__/sqlitePlan1Migrations.test.js`, or whichever suite pins `CURRENT_SCHEMA_VERSION` (grep for `CURRENT_SCHEMA_VERSION` in `__tests__`), add or adjust an assertion: the version is 13 and `support_incident_queue` exists after migrating.

- [ ] **Step 2: Run them and watch them fail.**
  - Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/unsentSummary.test.js __tests__/supportIncidentRepository.test.js`
  - Expected: FAIL, because `readUnsentSummary` and `supportIncidentRepository` are not defined.

- [ ] **Step 3: Implement.**

Migration v13, appended to `MIGRATIONS` in `src/db/migrations.js`:
```js
  {
    version: 13,
    name: 'support_incident_queue',
    sql: `
create table if not exists support_incident_queue (
  id text primary key,
  kind text not null check (kind in (
    'left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent'
  )),
  repeat_key text not null,
  payload text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'rejected')),
  attempts integer not null default 0,
  next_attempt_at text,
  last_error text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (kind, repeat_key)
);
create index if not exists idx_support_incident_queue_status
  on support_incident_queue (status, created_at);
    `,
  },
```

In `syncOutboxRepository.js` (module level, above the factory):
```js
// Spec §7.2: the one definition of unsent work. The sign-out warning, the left-behind report
// and any future deletion rule all read it through readUnsentSummary.
export const UNSENT_STATUSES = ['pending', 'failed', 'in_flight', 'terminal'];
const UNSENT_IN = `(${UNSENT_STATUSES.map((status) => `'${status}'`).join(', ')})`;

export const readUnsentSummary = async (db) => {
  const rows = await db.getAllAsync(`
    select table_name, count(*) as count from sync_outbox
    where status in ${UNSENT_IN} group by table_name
  `);
  const oldest = await db.getFirstAsync(`
    select id, created_at from sync_outbox
    where status in ${UNSENT_IN} order by created_at, id limit 1
  `);
  return {
    total: rows.reduce((total, row) => total + row.count, 0),
    byTable: Object.fromEntries(rows.map((row) => [row.table_name, row.count])),
    oldestId: oldest?.id ?? null,
    oldestCreatedAt: oldest?.created_at ?? null,
  };
};
```
  - `countUnsent` becomes `const countUnsent = async () => readUnsentSummary(await resolveDatabase(database));`.
  - `quarantineForeignOwners` and the other queries that spell the same four statuses are left unchanged: they select rows, not "unsent work".

`src/db/repositories/supportIncidentRepository.js`:
```js
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import { timestamp } from './sqliteRepositoryUtils';

export const SUPPORT_INCIDENT_KINDS = [
  'left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent',
];
export const MAX_QUEUED_INCIDENTS = 200;
export const MAX_INCIDENT_PAYLOAD_BYTES = 8192;

// Fixed namespace for incident repeat keys. Never change it: that would re-report every situation.
const INCIDENT_KEY_NAMESPACE = 'd3a1c6f2-5b7e-4c1a-9f0e-2b8d4e6a7c10';

// Outbox ids carry record ids (`table:recordId:operation`). The repeat key identifies the
// situation without revealing it: deterministic for dedupe, one-way for privacy (spec T12).
export const incidentRepeatKey = (...parts) => uuidv5(
  parts.map(String).join('\u0000'), INCIDENT_KEY_NAMESPACE
);

// The outbox's retry curve (offlineSync getRetryDelay): 5 s, ×3 per failure, capped at 15 min.
const retryDelayMs = (attemptsBefore) => Math.min(5000 * 3 ** attemptsBefore, 15 * 60 * 1000);

const utf8Bytes = (text) => {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
};

// For callers already inside a transaction (the integrity scan). Counts only: the payload
// is built by the caller from counts and ids of outbox rows, never from domain records.
export const enqueueSupportIncident = async (txn, { kind, repeatKey, payload }) => {
  const json = JSON.stringify(payload ?? {});
  if (utf8Bytes(json) > MAX_INCIDENT_PAYLOAD_BYTES) return { queued: false, reason: 'too_large' };
  const existing = await txn.getFirstAsync(
    'select id from support_incident_queue where kind = ? and repeat_key = ?', kind, repeatKey
  );
  if (existing) return { queued: false, reason: 'duplicate' };
  const { n } = await txn.getFirstAsync('select count(*) as n from support_incident_queue');
  if (n >= MAX_QUEUED_INCIDENTS) {
    await txn.runAsync(`
      delete from support_incident_queue where id in (
        select id from support_incident_queue where status in ('sent', 'rejected')
        order by updated_at, id limit ?
      )`, n - MAX_QUEUED_INCIDENTS + 1);
    const after = await txn.getFirstAsync('select count(*) as n from support_incident_queue');
    if (after.n >= MAX_QUEUED_INCIDENTS) {
      console.warn('[SupportIncidents] queue full; incident dropped', { kind });
      return { queued: false, reason: 'full' };
    }
  }
  const now = timestamp();
  await txn.runAsync(`
    insert into support_incident_queue (id, kind, repeat_key, payload, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?)`, uuidv4(), kind, repeatKey, json, now, now);
  return { queued: true };
};

export const createSupportIncidentRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );
  const enqueue = (incident, { transaction } = {}) => runWrite(
    transaction, (txn) => enqueueSupportIncident(txn, incident)
  );
  const DUE = `status = 'pending' and (next_attempt_at is null or next_attempt_at <= ?)`;
  const listPending = async ({ limit = 20, now = timestamp() } = {}) => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(`
      select id, kind, repeat_key, payload, attempts from support_incident_queue
      where ${DUE} order by created_at, id limit ?`, now, limit);
    return rows.map((row) => ({
      id: row.id, kind: row.kind, repeatKey: row.repeat_key,
      payload: JSON.parse(row.payload), attempts: row.attempts,
    }));
  };
  const countDue = async ({ now = timestamp() } = {}) => {
    const db = await resolveDatabase(database);
    const { n } = await db.getFirstAsync(`select count(*) as n from support_incident_queue where ${DUE}`, now);
    return n;
  };
  const close = (status) => (id, errorMessage = null, { transaction } = {}) => runWrite(
    transaction, (txn) => txn.runAsync(`update support_incident_queue
      set status = ?, last_error = ?, next_attempt_at = null, updated_at = ? where id = ?`,
    status, errorMessage, timestamp(), id)
  );
  const markAttemptFailed = (id, errorMessage, { now = timestamp(), transaction } = {}) => runWrite(
    transaction, async (txn) => {
      const row = await txn.getFirstAsync('select attempts from support_incident_queue where id = ?', id);
      if (!row) return;
      const nextAttemptAt = new Date(Date.parse(now) + retryDelayMs(row.attempts)).toISOString();
      await txn.runAsync(`update support_incident_queue
        set attempts = attempts + 1, last_error = ?, next_attempt_at = ?, updated_at = ? where id = ?`,
      errorMessage, nextAttemptAt, now, id);
    }
  );
  return {
    enqueue,
    listPending,
    countDue,
    markSent: (id, options) => close('sent')(id, null, options),
    markRejected: close('rejected'),
    markAttemptFailed,
  };
};
```
  - `src/session/handleServices.js`: import `createSupportIncidentRepository` and add `supportIncidents: createSupportIncidentRepository(options),` to `repositories`.

- [ ] **Step 4: Run the tests and watch them pass.**
  - Run the Step 2 command plus `npx jest __tests__/moduleStateAllowlist.test.js __tests__/productionBindingStatic.test.js __tests__/outboxIntegrityScan.test.js`.
  - Expected: PASS. If a schema-version test elsewhere fails only because the version moved from 12 to 13, update its expected number.

- [ ] **Step 5: Commit.**
  - Also add a build-log row and a contract-map row: `support_incident_queue` is local-only, per-EA file, never synced as a domain table, and drained by RPC.
```bash
git add src/db/migrations.js src/db/repositories/syncOutboxRepository.js src/db/repositories/supportIncidentRepository.js src/session/handleServices.js __tests__/unsentSummary.test.js __tests__/supportIncidentRepository.test.js documentation/rls-sync-contract-map.md documentation/build-log.md
git commit -m "feat(incidents): local incident queue and the one unsent definition"
```

---

### Task 3: Install id, envelope, and draining in the sync pass

**Files:**
- Create: `src/services/installId.js`
- Create: `src/services/supportIncidents.js`
- Modify: `src/services/offlineSync.js`:
  - `createOutboxSyncEngine` accepts `supportIncidentRepository`;
  - `syncAll` drains after the outbox loop.
  - `getSyncStatus` reports `incidentReadyCount`.
- Modify: `src/context/OfflineContext.js`: one `hasUploadWork()` helper for the four scheduling checks; refresh status when `handle.discovery` settles.
- Modify: `src/session/handleServices.js`: pass `supportIncidentRepository: repositories.supportIncidents` to `createOutboxSyncEngine`.
- Modify: `__tests__/moduleStateAllowlist.test.js`: add `'src/services/installId.js:pending': 'device-level install id; one per phone, never per EA'`.
- Test: `__tests__/supportIncidentDrain.test.js` (new)
- Test: `__tests__/installId.test.js` (new)
- Test: `__tests__/OfflineContext.test.js` (extend; reuse its provider and fake-timer setup).

**Interfaces:**
- Consumes: `createSupportIncidentRepository` (Task 2); `getRuntimeDiagnostics()` from `src/utils/runtimeDiagnostics.js`. Its result has `.application.version`, `.application.build`, `.update.id` and `.backend.projectId`.
- Produces:
  - `export const INSTALL_ID_KEY = 'masi:device:installId';`
  - `export const getInstallId = () => Promise<string>`: created once with `uuid.v4`, then reused.
  - `export const resetInstallIdForTests = () => void`.
  - `export const buildIncidentEnvelope = async () => ({ appVersion, buildNumber, updateId, backend, installId })`.
  - `export const drainSupportIncidents = async ({ repository, supabaseClient, enqueueRequest, envelope, limit = 20 }) => ({ sent, rejected, failed })`.
  - The `syncAll` result gains `incidents: { sent, rejected, failed }` when a drain ran.
  - `getSyncStatus()` gains `incidentReadyCount: number` (0 when the engine has no incident repository).
- Consumes from Task 5 (not yet built when this task runs): `handle.discovery`, a promise that never rejects. OfflineContext must tolerate its absence (`handle.discovery?.then`).

- [ ] **Step 1: Write the failing tests.**

`__tests__/installId.test.js`:
```js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getInstallId, resetInstallIdForTests, INSTALL_ID_KEY } from '../src/services/installId';

beforeEach(async () => { resetInstallIdForTests(); await AsyncStorage.clear(); });

test('creates one UUID, stores it, and returns the same id to concurrent callers', async () => {
  const [a, b] = await Promise.all([getInstallId(), getInstallId()]);
  expect(a).toMatch(/^[0-9a-f-]{36}$/);
  expect(b).toBe(a);
  expect(await AsyncStorage.getItem(INSTALL_ID_KEY)).toBe(a);
});

test('reuses the stored id after a restart', async () => {
  await AsyncStorage.setItem(INSTALL_ID_KEY, '99999999-9999-4999-8999-999999999999');
  expect(await getInstallId()).toBe('99999999-9999-4999-8999-999999999999');
});

test('sign-out does not remove the install id', async () => {
  const id = await getInstallId();
  const { clearPersistedSession } = require('../src/services/persistedAuthSession');
  await clearPersistedSession();
  expect(await AsyncStorage.getItem(INSTALL_ID_KEY)).toBe(id);
});
```
  - If `clearPersistedSession` needs mocks to run in isolation, mirror the setup in the suite that already tests it (grep `__tests__` for `clearPersistedSession`).

`__tests__/supportIncidentDrain.test.js`:
  - Test `drainSupportIncidents` directly with a real-SQLite repository (as in Task 2) and a fake client: `{ rpc: jest.fn() }`, with `enqueueRequest = (fn) => fn()`.
  - The envelope is a fixed object: `{ appVersion: '1.2.0', buildNumber: '7', updateId: null, backend: 'segygjzpujphwvrubusm', installId: 'i-1' }`.
  - Cases:
    1. **Sends each pending row once**, as `rpc('report_mobile_support_incident', { p_kind, p_repeat_key: 'i-1:' + repeatKey, p_payload: { ...payload, ...envelope } })`. On `{ data: true, error: null }` the row leaves pending. `{ data: false }` (duplicate on the server) also counts as sent.
    2. **A `{ error: { code: '22023' } }` marks the row rejected.** The drain continues to the next row; the result is `{ sent: 1, rejected: 1, failed: 0 }`.
    3. **A `{ error: { code: '08006', message: 'Network request failed' } }` keeps the row pending** with `attempts: 1`. The drain stops: the second row is not attempted, and `rpc` is called once.
    4. **A thrown `StaleActorError`** (`src/session/staleActor.js`) from `enqueueRequest` propagates out of `drainSupportIncidents`. The row stays pending with attempts unchanged.
    5. **T12 deny-list.** Seed a child fixture with id `c-secret-child-id`, first name `Thandiwe` and note text `private note` in the domain tables. Seed an outbox row for it, and queue a `left_behind_unsent_work` incident built only from counts. Assert that `JSON.stringify(rpc.mock.calls)` (the whole request, `p_repeat_key` included) contains none of `c-secret-child-id`, `Thandiwe` or `private note`. Use the children insert helper from an existing children repository test. Task 5 case 10 repeats this end to end through the real discovery producer.
  - Then engine-level cases, through `createOutboxSyncEngine`. Copy the setup of an existing engine test that uses `test-support/supabaseSyncMock.js`; grep `__tests__` for `createOutboxSyncEngine(`.
    6. **With a live session and an empty outbox**, `syncAll()` calls the RPC for a queued incident, and the result has `incidents: { sent: 1, rejected: 0, failed: 0 }` and `success: true`.
    7. **With the RPC failing**, `syncAll()` still returns `success: true` (outbox success is unchanged), and the incident stays pending.
    8. **With no session** (`skippedNoSession`), the RPC is never called.
    9. **`syncTableByName('children')`** never calls the RPC.
    10. **`getSyncStatus()` reports `incidentReadyCount`**: 1 with one due incident; 0 after it is sent; 0 while a failed one is backed off.
  - Provider-level cases in `__tests__/OfflineContext.test.js`, each with an **empty domain outbox** (`readyCount: 0`, `inFlightCount: 0`) and a due incident (`incidentReadyCount: 1` from the mocked engine status):
    11. **Online at mount:** the initial status refresh schedules a background pass, and `syncAll` runs after the debounce (use fake timers, as the suite does for other triggers).
    12. **Offline, then reconnect:** no pass while offline; the NetInfo transition to online schedules one.
    13. **Discovery settles after mount:** the handle's `discovery` promise is a deferred one. Before it resolves, status reports 0 incidents and no pass runs. Resolve it with status now reporting 1, and a pass is scheduled.
    14. **Retry after an RPC failure:** after a pass whose status still reports a due incident, the post-pass refresh does not re-trigger (it uses `autoTrigger: false`, unchanged). The next 30-second periodic refresh does.

- [ ] **Step 2: Run and watch them fail.**
  - Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/installId.test.js __tests__/supportIncidentDrain.test.js`
  - Expected: FAIL, because the modules do not exist.

- [ ] **Step 3: Implement.**

`src/services/installId.js`:
```js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

export const INSTALL_ID_KEY = 'masi:device:installId';
let pending = null; // device-level: one install id per phone, shared by every EA

export const getInstallId = () => {
  if (!pending) {
    pending = (async () => {
      const existing = await AsyncStorage.getItem(INSTALL_ID_KEY);
      if (existing) return existing;
      const created = uuidv4();
      await AsyncStorage.setItem(INSTALL_ID_KEY, created);
      return created;
    })().catch((error) => { pending = null; throw error; });
  }
  return pending;
};

export const resetInstallIdForTests = () => { pending = null; };
```

`src/services/supportIncidents.js`:
```js
import { getRuntimeDiagnostics } from '../utils/runtimeDiagnostics';
import { getInstallId } from './installId';
import { isStaleActorError } from '../session/staleActor';

export const buildIncidentEnvelope = async () => {
  const diagnostics = getRuntimeDiagnostics();
  return {
    appVersion: diagnostics.application.version,
    buildNumber: diagnostics.application.build,
    updateId: diagnostics.update.id,
    backend: diagnostics.backend.projectId,
    installId: await getInstallId(),
  };
};

const INVALID_INCIDENT = '22023';

export const drainSupportIncidents = async ({
  repository, supabaseClient, enqueueRequest, envelope, limit = 20,
}) => {
  const outcome = { sent: 0, rejected: 0, failed: 0 };
  for (const row of await repository.listPending({ limit })) {
    let response;
    try {
      response = await enqueueRequest(() => supabaseClient.rpc('report_mobile_support_incident', {
        p_kind: row.kind,
        p_repeat_key: `${envelope.installId}:${row.repeatKey}`,
        p_payload: { ...row.payload, ...envelope },
      }));
    } catch (error) {
      if (isStaleActorError(error)) throw error;
      response = { error };
    }
    if (isStaleActorError(response?.error)) throw response.error;
    if (!response?.error) {
      await repository.markSent(row.id);
      outcome.sent += 1;
    } else if (response.error.code === INVALID_INCIDENT) {
      await repository.markRejected(row.id, response.error.message || INVALID_INCIDENT);
      outcome.rejected += 1;
    } else {
      // Transport or auth trouble: keep it, stop this pass, retry on a later pass.
      await repository.markAttemptFailed(row.id, response.error.message || 'Incident report failed');
      outcome.failed += 1;
      break;
    }
  }
  return outcome;
};
```
  - If `isStaleActorError` is not exported from `src/session/staleActor.js`, use the helper `offlineSync.js` imports under that name.

`src/services/offlineSync.js`:
  - Add `supportIncidentRepository = null` to `createOutboxSyncEngine`'s destructured options.
  - In `syncAll`, after the outbox `for` loop and still inside the outer `try` (so a `StaleActorError` reaches the existing catch that sets `abortedStaleActor`), add:
```js
      if (!tableName && supportIncidentRepository) {
        try {
          result.incidents = await drainSupportIncidents({
            repository: supportIncidentRepository, supabaseClient, enqueueRequest,
            envelope: await buildIncidentEnvelope(),
          });
        } catch (error) {
          if (isStaleActorError(error)) throw error;
          // Support reporting never changes whether the upload pass succeeded.
          console.warn('syncAll: support incident drain failed:', errorMessage(error));
        }
      }
```
  - This is reached only past the `!session` early return, so a pass with no session never drains.
  - `getSyncStatus` adds the due-incident count. A failure to count must not break status:
```js
  const getSyncStatus = async (options = {}) => {
    const [status, meta, incidentReadyCount] = await Promise.all([
      outboxRepository.getSyncStatus(options),
      stateRepository.getSyncMeta(),
      supportIncidentRepository
        ? supportIncidentRepository.countDue().catch((error) => {
          if (isStaleActorError(error)) throw error;
          return 0; // support reporting never breaks the status the EA sees
        })
        : 0,
    ]);
    return {
      ...status,
      incidentReadyCount,
      lastSyncTime: meta.lastSyncTime,
      lastSuccessfulSyncTime: meta.lastSuccessfulSyncTime || null,
    };
  };
```

`src/context/OfflineContext.js`:
  - Add `const incidentReadyCountRef = useRef(0);` beside `readyCountRef`, and set it in `refreshSyncStatus` from `status.incidentReadyCount || 0`.
  - Add one helper and use it for all four scheduling checks (status refresh with `autoTrigger`, reconnect, foreground, background). Each `(readyCountRef.current > 0 || inFlightCountRef.current > 0)` becomes `hasUploadWork()`:
```js
  // Domain rows and queued support incidents both need an upload pass. Incidents are never
  // shown to the EA and never count as unsent work; they only decide whether a pass runs.
  const hasUploadWork = () => (
    readyCountRef.current > 0 || inFlightCountRef.current > 0 || incidentReadyCountRef.current > 0
  );
```
  - Discovery queues incidents after the provider has mounted, so refresh once it settles:
```js
  useEffect(() => {
    let active = true;
    handle.discovery?.then(() => { if (active && handle.isCurrent()) void refreshSyncStatus(); });
    return () => { active = false; };
  }, [handle, refreshSyncStatus]);
```
  - Do not change `unsyncedCount`, `readyCount`, or any EA-facing number.

- [ ] **Step 4: Run and watch them pass.**
  - Run the Step 2 command plus `npx jest __tests__/moduleStateAllowlist.test.js __tests__/sharedClientStatic.test.js` and every existing suite matching `offlineSync`: `npx jest offlineSync`.
  - Expected: PASS.

- [ ] **Step 5: Commit.** Include a build-log row.
```bash
git add src/services/installId.js src/services/supportIncidents.js src/services/offlineSync.js src/context/OfflineContext.js src/session/handleServices.js __tests__/installId.test.js __tests__/supportIncidentDrain.test.js __tests__/moduleStateAllowlist.test.js __tests__/OfflineContext.test.js documentation/build-log.md
git commit -m "feat(incidents): install id, envelope, and draining queued incidents in the sync pass"
```

---

### Task 4: `foreign_owner_in_file` incident from the integrity scan (T8, incident half)

**Files:**
- Modify: `src/db/repositories/syncOutboxRepository.js` (`quarantineForeignOwners`)
- Test: `__tests__/outboxIntegrityScan.test.js` (extend)

**Interfaces:**
- Consumes: `enqueueSupportIncident(txn, { kind, repeatKey, payload })` and `incidentRepeatKey(...parts)` (Task 2).
- Produces: one queued `foreign_owner_in_file` incident per distinct foreign set. The local repeat key is `incidentRepeatKey('foreign', ...sortedForeignOutboxIds)`; the payload is `{ foreignTotal, foreignByTable }`.

- [ ] **Step 1: Write the failing tests** (add to `outboxIntegrityScan.test.js`, reusing its fixture helpers):
  1. **At open:** a file owned by A holds an outbox row owned by B. After `requestOpen({ userId: A, openDatabase: sqlite.openDatabaseAsync })`:
     - `support_incident_queue` holds exactly one `foreign_owner_in_file` row;
     - its `repeat_key` equals `incidentRepeatKey('foreign', <that row's id>)`, and does not contain the row's id;
     - its `payload` parses to `{ foreignTotal: 1, foreignByTable: { children: 1 } }` (use the table the fixture uses).
  2. **Before every pass:** run `syncAll` twice on the open handle with a live session. There is still exactly one queued incident; the scan re-finds the same terminal rows, so the repeat key is unchanged.
  3. **The queued row carries no record ids:** neither its payload nor its repeat key contains the foreign row's `id`, its `record_id`, or B's user id.
  4. **No foreign rows:** a file with only A-owned rows queues nothing.
  5. **A grown foreign set is a new situation.** After case 1, add a second B-owned row whose id sorts *after* the first (so the smallest id is unchanged), then run the scan again. A second `foreign_owner_in_file` row is queued with `foreignTotal: 2`.

- [ ] **Step 2: Run and watch them fail.**
  - Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/outboxIntegrityScan.test.js`
  - Expected: the new cases FAIL; nothing is queued.

- [ ] **Step 3: Implement.** Inside the `runWrite` task in `quarantineForeignOwners`, after the quarantine loop and before writing `integrity_scan_last`:
```js
      if (foreign.length > 0) {
        // Same transaction as the quarantine: the report exists exactly when the quarantine does.
        // The key covers the whole set (a grown set is a new situation) and hides every id.
        await enqueueSupportIncident(txn, {
          kind: 'foreign_owner_in_file',
          repeatKey: incidentRepeatKey('foreign', ...foreign.map((row) => row.id).sort()),
          payload: { foreignTotal: foreign.length, foreignByTable: byTable },
        });
      }
```
  - Import `enqueueSupportIncident` and `incidentRepeatKey` from `./supportIncidentRepository`.
  - Do not remove the existing `console.error` / `captureOperationalError` lines.

- [ ] **Step 4: Run and watch them pass.** Run the Step 2 command plus `npx jest __tests__/signedInHandle.test.js`. Expected: PASS.

- [ ] **Step 5: Commit.** Include a build-log row.
```bash
git add src/db/repositories/syncOutboxRepository.js __tests__/outboxIntegrityScan.test.js documentation/build-log.md
git commit -m "feat(incidents): report foreign-owned outbox rows found by the integrity scan"
```

---

### Task 5: Sign-in discovery and the left-behind and legacy incidents (T10, T11 incident half, T12)

**Files:**
- Create: `src/session/fileDiscovery.js`
- Modify: `src/session/signedInHandle.js`: `requestOpen` gains `discover`, starts it detached at publication and exposes it as `handle.discovery`; new export `readUnderFileFence`
- Test: `__tests__/fileDiscovery.test.js` (new)

**Interfaces:**
- Consumes: `readUnsentSummary(db)` and `incidentRepeatKey(...parts)` (Task 2), `drainSupportIncidents` (Task 3, test only), `LEGACY_DATABASE_NAME` and `DATABASE_FILE_PREFIX` from `src/db/client.js`, `handle.services.repositories.supportIncidents.enqueue` (Task 2), `handle.isOpen()` and `handle.isCurrent()`.
- Produces:
  - `export const listDatabaseNames = () => string[]`. Files in `new Directory(Paths.document, 'SQLite')`; returns `[]` when the directory is missing or listing throws.
  - `export const readOtherDatabase = async ({ name, openDatabase }) => ({ name, readable: true, unsent } | { name, readable: false })`.
  - `export const discoverOtherDatabases = async ({ signedInUserId, listNames, openDatabase, isActive = () => true, readUnderFence = (name, task) => task() }) => Array<{ name, kind: 'ea' | 'legacy', strandedUserId: string | null, readable, unsent? }>`. It stops admitting files as soon as `isActive()` is false.
  - `export const incidentsFromDiscovery = (files, now = new Date()) => Array<{ kind, repeatKey, payload }>` (pure).
  - `export const discoverAndQueueIncidents = async ({ handle, listNames = listDatabaseNames, openDatabase = openDatabaseAsync, now }) => ({ queued: number })`.
  - `requestOpen({ ..., discover })`; a published handle has `handle.discovery: Promise<void>` that never rejects.
  - From `signedInHandle.js`: `export const readUnderFileFence = (fileName, task) => Promise` (ruling 6).

- [ ] **Step 1: Write the failing tests** in `__tests__/fileDiscovery.test.js`.
  - Use the real SQLite engine and the setup from `outboxIntegrityScan.test.js`.
  - Ids: A = `1111…`, B = `2222…`, C = `3333…`.
  - Helper `seedFile(name, ownerId, rows)`: open the file with `sqlite.openDatabaseAsync`, `runMigrations`, set `file_owner_user_id` (skip this for the legacy `masi.db`), insert outbox rows, then `closeAsync()`.
  - Pass `listNames: () => names` explicitly.
  1. **T11/T12 left-behind.**
     - Seed `masi-<A>.db` with two unsent rows (`children`, created `2026-10-15T00:00:00.000Z`; `time_entries`, created `2026-10-16T00:00:00.000Z`).
     - Call `discoverAndQueueIncidents({ handle: <B's open handle>, listNames: () => [`masi-${A}.db`, `masi-${B}.db`], openDatabase: sqlite.openDatabaseAsync, now: new Date('2026-10-17T00:00:00.000Z') })`.
     - B's `support_incident_queue` holds one `left_behind_unsent_work` row with:
       - `repeat_key` = `incidentRepeatKey(A, <oldest outbox id>, '2026-10-15T00:00:00.000Z')`;
       - payload `{ strandedUserId: A, unsentByTable: { children: 1, time_entries: 1 }, oldestUnsentAgeHours: 48 }`.
  2. **Once per repeat key.** Running discovery again queues nothing new (still one row).
  3. **A new situation reports again.**
     - Mark A's oldest row synced: delete it from A's file to simulate an upload, as the engine does on success.
     - Add a new unsent row, then discover again.
     - Expect a second `left_behind_unsent_work` row with a different repeat key.
  3b. **The same outbox id, recreated after an upload, is a new situation.**
     - Seed A's file with one row `children:<child id>:update` created `2026-10-15T00:00:00.000Z`; discover (one incident).
     - Delete it (the upload), then insert the same id again with `created_at` `2026-10-16T09:00:00.000Z` (a later edit); discover again.
     - Expect a second `left_behind_unsent_work` row.
  4. **Legacy `masi.db` with unsent rows.** Queues one `legacy_shared_file_unsent` row with:
     - `repeat_key` = `incidentRepeatKey('legacy', <oldest id>, <its created_at>)`;
     - payload `{ unsentByTable, oldestUnsentAgeHours }`, with no `strandedUserId` key.
  5. **No unsent rows** in A's file: nothing is queued.
  6. **The signed-in EA's own file is never read**, even if it has unsent rows. Spy on the `openDatabase` passed in and assert it is never called with `masi-${B}.db`.
  7. **An unreadable file.** `masi-${C}.db` is a text file with garbage bytes; write it with `fs` into the engine's temp path. If the engine has no path helper, pass an `openDatabase` that rejects for that name.
     - Discovery still queues A's incident.
     - It queues nothing for C, and it does not throw.
  8. **Files are read-only and never deleted (T10).**
     - After discovery, A's file (and `masi.db`, if seeded) still exists, and its outbox row count is unchanged.
     - The connection discovery opened ran `PRAGMA query_only = ON`: wrap `openDatabase` and record `execAsync` calls.
  9. **Names that are not database files are ignored:** `masi-<A>.db-wal`, `masi-<A>.db-shm`, `notes.txt`, `masi-notauuid.db`.
  10. **Deny-list end to end (T12).**
      - Seed A's file with a child named `Thandiwe`, id `c-secret-child-id` and a note `private note`, plus its outbox row with the id the repositories really produce: `outboxRecordId('children', 'c-secret-child-id', 'insert')` from `syncOutboxRepository.js`.
      - Discover into B's queue, then drain it with `drainSupportIncidents` (Task 3) and a fake `rpc`.
      - Neither the queued row (`select * from support_incident_queue`, stringified) nor `JSON.stringify(rpc.mock.calls)` contains `c-secret-child-id`, `Thandiwe`, `private note` or the outbox id.
  11. **Wiring.**
      - `requestOpen({ userId: B, openDatabase: sqlite.openDatabaseAsync, discover })` with a `jest.fn()` `discover` calls it once with `{ handle }` after the handle is current.
      - A `discover` that rejects does not reject `requestOpen`, and the handle stays open. `handle.discovery` resolves (it never rejects). Silence the expected `console.error`.
      - With the real discovery, `await handle.discovery` resolves after the incidents are queued.
  12. **Sign-out during discovery (Review Focus 7).**
      - Seed `masi-<A>.db` and `masi-<C>.db` with unsent rows. Open B with the real `discoverAndQueueIncidents`, `listNames: () => [A file, C file]`, and an `openDatabase` wrapper that records every name it opens and every `closeAsync`, and that suspends the open of A's file on a deferred promise. Pass these in through a `discover` that calls `discoverAndQueueIncidents({ handle, listNames, openDatabase: wrapper })`.
      - While A's read is suspended, call `requestOpen({ userId: A, openDatabase: sqlite.openDatabaseAsync })`. After flushing microtasks it has not resolved: it waits for the read on A's file.
      - Release the deferred open. A's `requestOpen` resolves to A's handle. The wrapper never opened C's file, every connection it opened was closed, and B's queue received nothing.
  13. **Discovery waits for a pending disposal.** Close a handle on A's file and, before its disposal settles, start discovery for B over A's file: the wrapper's open of A's file happens only after `whenDisposed(A file)` resolves. If the existing handle tests have a helper that stalls disposal, reuse it; otherwise assert ordering with the recorded call sequence.
  14. **Sign-out while discovery waits at the fence.** Stall A's disposal (as in case 13), start B's discovery over A's file, sign B out, then `requestOpen` A. Release the disposal. The wrapper never opens A's file for discovery, and A's `requestOpen` resolves right after the disposal settles.
  15. **A file marked failed is never read.** Drive the existing bootstrap-failure-plus-cleanup-failure path that adds A's file to `failedFiles` (reuse the `signedInHandle.test.js` case that asserts `HANDLE_DISPOSE_FAILED`). Then `readUnderFileFence(A file, task)` rejects with `HandleDisposeFailedError` and `task` is never called; discovery over A's file opens nothing and queues nothing.

- [ ] **Step 2: Run and watch them fail.**
  - Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/fileDiscovery.test.js`
  - Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Implement.**

`src/session/fileDiscovery.js`:
```js
import { openDatabaseAsync } from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system/next';
import { DATABASE_FILE_PREFIX, LEGACY_DATABASE_NAME, databaseNameForUser } from '../db/client';
import { readUnsentSummary } from '../db/repositories/syncOutboxRepository';
import { incidentRepeatKey } from '../db/repositories/supportIncidentRepository';
import { readUnderFileFence } from './signedInHandle';
import { isStaleActorError } from './staleActor';

const EA_FILE = new RegExp(`^${DATABASE_FILE_PREFIX}([0-9a-f-]{36})\\.db$`, 'i');

// expo-sqlite's default directory is <documents>/SQLite on iOS and Android.
export const listDatabaseNames = () => {
  try {
    const directory = new Directory(Paths.document, 'SQLite');
    if (!directory.exists) return [];
    return directory.list().filter((entry) => entry instanceof File).map((entry) => entry.name);
  } catch (error) {
    console.warn('[FileDiscovery] could not list database files:', error?.message);
    return [];
  }
};

// Read-only and short-lived: another EA's file is never migrated, written, renamed or deleted.
export const readOtherDatabase = async ({ name, openDatabase }) => {
  let db = null;
  try {
    db = await openDatabase(name, { useNewConnection: true });
    await db.execAsync('PRAGMA query_only = ON');
    await db.execAsync('PRAGMA busy_timeout = 2000');
    return { name, readable: true, unsent: await readUnsentSummary(db) };
  } catch (error) {
    console.warn('[FileDiscovery] unreadable database file skipped:', name, error?.message);
    return { name, readable: false };
  } finally {
    try { await db?.closeAsync(); } catch (_) { /* best effort */ }
  }
};

export const discoverOtherDatabases = async ({
  signedInUserId, listNames, openDatabase,
  isActive = () => true, readUnderFence = (name, task) => task(),
}) => {
  const ownName = databaseNameForUser(signedInUserId);
  const results = [];
  for (const name of listNames()) {
    const eaMatch = EA_FILE.exec(name);
    const isLegacy = name === LEGACY_DATABASE_NAME;
    if ((!eaMatch && !isLegacy) || name === ownName) continue;
    // After sign-out the signed-out EA's discovery opens nothing more (spec §4.3 storage boundary).
    if (!isActive()) break;
    // Re-check inside the fence: waiting for a disposal can outlast the sign-in that queued this read.
    const read = await readUnderFence(name, () => (
      isActive() ? readOtherDatabase({ name, openDatabase }) : { name, readable: false }
    )).catch(() => ({ name, readable: false })); // that file is fenced as failed: leave it alone
    results.push({ ...read, kind: isLegacy ? 'legacy' : 'ea', strandedUserId: eaMatch ? eaMatch[1] : null });
  }
  return results;
};

const ageHours = (createdAt, now) => Math.max(0, Math.floor((now.getTime() - Date.parse(createdAt)) / 3_600_000));

export const incidentsFromDiscovery = (files, now = new Date()) => files
  .filter((file) => file.readable && file.unsent.total > 0)
  .map(({ kind, strandedUserId, unsent }) => {
    const counts = {
      unsentByTable: unsent.byTable,
      oldestUnsentAgeHours: ageHours(unsent.oldestCreatedAt, now),
    };
    // Ruling 2: the oldest row's id and created_at identify this episode; the key hides both.
    return kind === 'legacy'
      ? {
        kind: 'legacy_shared_file_unsent',
        repeatKey: incidentRepeatKey('legacy', unsent.oldestId, unsent.oldestCreatedAt),
        payload: counts,
      }
      : {
        kind: 'left_behind_unsent_work',
        repeatKey: incidentRepeatKey(strandedUserId, unsent.oldestId, unsent.oldestCreatedAt),
        payload: { strandedUserId, ...counts },
      };
  });

export const discoverAndQueueIncidents = async ({
  handle, listNames = listDatabaseNames, openDatabase = openDatabaseAsync, now = new Date(),
}) => {
  const isActive = () => handle.isOpen() && handle.isCurrent();
  const files = await discoverOtherDatabases({
    signedInUserId: handle.userId, listNames, openDatabase, isActive, readUnderFence: readUnderFileFence,
  });
  if (!isActive()) return { queued: 0 };
  let queued = 0;
  for (const incident of incidentsFromDiscovery(files, now)) {
    try {
      const result = await handle.services.repositories.supportIncidents.enqueue(incident);
      if (result.queued) queued += 1;
    } catch (error) {
      if (isStaleActorError(error)) return { queued };
      throw error;
    }
  }
  return { queued };
};
```
  - Before relying on `entry instanceof File` and `entry.name`, check the installed expo-file-system 19 `Directory.list()` typings (`node_modules/expo-file-system/build/FileSystem.d.ts`). If `name` is not a property, derive it from `entry.uri`'s last path segment.
  - In jest, `expo-file-system/next` may be a jest-expo mock. `listDatabaseNames` must tolerate that by returning `[]`; tests always pass `listNames`.

`src/session/signedInHandle.js`:
  - Require `fileDiscovery` *inside* `requestOpen`, as `handleServices` is required there. `fileDiscovery` imports `readUnderFileFence` from this module, so a top-level import would be a cycle.
  - Add `discover` to the destructured options.
  - New export, next to `whenDisposed`:
```js
// A short read of another EA's file (sign-in discovery) joins that file's fence: it starts
// after any pending disposal, and a same-file requestOpen waits for it as it waits for a
// disposal. A failed disposal stays failed: the read never runs and the fence keeps rejecting.
// failedFiles is part of the fence too (a bootstrap whose cleanup failed registers no disposal).
export const readUnderFileFence = (fileName, task) => {
  const prior = whenDisposed(fileName);
  const run = prior.then(() => {
    if (failedFiles.has(fileName)) throw new HandleDisposeFailedError();
    return task();
  });
  trackDisposal(fileName, prior.then(() => run.then(() => {}, () => {})));
  return run;
};
```
  - Immediately before `created.publish();` (after the generation check):
```js
      // §4.4: discovery never delays sign-in, and a failure never affects the open handle.
      // It starts on a microtask, so it always runs after publication.
      const runDiscovery = discover || require('./fileDiscovery').discoverAndQueueIncidents;
      handle.discovery = Promise.resolve()
        .then(() => runDiscovery({ handle }))
        .then(() => {}, (error) => { report(error, 'file_discovery_failed'); });
```
  - Check that `report` is the observability helper already in scope in `signedInHandle.js`; use whatever that module uses for `handle_dispose_failed`.

- [ ] **Step 4: Run and watch them pass.**
  - Run the Step 2 command, then the whole suite: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest --silent`.
  - Expected: PASS. Every existing `requestOpen` test now also runs production discovery, which must be a no-op in jest. If a suite fails because of it, fix `listDatabaseNames`'s tolerance, not the suite.

- [ ] **Step 5: Commit.** Include a build-log row.
```bash
git add src/session/fileDiscovery.js src/session/signedInHandle.js __tests__/fileDiscovery.test.js documentation/build-log.md
git commit -m "feat(incidents): discover other EAs' files at sign-in and report left-behind work"
```

---

### Task 6: Sign-out questions (T13)

**Files:**
- Modify: `src/context/TimeTrackingContext.js`: `handleSignOut` returns `true` when it closed the entry and `false` on every other path (not clocked in, in flight, Settings detour, entry already closed, error).
- Create: `src/hooks/useSignOutFlow.js`
- Create: `src/components/profile/SignOutSheets.js`
- Modify: `src/screens/main/ProfileScreen.js`
- Test: `__tests__/signOutFlow.test.js` (new)
- Test: existing Profile suites (`__tests__/ProfileScreen.releaseMetadata.test.js`, `__tests__/profileCaptureModeToggle.test.js`, `__tests__/profileGearA11y.test.js`). They now need `useTimeTracking`, `useOffline` and `useSignedInEA` mocked; add the same `jest.mock` lines they use for other contexts.
- Test: `__tests__/useTimeTracking.plan5.test.js` or `__tests__/useTimeTracking.integration.test.js`: add assertions on the return values.

**Interfaces:**
- Consumes: `useAuth().signOut`, `useTimeTracking()` (`isSignedIn`, `handleSignOut`), `useOffline()` (`isOnline`, `syncNow`), `useSignedInEA().repositories.syncOutbox.countUnsent`.
- Produces:
  - `useSignOutFlow({ signOut, countUnsent, isClockedIn, clockOut, isOnline, syncNow })` returns `{ step: null | 'clocked_in' | 'unsent', unsentCount: number | null, busy: null | 'clocking_out' | 'uploading' | 'signing_out', message: string | null, start, clockOutNow, stayClockedIn, tryUploadNow, recheck, signOutAnyway, cancel }`. `unsentCount` is `null` when the count could not be read.
  - `SignOutSheets` props: the hook's return value plus `isOnline`.

- [ ] **Step 1: Write the failing tests.**

  - `__tests__/signOutFlow.test.js` renders a tiny harness component that calls `useSignOutFlow` with injected fakes and renders `<SignOutSheets>`. Wrap it in `PaperProvider` and `SafeAreaProvider`, as `__tests__/ClockInBeforeSessionSheet.test.js` does.
  - The `countUnsent` fake reads a mutable counter.

```js
const setup = ({ clockedIn = false, unsent = 0, online = true, clockOutOk = true, uploadClears = false } = {}) => {
  const state = { unsent };
  const deps = {
    signOut: jest.fn(async () => ({ error: null })),
    countUnsent: jest.fn(async () => ({ total: state.unsent, byTable: {} })),
    isClockedIn: clockedIn,
    clockOut: jest.fn(async () => { if (clockOutOk) state.unsent += 1; return clockOutOk; }),
    isOnline: online,
    syncNow: jest.fn(async () => { if (uploadClears) state.unsent = 0; return { success: true }; }),
  };
  const utils = render(<Providers><Harness deps={deps} /></Providers>);
  return { ...utils, deps, state };
};
```
  - Cases, driving with `fireEvent.press(getByText('Sign Out'))` (the harness renders a button calling `start`):
    1. **T13 order.** Clocked in, 2 unsent:
       - the first sheet shows "You're still clocked in.";
       - tapping "Clock out now" calls `clockOut`;
       - the next sheet reads "3 items haven't uploaded yet. If you sign out, they'll upload next time you sign in on this phone." The count went up because clocking out created an unsent row;
       - `signOut` is not called yet.
    2. **Nothing to ask.** Not clocked in, 0 unsent: no sheet appears, and `signOut` is called once.
    3. **Stay clocked in.** "Stay clocked in and sign out" with 0 unsent: `signOut` is called, and `clockOut` is not.
    4. **Clock-out does not complete (Review Focus 2).** `clockOutOk: false`:
       - `signOut` is not called;
       - the clock-out sheet stays visible with the text "Couldn't clock out. Try again, or choose another option.".
    5. **Offline (Review Focus 1).** 1 unsent, offline:
       - the upload button reads "No connection" and is disabled (pressing it does not call `syncNow`);
       - "Sign out anyway" calls `signOut`;
       - the singular copy reads "1 item hasn't uploaded yet. …".
    6. **Upload succeeds.** 2 unsent, `uploadClears: true`: "Try uploading now" calls `syncNow({ force: true })`, then `signOut` is called without another tap.
    7. **Upload leaves work behind.** 2 unsent, the upload clears nothing but `state.unsent` is set to 1 inside `syncNow`: the sheet updates to "1 item hasn't uploaded yet" and `signOut` is not called.
    8. **Cancel** on either sheet closes it and never calls `signOut`.
    9. **Busy state.** While `syncNow` is pending (a deferred promise), the upload button shows "Uploading…" and repeated presses call `syncNow` once.
    10. **Cancel during upload (Review Focus 6).** 2 unsent; `syncNow` is a deferred promise and `uploadClears: true`. Press "Try uploading now", then "Cancel". Resolve the deferred upload. `signOut` is never called, and no sheet is visible.
    11. **Dismiss during clock-out.** Clocked in; `clockOut` is a deferred promise resolving `true`. Press "Clock out now", then dismiss the sheet through `BottomSheet`'s `onDismiss` (find the backdrop the way `ClockInBeforeSessionSheet.test.js` does, or call the sheet's `onDismiss` prop through `UNSAFE_getByType(BottomSheet).props.onDismiss()`). Resolve the clock-out. The unsent sheet never appears and `signOut` is never called.
    12. **A new attempt after a cancelled one works.** After case 10's cancel (before resolving the old upload), press "Sign Out" again with 0 unsent: `signOut` is called once. Resolving the old upload afterwards does not call it a second time.
    13. **The unsent count cannot be read.** `countUnsent` rejects with `new HandleDisposeFailedError()` from `src/session/staleActor.js`, as the reader does after a failed disposal. Pressing "Sign Out" shows "Couldn't check for work that hasn't uploaded." with **Try again**, **Sign out anyway** and **Cancel**; `signOut` is not called yet. "Sign out anyway" then calls `signOut` once. In a second render, make `countUnsent` succeed with 0 on the second call: "Try again" signs out.
    14. **A stale-actor count failure does nothing.** `countUnsent` rejects with `StaleActorError`: no sheet, no `signOut` call.
  - Clock-out return values: add to the existing `useTimeTracking` suite:
    - `await result.current.handleSignOut()` resolves `true` after a normal clock-out;
    - it resolves `false` when not clocked in;
    - it resolves `false` when `getCurrentPosition` resolves `{ cancelled: true }`.

- [ ] **Step 2: Run and watch them fail.**
  - Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/signOutFlow.test.js useTimeTracking`
  - Expected: FAIL, because the modules do not exist and `handleSignOut` returns `undefined`.

- [ ] **Step 3: Implement.**

`TimeTrackingContext.handleSignOut`: every early `return;` becomes `return false;`. Add `return true;` right after the success snackbar. The `catch` path returns `false`.

`src/hooks/useSignOutFlow.js`:
```js
import { useCallback, useEffect, useRef, useState } from 'react';
import { isStaleActorError } from '../session/staleActor';

export const UNSENT_CHECK_FAILED = "Couldn't check for work that hasn't uploaded.";

// Spec §7.1: clock-out question first (clocking out creates unsent work), then unsent work,
// then the §4.3 close. Dependencies are injected so the order is testable without the app tree.
// Ruling 9: each attempt has a generation. Cancel, dismissal and unmount end it, and every
// continuation after an await checks it, so a cancelled attempt can never sign the EA out.
export function useSignOutFlow({ signOut, countUnsent, isClockedIn, clockOut, isOnline, syncNow }) {
  const [step, setStep] = useState(null);
  const [unsentCount, setUnsentCount] = useState(0);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const attempt = useRef(0);
  const busyRef = useRef(null);
  useEffect(() => () => { attempt.current += 1; }, []);
  const setBusyState = (value) => { busyRef.current = value; setBusy(value); };
  const isLive = (mine) => attempt.current === mine;

  const finish = useCallback(async (mine) => {
    if (!isLive(mine)) return;
    attempt.current += 1; // the attempt ends here: no later continuation may act on it
    setBusyState('signing_out');
    setStep(null);
    try { await signOut(); } finally { setBusyState(null); } // on success the signed-in tree unmounts
  }, [signOut]);

  const goToUnsent = useCallback(async (mine) => {
    let total;
    try {
      ({ total } = await countUnsent());
    } catch (error) {
      if (!isLive(mine) || isStaleActorError(error)) return; // a sign-out is already under way
      // Never treat a failed count as zero: ask, and keep an explicit way out.
      setUnsentCount(null);
      setMessage(UNSENT_CHECK_FAILED);
      setStep('unsent');
      return;
    }
    if (!isLive(mine)) return;
    if (total === 0) { await finish(mine); return; }
    setUnsentCount(total);
    setMessage(null);
    setStep('unsent');
  }, [countUnsent, finish]);

  const start = useCallback(async () => {
    if (busyRef.current) return;
    attempt.current += 1;
    const mine = attempt.current;
    setMessage(null);
    if (isClockedIn) { setStep('clocked_in'); return; }
    await goToUnsent(mine);
  }, [isClockedIn, goToUnsent]);

  const clockOutNow = useCallback(async () => {
    if (busyRef.current) return;
    const mine = attempt.current;
    setBusyState('clocking_out');
    let closed = false;
    try { closed = await clockOut(); } finally { if (isLive(mine)) setBusyState(null); }
    if (!isLive(mine)) return;
    if (!closed) { setMessage("Couldn't clock out. Try again, or choose another option."); return; }
    await goToUnsent(mine);
  }, [clockOut, goToUnsent]);

  const stayClockedIn = useCallback(() => goToUnsent(attempt.current), [goToUnsent]);
  const recheck = useCallback(() => goToUnsent(attempt.current), [goToUnsent]);

  const tryUploadNow = useCallback(async () => {
    if (busyRef.current || !isOnline) return;
    const mine = attempt.current;
    setBusyState('uploading');
    try { await syncNow({ force: true }); } finally { if (isLive(mine)) setBusyState(null); }
    if (!isLive(mine)) return;
    await goToUnsent(mine);
  }, [isOnline, syncNow, goToUnsent]);

  const signOutAnyway = useCallback(() => finish(attempt.current), [finish]);

  // Reached by Cancel, backdrop and Android Back (BottomSheet onDismiss). An upload or
  // clock-out already running finishes; the flow just stops acting on its result.
  const cancel = useCallback(() => {
    attempt.current += 1;
    setStep(null);
    setMessage(null);
    setBusyState(null);
  }, []);

  return {
    step, unsentCount, busy, message,
    start, clockOutNow, stayClockedIn, tryUploadNow, recheck, signOutAnyway, cancel,
  };
}
```
  - React 18 and later (this app runs React 19) ignore state updates after unmount without warning, so the hook needs no `mounted` ref; the generation already stops every continuation.
  - `cancel` clears `busy`, so a new `start` is possible right away even if the old upload is still running. `syncNow` itself coalesces concurrent passes (`activeSyncPromise`), so a second upload tap cannot double-run a pass.

`src/components/profile/SignOutSheets.js`:
  - Follow `src/components/sessions/ClockInBeforeSessionSheet.js` exactly: the same `BottomSheet` props, the primary/secondary/cancel `Pressable` styles, `accessibilityRole="button"`, and labels.
  - Two `BottomSheet`s:
    - `visible={step === 'clocked_in'}`: title "You're still clocked in."; buttons **Clock out now** (primary; label "Clocking out…" while `busy === 'clocking_out'`), **Stay clocked in and sign out** (secondary), **Cancel**. Show `message` above the buttons when set.
    - `visible={step === 'unsent'}` when `unsentCount === null` (the count failed): title is `message` ("Couldn't check for work that hasn't uploaded."); subtitle "If you sign out, anything not uploaded stays on this phone until you sign in here again."; buttons **Try again** (primary, calls `recheck`), **Sign out anyway** (secondary), **Cancel**.
    - `visible={step === 'unsent'}` with a number:
      - Title `${unsentCount} ${unsentCount === 1 ? "item hasn't" : "items haven't"} uploaded yet.`
      - Subtitle "If you sign out, they'll upload next time you sign in on this phone."
      - Buttons:
        - **Try uploading now** (primary). Disabled with label "No connection" when `!isOnline`. Label "Uploading…" with `ActivityIndicator` while `busy === 'uploading'`.
        - **Sign out anyway** (secondary).
        - **Cancel**.
    - Both sheets `onDismiss={cancel}`.
  - T13 asserts the full sentence. Render it so `getByText` can find it: either title and subtitle combined in one `Text`, or adjust the test to match two texts. Keep the spec's exact words either way.

`ProfileScreen.js`:
```js
const { services, repositories } = useSignedInEA();
const { isSignedIn, handleSignOut } = useTimeTracking();
const { isOnline, syncNow } = useOffline();
const signOutFlow = useSignOutFlow({
  signOut, countUnsent: repositories.syncOutbox.countUnsent,
  isClockedIn: isSignedIn, clockOut: handleSignOut, isOnline, syncNow,
});
```
  - Import `useTimeTracking` from `../../hooks/useTimeTracking`, `useOffline` from `../../context/OfflineContext`, and `useSignedInEA` from `../../context/SignedInEAContext`. If Profile already uses `useSignedInEA`, reuse its value.
  - The Sign Out button: `onPress={signOutFlow.start}`, `loading={signOutFlow.busy === 'signing_out'}`.
  - Render `<SignOutSheets {...signOutFlow} isOnline={isOnline} />` at the end of the screen, outside the `ScrollView`.

- [ ] **Step 4: Run and watch them pass.**
  - Run the Step 2 command, the Profile suites (`npx jest Profile profile`), then the full unit suite.
  - Expected: PASS.

- [ ] **Step 5: Commit.** Include a build-log row with the copy used, marked provisional (spec §7.1: "Copy is provisional and gets a wording pass with Jim").
```bash
git add src/context/TimeTrackingContext.js src/hooks/useSignOutFlow.js src/components/profile/SignOutSheets.js src/screens/main/ProfileScreen.js __tests__/signOutFlow.test.js __tests__/*Profile*.test.js __tests__/profile*.test.js __tests__/useTimeTracking*.test.js documentation/build-log.md
git commit -m "feat(sign-out): ask about an open shift and unsent work before signing out"
```

---

### Task 7: Standing documentation closure

**Files:**
- Modify: `CONTEXT.md`:
  - "Devices and sync": add **Support incident** (a counts-only report a phone sends so support can act; never child data) and **Install id**.
  - Confirm "Unsent" and "Left-behind work" exist; add them if missing.
- Modify: `documentation/rls-sync-contract-map.md`, "Signed-in EA handle" section:
  - replace the line "D1–D6 … after Plan 3" with the device checks still open;
  - add an "Incidents" paragraph: three kinds, local queue, drain point, repeat keys, deny-list rule.
- Modify: `documentation/ROADMAP.md`:
  - under item 5's "Still open before the field", replace the Plan 3 bullet with what remains: hosted apply of `20261017120000_mobile_support_incidents.sql` (needs Jim's yes); device checks D1–D7 on the build intended to ship; a wording pass on the sign-out copy with Jim;
  - record that the Profile App Release card was already delivered (version, build, backend, project, device, update id at the bottom of Profile).
- Modify: `docs/adr/0008-one-local-database-per-ea.md`, Consequences: the left-behind report now exists. Keep the date and status lines.
- Modify: `documentation/LEARNING.md`: a short chapter, "Reporting a situation, not an event". It covers:
  - why discovery recomputes from files at every sign-in;
  - why the server dedupes on `(reporter, kind, repeat key)`, and why the key is a one-way digest of the episode (an outbox id hides a child id, and is reused after upload);
  - why the local queue still exists: the drain may be offline, and Step 4 will add one-off events that cannot be recomputed.
- Modify: `documentation/build-log.md`: a decision row listing rulings 1–9 of this plan.

- [ ] **Step 1: Make the edits above.**
  - Run `git diff --check`.
  - Check every relative Markdown link you added resolves: `grep -o '](\./[^)]*)'` over changed files, then `ls` each path.
- [ ] **Step 2: Commit.**
```bash
git add CONTEXT.md documentation docs/adr/0008-one-local-database-per-ea.md
git commit -m "docs: Plan 3 sign-out questions and support incidents"
```

---

## After the tasks (gates, not tasks)

1. **Full gates on the branch, Node 20:**
   - unit: `npx jest --silent`;
   - integration: `npm run test:integration`;
   - all four PostgreSQL harnesses.
2. **Hosted apply** of `20261017120000_mobile_support_incidents.sql` to `segygjzpujphwvrubusm`, only with Jim's explicit yes.
   - Use the isolated staging helper; never raw CLI from the repo root.
   - Verify afterwards that the table grants and the RPC grant match the S2 expectations, read-only.
3. **Device checks** on an EAS preview build (EAS needs Jim's yes):
   - **D1:** A offline → "Sign out anyway" → B signs in and works → A returns; the left-behind incident is on the server.
   - **D3:** "Stay clocked in and sign out", then back after more than ten hours.
   - **D2, D4–D7:** as the spec lists them.
   - Also confirm on both phones that `listDatabaseNames` finds the files. This is the one native assumption tests cannot cover.

## Self-review notes

- **Spec coverage:**

| Spec item | Where |
|---|---|
| §7.1 sheets, order, offline label, "Try uploading now" behaviour | Task 6 |
| Server-ended sign-outs skip the questions | Unchanged `finishSignOut` paths; Task 6 wires only the Profile button |
| §7.2 one unsent definition | Task 2 |
| §4.4 discovery | Task 5 (ruling 5 drops `last_active_at`) |
| §4.5 legacy incident | Task 5 |
| §7.4 envelope: server | Task 1 |
| §7.4 envelope: queue | Task 2 |
| §7.4 envelope: drain, scheduling and `installId` | Task 3 (ruling 7) |
| §7.4 three kinds | Tasks 4 and 5 |
| T8 incident half | Task 4 |
| T10 | Task 5 case 8 |
| T11 incident half | Task 5 case 4 |
| T12 | Task 2 key test; Task 3 case 5; Task 4 case 3; Task 5 cases 2, 3b and 10 (end to end, repeat key included) |
| T13 | Task 6 case 1 |
| S2 | Task 1 |

- **Out of this plan:**
  - D1–D7: device gates after the build.
  - S3 (Plan 1's hosted probe).
  - Deleting other EAs' files: §7.3, deferred.
  - The `/bug-sync` sweep and further kinds: Step 4's spec.
  - Spec §4.5 says "Profile → Export Database can still export it", meaning the legacy `masi.db`. Today's export covers only the signed-in EA's file. Plan 3 does not change export; the controller records this as a known gap for Step 4's support tooling.

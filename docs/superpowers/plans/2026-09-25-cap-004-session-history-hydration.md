# CAP-004 Session History Hydration Implementation Plan

> **For agentic workers:** Codex implements this plan through the Codex plugin, one task per
> dispatch, on model `gpt-5.6-sol` (AGENTS.md "When Building"). Claude specifies each dispatch,
> then reviews the diff and reruns the task's tests before the next task starts. Steps use checkbox
> (`- [ ]`) syntax for tracking. Follow the repository TDD skill (`.agents/skills/tdd`): write the
> failing test, watch it fail for the stated reason, then write the minimal code.

**Goal:** A phone that signs in fresh shows the EA's current-academic-year session history within
a minute, keeps converging with one small request per check, and never loses, duplicates, or
half-writes a session family.

**Architecture:** One canonical Supabase migration makes the server own `sessions.updated_at` for
the whole family (insert and update stamping plus an attendee-to-parent touch trigger). It also
replaces the unused date-ordered page RPC with an ascending `(updated_at, id)` delta RPC plus an
attendee page RPC that returns display names for coattendees. On the phone:
- a new pull service pages parents and attendees under deadlines and a run budget. It runs a cheap delta over the family timestamp, plus a re-walk of the academic year once a day and whenever the phone gains a delivery child. The re-walk catches newly authorized older history and the rare cases a timestamp cursor cannot prove it saw (Jim, 2026-09-26);
- each page is persisted in one SQLite transaction together with the cursor;
- coattendees outside the EA's scopes become flagged **history reference children**;
- a small status store drives one inline History line and a Sync Status row.

**Tech Stack:** React Native (Expo), JavaScript, expo-sqlite (better-sqlite3 in tests), Jest,
supabase-js PostgREST RPC, PostgreSQL 17 (disposable harness), Supabase CLI via the isolated
staging helper.

**Spec:** [`docs/superpowers/specs/2026-09-08-cap-004-session-history-hydration-design.md`](../specs/2026-09-08-cap-004-session-history-hydration-design.md),
including its §12 plan-time corrections, which take precedence. Decision record:
[ADR-0006](../../adr/0006-session-history-converges-on-server-stamped-family-timestamp.md) and its
2026-09-25 follow-up. Handoff: [`docs/agent-context/cap-004-session-history-hydration.md`](../../agent-context/cap-004-session-history-hydration.md).

## Global Constraints

- Backend: `masi-app-sqlite`, ref `segygjzpujphwvrubusm`. Never touch `jcqrlwetutnpuchjoyyd`.
- DDL only through one canonical file under `supabase/migrations/`; never ad-hoc SQL. No hosted
  apply without Jim's explicit yes (Task 9).
- Node 20 for every test command: prefix `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH`.
- Retention window: `session_date >= academic_years.starts_on` of the active academic year.
- Page sizes: parent 200, attendee 200, at most 200 session ids per attendee call; valid range
  1..200.
- Deadlines: 15 seconds per request (`AbortController` plus a `Promise.race` backstop); 60 seconds
  per run; stop after the current page transaction when the budget is spent.
- Overlap: `p_overlap_seconds = 120`, only on the first page of a run that starts from a completed
  cursor.
- Cursor scope: `session_history_pull:<userId>:<programmeId>`; the cursor JSON shape is defined in
  Task 5. `updatedAt` is replayed exactly as PostgREST returned it and is never parsed into a `Date`.
- Re-walk: once per 24 hours, immediately when the phone has an active delivery child absent at the
  last completed re-walk, and resumed while part-way; the first hydration counts as that day's
  re-walk.
- Actor fencing: a change of signed-in user invalidates every in-flight run. No queued request
  starts, and no page commits, for a stale run.
- Safety rails: pending/failed local rows win; synced/terminal rows are replaced; absence never
  deletes; only a run that reaches exhaustion stamps `last_pulled_at`.
- History reference children: `children.history_reference = 1`, identity and display name only,
  `sync_status = 'synced'`, never enqueued, never in roster/class/picker reads, upgraded in place
  to `0` by any full-row save.
- UI copy (exact): "Downloading history from Head Office…", "History not fully downloaded yet".
  Sync Status History row: "Up to date", "Downloading", "Incomplete since <time>",
  "Not downloaded yet". Follow `documentation/design-system.md` tokens; no raw hex.
- Git: one branch for the build (`feat/cap-004-session-history-hydration` from `main`), one commit
  per task, **no agent co-author trailer** (Jim's rule). If the sandbox cannot commit, leave the
  tree for Claude and say so.
- Docs ship in the same branch (Task 8). Build-log rows are appended at the bottom of each
  register.

## Review Focus

These are inputs the spec implies but no happy-path test would exercise. Each has a pinned test in
the named task. The 2026-09-26 Codex adversarial review added items 6–9.

1. **A second EA signs in on the same phone.** Their first run must start from an empty cursor,
   not the first EA's, and must hydrate only their own authorized families. Pinned in Task 5
   ("second user on the same device starts fresh").
2. **A family whose attendees are still on another EA's offline phone.** The parent must persist,
   the cursor must advance, and the attendees must arrive on a later run when the server bumps the
   family. Pinned in Task 1 (trigger re-surfaces a late attendee) and Task 5 ("parent with zero
   attendees does not stall the cursor").
3. **A hydrated session or attendee references a class or group this phone never pulled.** The page
   must persist with that reference nulled, not fail forever. Pinned in Task 3.
4. **The EA's active Programme or the academic year changes.** A new Programme is a new scope with a
   fresh first hydration; a new academic year resets the cursor's window. Pinned in Task 5.
5. **Pull-to-refresh while a run is already in flight.** It must join the running promise rather
   than start a second traversal that races the cursor. Pinned in Task 5.
6. **A handover gives the EA a child with older sessions behind the cursor.** The next run must
   re-walk the year and download them. Pinned in Task 5 ("a new delivery child triggers a
   re-walk").
7. **A hung roster request is ahead in the shared request queue.** History must give up at its own
   deadline instead of waiting forever, and a retry must start fresh. Pinned in Task 5.
8. **The EA signs out and another signs in while a download is queued or mid-response.** Nothing
   commits for the old EA. Pinned in Tasks 3, 5 and 6.
9. **A refresh fails after an earlier success.** The screen must not keep saying "Up to date", and
   the next check must retry. Pinned in Tasks 5 and 6.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/20260925120000_session_history_family_delta.sql` (create) | Insert/update stamping, family touch trigger, delta parent RPC, attendee RPC, indexes, drop old RPC/index | 1 |
| `scripts/history-authorization-postgres-harness.cjs` (modify) | Disposable-PostgreSQL proof: triggers, six-actor matrix for both RPCs, keyset/overlap/window, dense-plan measurement, old objects absent | 1 |
| `__tests__/sessionHistoryFamilyDeltaMigration.test.js` (create) | Text-level pin of the migration's security-relevant clauses (unit suite) | 1 |
| `src/db/migrations.js` (modify) | SQLite v10 `children.history_reference` | 2 |
| `src/db/repositories/childrenRepository.js` (modify) | `history_reference` in full-row saves; read-only guard for reference rows; exclude reference rows from `getChildren` | 2, 4 |
| `src/db/repositories/sessionsRepository.js` (modify) | `saveHistoryPage` transactional page persistence | 3 |
| `src/services/sessionHistoryPull.js` (create) | Traversal: pages, deadlines, budget, overlap, window reset, single flight | 5 |
| `src/services/sessionHistoryStatus.js` (create) | In-memory run status store plus `useSessionHistoryStatus` hook | 6 |
| `src/utils/syncStatusPresenter.js` (modify) | `describeHistoryState` copy for History line and Sync Status row | 6 |
| `src/db/repositories/syncStateRepository.js` (modify) | `getPullState` also returns the row's `updatedAt` (for "Incomplete since") | 6 |
| `src/context/ChildrenContext.js` (modify) | Start the run after roster and reference pulls | 6 |
| `src/screens/sessions/SessionHistoryScreen.js` (modify) | Inline status line, pull-to-refresh, reload on page landed | 6 |
| `src/screens/main/SyncStatusScreen.js` (modify) | History card | 6 |
| `src/screens/insights/SessionCountRankingScreen.js` (unchanged, pinned) | Reader intent test only | 4 |
| Standing docs (modify) | Contract map, ledger, roadmap, build log, handoff, LEARNING | 8 |

Tests: `__tests__/sessionsHistoryPage.test.js`, `__tests__/childrenHistoryReference.test.js`,
`__tests__/sessionHistoryPull.test.js`, `__tests__/sessionHistoryReaders.test.js`,
`__tests__/sessionHistoryStatus.test.js`. Every file that opens SQLite is added to
`jest.integration.config.js` `testMatch` so it runs file-backed in CI.

---

### Task 1: Server migration and disposable-PostgreSQL proof

**Files:**
- Create: `supabase/migrations/20260925120000_session_history_family_delta.sql`
- Modify: `scripts/history-authorization-postgres-harness.cjs` (fixture timestamps; replace every `get_delivery_history_session_page` assertion; add the checks below)
- Create: `__tests__/sessionHistoryFamilyDeltaMigration.test.js`

**Interfaces:**
- Produces (PostgREST RPC, used by Task 5):
  - `get_delivery_history_page(p_programme_id uuid, p_window_start date, p_page_size int = 100, p_after_updated_at timestamptz = null, p_after_id uuid = null, p_overlap_seconds int = 0) returns setof public.sessions`, ordered `(updated_at, id)` ascending.
  - `get_delivery_history_attendee_page(p_session_ids uuid[], p_page_size int = 200, p_after_session_id uuid = null, p_after_attendee_id uuid = null)` returns rows `{ id, session_id, child_id, group_id, attendance_status, grade_snapshot, notes, created_at, updated_at, child_first_name, child_last_name, child_preferred_name }`, ordered `(session_id, id)` ascending.
  - Errors: `28000` unauthenticated; `22023` invalid argument.

- [ ] **Step 1: Write the failing text-pin unit test**

```js
// __tests__/sessionHistoryFamilyDeltaMigration.test.js
const fs = require('fs');
const path = require('path');

const MIGRATION = path.join(
  __dirname, '..', 'supabase', 'migrations', '20260925120000_session_history_family_delta.sql'
);
const normalize = (sql) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();

describe('CAP-004 session history family delta migration', () => {
  const sql = normalize(fs.readFileSync(MIGRATION, 'utf8'));

  test('the server stamps updated_at on insert and update for both family tables', () => {
    expect(sql).toMatch(/create trigger sessions_set_updated_at before insert or update on public\.sessions for each row execute function private\.set_updated_at\(\)/i);
    expect(sql).toMatch(/create trigger session_attendees_set_updated_at before insert or update on public\.session_attendees for each row execute function private\.set_updated_at\(\)/i);
  });

  test('attendee writes touch the parent through a definer trigger with an empty search path', () => {
    expect(sql).toMatch(/create or replace function private\.touch_session_family\(\) returns trigger language plpgsql security definer set search_path = ''/i);
    expect(sql).toMatch(/create trigger session_attendees_touch_session_family after insert or update or delete on public\.session_attendees for each row execute function private\.touch_session_family\(\)/i);
  });

  test('both RPCs are definer functions, bounded, and granted only to authenticated', () => {
    for (const [name, args] of [
      ['get_delivery_history_page', 'uuid, date, integer, timestamptz, uuid, integer'],
      ['get_delivery_history_attendee_page', 'uuid\\[\\], integer, uuid, uuid'],
    ]) {
      expect(sql).toMatch(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]+?security definer set search_path = ''`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${name}\\( ?${args} ?\\) from public, anon`, 'i'));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\( ?${args} ?\\) to authenticated`, 'i'));
    }
    expect(sql).toMatch(/p_page_size is null or p_page_size < 1 or p_page_size > 200/i);
    expect(sql).toMatch(/p_overlap_seconds is null or p_overlap_seconds < 0 or p_overlap_seconds > 600/i);
  });

  test('each grant arm is ordered and limited before the merge', () => {
    expect(sql).toMatch(/owner_arm as \( select s\.id from public\.sessions s where s\.user_id = v_actor_id[\s\S]+?order by s\.updated_at, s\.id limit p_page_size \)/i);
    expect(sql).toMatch(/delivery_arm as \( select s\.id from public\.sessions s where[\s\S]+?s\.id in \( select sa\.session_id from public\.child_ea_assignments cea join public\.session_attendees sa on sa\.child_id = cea\.child_id where cea\.user_id = v_actor_id \)[\s\S]+?order by s\.updated_at, s\.id limit p_page_size \)/i);
    expect(sql).not.toMatch(/class_ea_assignments|group_ea_assignments|created_by/i);
  });

  test('the date-ordered RPC and its index are dropped', () => {
    expect(sql).toMatch(/drop function if exists public\.get_delivery_history_session_page\( ?uuid, integer, date, timestamptz, uuid ?\)/i);
    expect(sql).toMatch(/drop index if exists public\.idx_sessions_owner_programme_history_cursor/i);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails because the file does not exist**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/sessionHistoryFamilyDeltaMigration.test.js`
Expected: FAIL with `ENOENT: no such file or directory`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260925120000_session_history_family_delta.sql
-- CAP-004 (ADR-0006, spec §4 and §12): session families converge on a server-stamped
-- family timestamp. sessions.updated_at now means "family last written on the server".

-- 1. The server owns updated_at on insert as well as update. Before this, an insert kept
--    the phone-sent value, so a wrong phone clock could hide a new session behind another
--    device's delta cursor.
drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
  before insert or update on public.sessions
  for each row execute function private.set_updated_at();

drop trigger if exists session_attendees_set_updated_at on public.session_attendees;
create trigger session_attendees_set_updated_at
  before insert or update on public.session_attendees
  for each row execute function private.set_updated_at();

-- 2. Any attendee write re-stamps its parent. It touches only updated_at, so the
--    restrictive forward-prep policy is unaffected; as a definer function owned by the
--    migration role it does not consult the attendee writer's session policies.
create or replace function private.touch_session_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.sessions set updated_at = now() where id = old.session_id;
    return old;
  end if;

  update public.sessions set updated_at = now() where id = new.session_id;
  if tg_op = 'UPDATE' and old.session_id is distinct from new.session_id then
    update public.sessions set updated_at = now() where id = old.session_id;
  end if;
  return new;
end;
$$;

revoke execute on function private.touch_session_family() from public, anon, authenticated;

drop trigger if exists session_attendees_touch_session_family on public.session_attendees;
create trigger session_attendees_touch_session_family
  after insert or update or delete on public.session_attendees
  for each row execute function private.touch_session_family();

-- 3. Indexes for the owner arm and the attendee keyset.
create index if not exists idx_sessions_owner_programme_updated
  on public.sessions (user_id, programme_id, updated_at, id);
create index if not exists idx_session_attendees_session_id_id
  on public.session_attendees (session_id, id);

-- 4. Parent page: ascending (updated_at, id) delta over the two positive grants.
create or replace function public.get_delivery_history_page(
  p_programme_id uuid,
  p_window_start date,
  p_page_size integer default 100,
  p_after_updated_at timestamptz default null,
  p_after_id uuid default null,
  p_overlap_seconds integer default 0
)
returns setof public.sessions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_after_updated_at timestamptz;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_programme_id is null or p_window_start is null then
    raise exception 'p_programme_id and p_window_start are required' using errcode = '22023';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 200 then
    raise exception 'p_page_size must be between 1 and 200' using errcode = '22023';
  end if;
  if p_overlap_seconds is null or p_overlap_seconds < 0 or p_overlap_seconds > 600 then
    raise exception 'p_overlap_seconds must be between 0 and 600' using errcode = '22023';
  end if;
  if (p_after_updated_at is null) <> (p_after_id is null) then
    raise exception 'The session history cursor must be wholly null or wholly populated'
      using errcode = '22023';
  end if;

  v_after_updated_at := p_after_updated_at - make_interval(secs => p_overlap_seconds);

  return query
  with owner_arm as (
    select s.id
    from public.sessions s
    where s.user_id = v_actor_id
      and s.programme_id = p_programme_id
      and s.session_date >= p_window_start
      and (p_after_updated_at is null
        or (s.updated_at, s.id) > (v_after_updated_at, p_after_id))
    order by s.updated_at, s.id
    limit p_page_size
  ),
  delivery_arm as (
    select s.id
    from public.sessions s
    where s.programme_id = p_programme_id
      and s.session_date >= p_window_start
      and (p_after_updated_at is null
        or (s.updated_at, s.id) > (v_after_updated_at, p_after_id))
      and s.id in (
        select sa.session_id
        from public.child_ea_assignments cea
        join public.session_attendees sa on sa.child_id = cea.child_id
        where cea.user_id = v_actor_id
      )
    order by s.updated_at, s.id
    limit p_page_size
  ),
  merged as (
    select id from owner_arm
    union
    select id from delivery_arm
  )
  select s.*
  from merged m
  join public.sessions s on s.id = m.id
  order by s.updated_at, s.id
  limit p_page_size;
end;
$$;

revoke execute on function public.get_delivery_history_page(
  uuid, date, integer, timestamptz, uuid, integer
) from public, anon;
grant execute on function public.get_delivery_history_page(
  uuid, date, integer, timestamptz, uuid, integer
) to authenticated;

-- 5. Attendee page: authorization re-derived per session at call time; the three child_*
--    columns are the history reference projection (display identity only).
create or replace function public.get_delivery_history_attendee_page(
  p_session_ids uuid[],
  p_page_size integer default 200,
  p_after_session_id uuid default null,
  p_after_attendee_id uuid default null
)
returns table (
  id uuid,
  session_id uuid,
  child_id uuid,
  group_id uuid,
  attendance_status text,
  grade_snapshot text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  child_first_name text,
  child_last_name text,
  child_preferred_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_session_ids is null
    or coalesce(cardinality(p_session_ids), 0) < 1
    or cardinality(p_session_ids) > 200 then
    raise exception 'p_session_ids must contain between 1 and 200 ids' using errcode = '22023';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 200 then
    raise exception 'p_page_size must be between 1 and 200' using errcode = '22023';
  end if;
  if (p_after_session_id is null) <> (p_after_attendee_id is null) then
    raise exception 'The attendee cursor must be wholly null or wholly populated'
      using errcode = '22023';
  end if;

  return query
  select
    sa.id, sa.session_id, sa.child_id, sa.group_id, sa.attendance_status,
    sa.grade_snapshot, sa.notes, sa.created_at, sa.updated_at,
    c.first_name, c.last_name, c.preferred_name
  from public.session_attendees sa
  join public.children c on c.id = sa.child_id
  where sa.session_id in (
      select requested.id
      from unnest(p_session_ids) as requested(id)
      where private.can_read_session(requested.id)
    )
    and (p_after_session_id is null
      or (sa.session_id, sa.id) > (p_after_session_id, p_after_attendee_id))
  order by sa.session_id, sa.id
  limit p_page_size;
end;
$$;

revoke execute on function public.get_delivery_history_attendee_page(
  uuid[], integer, uuid, uuid
) from public, anon;
grant execute on function public.get_delivery_history_attendee_page(
  uuid[], integer, uuid, uuid
) to authenticated;

-- 6. One-time clean-up: before this migration, inserts kept the phone's clock, so an existing
--    row can carry a future updated_at that would pin a delta cursor ahead of every correctly
--    stamped later write (Codex review 2026-09-26). Idempotent; a no-op once clean.
update public.session_attendees set updated_at = now() where updated_at > now();
update public.sessions set updated_at = now() where updated_at > now();

-- 7. One contract: drop the date-ordered RPC that no phone ever called, and its index.
drop function if exists public.get_delivery_history_session_page(
  uuid, integer, date, timestamptz, uuid
);
drop index if exists public.idx_sessions_owner_programme_history_cursor;
```

- [ ] **Step 4: Run the text-pin test and confirm it passes**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/sessionHistoryFamilyDeltaMigration.test.js __tests__/sqlitePlan1Migrations.test.js`
Expected: PASS. The old `get_delivery_history_session_page` text pin in `sqlitePlan1Migrations.test.js` still passes because it reads the old, immutable migration file.

- [ ] **Step 5: Extend the harness (red first)**

In `scripts/history-authorization-postgres-harness.cjs`:

1. **Fixture timestamps.** `classOnlySessionFixtureSql` inserts explicit `updated_at` values that the new insert trigger will overwrite. Keep the rows but remove the `updated_at` column from the `INSERT INTO public.sessions` list. Tests that need controlled timestamps set them under `SET session_replication_role = replica` inside a transaction (triggers do not fire), as below.
2. **Remove** `actorSessionPageSql`, `actorSessionRpcPlanSql`, `pageSessionHistoryToExhaustion`, and every assertion that calls `get_delivery_history_session_page`. Keep the six-actor raw-table visibility assertions (`sessionVisibilityProjectionSql`, `actorSwitchVisibilitySql`) unchanged.
3. **Add these SQL builders** next to the existing ones:

```js
const PROGRAMME = "(SELECT id FROM public.programmes WHERE code = 'literacy')";
const actorClaims = (actorId) => `SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub', '${actorId}', TRUE);`;

const parentPageIdsSql = ({ actorId, windowStart = '2026-01-01', pageSize = 200, after = null, overlap = 0 }) => `
BEGIN;
${actorClaims(actorId)}
SELECT COALESCE(pg_catalog.json_agg(p.id ORDER BY p.updated_at, p.id), '[]'::JSON)::TEXT
FROM public.get_delivery_history_page(
  ${PROGRAMME}, DATE '${windowStart}', ${pageSize},
  ${after ? `TIMESTAMPTZ '${after.updatedAt}'` : 'NULL'},
  ${after ? `'${after.id}'::UUID` : 'NULL'},
  ${overlap}
) p;
ROLLBACK;`;

const attendeePageSql = ({ actorId, sessionIds, pageSize = 200 }) => `
BEGIN;
${actorClaims(actorId)}
SELECT COALESCE(pg_catalog.json_agg(pg_catalog.json_build_object(
  'id', a.id, 'session_id', a.session_id, 'child_first_name', a.child_first_name
) ORDER BY a.session_id, a.id), '[]'::JSON)::TEXT
FROM public.get_delivery_history_attendee_page(
  ARRAY[${sessionIds.map((id) => `'${id}'::UUID`).join(', ')}], ${pageSize}, NULL, NULL
) a;
ROLLBACK;`;

// VERBOSITY=verbose makes psql print "ERROR:  <SQLSTATE>: <message>", so the code is assertable.
const expectSqlState = ({ databaseUrl, sql, label, sqlState }) => {
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq', databaseUrl, '-c', sql], {
    encoding: 'utf8', env: buildPsqlEnv(label), timeout: 180_000,
  });
  assert.notEqual(result.status, 0, `${label} unexpectedly succeeded`);
  assert.match(result.stderr, new RegExp(`ERROR:\\s+${sqlState}:`), `${label}: expected SQLSTATE ${sqlState}\n${result.stderr}`);
  return result.stderr;
};
```

4. **Add these assertions** in `main()` after the existing six-actor raw-table block, each in its own labelled `runPsql` call:

- **Insert stamping.** As superuser, insert a session with `updated_at = TIMESTAMPTZ '2001-01-01 00:00:00+00'` and an attendee with the same; read both back and `assert.notEqual(year, 2001)` for each.
- **Family touch on insert, update, and delete.** For session `80000000-0000-0000-0000-000000000002`, read `updated_at` (t0) in one statement. In a later statement insert an attendee for child `...000001`; assert the parent's `updated_at > t0`. Repeat for `UPDATE ... SET notes = 'x'` and `DELETE`. Move an attendee's `session_id` from `...0002` to `...0003`; assert both parents moved forward. Run each write in its own `runPsql` call so `now()` differs between transactions.
- **Authenticated attendee insert still works under the trigger.** Insert an active `child_ea_assignments` row for actor `10000000-0000-0000-0000-000000000001` on child `...000001`. Then, as that actor (`actorClaims`), insert an attendee into their own session `...0002` and assert success and a parent bump. This proves the trigger needs no grant for callers.
- **Six-actor parent matrix** (`parentPageIdsSql`, window `2026-01-01`):
  - owner `...001` → exactly the four fixture owner sessions;
  - current delivery `...004` and former delivery `...003` → `['80000000-0000-0000-0000-000000000001']`;
  - class-only `...002`, group-only `...005`, and unrelated `...006` → `[]`.
- **Six-actor attendee matrix** (`attendeePageSql` with `['...0001', '...0002']`):
  - owner, current and former → the two attendees of `...0001`, including the coattendee's `child_first_name`;
  - the other three → `[]`.
- **Anonymous denied.** `SET LOCAL ROLE anon; SELECT * FROM public.get_delivery_history_page(...)` and the attendee RPC each fail with SQLSTATE `42501` (`expectSqlState`).
- **Validation.** Each of these fails with SQLSTATE `22023`: null programme, null window, page size 0 and 201, half cursor, overlap 601, 201 session ids, and a half attendee cursor. With no `request.jwt.claim.sub`, both RPCs fail `28000`. All through `expectSqlState`.
- **Keyset exactness on equal timestamps.** In one transaction under `SET session_replication_role = replica`, insert five owner sessions `81000000-...-00000000000{1..5}` with identical `updated_at = TIMESTAMPTZ '2026-09-01 10:00:00.000001+00'` and `session_date = '2026-09-01'`. Page with size 2 using each page's last `(updated_at::TEXT, id)` as the next cursor. Assert pages `[1,2]`, `[3,4]`, `[5]` in id order, and that the concatenation has no duplicate or gap.
- **One session through both arms appears once.** Session `...0001` qualifies for the owner and, after adding an assignment for the owner on child `...000001`, also through delivery. Assert it appears exactly once on the owner's page.
- **Window.** A `session_date = '2025-12-31'` owner session is excluded with window `2026-01-01` and included with window `2025-01-01`.
- **Overlap.** Using the cursor at session `81...3`, a page with `overlap = 0` returns `[4,5]`, and with `overlap = 120` it also returns `[1,2,3]`, because all share the timestamp inside the two-minute window.
- **Future timestamps normalized.** Under `session_replication_role = replica`, set session `...0003`'s `updated_at` to `TIMESTAMPTZ '2099-01-01 00:00:00+00'`. Re-apply the migration file with `runPsql({ file })`; it is idempotent. Assert `updated_at <= now()`.
- **Old objects absent.** `to_regprocedure('public.get_delivery_history_session_page(uuid,integer,date,timestamptz,uuid)') IS NULL` and `to_regclass('public.idx_sessions_owner_programme_history_cursor') IS NULL`.
- **Dense plans (bounded work, spec §8).** Under `session_replication_role = replica`, use `generate_series` to insert 120,000 literacy sessions owned by a noise user `1f000000-...-000000000001`, spread over 2026 dates with distinct `updated_at`. Then add:
  - 5,000 sessions owned by a dense owner `1f000000-...-000000000002`;
  - for a sparse delivery actor `1f000000-...-000000000003`, three noise sessions attended by a child it holds an assignment on.

  `ANALYZE` the tables. Measure `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` with `collectPlanMetrics` for:
  - (a) `SELECT pg_catalog.count(*) FROM public.sessions` (the raw baseline);
  - (b) the sparse delivery actor's first page;
  - (c) the dense owner's page with a cursor 4,900 rows deep.

  Assert (b) and (c) each read fewer than one tenth of (a)'s shared blocks. Print all three in the harness JSON output for the build log.

- [ ] **Step 6: Run the harness against a local disposable PostgreSQL and confirm red, then green**

Before the migration file existed the new assertions failed. With it, run:

```bash
HISTORY_RLS_ADMIN_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres \
HISTORY_RLS_DATABASE_NAME=masi_history_rls_cap004 \
HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE \
PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run verify:history-authorization:postgres
```

Expected: exit 0, with the dense-plan metrics printed. If no local PostgreSQL 17 is running, say so and rely on the CI job; do not skip the assertions.

- [ ] **Step 7: Run the harness unit tests and commit**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/historyAuthorizationPostgresHarness.test.js __tests__/sessionHistoryFamilyDeltaMigration.test.js`
Expected: PASS.

```bash
git add supabase/migrations/20260925120000_session_history_family_delta.sql scripts/history-authorization-postgres-harness.cjs __tests__/sessionHistoryFamilyDeltaMigration.test.js
git commit -m "feat(cap-004): server-stamped session family delta RPCs with disposable-PostgreSQL proof"
```

---

### Task 2: SQLite `children.history_reference` and full-row save semantics

**Files:**
- Modify: `src/db/migrations.js` (append version 10)
- Modify: `src/db/repositories/childrenRepository.js:25-45` (`CHILD_COLUMNS`), `:504-520` (`saveChildRecord`)
- Test: `__tests__/childrenHistoryReference.test.js` (add to `jest.integration.config.js`)

**Interfaces:**
- Produces: column `children.history_reference INTEGER NOT NULL DEFAULT 0 CHECK (history_reference IN (0, 1))`. Every `saveChildRecord` writes `history_reference = 0`, and it throws `Error('History reference children are read-only')` for a non-`synced` save over a reference row.

- [ ] **Step 1: Write the failing tests**

```js
// __tests__/childrenHistoryReference.test.js
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations, CURRENT_SCHEMA_VERSION } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { _testBuildSyncPayload as buildSyncPayload } from '../src/services/offlineSync';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const insertReference = (db, id = 'child-ref') => db.runAsync(`
  insert into children (id, first_name, last_name, history_reference, sync_status)
  values (?, 'Lindiwe', 'Mbeki', 1, 'synced')
`, id);

describe('history reference children', () => {
  let db;
  beforeEach(async () => { db = await createMigratedDatabase(runMigrations); await seedCoreData(db); });
  afterEach(async () => { await db.closeAsync(); });

  test('schema v10 adds history_reference defaulting to 0 with a 0/1 check', async () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(10);
    await db.runAsync("insert into children (id, first_name, last_name) values ('c-plain', 'A', 'B')");
    expect((await db.getFirstAsync("select history_reference from children where id = 'c-plain'")).history_reference).toBe(0);
    let checkError;
    try {
      await db.runAsync("insert into children (id, first_name, last_name, history_reference) values ('c-bad', 'A', 'B', 2)");
    } catch (error) { checkError = error; }
    expect(String(checkError?.message)).toMatch(/CHECK constraint/i);
  });

  test('a full-row server save upgrades a reference row in place', async () => {
    await insertReference(db);
    const repository = createChildrenRepository({ database: db });
    await repository.saveChildRecord({
      id: 'child-ref', first_name: 'Lindiwe', last_name: 'Mbeki', class_id: 'class-1',
      created_by: 'user-9', sync_status: 'synced', synced: true,
      created_at: '2026-03-01T08:00:00.000Z', updated_at: '2026-03-01T08:00:00.000Z',
    });
    expect(await db.getFirstAsync("select history_reference, class_id from children where id = 'child-ref'"))
      .toEqual({ history_reference: 0, class_id: 'class-1' });
  });

  test('a local edit of a reference row is refused and enqueues nothing', async () => {
    await insertReference(db);
    const repository = createChildrenRepository({ database: db });
    let caught;
    try {
      await repository.saveChildRecord({ id: 'child-ref', first_name: 'X', last_name: 'Y', synced: false });
    } catch (error) { caught = error; }
    expect(caught?.message).toBe('History reference children are read-only');
    expect((await db.getFirstAsync("select count(*) as n from sync_outbox where record_id = 'child-ref'")).n).toBe(0);
  });

  test('every local mutation path refuses a reference row and enqueues nothing; a later roster save still promotes it', async () => {
    await insertReference(db);
    const repository = createChildrenRepository({ database: db });
    const attempts = {
      updateChild: () => repository.updateChild('child-ref', { first_name: 'X' }, { actorUserId: 'user-1' }),
      archiveChild: () => repository.archiveChild('child-ref', { actorUserId: 'user-1', archiveReason: 'left_school' }),
      deleteIfNoHistory: () => repository.deleteIfNoHistory('child-ref'),
    };
    for (const [name, attempt] of Object.entries(attempts)) {
      let caught;
      try { await attempt(); } catch (error) { caught = error; }
      expect([name, caught?.message]).toEqual([name, 'History reference children are read-only']);
    }
    expect(await db.getFirstAsync("select first_name, history_reference, sync_status, archived_at from children where id = 'child-ref'"))
      .toEqual({ first_name: 'Lindiwe', history_reference: 1, sync_status: 'synced', archived_at: null });
    expect((await db.getFirstAsync("select count(*) as n from sync_outbox where record_id = 'child-ref'")).n).toBe(0);
    await repository.saveChildRecord({ id: 'child-ref', first_name: 'Lindiwe', last_name: 'Mbeki', class_id: 'class-1', synced: true, sync_status: 'synced' });
    expect((await db.getFirstAsync("select history_reference from children where id = 'child-ref'")).history_reference).toBe(0);
  });

  test('history_reference never reaches a push payload', () => {
    const payload = buildSyncPayload('children', {
      id: '00000000-0000-4000-8000-000000000001', first_name: 'A', last_name: 'B', history_reference: 0,
    });
    expect(payload).not.toHaveProperty('history_reference');
  });
});
```

(Rejections are asserted with `try/catch` because `expect(...).rejects.toThrow()` misreports in this repository's multi-file Jest runs.)

- [ ] **Step 2: Run and confirm failure**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest --config jest.integration.config.js __tests__/childrenHistoryReference.test.js` (after adding the file to `testMatch`).
Expected: FAIL. `CURRENT_SCHEMA_VERSION` is 9, and the column does not exist.

- [ ] **Step 3: Implement**

Append to `MIGRATIONS` in `src/db/migrations.js`:

```js
  {
    version: 10,
    name: 'children_history_reference',
    sql: `
      alter table children add column history_reference integer not null default 0
        check (history_reference in (0, 1));
    `,
  },
```

In `childrenRepository.js`, add `'history_reference'` to `CHILD_COLUMNS` after `'reading_level'`. Then replace `saveChildRecord` with:

```js
  const saveChildRecord = async (child, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const record = normalizeSyncFields({
      ...normalizeChildRecord(child),
      // Every full-row save describes a real roster child; this is how a history reference
      // row (CAP-004) is upgraded in place when the roster pull later returns the child.
      history_reference: 0,
      sync_status: child.sync_status || syncStatusFromSynced(child.synced),
    });
    const existing = await txn.getFirstAsync(
      'select history_reference from children where id = ?',
      record.id
    );
    if (existing?.history_reference === 1 && record.sync_status !== 'synced') {
      throw new Error('History reference children are read-only');
    }
    if (await serverPullWouldClobberPendingLocal(txn, 'children', record)) {
      return false;
    }
    await upsertDomainRecord(txn, {
      tableName: 'children',
      columns: CHILD_COLUMNS,
    }, record);
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'children', child.id, 'insert', record);
    }
    return true;
  });
```

Add one shared guard in `childrenRepository.js`, and call it first inside the write transaction of `updateChild` (`:393`), `archiveChild` (`:719`) and `deleteIfNoHistory` (`:765`):

```js
const assertNotHistoryReference = async (txn, childId) => {
  const row = await txn.getFirstAsync('select history_reference from children where id = ?', childId);
  if (row?.history_reference === 1) {
    throw new Error('History reference children are read-only');
  }
};
```

This leaves promotion to trusted roster ingestion: `saveChildRecord` with `sync_status = 'synced'`, as used by `saveServerChildRow`. Also add `and children.history_reference = 0` to `getMyChildren`'s `where` clause (`:712`). That makes the exclusion explicit, instead of relying only on the missing assignment and enrollment rows.

If the push-payload test fails, add `'history_reference'` to `LOCAL_ONLY_KEYS_TO_STRIP` in `src/services/offlineSync.js:42`. Run `__tests__/syncContractCompleteness.test.js`; if it reports the new local column, add `'history_reference'` to `LOCAL_ONLY_COLUMNS` (`offlineSync.js:72`).

- [ ] **Step 4: Run the new tests plus the neighbouring suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest --config jest.integration.config.js __tests__/childrenHistoryReference.test.js __tests__/childrenRepository.test.js __tests__/serverPullGuard.test.js __tests__/syncContractCompleteness.test.js __tests__/sqliteFoundation.test.js`
Expected: PASS. Update any test that hard-codes schema version 9 to derive from `CURRENT_SCHEMA_VERSION`.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations.js src/db/repositories/childrenRepository.js src/services/offlineSync.js jest.integration.config.js __tests__/childrenHistoryReference.test.js
git commit -m "feat(cap-004): flag history reference children in SQLite and upgrade them in place"
```

---

### Task 3: `sessionsRepository.saveHistoryPage`

**Files:**
- Modify: `src/db/repositories/sessionsRepository.js`
- Test: `__tests__/sessionsHistoryPage.test.js` (add to `jest.integration.config.js`)

**Interfaces:**
- Consumes: Task 2's `children.history_reference`; `syncStateRepository.setPullState(scope, { lastPulledAt, cursor }, { transaction })`.
- Produces: `sessionsRepository.saveHistoryPage(families, { scope, pullState, admit })` → `{ savedFamilies: number }`, where `families = [{ session: <server sessions row>, attendees: [<attendee RPC row>] }]` and `pullState = { lastPulledAt: string|null, cursor: string }` (the cursor JSON already encoded). `admit` is an optional `() => boolean`, checked first inside the transaction; `false` throws an error with `kind: 'cancelled'`, so a run that belongs to a signed-out EA commits nothing. It runs as one transaction; any throw persists nothing.

- [ ] **Step 1: Write the failing tests**

```js
// __tests__/sessionsHistoryPage.test.js
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const SCOPE = 'session_history_pull:user-1:programme-a';
const serverSession = (overrides = {}) => ({
  id: 's-1', user_id: 'user-9', programme_id: 'programme-a', class_id: 'class-1',
  session_date: '2026-09-01', started_at: null, ended_at: null,
  activities: { letters_focused: ['a'] }, notes: 'server note',
  created_at: '2026-09-01T08:00:00.123456+00:00', updated_at: '2026-09-01T08:05:00.654321+00:00',
  group_id: null, state: 'completed',
  ...overrides,
});
const serverAttendee = (overrides = {}) => ({
  id: 'a-1', session_id: 's-1', child_id: 'child-1', group_id: null, attendance_status: 'present',
  grade_snapshot: '1', notes: null,
  created_at: '2026-09-01T08:00:00.1+00:00', updated_at: '2026-09-01T08:00:00.1+00:00',
  child_first_name: 'Amahle', child_last_name: 'Dlamini', child_preferred_name: null,
  ...overrides,
});
const pullState = (cursor = { updatedAt: '2026-09-01T08:05:00.654321+00:00', id: 's-1' }) => ({
  lastPulledAt: null,
  cursor: JSON.stringify({ ...cursor, windowStart: '2026-01-15', complete: false }),
});

describe('sessionsRepository.saveHistoryPage', () => {
  let db; let repo;
  beforeEach(async () => {
    db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
    repo = createSessionsRepository({ database: db });
  });
  afterEach(async () => { await db.closeAsync(); });

  test('persists parent, attendees, a reference child, and the cursor atomically without outbox rows', async () => {
    const result = await repo.saveHistoryPage([{ session: serverSession(), attendees: [serverAttendee()] }], { scope: SCOPE, pullState: pullState() });
    expect(result).toEqual({ savedFamilies: 1 });
    expect(await db.getFirstAsync("select sync_status, server_updated_at, updated_at from sessions where id = 's-1'"))
      .toEqual({ sync_status: 'synced', server_updated_at: '2026-09-01T08:05:00.654321+00:00', updated_at: '2026-09-01T08:05:00.654321+00:00' });
    expect(await db.getFirstAsync("select first_name, history_reference, sync_status from children where id = 'child-1'"))
      .toEqual({ first_name: 'Amahle', history_reference: 1, sync_status: 'synced' });
    expect((await db.getFirstAsync('select count(*) as n from sync_outbox')).n).toBe(0);
    expect(JSON.parse((await db.getFirstAsync('select cursor from sync_state where scope = ?', SCOPE)).cursor).updatedAt)
      .toBe('2026-09-01T08:05:00.654321+00:00');
  });

  test('a throw mid-page persists nothing and leaves the cursor unchanged', async () => {
    const bad = serverAttendee({ id: 'a-2', attendance_status: 'teleported' }); // violates the CHECK
    let caught;
    try {
      await repo.saveHistoryPage([{ session: serverSession(), attendees: [serverAttendee(), bad] }], { scope: SCOPE, pullState: pullState() });
    } catch (error) { caught = error; }
    expect(caught).toBeDefined();
    expect((await db.getFirstAsync('select count(*) as n from sessions')).n).toBe(0);
    expect((await db.getFirstAsync('select count(*) as n from children where id = ?', 'child-1')).n).toBe(0);
    expect(await db.getFirstAsync('select * from sync_state where scope = ?', SCOPE)).toBeNull();
  });

  test('a pending local session wins and its attendees are left alone', async () => {
    await createChildrenRepository({ database: db }).saveChildRecord({ id: 'child-1', first_name: 'Amahle', last_name: 'D', class_id: 'class-1', synced: true, sync_status: 'synced' });
    await repo.saveSession({ id: 's-1', user_id: 'user-1', programme_id: 'programme-a', session_date: '2026-09-01', notes: 'local', children_ids: ['child-1'], synced: false });
    await repo.saveHistoryPage([{ session: serverSession(), attendees: [serverAttendee()] }], { scope: SCOPE, pullState: pullState() });
    expect((await db.getFirstAsync("select notes, sync_status from sessions where id = 's-1'"))).toEqual({ notes: 'local', sync_status: 'pending' });
  });

  test('a present child is untouched and a later full-row save upgrades a reference child', async () => {
    await createChildrenRepository({ database: db }).saveChildRecord({ id: 'child-2', first_name: 'Sipho', last_name: 'M', class_id: 'class-1', synced: true, sync_status: 'synced' });
    await repo.saveHistoryPage([{ session: serverSession(), attendees: [
      serverAttendee(),
      serverAttendee({ id: 'a-2', child_id: 'child-2', child_first_name: 'SERVER-NAME' }),
    ] }], { scope: SCOPE, pullState: pullState() });
    expect(await db.getFirstAsync("select first_name, history_reference from children where id = 'child-2'"))
      .toEqual({ first_name: 'Sipho', history_reference: 0 });
  });

  test('missing class and group references are stored as null instead of failing the page', async () => {
    await repo.saveHistoryPage([{
      session: serverSession({ class_id: 'class-not-on-phone' }),
      attendees: [serverAttendee({ group_id: 'group-not-on-phone' })],
    }], { scope: SCOPE, pullState: pullState() });
    expect((await db.getFirstAsync("select class_id from sessions where id = 's-1'")).class_id).toBeNull();
    expect((await db.getFirstAsync("select group_id from session_attendees where id = 'a-1'")).group_id).toBeNull();
  });

  test('a parent with zero attendees persists and absence never deletes a local attendee', async () => {
    await repo.saveHistoryPage([{ session: serverSession(), attendees: [serverAttendee()] }], { scope: SCOPE, pullState: pullState() });
    await repo.saveHistoryPage([{ session: serverSession({ notes: 'edited' }), attendees: [] }], { scope: SCOPE, pullState: pullState() });
    expect((await db.getFirstAsync("select notes from sessions where id = 's-1'")).notes).toBe('edited');
    expect((await db.getFirstAsync("select count(*) as n from session_attendees where session_id = 's-1'")).n).toBe(1);
  });

  test('an admission check that fails inside the transaction commits nothing', async () => {
    let caught;
    try {
      await repo.saveHistoryPage([{ session: serverSession(), attendees: [serverAttendee()] }], { scope: SCOPE, pullState: pullState(), admit: () => false });
    } catch (error) { caught = error; }
    expect(caught?.kind).toBe('cancelled');
    expect((await db.getFirstAsync('select count(*) as n from sessions')).n).toBe(0);
    expect(await db.getFirstAsync('select * from sync_state where scope = ?', SCOPE)).toBeNull();
  });

  test('lastPulledAt is written only when the caller passes it', async () => {
    await repo.saveHistoryPage([], { scope: SCOPE, pullState: { lastPulledAt: '2026-09-25T10:00:00.000Z', cursor: pullState().cursor } });
    expect((await db.getFirstAsync('select last_pulled_at from sync_state where scope = ?', SCOPE)).last_pulled_at)
      .toBe('2026-09-25T10:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest --config jest.integration.config.js __tests__/sessionsHistoryPage.test.js`
Expected: FAIL with `repo.saveHistoryPage is not a function`.

- [ ] **Step 3: Implement**

In `sessionsRepository.js`, extend the `domainRepositoryUtils` import with `serverPullWouldClobberPendingLocal`, and add `import { syncStateRepository } from './syncStateRepository';`. Then, inside `createSessionsRepository`, add:

```js
  const HISTORY_REFERENCE_CHILD_COLUMNS = [
    'id', 'first_name', 'last_name', 'preferred_name', 'history_reference', 'sync_status',
  ];

  const existingId = async (txn, table, id) => {
    if (!id) return null;
    const row = await txn.getFirstAsync(`select id from ${table} where id = ?`, id);
    return row ? id : null;
  };

  // CAP-004: persist one parent page of hydrated session families and the traversal cursor
  // in a single transaction (spec §6.2, §12). Absence never deletes; pending local rows win.
  const saveHistoryPage = async (families, { scope, pullState, admit }) => runRepositoryTransaction(database, async (txn) => {
    // Admission is checked inside the transaction, after the writer lock is held, so a run
    // for an EA who signed out while this page waited for the writer commits nothing.
    if (admit && !admit()) {
      throw Object.assign(new Error('Session history run cancelled'), { kind: 'cancelled' });
    }
    let savedFamilies = 0;
    for (const { session, attendees } of families) {
      const parent = {
        ...session,
        class_id: await existingId(txn, 'classes', session.class_id),
        sync_status: 'synced',
        server_updated_at: session.updated_at,
      };
      if (await serverPullWouldClobberPendingLocal(txn, 'sessions', parent)) continue;
      await upsertDomainRecord(txn, {
        tableName: 'sessions',
        columns: SESSION_COLUMNS,
        jsonColumns: ['activities'],
      }, parent);

      for (const attendee of attendees) {
        if (!(await existingId(txn, 'children', attendee.child_id))) {
          await upsertDomainRecord(txn, {
            tableName: 'children',
            columns: HISTORY_REFERENCE_CHILD_COLUMNS,
          }, {
            id: attendee.child_id,
            first_name: attendee.child_first_name,
            last_name: attendee.child_last_name,
            preferred_name: attendee.child_preferred_name ?? null,
            history_reference: 1,
            sync_status: 'synced',
          });
        }
        const row = {
          id: attendee.id,
          session_id: attendee.session_id,
          child_id: attendee.child_id,
          group_id: await existingId(txn, 'groups', attendee.group_id),
          attendance_status: attendee.attendance_status,
          grade_snapshot: attendee.grade_snapshot ?? null,
          notes: attendee.notes ?? null,
          created_at: attendee.created_at,
          updated_at: attendee.updated_at,
          sync_status: 'synced',
          server_updated_at: attendee.updated_at,
        };
        if (await serverPullWouldClobberPendingLocal(txn, 'session_attendees', row)) continue;
        await upsertDomainRecord(txn, { tableName: 'session_attendees', columns: ATTENDEE_COLUMNS }, row);
      }
      savedFamilies += 1;
    }
    await syncStateRepository.setPullState(scope, pullState, { transaction: txn });
    return { savedFamilies };
  });
```

Add `saveHistoryPage` to the returned object. `existingId` is only ever called with the literal table names above, so interpolation is safe; do not widen it to caller input.

- [ ] **Step 4: Run the new tests plus the sessions and foreign-key suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest --config jest.integration.config.js __tests__/sessionsHistoryPage.test.js __tests__/sessionsRepository.test.js __tests__/foreignKeyEnforcement.test.js __tests__/serverPullGuard.test.js`
Expected: PASS, with foreign keys enabled; the adapter runs migrations then turns them on.

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/sessionsRepository.js jest.integration.config.js __tests__/sessionsHistoryPage.test.js
git commit -m "feat(cap-004): transactional history page persistence with reference children and cursor"
```

---

### Task 4: Readers exclude reference children; session reader intent is pinned

**Files:**
- Modify: `src/db/repositories/childrenRepository.js:275-279` (`getChildren`)
- Test: `__tests__/sessionHistoryReaders.test.js` (add to `jest.integration.config.js`)

**Interfaces:**
- Consumes: Task 3's `saveHistoryPage`.
- Produces: `childrenRepository.getChildren()` excludes `history_reference = 1`. There are no other interface changes.

Audit result (verified 2026-09-25):
- **`getMyChildren`** joins active assignment, enrollment and membership, so it already excludes reference rows (they have none).
- **`classesRepository` roster reads** filter by `class_id`, which is `null` for reference rows.
- **`getUnsyncedRecords`** reads `sync_status <> 'synced'`, and reference rows are `synced`.
- **`literacySessionPersistence`** reads `reading_level` by an id taken from the EA's roster.
- **`getChildren`** is the only unfiltered reader.

Session readers:
- History, Home, the Sessions tab, and `countSessionsOnDate` pass `recordedByUserId` or `userId`, so they stay "sessions I recorded" (Jim, 2026-09-25).
- `SessionCountRankingScreen` intentionally counts every session each current child attended, whoever recorded it.

- [ ] **Step 1: Write the failing tests**

```js
// __tests__/sessionHistoryReaders.test.js
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { getSessionCountRanking } from '../src/utils/dashboardStats';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const family = (id, userId, childId, name) => ({
  session: {
    id, user_id: userId, programme_id: 'programme-a', class_id: 'class-1', session_date: '2026-09-01',
    activities: {}, notes: null, created_at: '2026-09-01T08:00:00+00:00', updated_at: '2026-09-01T08:00:00+00:00',
  },
  attendees: [{
    id: `${id}-a`, session_id: id, child_id: childId, group_id: null, attendance_status: 'present',
    grade_snapshot: null, notes: null, created_at: '2026-09-01T08:00:00+00:00', updated_at: '2026-09-01T08:00:00+00:00',
    child_first_name: name, child_last_name: 'X', child_preferred_name: null,
  }],
});
const pullState = { lastPulledAt: null, cursor: '{}' };

describe('readers after history hydration', () => {
  let db;
  beforeEach(async () => { db = await createMigratedDatabase(runMigrations); await seedCoreData(db); });
  afterEach(async () => { await db.closeAsync(); });

  test('getChildren, getMyChildren, and the class roster never show a history reference child', async () => {
    await createSessionsRepository({ database: db }).saveHistoryPage([family('s-1', 'user-9', 'child-ref', 'Ref')], { scope: 's', pullState });
    const children = createChildrenRepository({ database: db });
    expect((await children.getChildren()).map((c) => c.id)).not.toContain('child-ref');
    expect((await children.getMyChildren('user-1')).map((c) => c.id)).not.toContain('child-ref');
  });

  test('History reads only sessions the EA recorded; the ranking counts every session my children attended', async () => {
    const children = createChildrenRepository({ database: db });
    await children.saveChildRecord({ id: 'child-1', first_name: 'Amahle', last_name: 'D', class_id: 'class-1', synced: true, sync_status: 'synced' });
    const sessions = createSessionsRepository({ database: db });
    await sessions.saveHistoryPage([family('s-mine', 'user-1', 'child-1', 'Amahle'), family('s-prev', 'user-9', 'child-1', 'Amahle')], { scope: 's', pullState });

    const history = await sessions.getSessions({ userId: 'user-1', recordedByUserId: 'user-1', sinceDate: '2026-01-01', order: 'desc' });
    expect(history.map((s) => s.id)).toEqual(['s-mine']);

    const all = await sessions.getSessions({ userId: 'user-1' });
    const ranking = getSessionCountRanking([{ id: 'child-1', first_name: 'Amahle', last_name: 'D' }], all);
    expect(ranking.find((r) => r.child.id === 'child-1').count).toBe(2);
  });
});
```

- [ ] **Step 2: Run and confirm the `getChildren` assertion fails**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest --config jest.integration.config.js __tests__/sessionHistoryReaders.test.js`
Expected: FAIL, because `getChildren` returns `child-ref`. The other assertions pass; they pin existing intent.

- [ ] **Step 3: Implement**

```js
  const getChildren = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(
      'select * from children where history_reference = 0 order by first_name, last_name'
    );
    return rows.map(mapChild);
  };
```

- [ ] **Step 4: Run and confirm pass, plus the children suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest --config jest.integration.config.js __tests__/sessionHistoryReaders.test.js __tests__/childrenRepository.test.js __tests__/ChildrenContext.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/childrenRepository.js jest.integration.config.js __tests__/sessionHistoryReaders.test.js
git commit -m "feat(cap-004): exclude history reference children from reads and pin session reader intent"
```

---

### Task 5: Traversal service `src/services/sessionHistoryPull.js`

**Files:**
- Create: `src/services/sessionHistoryPull.js`
- Test: `__tests__/sessionHistoryPull.test.js` (add to `jest.integration.config.js`; real SQLite, fake RPC client, and the real `createSupabaseRequestQueue`)

**Interfaces:**
- Consumes: Task 1's RPC names and arguments; Task 3's `saveHistoryPage(families, { scope, pullState, admit })`; `getActiveProgrammeId` and `getActiveAcademicYear` (`domainRepositoryUtils`); `classifyPullFailureKind` (`preloadedChildData`); `enqueueSupabaseRequest` and `createSupabaseRequestQueue` (`supabaseRequestQueue`).
- Produces:
  - `sessionHistoryScope(userId, programmeId) → string`.
  - `resetSessionHistoryForActorChange()`: invalidates every in-flight run (it is called when the signed-in user changes, Task 6).
  - `runSessionHistoryPull({ userId, force = false, deps }) → Promise<{ status, pages }>`, where `status ∈ 'complete' | 'partial' | 'fresh' | 'dependency' | 'transport' | 'query' | 'cancelled'`.
    - `deps` (optional, for tests): `{ database, client, enqueueRequest, now, wallNow, requestTimeoutMs, runBudgetMs, onPageSaved }`. `now` is the budget clock; `wallNow` is epoch milliseconds for stamps and the daily re-walk.
    - It is single-flight per `userId`.
  - The persisted cursor JSON is `{ windowStart, updatedAt, id, complete, firstWalk, firstWalkChildIds, rescanAfter, rewalkChildIds, rescanCompletedAt, rescanChildIds, lastFailureAt }`:
    - `updatedAt`/`id`/`complete` are the delta position;
    - `firstWalk` is `true` while the first hydration, a delta from an empty cursor, is unfinished;
    - `rescanAfter` is `{ updatedAt, id }` while a re-walk is part-way, otherwise `null`;
    - `*ChildIds` are the sorted active delivery child ids captured when that walk **started**. A child assigned during a walk is caught by the next one.

**Convergence rule (Jim, 2026-09-26; spec §12 items 8–10):**
- **Delta.** Each run first advances the delta: pages after the stored `(updatedAt, id)`, with a server-side 120-second overlap on its first page when resuming from a completed cursor.
- **Re-walk triggers.** The run then re-walks the whole academic year from the start when any of these holds:
  - no re-walk has completed in the last 24 hours;
  - the phone now has an active delivery child that was absent at the last completed re-walk;
  - a re-walk is part-way.
- **What the re-walk catches.** A newly assigned child's older sessions, which are behind the delta cursor (Codex finding 1), plus the rare cases: a transaction that started early but committed late, and authority lost between attendee pages.
- **First hydration counts as that day's re-walk.** A delta that started from an empty cursor *is* a full walk, so no double download happens on a new phone.

- [ ] **Step 1: Write the failing tests**

```js
// __tests__/sessionHistoryPull.test.js
jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import {
  runSessionHistoryPull,
  resetSessionHistoryForActorChange,
  sessionHistoryScope,
} from '../src/services/sessionHistoryPull';
import { createSupabaseRequestQueue } from '../src/services/supabaseRequestQueue';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const DAY = 24 * 60 * 60 * 1000;
const iso = (n) => `2026-09-01T08:00:00.${String(n).padStart(6, '0')}+00:00`; // microsecond strings
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const parent = (n, extra = {}) => ({
  id: uuid(n), user_id: 'user-1', programme_id: 'programme-a', class_id: null,
  session_date: '2026-09-01', activities: {}, notes: null, created_at: iso(n), updated_at: iso(n), ...extra,
});

// Scripted server. `parents()` is read on every call so a test can change the visible set
// between runs. Rows are sorted by (updated_at, id), as the real RPC returns them.
const fakeServer = ({ parents, attendeesBySession = {}, failParentAt = null, hangParentAt = null, onParentCall = () => {} }) => {
  const calls = [];
  let parentCalls = 0;
  const client = {
    rpc: (name, args) => ({
      abortSignal: (signal) => {
        calls.push({ name, args });
        if (name === 'get_delivery_history_page') {
          parentCalls += 1;
          onParentCall(parentCalls);
          if (failParentAt === parentCalls) return Promise.resolve({ data: null, error: { message: 'boom', code: 'XX000' } });
          if (hangParentAt === parentCalls) {
            return new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))));
          }
          const list = typeof parents === 'function' ? parents() : parents;
          const seconds = (value) => Date.parse(`${value.slice(0, 19)}Z`) / 1000; // test fixtures are UTC
          const rows = list
            .filter((p) => {
              if (!args.p_after_updated_at) return true;
              if (args.p_overlap_seconds > 0) {
                return seconds(p.updated_at) > seconds(args.p_after_updated_at) - args.p_overlap_seconds;
              }
              return p.updated_at > args.p_after_updated_at
                || (p.updated_at === args.p_after_updated_at && p.id > args.p_after_id);
            })
            .slice(0, args.p_page_size);
          return Promise.resolve({ data: rows, error: null });
        }
        const rows = args.p_session_ids.flatMap((id) => attendeesBySession[id] || []).slice(0, args.p_page_size);
        return Promise.resolve({ data: rows, error: null });
      },
    }),
  };
  return { client, calls, parentCalls: () => calls.filter((c) => c.name === 'get_delivery_history_page') };
};

describe('runSessionHistoryPull', () => {
  let db;
  let wall;
  const deps = (extra) => ({
    database: db, enqueueRequest: (task) => task(), requestTimeoutMs: 50, runBudgetMs: 60_000,
    wallNow: () => wall, ...extra,
  });
  const cursorOf = async (userId = 'user-1', programmeId = 'programme-a') => {
    const row = await db.getFirstAsync('select cursor, last_pulled_at from sync_state where scope = ?', sessionHistoryScope(userId, programmeId));
    return row && { ...JSON.parse(row.cursor), lastPulledAt: row.last_pulled_at };
  };
  const addDeliveryChild = async (childId) => {
    await db.runAsync("insert into children (id, first_name, last_name, class_id, sync_status) values (?, 'New', 'Child', 'class-1', 'synced')", childId);
    await db.runAsync("insert into child_ea_assignments (id, user_id, child_id, sync_status) values (?, 'user-1', ?, 'synced')", `cea-${childId}`, childId);
  };

  beforeEach(async () => {
    wall = Date.parse('2026-09-26T08:00:00.000Z');
    resetSessionHistoryForActorChange();
    db = await createMigratedDatabase(runMigrations);
    await seedCoreData(db);
  });
  afterEach(async () => { await db.closeAsync(); });

  test('first hydration pages to exhaustion, replays raw cursor strings, and counts as the day\'s re-walk', async () => {
    const server = fakeServer({ parents: Array.from({ length: 450 }, (_, i) => parent(i + 1)) });
    expect(await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) })).toEqual({ status: 'complete', pages: 3 });
    const calls = server.parentCalls();
    expect(calls).toHaveLength(3); // no second walk on a new phone
    expect(calls[1].args.p_after_updated_at).toBe(iso(200));
    expect(calls.every((c) => c.args.p_overlap_seconds === 0 && c.args.p_window_start === '2026-01-15')).toBe(true);
    expect(await cursorOf()).toMatchObject({
      updatedAt: iso(450), complete: true, windowStart: '2026-01-15', rescanAfter: null, firstWalk: false,
      rescanCompletedAt: new Date(wall).toISOString(), rescanChildIds: [],
    });
    expect((await db.getFirstAsync('select count(*) as n from sessions')).n).toBe(450);
  });

  test('a later forced run uses the two-minute overlap on its first page only', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) });
    const second = fakeServer({ parents: [parent(1), parent(2)] });
    await runSessionHistoryPull({ userId: 'user-1', force: true, deps: deps({ client: second.client }) });
    const overlaps = second.parentCalls().map((c) => c.args.p_overlap_seconds);
    expect(overlaps[0]).toBe(120);
    expect(overlaps.slice(1).every((o) => o === 0)).toBe(true);
  });

  test('a new delivery child triggers a re-walk that brings its older sessions down', async () => {
    const visible = [parent(5)];
    const server = fakeServer({ parents: () => visible });
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) });
    // Handover: a child whose older session (updated long before the cursor) becomes authorized.
    await addDeliveryChild('child-new');
    visible.unshift(parent(1, { updated_at: '2026-03-01T08:00:00.000001+00:00' }));
    const after = fakeServer({ parents: () => visible });
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: after.client }) })).status).toBe('complete');
    expect(after.parentCalls().some((c) => c.args.p_after_updated_at === null && c.args.p_overlap_seconds === 0)).toBe(true);
    expect(await db.getFirstAsync('select id from sessions where id = ?', uuid(1))).toEqual({ id: uuid(1) });
    expect((await cursorOf()).rescanChildIds).toEqual(['child-new']);
  });

  test('the re-walk runs again after 24 hours even with nothing new', async () => {
    const server = fakeServer({ parents: [parent(1)] });
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) });
    wall += DAY + 1;
    const later = fakeServer({ parents: [parent(1)] });
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: later.client }) });
    expect(later.parentCalls().some((c) => c.args.p_after_updated_at === null)).toBe(true);
    expect((await cursorOf()).rescanCompletedAt).toBe(new Date(wall).toISOString());
  });

  test('a budget-cut run resumes from its saved position on the next run', async () => {
    const parents = Array.from({ length: 450 }, (_, i) => parent(i + 1));
    let saved = 0;
    const first = await runSessionHistoryPull({ userId: 'user-1', deps: deps({
      client: fakeServer({ parents }).client,
      runBudgetMs: 1000,
      onPageSaved: () => { saved += 1; },
      now: () => (saved >= 2 ? 1e9 : 0), // the budget is spent once two pages are saved
    }) });
    expect(first).toEqual({ status: 'partial', pages: 2 });
    expect(await cursorOf()).toMatchObject({ updatedAt: iso(400), complete: false, lastPulledAt: null, firstWalk: true });
    const resumed = fakeServer({ parents });
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: resumed.client }) })).status).toBe('complete');
    expect(resumed.parentCalls()).toHaveLength(1); // the resumed first walk still counts as the day's re-walk
    expect(resumed.parentCalls()[0].args).toMatchObject({ p_after_updated_at: iso(400), p_overlap_seconds: 0 });
    expect((await db.getFirstAsync('select count(*) as n from sessions')).n).toBe(450);
  });

  test('a request deadline ends the run as transport, keeps earlier pages, and records the failure', async () => {
    const server = fakeServer({ parents: Array.from({ length: 300 }, (_, i) => parent(i + 1)), hangParentAt: 2 });
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) })).status).toBe('transport');
    expect(await cursorOf()).toMatchObject({ updatedAt: iso(200), complete: false, lastPulledAt: null, lastFailureAt: new Date(wall).toISOString() });
  });

  test('a hung predecessor in the shared queue cannot hold the run past its deadline', async () => {
    const queue = createSupabaseRequestQueue();
    queue.enqueue(() => new Promise(() => {})); // a roster request that never settles
    const server = fakeServer({ parents: [parent(1)] });
    const result = await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client, enqueueRequest: queue.enqueue, requestTimeoutMs: 20 }) });
    expect(result.status).toBe('transport');
    expect(server.calls).toHaveLength(0); // expired while queued, never started
    // Single flight was released: a new run starts rather than rejoining a stuck promise.
    const retry = fakeServer({ parents: [parent(1)] });
    await runSessionHistoryPull({ userId: 'user-1', force: true, deps: deps({ client: retry.client }) });
    expect(retry.calls.length).toBeGreaterThan(0);
  });

  test('a failed refresh after a successful run is not reported fresh and is retried', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) });
    wall += 1000;
    const failing = fakeServer({ parents: [parent(1)], failParentAt: 1 });
    expect((await runSessionHistoryPull({ userId: 'user-1', force: true, deps: deps({ client: failing.client }) })).status).toBe('query');
    expect((await cursorOf()).lastFailureAt).toBe(new Date(wall).toISOString());
    const retry = fakeServer({ parents: [parent(1)] });
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: retry.client }) })).status).toBe('complete');
    expect((await cursorOf()).lastFailureAt).toBeNull();
  });

  test('an actor change while a request is queued cancels the run before it starts', async () => {
    const queue = createSupabaseRequestQueue();
    let release;
    queue.enqueue(() => new Promise((resolve) => { release = resolve; }));
    const server = fakeServer({ parents: [parent(1)] });
    const run = runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client, enqueueRequest: queue.enqueue, requestTimeoutMs: 1000 }) });
    resetSessionHistoryForActorChange();
    release();
    expect((await run).status).toBe('cancelled');
    expect(server.calls).toHaveLength(0);
    expect(await cursorOf()).toBeNull();
  });

  test('an actor change after a response arrives commits nothing', async () => {
    const server = fakeServer({ parents: [parent(1)], onParentCall: () => resetSessionHistoryForActorChange() });
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) })).status).toBe('cancelled');
    expect((await db.getFirstAsync('select count(*) as n from sessions')).n).toBe(0);
    expect(await cursorOf()).toBeNull();
  });

  test('a parent with zero attendees does not stall the cursor', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1), parent(2)] }).client }) });
    expect((await cursorOf()).updatedAt).toBe(iso(2));
  });

  test('a new academic year resets the window and the cursor', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) });
    await db.runAsync('update academic_years set is_active = 0');
    await db.runAsync("insert into academic_years (id, label, starts_on, ends_on, is_active) values ('year-2027', '2027', '2027-01-14', '2027-12-10', 1)");
    const next = fakeServer({ parents: [] });
    await runSessionHistoryPull({ userId: 'user-1', force: true, deps: deps({ client: next.client }) });
    expect(next.parentCalls()[0].args).toMatchObject({ p_window_start: '2027-01-14', p_after_updated_at: null, p_overlap_seconds: 0 });
  });

  test('a second user on the same device starts fresh', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) });
    await db.runAsync("insert into staff_programme_assignments (id, user_id, programme_id, school_id, assigned_at) values ('spa-user-2', 'user-2', 'programme-a', 'school-1', '2026-01-15T00:00:00.000Z')");
    const other = fakeServer({ parents: [] });
    await runSessionHistoryPull({ userId: 'user-2', deps: deps({ client: other.client }) });
    expect(other.parentCalls()[0].args.p_after_updated_at).toBeNull();
  });

  test('a Programme change is a new scope with a fresh first hydration', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) });
    await db.runAsync("update staff_programme_assignments set ended_at = '2026-09-02T00:00:00.000Z' where id = 'spa-user-1'");
    await db.runAsync("insert into staff_programme_assignments (id, user_id, programme_id, school_id, assigned_at) values ('spa-user-1b', 'user-1', 'programme-b', 'school-1', '2026-09-02T00:00:00.000Z')");
    const next = fakeServer({ parents: [] });
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: next.client }) });
    expect(next.parentCalls()[0].args).toMatchObject({ p_programme_id: 'programme-b', p_after_updated_at: null });
  });

  test('missing Programme or academic year reports dependency without a request or stamp', async () => {
    await db.runAsync('update academic_years set is_active = 0');
    const server = fakeServer({ parents: [parent(1)] });
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) })).status).toBe('dependency');
    expect(server.calls).toHaveLength(0);
  });

  test('a fresh completed scope is skipped unless forced', async () => {
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: fakeServer({ parents: [parent(1)] }).client }) });
    const again = fakeServer({ parents: [parent(1)] });
    expect((await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: again.client }) })).status).toBe('fresh');
    expect(again.calls).toHaveLength(0);
  });

  test('a concurrent call joins the in-flight run instead of starting a second traversal', async () => {
    const server = fakeServer({ parents: [parent(1)] });
    const [a, b] = await Promise.all([
      runSessionHistoryPull({ userId: 'user-1', deps: deps({ client: server.client }) }),
      runSessionHistoryPull({ userId: 'user-1', force: true, deps: deps({ client: server.client }) }),
    ]);
    expect(a).toBe(b);
    expect(server.parentCalls()).toHaveLength(1);
  });

  test('attendees beyond one attendee page are fetched with the attendee cursor', async () => {
    const p = parent(1);
    const many = Array.from({ length: 250 }, (_, i) => ({
      id: `a-${String(i).padStart(4, '0')}`, session_id: p.id, child_id: 'child-1', group_id: null,
      attendance_status: 'present', grade_snapshot: null, notes: null, created_at: iso(1), updated_at: iso(1),
      child_first_name: 'A', child_last_name: 'B', child_preferred_name: null,
    }));
    const calls = [];
    const client = { rpc: (name, args) => ({ abortSignal: () => {
      calls.push({ name, args });
      if (name === 'get_delivery_history_page') return Promise.resolve({ data: args.p_after_updated_at ? [] : [p], error: null });
      const start = args.p_after_attendee_id ? many.findIndex((a) => a.id === args.p_after_attendee_id) + 1 : 0;
      return Promise.resolve({ data: many.slice(start, start + args.p_page_size), error: null });
    } }) };
    await runSessionHistoryPull({ userId: 'user-1', deps: deps({ client }) });
    const attendeeCalls = calls.filter((c) => c.name === 'get_delivery_history_attendee_page');
    expect(attendeeCalls).toHaveLength(2);
    expect(attendeeCalls[1].args).toMatchObject({ p_after_session_id: p.id, p_after_attendee_id: 'a-0199' });
    expect((await db.getFirstAsync('select count(*) as n from session_attendees')).n).toBe(250);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest --config jest.integration.config.js __tests__/sessionHistoryPull.test.js`
Expected: FAIL with `Cannot find module '../src/services/sessionHistoryPull'`.

- [ ] **Step 3: Implement**

```js
// src/services/sessionHistoryPull.js
// CAP-004 session history hydration (spec §5 and §12; ADR-0006 and its follow-ups).
// A cheap delta over the server's family timestamp, plus a daily (and new-delivery-child)
// re-walk of the academic year that catches what a timestamp cursor cannot see. Each page is
// persisted atomically with its cursor; absence never deletes; updatedAt is the raw PostgREST
// string and is never parsed into a Date.
import { supabase } from './supabaseClient';
import { enqueueSupabaseRequest } from './supabaseRequestQueue';
import { classifyPullFailureKind } from './preloadedChildData';
import { resolveDatabase } from '../db/repositories/repositoryRuntime';
import { getActiveAcademicYear, getActiveProgrammeId } from '../db/repositories/domainRepositoryUtils';
import { createSessionsRepository, sessionsRepository } from '../db/repositories/sessionsRepository';
import { syncStateRepository } from '../db/repositories/syncStateRepository';
import { decodeJson } from '../db/repositories/sqliteRepositoryUtils';

export const SESSION_HISTORY_PAGE_SIZE = 200;
export const SESSION_HISTORY_REQUEST_TIMEOUT_MS = 15_000;
export const SESSION_HISTORY_RUN_BUDGET_MS = 60_000;
export const SESSION_HISTORY_OVERLAP_SECONDS = 120;
export const SESSION_HISTORY_STALENESS_MS = 15 * 60 * 1000;
export const SESSION_HISTORY_REWALK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const sessionHistoryScope = (userId, programmeId) => `session_history_pull:${userId}:${programmeId}`;

let actorGeneration = 0;
const inFlight = new Map();

export const resetSessionHistoryForActorChange = () => {
  actorGeneration += 1;
  inFlight.clear();
};

class HistoryRunStop extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'transport' | 'query' | 'cancelled' | 'budget'
  }
}

// The deadline starts when the request is enqueued, so a hung predecessor in the shared
// queue cannot hold this run. Work that reaches the front after expiry or after an actor
// change never starts.
const withDeadline = ({ enqueueRequest, timeoutMs, isStale, start }) => {
  const controller = new AbortController();
  let expired = false;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      controller.abort();
      reject(new HistoryRunStop('transport', 'Session history request deadline exceeded'));
    }, timeoutMs);
  });
  const queued = enqueueRequest(() => {
    if (expired) throw new HistoryRunStop('transport', 'Expired while queued');
    if (isStale()) throw new HistoryRunStop('cancelled', 'Signed-in user changed');
    return start(controller.signal);
  });
  queued.catch(() => {});
  return Promise.race([queued, deadline]).finally(() => clearTimeout(timer));
};

const runOnce = async ({ userId, force, deps }) => {
  const {
    database,
    client = supabase,
    enqueueRequest = enqueueSupabaseRequest,
    now = () => Date.now(),
    wallNow = () => Date.now(),
    requestTimeoutMs = SESSION_HISTORY_REQUEST_TIMEOUT_MS,
    runBudgetMs = SESSION_HISTORY_RUN_BUDGET_MS,
    onPageSaved = () => {},
  } = deps;
  const generation = actorGeneration;
  const isStale = () => generation !== actorGeneration;
  const repo = database ? createSessionsRepository({ database }) : sessionsRepository;
  const db = await resolveDatabase(database);

  const programmeId = userId ? await getActiveProgrammeId(db, userId) : null;
  const year = await getActiveAcademicYear(db);
  if (!programmeId || !year?.starts_on) return { status: 'dependency', pages: 0 };

  const scope = sessionHistoryScope(userId, programmeId);
  const stateRow = await db.getFirstAsync('select last_pulled_at, cursor from sync_state where scope = ?', scope);
  const emptyState = {
    windowStart: year.starts_on, updatedAt: null, id: null, complete: false,
    firstWalk: true, firstWalkChildIds: null,
    rescanAfter: null, rewalkChildIds: null, rescanCompletedAt: null, rescanChildIds: [],
    lastFailureAt: null,
  };
  let state = { ...emptyState, ...(decodeJson(stateRow?.cursor, {}) || {}) };
  let lastPulledAt = stateRow?.last_pulled_at || null;
  if (state.windowStart !== year.starts_on) {
    state = emptyState;
    lastPulledAt = null;
  }

  const currentChildIds = (await db.getAllAsync(`
    select distinct child_id from child_ea_assignments
    where user_id = ? and unassigned_at is null
    order by child_id
  `, userId)).map((row) => row.child_id);
  const wallIso = () => new Date(wallNow()).toISOString();
  const rewalkDue = () => Boolean(state.rescanAfter)
    || !state.rescanCompletedAt
    || wallNow() - Date.parse(state.rescanCompletedAt) >= SESSION_HISTORY_REWALK_INTERVAL_MS
    || currentChildIds.some((id) => !state.rescanChildIds.includes(id));

  const failedSinceSuccess = state.lastFailureAt
    && (!lastPulledAt || Date.parse(state.lastFailureAt) > Date.parse(lastPulledAt));
  const lastPulledMs = Date.parse(lastPulledAt || '');
  if (!force && state.complete && !failedSinceSuccess && !rewalkDue()
    && Number.isFinite(lastPulledMs) && wallNow() - lastPulledMs < SESSION_HISTORY_STALENESS_MS) {
    return { status: 'fresh', pages: 0 };
  }

  const startedAt = now();
  const remaining = () => runBudgetMs - (now() - startedAt);
  const request = (rpcName, args) => {
    const budget = remaining();
    if (budget <= 0) throw new HistoryRunStop('budget', 'Run budget spent');
    return withDeadline({
      enqueueRequest,
      timeoutMs: Math.min(requestTimeoutMs, budget),
      isStale,
      start: (signal) => client.rpc(rpcName, args).abortSignal(signal),
    }).then(({ data, error }) => {
      if (error) throw new HistoryRunStop(classifyPullFailureKind(error), error.message || 'RPC failed');
      if (isStale()) throw new HistoryRunStop('cancelled', 'Signed-in user changed');
      return data || [];
    });
  };

  const fetchAttendees = async (sessionIds) => {
    const rows = [];
    let after = null;
    for (;;) {
      const page = await request('get_delivery_history_attendee_page', {
        p_session_ids: sessionIds,
        p_page_size: SESSION_HISTORY_PAGE_SIZE,
        p_after_session_id: after?.session_id ?? null,
        p_after_attendee_id: after?.id ?? null,
      });
      rows.push(...page);
      if (page.length < SESSION_HISTORY_PAGE_SIZE) return rows;
      after = page[page.length - 1];
    }
  };

  const persist = async (parents, attendees, patch, { stamp = false } = {}) => {
    const byParent = new Map(parents.map((p) => [p.id, []]));
    for (const attendee of attendees) byParent.get(attendee.session_id)?.push(attendee);
    const nextState = { ...state, ...patch, lastFailureAt: null };
    const nextLastPulledAt = stamp ? wallIso() : lastPulledAt;
    await repo.saveHistoryPage(
      parents.map((session) => ({ session, attendees: byParent.get(session.id) })),
      {
        scope,
        pullState: { lastPulledAt: nextLastPulledAt, cursor: JSON.stringify(nextState) },
        admit: () => !isStale(),
      }
    );
    state = nextState;
    lastPulledAt = nextLastPulledAt;
    pages += 1;
    onPageSaved({ scope, pages });
  };

  // Pages from `from` to exhaustion. onPage returns the state patch for that page.
  const walk = async ({ from, firstOverlap, onPage }) => {
    let position = from;
    let overlap = firstOverlap;
    for (;;) {
      const parents = await request('get_delivery_history_page', {
        p_programme_id: programmeId,
        p_window_start: year.starts_on,
        p_page_size: SESSION_HISTORY_PAGE_SIZE,
        p_after_updated_at: position?.updatedAt ?? null,
        p_after_id: position?.id ?? null,
        p_overlap_seconds: overlap,
      });
      overlap = 0;
      const attendees = parents.length ? await fetchAttendees(parents.map((p) => p.id)) : [];
      const last = parents[parents.length - 1];
      position = last ? { updatedAt: last.updated_at, id: last.id } : position;
      const exhausted = parents.length < SESSION_HISTORY_PAGE_SIZE;
      await onPage({ parents, attendees, position, exhausted });
      if (exhausted) return;
      if (remaining() <= 0) throw new HistoryRunStop('budget', 'Run budget spent');
    }
  };

  let pages = 0;
  try {
    // 1. Delta. The first hydration (from an empty cursor) is a full walk of the year, so its
    //    completion also counts as the day's re-walk, even if it spanned several runs.
    if (state.firstWalk && !state.firstWalkChildIds) state = { ...state, firstWalkChildIds: currentChildIds };
    await walk({
      from: state.updatedAt ? { updatedAt: state.updatedAt, id: state.id } : null,
      firstOverlap: state.complete && state.updatedAt ? SESSION_HISTORY_OVERLAP_SECONDS : 0,
      onPage: ({ parents, attendees, position, exhausted }) => persist(parents, attendees, {
        updatedAt: position?.updatedAt ?? state.updatedAt,
        id: position?.id ?? state.id,
        complete: exhausted,
        ...(exhausted && state.firstWalk
          ? {
            firstWalk: false,
            rescanAfter: null,
            rescanCompletedAt: wallIso(),
            rescanChildIds: state.firstWalkChildIds,
            firstWalkChildIds: null,
          }
          : {}),
      }, { stamp: exhausted }),
    });

    // 2. Re-walk of the academic year when due (daily, a new delivery child, or unfinished).
    if (rewalkDue()) {
      if (!state.rescanAfter) state = { ...state, rewalkChildIds: currentChildIds };
      await walk({
        from: state.rescanAfter,
        firstOverlap: 0,
        onPage: ({ parents, attendees, position, exhausted }) => persist(parents, attendees, exhausted
          ? { rescanAfter: null, rescanCompletedAt: wallIso(), rescanChildIds: state.rewalkChildIds, rewalkChildIds: null }
          : { rescanAfter: position }),
      });
    }
    return { status: 'complete', pages };
  } catch (error) {
    const kind = error instanceof HistoryRunStop ? error.kind
      : error?.kind === 'cancelled' ? 'cancelled'
        : 'transport';
    if (kind === 'budget') return { status: 'partial', pages };
    if (kind !== 'cancelled' && !isStale()) {
      // Remember the failure so a previous success is never presented as current.
      state = { ...state, lastFailureAt: wallIso() };
      await syncStateRepository.setPullState(scope, { lastPulledAt, cursor: JSON.stringify(state) }, { transaction: db });
    }
    return { status: kind, pages };
  }
};

export const runSessionHistoryPull = ({ userId, force = false, deps = {} } = {}) => {
  const existing = inFlight.get(userId);
  if (existing) return existing;
  const run = runOnce({ userId, force, deps }).finally(() => {
    if (inFlight.get(userId) === run) inFlight.delete(userId);
  });
  inFlight.set(userId, run);
  return run;
};
```

Notes for the implementer:
- `pages` is declared before `persist` runs (both closures see the same `let`). Keep that order when refactoring; it is written this way so `persist` can increment it.
- **The failure write.** It passes the resolved handle as `{ transaction: db }`. `setPullState`'s `runWrite` runs a single statement directly on whatever handle it is given (`syncStateRepository.js`), so the same line writes to the injected test database or the app database.
- **Removal lag.** A child's delivery assignment ending does not remove their sessions from the phone, which matches "absence never deletes" and the capturer-agnostic history rule.
- **Overlap re-reads a little.** `(updated_at, id) > (t − 120 s, id)` re-reads rows at and just before the cursor, and the idempotent upserts make that harmless.

- [ ] **Step 4: Run and confirm pass**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest --config jest.integration.config.js __tests__/sessionHistoryPull.test.js`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/sessionHistoryPull.js jest.integration.config.js __tests__/sessionHistoryPull.test.js
git commit -m "feat(cap-004): bounded session history delta with daily re-walk, actor fencing, and queue-aware deadlines"
```

---

### Task 6: Orchestration, status store, and UX

**Files:**
- Create: `src/services/sessionHistoryStatus.js`
- Modify: `src/utils/syncStatusPresenter.js` (add `describeHistoryState`)
- Modify: `src/context/ChildrenContext.js` (after `ensureReferenceData` in the pull effect near line 113)
- Modify: `src/screens/sessions/SessionHistoryScreen.js`, `src/screens/main/SyncStatusScreen.js`
- Test: `__tests__/sessionHistoryStatus.test.js`; extend `__tests__/SessionHistoryScreen.plan5.test.js`

**Interfaces:**
- Consumes: Task 5's `runSessionHistoryPull`, `sessionHistoryScope`.
- Produces:
  - `startSessionHistoryPull({ userId, force })`: wraps `runSessionHistoryPull`, sets `running`, bumps `pageVersion` on each saved page, and bumps `runVersion` when a run finishes, even one that saved nothing.
  - `resetSessionHistoryStatusForActorChange()`: calls `resetSessionHistoryForActorChange()` and clears the published state.
  - `useSessionHistoryStatus() → { running: boolean, pageVersion: number, runVersion: number, lastResult: object|null }`.
  - `getSessionHistoryPullState(userId) → Promise<{ scope, lastPulledAt, cursor, updatedAt } | null>` (resolves the active Programme; `null` without one).
  - `describeHistoryState({ running, pullState }) → { label, detail }`, where `pullState = { lastPulledAt, cursor }` from `syncStateRepository.getPullState`.

- [ ] **Step 1: Write the failing tests**

```js
// __tests__/sessionHistoryStatus.test.js
import { describeHistoryState } from '../src/utils/syncStatusPresenter';

describe('describeHistoryState', () => {
  test('running wins', () => {
    expect(describeHistoryState({ running: true, pullState: null }).label).toBe('Downloading');
  });
  test('never pulled', () => {
    expect(describeHistoryState({ running: false, pullState: null }).label).toBe('Not downloaded yet');
  });
  test('complete and stamped', () => {
    expect(describeHistoryState({ running: false, pullState: { lastPulledAt: '2026-09-25T10:00:00.000Z', cursor: JSON.stringify({ complete: true }) } }).label)
      .toBe('Up to date');
  });
  test('incomplete names the time it became incomplete', () => {
    const { label } = describeHistoryState({ running: false, pullState: { lastPulledAt: null, cursor: JSON.stringify({ complete: false }), updatedAt: '2026-09-25T10:00:00.000Z' } });
    expect(label).toMatch(/^Incomplete since /);
  });
  test('a failure after an earlier success is not reported as up to date', () => {
    const { label, detail } = describeHistoryState({ running: false, pullState: {
      lastPulledAt: '2026-09-25T10:00:00.000Z',
      cursor: JSON.stringify({ complete: true, lastFailureAt: '2026-09-26T08:00:00.000Z' }),
    } });
    expect(label).toMatch(/^Incomplete since /);
    expect(detail).toBe('History not fully downloaded yet');
  });
});
```

In `SessionHistoryScreen.plan5.test.js`, add three tests:
- **Downloading line:** when `useSessionHistoryStatus` reports `running: true`, the text "Downloading history from Head Office…" renders.
- **Incomplete line:** when not running and the pull state is incomplete, "History not fully downloaded yet" renders.
- **Pull-to-refresh:** the `RefreshControl` `onRefresh` calls `startSessionHistoryPull({ userId, force: true })`.

Mock `../src/services/sessionHistoryStatus` in that test the same way the file already mocks repositories.

- [ ] **Step 2: Run and confirm failure**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/sessionHistoryStatus.test.js __tests__/SessionHistoryScreen.plan5.test.js`
Expected: FAIL (`describeHistoryState` is not exported; the new strings are not rendered).

- [ ] **Step 3: Implement**

`src/services/sessionHistoryStatus.js`:

```js
import { useSyncExternalStore } from 'react';
import {
  resetSessionHistoryForActorChange,
  runSessionHistoryPull,
  sessionHistoryScope,
} from './sessionHistoryPull';
import { resolveDatabase } from '../db/repositories/repositoryRuntime';
import { getActiveProgrammeId } from '../db/repositories/domainRepositoryUtils';
import { syncStateRepository } from '../db/repositories/syncStateRepository';

let snapshot = { running: false, pageVersion: 0, runVersion: 0, lastResult: null };
const listeners = new Set();
const publish = (next) => { snapshot = { ...snapshot, ...next }; listeners.forEach((listener) => listener()); };

export const startSessionHistoryPull = async ({ userId, force = false } = {}) => {
  if (!userId) return null;
  publish({ running: true });
  try {
    const result = await runSessionHistoryPull({
      userId,
      force,
      deps: { onPageSaved: () => publish({ pageVersion: snapshot.pageVersion + 1 }) },
    });
    publish({ lastResult: result });
    return result;
  } catch (error) {
    publish({ lastResult: { status: 'transport', pages: 0 } });
    return null;
  } finally {
    publish({ running: false, runVersion: snapshot.runVersion + 1 });
  }
};

export const resetSessionHistoryStatusForActorChange = () => {
  resetSessionHistoryForActorChange();
  publish({ running: false, lastResult: null, runVersion: snapshot.runVersion + 1 });
};

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const useSessionHistoryStatus = () => useSyncExternalStore(subscribe, () => snapshot);

// Screens read persisted completeness through this helper so they never touch SQLite directly.
export const getSessionHistoryPullState = async (userId) => {
  if (!userId) return null;
  const db = await resolveDatabase();
  const programmeId = await getActiveProgrammeId(db, userId);
  return programmeId ? syncStateRepository.getPullState(sessionHistoryScope(userId, programmeId)) : null;
};
```

`describeHistoryState` in `syncStatusPresenter.js`:

```js
export const describeHistoryState = ({ running, pullState } = {}) => {
  if (running) return { label: 'Downloading', detail: 'Downloading history from Head Office…' };
  if (!pullState) return { label: 'Not downloaded yet', detail: null };
  const cursor = (() => { try { return JSON.parse(pullState.cursor || '{}'); } catch { return {}; } })();
  const failedSinceSuccess = cursor.lastFailureAt
    && (!pullState.lastPulledAt || Date.parse(cursor.lastFailureAt) > Date.parse(pullState.lastPulledAt));
  if (cursor.complete && pullState.lastPulledAt && !failedSinceSuccess) return { label: 'Up to date', detail: null };
  const since = cursor.lastFailureAt || pullState.updatedAt || pullState.lastPulledAt;
  const time = since ? new Date(since).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'the last attempt';
  return { label: `Incomplete since ${time}`, detail: 'History not fully downloaded yet' };
};
```

`syncStateRepository.getPullState` returns `{ scope, lastPulledAt, cursor }` today. Extend `mapPullState` to also return `updatedAt: row.updated_at`, which gives the "Incomplete since" time.

In `ChildrenContext.js`, first fence account changes. Next to `activeUserIdRef` (`:51`), add an effect that invalidates any in-flight history run whenever the signed-in user id changes, including to `null` on sign-out or session expiry:

```js
  const historyActorRef = useRef(user?.id || null);
  useEffect(() => {
    const nextActor = user?.id || null;
    if (historyActorRef.current !== nextActor) {
      historyActorRef.current = nextActor;
      resetSessionHistoryStatusForActorChange();
    }
  }, [user?.id]);
```

Add a `ChildrenContext` test: render with user A, start a history run (mock `runSessionHistoryPull` to return a never-settling promise), re-render with user B, and assert `resetSessionHistoryForActorChange` was called once.

Then, right after the successful `await ensureReferenceData({ userId: activeUserId });` and its `activeUserIdRef` guard, add a non-awaited start so the roster publish is never delayed:

```js
      // CAP-004: session history follows the roster and reference pulls (academic year and most
      // attendee children are then local). Never awaited: history must not delay the roster.
      startSessionHistoryPull({ userId: activeUserId });
```

In `SessionHistoryScreen.js`:
- read `const { running, pageVersion } = useSessionHistoryStatus();` and, in the existing focus-effect loader, `const pullState = await getSessionHistoryPullState(user.id);` kept in component state;
- add `pageVersion` and `runVersion` to the reload dependencies, so a landed page, or a finished run that saved nothing, re-reads SQLite and the pull state;
- render `describeHistoryState(...).detail`, when non-null, as one thin `Text` line above the list, styled with `colors.textSecondary` and `spacing.sm` per `documentation/design-system.md`;
- give the `FlatList` a `refreshControl={<RefreshControl refreshing={running} onRefresh={() => startSessionHistoryPull({ userId: user.id, force: true })} />}`.

In `SyncStatusScreen.js`, load `getSessionHistoryPullState(user.id)` on focus and whenever `pageVersion` or `runVersion` changes, and add a "History" `Card` after the existing status card. Its title is "History"; its body is `describeHistoryState({ running, pullState }).label`, plus the detail when present. Reuse the screen's existing `styles.card` and `styles.sectionTitle`. The existing upload card and its "All saved and synced" copy stay unchanged.

- [ ] **Step 4: Run and confirm pass, plus neighbouring UI suites**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/sessionHistoryStatus.test.js __tests__/SessionHistoryScreen.plan5.test.js __tests__/ChildrenContext.test.js` and `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest --config jest.integration.config.js __tests__/ChildrenContextPull.integration.test.js`
Expected: PASS. In the ChildrenContext tests, mock `../src/services/sessionHistoryStatus` so no real traversal runs.

- [ ] **Step 5: Commit**

```bash
git add src/services/sessionHistoryStatus.js src/utils/syncStatusPresenter.js src/db/repositories/syncStateRepository.js src/context/ChildrenContext.js src/screens/sessions/SessionHistoryScreen.js src/screens/main/SyncStatusScreen.js __tests__/sessionHistoryStatus.test.js __tests__/SessionHistoryScreen.plan5.test.js __tests__/ChildrenContext.test.js
git commit -m "feat(cap-004): start history hydration after the roster pull and show its state"
```

---

### Task 7: Full regression gate

- [ ] **Step 1: Unit suite**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm test -- --silent --maxWorkers=2`
Expected: PASS. Record the suite and test counts.

- [ ] **Step 2: File-backed SQLite integration suite**

Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npm run test:integration`
Expected: PASS. Record the counts.

- [ ] **Step 3: Disposable PostgreSQL harness** (Task 1 Step 6 command)

Expected: PASS. Record the dense-plan buffer figures.

- [ ] **Step 4: `git diff --check` and push the branch; CI `tests` workflow green**

Push needs Jim's yes, which Claude requests. Record the Actions run id.

---

### Task 8: Standing documents in the same branch

**Files:** `documentation/rls-sync-contract-map.md`, `documentation/field-app-capability-ledger.md`, `documentation/ROADMAP.md`, `documentation/build-log.md`, `docs/agent-context/cap-004-session-history-hydration.md`, `documentation/LEARNING.md`.

- [ ] **Step 1: Contract map**
  - Replace the "Delivery-history parent page" operation row with two rows: `get_delivery_history_page` and `get_delivery_history_attendee_page`. Give arguments, bounds, ordering, and grants.
  - Record in the `sessions`/`session_attendees` rows:
    - server-owned `updated_at` on insert and update;
    - the family touch trigger;
    - inbound hydration implemented;
    - `history_reference` children.
  - Extend "Pull Persistence & Reconcile" with the history rules:
    - one transaction per page, including the cursor;
    - pending-local-wins;
    - no absence delete;
    - missing class/group references nulled;
    - the stamp only at exhaustion;
    - the per-user-and-Programme scope.
- [ ] **Step 2: Capability ledger**
  - CAP-004 → implemented, with this branch's evidence tier.
  - CAP-007 → the attendee pager and deadline are now built; jitter and kill switch remain.
- [ ] **Step 3: ROADMAP §1**
  - Tick the session items this lands: the pull, keyset pages and deadlines, transactional persistence, pending-local preservation, the completeness evidence, and the history-versus-upload sync status.
  - Leave the two-device physical gate and the hosted gate open until Task 9.
- [ ] **Step 4: Build log**
  - Verification rows for Tasks 1–7, with exact commands and counts.
  - A Bug-and-Gap row for the insert-stamping defect found at plan time.
  - A Decision row for the §12 corrections.
- [ ] **Step 4b: Roadmap follow-up outside this slice.** Under §3, add an item: "Give every roster/reference pull request a deadline; today a hung request blocks the shared `supabaseRequestQueue` for all later pulls (found by the 2026-09-26 Codex review of CAP-004). History is protected by its queue-aware deadline; the roster pull is not."
- [ ] **Step 5: Handoff and LEARNING**
  - Update the handoff's safe resumption point.
  - Add a LEARNING section, "A delta sync is only as honest as its clock", covering:
    - insert stamping;
    - the transaction-start overlap;
    - the cursor in the same transaction;
    - why "incomplete family" would have wedged;
    - why permission changes need a re-walk: a timestamp watches rows, not who may see them.
- [ ] **Step 6: Link check and commit**

Run the Node relative-link walker used in the 2026-09-23 build-log row, then `git diff --check`.

```bash
git add documentation docs
git commit -m "docs(cap-004): contract map, ledger, roadmap, build log, handoff, and learning"
```

---

### Task 9: Hosted gate and device gates (operator; each step needs Jim's explicit yes)

- [ ] **Step 1: Dry run.** `npm run sqlite:staging:dry-run` from the checkout (isolated helper). Confirm `project_ref=segygjzpujphwvrubusm` and that the only pending migration is `20260925120000_session_history_family_delta.sql`.
- [ ] **Step 2: Apply (Jim's yes).** `npm run sqlite:staging:push`. Rerun the Step 4 read-only probe from 2026-09-23: expect a 24-row ledger, both new functions, the old function and its index absent, and triggers `before insert or update`.
- [ ] **Step 3: Hosted matrix.** Run the rollback-only six-actor matrix for both RPCs, as in the 2026-09-04 hosted gate, plus an authenticated HTTP walk of a namespaced fixture with more than 1,000 attendees across pages, anonymous denial, and a zero-residue query.
- [ ] **Step 4: Device gates.** These need an EAS preview build (Jim's yes):
  - a new phone shows the EA's own history within a minute, on iPhone and on a low-end Android;
  - two devices converge, including a backdated session;
  - force-stop and offline mid-download leave no half-state.

  Record each result in the build log and in `device-gates-sqlite-backend-2026-07.md`.

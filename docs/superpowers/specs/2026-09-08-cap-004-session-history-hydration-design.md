# CAP-004 Design Spec: Session and Attendee History Hydration

**Status:** design approved by Jim on 2026-09-08 through a grill-with-docs session; awaiting Jim's
review of this document before an implementation plan is written. Companion decision record:
[ADR-0006](../../adr/0006-session-history-converges-on-server-stamped-family-timestamp.md).

**Owner of build:** Codex, through the plugin, task by task from the implementation plan that
follows this spec. Claude specifies, reviews the diff and tests, and verifies.

## 1. Problem

A phone that signs in fresh (new device, reinstall, second device) shows no session history even
though the hosted `masi-app-sqlite` backend holds it. Local capture, outbound sync, server schema,
and the session authorization contract all exist; the missing piece is inbound hydration of
`sessions` and `session_attendees` into SQLite. The capability ledger calls this CAP-004 and the
roadmap lists it as the first P0 history slice.

Two findings from the 2026-09-04 Codex adversarial review of the authorization slice are inputs, not
afterthoughts:

1. A session the actor may read can include a coattendee child the actor has no roster grant for.
   Local SQLite enforces `session_attendees.child_id → children.id`, so a complete family cannot be
   stored unless the phone holds a row for that child.
2. `get_delivery_history_session_page` bounded its output, not its work: both grant arms were
   deduplicated before `ORDER BY`/`LIMIT`, so every page recomputed all remaining candidates.

## 2. Decisions locked with Jim (2026-09-05 to 2026-09-08)

| Decision | Choice | Why |
|---|---|---|
| Retention window | Sessions with `session_date` on or after the active academic year's `starts_on` | Bounds every run; matches what an EA acts on; older years stay on the server for reporting |
| Coattendees outside the actor's scopes | **History reference child**: a minimal, flagged local `children` row carrying identity and display name only | Keeps the local foreign key; honours the locked "one complete aggregate" boundary; never grants roster or write authority; never uploaded |
| Convergence after first hydration | Delta keyed on the parent session's server-stamped `updated_at`, bumped by a trigger when any attendee is written | Steady-state traffic is one small request; correct for backdated and second-device sessions and for future edits; safe against wrong phone clocks because the server owns the timestamp |
| Old descending session-date RPC | Dropped in the same migration, with its date-ordered index | One contract, one harness gate, no dead authorized surface |
| Hydration UX | Render SQLite immediately; quiet inline status line; separate History row on Sync Status | Never block capture; never let the green upload label imply history is complete |
| Record | ADR-0006 | Hard to reverse, surprising later, real trade-off |

## 3. Domain language

Added to `CONTEXT.md` (committed on this branch):

> **History reference child**: a child record a phone holds only because the child attended a
> session the EA is authorized to read; it carries identity and display name and nothing else.
> _Avoid_: treating it as roster, enrollment, assessment scope, or write authority; "phantom child",
> "stub child", "ghost row".

Relationship: a **Session** hydrated onto a phone may carry **History reference children** for
coattendees outside the EA's scopes; the reference grants neither delivery nor assessment scope and
is never uploaded.

Existing terms this spec relies on unchanged: the **session aggregate boundary** (one qualifying
attendee grants the complete parent-and-attendee family; `rls-sync-contract-map.md`), **delivery
scope**, **capturer-agnostic session history** (`CONTEXT.md`, ADR-0005).

## 4. Server contract (one canonical Supabase migration)

### 4.1 Family timestamp

`private.set_updated_at()` already runs `before insert or update` on `sessions` and
`session_attendees`, overwriting any client-sent `updated_at` with `now()`. This spec adds
`private.touch_session_family()`, a `security definer`, `set search_path = ''` trigger function on
`session_attendees` (`after insert or update or delete`, for each row) that runs
`update public.sessions set updated_at = now() where id = <session_id>` for the affected parent
(both old and new `session_id` on update). Consequences:

- `sessions.updated_at` becomes "family last written on the server". It is the only keyset the
  parent page needs.
- The parent update touches no other column, so the restrictive guard policy
  `sessions_forward_prep_pin_defaults_update` (`state = 'completed' and group_id is null`) is
  satisfied, and `security definer` means the attendee writer's own session policy is not consulted.
- Late-arriving attendee batches (outbox pushes the parent first) re-surface the family on the
  next delta run.
- The existing `sessions_set_updated_at` trigger still fires on that update; there is no path back
  to `session_attendees`, so no recursion.

### 4.2 Parent page RPC

```sql
public.get_delivery_history_page(
  p_programme_id     uuid,
  p_window_start     date,
  p_page_size        integer default 100,   -- 1..200
  p_after_updated_at timestamptz default null,
  p_after_id         uuid default null
) returns setof public.sessions
language plpgsql stable security definer set search_path = ''
```

Rules:

- `auth.uid()` null → `28000`. `p_programme_id` or `p_window_start` null → `22023`. Page size
  outside 1..200 → `22023`. Cursor wholly null or wholly populated → otherwise `22023`.
- Two positive-grant arms, each independently ordered by `(updated_at asc, id asc)` and limited to
  `p_page_size` **before** the merge:
  1. owner: `s.user_id = auth.uid()`;
  2. historical direct delivery: `exists` any `child_ea_assignments` row for the actor joined through
     `session_attendees.child_id` to the session (no `unassigned_at` filter, per the accepted
     capturer-agnostic contract).
  Both arms filter `s.programme_id = p_programme_id and s.session_date >= p_window_start and
  (s.updated_at, s.id) > (p_after_updated_at, p_after_id)` when a cursor is supplied.
- Merge: `union` of the two bounded id sets, join back to `sessions`, `order by updated_at, id`,
  `limit p_page_size`. The top-N of a union equals the top-N of the union of each arm's top-N, so
  this is exact and page cost is bounded by the arms, not by remaining history.
- Class, group, and creator projections remain absent. `p_programme_id` is a partition key, not a
  grant (unchanged from the current contract).
- Returns full `sessions` rows. `updated_at` and `created_at` travel as PostgreSQL ISO strings and
  the client never converts them through a millisecond-only `Date` before using them as cursor
  input.

### 4.3 Attendee page RPC

```sql
public.get_delivery_history_attendee_page(
  p_session_ids        uuid[],               -- 1..200 ids
  p_page_size          integer default 200,  -- 1..200
  p_after_session_id   uuid default null,
  p_after_attendee_id  uuid default null
) returns table (
  id uuid, session_id uuid, child_id uuid, group_id uuid, attendance_status text,
  grade_snapshot text, notes text, created_at timestamptz, updated_at timestamptz,
  child_first_name text, child_last_name text, child_preferred_name text
)
language plpgsql stable security definer set search_path = ''
```

Rules:

- Authorization is re-derived at call time: the input ids are first filtered to those for which
  `private.can_read_session(id)` is true. A session that lost authority between the parent request
  and this one contributes no rows, and the client treats that family as incomplete (section 5.4).
- Keyset `(session_id asc, id asc)`, limited to `p_page_size`. `id` is the deterministic attendee
  id, so ordering is total and stable.
- The three `child_*` columns are the **history reference projection**: joined from `children` by
  the definer, authorized by "attendee of a readable session", and limited to display identity.
  Nothing else from `children` crosses this boundary.
- More than 200 ids or a page size outside 1..200 → `22023`.

### 4.4 Indexes and removals

- Add `idx_sessions_owner_programme_updated on public.sessions (user_id, programme_id, updated_at, id)`
  for the owner arm.
- Add `idx_session_attendees_session_id_id on public.session_attendees (session_id, id)` for the
  attendee keyset unless the harness plan measurement shows the existing `(session_id)` index is
  sufficient at the dense fixtures; the plan records the measured choice.
- The delivery arm starts from `idx_child_ea_assignments_child`/`(user_id)` through
  `idx_session_attendees_child` and joins sessions by primary key; the harness measures whether a
  covering `(child_id, session_id)` index is needed.
- Drop `public.get_delivery_history_session_page(uuid, integer, date, timestamptz, uuid)` and
  `idx_sessions_owner_programme_history_cursor`.
- `revoke execute ... from public, anon; grant execute ... to authenticated` on both new functions
  and on `private.touch_session_family()` where applicable (trigger functions need no grant, but the
  migration states it explicitly).

### 4.5 Migration discipline

Canonical file under `supabase/migrations/`, additive and idempotent (`create or replace`,
`create index if not exists`, `drop function if exists`). Applied through the isolated staging
helper (PR #56) after the disposable-PostgreSQL harness passes; never through ad-hoc SQL.

## 5. Client traversal: `src/services/sessionHistoryPull.js`

### 5.1 State

One `sync_state` row per Programme, scope `session_history_pull:<programmeId>`:

- `last_pulled_at`: stamped only after a run reaches exhaustion with every page persisted;
- `cursor` (JSON): `{ "updatedAt": "<raw server string>", "id": "<uuid>", "windowStart": "YYYY-MM-DD",
  "complete": true|false, "runStartedAt": "<iso>" }`.

`updatedAt` is stored and replayed as the exact string returned by PostgREST. It is never parsed
into a JavaScript `Date` for cursor purposes.

### 5.2 A run

1. Preconditions: authenticated user id; active Programme id; active academic year row present in
   SQLite (`getActiveAcademicYear`). If any is missing the run reports `dependency` and does not
   stamp.
2. Window start = active academic year `starts_on`. If the stored cursor's `windowStart` differs
   (new academic year), the cursor resets to the epoch and `complete` is false.
3. Overlap: if `complete` is true, rewind the cursor by two minutes (`updatedAt - 2 min`, computed
   on the string's UTC instant and re-serialized with microsecond precision preserved, or by asking
   the server for `updated_at > p_after_updated_at - interval '2 minutes'` inside the RPC; the plan
   picks the string-safe option and records it). Idempotent upserts make the duplicates harmless.
4. Loop until a parent page is shorter than the page size or the run budget is spent:
   a. parent page (`p_page_size = 200`);
   b. for that page's session ids, attendee pages to exhaustion, ≤200 ids per call;
   c. build families; mark a family incomplete when its parent returned but the attendee RPC
      returned no rows for it (authority race) — see 5.4;
   d. persist the page atomically (section 6) and advance the cursor **in the same SQLite
      transaction** to the last fully persisted family.
5. On exhaustion: set `complete = true`, stamp `last_pulled_at`.

### 5.3 Deadlines and budget

- Per request: 15 seconds. `AbortController` signal passed through the supabase-js builder
  (`abortSignal`), plus a `Promise.race` timeout as the backstop. A deadline classifies as
  `transport` through `classifyPullFailureKind` and ends the run without a stamp.
- Per run: 60 seconds wall clock (the brief's "history within a minute"). When exceeded, the run
  stops after the current page transaction; the cursor already points at the next unread family, so
  the next trigger resumes rather than restarts.
- All requests go through `enqueueSupabaseRequest` so the roster pull and history pull never race
  the request queue.

### 5.4 Incomplete family handling

A family is complete when its parent row and every attendee row the server returned for it are in
hand. Two failure shapes:

- Attendee request failed or timed out → the whole parent page is abandoned (nothing persisted,
  cursor unchanged); the run ends `transport`.
- Attendee RPC succeeded but returned nothing for one or more parents → those families are dropped
  from the page; the persisted prefix ends just before the first dropped family and the cursor stops
  there. Next run, the parent RPC either returns the family again (race resolved) or omits it
  (authority genuinely gone), and the cursor advances past it either way.

### 5.5 Scheduling

- After the roster and reference pulls on mount (dependency: academic year and most attendee
  children are then local, so reference rows are the exception, not the rule).
- On foreground/reconnect when `session_history_pull:<programmeId>.last_pulled_at` is older than
  `DOMAIN_PULL_STALENESS_MS` (15 minutes), ordered after the domain pull.
- Pull-to-refresh on History.
- Single-flight per user and Programme. A killed app mid-run leaves a consistent SQLite (per-page
  transactions) and resumes from the cursor.

## 6. Local persistence

### 6.1 Schema

Additive SQLite migration: `children.history_reference integer not null default 0`. Added to
`CHILD_COLUMNS` so every full-row save writes `0` explicitly, which is how a reference row upgrades
in place when a roster pull later returns the real child.

### 6.2 `sessionsRepository.saveHistoryPage(families, { cursor, scope })`

One transaction per parent page, in this order:

1. For each family, `serverPullWouldClobberPendingLocal(txn, 'sessions', parent)`: a local
   `pending`/`failed` session wins and the family is skipped without touching its attendees.
   `synced`/`terminal` rows are replaced.
2. Upsert the parent with `sync_status = 'synced'`, `server_updated_at = updated_at`, `activities`
   as JSON, raw `created_at`/`updated_at` strings. No outbox row (`shouldEnqueueOutbox` is false for
   `synced`).
3. For each attendee `child_id` absent from `children`, insert a history reference child:
   `id, first_name, last_name, preferred_name, history_reference = 1, sync_status = 'synced'`, no
   outbox. Present children are left untouched by this path.
4. Upsert attendees with the same pending-local-wins guard per row; `synced`/`terminal` replaced.
   Absence never deletes: an attendee present locally but not returned is left as is.
5. `syncStateRepository.setPullState(scope, { cursor })` in the same transaction; `lastPulledAt`
   only when the caller says the run is complete.

### 6.3 Reads

- `getSessions`, `getSessionCountsSince`, `countSessionsOnDate` are unchanged in shape; hydrated
  rows are ordinary `synced` rows.
- Every roster, class, and assessment-scope read excludes `history_reference = 1`. The plan audits
  each `children` reader (`getMyChildren`, `getChildrenInClass`, grouping pickers, assessment
  eligibility) and adds the predicate where the join path does not already exclude such rows.
- Local ordering by `created_at` text is approximately chronological across server-format and
  device-format strings; the cursor never derives from SQLite, so this affects display order only.

### 6.4 Reader intent audit (plan task)

`SessionHistoryScreen` lists sessions the EA recorded in the last 30 days. `SessionCountRankingScreen`
reads all Programme sessions. `HomeScreen` and `sessionsTodayGoal` count the EA's own day. With
capturer-agnostic families now local, each reader is confirmed as "own-recorded" or
"delivery-scope" on purpose and documented; no silent semantic change ships.

## 7. UX

- **History screen**: renders SQLite immediately. During a run, a thin inline line: "Downloading
  history from Head Office…". After an incomplete run: "History not fully downloaded yet"; pull-to-
  refresh retries. Nothing blocks capture.
- **Sync Status**: a History row driven by the `session_history_pull:<programmeId>` state through
  `syncStatusPresenter`: "Up to date" (stamped, complete), "Downloading" (run in flight),
  "Incomplete since <time>" (no stamp or `complete = false`). The existing upload voice ("All saved
  and synced") is unchanged and is never used to imply history completeness.

## 8. Verification

| Tier | What is proved |
|---|---|
| Unit (fake client) | Page sequencing; raw cursor strings round-trip byte-identical; deadline → `transport`, no stamp; attendee shortfall drops the family and stops the cursor before it; run budget stops after a page; window reset on new academic year |
| Real SQLite | Atomic page (throw mid-page persists nothing, cursor unchanged); foreign keys on; reference child inserted then upgraded in place by a full-row save; pending-local-wins for parent and attendee; no absence delete; resume after simulated kill; reference rows excluded from roster and class reads |
| Disposable PostgreSQL harness | Six-actor matrix for both RPCs (owner, current/former delivery, class-only, group-only, unrelated); attendee trigger bumps parent `updated_at`; family re-surfaces after a late attendee insert; keyset exactness across equal `updated_at`; per-arm plans read the new index; dense-owner, dense-delivery, and deep-page fixtures at 100k+ sessions with inner-plan and root-buffer measurement; old function and index absent |
| Hosted gate | Migration applied through the isolated helper; six-actor matrix; authenticated HTTP walk of a namespaced fixture with more than 1,000 attendees across pages; anonymous denied; zero residue |
| Device | New phone sees own history within a minute on iPhone and a low-end Android; two-device convergence including a backdated session; force-stop and offline mid-download leave no half-state |

Existing safety rails remain in force: no history absence reconcile, `PULL_SCOPE_COMPLETENESS_LIMIT`
is irrelevant to RPC pages (each is ≤200), and the roster reconcile breaker is untouched.

## 9. Documents that ship with the code

`rls-sync-contract-map.md` (operation table, `sessions`/`session_attendees` rows, pull persistence
section, disposable and hosted verifier sections), `field-app-capability-ledger.md` (CAP-004,
CAP-007), `ROADMAP.md` section 1 checkboxes, `build-log.md` registers, and the `sqlite-staging-sql`
skill if the apply runbook changes. `CONTEXT.md` and ADR-0006 land with this spec.

## 10. Out of scope

Assessment and item history (CAP-005); session edit UI and attendee removal on edit; delta pulls for
any other table; newest-first ordering during first hydration; activating `sessions.group_id`/
`state`; a remote kill switch or fleet jitter (CAP-007 follow-ups).

## 11. Open items for the implementation plan

- Choose the overlap mechanism (client-side string-safe rewind vs server-side interval) and record it.
- Measure and record the attendee-keyset and delivery-arm index decisions.
- Decide where the run is orchestrated (extension of `OfflineContext`'s domain-pull trigger vs a
  small `SessionHistoryContext`) so screens can re-read SQLite when a page lands.

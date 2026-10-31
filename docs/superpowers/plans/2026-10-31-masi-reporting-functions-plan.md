# Masi reporting functions (Plan A of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a least-privilege reporting role and nine versioned, read-only reporting functions to
`masi-app-sqlite`, proven on a disposable PostgreSQL 17 harness. The Masi website's Django backend
reads Masi App data through these functions only.

**Architecture:**
- One new migration creates `masi_reporting_reader` (LOGIN, no password, no table privileges) and
  nine `STABLE SECURITY DEFINER` SQL functions with `BEGIN ATOMIC` bodies.
- Each function returns one `jsonb` document whose shape is pinned below (the A→B contract).
- A new harness replays every migration onto a disposable database, seeds a fixture covering the
  spec's edge cases, and asserts exact outputs, caps and privileges.

**Tech Stack:** PostgreSQL 17 SQL/plpgsql, Supabase migrations, Node `node:assert` harness
(`scripts/*-postgres-harness.cjs` pattern), Jest for `createTesters.js`.

**Spec:** `/Users/jimmckeown/Development/masi-app-dashboard-web/docs/superpowers/specs/2026-10-30-masi-app-dashboard-design.md`
(rev 3: sections 4.1, 4.2, 5, 6, 7, 11, 13). Plans B (Django) and C (website) consume this plan's
contract.

## Global Constraints

- Migration file: `supabase/migrations/20261031120000_masi_reporting_v1.sql`. It is unapplied, so
  tasks append to it. Once applied to hosted it is never edited; a change becomes `_v2`.
- Every function:
  - `LANGUAGE sql` with a `BEGIN ATOMIC … END` body (never plpgsql, never `$$` string bodies),
    `STABLE`, `SECURITY DEFINER`, `SET search_path = ''`, every name schema-qualified. It
    references no user-defined function (built-ins only). Verified 2026-10-31 on local PG17: a
    `BEGIN ATOMIC` body records user-function references in `pg_depend` and records none for
    built-ins. A `STABLE` definer calling a volatile writer DOES write, which is why the audit
    exists.
  - `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated, service_role;`
    `GRANT EXECUTE … TO masi_reporting_reader;`
  - returns `jsonb` with top-level keys `function_version` (the function name) and
    `generated_at` (`now()`), plus the keys listed in its contract.
- SAST day for a timestamp is `(ts AT TIME ZONE 'Africa/Johannesburg')::date`. `session_date` and
  `assessment_date` are already dates.
- Refusals are documents, not exceptions. Pure SQL cannot `RAISE`, so:
  - a bad argument (null array, `p_from > p_to`, span over the limit) returns `{function_version,
    generated_at, error: "invalid_argument", argument: "<p_name>"}`;
  - a cap breach returns `{function_version, generated_at, error: "too_much_data", row_count:
    <n>}` and no rows. Count first with the same predicate, then branch with `CASE`.

  Nothing truncates silently, except the "latest N of total" detail lists, which return both
  `total` and `rows`.
- **Eligible result** = an `assessments` row with `stopped_reason IS NULL OR stopped_reason NOT
  LIKE 'skipped\_%'`.
- Role: `CREATE ROLE masi_reporting_reader LOGIN NOINHERIT;` (guarded by `IF NOT EXISTS`, no
  password), `ALTER ROLE masi_reporting_reader SET default_transaction_read_only = on;`,
  `ALTER ROLE masi_reporting_reader SET statement_timeout = '15s';`,
  `GRANT USAGE ON SCHEMA public TO masi_reporting_reader;`.
- Copy rules (CONTEXT.md): "EA", "Programme", "assessment" (never "run").
- Node 20 for jest and harnesses:
  `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:/opt/homebrew/opt/postgresql@17/bin:$PATH`.
- Harness target: `MASI_REPORTING_ADMIN_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres`,
  `MASI_REPORTING_DATABASE_NAME=masi_history_rls_reporting_<suffix>`,
  `MASI_REPORTING_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE`.
  - The name **must** start with `masi_history_rls_`. The reused `assertDisposableAdminTarget`
    hard-codes that prefix, and it is not changed.
  - The harness passes its own env values into that helper's `{adminDatabaseUrl, databaseName,
    confirmation}` arguments.
  - Reuse `assertDisposableAdminTarget`, `buildDatabaseUrl`, `runPsql` and `bootstrapSql` from
    `scripts/history-authorization-postgres-harness.cjs`.
  - Replay migrations the way `scripts/support-incident-postgres-harness.cjs` does, since it
    already handles the storage migration.
  - Every psql session the harness opens runs with `PGTZ=UTC`, so a timezone bug cannot hide
    behind a SAST session default.
- **Retained database handoff (consumed by Plan B Task 7 and the local E2E pass):**
  - With `MASI_REPORTING_KEEP=1`, a fully passing harness run skips its final `DROP DATABASE` and
    prints `RETAINED <database name>` as its last line.
  - On any failure it drops the database even when KEEP is set.
  - Default behaviour is unchanged: always drop.
  - The retained name is the given `MASI_REPORTING_DATABASE_NAME`; the convention is
    `masi_history_rls_reporting_keep`.
  - Manual teardown:
    `psql postgresql://postgres@127.0.0.1:55432/postgres -c 'DROP DATABASE masi_history_rls_reporting_keep WITH (FORCE)'`.

## Contract (A→B): function outputs

All ids are uuid strings, timestamps are ISO-8601 with offset, dates are `YYYY-MM-DD`, and
`?` means the value may be null. Arrays are ordered as stated.

```
masi_reporting_accounts_v1() -> {
  function_version, generated_at,
  academic_year: {id, label, starts_on, ends_on}?,            -- the is_active row
  programmes: [{id, code, name, daily_session_target?}]        -- by sort_order, code
  schools:    [{id, name, school_uid?}]                        -- by name
  accounts: [{                                                 -- every public.users row, by last_name, first_name, user_id
    user_id, first_name, last_name, email?, organization_slug, job_title_code?, is_active,
    user_school_id?,
    auth: {created_at, last_sign_in_at?, email_confirmed_at?, banned_until?, is_test_flag},
    assignment: {programme_id, programme_code, school_id?, assigned_at}?,   -- ended_at IS NULL row
    counts: {delivery_children, class_children, active_classes, active_groups},
    activity: {ever_session, ever_clock, ever_assessment,
               last_session_date?, last_clock_date?, last_assessment_date?, last_data_received_at?},
    last_receipt: {received_at, kind, app_version?, app_build?, update_id?, platform?, os_version?}?
  }]
}                                                              -- cap: 5,000 accounts

masi_reporting_roster_v1(p_user_ids uuid[]) -> {
  function_version, generated_at,
  rows: [{user_id, child_id, programme_code, school_id?, class_id, grade?}]   -- by user_id, child_id
}                                                              -- cap: 100,000 rows

masi_reporting_assessed_children_v1(p_author_ids uuid[], p_from date, p_to date) -> {   -- span <= 366
  function_version, generated_at, from, to,
  rows: [{child_id, last_assessment_date}]     -- children with >=1 ELIGIBLE result by these authors in range; by child_id
}                                                              -- cap: 100,000 rows

masi_reporting_daily_v1(p_user_ids uuid[], p_from date, p_to date) -> {   -- span <= 120 days
  function_version, generated_at, from, to,
  sessions:    [{user_id, day, programme_code, sessions, present_attendances, ungrouped_sessions}],   -- ungrouped = group_id IS NULL
  clock:       [{user_id, day, entries, completed_minutes, auto_clock_outs}],
  assessments: [{user_id, day, programme_code?, question_results, skipped_results, battery_runs_completed, children_assessed}]
               -- question_results and children_assessed count ELIGIBLE rows only; skipped_results counts skipped_* rows
}   -- non-zero rows only, each ordered by user_id, day, programme_code; cap 200,000 rows in total

masi_reporting_ea_detail_v1(p_user_id uuid, p_from date, p_to date) -> {   -- span <= 120 days
  function_version, generated_at, from, to,
  sessions:     {total, rows: [{id, session_date, updated_at, programme_code, group_name?, class_name?,
                 grade?, present_count, letters_focused: text[]?, session_reading_level?, notes?}]},   -- latest 300
  time_entries: {total, rows: [{id, local_date, sign_in_time, sign_out_time?, duration_minutes?,
                 auto_clocked_out, sign_in_location_status?, sign_out_location_status?}]},              -- latest 200
  assessments:  {total, rows: [{id, assessment_date, updated_at, battery_code?, battery_version?, battery_status?,
                 question_code?, language?, raw_score?, item_count?, score_max?, stopped_reason?,
                 child_id, child_name}]},                                                                -- latest 200
  groups: [{group_id, name, programme_code, class_name?, grade?, members, last_session_date?}],         -- <= 100, by name
  weekly: [{week_start, sessions, clock_days, completed_hours, question_results}]                       -- exactly 12, oldest first
}

masi_reporting_sessions_v1(p_user_ids uuid[], p_from date, p_to date) -> {   -- span <= 92
  function_version, generated_at, from, to,
  rows: [{id, session_date, updated_at, user_id, programme_code, school_id?, class_name?, grade?,
          group_name?, present_count, letters_focused: text[]?, session_reading_level?, notes?}]
}   -- by session_date, user_id, id; cap 20,000

masi_reporting_assessments_v1(p_user_ids uuid[], p_from date, p_to date) -> {   -- span <= 366
  function_version, generated_at, from, to,
  rows: [{id, assessment_date, updated_at, user_id, child_id, child_first_name, child_last_name, battery_run_id?,
          class_name?, grade?, school_id?, programme_code, battery_code?, battery_version?, battery_status?,
          question_code?, language?, raw_score?, item_count?, score_max?, stopped_reason?,
          assessment_purpose?, window_label?}],
  completed_battery_runs: [{id, user_id, child_id, programme_code, battery_code, battery_version, completed_day}]
     -- battery_runs with status = 'completed', user_id = ANY(p_user_ids), SAST date of completed_at in [p_from, p_to];
     -- by completed_day, id. This is the ONLY source for the "assessments" (completed batteries) count.
}   -- cap 50,000 on rows + completed_battery_runs combined

masi_reporting_time_entries_v1(p_user_ids uuid[], p_from date, p_to date) -> {   -- span <= 92
  function_version, generated_at, from, to,
  rows: [{id, user_id, local_date, sign_in_time, sign_out_time?, duration_minutes?, auto_clocked_out,
          sign_in_location_status?, sign_out_location_status?}]
}   -- by sign_in_time, id; cap 20,000

masi_reporting_incidents_v1(p_user_ids uuid[], p_from timestamptz, p_to timestamptz, p_kinds text[]) -> {   -- span <= 90 days; p_kinds NULL = all
  function_version, generated_at, from, to,
  rows: [{id, reporter_id, kind, repeat_key, report_id?, occurrence_count, first_seen_at?, last_seen_at?,
          received_at, report_generation?, has_bundle, has_screenshot, app_version?, app_build?,
          update_id?, platform?, os_version?, summary?}]
}   -- received_at in [p_from, p_to), by received_at desc, id; cap 5,000
```

**Nullability:** `?` fields may be null, and consumers must accept null. `first_seen_at` and
`last_seen_at` are null on receipts from the retained v1 RPC. `question_code` is null on legacy
assessment rows. Never invent values for them.

**Field derivations the implementer cannot infer:**

- `is_test_flag` = `coalesce((auth.users.raw_app_meta_data->>'is_test_account')::boolean, false)`.
- **Delivery roster** (used by `counts.delivery_children` and `roster_v1`): `child_ea_assignments`
  (`user_id = u`, `unassigned_at IS NULL`) joined to:
  - the user's `staff_programme_assignments` with `ended_at IS NULL`;
  - `child_programme_enrollments` for that `programme_id` with `ended_at IS NULL`;
  - `child_class_memberships` with `exited_at IS NULL`;
  - `classes` with `archived_at IS NULL`;
  - `children` with `archived_at IS NULL`.

  `class_id`, `school_id` and `grade` come from that membership's class. If a child has two open
  memberships, take the one with the latest `enrolled_at`, then the smallest `class_id`.
- `class_children` = distinct children with an open membership in a non-archived class that has
  an active `class_ea_assignments` row for the user. `active_classes` counts those classes.
  `active_groups` = `group_ea_assignments` with `unassigned_at IS NULL` on non-archived groups.
- `assessed_children_v1` filters `assessments.user_id = ANY(p_author_ids)`, eligible results only,
  and `assessment_date BETWEEN p_from AND p_to`. `last_assessment_date` is the max date within
  that range.
- `ever_*` and `last_*_date` cover all time. `last_clock_date` = SAST date of the max
  `sign_in_time`.
- `last_data_received_at` = greatest of:
  - max `sessions.updated_at` where `user_id = u`;
  - max `assessments.updated_at` where `user_id = u`;
  - max `battery_runs.updated_at` where `user_id = u`;
  - max `letter_mastery_corrections.received_at` where `changed_by = u` (the immutable receipt
    ledger; never `letter_mastery.updated_at`);
  - max `mobile_support_incidents.received_at` where `reporter_id = u`.

  `time_entries` is deliberately excluded (spec section 6).
- `last_receipt` = the latest `mobile_support_incidents` row by `received_at` for the reporter.
  Release fields come from `observed`:
  - `app_version`: `observed->'application'->>'version'`;
  - `app_build`: `observed->'application'->>'build'`;
  - `update_id`: `observed->'update'->>'id'`;
  - `platform`: `observed->'device'->>'platform'`;
  - `os_version`: `observed->'device'->>'osVersion'`.

  `incidents_v1` uses the same paths.
- `summary` (incidents) = `left(coalesce(payload->>'message', payload->>'errorCode',
  payload->>'error_code', payload->>'reason'), 2048)`. EA reports store `{message,
  screenshotAttached, screen}`. `has_bundle` = `bundle_path IS NOT NULL`; `has_screenshot` =
  `screenshot_path IS NOT NULL`.
- Sessions count only `state = 'completed'`. `present_attendances` and `present_count` count
  `session_attendees` with `attendance_status IN ('present','late')`. `letters_focused` comes from
  `activities->'letters_focused'` when it is a JSON array of strings, else null.
  `session_reading_level` comes from `activities->>'session_reading_level'`. For
  `school_id`/`class_name`/`grade`, use the session's `class_id`, else the group's `class_id`.
- Clock: the day is the SAST date of `sign_in_time`. `completed_minutes` = floor of
  `(sign_out_time - sign_in_time)` in minutes, for rows with `sign_out_time`.
  `duration_minutes` is the same, per row, else null.
- `question_results` = eligible `assessments` rows (any `battery_run_id`). `battery_runs_completed` counts
  `battery_runs` with `status = 'completed'` on the SAST date of `completed_at`, attributed to
  `battery_runs.user_id` and `programme_id`. `children_assessed` = distinct `child_id` among that
  user-day's assessments. The assessment day is `assessment_date`; its `programme_code` comes from
  `assessments.programme_id`.
- Score fields: `raw_score` = `score`; `item_count` = `total_items`; `score_max` =
  `(derived->>'max')::numeric` only when `jsonb_typeof(derived->'max') = 'number'`.
  `battery_code`/`battery_version`/`battery_status` come from the joined `battery_runs` row (null
  for quick tests).
  `child_name` = `coalesce(nullif(preferred_name,''), first_name) || ' ' || last_name`.
- `assessments_v1` class: `battery_runs.class_id` when present, else the child's open
  membership's class.
- `window_label` = `assessment_windows.label` via `assessment_window_id`.
- `weekly`: weeks start Monday. The 12 weeks end with the week containing `p_to`, and each counts
  all of that week's activity regardless of `p_from`. `clock_days` = distinct SAST sign-in dates.
  `completed_hours` = `round(sum(completed_minutes)/60.0, 1)`.

## Review Focus

1. **A session uploaded a week late.** Its client `created_at` is old and its server `updated_at`
   is today, so `last_data_received_at` must show today. Pinned in Task 1.
2. **An EA moved to a new programme with a surviving direct child assignment.** That child leaves
   the delivery roster when the enrolment for the new programme is missing. Pinned in Task 2.
3. **A clock-in at 00:30 SAST on 2026-10-20** (2026-10-19 22:30 UTC) belongs to 2026-10-20 and is
   included in an October-20-only range, under a UTC session time zone. Pinned in Task 2.
4. **A Story Writing result with derived.max = 16 and total_items = 4** returns `score_max` 16
   and `item_count` 4. Pinned in Task 3.
5. **The reader calling a write RPC** such as `submit_assessment` is refused. Pinned in Task 1.

---

### Task 1: Role, `accounts_v1`, harness skeleton and privilege proof

**Files:**
- Create: `supabase/migrations/20261031120000_masi_reporting_v1.sql`
- Create: `scripts/reporting-postgres-harness.cjs`
- Modify: `package.json` (add `"verify:reporting:postgres": "node scripts/reporting-postgres-harness.cjs"`)

**Interfaces:**
- Produces: `masi_reporting_reader` role; `public.masi_reporting_accounts_v1()` (contract above);
  harness helpers inside the script: `seedFixture(databaseUrl)`, and
  `asReader(databaseUrl, sql)`, which runs SQL as `SET ROLE masi_reporting_reader` inside a
  read-only transaction.

- [ ] **Step 1: Write the harness with failing cases.** The harness:
  - creates the disposable database;
  - applies `bootstrapSql`;
  - adds to `auth.users`: `raw_app_meta_data jsonb not null default '{}'`, `last_sign_in_at
    timestamptz`, `email_confirmed_at timestamptz`;
  - replays every migration in filename order (as the support-incident harness does);
  - runs `seedFixture`.

  The fixture covers (ids are fixed literals, `UUID_*` constants):
  - organisation `masinyusane`; programmes literacy (target 3), numeracy (5), yeboneer (1);
    2 schools, one with `school_uid`;
  - academic year 2026 active;
  - EA_A: literacy at school 1, assigned 2026-09-01. A session on 2026-10-20 with client
    `created_at` 2026-10-20T08:00Z, inserted at harness time, so `updated_at` = now();
  - EA_LATE, whose **only** record is one session with `session_date` 2026-10-13 and client
    `created_at` 2026-10-13T08:00Z, inserted at harness time. It has no receipts, assessments,
    runs or corrections. Capture `now()` as `T_LATE` immediately after the insert;
  - EA_LEDGER, whose **only** record is one `letter_mastery_corrections` row (`changed_by =
    EA_LEDGER`, `received_at` = `T_LEDGER` fixed at `2026-10-29T09:00:00Z`) for child C1/letter
    `s`, while the current `letter_mastery` row for C1/`s` has `changed_by = EA_B`;
  - EA_SUSP: banned until 2099;
  - EA_TEST: `raw_app_meta_data` `{"is_test_account": true}`;
  - EA_NOPROG: no assignment;
  - one receipt for EA_A with `observed.application.version` `1.5.0`, build `55`, platform
    `android`.

  Cases (each `c.value(name, sql, expected)`, as in existing harnesses):
  - `accounts-shape`: the exact top-level keys;
  - `accounts-ea-a`: EA_A's `assignment.programme_code = 'literacy'`;
  - `accounts-received-uses-server-time`: EA_LATE's `activity.last_data_received_at` equals
    `T_LATE` exactly (fails if `created_at` is used: it would be 2026-10-13T08:00Z);
  - `accounts-received-ledger`: EA_LEDGER's `last_data_received_at` equals `2026-10-29T09:00:00Z`
    exactly (fails if the ledger is omitted, giving null, or if current `letter_mastery`
    ownership is used, giving EA_B);
  - `accounts-received-never`: EA_NOPROG (no records) has `last_data_received_at` null;
  - `accounts-test-flag`: EA_TEST `auth.is_test_flag = true`;
  - `accounts-release`: EA_A `last_receipt.app_version = '1.5.0'`;
  - `accounts-noprog`: EA_NOPROG `assignment` is null;
  - `reader-exec`: `asReader` can execute `accounts_v1`;
  - `anon-denied`, `authenticated-denied`, `service-role-denied`: `has_function_privilege(...,
    'EXECUTE')` is false;
  - `reader-no-table-select`: for every table in `public`, `private`, `auth`, `storage`,
    `has_table_privilege('masi_reporting_reader', t, 'SELECT,INSERT,UPDATE,DELETE')` is false;
  - `reader-executable-functions`: the set of `pg_proc` functions in `public`/`private` where
    `has_function_privilege('masi_reporting_reader', oid, 'EXECUTE')` equals
    `REPORTING_FUNCTIONS ∪ AUTH_GUARDED_ALLOWLIST`. The allowlist is computed once by the
    implementer from the replayed schema, written as a literal array, and each entry gets its
    own refusal case, e.g. `reader-submit-assessment-refused` (expect an error SQLSTATE, not
    success);
  - `audit-atomic-bodies`: every `public.masi_reporting_%_v1` has `prosqlbody IS NOT NULL`;
  - `audit-no-user-function-deps`: `SELECT count(*) FROM pg_depend d JOIN pg_proc f ON f.oid =
    d.objid WHERE f.proname LIKE 'masi\_reporting\_%' AND d.refclassid =
    'pg_proc'::regclass` = 0;
  - `audit-denylist`: `pg_get_functiondef(oid)` contains none of `nextval`, `setval`,
    `set_config`, `pg_advisory`, `lo_`, `pg_notify`, `dblink`, `pg_terminate_backend`,
    `pg_cancel_backend`, `pg_reload_conf`, `pg_read_file`, `pg_ls_dir`, `pg_stat_reset`;
  - `audit-negative-control`: a scratch `public.masi_reporting_probe_v0()` definer with a `BEGIN
    ATOMIC` body selecting `private.close_overdue_time_entries()` makes the dependency query
    return 1; drop it afterwards;
  - `reader-login-no-password`: `pg_authid.rolpassword IS NULL` and `rolcanlogin` is true;
  - `reader-role-settings`: `pg_db_role_setting` contains `default_transaction_read_only=on` and
    `statement_timeout=15s`;
  - (no "STABLE blocks writes" case: STABLE is not a boundary; the audit cases above are.)

- [ ] **Step 2: Run the harness and verify it fails**

Run: `MASI_REPORTING_ADMIN_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres MASI_REPORTING_DATABASE_NAME=masi_history_rls_reporting_t1 MASI_REPORTING_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE npm run verify:reporting:postgres`
Expected: FAIL at `accounts-shape` (function does not exist).

- [ ] **Step 3: Implement the role and `masi_reporting_accounts_v1()`** in the migration, per the
  contract and derivations above. Wrap role creation in a `DO` block guarded by `pg_roles`.

- [ ] **Step 4: Run the harness and verify it passes.** Same command. Expected: every case
  `passed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261031120000_masi_reporting_v1.sql scripts/reporting-postgres-harness.cjs package.json
git commit -m "feat(reporting): reader role and accounts_v1 with PG17 harness"
```

### Task 2: `roster_v1`, `assessed_children_v1` and `daily_v1`

**Files:**
- Modify: `supabase/migrations/20261031120000_masi_reporting_v1.sql`
- Modify: `scripts/reporting-postgres-harness.cjs`

**Interfaces:**
- Consumes: Task 1 fixture and helpers.
- Produces: `public.masi_reporting_roster_v1(uuid[])`,
  `public.masi_reporting_assessed_children_v1(uuid[], date, date)`,
  `public.masi_reporting_daily_v1(uuid[], date, date)`.

- [ ] **Step 1: Extend the fixture and add failing cases.** Fixture additions:
  - EA_A's delivery roster: children C1 and C2 (enrolled in literacy, open membership in class K1
    grade `R`);
  - C3: assigned but enrolment ended;
  - C4: membership exited;
  - C5: class archived;
  - C6: child archived;
  - EA_B: shares C1;
  - EA_MOVE: numeracy assigned 2026-10-28 after a literacy assignment ended 2026-10-27, still
    directly assigned C7, which is enrolled only in literacy. EA_MOVE has literacy sessions on
    2026-10-20 and 2026-10-21;
  - EA_A clock entries:
    - 2026-10-20 07:00–15:30 SAST;
    - one auto-closed (`auto_clocked_out=true`);
    - one signed in 2026-10-20 00:30 SAST (2026-10-19T22:30Z);
  - a battery run for C2 by EA_A completed at 2026-10-20 00:30 SAST (2026-10-19T22:30Z);
  - assessments: C1 by EA_A on 2026-10-20 (two question rows in one completed battery run), and
    C2 by EA_B on 2026-02-01.

  Cases:
  - `roster-ea-a`: rows for EA_A are exactly C1 and C2 (C3–C6 excluded);
  - `roster-move`: EA_MOVE has no C7 row;
  - `roster-shared`: C1 appears for EA_A and EA_B;
  - `assessed-eligible`: `assessed_children_v1({EA_A,EA_B}, 2026-01-15, 2026-12-15)` returns C1
    and C2;
  - `assessed-skipped-only`: child C8, whose only result is `skipped_child_refused`, is absent;
    a genuine zero score (C9, `score` 0, `stopped_reason` `completed`) is present;
  - `assessed-author-filter`: a result for C10 by EA_TEST is absent when EA_TEST is not in
    `p_author_ids`, present when it is;
  - `assessed-range`: C11 assessed 2026-01-20 and 2026-10-20 appears for range Jan 1–31 (last
    date 01-20) and Oct 1–31 (last date 10-20), and not for range Mar 1–31;
  - `received-mastery-ledger`: EA_A's superseded `letter_mastery_corrections` row received now
    sets `last_data_received_at` even though `letter_mastery.changed_by` is EA_B;
  - `accounts-delivery-count`: EA_A `counts.delivery_children = 2`;
  - `daily-sessions`: EA_MOVE literacy sessions appear under `programme_code` `literacy` on their
    dates;
  - `daily-clock-sast`: with `PGTZ=UTC`, `daily_v1({EA_A}, 2026-10-20, 2026-10-20)` contains the
    00:30 SAST entry on day 2026-10-20, and `daily_v1({EA_A}, 2026-10-19, 2026-10-19)` does not
    contain it;
  - `daily-battery-sast`: the 00:30 SAST completion counts in `battery_runs_completed` on
    2026-10-20, not 2026-10-19;
  - `daily-clock-minutes`: 07:00–15:30 gives `completed_minutes` 510;
  - `daily-assessments`: EA_A 2026-10-20 has `question_results` 2, `battery_runs_completed` 1,
    `children_assessed` 1;
  - `daily-skipped-separate`: a skipped row counts in `skipped_results`, not `question_results`;
  - `daily-range-invalid`: `p_from > p_to` returns `error = invalid_argument`, argument `p_from`;
  - `daily-span-cap`: 121 days returns `invalid_argument`;
  - `daily-null-ids`: `p_user_ids` NULL returns `invalid_argument`.

- [ ] **Step 2: Run and verify the new cases fail** (same command, database `masi_history_rls_reporting_t2`).
  Expected: FAIL at `roster-ea-a`.
- [ ] **Step 3: Implement `roster_v1`, `assessed_children_v1` and `daily_v1`** per the contract,
  with the cap as a counted `CASE` branch.
- [ ] **Step 4: Run and verify everything passes.**
- [ ] **Step 5: Commit** `feat(reporting): roster, assessed children and daily functions`.

### Task 3: `ea_detail_v1`

**Files:** Modify the migration and the harness.

**Interfaces:** Produces `public.masi_reporting_ea_detail_v1(uuid, date, date)`.

- [ ] **Step 1: Add fixture and failing cases.** Fixture additions:
  - EA_BULK with 504 `assessments` rows between 2026-10-14 and 2026-10-20;
  - a Story Writing row for C1: `question_code` `wela_plus_story_writing`, `score` 12,
    `total_items` 4, `derived` `{"max":16,"ea_rubric_total":12}`;
  - an EA_A session with `activities` `{"letters_focused":["s","a"],"session_reading_level":"cannot_blend"}`,
    group G1 in class K1;
  - EA_A in group G1 with members C1 and C2.

  Cases:
  - `detail-latest-n`: EA_BULK `assessments.total = 504` and `rows` length 200, newest first;
  - `detail-score-max`: the story row has `raw_score` 12, `item_count` 4, `score_max` 16;
  - `detail-score-max-null`: a letter_sounds row has `score_max` null;
  - `detail-letters`: `letters_focused` equals `["s","a"]`;
  - `detail-groups`: G1 has `members` 2 and `class_name` K1;
  - `detail-weekly`: exactly 12 weeks, the last `week_start` is the Monday of `p_to`'s week;
  - `detail-unknown-user`: an unknown uuid returns zero totals, not an error.
- [ ] **Step 2: Verify the failures.** Expected: FAIL at `detail-latest-n`.
- [ ] **Step 3: Implement** per the contract.
- [ ] **Step 4: Verify everything passes.**
- [ ] **Step 5: Commit** `feat(reporting): ea_detail_v1 with latest-N lists`.

### Task 4: `sessions_v1`, `assessments_v1`, `time_entries_v1`, `incidents_v1`

**Files:** Modify the migration and the harness.

**Interfaces:** Produces the four functions per the contract.

- [ ] **Step 1: Add failing cases:**
  - `sessions-rows`: EA_A's 2026-10-20 row has `class_name` K1 and `present_count` equal to the
    fixture's present plus late attendees;
  - `sessions-discarded-excluded`: a `state = 'discarded'` session is absent;
  - `assessments-rows`: the C1 story row has `battery_code` null when `battery_run_id` is null,
    and `window_label` null for a progress check;
  - `time-entries-rows`: the auto row has `auto_clocked_out` true and `duration_minutes` 600;
  - `incidents-summary`: an `ea_report` receipt with payload `{"message":"Save button hidden"}`
    has `summary` "Save button hidden", `has_screenshot` true when `screenshot_path` is set;
  - `incidents-kinds-filter`: `p_kinds` `{ea_report}` returns only that kind;
  - `incidents-user-filter`: a receipt from a user outside `p_user_ids` is absent;
  - `*-span-cap` for each function (93, 367, 93 and 91 days return `invalid_argument`);
  - **Row caps, exact limit and limit + 1, for every bounded output.** These run in a separate
    disposable database `masi_history_rls_reporting_cap`, seeded with `generate_series`. Each
    pair asserts:
    - at the limit: success, with exactly `limit` rows;
    - at limit + 1: `error = too_much_data`, exact `row_count`, and no result arrays at all.

    The caps are: `accounts_v1` 5,000 users; `roster_v1` 100,000; `assessed_children_v1`
    100,000; `daily_v1` 200,000 rows across its three arrays combined; `sessions_v1` 20,000;
    `assessments_v1` 50,000 rows + completed runs combined; `time_entries_v1` 20,000;
    `incidents_v1` 5,000; `ea_detail_v1` `groups` 100. The counting predicate must be the same
    user, date and kind predicate as the successful query, so the test seeds the overflow row
    inside the filter (and one decoy outside it that must not count);
  - `assessments-completed-runs`: for EA_A in range, `completed_battery_runs` contains the
    completed run and excludes an `abandoned` run and an `in_progress` run, both with saved
    question results. Those question rows still appear in `rows` with `battery_status`
    `abandoned`/`in_progress`;
  - `assessments-run-completed-out-of-range`: a run whose questions are dated 2026-10-20 but
    which completed 2026-10-21 SAST is absent for range Oct 20–20 and present for Oct 21–21;
  - `incidents-v1-receipt-nulls`: a receipt inserted the way the retained v1 RPC does (no
    `first_seen_at`/`last_seen_at`) is returned with both null;
  - `assessments-legacy-null-question`: a legacy row with `question_code` NULL is returned with
    `question_code` null;
  - `assessments-skipped-labelled`: skipped rows are present in `assessments_v1` with their
    `stopped_reason` (detail and CSV show them).
- [ ] **Step 2: Verify the failures.**
- [ ] **Step 3: Implement** the four functions.
- [ ] **Step 3b: Add the KEEP handoff** described in Global Constraints, with a case
  `keep-retains`. Run with KEEP=1 and assert that the retained database exists and that the nine
  functions are present (`SELECT count(*) FROM pg_proc WHERE proname LIKE 'masi\_reporting\_%\_v1'`
  = 9) from a fresh psql connection.
- [ ] **Step 4: Verify everything passes**, including all Task 1 privilege cases, which now
  enumerate nine functions.
- [ ] **Step 5: Commit** `feat(reporting): sessions, assessments, time entries and incidents functions`.

### Task 5: Stamp test accounts in `createTesters.js`

**Files:**
- Modify: `scripts/createTesters.js:187-191`
- Test: `__tests__/testerProvisioning.test.js`

- [ ] **Step 1: Write the failing test** `it('marks new tester accounts as test accounts')`:
  `createUser` was called with `expect.objectContaining({ app_metadata: { is_test_account: true } })`.
- [ ] **Step 2: Run it and verify it fails**
  - Run: `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH npx jest __tests__/testerProvisioning.test.js`
  - Expected: FAIL on the new test.
- [ ] **Step 3: Add `app_metadata: { is_test_account: true }`** to the `createUser` call.
- [ ] **Step 4: Run it and verify it passes.** Expected: all tests in the file pass.
- [ ] **Step 5: Commit** `feat(testers): stamp is_test_account on new tester accounts`.

### Task 6: Documentation

**Files:**
- Modify: `documentation/rls-sync-contract-map.md`. Add a "Website reporting functions
  (`masi_reporting_*_v1`)" section covering:
  - the role and its grants, and that the role has no password (set out of band);
  - the nine functions with one line each, and the body audit rule (`BEGIN ATOMIC`, no
    user-function dependencies);
  - the "never edit; add `_v2`" rule;
  - deploy order (functions → Django → website);
  - harness command and result.
- Modify: `documentation/build-log.md`. A dated entry with the verification command, the case
  count, "local PG17 only, not applied to hosted", and the rollout steps still owned by Jim.

- [ ] **Step 1: Write both doc changes.**
- [ ] **Step 2: Run the full harness plus `npx jest __tests__/testerProvisioning.test.js`, and
  record the counts in the build log.**
- [ ] **Step 3: Commit** `docs(reporting): contract map and build log for reporting functions`.

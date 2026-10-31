# Masi reporting functions (Plan A of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a least-privilege reporting role and eight versioned, read-only reporting functions to
`masi-app-sqlite`, proven on a disposable PostgreSQL 17 harness. The Masi website's Django backend
reads Masi App data through these functions only.

**Architecture:**
- One new migration creates `masi_reporting_reader` (LOGIN, no password, no table privileges) and
  eight `STABLE SECURITY DEFINER` functions.
- Each function returns one `jsonb` document whose shape is pinned below (the A→B contract).
- A new harness replays every migration onto a disposable database, seeds a fixture covering the
  spec's edge cases, and asserts exact outputs, caps and privileges.

**Tech Stack:** PostgreSQL 17 SQL/plpgsql, Supabase migrations, Node `node:assert` harness
(`scripts/*-postgres-harness.cjs` pattern), Jest for `createTesters.js`.

**Spec:** `/Users/jimmckeown/Development/masi-app-dashboard-web/docs/superpowers/specs/2026-10-30-masi-app-dashboard-design.md`
(sections 4.1, 4.2, 5, 6, 7, 11, 13). Plans B (Django) and C (website) consume this plan's
contract.

## Global Constraints

- Migration file: `supabase/migrations/20261031120000_masi_reporting_v1.sql`. It is unapplied, so
  tasks append to it. Once applied to hosted it is never edited; a change becomes `_v2`.
- Every function:
  - `LANGUAGE sql` (or `plpgsql` only where a cap check needs `RAISE`), `STABLE`,
    `SECURITY DEFINER`, `SET search_path = ''`, every name schema-qualified;
  - `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated, service_role;`
    `GRANT EXECUTE … TO masi_reporting_reader;`
  - returns `jsonb` with top-level keys `function_version` (the function name) and
    `generated_at` (`now()`), plus the keys listed in its contract.
- SAST day for a timestamp is `(ts AT TIME ZONE 'Africa/Johannesburg')::date`. `session_date` and
  `assessment_date` are already dates.
- Argument errors raise SQLSTATE `22023` with message `invalid_argument:<name>`. Cap breaches raise
  SQLSTATE `P0413` with message `too_much_data:<function>`. Nothing truncates silently, except the
  "latest N of total" detail lists, which return both `total` and `rows`.
- Role: `CREATE ROLE masi_reporting_reader LOGIN NOINHERIT;` (guarded by `IF NOT EXISTS`, no
  password), `ALTER ROLE masi_reporting_reader SET default_transaction_read_only = on;`,
  `ALTER ROLE masi_reporting_reader SET statement_timeout = '15s';`,
  `GRANT USAGE ON SCHEMA public TO masi_reporting_reader;`.
- Copy rules (CONTEXT.md): "EA", "Programme", "assessment" (never "run").
- Node 20 for jest and harnesses:
  `PATH=$HOME/.nvm/versions/node/v20.19.4/bin:/opt/homebrew/opt/postgresql@17/bin:$PATH`.
- Harness target: `MASI_REPORTING_ADMIN_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres`,
  `MASI_REPORTING_DATABASE_NAME=masi_reporting_<suffix>`,
  `MASI_REPORTING_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE`. Reuse
  `assertDisposableAdminTarget`, `buildDatabaseUrl`, `runPsql` and `bootstrapSql` from
  `scripts/history-authorization-postgres-harness.cjs`. Replay migrations the way
  `scripts/support-incident-postgres-harness.cjs` does, since it already handles the storage
  migration.

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
  rows: [{user_id, child_id, programme_code, school_id?, class_id, grade?,
          assessed_this_year, last_assessment_date?}]          -- by user_id, child_id
}                                                              -- cap: 100,000 rows

masi_reporting_daily_v1(p_user_ids uuid[], p_from date, p_to date) -> {   -- span <= 120 days
  function_version, generated_at, from, to,
  sessions:    [{user_id, day, programme_code, sessions, present_attendances, ungrouped_sessions}],   -- ungrouped = group_id IS NULL
  clock:       [{user_id, day, entries, completed_minutes, auto_clock_outs}],
  assessments: [{user_id, day, programme_code?, question_results, battery_runs_completed, children_assessed}]
}   -- non-zero rows only, each ordered by user_id, day, programme_code; cap 200,000 rows in total

masi_reporting_ea_detail_v1(p_user_id uuid, p_from date, p_to date) -> {   -- span <= 120 days
  function_version, generated_at, from, to,
  sessions:     {total, rows: [{id, session_date, updated_at, programme_code, group_name?, class_name?,
                 grade?, present_count, letters_focused: text[]?, session_reading_level?, notes?}]},   -- latest 300
  time_entries: {total, rows: [{id, local_date, sign_in_time, sign_out_time?, duration_minutes?,
                 auto_clocked_out, sign_in_location_status?, sign_out_location_status?}]},              -- latest 200
  assessments:  {total, rows: [{id, assessment_date, updated_at, battery_code?, battery_version?,
                 question_code, language?, raw_score?, item_count?, score_max?, stopped_reason?,
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
          class_name?, grade?, school_id?, programme_code, battery_code?, battery_version?,
          question_code, language?, raw_score?, item_count?, score_max?, stopped_reason?,
          assessment_purpose?, window_label?}]
}   -- by assessment_date, user_id, id; cap 50,000

masi_reporting_time_entries_v1(p_user_ids uuid[], p_from date, p_to date) -> {   -- span <= 92
  function_version, generated_at, from, to,
  rows: [{id, user_id, local_date, sign_in_time, sign_out_time?, duration_minutes?, auto_clocked_out,
          sign_in_location_status?, sign_out_location_status?}]
}   -- by sign_in_time, id; cap 20,000

masi_reporting_incidents_v1(p_user_ids uuid[], p_from timestamptz, p_to timestamptz, p_kinds text[]) -> {   -- span <= 90 days; p_kinds NULL = all
  function_version, generated_at, from, to,
  rows: [{id, reporter_id, kind, repeat_key, report_id?, occurrence_count, first_seen_at, last_seen_at,
          received_at, report_generation?, has_bundle, has_screenshot, app_version?, app_build?,
          update_id?, platform?, os_version?, summary?}]
}   -- received_at in [p_from, p_to), by received_at desc, id; cap 5,000
```

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
- `assessed_this_year` = there exists an `assessments` row for the child with `assessment_date`
  between the active academic year's `starts_on` and `ends_on`. It is false when no year is
  active. `last_assessment_date` = the child's max `assessment_date` overall.
- `ever_*` and `last_*_date` cover all time. `last_clock_date` = SAST date of the max
  `sign_in_time`.
- `last_data_received_at` = greatest of:
  - max `sessions.updated_at` where `user_id = u`;
  - max `assessments.updated_at` where `user_id = u`;
  - max `battery_runs.updated_at` where `user_id = u`;
  - max `letter_mastery.updated_at` where `changed_by = u`;
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
- `question_results` = `assessments` rows (any `battery_run_id`). `battery_runs_completed` counts
  `battery_runs` with `status = 'completed'` on the SAST date of `completed_at`, attributed to
  `battery_runs.user_id` and `programme_id`. `children_assessed` = distinct `child_id` among that
  user-day's assessments. The assessment day is `assessment_date`; its `programme_code` comes from
  `assessments.programme_id`.
- Score fields: `raw_score` = `score`; `item_count` = `total_items`; `score_max` =
  `(derived->>'max')::numeric` only when `jsonb_typeof(derived->'max') = 'number'`.
  `battery_code`/`battery_version` come from the joined `battery_runs` row (null for quick tests).
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
3. **A session at 23:30 SAST** (21:30 UTC) belongs to that SAST date for clock and assessment
   days. Pinned in Task 2.
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
  - EA_SUSP: banned until 2099;
  - EA_TEST: `raw_app_meta_data` `{"is_test_account": true}`;
  - EA_NOPROG: no assignment;
  - one receipt for EA_A with `observed.application.version` `1.5.0`, build `55`, platform
    `android`.

  Cases (each `c.value(name, sql, expected)`, as in existing harnesses):
  - `accounts-shape`: the exact top-level keys;
  - `accounts-ea-a`: EA_A's `assignment.programme_code = 'literacy'`;
  - `accounts-received-uses-server-time`: EA_A's `activity.last_data_received_at` is within 60 s
    of `now()`, not `2026-10-20T08:00Z`;
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
  - `reader-login-no-password`: `pg_authid.rolpassword IS NULL` and `rolcanlogin` is true;
  - `reader-role-settings`: `pg_db_role_setting` contains `default_transaction_read_only=on` and
    `statement_timeout=15s`;
  - `stable-blocks-writes`: create a scratch `STABLE` SQL function containing an `INSERT` and
    expect error `0A000` (INSERT is not allowed in a non-volatile function).

- [ ] **Step 2: Run the harness and verify it fails**

Run: `MASI_REPORTING_ADMIN_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres MASI_REPORTING_DATABASE_NAME=masi_reporting_t1 MASI_REPORTING_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE npm run verify:reporting:postgres`
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

### Task 2: `roster_v1` and `daily_v1`

**Files:**
- Modify: `supabase/migrations/20261031120000_masi_reporting_v1.sql`
- Modify: `scripts/reporting-postgres-harness.cjs`

**Interfaces:**
- Consumes: Task 1 fixture and helpers.
- Produces: `public.masi_reporting_roster_v1(uuid[])`,
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
    - one signed in 2026-10-20 23:30 SAST (21:30Z);
  - assessments: C1 by EA_A on 2026-10-20 (two question rows in one completed battery run), and
    C2 by EA_B on 2026-02-01.

  Cases:
  - `roster-ea-a`: rows for EA_A are exactly C1 and C2 (C3–C6 excluded);
  - `roster-move`: EA_MOVE has no C7 row;
  - `roster-shared`: C1 appears for EA_A and EA_B;
  - `roster-assessed`: C1 `assessed_this_year = true`, C2 `true` (assessed by EA_B within the
    year);
  - `accounts-delivery-count`: EA_A `counts.delivery_children = 2`;
  - `daily-sessions`: EA_MOVE literacy sessions appear under `programme_code` `literacy` on their
    dates;
  - `daily-clock-sast`: the 23:30 SAST entry is on day 2026-10-20;
  - `daily-clock-minutes`: 07:00–15:30 gives `completed_minutes` 510;
  - `daily-assessments`: EA_A 2026-10-20 has `question_results` 2, `battery_runs_completed` 1,
    `children_assessed` 1;
  - `daily-range-invalid`: `p_from > p_to` raises `22023`;
  - `daily-span-cap`: 121 days raises `22023`;
  - `daily-null-ids`: `p_user_ids` NULL raises `22023`.

- [ ] **Step 2: Run and verify the new cases fail** (same command, database `masi_reporting_t2`).
  Expected: FAIL at `roster-ea-a`.
- [ ] **Step 3: Implement both functions** per the contract. Enforce the row cap with
  `plpgsql`: count first, then `RAISE ... USING ERRCODE = 'P0413'`.
- [ ] **Step 4: Run and verify everything passes.**
- [ ] **Step 5: Commit** `feat(reporting): roster_v1 and daily_v1`.

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
  - `*-span-cap` for each function (93, 367, 93 and 91 days raise `22023`);
  - `sessions-row-cap`: a function-local cap check, proven by temporarily calling with a fixture
    of 20,001 sessions created by `generate_series` in a separate disposable database
    (`masi_reporting_cap`), expecting `P0413`.
- [ ] **Step 2: Verify the failures.**
- [ ] **Step 3: Implement** the four functions.
- [ ] **Step 4: Verify everything passes**, including all Task 1 privilege cases, which now
  enumerate eight functions.
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
  - the eight functions with one line each;
  - the "never edit; add `_v2`" rule;
  - deploy order (functions → Django → website);
  - harness command and result.
- Modify: `documentation/build-log.md`. A dated entry with the verification command, the case
  count, "local PG17 only, not applied to hosted", and the rollout steps still owned by Jim.

- [ ] **Step 1: Write both doc changes.**
- [ ] **Step 2: Run the full harness plus `npx jest __tests__/testerProvisioning.test.js`, and
  record the counts in the build log.**
- [ ] **Step 3: Commit** `docs(reporting): contract map and build log for reporting functions`.

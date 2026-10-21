import { letterMasteryDomainId } from './domainId';

const LOCAL_SYNC_COLUMNS = `
  sync_status text not null default 'synced'
    check (sync_status in ('pending', 'synced', 'failed', 'terminal')),
  last_sync_error text,
  server_updated_at text
`;

const explicitDatabaseMigrationQueues = new WeakMap();

export class SchemaTooNewError extends Error {
  constructor(fileVersion, appVersion) {
    super(`Database schema ${fileVersion} is newer than supported schema ${appVersion}`);
    this.name = 'SchemaTooNewError';
    this.code = 'SCHEMA_TOO_NEW';
    this.fileVersion = fileVersion;
    this.appVersion = appVersion;
  }
}

export const isSchemaTooNewError = (error) => error instanceof SchemaTooNewError
  || error?.code === 'SCHEMA_TOO_NEW';

export const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_sqlite_foundation',
    sql: `
      create table if not exists schema_migrations (
        version integer primary key,
        name text not null,
        applied_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      create table if not exists local_state (
        key text primary key,
        value text not null,
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      create table if not exists sync_state (
        scope text primary key,
        last_pulled_at text,
        cursor text,
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      create table if not exists sync_outbox (
        id text primary key,
        table_name text not null,
        record_id text not null,
        operation text not null check (
          operation in ('insert', 'update', 'archive', 'hard_delete', 'restore')
        ),
        payload text,
        status text not null default 'pending'
          check (status in ('pending', 'in_flight', 'failed', 'terminal')),
        retry_count integer not null default 0,
        last_error text,
        next_retry_at text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      create table if not exists schools (
        id text primary key,
        school_uid text unique,
        school_number text,
        name text not null unique,
        school_type text,
        suburb text,
        coord_east real,
        coord_south real,
        google_maps_link text,
        is_active integer not null default 1,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS}
      );

      create table if not exists job_titles (
        id text primary key,
        code text not null unique,
        name text not null unique,
        sort_order integer not null default 0,
        is_active integer not null default 1,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS}
      );

      create table if not exists programmes (
        id text primary key,
        code text not null unique,
        name text not null unique,
        sort_order integer not null default 0,
        is_active integer not null default 1,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS}
      );

      create table if not exists staff_programme_assignments (
        id text primary key,
        user_id text not null,
        programme_id text not null references programmes(id) on delete restrict,
        school_id text references schools(id) on delete restrict,
        assigned_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ended_at text,
        created_by text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        check (ended_at is null or ended_at >= assigned_at)
      );

      create unique index if not exists idx_staff_programme_assignments_active_unique
        on staff_programme_assignments(user_id)
        where ended_at is null;

      create table if not exists assessment_tools (
        id text primary key,
        programme_id text not null references programmes(id) on delete restrict,
        code text not null unique,
        name text not null,
        subject text,
        language text,
        version text,
        config text not null default '{}',
        is_active integer not null default 1,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS}
      );

      create table if not exists academic_years (
        id text primary key,
        label text not null unique,
        starts_on text not null,
        ends_on text not null,
        is_active integer not null default 0,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        check (ends_on >= starts_on)
      );

      create unique index if not exists idx_academic_years_active_unique
        on academic_years(is_active)
        where is_active = 1;

      create table if not exists assessment_windows (
        id text primary key,
        academic_year_id text not null references academic_years(id) on delete restrict,
        label text not null,
        window_type text not null check (window_type in ('baseline', 'midline', 'endline')),
        starts_on text not null,
        ends_on text not null,
        is_required integer not null default 1,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        unique (academic_year_id, window_type),
        check (ends_on >= starts_on)
      );

      create trigger if not exists ensure_active_year_baseline_window_insert
        after insert on academic_years
        when new.is_active = 1
      begin
        insert into assessment_windows (
          id,
          academic_year_id,
          label,
          window_type,
          starts_on,
          ends_on,
          is_required
        )
        values (
          new.id || ':baseline',
          new.id,
          new.label || ' Baseline',
          'baseline',
          new.starts_on,
          new.ends_on,
          1
        )
        on conflict (academic_year_id, window_type) do update set
          label = excluded.label,
          starts_on = excluded.starts_on,
          ends_on = excluded.ends_on,
          is_required = 1,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
      end;

      create trigger if not exists ensure_active_year_baseline_window_update
        after update of is_active, label, starts_on, ends_on on academic_years
        when new.is_active = 1
      begin
        insert into assessment_windows (
          id,
          academic_year_id,
          label,
          window_type,
          starts_on,
          ends_on,
          is_required
        )
        values (
          new.id || ':baseline',
          new.id,
          new.label || ' Baseline',
          'baseline',
          new.starts_on,
          new.ends_on,
          1
        )
        on conflict (academic_year_id, window_type) do update set
          label = excluded.label,
          starts_on = excluded.starts_on,
          ends_on = excluded.ends_on,
          is_required = 1,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
      end;

      create table if not exists teachers (
        id text primary key,
        first_name text not null,
        last_name text not null,
        display_name text,
        school_id text references schools(id) on delete restrict,
        archived_at text,
        archived_by_user_id text,
        archive_reason text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS}
      );

      create table if not exists classes (
        id text primary key,
        school_id text not null references schools(id) on delete restrict,
        name text not null,
        grade text not null,
        teacher text,
        teacher_id text references teachers(id) on delete set null,
        home_language text,
        academic_year integer,
        academic_year_id text references academic_years(id) on delete restrict,
        archived_at text,
        archived_by_user_id text,
        archive_reason text,
        created_by text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS}
      );

      create table if not exists children (
        id text primary key,
        first_name text not null,
        last_name text not null,
        preferred_name text,
        date_of_birth text,
        age integer,
        gender text check (
          gender is null or gender in ('female', 'male', 'non_binary', 'unknown')
        ),
        class_id text references classes(id) on delete set null,
        hidden_at text,
        archived_at text,
        archived_by_user_id text,
        archive_reason text,
        created_by text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        check (age is null or (age >= 0 and age < 25))
      );

      create table if not exists child_ea_assignments (
        id text primary key,
        user_id text not null,
        child_id text not null references children(id) on delete cascade,
        assigned_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        unassigned_at text,
        created_by text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        check (unassigned_at is null or unassigned_at >= assigned_at)
      );

      create unique index if not exists idx_child_ea_assignments_active_unique
        on child_ea_assignments(user_id, child_id)
        where unassigned_at is null;

      create table if not exists child_programme_enrollments (
        id text primary key,
        child_id text not null references children(id) on delete cascade,
        programme_id text not null references programmes(id) on delete restrict,
        enrolled_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ended_at text,
        created_by text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        check (ended_at is null or ended_at >= enrolled_at)
      );

      create unique index if not exists idx_child_programme_enrollments_active_unique
        on child_programme_enrollments(child_id, programme_id)
        where ended_at is null;

      create table if not exists class_ea_assignments (
        id text primary key,
        class_id text not null references classes(id) on delete cascade,
        ea_user_id text not null,
        programme_id text not null references programmes(id) on delete restrict,
        assigned_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        unassigned_at text,
        handover_reason text,
        created_by text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        check (unassigned_at is null or unassigned_at >= assigned_at)
      );

      create unique index if not exists idx_class_ea_assignments_active_unique
        on class_ea_assignments(class_id, ea_user_id, programme_id)
        where unassigned_at is null;

      create table if not exists grouping_versions (
        id text primary key,
        class_id text not null references classes(id) on delete cascade,
        academic_year_id text not null references academic_years(id) on delete restrict,
        version_number integer not null,
        status text not null default 'active' check (status in ('active', 'archived')),
        accepted_at text,
        accepted_by_user_id text,
        archived_at text,
        archived_by_user_id text,
        archive_reason text,
        created_by text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        unique (class_id, academic_year_id, version_number)
      );

      create unique index if not exists idx_grouping_versions_active_unique
        on grouping_versions(class_id, academic_year_id)
        where status = 'active';

      create table if not exists class_grouping_state (
        id text primary key,
        class_id text not null references classes(id) on delete cascade,
        academic_year_id text not null references academic_years(id) on delete restrict,
        class_list_status text not null default 'building'
          check (class_list_status in ('building', 'complete', 'reopened')),
        class_list_completed_at text,
        class_list_completed_by_user_id text,
        class_list_reopened_at text,
        class_list_reopened_by_user_id text,
        active_grouping_version_id text references grouping_versions(id) on delete set null,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        unique (class_id, academic_year_id)
      );

      create table if not exists child_class_memberships (
        id text primary key,
        child_id text not null references children(id) on delete cascade,
        class_id text not null references classes(id) on delete restrict,
        academic_year_id text not null references academic_years(id) on delete restrict,
        enrolled_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        exited_at text,
        created_by text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        check (exited_at is null or exited_at >= enrolled_at)
      );

      create unique index if not exists idx_child_class_memberships_active_unique
        on child_class_memberships(child_id, academic_year_id)
        where exited_at is null;

      create table if not exists groups (
        id text primary key,
        name text not null,
        programme_id text not null references programmes(id) on delete restrict,
        class_id text references classes(id) on delete set null,
        grouping_version_id text references grouping_versions(id) on delete restrict,
        display_number integer,
        archived_at text,
        archived_by_user_id text,
        archive_reason text,
        created_by text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS}
      );

      create unique index if not exists idx_groups_active_display_number
        on groups(grouping_version_id, display_number)
        where archived_at is null and display_number is not null;

      create table if not exists group_ea_assignments (
        id text primary key,
        group_id text not null references groups(id) on delete cascade,
        ea_user_id text not null,
        programme_id text not null references programmes(id) on delete restrict,
        assigned_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        unassigned_at text,
        handover_reason text,
        created_by text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        check (unassigned_at is null or unassigned_at >= assigned_at)
      );

      create unique index if not exists idx_group_ea_assignments_active_unique
        on group_ea_assignments(group_id)
        where unassigned_at is null;

      create table if not exists child_group_memberships (
        id text primary key,
        child_id text not null references children(id) on delete cascade,
        group_id text not null references groups(id) on delete cascade,
        grouping_version_id text references grouping_versions(id) on delete restrict,
        joined_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        removed_at text,
        created_by text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        check (removed_at is null or removed_at >= joined_at)
      );

      create unique index if not exists idx_child_group_memberships_active_by_version
        on child_group_memberships(child_id, grouping_version_id)
        where removed_at is null;

      create table if not exists time_entries (
        id text primary key,
        user_id text not null,
        sign_in_time text not null,
        sign_in_lat real not null,
        sign_in_lon real not null,
        sign_out_time text,
        sign_out_lat real,
        sign_out_lon real,
        auto_clocked_out integer not null default 0,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS}
      );

      create table if not exists sessions (
        id text primary key,
        user_id text not null,
        programme_id text not null references programmes(id) on delete restrict,
        class_id text references classes(id) on delete set null,
        session_date text not null,
        started_at text,
        ended_at text,
        activities text not null default '{}',
        notes text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS}
      );

      create table if not exists session_attendees (
        id text primary key,
        session_id text not null references sessions(id) on delete cascade,
        child_id text not null references children(id) on delete cascade,
        group_id text references groups(id) on delete set null,
        attendance_status text not null default 'present'
          check (attendance_status in ('present', 'absent', 'late', 'excused')),
        grade_snapshot text,
        notes text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS}
      );

      create table if not exists assessments (
        id text primary key,
        user_id text not null,
        child_id text not null references children(id) on delete cascade,
        programme_id text not null references programmes(id) on delete restrict,
        assessment_tool_id text references assessment_tools(id) on delete restrict,
        assessment_window_id text references assessment_windows(id) on delete set null,
        assessment_purpose text not null default 'progress_check'
          check (assessment_purpose in ('official_window', 'progress_check', 'other')),
        grade_snapshot text,
        teacher_name_snapshot text,
        assessment_type text not null,
        assessment_date text not null,
        score integer,
        total_items integer,
        items_tested text,
        notes text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        check (
          (
            assessment_purpose = 'official_window'
            and assessment_window_id is not null
          )
          or
          (
            assessment_purpose <> 'official_window'
            and assessment_window_id is null
          )
        )
      );

      create table if not exists assessment_items (
        id text primary key,
        assessment_id text not null references assessments(id) on delete cascade,
        item_key text not null,
        prompt text,
        response text,
        is_correct integer,
        position integer,
        metadata text not null default '{}',
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS}
      );

      create table if not exists letter_mastery (
        id text primary key,
        user_id text not null,
        child_id text not null references children(id) on delete cascade,
        programme_id text not null references programmes(id) on delete restrict,
        letter text not null,
        language text not null,
        source text not null default 'taught',
        mastered_at text,
        deleted_at text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS}
      );

      create unique index if not exists idx_letter_mastery_unique_active
        on letter_mastery(user_id, child_id, programme_id, letter, language, source)
        where deleted_at is null;
    `,
  },
  {
    version: 2,
    name: 'programmes_daily_session_target',
    sql: `
      alter table programmes add column daily_session_target integer;
      alter table programmes add column daily_session_ceiling integer;
    `,
  },
  {
    version: 3,
    name: 'sessions_forward_prep_columns',
    sql: `
      alter table sessions add column group_id text references groups(id) on delete set null;
      alter table sessions add column state text not null default 'completed'
        check (state in ('completed', 'in_progress', 'paused', 'discarded'));
    `,
  },
  {
    version: 4,
    name: 'assessments_capture_mode',
    sql: `
      alter table assessments add column capture_mode text
        check (capture_mode is null or capture_mode in ('grid', 'sequential'));
    `,
  },
  {
    version: 5,
    name: 'hot_path_covering_indexes',
    sql: `
      create index if not exists idx_session_attendees_session on session_attendees(session_id);
      create index if not exists idx_assessment_items_assessment on assessment_items(assessment_id);
      create index if not exists idx_assessments_programme_child on assessments(programme_id, child_id);
      create index if not exists idx_sessions_programme_date on sessions(programme_id, session_date);
      create index if not exists idx_letter_mastery_user_child on letter_mastery(user_id, child_id);
      create index if not exists idx_child_group_memberships_group on child_group_memberships(group_id);
      create index if not exists idx_sync_outbox_ready on sync_outbox(status, next_retry_at);
      create index if not exists idx_time_entries_user_signin on time_entries(user_id, sign_in_time);
    `,
  },
  {
    version: 6,
    name: 'sync_outbox_owner_user_id',
    sql: `
      alter table sync_outbox add column owner_user_id text;
    `,
  },
  {
    version: 7,
    name: 'local_state_sidecar_cleanup',
    sql: `
      delete from local_state where key like 'storage_payload:%';
      delete from local_state where key = 'sync_queue';
    `,
  },
  {
    version: 8,
    name: 'children_current_reading_level',
    sql: `
      alter table children add column reading_level text;
    `,
  },
  {
    version: 9,
    name: 'sync_relationship_indexes',
    sql: `
      create index if not exists idx_sessions_class_id
        on sessions(class_id)
        where class_id is not null;
      create index if not exists idx_sessions_group_id
        on sessions(group_id)
        where group_id is not null;
      create index if not exists idx_session_attendees_group_id
        on session_attendees(group_id)
        where group_id is not null;
    `,
  },
  {
    version: 10,
    name: 'children_history_reference',
    sql: `
      alter table children add column history_reference integer not null default 0
        check (history_reference in (0, 1));
    `,
  },
  {
    version: 11,
    name: 'time_entry_location_optional',
    // SQLite cannot DROP NOT NULL. Rebuild under the existing FK-off migration
    // transaction; copy every old column and recreate the table's sole index.
    // v10 has no time_entries triggers or inbound/outbound foreign keys.
    sql: `
      create table time_entries_new (
        id text primary key,
        user_id text not null,
        sign_in_time text not null,
        sign_in_lat real,
        sign_in_lon real,
        sign_out_time text,
        sign_out_lat real,
        sign_out_lon real,
        auto_clocked_out integer not null default 0,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        sign_in_location_status text,
        sign_out_location_status text,
        check (sign_in_location_status in ('fix', 'timeout', 'denied', 'services_off', 'unavailable')),
        check ((sign_in_lat is null) = (sign_in_lon is null)),
        check (sign_in_location_status is null or
          (sign_in_location_status = 'fix' and sign_in_lat is not null and sign_in_lon is not null) or
          (sign_in_location_status <> 'fix' and sign_in_lat is null and sign_in_lon is null)),
        check (sign_out_location_status in ('fix', 'timeout', 'denied', 'services_off', 'unavailable')),
        check ((sign_out_lat is null) = (sign_out_lon is null)),
        check (sign_out_location_status is null or
          (sign_out_location_status = 'fix' and sign_out_lat is not null and sign_out_lon is not null) or
          (sign_out_location_status <> 'fix' and sign_out_lat is null and sign_out_lon is null))
      );
      insert into time_entries_new (id, user_id, sign_in_time, sign_in_lat, sign_in_lon, sign_out_time, sign_out_lat, sign_out_lon, auto_clocked_out, created_at, updated_at, sync_status, last_sync_error, server_updated_at)
        select id, user_id, sign_in_time, sign_in_lat, sign_in_lon, sign_out_time, sign_out_lat, sign_out_lon, auto_clocked_out, created_at, updated_at, sync_status, last_sync_error, server_updated_at from time_entries;
      drop table time_entries;
      alter table time_entries_new rename to time_entries;
      create index if not exists idx_time_entries_user_signin on time_entries(user_id, sign_in_time);
    `,
  },
  {
    version: 12,
    name: 'sync_outbox_owner_required',
    sql: `
create trigger if not exists sync_outbox_owner_required
before insert on sync_outbox
when new.owner_user_id is null
begin
  select raise(abort, 'sync_outbox.owner_user_id is required');
end;
    `,
  },
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
  {
    version: 14,
    name: 'domain_row_versions',
    sql: `
alter table children add column row_version integer not null default 1;
alter table classes add column row_version integer not null default 1;
alter table groups add column row_version integer not null default 1;
alter table child_ea_assignments add column row_version integer not null default 1;
alter table class_ea_assignments add column row_version integer not null default 1;
alter table group_ea_assignments add column row_version integer not null default 1;
alter table child_programme_enrollments add column row_version integer not null default 1;
alter table child_class_memberships add column row_version integer not null default 1;
alter table child_group_memberships add column row_version integer not null default 1;
alter table grouping_versions add column row_version integer not null default 1;
alter table class_grouping_state add column row_version integer not null default 1;
    `,
  },
  {
    version: 15,
    name: 'assessment_results',
    sql: `
      -- Clear practice results and their old per-row writes before changing shape.
      delete from sync_outbox where table_name in ('assessments', 'assessment_items');
      delete from assessment_items;
      delete from assessments;

      alter table assessments add column question_code text;
      alter table assessments add column question_version text;
      alter table assessments add column item_set_id text;
      alter table assessments add column language text;
      alter table assessments add column stopped_reason text;
      alter table assessments add column duration_ms integer;
      alter table assessments add column derived text not null default '{}';

      create table battery_runs (
        id text primary key,
        battery_code text not null,
        battery_version text not null,
        child_id text not null references children(id) on delete restrict,
        user_id text not null,
        programme_id text not null references programmes(id),
        class_id text,
        assessment_purpose text not null default 'progress_check'
          check (assessment_purpose in ('official_window', 'progress_check', 'other')),
        assessment_window_id text references assessment_windows(id) on delete set null,
        language text not null,
        started_at text not null,
        completed_at text,
        status text not null default 'in_progress'
          check (status in ('in_progress', 'completed', 'abandoned')),
        notes text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        started_here integer not null default 0 check (started_here in (0,1)),
        check ((status = 'completed') = (completed_at is not null)),
        check (
          (
            assessment_purpose = 'official_window'
            and assessment_window_id is not null
          )
          or
          (
            assessment_purpose <> 'official_window'
            and assessment_window_id is null
          )
        )
      );

      alter table assessments add column battery_run_id text references battery_runs(id) on delete restrict;

      create unique index idx_assessments_run_question
        on assessments(battery_run_id, question_code) where battery_run_id is not null;
      create index idx_battery_runs_user_status on battery_runs(user_id, status);

      alter table programmes add column default_battery_code text;
      alter table programmes add column default_battery_version text;
    `,
  },
  {
    version: 16,
    name: 'letter_mastery_current_state',
    sql: `
      create table letter_mastery_v2 (
        id text primary key,
        child_id text not null references children(id) on delete cascade,
        letter text not null check (length(letter) = 1 and letter = lower(letter)),
        language text not null check (language glob '[a-z][a-z]'),
        confirmed integer not null check (confirmed in (0, 1)),
        changed_at text not null,
        correction_id text not null,
        changed_by text not null,
        programme_id text,
        created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ${LOCAL_SYNC_COLUMNS},
        server_changed_at text,
        server_correction_id text
      );

      -- Rank before checking sync_status: an unsynced winner clears the whole key.
      with codes as (
        select *,
          lower(letter) as l,
          case lower(trim(language))
            when 'english' then 'en'
            when 'isixhosa' then 'xh'
            when 'xhosa' then 'xh'
            when 'isizulu' then 'zu'
            when 'zulu' then 'zu'
            when 'afrikaans' then 'af'
            else case when language glob '[a-z][a-z]' then language else null end
          end as code
        from letter_mastery
      ), ranked as (
        select *, row_number() over (
          partition by child_id, l, code order by updated_at desc, id desc
        ) as rn
        from codes
      )
      insert into letter_mastery_v2 (
        id, child_id, letter, language, confirmed, changed_at, correction_id, changed_by,
        programme_id, created_at, updated_at, sync_status, server_updated_at,
        server_changed_at, server_correction_id
      )
      select id, child_id, l, code, (deleted_at is null), updated_at, id, user_id,
        programme_id, created_at, updated_at, 'synced', server_updated_at, null, null
      from ranked
      where rn = 1 and code is not null and length(l) = 1 and sync_status = 'synced';

      delete from sync_outbox where table_name = 'letter_mastery';
      drop table letter_mastery;
      alter table letter_mastery_v2 rename to letter_mastery;
      create unique index idx_letter_mastery_child_key on letter_mastery(child_id, letter, language);
    `,
    transform: async (txn) => {
      const rows = await txn.getAllAsync('select id, child_id, letter, language from letter_mastery');
      for (const row of rows) {
        await txn.runAsync('update letter_mastery set id = ? where id = ?', letterMasteryDomainId({
          childId: row.child_id,
          letter: row.letter,
          language: row.language,
        }), row.id);
      }
    },
  },
  // C7 allows one lesson in progress per EA. As with the v12 owner trigger,
  // the database backstops the repository-level check.
  {
    version: 17,
    name: 'lesson_drafts',
    sql: `
create table if not exists lesson_drafts (
  id text primary key,
  slot integer not null default 1 unique check (slot = 1),
  session_id text not null unique,
  programme_id text not null,
  group_id text not null,
  class_id text,
  language_code text,
  pack_id text,
  lesson_date text not null,
  attendance text not null default '{}',
  plan text,
  plan_fixed_at text,
  ticks text not null default '{}',
  tracker_changes text not null default '{}',
  reading_level_changes text not null default '{}',
  notes text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
    `,
  },
];

// Derived from the migration list so it never drifts when a migration is added.
export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export const readSupportedSchemaVersion = async (db) => {
  const row = await db.getFirstAsync('PRAGMA user_version');
  const userVersion = row?.user_version || 0;
  if (userVersion > CURRENT_SCHEMA_VERSION) {
    throw new SchemaTooNewError(userVersion, CURRENT_SCHEMA_VERSION);
  }
  return userVersion;
};

const runInTransaction = async (db, task) => {
  // Manual transaction control on the supplied connection — no withExclusiveTransactionAsync
  // (which opens a throwaway connection without our pragmas). Migrations run with
  // foreign_keys OFF (set by runMigrationsNow between transactions, since PRAGMA
  // foreign_keys is a no-op inside a transaction).
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    const result = await task(db);
    await db.execAsync('COMMIT');
    return result;
  } catch (error) {
    // Roll back, but never let a ROLLBACK failure mask the original migration error.
    // SQLite may have already auto-rolled-back (making an explicit ROLLBACK throw
    // "no transaction is active"), which would otherwise hide the actionable cause
    // and break startup-migration diagnosis.
    try {
      await db.execAsync('ROLLBACK');
    } catch (rollbackError) {
      // swallow — the original error is the one worth surfacing
    }
    throw error;
  }
};

async function runMigrationsNow(database) {
  const db = database;
  const userVersion = await readSupportedSchemaVersion(db);
  const pending = MIGRATIONS.filter((migration) => migration.version > userVersion);
  if (pending.length === 0) {
    // Fully migrated: do NOT toggle foreign_keys. resolveDatabase() calls this on every
    // repository access; toggling FK off/on each time would open a transient FK-off window
    // on the shared connection that can overlap a concurrent write (enforcement silently
    // disabled), and the restore no-ops if a write txn is open. A no-op call stays a true no-op.
    return;
  }
  // Pending migrations run with FK enforcement OFF, restored ON in finally. PRAGMA
  // foreign_keys is a no-op inside a transaction, so set it between transactions.
  await db.execAsync('PRAGMA foreign_keys = OFF');
  try {
    for (const migration of pending) {
      await runInTransaction(db, async (txn) => {
        await txn.execAsync(migration.sql);
        if (migration.transform) await migration.transform(txn);
        await txn.runAsync(
          'insert or ignore into schema_migrations (version, name) values (?, ?)',
          migration.version,
          migration.name
        );
        // Bump user_version INSIDE the transaction so the schema change and the
        // version marker commit (or roll back) atomically. Setting it afterwards
        // left a crash window: a committed migration whose user_version had not
        // yet been written would replay on next launch and a non-idempotent
        // migration (e.g. ALTER TABLE ADD COLUMN) would fail with duplicate-column,
        // bricking startup migrations on that device. SQLite treats user_version
        // as transactional (verified: commits with the txn, reverts on rollback).
        await txn.execAsync(`PRAGMA user_version = ${migration.version}`);
      });
    }
  } finally {
    // Restore runtime FK posture for ALL callers — production writer AND injected test DBs.
    await db.execAsync('PRAGMA foreign_keys = ON');
  }
}

export async function runMigrations(database) {
  if (!database) throw new Error('Migrations require an explicit database');
  const currentQueue = explicitDatabaseMigrationQueues.get(database) || Promise.resolve();
  const queuedMigration = currentQueue.then(
    () => runMigrationsNow(database),
    () => runMigrationsNow(database)
  );
  explicitDatabaseMigrationQueues.set(database, queuedMigration.catch(() => {}));
  return queuedMigration;
}

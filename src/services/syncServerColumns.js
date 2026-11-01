// Server column allowlists shared by ordinary row uploads and assessment-family serialization.
export const SERVER_COLUMNS = {
  time_entries: [
    'id', 'user_id', 'sign_in_time', 'sign_in_lat', 'sign_in_lon', 'sign_out_time',
    'sign_out_lat', 'sign_out_lon', 'sign_in_location_status', 'sign_out_location_status',
    'auto_clocked_out', 'created_at', 'updated_at',
  ],
  classes: [
    'id', 'school_id', 'name', 'grade', 'teacher', 'teacher_id', 'home_language',
    'academic_year', 'academic_year_id', 'archived_at', 'archived_by_user_id',
    'archive_reason', 'created_by', 'created_at', 'updated_at',
    'row_version',
  ],
  children: [
    'id', 'first_name', 'last_name', 'preferred_name', 'date_of_birth', 'age',
    'gender', 'reading_level', 'class_id', 'hidden_at', 'archived_at', 'archived_by_user_id',
    'archive_reason', 'created_by', 'created_at', 'updated_at',
    'row_version',
  ],
  child_ea_assignments: [
    'id', 'user_id', 'child_id', 'assigned_at', 'unassigned_at', 'created_by',
    'created_at', 'updated_at',
    'row_version',
  ],
  child_programme_enrollments: [
    'id', 'child_id', 'programme_id', 'enrolled_at', 'ended_at', 'created_by',
    'created_at', 'updated_at',
    'row_version',
  ],
  child_class_memberships: [
    'id', 'child_id', 'class_id', 'academic_year_id', 'enrolled_at', 'exited_at',
    'created_by', 'created_at', 'updated_at',
    'row_version',
  ],
  class_ea_assignments: [
    'id', 'class_id', 'ea_user_id', 'programme_id', 'assigned_at', 'unassigned_at',
    'handover_reason', 'created_by', 'created_at', 'updated_at',
    'row_version',
  ],
  grouping_versions: [
    'id', 'class_id', 'academic_year_id', 'version_number', 'status',
    'accepted_at', 'accepted_by_user_id', 'archived_at', 'archived_by_user_id',
    'archive_reason', 'created_by', 'created_at', 'updated_at',
    'row_version',
  ],
  class_grouping_state: [
    'id', 'class_id', 'academic_year_id', 'class_list_status',
    'class_list_completed_at', 'class_list_completed_by_user_id',
    'class_list_reopened_at', 'class_list_reopened_by_user_id',
    'active_grouping_version_id', 'created_at', 'updated_at',
    'row_version',
  ],
  groups: [
    'id', 'name', 'programme_id', 'class_id', 'grouping_version_id',
    'display_number', 'archived_at', 'archived_by_user_id', 'archive_reason',
    'created_by', 'created_at', 'updated_at',
    'row_version',
  ],
  group_ea_assignments: [
    'id', 'group_id', 'ea_user_id', 'programme_id', 'assigned_at', 'unassigned_at',
    'handover_reason', 'created_by', 'created_at', 'updated_at',
    'row_version',
  ],
  child_group_memberships: [
    'id', 'child_id', 'group_id', 'grouping_version_id', 'joined_at', 'removed_at',
    'created_by', 'created_at', 'updated_at',
    'row_version',
  ],
  sessions: [
    'id', 'user_id', 'programme_id', 'class_id', 'group_id', 'session_date', 'started_at',
    'ended_at', 'activities', 'notes', 'created_at', 'updated_at',
  ],
  session_attendees: [
    'id', 'session_id', 'child_id', 'group_id', 'attendance_status',
    'grade_snapshot', 'notes', 'created_at', 'updated_at',
  ],
  battery_runs: [
    'id', 'user_id', 'child_id', 'programme_id', 'class_id', 'battery_code',
    'battery_version', 'assessment_purpose', 'assessment_window_id', 'language',
    'started_at', 'completed_at', 'status', 'notes', 'created_at', 'updated_at',
  ],
  assessments: [
    'id', 'user_id', 'child_id', 'programme_id', 'assessment_tool_id',
    'assessment_window_id', 'assessment_purpose', 'grade_snapshot',
    'teacher_name_snapshot', 'assessment_type', 'capture_mode',
    'assessment_date', 'score', 'total_items', 'notes',
    'question_code', 'question_version', 'item_set_id', 'language', 'stopped_reason',
    'duration_ms', 'derived', 'battery_run_id',
    'created_at', 'updated_at',
  ],
  assessment_items: [
    'id', 'assessment_id', 'item_key', 'prompt', 'response', 'is_correct',
    'position', 'metadata', 'created_at', 'updated_at',
  ],
  letter_mastery: [
    'id', 'child_id', 'letter', 'language', 'confirmed', 'changed_at', 'correction_id',
    'changed_by', 'programme_id', 'created_at', 'updated_at',
  ],
  skill_mastery: [
    'id', 'child_id', 'step_key', 'confirmed', 'changed_at', 'correction_id',
    'changed_by', 'programme_id', 'created_at', 'updated_at',
  ],
};

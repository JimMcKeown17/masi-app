import { SERVER_COLUMNS } from './syncServerColumns';

// Keep this local boundary aligned with submit_assessment's JSON and cast checks.
// Authority and immutable-family conflict checks still belong to the server.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STOPPED_REASONS = Object.freeze([
  'completed', 'timer', 'ea_ended', 'stop_rule',
  'skipped_child_refused', 'skipped_tired', 'skipped_time', 'skipped_age',
  'skipped_prerequisite_unmet', 'skipped_other',
]);
const REQUIRED_STRINGS = [
  'id', 'user_id', 'child_id', 'programme_id', 'assessment_type', 'assessment_date',
  'assessment_purpose', 'question_code', 'question_version', 'item_set_id',
  'language', 'stopped_reason',
];
const OPTIONAL_STRINGS = [
  'assessment_tool_id', 'battery_run_id', 'assessment_window_id', 'created_at',
  'capture_mode', 'notes', 'grade_snapshot', 'teacher_name_snapshot',
];

const refuse = (field, requirement) => {
  throw new TypeError(`${field}: ${requirement}`);
};

const assertPlainObject = (value, field) => {
  if (value === null || typeof value !== 'object'
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    refuse(field, 'must be a plain object');
  }
};

const assertString = (value, field) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    refuse(field, 'must be a nonempty string');
  }
};

const assertOptionalString = (value, field) => {
  if (value != null && typeof value !== 'string') refuse(field, 'must be a string or null');
};

const assertUuid = (value, field) => {
  if (typeof value !== 'string' || !UUID.test(value)) refuse(field, 'must be a UUID');
};

const isCalendarDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
};

const assertTimestamp = (value, field) => {
  if (value == null) return;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:Z|[+-](\d{2}):?(\d{2}))?$/.exec(value);
  if (!match || !isCalendarDate(match[1])) refuse(field, 'must be a valid ISO timestamp');
  const [, , hourText, minuteText, secondText = '0', fraction = '', offsetHour = '0', offsetMinute = '0'] = match;
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  if (hour > 24 || minute > 59 || second > 59
    || (hour === 24 && (minute !== 0 || second !== 0 || /[1-9]/.test(fraction)))
    || Number(offsetHour) > 15 || Number(offsetMinute) > 59
    || !Number.isFinite(Date.parse(value))) {
    refuse(field, 'must be a valid ISO timestamp');
  }
};

const assertInteger = (value, field, minimum = 0) => {
  if (!Number.isInteger(value) || value < minimum || value > 2147483647) {
    refuse(field, `must be an integer between ${minimum} and 2147483647`);
  }
};

export const assertSubmitShape = (payload) => {
  assertPlainObject(payload, 'payload');
  for (const field of REQUIRED_STRINGS) assertString(payload[field], field);
  for (const field of OPTIONAL_STRINGS) assertOptionalString(payload[field], field);
  for (const field of ['id', 'user_id', 'child_id', 'programme_id']) {
    assertUuid(payload[field], field);
  }
  for (const field of ['assessment_tool_id', 'battery_run_id', 'assessment_window_id']) {
    if (payload[field] != null) assertUuid(payload[field], field);
  }
  if (!isCalendarDate(payload.assessment_date)) refuse('assessment_date', 'must be a valid YYYY-MM-DD date');
  assertTimestamp(payload.created_at, 'created_at');
  if (!/^[a-z]{2}$/.test(payload.language)) refuse('language', 'must be two lowercase letters');
  if (!STOPPED_REASONS.includes(payload.stopped_reason)) refuse('stopped_reason', 'must be a supported stop reason');
  assertPlainObject(payload.derived, 'derived');
  assertInteger(payload.total_items, 'total_items');
  if (payload.score != null) assertInteger(payload.score, 'score', -2147483648);
  if (payload.duration_ms != null) assertInteger(payload.duration_ms, 'duration_ms');
  if (!Array.isArray(payload.items)) refuse('items', 'must be an array');
  if (payload.items.length !== payload.total_items) refuse('total_items', 'must equal items.length');

  const ids = new Set();
  const positions = new Set();
  for (const [index, item] of payload.items.entries()) {
    const field = `items[${index}]`;
    assertPlainObject(item, field);
    assertUuid(item.id, `${field}.id`);
    if (typeof item.assessment_id !== 'string' || item.assessment_id !== payload.id) {
      refuse(`${field}.assessment_id`, 'must equal the parent id');
    }
    assertInteger(item.position, `${field}.position`);
    if (ids.has(item.id.toLowerCase())) refuse(`${field}.id`, 'must be unique');
    if (positions.has(item.position)) refuse(`${field}.position`, 'must be unique');
    ids.add(item.id.toLowerCase());
    positions.add(item.position);
    assertString(item.item_key, `${field}.item_key`);
    if (typeof item.is_correct !== 'boolean') refuse(`${field}.is_correct`, 'must be a boolean');
    assertPlainObject(item.metadata, `${field}.metadata`);
    for (const optional of ['prompt', 'response', 'created_at']) {
      assertOptionalString(item[optional], `${field}.${optional}`);
    }
    assertTimestamp(item.created_at, `${field}.created_at`);
  }
};

export const toSubmitArgs = (payload) => {
  assertSubmitShape(payload);
  const selectColumns = (record, columns) => Object.fromEntries(
    columns
      .filter(column => column !== 'updated_at' && record[column] !== undefined)
      .map(column => [column, record[column]])
  );
  return {
    p_assessment: selectColumns(payload, SERVER_COLUMNS.assessments),
    p_items: payload.items.map(item => selectColumns(item, SERVER_COLUMNS.assessment_items)),
  };
};

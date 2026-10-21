import { v4 as uuidv4 } from 'uuid';
import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import { decodeJson, encodeJson, timestamp } from './sqliteRepositoryUtils';
import { parseDateKey } from '../../utils/sessionDateFormat';
import { READING_LEVELS } from '../../constants/literacyConstants';
import { LANGUAGE_LABELS } from '../../utils/assessmentRegistry';

export class LessonDraftExistsError extends Error {
  constructor(draftId) {
    super(`Lesson draft ${draftId} is already in progress`);
    this.name = 'LessonDraftExistsError';
    this.code = 'LESSON_DRAFT_EXISTS';
    this.draftId = draftId;
  }
}

export class LessonDraftNotFoundError extends Error {
  constructor(draftId) {
    super(`Lesson draft ${draftId} was not found`);
    this.name = 'LessonDraftNotFoundError';
    this.code = 'LESSON_DRAFT_NOT_FOUND';
    this.draftId = draftId;
  }
}

export class LessonDraftContextError extends Error {
  constructor(field) {
    super(`Lesson draft ${field} is fixed`);
    this.name = 'LessonDraftContextError';
    this.code = 'LESSON_DRAFT_CONTEXT_FIXED';
    this.field = field;
  }
}

export class LessonDraftCorruptError extends Error {
  constructor(draftId, fields) {
    super(`Lesson draft ${draftId} has unreadable fields: ${[...fields].sort().join(', ')}`);
    this.name = 'LessonDraftCorruptError';
    this.code = 'LESSON_DRAFT_CORRUPT';
    this.draftId = draftId;
    this.fields = [...fields].sort();
  }
}

const JSON_COLUMNS = ['attendance', 'plan', 'ticks', 'tracker_changes', 'reading_level_changes'];
const INPUT_COLUMNS = [
  'programme_id', 'group_id', 'class_id', 'language_code', 'pack_id', 'lesson_date',
  ...JSON_COLUMNS, 'plan_fixed_at', 'notes',
];
const isPlainObject = (value) => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const check = (condition, field) => {
  if (!condition) throw new TypeError(`Invalid lesson draft ${field}`);
};
const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isLanguageCode = (value) => typeof value === 'string'
  && Object.prototype.hasOwnProperty.call(LANGUAGE_LABELS, value);
const isIsoTime = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const stringArray = (value, field, distinct = false) => {
  check(Array.isArray(value), field);
  value.forEach((item, index) => check(nonEmptyString(item), `${field}.${index}`));
  if (distinct) check(new Set(value).size === value.length, field);
};
const validateKeys = (value, columns) => {
  check(isPlainObject(value), 'input');
  for (const key of Object.keys(value)) check(columns.includes(key), key);
};

// JSON.stringify otherwise drops undefined/functions and changes non-finite numbers.
// Keep opaque plans and future ticks keys intact by refusing lossy values before writing.
const validateJson = (value, field, ancestors = []) => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    check(Number.isFinite(value), field);
    return;
  }
  check(Array.isArray(value) || isPlainObject(value), field);
  check(!ancestors.includes(value), field);
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [key, item] of entries) validateJson(item, `${field}.${key}`, [...ancestors, value]);
};

const validateDraft = (draft) => {
  for (const field of ['programme_id', 'group_id']) check(nonEmptyString(draft[field]), field);
  for (const field of ['class_id', 'pack_id']) {
    check(draft[field] === null || nonEmptyString(draft[field]), field);
  }
  check(draft.language_code === null || isLanguageCode(draft.language_code), 'language_code');
  if (draft.class_id === null) check(draft.language_code === null, 'language_code');
  if (draft.class_id === null || draft.language_code === null) check(draft.pack_id === null, 'pack_id');
  try { parseDateKey(draft.lesson_date); } catch { check(false, 'lesson_date'); }
  check(draft.notes === null || typeof draft.notes === 'string', 'notes');
  check(draft.plan === null || isPlainObject(draft.plan), 'plan');
  check(draft.plan_fixed_at === null || isIsoTime(draft.plan_fixed_at), 'plan_fixed_at');

  check(isPlainObject(draft.attendance), 'attendance');
  for (const key of ['childIds', 'absentChildIds', 'addedChildIds']) {
    stringArray(draft.attendance[key], `attendance.${key}`, true);
  }
  for (const key of ['absentChildIds', 'addedChildIds']) {
    check(draft.attendance[key].every((id) => draft.attendance.childIds.includes(id)), `attendance.${key}`);
  }

  check(isPlainObject(draft.ticks), 'ticks');
  for (const key of ['letters', 'blends']) stringArray(draft.ticks[key], `ticks.${key}`);
  check(Array.isArray(draft.ticks.books), 'ticks.books');
  draft.ticks.books.forEach((book, index) => {
    const field = `ticks.books.${index}`;
    check(isPlainObject(book), field);
    check(nonEmptyString(book.id), `${field}.id`);
    check(['printed', 'app'].includes(book.how), `${field}.how`);
  });

  check(isPlainObject(draft.tracker_changes), 'tracker_changes');
  for (const [childId, letters] of Object.entries(draft.tracker_changes)) {
    const childField = `tracker_changes.${childId}`;
    check(nonEmptyString(childId) && isPlainObject(letters), childField);
    check(draft.language_code !== null, childField);
    for (const [letter, mark] of Object.entries(letters)) {
      const field = `${childField}.${letter}`;
      check(nonEmptyString(letter) && isPlainObject(mark), field);
      check(typeof mark.mastered === 'boolean', `${field}.mastered`);
      check(isLanguageCode(mark.languageCode) && mark.languageCode === draft.language_code, `${field}.languageCode`);
      check(isIsoTime(mark.madeAt), `${field}.madeAt`);
    }
  }
  check(isPlainObject(draft.reading_level_changes), 'reading_level_changes');
  for (const [childId, level] of Object.entries(draft.reading_level_changes)) {
    check(nonEmptyString(childId) && READING_LEVELS.includes(level), `reading_level_changes.${childId}`);
  }
  for (const field of JSON_COLUMNS) validateJson(draft[field], field);
};

const decodeDraft = (row) => {
  if (!row) return null;
  const { slot, ...draft } = row;
  const unreadable = Symbol('unreadable');
  const fields = [];
  for (const field of JSON_COLUMNS) {
    if (field === 'plan' && row[field] === null) continue;
    draft[field] = decodeJson(row[field], unreadable);
    if (draft[field] === unreadable) fields.push(field);
  }
  if (fields.length) throw new LessonDraftCorruptError(row.id, fields);
  return draft;
};
const encodeColumn = (field, value) => JSON_COLUMNS.includes(field) ? encodeJson(value) : value;

// Object key order does not change an opaque plan's value.
const sameValue = (left, right) => {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => (
    Object.prototype.hasOwnProperty.call(right, key) && sameValue(left[key], right[key])
  ));
};

const checkFixedContext = (draft, patch) => {
  const fixed = ['id', 'programme_id', 'group_id', 'session_id'];
  if (draft.class_id !== null) fixed.push('class_id');
  if (draft.language_code !== null) fixed.push('language_code', 'pack_id');
  if (draft.plan_fixed_at !== null) fixed.push('plan', 'plan_fixed_at');
  for (const field of fixed) {
    if (Object.prototype.hasOwnProperty.call(patch, field) && !sameValue(draft[field], patch[field])) {
      throw new LessonDraftContextError(field);
    }
  }
};

export const presentChildIds = (attendance) => attendance.childIds.filter(
  (id) => !attendance.absentChildIds.includes(id)
);

export const createLessonDraftsRepository = ({ database, idFactory = uuidv4 } = {}) => {
  const getActive = async () => {
    const db = await resolveDatabase(database);
    return decodeDraft(await db.getFirstAsync('select * from lesson_drafts limit 1'));
  };

  const create = (input) => runRepositoryTransaction(database, async (txn) => {
    const existing = await txn.getFirstAsync('select id from lesson_drafts limit 1');
    if (existing) throw new LessonDraftExistsError(existing.id);
    validateKeys(input, INPUT_COLUMNS);
    const now = timestamp();
    const draft = {
      class_id: null, language_code: null, pack_id: null,
      attendance: { childIds: [], absentChildIds: [], addedChildIds: [] },
      plan: null, plan_fixed_at: null, ticks: { letters: [], blends: [], books: [] },
      tracker_changes: {}, reading_level_changes: {}, notes: null,
      ...input,
    };
    validateDraft(draft);
    const row = { id: idFactory(), session_id: idFactory(), ...draft, created_at: now, updated_at: now };
    const columns = Object.keys(row);
    await txn.runAsync(
      `insert into lesson_drafts (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
      ...columns.map((field) => encodeColumn(field, row[field]))
    );
    return decodeDraft(await txn.getFirstAsync('select * from lesson_drafts where id = ?', row.id));
  });

  const update = (id, patch) => runRepositoryTransaction(database, async (txn) => {
    const row = await txn.getFirstAsync('select * from lesson_drafts where id = ?', id);
    if (!row) throw new LessonDraftNotFoundError(id);
    const draft = decodeDraft(row);
    validateKeys(patch, [...INPUT_COLUMNS, 'id', 'session_id']);
    checkFixedContext(draft, patch);
    validateDraft({ ...draft, ...patch });
    const columns = Object.keys(patch);
    await txn.runAsync(
      `update lesson_drafts set ${[...columns.map((field) => `${field} = ?`), 'updated_at = ?'].join(', ')} where id = ?`,
      ...columns.map((field) => encodeColumn(field, patch[field])), timestamp(), id
    );
    return decodeDraft(await txn.getFirstAsync('select * from lesson_drafts where id = ?', id));
  });

  const discard = (id, { transaction } = {}) => {
    const remove = async (txn) => {
      const result = await txn.runAsync('delete from lesson_drafts where id = ?', id);
      return result.changes > 0;
    };
    return transaction ? remove(transaction) : runRepositoryTransaction(database, remove);
  };

  return { getActive, create, update, discard };
};

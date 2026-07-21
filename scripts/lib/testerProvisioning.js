const SQLITE_PROJECT_ID = 'segygjzpujphwvrubusm';
const SQLITE_PROJECT_URL = `https://${SQLITE_PROJECT_ID}.supabase.co`;

const REQUIRED_ENV = [
  'SUPABASE_PROJECT_ID_SQLITE',
  'SUPABASE_PROJECT_URL_SQLITE',
  'SUPABASE_SECRET_KEY_SQLITE',
];

const ZERO_CLASS_ASSIGNMENT_TABLES = [
  { table: 'class_ea_assignments', userColumn: 'ea_user_id' },
  { table: 'child_ea_assignments', userColumn: 'user_id' },
  { table: 'group_ea_assignments', userColumn: 'ea_user_id' },
];

const validateTesterProvisioningEnv = (env) => {
  for (const key of REQUIRED_ENV) {
    if (!env[key]) {
      throw new Error(`${key} is required for SQLite tester provisioning.`);
    }
  }

  if (env.SUPABASE_PROJECT_ID_SQLITE !== SQLITE_PROJECT_ID) {
    throw new Error(
      `SUPABASE_PROJECT_ID_SQLITE must be ${SQLITE_PROJECT_ID} for tester provisioning.`
    );
  }

  if (env.SUPABASE_PROJECT_URL_SQLITE.replace(/\/+$/, '') !== SQLITE_PROJECT_URL) {
    throw new Error(`SUPABASE_PROJECT_URL_SQLITE must be ${SQLITE_PROJECT_URL}.`);
  }

  return env;
};

const required = (value, field, rowNumber) => {
  if (!value) throw new Error(`Line ${rowNumber}: missing ${field}`);
};

const normalizeTesterRows = (rows) => rows.map((row, index) => {
  const rowNumber = index + 2;
  const normalized = {
    email: row.email?.trim().toLowerCase(),
    password: row.password?.trim(),
    first_name: row.first_name?.trim(),
    last_name: (row.last_name || row.surname)?.trim(),
    job_title_code: row.job_title_code?.trim(),
    school_uid: row.school_uid?.trim(),
    programme_code: row.programme_code?.trim(),
    tester_type: row.tester_type?.trim(),
    __line: rowNumber,
  };

  [
    'email',
    'password',
    'first_name',
    'last_name',
    'job_title_code',
    'school_uid',
    'programme_code',
    'tester_type',
  ].forEach((field) => required(normalized[field], field, rowNumber));

  if (normalized.tester_type !== 'zero_class') {
    throw new Error(
      `Line ${rowNumber}: tester_type must be zero_class. `
      + 'Seeded rosters must come from the canonical Head Office importer.'
    );
  }

  return normalized;
});

const validateZeroClassAssignments = (assignmentsByTable) => {
  for (const { table } of ZERO_CLASS_ASSIGNMENT_TABLES) {
    if ((assignmentsByTable[table] || []).length > 0) {
      throw new Error(
        `Refusing zero_class provisioning because the user has an active ${table} row.`
      );
    }
  }
  return true;
};

const validateActiveProgrammeAssignments = (assignments, expected) => {
  if (assignments.length > 1) {
    throw new Error(
      'Refusing provisioning because the user has multiple active Programme assignments.'
    );
  }

  const existing = assignments[0] || null;
  if (
    existing
    && (existing.programme_id !== expected.programmeId || existing.school_id !== expected.schoolId)
  ) {
    throw new Error(
      'Existing active Programme assignment does not match the requested programme/school; '
      + 'refusing to reassign implicitly.'
    );
  }
  return existing;
};

module.exports = {
  SQLITE_PROJECT_ID,
  SQLITE_PROJECT_URL,
  ZERO_CLASS_ASSIGNMENT_TABLES,
  normalizeTesterRows,
  validateActiveProgrammeAssignments,
  validateZeroClassAssignments,
  validateTesterProvisioningEnv,
};

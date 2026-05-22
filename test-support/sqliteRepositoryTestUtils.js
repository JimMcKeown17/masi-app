const { createBetterSqliteTestDatabase } = require('./betterSqliteAdapter');

async function createMigratedDatabase(runMigrations) {
  const db = createBetterSqliteTestDatabase();
  await runMigrations(db);
  return db;
}

async function seedCoreData(db, { includeStaffProgrammeAssignment = true } = {}) {
  await db.runAsync("insert into schools (id, name) values ('school-1', 'Masi Primary')");
  await db.runAsync("insert into programmes (id, code, name) values ('programme-a', 'literacy', 'Literacy')");
  await db.runAsync("insert into programmes (id, code, name) values ('programme-b', 'numeracy', 'Numeracy')");
  await db.runAsync(`
    insert into academic_years (id, label, starts_on, ends_on, is_active)
    values ('year-2026', '2026', '2026-01-15', '2026-12-15', 1)
  `);
  if (includeStaffProgrammeAssignment) {
    await db.runAsync(`
      insert into staff_programme_assignments (
        id,
        user_id,
        programme_id,
        school_id,
        assigned_at
      )
      values (
        'spa-user-1',
        'user-1',
        'programme-a',
        'school-1',
        '2026-01-15T00:00:00.000Z'
      )
    `);
  }
  await db.runAsync(`
    insert into classes (
      id,
      school_id,
      name,
      grade,
      academic_year_id,
      created_by
    )
    values (
      'class-1',
      'school-1',
      'Grade 1A',
      '1',
      'year-2026',
      'user-1'
    )
  `);
}

module.exports = {
  createMigratedDatabase,
  seedCoreData,
};

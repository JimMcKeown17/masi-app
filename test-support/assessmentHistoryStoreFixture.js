import { runMigrations } from '../src/db/migrations';
import { createMigratedDatabase, seedCoreData } from './sqliteRepositoryTestUtils';
import { createHistoryServer } from './assessmentHistoryServer';
import { PROGRAMME, CHILD } from './assessmentHistoryFixtures';
import { createAssessmentHistoryStates } from '../src/services/assessmentHistoryPull';
import { createAssessmentHistoryStore } from '../src/services/assessmentHistoryStatus';
import { createReferenceDataRepository } from '../src/db/repositories/referenceDataRepository';
import { createLocalStateRepository } from '../src/db/repositories/localStateRepository';
import { pullReferenceData } from '../src/services/offlineSync';

export const createHistoryStoreFixture = async () => {
  const db = await createMigratedDatabase(runMigrations);
  await seedCoreData(db);
  await db.runAsync("insert into programmes (id, code, name) values (?, 'history', 'History')", PROGRAMME);
  await db.runAsync('update staff_programme_assignments set programme_id = ?', PROGRAMME);
  await db.runAsync("insert into children (id, first_name, last_name) values (?, 'Local', 'Child')", CHILD);
  const server = createHistoryServer();
  const tableNames = ['schools', 'job_titles', 'programmes', 'academic_years',
    'assessment_windows', 'teachers', 'staff_programme_assignments'];
  const referenceRows = {}, referenceRepositories = {}, referenceErrors = {};
  for (const tableName of tableNames) {
    referenceRows[tableName] = await db.getAllAsync('select * from ' + tableName);
    referenceRepositories[tableName] = createReferenceDataRepository({ database: db, tableName });
  }
  server.client.from = jest.fn(table => {
    const builder = {
      select: () => builder, eq: () => builder,
      then: (resolve, reject) => Promise.resolve({
        data: referenceErrors[table] ? null : referenceRows[table],
        error: referenceErrors[table] || null,
      }).then(resolve, reject),
    };
    return builder;
  });
  const refreshReferenceData = jest.fn(() => pullReferenceData({
    userId: 'user-1', supabaseClient: server.client, enqueueRequest: task => task(),
    repositories: referenceRepositories, localStateRepository: createLocalStateRepository({ database: db }),
    barrier,
  }));
  const barrier = {};
  const referenceDataReady = jest.fn(async () => {});
  const makeStore = extra => createAssessmentHistoryStore({
    database: db, states: createAssessmentHistoryStates(), client: server.client,
    enqueueRequest: task => task(), referenceDataReady, refreshReferenceData, ...extra,
  });
  return { db, server, referenceRows, referenceErrors, referenceDataReady, refreshReferenceData, makeStore };
};

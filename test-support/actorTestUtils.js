import path from 'path';
import { createBetterSqliteTestDatabase } from './betterSqliteAdapter';
import { registerConnectionActor, requestOpen } from '../src/session/signedInHandle';

export const TEST_ACTOR_ID = '00000000-0000-4000-8000-0000000000aa';
export const bindTestActor = (db, userId = TEST_ACTOR_ID) => {
  registerConnectionActor(db, userId);
  return db;
};
export const openTestHandle = ({ userId = TEST_ACTOR_ID, openDatabase } = {}) => (
  requestOpen({ userId, openDatabase })
);
export const createPathDatabaseOpener = (dir) => async (name) => (
  createBetterSqliteTestDatabase(path.join(dir, name), { honorQueryOnly: true })
);

import fs from 'fs';
import {
  requestOpen, requestClose, whenDisposed, resetHandleRegistryForTests,
} from '../../src/session/signedInHandle';
import { createChildrenRepository } from '../../src/db/repositories/childrenRepository';
import * as engine from '../../test-support/expoSQLiteRealEngine';

global.__MASI_NO_DEFAULT_HANDLE__ = true;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const connections = [];
const files = new Map();
const openDatabase = async (name, options) => {
  const db = await engine.openDatabaseAsync(name, options);
  connections.push({ name, db });
  files.set(name, (await db.getAllAsync('PRAGMA database_list'))[0].file);
  return db;
};

beforeEach(async () => {
  await resetHandleRegistryForTests();
  await engine.__resetMockDatabases();
  connections.length = 0;
  files.clear();
});
afterEach(async () => {
  await requestClose({ reason: 'test' });
  await Promise.all([...files.keys()].map((name) => whenDisposed(name)));
  await resetHandleRegistryForTests();
  await engine.__resetMockDatabases();
});

test('A → B → A preserves A’s child and unsent work in separate durable files', async () => {
  expect(engine.__usesRealEngine).toBe(true);
  const a = await requestOpen({ userId: A, openDatabase });
  await a.withTransaction((txn) => txn.runAsync(
    "insert into programmes (id, code, name) values ('literacy', 'literacy', 'Literacy')"
  ));
  const childrenA = createChildrenRepository({ database: a });
  await childrenA.save({
    id: 'handle-child', first_name: 'Test', last_name: 'Child',
    programme_id: 'literacy', created_by: A,
  }, { actorUserId: A });
  const unsentBefore = await (await a.getReader()).getAllAsync('select * from sync_outbox order by id');
  expect(unsentBefore).toEqual(expect.arrayContaining([
    expect.objectContaining({ table_name: 'children', record_id: 'handle-child', status: 'pending', owner_user_id: A }),
  ]));
  await requestClose({ reason: 'switch' });
  await whenDisposed(a.fileName);
  expect(connections.filter(({ name }) => name === a.fileName)).toHaveLength(2);
  expect(connections.filter(({ name }) => name === a.fileName).map(({ db }) => db.isOpen)).toEqual([false, false]);

  const b = await requestOpen({ userId: B, openDatabase });
  expect(await createChildrenRepository({ database: b }).getChildren()).toEqual([]);
  expect(await (await b.getReader()).getAllAsync('select * from sync_outbox')).toEqual([]);
  expect(fs.existsSync(files.get(a.fileName))).toBe(true);
  expect(engine.deleteDatabaseAsync).not.toHaveBeenCalled();
  await requestClose({ reason: 'switch back' });
  await whenDisposed(b.fileName);
  expect(connections.filter(({ name }) => name === b.fileName)).toHaveLength(2);
  expect(connections.filter(({ name }) => name === b.fileName).map(({ db }) => db.isOpen)).toEqual([false, false]);

  const again = await requestOpen({ userId: A, openDatabase });
  expect(await createChildrenRepository({ database: again }).getChildren()).toEqual([
    expect.objectContaining({ id: 'handle-child', first_name: 'Test', created_by: A }),
  ]);
  expect(await (await again.getReader()).getAllAsync('select * from sync_outbox order by id')).toEqual(unsentBefore);
  expect(engine.openDatabaseAsync.mock.calls.map(([name]) => name)).not.toContain('masi.db');
  await requestClose({ reason: 'done' });
  await whenDisposed(again.fileName);
  expect(connections.map(({ db }) => db.isOpen)).toEqual([false, false, false, false, false, false]);
});

const { openDatabaseAsync } = require('expo-sqlite');
Object.defineProperty(exports, 'TEST_ACTOR_ID', { get: () => require('./actorTestUtils').TEST_ACTOR_ID });
const connections = new WeakMap();
exports.openDefaultTestHandle = async () => {
  const { TEST_ACTOR_ID } = require('./actorTestUtils');
  const lifecycle = require('../src/session/signedInHandle');
  const current = lifecycle.getCurrentHandle();
  if (current) return current;
  let writer; let reader;
  const handle = await lifecycle.requestOpen({ userId: TEST_ACTOR_ID, openDatabase: async (name, options) => {
    const connection = await openDatabaseAsync(name, options);
    if (options?.useNewConnection) reader = connection; else writer = connection;
    return connection;
  } });
  connections.set(handle, { writer, reader });
  if (!global.__MASI_NO_DEFAULT_HANDLE__) require('../src/db/repositories/repositoryRuntime').enableAmbientHandleForTests(lifecycle.requireCurrentHandle);
  return handle;
};
exports.closeDefaultTestHandle = async () => {
  await require('../src/session/signedInHandle').resetHandleRegistryForTests();
};
exports.getTestWriter = async () => {
  const handle = await exports.openDefaultTestHandle();
  return connections.get(handle).writer;
};
exports.getTestReader = async () => {
  const handle = await exports.openDefaultTestHandle();
  return connections.get(handle).reader;
};
exports.initializeTestDatabase = exports.getTestWriter;
exports.withTestTransaction = async (task) => (await exports.openDefaultTestHandle()).withTransaction(task);
exports.withTestDatabaseAccess = exports.withTestTransaction;

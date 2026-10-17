import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

global.__MASI_NO_DEFAULT_HANDLE__ = true;

const root = path.resolve(__dirname, '..');
// Actor-lifecycle spec §5.1a: every entry needs an ownership treatment, not just
// permission to remain global. Keep this inventory exact so removed state also
// loses its exception. Factory-local state is owned by the factory's caller.
const ALLOWLIST = {
  'src/services/installId.js:pending': 'device-level install id; one per phone, never per EA',
  'src/services/authSessionStorage.js:admittedUser': 'device-level auth admission owned by AuthContext',
  'src/services/observability.js:initialized': 'device-level',
  'src/services/observability.js:enabled': 'device-level',
  'src/services/observability.js:runtimeContext': 'device-level',
  'src/services/observability.js:navigationIntegration': 'device-level',
  'src/services/observability.js:reportedSyncIssueKeys': "keys include the actor's user id",
  'src/services/observability.js:operationalErrorTimes': "keys include the actor's user id",
  // These sets contain fixed table/column names, never an EA's runtime data.
  'src/services/offlineSync.js:BATCHABLE_UPSERT_TABLES': 'device-level fixed sync policy',
  'src/services/offlineSync.js:IMMUTABLE_ASSIGNMENT_TABLES': 'device-level fixed sync policy',
  'src/services/offlineSync.js:UPDATE_PATCH_EXCLUDED_COLUMNS': 'device-level fixed sync policy',
  'src/services/offlineSync.js:UPDATE_BY_ID_TABLES': 'device-level fixed sync policy',
  'src/db/migrations.js:explicitDatabaseMigrationQueues': 'per connection',
  // Both registration and lookup require NODE_ENV=test; production cannot use it.
  'src/db/repositories/repositoryRuntime.js:ambientHandleForTests': 'device-level test harness adapter; inert outside NODE_ENV=test',
  'src/session/signedInHandle.js:currentHandle': 'the handle registry',
  'src/session/signedInHandle.js:generation': 'the handle registry',
  'src/session/signedInHandle.js:epoch': 'the handle registry',
  'src/session/signedInHandle.js:transition': 'the handle registry',
  'src/session/signedInHandle.js:latestRequest': 'the handle registry',
  'src/session/signedInHandle.js:latestAuthSession': 'the handle registry',
  'src/session/signedInHandle.js:connectionActors': 'per connection',
  'src/session/signedInHandle.js:subscribers': 'the handle registry',
  'src/session/signedInHandle.js:generationWaiters': 'the handle registry',
  'src/session/signedInHandle.js:disposals': 'the handle registry; keyed by EA database file',
  'src/session/signedInHandle.js:fileReaders': 'the handle registry; keyed by database file, settled read tails removed, drained and cleared on test reset',
  'src/session/signedInHandle.js:failedFiles': 'the handle registry; keyed by EA database file',
  'src/session/signedInHandle.js:revocations': 'the handle registry; keyed by handle',
};

const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? files(file) : file.endsWith('.js') ? [file] : [];
});

test('T16: module-scoped state has an explicit actor-lifecycle treatment', () => {
  const found = [];
  for (const file of ['src/services', 'src/db', 'src/session'].flatMap(dir => files(path.join(root, dir)))) {
    const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
    traverse(ast, {
      VariableDeclarator(declaration) {
        const { init } = declaration.node;
        const mutableBinding = ['let', 'var'].includes(declaration.parent.kind);
        const mutableCollection = init?.type === 'NewExpression'
          && ['Map', 'Set', 'WeakMap'].includes(init.callee.name);
        if (!mutableBinding && !mutableCollection) return;

        // Binding scope handles exports, destructuring, multiple declarators and
        // module-scoped var inside a block, without counting function-local state.
        for (const name of Object.keys(declaration.get('id').getBindingIdentifiers())) {
          if (!declaration.scope.getBinding(name)?.scope.path.isProgram()) continue;
          found.push(`${path.relative(root, file).replace(/\\/g, '/')}:${name}`);
        }
      },
    });
  }

  const violations = found.filter(key => !Object.prototype.hasOwnProperty.call(ALLOWLIST, key))
    .map(key => `${key}: missing ownership treatment (CONCERN until reviewed)`);
  for (const [key, treatment] of Object.entries(ALLOWLIST)) {
    if (!found.includes(key)) violations.push(`${key}: obsolete allowlist entry`);
    if (typeof treatment !== 'string' || !treatment.trim()) violations.push(`${key}: empty treatment`);
  }
  expect(violations.sort()).toEqual([]);
});

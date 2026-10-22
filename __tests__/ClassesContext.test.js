import { getTestWriter } from '../test-support/testDatabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { childrenRepository } from '../src/db/repositories/childrenRepository';
import { classesRepository } from '../src/db/repositories/classesRepository';
import { schoolsRepository } from '../src/db/repositories/referenceDataRepository';
import { resolveDatabase } from '../src/db/repositories/repositoryRuntime';

// We test the repository operations that ClassesContext depends on,
// since the context itself requires multiple providers (Auth, Offline, Children).
// Full integration tests would need a test wrapper with all providers.

const seedReferenceData = async () => {
  const db = await getTestWriter();
  await db.runAsync(
    "insert into programmes (id, code, name, is_active, sync_status) values ('programme-a', 'literacy', 'Literacy', 1, 'synced')"
  );
  await db.runAsync(
    "insert into staff_programme_assignments (id, user_id, programme_id, assigned_at) values ('spa-user-1', 'user-1', 'programme-a', '2026-01-01T00:00:00.000Z')"
  );
  await db.runAsync(
    "insert into schools (id, name, sync_status) values ('school-1', 'School One', 'synced')"
  );
};

beforeEach(async () => {
  await AsyncStorage.clear();
  await seedReferenceData();
});

describe('ClassesContext repository operations', () => {
  test('addClass creates a class with correct fields', async () => {
    const classData = {
      id: 'class-1',
      name: '1A',
      school_id: 'school-1',
      grade: 'Grade 1',
      teacher: 'Ms. Smith',
      home_language: 'isiXhosa',
      staff_id: 'user-1',
      created_by: 'user-1',
      programme_id: 'programme-a',
      synced: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await classesRepository.saveClass(classData);

    const classes = await classesRepository.getClasses();
    expect(classes).toHaveLength(1);
    expect(classes[0].synced).toBe(false);
    expect(classes[0].staff_id).toBeUndefined();
    expect(classes[0].created_by).toBe('user-1');
    expect(classes[0].school_id).toBe('school-1');
  });

  test('deleteClass nulls out class_id on affected children in SQLite', async () => {
    // Set up a class and two children — one in the class, one not
    await classesRepository.saveClass({
      id: 'class-1',
      name: '1A',
      school_id: 'school-1',
      grade: '1',
      created_by: 'user-1',
      programme_id: 'programme-a',
      synced: false,
    });
    await classesRepository.saveClass({
      id: 'other-class',
      name: '1B',
      school_id: 'school-1',
      grade: '1',
      created_by: 'user-1',
      programme_id: 'programme-a',
      synced: false,
    });

    const child1 = {
      id: 'child-1',
      first_name: 'Alice',
      last_name: 'A',
      class_id: 'class-1',
      synced: true,
    };
    const child2 = {
      id: 'child-2',
      first_name: 'Bob',
      last_name: 'B',
      class_id: 'other-class',
      synced: true,
    };
    await childrenRepository.saveChildRecord(child1);
    await childrenRepository.saveChildRecord(child2);

    // Delete the class
    await classesRepository.deleteClass('class-1', { actorUserId: 'user-1' });

    const children = await childrenRepository.getChildren();
    const alice = children.find(c => c.id === 'child-1');
    const bob = children.find(c => c.id === 'child-2');

    expect(alice.class_id).toBeNull();
    expect(alice.synced).toBe(false);
    expect(bob.class_id).toBe('other-class'); // unaffected
    expect(bob.synced).toBe(true);
  });

  test('loadSchools returns cached schools when available', async () => {
    const schools = [
      { id: 's1', name: 'School A' },
      { id: 's2', name: 'School B' },
    ];
    await schoolsRepository.replaceFromServer(schools);

    const cached = await schoolsRepository.getAll();
    expect(cached.map(({ id, name }) => ({ id, name }))).toEqual([
      ...schools,
      { id: 'school-1', name: 'School One' },
    ]);
  });

  test('classes list updates after saveClass', async () => {
    await classesRepository.saveClass({
      id: 'c1',
      name: '1A',
      school_id: 'school-1',
      grade: '1',
      created_by: 'user-1',
      programme_id: 'programme-a',
      synced: false,
    });
    let classes = await classesRepository.getClasses();
    expect(classes).toHaveLength(1);

    await classesRepository.saveClass({
      id: 'c2',
      name: '2B',
      school_id: 'school-1',
      grade: '2',
      created_by: 'user-1',
      programme_id: 'programme-a',
      synced: false,
    });
    classes = await classesRepository.getClasses();
    expect(classes).toHaveLength(2);
    expect(classes.map(c => c.name)).toEqual(['1A', '2B']);
  });
});

// Exercise the provider trigger through a real persisted class pull, in addition to
// this file's existing repository-only cases.
describe('ClassesContext assessment history trigger', () => {
  const React = require('react');
  const { renderHook, waitFor } = require('@testing-library/react-native');
  const { ClassesProvider, useClasses } = require('../src/context/ClassesContext');
  const { SignedInEAContext } = require('../src/context/SignedInEAContext');
  const { requireCurrentHandle } = require('../src/session/signedInHandle');
  let start, online, failed, services, handle;
  const query = result => {
    const builder = { select: () => builder, eq: () => builder, is: () => builder,
      order: () => builder, limit: () => builder, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    return builder;
  };
  const wrapper = ({ children }) => React.createElement(SignedInEAContext.Provider, {
    value: { handle, services, repositories: requireCurrentHandle().repositories },
  }, React.createElement(ClassesProvider, null, children));

  beforeEach(() => {
    start = jest.fn(async () => null);
    online = true; failed = false;
    const actual = requireCurrentHandle();
    services = { referenceDataReady: async () => {}, fetchAndCacheSchools: async () => [],
      assessmentHistory: { start } };
    handle = { isCurrent: () => true, enqueueRequest: task => task(), dataClient: {
      from: table => query({ data: table === 'staff_programme_assignments' ? [{ programme_id: 'programme-a' }]
        : table === 'classes' ? [{
          id: 'class-server', school_id: 'school-1', name: 'Server Class', grade: '1',
          class_ea_assignments: [{ id: 'class-ea-server', class_id: 'class-server', ea_user_id: actual.userId, programme_id: 'programme-a' }],
        }] : [],
        error: failed ? { message: 'Network request failed' } : null }),
      rpc: async () => ({ data: null, error: { message: 'ack unavailable' } }),
    } };
    jest.spyOn(require('../src/context/AuthContext'), 'useAuth').mockImplementation(() => ({ user: { id: actual.userId } }));
    jest.spyOn(require('../src/context/OfflineContext'), 'useOffline').mockImplementation(() => ({
      isOnline: online, isSyncing: false, domainPullNonce: 0, refreshSyncStatus: async () => {},
    }));
    jest.spyOn(require('../src/context/ChildrenContext'), 'useChildren').mockReturnValue({
      children: [], refreshFromCache: async () => {},
    });
  });
  afterEach(() => jest.restoreAllMocks());

  test('a persisted class pull starts assessment history once', async () => {
    // The authoritative local programme survives an unavailable acknowledgement.
    await (await getTestWriter()).runAsync('update staff_programme_assignments set user_id = ?', requireCurrentHandle().userId);
    const { result } = renderHook(useClasses, { wrapper });
    await waitFor(() => expect(result.current.classes.map(row => row.id)).toContain('class-server'));
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith();
    expect(await (await getTestWriter()).getFirstAsync("select sync_status from class_ea_assignments where id = 'class-ea-server'"))
      .toEqual({ sync_status: 'synced' });
  });

  test.each(['failed', 'offline'])('a failed or offline class pull does not (%s)', async mode => {
    failed = mode === 'failed'; online = mode !== 'offline';
    const { result } = renderHook(useClasses, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(start).not.toHaveBeenCalled();
  });
});

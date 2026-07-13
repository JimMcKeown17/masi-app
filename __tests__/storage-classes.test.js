import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from '../src/utils/storage';
import { resolveDatabase } from '../src/db/repositories/repositoryRuntime';

// AsyncStorage is auto-mocked in jest-expo

const seedReferenceData = async () => {
  const db = await resolveDatabase();
  await db.runAsync(
    "insert into programmes (id, code, name, is_active, sync_status) values ('programme-a', 'literacy', 'Literacy', 1, 'synced')"
  );
  await db.runAsync(
    "insert into staff_programme_assignments (id, user_id, programme_id, assigned_at) values ('spa-user-1', 'user-1', 'programme-a', '2026-01-01T00:00:00.000Z')"
  );
};

beforeEach(async () => {
  await AsyncStorage.clear();
  await seedReferenceData();
});

describe('Classes storage (offline-first CRUD)', () => {
  const makeClass = (overrides = {}) => ({
    id: 'class-1',
    name: '1A',
    grade: 'Grade 1',
    teacher: 'Ms. Smith',
    home_language: 'isiXhosa',
    school_id: 'school-1',
    staff_id: 'user-1',
    created_by: 'user-1',
    synced: false,
    ...overrides,
  });

  test('getClasses returns empty array when no data', async () => {
    const result = await storage.getClasses();
    expect(result).toEqual([]);
  });

  test('saveClass persists a class and getClasses retrieves it', async () => {
    const cls = makeClass();
    await storage.saveClass(cls);
    const result = await storage.getClasses();
    expect(result).toHaveLength(1);
    // Facade reads surface the repository's sync_status alongside the payload
    // fields (issue #42: sync state must come from the repo row, not a stale
    // payload copy).
    expect(result[0]).toEqual({ ...cls, sync_status: 'pending' });
  });

  test('saveClass appends to existing classes', async () => {
    await storage.saveClass(makeClass({ id: 'c1' }));
    await storage.saveClass(makeClass({ id: 'c2', name: '2B' }));
    const result = await storage.getClasses();
    expect(result).toHaveLength(2);
  });

  test('updateClass modifies an existing class', async () => {
    await storage.saveClass(makeClass());
    await storage.updateClass('class-1', { teacher: 'Mr. Jones' });
    const result = await storage.getClasses();
    expect(result[0].teacher).toBe('Mr. Jones');
    expect(result[0].name).toBe('1A'); // other fields preserved
  });

  test('updateClass returns false for non-existent id', async () => {
    const result = await storage.updateClass('nonexistent', { name: 'X' });
    expect(result).toBe(false);
  });

  test('deleteClass removes a class', async () => {
    await storage.saveClass(makeClass({ id: 'c1' }));
    await storage.saveClass(makeClass({ id: 'c2' }));
    await storage.deleteClass('c1');
    const result = await storage.getClasses();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c2');
  });

  test('getUnsyncedClasses filters correctly', async () => {
    await storage.saveClass(makeClass({ id: 'c1', synced: false }));
    await storage.saveClass(makeClass({ id: 'c2', synced: true }));
    await storage.saveClass(makeClass({ id: 'c3', synced: false }));
    const result = await storage.getUnsyncedClasses();
    expect(result).toHaveLength(2);
    expect(result.map(c => c.id)).toEqual(['c1', 'c3']);
  });
});

describe('storage facade cleanup', () => {
  test('generic AsyncStorage facade methods and storage keys are no longer public API', () => {
    expect(storage.getItem).toBeUndefined();
    expect(storage.setItem).toBeUndefined();
    expect(storage.removeItem).toBeUndefined();
    expect(storage.STORAGE_KEYS).toBeUndefined();
  });
});

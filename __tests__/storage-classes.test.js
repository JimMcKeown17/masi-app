import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage, STORAGE_KEYS } from '../src/utils/storage';

// AsyncStorage is auto-mocked in jest-expo

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('Schools storage (read-only cache)', () => {
  test('getSchools returns empty array when no data', async () => {
    const result = await storage.getSchools();
    expect(result).toEqual([]);
  });

  test('setSchools stores and getSchools retrieves the list', async () => {
    const schools = [
      { id: 'school-1', name: 'Sunrise Primary' },
      { id: 'school-2', name: 'Hilltop School' },
    ];
    await storage.setSchools(schools);
    const result = await storage.getSchools();
    expect(result).toEqual(schools);
  });

  test('setSchools replaces the entire cache', async () => {
    await storage.setSchools([{ id: 's1', name: 'Old School' }]);
    await storage.setSchools([{ id: 's2', name: 'New School' }]);
    const result = await storage.getSchools();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('New School');
  });
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
    expect(result[0]).toEqual(cls);
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

describe('getAllUnsyncedCount includes CLASSES', () => {
  test('counts unsynced classes in the total', async () => {
    await storage.saveClass({
      id: 'c1', name: '1A', synced: false,
    });
    const count = await storage.getAllUnsyncedCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { childrenRepository } from '../src/db/repositories/childrenRepository';
import { classesRepository } from '../src/db/repositories/classesRepository';
import { schoolsRepository } from '../src/db/repositories/referenceDataRepository';
import { resolveDatabase } from '../src/db/repositories/repositoryRuntime';

// We test the repository operations that ClassesContext depends on,
// since the context itself requires multiple providers (Auth, Offline, Children).
// Full integration tests would need a test wrapper with all providers.

const seedReferenceData = async () => {
  const db = await resolveDatabase();
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

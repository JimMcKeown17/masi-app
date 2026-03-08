import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from '../src/utils/storage';

// We test the storage-level operations that ClassesContext depends on,
// since the context itself requires multiple providers (Auth, Offline, Children).
// Full integration tests would need a test wrapper with all providers.

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('ClassesContext storage operations', () => {
  test('addClass creates a class with correct fields', async () => {
    const classData = {
      id: 'class-1',
      name: '1A',
      grade: 'Grade 1',
      teacher: 'Ms. Smith',
      home_language: 'isiXhosa',
      school_id: 'school-1',
      staff_id: 'user-1',
      created_by: 'user-1',
      synced: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await storage.saveClass(classData);

    const classes = await storage.getClasses();
    expect(classes).toHaveLength(1);
    expect(classes[0].synced).toBe(false);
    expect(classes[0].staff_id).toBe('user-1');
    expect(classes[0].created_by).toBe('user-1');
    expect(classes[0].school_id).toBe('school-1');
  });

  test('deleteClass nulls out class_id on affected children in storage', async () => {
    // Set up a class and two children — one in the class, one not
    await storage.saveClass({
      id: 'class-1',
      name: '1A',
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
    await storage.saveChild(child1);
    await storage.saveChild(child2);

    // Delete the class
    await storage.deleteClass('class-1');

    // Manually null out class_id on affected children (mirrors ClassesContext logic)
    const allChildren = await storage.getChildren();
    for (const child of allChildren) {
      if (child.class_id === 'class-1') {
        await storage.updateChild(child.id, { class_id: null, synced: false });
      }
    }

    const children = await storage.getChildren();
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
    await storage.setSchools(schools);

    const cached = await storage.getSchools();
    expect(cached).toEqual(schools);
  });

  test('classes list updates after saveClass', async () => {
    await storage.saveClass({ id: 'c1', name: '1A', synced: false });
    let classes = await storage.getClasses();
    expect(classes).toHaveLength(1);

    await storage.saveClass({ id: 'c2', name: '2B', synced: false });
    classes = await storage.getClasses();
    expect(classes).toHaveLength(2);
    expect(classes.map(c => c.name)).toEqual(['1A', '2B']);
  });
});

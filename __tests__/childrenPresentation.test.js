import { GRADES } from '../src/constants/options';
import {
  classMonogram, childMetaLine, countLabel, classRowLabel,
} from '../src/utils/childrenPresentation';

const mixed = [{ grade: 'Grade 1' }, { grade: 'Grade R' }];

describe('classMonogram', () => {
  test.each([
    ['ECD', 'ECD'], ['Grade R', 'R'], ['Grade 1', '1'], ['Grade 2', '2'], ['Grade 3', '3'],
  ])('grade code for %s is %s in a mixed-grade list', (grade, code) => {
    expect(classMonogram({ grade, name: 'Sunflowers' }, mixed)).toBe(code);
  });

  test('every GRADES value is covered', () => {
    GRADES.forEach((grade) => expect(classMonogram({ grade, name: 'x y z w' }, mixed)).not.toBe(''));
  });

  test('Grade N strips to N', () => {
    expect(classMonogram({ grade: 'Grade N', name: 'Lions' }, mixed)).toBe('N');
  });

  test('uses the name code when every class shares one grade', () => {
    const all = [{ grade: 'Grade 1' }, { grade: 'Grade 1' }];
    expect(classMonogram({ grade: 'Grade 1', name: 'Grade 1A' }, all)).toBe('1A');
    expect(classMonogram({ grade: 'Grade 1', name: '1b' }, all)).toBe('1B');
    expect(classMonogram({ grade: 'Grade 1', name: 'grade 1c' }, all)).toBe('1C');
  });

  test('falls back to the grade code when the stripped name is longer than 3 characters', () => {
    const all = [{ grade: 'ECD' }, { grade: 'ECD' }];
    expect(classMonogram({ grade: 'ECD', name: 'Sunflowers' }, all)).toBe('ECD');
    expect(classMonogram({ grade: 'Grade R', name: 'Grade R Blue' }, [{ grade: 'Grade R' }])).toBe('R');
  });

  test('a single class counts as "every class shares one grade"', () => {
    expect(classMonogram({ grade: 'Grade 1', name: 'Grade 1A' }, [{ grade: 'Grade 1' }])).toBe('1A');
  });

  test('mixed grades always use the grade code', () => {
    expect(classMonogram({ grade: 'Grade 1', name: '1A' }, mixed)).toBe('1');
  });

  test('a grade outside GRADES is capped at 3 characters; a missing grade gives an empty code', () => {
    expect(classMonogram({ grade: 'Pre-school', name: 'Little Stars' }, mixed)).toBe('PRE');
    expect(classMonogram({ grade: null, name: 'Little Stars' }, mixed)).toBe('');
  });
});

describe('childMetaLine', () => {
  test.each([
    [{ age: 7, gender: 'male' }, 'Age 7 • Male'],
    [{ age: 7, gender: 'F' }, 'Age 7 • Female'],
    [{ age: 7, gender: null }, 'Age 7'],
    [{ age: null, gender: 'female' }, 'Female'],
    [{ age: null, gender: null }, ''],
  ])('%p → %p', (child, expected) => expect(childMetaLine(child)).toBe(expected));
});

describe('countLabel', () => {
  test('singular and plural', () => {
    expect(countLabel(1, 'child', 'children')).toBe('1 child');
    expect(countLabel(0, 'child', 'children')).toBe('0 children');
    expect(countLabel(18, 'group', 'groups')).toBe('18 groups');
  });
});

describe('classRowLabel', () => {
  const base = {
    name: 'Grade 1A', schoolName: 'Charles Duna Primary', grade: 'Grade 1', teacher: 'Ms Ndlovu',
    language: 'isiXhosa', childCount: 18, groupCount: 4, unsynced: false,
  };
  test('synced class', () => {
    expect(classRowLabel(base)).toBe(
      'Grade 1A, Charles Duna Primary, Grade 1, Ms Ndlovu, isiXhosa, 18 children, 4 groups. Open class'
    );
  });
  test('singulars and unsynced', () => {
    expect(classRowLabel({ ...base, childCount: 1, groupCount: 1, unsynced: true })).toBe(
      'Grade 1A, Charles Duna Primary, Grade 1, Ms Ndlovu, isiXhosa, 1 child, 1 group, unsynced. Open class'
    );
  });
});

import { getGenderLabel } from '../constants/options';

const stripGrade = (value) => String(value ?? '').trim().replace(/^grade\s+/i, '').trim().toUpperCase();
const gradeCode = (grade) => stripGrade(grade).slice(0, 3);

export function classMonogram(cls, allClasses) {
  const code = gradeCode(cls.grade);
  if (allClasses.length > 0 && allClasses.every((item) => gradeCode(item.grade) === code)) {
    const nameCode = stripGrade(cls.name);
    if (nameCode.length >= 1 && nameCode.length <= 3) return nameCode;
  }
  return code;
}

export function childMetaLine(child) {
  return [child.age ? `Age ${child.age}` : '', getGenderLabel(child.gender)].filter(Boolean).join(' • ');
}

export function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function classRowLabel({ name, schoolName, grade, teacher, language, childCount, groupCount, unsynced }) {
  const parts = [name, schoolName, grade, teacher, language,
    countLabel(childCount, 'child', 'children'), countLabel(groupCount, 'group', 'groups')];
  return `${parts.filter(part => part?.trim()).join(', ')}${unsynced ? ', unsynced' : ''}. Open class`;
}

jest.mock('expo-updates', () => ({ channel: null }));

import { shapePickerModel } from '../src/lessonPlan/inputs/lessonInputs';
import { getGroupDotColor } from '../src/utils/groupHelpers';

const base = { today: '2026-10-22', academicYearStart: '2026-01-15', programmeId: 'programme-a', sessions: [] };
const c1 = { id: 'c1', first_name: 'Amahle', class_id: 'class-1', reading_level: null };
const c2 = { id: 'c2', first_name: 'Lulu', class_id: 'class-1', reading_level: null };
const groups = [{ id: 'g10', name: 'Group 10' }, { id: 'g2', name: 'Group 2' }];
const input = () => ({
  base, groups, membersByGroup: { g10: [c1], g2: [c2] },
  classes: [{ id: 'class-1', home_language: 'English', grade: 'ECD' }],
  children: [c1, c2, { id: 'ungrouped' }],
  childrenGroups: [{ child_id: 'c1', group_id: 'g10' }, { child_id: 'c2', group_id: 'g2' }],
  knownLettersByLanguage: { en: { c1: [], c2: [] } },
  historyByChild: { c1: true, c2: true }, masteryByChild: { c1: true, c2: false },
});

test('picker shape uses numeric group order, groupNumber and stable dot colours', () => {
  const data = input();
  const before = JSON.stringify(data);
  const model = shapePickerModel(data);
  expect(model.rows.map(row => row.groupId)).toEqual(['g2', 'g10']);
  expect(model.rows.map(row => row.number)).toEqual([2, 10]);
  expect(model.rows.map(row => row.dotColor)).toEqual([getGroupDotColor(0), getGroupDotColor(1)]);
  expect(model.rows[0]).toEqual({
    groupId: 'g2', name: 'Group 2', number: 2, dotColor: getGroupDotColor(0),
    members: [{ id: 'c2', firstName: 'Lulu' }], classId: 'class-1', languageCode: 'en', isEcd: true,
    lastSeenOn: null, taughtToday: false, nextLetters: ['a', 'm', 's', 't'], lettersReason: 'first_session',
  });
  expect(model.upNextGroupId).toBe('g2');
  expect(model.ungrouped).toEqual([{ id: 'ungrouped' }]);
  expect(model.historyComplete).toBe(true);
  expect(JSON.stringify(data)).toBe(before);
});

test('dot colour follows compareGroups order even when recency changes the rank', () => {
  const data = input();
  data.base = { ...base, sessions: [{ id: 's', programme_id: 'programme-a', session_date: base.today,
    created_at: base.today, children_ids: ['c2'], activities: {} }] };
  data.groups = [{ ...groups[0], display_number: 8 }, groups[1], { id: 'legacy', name: 'Lions' }];
  const model = shapePickerModel(data);
  expect(model.rows.map(row => row.groupId)).toEqual(['g10', 'legacy', 'g2']);
  expect(model.rows.map(row => row.dotColor)).toEqual([getGroupDotColor(1), getGroupDotColor(2), getGroupDotColor(0)]);
  expect(model.rows.map(row => row.number)).toEqual([8, null, 2]);
  expect(model.rows.find(row => row.groupId === 'legacy').members).toEqual([]);
});

test('picker history is incomplete if any group member is incomplete', () => {
  const data = input();
  data.historyByChild = { c1: true, c2: false };
  expect(shapePickerModel(data).historyComplete).toBe(false);
  expect(shapePickerModel({ ...data, groups: [] }).upNextGroupId).toBeNull();
});

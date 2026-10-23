import React from 'react';
import { Text } from 'react-native';
import { act, cleanupAsync, fireEvent, waitFor } from '@testing-library/react-native';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { AllProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { deferred } from '../test-support/lessonDraftTestUtils';
import { draftStart } from '../test-support/lessonDraftTestUtils';
import * as groupEngine from '../src/lessonPlan/engine/groups';
import * as inputs from '../src/lessonPlan/inputs/lessonInputs';
import LessonPickerScreen from '../src/screens/lessons/LessonPickerScreen';

// The integration setup leaves native icon rendering to each UI suite.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

let handle;
let mockRoster;
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockRoster }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => ({ classes: [
  { id: 'class-1', name: 'Grade 1A' }, { id: 'xh-class', name: 'Xhosa' },
] }) }));
const testPicker = (name, run) => test(name, async () => {
  try { await run(); } finally { await cleanupAsync(); }
});
const wrapper = ({ children }) => <AllProviders>
  <SignedInEAContext.Provider value={{ handle, repositories: handle.repositories, services: handle.services }}>
    {children}
  </SignedInEAContext.Provider>
</AllProviders>;
const Stub = () => <Text>Lesson route</Text>;
const mount = ({ keepMounted = false } = {}) => {
  let pickerNavigation;
  const Picker = props => {
    pickerNavigation = props.navigation;
    return <LessonPickerScreen {...props} />;
  };
  const view = renderInTestStack({ wrapper, initialIndex: 1, keepMounted,
    motion: { tier: 'static', motionLevel: 'still', reduceMotion: true },
    routes: [{ name: 'Home', component: Stub }, { name: 'SessionForm', component: Picker },
      { name: 'Lesson', component: Stub }] });
  return { ...view, getPickerNavigation: () => pickerNavigation };
};
const ready = view => waitFor(() => expect(view.getByRole('button', { name: 'Start lesson' })).toBeTruthy());

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance'] });
  jest.setSystemTime(new Date('2026-10-22T09:00:00.000Z'));
  handle = getDefaultTestHandle();
  const children = [
    { id: 'c1', first_name: 'Amahle', class_id: 'class-1' },
    { id: 'c2', first_name: 'Lulu', class_id: 'class-1' },
    { id: 'c3', first_name: 'Thando', class_id: 'xh-class' },
    { id: 'c4', first_name: 'Unathi', class_id: 'class-1' },
    { id: 'c5', first_name: 'Buhle', class_id: 'class-1' },
  ].map(child => ({ ...child, last_name: 'Child' }));
  const groups = [1, 2, 3].map(n => ({ id: `g${n}`, name: `Group ${n}`,
    programme_id: 'programme-a', class_id: n === 3 ? 'xh-class' : 'class-1' }));
  const childrenGroups = [1, 2, 3].map(n => ({ id: `m${n}`, group_id: `g${n}`, child_id: `c${n}`, removed_at: null }));
  mockRoster = { children, groups, childrenGroups,
    getChildrenInGroup: jest.fn(id => mockRoster.children.filter(child => mockRoster.childrenGroups.some(
      membership => membership.group_id === id && membership.child_id === child.id && !membership.removed_at))),
    makeGroup: jest.fn(async () => ({ success: true, group: { id: 'g4', name: 'Group 4' } })),
    addChildToGroup: jest.fn(async () => ({ success: true })),
  };
  await handle.withTransaction(async db => {
    await seedCoreData(db);
    await db.runAsync('update staff_programme_assignments set user_id = ?', handle.userId);
    await db.runAsync("update classes set home_language = 'English'");
    await db.runAsync("insert into classes (id, school_id, name, grade, academic_year_id, home_language) values ('xh-class', 'school-1', 'Xhosa', '1', 'year-2026', 'isiXhosa')");
    for (const child of children) {
      await db.runAsync("insert into children (id, first_name, last_name, class_id, created_by) values (?, ?, 'Child', ?, ?)",
        child.id, child.first_name, child.class_id, handle.userId);
      await db.runAsync("insert into child_ea_assignments (id, user_id, child_id) values (?, ?, ?)", child.id, handle.userId, child.id);
    }
    for (const group of groups) await db.runAsync(
      'insert into groups (id, name, programme_id, class_id) values (?, ?, ?, ?)', group.id, group.name, group.programme_id, group.class_id);
  });
  for (const [id, childId, date] of [['today', 'c1', '2026-10-22'], ['yesterday', 'c3', '2026-10-21']]) {
    await handle.repositories.sessions.saveSession({ id, user_id: handle.userId, programme_id: 'programme-a',
      session_date: date, children_ids: [childId], activities: { lesson: { version: 1 } }, synced: false });
  }
  await handle.repositories.syncState.setPullState(`session_history_pull:${handle.userId}:programme-a`, {
    cursor: JSON.stringify({ complete: true, lastFailureAt: null, windowStart: '2026-01-15', rescanChildIds: ['c1', 'c2', 'c3'] }),
  });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

testPicker('Up next shows the top-ranked group with its letters and Start lesson opens it', async () => {
  const view = mount();
  await ready(view);
  expect(view.getByText('Up next')).toBeTruthy();
  await waitFor(() => expect(view.getByText('Not seen yet · letters a m s t').props.children).toBe('Not\u00a0seen\u00a0yet ·\u00a0letters\u00a0a\u00a0m\u00a0s\u00a0t'));
  fireEvent.press(view.getByRole('button', { name: 'Start lesson' }));
  await waitFor(() => expect(view.routeNames()).toEqual(['Home', 'SessionForm', 'Lesson']));
  expect(view.navigationRef.getCurrentRoute().params).toEqual({ groupId: 'g2', upNextGroupId: 'g2' });
});
testPicker('other groups follow the ranking; a group taught today reads Today ✓', async () => {
  const view = mount();
  await ready(view);
  const rows = view.getAllByRole('button').filter(row => /^(Thando|Amahle),/.test(row.props.accessibilityLabel));
  expect(rows.map(row => row.props.accessibilityLabel.split(',')[0])).toEqual(['Thando', 'Amahle']);
  await waitFor(() => expect(view.getByText(/^Today ✓ · letters/)).toBeTruthy());
  fireEvent.press(rows[1]);
  await waitFor(() => expect(view.navigationRef.getCurrentRoute().params).toEqual({ groupId: 'g1', upNextGroupId: 'g2' }));
});
testPicker('a lesson in progress replaces the picker with that lesson', async () => {
  const row = await handle.repositories.lessonDrafts.create(draftStart());
  const view = mount();
  await waitFor(() => expect(view.routeNames()).toEqual(['Home', 'Lesson']));
  expect(view.navigationRef.getCurrentRoute().params).toEqual({ draftId: row.id });
});
testPicker('a corrupt draft still opens the Lesson route with its id', async () => {
  const row = await handle.repositories.lessonDrafts.create(draftStart());
  await handle.withTransaction(db => db.runAsync("update lesson_drafts set ticks = 'broken'"));
  const view = mount();
  await waitFor(() => expect(view.routeNames()).toEqual(['Home', 'Lesson']));
  expect(view.navigationRef.getCurrentRoute().params).toEqual({ draftId: row.id });
});
testPicker('Make a group lists only ungrouped children and creates the group', async () => {
  const view = mount();
  await ready(view);
  fireEvent.press(view.getByRole('button', { name: '+ Make a group' }));
  await waitFor(() => expect(view.getAllByRole('checkbox')).toHaveLength(2));
  expect(view.getByRole('button', { name: 'Done' })).toBeDisabled();
  expect(view.queryByRole('checkbox', { name: 'Amahle Child, Grade 1A' })).toBeNull();
  fireEvent.press(view.getByRole('checkbox', { name: 'Unathi Child, Grade 1A' }));
  fireEvent.press(view.getByRole('checkbox', { name: 'Buhle Child, Grade 1A' }));
  fireEvent.press(view.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(mockRoster.makeGroup).toHaveBeenCalledWith(['c4', 'c5']));
  await waitFor(() => expect(view.queryByRole('checkbox')).toBeNull());
});
testPicker('Put in a group adds the child to the chosen group', async () => {
  const view = mount();
  await ready(view);
  fireEvent.press(view.getAllByRole('button', { name: 'Put in a group' })[0]);
  await waitFor(() => expect(view.getByRole('button', { name: 'Lulu' })).toBeTruthy());
  fireEvent.press(view.getByRole('button', { name: 'Lulu' }));
  await waitFor(() => expect(mockRoster.addChildToGroup).toHaveBeenCalledWith('c5', 'g2'));
});
testPicker('incomplete history shows the downloading note', async () => {
  await handle.withTransaction(db => db.runAsync('delete from sync_state'));
  const view = mount();
  await ready(view);
  await waitFor(() => expect(view.getByText('Still downloading past lessons. Suggestions may repeat.')).toBeTruthy());
});
testPicker('the picker computes the ranking once per load', async () => {
  const ranking = jest.spyOn(groupEngine, 'rankGroups');
  const base = jest.spyOn(handle.repositories.sessions, 'getSessions');
  const letters = jest.spyOn(inputs, 'loadPickerLetters');
  const picker = jest.spyOn(inputs, 'loadPickerRanking');
  const view = mount();
  await ready(view);
  expect(base).toHaveBeenCalledTimes(1);
  expect(picker).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(view.getByText(/Not seen yet · letters/)).toBeTruthy());
  expect(letters).toHaveBeenCalledTimes(1);
  expect(letters.mock.calls[0][0].services).toBe(handle.services);
  expect(ranking).toHaveBeenCalledTimes(3); // One ordering pass plus English and isiXhosa.
  expect(ranking.mock.calls.map(([input]) => input.groups.map(group => group.id))).toEqual([
    ['g1', 'g2', 'g3'], ['g1', 'g2'], ['g3'],
  ]);
  fireEvent.press(view.getByRole('button', { name: '+ Make a group' }));
  fireEvent.press(await view.findByRole('checkbox', { name: 'Unathi Child, Grade 1A' }));
  expect(ranking).toHaveBeenCalledTimes(3);
});
testPicker('no groups: only Make a group and the ungrouped list', async () => {
  mockRoster = { ...mockRoster, groups: [], childrenGroups: [] };
  const view = mount();
  await waitFor(() => expect(view.getByText('Not in a group yet')).toBeTruthy());
  expect(view.queryByText('Up next')).toBeNull();
  expect(view.queryByText('Other groups')).toBeNull();
  expect(view.getByRole('button', { name: '+ Make a group' })).toBeTruthy();
  expect(view.getAllByRole('button', { name: 'Put in a group' })).toHaveLength(5);
});
testPicker('no children shows the exact empty state', async () => {
  mockRoster = { ...mockRoster, children: [], groups: [], childrenGroups: [] };
  const view = mount();
  await waitFor(() => expect(view.getByText('No children yet')).toBeTruthy());
  expect(view.getByText('Add children to a class to start lessons.')).toBeTruthy();
  expect(view.queryByRole('button', { name: '+ Make a group' })).toBeNull();
});
testPicker('New group makes a group for the child', async () => {
  const view = mount();
  await ready(view);
  fireEvent.press(view.getAllByRole('button', { name: 'Put in a group' })[0]);
  fireEvent.press(await view.findByRole('button', { name: 'New group' }));
  await waitFor(() => expect(mockRoster.makeGroup).toHaveBeenCalledWith(['c5']));
});
testPicker('group failures stay in the sheet as an InlineNote', async () => {
  mockRoster.makeGroup.mockResolvedValue({ success: false, error: new Error('Group could not be saved') });
  const view = mount();
  await ready(view);
  fireEvent.press(view.getByRole('button', { name: '+ Make a group' }));
  fireEvent.press(await view.findByRole('checkbox', { name: 'Unathi Child, Grade 1A' }));
  fireEvent.press(view.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(view.getByRole('alert')).toHaveTextContent('Group could not be saved'));
  expect(view.getByRole('checkbox', { name: 'Unathi Child, Grade 1A' })).toBeChecked();
});
testPicker('a Put in a group failure stays in the sheet', async () => {
  mockRoster.addChildToGroup.mockResolvedValue({ success: false, error: 'Child already in group' });
  const view = mount();
  await ready(view);
  fireEvent.press(view.getAllByRole('button', { name: 'Put in a group' })[0]);
  fireEvent.press(await view.findByRole('button', { name: 'Lulu' }));
  await waitFor(() => expect(view.getByRole('alert')).toHaveTextContent('Child already in group'));
  expect(view.getByRole('button', { name: 'Lulu' })).toBeTruthy();
});
testPicker('session history page and run versions each reload the picker', async () => {
  const picker = jest.spyOn(inputs, 'loadPickerRanking');
  const store = handle.services.sessionHistory.store;
  let snapshot = store.getSnapshot();
  jest.spyOn(store, 'getSnapshot').mockImplementation(() => snapshot);
  const view = mount();
  await ready(view);
  await act(async () => { snapshot = { ...snapshot, pageVersion: 1 }; store.reset(); });
  await waitFor(() => expect(picker).toHaveBeenCalledTimes(2));
  await act(async () => { snapshot = { ...snapshot, runVersion: 1 }; store.reset(); });
  await waitFor(() => expect(picker).toHaveBeenCalledTimes(3));
});

for (const kind of ['Make a group', 'Put in a group']) {
  testPicker(`a completed ${kind} write does not dismiss a newly opened sheet`, async () => {
    const gate = deferred();
    const view = mount();
    await ready(view);
    if (kind === 'Make a group') {
      mockRoster.makeGroup.mockReturnValue(gate.promise);
      fireEvent.press(view.getByRole('button', { name: '+ Make a group' }));
      fireEvent.press(await view.findByRole('checkbox', { name: 'Unathi Child, Grade 1A' }));
      fireEvent.press(view.getByRole('button', { name: 'Done' }));
      await waitFor(() => expect(mockRoster.makeGroup).toHaveBeenCalledTimes(1));
      fireEvent.press(view.getByRole('button', { name: 'Close' }));
      fireEvent.press(await view.findByRole('button', { name: '+ Make a group' }));
      await view.findByRole('checkbox', { name: 'Unathi Child, Grade 1A' });
      await act(async () => { gate.resolve({ success: true }); });
      expect(view.getByRole('checkbox', { name: 'Unathi Child, Grade 1A' })).toBeTruthy();
    } else {
      mockRoster.addChildToGroup.mockReturnValue(gate.promise);
      fireEvent.press(view.getAllByRole('button', { name: 'Put in a group' })[0]);
      fireEvent.press(await view.findByRole('button', { name: 'Lulu' }));
      await waitFor(() => expect(mockRoster.addChildToGroup).toHaveBeenCalledTimes(1));
      fireEvent.press(view.getByRole('button', { name: 'Close' }));
      fireEvent.press((await view.findAllByRole('button', { name: 'Put in a group' }))[1]);
      await view.findByRole('button', { name: 'Lulu' });
      await act(async () => { gate.resolve({ success: true }); });
      expect(view.getByRole('button', { name: 'Lulu' })).toBeTruthy();
    }
  });
}
testPicker('no active programme shows the notice, not a spinner', async () => {
  await handle.withTransaction(db => db.runAsync('update staff_programme_assignments set ended_at = assigned_at'));
  const view = mount();
  await waitFor(() => expect(view.getByText('No active programme')).toBeTruthy());
  expect(view.queryByRole('button', { name: 'Start lesson' })).toBeNull();
});
testPicker('no active school year says so, not a spinner', async () => {
  await handle.withTransaction(db => db.runAsync('update academic_years set is_active = 0'));
  const view = mount();
  await waitFor(() => expect(view.getByText(/The school year hasn't downloaded yet/)).toBeTruthy());
});
testPicker('a group with no letters to suggest shows only when it was seen', async () => {
  await handle.withTransaction(db => db.runAsync("update classes set home_language = 'isiZulu' where id = 'xh-class'"));
  const view = mount();
  await ready(view);
  await waitFor(() => expect(view.getByText('Not seen yet · letters a m s t')).toBeTruthy());
  expect(view.getByText('Wed')).toBeTruthy();
  expect(view.queryByText(/^Wed · letters/)).toBeNull();
});

const delayedLetters = () => ({ lettersByGroup: {
  g1: { nextLetters: ['o'] }, g2: { nextLetters: ['o'] }, g3: { nextLetters: ['o'] },
}, historyComplete: false });

testPicker('ranking renders before letters and letters enrich details without reordering', async () => {
  const gate = deferred();
  const letters = jest.spyOn(inputs, 'loadPickerLetters').mockReturnValue(gate.promise);
  try {
    const view = mount();
    await ready(view);
    expect(letters).toHaveBeenCalledTimes(1);
    expect(view.getByText('Up next')).toBeTruthy();
    expect(view.getByText('Not seen yet')).toBeTruthy();
    expect(view.getByText('Wed')).toBeTruthy();
    expect(view.getByText('Today ✓')).toBeTruthy();
    expect(view.queryByText(/letters/)).toBeNull();
    expect(view.queryByText('Still downloading past lessons. Suggestions may repeat.')).toBeNull();
    const order = () => view.getAllByRole('button').filter(row => /^(Thando|Amahle),/.test(row.props.accessibilityLabel))
      .map(row => row.props.accessibilityLabel.split(',')[0]);
    expect(order()).toEqual(['Thando', 'Amahle']);
    await act(async () => gate.resolve(delayedLetters()));
    expect(view.getByText('Not seen yet · letters o')).toBeTruthy();
    expect(view.getByText('Wed · letters o')).toBeTruthy();
    await waitFor(() => expect(view.getByText('Still downloading past lessons. Suggestions may repeat.')).toBeTruthy());
    expect(order()).toEqual(['Thando', 'Amahle']);
    expect(view.getByText('Lulu')).toBeTruthy();
  } finally { gate.resolve(delayedLetters()); }
});

testPicker('a row starts while letters are pending and a late result is dropped after blur', async () => {
  const gate = deferred();
  const letters = jest.spyOn(inputs, 'loadPickerLetters').mockReturnValue(gate.promise);
  try {
    const view = mount({ keepMounted: true });
    await ready(view);
    expect(letters).toHaveBeenCalledTimes(1);
    const navigate = jest.spyOn(view.getPickerNavigation(), 'navigate');
    const replace = jest.spyOn(view.getPickerNavigation(), 'replace');
    fireEvent.press(view.getByRole('button', { name: /^Thando,/ }));
    await waitFor(() => expect(view.navigationRef.getCurrentRoute().name).toBe('Lesson'));
    const before = view.navigationRef.getRootState();
    await act(async () => gate.resolve(delayedLetters()));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('Lesson', { groupId: 'g3', upNextGroupId: 'g2' });
    expect(replace).not.toHaveBeenCalled();
    expect(view.navigationRef.getRootState()).toEqual(before);
    expect(view.queryByText(/letters/, { includeHiddenElements: true })).toBeNull();
    expect(view.queryByText('Still downloading past lessons. Suggestions may repeat.', { includeHiddenElements: true })).toBeNull();
  } finally { gate.resolve(delayedLetters()); }
});

testPicker('Not in a group yet shows full names and known classes in locale order', async () => {
  mockRoster.children = [
    ...mockRoster.children.slice(0, 3),
    { id: 'c4', first_name: 'Xola', last_name: 'Child' },
    { id: 'c5', first_name: 'Ênê', last_name: 'Child', class_id: 'class-1' },
    { id: 'c6', first_name: 'Aviwe', last_name: 'Zulu', class_id: 'xh-class' },
    { id: 'c7', first_name: ' Aviwe ', last_name: ' McKeown ', class_id: 'class-1' },
  ];
  const view = mount();
  await ready(view);
  const names = view.getAllByText(/^(Aviwe McKeown|Aviwe Zulu|Ênê Child|Xola Child)$/);
  expect(names.map(name => name.props.children)).toEqual(['Aviwe McKeown', 'Aviwe Zulu', 'Ênê Child', 'Xola Child']);
  expect(view.getAllByText('Grade 1A')).toHaveLength(2);
  expect(view.getByText('Xhosa')).toBeTruthy();
  fireEvent.press(view.getAllByRole('button', { name: 'Put in a group' })[0]);
  fireEvent.press(await view.findByRole('button', { name: 'New group' }));
  await waitFor(() => expect(mockRoster.makeGroup).toHaveBeenCalledWith(['c7']));
});

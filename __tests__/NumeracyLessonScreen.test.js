import React from 'react';
import { Text } from 'react-native';
import { act, cleanupAsync, fireEvent, waitFor } from '@testing-library/react-native';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { AllProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { getCurriculum, getStep } from '../content/numeracy-curriculum';
import { stepTitle } from '../src/numeracyLesson/copy';
import NumeracyLessonScreen from '../src/screens/numeracy/NumeracyLessonScreen';
import HowToTeachScreen from '../src/screens/numeracy/HowToTeachScreen';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => ({ lastSyncResult: null }) }));
let handle;
const curriculum = getCurriculum();
const wrapper = ({ children }) => <AllProviders><SignedInEAContext.Provider value={{ handle, repositories: handle.repositories, services: handle.services }}>{children}</SignedInEAContext.Provider></AllProviders>;
const Stub = () => <Text>Start</Text>;
const mount = (params = { groupId: 'g1', upNextGroupId: 'g1', programmeId: 'programme-b' }) => renderInTestStack({ wrapper, initialIndex: 1,
  motion: { tier: 'static', motionLevel: 'still', reduceMotion: true }, routes: [
    { name: 'Home', component: Stub }, { name: 'NumeracyLesson', component: NumeracyLessonScreen, params },
    { name: 'HowToTeach', component: HowToTeachScreen }, { name: 'NumeracyWrapUp', component: Stub }] });
const row = () => handle.repositories.lessonDrafts.getActive();
const ready = view => view.findByText('Finger flash · up to 5');
const tick = (childId, stepKey) => handle.repositories.skillMastery.setSkillMastery({ childId, stepKey, confirmed: true });
const screenTest = (name, run) => test(name, async () => { try { await run(); } finally { await cleanupAsync(); } });
beforeEach(async () => {
  handle = getDefaultTestHandle();
  await handle.withTransaction(async db => {
    await seedCoreData(db);
    await db.runAsync("update staff_programme_assignments set user_id = ?, programme_id = 'programme-b'", handle.userId);
    await db.runAsync("insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, sync_status) values ('cea-class', 'class-1', ?, 'programme-b', 'synced')", handle.userId);
    await db.runAsync("insert into groups (id, name, programme_id, class_id) values ('g1', 'Group 1', 'programme-b', 'class-1')");
    await db.runAsync("insert into group_ea_assignments (id, group_id, ea_user_id, programme_id) values ('gea', 'g1', ?, 'programme-b')", handle.userId);
    for (const id of ['c1', 'c2', 'c3']) {
      await db.runAsync("insert into children (id, first_name, last_name, class_id, created_by) values (?, ?, 'Child', 'class-1', ?)", id, { c1: 'Sipho', c2: 'Ayanda', c3: 'Lebo' }[id], handle.userId);
      await db.runAsync('insert into child_ea_assignments (id, user_id, child_id) values (?, ?, ?)', id, handle.userId, id);
      await db.runAsync("insert into child_programme_enrollments (id, child_id, programme_id) values (?, ?, 'programme-b')", id, id);
      await db.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id) values (?, ?, 'class-1', 'year-2026')", id, id);
      await db.runAsync("insert into child_group_memberships (id, child_id, group_id) values (?, ?, 'g1')", id, id);
    }
  });

});
screenTest('a first lesson shows a warm-up and two activity cards with ready lines', async () => {
  const view = mount(); await ready(view);
  expect(view.getByText('Warm-up')).toBeTruthy(); expect(view.getAllByText('Activity')).toHaveLength(2);
  expect(view.getAllByText('3 of 3 are ready')).toHaveLength(3);
});
screenTest('the header shows the group number and total minutes', async () => {
  const view = mount(); await ready(view);
  const minutes = view.getAllByText(/^\d+ min$/).reduce((sum, node) => sum + parseInt(node.props.children, 10), 0);
  expect(view.getByText(`Group 1 · ${minutes} min lesson`)).toBeTruthy();
});
const frozen = async keys => {
  const cards = keys.map(step_key => ({ slot: step_key.startsWith('finger') ? 'warm_up' : 'activity', step_key, activity: getStep(curriculum, step_key).activities[0].name }));
  return handle.repositories.lessonDrafts.create({ kind: 'numeracy', programme_id: 'programme-b', group_id: 'g1', class_id: 'class-1',
    lesson_date: '2026-11-01', attendance: { childIds: ['c1', 'c2', 'c3'], absentChildIds: [], addedChildIds: [] },
    plan: { cards, reason: 'ok' }, plan_fixed_at: new Date().toISOString(), ticks: { taught: cards } });
};
screenTest('need help and can help lines never name the same child', async () => {
  await tick('c1', 'add.10'); const draft = await frozen(['add.10']); const view = mount({ draftId: draft.id });
  await view.findByText(/Sipho.*still on/);
  expect(view.queryByText(/Sipho.*can help a partner/)).toBeNull();
});
screenTest('need help names the step each child is still on', async () => {
  await tick('c3', 'finger_flash.5'); const draft = await frozen(['finger_flash.10']); const view = mount({ draftId: draft.id });
  await view.findByText('Sipho and Ayanda are still on up to 5');
});
screenTest('Swap lists the ready steps and replaces the card', async () => {
  for (const id of ['c1', 'c2', 'c3']) await tick(id, 'count.5');
  const view = mount(); await ready(view); fireEvent.press(view.getAllByRole('button', { name: 'Swap' })[1]);
  const option = await view.findByRole('radio', { name: /Compare · up to 5/ }); fireEvent.press(option);
  await waitFor(async () => { const draft = await row(); expect(draft.plan_fixed_at).toBeTruthy(); expect(draft.ticks.taught[1].step_key).toBe('compare.5'); });
  expect(view.getByText('Compare · up to 5')).toBeTruthy();
});
screenTest('a group with no ready activity sees the note and can choose a step', async () => {
  for (const id of ['c1', 'c2', 'c3']) for (const skill of curriculum.skills) await tick(id, skill.steps.at(-1).key);
  const view = mount(); await view.findByText("This group knows every step that's ready. Use Swap to choose a step.");
  fireEvent.press(view.getByRole('button', { name: 'Choose a step' })); await view.findAllByText('Practise again');
  fireEvent.press(view.getAllByRole('radio')[0]);
  await waitFor(async () => expect((await row()).ticks.taught.filter(c => c.slot === 'activity')).toHaveLength(1));
  expect(view.getByText('Activity')).toBeTruthy();
});
screenTest('tapping a card opens How to teach it for that step and activity', async () => {
  const view = mount(); await ready(view); fireEvent.press(view.getByRole('button', { name: 'Finger flash · up to 5' }));
  await waitFor(() => expect(view.routeNames().at(-1)).toBe('HowToTeach'));
  expect(view.navigationRef.getCurrentRoute().params).toEqual({ stepKey: 'finger_flash.5', activity: getStep(curriculum, 'finger_flash.5').activities[0].name });
});
// Codex review round 1: teaching starts when the EA opens How to teach it, so the cards they
// teach from must stop following new maths data, and survive a force-quit.
screenTest('opening How to teach it saves and freezes the plan the EA teaches from', async () => {
  const view = mount(); await ready(view);
  expect(await row()).toBeNull();
  fireEvent.press(view.getByRole('button', { name: 'Finger flash · up to 5' }));
  await waitFor(() => expect(view.routeNames().at(-1)).toBe('HowToTeach'));
  const draft = await row();
  expect(draft.plan_fixed_at).toBeTruthy();
  expect(draft.ticks.taught[0]).toEqual({ slot: 'warm_up', step_key: 'finger_flash.5', activity: getStep(curriculum, 'finger_flash.5').activities[0].name });
});
screenTest('Wrap up freezes the plan and opens Wrap up', async () => {
  const view = mount(); await ready(view); fireEvent.press(view.getByRole('button', { name: 'Wrap up →' }));
  await waitFor(() => expect(view.routeNames().at(-1)).toBe('NumeracyWrapUp')); expect((await row()).plan_fixed_at).toBeTruthy();
});
screenTest('leaving asks to keep or discard, as literacy does', async () => {
  const view = mount(); await ready(view); fireEvent.press(view.getByText('Sipho, here'));
  await waitFor(async () => expect(await row()).not.toBeNull());
  await act(async () => view.navigationRef.goBack()); await view.findByText('Leave this lesson?');
  fireEvent.press(view.getByRole('button', { name: 'Keep teaching' }));
  fireEvent.press(view.getByRole('button', { name: 'Discard lesson' })); await view.findByText('Discard this lesson?');
  fireEvent.press(view.getByRole('button', { name: 'Discard lesson' }));
  await waitFor(() => expect(view.routeNames()).toEqual(['Home'])); expect(await row()).toBeNull();
});

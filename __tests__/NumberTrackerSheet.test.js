import React from 'react';
import { Text } from 'react-native';
import { act, cleanupAsync, fireEvent, waitFor, within } from '@testing-library/react-native';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { AllProviders, renderWithProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { getCurriculum, getStep } from '../content/numeracy-curriculum';
import NumeracyWrapUpScreen from '../src/screens/numeracy/NumeracyWrapUpScreen';
import NumberTrackerSheet from '../src/components/numeracy/NumberTrackerSheet';
import { storeNumeracyPlan } from '../src/numeracy/planRecord';
import { stepPhrase } from '../src/numeracyLesson/copy';
import { buildReceiptRows } from '../src/utils/sessionCompleteView';
import ScreenHeader from '../src/components/common/ScreenHeader';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const mockOffline = { lastSyncResult: null, triggerBackgroundSync: jest.fn(), refreshSyncStatus: jest.fn() };
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockOffline }));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: require('../test-support/actorTestUtils').TEST_ACTOR_ID }, profile: {} }) }));
jest.mock('../src/context/LookupsContext', () => ({ useLookupsContext: () => ({ jobTitles: [] }) }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => ({ refreshFromCache: jest.fn() }) }));
let handle;
const curriculum = getCurriculum();
const wrapper = ({ children }) => <AllProviders><SignedInEAContext.Provider value={{ handle, repositories: handle.repositories, services: handle.services }}>{children}</SignedInEAContext.Provider></AllProviders>;
const Stub = () => <Text>Start</Text>;
let draft;
const Complete = ({ route }) => <>{buildReceiptRows(route.params).map(r => <Text key={r.key}>{r.label}: {r.value}</Text>)}</>;
function WithHeader({ navigation, route }) {
  const [options, setOptions] = React.useState({ title: 'Wrap up' });
  const nav = React.useMemo(() => ({ ...navigation, setOptions: next => { navigation.setOptions(next); setOptions(p => ({ ...p, ...next })); } }), [navigation]);
  return <><ScreenHeader navigation={navigation} route={route} options={options} /><NumeracyWrapUpScreen navigation={nav} route={route} /></>;
}
const mount = () => renderInTestStack({ wrapper, initialIndex: 1,
  motion: { tier: 'static', motionLevel: 'still', reduceMotion: true }, routes: [
    { name: 'MainTabs', component: Stub }, { name: 'NumeracyWrapUp', component: WithHeader, params: { draftId: draft.id } },
    { name: 'SessionComplete', component: Complete }] });
const row = () => handle.repositories.lessonDrafts.getActive();
const ready = async view => { await view.findByText('Sipho'); await waitFor(() => expect(handle.services.lessonDraft.getSnapshot().status).toBe('ready')); await act(async () => {}); };
const childRow = view => within(view.getByTestId('wrap-up-child-c1'));
const chip = (view, state = 'Not yet') => childRow(view).getByRole('button', { name: `Add to 5, ${state}` });
const open = view => fireEvent.press(childRow(view).getByRole('button', { name: /Sipho.*steps/ }));
const tile = (view, key, state) => view.getByLabelText(`${stepPhrase(curriculum, key)}, ${state}`);
const done = view => fireEvent.press(view.getByRole('button', { name: 'Done' }));
const changes = async () => (await row()).tracker_changes;
const tick = (childId, stepKey) => handle.repositories.skillMastery.setSkillMastery({ childId, stepKey, confirmed: true });
const screenTest = (name, run) => test(name, async () => { try { await run(); } finally { await cleanupAsync(); } });
beforeEach(async () => {
  handle = getDefaultTestHandle(); mockOffline.lastSyncResult = null;
  await handle.withTransaction(async db => {
    await seedCoreData(db);
    await db.runAsync("update staff_programme_assignments set user_id = ?, programme_id = 'programme-b'", handle.userId);
    await db.runAsync("insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, sync_status) values ('cea-class', 'class-1', ?, 'programme-b', 'synced')", handle.userId);
    await db.runAsync("insert into groups (id, name, programme_id, class_id) values ('g1', 'Group 1', 'programme-b', 'class-1')");
    await db.runAsync("insert into group_ea_assignments (id, group_id, ea_user_id, programme_id) values ('gea', 'g1', ?, 'programme-b')", handle.userId);
    for (const id of ['c1', 'c2', 'c3']) {
      await db.runAsync("insert into children (id, first_name, last_name, class_id, created_by) values (?, ?, 'Child', 'class-1', ?)", id, { c1: 'Sipho', c2: 'Ayanda', c3: 'Lebo' }[id], handle.userId);
      await db.runAsync("insert into child_ea_assignments (id, user_id, child_id, assigned_at) values (?, ?, ?, '2026-01-15')", id, handle.userId, id);
      await db.runAsync("insert into child_programme_enrollments (id, child_id, programme_id) values (?, ?, 'programme-b')", id, id);
      await db.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id) values (?, ?, 'class-1', 'year-2026')", id, id);
      await db.runAsync("insert into child_group_memberships (id, child_id, group_id) values (?, ?, 'g1')", id, id);
    }
  });
  const cards = ['add.5', 'count.5', 'add.5'].map(step_key => ({ slot: 'activity', step_key, activity: getStep(curriculum, step_key).activities[0].name }));
  const plan = storeNumeracyPlan({ plan: { engine_version: 1, reason: 'ok', readySteps: ['add.5'], cards: cards.map(c => ({ ...c, readyCount: 2, presentCount: 2 })) }, curriculumEdition: curriculum.edition,
    lessonDate: '2026-11-01', presentChildIds: ['c1','c2'], complete: { history: true, ticks: true, evidence: true } });
  draft = await handle.repositories.lessonDrafts.create({ kind: 'numeracy', programme_id: 'programme-b', group_id: 'g1', class_id: 'class-1', lesson_date: '2026-11-01',
    attendance: { childIds: ['c1','c2','c3'], absentChildIds: ['c3'], addedChildIds: [] }, plan, plan_fixed_at: new Date().toISOString(), ticks: { taught: cards } });
});
afterEach(() => jest.restoreAllMocks());

screenTest('the wrap-up tracker sheet ignores sync refreshes', async () => {
  const read = jest.spyOn(handle.repositories.skillMastery, 'getSkillMastery');
  const view = mount(); await ready(view); open(view);
  await view.findByLabelText(`${stepPhrase(curriculum, 'add.5')}, Not yet`);
  fireEvent.press(tile(view, 'add.5', 'Not yet'));
  // Sheet requests only c1. Wrap up requests both present children, and the hook requests all three participants.
  const sheetReads = () => read.mock.calls.filter(([args]) => args.childIds?.length === 1 && args.childIds[0] === 'c1');
  expect(sheetReads()).toHaveLength(1);
  const callsBeforeSync = read.mock.calls.length;
  mockOffline.lastSyncResult = { tableResults: { skill_mastery: {} } };
  await act(async () => view.navigationRef.setParams({ refreshProbe: 1 }));
  await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(callsBeforeSync));
  expect(sheetReads()).toHaveLength(1);
  expect(tile(view, 'add.5', 'Ticked')).toBeTruthy(); done(view);
  await waitFor(async () => expect((await changes()).c1['add.5']).toMatchObject({ mastered: true }));
});

screenTest('dismissing the sheet discards edits and reopening loads a fresh snapshot', async () => {
  const read = jest.spyOn(handle.repositories.skillMastery, 'getSkillMastery');
  const update = jest.fn(), dismiss = jest.fn();
  const ui = visible => <SignedInEAContext.Provider value={{ handle, repositories: handle.repositories }}>
    <NumberTrackerSheet visible={visible} child={{ id: 'c1', first_name: 'Sipho' }} curriculum={curriculum}
      userId={handle.userId} programmeId="programme-b" pendingChanges={{}} onChangesUpdate={update} onDismiss={dismiss} />
  </SignedInEAContext.Provider>;
  const view = renderWithProviders(ui(true), { motion: { motionLevel: 'still', reduceMotion: true, tier: 'static' } });
  fireEvent.press(await view.findByLabelText(`${stepPhrase(curriculum, 'add.5')}, Not yet`));
  view.rerender(ui(false)); view.rerender(ui(true));
  await view.findByLabelText(`${stepPhrase(curriculum, 'add.5')}, Not yet`);
  expect(read).toHaveBeenCalledTimes(2); expect(update).not.toHaveBeenCalled();
  done(view); expect(update).toHaveBeenCalledWith({});
});

import React from 'react';
import { Text } from 'react-native';
import { act, cleanupAsync, fireEvent, waitFor, within } from '@testing-library/react-native';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { AllProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { getCurriculum, getStep } from '../content/numeracy-curriculum';
import NumeracyWrapUpScreen from '../src/screens/numeracy/NumeracyWrapUpScreen';
import { storeNumeracyPlan } from '../src/numeracy/planRecord';
import { buildReceiptRows } from '../src/utils/sessionCompleteView';
import ScreenHeader from '../src/components/common/ScreenHeader';
import * as saveModule from '../src/services/numeracyLessonSave';
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

const saved = () => handle.repositories.sessions.getSessions({ userId: handle.userId });
screenTest('Save lesson writes everything and opens Session complete with Taught', async () => {
  const v=mount(); await ready(v); fireEvent.press(chip(v)); await waitFor(async()=>expect((await changes()).c1).toBeTruthy());
  fireEvent.press(v.getByRole('button',{name:'Save lesson'})); await v.findByText(/Taught: Add/);
  expect(await saved()).toHaveLength(1); expect(await row()).toBeNull();
  expect(await handle.repositories.skillMastery.getSkillMastery({childIds:['c1']})).toEqual([expect.objectContaining({step_key:'add.5',confirmed:true})]);
});
screenTest('Back is blocked while saving', async () => {
  let release; const gate=new Promise(r=>{release=r;}); const original=saveModule.saveNumeracyLesson;
  jest.spyOn(saveModule,'saveNumeracyLesson').mockImplementation(async args=>{await gate; return original(args);});
  const v=mount(); await ready(v); fireEvent.press(v.getByRole('button',{name:'Save lesson'})); await v.findByText('Saving…');
  await act(async()=>v.navigationRef.goBack()); expect(v.navigationRef.getCurrentRoute().name).toBe('NumeracyWrapUp');
  await act(async()=>release()); await v.findByText(/Taught: Add/);
});
screenTest('a refused child can have their changes cleared, then save', async () => {
  const v=mount(); await ready(v); fireEvent.press(chip(v)); await waitFor(async()=>expect((await changes()).c1).toBeTruthy());
  await handle.withTransaction(db=>db.runAsync("update child_ea_assignments set unassigned_at='2026-10-31' where child_id='c1'"));
  fireEvent.press(v.getByRole('button',{name:'Save lesson'})); await v.findByText("You can't update Sipho's steps any more.");
  fireEvent.press(v.getByRole('button',{name:'Clear their changes'})); await waitFor(async()=>expect(await changes()).toEqual({}));
  fireEvent.press(v.getByRole('button',{name:'Save lesson'})); await v.findByText(/Taught: Add/); expect(await saved()).toHaveLength(1);
});
screenTest('a back-dated Wrap up saves the plan as past_date', async () => {
  const v=mount(); await ready(v); fireEvent.press(v.getByTestId('wrap-up-date-button'));
  fireEvent.press(await v.findByLabelText('Previous month'));
  fireEvent.press(await v.findByLabelText(/31 October 2026/));
  await waitFor(async()=>expect((await row()).lesson_date).toBe('2026-10-31'));
  fireEvent.press(v.getByRole('button',{name:'Save lesson'})); await v.findByText(/Taught: Add/);
  expect((await saved())[0].activities.numeracy).toMatchObject({plan:null,plan_reason:'past_date'});
});

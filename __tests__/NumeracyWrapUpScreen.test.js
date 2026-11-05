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
import { stepPhrase, stripSummary } from '../src/numeracyLesson/copy';
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

screenTest('Wrap up shows the heading, a strip per taught step and a row per present child', async () => {
  const v=mount(); await ready(v); expect(v.getByRole('header', { name: 'Who can do these without help?' })).toBeTruthy();
  expect(v.getByText("Teaching it today doesn't count.")).toBeTruthy();
  for (const key of ['add.5','count.5']) expect(v.getAllByText(stripSummary(curriculum,key))).toHaveLength(1);
  expect(v.getByText('Ayanda')).toBeTruthy(); expect(v.queryByText('Lebo')).toBeNull();
});
screenTest('a chip adds a tick to the draft, a second tap removes it', async () => {
  const v=mount(); await ready(v); fireEvent.press(chip(v));
  await waitFor(async()=>expect((await changes()).c1['add.5']).toMatchObject({mastered:true}));
  fireEvent.press(chip(v,'Ticked')); await waitFor(async()=>expect(await changes()).toEqual({}));
});
screenTest('a chip EGMA already shows is fixed, and a known step shows ticked', async () => {
  await tick('c1','add.5');
  await handle.withTransaction(async db => {
  await db.runAsync("insert into assessments (id,user_id,child_id,programme_id,assessment_type,assessment_date,question_code,question_version,stopped_reason,sync_status) values ('egma',?,'c1','programme-b','maths_read_numbers','2026-06-01','maths_read_numbers','masi-egma-en-2026-1','completed','synced')",handle.userId);
  for(let i=0;i<3;i++) await db.runAsync("insert into assessment_items (id,assessment_id,position,item_key,is_correct,metadata,sync_status) values (?,'egma',?,?,1,?,'synced')",`i${i}`,i,String(i),JSON.stringify({skill:'read_numbers',band:10,reached:true}));
  });
  await handle.repositories.lessonDrafts.update(draft.id,{ticks:{taught:[...draft.ticks.taught,{slot:'activity',step_key:'read_numbers.10',activity:'Read'}]}});
  const v=mount(); await ready(v); fireEvent.press(childRow(v).getByRole('button',{name:'Read to 10, Assessment'})); fireEvent.press(chip(v,'Ticked'));
  expect(await changes()).toEqual({});
});
screenTest('the row opens the tracker sheet where a stored tick can be unticked', async () => {
  await tick('c1','count.5'); await tick('c1','finger_flash.5'); await tick('c1','read_numbers.5'); const v=mount(); await ready(v); const tracker = childRow(v).getByRole('button', { name: 'Sipho, number tracker, 3 of 37 steps' });
  expect(within(tracker).getByText('Number tracker')).toBeTruthy(); expect(within(tracker).getByText('3 / 37')).toBeTruthy(); open(v);
  fireEvent.press(await v.findByLabelText(`${stepPhrase(curriculum,'count.5')}, Ticked`)); done(v);
  await waitFor(async()=>expect((await changes()).c1['count.5']).toMatchObject({mastered:false}));
});
screenTest('a removal in the sheet shows on the chip and the chip can cancel it', async () => {
  await tick('c1','add.5'); const v=mount(); await ready(v); open(v); fireEvent.press(await v.findByLabelText(`${stepPhrase(curriculum,'add.5')}, Ticked`)); done(v);
  await waitFor(()=>expect(chip(v)).toBeTruthy()); expect(childRow(v).getByText('0 / 37')).toBeTruthy(); fireEvent.press(chip(v));
  await waitFor(async()=>expect(await changes()).toEqual({})); expect(chip(v,'Ticked')).toBeTruthy();
});
screenTest('removing a higher tick in the sheet clears the chips it implied', async () => {
  await tick('c1','add.10'); const v=mount(); await ready(v); open(v); fireEvent.press(await v.findByLabelText(`${stepPhrase(curriculum,'add.10')}, Ticked`)); done(v);
  await waitFor(()=>expect(chip(v)).toBeTruthy()); fireEvent.press(chip(v));
  await waitFor(async()=>expect((await changes()).c1['add.5']).toMatchObject({mastered:true}));
});

screenTest('a pending removal shows not yet even when a higher stored tick implies the step', async () => {
  await tick('c1', 'add.10');
  await handle.repositories.lessonDrafts.update(draft.id, { tracker_changes: {
    c1: { 'add.5': { mastered: false, madeAt: new Date().toISOString() } },
  } });
  const view = mount(); await ready(view);
  fireEvent.press(chip(view));
  await waitFor(async () => expect(await changes()).toEqual({}));
  expect(chip(view, 'Ticked')).toBeTruthy();
});

screenTest('focused notes scroll to the end when the Android keyboard opens', async () => {
  const { Platform, ScrollView } = require('react-native');
  const emitter = require('react-native/Libraries/EventEmitter/RCTDeviceEventEmitter').default;
  jest.replaceProperty(Platform, 'OS', 'android');
  const scroll = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockClear();
  const view = mount(); await ready(view);
  fireEvent(view.getByPlaceholderText('Add session notes…'), 'focus');
  scroll.mockClear();
  await act(async () => emitter.emit('keyboardDidShow', { endCoordinates: { height: 300 } }));
  expect(scroll).toHaveBeenCalledWith({ animated: true });
  view.unmount();
  jest.restoreAllMocks();
});

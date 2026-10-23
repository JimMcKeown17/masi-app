import React from 'react';
import { BackHandler, Text } from 'react-native';
import { act, cleanupAsync, fireEvent, waitFor } from '@testing-library/react-native';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { draftStart } from '../test-support/lessonDraftTestUtils';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import ScreenHeader from '../src/components/common/ScreenHeader';
import BrandButton from '../src/components/common/BrandButton';
import SessionFormScreen from '../src/screens/sessions/SessionFormScreen';
import LessonScreen from '../src/screens/lessons/LessonScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('expo-updates', () => ({ channel: null }));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({
  profile: { jobTitleCode: require('../src/constants/jobTitles').JOB_TITLE_CODES.LITERACY_COACH },
}) }));
let mockRoster;
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockRoster }));

const Stack = createNativeStackNavigator();
let handle, backListeners;
const testFlow = (name, run) => test(name, async () => {
  try { await run(); } finally { await cleanupAsync(); }
});
function MainTabs({ navigation }) {
  return <><Text>MainTabs screen</Text>
    <BrandButton label="Record" onPress={() => navigation.navigate('SessionForm')} />
    <BrandButton label="Resume" onPress={async () => {
      const draft = await handle.repositories.lessonDrafts.getActive();
      navigation.navigate('Lesson', { draftId: draft.id });
    }} />
  </>;
}
const routeNames = ref => ref.getRootState().routes.map(route => route.name);
const Other = () => <Text>Other screen</Text>;
const mount = initialState => {
  const ref = createNavigationContainerRef();
  const states = [];
  const screen = renderWithProviders(<SignedInEAContext.Provider value={{
    handle, repositories: handle.repositories, services: handle.services,
  }}>
    <NavigationContainer ref={ref} initialState={initialState} onStateChange={state => states.push(state)}>
      <Stack.Navigator screenOptions={{ animation: 'none', header: props => <ScreenHeader {...props} /> }}>
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="SessionForm" component={SessionFormScreen}
          options={{ title: 'Who are you teaching?', headerLeftIcon: 'close' }} />
        <Stack.Screen name="Lesson" component={LessonScreen} options={{ title: '' }} />
        <Stack.Screen name="Other" component={Other} />
      </Stack.Navigator>
    </NavigationContainer>
  </SignedInEAContext.Provider>, { motion: { motionLevel: 'still', reduceMotion: true, tier: 'static' } });
  return { screen, ref, states };
};
const startFromPicker = async () => {
  const view = mount();
  await waitFor(() => expect(view.ref.isReady()).toBe(true));
  fireEvent.press(view.screen.getByRole('button', { name: 'Record' }));
  fireEvent.press(await view.screen.findByRole('button', { name: 'Start lesson' }));
  await view.screen.findByRole('button', { name: 'A, not selected' });
  expect(routeNames(view.ref)).toEqual(['MainTabs', 'SessionForm', 'Lesson']);
  return view;
};
const tick = async ({ screen }) => {
  fireEvent.press(screen.getByRole('button', { name: 'A, not selected' }));
  await waitFor(() => expect(handle.services.lessonDraft.getSnapshot().status).toBe('ready'));
};
const confirmLeave = async ({ screen, ref }) => {
  fireEvent.press(await screen.findByRole('button', { name: 'Leave lesson' }));
  await waitFor(() => expect(ref.getCurrentRoute().name).toBe('MainTabs'));
  expect(routeNames(ref)).toEqual(['MainTabs']);
  expect(await handle.repositories.lessonDrafts.getActive()).not.toBeNull();
};

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance'] });
  jest.setSystemTime(new Date('2026-10-22T09:00:00.000Z'));
  handle = getDefaultTestHandle();
  backListeners = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, callback) => {
    if (event === 'hardwareBackPress') backListeners.push(callback);
    return { remove: () => { backListeners = backListeners.filter(fn => fn !== callback); } };
  });
  await handle.withTransaction(async db => {
    await seedCoreData(db);
    await db.runAsync('update staff_programme_assignments set user_id = ?', handle.userId);
    await db.runAsync("update classes set home_language = 'English'");
    await db.runAsync("insert into children (id, first_name, last_name, class_id, created_by) values ('c1', 'Amahle', 'Child', 'class-1', ?)", handle.userId);
    await db.runAsync("insert into child_ea_assignments (id, user_id, child_id) values ('ea', ?, 'c1')", handle.userId);
    await db.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at) values ('class-member', 'c1', 'class-1', 'year-2026', '2026-01-15')");
    await db.runAsync("insert into child_programme_enrollments (id, child_id, programme_id) values ('enrol', 'c1', 'programme-a')");
    await db.runAsync("insert into groups (id, name, programme_id, class_id) values ('group-1', 'Group 1', 'programme-a', 'class-1')");
    await db.runAsync("insert into group_ea_assignments (id, group_id, ea_user_id, programme_id) values ('group-ea', 'group-1', ?, 'programme-a')", handle.userId);
    await db.runAsync("insert into child_group_memberships (id, child_id, group_id) values ('member', 'c1', 'group-1')");
  });
  const children = await handle.repositories.children.getMyChildren(handle.userId);
  const groups = await handle.repositories.groups.getGroups({ userId: handle.userId });
  const childrenGroups = await handle.repositories.groups.getVisibleChildrenGroups({ userId: handle.userId });
  mockRoster = { children, groups, childrenGroups,
    getChildrenInGroup: id => children.filter(child => childrenGroups.some(row => row.group_id === id && row.child_id === child.id)),
  };
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

testFlow('picker start → tick → header Back → Leave focuses MainTabs and keeps the draft', async () => {
  const view = await startFromPicker();
  await tick(view);
  fireEvent.press(view.screen.getByRole('button', { name: 'Back' }));
  await confirmLeave(view);
});

testFlow('picker start → tick → hardware Back → Leave focuses MainTabs and keeps the draft', async () => {
  const view = await startFromPicker();
  await tick(view);
  act(() => { expect(backListeners.at(-1)()).toBe(true); });
  await confirmLeave(view);
});

testFlow('an untouched lesson goes Back to the picker without a leave warning', async () => {
  const view = await startFromPicker();
  fireEvent.press(view.screen.getByRole('button', { name: 'Back' }));
  await waitFor(() => expect(view.ref.getCurrentRoute().name).toBe('SessionForm'));
  expect(routeNames(view.ref)).toEqual(['MainTabs', 'SessionForm']);
  expect(view.screen.queryByText('Leave this lesson?')).toBeNull();
  expect(await handle.repositories.lessonDrafts.getActive()).toBeNull();
});

testFlow('picker start → tick → Discard confirms to MainTabs and deletes the draft', async () => {
  const view = await startFromPicker();
  await tick(view);
  fireEvent.press(view.screen.getByRole('button', { name: 'Discard lesson' }));
  fireEvent.press(await view.screen.findByRole('button', { name: 'Discard lesson' }));
  await waitFor(() => expect(view.ref.getCurrentRoute().name).toBe('MainTabs'));
  expect(routeNames(view.ref)).toEqual(['MainTabs']);
  expect(await handle.repositories.lessonDrafts.getActive()).toBeNull();
});

testFlow('Home Resume → Leave returns to MainTabs and keeps the draft', async () => {
  await handle.repositories.lessonDrafts.create(draftStart());
  const view = mount();
  fireEvent.press(view.screen.getByRole('button', { name: 'Resume' }));
  await view.screen.findByRole('button', { name: 'Back' });
  fireEvent.press(view.screen.getByRole('button', { name: 'Back' }));
  await confirmLeave(view);
});


testFlow('keeping a lesson removes only its adjacent picker once and preserves every other key', async () => {
  const initialState = { index: 4, routes: [
    { name: 'MainTabs', key: 'home-key' },
    { name: 'SessionForm', key: 'earlier-picker-key' },
    { name: 'Other', key: 'other-key' },
    { name: 'SessionForm', key: 'picker-key' },
    { name: 'Lesson', key: 'lesson-key', params: { groupId: 'group-1' } },
  ] };
  const view = mount(initialState);
  await view.screen.findByRole('button', { name: 'A, not selected' });
  const stackKey = view.ref.getRootState().key;
  await tick(view);
  await waitFor(() => expect(routeNames(view.ref)).toEqual(['MainTabs', 'SessionForm', 'Other', 'Lesson']));
  expect(view.ref.getRootState().routes).toEqual(initialState.routes.filter(row => row.key !== 'picker-key'));
  expect(view.ref.getRootState()).toMatchObject({ key: stackKey, index: 3 });
  expect(view.ref.getCurrentRoute().key).toBe('lesson-key');
  expect(view.screen.queryByText('Leave this lesson?')).toBeNull();
  fireEvent.press(view.screen.getByRole('button', { name: 'A, selected' }));
  await waitFor(() => expect(handle.services.lessonDraft.getSnapshot().draft.ticks.letters).toEqual([]));
  expect(view.states.filter(state => state.routes.every(row => row.key !== 'picker-key'))).toHaveLength(1);
  fireEvent.press(view.screen.getByRole('button', { name: 'Back' }));
  fireEvent.press(await view.screen.findByRole('button', { name: 'Leave lesson' }));
  await waitFor(() => expect(view.ref.getCurrentRoute().name).toBe('Other'));
  expect(routeNames(view.ref)).toEqual(['MainTabs', 'SessionForm', 'Other']);
});

testFlow('a picker elsewhere in the stack is retained when it is not directly below Lesson', async () => {
  const initialState = { index: 3, routes: [
    { name: 'MainTabs', key: 'home-key' }, { name: 'SessionForm', key: 'picker-key' },
    { name: 'Other', key: 'other-key' },
    { name: 'Lesson', key: 'lesson-key', params: { groupId: 'group-1' } },
  ] };
  const view = mount(initialState);
  await view.screen.findByRole('button', { name: 'A, not selected' });
  await tick(view);
  expect(view.ref.getRootState().routes).toEqual(initialState.routes);
  expect(view.ref.getCurrentRoute().key).toBe('lesson-key');
});

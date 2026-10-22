import React from 'react';
import { Text } from 'react-native';
import { act, cleanupAsync, fireEvent, waitFor, within } from '@testing-library/react-native';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { AllProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { getTestWriter } from '../test-support/testDatabase';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { deferred, draftStart, holdDraftWrite } from '../test-support/lessonDraftTestUtils';
import LessonWrapUpScreen from '../src/screens/lessons/LessonWrapUpScreen';
import LessonScreen from '../src/screens/lessons/LessonScreen';
import { loadLessonBase, loadLessonInput } from '../src/lessonPlan/inputs/lessonInputs';
import BrandButton from '../src/components/common/BrandButton';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({
  user: { id: require('../test-support/actorTestUtils').TEST_ACTOR_ID }, profile: {},
}) }));
const mockOffline = { isOnline: false, refreshSyncStatus: jest.fn(async () => ({})), triggerBackgroundSync: jest.fn() };
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockOffline }));
jest.mock('../src/context/LookupsContext', () => ({ useLookupsContext: () => ({ jobTitles: [] }) }));
let handle, draft, cache;
const testSave = (name, run) => test(name, async () => { try { await run(); } finally { await cleanupAsync(); } });
function CacheObserver() { cache = useChildren(); return null; }
const wrapper = ({ children }) => <AllProviders><SignedInEAContext.Provider value={{
  handle, repositories: handle.repositories, services: handle.services,
}}><ChildrenProvider><CacheObserver />{children}</ChildrenProvider></SignedInEAContext.Provider></AllProviders>;
const Home = () => <Text>Home route</Text>;
const Complete = ({ navigation }) => <><Text>Session complete route</Text><BrandButton label="Done" onPress={() => navigation.popTo('MainTabs')} /></>;
const mount = () => renderInTestStack({ wrapper, initialIndex: 2, keepMounted: true,
  motion: { tier: 'static', motionLevel: 'still', reduceMotion: true },
  routes: [{ name: 'MainTabs', component: Home }, { name: 'Lesson', component: LessonScreen, params: { draftId: draft.id } },
    { name: 'LessonWrapUp', component: LessonWrapUpScreen, params: { draftId: draft.id } },
    { name: 'SessionComplete', component: Complete }],
});
const ready = view => view.findByText('Amahle');
const sessions = () => handle.repositories.sessions.getSessions({ userId: handle.userId });
const writerSnapshot = async () => {
  const db = await handle.getReader();
  const tables = await db.getAllAsync("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name");
  return Object.fromEntries(await Promise.all(tables.map(async ({ name }) => [name, await db.getAllAsync(`select * from "${name}" order by rowid`)])));
};
beforeEach(async () => {
  jest.clearAllMocks();
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance'] });
  jest.setSystemTime(new Date('2026-10-22T09:00:00.000Z'));
  handle = getDefaultTestHandle();
  await handle.withTransaction(async db => {
    await seedCoreData(db);
    await db.runAsync('update staff_programme_assignments set user_id = ?', handle.userId);
    await db.runAsync("update classes set home_language = 'English'");
    for (const [id, name] of [['c1', 'Amahle'], ['c2', 'Lulu']]) {
      await db.runAsync("insert into children (id, first_name, last_name, class_id, reading_level, created_by) values (?, ?, 'Child', 'class-1', 'Cannot blend', ?)", id, name, handle.userId);
      await db.runAsync("insert into child_ea_assignments (id, user_id, child_id, assigned_at) values (?, ?, ?, '2026-01-15')", id, handle.userId, id);
      await db.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at) values (?, ?, 'class-1', 'year-2026', '2026-01-15')", id, id);
      await db.runAsync("insert into child_programme_enrollments (id, child_id, programme_id) values (?, ?, 'programme-a')", id, id);
    }
    await db.runAsync("insert into groups (id, name, programme_id, class_id, created_by) values ('group-1', 'Group 1', 'programme-a', 'class-1', ?)", handle.userId);
    await db.runAsync("insert into group_ea_assignments (id, group_id, ea_user_id, programme_id) values ('group-ea', 'group-1', ?, 'programme-a')", handle.userId);
    for (const id of ['c1', 'c2']) await db.runAsync("insert into child_group_memberships (id, child_id, group_id, joined_at) values (?, ?, 'group-1', '2026-01-15')", id, id);
  });
  draft = await handle.repositories.lessonDrafts.create(draftStart({ ticks: { letters: ['a'], blends: [], books: [] } }));
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

testSave('Save writes one session for the group and opens Session complete with the language', async () => {
  const view = mount(); await ready(view);
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  await view.findByText('Session complete route');
  expect(view.navigationRef.getCurrentRoute().params).toEqual({ childCount: 2, childNames: ['Amahle', 'Lulu'], letters: ['a'], readingLevel: null, sessionDate: '2026-10-19', languageCode: 'en' });
  const saved = await sessions();
  expect(saved).toHaveLength(1); expect(saved[0]).toMatchObject({ id: draft.session_id, group_id: 'group-1', class_id: 'class-1' });
  expect(saved[0].activities.lesson).toMatchObject({ blends_done: [], books_read: [], plan: draft.plan });
  expect(await handle.repositories.lessonDrafts.getActive()).toBeNull();
  expect(handle.services.lessonDraft.getSnapshot().status).toBe('empty');
  expect(mockOffline.triggerBackgroundSync).toHaveBeenCalledTimes(1);
  expect(mockOffline.refreshSyncStatus).toHaveBeenCalled();
  fireEvent.press(view.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(view.routeNames()).toEqual(['MainTabs']));
  expect(view.queryByText('Leave this lesson?')).toBeNull();
});
testSave('a failed save keeps the draft; the retry saves with the same session id', async () => {
  const view = mount(); await ready(view);
  const writer = await getTestWriter(); const original = writer.runAsync.bind(writer);
  const fail = jest.spyOn(writer, 'runAsync').mockImplementation(async (sql, ...args) => {
    const result = await original(sql, ...args);
    if (sql.includes('insert into "session_attendees"')) throw new Error('Injected attendee failure');
    return result;
  });
  const before = await writerSnapshot();
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  expect(await view.findByText("Couldn't save the lesson. Try again.")).toBeTruthy();
  expect(view.getByRole('alert').props.accessibilityLiveRegion).toBe('assertive');
  expect(await writerSnapshot()).toEqual(before);
  fail.mockRestore();
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  await view.findByText('Session complete route');
  expect((await sessions()).map(row => row.id)).toEqual([draft.session_id]);
});
testSave('group gone from the phone shows the discard message and keeps the draft', async () => {
  await handle.withTransaction(async db => { await db.runAsync('delete from child_group_memberships'); await db.runAsync('delete from group_ea_assignments'); await db.runAsync('delete from groups'); });
  const view = mount(); await ready(view); const before = await writerSnapshot();
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  expect(await view.findByText('This group is no longer on this phone. Discard this lesson to start again.')).toBeTruthy();
  expect(await writerSnapshot()).toEqual(before);
});
testSave('an edit made just before Save is in the saved session', async () => {
  const view = mount(); await ready(view); const held = await holdDraftWrite();
  fireEvent.changeText(view.getByLabelText('Notes (optional)'), 'Last moment note');
  await held.entered;
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  expect(view.queryByText('Session complete route')).toBeNull();
  await act(async () => held.release());
  await view.findByText('Session complete route'); held.restore();
  expect((await sessions())[0].notes).toBe('Last moment note');
});
testSave('CHANGES_NOT_WRITABLE offers Clear their changes, and the save then succeeds', async () => {
  const view = mount(); await ready(view);
  await act(async () => { await handle.services.lessonDraft.apply(require('../src/lessonPlan/lessonDraftState').setTrackerChanges, 'c1', {
    a: { mastered: true, languageCode: 'en', madeAt: '2026-10-22T09:00:00.000Z' },
  }); await handle.services.lessonDraft.apply(require('../src/lessonPlan/lessonDraftState').setReadingLevel, 'c1', '3 Letter Blends', 'Cannot blend'); });
  await handle.withTransaction(db => db.runAsync("update child_ea_assignments set unassigned_at = '2026-10-21' where child_id = 'c1'"));
  const before = await writerSnapshot();
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  expect(await view.findByText("You can't update Amahle's letters or reading level any more.")).toBeTruthy();
  expect(await writerSnapshot()).toEqual(before);
  fireEvent.press(view.getByRole('button', { name: 'Clear their changes' }));
  await waitFor(async () => expect((await handle.repositories.lessonDrafts.getActive()).tracker_changes).toEqual({}));
  expect((await handle.repositories.lessonDrafts.getActive()).reading_level_changes).toEqual({ c1: '3 Letter Blends' });
  expect(within(view.getByTestId('wrap-up-child-c1')).getByText("Letters can't be updated for this child")).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  await view.findByText('Session complete route');
  expect((await sessions())[0].activities.child_reading_levels.c1).toBe('3 Letter Blends');
});
testSave('after an offline save, the next lesson sees the new reading level', async () => {
  const view = mount(); await ready(view);
  await waitFor(() => expect(cache.children.find(child => child.id === 'c1')?.reading_level).toBe('Cannot blend'));
  fireEvent.press(within(view.getByTestId('wrap-up-child-c1')).getByRole('button', { name: /reading level/ }));
  fireEvent.press(await view.findByRole('button', { name: '3 Letter Blends' }));
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  await view.findByText('Session complete route');
  expect(cache.children.find(child => child.id === 'c1').reading_level).toBe('3 Letter Blends');
  const base = await loadLessonBase({ handle, repositories: handle.repositories, today: '2026-10-22' });
  const next = await loadLessonInput({ handle, repositories: handle.repositories, services: handle.services, base,
    lesson: { groupId: 'group-1', languageCode: 'en', presentChildIds: ['c1', 'c2'] } });
  expect(next.presentChildren.find(child => child.id === 'c1').readingLevel).toBe('3 Letter Blends');
});

testSave('a programme revoked after the screen loads refuses Save without changing any table', async () => {
  const view = mount(); await ready(view);
  await handle.withTransaction(db => db.runAsync("update staff_programme_assignments set ended_at = '2026-10-21'"));
  const before = await writerSnapshot();
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  expect(await view.findByText("This lesson is for a programme you're no longer assigned to. Discard it to start again.")).toBeTruthy();
  expect(await writerSnapshot()).toEqual(before);
});
testSave('children revoked after the screen loads are named from SQLite and Save writes nothing', async () => {
  const view = mount(); await ready(view);
  await handle.withTransaction(async db => {
    await db.runAsync("update child_ea_assignments set unassigned_at = '2026-10-21'");
    await db.runAsync("update child_group_memberships set removed_at = '2026-10-21'");
    await db.runAsync("update children set first_name = 'Aphiwe' where id = 'c1'");
  });
  const before = await writerSnapshot();
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  expect(await view.findByText('Aphiwe & Lulu are no longer one of your children. Go back and remove them from the lesson.')).toBeTruthy();
  expect(await writerSnapshot()).toEqual(before);
});
testSave('an earlier failed draft edit is reported before Save can proceed, then retry uses the same id', async () => {
  const view = mount(); await ready(view);
  const held = await holdDraftWrite({ fail: true });
  fireEvent.changeText(view.getByLabelText('Notes (optional)'), 'Failed note');
  await held.entered;
  await act(async () => held.release()); held.restore();
  await view.findByText("Couldn't save your last change.");
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  expect(await view.findByText("Couldn't save your last change. Check the lesson and press Save again.")).toBeTruthy();
  expect(await sessions()).toHaveLength(0);
  expect((await handle.repositories.lessonDrafts.getActive()).session_id).toBe(draft.session_id);
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  await view.findByText('Session complete route');
  expect((await sessions())[0]).toMatchObject({ id: draft.session_id, notes: '' });
});
testSave('an already saved draft offers Done and returns Home without a leave sheet', async () => {
  const view = mount(); await ready(view);
  await handle.withTransaction(db => db.runAsync('delete from lesson_drafts'));
  const before = await writerSnapshot();
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  expect(await view.findByText('This lesson was already saved.')).toBeTruthy();
  expect(await writerSnapshot()).toEqual(before);
  fireEvent.press(view.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(view.routeNames()).toEqual(['MainTabs']));
  expect(view.queryByText('Leave this lesson?')).toBeNull();
});

testSave('rapid chip edits preserve the whole map and the original tap times through a failed save and retry', async () => {
  draft = await handle.repositories.lessonDrafts.update(draft.id, { ticks: { letters: ['a', 'm'], blends: [], books: [] } });
  const view = mount(); await ready(view);
  const firstTime = '2026-10-22T09:00:00.000Z';
  const held = await holdDraftWrite();
  fireEvent.press(within(view.getByTestId('wrap-up-child-c1')).getByRole('button', { name: 'a, not mastered' }));
  await held.entered;
  // Both later taps queue behind the first child's held native write.
  jest.setSystemTime(new Date('2026-10-22T09:01:00.000Z'));
  fireEvent.press(within(view.getByTestId('wrap-up-child-c1')).getByRole('button', { name: 'm, not mastered' }));
  fireEvent.press(within(view.getByTestId('wrap-up-child-c2')).getByRole('button', { name: 'a, not mastered' }));
  await act(async () => held.release()); held.restore();
  await waitFor(async () => expect(Object.keys((await handle.repositories.lessonDrafts.getActive()).tracker_changes)).toEqual(['c1', 'c2']));
  expect(Object.keys((await handle.repositories.lessonDrafts.getActive()).tracker_changes.c1)).toEqual(['a', 'm']);
  const writer = await getTestWriter(); const original = writer.runAsync.bind(writer);
  const fail = jest.spyOn(writer, 'runAsync').mockImplementation(async (sql, ...args) => {
    if (sql.includes('insert into "session_attendees"')) throw new Error('Retry test');
    return original(sql, ...args);
  });
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  await view.findByText("Couldn't save the lesson. Try again."); fail.mockRestore();
  jest.setSystemTime(new Date('2026-10-22T09:05:00.000Z'));
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  await view.findByText('Session complete route');
  const db = await handle.getReader();
  expect(await db.getAllAsync('select child_id, letter, language, changed_at from letter_mastery order by child_id, letter')).toEqual([
    { child_id: 'c1', letter: 'a', language: 'en', changed_at: firstTime },
    { child_id: 'c1', letter: 'm', language: 'en', changed_at: '2026-10-22T09:01:00.000Z' },
    { child_id: 'c2', letter: 'a', language: 'en', changed_at: '2026-10-22T09:01:00.000Z' },
  ]);
});
testSave('leaving Wrap up while a failing save is in flight leaves the lesson editable', async () => {
  const view = mount(); await ready(view);
  const writer = await getTestWriter(); const original = writer.runAsync.bind(writer);
  const entered = deferred(); const gate = deferred();
  jest.spyOn(writer, 'runAsync').mockImplementation(async (sql, ...args) => {
    if (sql.includes('insert into "session_attendees"')) {
      entered.resolve(); await gate.promise; throw new Error('Injected attendee failure');
    }
    return original(sql, ...args);
  });
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  await act(async () => entered.promise);
  expect(handle.services.lessonDraft.getSnapshot().status).toBe('saving');
  await act(async () => { view.navigationRef.goBack(); });
  await waitFor(() => expect(view.routeNames()).toEqual(['MainTabs', 'Lesson']));
  await act(async () => { gate.resolve(); });
  // Without the release the controller stays 'saving' and refuses every edit until restart.
  await waitFor(() => expect(handle.services.lessonDraft.getSnapshot().status).toBe('ready'));
  expect(await handle.repositories.lessonDrafts.getActive()).toMatchObject({ id: draft.id });
  expect(await sessions()).toEqual([]);
});

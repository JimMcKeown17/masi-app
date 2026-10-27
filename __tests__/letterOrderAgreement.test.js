import React from 'react';
import { Text } from 'react-native';
import { act, cleanupAsync, fireEvent, renderHook, waitFor, within } from '@testing-library/react-native';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { ChildrenProvider } from '../src/context/ChildrenContext';
import { AllProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { loadPickerRanking, loadPickerLetters, loadLessonParticipants } from '../src/lessonPlan/inputs/lessonInputs';
import { teachingOrderFromPack } from '../src/lessonPlan/engine';
import { getLetterOrder, resolveTeachingOrder } from '../src/utils/letterOrders';
import { useLessonDraft } from '../src/hooks/useLessonDraft';
import { toggleTick } from '../src/lessonPlan/lessonDraftState';
import LetterMasteryPanel from '../src/components/assessment/LetterMasteryPanel';
import LessonWrapUpScreen from '../src/screens/lessons/LessonWrapUpScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({
  user: { id: require('../test-support/actorTestUtils').TEST_ACTOR_ID }, profile: {},
}) }));
const mockOffline = { isOnline: false, refreshSyncStatus: jest.fn(async () => ({})), triggerBackgroundSync: jest.fn() };
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockOffline }));
jest.mock('../src/context/LookupsContext', () => ({ useLookupsContext: () => ({ jobTitles: [] }) }));

let handle;
const wrapper = ({ children }) => <AllProviders><SignedInEAContext.Provider value={{
  handle, repositories: handle.repositories, services: handle.services,
}}><ChildrenProvider>{children}</ChildrenProvider></SignedInEAContext.Provider></AllProviders>;
const Home = () => <Text>Home route</Text>;
const Complete = () => <Text>Session complete route</Text>;
const motion = { tier: 'static', motionLevel: 'still', reduceMotion: true };
const lettersIn = view => view.getAllByRole('button', { name: /^[a-z], / })
  .map(tile => tile.props.accessibilityLabel.split(',')[0]);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance'] });
  jest.setSystemTime(new Date('2026-10-27T09:00:00.000Z'));
  handle = getDefaultTestHandle();
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test.each([
  ['xh', 'isiXhosa', ['o', 'm', 'l', 'a']],
  ['en', 'English', ['s', 'a', 'n', 'd']],
  ['af', 'Afrikaans', ['a', 'e', 'k', 'n']],
])('%s agrees on the class letter order from the picker through the saved receipt', async (code, language, firstLetters) => {
  try {
    await handle.withTransaction(async db => {
      await seedCoreData(db);
      await db.runAsync('update staff_programme_assignments set user_id = ?', handle.userId);
      await db.runAsync("update classes set home_language = ?, letter_order_edition = '2026-10-23'", language);
      await db.runAsync("insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, assigned_at) values ('class-ea', 'class-1', ?, 'programme-a', '2026-01-15')", handle.userId);
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
    const { repositories, services } = handle;
    for (const [scope, windowStart] of [
      [`session_history_pull:${handle.userId}:programme-a`, '2026-01-15'],
      [`assessment_history_pull:${handle.userId}:programme-a`, '2026-01-15'],
      [`letter_mastery_pull:${handle.userId}`, null],
    ]) await repositories.syncState.setPullState(scope, { cursor: JSON.stringify({
      complete: true, lastFailureAt: null, windowStart, rescanChildIds: ['c1', 'c2'],
    }) });
    const order = resolveTeachingOrder('2026-10-23', code);
    const stepOne = getLetterOrder(order.id).letter_steps[0];
    expect(stepOne).toEqual(firstLetters);
    const [groups, children, childrenGroups] = await Promise.all([
      repositories.groups.getGroups({ userId: handle.userId }), repositories.children.getMyChildren(handle.userId),
      repositories.groups.getVisibleChildrenGroups({ userId: handle.userId }),
    ]);
    const ranking = await loadPickerRanking({ handle, repositories, today: '2026-10-27',
      groups, children, childrenGroups, getChildrenInGroup: groupId => children.filter(child => childrenGroups.some(
        member => member.group_id === groupId && member.child_id === child.id && !member.removed_at
      )),
    });
    expect(ranking.rows).toHaveLength(1);
    expect(ranking.rows[0].members).toHaveLength(2);
    expect(ranking.base.sessions).toEqual([]);
    const picker = await loadPickerLetters({ handle, repositories, services, base: ranking.base, ranking });
    expect(picker.historyComplete).toBe(true);
    expect(picker.lettersByGroup['group-1']).toMatchObject({ nextLetters: stepOne, lettersReason: 'first_session' });

    const loaded = await loadLessonParticipants({ handle, repositories, services, programmeId: 'programme-a',
      classId: 'class-1', languageCode: code, participantChildIds: ['c1', 'c2'] });
    expect(loaded.participants).toHaveLength(2);
    for (const child of loaded.participants) expect(child).toMatchObject({ knownLetters: [], masteryComplete: true });
    expect(teachingOrderFromPack(loaded.pack)).toEqual(order.letters);
    expect(loaded.alphabet).toEqual(order.letters);

    const activeClass = jest.spyOn(repositories.classes, 'getActiveClassForChild');
    const Mastery = () => <LetterMasteryPanel child={children.find(child => child.id === 'c1')} />;
    const panel = renderInTestStack({ wrapper, motion, routes: [{ name: 'Mastery', component: Mastery }] });
    await panel.findByText('0 / 26 letters mastered');
    expect(activeClass).toHaveBeenCalledWith('c1');
    expect(await activeClass.mock.results[0].value).toMatchObject({ id: 'class-1', letter_order_edition: '2026-10-23' });
    expect(lettersIn(panel)).toEqual(order.letters);
    panel.unmount();

    const lesson = renderHook(() => useLessonDraft({ start: { groupId: 'group-1', upNextGroupId: 'group-1' } }), { wrapper });
    await waitFor(() => expect(lesson.result.current.plan).not.toBeNull());
    expect(lesson.result.current.teachingOrder.letters).toEqual(order.letters);
    expect(lesson.result.current.plan).toMatchObject({ reason: 'first_session', history_complete: true,
      mastery_complete: true, suggested_letters: stepOne });
    const selected = [...order.letters].reverse().slice(0, 5);
    for (const letter of selected) await act(async () => {
      await lesson.result.current.apply(toggleTick, 'letters', letter);
    });
    const draft = await repositories.lessonDrafts.getActive();
    expect(draft.ticks.letters).toEqual(selected);
    lesson.unmount();

    const view = renderInTestStack({ wrapper, motion, initialIndex: 1, routes: [
      { name: 'MainTabs', component: Home },
      { name: 'LessonWrapUp', component: LessonWrapUpScreen, params: { draftId: draft.id } },
      { name: 'SessionComplete', component: Complete },
    ] });
    const displayed = order.letters.filter(letter => selected.includes(letter));
    await view.findByRole('header', { name: `Who knows ${displayed.join(' ')} without help?` });
    const chips = view.getAllByTestId('wrap-up-letter-chips');
    expect(chips).toHaveLength(2);
    for (const row of chips) expect(lettersIn(within(row))).toEqual(displayed);
    fireEvent.press(within(view.getByTestId('wrap-up-child-c1')).getByRole('button', { name: /letter tracker/ }));
    await view.findByRole('button', { name: `${order.letters[0]}, not mastered` });
    expect(lettersIn(view)).toEqual(order.letters);
    fireEvent.press(view.getByRole('button', { name: 'Done' }));
    expect((await repositories.lessonDrafts.getActive()).ticks.letters).toEqual(selected);
    fireEvent.press(view.getByRole('button', { name: 'Save session' }));
    await view.findByText('Session complete route');
    expect(view.navigationRef.getCurrentRoute().params).toMatchObject({ letters: displayed, languageCode: code, childCount: 2 });
    const saved = await repositories.sessions.getSessions({ userId: handle.userId });
    expect(saved).toHaveLength(1);
    expect(saved[0].activities.letters_focused).toEqual(selected);
  } finally { await cleanupAsync(); }
});

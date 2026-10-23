import React, { useEffect, useMemo, useState } from 'react';
import * as ReactNative from 'react-native';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { act, cleanupAsync, fireEvent, waitFor, within } from '@testing-library/react-native';
import Constants from 'expo-constants';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { AllProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { draftStart, holdDraftWrite, observe, deferred } from '../test-support/lessonDraftTestUtils';
import { getPack } from '../src/lessonPlan/packs';
import * as engine from '../src/lessonPlan/engine/lessonPlan';
import { saveLesson } from '../src/services/lessonSave';
import { buildSessionTypeFields } from '../src/utils/sessionTypeResolver';
import BrandButton from '../src/components/common/BrandButton';
import LessonScreen from '../src/screens/lessons/LessonScreen';
import * as inputs from '../src/lessonPlan/inputs/lessonInputs';
import { useLessonDraft } from '../src/hooks/useLessonDraft';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('expo-updates', () => ({ channel: null }));
let handle, titles, backListeners;
const testLesson = (name, run) => test(name, async () => {
  try { await run(); } finally { await cleanupAsync(); }
});
const wrapper = ({ children }) => <AllProviders><SignedInEAContext.Provider value={{
  handle, repositories: handle.repositories, services: handle.services,
}}>{children}</SignedInEAContext.Provider></AllProviders>;
const Home = () => <Text>Home route</Text>;
function LessonRoute(props) {
  const navigation = useMemo(() => ({ ...props.navigation,
    setOptions: options => { titles.push(options); props.navigation.setOptions(options); },
  }), [props.navigation]);
  return <View style={{ flex: 1 }}><BrandButton label="Close" onPress={props.navigation.goBack} />
    <LessonScreen {...props} navigation={navigation} /></View>;
}
function Complete({ navigation }) {
  return <BrandButton label="Done" onPress={() => navigation.popTo('MainTabs')} />;
}
function WrapUp({ navigation }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) navigation.replace('SessionComplete'); }, [saved, navigation]);
  const save = async () => {
    const draft = await handle.services.lessonDraft.beginSave();
    await saveLesson({ handle, draft, sessionTypeFields: buildSessionTypeFields({ jobTitlesCache: [] }) });
    handle.services.lessonDraft.endSave({ saved: true });
    setSaved(true);
  };
  return <><BrandButton label="Back to lesson" onPress={navigation.goBack} />
    <BrandButton label="Save session" onPress={save} /></>;
}
const mount = (params = { groupId: 'group-1', upNextGroupId: 'group-1' }) => renderInTestStack({
  wrapper, keepMounted: true, initialIndex: 1,
  motion: { tier: 'static', motionLevel: 'still', reduceMotion: true },
  routes: [{ name: 'MainTabs', component: Home }, { name: 'Lesson', component: LessonRoute, params },
    { name: 'LessonWrapUp', component: WrapUp }, { name: 'SessionComplete', component: Complete }],
});
const ready = view => waitFor(() => expect(view.getByRole('button', { name: 'A, not selected' })).toBeTruthy());
const tick = async view => {
  await ready(view);
  fireEvent.press(view.getByRole('button', { name: 'A, not selected' }));
  await waitFor(async () => expect((await handle.repositories.lessonDrafts.getActive())?.ticks.letters).toEqual(['a']));
};
const memberships = async () => (await handle.getReader()).getAllAsync('select * from child_group_memberships order by id');

beforeEach(async () => {
  Constants.expoConfig.extra.previewContent = false;
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance'] });
  jest.setSystemTime(new Date('2026-10-22T09:00:00.000Z'));
  handle = getDefaultTestHandle();
  titles = [];
  backListeners = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, callback) => {
    if (event === 'hardwareBackPress') backListeners.push(callback);
    return { remove: () => { backListeners = backListeners.filter(fn => fn !== callback); } };
  });
  await handle.withTransaction(async db => {
    await seedCoreData(db);
    await db.runAsync('update staff_programme_assignments set user_id = ?', handle.userId);
    await db.runAsync("update classes set home_language = 'English'");
    await db.runAsync("insert into classes (id, school_id, name, grade, home_language, academic_year_id) values ('class-2', 'school-1', 'Grade 2A', '2', 'isiXhosa', 'year-2026')");
    for (const [id, name, classId] of [['c1', 'Amahle', 'class-1'], ['c2', 'Lulu', 'class-1'], ['c3', 'Buhle', 'class-2']]) {
      await db.runAsync("insert into children (id, first_name, last_name, class_id, reading_level, created_by) values (?, ?, 'Child', ?, 'Letter Knowledge', ?)", id, name, classId, handle.userId);
      await db.runAsync("insert into child_ea_assignments (id, user_id, child_id, assigned_at) values (?, ?, ?, '2026-01-15')", id, handle.userId, id);
      await db.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at) values (?, ?, ?, 'year-2026', '2026-01-15')", id, id, classId);
      await db.runAsync("insert into child_programme_enrollments (id, child_id, programme_id) values (?, ?, 'programme-a')", id, id);
    }
    await db.runAsync("insert into groups (id, name, programme_id, class_id, created_by) values ('group-1', 'Group 1', 'programme-a', 'class-1', ?)", handle.userId);
    await db.runAsync("insert into group_ea_assignments (id, group_id, ea_user_id, programme_id) values ('group-ea', 'group-1', ?, 'programme-a')", handle.userId);
    for (const id of ['c1', 'c2']) await db.runAsync("insert into child_group_memberships (id, child_id, group_id, joined_at) values (?, ?, 'group-1', '2026-01-15')", id, id);
  });
  await handle.repositories.sessions.saveSession({ id: 'monday', user_id: handle.userId, programme_id: 'programme-a',
    session_date: '2026-10-19', children_ids: ['c1', 'c2'], activities: { lesson: { version: 1 } } });
  for (const letter of ['a', 'm', 's', 't']) await handle.repositories.mastery.setLetterMastery({
    childId: 'c1', letter, language: 'en', confirmed: true, programmeId: 'programme-a',
  });
  await handle.repositories.syncState.setPullState(`session_history_pull:${handle.userId}:programme-a`, {
    cursor: JSON.stringify({ complete: true, lastFailureAt: null, windowStart: '2026-01-15', rescanChildIds: ['c1', 'c2'] }),
  });
});
afterEach(() => { Constants.expoConfig.extra.previewContent = false; jest.restoreAllMocks(); jest.useRealTimers(); });

testLesson("header shows grade, language and last seen; the title is the children's names", async () => {
  const view = mount();
  await ready(view);
  expect(view.getByText('Gr 1 · English · last seen Mon')).toBeTruthy();
  expect(titles).toContainEqual(expect.objectContaining({ title: 'Amahle & Lulu' }));
  expect(view.getByRole('checkbox', { name: 'Amahle, here' })).toBeChecked();
  expect(view.getByRole('checkbox', { name: 'Lulu, here' })).toBeChecked();
});
testLesson('suggested letters are not pre-ticked; ticking one stores it and freezes the plan', async () => {
  const view = mount();
  await ready(view);
  expect(getPack('en').id).toBe('english-interim-letters-v1');
  expect(await handle.repositories.lessonDrafts.getActive()).toBeNull();
  await tick(view);
  const row = await handle.repositories.lessonDrafts.getActive();
  expect(row.plan_fixed_at).toBe('2026-10-22T09:00:00.000Z');
  expect(row.plan.suggested_letters).toEqual(['a', 'm']);
  expect(view.getByRole('button', { name: 'A, selected' })).toBeTruthy();
});
testLesson('marking a child absent before any tick changes the suggestions', async () => {
  const view = mount();
  await ready(view);
  fireEvent.press(view.getByRole('checkbox', { name: 'Lulu, here' }));
  await waitFor(() => expect(view.getByRole('button', { name: 'N, not selected' })).toBeTruthy());
  expect(view.queryByRole('button', { name: 'A, not selected' })).toBeNull();
  expect(view.getByRole('checkbox', { name: 'Lulu, absent' })).not.toBeChecked();
});
testLesson('after a tick, marking a child absent keeps the plan', async () => {
  const view = mount();
  await tick(view);
  const before = (await handle.repositories.lessonDrafts.getActive()).plan;
  fireEvent.press(view.getByRole('checkbox', { name: 'Lulu, here' }));
  await waitFor(async () => expect((await handle.repositories.lessonDrafts.getActive()).attendance.absentChildIds).toEqual(['c2']));
  expect((await handle.repositories.lessonDrafts.getActive()).plan).toEqual(before);
  expect(view.getByRole('button', { name: 'A, selected' })).toBeTruthy();
});
testLesson('+ Add a child adds a roster child for today only', async () => {
  const before = await memberships();
  const view = mount();
  await ready(view);
  fireEvent.press(view.getByRole('button', { name: '+ Add a child' }));
  expect(await view.findByRole('radio', { name: 'Buhle' })).toBeTruthy();
  expect(view.queryByRole('radio', { name: 'Lulu' })).toBeNull();
  fireEvent.press(view.getByRole('radio', { name: 'Buhle' }));
  await waitFor(() => expect(view.getByRole('checkbox', { name: 'Buhle, here' })).toBeTruthy());
  expect((await handle.repositories.lessonDrafts.getActive()).attendance.addedChildIds).toEqual(['c3']);
  expect(await memberships()).toEqual(before);
});
testLesson('a handed-over child can be removed from the lesson', async () => {
  const row = await handle.repositories.lessonDrafts.create(draftStart());
  await handle.withTransaction(async db => {
    await db.runAsync("update child_ea_assignments set unassigned_at = '2026-10-21' where child_id = 'c2'");
    await db.runAsync("update child_group_memberships set removed_at = '2026-10-21' where child_id = 'c2'");
    await db.runAsync("update child_class_memberships set exited_at = '2026-10-21' where child_id = 'c2'");
  });
  const view = mount({ draftId: row.id });
  await waitFor(() => expect(view.getByText('No longer one of your children')).toBeTruthy());
  fireEvent.press(view.getByRole('button', { name: 'Remove from lesson' }));
  await waitFor(async () => expect((await handle.repositories.lessonDrafts.getActive()).attendance.absentChildIds).toEqual(['c2']));
});
testLesson('a mixed-class group asks for the class before suggestions', async () => {
  await handle.withTransaction(async db => {
    await db.runAsync('update groups set class_id = null');
    await db.runAsync("update children set class_id = 'class-2' where id = 'c2'");
  });
  const view = mount();
  expect(await view.findByText('Which class is this lesson for?')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'A, not selected' })).toBeNull();
  fireEvent.press(view.getByRole('radio', { name: 'Grade 2A' }));
  await waitFor(() => expect(handle.services.lessonDraft.getSnapshot()).toMatchObject({ status: 'ready', draft: { class_id: 'class-2' } }));
  await waitFor(() => expect(view.queryByText('Which class is this lesson for?')).toBeNull());
  expect(view.getByText('Gr 2 · isiXhosa · last seen Mon')).toBeTruthy();
  expect((await handle.repositories.lessonDrafts.getActive()).class_id).toBe('class-2');
});
testLesson('a class with no language asks for the language', async () => {
  await handle.withTransaction(db => db.runAsync('update classes set home_language = null'));
  const view = mount();
  expect(await view.findByText('Which language is this lesson in?')).toBeTruthy();
  fireEvent.press(view.getByRole('radio', { name: 'English' }));
  await ready(view);
  expect((await handle.repositories.lessonDrafts.getActive()).language_code).toBe('en');
});
testLesson('Discard lesson asks first, then deletes the draft and goes back', async () => {
  const view = mount();
  await tick(view);
  fireEvent.press(view.getByRole('button', { name: 'Discard lesson' }));
  expect(await view.findByText('Discard this lesson?')).toBeTruthy();
  expect(await handle.repositories.lessonDrafts.getActive()).not.toBeNull();
  fireEvent.press(view.getByRole('button', { name: 'Discard lesson' }));
  await waitFor(() => expect(view.routeNames()).toEqual(['MainTabs']));
  expect(await handle.repositories.lessonDrafts.getActive()).toBeNull();
});
testLesson('leaving after a change asks first; Keep teaching stays; Leave lesson leaves and keeps the draft', async () => {
  const view = mount();
  await tick(view);
  fireEvent.press(view.getByRole('button', { name: 'Close' }));
  expect(await view.findByText('Leave this lesson?')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'Keep teaching' }));
  await waitFor(() => expect(view.queryByText('Leave this lesson?')).toBeNull());
  expect((await handle.repositories.lessonDrafts.getActive()).ticks.letters).toEqual(['a']);
  expect(view.getByRole('button', { name: 'A, selected' })).toBeTruthy();
  await act(async () => { expect(backListeners[0]()).toBe(true); });
  expect(await view.findByText('Leave this lesson?')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'Leave lesson' }));
  await waitFor(() => expect(view.routeNames()).toEqual(['MainTabs']));
  expect(await handle.repositories.lessonDrafts.getActive()).not.toBeNull();
});
testLesson('leaving before any change asks nothing', async () => {
  const view = mount();
  await ready(view);
  fireEvent.press(view.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(view.routeNames()).toEqual(['MainTabs']));
  expect(view.queryByText('Leave this lesson?')).toBeNull();
});
testLesson('going to Wrap up and back never asks', async () => {
  const view = mount();
  await ready(view);
  fireEvent.press(view.getByRole('button', { name: 'Wrap up →' }));
  await waitFor(() => expect(view.routeNames()).toEqual(['MainTabs', 'Lesson', 'LessonWrapUp']));
  expect(view.queryByText('Leave this lesson?')).toBeNull();
  const id = (await handle.repositories.lessonDrafts.getActive()).id;
  expect(view.navigationRef.getCurrentRoute().params).toEqual({ draftId: id });
  fireEvent.press(view.getByRole('button', { name: 'Back to lesson' }));
  await ready(view);
  expect(view.queryByText('Leave this lesson?')).toBeNull();
});
testLesson('after a save, Done on Session complete returns Home without the leave sheet', async () => {
  const view = mount();
  await tick(view);
  fireEvent.press(view.getByRole('button', { name: 'Wrap up →' }));
  fireEvent.press(await view.findByRole('button', { name: 'Save session' }));
  expect(await view.findByRole('button', { name: 'Done' })).toBeTruthy();
  expect(handle.services.lessonDraft.getSnapshot().status).toBe('empty');
  fireEvent.press(view.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(view.routeNames()).toEqual(['MainTabs']));
  expect(view.queryByText('Leave this lesson?')).toBeNull();
  expect(await handle.repositories.lessonDrafts.getActive()).toBeNull();
  expect(await handle.repositories.sessions.getSessions({ userId: handle.userId })).toHaveLength(2);
});
testLesson('after Discard lesson, no leave sheet', async () => {
  const view = mount();
  await tick(view);
  fireEvent.press(view.getByRole('button', { name: 'Discard lesson' }));
  await view.findByText('Discard this lesson?');
  fireEvent.press(view.getByRole('button', { name: 'Discard lesson' }));
  await waitFor(() => expect(view.routeNames()).toEqual(['MainTabs']));
  expect(view.queryByText('Leave this lesson?')).toBeNull();
});
testLesson('a corrupt draft shows the cannot-open state with Discard', async () => {
  const row = await handle.repositories.lessonDrafts.create(draftStart());
  await handle.withTransaction(db => db.runAsync("update lesson_drafts set ticks = 'broken'"));
  const view = mount({ draftId: row.id });
  expect(await view.findByText("This lesson can't be opened")).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'Discard lesson' }));
  await view.findByText('Discard this lesson?');
  fireEvent.press(view.getByRole('button', { name: 'Discard lesson' }));
  await waitFor(() => expect(view.routeNames()).toEqual(['MainTabs']));
  expect(await handle.repositories.lessonDrafts.getActive()).toBeNull();
});
testLesson('an existing draft on a new start offers Go to that lesson', async () => {
  const row = await handle.repositories.lessonDrafts.create(draftStart());
  const view = mount();
  await ready(view);
  fireEvent.press(view.getByRole('button', { name: 'A, not selected' }));
  expect(await view.findByText('You have a lesson in progress')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'Go to that lesson' }));
  await waitFor(() => expect(view.navigationRef.getCurrentRoute().params).toEqual({ draftId: row.id }));
});
testLesson('one engine evaluation per attendance change', async () => {
  const plan = jest.spyOn(engine, 'computeLessonPlan');
  const choices = jest.spyOn(engine, 'computeLessonChoices');
  const view = mount();
  await ready(view);
  expect(plan).toHaveBeenCalledTimes(1);
  expect(choices).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByRole('checkbox', { name: 'Lulu, here' }));
  await waitFor(() => expect(view.getByRole('button', { name: 'N, not selected' })).toBeTruthy());
  expect(plan).toHaveBeenCalledTimes(2);
  expect(choices).toHaveBeenCalledTimes(2);
});
testLesson('at 1.3x text the header and chips wrap without clipping', async () => {
  const dimensions = ReactNative.useWindowDimensions;
  jest.spyOn(ReactNative, 'useWindowDimensions').mockImplementation(() => ({ ...dimensions(), width: 360, fontScale: 1.3 }));
  const view = mount();
  await ready(view);
  const header = view.getByText('Gr 1 · English · last seen Mon');
  expect(StyleSheet.flatten(header.props.style).height).toBeUndefined();
  const chips = view.getByTestId('lesson-attendance-chips');
  expect(StyleSheet.flatten(chips.props.style).flexWrap).toBe('wrap');
  expect(StyleSheet.flatten(chips.props.style).height).toBeUndefined();
});
testLesson('the controller write error appears at the top and clears after a successful edit', async () => {
  const view = mount();
  await tick(view);
  const held = await holdDraftWrite({ fail: true });
  fireEvent.press(view.getByRole('button', { name: 'M, not selected' }));
  await held.entered;
  await act(async () => { held.release(); });
  expect(await view.findByText("Couldn't save your last change.")).toBeTruthy();
  held.restore();
  fireEvent.press(view.getByRole('button', { name: 'M, not selected' }));
  await waitFor(() => expect(view.queryByText("Couldn't save your last change.")).toBeNull());
});

testLesson('a queued successful edit clears the screen error from an earlier failed edit', async () => {
  const view = mount();
  await tick(view);
  const held = await holdDraftWrite({ fail: true });
  fireEvent.press(view.getByRole('button', { name: 'M, not selected' }));
  await held.entered;
  fireEvent.press(view.getByRole('button', { name: 'A, selected' }));
  await act(async () => { held.release(); });
  await waitFor(async () => expect((await handle.repositories.lessonDrafts.getActive()).ticks.letters).toEqual([]));
  expect(view.queryAllByRole('alert').length).toBe(0);
});

testLesson('a held child addition cannot dismiss a newly opened Add a child sheet', async () => {
  const view = mount();
  await ready(view);
  const held = await holdDraftWrite();
  fireEvent.press(view.getByRole('button', { name: '+ Add a child' }));
  fireEvent.press(await view.findByRole('radio', { name: 'Buhle' }));
  await held.entered;
  fireEvent.press(view.getByRole('button', { name: 'Close' }));
  fireEvent.press(await view.findByRole('button', { name: '+ Add a child' }));
  await view.findByRole('header', { name: '+ Add a child' });
  await act(async () => { held.release(); });
  expect(view.queryAllByRole('header', { name: '+ Add a child' }).length).toBe(1);
});

testLesson('a resumed lesson keeps its grade when its class is archived', async () => {
  const row = await handle.repositories.lessonDrafts.create(draftStart());
  await handle.withTransaction(db => db.runAsync("update classes set archived_at = '2026-10-21' where id = 'class-1'"));
  const view = mount({ draftId: row.id });
  await ready(view);
  expect(view.getByText('Gr 1 · English · last seen Mon')).toBeTruthy();
});

const previewLesson = async (levels = ['4 Letter Blends', '4 Letter Blends']) => {
  Constants.expoConfig.extra.previewContent = true;
  await handle.withTransaction(async db => {
    await db.runAsync("update classes set home_language = 'isiXhosa' where id = 'class-1'");
    for (const [index, id] of ['c1', 'c2'].entries()) {
      await db.runAsync('update children set reading_level = ? where id = ?', levels[index], id);
    }
  });
  for (const childId of ['c1', 'c2']) for (const letter of ['o', 'm', 'l', 'a', 'k', 'u', 'e', 'n', 'i', 't', 's', 'd']) {
    await handle.repositories.mastery.setLetterMastery({ childId, letter, language: 'xh', confirmed: true, programmeId: 'programme-a' });
  }
};
const blendSection = view => within(view.getByTestId('lesson-blends'));
testLesson('six suggested blends show with hyphens and are not pre-ticked', async () => {
  await previewLesson();
  const choices = jest.spyOn(engine, 'computeLessonChoices');
  const view = mount();
  await view.findByText('2 · Blending · 15 min · 4-letter');
  const suggested = choices.mock.results[0].value.tiers[0].suggested;
  expect(suggested).toHaveLength(6);
  expect(suggested.some(item => item.display.includes('-'))).toBe(true);
  for (const item of suggested) {
    expect(blendSection(view).getByText(item.display)).toBeTruthy();
    expect(blendSection(view).getByRole('button', { name: `${item.text.replace(/-/g, '')}, not ticked` })
      .props.accessibilityState.selected).toBe(false);
  }
  expect(await handle.repositories.lessonDrafts.getActive()).toBeNull();
});
testLesson('ticking a blend from + more stores its pack text', async () => {
  await previewLesson();
  const choices = jest.spyOn(engine, 'computeLessonChoices');
  const view = mount();
  fireEvent.press(await view.findByRole('button', { name: '+ more' }));
  const tier = choices.mock.results[0].value.tiers[0];
  const item = tier.pool.find(candidate => !tier.suggested.some(suggested => suggested.text === candidate.text)
    && candidate.display.includes('-'));
  expect(item).toBeTruthy();
  const pool = within(view.getByTestId('blend-pool'));
  expect(pool.getAllByRole('button')).toHaveLength(tier.pool.length);
  fireEvent.press(pool.getByRole('button', { name: `${item.text}, not ticked` }));
  await waitFor(async () => expect((await handle.repositories.lessonDrafts.getActive()).ticks.blends).toEqual([item.text]));
  const row = await handle.repositories.lessonDrafts.getActive();
  expect(row.plan_fixed_at).toBe('2026-10-22T09:00:00.000Z');
  expect(pool.getAllByRole('button')[0].props.accessibilityLabel).toBe(`${item.text}, ticked`);
  fireEvent.press(view.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(view.queryByTestId('blend-pool')).toBeNull());
  expect(blendSection(view).getByRole('button', { name: `${item.text}, ticked` })).toBeTruthy();
  expect(choices).toHaveBeenCalledTimes(1);
});
testLesson('Show 3-letter switches tiers and stores blendTierShown', async () => {
  await previewLesson(['2 Letter Blends', '3 Letter Blends']);
  const view = mount();
  fireEvent.press(await view.findByRole('button', { name: 'Show 3-letter (Lulu is ahead)' }));
  await waitFor(async () => expect((await handle.repositories.lessonDrafts.getActive()).ticks.blendTierShown).toBe('3 Letter Blends'));
  expect(view.getByText('2 · Blending · 15 min · 3-letter')).toBeTruthy();
  await cleanupAsync();
  const resumed = mount({ draftId: (await handle.repositories.lessonDrafts.getActive()).id });
  await resumed.findByText('2 · Blending · 15 min · 3-letter');
  fireEvent.press(resumed.getByRole('button', { name: 'Show 2-letter' }));
  await waitFor(async () => expect((await handle.repositories.lessonDrafts.getActive()).ticks.blendTierShown).toBe('2 Letter Blends'));
});
testLesson('a ticked blend stays visible and correctable when its tier\'s only child is absent, and the chosen tier returns with them', async () => {
  await previewLesson(['2 Letter Blends', '3 Letter Blends']);
  const view = mount();
  fireEvent.press(await view.findByRole('button', { name: 'Show 3-letter (Lulu is ahead)' }));
  await view.findByText('2 · Blending · 15 min · 3-letter');
  const [first] = within(view.getByTestId('lesson-blends')).getAllByRole('button', { name: /, not ticked$/ });
  const spoken = first.props.accessibilityLabel.replace(/, not ticked$/, '');
  fireEvent.press(first);
  await waitFor(async () => expect((await handle.repositories.lessonDrafts.getActive()).ticks.blends).toHaveLength(1));
  fireEvent.press(view.getByRole('checkbox', { name: 'Lulu, here' }));
  await view.findByText('2 · Blending · 15 min · 2-letter');
  expect(within(view.getByTestId('lesson-blends')).getByRole('button', { name: `${spoken}, ticked` })).toBeTruthy();
  expect((await handle.repositories.lessonDrafts.getActive()).ticks.blendTierShown).toBe('3 Letter Blends');
  fireEvent.press(view.getByRole('checkbox', { name: 'Lulu, absent' }));
  await view.findByText('2 · Blending · 15 min · 3-letter');
  fireEvent.press(within(view.getByTestId('lesson-blends')).getByRole('button', { name: `${spoken}, ticked` }));
  await waitFor(async () => expect((await handle.repositories.lessonDrafts.getActive()).ticks.blends).toEqual([]));
});
function HookSave({ route }) {
  const lesson = useLessonDraft({ draftId: route.params.draftId });
  const [result, setResult] = useState('not saved');
  const save = async () => {
    try {
      const draft = await lesson.beginSave();
      await saveLesson({ handle, draft, sessionTypeFields: buildSessionTypeFields({ jobTitlesCache: [] }) });
      lesson.endSave({ saved: true });
      setResult('saved');
    } catch (error) { setResult(error.name); }
  };
  return <><Text>{result}</Text>{lesson.choices ? <BrandButton label="Hook save" onPress={save} /> : null}</>;
}
testLesson('Save records the tier on screen when the chosen tier has gone; a failed correction stops the save until it succeeds', async () => {
  await previewLesson(['2 Letter Blends', '3 Letter Blends']);
  const view = renderInTestStack({ wrapper, keepMounted: true, initialIndex: 1,
    motion: { tier: 'static', motionLevel: 'still', reduceMotion: true },
    routes: [{ name: 'MainTabs', component: Home },
      { name: 'Lesson', component: LessonRoute, params: { groupId: 'group-1', upNextGroupId: 'group-1' } },
      { name: 'LessonWrapUp', component: HookSave }, { name: 'SessionComplete', component: Complete }] });
  fireEvent.press(await view.findByRole('button', { name: 'Show 3-letter (Lulu is ahead)' }));
  await view.findByText('2 · Blending · 15 min · 3-letter');
  const [first] = within(view.getByTestId('lesson-blends')).getAllByRole('button', { name: /, not ticked$/ });
  fireEvent.press(first);
  const drafts = handle.repositories.lessonDrafts;
  await waitFor(async () => expect((await drafts.getActive()).ticks.blends).toHaveLength(1));
  fireEvent.press(view.getByRole('checkbox', { name: 'Lulu, here' }));
  await view.findByText('2 · Blending · 15 min · 2-letter');
  const { session_id: sessionId, ticks } = await drafts.getActive();
  const original = drafts.update.bind(drafts);
  let failing = true;
  jest.spyOn(drafts, 'update').mockImplementation(async (id, patch, ...rest) => {
    if (failing && patch.ticks && patch.ticks.blendTierShown === null) throw new Error('database or disk is full');
    return original(id, patch, ...rest);
  });
  fireEvent.press(view.getByRole('button', { name: 'Wrap up →' }));
  fireEvent.press(await view.findByRole('button', { name: 'Hook save' }));
  expect(await view.findByText('LessonDraftWriteError')).toBeTruthy();
  const saved = () => handle.repositories.sessions.getSessions({ userId: handle.userId });
  expect((await saved()).some(row => row.id === sessionId)).toBe(false);
  failing = false;
  fireEvent.press(view.getByRole('button', { name: 'Hook save' }));
  await waitFor(async () => expect((await saved()).some(row => row.id === sessionId)).toBe(true));
  const lessonRecord = (await saved()).find(row => row.id === sessionId).activities.lesson;
  expect(lessonRecord.blend_tier_shown).toBe('2 Letter Blends');
  expect(lessonRecord.blends_done).toEqual(ticks.blends);
});
testLesson('the higher-tier switch names all children who are ahead', async () => {
  await previewLesson(['2 Letter Blends', '3 Letter Blends']);
  await handle.withTransaction(async db => {
    await db.runAsync("update children set reading_level = '3 Letter Blends' where id = 'c3'");
    await db.runAsync("insert into child_group_memberships (id, child_id, group_id, joined_at) values ('c3', 'c3', 'group-1', '2026-01-15')");
  });
  const view = mount();
  expect(await view.findByRole('button', { name: 'Show 3-letter (Buhle & Lulu are ahead)' })).toBeTruthy();
});
testLesson('the Read tick stores the book as printed', async () => {
  await previewLesson();
  const view = mount();
  expect(await view.findByText('Molo, Lolo!')).toBeTruthy();
  expect(view.getByText('Step 1')).toBeTruthy();
  const read = view.getByRole('checkbox', { name: 'Read' });
  expect(read).not.toBeChecked();
  fireEvent.press(read);
  await waitFor(async () => expect((await handle.repositories.lessonDrafts.getActive()).ticks.books)
    .toEqual([{ id: 'xh-int-v1-r01', how: 'printed' }]));
  expect(view.getByRole('checkbox', { name: 'Read' })).toBeChecked();
  expect((await handle.repositories.lessonDrafts.getActive()).plan_fixed_at).toBeTruthy();
  fireEvent.press(view.getByRole('checkbox', { name: 'Read' }));
  await waitFor(async () => expect((await handle.repositories.lessonDrafts.getActive()).ticks.books).toEqual([]));
});
testLesson('an ECD class has no pair-reading section', async () => {
  await previewLesson();
  await handle.withTransaction(db => db.runAsync("update classes set grade = 'ECD' where id = 'class-1'"));
  const view = mount();
  await view.findByText('2 · Blending · 15 min · 4-letter');
  expect(view.queryByText('3 · Pair reading · 5 min')).toBeNull();
});
testLesson('a resumed archived ECD class has no pair-reading section', async () => {
  await previewLesson();
  const row = await handle.repositories.lessonDrafts.create({ ...draftStart(), language_code: 'xh',
    pack_id: 'isixhosa-candidates-preview-v1', plan: null });
  await handle.withTransaction(db => db.runAsync("update classes set grade = 'ECD', archived_at = '2026-10-21' where id = 'class-1'"));
  const view = mount({ draftId: row.id });
  await view.findByText('2 · Blending · 15 min · 4-letter');
  expect(view.queryByText('3 · Pair reading · 5 min')).toBeNull();
});
testLesson('a letters-only release pack says no blends and no books yet', async () => {
  const view = mount();
  await ready(view);
  expect(view.getByText('No blends for English yet.')).toBeTruthy();
  expect(view.getByText('No books for English yet.')).toBeTruthy();
});
testLesson('Wrap up creates the draft if needed and opens Wrap up', async () => {
  const view = mount();
  await ready(view);
  expect(await handle.repositories.lessonDrafts.getActive()).toBeNull();
  fireEvent.press(view.getByRole('button', { name: 'Wrap up →' }));
  await waitFor(() => expect(view.routeNames()).toEqual(['MainTabs', 'Lesson', 'LessonWrapUp']));
  expect(view.navigationRef.getCurrentRoute().params).toEqual({ draftId: (await handle.repositories.lessonDrafts.getActive()).id });
});


testLesson('first base load shows one spinner and no seen label, then the never-seen header', async () => {
  await handle.withTransaction(async db => {
    await db.runAsync('delete from session_attendees');
    await db.runAsync('delete from sessions');
    await db.runAsync("update classes set home_language = 'isiXhosa' where id = 'class-1'");
  });
  const realLoad = inputs.loadLessonBase;
  const held = deferred();
  jest.spyOn(inputs, 'loadLessonBase').mockImplementationOnce(async options => {
    await held.promise; return realLoad(options);
  });
  const view = mount();
  expect(view.UNSAFE_getAllByType(ReactNative.ActivityIndicator)).toHaveLength(1);
  expect(view.queryByText(/seen/)).toBeNull();
  await act(async () => { held.resolve(); });
  expect(await view.findByText('Gr 1 · isiXhosa · not seen yet')).toBeTruthy();
  await waitFor(() => expect(view.UNSAFE_queryAllByType(ReactNative.ActivityIndicator)).toHaveLength(0));
});


testLesson('participant loading keeps the base header and disables Wrap up, then shows seen today', async () => {
  await handle.repositories.sessions.saveSession({ id: 'today', user_id: handle.userId, programme_id: 'programme-a',
    session_date: '2026-10-22', children_ids: ['c1'], activities: { lesson: { version: 1 } } });
  await handle.withTransaction(db => db.runAsync("update classes set home_language = 'isiXhosa' where id = 'class-1'"));
  const realLoad = inputs.loadLessonParticipants;
  const held = deferred();
  jest.spyOn(inputs, 'loadLessonParticipants').mockImplementationOnce(async options => {
    await held.promise; return realLoad(options);
  });
  const view = mount();
  expect(await view.findByText('Gr 1 · isiXhosa · seen today')).toBeTruthy();
  expect(view.UNSAFE_getAllByType(ReactNative.ActivityIndicator)).toHaveLength(1);
  expect(view.getByRole('button', { name: 'Wrap up →' })).toBeDisabled();
  await act(async () => { held.resolve(); });
  await waitFor(() => expect(view.getByRole('button', { name: 'Wrap up →' })).toBeEnabled());
  expect(view.UNSAFE_queryAllByType(ReactNative.ActivityIndicator)).toHaveLength(0);
});

testLesson('a failed base load shows the suggestions note and retries from the screen', async () => {
  const load = jest.spyOn(inputs, 'loadLessonBase').mockRejectedValueOnce(new Error('Read failed'));
  const view = mount();
  expect(await view.findByText("Couldn't load this lesson's suggestions.")).toBeTruthy();
  expect(view.queryByText('Read failed')).toBeNull();
  expect(view.getByRole('button', { name: 'Wrap up →' })).toBeDisabled();
  fireEvent.press(view.getByRole('button', { name: 'Try again' }));
  await ready(view);
  expect(load).toHaveBeenCalledTimes(2);
  expect(view.queryByText("Couldn't load this lesson's suggestions.")).toBeNull();
});

testLesson('added-child read failure keeps last seen and retries without freezing an incomplete plan', async () => {
  await handle.repositories.sessions.saveSession({ id: 'added-child-today', user_id: handle.userId, programme_id: 'programme-a',
    session_date: '2026-10-22', children_ids: ['c3'], activities: { lesson: { version: 1 } } });
  const realLoad = inputs.loadLessonParticipants;
  const load = jest.spyOn(inputs, 'loadLessonParticipants');
  const held = deferred();
  const view = mount();
  await ready(view);
  load.mockRejectedValueOnce(new Error('Read failed'));
  fireEvent.press(view.getByRole('button', { name: '+ Add a child' }));
  fireEvent.press(await view.findByRole('radio', { name: 'Buhle' }));
  expect(await view.findByText("Couldn't load this lesson's suggestions.")).toBeTruthy();
  expect(view.getByText('Gr 1 · English · last seen Mon')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Wrap up →' })).toBeDisabled();
  expect(view.queryByRole('button', { name: 'A, not selected' })).toBeNull();
  load.mockImplementationOnce(async options => { await held.promise; return realLoad(options); });
  fireEvent.press(view.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(view.UNSAFE_getAllByType(ReactNative.ActivityIndicator)).toHaveLength(1));
  expect(view.getByText('Gr 1 · English · last seen Mon')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Wrap up →' })).toBeDisabled();
  await act(async () => { held.resolve(); });
  await waitFor(() => expect(view.getByRole('button', { name: 'Wrap up →' })).toBeEnabled());
  expect((await handle.repositories.lessonDrafts.getActive()).plan.present_child_ids).toEqual(['c1', 'c2', 'c3']);
});

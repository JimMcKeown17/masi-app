jest.mock('../src/hooks/useAssessableChildren', () => ({ useAssessableChildren: jest.fn() }));
import { useAssessableChildren } from '../src/hooks/useAssessableChildren';
beforeEach(() => useAssessableChildren.mockImplementation(() => {
  const state = require('../src/context/ChildrenContext').useChildren();
  const all = state.children ?? state.allChildren ?? [];
  return { all, yourChildren: all, restOfClass: [], loading: false };
}));
const mockUseAuth = jest.fn();
const mockUseOffline = jest.fn();
const mockUseChildren = jest.fn();
const mockUseClasses = jest.fn();
const mockUseTimeTracking = jest.fn();
const mockUseSessionLaunchGuard = jest.fn();
const mockGetTimeEntries = jest.fn();
const mockGetSessions = jest.fn();
const mockGetLetterResults = jest.fn();
const mockGetSessionCountsSince = jest.fn();
const mockGetAssessmentCountsSince = jest.fn();
const mockGetSessionsTodayGoal = jest.fn();
const mockGetActiveProgrammeGate = jest.fn();
const mockIsFocused = jest.fn(() => true);
const mockStatusBar = jest.fn();

const mockGetAssessmentDismissedOn = jest.fn();
const mockDismissAssessmentForDay = jest.fn();
const mockUseSessionHistoryStatus = jest.fn();
const mockGetActiveDraft = jest.fn();

jest.mock('@expo/vector-icons', () => new Proxy({}, {
  get: (target, prop) => {
    if (prop === '__esModule') return true;
    if (!target[prop]) target[prop] = () => null;
    return target[prop];
  },
}), { virtual: true });

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useIsFocused: () => mockIsFocused(),
    useFocusEffect: (cb) => { React.useEffect(() => cb(), [cb]); },
  };
});

jest.mock('expo-status-bar', () => ({ StatusBar: (props) => { mockStatusBar(props); return null; } }));

jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockUseChildren() }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => mockUseClasses() }));
jest.mock('../src/hooks/useTimeTracking', () => ({ useTimeTracking: () => mockUseTimeTracking() }));
jest.mock('../src/hooks/useSessionLaunchGuard', () => ({
  useSessionLaunchGuard: (...args) => mockUseSessionLaunchGuard(...args),
}));
jest.mock('../src/db/repositories/timeEntriesRepository', () => ({
  ...jest.requireActual('../src/db/repositories/timeEntriesRepository'),
  timeEntriesRepository: { getTimeEntries: (...args) => mockGetTimeEntries(...args) },
}));
jest.mock('../src/db/repositories/sessionsRepository', () => ({
  ...jest.requireActual('../src/db/repositories/sessionsRepository'),
  sessionsRepository: {
    getSessions: (...args) => mockGetSessions(...args),
    getSessionCountsSince: (...args) => mockGetSessionCountsSince(...args),
  },
}));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  ...jest.requireActual('../src/db/repositories/assessmentsRepository'),
  assessmentsRepository: {
    getLetterResults: (...args) => mockGetLetterResults(...args),
    getAssessmentCountsSince: (...args) => mockGetAssessmentCountsSince(...args),
  },
}));
jest.mock('../src/services/sessionsTodayGoal', () => ({
  getSessionsTodayGoal: (...args) => mockGetSessionsTodayGoal(...args),
}));
jest.mock('../src/services/activeProgrammeGate', () => ({
  getActiveProgrammeGate: (...args) => mockGetActiveProgrammeGate(...args),
}));
jest.mock('../src/services/sessionHistoryStatus', () => ({
  ...jest.requireActual('../src/services/sessionHistoryStatus'),
  useSessionHistoryStatus: () => mockUseSessionHistoryStatus(),
}));

import React from 'react';
import { AppState } from 'react-native';
import { act, cleanupAsync, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { PaperProvider, Snackbar } from 'react-native-paper';
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { StaleActorError } from '../src/session/staleActor';
import { LessonDraftCorruptError } from '../src/db/repositories/lessonDraftsRepository';
import { deferred, draftStart } from '../test-support/lessonDraftTestUtils';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { AllProviders } from '../test-support/renderWithProviders';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import LessonScreen from '../src/screens/lessons/LessonScreen';
import { saveLesson } from '../src/services/lessonSave';
import { buildSessionTypeFields } from '../src/utils/sessionTypeResolver';
import HomeScreen from '../src/screens/main/HomeScreen';

const lessonDraft = { id: 'draft-1', attendance: {
  childIds: ['c1', 'c2'], absentChildIds: [], addedChildIds: [],
} };
const lessonChildren = [{ id: 'c1', first_name: 'Amahle' }, { id: 'c2', first_name: 'Lulu' }];
const foregroundEvents = () => {
  const listeners = new Set();
  AppState.addEventListener.mockImplementation((type, fn) => {
    listeners.add(fn);
    return { remove: () => listeners.delete(fn) };
  });
  return async () => { await act(async () => { listeners.forEach(fn => fn('active')); }); };
};

const renderHome = (navigation = { navigate: jest.fn() }) => render(
  <PaperProvider>
    <HomeScreen navigation={navigation} />
  </PaperProvider>
);

const defaultTimeTracking = {
  autoClockOutNotice: null,
  dismissAutoClockOutNotice: jest.fn(),
  isSignedIn: false,
  activeEntry: null,
  currentEntry: null,
  loadingLocation: false,
  elapsedTime: 0,
  signIn: jest.fn(),
  signOut: jest.fn(),
  handleSignIn: jest.fn(),
  handleSignOut: jest.fn(),
  formatElapsedTime: jest.fn(() => '0h 0m 0s'),
  formatTime: jest.fn(() => '8:00 AM'),
};

describe('HomeScreen', () => {
  test('renders no screen-local Snackbar', async () => {
    const screen = renderHome();
    await screen.findByText('2 of 3 sessions today');
    expect(screen.UNSAFE_queryByType(Snackbar)).toBeNull();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSessions.mockReset();
    mockGetActiveDraft.mockReset().mockResolvedValue(null);
    jest.spyOn(getDefaultTestHandle().repositories.lessonDrafts, 'getActive').mockImplementation(mockGetActiveDraft);
    AppState.addEventListener.mockImplementation(() => ({ remove: jest.fn() }));
    Object.assign(getDefaultTestHandle().services.homeAttention, {
      getAssessmentDismissedOn: mockGetAssessmentDismissedOn,
      dismissAssessmentForDay: mockDismissAssessmentForDay,
    });
    mockIsFocused.mockReturnValue(true);
    mockGetAssessmentDismissedOn.mockResolvedValue(null);
    mockDismissAssessmentForDay.mockResolvedValue(undefined);
    mockUseSessionHistoryStatus.mockReturnValue({ pageVersion: 0, runVersion: 0 });
    mockUseAuth.mockReturnValue({
      user: { id: 'ea-1', first_name: 'Alice' },
      profile: { first_name: 'Alice', schoolName: 'Charles Duna Primary' },
    });
    mockUseOffline.mockReturnValue({
      isOnline: true,
      unsyncedCount: 0,
      waitingCount: 0,
      needsAttentionCount: 0,
      syncStatus: { failedItems: [] },
    });
    mockUseChildren.mockReturnValue({ children: [] });
    mockUseClasses.mockReturnValue({
      classes: [{ id: 'class-1', name: 'Grade 1A' }],
      classBootstrapStatus: 'available',
    });
    mockUseTimeTracking.mockReturnValue(defaultTimeTracking);
    mockUseSessionLaunchGuard.mockReturnValue({
      launchSession: jest.fn(),
      warningVisible: false,
      requestSessionLaunch: jest.fn(),
      continueAnyway: jest.fn(),
      clockInNow: jest.fn(),
      dismissWarning: jest.fn(),
    });
    mockGetTimeEntries.mockResolvedValue([]);
    mockGetSessions.mockResolvedValue([]);
    mockGetLetterResults.mockResolvedValue([]);
    mockGetSessionCountsSince.mockResolvedValue([]);
    mockGetAssessmentCountsSince.mockResolvedValue([]);
    mockGetSessionsTodayGoal.mockResolvedValue({
      target: 3,
      ceiling: 5,
      count: 2,
      state: 'below',
    });
    mockGetActiveProgrammeGate.mockResolvedValue({
      hasActiveProgramme: true,
      programme: { id: 'programme-1', name: 'Core Literacy' },
    });
  });

  afterEach(async () => {
    await cleanupAsync();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('a numeracy EA is never told children need assessing', async () => {
    mockUseChildren.mockReturnValue({ children: lessonChildren });
    mockGetActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: true, programme: { code: 'numeracy' } });
    const screen = renderHome();
    await screen.findByText('2 of 3 sessions today');
    expect(screen.queryByText(/children to assess/)).toBeNull();
    expect(mockGetAssessmentCountsSince).not.toHaveBeenCalled();
  });
  test('a retained draft waits for a slow programme read before offering Resume', async () => {
    const gate = deferred();
    mockGetActiveProgrammeGate.mockReturnValue(gate.promise);
    mockGetActiveDraft.mockResolvedValue(lessonDraft);
    const screen = renderHome();
    await act(async () => {});
    expect(screen.queryByText('Lesson in progress')).toBeNull();
    expect(mockGetAssessmentCountsSince).not.toHaveBeenCalled();
    await act(async () => gate.resolve({ hasActiveProgramme: true, programme: { code: 'numeracy' } }));
    await screen.findByText('2 of 3 sessions today');
    expect(screen.queryByText('Lesson in progress')).toBeNull();
  });

  test('a retained literacy lesson draft is not offered to a numeracy EA', async () => {
    mockGetActiveDraft.mockResolvedValue(lessonDraft);
    mockUseChildren.mockReturnValue({ children: lessonChildren });
    const foreground = foregroundEvents();
    const screen = renderHome();
    await screen.findByText('Lesson in progress');
    const remove = jest.spyOn(getDefaultTestHandle().repositories.lessonDrafts, 'discard');
    mockGetActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: true, programme: { code: 'numeracy' } });
    await foreground();
    await waitFor(() => expect(screen.queryByText('Lesson in progress')).toBeNull());
    expect(screen.queryByRole('button', { name: /Lesson in progress/ })).toBeNull();
    expect(remove).not.toHaveBeenCalled();
    expect(await mockGetActiveDraft()).toBe(lessonDraft);
  });

  test('a failed refresh never turns a known numeracy EA back to literacy', async () => {
    mockGetActiveDraft.mockResolvedValue(lessonDraft);
    mockUseChildren.mockReturnValue({ children: lessonChildren });
    mockGetActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: true, programme: { code: 'numeracy' } });
    const foreground = foregroundEvents();
    const screen = renderHome();
    await waitFor(() => expect(mockGetActiveProgrammeGate).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByText('Lesson in progress')).toBeNull();
    mockGetActiveProgrammeGate.mockRejectedValue(new Error('read failed'));
    await foreground();
    await act(async () => {});
    expect(screen.queryByText('Lesson in progress')).toBeNull();
    expect(screen.queryByText(/children to assess/)).toBeNull();
  });

  test('a lesson in progress is the first card and resumes with its draft id', async () => {
    mockGetActiveDraft.mockResolvedValue(lessonDraft);
    mockUseChildren.mockReturnValue({ children: lessonChildren });
    mockUseOffline.mockReturnValue({ needsAttentionCount: 2 });
    const navigation = { navigate: jest.fn() };
    const screen = renderHome(navigation);
    const resume = await screen.findByRole('button', { name: 'Lesson in progress with Amahle and Lulu. Resume' });
    const area = screen.getByLabelText('Needs your attention');
    expect(within(area).getAllByRole('button').map(button => button.props.accessibilityLabel))
      .toEqual(['Lesson in progress with Amahle and Lulu. Resume', '2 items need attention. Open sync status to sort it out']);
    expect(screen.queryByLabelText('Dismiss: Lesson in progress')).toBeNull();
    fireEvent.press(resume);
    expect(navigation.navigate).toHaveBeenCalledWith('Lesson', { draftId: 'draft-1' });
    expect(mockUseSessionLaunchGuard).not.toHaveBeenCalled();
    expect(defaultTimeTracking.handleSignIn).not.toHaveBeenCalled();
  });
  test('a failed draft read leaves the stats and other cards alone', async () => {
    const error = new Error('draft reader unavailable');
    const report = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetActiveDraft.mockRejectedValue(error);
    mockUseChildren.mockReturnValue({ children: lessonChildren });
    const screen = renderHome();
    await screen.findByText('2 of 3 sessions today');
    expect(screen.getByText('2 children to assess')).toBeTruthy();
    expect(screen.queryByText('Couldn’t load today’s sessions')).toBeNull();
    expect(report).toHaveBeenCalledWith('Error loading lesson in progress:', error);
    expect(report).not.toHaveBeenCalledWith('Error loading Home statistics:', expect.anything());
  });
  test('a stats failure keeps the lesson card', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const foreground = foregroundEvents();
    mockGetActiveDraft.mockResolvedValue(lessonDraft);
    const screen = renderHome();
    await screen.findByText('Lesson in progress');
    mockGetSessions.mockRejectedValueOnce(new Error('stats unavailable'));
    await foreground();
    expect(screen.getByText('Lesson in progress')).toBeTruthy();
    expect(screen.getByText('2 of 3 sessions today')).toBeTruthy();
  });
  test('a draft read that settles after the stats still shows the card', async () => {
    const pending = deferred();
    mockGetActiveDraft.mockReturnValue(pending.promise);
    const screen = renderHome();
    await screen.findByText('2 of 3 sessions today');
    expect(screen.queryByText('Lesson in progress')).toBeNull();
    await act(async () => pending.resolve(lessonDraft));
    expect(screen.getByText('Lesson in progress')).toBeTruthy();
  });
  test('a corrupt draft still shows Resume', async () => {
    const report = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetActiveDraft.mockRejectedValue(new LessonDraftCorruptError('corrupt-1', ['attendance']));
    const navigation = { navigate: jest.fn() };
    const screen = renderHome(navigation);
    fireEvent.press(await screen.findByRole('button', { name: 'Lesson in progress. Resume' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Lesson', { draftId: 'corrupt-1' });
    expect(screen.getByText('Resume')).toBeTruthy();
    expect(report).not.toHaveBeenCalled();
  });
  test('the sync card still navigates with no params', async () => {
    mockGetActiveDraft.mockResolvedValue(lessonDraft);
    mockUseOffline.mockReturnValue({ needsAttentionCount: 2 });
    const navigation = { navigate: jest.fn() };
    const screen = renderHome(navigation);
    fireEvent.press(await screen.findByLabelText('2 items need attention. Open sync status to sort it out'));
    expect(navigation.navigate.mock.calls).toEqual([['SyncStatus']]);
  });
  test('a later failed draft read keeps the previous lesson card and logs only the draft error', async () => {
    const foreground = foregroundEvents();
    const report = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetActiveDraft.mockResolvedValueOnce(lessonDraft);
    const screen = renderHome();
    await screen.findByText('Lesson in progress');
    const error = new Error('temporary draft failure');
    mockGetActiveDraft.mockRejectedValueOnce(error);
    await foreground();
    expect(screen.getByText('Lesson in progress')).toBeTruthy();
    expect(screen.getByText('2 of 3 sessions today')).toBeTruthy();
    expect(report.mock.calls).toEqual([['Error loading lesson in progress:', error]]);
  });
  test('a stale draft read stays quiet and keeps the previous lesson card', async () => {
    const foreground = foregroundEvents();
    const report = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetActiveDraft.mockResolvedValueOnce(lessonDraft);
    const screen = renderHome();
    await screen.findByText('Lesson in progress');
    mockGetActiveDraft.mockRejectedValueOnce(new StaleActorError());
    await foreground();
    expect(screen.getByText('Lesson in progress')).toBeTruthy();
    expect(report).not.toHaveBeenCalled();
  });
  test('a later null draft read that settles after the stats removes the card', async () => {
    const foreground = foregroundEvents();
    mockGetActiveDraft.mockResolvedValueOnce(lessonDraft);
    const screen = renderHome();
    await screen.findByText('Lesson in progress');
    const pending = deferred();
    mockGetActiveDraft.mockReturnValueOnce(pending.promise);
    mockGetSessionsTodayGoal.mockResolvedValueOnce({ target: 3, ceiling: 5, count: 3, state: 'met' });
    await foreground();
    await screen.findByText('3 of 3 sessions today');
    expect(screen.getByText('Lesson in progress')).toBeTruthy();
    await act(async () => pending.resolve(null));
    expect(screen.queryByText('Lesson in progress')).toBeNull();
  });
  test('a superseded draft read cannot resurrect a lesson removed by a newer load', async () => {
    const foreground = foregroundEvents();
    const pending = deferred();
    mockGetActiveDraft.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(null);
    const screen = renderHome();
    await screen.findByText('2 of 3 sessions today');
    await foreground();
    expect(mockGetActiveDraft).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve(lessonDraft));
    expect(screen.queryByText('Lesson in progress')).toBeNull();
  });
  test('Resume still opens Lesson while clocked out and without an active programme', async () => {
    mockGetActiveDraft.mockResolvedValue(lessonDraft);
    mockGetSessionsTodayGoal.mockResolvedValue(null);
    mockGetActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: false, programme: null });
    const navigation = { navigate: jest.fn() };
    const screen = renderHome(navigation);
    await screen.findByText('No active programme');
    fireEvent.press(screen.getByRole('button', { name: 'Lesson in progress. Resume' }));
    expect(navigation.navigate.mock.calls).toEqual([['Lesson', { draftId: 'draft-1' }]]);
    expect(mockGetActiveProgrammeGate).toHaveBeenCalledTimes(1);
    expect(mockUseSessionLaunchGuard).not.toHaveBeenCalled();
    expect(defaultTimeTracking.handleSignIn).not.toHaveBeenCalled();
  });
  test.each(['discard', 'save'])('a stored draft resumes through the stack onto Lesson and its %s disappears on foreground', async (action) => {
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance'] });
    jest.setSystemTime(new Date('2026-10-22T09:00:00.000Z'));
    const handle = getDefaultTestHandle();
    handle.repositories.lessonDrafts.getActive.mockRestore();
    await handle.withTransaction(async db => {
      await seedCoreData(db);
      await db.runAsync('update staff_programme_assignments set user_id = ?', handle.userId);
      await db.runAsync("update classes set home_language = 'English'");
      await db.runAsync("insert into children (id, first_name, last_name, class_id, created_by) values ('c1', 'Amahle', 'Child', 'class-1', ?)", handle.userId);
      await db.runAsync("insert into child_ea_assignments (id, user_id, child_id, assigned_at) values ('child-ea', ?, 'c1', '2026-01-15')", handle.userId);
      await db.runAsync("insert into groups (id, name, programme_id, class_id, created_by) values ('group-1', 'Group 1', 'programme-a', 'class-1', ?)", handle.userId);
      await db.runAsync("insert into group_ea_assignments (id, group_id, ea_user_id, programme_id) values ('group-ea', 'group-1', ?, 'programme-a')", handle.userId);
      await db.runAsync("insert into child_group_memberships (id, child_id, group_id, joined_at) values ('member', 'c1', 'group-1', '2026-01-15')");
    });
    const stored = await handle.repositories.lessonDrafts.create(draftStart({
      attendance: { childIds: ['c1'], absentChildIds: [], addedChildIds: [] },
    }));
    mockUseChildren.mockReturnValue({ children: [lessonChildren[0]] });
    const foreground = foregroundEvents();
    const wrapper = ({ children }) => <AllProviders><SignedInEAContext.Provider value={{
      handle, repositories: handle.repositories, services: handle.services,
    }}>{children}</SignedInEAContext.Provider></AllProviders>;
    const screen = renderInTestStack({ wrapper, initialIndex: 0, keepMounted: true,
      motion: { tier: 'static', motionLevel: 'still', reduceMotion: true },
      routes: [{ name: 'Home', component: HomeScreen }, { name: 'Lesson', component: LessonScreen }],
    });
    fireEvent.press(await screen.findByRole('button', { name: 'Lesson in progress with Amahle. Resume' }));
    await waitFor(() => expect(screen.navigationRef.getCurrentRoute()).toMatchObject({ name: 'Lesson', params: { draftId: stored.id } }));
    expect(await screen.findByRole('checkbox', { name: 'Amahle, here' })).toBeTruthy();
    expect((await handle.repositories.lessonDrafts.getActive()).id).toBe(stored.id);
    if (action === 'discard') {
      fireEvent.press(screen.getByRole('button', { name: 'Discard lesson' }));
      await screen.findByText('Discard this lesson?');
      fireEvent.press(screen.getByRole('button', { name: 'Discard lesson' }));
    } else {
      // Another screen saves through the same controller/service hand-off as Wrap up.
      await act(async () => {
        const snapshot = await handle.services.lessonDraft.beginSave();
        await saveLesson({ handle, draft: snapshot, sessionTypeFields: buildSessionTypeFields() });
        handle.services.lessonDraft.endSave({ saved: true });
      });
      act(() => screen.navigationRef.goBack());
      expect(await handle.repositories.sessions.getSessions({ userId: handle.userId })).toHaveLength(1);
    }
    await waitFor(() => expect(screen.navigationRef.getCurrentRoute().name).toBe('Home'));
    await foreground();
    await waitFor(() => expect(screen.queryByText('Lesson in progress')).toBeNull());
    expect(await handle.repositories.lessonDrafts.getActive()).toBeNull();
    expect(mockUseSessionLaunchGuard).not.toHaveBeenCalled();
  });

  test.each(['pageVersion', 'runVersion'])('%s refreshes Home sessions and statistics without leaving', async (version) => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-22T08:00:00.000Z'));
    mockUseChildren.mockReturnValue({ children: [{ id: 'child-1', first_name: 'Onwethu' }] });
    const navigation = { navigate: jest.fn() };
    const screen = renderHome(navigation);
    await screen.findByText('2 of 3 sessions today');
    expect(mockGetSessions).toHaveBeenCalledTimes(1);

    mockGetSessions.mockResolvedValue([{
      id: 'session-1', user_id: 'ea-1', session_date: '2026-07-22',
      children_ids: ['child-1'], session_type: 'Shared reading',
    }]);
    mockGetSessionsTodayGoal.mockResolvedValue({ target: 3, ceiling: 5, count: 3, state: 'met' });
    mockUseSessionHistoryStatus.mockReturnValue({ pageVersion: 0, runVersion: 0, [version]: 1 });
    screen.rerender(<PaperProvider><HomeScreen navigation={navigation} /></PaperProvider>);

    await waitFor(() => expect(mockGetSessions).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('3 of 3 sessions today')).toBeTruthy();
    expect(screen.getByText('3 of 3 sessions today')).toBeTruthy();
    expect(screen.queryByLabelText('Loading statistics')).toBeNull();
    expect(mockGetSessions).toHaveBeenLastCalledWith({
      userId: 'ea-1', recordedByUserId: 'ea-1', sinceDate: '2026-06-22', order: 'desc',
    });
  });

  test.each([true, false])('a history refresh keeps content visible without a skeleton (has programme: %s)', async (hasProgramme) => {
    if (!hasProgramme) {
      mockGetSessionsTodayGoal.mockResolvedValue(null);
      mockGetActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: false, programme: null });
    }
    const title = hasProgramme ? '2 of 3 sessions today' : 'No active programme';
    const navigation = { navigate: jest.fn() };
    const screen = renderHome(navigation);
    await screen.findByText(title);
    let releaseReload;
    mockGetSessions.mockImplementationOnce(() => new Promise((resolve) => { releaseReload = resolve; }));
    mockUseSessionHistoryStatus.mockReturnValue({ pageVersion: 1, runVersion: 0 });
    screen.rerender(<PaperProvider><HomeScreen navigation={navigation} /></PaperProvider>);
    await waitFor(() => expect(mockGetSessions).toHaveBeenCalledTimes(2));
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.queryByLabelText('Loading statistics')).toBeNull();
    await act(async () => { releaseReload([]); });
    expect(screen.getByText(title)).toBeTruthy();
  });

  test('a stats load rejected for a stale EA stays quiet', async () => {
    const report = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      let rejectLoad;
      mockGetSessions.mockImplementationOnce(() => new Promise((_, reject) => { rejectLoad = reject; }));
      const screen = renderHome();
      expect(screen.getByLabelText('Loading statistics')).toBeTruthy();
      await act(async () => { rejectLoad(new StaleActorError()); });
      expect(screen.queryByLabelText('Loading statistics')).toBeNull();
      expect(report).not.toHaveBeenCalled();
    } finally {
      report.mockRestore();
    }
  });

  test('a reload that read no dismissal cannot resurrect a card dismissed while it waits', async () => {
    mockUseChildren.mockReturnValue({ children: [{ id: 'c1', first_name: 'A' }] });
    const { AppState } = require('react-native');
    const listeners = [];
    const subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      listeners.push(fn);
      return { remove: jest.fn() };
    });
    try {
      const screen = renderHome();
      await screen.findByText('1 child to assess');
      let releaseReload;
      mockGetSessions.mockImplementationOnce(() => new Promise((resolve) => { releaseReload = resolve; }));
      await act(async () => { listeners.forEach((fn) => fn('active')); });
      expect(mockGetAssessmentDismissedOn).toHaveBeenCalledTimes(2);
      await act(async () => { fireEvent.press(screen.getByLabelText('Dismiss: 1 child to assess')); });
      expect(screen.queryByText('1 child to assess')).toBeNull();
      await act(async () => { releaseReload([]); });
      expect(screen.queryByText('1 child to assess')).toBeNull();
      expect(mockDismissAssessmentForDay).toHaveBeenCalledTimes(1);
    } finally {
      subscription.mockRestore();
    }
  });

  test('renders the locked status-only hero', async () => {
    const screen = renderHome();

    expect(await screen.findByText('Molo, Alice.')).toBeTruthy();
    expect(screen.getByText('Core Literacy · Charles Duna Primary')).toBeTruthy();
    expect(screen.queryByText('days worked')).toBeNull();
    expect(screen.queryByText('Performance Insights')).toBeNull();
    expect(screen.queryByText('Record Session')).toBeNull();
  });

  test('shows the locked daily half-gauge in the Home hero', async () => {
    const screen = renderHome();

    expect(await screen.findByLabelText('2 of 3 sessions today. Below target.')).toBeTruthy();
    expect(screen.getByText('2 of 3 sessions today')).toBeTruthy();
    expect(screen.getByText('One more pair reaches your target.')).toBeTruthy();
    expect(mockGetSessionsTodayGoal).toHaveBeenCalledWith(expect.objectContaining({ userId: 'ea-1' }));
  });

  test('shows Clock in button when not signed in', async () => {
    const screen = renderHome();

    await waitFor(() => expect(screen.getByText('Clock in')).toBeTruthy());
  });

  test('shows Clock out / session controls when signed in', async () => {
    mockUseTimeTracking.mockReturnValue({
      ...defaultTimeTracking,
      isSignedIn: true,
      activeEntry: { id: '1', sign_in_time: '2026-06-18T06:00:00.000Z' },
      currentEntry: { id: '1' },
    });

    const screen = renderHome();

    await waitFor(() => expect(screen.getByText('Clock out')).toBeTruthy());
    expect(screen.queryByText('Clock in')).toBeNull();
  });

  test('does not duplicate the navigation Record action on Home', async () => {
    const screen = renderHome();

    await screen.findByText('Core Literacy · Charles Duna Primary');
    expect(screen.queryByText('Record Session')).toBeNull();
  });

  test('automatically enters onboarding only after zero classes are confirmed', async () => {
    const navigation = { navigate: jest.fn() };
    mockUseClasses.mockReturnValue({
      classes: [],
      classBootstrapStatus: 'confirmed_empty',
    });

    renderHome(navigation);

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('ClassOnboarding');
    });
  });

  test('resumes the durable child step when class creation was already completed', async () => {
    const navigation = { navigate: jest.fn() };
    mockUseClasses.mockReturnValue({
      classes: [{ id: 'class-pending', name: 'Grade 1A' }],
      classBootstrapStatus: 'available',
      incompleteOnboardingClassId: 'class-pending',
    });

    renderHome(navigation);

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('ChildOnboarding', {
        classId: 'class-pending',
      });
    });
    expect(navigation.navigate).not.toHaveBeenCalledWith('ClassOnboarding');
  });

  test('assessment card uses active-year letter counts for the complete active roster', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-12T08:00:00.000Z'));
    mockUseChildren.mockReturnValue({
      children: [
        { id: 'child-1', first_name: 'Amahle' },
        { id: 'child-2', first_name: 'Lwazi' },
      ],
    });
    mockGetTimeEntries.mockResolvedValue([{
      sign_in_time: '2026-07-01T06:00:00.000Z',
      sign_out_time: '2026-07-01T08:00:00.000Z',
    }]);
    mockGetSessions.mockResolvedValue([
      {
        id: 'session-1',
        user_id: 'ea-1',
        session_date: '2026-07-06',
        children_ids: ['child-1'],
      },
      {
        id: 'session-2',
        user_id: 'ea-1',
        session_date: '2026-07-07',
        children_ids: ['child-2'],
      },
    ]);
    mockGetAssessmentCountsSince.mockResolvedValue([{ child_id: 'child-1', count: 3 }]);

    const screen = renderHome();

    await waitFor(() => expect(screen.getByText('1 child to assess')).toBeTruthy());
    expect(screen.getByText('1 of 2 children assessed')).toBeTruthy();
    expect(mockGetSessions).toHaveBeenCalledWith({
      userId: 'ea-1',
      recordedByUserId: 'ea-1',
      sinceDate: '2026-06-12',
      order: 'desc',
    });
    expect(mockGetAssessmentCountsSince).toHaveBeenCalledWith({
      userId: 'ea-1',
    });
    expect(mockGetTimeEntries).not.toHaveBeenCalled();
    expect(mockGetSessionCountsSince).not.toHaveBeenCalled();
    expect(mockGetLetterResults).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('keeps existing stats usable and clears loading when a stats read fails', async () => {
    let rejectSessions;
    mockGetSessions.mockImplementationOnce(() => new Promise((resolve, reject) => {
      rejectSessions = reject;
    }));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const screen = renderHome();

    expect(screen.getByLabelText('Loading statistics')).toBeTruthy();

    await act(async () => {
      rejectSessions(new Error('stats database unavailable'));
    });

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Error loading Home statistics:',
        expect.objectContaining({ message: 'stats database unavailable' }),
      );
    });
    expect(screen.queryByLabelText('Loading statistics')).toBeNull();
    expect(screen.getByText('Couldn’t load today’s sessions')).toBeTruthy();
    expect(screen.queryByLabelText('Needs your attention')).toBeNull();

    consoleError.mockRestore();
  });

  test('a normal day shows no attention area', async () => {
    mockUseChildren.mockReturnValue({ children: [{ id: 'c1', first_name: 'A' }] });
    mockGetAssessmentCountsSince.mockResolvedValue([{ child_id: 'c1', count: 1 }]);
    const screen = renderHome();
    await waitFor(() => expect(screen.getByText('2 of 3 sessions today')).toBeTruthy());
    expect(screen.queryByLabelText('Needs your attention')).toBeNull();
    expect(screen.queryByText('WHO TO SEE NEXT')).toBeNull();
    expect(screen.queryByText('RECENT')).toBeNull();
  });

  test('sync attention card opens Sync status and stays while syncing', async () => {
    mockUseOffline.mockReturnValue({
      isOnline: true, isSyncing: true, waitingCount: 0, needsAttentionCount: 2, syncStatus: { failedItems: [] },
    });
    const navigation = { navigate: jest.fn() };
    const screen = renderHome(navigation);
    fireEvent.press(await screen.findByLabelText('2 items need attention. Open sync status to sort it out'));
    expect(navigation.navigate).toHaveBeenCalledWith('SyncStatus');
  });

  test('an auto clock-out published after the first load appears without navigation', async () => {
    const screen = renderHome();
    await waitFor(() => expect(screen.getByText('2 of 3 sessions today')).toBeTruthy());
    expect(screen.queryByText('Clocked out after 10 hours')).toBeNull();

    mockUseTimeTracking.mockReturnValue({
      ...defaultTimeTracking,
      autoClockOutNotice: {
        entryId: 'time-1', userId: 'ea-1', signInTime: new Date(Date.now() - 11 * 3600e3).toISOString(),
        detectedAt: new Date().toISOString(), dismissedAt: null,
      },
    });
    screen.rerender(<PaperProvider><HomeScreen navigation={{ navigate: jest.fn() }} /></PaperProvider>);

    expect(await screen.findByText('Clocked out after 10 hours')).toBeTruthy();
  });

  test('dismissing the auto clock-out card calls the provider with its entry', async () => {
    const dismiss = jest.fn();
    mockUseTimeTracking.mockReturnValue({
      ...defaultTimeTracking,
      autoClockOutNotice: {
        entryId: 'time-9', userId: 'ea-1', signInTime: new Date().toISOString(),
        detectedAt: new Date().toISOString(), dismissedAt: null,
      },
      dismissAutoClockOutNotice: dismiss,
    });
    const screen = renderHome();
    fireEvent.press(await screen.findByLabelText('Dismiss: Clocked out after 10 hours'));
    expect(dismiss).toHaveBeenCalledWith('time-9');
  });

  test('dismissing the assessment card hides it for today', async () => {
    mockUseChildren.mockReturnValue({ children: [{ id: 'c1', first_name: 'A' }, { id: 'c2', first_name: 'B' }] });
    mockGetAssessmentCountsSince.mockResolvedValue([{ child_id: 'c1', count: 1 }]);
    const screen = renderHome();
    fireEvent.press(await screen.findByLabelText('Dismiss: 1 child to assess'));
    await waitFor(() => expect(screen.queryByText('1 child to assess')).toBeNull());
    expect(mockDismissAssessmentForDay).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  test('returning to the foreground reloads the stats', async () => {
    const { AppState } = require('react-native');
    const listeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      listeners.push(fn);
      return { remove: jest.fn() };
    });
    renderHome();
    await waitFor(() => expect(mockGetSessionsTodayGoal).toHaveBeenCalledTimes(1));
    await act(async () => { listeners.forEach((fn) => fn('active')); });
    await waitFor(() => expect(mockGetSessionsTodayGoal).toHaveBeenCalledTimes(2));
  });

  test('an EA with no active programme sees that, not a load failure', async () => {
    mockGetSessionsTodayGoal.mockResolvedValue(null);
    mockGetActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: false, programme: null });
    const screen = renderHome();
    expect(await screen.findByText('No active programme')).toBeTruthy();
    expect(screen.getByText('Contact your supervisor to be assigned.')).toBeTruthy();
    expect(screen.queryByText('Couldn’t load today’s sessions')).toBeNull();
  });

  test('an assigned programme not yet on the phone says it will arrive with sync', async () => {
    mockGetSessionsTodayGoal.mockResolvedValue(null);
    mockGetActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: true, programme: null });
    const screen = renderHome();
    expect(await screen.findByText('Programme details aren’t on this phone yet')).toBeTruthy();
    expect(screen.queryByText('Couldn’t load today’s sessions')).toBeNull();
  });

  test('a fixed red strip keeps the light status bar readable when the hero scrolls away', async () => {
    const screen = renderHome();
    const strip = await screen.findByTestId('home-status-bar-backdrop');
    expect(strip.props.style).toEqual(expect.objectContaining({
      position: 'absolute', top: 0, backgroundColor: '#C81F3E',
    }));
  });

  test('omits the subtitle when there is no programme or school', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'ea-1' }, profile: { first_name: 'Alice' } });
    mockGetActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: false, programme: null });
    const screen = renderHome();
    await waitFor(() => expect(screen.getByText('Molo, Alice.')).toBeTruthy());
    expect(screen.queryByText(/ · /)).toBeNull();
  });

  test('a failed refresh keeps the last good stats on screen', async () => {
    const { AppState } = require('react-native');
    const listeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      listeners.push(fn);
      return { remove: jest.fn() };
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const screen = renderHome();
    await waitFor(() => expect(screen.getByText('2 of 3 sessions today')).toBeTruthy());

    mockGetSessions.mockRejectedValueOnce(new Error('busy'));
    await act(async () => { listeners.forEach((fn) => fn('active')); });

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(screen.getByText('2 of 3 sessions today')).toBeTruthy();
    consoleError.mockRestore();
  });

  test('Home owns a light status bar only while focused', async () => {
    const screen = renderHome();
    await waitFor(() => expect(mockStatusBar).toHaveBeenCalledWith(expect.objectContaining({ style: 'light' })));

    mockStatusBar.mockClear();
    mockIsFocused.mockReturnValue(false);
    screen.rerender(<PaperProvider><HomeScreen navigation={{ navigate: jest.fn() }} /></PaperProvider>);

    expect(mockStatusBar).not.toHaveBeenCalled();
  });
  test('assessment-due coverage includes class-only children while sessions keep their own goal', async () => {
    const delivery = { id: 'delivery' };
    mockUseChildren.mockReturnValue({ children: [delivery] });
    useAssessableChildren.mockReturnValue({ all: [delivery, { id: 'control' }], loading: false });
    mockGetAssessmentCountsSince.mockResolvedValue([{ child_id: 'delivery', count: 1 }]);
    const screen = renderHome();
    expect(await screen.findByText('1 of 2 children assessed')).toBeTruthy();
    expect(screen.getByText('1 child to assess')).toBeTruthy();
    expect(screen.getByText('2 of 3 sessions today')).toBeTruthy();
  });

});

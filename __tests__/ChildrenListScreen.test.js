jest.mock('../src/hooks/useAssessableChildren', () => ({ useAssessableChildren: jest.fn() }));
import { useAssessableChildren } from '../src/hooks/useAssessableChildren';
beforeEach(() => useAssessableChildren.mockImplementation(() => {
  const state = require('../src/context/ChildrenContext').useChildren();
  const all = state.children ?? state.allChildren ?? [];
  return { all, yourChildren: all, restOfClass: [], loading: false };
}));
jest.mock('../src/services/assessmentHistoryStatus', () => ({
  ...jest.requireActual('../src/services/assessmentHistoryStatus'),
  useAssessmentHistoryStatus: () => ({ running: false, pageVersion: 0, runVersion: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const mockUseChildren = jest.fn();
const mockUseClasses = jest.fn();
const mockUseOffline = jest.fn();
const mockGetLetterResults = jest.fn();
const mockGetAcademicYears = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: (cb) => require('react').useEffect(() => cb(), [cb]),
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../src/context/SignedInEAContext', () => ({
  useSignedInEA: () => ({ repositories: {
    assessments: { getLetterResults: mockGetLetterResults },
    academicYears: { getAll: mockGetAcademicYears },
  } }),
}));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockUseChildren() }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => mockUseClasses() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));

import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text } from 'react-native';
import { act, fireEvent, within } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import ChildrenListScreen from '../src/screens/main/ChildrenListScreen';
import { classRowLabel } from '../src/utils/childrenPresentation';
import { colors } from '../src/constants/colors';
import { FAB_OVERHANG } from '../src/components/navigation/LockedBottomTabBar';

const navigation = { navigate: jest.fn(), setOptions: jest.fn() };
const classes = [
  { id: 'class-1', name: 'Grade 1A', grade: 'Grade 1', school_id: 'school-1', teacher: 'Teacher A', home_language: 'isiXhosa', synced: true },
  { id: 'class-2', name: 'Grade 2B', grade: 'Grade 2', school_id: 'school-2', teacher: 'Teacher B', home_language: 'English', synced: false },
];
const roster = Array.from({ length: 18 }, (_, i) => ({
  id: `child-${i}`, first_name: ['Amahle', 'Buhle', 'Cebo'][i % 3], last_name: 'Dlamini', class_id: 'class-1', synced: true,
}));
const unassigned = { id: 'unassigned', first_name: 'Lwazi', last_name: 'Booi', age: 7, gender: 'male', synced: true };
const children = [...roster, unassigned];
let classState;
let childState;
let offline;
const rowLabel = (index) => classRowLabel({
  ...classes[index], schoolName: index === 0 ? 'Duna Primary' : 'Masi Primary',
  language: classes[index].home_language, childCount: index === 0 ? 18 : 0,
  groupCount: index === 0 ? 4 : 0, unsynced: !classes[index].synced,
});
async function renderScreen() {
  const screen = renderWithProviders(<ChildrenListScreen navigation={navigation} />);
  await act(async () => {});
  navigation.navigate.mockClear(); // The retained single-class auto-route is independent of row presses.
  return screen;
}
function emptyClasses(status = 'available') {
  classState = { ...classState, classes: [], classBootstrapStatus: status };
  childState = { ...childState, children: [] };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockGetLetterResults.mockResolvedValue([]);
  mockGetAcademicYears.mockResolvedValue([
    { id: 'year-2026', starts_on: '2026-01-01', ends_on: '2026-12-31', is_active: true },
  ]);
  childState = { children, groups: [], childrenGroups: roster.slice(0, 4).map((c, i) => ({ child_id: c.id, group_id: `g-${i}` })), loading: false, loadChildren: jest.fn() };
  classState = {
    classes, schools: [{ id: 'school-1', name: 'Duna Primary' }, { id: 'school-2', name: 'Masi Primary' }],
    loading: false, classBootstrapStatus: 'available', loadClasses: jest.fn(),
    getChildrenInClass: (id) => roster.filter(c => c.class_id === id),
  };
  offline = { isOnline: true, isSyncing: false, waitingCount: 0, needsAttentionCount: 0, syncNow: jest.fn(), refreshSyncStatus: jest.fn() };
  mockUseChildren.mockImplementation(() => childState);
  mockUseClasses.mockImplementation(() => classState);
  mockUseOffline.mockImplementation(() => offline);
});

test('renders the stat bar with accessible counts', async () => {
  const screen = await renderScreen();
  expect(await screen.findByLabelText('19 children')).toBeTruthy();
  expect(screen.getByLabelText('2 classes')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '19 unassessed children. Open Assess' }));
  expect(navigation.navigate).toHaveBeenCalledWith('MainTabs', { screen: 'Assessments' });
});
test('unassessed uses active-year letter results including another EA battery result', async () => {
  mockGetLetterResults.mockResolvedValue([
    { child_id: 'child-0', question_code: 'letter_sounds', stopped_reason: 'completed', assessment_date: '2026-01-01' },
    { child_id: 'child-1', user_id: 'other-ea', battery_run_id: 'run-1', question_code: 'letter_sounds', stopped_reason: 'completed', assessment_date: '2026-12-31' },
    { child_id: 'child-2', question_code: 'letter_sounds', stopped_reason: 'skipped_tired', assessment_date: '2026-04-01' },
    { child_id: 'child-3', question_code: 'letter_sounds', stopped_reason: 'completed', assessment_date: '2025-12-31' },
  ]);
  const screen = await renderScreen();
  expect(screen.getByRole('button', { name: '17 unassessed children. Open Assess' })).toBeTruthy();
  expect(mockGetLetterResults).toHaveBeenCalledWith({ userId: 'user-1' });
});
test('all active children remain unassessed without an active academic year', async () => {
  mockGetAcademicYears.mockResolvedValue([]);
  mockGetLetterResults.mockResolvedValue(children.map(child => ({
    child_id: child.id, question_code: 'letter_sounds', stopped_reason: 'completed', assessment_date: '2026-06-01',
  })));
  const screen = await renderScreen();
  expect(screen.getByRole('button', { name: '19 unassessed children. Open Assess' })).toBeTruthy();
});
test('unassessed at zero is plain text, not a button', async () => {
  mockGetLetterResults.mockResolvedValue(children.map(c => ({
    child_id: c.id, question_code: 'letter_sounds', stopped_reason: 'completed', assessment_date: '2026-06-01',
  })));
  const screen = await renderScreen();
  expect(screen.getByLabelText('0 unassessed children')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /unassessed/i })).toBeNull();
});
test('class row content and navigation', async () => {
  const screen = await renderScreen();
  const first = screen.getByRole('button', { name: rowLabel(0) });
  expect(within(first).getByText('18 children')).toBeTruthy();
  expect(within(first).getByText(' · 4 groups')).toBeTruthy();
  expect(within(first).getAllByTestId('avatar', { includeHiddenElements: true }).map(n => within(n).UNSAFE_getByType(Text).props.children)).toEqual(['1', 'AD', 'BD', 'CD']);
  expect(within(first).queryByText('Unsynced')).toBeNull();
  fireEvent.press(first);
  expect(navigation.navigate).toHaveBeenCalledWith('ClassDetail', { classId: 'class-1' });
  const second = screen.getByRole('button', { name: rowLabel(1) });
  expect(within(second).getByText('0 children')).toBeTruthy();
  expect(within(second).queryByTestId('avatar-ring', { includeHiddenElements: true })).toBeNull();
  expect(within(second).getByText('Unsynced')).toBeTruthy();
});
test('monograms come from all classes, not the filtered list', async () => {
  const screen = await renderScreen();
  expect(screen.getByText('1', { includeHiddenElements: true })).toBeTruthy();
  expect(within(screen.getByRole('button', { name: rowLabel(1) })).getByText('2', { includeHiddenElements: true })).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Search classes'), '1A');
  expect(screen.getByText('1', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.queryByText('1A', { includeHiddenElements: true })).toBeNull();
});
test('search filters by class name, school and teacher and keeps the same input across re-renders', async () => {
  const screen = await renderScreen();
  const input = screen.getByLabelText('Search classes');
  expect(input.props).toMatchObject({ autoCorrect: false, spellCheck: false, autoComplete: 'off' });
  for (const term of ['Duna', 'Teacher A', '1A']) {
    fireEvent.changeText(input, term);
    expect(screen.getByRole('button', { name: rowLabel(0) })).toBeTruthy();
    expect(screen.queryByRole('button', { name: rowLabel(1) })).toBeNull();
    expect(screen.getByLabelText('Search classes')).toBe(input);
  }
});
test('a background pull keeps cached content', async () => {
  const screen = await renderScreen();
  const input = screen.getByLabelText('Search classes');
  fireEvent.changeText(input, 'Gr');
  classState = { ...classState, loading: true };
  childState = { ...childState, loading: true };
  screen.rerender(<ChildrenListScreen navigation={navigation} />);
  expect(screen.getByLabelText('Search classes')).toBe(input);
  expect(input.props.value).toBe('Gr');
  expect(screen.queryByText('Loading classes and children…')).toBeNull();
  expect(screen.getByLabelText('19 children')).toBeTruthy();
  expect(screen.getByLabelText('2 classes')).toBeTruthy();
});
test('no match keeps the footer and clear search restores the rows', async () => {
  const screen = await renderScreen();
  fireEvent.changeText(screen.getByLabelText('Search classes'), 'Grade 3');
  expect(screen.getByText('No matching classes for “Grade 3”')).toBeTruthy();
  expect(screen.getByText('Searches class name, school and teacher.')).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Classes' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Unassigned children (1)' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add another class' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
  expect(screen.getByRole('button', { name: rowLabel(0) })).toBeTruthy();
  expect(screen.getByRole('button', { name: rowLabel(1) })).toBeTruthy();
});
test('loading with no classes hides search and stats', async () => {
  emptyClasses();
  classState.loading = true;
  const screen = await renderScreen();
  expect(screen.getByText('Loading classes and children…')).toBeTruthy();
  expect(screen.queryByLabelText('Search classes')).toBeNull();
  expect(screen.queryByText('Unassessed')).toBeNull();
});
test('checking shows the stat labels', async () => {
  emptyClasses('checking');
  const screen = await renderScreen();
  expect(screen.getByText('Checking for assigned classes…')).toBeTruthy();
  expect(screen.getByLabelText('0 children')).toBeTruthy();
});
test('no programme explains setup and refreshing without a search field', async () => {
  emptyClasses('no_active_programme');
  const screen = await renderScreen();
  expect(screen.getByText('Programme setup needed')).toBeTruthy();
  expect(screen.getByText('Ask Head Office to assign your active programme before creating a class.')).toBeTruthy();
  expect(screen.getByText('Then pull down to refresh.')).toBeTruthy();
  expect(screen.queryByLabelText('Search classes')).toBeNull();
});
test('no classes offers Start setup without an emoji or search', async () => {
  emptyClasses();
  const screen = await renderScreen();
  expect(screen.getByText('No classes yet')).toBeTruthy();
  expect(screen.getByText('Create your first class to start adding children')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Start setup' }));
  expect(navigation.navigate).toHaveBeenCalledWith('ClassOnboarding');
  expect(screen.queryByText('📚')).toBeNull();
  expect(screen.queryByLabelText('Search classes')).toBeNull();
});
test('banner follows the transport state', async () => {
  offline.waitingCount = 3;
  const screen = await renderScreen();
  expect(screen.getByText('3 items waiting to sync')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Sync now' }));
  expect(offline.syncNow).toHaveBeenCalledWith({ force: true });
  offline.isOnline = false;
  screen.rerender(<ChildrenListScreen navigation={navigation} />);
  expect(screen.getByText('3 items will sync when you’re online')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
  offline.isOnline = true;
  offline.isSyncing = true;
  screen.rerender(<ChildrenListScreen navigation={navigation} />);
  expect(screen.getByText('Syncing 3 items…')).toBeTruthy();
  offline.waitingCount = 0;
  screen.rerender(<ChildrenListScreen navigation={navigation} />);
  expect(screen.queryByTestId('sync-banner')).toBeNull();
});
test('banner counts waitingCount, not unsynced rows', async () => {
  const screen = await renderScreen();
  expect(screen.queryByTestId('sync-banner')).toBeNull();
  classState = { ...classState, classes: classes.map(c => ({ ...c, synced: true })) };
  offline.waitingCount = 5;
  screen.rerender(<ChildrenListScreen navigation={navigation} />);
  await act(async () => {});
  expect(screen.getByText('5 items waiting to sync')).toBeTruthy();
});
test('unassigned row opens Edit child', async () => {
  const screen = await renderScreen();
  expect(screen.getByText('These children are not in a class yet. Tap to edit and assign them.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Lwazi Booi, Age 7 • Male. Not in a class. Edit to assign' }));
  expect(navigation.navigate).toHaveBeenCalledWith('EditChild', { childId: 'unassigned' });
});
test('Add another class opens CreateClass', async () => {
  const screen = await renderScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Add another class' }));
  expect(navigation.navigate).toHaveBeenCalledWith('CreateClass');
});
test('list padding clears the Record button and supports the keyboard and refresh', async () => {
  const screen = await renderScreen();
  const list = screen.UNSAFE_getByType(FlatList);
  expect(StyleSheet.flatten(list.props.contentContainerStyle).paddingBottom).toBe(FAB_OVERHANG + 16);
  expect(list.props).toMatchObject({ keyboardShouldPersistTaps: 'handled', keyboardDismissMode: 'on-drag', scrollEventThrottle: 16 });
  expect(screen.UNSAFE_getByType(RefreshControl).props).toMatchObject({ tintColor: colors.primary, colors: [colors.primary] });
  fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 20 } } });
  expect(navigation.setOptions).toHaveBeenCalledWith({ headerScrolled: true });
});

test('Unassessed uses class scope without widening child counts or class rows', async () => {
  useAssessableChildren.mockReturnValue({ all: [...children, { id: 'control', first_name: 'Cora', last_name: 'Control' }], loading: false });
  const screen = await renderScreen();
  expect(await screen.findByRole('button', { name: '20 unassessed children. Open Assess' })).toBeTruthy();
  expect(screen.getByLabelText('19 children')).toBeTruthy();
  expect(screen.getByLabelText('2 classes')).toBeTruthy();
  expect(screen.queryByText('Cora Control')).toBeNull();
});

const mockUseAuth = jest.fn();
const mockUseOffline = jest.fn();
const mockUseClasses = jest.fn();
const mockUseLookupsContext = jest.fn();
const mockUseChildren = jest.fn();
const mockPersistLiteracySession = jest.fn();
const mockRefreshSyncStatus = jest.fn();
const mockTriggerBackgroundSync = jest.fn();

jest.mock('@expo/vector-icons', () => new Proxy({}, {
  get: (target, prop) => {
    if (prop === '__esModule') return true;
    if (!target[prop]) target[prop] = () => null;
    return target[prop];
  },
}), { virtual: true });

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => ({
  __esModule: true,
  default: () => null,
}), { virtual: true });

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 320, height: 640 };
  const SafeAreaInsetsContext = React.createContext(insets);
  const SafeAreaFrameContext = React.createContext(frame);
  return {
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    SafeAreaProvider: ({ children }) => children,
    SafeAreaConsumer: SafeAreaInsetsContext.Consumer,
    initialWindowMetrics: { insets, frame },
  };
});

jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => mockUseClasses() }));
jest.mock('../src/context/LookupsContext', () => ({ useLookupsContext: () => mockUseLookupsContext() }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockUseChildren() }));
jest.mock('../src/services/literacySessionPersistence', () => ({
  persistLiteracySession: (...args) => mockPersistLiteracySession(...args),
}));

import React from 'react';
import { AllProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import { BackHandler, FlatList, Platform, StyleSheet } from 'react-native';
import SegmentedControl from '../src/components/common/SegmentedControl';
import InlineNote from '../src/components/common/InlineNote';
import { colors } from '../src/constants/colors';
import LetterToggleGrid from '../src/components/sessions/LetterToggleGrid';
import ChildSelector from '../src/components/children/ChildSelector';
import { render } from '@testing-library/react-native';
import useWindowDimensions from 'react-native/Libraries/Utilities/useWindowDimensions';
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })),
}));
import LiteracySessionForm from '../src/screens/sessions/LiteracySessionForm';
import { READING_LEVELS } from '../src/constants/literacyConstants';

const COMMENTS_PLACEHOLDER = 'Add session notes…';
const mockCompleteMounted = jest.fn();
function HomeStub() { return null; }
function SessionCompleteStub({ route }) {
  React.useEffect(() => { mockCompleteMounted(route.params); }, []);
  return null;
}
const renderForm = () => renderInTestStack({
  routes: [
    { name: 'Home', component: HomeStub },
    { name: 'SessionForm', component: LiteracySessionForm },
    { name: 'SessionComplete', component: SessionCompleteStub },
  ],
  initialIndex: 1,
  wrapper: AllProviders,
});

describe('LiteracySessionForm', () => {
  const originalTimeZone = process.env.TZ;

  beforeEach(() => {
    jest.clearAllMocks();
    useWindowDimensions.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    mockUseAuth.mockReturnValue({
      user: { id: 'ea-1' },
      profile: {},
    });
    mockUseOffline.mockReturnValue({
      refreshSyncStatus: mockRefreshSyncStatus,
      triggerBackgroundSync: mockTriggerBackgroundSync,
    });
    mockUseClasses.mockReturnValue({
      classes: [{ id: 'class-1', name: 'Grade 1A', home_language: 'English' }],
    });
    mockUseLookupsContext.mockReturnValue({ jobTitles: [] });
    mockUseChildren.mockReturnValue({
      children: [{ id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' }],
      groups: [],
      getChildrenInGroup: () => [],
    });
    mockPersistLiteracySession.mockResolvedValue(true);
    mockRefreshSyncStatus.mockResolvedValue({ unsyncedCount: 1 });
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env.TZ = originalTimeZone;
  });

  const submitValidForm = (screen) => {
    fireEvent.press(screen.getByText('Amahle Dlamini'));
    fireEvent.press(screen.getByLabelText('A, not selected'));
    fireEvent.press(screen.getByText('Select a level'));
    fireEvent.press(screen.getByText(READING_LEVELS[0]));
    fireEvent.press(screen.getByText('Submit Session'));
  };

  test('renders the session-capture form scaffold', () => {
    const screen = renderForm();

    expect(screen.getByRole('header', { name: 'Step 1: Session date, complete' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Step 2: Select children' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Children' }).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByRole('tab', { name: 'Groups' }).props.accessibilityState).toEqual({ selected: false });
    expect(screen.queryByText('Select by Group')).toBeNull();
    expect(screen.getByRole('header', { name: 'Step 3: Letters focused on' })).toBeTruthy();
    expect(screen.getByText('Submit Session')).toBeTruthy();
  });

  test('selects a calendar key, cancels without changing it, and guards a changed date', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-15T08:00:00Z'));
    const screen = renderForm();
    fireEvent.press(screen.getByRole('button', { name: 'Session date, Today · Thu 15 Oct. Change date' }));
    expect(within(screen.getByTestId('bottom-sheet-panel')).getByRole('header', { name: 'Session date' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Mon 12 October 2026' }));
    expect(screen.queryByLabelText('Dismiss session date picker')).toBeNull();
    const dateField = () => screen.getByRole('button', { name: 'Session date, Mon 12 Oct 2026. Change date' });
    fireEvent.press(dateField());
    fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(dateField()).toBeTruthy();
    fireEvent.press(dateField());
    expect(screen.getByRole('header', { name: 'October 2026' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mon 12 October 2026' }).props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    act(() => { screen.navigationRef.goBack(); });
    expect(screen.getByText('Discard this session?')).toBeTruthy();
  });

  test('Auckland field, calendar and saved session all keep the selected programme day', async () => {
    process.env.TZ = 'Pacific/Auckland';
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-18T10:00:00Z'));
    const screen = renderForm();
    fireEvent.press(screen.getByRole('button', { name: 'Session date, Today · Sun 18 Oct. Change date' }));
    expect(screen.getByRole('button', { name: 'Sun 18 October 2026' }).props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Fri 16 October 2026' }));
    fireEvent.press(screen.getByRole('button', { name: 'Session date, Fri 16 Oct 2026. Change date' }));
    expect(screen.getByRole('button', { name: 'Fri 16 October 2026' }).props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    submitValidForm(screen);
    await waitFor(() => expect(mockPersistLiteracySession).toHaveBeenCalledWith(expect.objectContaining({
      session: expect.objectContaining({ session_date: '2026-10-16' }),
    })));
    await act(async () => { jest.runOnlyPendingTimers(); });
  });

  test('scrolling updates the navigator hairline at the top boundary', () => {
    const screen = renderForm();
    const list = screen.UNSAFE_getByType(FlatList);
    const scrollTo = y => fireEvent.scroll(list, { nativeEvent: {
      contentOffset: { y, x: 0 }, contentSize: { width: 390, height: 1800 },
      layoutMeasurement: { width: 390, height: 700 },
    } });
    scrollTo(1);
    expect(screen.navigationRef.getCurrentOptions().headerScrolled).toBe(true);
    scrollTo(20);
    expect(screen.navigationRef.getCurrentOptions().headerScrolled).toBe(true);
    scrollTo(0);
    expect(screen.navigationRef.getCurrentOptions().headerScrolled).toBe(false);
  });

  test.each(['ios', 'android'])('the canvas column and %s keyboard inset policy reach the list', platform => {
    const replacement = jest.replaceProperty(Platform, 'OS', platform);
    try {
      const screen = renderForm();
      const list = screen.UNSAFE_getByType(FlatList);
      expect(StyleSheet.flatten(list.props.contentContainerStyle)).toMatchObject({ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 34 });
      expect(StyleSheet.flatten(screen.getByTestId('literacy-session-form').props.style)).toMatchObject({ flex: 1, backgroundColor: colors.background });
      expect(list.props.automaticallyAdjustKeyboardInsets).toBe(platform === 'ios');
    } finally {
      replacement.restore();
    }
  });

  test('switches the compact picker from child rows to group rows', () => {
    const groupChildren = [
      { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' },
      { id: 'child-2', first_name: 'Buhle', last_name: 'Moyo', class_id: 'class-1' },
    ];
    mockUseChildren.mockReturnValue({
      children: groupChildren,
      groups: [{ id: 'group-4', name: 'Group 4' }],
      getChildrenInGroup: (groupId) => (groupId === 'group-4' ? groupChildren : []),
    });
    const screen = renderForm();

    fireEvent.press(screen.getByRole('tab', { name: 'Groups' }));

    expect(screen.getByText('Group 4')).toBeTruthy();
    expect(screen.getByText('2 children')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search groups…')).toBeTruthy();
    expect(screen.queryByText('Amahle Dlamini')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Groups' }).props.accessibilityState).toEqual({ selected: true });
  });

  test('selecting a group chooses its children and keeps them editable in Children mode', async () => {
    const groupChildren = [
      { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' },
      { id: 'child-2', first_name: 'Buhle', last_name: 'Moyo', class_id: 'class-1' },
    ];
    mockUseChildren.mockReturnValue({
      children: groupChildren,
      groups: [{ id: 'group-4', name: 'Group 4' }],
      getChildrenInGroup: (groupId) => (groupId === 'group-4' ? groupChildren : []),
    });
    const screen = renderForm();

    fireEvent.press(screen.getByRole('tab', { name: 'Groups' }));
    fireEvent.press(screen.getByText('Group 4'));

    expect(screen.getByText('2 selected')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Group 4, 2 children' }).props.accessibilityState.checked).toBe(true);

    fireEvent.press(screen.getByRole('tab', { name: 'Children' }));
    expect(screen.getByRole('checkbox', { name: 'Amahle Dlamini, Grade 1A' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Buhle Moyo, Grade 1A' }).props.accessibilityState.checked).toBe(true);

    fireEvent.press(screen.getByLabelText('A, not selected'));
    fireEvent.press(screen.getByText('Select a level'));
    fireEvent.press(screen.getByText(READING_LEVELS[0]));
    fireEvent.press(screen.getByText('Submit Session'));

    await waitFor(() => expect(mockPersistLiteracySession).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          children_ids: ['child-1', 'child-2'],
        }),
      }),
    ));
  });

  test('child checkboxes and the chip reflect selection, including No class', () => {
    mockUseChildren.mockReturnValue({
      children: [{ id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' },
        { id: 'child-2', first_name: 'Buhle', last_name: 'Moyo' }],
      groups: [], getChildrenInGroup: () => [],
    });
    const screen = renderForm();
    expect(screen.getByText('0 selected')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Amahle Dlamini, Grade 1A' }).props.accessibilityState.checked).toBe(false);
    fireEvent.press(screen.getByRole('checkbox', { name: 'Amahle Dlamini, Grade 1A' }));
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Amahle Dlamini, Grade 1A' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Buhle Moyo, No class' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Step 2: Select children, complete' })).toBeTruthy();
  });

  test('a group replaces the selection and tapping the selected group clears it', () => {
    const children = [
      { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' },
      { id: 'child-2', first_name: 'Buhle', last_name: 'Moyo', class_id: 'class-1' },
      { id: 'child-3', first_name: 'Zola', last_name: 'Moyo', class_id: 'class-1' },
    ];
    mockUseChildren.mockReturnValue({ children, groups: [{ id: 'g4', name: 'Group 4' }], getChildrenInGroup: () => children.slice(0, 2) });
    const screen = renderForm();
    expect(screen.queryByText('Choosing a group replaces your selection.')).toBeNull();
    fireEvent.press(screen.getByRole('checkbox', { name: 'Zola Moyo, Grade 1A' }));
    fireEvent.press(screen.getByRole('tab', { name: 'Groups' }));
    expect(screen.getByText('Choosing a group replaces your selection.')).toBeTruthy();
    const group = () => screen.getByRole('radio', { name: 'Group 4, 2 children' });
    fireEvent.press(group());
    expect(screen.getByText('2 selected')).toBeTruthy();
    expect(group().props.accessibilityState.checked).toBe(true);
    fireEvent.press(group());
    expect(screen.getByText('0 selected')).toBeTruthy();
    expect(group().props.accessibilityState.checked).toBe(false);
  });

  test('missing children alert precedes the tabs in the step-2 section', () => {
    const screen = renderForm();
    fireEvent.press(screen.getByText('Submit Session'));
    expect(screen.getByRole('header', { name: 'Step 2: Select children, needs attention' })).toBeTruthy();
    expect(screen.getByText('Select at least one child')).toBeTruthy();
    expect(screen.getAllByRole('alert').some((note) => within(note).queryByText('Select at least one child'))).toBe(true);
    const section = screen.getByTestId('children-section');
    const note = section.findByType(InlineNote);
    const tabs = section.findByType(SegmentedControl);
    expect(section.children.indexOf(note.parent)).toBeLessThan(section.children.indexOf(tabs));
  });

  test('empty search and empty groups keep their exact copy', () => {
    const screen = renderForm();
    fireEvent.changeText(screen.getByPlaceholderText('Search children…'), 'no match');
    expect(screen.getByText('No children match your search')).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: 'Groups' }));
    expect(screen.getByText('No groups available')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search groups…').props.value).toBe('');
    fireEvent.changeText(screen.getByPlaceholderText('Search groups…'), 'no match');
    expect(screen.getByText('No groups match your search')).toBeTruthy();
  });

  test('roster getItemLayout uses the uniform 74dp height at font scale 1.3', () => {
    useWindowDimensions.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1.3 });
    const screen = renderForm();
    expect(screen.UNSAFE_getByType(FlatList).props.getItemLayout(null, 2)).toEqual({ length: 74, offset: 148, index: 2 });
  });

  test('roster forwards refs and scroll and reports visible and empty body measurements', () => {
    const onMetrics = jest.fn();
    const onScroll = jest.fn();
    const listRef = React.createRef();
    const childrenStepRef = React.createRef();
    const screen = render(<ChildSelector selectedChildren={[]} onSelectionChange={jest.fn()}
      listRef={listRef} childrenStepRef={childrenStepRef} onScroll={onScroll} onMetrics={onMetrics} />);
    expect(listRef.current).toBeTruthy();
    expect(childrenStepRef.current).toBeTruthy();
    expect(screen.UNSAFE_getByType(FlatList).props.onScroll).toBe(onScroll);
    expect(screen.UNSAFE_getByType(FlatList).props.scrollEventThrottle).toBe(16);
    fireEvent(screen.getByTestId('roster-header'), 'layout', { nativeEvent: { layout: { height: 400 } } });
    fireEvent(screen.getByTestId('children-section'), 'layout', { nativeEvent: { layout: { y: 140 } } });
    expect(onMetrics).toHaveBeenLastCalledWith({ headerHeight: 400, childrenSectionY: 140, bodyHeight: 64 });
    fireEvent.changeText(screen.getByPlaceholderText('Search children…'), 'no match');
    fireEvent(screen.getByTestId('roster-empty'), 'layout', { nativeEvent: { layout: { height: 58 } } });
    expect(onMetrics).toHaveBeenLastCalledWith({ headerHeight: 400, childrenSectionY: 140, bodyHeight: 58 });
    fireEvent.changeText(screen.getByPlaceholderText('Search children…'), '');
    expect(onMetrics).toHaveBeenLastCalledWith({ headerHeight: 400, childrenSectionY: 140, bodyHeight: 64 });
  });

  test('letters are lowercase with capital spoken names and complete when selected', () => {
    const screen = renderForm();
    expect(screen.getByRole('header', { name: 'Step 3: Letters focused on' })).toBeTruthy();
    expect(screen.getByText('Tap to select')).toBeTruthy();
    expect(screen.queryByText('Tap letters to select')).toBeNull();
    const tile = screen.getByLabelText('M, not selected');
    expect(tile.props.accessibilityState.selected).toBe(false);
    expect(within(tile).getByText('m')).toBeTruthy();
    fireEvent.press(tile);
    const selected = screen.getByLabelText('M, selected');
    expect(selected.props.accessibilityState.selected).toBe(true);
    expect(StyleSheet.flatten(selected.props.style).backgroundColor).toBe(colors.text);
    expect(screen.getByRole('header', { name: 'Step 3: Letters focused on, complete' })).toBeTruthy();
  });

  test('missing letters alert sits above the grid and clears on selection', () => {
    const screen = renderForm();
    fireEvent.press(screen.getByText('Submit Session'));
    const header = screen.getByRole('header', { name: 'Step 3: Letters focused on, needs attention' });
    const section = screen.getByTestId('letters-section');
    const note = section.findByType(InlineNote);
    const grid = section.findByType(LetterToggleGrid);
    expect(header).toBeTruthy();
    expect(within(section).getByRole('alert')).toHaveTextContent('Select at least one letter');
    expect(section.children.indexOf(note.parent)).toBeLessThan(section.children.indexOf(grid));
    fireEvent.press(screen.getByLabelText('M, not selected'));
    expect(screen.queryByText('Select at least one letter')).toBeNull();
    expect(screen.getByRole('header', { name: 'Step 3: Letters focused on, complete' })).toBeTruthy();
  });

  test('session level Cancel only dismisses, and choosing a level clears its inline error', () => {
    const screen = renderForm();
    const header = (name) => screen.getByRole('header', { name });
    expect(header('Step 4: Session reading level')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Focused on today, Select a level' }));
    const sheet = within(screen.getByTestId('bottom-sheet-panel'));
    expect(sheet.getByRole('header', { name: 'Session reading level' })).toBeTruthy();
    expect(sheet.getByText('What level did you focus on today?')).toBeTruthy();
    fireEvent.press(sheet.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Select a level')).toBeTruthy();
    expect(header('Step 4: Session reading level')).toBeTruthy();
    fireEvent.press(screen.getByText('Submit Session'));
    expect(header('Step 4: Session reading level, needs attention')).toBeTruthy();
    const section = screen.getByTestId('reading-level-section');
    expect(within(section).getAllByRole('alert')).toHaveLength(1);
    expect(within(section).getByRole('alert')).toHaveTextContent('Select a reading level');
    expect(within(section.children[0]).getByRole('header')).toBeTruthy();
    expect(within(section.children[1]).getByRole('alert')).toHaveTextContent('Select a reading level');
    expect(within(section.children[2]).getByRole('button', { name: 'Focused on today, Select a level' })).toBeTruthy();
    expect(StyleSheet.flatten(within(section).getByRole('button').props.style)).toMatchObject({ borderWidth: 2, borderColor: colors.error });
    fireEvent.press(screen.getByText('Select a level'));
    fireEvent.press(screen.getByText(READING_LEVELS[2]));
    expect(screen.queryByLabelText('Dismiss session reading level picker')).toBeNull();
    expect(screen.queryByText('Select a reading level')).toBeNull();
    expect(header('Step 4: Session reading level, complete')).toBeTruthy();
    expect(screen.getByRole('button', { name: `Focused on today, ${READING_LEVELS[2]}` })).toBeTruthy();
  });

  test('optional comments and child progress stay to-do and blocks follow selection order', () => {
    const children = [
      { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' },
      { id: 'child-2', first_name: 'Buhle', last_name: 'Moyo', class_id: 'class-1' },
    ];
    mockUseChildren.mockReturnValue({ children, groups: [], getChildrenInGroup: () => [] });
    const screen = renderForm();
    expect(screen.getByRole('header', { name: 'Step 5: Comments' })).toBeTruthy();
    expect(screen.getByText('Optional')).toBeTruthy();
    expect(screen.getByPlaceholderText(COMMENTS_PLACEHOLDER).props.accessibilityLabel).toBe('Comments, optional');
    expect(screen.queryByRole('header', { name: 'Step 6: Update child progress' })).toBeNull();
    fireEvent.changeText(screen.getByPlaceholderText(COMMENTS_PLACEHOLDER), 'Worked on blending');
    fireEvent.press(screen.getByRole('checkbox', { name: 'Buhle Moyo, Grade 1A' }));
    fireEvent.press(screen.getByRole('checkbox', { name: 'Amahle Dlamini, Grade 1A' }));
    expect(screen.getByRole('header', { name: 'Step 6: Update child progress' })).toBeTruthy();
    expect(screen.getAllByText('Optional')).toHaveLength(2);
    expect(screen.getByText('Record each child’s current level and update the letters they have mastered.')).toBeTruthy();
    const progress = within(screen.getByTestId('child-progress-section'));
    expect(progress.getAllByRole('button').map(row => row.props.accessibilityLabel)).toEqual([
      'Buhle Moyo, reading level, Not set', 'Buhle Moyo, letter tracker, Update',
      'Amahle Dlamini, reading level, Not set', 'Amahle Dlamini, letter tracker, Update',
    ]);
    expect(progress.getAllByText('Grade 1A')).toHaveLength(2);
    fireEvent.press(screen.getByLabelText('Buhle Moyo, reading level, Not set'));
    fireEvent.press(screen.getByText(READING_LEVELS[1]));
    expect(screen.queryByRole('header', { name: 'Step 5: Comments, complete' })).toBeNull();
    expect(screen.queryByRole('header', { name: 'Step 6: Update child progress, complete' })).toBeNull();
    ['Reading Levels', 'Letter Tracker', 'Update Child Progress (Optional)'].forEach(copy => expect(screen.queryByText(copy)).toBeNull());
  });

  describe('unsaved-changes leave guard', () => {
    const goBack = (screen) => act(() => { screen.navigationRef.goBack(); });
    const dirty = (screen) => fireEvent.changeText(screen.getByPlaceholderText(COMMENTS_PLACEHOLDER), 'worked on m sounds');

    test('a dirty form refuses removal and shows the discard sheet with the verbatim copy', () => {
      const screen = renderForm();
      dirty(screen);
      goBack(screen);
      expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);
      expect(screen.getByText('Discard this session?')).toBeTruthy();
      expect(screen.getByText('Your session details have not been saved. Leaving now will discard them.')).toBeTruthy();
      expect(screen.getByText('Discard')).toBeTruthy();
      expect(screen.getByText('Keep editing')).toBeTruthy();
    });

    test('"Keep editing" hides the sheet, keeps every value, and the guard stays armed', () => {
      const screen = renderForm();
      dirty(screen);
      goBack(screen);
      fireEvent.press(screen.getByText('Keep editing'));
      expect(screen.queryByText('Discard this session?')).toBeNull();
      expect(screen.getByPlaceholderText(COMMENTS_PLACEHOLDER).props.value).toBe('worked on m sounds');
      goBack(screen);
      expect(screen.getByText('Discard this session?')).toBeTruthy();
      expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);
    });

    test('"Discard" dispatches the stored action and leaves without a second prompt', () => {
      const screen = renderForm();
      dirty(screen);
      goBack(screen);
      fireEvent.press(screen.getByText('Discard'));
      expect(screen.routeNames()).toEqual(['Home']);
    });

    test('Android back with the sheet open keeps editing', () => {
      const backSpy = jest.spyOn(BackHandler, 'addEventListener');
      const screen = renderForm();
      dirty(screen);
      goBack(screen);
      expect(screen.getByText('Discard this session?')).toBeTruthy();
      const handlers = backSpy.mock.calls.filter(([event]) => event === 'hardwareBackPress');
      act(() => { handlers[handlers.length - 1][1](); });
      expect(screen.queryByText('Discard this session?')).toBeNull();
      expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);
      expect(screen.getByPlaceholderText(COMMENTS_PLACEHOLDER).props.value).toBe('worked on m sounds');
      backSpy.mockRestore();
    });

    test('choosing a session reading level alone makes the form dirty', () => {
      const screen = renderForm();
      fireEvent.press(screen.getByText('Select a level'));
      fireEvent.press(screen.getByText(READING_LEVELS[0]));
      goBack(screen);
      expect(screen.getByText('Discard this session?')).toBeTruthy();
      expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);
    });

    test('a clean form leaves without the sheet', () => {
      const screen = renderForm();
      goBack(screen);
      expect(screen.routeNames()).toEqual(['Home']);
      expect(screen.queryByText('Discard this session?')).toBeNull();
    });

    test('a successful submit leaves without the sheet', async () => {
      const screen = renderForm();
      submitValidForm(screen);
      await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));
      expect(mockCompleteMounted).toHaveBeenCalledWith({ childCount: 1 });
      expect(screen.routeNames()).toEqual(['Home', 'SessionComplete']);
      expect(screen.queryByText('Discard this session?')).toBeNull();
    });
  });

  describe('completion ordering', () => {
    test('attributes a new session to the South African programme day outside South Africa', async () => {
      process.env.TZ = 'America/New_York';
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-23T01:03:00.000Z'));
      const screen = renderForm();

      submitValidForm(screen);

      await waitFor(() => expect(mockPersistLiteracySession).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.objectContaining({
            session_date: '2026-07-23',
          }),
        }),
      ));
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
    });

    test('does not navigate before persistence commits', async () => {
      let resolvePersistence;
      mockPersistLiteracySession.mockReturnValue(new Promise(resolve => {
        resolvePersistence = resolve;
      }));
      const screen = renderForm();

      submitValidForm(screen);
      await waitFor(() => expect(mockPersistLiteracySession).toHaveBeenCalledTimes(1));
      expect(mockCompleteMounted).not.toHaveBeenCalled();
      expect(screen.routeNames()).toEqual(['Home', 'SessionForm']);

      await act(async () => { resolvePersistence(true); });
      await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));
      expect(mockCompleteMounted).toHaveBeenCalledWith({ childCount: 1 });
      expect(screen.routeNames()).toEqual(['Home', 'SessionComplete']);
    });

    test('navigates on commit without waiting for refresh and preserves completion side effects', async () => {
      mockRefreshSyncStatus.mockReturnValue(new Promise(() => {}));
      const screen = renderForm();

      submitValidForm(screen);

      await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));
      expect(mockCompleteMounted).toHaveBeenCalledWith({ childCount: 1 });
      expect(screen.routeNames()).toEqual(['Home', 'SessionComplete']);
      expect(mockRefreshSyncStatus).toHaveBeenCalledTimes(1);
      expect(mockTriggerBackgroundSync).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Discard this session?')).toBeNull();
    });

    test('keeps navigation successful when the non-blocking refresh rejects', async () => {
      const refreshError = new Error('status refresh failed');
      mockRefreshSyncStatus.mockRejectedValue(refreshError);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const screen = renderForm();

      submitValidForm(screen);

      await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));
      expect(mockCompleteMounted).toHaveBeenCalledWith({ childCount: 1 });
      expect(screen.routeNames()).toEqual(['Home', 'SessionComplete']);
      await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(
        'Error refreshing sync status after session save:', refreshError
      ));
      expect(mockTriggerBackgroundSync).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });
  });

  test('sets a reading level for the child whose picker was opened', async () => {
    mockUseChildren.mockReturnValue({
      children: [
        { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' },
        { id: 'child-2', first_name: 'Buhle', last_name: 'Moyo', class_id: 'class-1' },
      ],
      groups: [],
      getChildrenInGroup: () => [],
    });
    const screen = renderForm();

    fireEvent.press(screen.getByText('Amahle Dlamini'));
    fireEvent.press(screen.getByText('Buhle Moyo'));
    fireEvent.press(screen.getByLabelText('Buhle Moyo, reading level, Not set'));

    expect(screen.getByLabelText('Dismiss child reading level picker')).toBeTruthy();
    const childSheet = within(screen.getByTestId('bottom-sheet-panel'));
    expect(childSheet.getByRole('header', { name: 'Reading level' })).toBeTruthy();
    expect(childSheet.getByText('Buhle Moyo')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    fireEvent.press(screen.getByText(READING_LEVELS[1]));

    fireEvent.press(screen.getByLabelText('A, not selected'));
    fireEvent.press(screen.getByText('Select a level'));
    fireEvent.press(screen.getByText(READING_LEVELS[0]));
    fireEvent.press(screen.getByText('Submit Session'));

    await waitFor(() => expect(mockPersistLiteracySession).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          activities: expect.objectContaining({
            child_reading_levels: { 'child-2': READING_LEVELS[1] },
          }),
        }),
      }),
    ));
  });

  test('pre-fills a selected child from their saved current reading level', () => {
    mockUseChildren.mockReturnValue({
      children: [{
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        reading_level: READING_LEVELS[4],
      }],
      groups: [],
      getChildrenInGroup: () => [],
    });
    const screen = renderForm();

    fireEvent.press(screen.getByText('Amahle Dlamini'));

    expect(screen.getByText(READING_LEVELS[4])).toBeTruthy();
    expect(screen.queryByText('Not set')).toBeNull();
  });
});

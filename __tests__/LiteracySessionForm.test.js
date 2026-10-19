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
const ReactNative = require('react-native');
import { AllProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo, BackHandler, FlatList, Keyboard, Platform, StyleSheet } from 'react-native';
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
import { formatSessionDate } from '../src/utils/sessionDateFormat';

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
    fireEvent.press(screen.getByText('Submit session'));
  };

  test('renders the session-capture form scaffold', () => {
    const screen = renderForm();

    expect(screen.getByRole('header', { name: 'Step 1: Session date, complete' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Step 2: Select children' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Children' }).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByRole('tab', { name: 'Groups' }).props.accessibilityState).toEqual({ selected: false });
    expect(screen.queryByText('Select by Group')).toBeNull();
    expect(screen.getByRole('header', { name: 'Step 3: Letters focused on' })).toBeTruthy();
    expect(screen.getByText('Submit session')).toBeTruthy();
  });

  test('Submit session is a button outside the scrolling list, with no Snackbar', () => {
    const screen = renderForm();
    const button = screen.getByRole('button', { name: 'Submit session' });
    let parent = button.parent;
    while (parent) {
      expect(parent.type).not.toBe(FlatList);
      parent = parent.parent;
    }
    const source = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/sessions/LiteracySessionForm.js'), 'utf8');
    expect(source).not.toMatch(/Snackbar/);
  });

  test('Saving… is busy and unavailable and ignores a second press', async () => {
    let resolvePersistence;
    mockPersistLiteracySession.mockReturnValue(new Promise(resolve => { resolvePersistence = resolve; }));
    const screen = renderForm();
    submitValidForm(screen);
    const saving = screen.getByRole('button', { name: 'Saving…' });
    expect(saving.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    fireEvent.press(saving);
    expect(mockPersistLiteracySession).toHaveBeenCalledTimes(1);
    await act(async () => { resolvePersistence(true); });
    expect(mockCompleteMounted).toHaveBeenCalledTimes(1);
  });

  test.each(['ios', 'android'])('the %s keyboard hides Submit and restores it on dismiss', os => {
    const replacement = jest.replaceProperty(Platform, 'OS', os);
    const listeners = {};
    const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
      (listeners[event] ??= []).push(listener);
      return { remove: jest.fn() };
    });
    try {
      const screen = renderForm();
      const phase = os === 'ios' ? 'Will' : 'Did';
      act(() => listeners[`keyboard${phase}Show`].forEach(listener => listener({ endCoordinates: { height: 300 } })));
      expect(screen.queryByRole('button', { name: 'Submit session' })).toBeNull();
      expect(screen.queryByLabelText('Children missing. Go to step 2')).toBeNull();
      act(() => listeners[`keyboard${phase}Hide`].forEach(listener => listener()));
      expect(screen.getByRole('button', { name: 'Submit session' })).toBeTruthy();
      expect(screen.getByLabelText('Children missing. Go to step 2')).toBeTruthy();
    } finally {
      spy.mockRestore();
      replacement.restore();
    }
  });

  const summaryLabels = {
    children: 'Children missing. Go to step 2',
    letters: 'Letters missing. Go to step 3',
    readingLevel: 'Reading level missing. Go to step 4',
  };
  const inlineErrors = {
    children: 'Select at least one child',
    letters: 'Select at least one letter',
    readingLevel: 'Select a reading level',
  };
  const expectSubmitAvailable = screen => expect(screen.getByRole('button', { name: 'Submit session' }).props.accessibilityState.disabled).toBeFalsy();

  test('the fresh summary shows all three missing requirements and an available Submit', () => {
    const screen = renderForm();
    Object.values(summaryLabels).forEach(name => expect(screen.getByRole('button', { name })).toBeTruthy());
    expectSubmitAvailable(screen);
  });

  test('the summary follows children, letters, level and group selection without disabling Submit', () => {
    const children = [
      { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' },
      { id: 'child-2', first_name: 'Buhle', last_name: 'Moyo', class_id: 'class-1' },
    ];
    mockUseChildren.mockReturnValue({ children, groups: [{ id: 'g1', name: 'Group 1' }], getChildrenInGroup: () => children });
    const screen = renderForm();
    expectSubmitAvailable(screen);
    fireEvent.press(screen.getByRole('checkbox', { name: 'Amahle Dlamini, Grade 1A' }));
    expect(screen.getByLabelText('1 child, done')).toBeTruthy();
    expectSubmitAvailable(screen);
    fireEvent.press(screen.getByRole('checkbox', { name: 'Buhle Moyo, Grade 1A' }));
    expect(screen.getByLabelText('2 children, done')).toBeTruthy();
    expectSubmitAvailable(screen);
    fireEvent.press(screen.getByLabelText('A, not selected'));
    expect(screen.getByLabelText('1 letter, done')).toBeTruthy();
    expectSubmitAvailable(screen);
    fireEvent.press(screen.getByLabelText('M, not selected'));
    expect(screen.getByLabelText('2 letters, done')).toBeTruthy();
    expectSubmitAvailable(screen);
    fireEvent.press(screen.getByText('Select a level'));
    fireEvent.press(screen.getByText(READING_LEVELS[2]));
    expect(screen.getByLabelText('3 Letter Blends, done')).toBeTruthy();
    expectSubmitAvailable(screen);
    fireEvent.press(screen.getByRole('tab', { name: 'Groups' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Group 1, 2 children' }));
    expect(screen.getByRole('button', { name: summaryLabels.children })).toBeTruthy();
    expectSubmitAvailable(screen);
    fireEvent.press(screen.getByRole('radio', { name: 'Group 1, 2 children' }));
    expect(screen.getByLabelText('2 children, done')).toBeTruthy();
    expectSubmitAvailable(screen);
  });

  test.each(Array.from({ length: 8 }, (_, bits) => [Boolean(bits & 1), Boolean(bits & 2), Boolean(bits & 4)]))(
    'summary and Submit agree with child=%s, letter=%s, level=%s', async (child, letter, level) => {
      const screen = renderForm();
      if (child) fireEvent.press(screen.getByRole('checkbox', { name: 'Amahle Dlamini, Grade 1A' }));
      if (letter) fireEvent.press(screen.getByLabelText('A, not selected'));
      if (level) {
        fireEvent.press(screen.getByText('Select a level'));
        fireEvent.press(screen.getByText(READING_LEVELS[2]));
      }
      const keys = Object.keys(summaryLabels);
      const missing = keys.filter(key => screen.queryByRole('button', { name: summaryLabels[key] }));
      expect(missing).toEqual(keys.filter((_, index) => ![child, letter, level][index]));
      expectSubmitAvailable(screen);
      fireEvent.press(screen.getByRole('button', { name: 'Submit session' }));
      const shownErrors = keys.filter(key => screen.queryByText(inlineErrors[key]));
      expect(shownErrors).toEqual(missing);
      if (missing.length === 0) {
        await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));
        expect(screen.routeNames()).toEqual(['Home', 'SessionComplete']);
        expect(screen.queryByRole('alert')).toBeNull();
      } else {
        expect(screen.getAllByRole('alert')).toHaveLength(missing.length);
        expect(mockPersistLiteracySession).not.toHaveBeenCalled();
      }
    },
  );

  function measureSteps(screen) {
    const layout = (id, values) => fireEvent(screen.getByTestId(id), 'layout', { nativeEvent: { layout: values } });
    layout('roster-header', { height: 400 });
    layout('children-section', { y: 140 });
    layout('letters-section', { y: 0 });
    layout('reading-level-section', { y: 520 });
  }

  test.each([
    ['children', 28 + 140 - 12, 'Step 2: Select children'],
    ['letters', 28 + 400 + 64 - 12, 'Step 3: Letters focused on'],
    ['readingLevel', 28 + 400 + 64 + 520 - 12, 'Step 4: Session reading level'],
  ])('jumping to %s scrolls and focuses the measured step without adding errors', (key, offset, label) => {
    const screen = renderForm();
    const scroll = jest.spyOn(screen.UNSAFE_getByType(FlatList).instance, 'scrollToOffset').mockImplementation(() => {});
    const node = jest.spyOn(ReactNative, 'findNodeHandle').mockImplementation(ref => ref ? 101 : null);
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
    try {
      measureSteps(screen);
      fireEvent.press(screen.getByRole('button', { name: summaryLabels[key] }));
      expect(scroll).toHaveBeenCalledWith({ offset, animated: true });
      expect(node).toHaveBeenCalledTimes(1);
      expect(node.mock.calls[0][0].props.accessibilityLabel).toBe(label);
      expect(focus).toHaveBeenCalledTimes(1);
      expect(focus).toHaveBeenCalledWith(101);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('header', { name: /needs attention/ })).toBeNull();
    } finally {
      scroll.mockRestore(); node.mockRestore(); focus.mockRestore();
    }
  });

  test('a summary jump after a no-match search uses the measured empty row', () => {
    const screen = renderForm();
    const scroll = jest.spyOn(screen.UNSAFE_getByType(FlatList).instance, 'scrollToOffset').mockImplementation(() => {});
    const node = jest.spyOn(ReactNative, 'findNodeHandle').mockImplementation(ref => ref ? 102 : null);
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
    try {
      measureSteps(screen);
      fireEvent.changeText(screen.getByPlaceholderText('Search children…'), 'no match');
      fireEvent(screen.getByTestId('roster-empty'), 'layout', { nativeEvent: { layout: { height: 58 } } });
      fireEvent.press(screen.getByRole('button', { name: summaryLabels.readingLevel }));
      expect(scroll).toHaveBeenCalledWith({ offset: 28 + 400 + 58 + 520 - 12, animated: true });
      expect(focus).toHaveBeenCalledWith(102);
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      scroll.mockRestore(); node.mockRestore(); focus.mockRestore();
    }
  });

  describe('screen-reader summary jumps', () => {
    let frames;
    let requestFrame;
    let cancelFrame;
    let node;
    let focus;
    beforeEach(() => {
      jest.useFakeTimers();
      jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
      frames = new Map();
      let nextFrame = 0;
      requestFrame = jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
        frames.set(++nextFrame, callback);
        return nextFrame;
      });
      cancelFrame = jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => frames.delete(id));
      node = jest.spyOn(ReactNative, 'findNodeHandle').mockImplementation(ref => ref ? 301 : null);
      focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
    });
    afterEach(() => jest.restoreAllMocks());
    const nextFrame = () => act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(callback => callback());
    });

    test.each([
      ['letters', 28 + 400 + 60 * 64 - 12, 'Step 3: Letters focused on'],
      ['readingLevel', 28 + 400 + 60 * 64 + 520 - 12, 'Step 4: Session reading level'],
    ])('with a screen reader, %s jumps past a long roster before focusing on the next frame', async (key, offset, label) => {
      mockUseChildren.mockReturnValue({
        children: Array.from({ length: 60 }, (_, i) => ({ id: `child-${i}`, first_name: `Child ${i}`, last_name: 'Learner', class_id: 'class-1' })),
        groups: [], getChildrenInGroup: () => [],
      });
      const screen = renderForm();
      await act(async () => {});
      const scroll = jest.spyOn(screen.UNSAFE_getByType(FlatList).instance, 'scrollToOffset').mockImplementation(() => {});
      measureSteps(screen);
      fireEvent.press(screen.getByRole('button', { name: summaryLabels[key] }));
      expect(scroll).toHaveBeenCalledWith({ offset, animated: false });
      expect(node).not.toHaveBeenCalled();
      expect(focus).not.toHaveBeenCalled();
      nextFrame();
      expect(node).toHaveBeenCalledTimes(1);
      expect(node.mock.calls[0][0].props.accessibilityLabel).toBe(label);
      expect(focus).toHaveBeenCalledWith(301);
      expect(screen.queryByRole('alert')).toBeNull();
    });

    test('with the screen reader off, a jump keeps the animated scroll', async () => {
      AccessibilityInfo.isScreenReaderEnabled.mockResolvedValue(false);
      const screen = renderForm();
      await act(async () => {});
      const scroll = jest.spyOn(screen.UNSAFE_getByType(FlatList).instance, 'scrollToOffset').mockImplementation(() => {});
      measureSteps(screen);
      fireEvent.press(screen.getByRole('button', { name: summaryLabels.letters }));
      expect(scroll).toHaveBeenCalledWith({ offset: 480, animated: true });
      expect(requestFrame).not.toHaveBeenCalled();
    });

    test('unmount cancels pending focus and removes the screen-reader listener', async () => {
      const subscribe = jest.spyOn(AccessibilityInfo, 'addEventListener');
      const screen = renderForm();
      await act(async () => {});
      jest.spyOn(screen.UNSAFE_getByType(FlatList).instance, 'scrollToOffset').mockImplementation(() => {});
      fireEvent.press(screen.getByRole('button', { name: summaryLabels.letters }));
      const frame = requestFrame.mock.results.at(-1).value;
      const subscriptionIndex = subscribe.mock.calls.findIndex(([event]) => event === 'screenReaderChanged');
      const subscription = subscribe.mock.results[subscriptionIndex].value;
      screen.unmount();
      expect(cancelFrame).toHaveBeenCalledWith(frame);
      expect(subscription.remove).toHaveBeenCalled();
      nextFrame();
      expect(node).not.toHaveBeenCalled();
      expect(focus).not.toHaveBeenCalled();
    });

    test('a new jump cancels the earlier frame and focuses only the latest step', async () => {
      const screen = renderForm();
      await act(async () => {});
      jest.spyOn(screen.UNSAFE_getByType(FlatList).instance, 'scrollToOffset').mockImplementation(() => {});
      fireEvent.press(screen.getByRole('button', { name: summaryLabels.letters }));
      const frame = requestFrame.mock.results.at(-1).value;
      fireEvent.press(screen.getByRole('button', { name: summaryLabels.readingLevel }));
      expect(cancelFrame).toHaveBeenCalledWith(frame);
      expect(focus).not.toHaveBeenCalled();
      nextFrame();
      expect(node).toHaveBeenCalledTimes(1);
      expect(node.mock.calls[0][0].props.accessibilityLabel).toBe('Step 4: Session reading level');
      expect(focus).toHaveBeenCalledTimes(1);
    });

    test('screen-reader changes win over a late initial read and are cached for each jump', async () => {
      let resolveInitial;
      AccessibilityInfo.isScreenReaderEnabled.mockReturnValue(new Promise(resolve => { resolveInitial = resolve; }));
      const subscribe = jest.spyOn(AccessibilityInfo, 'addEventListener');
      const screen = renderForm();
      const scroll = jest.spyOn(screen.UNSAFE_getByType(FlatList).instance, 'scrollToOffset').mockImplementation(() => {});
      const onChange = subscribe.mock.calls.find(([event]) => event === 'screenReaderChanged')[1];
      act(() => onChange(true));
      await act(async () => { resolveInitial(false); });
      fireEvent.press(screen.getByRole('button', { name: summaryLabels.letters }));
      expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ animated: false }));
      const frame = requestFrame.mock.results.at(-1).value;
      act(() => onChange(false));
      fireEvent.press(screen.getByRole('button', { name: summaryLabels.readingLevel }));
      expect(cancelFrame).toHaveBeenCalledWith(frame);
      expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ animated: true }));
      expect(AccessibilityInfo.isScreenReaderEnabled).toHaveBeenCalledTimes(1);
      expect(node.mock.calls.at(-1)[0].props.accessibilityLabel).toBe('Step 4: Session reading level');
      expect(focus).toHaveBeenCalledTimes(1);
      nextFrame();
      expect(focus).toHaveBeenCalledTimes(1);
    });
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
    fireEvent.press(screen.getByText('Submit session'));

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
    fireEvent.press(screen.getByText('Submit session'));
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
    fireEvent.press(screen.getByText('Submit session'));
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
    fireEvent.press(screen.getByText('Submit session'));
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

  // Branch review round 1: an open form that crosses programme midnight must not keep calling
  // yesterday "Today" or refuse the new day; the selected date itself stays as chosen.
  test('crossing programme midnight refreshes Today and the calendar without moving the selected date', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-31T21:59:00Z')); // 23:59 SAST
    const screen = renderForm();
    expect(screen.getByRole('button', { name: 'Session date, Today · Sat 31 Oct. Change date' })).toBeTruthy();
    act(() => { jest.advanceTimersByTime(2 * 60 * 1000); });
    const field = screen.getByRole('button', { name: 'Session date, Sat 31 Oct 2026. Change date' });
    fireEvent.press(field);
    const next = screen.getByRole('button', { name: 'Next month' });
    expect(next.props.accessibilityState?.disabled).not.toBe(true);
    fireEvent.press(next);
    expect(screen.getByRole('button', { name: 'Sun 1 November 2026' }).props.accessibilityState?.disabled).not.toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    submitValidForm(screen);
    await waitFor(() => expect(mockPersistLiteracySession).toHaveBeenCalledWith(expect.objectContaining({
      session: expect.objectContaining({ session_date: '2026-10-31' }),
    })));
    await act(async () => { jest.runOnlyPendingTimers(); });
  });

  test('two immediately rejected saves are each announced', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockPersistLiteracySession.mockRejectedValue(new Error('boom'));
    const screen = renderForm();
    submitValidForm(screen);
    await screen.findByRole('alert');
    await act(async () => { fireEvent.press(screen.getByText('Submit session')); });
    await waitFor(() => expect(mockPersistLiteracySession).toHaveBeenCalledTimes(2));
    const saveFailures = () => announce.mock.calls.filter(([text]) => text === 'Failed to save session. Please try again.');
    await waitFor(() => expect(saveFailures()).toHaveLength(2));
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

    test('opening the discard sheet dismisses the keyboard so both choices are reachable', () => {
      const dismiss = jest.spyOn(Keyboard, 'dismiss');
      const screen = renderForm();
      dirty(screen);
      goBack(screen);
      expect(screen.getByText('Discard this session?')).toBeTruthy();
      expect(dismiss).toHaveBeenCalled();
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

    test.each(['ios', 'android'])('the discard confirmation hides the %s form until Keep editing', platform => {
      const replacement = jest.replaceProperty(Platform, 'OS', platform);
      try {
        const screen = renderForm();
        dirty(screen);
        goBack(screen);
        expect(screen.getByTestId('sheet-accessibility-background', { includeHiddenElements: true }).props)
          .toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
        expect(screen.queryByTestId('literacy-session-form')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Submit session' })).toBeNull();
        expect(screen.getByTestId('bottom-sheet-panel').props.role).toBe('alertdialog');
        expect(screen.getByRole('header', { name: 'Discard this session?' })).toBeTruthy();
        fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
        expect(screen.getByTestId('sheet-accessibility-background').props)
          .toMatchObject({ accessibilityElementsHidden: false, importantForAccessibility: 'auto' });
        expect(screen.getByTestId('literacy-session-form')).toBeTruthy();
        expectSubmitAvailable(screen);
        expect(screen.getByPlaceholderText(COMMENTS_PLACEHOLDER).props.value).toBe('worked on m sounds');
      } finally {
        replacement.restore();
      }
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
      expect(mockCompleteMounted).toHaveBeenCalledWith({
        childCount: 1,
        childNames: ['Amahle'],
        letters: ['a'],
        readingLevel: READING_LEVELS[0],
        sessionDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect(screen.routeNames()).toEqual(['Home', 'SessionComplete']);
      expect(screen.queryByText('Discard this session?')).toBeNull();
    });
  });

  describe('completion ordering', () => {
    test('params carry the stored session_date under Auckland (picker day = stored day = pill day)', async () => {
      process.env.TZ = 'Pacific/Auckland';
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
      const screen = renderForm();
      submitValidForm(screen);

      await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));
      const [params] = mockCompleteMounted.mock.calls[0];
      const [{ session }] = mockPersistLiteracySession.mock.calls[0];
      expect(session.session_date).toBe('2026-10-18');
      expect(params.sessionDate).toBe(session.session_date);
      expect(formatSessionDate(params.sessionDate, 'pill')).toBe('Sun 18 Oct');
    });

    test('params list letters in teaching order, not tap order', async () => {
      const screen = renderForm();
      fireEvent.press(screen.getByLabelText('S, not selected'));
      fireEvent.press(screen.getByLabelText('M, not selected'));
      submitValidForm(screen);

      await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));
      const [params] = mockCompleteMounted.mock.calls[0];
      expect(params.letters).toEqual(['a', 'm', 's']);
      const [{ session }] = mockPersistLiteracySession.mock.calls[0];
      expect(session.activities.letters_focused).toEqual(['s', 'm', 'a']);
    });

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
      expect(mockCompleteMounted).toHaveBeenCalledWith({
        childCount: 1,
        childNames: ['Amahle'],
        letters: ['a'],
        readingLevel: READING_LEVELS[0],
        sessionDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect(screen.routeNames()).toEqual(['Home', 'SessionComplete']);
    });

    test('navigates on commit without waiting for refresh and preserves completion side effects', async () => {
      mockRefreshSyncStatus.mockReturnValue(new Promise(() => {}));
      const screen = renderForm();

      submitValidForm(screen);

      await waitFor(() => expect(mockCompleteMounted).toHaveBeenCalledTimes(1));
      expect(mockCompleteMounted).toHaveBeenCalledWith({
        childCount: 1,
        childNames: ['Amahle'],
        letters: ['a'],
        readingLevel: READING_LEVELS[0],
        sessionDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
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
      expect(mockCompleteMounted).toHaveBeenCalledWith({
        childCount: 1,
        childNames: ['Amahle'],
        letters: ['a'],
        readingLevel: READING_LEVELS[0],
        sessionDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
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
    fireEvent.press(screen.getByText('Submit session'));

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

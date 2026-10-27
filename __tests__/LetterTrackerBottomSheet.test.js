jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

import React from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { PaperProvider, ActivityIndicator } from 'react-native-paper';
import { StyleSheet } from 'react-native';
import { colors } from '../src/constants/colors';
import { fontFamilies } from '../src/constants/typography';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { masteryRepository } from '../src/db/repositories/masteryRepository';
import { MotionProvider } from '../src/context/MotionContext';
import { PEDAGOGICAL_ORDERS } from '../src/utils/assessmentRegistry';
import LetterTrackerBottomSheet from '../src/components/session/LetterTrackerBottomSheet';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  SafeAreaInsetsContext: {
    Consumer: ({ children }) => children({ top: 0, right: 0, bottom: 0, left: 0 }),
  },
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  ...jest.requireActual('../src/db/repositories/assessmentsRepository'),
  assessmentsRepository: {
    letterEvidenceFor: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../src/db/repositories/masteryRepository', () => ({
  ...jest.requireActual('../src/db/repositories/masteryRepository'),
  masteryRepository: {
    getLetterMastery: jest.fn().mockResolvedValue([]),
  },
}));

const child = { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' };
const NOW = '2026-10-20T08:15:00.000Z';
const change = (mastered, languageCode = 'en', madeAt = '2026-10-19T08:00:00.000Z') => ({ mastered, languageCode, madeAt });
const stored = (letter) => ({ id: `mastery-${letter}`, child_id: child.id, letter, language: 'en', confirmed: true });
const renderSheet = (props = {}) => render(<PaperProvider settings={{ icon: () => null }}>
  <MotionProvider value={{ motionLevel: 'still', reduceMotion: true, tier: 'static' }}>
    <LetterTrackerBottomSheet visible child={child} userId="user-1" languageCode="en"
      pendingChanges={{}} onChangesUpdate={jest.fn()} onDismiss={jest.fn()} {...props} />
  </MotionProvider>
</PaperProvider>);

describe('LetterTrackerBottomSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    masteryRepository.getLetterMastery.mockResolvedValue([]);
  });
  afterEach(() => jest.useRealTimers());

  test('shows existing, new and removed letters with the live count, legend and Done', async () => {
    masteryRepository.getLetterMastery.mockResolvedValue([stored('a'), stored('s')]);
    const onDismiss = jest.fn();
    const screen = renderSheet({ pendingChanges: { e: change(true), s: change(false) }, onDismiss });
    await waitFor(() => expect(screen.getByText('Amahle Dlamini · 2/26 letters')).toBeTruthy());
    expect(screen.getByText('Letter tracker')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByText('2/26').props.style)).toMatchObject({ fontFamily: fontFamilies.textHeavy, color: colors.text });
    expect(screen.getByLabelText('a, taught by coach').props.accessibilityState.selected).toBe(true);
    const added = screen.getByLabelText('e, taught, added this session');
    expect(added.props.accessibilityState.selected).toBe(true);
    expect(within(added).getByTestId('letter-new-dot')).toBeTruthy();
    expect(screen.getByLabelText('s, not mastered').props.accessibilityState.selected).toBe(false);
    ['Taught', 'New this session', 'Not yet', 'Assessment (locked)'].forEach((label) => expect(screen.getByText(label)).toBeTruthy());
    expect(screen.getAllByText(/^[a-z]$/)).toHaveLength(26);
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('an Afrikaans tracker shows the Afrikaans order and confirmations and stamps af on new marks', async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    jest.setSystemTime(new Date(NOW));
    masteryRepository.getLetterMastery.mockImplementation(async ({ childId, language }) =>
      [{ ...stored('a'), language: 'af' }, stored('s')].filter(row => row.child_id === childId && row.language === language));
    const onChangesUpdate = jest.fn();
    const screen = renderSheet({ languageCode: 'af', onChangesUpdate });
    expect(await screen.findByLabelText('a, taught by coach')).toBeTruthy();
    expect(masteryRepository.getLetterMastery).toHaveBeenCalledWith({ childId: child.id, language: 'af' });
    expect(screen.getByLabelText('s, not mastered')).toBeTruthy();
    expect(screen.getAllByText(/^[a-z]$/).map(node => node.props.children)).toEqual(PEDAGOGICAL_ORDERS.af);
    expect(screen.getByText('Amahle Dlamini · 1/26 letters')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('m, not mastered'));
    expect(onChangesUpdate).toHaveBeenCalledWith({ m: { mastered: true, languageCode: 'af', madeAt: NOW } });
    jest.useRealTimers();
  });

  test('pending loading keeps the title and subtitle and hides the legend', async () => {
    let release;
    masteryRepository.getLetterMastery.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const screen = renderSheet();
    expect(screen.getByText('Letter tracker')).toBeTruthy();
    expect(screen.getByText('Amahle Dlamini · 0/26 letters')).toBeTruthy();
    expect(screen.queryByText('Taught')).toBeNull();
    expect(screen.queryByText('New this session')).toBeNull();
    expect(screen.queryByText('Not yet')).toBeNull();
    expect(screen.queryByText('Assessment (locked)')).toBeNull();
    expect(screen.UNSAFE_getByType(ActivityIndicator).props.color).toBe(colors.text);
    await act(async () => { release([]); });
  });

  test.each([
    ['a, taught by coach', {}, { a: change(false, 'en', NOW) }],
    ['e, taught, added this session', { e: change(true) }, {}],
    ['s, not mastered', { s: change(false) }, {}],
    ['e, not mastered', {}, { e: change(true, 'en', NOW) }],
  ])('keeps the existing toggle rule for %s', async (label, pendingChanges, expected) => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    jest.setSystemTime(new Date(NOW));
    masteryRepository.getLetterMastery.mockResolvedValue([stored('a'), stored('s')]);
    const onChangesUpdate = jest.fn();
    const screen = renderSheet({ pendingChanges, onChangesUpdate });
    const tile = await screen.findByLabelText(label);
    fireEvent.press(tile);
    expect(onChangesUpdate).toHaveBeenCalledWith(expected);
    jest.useRealTimers();
  });

  test('a pulled page leaves an open sheet and pending change alone; reopening reads the baseline once', async () => {
    let snapshot = { running: false, pageVersion: 0, runVersion: 0 };
    const listeners = new Set();
    const store = { getSnapshot: () => snapshot, subscribe: listener => {
      listeners.add(listener); return () => listeners.delete(listener);
    } };
    const value = { repositories: { assessments: assessmentsRepository, mastery: masteryRepository },
      services: { assessmentHistory: { store } } };
    const Harness = ({ visible = true }) => {
      const [pending, setPending] = React.useState({});
      return <SignedInEAContext.Provider value={value}><PaperProvider settings={{ icon: () => null }}>
        <MotionProvider value={{ motionLevel: 'still', reduceMotion: true, tier: 'static' }}>
          <LetterTrackerBottomSheet visible={visible} child={child} userId="user-1" languageCode="en"
            pendingChanges={pending} onChangesUpdate={setPending} onDismiss={jest.fn()} />
        </MotionProvider>
      </PaperProvider></SignedInEAContext.Provider>;
    };
    const screen = render(<Harness />);
    fireEvent.press(await screen.findByLabelText('e, not mastered'));
    expect(screen.getByLabelText('e, taught, added this session')).toBeTruthy();
    expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(1);
    masteryRepository.getLetterMastery.mockResolvedValue([stored('a')]);
    await act(async () => {
      snapshot = { ...snapshot, pageVersion: 1 };
      listeners.forEach(listener => listener());
    });
    expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('e, taught, added this session')).toBeTruthy();
    expect(screen.getByLabelText('a, not mastered')).toBeTruthy();
    screen.rerender(<Harness visible={false} />);
    screen.rerender(<Harness visible />);
    await screen.findByLabelText('a, taught by coach');
    expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('e, taught, added this session')).toBeTruthy();
  });

  test('keeps the labelled backdrop dismissal', () => {
    const onDismiss = jest.fn();
    const { getByLabelText } = render(
      <PaperProvider settings={{ icon: () => null }}>
        <LetterTrackerBottomSheet
          visible
          onDismiss={onDismiss}
          child={{ id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' }}
          userId="user-1"
          languageCode="en"
          pendingChanges={{}}
          onChangesUpdate={jest.fn()}
        />
      </PaperProvider>,
    );

    fireEvent.press(getByLabelText('Dismiss letter tracker'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

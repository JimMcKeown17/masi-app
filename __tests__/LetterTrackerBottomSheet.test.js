jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

import React from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { PaperProvider, ActivityIndicator } from 'react-native-paper';
import { StyleSheet } from 'react-native';
import { colors } from '../src/constants/colors';
import { fontFamilies } from '../src/constants/typography';
import { masteryRepository } from '../src/db/repositories/masteryRepository';
import { MotionProvider } from '../src/context/MotionContext';
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
    latestLetterResult: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../src/db/repositories/masteryRepository', () => ({
  ...jest.requireActual('../src/db/repositories/masteryRepository'),
  masteryRepository: {
    getLetterMastery: jest.fn().mockResolvedValue([]),
  },
}));

const child = { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' };
const stored = (letter) => ({ id: `mastery-${letter}`, child_id: child.id, letter, language: 'English', _deleted: false });
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

  test('shows existing, new and removed letters with the live count, legend and Done', async () => {
    masteryRepository.getLetterMastery.mockResolvedValue([stored('a'), stored('s')]);
    const onDismiss = jest.fn();
    const screen = renderSheet({ pendingChanges: { e: true, s: false }, onDismiss });
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
    ['a, taught by coach', {}, { a: false }],
    ['e, taught, added this session', { e: true }, {}],
    ['s, not mastered', { s: false }, {}],
    ['e, not mastered', {}, { e: true }],
  ])('keeps the existing toggle rule for %s', async (label, pendingChanges, expected) => {
    masteryRepository.getLetterMastery.mockResolvedValue([stored('a'), stored('s')]);
    const onChangesUpdate = jest.fn();
    const screen = renderSheet({ pendingChanges, onChangesUpdate });
    fireEvent.press(await screen.findByLabelText(label));
    expect(onChangesUpdate).toHaveBeenCalledWith(expected);
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

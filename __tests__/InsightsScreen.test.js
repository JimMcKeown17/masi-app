jest.mock('../src/hooks/useActiveProgrammeSubject', () => ({ useActiveProgrammeSubject: jest.fn() }));
import { useActiveProgrammeSubject } from '../src/hooks/useActiveProgrammeSubject';
beforeEach(() => useActiveProgrammeSubject.mockReturnValue({ subject: 'reading', isMaths: false, loading: false }));
import { StyleSheet } from 'react-native';
import { colors } from '../src/constants/colors';
import ListGroup from '../src/components/common/ListGroup';
import IconTile from '../src/components/common/IconTile';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import InsightsScreen from '../src/screens/main/InsightsScreen';

describe('InsightsScreen', () => {
  test('owns the three ranking destinations removed from Home', () => {
    const navigation = { navigate: jest.fn() };
    const screen = render(<InsightsScreen navigation={navigation} />);

    fireEvent.press(screen.getByText('Letter mastery'));
    fireEvent.press(screen.getByText('Assessment scores'));
    fireEvent.press(screen.getByText('Session count'));

    expect(navigation.navigate.mock.calls).toEqual([
      ['LetterMasteryRanking'],
      ['AssessmentRanking'],
      ['SessionCountRanking'],
    ]);
  });

  test('owns the Session history entry so history stays reachable without Home', () => {
    const navigation = { navigate: jest.fn() };
    const screen = render(<InsightsScreen navigation={navigation} />);

    fireEvent.press(screen.getByLabelText('Open Session history'));

    expect(navigation.navigate).toHaveBeenCalledWith('SessionHistory');
  });
});

test('shows grouped action rows with canvas ink tiles and no duplicate Insights heading', () => {
  const screen = render(<InsightsScreen navigation={{ navigate: jest.fn() }} />);
  expect(screen.queryByText('Insights')).toBeNull();
  const group = screen.UNSAFE_getByType(ListGroup);
  expect(group.findAllByType(IconTile)).toHaveLength(4);
  expect(screen.getAllByRole('button')).toHaveLength(4);
  group.findAllByType(IconTile).forEach((tile) => {
    expect(StyleSheet.flatten(tile.findByType('View').props.style).backgroundColor).toBe(colors.background);
    expect(tile.findByType('Ionicons').props.color).toBe(colors.text);
  });
});

test('numeracy shows only the shared Session count and Session history rows', () => {
  useActiveProgrammeSubject.mockReturnValue({ subject: 'maths', isMaths: true, loading: false });
  const navigation = { navigate: jest.fn() };
  const screen = render(<InsightsScreen navigation={navigation} />);
  expect(screen.getAllByRole('button').map(node => node.props.accessibilityLabel))
    .toEqual(['Open Session count', 'Open Session history']);
  expect(screen.queryByText('Letter mastery')).toBeNull();
  expect(screen.queryByText('Assessment scores')).toBeNull();
  fireEvent.press(screen.getByLabelText('Open Session count'));
  fireEvent.press(screen.getByLabelText('Open Session history'));
  expect(navigation.navigate.mock.calls).toEqual([['SessionCountRanking'], ['SessionHistory']]);
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import InsightsScreen from '../src/screens/main/InsightsScreen';

describe('InsightsScreen', () => {
  test('owns the three ranking destinations removed from Home', () => {
    const navigation = { navigate: jest.fn() };
    const screen = render(<InsightsScreen navigation={navigation} />);

    fireEvent.press(screen.getByText('Letter Mastery'));
    fireEvent.press(screen.getByText('Assessment Scores'));
    fireEvent.press(screen.getByText('Session Count'));

    expect(navigation.navigate.mock.calls).toEqual([
      ['LetterMasteryRanking'],
      ['AssessmentRanking'],
      ['SessionCountRanking'],
    ]);
  });
});

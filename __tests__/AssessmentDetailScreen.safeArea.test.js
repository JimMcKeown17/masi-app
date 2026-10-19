import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import AssessmentDetailScreen from '../src/screens/assessments/AssessmentDetailScreen';

test.each([0, 48])('assessment detail preserves its 24dp gap with a %sdp bottom inset', (bottom) => {
  const screen = renderWithProviders(<AssessmentDetailScreen route={{ params: {
    childName: 'Test Child',
    assessment: {
      assessment_type: 'letter_egra', date_assessed: '2026-10-19',
      letter_language: 'English', attempt_number: 1, letters_attempted: 1,
      correct_responses: 1, accuracy: 100, items_tested: ['a'],
      responses: { a: true },
    },
  } }} />, { insets: { top: 24, right: 0, bottom, left: 0 } });
  expect(StyleSheet.flatten(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle)).toEqual({
    alignItems: 'center',
    padding: 24,
    paddingBottom: bottom + 24,
  });
});

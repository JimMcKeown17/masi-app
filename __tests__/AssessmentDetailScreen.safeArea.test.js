import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import AssessmentDetailScreen from '../src/screens/assessments/AssessmentDetailScreen';
import { AuthContext } from '../src/context/AuthContext';
import { SignedInEAContext } from '../src/context/SignedInEAContext';

const repositories = { assessments: { getQuestionResults: jest.fn().mockResolvedValue([{
  id: 'result-1', question_code: 'letter_sounds', assessment_date: '2026-10-19', language: 'en',
  score: 1, total_items: 1, derived: { total_attempted: 1 },
  items: [{ position: 0, prompt: 'a', is_correct: true, metadata: { row: 0 } }],
}]) } };

test.each([0, 48])('assessment detail preserves its 24dp gap with a %sdp bottom inset', async (bottom) => {
  const screen = renderWithProviders(<AuthContext.Provider value={{ user: { id: 'user-1' } }}><SignedInEAContext.Provider value={{ repositories }}>
    <AssessmentDetailScreen route={{ params: { childName: 'Test Child', assessmentId: 'result-1' } }} />
  </SignedInEAContext.Provider></AuthContext.Provider>, { insets: { top: 24, right: 0, bottom, left: 0 } });
  await screen.findByText('1 / 1');
  expect(StyleSheet.flatten(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle)).toEqual({
    alignItems: 'center',
    padding: 24,
    paddingBottom: bottom + 24,
  });
});

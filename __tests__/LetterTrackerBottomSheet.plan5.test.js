jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

import React from 'react';
import { StyleSheet } from 'react-native';
import { getTeachingOrder } from '../src/utils/letterOrders';
import { typeRoles } from '../src/constants/typography';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import LetterTrackerBottomSheet from '../src/components/session/LetterTrackerBottomSheet';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { masteryRepository } from '../src/db/repositories/masteryRepository';

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
    letterEvidenceFor: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/masteryRepository', () => ({
  ...jest.requireActual('../src/db/repositories/masteryRepository'),
  masteryRepository: {
    getLetterMastery: jest.fn(),
  },
}));

const renderSheet = (props = {}) => render(
  <PaperProvider settings={{ icon: () => null }}>
    <LetterTrackerBottomSheet
      visible
      onDismiss={jest.fn()}
      child={{ id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' }}
      userId="user-1"
      languageCode="en"
      teachingOrder={getTeachingOrder({ letter_order_edition: '2026-10-23' }, props.languageCode === undefined ? 'en' : props.languageCode)}
      pendingChanges={{}}
      onChangesUpdate={jest.fn()}
      {...props}
    />
  </PaperProvider>
);

describe('LetterTrackerBottomSheet Plan 5 behavior', () => {
  beforeEach(() => {
    assessmentsRepository.letterEvidenceFor.mockResolvedValue([]);
    masteryRepository.getLetterMastery.mockResolvedValue([
      {
        id: 'mastery-a',
        child_id: 'child-1',
        letter: 'a',
        language: 'en',
        confirmed: true,
      },
      {
        id: 'mastery-s',
        child_id: 'child-1',
        letter: 's',
        language: 'en',
        confirmed: true,
      },
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('locks stored letter-result evidence using the letter-only accessor', async () => {
    assessmentsRepository.letterEvidenceFor.mockResolvedValue([{
      id: 'a-letter', child_id: 'child-1', question_code: 'letter_sounds', language: 'en',
      assessment_date: '2026-07-01',
      items: [
        { prompt: 'A', is_correct: true, metadata: { reached: true } },
        { prompt: 'm', is_correct: true, metadata: { reached: true } },
        { prompt: 'a', is_correct: true, metadata: { reached: true } },
      ],
    }]);
    masteryRepository.getLetterMastery.mockResolvedValue([]);
    const onChangesUpdate = jest.fn();
    const { getByLabelText, getByText } = renderSheet({ onChangesUpdate });

    await waitFor(() => expect(getByLabelText('a, mastered from assessment, locked')).toBeTruthy());
    expect(assessmentsRepository.letterEvidenceFor).toHaveBeenCalledWith({
      userId: 'user-1', childId: 'child-1', language: 'en',
    });
    fireEvent.press(getByLabelText('a, mastered from assessment, locked'));
    expect(onChangesUpdate).not.toHaveBeenCalled();
    expect(getByLabelText('a, mastered from assessment, locked').props.accessibilityState.disabled).toBe(true);
    expect(StyleSheet.flatten(getByText('a').props.style)).toEqual(expect.objectContaining(typeRoles.textLetter));
  });

  test.each([null, 'zu'])('shows an honest missing-set state for language %s', async (languageCode) => {
    const screen = renderSheet({ languageCode });
    expect(await screen.findByText('No letter set for this class language.')).toBeTruthy();
    expect(screen.queryAllByText(/^[a-z]$/)).toHaveLength(0);
    expect(assessmentsRepository.letterEvidenceFor).not.toHaveBeenCalled();
    expect(masteryRepository.getLetterMastery).not.toHaveBeenCalled();
  });
});

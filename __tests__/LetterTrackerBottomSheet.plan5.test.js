import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import LetterTrackerBottomSheet from '../src/components/session/LetterTrackerBottomSheet';
import { LETTER_SETS } from '../src/constants/egraConstants';
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
  assessmentsRepository: {
    getAssessments: jest.fn(),
  },
}));

jest.mock('../src/db/repositories/masteryRepository', () => ({
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
      languageKey="english"
      pendingChanges={{}}
      onChangesUpdate={jest.fn()}
      {...props}
    />
  </PaperProvider>
);

describe('LetterTrackerBottomSheet Plan 5 behavior', () => {
  beforeEach(() => {
    assessmentsRepository.getAssessments.mockResolvedValue([]);
    masteryRepository.getLetterMastery.mockResolvedValue([
      {
        id: 'mastery-a',
        child_id: 'child-1',
        letter: 'a',
        language: 'English',
        _deleted: false,
      },
      {
        id: 'mastery-s',
        child_id: 'child-1',
        letter: 's',
        language: 'English',
        _deleted: false,
      },
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('a newer word assessment does not wipe rendered assessment mastery', async () => {
    assessmentsRepository.getAssessments.mockResolvedValue([
      {
        id: 'a-letter',
        child_id: 'child-1',
        assessment_type: 'letter_egra',
        letter_language: 'English',
        date_assessed: '2026-07-01',
        created_at: '2026-07-01T10:00:00Z',
        last_letter_attempted: { index: 2 },
        correct_letters: [{ index: 0 }, { index: 1 }, { index: 2 }],
      },
      {
        id: 'a-word',
        child_id: 'child-1',
        assessment_type: 'word_egra',
        letter_language: 'English',
        date_assessed: '2026-07-02',
        created_at: '2026-07-02T10:00:00Z',
        last_letter_attempted: { index: 5 },
        correct_letters: [],
      },
    ]);
    masteryRepository.getLetterMastery.mockResolvedValue([]);

    // The letter at EGRA position 0 was attempted and fully correct in the
    // letter assessment; the newer word assessment must not unlock it.
    const firstEgraLetter = LETTER_SETS.english.letters[0].toLowerCase();
    const { getByLabelText } = renderSheet();

    await waitFor(() =>
      expect(getByLabelText(`${firstEgraLetter}, mastered from assessment`)).toBeTruthy(),
    );
  });
});

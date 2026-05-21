import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import AssessmentHistoryScreen from '../src/screens/assessments/AssessmentHistoryScreen';
import { useAuth } from '../src/context/AuthContext';
import { useChildren } from '../src/context/ChildrenContext';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { supabase } from '../src/services/supabaseClient';

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../src/context/ChildrenContext', () => ({
  useChildren: jest.fn(),
}));

jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: {
    getAssessments: jest.fn(),
  },
}));

jest.mock('../src/services/supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('AssessmentHistoryScreen Plan 5 behavior', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-21T12:00:00.000Z'));

    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useChildren.mockReturnValue({
      allChildren: [
        { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' },
      ],
    });
    assessmentsRepository.getAssessments.mockResolvedValue([
      {
        id: 'assessment-1',
        user_id: 'user-1',
        child_id: 'child-1',
        assessment_type: 'letter_egra',
        date_assessed: '2026-05-20',
        letter_language: 'English',
        attempt_number: 1,
        letters_attempted: 10,
        correct_responses: 8,
        accuracy: 80,
        synced: false,
        created_at: '2026-05-20T10:00:00.000Z',
      },
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('loads recent assessment history from SQLite without screen-owned Supabase or storage pulls', async () => {
    const navigation = { navigate: jest.fn() };
    const { getByText, queryByText } = render(<AssessmentHistoryScreen navigation={navigation} />);

    await waitFor(() => expect(getByText('Amahle Dlamini')).toBeTruthy());

    expect(getByText('Pending sync')).toBeTruthy();
    expect(getByText('English - Attempt #1')).toBeTruthy();
    expect(queryByText('No assessments yet. Run your first assessment!')).toBeNull();
    expect(assessmentsRepository.getAssessments).toHaveBeenCalledTimes(1);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import LetterTrackerBottomSheet from '../src/components/session/LetterTrackerBottomSheet';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  SafeAreaInsetsContext: {
    Consumer: ({ children }) => children({ top: 0, right: 0, bottom: 0, left: 0 }),
  },
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: {
    getAssessments: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../src/db/repositories/masteryRepository', () => ({
  masteryRepository: {
    getLetterMastery: jest.fn().mockResolvedValue([]),
  },
}));

describe('LetterTrackerBottomSheet', () => {
  test('keeps the labelled backdrop dismissal', () => {
    const onDismiss = jest.fn();
    const { getByLabelText } = render(
      <PaperProvider settings={{ icon: () => null }}>
        <LetterTrackerBottomSheet
          visible
          onDismiss={onDismiss}
          child={{ id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' }}
          userId="user-1"
          languageKey="english"
          pendingChanges={{}}
          onChangesUpdate={jest.fn()}
        />
      </PaperProvider>,
    );

    fireEvent.press(getByLabelText('Dismiss letter tracker'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const mockUseClasses = jest.fn();

jest.mock('../src/context/ClassesContext', () => ({
  useClasses: () => mockUseClasses(),
}));

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ClassOnboardingScreen from '../src/screens/onboarding/ClassOnboardingScreen';

const renderScreen = (navigation = {
  replace: jest.fn(),
  goBack: jest.fn(),
}) => render(
  <PaperProvider>
    <ClassOnboardingScreen navigation={navigation} />
  </PaperProvider>
);

describe('ClassOnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseClasses.mockReturnValue({
      classBootstrapStatus: 'unconfirmed_empty',
      loadClasses: jest.fn(),
    });
  });

  test('requires an explicit duplicate-risk choice when the backend could not be checked', () => {
    const navigation = { replace: jest.fn(), goBack: jest.fn() };
    const screen = renderScreen(navigation);

    expect(screen.getByText('We could not confirm your Head Office setup')).toBeTruthy();
    expect(screen.getByText(/may create a duplicate class/i)).toBeTruthy();

    fireEvent.press(screen.getByText('Create locally anyway'));

    expect(navigation.replace).toHaveBeenCalledWith('CreateClass', {
      onboarding: true,
      acknowledgedDuplicateRisk: true,
    });
  });

  test('describes the settled two-step class and children flow without promising groups', () => {
    const screen = renderScreen();

    expect(screen.getByText('STEP 1 OF 2')).toBeTruthy();
    expect(screen.getByText('Next: add your children.')).toBeTruthy();
    expect(screen.queryByText(/groups/i)).toBeNull();
  });
});

test.each([
  ['no_active_programme', 'Check again'],
  ['unconfirmed_empty', 'Retry backend check'],
])('%s keeps the retry handler on %s', async (classBootstrapStatus, label) => {
  const loadClasses = jest.fn().mockResolvedValue(undefined);
  mockUseClasses.mockReturnValue({ classBootstrapStatus, loadClasses });
  const screen = renderScreen();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: label })));
  expect(loadClasses).toHaveBeenCalledTimes(1);
});

test('Create my class keeps the confirmed-empty navigation', () => {
  mockUseClasses.mockReturnValue({ classBootstrapStatus: 'confirmed_empty', loadClasses: jest.fn() });
  const navigation = { replace: jest.fn(), goBack: jest.fn() };
  const screen = renderScreen(navigation);
  fireEvent.press(screen.getByRole('button', { name: 'Create my class' }));
  expect(navigation.replace).toHaveBeenCalledWith('CreateClass', { onboarding: true, acknowledgedDuplicateRisk: false });
});

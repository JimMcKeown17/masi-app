import React from 'react';
import { StyleSheet, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { colors } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
import { JOB_TITLE_CODES } from '../src/constants/jobTitles';
import SessionFormScreen from '../src/screens/sessions/SessionFormScreen';
import BrandButton from '../src/components/common/BrandButton';

const mockUseAuth = jest.fn();
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../src/screens/sessions/LiteracySessionForm', () => {
  const { View } = require('react-native');
  return ({ navigation }) => <View testID="literacy-form-stub" navigation={navigation} />;
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => ({ __esModule: true, default: () => null }), { virtual: true });

function expectMessageFrame(screen, message) {
  expect(screen.queryByText('New Session')).toBeNull();
  expect(screen.queryByText('New session')).toBeNull();
  expect(StyleSheet.flatten(screen.getByText(message).props.style)).toMatchObject({ ...typeRoles.textBody, color: colors.textSecondary, textAlign: 'center' });
  expect(StyleSheet.flatten(screen.UNSAFE_getByType(SessionFormScreen).findByType(View).props.style).backgroundColor).toBe(colors.background);
}

test('loading keeps its copy and offers Retry without repeating the navigator title', () => {
  const refreshProfile = jest.fn();
  mockUseAuth.mockReturnValue({ profile: null, refreshProfile });
  const screen = render(<SessionFormScreen />);
  expectMessageFrame(screen, 'Loading your profile...');
  expect(screen.UNSAFE_getByType(BrandButton).props.variant).toBe('tertiary');
  fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  expect(refreshProfile).toHaveBeenCalledTimes(1);
});

test('unsupported roles keep the coming-soon message without a second title', () => {
  mockUseAuth.mockReturnValue({ profile: { jobTitleCode: 'tutor', jobTitleName: 'Tutor' } });
  const screen = render(<SessionFormScreen />);
  expectMessageFrame(screen, 'Session forms for Tutor are coming soon.');
});

test('the literacy coach code renders the form with navigation', () => {
  mockUseAuth.mockReturnValue({ profile: { jobTitleCode: JOB_TITLE_CODES.LITERACY_COACH } });
  const navigation = { goBack: jest.fn() };
  const screen = render(<SessionFormScreen navigation={navigation} />);
  expect(screen.getByTestId('literacy-form-stub').props.navigation).toBe(navigation);
});

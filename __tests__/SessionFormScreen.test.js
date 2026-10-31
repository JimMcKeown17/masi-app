jest.mock('../src/hooks/useActiveProgrammeSubject', () => ({ useActiveProgrammeSubject: jest.fn() }));
import { useActiveProgrammeSubject } from '../src/hooks/useActiveProgrammeSubject';
beforeEach(() => useActiveProgrammeSubject.mockReturnValue({ subject: 'reading', isMaths: false, loading: false, settled: true }));
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { colors } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
import { JOB_TITLE_CODES } from '../src/constants/jobTitles';
import SessionFormScreen from '../src/screens/sessions/SessionFormScreen';
import BrandButton from '../src/components/common/BrandButton';

const mockUseAuth = jest.fn();
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../src/screens/lessons/LessonPickerScreen', () => {
  const { View } = require('react-native');
  return ({ navigation }) => <View testID="lesson-picker-stub" navigation={navigation} />;
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

test('the literacy coach code renders the picker with navigation', () => {
  mockUseAuth.mockReturnValue({ profile: { jobTitleCode: JOB_TITLE_CODES.LITERACY_COACH } });
  const navigation = { goBack: jest.fn() };
  const screen = render(<SessionFormScreen navigation={navigation} />);
  expect(screen.getByTestId('lesson-picker-stub').props.navigation).toBe(navigation);
});

test.each([JOB_TITLE_CODES.LITERACY_COACH, 'tutor'])('a %s in numeracy gets coming soon', jobTitleCode => {
  useActiveProgrammeSubject.mockReturnValue({ subject: 'maths', isMaths: true, loading: false, settled: true });
  mockUseAuth.mockReturnValue({ profile: { jobTitleCode, jobTitleName: 'Tutor' } });
  const screen = render(<SessionFormScreen />);
  expectMessageFrame(screen, 'Session forms for Numeracy are coming soon.');
  expect(screen.queryByTestId('lesson-picker-stub')).toBeNull();
});
test('SessionForm shows the lesson flow fallback when the subject is unknown', () => {
  useActiveProgrammeSubject.mockReturnValue({ subject: null, isMaths: false, loading: false, settled: true });
  mockUseAuth.mockReturnValue({ profile: { jobTitleCode: JOB_TITLE_CODES.LITERACY_COACH } });
  const screen = render(<SessionFormScreen />);
  expect(screen.getByTestId('lesson-picker-stub')).toBeTruthy();
});
test('loading shows a spinner, not the picker', () => {
  useActiveProgrammeSubject.mockReturnValue({ subject: null, isMaths: false, loading: true });
  mockUseAuth.mockReturnValue({ profile: { jobTitleCode: JOB_TITLE_CODES.LITERACY_COACH } });
  const screen = render(<SessionFormScreen />);
  expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  expect(screen.queryByTestId('lesson-picker-stub')).toBeNull();
  useActiveProgrammeSubject.mockReturnValue({ subject: null, isMaths: false, loading: false, settled: true });
  screen.rerender(<SessionFormScreen />);
  expect(screen.getByTestId('lesson-picker-stub')).toBeTruthy();
  expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
});

test('a cached literacy subject never opens the lesson flow before this screen has read the programme', () => {
  useActiveProgrammeSubject.mockReturnValue({ subject: 'reading', isMaths: false, loading: false, settled: false });
  mockUseAuth.mockReturnValue({ profile: { jobTitleCode: JOB_TITLE_CODES.LITERACY_COACH } });
  const screen = render(<SessionFormScreen navigation={{}} />);
  expect(screen.queryByTestId('lesson-picker-stub')).toBeNull();
  expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
});
test('a cached maths subject shows coming soon at once', () => {
  useActiveProgrammeSubject.mockReturnValue({ subject: 'maths', isMaths: true, loading: false, settled: false });
  mockUseAuth.mockReturnValue({ profile: { jobTitleCode: JOB_TITLE_CODES.LITERACY_COACH } });
  const screen = render(<SessionFormScreen />);
  expect(screen.getByText('Session forms for Numeracy are coming soon.')).toBeTruthy();
});

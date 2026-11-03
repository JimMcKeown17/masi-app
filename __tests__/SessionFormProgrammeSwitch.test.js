// A cached literacy subject must never mount the literacy picker after the EA moves
// to numeracy under the same sign-in. Real hook + real SessionFormScreen; only the
// programme read and the picker are faked. The numeracy picker is now available.
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { JOB_TITLE_CODES } from '../src/constants/jobTitles';
import SessionFormScreen from '../src/screens/sessions/SessionFormScreen';
import { rememberProgrammeSubject } from '../src/utils/programmeSubject';

const mockGate = jest.fn();
// A fresh handle per test: known maths is recorded per signed-in EA handle.
let mockHandle;
beforeEach(() => { mockHandle = { isCurrent: () => true }; mockPickerMounts.mockClear(); });
jest.mock('../src/context/SignedInEAContext', () => ({ useSignedInEA: () => ({ handle: mockHandle }) }));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'ea-1' }, profile: { jobTitleCode: require('../src/constants/jobTitles').JOB_TITLE_CODES.LITERACY_COACH },
}) }));
jest.mock('../src/services/activeProgrammeGate', () => ({ getActiveProgrammeGate: (...args) => mockGate(...args) }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: cb => require('react').useEffect(cb, [cb]) }));
const mockPickerMounts = jest.fn();
jest.mock('../src/screens/lessons/LessonPickerScreen', () => ({ kind = 'literacy' }) => {
  mockPickerMounts(kind);
  const { View, Text } = require('react-native');
  return <View testID="lesson-picker-stub"><Text>picker:{kind}</Text></View>;
});

test('after a move to numeracy, Record mounts only the numeracy picker', async () => {
  expect(JOB_TITLE_CODES.LITERACY_COACH).toBeTruthy();
  mockGate.mockResolvedValue({ hasActiveProgramme: true, programme: { code: 'literacy' } });
  const first = render(<SessionFormScreen navigation={{}} />);
  await first.findByTestId('lesson-picker-stub');
  first.unmount();
  mockPickerMounts.mockClear();

  // Head Office moves the EA to numeracy; the same signed-in handle stays.
  let resolve;
  mockGate.mockReturnValue(new Promise(done => { resolve = done; }));
  const screen = render(<SessionFormScreen navigation={{}} />);
  expect(screen.queryByTestId('lesson-picker-stub')).toBeNull();
  await act(async () => resolve({ hasActiveProgramme: true, programme: { code: 'numeracy' } }));
  expect(screen.getByText('picker:numeracy')).toBeTruthy();
  expect(screen.queryByText('picker:literacy')).toBeNull();
  expect(mockPickerMounts).not.toHaveBeenCalledWith('literacy');
});

test('a failed programme read never mounts the literacy picker for a known numeracy EA', async () => {
  mockGate.mockResolvedValue({ hasActiveProgramme: true, programme: { code: 'numeracy' } });
  const first = render(<SessionFormScreen navigation={{}} />);
  await first.findByText('picker:numeracy');
  first.unmount();
  mockPickerMounts.mockClear();
  mockGate.mockRejectedValue(new Error('read failed'));
  const screen = render(<SessionFormScreen navigation={{}} />);
  await act(async () => {});
  expect(screen.getByText('picker:numeracy')).toBeTruthy();
  expect(screen.queryByText('picker:literacy')).toBeNull();
  expect(mockPickerMounts).not.toHaveBeenCalledWith('literacy');
});

test('maths confirmed on another screen covers a failed first read on Record', async () => {
  // Home or Assessments confirmed numeracy for this sign-in; Record's own first read fails.
  rememberProgrammeSubject(mockHandle, { code: 'numeracy' });
  mockGate.mockRejectedValue(new Error('read failed'));
  const screen = render(<SessionFormScreen navigation={{}} />);
  await act(async () => {});
  expect(screen.getByText('picker:numeracy')).toBeTruthy();
  expect(screen.queryByText('picker:literacy')).toBeNull();
  expect(mockPickerMounts).not.toHaveBeenCalledWith('literacy');
});

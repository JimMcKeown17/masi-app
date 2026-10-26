jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

import React from 'react';
import { ScrollView } from 'react-native';
import { fireEvent, within } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import SkipNoticeSheet from '../src/components/assessments/SkipNoticeSheet';
import { resetSkipNoticeSeen } from '../src/utils/skipNoticeSeen';

const props = {
  visible: true, title: 'No reading or writing today',
  body: "Lwazi got every letter in the first row wrong. So Lwazi won't be asked to read or write words, sentences or a story. This is normal. Carry on with the next Question.",
  stillToDo: ['Listen to a story', 'First sounds'],
  skipped: ['Reading words', 'Reading sentences', 'Story comprehension'],
};
const renderSheet = overrides => renderWithProviders(<SkipNoticeSheet {...props} {...overrides} />);

beforeEach(() => resetSkipNoticeSeen());

test('accessible bottom sheet shows the title, exact body and two lists, with Got it outside the scroll area', () => {
  const onDismiss = jest.fn();
  const sheet = renderSheet({ onDismiss });
  expect(sheet.getByRole('header', { name: props.title })).toBeTruthy();
  expect(sheet.getByTestId('bottom-sheet-panel').props).toMatchObject({ role: 'alertdialog', accessibilityViewIsModal: true });
  expect(sheet.getByText(props.body)).toBeTruthy();
  expect(sheet.getByText('Still to do')).toBeTruthy();
  expect(sheet.getByText('Skipped')).toBeTruthy();
  [...props.stillToDo, ...props.skipped].forEach(title => expect(sheet.getByText(title)).toBeTruthy());
  expect(within(sheet.UNSAFE_getByType(ScrollView)).queryByRole('button', { name: 'Got it' })).toBeNull();
  fireEvent.press(sheet.getByRole('button', { name: 'Got it' }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test('omits the whole Still to do block when no Questions remain', () => {
  const sheet = renderSheet({ stillToDo: [] });
  expect(sheet.queryByText('Still to do')).toBeNull();
  expect(sheet.queryByText('Listen to a story')).toBeNull();
  expect(sheet.getByText('Skipped')).toBeTruthy();
});

test('hidden sheet has no accessible content', () => {
  const sheet = renderSheet({ visible: false });
  expect(sheet.queryByRole('alertdialog')).toBeNull();
  expect(sheet.queryByRole('button', { name: 'Got it' })).toBeNull();
});

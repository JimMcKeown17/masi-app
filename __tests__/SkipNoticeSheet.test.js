jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

import React from 'react';
import { BackHandler, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, within } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import SkipNoticeSheet from '../src/components/assessments/SkipNoticeSheet';
import { resetSkipNoticeSeen } from '../src/utils/skipNoticeSeen';

// The real module object, so a spy on useWindowDimensions reaches the component.
const ReactNative = require('react-native');

const props = {
  visible: true, title: 'No reading or writing today',
  body: "Lwazi got every letter in the first row wrong. So Lwazi won't be asked to read or write words, sentences or a story. This is normal. Carry on with the next Question.",
  stillToDo: ['Listen to a story', 'First sounds'],
  skipped: ['Reading words', 'Reading sentences', 'Story comprehension'],
};
const renderSheet = overrides => renderWithProviders(<SkipNoticeSheet {...props} {...overrides} />);

beforeEach(() => resetSkipNoticeSeen());

test('accessible bottom sheet shows the title, exact body and two lists, with Got it outside the scroll area', () => {
  const onAcknowledge = jest.fn();
  const sheet = renderSheet({ onAcknowledge });
  expect(sheet.getByRole('header', { name: props.title })).toBeTruthy();
  expect(sheet.getByTestId('bottom-sheet-panel').props).toMatchObject({ role: 'alertdialog', accessibilityViewIsModal: true });
  expect(sheet.getByText(props.body)).toBeTruthy();
  expect(sheet.getByText('Still to do')).toBeTruthy();
  expect(sheet.getByText('Skipped')).toBeTruthy();
  [...props.stillToDo, ...props.skipped].forEach(title => expect(sheet.getByText(title)).toBeTruthy());
  expect(within(sheet.UNSAFE_getByType(ScrollView)).queryByRole('button', { name: 'Got it' })).toBeNull();
  fireEvent.press(sheet.getByRole('button', { name: 'Got it' }));
  expect(onAcknowledge).toHaveBeenCalledTimes(1);
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


test('backdrop and hardware Back leave the card waiting for Got it', () => {
  const backSpy = jest.spyOn(BackHandler, 'addEventListener');
  try {
    const onAcknowledge = jest.fn();
    const sheet = renderSheet({ onAcknowledge });
    fireEvent.press(sheet.getByTestId('bottom-sheet-backdrop'));
    const backCall = backSpy.mock.calls.find(([event]) => event === 'hardwareBackPress');
    let consumed;
    act(() => { consumed = backCall[1](); });
    expect(consumed).toBe(true);
    expect(onAcknowledge).not.toHaveBeenCalled();
    expect(sheet.getByRole('header', { name: props.title })).toBeTruthy();
    expect(sheet.queryByRole('button', { name: /dismiss/i })).toBeNull();
    fireEvent.press(sheet.getByRole('button', { name: 'Got it' }));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  } finally { backSpy.mockRestore(); }
});

describe('large text', () => {
  afterEach(() => jest.restoreAllMocks());
  const atTextSize = fontScale => jest.spyOn(ReactNative, 'useWindowDimensions')
    .mockReturnValue({ width: 360, height: 800, scale: 2, fontScale });

  // Jest has no layout engine: these pin the wrap rule; the A03 at 360dp proves the result.
  test.each([[1, 136], [1.3, 176.8]])('at text size %p each list asks for a %pdp column and wraps to its own row when two do not fit', (fontScale, column) => {
    atTextSize(fontScale);
    const sheet = renderSheet();
    expect(StyleSheet.flatten(sheet.getByTestId('skip-notice-lists').props.style))
      .toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
    const lists = sheet.getAllByTestId('skip-notice-list');
    expect(lists).toHaveLength(2);
    lists.forEach(list => {
      const style = StyleSheet.flatten(list.props.style);
      expect(style.flexGrow).toBe(1);
      expect(style.flexBasis).toBeCloseTo(column);
    });
  });

  test('the footer rule shows only while the card body scrolls', () => {
    const sheet = renderSheet();
    const body = sheet.UNSAFE_getByType(ScrollView);
    const rule = () => StyleSheet.flatten(sheet.getByTestId('bottom-sheet-footer').props.style).borderTopWidth;
    expect(rule()).toBe(0);
    fireEvent(body, 'contentSizeChange', 312, 900);
    expect(rule()).toBe(0);
    fireEvent(body, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 312, height: 600 } } });
    expect(rule()).toBe(1);
    fireEvent(body, 'contentSizeChange', 312, 560);
    expect(rule()).toBe(0);
  });
});

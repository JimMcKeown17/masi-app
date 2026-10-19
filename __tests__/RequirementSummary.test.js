import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import RequirementSummary from '../src/components/forms/RequirementSummary';
import { colors } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

const childrenItem = { key: 'children', step: 2, done: true, doneText: '2 children', missingText: 'Children' };

test('done items are accessible text, not buttons', () => {
  const screen = render(<RequirementSummary items={[childrenItem]} />);
  expect(screen.getByLabelText('2 children, done')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  expect(StyleSheet.flatten(screen.getByText('2 children').props.style)).toMatchObject({
    ...typeRoles.textSmallStrong, color: colors.text, fontVariant: ['tabular-nums'],
  });
});

test('missing items are wrapping links with a 44dp minimum target and invoke their action', () => {
  const onPress = jest.fn();
  const screen = render(<RequirementSummary items={[
    { key: 'letters', step: 3, done: false, missingText: 'Letters', onPress },
  ]} />);
  const button = screen.getByRole('button', { name: 'Letters missing. Go to step 3' });
  expect(StyleSheet.flatten(button.props.style)).toMatchObject({ minHeight: 44, marginVertical: -12 });
  expect(screen.getByText('Letters').props.numberOfLines).toBeUndefined();
  fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('no summary element is a live region', () => {
  const screen = render(<RequirementSummary items={[childrenItem, { key: 'letters', step: 3, done: false, missingText: 'Letters' }]} />);
  expect(screen.UNSAFE_root.findAll(node => node.props.accessibilityLiveRegion !== undefined)).toEqual([]);
});

test('long completed values render in full and can wrap', () => {
  const doneText = 'A long reading level that needs more than one line';
  const screen = render(<RequirementSummary items={[{ key: 'readingLevel', step: 4, done: true, doneText }]} />);
  expect(screen.getByLabelText(`${doneText}, done`)).toBeTruthy();
  const text = screen.getByText(doneText);
  expect(text.props.numberOfLines).toBeUndefined();
  expect(StyleSheet.flatten(text.props.style).flexShrink).toBe(1);
});

import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const flat = (node) => StyleSheet.flatten(node.props.style);
import SelectField from '../src/components/common/SelectField';

test.each([['Grade 1', 'Grade 1'], ['', 'Choose a class']])('combines its label with value or placeholder (%s)', (value, spoken) => {
  const onPress = jest.fn();
  const ui = render(<SelectField label="Class" value={value} placeholder="Choose a class" onPress={onPress} />);
  const button = ui.getByRole('button', { name: `Class, ${spoken}` });
  expect(flat(button)).toMatchObject({ minHeight: 60, borderWidth: 2, borderColor: colors.fieldEdge });
  fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});
test('supports an explicit label, error note and disabled state', () => {
  const onPress = jest.fn();
  const ui = render(<SelectField label="Class" accessibilityLabel="Choose class" error="Required" disabled onPress={onPress} />);
  expect(ui.getByRole('alert')).toHaveTextContent('Required');
  fireEvent.press(ui.getByRole('button', { name: 'Choose class' }));
  expect(onPress).not.toHaveBeenCalled();
});
test('a boolean error marks the field without rendering a duplicate note', () => {
  const ui = render(<SelectField label="Focused on today" placeholder="Select a level" error />);
  expect(flat(ui.getByRole('button'))).toMatchObject({ borderWidth: 2, borderColor: colors.error });
  expect(flat(ui.getByText('Focused on today')).color).toBe(colors.error);
  expect(ui.queryByRole('alert')).toBeNull();
});

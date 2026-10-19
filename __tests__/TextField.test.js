import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
const flat = (node) => StyleSheet.flatten(node.props.style);
import TextField from '../src/components/common/TextField';

test('label names the input and tapping the box focuses it', () => {
  const inputRef = React.createRef();
  const ui = render(<TextField label="Name" value="" inputRef={inputRef} />);
  expect(ui.getByLabelText('Name')).toBeTruthy();
  const focus = jest.spyOn(inputRef.current, 'focus');
  fireEvent.press(ui.getByTestId('text-field-box'));
  expect(focus).toHaveBeenCalledTimes(1);
});
test('error renders an alert and changes the accessible name', () => {
  const ui = render(<TextField label="Name" value="" error="Required" />);
  expect(ui.getByLabelText('Name, error: Required')).toBeTruthy();
  expect(ui.getByRole('alert')).toHaveTextContent('Required');
  expect(flat(ui.getByTestId('text-field-box'))).toMatchObject({ borderWidth: 2, borderColor: colors.error });
  fireEvent(ui.getByLabelText('Name, error: Required'), 'focus');
  expect(ui.queryByTestId('text-field-halo')).toBeNull();
});
test('secure toggle follows the parent and masked text uses its role', () => {
  const toggle = jest.fn();
  const ui = render(<TextField label="Password" value="secret" secureTextEntry onToggleSecure={toggle} />);
  expect(flat(ui.getByLabelText('Password'))).toMatchObject(typeRoles.textMasked);
  fireEvent.press(ui.getByRole('button', { name: 'Show password' }));
  expect(toggle).toHaveBeenCalledTimes(1);
  ui.rerender(<TextField label="Password" value="secret" secureTextEntry={false} onToggleSecure={toggle} />);
  expect(ui.getByRole('button', { name: 'Hide password' })).toBeTruthy();
  expect(flat(ui.getByLabelText('Password'))).toMatchObject(typeRoles.textInput);
});
test('disabled cannot edit and does not force suggestion settings', () => {
  const ui = render(<TextField label="Name" value="" disabled />);
  expect(ui.getByLabelText('Name').props.editable).toBe(false);
  expect(ui.getByLabelText('Name').props.autoCorrect).toBeUndefined();
  ui.rerender(<TextField label="Name" value="" autoCorrect={false} />);
  expect(ui.getByLabelText('Name').props.autoCorrect).toBe(false);
});
test('focus keeps the 2dp border and displays a sibling halo, then blur removes it', () => {
  const onFocus = jest.fn(); const onBlur = jest.fn();
  const ui = render(<TextField label="Name" value="" onFocus={onFocus} onBlur={onBlur} />);
  expect(flat(ui.getByTestId('text-field-box'))).toMatchObject({ borderWidth: 2, borderColor: colors.fieldEdge });
  fireEvent(ui.getByLabelText('Name'), 'focus');
  expect(flat(ui.getByTestId('text-field-box'))).toMatchObject({ borderWidth: 2, borderColor: colors.text });
  expect(flat(ui.getByTestId('text-field-halo')).backgroundColor).toBe(tints.pressed);
  expect(onFocus).toHaveBeenCalledTimes(1);
  fireEvent(ui.getByLabelText('Name'), 'blur');
  expect(ui.queryByTestId('text-field-halo')).toBeNull();
  expect(onBlur).toHaveBeenCalledTimes(1);
});
test('multiline grows and forwards input changes', () => {
  const onChangeText = jest.fn();
  const ui = render(<TextField label="Notes" value="" multiline onChangeText={onChangeText} />);
  expect(flat(ui.getByTestId('text-field-box')).minHeight).toBe(112);
  expect(flat(ui.getByLabelText('Notes'))).toMatchObject({ minHeight: 66, textAlignVertical: 'top' });
  fireEvent.changeText(ui.getByLabelText('Notes'), 'A note');
  expect(onChangeText).toHaveBeenCalledWith('A note');
});

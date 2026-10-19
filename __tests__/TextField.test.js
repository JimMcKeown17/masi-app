import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, color, style }) => {
    const { Text } = require('react-native');
    return <Text testID={`icon-${name}`} style={[{ color }, style]} />;
  },
}), { virtual: true });
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

describe('red surface and form-placed errors', () => {
  const emailProps = {
    surface: 'red', label: 'Email', icon: 'mail-outline', value: '', testID: 'email',
  };

  test('red rest has a transparent border and no halo', () => {
    const onChangeText = jest.fn();
    const ui = render(<TextField {...emailProps} onChangeText={onChangeText} />);
    expect(flat(ui.getByTestId('text-field-box'))).toMatchObject({ borderColor: 'transparent', borderWidth: 2 });
    expect(ui.queryByTestId('text-field-halo')).toBeNull();
    expect(flat(ui.getByTestId('icon-mail-outline')).color).toBe(colors.textSecondary);
    expect(flat(ui.getByText('Email')).color).toBe(colors.textSecondary);
    fireEvent.changeText(ui.getByTestId('email'), 'ea@example.org');
    expect(onChangeText).toHaveBeenCalledWith('ea@example.org');
    ui.rerender(<TextField {...emailProps} value="ea@example.org" onChangeText={onChangeText} />);
    expect(flat(ui.getByTestId('icon-mail-outline')).color).toBe(colors.text);
  });

  test('red focus draws an ink border and the white halo', () => {
    const ui = render(<TextField {...emailProps} />);
    fireEvent(ui.getByTestId('email'), 'focus');
    expect(flat(ui.getByTestId('text-field-box'))).toMatchObject({ borderColor: colors.text, borderWidth: 2 });
    expect(flat(ui.getByTestId('text-field-halo'))).toMatchObject({
      backgroundColor: tints.onRedHalo, position: 'absolute', top: -4, bottom: -4,
      left: -4, right: -4, borderRadius: 18,
    });
    expect(flat(ui.getByTestId('icon-mail-outline')).color).toBe(colors.text);
    fireEvent(ui.getByTestId('email'), 'blur');
    expect(ui.queryByTestId('text-field-halo')).toBeNull();
    expect(flat(ui.getByTestId('text-field-box')).borderColor).toBe('transparent');
  });

  test('red error rings in error with the errorBg halo', () => {
    const error = 'Please enter a valid email address';
    const ui = render(<TextField {...emailProps} error={error} />);
    expect(flat(ui.getByTestId('text-field-box'))).toMatchObject({ borderColor: colors.error, borderWidth: 2 });
    expect(flat(ui.getByTestId('text-field-halo')).backgroundColor).toBe(colors.errorBg);
    expect(flat(ui.getByTestId('icon-mail-outline')).color).toBe(colors.error);
    expect(flat(ui.getByText('Email')).color).toBe(colors.error);
    expect(ui.getAllByRole('alert')).toHaveLength(1);
    expect(ui.getByRole('alert')).toHaveTextContent(error);
    fireEvent(ui.getByTestId('email'), 'focus');
    expect(flat(ui.getByTestId('text-field-box')).borderColor).toBe(colors.error);
    expect(flat(ui.getByTestId('text-field-halo')).backgroundColor).toBe(colors.errorBg);
  });

  test.each([
    ['rest', undefined, 'transparent', null],
    ['focused', undefined, colors.text, tints.onRedHalo],
    ['invalid', 'Required', colors.error, colors.errorBg],
  ])('red disabled dims value and chrome but keeps the %s layout', (state, error, borderColor, haloColor) => {
    const onToggleSecure = jest.fn();
    const props = {
      surface: 'red', label: 'Password', icon: 'lock-closed-outline', value: 'secret',
      secureTextEntry: true, onToggleSecure, error, testID: 'password',
    };
    const ui = render(<TextField {...props} />);
    if (state === 'focused') fireEvent(ui.getByTestId('password'), 'focus');
    ui.rerender(<TextField {...props} disabled />);
    expect(ui.getByTestId('password').props.editable).toBe(false);
    expect(flat(ui.getByTestId('password'))).toMatchObject({ ...typeRoles.textMasked, color: colors.text, opacity: 0.7 });
    expect(flat(ui.getByTestId('icon-lock-closed-outline')).opacity).toBe(0.5);
    expect(flat(ui.getByText('Password')).opacity).toBe(0.5);
    const toggle = ui.getByRole('button', { name: 'Show password' });
    expect(flat(toggle)).toMatchObject({ width: 44, height: 44, opacity: 0.5 });
    expect(toggle.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(toggle);
    expect(onToggleSecure).not.toHaveBeenCalled();
    expect(flat(ui.getByTestId('text-field-box'))).toMatchObject({
      minHeight: 60, borderWidth: 2, backgroundColor: colors.surface, borderColor,
    });
    if (haloColor) expect(flat(ui.getByTestId('text-field-halo')).backgroundColor).toBe(haloColor);
    else expect(ui.queryByTestId('text-field-halo')).toBeNull();
  });

  test.each(['red', 'canvas'])('form placement on %s keeps the ring and accessibility but draws no note', (surface) => {
    const error = 'Please enter both email and password';
    const ui = render(<TextField {...emailProps} surface={surface} error={error} errorPlacement="form" />);
    expect(ui.queryByRole('alert')).toBeNull();
    expect(ui.queryByText(error)).toBeNull();
    expect(flat(ui.getByTestId('text-field-box')).borderColor).toBe(colors.error);
    expect(ui.getByLabelText(`Email, error: ${error}`)).toBe(ui.getByTestId('email'));
  });
});

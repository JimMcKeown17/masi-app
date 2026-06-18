import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import BrandButton from '../src/components/common/BrandButton';
import { colors } from '../src/constants/colors';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

const collectColorsArrayProps = (node, matches = []) => {
  if (!node) {
    return matches;
  }

  const nodes = Array.isArray(node) ? node : [node];

  nodes.forEach((item) => {
    if (item?.props && Array.isArray(item.props.colors)) {
      matches.push(item);
    }
    collectColorsArrayProps(item?.children, matches);
  });

  return matches;
};

describe('BrandButton', () => {
  test('renders a solid accessible primary CTA and handles presses', () => {
    const onPress = jest.fn();
    const { getByLabelText, getByText, toJSON } = render(
      <BrandButton label="Record Session" onPress={onPress} />
    );

    expect(getByText('Record Session')).toBeTruthy();

    const button = getByLabelText('Record Session');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Record Session');

    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);

    const buttonStyle = typeof button.props.style === 'function'
      ? button.props.style({ pressed: false })
      : button.props.style;
    expect(StyleSheet.flatten(buttonStyle).backgroundColor).toBe(colors.primary);
    expect(button.props.colors).toBeUndefined();
    expect(collectColorsArrayProps(toJSON())).toHaveLength(0);
  });

  test('shows loading state without label text and disables interaction', () => {
    const onPress = jest.fn();
    const { getByLabelText, queryByText } = render(
      <BrandButton label="Sign In" onPress={onPress} loading />
    );

    const button = getByLabelText('Sign In');
    expect(queryByText('Sign In')).toBeNull();
    expect(button.props.accessibilityState.busy).toBe(true);
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('renders label when an icon is provided', () => {
    const { getByText } = render(
      <BrandButton label="Record Session" onPress={jest.fn()} icon="add-circle-outline" />
    );

    expect(getByText('Record Session')).toBeTruthy();
  });

  test('sets disabled accessibility state when disabled', () => {
    const { getByLabelText } = render(
      <BrandButton label="Record Session" onPress={jest.fn()} disabled />
    );

    const button = getByLabelText('Record Session');
    expect(button.props.accessibilityState.disabled).toBe(true);
  });
});

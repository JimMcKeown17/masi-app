import React from 'react';
import { render } from '@testing-library/react-native';
import ProfileGearButton from '../src/components/common/ProfileGearButton';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

test('Profile gear is an accessible labelled button', () => {
  const { getByLabelText } = render(<ProfileGearButton onPress={jest.fn()} />);
  const gear = getByLabelText('Open profile');
  expect(gear.props.accessibilityRole).toBe('button');
  expect(gear.props.accessibilityLabel).toBe('Open profile');
});

import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  Text,
} from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import BottomSheet from '../src/components/common/BottomSheet';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const renderSheet = (props = {}) => render(
  <BottomSheet
    visible
    onDismiss={jest.fn()}
    title="Choose a group"
    subtitle="Amahle Dlamini"
    dismissLabel="Dismiss test sheet"
    {...props}
  >
    <Text>Body content</Text>
  </BottomSheet>,
);

describe('BottomSheet', () => {
  test('renders its title, subtitle, and body only when visible', () => {
    const visible = renderSheet();

    expect(visible.getByText('Choose a group')).toBeTruthy();
    expect(visible.getByText('Amahle Dlamini')).toBeTruthy();
    expect(visible.getByText('Body content')).toBeTruthy();

    const hidden = renderSheet({ visible: false });

    expect(hidden.queryByText('Choose a group')).toBeNull();
    expect(hidden.queryByText('Amahle Dlamini')).toBeNull();
    expect(hidden.queryByText('Body content')).toBeNull();
  });

  test('dismisses from both the labelled backdrop and hardware back', () => {
    const onDismiss = jest.fn();
    const sheet = renderSheet({ onDismiss });

    fireEvent.press(sheet.getByLabelText('Dismiss test sheet'));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    sheet.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  test('renders header extras before the body and the footer after it', () => {
    const { toJSON } = renderSheet({
      headerExtras: <Text>Header extras</Text>,
      footer: <Text>Footer content</Text>,
    });
    const output = JSON.stringify(toJSON());

    expect(output.indexOf('Amahle Dlamini')).toBeLessThan(output.indexOf('Header extras'));
    expect(output.indexOf('Header extras')).toBeLessThan(output.indexOf('Body content'));
    expect(output.indexOf('Body content')).toBeLessThan(output.indexOf('Footer content'));
  });

  test('uses a plain body when scrolling is disabled', () => {
    const sheet = renderSheet({ scrollable: false });

    expect(sheet.UNSAFE_queryByType(ScrollView)).toBeNull();
    expect(sheet.getByText('Body content')).toBeTruthy();
  });

  test('omits keyboard avoidance when disabled', () => {
    const sheet = renderSheet({ keyboardAvoiding: false });

    expect(sheet.UNSAFE_queryByType(KeyboardAvoidingView)).toBeNull();
    expect(sheet.getByText('Body content')).toBeTruthy();
  });
});

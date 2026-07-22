import React from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import BottomSheet from '../src/components/common/BottomSheet';

jest.mock('react-native-safe-area-context', () => {
  const ReactForMock = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    useSafeAreaInsets: () => insets,
    SafeAreaInsetsContext: ReactForMock.createContext(insets),
    SafeAreaProvider: ({ children }) => <>{children}</>,
  };
});

// BottomSheet renders through Paper's Portal, which needs the PaperProvider's
// Portal.Host above it — same as the app root provides.
const renderSheet = (props = {}) => render(
  <PaperProvider>
    <BottomSheet
      visible
      onDismiss={jest.fn()}
      title="Choose a group"
      subtitle="Amahle Dlamini"
      dismissLabel="Dismiss test sheet"
      {...props}
    >
      <Text>Body content</Text>
    </BottomSheet>
  </PaperProvider>,
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
    const backSpy = jest.spyOn(BackHandler, 'addEventListener');
    const onDismiss = jest.fn();
    const sheet = renderSheet({ onDismiss });

    fireEvent.press(sheet.getByLabelText('Dismiss test sheet'));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    // Portal has no Modal onRequestClose; Android hardware back goes through
    // the BackHandler subscription instead.
    const backCall = backSpy.mock.calls.find(([event]) => event === 'hardwareBackPress');
    expect(backCall).toBeTruthy();
    act(() => {
      backCall[1]();
    });
    expect(onDismiss).toHaveBeenCalledTimes(2);
    backSpy.mockRestore();
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

  test('does not attach a diagnostic layout handler to the sheet panel', () => {
    const sheet = renderSheet();
    const panel = sheet.UNSAFE_getAllByType(View).find(
      node => StyleSheet.flatten(node.props.style)?.maxHeight === '80%',
    );

    expect(panel.props.onLayout).toBeUndefined();
  });
});

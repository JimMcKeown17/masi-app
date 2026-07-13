const mockSelectSheetRowRender = jest.fn();

jest.mock('react', () => {
  const actualReact = jest.requireActual('react');
  return {
    ...actualReact,
    memo: (component, compare) => {
      if (component.name !== 'SelectSheetRow') {
        return actualReact.memo(component, compare);
      }
      function InstrumentedSelectSheetRow(props) {
        mockSelectSheetRowRender(props.optionKey);
        return component(props);
      }
      return actualReact.memo(InstrumentedSelectSheetRow, compare);
    },
  };
});

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import SelectSheet from '../src/components/common/SelectSheet';

jest.mock('react-native-safe-area-context', () => {
  const ReactForMock = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    useSafeAreaInsets: () => insets,
    SafeAreaInsetsContext: ReactForMock.createContext(insets),
    SafeAreaProvider: ({ children }) => <>{children}</>,
  };
});

const options = [
  { key: 'school-1', label: 'Sunrise Primary', description: 'Gqeberha' },
  { key: 'school-2', label: 'Hilltop School' },
];

const renderSheet = (props = {}) => render(
  <PaperProvider>
    <SelectSheet
      visible
      onDismiss={jest.fn()}
      title="Select School"
      dismissLabel="Dismiss school picker"
      options={options}
      selectedKey={null}
      onSelect={jest.fn()}
      {...props}
    />
  </PaperProvider>,
);

describe('SelectSheet', () => {
  test('renders one row per option with optional descriptions', () => {
    const sheet = renderSheet();

    expect(sheet.getByText('Sunrise Primary')).toBeTruthy();
    expect(sheet.getByText('Gqeberha')).toBeTruthy();
    expect(sheet.getByText('Hilltop School')).toBeTruthy();
  });

  test('selects and dismisses immediately when no confirmation is required', () => {
    const onSelect = jest.fn();
    const onDismiss = jest.fn();
    const sheet = renderSheet({ onSelect, onDismiss });

    fireEvent.press(sheet.getByText('Hilltop School'));

    expect(onSelect).toHaveBeenCalledWith('school-2');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('drafts a selection and commits it from the confirmation button', () => {
    const onSelect = jest.fn();
    const onDismiss = jest.fn();
    const sheet = renderSheet({
      selectedKey: 'school-1',
      onSelect,
      onDismiss,
      confirmLabel: 'Start',
    });

    fireEvent.press(sheet.getByLabelText('Hilltop School'));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(sheet.getByLabelText('Hilltop School').props.accessibilityState)
      .toEqual({ selected: true });

    fireEvent.press(sheet.getByText('Start'));

    expect(onSelect).toHaveBeenCalledWith('school-2');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('renders a visible cancel action that dismisses without committing', () => {
    const onSelect = jest.fn();
    const onDismiss = jest.fn();
    const sheet = renderSheet({
      onSelect,
      onDismiss,
      confirmLabel: 'Start',
      cancelLabel: 'Cancel',
    });

    fireEvent.press(sheet.getByText('Hilltop School'));
    fireEvent.press(sheet.getByText('Cancel'));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('renders the empty message when no options are available', () => {
    const sheet = renderSheet({
      options: [],
      emptyMessage: 'No classes available. Create a class first.',
    });

    expect(sheet.getByText('No classes available. Create a class first.')).toBeTruthy();
  });

  test('passes its maximum height through to the bottom sheet', () => {
    const sheet = renderSheet({ maxHeight: '60%' });
    const hasSixtyPercentSheet = sheet.UNSAFE_getAllByType(View).some(
      node => StyleSheet.flatten(node.props.style)?.maxHeight === '60%',
    );

    expect(hasSixtyPercentSheet).toBe(true);
  });

  test('does not re-render rows when the option list is unchanged', () => {
    const onDismiss = jest.fn();
    const onSelect = jest.fn();
    const element = title => (
      <PaperProvider>
        <SelectSheet
          visible
          onDismiss={onDismiss}
          title={title}
          dismissLabel="Dismiss school picker"
          options={options}
          selectedKey="school-1"
          onSelect={onSelect}
        />
      </PaperProvider>
    );
    const sheet = render(element('Select School'));
    mockSelectSheetRowRender.mockClear();

    sheet.rerender(element('Choose School'));

    expect(mockSelectSheetRowRender).not.toHaveBeenCalled();
  });
});

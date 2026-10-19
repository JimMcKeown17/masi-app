jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
import React from 'react';
import { StyleSheet } from 'react-native';
import { colors, tints } from '../src/constants/colors';
import { act, fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import GroupPickerBottomSheet from '../src/components/children/GroupPickerBottomSheet';

// GroupPickerBottomSheet uses useSafeAreaInsets() and PaperProvider internally
// uses SafeAreaInsetsContext.Consumer. Provide the full set of exports that
// both the component and PaperProvider's SafeAreaProviderCompat need.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  const frame = { x: 0, y: 0, width: 320, height: 640 };
  const SafeAreaInsetsContext = React.createContext(insets);
  const SafeAreaFrameContext = React.createContext(frame);
  return {
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    SafeAreaProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    SafeAreaConsumer: SafeAreaInsetsContext.Consumer,
    initialWindowMetrics: { insets, frame },
  };
});


const mockUseChildren = jest.fn();
jest.mock('../src/context/ChildrenContext', () => ({
  useChildren: () => mockUseChildren(),
}));

const contextDefaults = {
  addGroup: jest.fn(),
  deleteGroup: jest.fn(),
  addChildToGroup: jest.fn(),
  removeChildFromGroup: jest.fn(),
  getChildrenInGroup: () => [],
};

const renderPicker = (props = {}) =>
  render(
    <PaperProvider>
      <GroupPickerBottomSheet
        visible={true}
        onDismiss={jest.fn()}
        childId="child-1"
        childName="Test Child"
        currentGroupId={null}
        {...props}
      />
    </PaperProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GroupPickerBottomSheet', () => {
  test('zero-group user: renders four virtual rows and no "+ Add" button', () => {
    mockUseChildren.mockReturnValue({ ...contextDefaults, groups: [] });

    const { getByText, queryByText } = renderPicker();

    expect(getByText('Group 1')).toBeTruthy();
    expect(getByText('Group 2')).toBeTruthy();
    expect(getByText('Group 3')).toBeTruthy();
    expect(getByText('Group 4')).toBeTruthy();
    // "+ Add Group N" button must be hidden while virtuals are showing
    expect(queryByText(/Add Group/)).toBeNull();
  });

  test('user with two groups: renders groups + "+ Add Group 3", no virtuals', () => {
    mockUseChildren.mockReturnValue({
      ...contextDefaults,
      groups: [
        { id: 'g1', name: 'Group 1' },
        { id: 'g2', name: 'Group 2' },
      ],
    });

    const { getByText, queryByText } = renderPicker();

    expect(getByText('Group 1')).toBeTruthy();
    expect(getByText('Group 2')).toBeTruthy();
    // No virtual Group 3 or Group 4 rows (note the anchors — rule out partial
    // matches inside the "+ Add Group 3" button label)
    expect(queryByText(/^Group 3$/)).toBeNull();
    expect(queryByText(/^Group 4$/)).toBeNull();
    expect(getByText('+  Add Group 3')).toBeTruthy();
  });

  test('keeps the labelled backdrop dismissal', () => {
    mockUseChildren.mockReturnValue({ ...contextDefaults, groups: [] });
    const onDismiss = jest.fn();
    const { getByLabelText } = renderPicker({ onDismiss });

    fireEvent.press(getByLabelText('Dismiss group picker'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

test('shared group actions keep their labels, assignment and removal handlers', async () => {
  mockUseChildren.mockReturnValue({ ...contextDefaults, groups: [{ id: 'g1', name: 'Group 1' }] });
  contextDefaults.addGroup.mockResolvedValue({ success: true, group: { id: 'g2' } });
  contextDefaults.addChildToGroup.mockResolvedValue({ success: true });
  contextDefaults.removeChildFromGroup.mockResolvedValue({ success: true });
  const onGroupChanged = jest.fn();
  const screen = renderPicker({ currentGroupId: 'g1', onGroupChanged });
  const add = screen.getByRole('button', { name: 'Add Group 2' });
  const remove = screen.getByRole('button', { name: 'Remove Test Child from group' });
  for (const button of [add, remove]) {
    expect(StyleSheet.flatten(button.props.style)).toEqual(expect.objectContaining({
      backgroundColor: colors.surface, borderColor: tints.control, borderWidth: 1.5, minHeight: 56,
    }));
  }
  await act(async () => fireEvent.press(add));
  expect(contextDefaults.addGroup).toHaveBeenCalledWith({ name: 'Group 2' });
  expect(contextDefaults.removeChildFromGroup).toHaveBeenCalledWith('child-1', 'g1');
  expect(contextDefaults.addChildToGroup).toHaveBeenCalledWith('child-1', 'g2');
  expect(onGroupChanged).toHaveBeenCalledTimes(1);
  contextDefaults.removeChildFromGroup.mockClear();
  await act(async () => fireEvent.press(remove));
  expect(contextDefaults.removeChildFromGroup).toHaveBeenCalledWith('child-1', 'g1');
  expect(onGroupChanged).toHaveBeenCalledTimes(2);
});

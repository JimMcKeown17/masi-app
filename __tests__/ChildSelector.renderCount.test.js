jest.mock('@expo/vector-icons', () => new Proxy({}, {
  get: (target, prop) => {
    if (prop === '__esModule') return true;
    if (!target[prop]) target[prop] = () => null;
    return target[prop];
  },
}), { virtual: true });

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => ({
  __esModule: true,
  default: () => null,
}), { virtual: true });

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 320, height: 640 };
  const SafeAreaInsetsContext = React.createContext(insets);
  const SafeAreaFrameContext = React.createContext(frame);
  return {
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    SafeAreaProvider: ({ children }) => children,
    SafeAreaConsumer: SafeAreaInsetsContext.Consumer,
    initialWindowMetrics: { insets, frame },
  };
});

jest.mock('react-native-paper', () => {
  const React = require('react');
  const paper = jest.requireActual('react-native-paper');
  const rowRenderSpy = jest.fn();
  const OriginalListItem = paper.List.Item;

  function InstrumentedListItem(props) {
    rowRenderSpy(props.title);
    return React.createElement(OriginalListItem, props);
  }

  return {
    ...paper,
    List: {
      ...paper.List,
      Item: InstrumentedListItem,
    },
    childSelectorRowRenderSpy: rowRenderSpy,
  };
});

const mockUseAuth = jest.fn();
const mockUseOffline = jest.fn();
const mockUseClasses = jest.fn();
const mockUseLookupsContext = jest.fn();
const mockUseChildren = jest.fn();

jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => mockUseClasses() }));
jest.mock('../src/context/LookupsContext', () => ({ useLookupsContext: () => mockUseLookupsContext() }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockUseChildren() }));
jest.mock('../src/services/literacySessionPersistence', () => ({
  persistLiteracySession: jest.fn(),
}));

import React from 'react';
import { FlatList } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { PaperProvider, childSelectorRowRenderSpy } from 'react-native-paper';
import LiteracySessionForm from '../src/screens/sessions/LiteracySessionForm';

const children = Array.from({ length: 60 }, (_, index) => ({
  id: `child-${index + 1}`,
  first_name: `Child ${index + 1}`,
  last_name: 'Learner',
  class_id: 'class-1',
}));

const navigation = {
  replace: jest.fn(),
  dispatch: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
};

function hasAncestorOfType(node, type) {
  let current = node.parent;
  while (current) {
    if (current.type === type) return true;
    current = current.parent;
  }
  return false;
}

describe('LiteracySessionForm roster render isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'ea-1' }, profile: {} });
    mockUseOffline.mockReturnValue({
      refreshSyncStatus: jest.fn(),
      triggerBackgroundSync: jest.fn(),
    });
    mockUseClasses.mockReturnValue({
      classes: [{ id: 'class-1', name: 'Grade 1A', home_language: 'English' }],
    });
    mockUseLookupsContext.mockReturnValue({ jobTitles: [] });
    mockUseChildren.mockReturnValue({
      children,
      groups: [],
      getChildrenInGroup: () => [],
    });
  });

  function renderForm() {
    return render(
      <PaperProvider settings={{ icon: () => null }}>
        <LiteracySessionForm navigation={navigation} />
      </PaperProvider>,
    );
  }

  test('selecting one child re-renders exactly one roster row', () => {
    const screen = renderForm();
    childSelectorRowRenderSpy.mockClear();

    fireEvent.press(screen.getByText('Child 1 Learner'));

    expect(childSelectorRowRenderSpy).toHaveBeenCalledTimes(1);
    expect(childSelectorRowRenderSpy).toHaveBeenCalledWith('Child 1 Learner');
  });

  test('typing a comment re-renders zero roster rows', () => {
    const screen = renderForm();
    childSelectorRowRenderSpy.mockClear();

    fireEvent.changeText(screen.getByPlaceholderText('Add session notes...'), 'a');

    expect(childSelectorRowRenderSpy).not.toHaveBeenCalled();
  });

  test('typing several comment characters keeps the focused input mounted with its text', () => {
    const screen = renderForm();
    const focusedInput = screen.getByPlaceholderText('Add session notes...');
    fireEvent(focusedInput, 'focus');

    let value = '';
    for (const character of 'focus') {
      value += character;
      fireEvent.changeText(screen.getByPlaceholderText('Add session notes...'), value);
      expect(screen.getByPlaceholderText('Add session notes...')).toBe(focusedInput);
    }

    expect(focusedInput.props.value).toBe('focus');
    expect(hasAncestorOfType(focusedInput, FlatList)).toBe(true);
  });
});

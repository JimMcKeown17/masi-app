const mockUseAuth = jest.fn();
const mockUseOffline = jest.fn();
const mockUseClasses = jest.fn();
const mockUseLookupsContext = jest.fn();
const mockUseChildren = jest.fn();

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

jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockUseOffline() }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => mockUseClasses() }));
jest.mock('../src/context/LookupsContext', () => ({ useLookupsContext: () => mockUseLookupsContext() }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockUseChildren() }));

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import LiteracySessionForm from '../src/screens/sessions/LiteracySessionForm';
import { READING_LEVELS } from '../src/constants/literacyConstants';

const buildNavigation = () => {
  const listeners = {};
  return {
    replace: jest.fn(),
    dispatch: jest.fn(),
    addListener: jest.fn((event, callback) => {
      listeners[event] = callback;
      return jest.fn();
    }),
    emitBeforeRemove: () => {
      const event = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
      listeners.beforeRemove?.(event);
      return event;
    },
  };
};

const renderForm = (navigation = buildNavigation()) => {
  const screen = render(
    <PaperProvider settings={{ icon: () => null }}>
      <LiteracySessionForm navigation={navigation} />
    </PaperProvider>
  );
  return { navigation, ...screen };
};

describe('LiteracySessionForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 'ea-1' },
      profile: {},
    });
    mockUseOffline.mockReturnValue({
      refreshSyncStatus: jest.fn(),
      triggerBackgroundSync: jest.fn(),
    });
    mockUseClasses.mockReturnValue({ classes: [] });
    mockUseLookupsContext.mockReturnValue({ jobTitles: [] });
    mockUseChildren.mockReturnValue({
      children: [],
      groups: [],
      getChildrenInGroup: () => [],
    });
  });

  test('renders the session-capture form scaffold', () => {
    const screen = renderForm();

    expect(screen.getByText('Session Date')).toBeTruthy();
    expect(screen.getByText('Select Children')).toBeTruthy();
    expect(screen.getByText('Letters Focused On')).toBeTruthy();
    expect(screen.getByText('Submit Session')).toBeTruthy();
  });

  describe('unsaved-changes leave guard', () => {
    test('a dirty form blocks leaving and asks for confirmation', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { navigation, getByPlaceholderText } = renderForm();
      fireEvent.changeText(getByPlaceholderText('Add session notes...'), 'worked on m sounds');
      const event = navigation.emitBeforeRemove();
      expect(event.preventDefault).toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    test('choosing a session reading level alone makes the form dirty', () => {
      const { navigation, getByText } = renderForm();
      fireEvent.press(getByText('Select a level'));
      fireEvent.press(getByText(READING_LEVELS[0]));
      const event = navigation.emitBeforeRemove();
      expect(event.preventDefault).toHaveBeenCalled();
    });

    test('a clean form leaves without prompting', () => {
      const { navigation } = renderForm();
      const event = navigation.emitBeforeRemove();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });
});

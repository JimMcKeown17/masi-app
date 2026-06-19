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
import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import LiteracySessionForm from '../src/screens/sessions/LiteracySessionForm';

const renderForm = () => render(
  <PaperProvider settings={{ icon: () => null }}>
    <LiteracySessionForm navigation={{ replace: jest.fn() }} />
  </PaperProvider>
);

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
});

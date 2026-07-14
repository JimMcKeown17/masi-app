import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('../src/utils/logger', () => ({
  logger: {
    init: jest.fn(),
  },
}));

const mockInitializeObservability = jest.fn(() => ({ enabled: true }));
const mockCaptureOperationalError = jest.fn();
const mockFlushObservability = jest.fn();
const mockWrapAppWithObservability = jest.fn((component) => component);

jest.mock('../src/services/observability', () => ({
  initializeObservability: mockInitializeObservability,
  captureOperationalError: mockCaptureOperationalError,
  flushObservability: mockFlushObservability,
  wrapAppWithObservability: mockWrapAppWithObservability,
}));

jest.mock('react-native-paper', () => {
  const React = require('react');
  return {
    PaperProvider: ({ children }) => <>{children}</>,
    MD3LightTheme: { colors: {} },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => <>{children}</>,
  SafeAreaView: ({ children }) => <>{children}</>,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/context/AuthContext', () => ({
  AuthProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../src/context/OfflineContext', () => ({
  OfflineProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../src/context/TimeTrackingContext', () => ({
  TimeTrackingProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../src/context/LookupsContext', () => ({
  LookupsProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../src/context/ChildrenContext', () => ({
  ChildrenProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../src/context/ClassesContext', () => ({
  ClassesProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../src/navigation/AppNavigator', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return () => <Text>Navigator</Text>;
});

describe('App root', () => {
  it('renders without legacy bootstrap imports', () => {
    const App = require('../App').default;

    const { getByText } = render(<App />);

    expect(getByText('Navigator')).toBeTruthy();
  });

  it('initializes observability before render and reports React boundary crashes', () => {
    const { ErrorBoundary } = require('../App');
    const error = new Error('render exploded');
    const boundary = new ErrorBoundary({ children: null });

    boundary.componentDidCatch(error, { componentStack: '\n    at BrokenScreen' });

    expect(mockInitializeObservability).toHaveBeenCalledTimes(1);
    expect(mockCaptureOperationalError).toHaveBeenCalledWith(error, {
      category: 'react_error_boundary',
      context: { componentStack: '\n    at BrokenScreen' },
    });
    expect(mockFlushObservability).toHaveBeenCalled();
    expect(mockWrapAppWithObservability).toHaveBeenCalled();
  });
});

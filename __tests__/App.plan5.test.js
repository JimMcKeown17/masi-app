import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('../src/utils/logger', () => ({
  logger: {
    init: jest.fn(),
  },
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
});

const mockUseAuth = jest.fn();
const mockUseSessionLaunchGuard = jest.fn();

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../src/hooks/useSessionLaunchGuard', () => ({
  useSessionLaunchGuard: (...args) => mockUseSessionLaunchGuard(...args),
}));

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import LockedBottomTabBar from '../src/components/navigation/LockedBottomTabBar';

describe('LockedBottomTabBar', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: { id: 'ea-1' } });
    mockUseSessionLaunchGuard.mockReturnValue({
      warningVisible: false,
      requestSessionLaunch: jest.fn(),
      continueAnyway: jest.fn(),
      clockInNow: jest.fn(),
      dismissWarning: jest.fn(),
    });
  });

  test('renders four destinations around a centre Record command', () => {
    const navigation = {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    };
    const state = {
      index: 0,
      routes: [
        { key: 'home', name: 'Home' },
        { key: 'children', name: 'Children' },
        { key: 'insights', name: 'Insights' },
        { key: 'assessments', name: 'Assessments' },
      ],
    };
    const descriptors = {
      home: { options: { tabBarLabel: 'Home' } },
      children: { options: { tabBarLabel: 'Children' } },
      insights: { options: { tabBarLabel: 'Insights' } },
      assessments: { options: { tabBarLabel: 'Assess' } },
    };

    const screen = render(
      <PaperProvider>
        <LockedBottomTabBar
          state={state}
          descriptors={descriptors}
          navigation={navigation}
        />
      </PaperProvider>
    );

    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Children')).toBeTruthy();
    expect(screen.getByText('Record')).toBeTruthy();
    expect(screen.getByText('Insights')).toBeTruthy();
    expect(screen.getByText('Assess')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Record a session'));
    expect(mockUseSessionLaunchGuard.mock.results[0].value.requestSessionLaunch).toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Insights tab'));
    expect(navigation.navigate).toHaveBeenCalledWith('Insights');
  });
});

import React from 'react';
import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ProfileScreen from '../src/screens/main/ProfileScreen';

jest.mock('expo-constants', () => ({
  expoConfig: {
    version: '1.2.0',
    runtimeVersion: { policy: 'appVersion' },
    ios: { buildNumber: '7' },
    android: { versionCode: 42 },
    updates: { url: 'https://u.expo.dev/test-project' },
    extra: {
      supabaseTarget: 'sqlite-staging',
      supabaseProjectId: 'segygjzpujphwvrubusm',
    },
  },
}), { virtual: true });

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'test@masinyusane.org' },
    profile: {
      first_name: 'Test',
      last_name: 'User',
      jobTitleName: 'Education Assistant',
      schoolName: 'Masi Primary',
    },
    updatePassword: jest.fn(),
    signOut: jest.fn(),
  }),
}));

jest.mock('../src/services/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
    },
  },
}));

jest.mock('../src/utils/debugExport', () => ({
  exportDatabase: jest.fn(),
  exportLogs: jest.fn(),
}));

describe('ProfileScreen release metadata', () => {
  test('shows app build and backend identity for support screenshots', () => {
    const { getByText } = render(
      <PaperProvider>
        <ProfileScreen navigation={{ goBack: jest.fn() }} />
      </PaperProvider>
    );

    expect(getByText(/Version 1\.2\.0/)).toBeTruthy();
    expect(getByText(/Backend sqlite-staging/)).toBeTruthy();
    expect(getByText(/Project segygjzpujphwvrubusm/)).toBeTruthy();
  });
});

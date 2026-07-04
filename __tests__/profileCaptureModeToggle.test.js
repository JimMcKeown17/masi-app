import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ProfileScreen from '../src/screens/main/ProfileScreen';
import { CAPTURE_MODES } from '../src/constants/egraConstants';
import { storage } from '../src/utils/storage';

const mockSignOut = jest.fn();
const mockUpdatePassword = jest.fn();

jest.mock('react-native-paper', () => {
  const React = require('react');
  const { Pressable, Text: NativeText, TextInput: NativeTextInput, View } = require('react-native');

  const Text = ({ children, ...props }) => <NativeText {...props}>{children}</NativeText>;
  const Button = ({ children, onPress, ...props }) => (
    <Pressable onPress={onPress} {...props}>
      <NativeText>{children}</NativeText>
    </Pressable>
  );
  const Card = ({ children, ...props }) => <View {...props}>{children}</View>;
  Card.Content = ({ children, ...props }) => <View {...props}>{children}</View>;
  const Divider = (props) => <View {...props} />;
  const Snackbar = ({ visible, children }) => (visible ? <View><NativeText>{children}</NativeText></View> : null);
  const TextInput = ({ label, value, onChangeText, ...props }) => (
    <NativeTextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      {...props}
    />
  );
  const SegmentedButtons = ({ value, onValueChange, buttons }) => (
    <View accessibilityRole="radiogroup">
      {buttons.map((button) => (
        <Pressable
          key={button.value}
          accessibilityRole="button"
          accessibilityState={{ selected: value === button.value }}
          onPress={() => onValueChange(button.value)}
          testID={`capture-mode-${button.value}`}
        >
          <NativeText>{button.label}</NativeText>
        </Pressable>
      ))}
    </View>
  );

  return {
    Button,
    Card,
    Divider,
    SegmentedButtons,
    Snackbar,
    Text,
    TextInput,
  };
});

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    NavigationContext: React.createContext({ isFocused: () => true }),
    useFocusEffect: (callback) => callback(),
  };
});

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'test@masinyusane.org' },
    profile: {
      first_name: 'Test',
      last_name: 'User',
      jobTitleName: 'Education Assistant',
      schoolName: 'Masi Primary',
    },
    updatePassword: mockUpdatePassword,
    signOut: mockSignOut,
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

jest.mock('../src/utils/releaseMetadata', () => ({
  getReleaseMetadata: () => ({
    appVersion: '1.2.0',
    iosBuildNumber: '7',
    androidVersionCode: 42,
    supabaseTarget: 'sqlite-staging',
    supabaseProjectId: 'segygjzpujphwvrubusm',
  }),
}));

jest.mock('../src/utils/storage', () => ({
  storage: {
    getCaptureMode: jest.fn(),
    setCaptureMode: jest.fn(),
  },
}));

const renderProfile = () => render(<ProfileScreen navigation={{ goBack: jest.fn() }} />);

describe('ProfileScreen assessment capture mode toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.getCaptureMode.mockResolvedValue(CAPTURE_MODES.SEQUENTIAL);
    storage.setCaptureMode.mockResolvedValue(undefined);
  });

  test('loads and displays the stored grid capture mode', async () => {
    storage.getCaptureMode.mockResolvedValue(CAPTURE_MODES.GRID);

    const screen = renderProfile();

    expect(await screen.findByText('Assessment capture')).toBeTruthy();
    expect(screen.getByText('Grid')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('capture-mode-grid').props.accessibilityState.selected).toBe(true);
    });
    expect(screen.getByTestId('capture-mode-sequential').props.accessibilityState.selected).toBe(false);
  });

  test('pressing Step-by-Step saves the new capture mode', async () => {
    storage.getCaptureMode.mockResolvedValue(CAPTURE_MODES.GRID);

    const screen = renderProfile();

    await waitFor(() => {
      expect(screen.getByTestId('capture-mode-grid').props.accessibilityState.selected).toBe(true);
    });

    fireEvent.press(screen.getByText('Step-by-Step'));

    await waitFor(() => {
      expect(storage.setCaptureMode).toHaveBeenCalledWith(CAPTURE_MODES.SEQUENTIAL);
    });
  });

  test('reverts to the previous capture mode when saving fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    storage.getCaptureMode.mockResolvedValue(CAPTURE_MODES.GRID);
    storage.setCaptureMode.mockRejectedValueOnce(new Error('write failed'));

    const screen = renderProfile();

    await waitFor(() => {
      expect(screen.getByTestId('capture-mode-grid').props.accessibilityState.selected).toBe(true);
    });

    fireEvent.press(screen.getByText('Step-by-Step'));

    await waitFor(() => {
      expect(storage.setCaptureMode).toHaveBeenCalledWith(CAPTURE_MODES.SEQUENTIAL);
      expect(screen.getByTestId('capture-mode-grid').props.accessibilityState.selected).toBe(true);
    });
    expect(screen.getByTestId('capture-mode-sequential').props.accessibilityState.selected).toBe(false);

    console.error.mockRestore();
  });
});

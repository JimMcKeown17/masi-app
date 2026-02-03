import 'react-native-get-random-values';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { OfflineProvider } from './src/context/OfflineContext';
import { ChildrenProvider } from './src/context/ChildrenContext';
import AppNavigator from './src/navigation/AppNavigator';
import { colors } from './src/constants/colors';
import { logger } from './src/utils/logger';

// Initialize logger to capture console output
logger.init();

// Custom theme using Masinyusane brand colors
const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,           // Blue #294A99
    primaryContainer: '#E3E9F5',       // Light blue container
    secondary: colors.accent,          // Yellow #FFDD00
    secondaryContainer: '#FFF9CC',     // Light yellow container
    tertiary: colors.emphasis,         // Red #E72D4D
    tertiaryContainer: '#FCEAED',      // Light red container
    error: colors.error,               // Red #E72D4D
    errorContainer: '#FCEAED',
    background: colors.background,     // #F7F7F7
    surface: colors.surface,           // #FFFFFF
    surfaceVariant: colors.cardBackground, // #FAFAFA
    onPrimary: '#FFFFFF',              // Text on primary (blue) backgrounds
    onSecondary: '#111111',            // Text on secondary (yellow) backgrounds
    onTertiary: '#FFFFFF',             // Text on tertiary (red) backgrounds
    onBackground: colors.text,         // #111111
    onSurface: colors.text,            // #111111
    outline: colors.border,            // #E5E7EB
    outlineVariant: colors.border,
    success: colors.success,           // Green #3FA535 (custom)
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <OfflineProvider>
          <AuthProvider>
            <ChildrenProvider>
              <AppNavigator />
              <StatusBar style="auto" />
            </ChildrenProvider>
          </AuthProvider>
        </OfflineProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

import 'react-native-get-random-values';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet as RNStyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { OfflineProvider } from './src/context/OfflineContext';
import { ChildrenProvider } from './src/context/ChildrenContext';
import AppNavigator from './src/navigation/AppNavigator';
import { colors } from './src/constants/colors';
import { logger } from './src/utils/logger';

class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App crashed:', error, errorInfo?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.emoji}>!</Text>
          <Text style={errorStyles.title}>Something went wrong</Text>
          <Text style={errorStyles.message}>
            The app ran into an unexpected error. Please try again.
          </Text>
          <TouchableOpacity
            style={errorStyles.button}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={errorStyles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = RNStyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F7F7',
    padding: 32,
  },
  emoji: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#E72D4D',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#294A99',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#294A99',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

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
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

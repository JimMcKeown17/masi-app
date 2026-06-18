import 'react-native-get-random-values';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet as RNStyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { OfflineProvider } from './src/context/OfflineContext';
import { LookupsProvider } from './src/context/LookupsContext';
import { ChildrenProvider } from './src/context/ChildrenContext';
import { ClassesProvider } from './src/context/ClassesContext';
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
    backgroundColor: colors.background,
    padding: 32,
  },
  emoji: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  button: {
    backgroundColor: colors.primary,
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
    primary: colors.primary,           // brand red
    primaryContainer: colors.red50,    // soft brand surface
    secondary: colors.accent,          // caution accent
    secondaryContainer: colors.warningBg, // warning surface
    tertiary: colors.emphasis,         // emphasis red
    tertiaryContainer: colors.red50,   // soft emphasis surface
    error: colors.error,               // semantic error
    errorContainer: colors.errorBg,
    background: colors.background,     // warm canvas
    surface: colors.surface,           // plain surface
    surfaceVariant: colors.cardBackground, // card surface
    onPrimary: '#FFFFFF',              // text on primary surfaces
    onSecondary: '#000000',            // black for AA contrast on amber secondary
    onTertiary: '#FFFFFF',             // text on tertiary surfaces
    onBackground: colors.text,         // text on canvas
    onSurface: colors.text,            // text on surfaces
    outline: colors.border,            // warm divider
    outlineVariant: colors.border,
    success: colors.success,           // semantic success
  },
};

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <OfflineProvider>
            <AuthProvider>
              <LookupsProvider>
                <ChildrenProvider>
                  <ClassesProvider>
                    <AppNavigator />
                    <StatusBar style="auto" />
                  </ClassesProvider>
                </ChildrenProvider>
              </LookupsProvider>
            </AuthProvider>
          </OfflineProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

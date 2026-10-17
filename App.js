import 'react-native-get-random-values';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet as RNStyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SignedInEAProvider } from './src/context/SignedInEAContext';
import HandleOpenError from './src/components/bootstrap/HandleOpenError';
import LoadingScreen from './src/components/bootstrap/LoadingScreen';
import { OfflineProvider } from './src/context/OfflineContext';
import { TimeTrackingProvider } from './src/context/TimeTrackingContext';
import { LookupsProvider } from './src/context/LookupsContext';
import { ChildrenProvider } from './src/context/ChildrenContext';
import { ClassesProvider } from './src/context/ClassesContext';
import AppNavigator from './src/navigation/AppNavigator';
import BrandButton from './src/components/common/BrandButton';
import DatabaseBootstrapGate from './src/components/bootstrap/DatabaseBootstrapGate';
import { colors } from './src/constants/colors';
import {
  captureOperationalError,
  flushObservability,
  initializeObservability,
  wrapAppWithObservability,
} from './src/services/observability';

import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Figtree_500Medium, Figtree_700Bold, Figtree_800ExtraBold } from '@expo-google-fonts/figtree';

// Keep the native splash up until the fonts settle, so a cold start never shows
// an empty root. Called at module scope, before the first render.
SplashScreen.preventAutoHideAsync().catch(() => {});

initializeObservability();

export class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    captureOperationalError(error, {
      category: 'react_error_boundary',
      context: { componentStack: errorInfo?.componentStack || null },
    });
    console.error('App crashed:', error, errorInfo?.componentStack);
    flushObservability();
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
          <BrandButton
            label="Try Again"
            onPress={() => this.setState({ hasError: false })}
            style={errorStyles.button}
          />
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
    minWidth: 180,
  },
});

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

export function AppRoot() {
  const { user, loading, handle, handleStatus, handleError, retryOpenHandle } = useAuth();
  if (handleStatus === 'failed') return <HandleOpenError error={handleError} onRetry={retryOpenHandle} />;
  if (loading || (user && !handle)) return <LoadingScreen />;
  if (!handle) return <AppNavigator signedIn={false} />;
  return (
    <SignedInEAProvider key={`${handle.userId}:${handle.epoch}`} handle={handle}>
      <OfflineProvider>
        <TimeTrackingProvider>
          <LookupsProvider>
            <ChildrenProvider>
              <ClassesProvider>
                <AppNavigator signedIn />
              </ClassesProvider>
            </ChildrenProvider>
          </LookupsProvider>
        </TimeTrackingProvider>
      </OfflineProvider>
    </SignedInEAProvider>
  );
}

export function App() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_800ExtraBold,
    Figtree_500Medium,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });
  const fontsSettled = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (!fontsSettled) return;
    // Never block the app on a failure: with fontError set, text falls back
    // to the system font.
    if (fontError) console.error('Font load failed; using system font:', fontError);
    SplashScreen.hideAsync().catch(() => {});
  }, [fontsSettled, fontError]);

  if (!fontsSettled) {
    return null; // the native splash is still showing
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <DatabaseBootstrapGate>
            <AuthProvider><AppRoot /></AuthProvider>
          </DatabaseBootstrapGate>
          <StatusBar style="auto" />
        </PaperProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

export default wrapAppWithObservability(App);

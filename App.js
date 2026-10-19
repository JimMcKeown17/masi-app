import 'react-native-get-random-values';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet as RNStyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SignedInEAProvider } from './src/context/SignedInEAContext';
import { MotionProvider } from './src/context/MotionContext';
import { ToastActorScope, ToastProvider } from './src/context/ToastContext';
import { SheetAccessibilityBackground, SheetAccessibilityProvider } from './src/context/SheetAccessibilityContext';
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
import { typeRoles } from './src/constants/typography';
import { paperTheme } from './src/theme/paperTheme';
import {
  captureOperationalError,
  flushObservability,
  initializeObservability,
  wrapAppWithObservability,
} from './src/services/observability';

import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold } from '@expo-google-fonts/figtree';

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
            label="Try again"
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
    ...typeRoles.display2XL,
    color: colors.primary,
    marginBottom: 16,
  },
  title: {
    ...typeRoles.displaySheetTitle,
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    ...typeRoles.textParagraph,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    minWidth: 180,
  },
});

export function AppRoot() {
  const { user, loading, handle, handleStatus, handleError, retryOpenHandle, signOut } = useAuth();
  if (handleStatus === 'failed') return <HandleOpenError error={handleError} onRetry={retryOpenHandle} onSignOut={user ? signOut : undefined} />;
  if (loading || (user && !handle)) return <LoadingScreen />;
  if (!handle) return <AppNavigator signedIn={false} />;
  return (
    <SignedInEAProvider key={`${handle.userId}:${handle.epoch}`} handle={handle}>
      <ToastActorScope handle={handle}>
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
      </ToastActorScope>
    </SignedInEAProvider>
  );
}

export function App() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Figtree_500Medium,
    Figtree_600SemiBold,
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
        <MotionProvider>
          <ToastProvider>
            <SheetAccessibilityProvider>
              <PaperProvider theme={paperTheme}>
                <SheetAccessibilityBackground>
                  <DatabaseBootstrapGate>
                    <AuthProvider><AppRoot /></AuthProvider>
                  </DatabaseBootstrapGate>
                </SheetAccessibilityBackground>
                <StatusBar style="dark" />
              </PaperProvider>
            </SheetAccessibilityProvider>
          </ToastProvider>
        </MotionProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

export default wrapAppWithObservability(App);

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { initializeDatabase } from '../../db/client';
import { captureOperationalError } from '../../services/observability';
import { exportLogs } from '../../utils/debugExport';
import { borderRadius, colors, spacing } from '../../constants/colors';
import { typography } from '../../constants/typography';
import BrandButton from '../common/BrandButton';

const errorCode = (error) => error?.code || 'SQLITE_BOOTSTRAP';

export default function DatabaseBootstrapGate({ children }) {
  const [status, setStatus] = useState('loading');
  const [bootstrapError, setBootstrapError] = useState(null);
  const [exportState, setExportState] = useState({ loading: false, message: null });
  const attemptRef = useRef(0);

  const attemptBootstrap = useCallback(async () => {
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    setStatus('loading');
    setBootstrapError(null);
    setExportState({ loading: false, message: null });

    try {
      await initializeDatabase();
      if (attemptRef.current === attempt) {
        setStatus('ready');
      }
    } catch (error) {
      console.error('SQLite bootstrap failed:', error);
      captureOperationalError(error, {
        category: 'sqlite_bootstrap_failed',
        context: {
          attempt,
          code: errorCode(error),
        },
      });
      if (attemptRef.current === attempt) {
        setBootstrapError(error);
        setStatus('failed');
      }
    }
  }, []);

  useEffect(() => {
    attemptBootstrap();
    return () => {
      attemptRef.current += 1;
    };
  }, [attemptBootstrap]);

  const handleExportLogs = useCallback(async () => {
    setExportState({ loading: true, message: null });
    try {
      const result = await exportLogs();
      setExportState({
        loading: false,
        message: result.success
          ? 'Error logs are ready to share.'
          : result.error || 'Could not export the error logs.',
      });
    } catch (error) {
      console.error('Bootstrap log export failed:', error);
      setExportState({ loading: false, message: 'Could not export the error logs.' });
    }
  }, []);

  if (status === 'ready') {
    return children;
  }

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.title}>Preparing your offline data</Text>
          <Text style={styles.message}>Checking your saved work before Masi opens.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content} accessibilityLiveRegion="polite">
        <View style={styles.errorMark} accessibilityElementsHidden>
          <Text style={styles.errorMarkText}>!</Text>
        </View>
        <Text style={styles.title}>We could not open your offline data</Text>
        <Text style={styles.message}>
          Your saved work has not been deleted. Try again. If this keeps happening,
          share the error logs with Masi support.
        </Text>
        <Text style={styles.supportCode}>Support code: {errorCode(bootstrapError)}</Text>

        <View style={styles.actions}>
          <BrandButton
            label="Try Again"
            loading={status === 'loading'}
            onPress={attemptBootstrap}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share Error Logs"
            accessibilityState={{ disabled: exportState.loading, busy: exportState.loading }}
            disabled={exportState.loading}
            onPress={handleExportLogs}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && !exportState.loading && styles.secondaryButtonPressed,
              exportState.loading && styles.secondaryButtonDisabled,
            ]}
          >
            {exportState.loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.secondaryButtonText}>Share Error Logs</Text>
            )}
          </Pressable>
        </View>

        {exportState.message ? (
          <Text style={styles.exportMessage}>{exportState.message}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorMark: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    borderCurve: 'continuous',
    backgroundColor: colors.errorBg,
  },
  errorMarkText: {
    ...typography.screenTitle,
    color: colors.error,
  },
  title: {
    ...typography.screenTitle,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 420,
  },
  supportCode: {
    ...typography.caption,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    maxWidth: 360,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  secondaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  secondaryButtonPressed: {
    backgroundColor: colors.red50,
  },
  secondaryButtonDisabled: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    ...typography.cardTitle,
    color: colors.primaryDark,
    textAlign: 'center',
  },
  exportMessage: {
    ...typography.caption,
    textAlign: 'center',
  },
});

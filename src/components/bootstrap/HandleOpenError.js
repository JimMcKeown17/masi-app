import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { exportLogs } from '../../utils/debugExport';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { isSchemaTooNewError } from '../../db/migrations';
import BrandButton from '../common/BrandButton';

const errorCode = (error) => error?.code || 'SQLITE_BOOTSTRAP';

export default function HandleOpenError({ error, onRetry, onSignOut }) {
  const schemaTooNew = isSchemaTooNewError(error);
  const showActions = !schemaTooNew || Boolean(onSignOut);
  const [exportState, setExportState] = useState({ loading: false, message: null });
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content} accessibilityLiveRegion="polite">
        <View style={styles.errorMark} accessibilityElementsHidden>
          <Text style={styles.errorMarkText}>!</Text>
        </View>
        <Text style={styles.title}>
          {schemaTooNew ? 'Update Masi to continue' : 'We could not open your offline data'}
        </Text>
        <Text style={styles.message}>
          {schemaTooNew
            ? 'This phone has data from a newer version of Masi. Install the latest version from the app store, then open Masi again.'
            : 'Your saved work has not been deleted. Try again. If this keeps happening, share the error logs with Masi support.'}
        </Text>
        <Text style={styles.supportCode}>Support code: {errorCode(error)}</Text>

        {showActions ? (
          <View style={styles.actions}>
            <BrandButton
              label={schemaTooNew ? 'Sign out' : 'Try again'}
              onPress={schemaTooNew ? onSignOut : onRetry}
            />
            {!schemaTooNew ? (
              <BrandButton
                label="Share error logs"
                variant="secondary"
                loading={exportState.loading}
                onPress={handleExportLogs}
              />
            ) : null}
          </View>
        ) : null}

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
    ...typeRoles.displaySheetTitle,
    color: colors.error,
  },
  title: {
    ...typeRoles.displaySheetTitle,
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    ...typeRoles.textParagraph,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 420,
  },
  supportCode: {
    ...typeRoles.textCaption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    maxWidth: 360,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  exportMessage: {
    ...typeRoles.textCaption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

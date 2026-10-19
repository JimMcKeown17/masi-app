import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useCallback, useContext, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Linking, Alert } from 'react-native';
import { TextInput, Button, Text, Card, Divider, SegmentedButtons } from 'react-native-paper';
import { NavigationContext, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { fontFamilies } from '../../constants/typography';
import { useOffline } from '../../context/OfflineContext';
import { useTimeTracking } from '../../hooks/useTimeTracking';
import { useSignOutFlow } from '../../hooks/useSignOutFlow';
import SignOutSheets from '../../components/profile/SignOutSheets';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { isStaleActorError } from '../../session/staleActor';
import { exportDatabase, exportLogs } from '../../utils/debugExport';
import { getReleaseMetadata } from '../../utils/releaseMetadata';
import { deviceSettings } from '../../services/deviceSettings';
import { CAPTURE_MODES } from '../../constants/egraConstants';
import { getRuntimeDiagnostics } from '../../utils/runtimeDiagnostics';
import { sendObservabilityTest } from '../../services/observability';

const PASSWORD_VERIFICATION_FAILED_MESSAGE =
  'Could not verify your current password. Check your connection and try again.';

function isInvalidCredentialsError(error) {
  if (error?.code === 'invalid_credentials') return true;
  if (error?.status !== 400) return false;

  const message = typeof error?.message === 'string' ? error.message.trim().toLowerCase() : '';
  return [
    'invalid login credentials',
    'invalid credentials',
    'invalid email or password',
    'incorrect email or password',
    'email or password is incorrect',
  ].includes(message);
}

function CaptureModeFocusLoader({ loadCaptureMode }) {
  useFocusEffect(loadCaptureMode);
  return null;
}

export default function ProfileScreen({ navigation }) {
  const { handle, repositories } = useSignedInEA();
  const toast = useToast();

  const { user, profile, signOut, changePassword } = useAuth();
  const { isSignedIn, handleSignOut } = useTimeTracking();
  const { isOnline, syncNow } = useOffline();
  const signOutFlow = useSignOutFlow({
    signOut, countUnsent: repositories.syncOutbox.countUnsent,
    isClockedIn: isSignedIn, clockOut: handleSignOut, isOnline, syncNow,
  });
  const releaseMetadata = getReleaseMetadata();
  const runtimeDiagnostics = getRuntimeDiagnostics();
  const navigationContext = useContext(NavigationContext);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Debug export state
  const [logsExportLoading, setLogsExportLoading] = useState(false);
  const [databaseExportLoading, setDatabaseExportLoading] = useState(false);
  const [reportTestLoading, setReportTestLoading] = useState(false);

  const [captureMode, setCaptureMode] = useState(CAPTURE_MODES.SEQUENTIAL);
  const loadCaptureMode = useCallback(() => {
    let active = true;
    (async () => {
      const mode = await deviceSettings.getCaptureMode();
      if (active) setCaptureMode(mode);
    })();
    return () => {
      active = false;
    };
  }, []);

  const showMessage = (message, type = 'success') => {
    toast.show({
      message,
      tone: type === 'error' ? 'error' : type === 'success' ? 'success' : 'neutral',
      duration: 4000,
    });
  };

  const handleChangeCaptureMode = async (mode) => {
    const previous = captureMode;
    setCaptureMode(mode);
    try {
      await deviceSettings.setCaptureMode(mode);
    } catch (error) {
      console.error('Set capture mode error:', error);
      setCaptureMode(previous);
    }
  };

  const handleShareLogs = async () => {
    setLogsExportLoading(true);
    try {
      const result = await exportLogs();
      if (result.success) {
        showMessage('Logs exported successfully');
      } else {
        showMessage(result.error || 'Failed to export logs', 'error');
      }
    } catch (error) {
      console.error('Share logs error:', error);
      showMessage('Failed to export logs', 'error');
    } finally {
      setLogsExportLoading(false);
    }
  };

  const handleShareDatabase = async () => {
    // Confirm action due to sensitive data
    Alert.alert(
      'Export Database',
      'This will export all local data including sensitive information. Only share with Masi support staff.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          style: 'destructive',
          onPress: async () => {
            setDatabaseExportLoading(true);
            try {
              const result = await exportDatabase({ handle });
              if (result.success) {
                showMessage('Database exported successfully');
              } else {
                showMessage(result.error || 'Failed to export database', 'error');
              }
            } catch (error) {
              console.error('Share database error:', error);
              showMessage('Failed to export database', 'error');
            } finally {
              setDatabaseExportLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleSendObservabilityTest = async () => {
    setReportTestLoading(true);
    try {
      const result = await sendObservabilityTest();
      showMessage(
        result.success ? 'Crash reporting test sent' : result.error,
        result.success ? 'success' : 'error'
      );
    } catch (error) {
      console.error('Crash reporting test error:', error);
      showMessage('Could not send crash reporting test', 'error');
    } finally {
      setReportTestLoading(false);
    }
  };

  const handleOpenTerms = async () => {
    try {
      const url = 'https://masinyusane.org/terms';
      const supported = await Linking.canOpenURL(url);

      if (supported) {
        await Linking.openURL(url);
      } else {
        showMessage('Cannot open URL', 'error');
      }
    } catch (error) {
      console.error('Open terms error:', error);
      showMessage('Failed to open Terms & Conditions', 'error');
    }
  };

  const handleOpenPrivacyPolicy = async () => {
    try {
      const url = 'https://www.masinyusane.org/privacy';
      const supported = await Linking.canOpenURL(url);

      if (supported) {
        await Linking.openURL(url);
      } else {
        showMessage('Cannot open URL', 'error');
      }
    } catch (error) {
      console.error('Open privacy policy error:', error);
      showMessage('Failed to open Privacy Policy', 'error');
    }
  };

  const handleChangePassword = async () => {
    if (!handle.isCurrent()) return;
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      showMessage('All password fields are required', 'error');
      return;
    }

    if (newPassword.length < 8) {
      showMessage('New password must be at least 8 characters', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage('New passwords do not match', 'error');
      return;
    }

    setPasswordLoading(true);
    try {
      const { error, phase } = await changePassword({ currentPassword, newPassword, handle });
      if (!handle.isCurrent() || isStaleActorError(error)) return;

      if (error && phase === 'verification') {
        console.error('Password verification error:', error);
        showMessage(
          isInvalidCredentialsError(error)
            ? 'Current password is incorrect'
            : PASSWORD_VERIFICATION_FAILED_MESSAGE,
          'error'
        );
        return;
      }

      if (error) throw error;

      // Clear password fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      showMessage('Password changed successfully');
    } catch (error) {
      if (!handle.isCurrent()) return;
      console.error('Password change error:', error);
      showMessage(error.message || 'Failed to change password', 'error');
    } finally {
      if (handle.isCurrent()) setPasswordLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {navigationContext ? <CaptureModeFocusLoader loadCaptureMode={loadCaptureMode} /> : null}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Profile Information Section */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              Profile Information
            </Text>

            <View style={styles.infoRow}>
              <Text variant="bodySmall" style={styles.infoLabel}>Name</Text>
              <Text variant="bodyLarge" style={styles.infoValue}>
                {profile?.first_name} {profile?.last_name}
              </Text>
            </View>

            <Divider style={styles.divider} />

            <View style={styles.infoRow}>
              <Text variant="bodySmall" style={styles.infoLabel}>Email</Text>
              <Text variant="bodyLarge" style={styles.infoValue}>
                {user?.email}
              </Text>
            </View>

            <Divider style={styles.divider} />

            <View style={styles.infoRow}>
              <Text variant="bodySmall" style={styles.infoLabel}>Job Title</Text>
              <Text variant="bodyLarge" style={styles.infoValue}>
                {profile?.jobTitleName}
              </Text>
            </View>

            {profile?.schoolName && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.infoRow}>
                  <Text variant="bodySmall" style={styles.infoLabel}>Assigned School</Text>
                  <Text variant="bodyLarge" style={styles.infoValue}>
                    {profile.schoolName}
                  </Text>
                </View>
              </>
            )}

            <Text variant="bodySmall" style={styles.helperText}>
              Profile information is managed by administrators
            </Text>
          </Card.Content>
        </Card>

        {/* Assessment Capture Section */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Assessment capture
            </Text>
            <Text variant="bodySmall" style={styles.helperText}>
              How you mark each item during an EGRA assessment.
            </Text>
            <SegmentedButtons
              value={captureMode}
              onValueChange={handleChangeCaptureMode}
              buttons={[
                { value: CAPTURE_MODES.GRID, label: 'Grid' },
                { value: CAPTURE_MODES.SEQUENTIAL, label: 'Step-by-Step' },
              ]}
            />
          </Card.Content>
        </Card>

        {/* Debug Options Section */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              Debug & Support
            </Text>

            <Text variant="bodySmall" style={styles.helperText}>
              Export logs or database when reporting issues to support
            </Text>

            <Button
              mode="outlined"
              onPress={handleShareLogs}
              loading={logsExportLoading}
              disabled={logsExportLoading}
              style={styles.button}
              icon="file-document-outline"
            >
              Share Logs
            </Button>

            <Button
              mode="outlined"
              onPress={handleShareDatabase}
              loading={databaseExportLoading}
              disabled={databaseExportLoading}
              style={styles.button}
              icon="database-export"
            >
              Share Database (Contains Sensitive Data)
            </Button>

            <Button
              mode="outlined"
              onPress={handleSendObservabilityTest}
              loading={reportTestLoading}
              disabled={reportTestLoading}
              style={styles.button}
              icon="bug-check-outline"
            >
              Test Crash Reporting
            </Button>
          </Card.Content>
        </Card>

        {/* Password Change Section */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              Change Password
            </Text>

            <TextInput
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={!showPasswords}
              mode="outlined"
              style={styles.input}
              disabled={passwordLoading}
            />

            <TextInput
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showPasswords}
              mode="outlined"
              style={styles.input}
              disabled={passwordLoading}
            />

            <TextInput
              label="Confirm New Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPasswords}
              mode="outlined"
              style={styles.input}
              disabled={passwordLoading}
            />

            <Button
              mode="text"
              onPress={() => setShowPasswords(!showPasswords)}
              style={styles.showPasswordButton}
            >
              {showPasswords ? 'Hide' : 'Show'} Passwords
            </Button>

            <Text variant="bodySmall" style={styles.helperText}>
              Password must be at least 8 characters
            </Text>

            <Button
              mode="contained"
              onPress={handleChangePassword}
              loading={passwordLoading}
              disabled={passwordLoading}
              style={styles.button}
            >
              Change Password
            </Button>
          </Card.Content>
        </Card>

        {/* Terms & Conditions Section */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              Legal
            </Text>

            <Button
              mode="outlined"
              onPress={handleOpenTerms}
              style={styles.button}
              icon="file-document"
            >
              Terms & Conditions
            </Button>

            <Button
              mode="outlined"
              onPress={handleOpenPrivacyPolicy}
              style={styles.button}
              icon="shield-lock-outline"
            >
              Privacy Policy
            </Button>
          </Card.Content>
        </Card>

        {/* App Version */}
        <Text variant="bodySmall" style={styles.versionText}>
          Version {runtimeDiagnostics.application.version}
          {' '}(Build {runtimeDiagnostics.application.build || '?'})
        </Text>
        <Text variant="bodySmall" style={styles.versionText}>
          Backend {releaseMetadata.supabaseTarget}
        </Text>
        <Text variant="bodySmall" style={styles.versionText}>
          Project {releaseMetadata.supabaseProjectId}
        </Text>
        <Text variant="bodySmall" style={styles.versionText}>
          Device {runtimeDiagnostics.device.modelName || 'Unknown'} · {runtimeDiagnostics.device.osName || Platform.OS} {runtimeDiagnostics.device.osVersion || Platform.Version}
        </Text>
        <Text variant="bodySmall" style={styles.versionText}>
          Update {runtimeDiagnostics.update.id || 'Embedded'}
        </Text>

        {/* Sign Out */}
        <Button
          mode="outlined"
          onPress={signOutFlow.start}
          loading={signOutFlow.busy === 'signing_out'}
          style={styles.signOutButton}
          textColor={colors.primary}
          icon="logout"
        >
          Sign Out
        </Button>
      </ScrollView>

      <SignOutSheets {...signOutFlow} isOnline={isOnline} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xl * 2,
  },
  card: {
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    ...shadows.card,
  },
  sectionTitle: {
    marginBottom: spacing.md,
    color: colors.primary,
  },
  infoRow: {
    marginBottom: spacing.sm,
  },
  infoLabel: {
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  infoValue: {
    color: colors.text,
    fontFamily: fontFamilies.textMedium,
  },
  divider: {
    marginVertical: spacing.md,
    backgroundColor: colors.border,
  },
  input: {
    marginBottom: spacing.md,
  },
  button: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  showPasswordButton: {
    alignSelf: 'flex-start',
    marginTop: -spacing.xs,
    marginBottom: spacing.xs,
  },
  versionText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginVertical: spacing.md,
  },
  signOutButton: {
    margin: spacing.md,
    marginTop: 0,
    borderColor: colors.emphasis,
  },
  helperText: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
});

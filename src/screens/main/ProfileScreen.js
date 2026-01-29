import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Linking, Alert } from 'react-native';
import { TextInput, Button, Text, Card, Divider, Snackbar } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { supabase } from '../../services/supabaseClient';
import { exportDatabase, exportLogs } from '../../utils/debugExport';

export default function ProfileScreen({ navigation }) {
  const { user, profile, updatePassword } = useAuth();

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Debug export state
  const [exportLoading, setExportLoading] = useState(false);

  // Feedback state
  const [snackbar, setSnackbar] = useState({ visible: false, message: '', type: 'success' });

  const showMessage = (message, type = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

  const handleShareLogs = async () => {
    setExportLoading(true);
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
      setExportLoading(false);
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
            setExportLoading(true);
            try {
              const result = await exportDatabase();
              if (result.success) {
                showMessage('Database exported successfully');
              } else {
                showMessage(result.error || 'Failed to export database', 'error');
              }
            } catch (error) {
              console.error('Share database error:', error);
              showMessage('Failed to export database', 'error');
            } finally {
              setExportLoading(false);
            }
          },
        },
      ]
    );
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

  const handleChangePassword = async () => {
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
      // Verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        throw new Error('Current password is incorrect');
      }

      // Update password
      const { error } = await updatePassword(newPassword);

      if (error) throw error;

      // Clear password fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      showMessage('Password changed successfully');
    } catch (error) {
      console.error('Password change error:', error);
      showMessage(error.message || 'Failed to change password', 'error');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
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
                {profile?.job_title}
              </Text>
            </View>

            {profile?.assigned_school && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.infoRow}>
                  <Text variant="bodySmall" style={styles.infoLabel}>Assigned School</Text>
                  <Text variant="bodyLarge" style={styles.infoValue}>
                    {profile.assigned_school}
                  </Text>
                </View>
              </>
            )}

            <Text variant="bodySmall" style={styles.helperText}>
              Profile information is managed by administrators
            </Text>
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
              loading={exportLoading}
              disabled={exportLoading}
              style={styles.button}
              icon="file-document-outline"
            >
              Share Logs
            </Button>

            <Button
              mode="outlined"
              onPress={handleShareDatabase}
              loading={exportLoading}
              disabled={exportLoading}
              style={styles.button}
              icon="database-export"
            >
              Share Database (Contains Sensitive Data)
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
          </Card.Content>
        </Card>
      </ScrollView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={4000}
        action={{
          label: 'Dismiss',
          onPress: () => setSnackbar({ ...snackbar, visible: false }),
        }}
        style={snackbar.type === 'error' ? styles.errorSnackbar : styles.successSnackbar}
      >
        {snackbar.message}
      </Snackbar>
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
    fontWeight: '500',
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
  helperText: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
  successSnackbar: {
    backgroundColor: colors.success,  // Brand green
  },
  errorSnackbar: {
    backgroundColor: colors.error,    // Brand red
  },
});

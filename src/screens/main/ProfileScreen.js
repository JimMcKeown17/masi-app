import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Button, Text, Card, Divider, Snackbar } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing } from '../../constants/colors';
import { supabase } from '../../services/supabaseClient';

export default function ProfileScreen({ navigation }) {
  const { user, profile, updatePassword, refreshProfile } = useAuth();

  // Profile form state
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [profileLoading, setProfileLoading] = useState(false);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Feedback state
  const [snackbar, setSnackbar] = useState({ visible: false, message: '', type: 'success' });

  const showMessage = (message, type = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

  const handleUpdateProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      showMessage('First name and last name are required', 'error');
      return;
    }

    setProfileLoading(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      // Refresh profile data from server
      await refreshProfile();

      showMessage('Profile updated successfully');
    } catch (error) {
      console.error('Profile update error:', error);
      showMessage(error.message || 'Failed to update profile', 'error');
    } finally {
      setProfileLoading(false);
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

  const hasProfileChanges =
    firstName.trim() !== profile?.first_name ||
    lastName.trim() !== profile?.last_name;

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

            <TextInput
              label="First Name"
              value={firstName}
              onChangeText={setFirstName}
              mode="outlined"
              style={styles.input}
              disabled={profileLoading}
            />

            <TextInput
              label="Last Name"
              value={lastName}
              onChangeText={setLastName}
              mode="outlined"
              style={styles.input}
              disabled={profileLoading}
            />

            <TextInput
              label="Email"
              value={user?.email || ''}
              mode="outlined"
              style={styles.input}
              disabled
              right={<TextInput.Icon icon="lock" />}
            />

            <TextInput
              label="Job Title"
              value={profile?.job_title || ''}
              mode="outlined"
              style={styles.input}
              disabled
              right={<TextInput.Icon icon="lock" />}
            />

            {profile?.assigned_school && (
              <TextInput
                label="Assigned School"
                value={profile.assigned_school}
                mode="outlined"
                style={styles.input}
                disabled
                right={<TextInput.Icon icon="lock" />}
              />
            )}

            <Text variant="bodySmall" style={styles.helperText}>
              Email, job title, and school are managed by administrators
            </Text>

            <Button
              mode="contained"
              onPress={handleUpdateProfile}
              loading={profileLoading}
              disabled={profileLoading || !hasProfileChanges}
              style={styles.button}
            >
              Save Profile Changes
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
    elevation: 2,
  },
  sectionTitle: {
    marginBottom: spacing.md,
    color: colors.primary,
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
    backgroundColor: '#4caf50',
  },
  errorSnackbar: {
    backgroundColor: '#f44336',
  },
});

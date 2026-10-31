import React, { useLayoutEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import KeyboardAvoidingView from '../../components/common/KeyboardAvoidingView';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import { useAuth } from '../../context/AuthContext';
import BrandButton from '../../components/common/BrandButton';
import InlineNote from '../../components/common/InlineNote';
import TextField from '../../components/common/TextField';
import { describeAuthError } from '../../utils/authErrorCopy';
import { borderRadius, colors, spacing, tints } from '../../constants/colors';
import { fontFamilies, typeRoles } from '../../constants/typography';

export default function ForgotPasswordScreen({ navigation }) {
  const { resetPassword } = useAuth();
  const insets = useSafeAreaInsets();
  const paddingBottom = useScrollBottomPadding();
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [success, setSuccess] = useState(false);

  useLayoutEffect(() => {
    if (success) navigation.setOptions({ title: '' });
  }, [navigation, success]);

  const handleReset = async () => {
    if (submittingRef.current) return;
    if (!email || !email.includes('@')) {
      setError({ kind: 'format' });
      return;
    }

    submittingRef.current = true;
    setError(null);
    setLoading(true);
    const { error: resetError } = await resetPassword(email);
    if (resetError) {
      submittingRef.current = false;
      setError({ kind: 'server', message: describeAuthError(resetError, 'reset') });
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.sentContent}>
          <View testID="reset-sent-tile" style={styles.sentTile}
            accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ionicons name="mail-outline" size={40} color={colors.text} accessible={false} />
          </View>
          <Text accessibilityRole="header" style={styles.sentTitle}>Check your email</Text>
          <Text style={styles.sentMessage}>
            If an account exists with{'\n'}<Text style={styles.email}>{email}</Text>,{'\n'}
            you will receive a password reset link shortly.
          </Text>
          <Text style={styles.sentNote}>
            Please check your email and follow the instructions to reset your password.
          </Text>
        </View>
        <View testID="reset-sent-footer" style={[styles.sentFooter, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <BrandButton variant="primary" label="Back to sign in" onPress={() => navigation.popTo('Login')} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" enabled={Platform.OS === 'ios'} style={styles.container}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.formContent, { paddingBottom }]}>
        <Text style={styles.paragraph}>
          Enter your email address and we’ll send you instructions to reset your password.
        </Text>
        <View style={styles.field}>
          <TextField surface="canvas" label="Email" icon="mail-outline" value={email}
            onChangeText={(value) => { setEmail(value); setError(null); }}
            autoFocus keyboardType="email-address" autoCapitalize="none" returnKeyType="send"
            onSubmitEditing={handleReset} disabled={loading}
            error={error?.kind === 'format' ? 'Please enter a valid email address' : undefined} />
        </View>
        {error?.kind === 'server' ? (
          <View style={styles.serverNote}><InlineNote tone="error">{error.message}</InlineNote></View>
        ) : null}
        <BrandButton variant="primary" label="Send reset link" loadingLabel="Sending…"
          loading={loading} onPress={handleReset}
          style={error?.kind === 'server' ? styles.sendAfterNote : styles.send} />
        <BrandButton variant="tertiary" tone="ink" label="Back to sign in"
          style={styles.back} disabled={loading} onPress={() => navigation.goBack()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  formContent: { paddingTop: 10, paddingHorizontal: spacing.lg },
  paragraph: { ...typeRoles.textParagraph, color: colors.textSecondary, maxWidth: 330 },
  field: { marginTop: spacing.ml },
  serverNote: { marginTop: spacing.ml },
  send: { marginTop: spacing.ml },
  sendAfterNote: { marginTop: spacing.ms },
  back: { marginTop: spacing.sm },
  sentContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  sentTile: { width: 80, height: 80, borderRadius: borderRadius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: tints.rule, alignItems: 'center', justifyContent: 'center' },
  sentTitle: { ...typeRoles.displayTitle, color: colors.text, marginTop: 28, textAlign: 'center' },
  sentMessage: { ...typeRoles.textParagraph, color: colors.text, marginTop: spacing.ms, textAlign: 'center' },
  email: { fontFamily: fontFamilies.textHeavy },
  sentNote: { ...typeRoles.textParagraph, color: colors.textSecondary, marginTop: 14, maxWidth: 300, textAlign: 'center' },
  sentFooter: { paddingHorizontal: spacing.lg },
});

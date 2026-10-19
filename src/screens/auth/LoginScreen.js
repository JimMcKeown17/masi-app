import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text,
  useWindowDimensions, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useNetworkOffline } from '../../hooks/useNetworkOffline';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { describeAuthError } from '../../utils/authErrorCopy';
import { borderRadius, colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import BrandLockup from '../../components/auth/BrandLockup';
import LoginHeroArt from '../../components/auth/LoginHeroArt';
import { computeHeroArtLayout } from '../../components/auth/loginHeroGeometry';
import BrandButton from '../../components/common/BrandButton';
import FocusAwareStatusBar from '../../components/common/FocusAwareStatusBar';
import InlineNote from '../../components/common/InlineNote';
import TextField from '../../components/common/TextField';
import { clearLoginErrorOnEdit, LOGIN_COPY, validateLoginInput } from './loginFormErrors';
import { computeLoginLayout } from './loginLayout';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [panelTop, setPanelTop] = useState(null);
  const [anchorPanelTop, setAnchorPanelTop] = useState(null);
  const [standardPanelHeight, setStandardPanelHeight] = useState(null);
  const standardPanelHeightRef = useRef(null);
  const passwordRef = useRef(null);
  const { signIn } = useAuth();
  const offline = useNetworkOffline();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const { mode, lockupTop, showLockup } = computeLoginLayout({
    windowHeight, insetsTop: insets.top, keyboardHeight, standardPanelHeight,
  });
  const rest = mode === 'rest';
  const compact = mode === 'keyboardCompact';
  const art = panelTop == null ? null : computeHeroArtLayout({
    windowWidth, windowHeight, panelTop, anchorPanelTop: anchorPanelTop ?? panelTop,
  });

  const measurePanel = ({ nativeEvent: { layout } }) => {
    setPanelTop(layout.y);
    if (rest && !error && !offline) setAnchorPanelTop(layout.y);
  };
  const measurePanelContent = ({ nativeEvent: { layout } }) => {
    // Compact type and gaps shrink the column. Never feed that height back into
    // the standard fit check, or the two layouts can oscillate.
    if (compact) return;
    const height = layout.height + spacing.lg * 2;
    if (standardPanelHeightRef.current !== height) {
      standardPanelHeightRef.current = height;
      // A note can grow without moving the panel: publish the measurement so
      // this event alone recomputes the fit while the keyboard is already open.
      setStandardPanelHeight(height);
    }
  };

  useEffect(() => {
    if (offline && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(LOGIN_COPY.offline);
    }
  }, [offline]);

  const handleLogin = async () => {
    if (loading) return;
    const validationError = validateLoginInput(email, password);
    setError(validationError);
    if (validationError) return;

    setLoading(true);
    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError({ kind: 'server', message: describeAuthError(signInError, 'sign_in') });
      setLoading(false);
    }
    // Success changes the auth tree; leave the button busy until AppRoot unmounts us.
  };

  const emailError = error?.kind === 'format' ? LOGIN_COPY.invalidEmail
    : error?.kind === 'empty' && error.email ? LOGIN_COPY.emptyBoth : undefined;
  const passwordError = error?.kind === 'empty' && error.password ? LOGIN_COPY.emptyBoth : undefined;
  const formNote = error?.kind === 'empty' ? LOGIN_COPY.emptyBoth
    : error?.kind === 'server' ? error.message : null;
  const emailMarginTop = offline ? spacing.md : compact ? spacing.ms
    : error ? 10 : windowHeight < 700 ? spacing.md : 18;

  return (
    <View testID="login-root" style={styles.root}>
      {rest && art?.visible ? (
        <LoginHeroArt windowWidth={windowWidth} windowHeight={windowHeight}
          scale={art.scale} offsetX={art.offsetX} offsetY={art.offsetY} />
      ) : null}
      <FocusAwareStatusBar style="light" />
      <KeyboardAvoidingView style={styles.fill} behavior="padding" enabled={Platform.OS === 'ios'}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" bounces={false}>
          {showLockup ? <BrandLockup style={[styles.lockup, { top: lockupTop }]} /> : null}
          <View testID="login-spacer" style={rest
            ? { flexGrow: 1, minHeight: lockupTop + 74 }
            : { height: compact ? insets.top : lockupTop + 74 }} />
          <View testID="login-panel" onLayout={measurePanel} style={[styles.panel,
            !rest && styles.keyboardPanel, compact && styles.compactPanel,
            { paddingBottom: rest ? Math.max(insets.bottom, spacing.lg) : spacing.lg }]}>
            <View testID="login-panel-content" onLayout={measurePanelContent}>
              <Text style={[styles.heading, compact && typeRoles.displaySheetTitle]}
                accessibilityRole="header" maxFontSizeMultiplier={1.2}>Sign in</Text>
              {offline ? (
                <View style={styles.offline}>
                  <Ionicons name="cloud-offline-outline" size={18} color={colors.onDark} accessible={false} />
                  <Text style={styles.offlineText} accessibilityLiveRegion="polite">{LOGIN_COPY.offline}</Text>
                </View>
              ) : null}
              <View testID="login-email-field" style={{ marginTop: emailMarginTop }}>
                <TextField surface="red" label="Email" icon="mail-outline" placeholder="you@masinyusane.org"
                  value={email} onChangeText={(value) => {
                    setError((current) => clearLoginErrorOnEdit(current, 'email', value));
                    setEmail(value);
                  }}
                  keyboardType="email-address" autoCapitalize="none" returnKeyType="next" submitBehavior="submit"
                  onSubmitEditing={() => passwordRef.current?.focus()} disabled={loading}
                  error={emailError} errorPlacement={error?.kind === 'empty' ? 'form' : 'field'} />
              </View>
              <View style={styles.password}>
                <TextField surface="red" label="Password" icon="lock-closed-outline" placeholder="Your password"
                  value={password} onChangeText={(value) => {
                    setError((current) => clearLoginErrorOnEdit(current, 'password', value));
                    setPassword(value);
                  }}
                  inputRef={passwordRef} secureTextEntry={!showPassword}
                  onToggleSecure={() => setShowPassword((current) => !current)}
                  returnKeyType="go" onSubmitEditing={handleLogin} disabled={loading}
                  error={passwordError} errorPlacement="form" />
              </View>
              {formNote ? (
                <View testID="login-form-note" style={styles.formNote}>
                  <InlineNote tone="error">{formNote}</InlineNote>
                </View>
              ) : null}
              <BrandButton variant="primary" surface="red" size="lg" label="Sign in" loadingLabel="Signing in…"
                loading={loading} onPress={handleLogin} style={{ marginTop: formNote ? spacing.ms : spacing.ml }} />
              <Text style={[styles.footnote, compact && styles.compactFootnote]}>{LOGIN_COPY.footnote}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.red600, overflow: 'hidden' },
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  lockup: { position: 'absolute', left: spacing.lg },
  panel: {
    backgroundColor: colors.red700,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  keyboardPanel: { flexGrow: 1 },
  compactPanel: { paddingTop: spacing.md },
  heading: { ...typeRoles.display2XL, color: colors.onDark },
  offline: { marginTop: 10, flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  offlineText: { ...typeRoles.textCaption, color: colors.red50, flex: 1 },
  password: { marginTop: spacing.ms },
  formNote: { marginTop: spacing.ms },
  footnote: { ...typeRoles.textCaption, color: colors.red50, textAlign: 'center', marginTop: spacing.md },
  compactFootnote: { marginTop: spacing.ms },
});

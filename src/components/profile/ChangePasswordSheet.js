import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '../common/BottomSheet';
import BrandButton from '../common/BrandButton';
import InlineNote from '../common/InlineNote';
import TextField from '../common/TextField';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { useToast } from '../../context/ToastContext';
import { isStaleActorError } from '../../session/staleActor';
import { describePasswordChangeFailure, validatePasswordChange } from '../../utils/passwordChange';
import { computeScrollTarget } from '../../utils/scrollIntoView';

export default function ChangePasswordSheet({ visible, onClose, changePassword, handle }) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const attemptRef = useRef(0);
  const liveAttemptRef = useRef(null);
  const currentRef = useRef(null);
  const newRef = useRef(null);
  const confirmRef = useRef(null);
  const scrollRef = useRef(null);
  const layoutsRef = useRef({});
  const viewportHeightRef = useRef(0);
  const scrollYRef = useRef(0);
  const focusedKeyRef = useRef(null);
  const pendingKeyRef = useRef(null);

  const reset = useCallback(() => {
    liveAttemptRef.current = null;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors({});
    setShowPasswords(false);
    setLoading(false);
    viewportHeightRef.current = 0;
    scrollYRef.current = 0;
    focusedKeyRef.current = null;
    pendingKeyRef.current = null;
  }, []);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      liveAttemptRef.current = null;
    };
  }, []);

  // A parent may close the sheet directly; that abandons the attempt too.
  useLayoutEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  const dismiss = () => {
    reset();
    onClose();
  };

  const ensureVisible = (key) => {
    if (!key) return;
    const block = layoutsRef.current[key];
    if (!block || !viewportHeightRef.current) {
      pendingKeyRef.current = key;
      return;
    }
    const target = computeScrollTarget({
      blockY: block.y,
      blockHeight: block.height,
      scrollY: scrollYRef.current,
      viewportHeight: viewportHeightRef.current,
    });
    if (target !== null) {
      scrollRef.current?.scrollTo({ y: target, animated: true });
      scrollYRef.current = target;
    }
    if (pendingKeyRef.current === key) pendingKeyRef.current = null;
  };

  const recordLayout = (key, { nativeEvent: { layout } }) => {
    layoutsRef.current[key] = { y: layout.y, height: layout.height };
    if (pendingKeyRef.current === key) ensureVisible(key);
  };
  const focus = (key) => {
    focusedKeyRef.current = key;
    ensureVisible(key);
  };
  const blur = (key) => {
    if (focusedKeyRef.current === key) focusedKeyRef.current = null;
  };
  const edit = (key, setter, value) => {
    setter(value);
    setErrors((previous) => ({ ...previous, [key]: undefined, form: undefined }));
  };
  const showError = ({ field, message }) => {
    // Error text changes this block's height; wait for its new measurement.
    pendingKeyRef.current = field ?? 'notes';
    setErrors({ [field ?? 'form']: message });
  };

  const submit = async () => {
    // The ref closes the same-render double-tap/Next-key race as well as loading.
    if (!visible || !handle.isCurrent() || liveAttemptRef.current !== null) return;
    setErrors({});
    const validation = validatePasswordChange({ currentPassword, newPassword, confirmPassword });
    if (validation) {
      showError(validation);
      return;
    }

    const attempt = ++attemptRef.current;
    liveAttemptRef.current = attempt;
    setLoading(true);
    let outcome;
    try {
      outcome = await changePassword({ currentPassword, newPassword, handle });
    } catch (error) {
      outcome = { error, phase: 'update' };
    }

    const { error, phase } = outcome;
    const live = mountedRef.current && liveAttemptRef.current === attempt;
    if (!handle.isCurrent() || isStaleActorError(error)) {
      if (live) {
        liveAttemptRef.current = null;
        setLoading(false);
      }
      return;
    }

    let failure;
    if (error) {
      console.error(phase === 'verification' ? 'Password verification error:' : 'Password change error:', error);
      failure = describePasswordChangeFailure({ error, phase });
    }
    const message = failure?.message ?? 'Password changed successfully';

    if (!live) {
      toast.show({ message, tone: error ? 'error' : 'success', duration: 4000 });
      return;
    }
    if (failure) {
      showError(failure);
      liveAttemptRef.current = null;
      setLoading(false);
    } else {
      reset();
      onClose();
      toast.show({ message, tone: 'success', duration: 4000 });
    }
  };

  const fieldProps = (key, inputRef, value, setter) => ({
    value,
    onChangeText: (text) => edit(key, setter, text),
    icon: 'lock-closed-outline',
    secureTextEntry: !showPasswords,
    autoCapitalize: 'none',
    autoCorrect: false,
    disabled: loading,
    error: errors[key],
    inputRef,
    onFocus: () => focus(key),
    onBlur: () => blur(key),
  });

  return (
    <BottomSheet
      visible={visible}
      onDismiss={dismiss}
      title="Change password"
      dismissLabel="Dismiss change password"
      maxHeight="100%"
      keyboardAvoiding
      scrollable
      scrollViewProps={{
        ref: scrollRef,
        keyboardShouldPersistTaps: 'handled',
        scrollEventThrottle: 16,
        onLayout: ({ nativeEvent: { layout } }) => {
          viewportHeightRef.current = layout.height;
          ensureVisible(pendingKeyRef.current ?? focusedKeyRef.current);
        },
        onScroll: ({ nativeEvent: { contentOffset } }) => { scrollYRef.current = contentOffset.y; },
      }}
      headerExtras={
        <View style={styles.toggle}>
          <BrandButton variant="tertiary" tone="accent" size="sm"
            icon={showPasswords ? 'eye-off-outline' : 'eye-outline'}
            label={showPasswords ? 'Hide passwords' : 'Show passwords'}
            onPress={() => setShowPasswords((value) => !value)} />
        </View>
      }
      footerStyle={styles.footer}
      footer={
        <View style={styles.actions}>
          <BrandButton variant="primary" label="Change password" testID="change-password-submit" loading={loading} onPress={submit} />
          <BrandButton variant="tertiary" tone="ink" label="Cancel" onPress={dismiss} />
        </View>
      }
    >
      <View testID="password-block-current" onLayout={(event) => recordLayout('current', event)}>
        <TextField {...fieldProps('current', currentRef, currentPassword, setCurrentPassword)}
          label="Current password" placeholder="Enter current password"
          textContentType="password" autoComplete="current-password" autoFocus
          returnKeyType="next" onSubmitEditing={() => newRef.current?.focus()} />
      </View>
      <View testID="password-block-new" style={styles.nextField} onLayout={(event) => recordLayout('new', event)}>
        <TextField {...fieldProps('new', newRef, newPassword, setNewPassword)}
          label="New password" placeholder="Enter new password"
          textContentType="newPassword" autoComplete="new-password"
          returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()} />
      </View>
      <View testID="password-block-confirm" style={styles.nextField} onLayout={(event) => recordLayout('confirm', event)}>
        <TextField {...fieldProps('confirm', confirmRef, confirmPassword, setConfirmPassword)}
          label="Confirm new password" placeholder="Re-enter new password"
          textContentType="newPassword" autoComplete="new-password"
          returnKeyType="done" onSubmitEditing={submit} />
      </View>
      <View testID="password-block-notes" style={styles.notes} onLayout={(event) => recordLayout('notes', event)}>
        <View style={styles.hint}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} accessible={false} />
          <Text style={styles.hintText}>Password must be at least 8 characters</Text>
        </View>
        {errors.form ? <View style={styles.formError}><InlineNote tone="error">{errors.form}</InlineNote></View> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  toggle: { alignSelf: 'flex-start', marginVertical: -spacing.ms },
  nextField: { marginTop: spacing.ms },
  notes: { marginTop: spacing.sm },
  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  hintText: { ...typeRoles.textCaption, color: colors.textSecondary, flex: 1 },
  formError: { marginTop: spacing.ms },
  footer: { borderTopWidth: 0, paddingTop: spacing.md },
  actions: { gap: spacing.sm },
});

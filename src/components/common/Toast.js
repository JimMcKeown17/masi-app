import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { useMotion } from '../../context/MotionContext';
import { borderRadius, colors, shadows } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { duration, easing } from '../../constants/motion';

function ToastCard({ toast, bottom, onDismiss, onExited }) {
  const { motionLevel } = useMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  const { id, message, tone, dismissing, duration: lifetime } = toast;

  // iOS has no live regions and does not announce the alert role, so every tone is announced
  // explicitly. Android speaks through the live regions below.
  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [id, message]);
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), lifetime);
    return () => clearTimeout(timer);
  }, [id, lifetime, onDismiss]);
  useEffect(() => {
    const animation = dismissing
      ? Animated.timing(opacity, { toValue: 0, duration: duration.fade, useNativeDriver: true })
      : Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: duration.quick, easing: easing.enter, useNativeDriver: true }),
        ...(motionLevel === 'still' ? [] : [Animated.timing(translateY, { toValue: 0, duration: duration.quick, easing: easing.enter, useNativeDriver: true })]),
      ]);
    animation.start(({ finished }) => { if (finished && dismissing) onExited(id); });
    return () => animation.stop();
  }, [dismissing, id, motionLevel, opacity, translateY, onExited]);

  return (
    <Animated.View
      testID="toast"
      accessibilityLiveRegion={tone === 'error' ? undefined : 'polite'}
      style={[styles.card, { bottom, opacity }, motionLevel !== 'still' && { transform: [{ translateY }] }]}
    >
      {tone !== 'neutral' ? (
        <View testID="toast-status" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.disc, tone === 'success' ? styles.success : styles.error]}>
          <Ionicons name={tone === 'success' ? 'checkmark' : 'alert'} size={14} color={tone === 'success' ? colors.onDark : colors.error} />
        </View>
      ) : null}
      <Text
        accessibilityRole={tone === 'error' ? 'alert' : undefined}
        accessibilityLiveRegion={tone === 'error' ? 'assertive' : undefined}
        style={styles.message}
      >{message}</Text>
      <Pressable style={styles.dismiss} accessibilityRole="button" accessibilityLabel="Dismiss message" onPress={() => onDismiss(id)}>
        <Text style={styles.dismissText}>Dismiss</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function ToastHost({ toast, maxObstruction = 0, onDismiss, onExited }) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  // RN Android reports the IME inset minus the bottom system-bar inset, and edge-to-edge does not
  // resize the root, so the keyboard's top is that height plus the navigation bar. iOS reports the
  // full height from the screen bottom.
  const keyboardTop = Platform.OS === 'android' && keyboardHeight > 0 ? keyboardHeight + insets.bottom : keyboardHeight;
  const bottom = 8 + Math.max(insets.bottom, 8, maxObstruction, keyboardTop);
  return (
    <View testID="toast-host" pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {toast ? <ToastCard key={toast.id} toast={toast} bottom={bottom} onDismiss={onDismiss} onExited={onExited} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute', left: 24, right: 24, minHeight: 56,
    borderRadius: borderRadius.lg, backgroundColor: colors.text, ...shadows.toast,
    paddingTop: 8, paddingRight: 4, paddingBottom: 8, paddingLeft: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  disc: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  success: { backgroundColor: colors.success },
  error: { backgroundColor: colors.errorBg },
  message: { ...typeRoles.textBodySemi, color: colors.onDark, flex: 1 },
  dismiss: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', flexShrink: 1 },
  dismissText: { ...typeRoles.textLink, color: colors.onDark, textDecorationLine: 'underline' },
});

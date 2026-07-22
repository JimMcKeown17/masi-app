import React from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Portal, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, spacing } from '../../constants/colors';

export default function BottomSheet({
  visible,
  onDismiss,
  title,
  subtitle,
  dismissLabel,
  headerExtras,
  footer,
  scrollable = true,
  keyboardAvoiding = true,
  maxHeight = '80%',
  bodyContentStyle,
  scrollViewProps = {},
  children,
}) {
  const insets = useSafeAreaInsets();
  const {
    contentContainerStyle: scrollContentStyle,
    ...remainingScrollViewProps
  } = scrollViewProps;

  // Portal has no equivalent of Modal's onRequestClose, so the Android
  // hardware back button must dismiss the sheet explicitly.
  React.useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss?.();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onDismiss]);

  if (!visible) return null;

  const panel = (
    <View
      style={[
        styles.sheet,
        {
          maxHeight,
          paddingBottom: Math.max(insets.bottom, spacing.lg),
        },
      ]}
    >
      <View style={styles.handleContainer}>
        <View style={styles.handle} />
      </View>

      <View style={styles.header}>
        <Text variant="titleMedium" style={styles.title}>{title}</Text>
        {subtitle ? (
          <Text variant="bodySmall" style={styles.subtitle}>{subtitle}</Text>
        ) : null}
        {headerExtras ? (
          <View style={styles.headerExtras}>{headerExtras}</View>
        ) : null}
      </View>

      {scrollable ? (
        <ScrollView
          bounces={false}
          {...remainingScrollViewProps}
          style={[styles.scrollArea, remainingScrollViewProps.style]}
          contentContainerStyle={[
            styles.bodyContent,
            scrollContentStyle,
            bodyContentStyle,
          ]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.bodyContent, bodyContentStyle]}>
          {children}
        </View>
      )}

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );

  // Rendered through Paper's Portal (hosted by the root PaperProvider) instead
  // of React Native's <Modal>: the native transparent modal positions its
  // content off-screen under the new architecture in this environment
  // (open-work §0c.2), and Portal keeps the sheet in the ordinary view
  // hierarchy where layout is reliable.
  return (
    <Portal>
      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
          style={styles.backdrop}
        />
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
            style={styles.sheetWrapper}
          >
            {panel}
          </KeyboardAvoidingView>
        ) : (
          <View pointerEvents="box-none" style={styles.sheetWrapper}>
            {panel}
          </View>
        )}
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    // Flexbox pins the sheet to the bottom; absolute bottom-anchoring
    // mispositions under the new architecture here (open-work §0c.2).
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetWrapper: {
    width: '100%',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
  },
  header: {
    paddingHorizontal: spacing.lg,
  },
  title: {
    color: colors.text,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  headerExtras: {
    marginBottom: spacing.md,
  },
  scrollArea: {
    flexShrink: 1,
  },
  bodyContent: {
    paddingHorizontal: spacing.lg,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
});

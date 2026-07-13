import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.modalRoot}>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetWrapper: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
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

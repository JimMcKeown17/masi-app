import React from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  findNodeHandle,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  Text,
  useWindowDimensions,
} from 'react-native';
import KeyboardAvoidingView from './KeyboardAvoidingView';
import { Portal } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, shadows, spacing, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { useMotion } from '../../context/MotionContext';
import { useSheetAccessibility } from '../../context/SheetAccessibilityContext';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { duration, easing } from '../../constants/motion';

export default function BottomSheet({
  visible,
  onDismiss,
  dismissible = true,
  title,
  subtitle,
  dismissLabel,
  panelRole,
  headerExtras,
  footer,
  footerStyle,
  scrollable = true,
  keyboardAvoiding = true,
  maxHeight = '80%',
  bodyContentStyle,
  scrollViewProps = {},
  children,
}) {
  useSheetAccessibility(visible);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { height: windowHeight } = useWindowDimensions();
  const { motionLevel } = useMotion();
  const still = motionLevel === 'still';
  const [retained, setRetained] = React.useState(visible);
  const [panelHeight, setPanelHeight] = React.useState(null);
  const hasOpened = React.useRef(false);
  const titleRef = React.useRef(null);
  const scrimOpacity = React.useRef(new Animated.Value(0)).current;
  const panelOpacity = React.useRef(new Animated.Value(0)).current;
  // A closed fraction lets a layout measurement change the distance without
  // restarting the animation or snapping a reopened sheet to its initial value.
  const closedFraction = React.useRef(new Animated.Value(1)).current;
  const translateY = closedFraction.interpolate({ inputRange: [0, 1], outputRange: [0, panelHeight ?? windowHeight] });

  React.useEffect(() => {
    if (!visible && !hasOpened.current) return undefined;
    if (visible) {
      hasOpened.current = true;
      setRetained(true);
    }
    if (still) closedFraction.setValue(visible ? 0 : 1);
    else panelOpacity.setValue(visible ? 1 : 0);
    let current = true;
    const animation = Animated.parallel([
      Animated.timing(scrimOpacity, {
        toValue: visible ? 1 : 0, duration: still ? duration.fade : duration.quick,
        easing: easing.enter, useNativeDriver: true,
      }),
      Animated.timing(still ? panelOpacity : closedFraction, {
        toValue: still ? (visible ? 1 : 0) : (visible ? 0 : 1),
        duration: still ? duration.fade : duration.base, easing: easing.enter, useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (current && finished && !visible) {
        hasOpened.current = false;
        setRetained(false);
      }
    });
    return () => {
      // Invalidate completion before stopping: a native completion queued during
      // an exit must never unmount a sheet which has since reopened.
      current = false;
      animation.stop();
    };
  }, [visible, still, closedFraction, panelOpacity, scrimOpacity]);

  React.useEffect(() => {
    if (!visible) return undefined;
    const frame = requestAnimationFrame(() => {
      const node = findNodeHandle(titleRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  const {
    contentContainerStyle: scrollContentStyle,
    ...remainingScrollViewProps
  } = scrollViewProps;

  // Portal has no equivalent of Modal's onRequestClose, so the Android
  // hardware Back must be consumed while visible, even when dismissal is blocked.
  React.useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dismissible) onDismiss?.();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onDismiss, dismissible]);

  if (!visible && !retained) return null;

  const panel = (
    <Animated.View
      testID="bottom-sheet-panel"
      role={panelRole}
      accessibilityViewIsModal={panelRole ? true : undefined}
      onLayout={({ nativeEvent: { layout } }) => { if (layout.height > 0) setPanelHeight(layout.height); }}
      style={[
        styles.sheet,
        still ? { opacity: panelOpacity } : { transform: [{ translateY }] },
        {
          maxHeight,
          paddingBottom: keyboardAvoiding && keyboardHeight > 0 ? spacing.xs : Math.max(insets.bottom, spacing.lg),
        },
      ]}
    >
      {/* A sheet that must be answered shows no grab handle; its space stays so the title doesn't move. */}
      <View style={styles.handleContainer}>
        <View testID="bottom-sheet-handle" style={[styles.handle, !dismissible && styles.handleHidden]} />
      </View>

      <View style={styles.header}>
        {/* The header's bottom gap belongs to its last element; a title-only header owns it. */}
        <Text ref={titleRef} accessibilityRole="header" style={[styles.title, !subtitle && !headerExtras && styles.titleAlone]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle}>{subtitle}</Text>
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

      {footer ? <View testID="bottom-sheet-footer" style={[styles.footer, footerStyle]}>{footer}</View> : null}
    </Animated.View>
  );

  // The wrapper must have a definite height: under a content-sized parent,
  // Yoga resolves the panel's percentage maxHeight by growing the parent to
  // panel / fraction and pinning the panel to its top, so the sheet floats.
  const wrapperStyle = [styles.sheetWrapper, { paddingTop: insets.top + spacing.sm }];

  // Rendered through Paper's Portal (hosted by the root PaperProvider) instead
  // of React Native's <Modal>: the native transparent modal positions its
  // content off-screen under the new architecture in this environment
  // (open-work §0c.2), and Portal keeps the sheet in the ordinary view
  // hierarchy where layout is reliable.
  return (
    <Portal>
      <View testID="bottom-sheet-overlay" style={styles.overlay} pointerEvents={visible ? 'box-none' : 'none'}
        accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>
        <Animated.View testID="bottom-sheet-scrim" pointerEvents="none" style={[styles.backdrop, { opacity: scrimOpacity }]} />
        <Pressable
          testID="bottom-sheet-backdrop"
          onPress={dismissible ? onDismiss : undefined}
          accessible={dismissible}
          accessibilityRole={dismissible ? 'button' : undefined}
          accessibilityLabel={dismissible ? dismissLabel : undefined}
          disabled={!visible || !dismissible}
          style={StyleSheet.absoluteFill}
        />
        {keyboardAvoiding ? (
          <KeyboardAvoidingView behavior="padding" pointerEvents="box-none" style={wrapperStyle}>
            {panel}
          </KeyboardAvoidingView>
        ) : (
          <View pointerEvents="box-none" style={wrapperStyle}>
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
    backgroundColor: tints.scrim,
  },
  sheetWrapper: {
    width: '100%',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    ...shadows.sheet,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: tints.control,
    borderRadius: 2,
  },
  handleHidden: {
    opacity: 0,
  },
  header: {
    paddingHorizontal: spacing.lg,
  },
  title: {
    color: colors.text,
    ...typeRoles.displaySheetTitle,
    marginTop: 20,
  },
  titleAlone: {
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typeRoles.textParagraph,
    marginTop: 6,
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

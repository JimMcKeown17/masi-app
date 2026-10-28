import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, BackHandler, findNodeHandle, StyleSheet } from 'react-native';
import { Portal } from 'react-native-paper';
import { AssessmentThemeProvider, ConfirmPanel, tokens } from '../../assessment-questions';
import { useAssessmentFonts } from '../../assessment-questions/theme/AssessmentTheme';
import { duration, easing } from '../../constants/motion';
import { useMotion } from '../../context/MotionContext';
import { useSheetAccessibility } from '../../context/SheetAccessibilityContext';

// Host sheets share the package panel, but stay in-window: an iOS native Modal
// cannot be presented while the Question's End/stop Modal is dismissing.
export default function TestSheet({ visible, testID, title, message, confirmLabel, confirmTone, onConfirm, cancelLabel, onCancel }) {
  useSheetAccessibility(visible);
  const { motionLevel } = useMotion();
  const fonts = useAssessmentFonts();
  const titleRef = useRef(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return undefined;
    if (motionLevel === 'still') {
      opacity.setValue(1);
      return undefined;
    }
    opacity.setValue(0);
    const animation = Animated.timing(opacity, {
      toValue: 1, duration: duration.fade, easing: easing.enter, useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [visible, motionLevel, opacity]);

  useEffect(() => {
    if (!visible) return undefined;
    const frame = requestAnimationFrame(() => {
      const node = findNodeHandle(titleRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel?.();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onCancel]);

  if (!visible) return null;
  // Paper carries its own theme across Portal, but not the app assessment fonts.
  return <Portal>
    <AssessmentThemeProvider fonts={fonts}>
      <Animated.View testID={testID} accessibilityViewIsModal style={[styles.scrim, { opacity }]}>
        <ConfirmPanel title={title} titleRef={titleRef} message={message} confirmLabel={confirmLabel}
          confirmTone={confirmTone} onConfirm={onConfirm} cancelLabel={cancelLabel} onCancel={onCancel} />
      </Animated.View>
    </AssessmentThemeProvider>
  </Portal>;
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: tokens.color.scrim },
});

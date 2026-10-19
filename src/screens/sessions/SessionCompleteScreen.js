import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, BackHandler, findNodeHandle, Platform,
  ScrollView, StyleSheet, useWindowDimensions, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { useMotion } from '../../context/MotionContext';
import { getSessionsTodayGoal } from '../../services/sessionsTodayGoal';
import { deriveSessionCompleteView } from '../../utils/sessionCompleteView';
import { borderRadius, colors, shadows } from '../../constants/colors';
import FocusAwareStatusBar from '../../components/common/FocusAwareStatusBar';
import BrandButton from '../../components/common/BrandButton';
import StickyActionFooter from '../../components/forms/StickyActionFooter';
import SessionCompleteHero from '../../components/sessions/SessionCompleteHero';
import CelebrationGauge from '../../components/sessions/CelebrationGauge';
import SessionReceipt from '../../components/sessions/SessionReceipt';
import SyncStatusLine from '../../components/sessions/SyncStatusLine';
import { useCelebrationTimeline } from '../../components/sessions/celebrationTimeline';

export default function SessionCompleteScreen({ navigation, route }) {
  const { handle } = useSignedInEA();
  const { user } = useAuth();
  const { motionLevel } = useMotion();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The receipt and its one goal read describe the day at arrival, including a
  // save made just before midnight. The pure presenter owns the date comparison.
  const now = useRef(new Date()).current;
  const [goal, setGoal] = useState(null);
  const [goalStatus, setGoalStatus] = useState('loading');
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const doneRef = useRef(null);
  const exitingRef = useRef(false);
  const announcedRef = useRef(false);
  const view = deriveSessionCompleteView({ goal, goalStatus, params: route.params ?? {}, now, motionLevel });
  const { values, settled } = useCelebrationTimeline({ view, goalStatus });

  useEffect(() => {
    let active = true;
    const loadGoal = async () => {
      try {
        const resolved = await getSessionsTodayGoal({ handle, userId: user.id });
        if (!active || !handle.isCurrent()) return;
        setGoal(resolved);
        setGoalStatus('ready');
      } catch (error) {
        if (!active || !handle.isCurrent()) return;
        console.error('Error loading today’s sessions on Session complete:', error);
        setGoalStatus('failed');
      }
    };
    void loadGoal();
    return () => { active = false; };
  }, [handle, user.id]);

  const exit = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    navigation.popTo('MainTabs', { screen: 'Home' });
  }, [navigation]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      exit();
      return true;
    });
    return () => subscription.remove();
  }, [exit]));

  useEffect(() => {
    if (!view.announcement || announcedRef.current || exitingRef.current || !handle.isCurrent()) return;
    announcedRef.current = true;
    const focusDone = () => {
      const node = findNodeHandle(doneRef.current);
      if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
    };
    if (Platform.OS === 'ios') {
      focusDone();
      AccessibilityInfo.announceForAccessibilityWithOptions(view.announcement, { queue: true });
    } else {
      AccessibilityInfo.announceForAccessibility(view.announcement);
      focusDone();
    }
  }, [handle, view.announcement]);

  const entranceStyle = (value, offset) => ({
    opacity: settled ? 1 : value,
    ...(view.celebrate ? {
      transform: [{ translateY: settled ? 0 : value.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) }],
    } : {}),
  });

  return (
    <View style={styles.container}>
      <FocusAwareStatusBar style="light" />
      <ScrollView
        testID="session-complete-scroll"
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}
        onContentSizeChange={(_, height) => setContentHeight(height)}
      >
        <View style={styles.overscrollRed} />
        <SessionCompleteHero
          width={width}
          insetTop={insets.top}
          pill={view.pill}
          headline={view.headline}
          showHalo={view.card !== null}
          headlineHidden={goalStatus === 'loading'}
          pillStyle={entranceStyle(values.pillEnter, -8)}
          headlineStyle={entranceStyle(values.headline, 8)}
          confetti={view.confetti ? {
            layer: values.confettiLayer, travel: values.confettiTravel, fade: values.confettiFade,
          } : null}
        />
        {view.card ? (
          <Animated.View testID="session-complete-card" accessibilityLabel="Today’s sessions"
            style={[styles.card, entranceStyle(values.cardEnter, 24)]}>
            <CelebrationGauge card={view.card} gauge={view.gauge} values={values} settled={settled} />
          </Animated.View>
        ) : null}
        <SessionReceipt rows={view.receipt} />
      </ScrollView>
      <StickyActionFooter surface="onOverflow" overflowing={contentHeight > viewportHeight} style={styles.footer}>
        <View style={styles.syncLine}><SyncStatusLine /></View>
        <BrandButton ref={doneRef} label="Done" variant="primary" size="lg" onPress={exit} />
      </StickyActionFooter>
      <View pointerEvents="none" style={[styles.statusBarStrip, { height: insets.top }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  overscrollRed: { position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: colors.red600 },
  card: {
    backgroundColor: colors.surface, borderRadius: borderRadius.xl, ...shadows.elevated,
    marginHorizontal: 24, marginTop: -108, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 16,
    alignItems: 'center',
  },
  footer: { paddingTop: 12, paddingHorizontal: 24 },
  syncLine: { marginBottom: 14 },
  statusBarStrip: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.red600 },
});
